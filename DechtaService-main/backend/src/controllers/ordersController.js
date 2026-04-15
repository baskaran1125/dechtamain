// src/controllers/ordersController.js
const db = require('../config/database');
const { uploadFile } = require('../services/uploadService');
const { notifyOrderUpdate } = require('../services/socketService');
const { calculateDeliveryCharge, toFiniteNumber } = require('../services/pricingService');

const tableColumnsCache = new Map();

function normalizeOrderStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'pending';

  if (['pending', 'placed'].includes(key)) return 'pending';
  if (['confirmed', 'processing', 'packed'].includes(key)) return 'confirmed';
  if (['assigned', 'accepted'].includes(key)) return 'assigned';
  if (['picked_up', 'arrived_pickup', 'out for delivery', 'arrived_dropoff', 'shipped', 'dispatched'].includes(key)) return 'in_transit';
  if (['delivered', 'completed'].includes(key)) return 'delivered';
  if (['cancelled', 'canceled', 'missed', 'returned'].includes(key)) return 'cancelled';
  return key;
}

async function tableExists(tableName) {
  const result = await db.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return !!result.rows[0]?.table_name;
}

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const result = await db.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName]
  );

  const columns = new Set((result.rows || []).map((row) => row.column_name));
  tableColumnsCache.set(tableName, columns);
  return columns;
}

function removeUndefinedFields(data) {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([, value]) => value !== undefined)
  );
}

async function filterDataForTable(tableName, data) {
  const cleaned = removeUndefinedFields(data);
  const columns = await getTableColumns(tableName);
  if (!columns || columns.size === 0) return cleaned;
  return Object.fromEntries(
    Object.entries(cleaned).filter(([key]) => columns.has(key))
  );
}

function normalizeVehicleType(vehicleType) {
  if (!vehicleType) return null;
  
  const normalized = String(vehicleType).trim().toLowerCase();
  
  const typeMap = {
    '2w': '2wheeler',
    '2wheeler': '2wheeler',
    '2-wheeler': '2wheeler',
    '2 wheeler': '2wheeler',
    'bike': '2wheeler',
    'motorcycle': '2wheeler',
    
    '3w': '3wheeler',
    '3wheeler': '3wheeler',
    '3-wheeler': '3wheeler',
    '3 wheeler': '3wheeler',
    'auto': '3wheeler',
    'tuk tuk': '3wheeler',
    'auto rickshaw': '3wheeler',
    
    '4w': '4wheeler',
    '4wheeler': '4wheeler',
    '4-wheeler': '4wheeler',
    '4 wheeler': '4wheeler',
    'truck': '4wheeler',
    'van': '4wheeler',
    'mini truck': '4wheeler',
  };
  
  return typeMap[normalized] || null;
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSchemaDriftError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('relation') && msg.includes('does not exist')
    || msg.includes('column') && msg.includes('does not exist');
}

async function getDriverVehicleProfile(driverId) {
  if (await tableExists('driver_vehicles')) {
    const legacyVehicle = await db.selectOne('driver_vehicles', { driver_id: driverId });
    if (legacyVehicle) {
      return legacyVehicle;
    }
  }

  if (await tableExists('vehicles')) {
    const unifiedVehicle = await db.selectOne('vehicles', { driver_id: driverId });
    if (unifiedVehicle) {
      return {
        vehicle_type:    unifiedVehicle.vehicle_type || null,
        model_id:        unifiedVehicle.model_id || null,
        weight_capacity: unifiedVehicle.weight_capacity || null,
        body_type:       unifiedVehicle.body_type || null,
      };
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────
// GET /api/orders/available
// ──────────────────────────────────────────────────────────────
async function getAvailableOrders(request, reply) {
  const driverId = request.driver.id;

  try {
    if (!request.driver.is_online) {
      return reply.send({ success: true, data: [], isOnline: false });
    }

    if (!(await tableExists('orders'))) {
      return reply.send({ success: true, data: [], isOnline: true });
    }

    const vehicle = await getDriverVehicleProfile(driverId);
    if (!vehicle) {
      return reply.send({ success: true, data: [], isOnline: true });
    }

    // Normalize vehicle type to standard format
    const driverVehicleType = normalizeVehicleType(vehicle.vehicle_type);
    const driverModelId = String(vehicle.model_id || '').trim();
    const driverBodyType = String(vehicle.body_type || '').trim();
    const parsedWeightCapacity = toNumberOrNull(vehicle.weight_capacity);
    const driverWeightCapacity = parsedWeightCapacity != null ? parsedWeightCapacity : 999999;

    // Validation: Ensure driver has a valid vehicle type
    if (!driverVehicleType) {
      request.log.warn({ driverId, rawVehicleType: vehicle.vehicle_type }, 'Driver has no valid vehicle_type registered. Cannot fetch orders.');
      return reply.send({ success: true, data: [], isOnline: true });
    }

    const orderColumns = await getTableColumns('orders');
    const hasVendorStatusColumn = orderColumns.has('v_status');

    const result = await db.query(
      `SELECT o.*
       FROM orders o
       WHERE LOWER(COALESCE(o.status::text, '')) = 'pending'
         AND o.driver_id IS NULL
         ${hasVendorStatusColumn ? "AND LOWER(COALESCE(o.v_status::text, 'pending')) IN ('accepted', 'accept')" : ''}
         AND (
           o.vehicle_type IS NULL OR o.vehicle_type = '' OR 
           LOWER(TRIM(o.vehicle_type)) = $1 OR
           LOWER(TRIM(o.vehicle_type)) = $2 OR
           LOWER(TRIM(o.vehicle_type)) = $3 OR
           LOWER(TRIM(o.vehicle_type)) = $4
         )
         AND (o.model_id_requested IS NULL OR o.model_id_requested = '' OR $5 = '' OR LOWER(o.model_id_requested) = LOWER($5))
         AND (o.weight_capacity_requested IS NULL OR o.weight_capacity_requested <= $6)
         AND (
           o.body_type_requested IS NULL OR o.body_type_requested = '' OR $7 = '' OR
           LOWER(o.body_type_requested) = LOWER($7) OR
           LOWER(o.body_type_requested) LIKE '%' || LOWER($7) || '%' OR
           LOWER($7) LIKE '%' || LOWER(o.body_type_requested) || '%'
         )
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [
        driverVehicleType,           // $1 normalized (e.g., '3wheeler')
        driverVehicleType.slice(0, 1) + 'w', // $2 shorthand (e.g., '3w')
        driverVehicleType + 's',     // $3 plural variant (e.g., '3wheelers')
        driverVehicleType.replace('wheeler', '-wheeler'), // $4 hyphenated (e.g., '3-wheeler')
        driverModelId,               // $5
        driverWeightCapacity,        // $6
        driverBodyType,              // $7
      ]
    );

    const mapped = (result.rows || []).map((o) => ({
      ...o,
      normalized_status: normalizeOrderStatus(o.status),
    }));

    // Log matching details for debugging
    request.log.debug({
      driverId,
      driverVehicleType,
      driverModelId,
      driverBodyType,
      matchedOrdersCount: mapped.length,
    }, 'Orders fetched and matched');

    return reply.send({ success: true, data: mapped, isOnline: true });
  } catch (error) {
    request.log.error(error);
    if (isSchemaDriftError(error)) {
      return reply.send({ success: true, data: [], isOnline: !!request.driver.is_online });
    }
    return reply.code(500).send({ success: false, message: 'Failed to fetch orders' });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /api/orders/active
// FIX: alias all order columns explicitly so client receives a
//      flat row with no ambiguous column names.
// ──────────────────────────────────────────────────────────────
async function getActiveTrip(request, reply) {
  const driverId = request.driver.id;

  try {
    if (!(await tableExists('delivery_trips'))) {
      return reply.send({ success: true, data: null });
    }

    const result = await db.query(
      `SELECT
        dt.*,
        o.id              AS order_id,
        o.product_name,
        o.customer_name   AS client_name,
        o.customer_phone  AS client_phone,
        o.pickup_address,
        o.delivery_address,
        o.pickup_latitude,
        o.pickup_longitude,
        o.delivery_latitude,
        o.delivery_longitude,
        o.vendor_shop_name,
        o.delivery_fee,
        o.total_amount    AS final_total,
        o.delivery_otp,
        o.items,
        o.vehicle_type
       FROM delivery_trips dt
       LEFT JOIN orders o ON dt.order_id = o.id
       WHERE dt.driver_id = $1
         AND LOWER(COALESCE(dt.status::text, '')) NOT IN ('delivered', 'cancelled', 'missed')
       ORDER BY dt.started_at DESC
       LIMIT 1`,
      [driverId]
    );

    const row = result.rows[0] || null;
    const mapped = row
      ? {
          ...row,
          normalized_status: normalizeOrderStatus(row.status),
          normalized_order_status: normalizeOrderStatus(row.order_status || row.status),
        }
      : null;

    return reply.send({ success: true, data: mapped });
  } catch (error) {
    request.log.error(error);
    if (isSchemaDriftError(error)) {
      return reply.send({ success: true, data: null });
    }
    return reply.code(500).send({ success: false, message: 'Failed to fetch active trip' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders/:orderId/accept
// FIX: atomic UPDATE prevents two drivers accepting the same order
// ──────────────────────────────────────────────────────────────
async function acceptOrder(request, reply) {
  const driverId = request.driver.id;
  const orderId  = parseInt(request.params.orderId, 10);

  if (isNaN(orderId) || orderId <= 0) {
    return reply.code(400).send({ success: false, message: 'Invalid order ID' });
  }

  // Check driver doesn't already have an active trip
  const activeTripCheck = await db.query(
    `SELECT id FROM delivery_trips
     WHERE driver_id = $1
       AND LOWER(COALESCE(status::text, '')) NOT IN ('delivered', 'cancelled', 'missed')
     LIMIT 1`,
    [driverId]
  );

  if (activeTripCheck.rows.length > 0) {
    return reply.code(409).send({
      success: false,
      message: 'You already have an active trip. Complete it before accepting another.',
    });
  }

  // Check if order already has an active trip with another driver
  const existingTrip = await db.query(
    `SELECT dt.id, dt.driver_id, dt.status 
     FROM delivery_trips dt
     WHERE dt.order_id = $1
       AND LOWER(COALESCE(dt.status::text, '')) NOT IN ('delivered', 'cancelled', 'missed')
     LIMIT 1`,
    [orderId]
  );

  if (existingTrip.rows.length > 0) {
    return reply.code(409).send({
      success: false,
      message: 'This order is already being handled by another driver.',
    });
  }

  const client = await db.beginTransaction();
  try {
    const profile = await db.selectOne('driver_profiles', { id: driverId });

    // Generate OTP inline (don't use db.update which uses pool, not transaction)
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // ATOMIC: only succeeds if order is still Pending with no driver assigned
    const claimed = await client.query(
      `UPDATE orders
       SET driver_id     = $1,
           driver_name   = $2,
           driver_number = $3,
           status        = 'processing',
           delivery_otp  = $4
       WHERE id = $5
         AND LOWER(COALESCE(status::text, '')) = 'pending'
         AND driver_id IS NULL
       RETURNING *`,
      [
        driverId,
        profile?.full_name    || '',
        profile?.mobile_number || '',
        deliveryOtp,
        orderId,
      ]
    );

    if (claimed.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return reply.code(409).send({ success: false, message: 'Order no longer available. It may have been taken.' });
    }

    const order = claimed.rows[0];

    const trip = await client.query(
      `INSERT INTO delivery_trips (order_id, driver_id, status, payout_amount, started_at)
       VALUES ($1, $2, 'accepted', $3, NOW())
       ON CONFLICT (order_id, driver_id) DO UPDATE
       SET status = 'accepted', updated_at = NOW()
       RETURNING *`,
      [orderId, driverId, order.delivery_fee || order.total_amount || 0]
    );

    await client.query('COMMIT');
    client.release();

    notifyOrderUpdate(driverId, trip.rows[0].id, 'accepted', { orderId });

    return reply.send({
      success: true,
      message: 'Order accepted successfully',
      trip: {
        ...trip.rows[0],
        normalized_status: normalizeOrderStatus(trip.rows[0]?.status),
        order: {
          ...order,
          normalized_status: normalizeOrderStatus(order.status),
        }
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    request.log.error(err);
    return reply.code(500).send({ success: false, message: 'Failed to accept order' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders/:orderId/ignore
// ──────────────────────────────────────────────────────────────
async function ignoreOrder(request, reply) {
  const driverId = request.driver.id;
  const { orderId } = request.params;

  try {
    await db.insert('driver_order_ignores', {
      driver_id:  driverId,
      order_id:   parseInt(orderId, 10) || null,
      ignored_at: new Date().toISOString(),
    });
  } catch (_) {
    // Non-fatal — ignore insert errors silently
  }

  return reply.send({ success: true, message: 'Order ignored', orderId });
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders/trips/:tripId/arrived-pickup
// ──────────────────────────────────────────────────────────────
async function arrivedAtPickup(request, reply) {
  const driverId = request.driver.id;
  const { tripId } = request.params;

  try {
    const trip = await db.selectOne('delivery_trips', { id: tripId, driver_id: driverId });

    if (!trip) {
      return reply.code(404).send({ success: false, message: 'Trip not found' });
    }

    if (trip.status !== 'accepted') {
      return reply.code(400).send({
        success: false,
        message: `Cannot mark arrival. Current status: ${trip.status}`,
      });
    }

    await db.update(
      'delivery_trips',
      { status: 'arrived_pickup', arrived_pickup_at: new Date().toISOString() },
      { id: tripId, driver_id: driverId }
    );

    notifyOrderUpdate(driverId, tripId, 'arrived_pickup');

    return reply.send({
      success: true,
      message: 'Arrived at pickup. Please take a package photo to confirm.',
      requiresPhoto: true,
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to update trip status' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders/trips/:tripId/confirm-pickup
// ──────────────────────────────────────────────────────────────
async function confirmPickup(request, reply) {
  const driverId = request.driver.id;
  const { tripId } = request.params;

  try {
    let photoPath = null;
    try {
      const data = await request.file();
      if (data) {
        const buffer = await data.toBuffer();
        const result = await uploadFile({
          bucket:   process.env.STORAGE_BUCKET_PACKAGE_PHOTOS || 'package-photos',
          folder:   `${tripId}/pickup`,
          filename: data.filename,
          buffer,
          mimetype: data.mimetype,
        });
        photoPath = result.path;
        await db.insert('driver_package_photos', {
          trip_id:   tripId,
          driver_id: driverId,
          photo_url: photoPath,
          step:      0,
        });
      }
    } catch (_) {
      // Photo is optional — web clients may not send one
    }

    await db.update(
      'delivery_trips',
      {
        status:      'picked_up',
        departed_pickup_at: new Date().toISOString(),
      },
      { id: tripId, driver_id: driverId }
    );

    const trip = await db.selectOne('delivery_trips', { id: tripId });
    if (trip?.order_id) {
      await db.update('orders', { status: 'shipped' }, { id: trip.order_id });
    }

    notifyOrderUpdate(driverId, tripId, 'picked_up');
    return reply.send({ success: true, message: 'Pickup confirmed. Navigate to delivery location.' });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: 'Failed to confirm pickup' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders/trips/:tripId/arrived-dropoff
// ──────────────────────────────────────────────────────────────
async function arrivedAtDropoff(request, reply) {
  const driverId = request.driver.id;
  const { tripId } = request.params;

  try {
    const result = await db.query(
      `SELECT dt.*, o.customer_phone, o.delivery_otp as order_delivery_otp
       FROM delivery_trips dt
       LEFT JOIN orders o ON dt.order_id = o.id
       WHERE dt.id = $1 AND dt.driver_id = $2`,
      [tripId, driverId]
    );

    const trip = result.rows[0];
    if (!trip) {
      return reply.code(404).send({ success: false, message: 'Trip not found' });
    }

    await db.update(
      'delivery_trips',
      { status: 'arrived_dropoff', arrived_dropoff_at: new Date().toISOString() },
      { id: tripId, driver_id: driverId }
    );

    // Get OTP from either delivery_trips or orders table
    const otp = trip.delivery_otp || trip.order_delivery_otp;
    
    return reply.send({
      success: true,
      message: 'OTP sent to customer. Ask customer for the 4-digit PIN.',
      ...(process.env.OTP_PROVIDER === 'mock' && { otp_for_testing: otp }),
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to update dropoff status' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders/trips/:tripId/complete
// FIX: allow 'arrived_pickup' status in addition to 'picked_up'
//      and 'arrived_dropoff' — driver may complete from any
//      post-pickup step.
// ──────────────────────────────────────────────────────────────
async function completeDelivery(request, reply) {
  const driverId = request.driver.id;
  const { tripId } = request.params;
  const { otp } = request.body;

  request.log.info(`🔄 completeDelivery START - Trip: ${tripId}, Driver: ${driverId}`);

  if (!otp || otp.length !== 4) {
    return reply.code(400).send({ success: false, message: '4-digit OTP required' });
  }

  try {
    const tripResult = await db.query(
      `SELECT dt.*, o.id as order_id, o.delivery_otp as order_delivery_otp, o.delivery_fee, o.customer_name
       FROM delivery_trips dt
       LEFT JOIN orders o ON dt.order_id = o.id
       WHERE dt.id = $1 AND dt.driver_id = $2`,
      [tripId, driverId]
    );

    const trip = tripResult.rows[0];
    if (!trip) {
      return reply.code(404).send({ success: false, message: 'Trip not found' });
    }

    // FIX: 'arrived_pickup' added — driver could skip to OTP step from there
    if (!['picked_up', 'arrived_pickup', 'arrived_dropoff'].includes(trip.status)) {
      return reply.code(400).send({
        success: false,
        message: `Cannot complete trip. Current status: ${trip.status}`,
      });
    }

    // Check OTP from delivery_trips table first, fallback to orders table
    const storedOtp = trip.delivery_otp || trip.order_delivery_otp;
    if (!storedOtp || String(storedOtp).trim() !== String(otp).trim()) {
      return reply.code(400).send({ success: false, message: 'Incorrect OTP. Please try again.' });
    }

    // Single update — DB trigger handles everything else
    await db.update(
      'delivery_trips',
      {
        status:       'delivered',
        completed_at: new Date().toISOString(),
        otp_verified: true,
      },
      { id: tripId }
    );

    // ✅ CRITICAL: Update orders table so vendor sees order as 'delivered'
    try {
      const updateResult = await db.update(
        'orders',
        {
          status: 'delivered',
        },
        { id: trip.order_id }
      );
      request.log.info(`✅ Order #${trip.order_id} status updated to "delivered"`);
    } catch (orderErr) {
      request.log.warn({ err: orderErr }, `❌ Order #${trip.order_id} status update failed (non-critical)`);
    }

    const payoutAmount = trip.payout_amount || trip.delivery_fee || 0;

    if ((await tableExists('driver_wallets')) && (await tableExists('driver_transactions'))) {
      try {
        // Check if wallet exists
        const existingWallet = await db.query(
          `SELECT id, balance FROM driver_wallets WHERE driver_id = $1 LIMIT 1`,
          [driverId]
        );

        let walletId;
        if (existingWallet.rows.length > 0) {
          // Update existing wallet
          const walletId_val = existingWallet.rows[0].id;
          await db.query(
            `UPDATE driver_wallets 
             SET balance = balance + $1,
                 total_earned = total_earned + $1,
                 today_earnings = today_earnings + $1,
                 total_trips = total_trips + 1,
                 last_updated = NOW()
             WHERE id = $2`,
            [payoutAmount, walletId_val]
          );
          walletId = walletId_val;
        } else {
          // Create new wallet
          const newWallet = await db.query(
            `INSERT INTO driver_wallets (driver_id, balance, total_earned, today_earnings, total_trips, last_updated)
             VALUES ($1, $2, $3, $4, 1, NOW())
             RETURNING id`,
            [driverId, payoutAmount, payoutAmount, payoutAmount]
          );
          walletId = newWallet.rows[0]?.id;
        }

        // Add transaction record if wallet exists
        if (walletId) {
          try {
            await db.query(
              `INSERT INTO driver_transactions (driver_id, transaction_type, amount, description, status)
               VALUES ($1, 'credit', $2, $3, 'completed')`,
              [driverId, payoutAmount, `Trip payout for order #${trip.order_id}`]
            );
          } catch (txErr) {
            request.log.warn({ err: txErr }, 'Transaction record failed (non-critical)');
          }
        }
      } catch (walletErr) {
        request.log.warn({ err: walletErr }, 'Delivery completed but wallet sync failed');
      }
    }

    notifyOrderUpdate(driverId, tripId, 'delivered', { payout: payoutAmount });

    request.log.info(`✅ completeDelivery SUCCESS - Order #${trip.order_id}, Payout: ${payoutAmount}`);
    
    return reply.send({
      success: true,
      message: 'Delivery completed successfully!',
      payout:  payoutAmount,
      tripId,
    });
  } catch (err) {
    request.log.error(`❌ completeDelivery ERROR: ${err.message}`);
    return reply.code(500).send({ success: false, message: 'Failed to complete delivery' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders/trips/:tripId/cancel
// ──────────────────────────────────────────────────────────────
async function cancelTrip(request, reply) {
  const driverId = request.driver.id;
  const { tripId } = request.params;
  const { reason } = request.body;

  if (!reason) {
    return reply.code(400).send({ success: false, message: 'Cancellation reason is required' });
  }

  try {
    const trip = await db.selectOne('delivery_trips', { id: tripId, driver_id: driverId });

    if (!trip) {
      return reply.code(404).send({ success: false, message: 'Trip not found' });
    }

    if (['delivered', 'cancelled'].includes(trip.status)) {
      return reply.code(400).send({ success: false, message: `Trip already ${trip.status}` });
    }

    await db.update(
      'delivery_trips',
      {
        status:        'cancelled',
        cancelled_at:  new Date().toISOString(),
        cancel_reason: reason,
      },
      { id: tripId }
    );

    notifyOrderUpdate(driverId, tripId, 'cancelled', { reason });
    return reply.send({ success: true, message: 'Trip cancelled', reason });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to cancel trip' });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /api/orders/history
// ──────────────────────────────────────────────────────────────
async function getOrderHistory(request, reply) {
  const driverId = request.driver.id;
  const { status = 'Completed', page = 1, limit = 20 } = request.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const statusMap = { Completed: 'delivered', Cancelled: 'cancelled', Missed: 'missed' };
  const dbStatus = statusMap[status] || 'delivered';

  try {
    if (!(await tableExists('delivery_trips'))) {
      return reply.send({
        success: true,
        data: [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: 0,
          totalPages: 0,
        },
      });
    }

    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM delivery_trips WHERE driver_id = $1 AND status = $2`,
      [driverId, dbStatus]
    );
    const count = parseInt(countResult.rows[0]?.count || 0, 10);

    const trips = await db.query(
      `SELECT
        dt.id, dt.status, dt.payout_amount, dt.distance_text, dt.started_at, dt.completed_at,
        dt.cancel_reason,
        o.id as order_id, o.product_name, o.customer_name as client_name, o.pickup_address,
        o.delivery_address, o.total_amount as final_total, o.order_date
       FROM delivery_trips dt
       LEFT JOIN orders o ON dt.order_id = o.id
       WHERE dt.driver_id = $1 AND dt.status = $2
       ORDER BY dt.completed_at DESC NULLS LAST, dt.started_at DESC
       LIMIT $3 OFFSET $4`,
      [driverId, dbStatus, parseInt(limit, 10), offset]
    );

    const historyRows = (trips.rows || []).map((row) => ({
      ...row,
      normalized_status: normalizeOrderStatus(row.status),
    }));

    return reply.send({
      success: true,
      data: historyRows,
      pagination: {
        page:       parseInt(page, 10),
        limit:      parseInt(limit, 10),
        total:      count,
        totalPages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    request.log.error('getOrderHistory error:', error);
    if (isSchemaDriftError(error)) {
      return reply.send({
        success: true,
        data: [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: 0,
          totalPages: 0,
        },
      });
    }
    return reply.code(500).send({ success: false, message: 'Failed to fetch history' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/orders
// FIX: route schema uses customer_name/customer_phone but controller
//      was inserting client_name/client_phone — now aligned.
// ──────────────────────────────────────────────────────────────
async function createOrder(request, reply) {
  const {
    vendor_id, vendor_shop_name, product_name,
    // FIX: accept both customer_name (route schema) and client_name (legacy)
    customer_name, customer_phone,
    client_name, client_phone,
    pickup_address, pickup_latitude, pickup_longitude,
    delivery_address, delivery_latitude, delivery_longitude,
    delivery_fee, delivery_distance_km, delivery_pricing,
    items_total, final_total, items,
    vehicle_type, model_id_requested, weight_capacity_requested,
    body_type_requested, dimensions_requested,
  } = request.body;

  // Normalise: prefer customer_name (new), fall back to client_name (legacy)
  const resolvedClientName  = customer_name  || client_name;
  const resolvedClientPhone = customer_phone || client_phone;
  const resolvedVendorId = request.vendor?.id || vendor_id || null;
  const resolvedVendorShopName = request.vendor?.shop_name || vendor_shop_name || null;
  const resolvedPickupAddress = pickup_address || request.vendor?.shop_address || null;
  const resolvedPickupLatitude =
    pickup_latitude ??
    request.vendor?.shop_latitude ??
    null;
  const resolvedPickupLongitude =
    pickup_longitude ??
    request.vendor?.shop_longitude ??
    null;

  if (!resolvedVendorShopName || !product_name || !resolvedPickupAddress || !delivery_address) {
    return reply.code(400).send({ success: false, message: 'Missing required order fields' });
  }

  if (!resolvedClientName || !resolvedClientPhone) {
    return reply.code(400).send({ success: false, message: 'Customer name and phone are required' });
  }

  try {
    const resolvedDeliveryLatitude = toNumberOrNull(delivery_latitude);
    const resolvedDeliveryLongitude = toNumberOrNull(delivery_longitude);
    const resolvedPickupLatNum = toNumberOrNull(resolvedPickupLatitude);
    const resolvedPickupLngNum = toNumberOrNull(resolvedPickupLongitude);

    let resolvedDistanceKm = toNumberOrNull(delivery_distance_km);
    let resolvedDeliveryFee = toNumberOrNull(delivery_fee) || 0;
    let resolvedDeliveryPricing = delivery_pricing || null;

    if (
      vehicle_type &&
      resolvedPickupLatNum != null &&
      resolvedPickupLngNum != null &&
      resolvedDeliveryLatitude != null &&
      resolvedDeliveryLongitude != null
    ) {
      try {
        const calculated = await calculateDeliveryCharge({
          vehicleType: vehicle_type,
          originLat: resolvedPickupLatNum,
          originLng: resolvedPickupLngNum,
          destLat: resolvedDeliveryLatitude,
          destLng: resolvedDeliveryLongitude,
        });

        resolvedDistanceKm = calculated.distanceKm;
        resolvedDeliveryFee = calculated.deliveryCharge;
        resolvedDeliveryPricing = {
          vehicle_type: calculated.vehicleType,
          display_name: calculated.displayName,
          distance_km: calculated.distanceKm,
          base_fare: calculated.baseFare,
          rate_per_km: calculated.ratePerKm,
          min_km: calculated.minKm,
          extra_km: calculated.extraKm,
          delivery_charge: calculated.deliveryCharge,
        };
      } catch (pricingError) {
        request.log.warn({ err: pricingError }, 'Delivery pricing fallback: using provided delivery_fee');
      }
    }

    const fallbackItemsTotal =
      toNumberOrNull(items_total) ||
      ((Array.isArray(items) ? items : []).reduce((sum, item) => {
        const qty = toFiniteNumber(item?.qty) || 1;
        const price = toFiniteNumber(item?.price ?? item?.selling_price) || 0;
        return sum + qty * price;
      }, 0));

    const resolvedFinalTotal =
      toNumberOrNull(final_total) ??
      roundNumber(fallbackItemsTotal + resolvedDeliveryFee);

    const orderPayload = await filterDataForTable('orders', {
      vendor_id:                 resolvedVendorId,
      vendor_shop_name:          resolvedVendorShopName,
      product_name,
      customer_name:             resolvedClientName,
      customer_phone:            resolvedClientPhone,
      pickup_address:            resolvedPickupAddress,
      pickup_latitude:           resolvedPickupLatNum,
      pickup_longitude:          resolvedPickupLngNum,
      delivery_address,
      delivery_latitude:         resolvedDeliveryLatitude,
      delivery_longitude:        resolvedDeliveryLongitude,
      status:                    'Pending',
      v_status:                  'pending',
      delivery_fee:              resolvedDeliveryFee,
      delivery_distance_km:      resolvedDistanceKm,
      delivery_pricing_json:     resolvedDeliveryPricing ? JSON.stringify(resolvedDeliveryPricing) : null,
      total_amount:              resolvedFinalTotal,
      items_total:               roundNumber(fallbackItemsTotal),
      final_total:               resolvedFinalTotal,
      items:                     items ? JSON.stringify(items) : null,
      vehicle_type:              vehicle_type || null,
      model_id_requested:        model_id_requested || null,
      weight_capacity_requested: weight_capacity_requested || null,
      body_type_requested:       body_type_requested || null,
      dimensions_requested:      dimensions_requested || null,
      order_date:                new Date().toISOString(),
    });

    const newOrder = await db.insert('orders', orderPayload);

    return reply.code(201).send({
      success: true,
      message: 'Order created. It will be visible to drivers after vendor acceptance.',
      data:    newOrder,
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to create order' });
  }
}

function roundNumber(value) {
  return Number(Number(value || 0).toFixed(2));
}

module.exports = {
  getAvailableOrders,
  getActiveTrip,
  acceptOrder,
  ignoreOrder,
  arrivedAtPickup,
  confirmPickup,
  arrivedAtDropoff,
  completeDelivery,
  cancelTrip,
  getOrderHistory,
  createOrder,
};
