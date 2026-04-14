// src/services/socketService.js
const db = require('../config/database');

let io = null;
const socketToDriver = new Map();

function parseBearerToken(value) {
  if (!value) return null;
  if (value.startsWith('Bearer ')) return value.slice(7).trim();
  return value.trim();
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) return false;
  return allowedOrigins.includes(origin);
}

async function driverOwnsTrip(tripId, driverId) {
  const result = await db.query(
    'SELECT id FROM delivery_trips WHERE id = $1 AND driver_id = $2 LIMIT 1',
    [tripId, driverId]
  );
  return result.rows.length > 0;
}

function initSocket(httpServer, fastify, options = {}) {
  const { Server } = require('socket.io');
  const allowedOrigins = options.corsOrigins || [];

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (isAllowedOrigin(origin, allowedOrigins)) return cb(null, true);
        return cb(new Error('Socket origin not allowed'), false);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    try {
      const handshakeToken = parseBearerToken(socket.handshake?.auth?.token);
      const headerToken = parseBearerToken(socket.handshake?.headers?.authorization || '');
      const token = handshakeToken || headerToken;

      if (!token) {
        return next(new Error('Unauthorized socket connection'));
      }

      const payload = fastify.jwt.verify(token);
      socket.user = payload;
      return next();
    } catch (_) {
      return next(new Error('Unauthorized socket connection'));
    }
  });

  io.on('connection', (socket) => {
    const driverId = socket.user?.driverId ? String(socket.user.driverId) : null;

    if (driverId) {
      socket.join(`driver:${driverId}`);
      socketToDriver.set(socket.id, driverId);
    }

    console.log(`[Socket] Client connected: ${socket.id}${driverId ? ` (driver ${driverId})` : ''}`);

    // Backward-compatible no-op registration event (identity comes from JWT).
    socket.on('driver:register', () => {
      if (!driverId) return;
      socket.join(`driver:${driverId}`);
      socketToDriver.set(socket.id, driverId);
    });

    socket.on('driver:status', ({ isOnline } = {}) => {
      if (!driverId) return;
      socket.broadcast.emit('driver:status_changed', { driverId, isOnline: !!isOnline });
    });

    socket.on('driver:gps_ping', ({ tripId, latitude, longitude } = {}) => {
      if (!driverId) return;
      io.to('admin').emit('gps:update', {
        driverId,
        tripId: tripId || null,
        latitude,
        longitude,
        timestamp: new Date(),
      });
    });

    socket.on('trip:join', async ({ tripId } = {}) => {
      if (!driverId || !tripId) return;
      try {
        const allowed = await driverOwnsTrip(tripId, driverId);
        if (!allowed) return;
        socket.join(`trip:${tripId}`);
      } catch (error) {
        console.error('[Socket] Failed trip join check:', error.message);
      }
    });

    socket.on('trip:chat_message', async (data = {}) => {
      if (!driverId || !data.tripId || !data.message) return;

      try {
        const allowed = await driverOwnsTrip(data.tripId, driverId);
        if (!allowed) return;

        const payload = {
          tripId: data.tripId,
          message: String(data.message),
          senderId: driverId,
          senderType: 'driver',
          timestamp: data.timestamp || new Date().toISOString(),
        };

        io.to(`trip:${data.tripId}`).emit('trip:chat_message', payload);
      } catch (error) {
        console.error('[Socket] Failed chat send:', error.message);
      }
    });

    socket.on('disconnect', () => {
      socketToDriver.delete(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function pushOrderToDriver(driverId, order) {
  if (!io) return;
  io.to(`driver:${driverId}`).emit('order:new', order);
}

async function broadcastNewOrderToOnlineDrivers(order, dbClient) {
  if (!io) return;

  try {
    const result = await dbClient.query(
      `SELECT dp.id
       FROM driver_profiles dp
       JOIN driver_vehicles dv ON dv.driver_id = dp.id
       WHERE dp.is_online = TRUE
         AND dp.is_approved = TRUE
         AND ($1::varchar IS NULL OR $1 = '' OR dv.vehicle_type = $1)
         AND ($2::varchar IS NULL OR $2 = '' OR dv.model_id = $2)
         AND ($3::numeric IS NULL OR dv.weight_capacity >= $3)
         AND ($4::varchar IS NULL OR $4 = '' OR dv.body_type = $4)
         AND ($5::varchar IS NULL OR $5 = '' OR dv.dimensions = $5)
         AND ($6::boolean IS NULL OR $6 = FALSE)`,
      [
        order.vehicle_type || null,
        order.model_id_requested || null,
        order.weight_capacity_requested || null,
        order.body_type_requested || null,
        order.dimensions_requested || null,
        order.self_delivery ?? null,
      ]
    );

    const matchedDrivers = result.rows || [];

    console.log(
      `[Socket] Order ${order.id} | vehicle=${order.vehicle_type} | ` +
      `capacity=${order.weight_capacity_requested}kg | body=${order.body_type_requested} | ` +
      `dimensions=${order.dimensions_requested} | matched ${matchedDrivers.length} online drivers`
    );

    matchedDrivers.forEach((driver) => {
      io.to(`driver:${driver.id}`).emit('order:new', order);
    });
  } catch (error) {
    console.error('[Socket] Error broadcasting to matched drivers:', error.message);
  }
}

function broadcastNewOrder(order) {
  if (!io) return;
  io.emit('order:new', order);
}

function notifyOrderUpdate(driverId, tripId, status, data = {}) {
  if (!io) return;
  io.to(`driver:${driverId}`).emit('order:updated', { tripId, status, ...data });
}

function pushNotification(driverId, notification) {
  if (!io) return;
  io.to(`driver:${driverId}`).emit('notification:new', notification);
}

function getIo() {
  return io;
}

module.exports = {
  initSocket,
  pushOrderToDriver,
  broadcastNewOrder,
  broadcastNewOrderToOnlineDrivers,
  notifyOrderUpdate,
  pushNotification,
  getIo,
};
