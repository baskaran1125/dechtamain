// src/controllers/driverController.js
const db = require('../config/database');
const { uploadFile } = require('../services/uploadService');
const { pushNotification } = require('../services/socketService');

let driverVehicleSchemaReadyPromise = null;

async function ensureDriverVehicleCompatibilitySchema() {
  if (!driverVehicleSchemaReadyPromise) {
    driverVehicleSchemaReadyPromise = (async () => {
      try {
        if (await tableExists('driver_vehicles')) {
          await db.query(`ALTER TABLE driver_vehicles ADD COLUMN IF NOT EXISTS model_id VARCHAR(100);`);
          await db.query(`ALTER TABLE driver_vehicles ADD COLUMN IF NOT EXISTS model_name VARCHAR(100);`);
          await db.query(`ALTER TABLE driver_vehicles ADD COLUMN IF NOT EXISTS weight_capacity NUMERIC(10,2);`);
          await db.query(`ALTER TABLE driver_vehicles ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100);`);
          await db.query(`ALTER TABLE driver_vehicles ADD COLUMN IF NOT EXISTS body_type VARCHAR(50);`);
          await db.query(`ALTER TABLE driver_vehicles ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(50);`);
          await db.query(`ALTER TABLE driver_vehicles ADD COLUMN IF NOT EXISTS registration_number VARCHAR(50);`);
        }

        if (await tableExists('vehicles')) {
          await db.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_id VARCHAR(100);`);
          await db.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_name VARCHAR(100);`);
          await db.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS weight_capacity NUMERIC(10,2);`);
          await db.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100);`);
          await db.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS body_type VARCHAR(50);`);
        }
      } catch (error) {
        driverVehicleSchemaReadyPromise = null;
        throw error;
      }
    })();
  }

  return driverVehicleSchemaReadyPromise;
}

async function tableExists(tableName) {
  const result = await db.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return !!result.rows[0]?.table_name;
}

function isSchemaDriftError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('relation') && msg.includes('does not exist')
    || msg.includes('column') && msg.includes('does not exist');
}

async function safeOptionalSelectOne(table, where) {
  try {
    return await db.selectOne(table, where);
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return null;
    }
    throw error;
  }
}

async function safeOptionalSelectMany(table, where, options) {
  try {
    return await db.selectMany(table, where, options);
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return [];
    }
    throw error;
  }
}

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  try {
    const result = await db.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1`,
      [tableName]
    );
    const set = new Set((result.rows || []).map((row) => row.column_name));
    tableColumnsCache.set(tableName, set);
    return set;
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return new Set();
    }
    throw error;
  }
}

function removeUndefinedFields(data) {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([, value]) => value !== undefined)
  );
}

async function filterDataForTable(tableName, data) {
  const cleaned = removeUndefinedFields(data);
  const columns = await getTableColumns(tableName);
  if (!columns || columns.size === 0) {
    return cleaned;
  }
  return Object.fromEntries(
    Object.entries(cleaned).filter(([key]) => columns.has(key))
  );
}

function splitDocUrl(value) {
  if (!value) return [null, null];
  const text = String(value);
  if (!text) return [null, null];
  const parts = text.split(',');
  return [parts[0] || null, parts[1] || null];
}

// ──────────────────────────────────────────────────────────────
// GET /api/driver/profile
// FIX: single JOIN replaces 5 sequential queries; wrapped in try/catch
// ──────────────────────────────────────────────────────────────
async function getProfile(request, reply) {
  try {
    const driverId = request.driver?.id;
    if (!driverId) {
      return reply.code(401).send({ success: false, message: 'Unauthorized' });
    }

    const profile = await db.selectOne('driver_profiles', { id: driverId });
    if (!profile) {
      return reply.code(404).send({ success: false, message: 'Profile not found' });
    }

    const profileUserId = profile.user_id || null;
    const profileUser = profileUserId ? await safeOptionalSelectOne('users', { id: profileUserId }) : null;

    const hasStats = await tableExists('driver_stats');
    const hasLegacyVehicles = await tableExists('driver_vehicles');
    const hasUnifiedVehicles = await tableExists('vehicles');
    const hasLegacyBank = await tableExists('driver_bank_accounts');
    const hasUnifiedBank = await tableExists('bank_accounts');
    const hasLegacyDocs = await tableExists('driver_documentss');
    const hasUnifiedDocs = await tableExists('user_documents');
    const hasWallet = await tableExists('driver_wallets');

    const stats = hasStats ? await safeOptionalSelectOne('driver_stats', { driver_id: driverId }) : null;

    let vehicle = null;
    if (hasLegacyVehicles) {
      vehicle = await safeOptionalSelectOne('driver_vehicles', { driver_id: driverId });
    } else if (hasUnifiedVehicles) {
      vehicle = await safeOptionalSelectOne('vehicles', { driver_id: driverId });
    }

    let bank = null;
    if (hasLegacyBank) {
      bank = await safeOptionalSelectOne('driver_bank_accounts', { driver_id: driverId });
    } else if (hasUnifiedBank && profileUserId) {
      bank = await safeOptionalSelectOne('bank_accounts', { user_id: profileUserId });
    }

    let docs = null;
    if (hasLegacyDocs) {
      docs = await safeOptionalSelectOne('driver_documentss', { driver_id: driverId });
    }

    let docsFromUnified = null;
    if (!docs && hasUnifiedDocs && profileUserId) {
      const records = await safeOptionalSelectMany('user_documents', { user_id: profileUserId });
      const pick = (type) => (records || []).find((r) => r.document_type === type);
      docsFromUnified = {
        aadhar: pick('aadhar'),
        pan: pick('pan'),
        license: pick('license'),
        rc: pick('rc'),
      };
    }

    const wallet = hasWallet ? await safeOptionalSelectOne('driver_wallets', { driver_id: driverId }) : null;
    const [aadharFront, aadharBack] = splitDocUrl(docs?.aadhar_url);
    const [panFront, panBack] = splitDocUrl(docs?.pan_url);
    const [licenseFront, licenseBack] = splitDocUrl(docs?.license_url);
    const [rcFront, rcBack] = splitDocUrl(docs?.rc_url);
    const verificationStatus =
      docs?.verification_status ||
      docsFromUnified?.aadhar?.status ||
      docsFromUnified?.pan?.status ||
      docsFromUnified?.license?.status ||
      docsFromUnified?.rc?.status ||
      null;
    const userStatus = String(profileUser?.status || '').toLowerCase();
    const userVerification = String(profileUser?.verification_status || '').toLowerCase();
    const userRejected = userStatus === 'suspended' || userStatus === 'banned' || userVerification === 'rejected';
    const effectiveApproved = !userRejected && (
      !!profile.is_approved ||
      !!profileUser?.is_approved ||
      userVerification === 'verified'
    );

    // Shape the response — profile screen expects these separate objects
    return reply.send({
      success: true,
      data: {
        profile: {
          id:                profile.id,
          mobile_number:     profile.mobile_number || profile.phone_number || null,
          driver_id:         profile.driver_id,
          full_name:         profile.full_name,
          dob:               profile.date_of_birth,
          blood_group:       profile.blood_group,
          tshirt_size:       null,
          emergency_contact: profile.emergency_contact,
          preferred_zone:    profile.preferred_zone,
          avatar_url:        profile.avatar_url,
          referral_code:     profile.referral_code,
          is_approved:       effectiveApproved,
          is_online:         profile.is_online,
          is_registered:     profile.is_registered,
          status:            profile.is_online ? 'online' : 'offline',
          is_pilot_this_week: profile.is_pilot_this_week || false,
        },
        stats: {
          total_earnings:          parseFloat(stats?.total_earnings || 0),
          total_orders_completed:  parseInt(stats?.total_orders_completed || 0, 10),
          weekly_orders_completed: parseInt(stats?.weekly_orders_completed || 0, 10),
          weekly_earnings:         parseFloat(stats?.weekly_earnings || 0),
          weekly_login_minutes:    parseInt(stats?.weekly_login_minutes || 0, 10),
          weekly_completion_score: parseFloat(stats?.weekly_completion_score || 0),
          rating:                  parseFloat(stats?.rating || 5.0),
        },
        vehicle: vehicle ? {
          vehicle_type:        vehicle.vehicle_type,
          model_id:            vehicle.model_id,
          model_name:          vehicle.model_name,
          weight_capacity:     vehicle.weight_capacity,
          dimensions:          vehicle.dimensions,
          body_type:           vehicle.body_type,
          registration_number: vehicle.registration_number || vehicle.vehicle_number,
          is_verified:         vehicle.vehicle_verified || vehicle.is_active,
        } : null,
        bank: bank ? {
          account_holder_name: bank.account_holder_name,
          account_number:      bank.account_number,
          ifsc_code:           bank.ifsc_code,
          bank_branch:         bank.bank_branch,
          upi_id:              bank.upi_id,
          is_verified:         bank.bank_verified || bank.is_verified,
        } : null,
        documents: {
          aadhar_front_url:              aadharFront || docsFromUnified?.aadhar?.front_url || null,
          aadhar_back_url:               aadharBack || docsFromUnified?.aadhar?.back_url || null,
          aadhar_status:                 docs?.verification_status || docsFromUnified?.aadhar?.status || null,
          pan_front_url:                 panFront || docsFromUnified?.pan?.front_url || null,
          pan_back_url:                  panBack || docsFromUnified?.pan?.back_url || null,
          pan_status:                    docs?.verification_status || docsFromUnified?.pan?.status || null,
          license_front_url:             licenseFront || docsFromUnified?.license?.front_url || null,
          license_back_url:              licenseBack || docsFromUnified?.license?.back_url || null,
          license_status:                docs?.verification_status || docsFromUnified?.license?.status || null,
          rc_front_url:                  rcFront || docsFromUnified?.rc?.front_url || null,
          rc_back_url:                   rcBack || docsFromUnified?.rc?.back_url || null,
          rc_status:                     docs?.verification_status || docsFromUnified?.rc?.status || null,
          verification_status:           verificationStatus,
          verification_rejection_reason: null,
          kyc_complete:                  verificationStatus === 'verified',
        },
        wallet: {
          balance:          parseFloat(wallet?.balance || 0),
          outstanding_dues: parseFloat(wallet?.outstanding_dues || 0),
          today_earnings:   parseFloat(wallet?.today_earnings || 0),
        },
      },
    });
  } catch (error) {
    request.log.error(error);
    if (isSchemaDriftError(error)) {
      return reply.send({
        success: true,
        data: {
          profile: null,
          stats: {
            total_earnings: 0,
            total_orders_completed: 0,
            weekly_orders_completed: 0,
            weekly_earnings: 0,
            weekly_login_minutes: 0,
            weekly_completion_score: 0,
            rating: 5,
          },
          vehicle: null,
          bank: null,
          documents: {
            aadhar_front_url: null,
            aadhar_back_url: null,
            aadhar_status: null,
            pan_front_url: null,
            pan_back_url: null,
            pan_status: null,
            license_front_url: null,
            license_back_url: null,
            license_status: null,
            rc_front_url: null,
            rc_back_url: null,
            rc_status: null,
            verification_status: null,
            verification_rejection_reason: null,
            kyc_complete: false,
          },
          wallet: {
            balance: 0,
            outstanding_dues: 0,
            today_earnings: 0,
          },
        },
      });
    }
    // Fail-soft to keep app usable even if one optional data branch breaks.
    return reply.send({
      success: true,
      data: {
        profile: {
          id: request.driver?.id || null,
          mobile_number: request.driver?.mobile_number || request.driver?.phone_number || null,
          driver_id: request.driver?.driver_id || null,
          full_name: request.driver?.full_name || null,
          dob: request.driver?.date_of_birth || null,
          blood_group: request.driver?.blood_group || null,
          tshirt_size: null,
          emergency_contact: request.driver?.emergency_contact || null,
          preferred_zone: request.driver?.preferred_zone || null,
          avatar_url: request.driver?.avatar_url || null,
          referral_code: request.driver?.referral_code || null,
          is_approved: request.driver?.is_approved || false,
          is_online: request.driver?.is_online || false,
          is_registered: request.driver?.is_registered || false,
          status: request.driver?.is_online ? 'online' : 'offline',
          is_pilot_this_week: request.driver?.is_pilot_this_week || false,
        },
        stats: {
          total_earnings: 0,
          total_orders_completed: 0,
          weekly_orders_completed: 0,
          weekly_earnings: 0,
          weekly_login_minutes: 0,
          weekly_completion_score: 0,
          rating: 5,
        },
        vehicle: null,
        bank: null,
        documents: {
          aadhar_front_url: null,
          aadhar_back_url: null,
          aadhar_status: null,
          pan_front_url: null,
          pan_back_url: null,
          pan_status: null,
          license_front_url: null,
          license_back_url: null,
          license_status: null,
          rc_front_url: null,
          rc_back_url: null,
          rc_status: null,
          verification_status: null,
          verification_rejection_reason: null,
          kyc_complete: false,
        },
        wallet: {
          balance: 0,
          outstanding_dues: 0,
          today_earnings: 0,
        },
      },
    });
  }
}

// ──────────────────────────────────────────────────────────────
// PUT /api/driver/profile
// ──────────────────────────────────────────────────────────────
async function updateProfile(request, reply) {
  const driverId = request.driver.id;
  const { fullName, dob, bloodGroup, tshirtSize, preferredZone, emergencyContact } = request.body;

  const updates = {};
  if (fullName)         updates.full_name         = fullName;
  if (dob)              updates.date_of_birth     = dob;
  if (bloodGroup)       updates.blood_group       = bloodGroup;
  if (preferredZone)    updates.preferred_zone    = preferredZone;
  if (emergencyContact) updates.emergency_contact = emergencyContact;

  if (Object.keys(updates).length === 0) {
    return reply.code(400).send({ success: false, message: 'No fields to update' });
  }

  try {
    const result = await db.update('driver_profiles', updates, { id: driverId });
    if (!result.length) {
      return reply.code(500).send({ success: false, message: 'Failed to update profile' });
    }
    return reply.send({ success: true, data: result[0] });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to update profile' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/driver/register
// ──────────────────────────────────────────────────────────────
async function completeRegistration(request, reply) {
  const driverId = request.driver.id;
  const driverUserId = request.driver.user_id || null;
  const {
    fullName, dob, emergencyContact, bloodGroup, tshirtSize, preferredZone,
    vehicleType, specificModelId, vehicleModelName, vehicleWeight,
    vehicleDimensions, bodyType, vehicleNumber,
    accountHolder, bankAccount, ifscCode, bankBranch, referralCode,
  } = request.body;

  const missingFields = [];
  if (!fullName)        missingFields.push('fullName');
  if (!vehicleType)     missingFields.push('vehicleType');
  if (!vehicleNumber)   missingFields.push('vehicleNumber');
  if (!bankAccount)     missingFields.push('bankAccount');
  if (!ifscCode)        missingFields.push('ifscCode');
  if (!accountHolder)   missingFields.push('accountHolder');

  if (missingFields.length > 0) {
    return reply.code(400).send({
      success: false,
      message: `Required fields missing: ${missingFields.join(', ')}`,
      missingFields,
    });
  }

  try {
    await ensureDriverVehicleCompatibilitySchema();

    let finalDob = dob || null;
    if (finalDob && (finalDob.includes('----') || finalDob.includes('--') || finalDob === '')) {
      finalDob = null;
    }

    // 1. Update driver profile
    await db.update(
      'driver_profiles',
      {
        full_name:         fullName,
        date_of_birth:     finalDob,
        emergency_contact: emergencyContact || null,
        blood_group:       bloodGroup || null,
        preferred_zone:    preferredZone || null,
        is_registered:     true,
      },
      { id: driverId }
    );

    await db.update(
      'users',
      { profile_complete: true },
      { id: request.driver.user_id }
    ).catch(() => {});

    // 2. Upsert vehicle
    const vehicleData = {
      driver_id:           driverId,
      vehicle_type:        vehicleType,
      model_id:            specificModelId   || null,
      model_name:          vehicleModelName  || null,
      weight_capacity:     vehicleWeight ? parseFloat(vehicleWeight) || null : null,
      dimensions:          vehicleDimensions || null,
      body_type:           bodyType          || null,
      vehicle_number:      vehicleNumber.toUpperCase(),
      registration_number: vehicleNumber.toUpperCase(),
      is_active:           true,
    };

    if (await tableExists('driver_vehicles')) {
      const existingVehicle = await db.selectOne('driver_vehicles', { driver_id: driverId });
      if (existingVehicle) {
        await db.update('driver_vehicles', vehicleData, { driver_id: driverId });
      } else {
        await db.insert('driver_vehicles', vehicleData);
      }
    }

    // Unified schema write
    if (await tableExists('vehicles')) {
      const unifiedVehicleData = await filterDataForTable('vehicles', {
        driver_id:            driverId,
        vehicle_type:         vehicleType,
        vehicle_number:       vehicleNumber.toUpperCase(),
        license_plate:        vehicleNumber.toUpperCase(),
        registration_number:  vehicleNumber.toUpperCase(),
        model_id:             specificModelId   || null,
        model_name:           vehicleModelName  || null,
        weight_capacity:      vehicleWeight ? parseFloat(vehicleWeight) || null : null,
        dimensions:           vehicleDimensions || null,
        body_type:            bodyType          || null,
        status:               'active',
      });
      const existingUnifiedVehicle = await safeOptionalSelectOne('vehicles', { driver_id: driverId });
      if (existingUnifiedVehicle) {
        const { driver_id: _, ...unifiedUpdateData } = unifiedVehicleData;
        if (Object.keys(unifiedUpdateData).length > 0) {
          await db.update('vehicles', unifiedUpdateData, { driver_id: driverId });
        }
      } else if (Object.keys(unifiedVehicleData).length > 0) {
        await db.insert('vehicles', unifiedVehicleData);
      }
    }

    // 3. Upsert bank
    const bankData = {
      driver_id:           driverId,
      account_holder_name: accountHolder,
      account_number:      bankAccount,
      ifsc_code:           ifscCode.toUpperCase(),
      is_verified:         false,
    };

    if (await tableExists('driver_bank_accounts')) {
      const existingBank = await db.selectOne('driver_bank_accounts', { driver_id: driverId });
      if (existingBank) {
        await db.update('driver_bank_accounts', bankData, { driver_id: driverId });
      } else {
        await db.insert('driver_bank_accounts', bankData);
      }
    }

    // Unified schema write
    if (driverUserId && (await tableExists('bank_accounts'))) {
      const unifiedBankData = {
        user_id:              driverUserId,
        account_holder_name:  accountHolder,
        account_number:       bankAccount,
        ifsc_code:            ifscCode.toUpperCase(),
        bank_branch:          bankBranch || null,
        upi_id:               null,
        is_verified:          false,
      };
      const existingUnifiedBank = await safeOptionalSelectOne('bank_accounts', { user_id: driverUserId });
      if (existingUnifiedBank) {
        await db.update('bank_accounts', {
          account_holder_name: unifiedBankData.account_holder_name,
          account_number: unifiedBankData.account_number,
          ifsc_code: unifiedBankData.ifsc_code,
          bank_branch: unifiedBankData.bank_branch,
          upi_id: unifiedBankData.upi_id,
        }, { user_id: driverUserId });
      } else {
        await db.insert('bank_accounts', unifiedBankData);
      }
    }

    // 4. Handle referral
    if (referralCode && (await tableExists('driver_referrals'))) {
      const referrer = await db.selectOne('driver_profiles', { referral_code: referralCode.toUpperCase() });
      if (referrer && referrer.id !== driverId) {
        const existing = await db.selectOne('driver_referrals', {
          referrer_id: referrer.id,
          referred_id: driverId,
        });
        if (!existing) {
          await db.insert('driver_referrals', {
            referrer_id: referrer.id,
            referred_id: driverId,
            bonus_paid:  false,
          }).catch(() => {}); // non-fatal
        }
      }
    }

    // 5. Sync name+avatar into driver_stats for leaderboard
    if (await tableExists('driver_stats')) {
      await db.update(
        'driver_stats',
        { driver_name: fullName },
        { driver_id: driverId }
      ).catch(() => {});
    }

    const updatedDriver = await db.selectOne('driver_profiles', { id: driverId });

    return reply.send({
      success: true,
      message: 'Registration completed successfully',
      driver:  updatedDriver,
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Registration failed. Please try again.' });
  }
}

// ──────────────────────────────────────────────────────────────
// PUT /api/driver/online-status
// ──────────────────────────────────────────────────────────────
async function updateOnlineStatus(request, reply) {
  const driverId = request.driver.id;
  const { isOnline } = request.body;

  try {
    await db.update(
      'driver_profiles',
      {
        is_online: isOnline,
      },
      { id: driverId }
    );

    return reply.send({
      success:  true,
      isOnline,
      message:  isOnline ? 'You are now online' : 'You are now offline',
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to update online status' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/driver/gps
// ──────────────────────────────────────────────────────────────
async function updateGpsLocation(request, reply) {
  const driverId = request.driver.id;
  const driverUserId = request.driver.user_id || null;
  const { tripId, latitude, longitude, accuracy, speed, heading } = request.body;
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return reply.code(400).send({ success: false, message: 'Valid latitude and longitude are required' });
  }

  try {
    await db.insert('driver_gps_locations', {
      driver_id:   driverId,
      trip_id:     tripId || null,
      latitude:    lat,
      longitude:   lng,
      accuracy:    accuracy || null,
      speed:       speed    || null,
      heading:     heading  || null,
      recorded_at: new Date().toISOString(),
    });

    if (await tableExists('driver_profiles')) {
      const profileColumns = await getTableColumns('driver_profiles');
      const gpsUpdates = {};
      if (profileColumns.has('current_latitude')) gpsUpdates.current_latitude = lat;
      if (profileColumns.has('current_longitude')) gpsUpdates.current_longitude = lng;
      if (profileColumns.has('last_location_at')) gpsUpdates.last_location_at = new Date().toISOString();
      if (Object.keys(gpsUpdates).length > 0) {
        await db.update('driver_profiles', gpsUpdates, { id: driverId }).catch(() => {});
      }
    }

    if (await tableExists('location_updates')) {
      try {
        const locationColumns = await getTableColumns('location_updates');
        const hasUnifiedUserId = locationColumns.has('user_id');
        const resolvedEntityId = Number(driverUserId || driverId);

        if (hasUnifiedUserId) {
          await db.query(
            `DELETE FROM location_updates
              WHERE entity_type = $1
                AND user_id = $2`,
            ['driver', resolvedEntityId]
          ).catch(() => {});

          const unifiedLocationData = await filterDataForTable('location_updates', {
            user_id:    resolvedEntityId,
            entity_type:'driver',
            latitude:   lat,
            longitude:  lng,
            heading:    heading || 0,
            speed:      speed || 0,
            updated_at: new Date().toISOString(),
          });

          if (Object.keys(unifiedLocationData).length > 0) {
            await db.insert('location_updates', unifiedLocationData).catch(() => {});
          }
        } else {
          await db.query(
            `DELETE FROM location_updates
              WHERE entity_type = $1
                AND entity_id = $2`,
            ['driver', String(driverId)]
          ).catch(() => {});

          const legacyLocationData = await filterDataForTable('location_updates', {
            entity_type: 'driver',
            entity_id:   String(driverId),
            latitude:    lat,
            longitude:   lng,
            heading:     heading || 0,
            speed:       speed || 0,
            updated_at:  new Date().toISOString(),
          });

          if (Object.keys(legacyLocationData).length > 0) {
            await db.insert('location_updates', legacyLocationData).catch(() => {});
          }
        }
      } catch (locationErr) {
        request.log.warn({ err: locationErr }, 'Failed to mirror GPS into location_updates');
      }
    }

    return reply.send({ success: true });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to record GPS' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/driver/upload-avatar
// ──────────────────────────────────────────────────────────────
async function uploadAvatar(request, reply) {
  const driverId = request.driver.id;

  try {
    const data   = await request.file();
    const buffer = await data.toBuffer();

    const result = await uploadFile({
      bucket:   process.env.STORAGE_BUCKET_AVATARS || 'driver-avatars',
      folder:   driverId,
      filename: data.filename,
      buffer,
      mimetype: data.mimetype,
    });

    await db.update('driver_profiles', { avatar_url: result.publicUrl }, { id: driverId });
    // Keep leaderboard denormalized copy in sync when legacy stats table exists
    if (await tableExists('driver_stats')) {
      await db.update('driver_stats', { avatar_url: result.publicUrl }, { driver_id: driverId }).catch(() => {});
    }

    return reply.send({ success: true, avatarUrl: result.publicUrl });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: 'Failed to upload avatar' });
  }
}

// ──────────────────────────────────────────────────────────────
// POST /api/driver/upload-document
// ──────────────────────────────────────────────────────────────
async function uploadDocument(request, reply) {
  const driverId = request.driver.id;

  try {
    const parts = request.parts();
    const uploadedPaths = [];
    const uploadedUrls  = [];
    let docType = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        const result = await uploadFile({
          bucket:   process.env.STORAGE_BUCKET_DOCUMENTS || 'driver-documents',
          folder:   `${driverId}/${part.fieldname}`,
          filename: part.filename,
          buffer,
          mimetype: part.mimetype,
        });
        uploadedPaths.push(result.path);
        uploadedUrls.push(result.publicUrl);
      } else if (part.fieldname === 'docType') {
        docType = part.value;
      }
    }

    const fieldMap = { aadhar: 'aadhar_url', pan: 'pan_url', license: 'license_url', rc: 'rc_url' };
    if (!fieldMap[docType]) {
      return reply.code(400).send({ success: false, message: `Invalid docType: ${docType}` });
    }

    const finalPath = uploadedPaths.join(',');

    const hasLegacyDocs = await tableExists('driver_documentss');
    const hasUnifiedDocs = await tableExists('user_documents');

    if (hasLegacyDocs) {
      const existingDoc = await db.selectOne('driver_documentss', { driver_id: driverId });
      if (existingDoc) {
        await db.update('driver_documentss', { [fieldMap[docType]]: finalPath, verification_status: 'pending' }, { driver_id: driverId });
      } else {
        await db.insert('driver_documentss', { driver_id: driverId, [fieldMap[docType]]: finalPath, verification_status: 'pending' });
      }
    } else if (hasUnifiedDocs) {
      const userId = request.driver.user_id;
      const existing = await db.selectOne('user_documents', { user_id: userId, document_type: docType });
      const docPayload = {
        user_id: userId,
        document_type: docType,
        document_url: uploadedUrls.join(','),
        front_url: uploadedUrls[0] || null,
        back_url: uploadedUrls[1] || null,
        status: 'pending',
      };
      if (existing) {
        await db.update('user_documents', {
          document_url: docPayload.document_url,
          front_url: docPayload.front_url,
          back_url: docPayload.back_url,
          status: docPayload.status,
        }, { id: existing.id });
      } else {
        await db.insert('user_documents', docPayload);
      }
    } else {
      return reply.code(500).send({ success: false, message: 'No document table found. Please apply unified_schema.sql migration.' });
    }

    return reply.send({ success: true, path: finalPath, urls: uploadedUrls });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ success: false, message: 'Failed to upload document' });
  }
}

// ──────────────────────────────────────────────────────────────
// PUT /api/driver/update-document/:docType
// ──────────────────────────────────────────────────────────────
async function updateDocument(request, reply) {
  const driverId = request.driver.id;
  const driverUserId = request.driver.user_id || null;
  const { docType } = request.params;

  const validDocTypes = ['aadhar', 'pan', 'license', 'rc'];
  if (!validDocTypes.includes(docType)) {
    return reply.code(400).send({ success: false, message: `docType must be one of: ${validDocTypes.join(', ')}` });
  }

  try {
    const parts = request.parts();
    let frontImageBuffer = null, backImageBuffer = null;
    let frontFilename    = null, backFilename    = null;
    let frontMimetype    = null, backMimetype    = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'frontImage') {
          frontImageBuffer = buffer;
          frontFilename    = part.filename;
          frontMimetype    = part.mimetype;
        } else if (part.fieldname === 'backImage') {
          backImageBuffer = buffer;
          backFilename    = part.filename;
          backMimetype    = part.mimetype;
        }
      }
    }

    if (!frontImageBuffer && !backImageBuffer) {
      return reply.code(400).send({ success: false, message: 'At least one image (frontImage or backImage) is required' });
    }

    const hasLegacyDocs = await tableExists('driver_documentss');
    const hasUnifiedDocs = await tableExists('user_documents');

    if (!hasLegacyDocs && !hasUnifiedDocs) {
      return reply.code(500).send({ success: false, message: 'No document table found. Please apply unified_schema.sql migration.' });
    }

    const fieldMapUrl    = { aadhar: 'aadhar_url',     pan: 'pan_url',     license: 'license_url',    rc: 'rc_url'    };

    const updateData   = {};
    const uploadedUrls = {};

    let legacyDoc = null;
    let unifiedDoc = null;
    let urlParts = ['', ''];

    if (hasLegacyDocs) {
      legacyDoc = await safeOptionalSelectOne('driver_documentss', { driver_id: driverId });
      if (legacyDoc) {
        const currentUrls = legacyDoc[fieldMapUrl[docType]] || '';
        urlParts = currentUrls.includes(',') ? currentUrls.split(',') : [currentUrls, ''];
      }
    } else if (hasUnifiedDocs) {
      if (!driverUserId) {
        return reply.code(400).send({ success: false, message: 'Driver user mapping missing for unified documents.' });
      }

      unifiedDoc = await safeOptionalSelectOne('user_documents', {
        user_id: driverUserId,
        document_type: docType,
      });

      const [docFront, docBack] = splitDocUrl(unifiedDoc?.document_url || '');
      urlParts = [
        unifiedDoc?.front_url || docFront || '',
        unifiedDoc?.back_url || docBack || '',
      ];
    }

    if (frontImageBuffer) {
      const result = await uploadFile({ bucket: process.env.STORAGE_BUCKET_DOCUMENTS || 'driver-documents', folder: `${driverId}/${docType}`, filename: `front_${frontFilename}`, buffer: frontImageBuffer, mimetype: frontMimetype });
      urlParts[0] = result.path;
      uploadedUrls.frontUrl = result.publicUrl;
    }

    if (backImageBuffer) {
      const result = await uploadFile({ bucket: process.env.STORAGE_BUCKET_DOCUMENTS || 'driver-documents', folder: `${driverId}/${docType}`, filename: `back_${backFilename}`,  buffer: backImageBuffer,  mimetype: backMimetype  });
      urlParts[1] = result.path;
      uploadedUrls.backUrl = result.publicUrl;
    }

    updateData[fieldMapUrl[docType]] = urlParts.join(',');
    
    // Only set pending if both are populated
    const hasFront = !!urlParts[0];
    const hasBack  = !!urlParts[1];
    if (hasFront && hasBack) {
      updateData.verification_status = 'pending';
    }

    if (hasLegacyDocs) {
      if (legacyDoc) {
        await db.update('driver_documentss', updateData, { driver_id: driverId });
      } else {
        await db.insert('driver_documentss', {
          driver_id: driverId,
          [fieldMapUrl[docType]]: updateData[fieldMapUrl[docType]],
          verification_status: updateData.verification_status || 'pending',
        });
      }
    } else {
      const unifiedFront = urlParts[0] || null;
      const unifiedBack = urlParts[1] || null;
      const hasUnifiedFront = !!unifiedFront;
      const hasUnifiedBack = !!unifiedBack;
      const unifiedStatus = hasUnifiedFront && hasUnifiedBack
        ? 'pending'
        : (unifiedDoc?.status || 'pending');

      const unifiedPayload = await filterDataForTable('user_documents', {
        document_url: [unifiedFront, unifiedBack].filter(Boolean).join(','),
        front_url: unifiedFront,
        back_url: unifiedBack,
        status: unifiedStatus,
      });

      if (unifiedDoc) {
        await db.update('user_documents', unifiedPayload, { id: unifiedDoc.id });
      } else {
        await db.insert('user_documents', {
          user_id: driverUserId,
          document_type: docType,
          ...unifiedPayload,
        });
      }
    }

    return reply.send({
      success: true,
      message: 'Document updated successfully',
      data: {
        docType,
        status:   hasLegacyDocs
          ? (updateData.verification_status || legacyDoc?.verification_status || 'pending')
          : ((urlParts[0] && urlParts[1]) ? 'pending' : (unifiedDoc?.status || 'pending')),
        frontUrl: uploadedUrls.frontUrl || urlParts[0],
        backUrl:  uploadedUrls.backUrl  || urlParts[1],
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to update document' });
  }
}

// ──────────────────────────────────────────────────────────────
// PUT /api/driver/bank
// ──────────────────────────────────────────────────────────────
async function updateBankAccount(request, reply) {
  const driverId = request.driver.id;
  const driverUserId = request.driver.user_id || null;
  const { accountHolder, accountNumber, ifscCode, bankBranch, upiId } = request.body;

  const updates = {};
  if (accountHolder)       updates.account_holder_name = accountHolder;
  if (accountNumber)       updates.account_number      = accountNumber;
  if (ifscCode)            updates.ifsc_code           = ifscCode.toUpperCase();
  // if (bankBranch)          updates.bank_branch         = bankBranch; // Column missing in DB
  // if (upiId !== undefined) updates.upi_id              = upiId; // Column missing in DB

  if (Object.keys(updates).length === 0) {
    return reply.code(400).send({ success: false, message: 'No fields to update' });
  }

  try {
    if (await tableExists('driver_bank_accounts')) {
      const existing = await db.selectOne('driver_bank_accounts', { driver_id: driverId });
      if (existing) {
        await db.update('driver_bank_accounts', updates, { driver_id: driverId });
      } else {
        await db.insert('driver_bank_accounts', { driver_id: driverId, ...updates });
      }
    }

    if (driverUserId && (await tableExists('bank_accounts'))) {
      const unifiedUpdates = {};
      if (accountHolder) unifiedUpdates.account_holder_name = accountHolder;
      if (accountNumber) unifiedUpdates.account_number = accountNumber;
      if (ifscCode) unifiedUpdates.ifsc_code = ifscCode.toUpperCase();
      if (bankBranch) unifiedUpdates.bank_branch = bankBranch;
      if (upiId !== undefined) unifiedUpdates.upi_id = upiId;

      if (Object.keys(unifiedUpdates).length) {
        const existingUnified = await safeOptionalSelectOne('bank_accounts', { user_id: driverUserId });
        if (existingUnified) {
          await db.update('bank_accounts', unifiedUpdates, { user_id: driverUserId });
        } else {
          await db.insert('bank_accounts', {
            user_id: driverUserId,
            account_holder_name: unifiedUpdates.account_holder_name || accountHolder || 'Driver',
            account_number: unifiedUpdates.account_number || accountNumber || '',
            ifsc_code: unifiedUpdates.ifsc_code || (ifscCode ? ifscCode.toUpperCase() : ''),
            bank_branch: unifiedUpdates.bank_branch || bankBranch || null,
            upi_id: unifiedUpdates.upi_id || upiId || null,
            is_verified: false,
          });
        }
      }
    }

    return reply.send({ success: true, message: 'Bank details updated' });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to update bank details' });
  }
}

// ──────────────────────────────────────────────────────────────
// PUT /api/driver/vehicle
// ──────────────────────────────────────────────────────────────
async function updateVehicle(request, reply) {
  const driverId = request.driver.id;
  const {
    vehicleNumber,
    vehicleType,
    specificModelId,
    vehicleModelName,
    vehicleWeight,
    vehicleDimensions,
    bodyType,
  } = request.body;
  const registrationNumber = vehicleNumber ? String(vehicleNumber).toUpperCase() : null;
  const parsedWeight = vehicleWeight != null && vehicleWeight !== ''
    ? (parseFloat(vehicleWeight) || null)
    : null;

  if (
    !registrationNumber &&
    !vehicleType &&
    !specificModelId &&
    !vehicleModelName &&
    parsedWeight == null &&
    !vehicleDimensions &&
    !bodyType
  ) {
    return reply.code(400).send({
      success: false,
      message: 'At least one vehicle field is required',
    });
  }

  try {
    await ensureDriverVehicleCompatibilitySchema();

    if (await tableExists('driver_vehicles')) {
      const legacyPayload = removeUndefinedFields({
        registration_number: registrationNumber || undefined,
        vehicle_type:        vehicleType || undefined,
        model_id:            specificModelId || undefined,
        model_name:          vehicleModelName || undefined,
        weight_capacity:     parsedWeight === null ? undefined : parsedWeight,
        dimensions:          vehicleDimensions || undefined,
        body_type:           bodyType || undefined,
      });
      const existingLegacyVehicle = await db.selectOne('driver_vehicles', { driver_id: driverId });
      if (existingLegacyVehicle) {
        if (Object.keys(legacyPayload).length > 0) {
          await db.update('driver_vehicles', legacyPayload, { driver_id: driverId });
        }
      } else {
        await db.insert('driver_vehicles', {
          driver_id:           driverId,
          vehicle_type:        vehicleType || '4wheeler',
          model_id:            specificModelId || null,
          model_name:          vehicleModelName || null,
          weight_capacity:     parsedWeight,
          dimensions:          vehicleDimensions || null,
          body_type:           bodyType || null,
          registration_number: registrationNumber || `DRV-${String(driverId).slice(-8).toUpperCase()}`,
          is_active:           true,
        });
      }
    }

    if (await tableExists('vehicles')) {
      const unifiedPayload = await filterDataForTable('vehicles', {
        driver_id:           driverId,
        vehicle_type:        vehicleType || undefined,
        vehicle_number:      registrationNumber || undefined,
        license_plate:       registrationNumber || undefined,
        registration_number: registrationNumber || undefined,
        model_id:            specificModelId || undefined,
        model_name:          vehicleModelName || undefined,
        weight_capacity:     parsedWeight === null ? undefined : parsedWeight,
        dimensions:          vehicleDimensions || undefined,
        body_type:           bodyType || undefined,
        status:              'active',
      });

      const existingUnifiedVehicle = await safeOptionalSelectOne('vehicles', { driver_id: driverId });
      if (existingUnifiedVehicle) {
        const { driver_id: _, ...unifiedUpdateData } = unifiedPayload;
        if (Object.keys(unifiedUpdateData).length > 0) {
          await db.update('vehicles', unifiedUpdateData, { driver_id: driverId });
        }
      } else {
        const unifiedInsertData = {
          ...unifiedPayload,
          driver_id:      driverId,
          vehicle_type:   unifiedPayload.vehicle_type || vehicleType || '4wheeler',
        };
        if (!unifiedInsertData.vehicle_number && registrationNumber) {
          unifiedInsertData.vehicle_number = registrationNumber;
        }
        if (Object.keys(unifiedInsertData).length > 0) {
          await db.insert('vehicles', unifiedInsertData);
        }
      }
    }

    return reply.send({ success: true, message: 'Vehicle updated' });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to update vehicle' });
  }
}

// ──────────────────────────────────────────────────────────────
// GET /api/driver/notifications
// ──────────────────────────────────────────────────────────────
async function getNotifications(request, reply) {
  const driverId = request.driver.id;

  try {
    if (!(await tableExists('driver_notifications'))) {
      return reply.send({ success: true, data: [], unreadCount: 0 });
    }

    const data = await db.selectMany(
      'driver_notifications',
      { driver_id: driverId },
      { orderBy: 'created_at DESC', limit: 50 }
    );

    const unreadCount = (data || []).filter((n) => !n.is_read).length;
    return reply.send({ success: true, data: data || [], unreadCount });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to fetch notifications' });
  }
}

// ──────────────────────────────────────────────────────────────
// PUT /api/driver/notifications/mark-read
// ──────────────────────────────────────────────────────────────
async function markNotificationsRead(request, reply) {
  const driverId = request.driver.id;

  try {
    if (!(await tableExists('driver_notifications'))) {
      return reply.send({ success: true });
    }

    await db.query(
      'UPDATE driver_notifications SET is_read = true WHERE driver_id = $1 AND is_read = false',
      [driverId]
    );
    return reply.send({ success: true });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Failed to mark notifications as read' });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  completeRegistration,
  updateBankAccount,
  updateVehicle,
  updateOnlineStatus,
  updateGpsLocation,
  uploadAvatar,
  uploadDocument,
  updateDocument,
  getNotifications,
  markNotificationsRead,
};
