'use strict';

const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { ok, err } = require('../utils/response');
const { getDistanceKm } = require('../utils/distanceCalc');

const STATUS_LABELS = {
  pending: 'Placed',
  confirmed: 'Processing',
  processing: 'Processing',
  shipped: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const ORDER_SCHEMA_PATCHES = [
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7)`,
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7)`,
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS area TEXT`,
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS city TEXT`,
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS state TEXT`,
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS pincode VARCHAR(20)`,
  `ALTER TABLE addresses ADD COLUMN IF NOT EXISTS landmark TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id VARCHAR(100)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_name VARCHAR(120)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_phone VARCHAR(20)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_shop_name VARCHAR(255)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_address TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10,2)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_pricing_json JSONB`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(12,2) DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_total NUMERIC(12,2)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_total NUMERIC(12,2)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(50)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(40)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_option_id VARCHAR(80)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_name VARCHAR(160)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_desc TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS model_id_requested VARCHAR(120)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS model_name_requested VARCHAR(120)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight_capacity_requested NUMERIC(10,2)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS dimensions_requested VARCHAR(120)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS body_type_requested VARCHAR(60)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_tag VARCHAR(30)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_area VARCHAR(160)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(120)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_state VARCHAR(120)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_pincode VARCHAR(20)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_landmark VARCHAR(200)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_latitude NUMERIC(10,7)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_longitude NUMERIC(10,7)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS drop_latitude NUMERIC(10,7)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS drop_longitude NUMERIC(10,7)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(10,7)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(10,7)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS schedule_time VARCHAR(10)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS instructions_json JSONB`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_json JSONB`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_meta JSONB`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB`
];

let schemaInitPromise = null;
const tableColumnsCache = new Map();
const TABLE_CACHE_TTL_MS = 2 * 60 * 1000;

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toJsonOrNull = (value) => {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return null;
  }
};

const compactAddressText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const toPositiveIntOrNull = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const buildDeliveryNotes = (instructions) => {
  if (!instructions || typeof instructions !== 'object') return null;
  const chunks = [
    instructions.quick ? `Quick: ${instructions.quick}` : null,
    instructions.custom ? `Note: ${instructions.custom}` : null,
    instructions.voiceUrl ? `Voice: ${instructions.voiceUrl}` : null,
  ].filter(Boolean);
  return chunks.length ? chunks.join(' | ') : null;
};

const addColumnValue = (columns, values, dbColumns, columnName, value, options = {}) => {
  const { allowNull = true } = options;
  if (!dbColumns.has(columnName)) return;
  if (value === undefined) return;
  if (value === null && !allowNull) return;
  columns.push(columnName);
  values.push(value);
};

const getTableColumns = async (client, tableName) => {
  const now = Date.now();
  const cached = tableColumnsCache.get(tableName);
  if (cached && now - cached.ts < TABLE_CACHE_TTL_MS) {
    return cached.columns;
  }

  try {
    const { rows } = await client.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );

    const columns = new Set(rows.map((r) => r.column_name));
    tableColumnsCache.set(tableName, { ts: now, columns });
    return columns;
  } catch (schemaReadErr) {
    console.warn(`[orderController] Could not read columns for ${tableName}:`, schemaReadErr.message);
    const fallback = tableName === 'orders'
      ? new Set([
          'user_id', 'quantity', 'status', 'order_amount', 'discount_amount',
          'tax_amount', 'final_amount', 'delivery_address_id', 'delivery_notes',
          'product_id', 'vendor_id'
        ])
      : new Set(['user_id', 'tag', 'address_text', 'is_default']);
    tableColumnsCache.set(tableName, { ts: now, columns: fallback });
    return fallback;
  }
};

const ensureOrderSchema = async (client) => {
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      try {
        for (const sql of ORDER_SCHEMA_PATCHES) {
          await client.query(sql);
        }
      } catch (e) {
        console.warn('[orderController] Schema patch warning:', e.message);
      }
    })();
  }

  await schemaInitPromise;
};

// POST /api/orders
const createOrder = asyncHandler(async (req, res) => {
  const {
    items,
    total_amount,
    delivery_address,
    delivery_address_details,
    customer_name,
    customer_phone,
    vehicle,
    delivery_fee,
    delivery_distance_km,
    delivery_pricing,
    tip,
    schedule,
    instructions,
    gst,
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return err(res, 'Order items are required', 400);
  }
  if (!total_amount || isNaN(total_amount)) {
    return err(res, 'total_amount is required', 400);
  }

  const userId = req.user.userId;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensureOrderSchema(client);

    const addressColumns = await getTableColumns(client, 'addresses');
    const orderColumns = await getTableColumns(client, 'orders');
    const deliveryFeeFromClient = toNumberOrNull(delivery_fee) ?? 0;
    const deliveryDistanceFromClient = toNumberOrNull(delivery_distance_km);
    const deliveryPricingFromClient = delivery_pricing || null;
    const tipAmount = toNumberOrNull(tip) ?? 0;
    const selectedVehicleType = String(vehicle?.type || '').toLowerCase();
    const selectedOptionPremium = Math.max(
      0,
      toNumberOrNull(vehicle?.option_premium)
        ?? Math.max(
          0,
          (toNumberOrNull(vehicle?.option_fee) ?? 0) - (toNumberOrNull(vehicle?.base_fare) ?? 0)
        )
    );
    const pricingCache = new Map();

    const getVehiclePricingRow = async (vehicleType) => {
      if (!vehicleType) return null;
      const normalizedType = String(vehicleType).toLowerCase();
      if (pricingCache.has(normalizedType)) return pricingCache.get(normalizedType);

      const { rows } = await client.query(
        `SELECT vehicle_type, base_fare, rate_per_km, min_km
         FROM vehicle_pricing
         WHERE LOWER(vehicle_type) = $1 AND is_active = true
         LIMIT 1`,
        [normalizedType]
      );
      const row = rows[0] || null;
      pricingCache.set(normalizedType, row);
      return row;
    };

    // Address resolution: if text passed, create/use default address row
    let deliveryAddressId = null;
    if (delivery_address && String(delivery_address).trim()) {
      const addrCols = [];
      const addrVals = [];
      const addressText = compactAddressText(delivery_address);

      addColumnValue(addrCols, addrVals, addressColumns, 'user_id', userId, { allowNull: false });
      addColumnValue(addrCols, addrVals, addressColumns, 'tag', delivery_address_details?.tag || 'other');
      addColumnValue(addrCols, addrVals, addressColumns, 'address_text', addressText, { allowNull: false });
      addColumnValue(addrCols, addrVals, addressColumns, 'is_default', false);
      addColumnValue(addrCols, addrVals, addressColumns, 'lat', toNumberOrNull(delivery_address_details?.lat));
      addColumnValue(addrCols, addrVals, addressColumns, 'lng', toNumberOrNull(delivery_address_details?.lng));
      addColumnValue(addrCols, addrVals, addressColumns, 'area', delivery_address_details?.area || null);
      addColumnValue(addrCols, addrVals, addressColumns, 'city', delivery_address_details?.city || null);
      addColumnValue(addrCols, addrVals, addressColumns, 'state', delivery_address_details?.state || null);
      addColumnValue(addrCols, addrVals, addressColumns, 'pincode', delivery_address_details?.pincode || null);
      addColumnValue(addrCols, addrVals, addressColumns, 'landmark', delivery_address_details?.landmark || null);

      const addrPlaceholders = addrVals.map((_, idx) => `$${idx + 1}`);
      await client.query('SAVEPOINT sp_address_insert');
      try {
        const addr = await client.query(
          `INSERT INTO addresses (${addrCols.join(', ')})
           VALUES (${addrPlaceholders.join(', ')})
           RETURNING id`,
          addrVals
        );
        deliveryAddressId = addr.rows[0].id;
        await client.query('RELEASE SAVEPOINT sp_address_insert');
      } catch (addressInsertErr) {
        // Address enrichment should not block order creation.
        console.warn('[orderController] Address insert fallback:', addressInsertErr.message);
        await client.query('ROLLBACK TO SAVEPOINT sp_address_insert');
        try {
          const fallbackAddr = await client.query(
            `INSERT INTO addresses (user_id, tag, address_text, is_default)
             VALUES ($1, $2, $3, false)
             RETURNING id`,
            [userId, delivery_address_details?.tag || 'other', addressText]
          );
          deliveryAddressId = fallbackAddr.rows[0].id;
          await client.query('RELEASE SAVEPOINT sp_address_insert');
        } catch (fallbackAddressErr) {
          console.warn('[orderController] Address fallback skipped:', fallbackAddressErr.message);
          await client.query('ROLLBACK TO SAVEPOINT sp_address_insert');
          await client.query('RELEASE SAVEPOINT sp_address_insert');
          deliveryAddressId = null;
        }
      }
    }

    const createdOrders = [];
    const commonMeta = {
      vehicle: vehicle || null,
      schedule: schedule || null,
      instructions: instructions || null,
      gst: gst || null,
      delivery_address_details: delivery_address_details || null,
      delivery_distance_km: deliveryDistanceFromClient,
      delivery_pricing: deliveryPricingFromClient,
    };

    for (const [itemIndex, item] of items.entries()) {
      const productId = item?.id || null;
      const vendorId = item?.vendor_id || null;
      const safeProductId = toPositiveIntOrNull(productId);
      const safeVendorId = toPositiveIntOrNull(vendorId);
      const quantity = Math.max(1, Number(item?.qty || 1));
      const itemPrice = Number(item?.price || 0);
      const orderAmount = Number.isFinite(itemPrice) && itemPrice > 0
        ? itemPrice * quantity
        : Number(total_amount) / items.length;

      const discountAmount = 0;
      const taxAmount = 0;
      const finalAmount = orderAmount;

      const dropLat = toNumberOrNull(delivery_address_details?.lat ?? item?.dest_lat);
      const dropLng = toNumberOrNull(delivery_address_details?.lng ?? item?.dest_lng);
      let pickupLat = toNumberOrNull(item?.vendor_lat);
      let pickupLng = toNumberOrNull(item?.vendor_lng);
      if ((pickupLat == null || pickupLng == null) && safeVendorId) {
        const { rows: vendorRows } = await client.query(
          `SELECT v.shop_latitude, v.shop_longitude, vp.business_latitude, vp.business_longitude
           FROM vendor_profiles vp 
           FULL JOIN vendors v ON v.id = vp.id 
           WHERE COALESCE(v.id, vp.id) = $1 LIMIT 1`,
          [safeVendorId]
        );
        if (vendorRows.length > 0) {
          pickupLat = pickupLat ?? toNumberOrNull(vendorRows[0].shop_latitude) ?? toNumberOrNull(vendorRows[0].business_latitude);
          pickupLng = pickupLng ?? toNumberOrNull(vendorRows[0].shop_longitude) ?? toNumberOrNull(vendorRows[0].business_longitude);
        }
      }
      const requestedWeight = toNumberOrNull(String(vehicle?.option_name || '').replace(/[^0-9.]/g, ''));
      let computedDeliveryFee = deliveryFeeFromClient;
      let computedDistanceKm = deliveryDistanceFromClient;
      let computedDeliveryPricing = deliveryPricingFromClient;

      if (selectedVehicleType && pickupLat != null && pickupLng != null && dropLat != null && dropLng != null) {
        try {
          const pricingRow = await getVehiclePricingRow(selectedVehicleType);
          if (pricingRow) {
            const baseFare = Number(pricingRow.base_fare);
            const ratePerKm = Number(pricingRow.rate_per_km);
            const minKm = Number(pricingRow.min_km || 0);
            const distanceKm = await getDistanceKm(pickupLat, pickupLng, dropLat, dropLng);
            const extraKm = Math.max(0, distanceKm - minKm);
            const baseDistanceCharge = Number((baseFare + (ratePerKm * extraKm)).toFixed(2));
            computedDeliveryFee = Number((baseDistanceCharge + selectedOptionPremium).toFixed(2));
            computedDistanceKm = Number(distanceKm.toFixed(2));
            computedDeliveryPricing = {
              vehicle_type: selectedVehicleType,
              base_fare: baseFare,
              rate_per_km: ratePerKm,
              min_km: minKm,
              extra_km: Number(extraKm.toFixed(2)),
              distance_km: computedDistanceKm,
              option_premium: selectedOptionPremium,
              delivery_charge: computedDeliveryFee,
            };
          }
        } catch (pricingErr) {
          console.warn('[orderController] Delivery pricing fallback:', pricingErr.message);
        }
      }

      const dbCols = [];
      const dbVals = [];

      addColumnValue(dbCols, dbVals, orderColumns, 'user_id', userId, { allowNull: false });
      addColumnValue(dbCols, dbVals, orderColumns, 'product_id', safeProductId);
      addColumnValue(dbCols, dbVals, orderColumns, 'vendor_id', safeVendorId);
      addColumnValue(dbCols, dbVals, orderColumns, 'quantity', quantity, { allowNull: false });
      addColumnValue(dbCols, dbVals, orderColumns, 'status', 'pending', { allowNull: false });
      addColumnValue(dbCols, dbVals, orderColumns, 'order_amount', orderAmount, { allowNull: false });
      addColumnValue(dbCols, dbVals, orderColumns, 'discount_amount', discountAmount);
      addColumnValue(dbCols, dbVals, orderColumns, 'tax_amount', taxAmount);
      addColumnValue(dbCols, dbVals, orderColumns, 'final_amount', finalAmount, { allowNull: false });
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_address_id', deliveryAddressId);

      addColumnValue(dbCols, dbVals, orderColumns, 'customer_name', customer_name || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'customer_phone', customer_phone || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'client_id', String(userId));
      addColumnValue(dbCols, dbVals, orderColumns, 'client_name', customer_name || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'client_phone', customer_phone || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'vendor_shop_name', item?.shop_name || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'pickup_address', item?.shop_name || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_address', compactAddressText(delivery_address || ''));
      addColumnValue(dbCols, dbVals, orderColumns, 'vehicle_type', vehicle?.type || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'vehicle_option_id', vehicle?.option_id || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'vehicle_name', vehicle?.name || vehicle?.option_name || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'vehicle_desc', vehicle?.option_desc || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'model_id_requested', vehicle?.option_id || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'model_name_requested', vehicle?.option_name || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'weight_capacity_requested', requestedWeight);
      addColumnValue(dbCols, dbVals, orderColumns, 'dimensions_requested', vehicle?.option_desc || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'body_type_requested', vehicle?.type === '2w' ? 'Open' : null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_fee', computedDeliveryFee);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_distance_km', computedDistanceKm);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_pricing_json', toJsonOrNull(computedDeliveryPricing));
      addColumnValue(dbCols, dbVals, orderColumns, 'tip_amount', tipAmount);
      addColumnValue(dbCols, dbVals, orderColumns, 'items_total', orderAmount);
      addColumnValue(dbCols, dbVals, orderColumns, 'final_total', finalAmount + computedDeliveryFee + tipAmount);
      addColumnValue(dbCols, dbVals, orderColumns, 'order_type', 'delivery');
      addColumnValue(dbCols, dbVals, orderColumns, 'address_tag', delivery_address_details?.tag || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_area', delivery_address_details?.area || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_city', delivery_address_details?.city || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_state', delivery_address_details?.state || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_pincode', delivery_address_details?.pincode || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_landmark', delivery_address_details?.landmark || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'pickup_latitude', pickupLat);
      addColumnValue(dbCols, dbVals, orderColumns, 'pickup_longitude', pickupLng);
      addColumnValue(dbCols, dbVals, orderColumns, 'drop_latitude', dropLat);
      addColumnValue(dbCols, dbVals, orderColumns, 'drop_longitude', dropLng);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_latitude', dropLat);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_longitude', dropLng);
      addColumnValue(dbCols, dbVals, orderColumns, 'scheduled_delivery_date', schedule?.date || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'schedule_time', schedule?.time || null);
      addColumnValue(dbCols, dbVals, orderColumns, 'delivery_notes', buildDeliveryNotes(instructions));
      addColumnValue(dbCols, dbVals, orderColumns, 'instructions_json', toJsonOrNull(instructions));
      addColumnValue(dbCols, dbVals, orderColumns, 'gst_json', toJsonOrNull(gst));
      addColumnValue(dbCols, dbVals, orderColumns, 'items', [
        {
          id: item?.id || null,
          name: item?.name || null,
          qty: quantity,
          price: itemPrice,
        }
      ] ? toJsonOrNull([
        {
          id: item?.id || null,
          name: item?.name || null,
          qty: quantity,
          price: itemPrice,
        }
      ]) : null);
      addColumnValue(
        dbCols,
        dbVals,
        orderColumns,
        'order_meta',
        toJsonOrNull({
          ...commonMeta,
          delivery_calculation: {
            fee: computedDeliveryFee,
            distance_km: computedDistanceKm,
            pricing: computedDeliveryPricing,
          },
          cart_item: {
            id: item?.id || null,
            name: item?.name || null,
            qty: quantity,
            unit_price: itemPrice,
            vendor_lat: pickupLat,
            vendor_lng: pickupLng,
            dest_lat: dropLat,
            dest_lng: dropLng,
            shop_name: item?.shop_name || null,
          },
        })
      );

      const dbPlaceholders = dbVals.map((_, idx) => `$${idx + 1}`);
      let inserted;
      const savepointName = `sp_order_insert_${itemIndex + 1}`;
      await client.query(`SAVEPOINT ${savepointName}`);
      try {
        inserted = await client.query(
          `INSERT INTO orders (${dbCols.join(', ')})
           VALUES (${dbPlaceholders.join(', ')})
           RETURNING *`,
          dbVals
        );
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      } catch (fullInsertErr) {
        console.warn('[orderController] Full insert fallback:', fullInsertErr.message);
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        const minimalCols = [];
        const minimalVals = [];

        addColumnValue(minimalCols, minimalVals, orderColumns, 'user_id', userId, { allowNull: false });
        addColumnValue(minimalCols, minimalVals, orderColumns, 'quantity', quantity, { allowNull: false });
        addColumnValue(minimalCols, minimalVals, orderColumns, 'status', 'pending', { allowNull: false });
        addColumnValue(minimalCols, minimalVals, orderColumns, 'order_amount', orderAmount, { allowNull: false });
        addColumnValue(minimalCols, minimalVals, orderColumns, 'discount_amount', discountAmount);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'tax_amount', taxAmount);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'final_amount', finalAmount, { allowNull: false });
        addColumnValue(minimalCols, minimalVals, orderColumns, 'delivery_address_id', deliveryAddressId);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'delivery_notes', buildDeliveryNotes(instructions));
        addColumnValue(minimalCols, minimalVals, orderColumns, 'customer_name', customer_name || null);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'customer_phone', customer_phone || null);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'delivery_fee', computedDeliveryFee);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'delivery_distance_km', computedDistanceKm);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'tip_amount', tipAmount);
        addColumnValue(minimalCols, minimalVals, orderColumns, 'final_total', finalAmount + computedDeliveryFee + tipAmount);

        const minimalPlaceholders = minimalVals.map((_, idx) => `$${idx + 1}`);
        inserted = await client.query(
          `INSERT INTO orders (${minimalCols.join(', ')})
           VALUES (${minimalPlaceholders.join(', ')})
           RETURNING *`,
          minimalVals
        );
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      }

      createdOrders.push(inserted.rows[0]);
    }

    await client.query('COMMIT');

    const primaryOrder = createdOrders[0];
  return ok(
    res,
    {
      bookingId: primaryOrder.id,
      bookingIds: createdOrders.map((o) => o.id),
      status: primaryOrder.status,
      estimated_eta: null,
      createdCount: createdOrders.length,
    },
    'Order placed successfully',
    201
  );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// GET /api/orders/my
const getMyOrders = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  await ensureOrderSchema(pool);
  const { rows } = await pool.query(
    `SELECT
       o.id,
       o.status,
       COALESCE(
         o.final_total,
         o.final_amount + COALESCE(o.delivery_fee, 0) + COALESCE(o.tip_amount, 0),
         o.order_amount
       ) AS total,
       o.created_at,
       o.quantity,
       p.id AS product_id,
       p.product_name,
       p.image_url,
       p.selling_price
     FROM orders o
     LEFT JOIN products p ON p.id = o.product_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [userId]
  );

  const mapped = rows.map((r) => ({
    id: r.id,
    status: STATUS_LABELS[String(r.status || '').toLowerCase()] || 'Placed',
    total: Number(r.total || 0),
    date: new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    items: r.product_name
      ? [{
          id: r.product_id || r.id,
          name: r.product_name,
          qty: Number(r.quantity || 1),
          img: r.image_url || (Array.isArray(r.images) && r.images[0] ? r.images[0] : null),
          price: r.selling_price ? Number(r.selling_price) : null,
        }]
      : [],
  }));

  return ok(res, mapped);
});

// GET /api/orders/:id
const getOrderById = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const { rows } = await pool.query(
    `SELECT *
     FROM orders
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (!rows.length) return err(res, 'Order not found', 404);
  return ok(res, rows[0]);
});

module.exports = { createOrder, getMyOrders, getOrderById };
