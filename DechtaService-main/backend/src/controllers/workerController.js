// src/controllers/workerController.js
'use strict';

const { sendOtp, verifyOtp } = require('../services/otpService');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const CASHFREE_API_VERSION = '2023-08-01';
const WORKER_ORDER_PREFIX = 'WKR_ADD_';
const WORKER_FAILURE_STATUSES = new Set([
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'TERMINATED',
  'REJECTED',
  'DECLINED',
  'VOIDED',
  'USER_DROPPED',
]);

let workerPaymentOrdersTableReady = false;

function getApiBaseUrl(request) {
  const fromEnv = String(process.env.PUBLIC_API_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const protocol = request.protocol || 'http';
  const host = request.headers.host;
  return `${protocol}://${host}`;
}

function getCashfreeBaseUrl() {
  const env = String(process.env.CASHFREE_ENVIRONMENT || 'SANDBOX').toUpperCase();
  return env === 'PRODUCTION' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
}

function hasCashfreeCredentials() {
  const appId = String(process.env.CASHFREE_APP_ID || '').trim();
  const secret = String(process.env.CASHFREE_SECRET_KEY || '').trim();
  if (!appId || !secret) return false;
  if (appId.includes('your_') || secret.includes('your_')) return false;
  return true;
}

function getCashfreeHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-version': CASHFREE_API_VERSION,
    'x-client-id': process.env.CASHFREE_APP_ID,
    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
  };
}

function isValidWorkerOrderId(orderId) {
  return /^WKR_ADD_[A-Z0-9_-]+$/i.test(String(orderId || '').trim());
}

function normalizeWorkerOrderStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (!normalized) return 'PENDING';
  return normalized;
}

function mapCashfreeOrderStatus(orderStatus) {
  const normalized = String(orderStatus || '').toUpperCase();
  if (normalized === 'PAID') return 'SUCCESS';
  if (WORKER_FAILURE_STATUSES.has(normalized)) return 'FAILED';
  return 'PENDING';
}

function paymentHtml({ success, title, message }) {
  const bg = success ? '#F0FDF4' : '#FEF2F2';
  const fg = success ? '#166534' : '#991B1B';
  const icon = success ? '&#9989;' : '&#10060;';

  return `
    <html>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background-color:${bg};color:${fg};margin:0;">
        <div style="background:white;padding:40px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);text-align:center;max-width:520px;">
          <h1 style="font-size:64px;margin:0;">${icon}</h1>
          <h2 style="margin-top:20px;">${title}</h2>
          <p style="color:#475569;">${message}</p>
        </div>
      </body>
    </html>
  `;
}

async function ensureWorkerPaymentOrdersTable() {
  if (workerPaymentOrdersTableReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS worker_payment_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
      cashfree_order_id VARCHAR(120) NOT NULL UNIQUE,
      amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_worker_payment_orders_worker ON worker_payment_orders(worker_id)`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_worker_payment_orders_cf ON worker_payment_orders(cashfree_order_id)`
  );

  workerPaymentOrdersTableReady = true;
}

async function finalizeWorkerOrder(orderId) {
  const client = await db.beginTransaction();
  try {
    const orderRes = await client.query(
      'SELECT * FROM worker_payment_orders WHERE cashfree_order_id = $1 FOR UPDATE',
      [orderId]
    );
    const lockedOrder = orderRes.rows[0];
    if (!lockedOrder) throw new Error('Payment order not found during finalization');

    const currentStatus = normalizeWorkerOrderStatus(lockedOrder.status);
    if (currentStatus === 'SUCCESS') {
      await client.query('COMMIT');
      client.release();
      return lockedOrder;
    }

    if (currentStatus !== 'PENDING') {
      await client.query('COMMIT');
      client.release();
      return lockedOrder;
    }

    const amount = Number(lockedOrder.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Invalid payment amount');
    }

    await client.query(
      'UPDATE worker_payment_orders SET status = $1, completed_at = NOW() WHERE id = $2',
      ['SUCCESS', lockedOrder.id]
    );

    await client.query(
      `UPDATE worker_profiles
       SET wallet_balance = COALESCE(wallet_balance, 0) + $1
       WHERE id = $2`,
      [amount, lockedOrder.worker_id]
    );

    await client.query(
      `INSERT INTO worker_transactions (worker_id, amount, description, transaction_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [lockedOrder.worker_id, amount, 'Wallet top-up via Cashfree', 'credit']
    );

    const finalOrderRes = await client.query(
      'SELECT * FROM worker_payment_orders WHERE id = $1 LIMIT 1',
      [lockedOrder.id]
    );

    await client.query('COMMIT');
    client.release();
    return finalOrderRes.rows[0] || { ...lockedOrder, status: 'SUCCESS' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw error;
  }
}

async function syncWorkerOrderWithCashfree(orderId, knownOrder = null) {
  let order = knownOrder;
  if (!order) {
    const orderRes = await db.query(
      'SELECT * FROM worker_payment_orders WHERE cashfree_order_id = $1 LIMIT 1',
      [orderId]
    );
    order = orderRes.rows[0] || null;
  }

  if (!order) return { order: null, providerStatus: null };
  if (normalizeWorkerOrderStatus(order.status) === 'SUCCESS') {
    return { order, providerStatus: null };
  }
  if (!hasCashfreeCredentials()) {
    return { order, providerStatus: null };
  }

  const response = await fetch(`${getCashfreeBaseUrl()}/pg/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: getCashfreeHeaders(),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || `Cashfree worker order status check failed (${response.status})`);
  }

  const providerStatus = String(data.order_status || '').toUpperCase();
  const mappedStatus = mapCashfreeOrderStatus(providerStatus);

  if (mappedStatus === 'SUCCESS') {
    const finalized = await finalizeWorkerOrder(orderId);
    return { order: finalized, providerStatus };
  }

  if (mappedStatus === 'FAILED' && normalizeWorkerOrderStatus(order.status) === 'PENDING') {
    const updated = await db.query(
      'UPDATE worker_payment_orders SET status = $1 WHERE id = $2 RETURNING *',
      ['FAILED', order.id]
    );
    order = updated.rows[0] || { ...order, status: 'FAILED' };
  }

  return { order, providerStatus };
}

// ──────────────────────────────────────────────────────────────
// POST /api/worker/auth/send-otp
// Body: { mobile }
// ──────────────────────────────────────────────────────────────
async function workerSendOtp(request, reply) {
  const mobile = (request.body.mobile || request.body.phone || '').trim();

  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
    return reply.code(400).send({ success: false, message: 'Invalid 10-digit Indian mobile number' });
  }

  try {
    const result = await sendOtp(mobile);
    return reply.send({
      success: true,
      message: 'OTP sent successfully',
      provider: result.provider,
      ...(result.provider === 'mock' && { dev_otp: result.otp_for_testing }),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/worker/auth/verify-otp  (login)
// Body: { mobile/phone, otp }
// Returns: { token, worker, isNewWorker }
// ──────────────────────────────────────────────────────────────
async function workerVerifyOtp(request, reply) {
  const mobile = (request.body.mobile || request.body.phone || '').trim();
  const otp    = String(request.body.otp || '').trim();

  if (!mobile || !otp) {
    return reply.code(400).send({ success: false, message: 'Mobile and OTP are required' });
  }

  try {
    const otpResult = await verifyOtp(mobile, otp);
    if (!otpResult.success) {
      return reply.code(400).send({ success: false, message: otpResult.message });
    }

    // Look up worker profile by mobile
    let worker = null;
    let isNewWorker = false;

    try {
      const res = await db.query(
        'SELECT * FROM worker_profiles WHERE phone = $1 LIMIT 1',
        [mobile]
      );
      worker = res.rows[0] || null;
    } catch (dbErr) {
      // Table may not exist yet — treat as new worker to allow self-registration
      request.log.warn({ err: dbErr }, '[Worker] worker_profiles query failed — treating as new worker');
    }

    if (!worker) {
      // New worker — create in auth_users table first, then profile
      isNewWorker = true;
      try {
        // Step 1: Get or create entry in worker_auth_users
        let authUser = null;
        let workerId = null;

        // Try to find existing auth user
        const existingAuth = await db.query(
          'SELECT id FROM worker_auth_users WHERE phone = $1 LIMIT 1',
          [mobile]
        ).catch(() => null);

        if (existingAuth?.rows?.[0]) {
          workerId = existingAuth.rows[0].id;
        } else {
          // Create new auth user
          workerId = uuidv4();
          try {
            await db.query(
              `INSERT INTO worker_auth_users (id, phone, created_at)
               VALUES ($1, $2, NOW())`,
              [workerId, mobile]
            );
          } catch (authErr) {
            // If it fails due to unique constraint, fetch the existing ID
            const fetchExisting = await db.query(
              'SELECT id FROM worker_auth_users WHERE phone = $1 LIMIT 1',
              [mobile]
            );
            if (fetchExisting.rows[0]) {
              workerId = fetchExisting.rows[0].id;
            } else {
              throw authErr;
            }
          }
        }

        // Step 2: Create profile in worker_profiles with FK reference
        const ins = await db.query(
          `INSERT INTO worker_profiles
             (id, phone, full_name, is_approved, is_profile_complete, created_at)
           VALUES ($1, $2, '', false, false, NOW())
           RETURNING *`,
          [workerId, mobile]
        );
        worker = ins.rows[0];
      } catch (insertErr) {
        request.log.error({ err: insertErr }, '[Worker] worker profile creation failed');
        return reply.code(500).send({
          success: false,
          message: 'Failed to create worker profile: ' + insertErr.message,
        });
      }
    }

    const token = await reply.jwtSign(
      {
        workerId:     worker.id,
        mobile:       worker.phone,
        role:         'worker',
        isRegistered: worker.is_profile_complete || false,
      },
      { expiresIn: '30d' }
    );

    return reply.send({
      success: true,
      token,
      isNewWorker,
      worker: formatWorker(worker),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: 'Server error during verification' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/worker/auth/register
// Body: { mobile/phone, otp, name, skillCategory, state, city, area }
// ──────────────────────────────────────────────────────────────
async function workerRegister(request, reply) {
  const mobile        = (request.body.mobile || request.body.phone || '').trim();
  const otp           = String(request.body.otp || '').trim();
  const name          = (request.body.name || '').trim();
  const skillCategory = (request.body.skillCategory || '').trim();
  const state         = (request.body.state || '').trim();
  const city          = (request.body.city || '').trim();
  const area          = (request.body.area || '').trim();
  const address       = (request.body.address || '').trim();

  if (!mobile || !otp || !name) {
    return reply.code(400).send({ success: false, message: 'mobile, otp and name are required' });
  }

  try {
    const otpResult = await verifyOtp(mobile, otp);
    if (!otpResult.success) {
      return reply.code(400).send({ success: false, message: otpResult.message });
    }

    // Upsert worker profile (created on verify-otp, now completing registration)
    const result = await db.query(
      `UPDATE worker_profiles
       SET full_name = $1, skill_category = $2,
           state = $3, city = $4, area = $5, address = $6,
           is_profile_complete = true
       WHERE phone = $7
       RETURNING *`,
      [name, skillCategory, state, city, area, address, mobile]
    );

    if (!result.rows[0]) {
      return reply.code(404).send({ success: false, message: 'Worker profile not found. Verify OTP first.' });
    }

    const w = result.rows[0];
    const token = await reply.jwtSign(
      { workerId: w.id, mobile: w.phone, role: 'worker', isRegistered: true },
      { expiresIn: '30d' }
    );

    return reply.code(200).send({
      success: true,
      token,
      worker: formatWorker(w),
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /api/worker/me
// ──────────────────────────────────────────────────────────────
async function getWorkerProfile(request, reply) {
  try {
    const result = await db.query(
      'SELECT * FROM worker_profiles WHERE id = $1 LIMIT 1',
      [request.worker.id]
    );
    if (!result.rows[0]) return reply.code(404).send({ success: false, message: 'Worker not found' });
    return reply.send({ success: true, worker: formatWorker(result.rows[0]) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /api/worker/profile
// ──────────────────────────────────────────────────────────────
async function getProfile(request, reply) {
  try {
    const result = await db.query(
      'SELECT * FROM worker_profiles WHERE id = $1 LIMIT 1',
      [request.worker.id]
    );
    if (!result.rows[0]) return reply.code(404).send({ success: false, message: 'Worker not found' });
    return reply.send({ success: true, worker: formatWorker(result.rows[0]) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// PUT /api/worker/profile
// ──────────────────────────────────────────────────────────────
async function updateProfile(request, reply) {
  const { name, state, city, area } = request.body || {};
  try {
    const result = await db.query(
      `UPDATE worker_profiles
       SET full_name = COALESCE($1, full_name),
           state = COALESCE($2, state),
           city = COALESCE($3, city),
           area = COALESCE($4, area)
       WHERE id = $5 RETURNING *`,
      [name, state, city, area, request.worker.id]
    );
    return reply.send({ success: true, worker: formatWorker(result.rows[0]) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/worker/profile/complete
// ──────────────────────────────────────────────────────────────
async function completeProfile(request, reply) {
  const b = request.body || {};
  try {
    const result = await db.query(
      `UPDATE worker_profiles
       SET skill_category = COALESCE($1, skill_category),
           state = COALESCE($2, state),
           city = COALESCE($3, city),
           area = COALESCE($4, area),
           address = COALESCE($5, address),
           is_profile_complete = true
       WHERE id = $6 RETURNING *`,
      [b.skillCategory, b.state, b.city, b.area, b.address, request.worker.id]
    );
    return reply.send({ success: true, worker: formatWorker(result.rows[0]) });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/worker/profile/documents
// ──────────────────────────────────────────────────────────────
async function submitDocuments(request, reply) {
  return reply.send({ success: true, message: 'Documents submitted for review' });
}

// ──────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ──────────────────────────────────────────────────────────────
async function getNotifications(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function getUnreadCount(request, reply) {
  return reply.send({ success: true, count: 0 });
}

async function markNotificationRead(request, reply) {
  return reply.send({ success: true });
}

async function markAllNotificationsRead(request, reply) {
  return reply.send({ success: true });
}

// ──────────────────────────────────────────────────────────────
// DAILY TARGET & INCENTIVES
// ──────────────────────────────────────────────────────────────
async function getDailyTarget(request, reply) {
  return reply.send({
    success: true,
    data: {
      jobsTarget: 5, jobsCompleted: 0,
      earningsTarget: 1000, earningsAchieved: 0,
      hoursTarget: 8, hoursWorked: 0,
    },
  });
}

async function updateDailyTarget(request, reply) {
  return reply.send({ success: true, message: 'Target updated' });
}

async function getIncentives(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function getIncentiveProgress(request, reply) {
  return reply.send({ success: true, data: { progress: 0, milestones: [] } });
}

async function getSurgePricing(request, reply) {
  return reply.send({ success: true, data: { multiplier: 1.0, isActive: false } });
}

// ──────────────────────────────────────────────────────────────
// JOB RATE SETTINGS
// ──────────────────────────────────────────────────────────────
async function getJobRateSettings(request, reply) {
  return reply.send({ success: true, data: { rates: [], currency: 'INR' } });
}

// ──────────────────────────────────────────────────────────────
// BANK DETAILS
// ──────────────────────────────────────────────────────────────
async function getBankDetails(request, reply) {
  return reply.send({ success: true, data: null });
}

async function submitBankDetails(request, reply) {
  return reply.send({ success: true, message: 'Bank details saved' });
}

// ──────────────────────────────────────────────────────────────
// JOBS
// ──────────────────────────────────────────────────────────────
async function recordJob(request, reply) {
  const { serviceType, amount, paymentMethod, elapsedSeconds } = request.body || {};
  const workerId = request.worker.id;

  // db is required at the top of this file
  try {
    const client = await db.beginTransaction();
    const res = await client.query('SELECT wallet_balance FROM worker_profiles WHERE id = $1 FOR UPDATE', [workerId]);
    const worker = res.rows[0];
    
    if (!worker) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ success: false, message: 'Worker not found' });
    }

    const newAmount = Number(amount) || 0;
    const newBalance = parseFloat(worker.wallet_balance || 0) + newAmount;

    await client.query(
      'UPDATE worker_profiles SET wallet_balance = $1, total_jobs = COALESCE(total_jobs, 0) + 1 WHERE id = $2',
      [newBalance, workerId]
    );

    // Save transaction
    if (newAmount > 0) {
      const hours = ((Number(elapsedSeconds) || 0) / 3600).toFixed(2);
      await client.query(
        `INSERT INTO worker_transactions (worker_id, amount, description, transaction_type, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [workerId, newAmount.toFixed(2), `Job Earnings - ${serviceType || 'Service'} (${hours}h)`, 'credit']
      );
    }
    
    await client.query('COMMIT');
    return reply.send({ success: true, message: 'Job recorded and earnings added to wallet', new_balance: newBalance });
  } catch(err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: 'Failed to record job' });
  }
}

// ──────────────────────────────────────────────────────────────
// TRANSACTIONS
// ──────────────────────────────────────────────────────────────
async function getTransactions(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function recordTransaction(request, reply) {
  return reply.send({ success: true, message: 'Transaction recorded' });
}

// ──────────────────────────────────────────────────────────────
// SUPPORT TICKETS
// ──────────────────────────────────────────────────────────────
async function createTicket(request, reply) {
  return reply.send({ success: true, message: 'Ticket created', data: { id: 0 } });
}

async function getTickets(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function getTicketMessages(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function sendTicketMessage(request, reply) {
  return reply.send({ success: true, message: 'Message sent' });
}

// ──────────────────────────────────────────────────────────────
// JOB CHAT
// ──────────────────────────────────────────────────────────────
async function getJobChat(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function sendJobChat(request, reply) {
  return reply.send({ success: true, message: 'Chat message sent' });
}

// ──────────────────────────────────────────────────────────────
// GPS / LOCATION
// ──────────────────────────────────────────────────────────────
async function updateLocation(request, reply) {
  return reply.send({ success: true });
}

async function getLocation(request, reply) {
  return reply.send({ success: true, data: null });
}

async function getJobLocationHistory(request, reply) {
  return reply.send({ success: true, data: [] });
}

// ──────────────────────────────────────────────────────────────
// UPLOAD
// ──────────────────────────────────────────────────────────────
async function uploadFile(request, reply) {
  return reply.send({ success: true, url: '' });
}

// ──────────────────────────────────────────────────────────────
// WITHDRAWALS
// ──────────────────────────────────────────────────────────────
async function createWithdrawal(request, reply) {
  return reply.send({ success: true, message: 'Withdrawal request submitted' });
}

async function getWithdrawals(request, reply) {
  return reply.send({ success: true, data: [] });
}

// ──────────────────────────────────────────────────────────────
// ONLINE STATUS
// ──────────────────────────────────────────────────────────────
async function toggleStatus(request, reply) {
  return reply.send({ success: true });
}

// ──────────────────────────────────────────────────────────────
// WALLET
// ──────────────────────────────────────────────────────────────
async function addMoney(request, reply) {
  const amount = Number(request.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return reply.code(400).send({ success: false, message: 'Valid amount is required' });
  }

  if (!hasCashfreeCredentials()) {
    return reply.code(503).send({
      success: false,
      message:
        'Cashfree test credentials are missing. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY and retry.',
    });
  }

  try {
    await ensureWorkerPaymentOrdersTable();
    const workerId = request.worker.id;
    const orderId = `${WORKER_ORDER_PREFIX}${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    await db.query(
      `INSERT INTO worker_payment_orders (worker_id, cashfree_order_id, amount, status)
       VALUES ($1, $2, $3, 'PENDING')`,
      [workerId, orderId, amount]
    );

    const returnUrl = `${getApiBaseUrl(request)}/api/worker/wallet/verify?order_id=${encodeURIComponent(orderId)}`;
    const customerPhone = request.worker.phone || '9999999999';
    const customerName = request.worker.full_name || 'Worker Partner';

    const cashfreeRes = await fetch(`${getCashfreeBaseUrl()}/pg/orders`, {
      method: 'POST',
      headers: getCashfreeHeaders(),
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: `WORKER_${workerId}`,
          customer_phone: customerPhone,
          customer_name: customerName,
        },
        order_meta: { return_url: returnUrl },
      }),
    });

    let cashfreeData = {};
    try {
      cashfreeData = await cashfreeRes.json();
    } catch {
      cashfreeData = {};
    }

    if (!cashfreeRes.ok) {
      await db.query(
        `UPDATE worker_payment_orders SET status = 'FAILED' WHERE cashfree_order_id = $1`,
        [orderId]
      );
      throw new Error(cashfreeData.message || 'Failed to create Cashfree payment order');
    }

    const paymentLink =
      cashfreeData.payment_link ||
      cashfreeData.order_meta?.payment_link ||
      cashfreeData.order_meta?.payment_url;

    if (!paymentLink) {
      throw new Error('Cashfree order created but payment link was not returned');
    }

    return reply.send({
      success: true,
      order_id: orderId,
      payment_link: paymentLink,
      status: 'PENDING',
    });
  } catch (err) {
    request.log.error({ err }, 'Worker add money error');
    return reply.code(500).send({ success: false, message: err.message || 'Failed to start payment' });
  }
}

async function getWorkerPaymentOrderStatus(request, reply) {
  const orderId = String(request.params.orderId || '').trim();
  if (!isValidWorkerOrderId(orderId)) {
    return reply.code(400).send({ success: false, message: 'Invalid order id' });
  }

  try {
    await ensureWorkerPaymentOrdersTable();

    const orderRes = await db.query(
      `SELECT * FROM worker_payment_orders
       WHERE cashfree_order_id = $1 AND worker_id = $2
       LIMIT 1`,
      [orderId, request.worker.id]
    );

    const existingOrder = orderRes.rows[0];
    if (!existingOrder) {
      return reply.code(404).send({ success: false, message: 'Payment order not found' });
    }

    const shouldSync = normalizeWorkerOrderStatus(existingOrder.status) === 'PENDING';
    const { order, providerStatus } = shouldSync
      ? await syncWorkerOrderWithCashfree(orderId, existingOrder)
      : { order: existingOrder, providerStatus: null };

    const finalOrder = order || existingOrder;
    return reply.send({
      success: true,
      order_id: finalOrder.cashfree_order_id,
      status: normalizeWorkerOrderStatus(finalOrder.status),
      amount: Number(finalOrder.amount || 0),
      completed_at: finalOrder.completed_at || null,
      provider_status: providerStatus || null,
    });
  } catch (err) {
    request.log.error({ err }, 'Worker payment status error');
    return reply.code(500).send({ success: false, message: err.message || 'Failed to check payment status' });
  }
}

async function verifyWorkerWalletPayment(request, reply) {
  const orderId = String(request.query.order_id || '').trim();
  if (!isValidWorkerOrderId(orderId)) {
    return reply.type('text/html').send(
      paymentHtml({
        success: false,
        title: 'Invalid Payment Reference',
        message: 'The payment reference is invalid. Retry from the worker app.',
      })
    );
  }

  try {
    await ensureWorkerPaymentOrdersTable();
    const orderRes = await db.query(
      'SELECT * FROM worker_payment_orders WHERE cashfree_order_id = $1 LIMIT 1',
      [orderId]
    );
    const existingOrder = orderRes.rows[0];

    if (!existingOrder) {
      return reply.type('text/html').send(
        paymentHtml({
          success: false,
          title: 'Payment Not Found',
          message: 'No matching worker payment request was found.',
        })
      );
    }

    const { order } = await syncWorkerOrderWithCashfree(orderId, existingOrder);
    const finalOrder = order || existingOrder;
    const status = normalizeWorkerOrderStatus(finalOrder.status);

    if (status === 'SUCCESS') {
      return reply.type('text/html').send(
        paymentHtml({
          success: true,
          title: 'Payment Successful',
          message: 'Worker wallet top-up completed. You may return to the app.',
        })
      );
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      return reply.type('text/html').send(
        paymentHtml({
          success: false,
          title: 'Payment Failed',
          message: 'Payment could not be completed. Retry from the worker app.',
        })
      );
    }

    return reply.type('text/html').send(
      paymentHtml({
        success: false,
        title: 'Payment Pending',
        message: 'Confirmation is still pending. Complete payment and refresh this page.',
      })
    );
  } catch (err) {
    request.log.error({ err }, 'Worker verify payment error');
    return reply.type('text/html').send(
      paymentHtml({
        success: false,
        title: 'Verification Error',
        message: 'Could not verify worker payment right now. Please retry from the app.',
      })
    );
  }
}

async function updateWalletBalance(request, reply) {
  return reply.send({ success: true });
}

// ──────────────────────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────────────────────
async function updateSettings(request, reply) {
  return reply.send({ success: true, message: 'Settings updated' });
}

// ──────────────────────────────────────────────────────────────
// FAQ / HELP
// ──────────────────────────────────────────────────────────────
async function getFaqs(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function getFaqCategories(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function markFaqHelpful(request, reply) {
  return reply.send({ success: true });
}

async function getHelpArticles(request, reply) {
  return reply.send({ success: true, data: [] });
}

async function getHelpArticleBySlug(request, reply) {
  return reply.send({ success: true, data: null });
}

// AUTH LOGOUT
async function workerLogout(request, reply) {
  return reply.send({ success: true, message: 'Logged out' });
}

// ── Helper ────────────────────────────────────────────────────
function formatWorker(w) {
  return {
    id:               w.id,
    mobile:           w.phone,
    fullName:         w.full_name || '',
    skillCategory:    w.skill_category || '',
    state:            w.state || '',
    city:             w.city || '',
    area:             w.area || '',
    address:          w.address || '',
    isApproved:       w.is_approved || false,
    isRegistered:     w.is_profile_complete || false,
    isProfileComplete: w.is_profile_complete || false,
    walletBalance:    w.wallet_balance || '0',
    totalJobs:        w.total_jobs || '0',
    rating:           w.rating || '0',
    isPremium:        false,
    isFrozen:         false,
    createdAt:        w.created_at,
  };
}

module.exports = {
  workerSendOtp,
  workerVerifyOtp,
  workerRegister,
  getWorkerProfile,
  getProfile,
  updateProfile,
  completeProfile,
  submitDocuments,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  getDailyTarget,
  updateDailyTarget,
  getIncentives,
  getIncentiveProgress,
  getSurgePricing,
  getJobRateSettings,
  getBankDetails,
  submitBankDetails,
  recordJob,
  getTransactions,
  recordTransaction,
  createTicket,
  getTickets,
  getTicketMessages,
  sendTicketMessage,
  getJobChat,
  sendJobChat,
  updateLocation,
  getLocation,
  getJobLocationHistory,
  uploadFile,
  createWithdrawal,
  getWithdrawals,
  toggleStatus,
  addMoney,
  getWorkerPaymentOrderStatus,
  verifyWorkerWalletPayment,
  updateWalletBalance,
  updateSettings,
  getFaqs,
  getFaqCategories,
  markFaqHelpful,
  getHelpArticles,
  getHelpArticleBySlug,
  workerLogout,
};

