// src/routes/billing.js
'use strict';

const {
  getInvoices, getInvoiceById, createInvoice, deleteInvoice,
  getSettlements, createSettlement, getSettlementStatus, verifySettlementPayment,
  createTicket,
} = require('../controllers/billingController');

// Vendor auth middleware (inline copy)
async function authenticateVendor(request, reply) {
  try {
    await request.jwtVerify();
    const { vendorId, role } = request.user;
    if (role !== 'vendor') {
      return reply.code(403).send({ success: false, message: 'Forbidden: vendor access only' });
    }
    const db = require('../config/database');
    const result = await db.query(
      'SELECT * FROM vendors WHERE id = $1 LIMIT 1',
      [vendorId]
    );
    if (!result.rows[0]) {
      return reply.code(401).send({ success: false, message: 'Vendor not found' });
    }
    request.vendor = result.rows[0];
  } catch (err) {
    return reply.code(401).send({ success: false, message: 'Unauthorized' });
  }
}

async function billingRoutes(fastify, options) {
  // Public callback used by Cashfree return_url
  fastify.get('/settlements/verify', { handler: verifySettlementPayment });

  fastify.addHook('preHandler', authenticateVendor);

  // Invoices
  fastify.get('/invoices',      { handler: getInvoices });
  fastify.get('/invoices/:id',  { handler: getInvoiceById });
  fastify.post('/invoices',     { handler: createInvoice });
  fastify.delete('/invoices/:id', { handler: deleteInvoice });

  // Settlements
  fastify.get('/settlements', { handler: getSettlements });
  fastify.post('/settlements', { handler: createSettlement });
  fastify.get('/settlements/:id/status', { handler: getSettlementStatus });

  // Support Tickets
  fastify.post('/tickets', { handler: createTicket });
}

module.exports = billingRoutes;
