'use strict';

const pool         = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { ok, err }  = require('../utils/response');
const { getDistanceKm } = require('../utils/distanceCalc');

// ─────────────────────────────────────────────────────────────
// GET /api/pricing/delivery
// Query params: vehicle_type, origin_lat, origin_lng, dest_lat, dest_lng
// Returns: { delivery_charge, distance_km, vehicle_type, base_fare, rate_per_km, extra_km }
// ─────────────────────────────────────────────────────────────
const getDeliveryCharge = asyncHandler(async (req, res) => {
  const { vehicle_type, origin_lat, origin_lng, dest_lat, dest_lng } = req.query;

  // ── Validate inputs ──────────────────────────────────────────
  if (!vehicle_type) return err(res, 'vehicle_type is required', 400);
  if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
    return err(res, 'origin_lat, origin_lng, dest_lat, dest_lng are all required', 400);
  }

  const oLat = parseFloat(origin_lat);
  const oLng = parseFloat(origin_lng);
  const dLat = parseFloat(dest_lat);
  const dLng = parseFloat(dest_lng);

  if ([oLat, oLng, dLat, dLng].some(isNaN)) {
    return err(res, 'Coordinates must be valid numbers', 400);
  }

  // ── Fetch pricing from DB ────────────────────────────────────
  const { rows } = await pool.query(
    `SELECT base_fare, rate_per_km, min_km, display_name
     FROM vehicle_pricing
     WHERE vehicle_type = $1 AND is_active = true
     LIMIT 1`,
    [vehicle_type.toLowerCase()]
  );

  if (!rows.length) return err(res, `No pricing found for vehicle type: ${vehicle_type}`, 404);

  const { base_fare, rate_per_km, min_km, display_name } = rows[0];

  // ── Compute distance ─────────────────────────────────────────
  const distance_km = await getDistanceKm(oLat, oLng, dLat, dLng);
  const extra_km    = Math.max(0, distance_km - Number(min_km));

  // ── Apply formula: base_fare + (rate_per_km × extra_km) ───
  const delivery_charge = parseFloat(
    (Number(base_fare) + Number(rate_per_km) * extra_km).toFixed(2)
  );

  return ok(res, {
    vehicle_type,
    display_name,
    distance_km,
    base_fare:      Number(base_fare),
    rate_per_km:    Number(rate_per_km),
    min_km:         Number(min_km),
    extra_km,
    delivery_charge,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/pricing/vehicles
// Returns all active vehicle types and their base pricing
// (used by CheckoutModal to render the vehicle selector)
// ─────────────────────────────────────────────────────────────
const getVehiclePricing = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT vehicle_type, display_name, base_fare, rate_per_km, min_km
     FROM vehicle_pricing
     WHERE is_active = true
     ORDER BY base_fare ASC`
  );
  return ok(res, rows);
});

module.exports = { getDeliveryCharge, getVehiclePricing };
