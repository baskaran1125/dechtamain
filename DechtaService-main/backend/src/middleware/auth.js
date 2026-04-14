// src/middleware/auth.js
const db = require('../config/database');

// ──────────────────────────────────────────────────────────────
// Fastify preHandler — verifies JWT and attaches driver to request
// ──────────────────────────────────────────────────────────────
async function authenticate(request, reply) {
  try {
    await request.jwtVerify();

    const tokenDriverId = request.user?.driverId ?? request.user?.id ?? null;
    const tokenUserId = request.user?.userId ?? request.user?.user_id ?? null;

    let driver = null;

    // Try resolving by driver profile id when present in token
    if (tokenDriverId) {
      driver = await db.selectOne('driver_profiles', { id: tokenDriverId });
    }

    // Fallback: some tokens only carry user id
    if (!driver && tokenUserId) {
      driver = await db.selectOne('driver_profiles', { user_id: tokenUserId });
    }

    if (!driver) {
      return reply.code(401).send({ success: false, message: 'Driver not found' });
    }

    // Unified schema stores approval on users, while legacy schemas may keep it on driver_profiles.
    // Treat driver as approved if either source says approved, unless user is explicitly rejected.
    const user = driver.user_id ? await db.selectOne('users', { id: driver.user_id }) : null;
    const userStatus = String(user?.status || '').toLowerCase();
    const userVerification = String(user?.verification_status || '').toLowerCase();
    const userRejected = userStatus === 'suspended' || userStatus === 'banned' || userVerification === 'rejected';
    const driverApproved = !!driver.is_approved;
    const userApproved = !!(user?.is_approved) || userVerification === 'verified';
    driver.is_approved = !userRejected && (driverApproved || userApproved);

    // Attach driver to request for downstream use
    request.driver = driver;
  } catch (err) {
    reply.code(401).send({ success: false, message: 'Unauthorized. Invalid or expired token.' });
  }
}

// ──────────────────────────────────────────────────────────────
// Check if driver is approved before allowing sensitive actions
// Returns pendingApproval: true so the frontend can show a
// clear "pending approval" message instead of a generic error.
// ──────────────────────────────────────────────────────────────
async function requireApproved(request, reply) {
  if (!request.driver) {
    return reply.code(401).send({ success: false, message: 'Not authenticated' });
  }
  if (!request.driver.is_approved) {
    return reply.code(403).send({
      success: false,
      pendingApproval: true,
      message: 'Your account is pending admin approval. You will be notified once approved.',
    });
  }
}

module.exports = { authenticate, requireApproved };
