// src/controllers/authController.js
const { sendOtp, verifyOtp } = require('../services/otpService');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function makeDriverCode(mobile) {
  const suffix = String(mobile).slice(-4);
  return `DRV${suffix}${uuidv4().slice(0, 4).toUpperCase()}`;
}

// ──────────────────────────────────────────────────────────────
// POST /api/auth/send-otp
// Body: { mobile: "9876543210" }
// ──────────────────────────────────────────────────────────────
async function sendOtpHandler(request, reply) {
  const { mobile } = request.body;

  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
    return reply.code(400).send({ success: false, message: 'Invalid Indian mobile number' });
  }

  try {
    const result = await sendOtp(mobile);
    return reply.send({
      success: true,
      message: 'OTP sent successfully',
      provider: result.provider,
      // Only expose test OTP in mock/dev mode
      ...(result.provider === 'mock' && { otp_for_testing: result.otp_for_testing }),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { mobile: "9876543210", otp: "1234" }
// Returns: { token, driver, isNewDriver }
// ──────────────────────────────────────────────────────────────
async function verifyOtpHandler(request, reply) {
  const { mobile, otp } = request.body;

  if (!mobile || !otp) {
    return reply.code(400).send({ success: false, message: 'Mobile and OTP are required' });
  }

  try {
    request.log.info(`[Verify OTP Handler] Attempting to verify - Mobile: ${mobile}, OTP: ${otp}`);
    const otpResult = await verifyOtp(mobile, otp);
    
    request.log.info(`[Verify OTP Handler] OTP verification result: ${JSON.stringify(otpResult)}`);
    
    if (!otpResult.success) {
      return reply.code(400).send({ success: false, message: otpResult.message });
    }

    // Check if the user already exists in the live schema
    let user = await db.selectOne('users', { phone_number: mobile });
    if (!user) {
      try {
        user = await db.insert('users', {
          phone_number: mobile,
          user_type: 'driver',
          status: 'active',
          is_approved: false,
          is_verified: true,
          profile_complete: false,
        });
      } catch (error) {
        request.log.error({ err: error }, '[Auth] users insert failed');
        return reply.code(500).send({
          success: false,
          message: 'Failed to create user record: ' + error.message,
        });
      }
    }

    // Check if driver profile exists for the linked user
    let driver = await db.selectOne('driver_profiles', { user_id: user.id });

    let isNewDriver = false;

    if (!driver) {
      // New driver — create a minimal profile
      isNewDriver = true;
      const referralCode = `QC${String(mobile).slice(-4)}${uuidv4().slice(0, 4).toUpperCase()}`;

      // Step 1: Create driver_profiles row
      try {
        driver = await db.insert('driver_profiles', {
          user_id:       user.id,
          driver_id:     makeDriverCode(mobile),
          full_name:     '',
          referral_code: referralCode,
          is_registered: false,
          is_online:     false,
        });
      } catch (error) {
        request.log.error({ err: error }, '[Auth] driver_profiles insert failed');
        return reply.code(500).send({
          success: false,
          message: 'Failed to create driver profile: ' + error.message,
        });
      }

      // Step 2: Create driver_stats row (best-effort — non-fatal)
      try {
        const statsTable = await db.query(`SELECT to_regclass('public.driver_stats') AS table_name`);
        if (statsTable.rows[0]?.table_name) {
          await db.query(
            `INSERT INTO driver_stats (driver_id) VALUES ($1) ON CONFLICT (driver_id) DO NOTHING`,
            [driver.id]
          );
        }
      } catch (error) {
        request.log.error({ err: error }, '[Auth] driver_stats insert failed (non-fatal)');
        // Non-fatal — profile was created, continue
      }
    }

    // Issue JWT
    const token = await reply.jwtSign(
      {
        driverId:     driver.id,
        mobile:       user.phone_number,
        isApproved:   user.is_approved     || false,
        isRegistered: driver.is_registered || false,
      },
      { expiresIn: '30d' }
    );

    return reply.send({
      success: true,
      token,
      isNewDriver,
      driver: {
        id:           driver.id,
        driverId:     driver.driver_id,
        fullName:     driver.full_name,
        mobile:       user.phone_number,
        isApproved:   user.is_approved     || false,
        isRegistered: driver.is_registered || false,  // ← key routing field
        isOnline:     driver.is_online     || false,
        status:       driver.status,
        avatarUrl:    driver.avatar_url,
        referralCode: driver.referral_code,
      },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: 'Server error during verification' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/auth/refresh-token
// Refreshes JWT for already-authenticated driver
// ──────────────────────────────────────────────────────────────
async function refreshTokenHandler(request, reply) {
  try {
    await request.jwtVerify();
    const { driverId } = request.user;

    const driver = await db.selectOne('driver_profiles', { id: driverId });

    if (!driver) {
      return reply.code(404).send({ success: false, message: 'Driver not found' });
    }

    const user = await db.selectOne('users', { id: driver.user_id });

    const token = await reply.jwtSign(
      { driverId: driver.id, mobile: user?.phone_number || request.user.mobile, isApproved: user?.is_approved || false },
      { expiresIn: '30d' }
    );

    return reply.send({ success: true, token });
  } catch (err) {
    return reply.code(401).send({ success: false, message: 'Invalid token' });
  }
}

module.exports = { sendOtpHandler, verifyOtpHandler, refreshTokenHandler };
