'use strict';

/**
 * OTP Service
 * ─────────────────────────────────────────────────────────────
 * Currently: MOCK mode — OTP is always 1234 for testing.
 * Table aligned with UNIFIED_SCHEMA.sql:
 *   otp_verifications(phone_number, otp, is_verified, attempts, created_at, expires_at, verified_at)
 * ─────────────────────────────────────────────────────────────
 */

const pool = require('../config/db');

const MOCK_OTP = '1234';

// ── Generate & store OTP ─────────────────────────────────────
async function generateOtp(phone) {
  const otp       = MOCK_OTP;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  // Delete existing OTPs for this phone (safe whether or not unique constraint exists)
  await pool.query(`DELETE FROM otp_verifications WHERE phone_number = $1`, [phone]);

  // Insert fresh OTP record (aligned column: otp)
  await pool.query(
    `INSERT INTO otp_verifications (phone_number, otp, is_verified, created_at, expires_at)
     VALUES ($1, $2, false, NOW(), $3)`,
    [phone, otp, expiresAt]
  );

  // TODO: Replace with MSG91 when going live:
  // await msg91Service.sendOtp(phone, otp);

  console.log(`[MOCK OTP] Phone: ${phone} → OTP: ${otp}`);
  return otp;
}

// ── Verify OTP ───────────────────────────────────────────────
async function verifyOtp(phone, otpInput) {
  const { rows } = await pool.query(
    `SELECT * FROM otp_verifications
     WHERE phone_number = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone]
  );

  if (!rows.length)
    return { valid: false, reason: 'OTP not found. Please request a new OTP.' };

  const record = rows[0];

  if (record.is_verified)
    return { valid: false, reason: 'OTP already used. Please request a new one.' };

  if (new Date() > new Date(record.expires_at))
    return { valid: false, reason: 'OTP expired. Please request a new one.' };

  if (record.otp !== String(otpInput))
    return { valid: false, reason: 'Invalid OTP.' };

  // Mark verified
  await pool.query(
     `UPDATE otp_verifications
      SET is_verified = true, verified_at = NOW()
     WHERE phone_number = $1 AND otp = $2`,
    [phone, String(otpInput)]
  );

  return { valid: true };
}

module.exports = { generateOtp, verifyOtp };
