// src/routes/products.js
'use strict';

const {
  getProducts, createProduct, updateProduct,
  toggleProductActive, boostProduct, getGstByCategory,
} = require('../controllers/productsController');

// Vendor auth middleware (inline — same as vendors.js)
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

async function productRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticateVendor);

  // GST lookup (no auth scope issue — still needs vendor auth)
  fastify.get('/gst/by-category', { handler: getGstByCategory });

  // Products CRUD
  fastify.get('/',           { handler: getProducts });
  fastify.post('/',          { handler: createProduct });
  fastify.put('/:id',        { handler: updateProduct });
  fastify.patch('/:id/toggle', { handler: toggleProductActive });
  fastify.patch('/:id/boost',  { handler: boostProduct });
}

module.exports = productRoutes;
