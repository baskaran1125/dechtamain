import { storage } from "../storage";
import { pool } from "../db";
export class OnboardingService {
    // Create vendor (admin onboarding)
    async createVendor(data) {
        if (data.email) {
            const existing = await storage.getUserByEmail(data.email);
            if (existing)
                throw new Error("Email already exists");
        }
        const { gstNumber, panNumber, udyamRegistrationNumber, bankAccountDetails, gstUrl, panUrl, aadharUrl, cancelledChequeUrl, gstCertificateUrl, shopLicenseUrl, businessLicenseUrl, panImageUrl, registrationCertificateUrl, passbookCancelledChequeUrl, ...userData } = data;
        const phone = String(userData.phone || "").trim() || `9${String(Date.now()).slice(-9)}`;
        const ownerName = String(userData.ownerName || userData.name || "Vendor").trim();
        const businessName = String(userData.name || userData.businessType || "Vendor Business").trim();
        const userRes = await pool.query(`
        INSERT INTO users (phone_number, email, password_hash, user_type, status, is_verified, is_approved, profile_complete)
        VALUES ($1, $2, $3, 'vendor', 'active', true, false, true)
        ON CONFLICT (phone_number)
        DO UPDATE SET
          email = COALESCE(EXCLUDED.email, users.email),
          password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash)
        RETURNING id, phone_number, email, created_at
      `, [phone, userData.email || null, userData.password || null]);
        const userId = Number(userRes.rows[0].id);
        const profileRes = await pool.query(`
        INSERT INTO vendor_profiles (
          user_id,
          business_name,
          owner_name,
          business_address,
          warehouse_address,
          google_maps_location,
          business_type,
          years_of_experience,
          whatsapp_number,
          gst_number,
          verification_status,
          rejection_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NULL)
        ON CONFLICT (user_id)
        DO UPDATE SET
          business_name = EXCLUDED.business_name,
          owner_name = EXCLUDED.owner_name,
          business_address = EXCLUDED.business_address,
          warehouse_address = EXCLUDED.warehouse_address,
          google_maps_location = EXCLUDED.google_maps_location,
          business_type = EXCLUDED.business_type,
          years_of_experience = EXCLUDED.years_of_experience,
          whatsapp_number = EXCLUDED.whatsapp_number,
          gst_number = COALESCE(EXCLUDED.gst_number, vendor_profiles.gst_number),
          verification_status = 'pending',
          updated_at = NOW()
        RETURNING id, user_id, business_name, owner_name, verification_status, created_at
      `, [
            userId,
            businessName,
            ownerName,
            userData.businessAddress || null,
            userData.warehouseAddress || null,
            userData.googleMapsLocation || null,
            userData.businessType || null,
            userData.yearsOfBusinessExperience ? Number(userData.yearsOfBusinessExperience) : null,
            userData.whatsappNumber || null,
            gstNumber || null,
        ]);
        const docRows = [
            { type: "gst", url: gstUrl || gstCertificateUrl },
            { type: "pan", url: panUrl || panImageUrl },
            { type: "aadhar", url: aadharUrl },
            { type: "bank_proof", url: cancelledChequeUrl || passbookCancelledChequeUrl },
            { type: "business_license", url: businessLicenseUrl || shopLicenseUrl || registrationCertificateUrl },
        ];
        for (const doc of docRows) {
            if (!doc.url)
                continue;
            await pool.query(`
          INSERT INTO user_documents (user_id, document_type, document_url, status)
          VALUES ($1, $2, $3, 'pending')
        `, [userId, doc.type, doc.url]);
        }
        if (bankAccountDetails) {
            await pool.query(`
          INSERT INTO app_settings (key, value, value_type, description)
          VALUES ($1, $2, 'string', 'Vendor bank details (temporary compatibility)')
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `, [`vendor_bank_${userId}`, bankAccountDetails]).catch(() => { });
        }
        const profile = profileRes.rows[0];
        return {
            id: Number(profile.id),
            userId,
            businessName: profile.business_name,
            ownerName: profile.owner_name,
            phone,
            email: userData.email || null,
            verificationStatus: profile.verification_status || "pending",
            createdAt: profile.created_at,
        };
    }
    // Vendors
    async getPendingVendors() {
        return await storage.getPendingVendors();
    }
    async getAllVendors() {
        return await storage.getAllVendorsWithStatus();
    }
    async getVendorDocuments(vendorId) {
        return await storage.getVendorDocuments(vendorId);
    }
    async verifyVendor(id) {
        return await storage.verifyVendor(id);
    }
    async rejectVendor(id, reason) {
        return await storage.rejectVendor(id, reason);
    }
    // Manpower
    async getPendingManpower() {
        return await storage.getPendingManpower();
    }
    async getAllManpower() {
        return await storage.getAllManpowerWithStatus();
    }
    async getManpowerDocuments(workerId) {
        return await storage.getManpowerDocuments(workerId);
    }
    async verifyManpowerWorker(id) {
        return await storage.verifyManpowerWorker(id);
    }
    async rejectManpowerWorker(id, reason) {
        return await storage.rejectManpowerWorker(id, reason);
    }
    // Drivers
    async getPendingDrivers() {
        const drivers = await storage.getDrivers();
        return (drivers || [])
            .map((r) => {
            const status = String(r?.status || "").toLowerCase();
            const verificationStatus = String(r?.verificationStatus || r?.verification_status || "").toLowerCase();
            const isRejected = !!(r?.isRejected || r?.is_rejected) || verificationStatus === "rejected" || ["suspended", "banned", "inactive"].includes(status);
            const isApproved = !isRejected && (!!(r?.isApproved || r?.is_approved) || verificationStatus === "verified");
            return {
                id: Number(r.id),
                fullName: r.name || r.fullName || `Driver #${r.id}`,
                phone: r.phone || "",
                email: r.email || null,
                licenseNumber: r.licenseNumber || r.license_number || null,
                vehicleType: r.vehicleType || r.vehicle_type || null,
                vehicleNumber: r.vehicleNumber || r.vehicle_number || null,
                vehicleModelId: r.vehicleModelId || r.vehicle_model_id || null,
                vehicleModelName: r.vehicleModelName || r.vehicle_model_name || null,
                vehicleWeight: r.vehicleWeight || r.vehicle_weight || null,
                vehicleDimensions: r.vehicleDimensions || r.vehicle_dimensions || null,
                bodyType: r.bodyType || r.body_type || null,
                location: r.location || null,
                latitude: r.latitude ?? null,
                longitude: r.longitude ?? null,
                isApproved,
                isRejected,
                verificationStatus: isApproved ? "verified" : (isRejected ? "rejected" : "pending"),
                rejectionReason: r.rejectionReason || r.rejection_reason || null,
                createdAt: r.createdAt || r.created_at || null,
            };
        })
            .filter((r) => r.verificationStatus === "pending");
    }
    async getAllDrivers() {
        const drivers = await storage.getDrivers();
        return (drivers || []).map((r) => {
            const status = String(r?.status || "").toLowerCase();
            const verificationStatus = String(r?.verificationStatus || r?.verification_status || "").toLowerCase();
            const isRejected = !!(r?.isRejected || r?.is_rejected) || verificationStatus === "rejected" || ["suspended", "banned", "inactive"].includes(status);
            const isApproved = !isRejected && (!!(r?.isApproved || r?.is_approved) || verificationStatus === "verified");
            return {
                id: Number(r.id),
                fullName: r.name || r.fullName || `Driver #${r.id}`,
                phone: r.phone || "",
                email: r.email || null,
                licenseNumber: r.licenseNumber || r.license_number || null,
                vehicleType: r.vehicleType || r.vehicle_type || null,
                vehicleNumber: r.vehicleNumber || r.vehicle_number || null,
                vehicleModelId: r.vehicleModelId || r.vehicle_model_id || null,
                vehicleModelName: r.vehicleModelName || r.vehicle_model_name || null,
                vehicleWeight: r.vehicleWeight || r.vehicle_weight || null,
                vehicleDimensions: r.vehicleDimensions || r.vehicle_dimensions || null,
                bodyType: r.bodyType || r.body_type || null,
                location: r.location || null,
                latitude: r.latitude ?? null,
                longitude: r.longitude ?? null,
                isApproved,
                isRejected,
                verificationStatus: isApproved ? "verified" : (isRejected ? "rejected" : "pending"),
                rejectionReason: r.rejectionReason || r.rejection_reason || null,
                createdAt: r.createdAt || r.created_at || null,
            };
        });
    }
    async getDriverDocuments(driverId) {
        const [profile] = (await pool.query(`SELECT user_id FROM driver_profiles WHERE id = $1 LIMIT 1`, [driverId]).catch(() => ({ rows: [] }))).rows;
        const legacy = await storage.getDriverDocuments(driverId);
        if (!profile?.user_id) {
            return legacy || {};
        }
        const docsRows = (await pool.query(`
        SELECT
          document_type,
          COALESCE(document_url, front_url, back_url) AS document_url
        FROM user_documents
        WHERE user_id = $1
      `, [profile.user_id]).catch(async () => {
            return await pool.query(`SELECT document_type, document_url FROM user_documents WHERE user_id = $1`, [profile.user_id]).catch(() => ({ rows: [] }));
        })).rows;
        const map = new Map();
        for (const row of docsRows || []) {
            if (row.document_type && row.document_url) {
                map.set(String(row.document_type).toLowerCase(), row.document_url);
            }
        }
        return {
            ...(legacy || {}),
            photoUrl: legacy?.photoUrl || map.get('photo') || map.get('profile_photo') || null,
            aadharUrl: legacy?.aadharUrl || map.get('aadhar') || map.get('aadhaar') || null,
            addressProofUrl: legacy?.addressProofUrl || map.get('address_proof') || map.get('address') || null,
            rcBookUrl: legacy?.rcBookUrl || map.get('rc_book') || map.get('vehicle_rc') || map.get('registration') || map.get('rc') || null,
            licenseUrl: legacy?.licenseUrl || map.get('license') || map.get('driving_license') || null,
        };
    }
    async verifyDriver(id) {
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE`).catch(() => ({ rows: [] }));
        await pool.query(`
        UPDATE users u
        SET is_approved = true,
            verification_status = 'verified',
            rejection_reason = NULL,
            status = 'active'
        FROM driver_profiles dp
        WHERE dp.id = $1 AND dp.user_id = u.id
      `, [id]).catch(() => { });
        await pool.query(`UPDATE driver_profiles SET is_approved = true WHERE id = $1`, [id]).catch(() => ({ rows: [] }));
        const rows = await this.getAllDrivers();
        return rows.find((r) => Number(r.id) === Number(id)) || null;
    }
    async rejectDriver(id, reason) {
        await pool.query(`ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE`).catch(() => ({ rows: [] }));
        await pool.query(`
        UPDATE users u
        SET is_approved = false,
            verification_status = 'rejected',
            rejection_reason = $2,
            status = 'suspended'
        FROM driver_profiles dp
        WHERE dp.id = $1 AND dp.user_id = u.id
      `, [id, reason]).catch(() => { });
        await pool.query(`UPDATE driver_profiles SET is_approved = false WHERE id = $1`, [id]).catch(() => ({ rows: [] }));
        const rows = await this.getAllDrivers();
        return rows.find((r) => Number(r.id) === Number(id)) || null;
    }
}
export const onboardingService = new OnboardingService();
