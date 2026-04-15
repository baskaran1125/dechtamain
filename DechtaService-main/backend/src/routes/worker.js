// src/routes/worker.js
'use strict';

const wc = require('../controllers/workerController');

// Worker auth middleware — attaches request.worker
async function authenticateWorker(request, reply) {
  try {
    await request.jwtVerify();
    const { workerId, role } = request.user;

    if (role !== 'worker') {
      return reply.code(403).send({ success: false, message: 'Forbidden: worker access only' });
    }

    const db = require('../config/database');
    const result = await db.query(
      'SELECT * FROM worker_profiles WHERE id = $1 LIMIT 1',
      [workerId]
    );

    if (!result.rows[0]) {
      return reply.code(401).send({ success: false, message: 'Worker not found' });
    }

    request.worker = result.rows[0];
  } catch (err) {
    return reply.code(401).send({ success: false, message: 'Unauthorized. Invalid or expired token.' });
  }
}

async function workerRoutes(fastify, options) {
  await wc.ensureWorkerCoreSchema();

  // ── Public auth routes (no auth required) ─────────────────
  fastify.post('/auth/send-otp', { handler: wc.workerSendOtp });
  fastify.post('/auth/verify-otp', { handler: wc.workerVerifyOtp });
  fastify.post('/auth/register', { handler: wc.workerRegister });
  fastify.post('/auth/logout', { handler: wc.workerLogout });
  // Cashfree return_url callback for worker wallet top-up
  fastify.get('/wallet/verify', { handler: wc.verifyWorkerWalletPayment });

  // ── Protected routes (auth required) ──────────────────────
  await fastify.register(async (f) => {
    f.addHook('preHandler', authenticateWorker);

    // Profile
    f.get('/me', { handler: wc.getWorkerProfile });
    f.get('/profile', { handler: wc.getProfile });
    f.put('/profile', { handler: wc.updateProfile });
    f.post('/profile/complete', { handler: wc.completeProfile });
    f.post('/profile/documents', { handler: wc.submitDocuments });

    // Notifications
    f.get('/notifications', { handler: wc.getNotifications });
    f.get('/notifications/unread-count', { handler: wc.getUnreadCount });
    f.put('/notifications/:id/read', { handler: wc.markNotificationRead });
    f.put('/notifications/mark-all-read', { handler: wc.markAllNotificationsRead });

    // Daily Target & Incentives
    f.get('/daily-target', { handler: wc.getDailyTarget });
    f.put('/daily-target', { handler: wc.updateDailyTarget });
    f.get('/incentives', { handler: wc.getIncentives });
    f.get('/incentives/progress', { handler: wc.getIncentiveProgress });
    f.get('/surge-pricing', { handler: wc.getSurgePricing });

    // Job Rate Settings
    f.get('/job-rate-settings', { handler: wc.getJobRateSettings });

    // Bank Details
    f.get('/bank-details', { handler: wc.getBankDetails });
    f.post('/bank-details', { handler: wc.submitBankDetails });

    // Jobs
    f.get('/jobs', { handler: wc.getJobs });
    f.post('/jobs', { handler: wc.recordJob });
    f.get('/jobs/:jobId/chat', { handler: wc.getJobChat });
    f.post('/jobs/:jobId/chat', { handler: wc.sendJobChat });
    f.get('/jobs/:jobId/location-history', { handler: wc.getJobLocationHistory });

    // Transactions
    f.get('/transactions', { handler: wc.getTransactions });
    f.post('/transactions', { handler: wc.recordTransaction });

    // Support Tickets
    f.post('/support/tickets', { handler: wc.createTicket });
    f.get('/support/tickets', { handler: wc.getTickets });
    f.get('/support/tickets/:ticketId/messages', { handler: wc.getTicketMessages });
    f.post('/support/tickets/:ticketId/messages', { handler: wc.sendTicketMessage });

    // Location / GPS
    f.post('/location', { handler: wc.updateLocation });
    f.get('/location', { handler: wc.getLocation });

    // Upload
    f.post('/upload', { handler: wc.uploadFile });

    // Withdrawals
    f.post('/withdrawals', { handler: wc.createWithdrawal });
    f.get('/withdrawals', { handler: wc.getWithdrawals });

    // Online Status
    f.put('/status', { handler: wc.toggleStatus });

    // Wallet
    f.post('/wallet/add-money', { handler: wc.addMoney });
    f.get('/wallet/orders/:orderId/status', { handler: wc.getWorkerPaymentOrderStatus });
    f.put('/wallet/balance', { handler: wc.updateWalletBalance });

    // Settings
    f.put('/settings', { handler: wc.updateSettings });

    // FAQ / Help
    f.get('/faqs', { handler: wc.getFaqs });
    f.get('/faqs/categories', { handler: wc.getFaqCategories });
    f.post('/faqs/:id/helpful', { handler: wc.markFaqHelpful });
    f.get('/help-articles', { handler: wc.getHelpArticles });
    f.get('/help-articles/:slug', { handler: wc.getHelpArticleBySlug });
  });
}

module.exports = workerRoutes;
