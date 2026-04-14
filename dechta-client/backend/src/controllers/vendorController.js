'use strict';

const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const otpService = require('../services/otp.service');

// ── Vendor Authentication ────────────────────────────────────

/**
 * POST /api/vendors/auth/send-otp
 * Send OTP to vendor's phone number
 */
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Validate phone format (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone format. Must be 10 digits.'
      });
    }

    // Send OTP
    const otp = await otpService.generateOtp(phone);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      phone: phone,
      provider: process.env.OTP_PROVIDER || 'mock',
      ...(process.env.NODE_ENV === 'development' && { dev_otp: otp })
    });
  } catch (error) {
    console.error('❌ sendOtp error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    });
  }
};

/**
 * POST /api/vendors/auth/verify-otp
 * Verify OTP and return JWT token for existing vendors or indicate new vendor
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone and OTP are required'
      });
    }

    // Verify OTP
    const otpResult = await otpService.verifyOtp(phone, otp);

    if (!otpResult.valid) {
      return res.status(401).json({
        success: false,
        message: otpResult.reason || 'OTP verification failed'
      });
    }

    // Check if vendor exists with this phone
    const vendorQuery = `
      SELECT v.*, u.phone_number, u.id as user_id
      FROM vendor_profiles v
      JOIN users u ON v.user_id = u.id
      WHERE u.phone_number = $1
    `;
    
    const { rows: vendors } = await pool.query(vendorQuery, [phone]);

    if (vendors.length === 0) {
      // New vendor - return isNewVendor flag
      return res.status(200).json({
        success: true,
        isNewVendor: true,
        phone: phone,
        message: 'Please complete registration'
      });
    }

    const vendor = vendors[0];

    // Generate JWT token
    const token = jwt.sign(
      {
        vendorId: vendor.id,
        userId: vendor.user_id,
        phone: phone,
        userType: 'vendor'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Vendor verified successfully',
      token: token,
      vendor: {
        id: vendor.id,
        businessName: vendor.business_name,
        ownerName: vendor.owner_name,
        phone: phone,
        email: vendor.email,
        category: vendor.category,
        businessAddress: vendor.business_address,
        isActive: vendor.is_active,
        approvalStatus: vendor.approval_status
      }
    });
  } catch (error) {
    console.error('❌ verifyOtp error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message
    });
  }
};

/**
 * POST /api/vendors/auth/register
 * Register new vendor account
 */
exports.register = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { phone, otp, businessName, ownerName, email, category, businessAddress } = req.body;

    // Validate input
    if (!phone || !otp || !businessName || !ownerName) {
      return res.status(400).json({
        success: false,
        message: 'Phone, OTP, business name, and owner name are required'
      });
    }

    // Verify OTP first
    const otpResult = await otpService.verifyOtp(phone, otp);
    if (!otpResult.success) {
      return res.status(401).json({
        success: false,
        message: otpResult.message
      });
    }

    // Start transaction
    await client.query('BEGIN');

    // Check if vendor already exists
    const existingVendor = await client.query(
      'SELECT id FROM vendor_profiles vp JOIN users u ON vp.user_id = u.id WHERE u.phone_number = $1',
      [phone]
    );

    if (existingVendor.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Vendor already registered with this phone'
      });
    }

    // Create user record
    const userResult = await client.query(
      `INSERT INTO users (phone_number, email, user_type, status, is_verified, is_approved, profile_complete)
       VALUES ($1, $2, $3, $4, true, false, false)
       ON CONFLICT (phone_number) DO UPDATE SET email = COALESCE($2, email)
       RETURNING id`,
      [phone, email || null, 'vendor', 'active']
    );

    const userId = userResult.rows[0].id;

    // Create vendor profile
    const vendorResult = await client.query(
      `INSERT INTO vendor_profiles (user_id, business_name, owner_name, business_address, category, is_active, approval_status)
       VALUES ($1, $2, $3, $4, $5, true, 'pending')
       RETURNING *`,
      [userId, businessName, ownerName, businessAddress || null, category || 'general']
    );

    const vendor = vendorResult.rows[0];

    // Commit transaction
    await client.query('COMMIT');

    // Generate JWT token
    const token = jwt.sign(
      {
        vendorId: vendor.id,
        userId: userId,
        phone: phone,
        userType: 'vendor'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully',
      token: token,
      vendor: {
        id: vendor.id,
        businessName: vendor.business_name,
        ownerName: vendor.owner_name,
        phone: phone,
        category: vendor.category,
        approvalStatus: vendor.approval_status,
        message: 'Pending admin approval'
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ register error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to register vendor',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/vendors/me
 * Get vendor profile (requires auth)
 */
exports.getProfile = async (req, res) => {
  try {
    const vendorId = req.vendor?.id || req.body.vendorId;

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const query = `
      SELECT vp.*, u.phone_number, u.email, u.created_at, u.is_verified
      FROM vendor_profiles vp
      JOIN users u ON vp.user_id = u.id
      WHERE vp.id = $1
    `;

    const { rows } = await pool.query(query, [vendorId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      vendor: {
        id: rows[0].id,
        userId: rows[0].user_id,
        businessName: rows[0].business_name,
        ownerName: rows[0].owner_name,
        phone: rows[0].phone_number,
        email: rows[0].email,
        category: rows[0].category,
        businessAddress: rows[0].business_address,
        isActive: rows[0].is_active,
        approvalStatus: rows[0].approval_status,
        registeredAt: rows[0].created_at
      }
    });
  } catch (error) {
    console.error('❌ getProfile error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
};

/**
 * PUT /api/vendors/me
 * Update vendor profile (requires auth)
 */
exports.updateProfile = async (req, res) => {
  try {
    const vendorId = req.vendor?.id || req.body.vendorId;
    const { businessName, ownerName, email, category, businessAddress } = req.body;

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const updateFields = [];
    const values = [vendorId];
    let paramCount = 2;

    if (businessName !== undefined) {
      updateFields.push(`business_name = $${paramCount++}`);
      values.push(businessName);
    }
    if (ownerName !== undefined) {
      updateFields.push(`owner_name = $${paramCount++}`);
      values.push(ownerName);
    }
    if (category !== undefined) {
      updateFields.push(`category = $${paramCount++}`);
      values.push(category);
    }
    if (businessAddress !== undefined) {
      updateFields.push(`business_address = $${paramCount++}`);
      values.push(businessAddress);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    const query = `
      UPDATE vendor_profiles
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      vendor: {
        id: rows[0].id,
        businessName: rows[0].business_name,
        ownerName: rows[0].owner_name,
        category: rows[0].category,
        businessAddress: rows[0].business_address
      }
    });
  } catch (error) {
    console.error('❌ updateProfile error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

/**
 * GET /api/vendors/dashboard
 * Get vendor dashboard stats (requires auth)
 */
exports.getDashboard = async (req, res) => {
  try {
    const vendorId = req.vendor?.id || req.body.vendorId;

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Get vendor products count
    const productsResult = await pool.query(
      'SELECT COUNT(*) as total FROM products WHERE vendor_id = (SELECT user_id FROM vendor_profiles WHERE id = $1)',
      [vendorId]
    );

    // Get total orders
    const ordersResult = await pool.query(
      `SELECT COUNT(*) as total, 
              COALESCE(SUM(CASE WHEN status = 'completed' THEN order_amount ELSE 0 END), 0) as revenue
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE p.vendor_id = (SELECT user_id FROM vendor_profiles WHERE id = $1)`,
      [vendorId]
    );

    res.status(200).json({
      success: true,
      dashboard: {
        totalProducts: parseInt(productsResult.rows[0].total),
        totalOrders: parseInt(ordersResult.rows[0].total),
        totalRevenue: parseFloat(ordersResult.rows[0].revenue || 0)
      }
    });
  } catch (error) {
    console.error('❌ getDashboard error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard',
      error: error.message
    });
  }
};
