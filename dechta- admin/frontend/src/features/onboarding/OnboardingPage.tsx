import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
    Loader2, ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
    Store, Wrench, Eye, FileText, CreditCard, Building2, IdCard, Award, Truck,
    Clock, Filter, Users, MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { PendingVendor, PendingWorker, PendingDriver, VendorDocs, ManpowerDocs, DriverOnboardingDocs } from "@/types";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

type OnboardingTab = "vendors" | "drivers" | "manpower";
type FilterTab = "pending" | "verified" | "rejected" | "all";

interface OnboardingPageProps {
    pendingVendors: PendingVendor[] | undefined;
    pendingVendorsLoading: boolean;
    allVendors: PendingVendor[] | undefined;
    allVendorsLoading: boolean;
    pendingWorkers: PendingWorker[] | undefined;
    pendingWorkersLoading: boolean;
    allWorkers: PendingWorker[] | undefined;
    allWorkersLoading: boolean;
    pendingDrivers: PendingDriver[] | undefined;
    pendingDriversLoading: boolean;
    allDrivers: PendingDriver[] | undefined;
    allDriversLoading: boolean;
}

function pickPrimaryDocumentUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const raw = String(url).trim();
    if (!raw) return null;

    if (raw.startsWith("data:")) {
        const duplicateDataIndex = raw.indexOf(",data:");
        return duplicateDataIndex > 0 ? raw.slice(0, duplicateDataIndex) : raw;
    }

    const commaIndex = raw.indexOf(",");
    if (commaIndex > 0 && !raw.includes("://")) {
        return raw.slice(0, commaIndex).trim();
    }

    if (commaIndex > 0 && raw.slice(commaIndex + 1).trim().startsWith("http")) {
        return raw.slice(0, commaIndex).trim();
    }

    return raw;
}

function normalizeDocUrl(url: string | null | undefined): string | null {
    const raw = pickPrimaryDocumentUrl(url);
    if (!raw) return null;

    if (raw.startsWith("data:")) return raw;

    const normalizedPath = raw.replace(/\\/g, "/");
    const isDriverDocumentPath =
        normalizedPath.startsWith("driver-documents/") ||
        normalizedPath.startsWith("/driver-documents/") ||
        normalizedPath.includes("/uploads/driver-documents/");

    // Fix legacy backend URLs and ensure upload paths resolve against backend API server.
    if (/^https?:\/\//i.test(raw)) {
        if (isDriverDocumentPath) {
            return raw
                .replace(/localhost:\d+/g, "localhost:5000")
                .replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:5000");
        }
        // Keep absolute vendor/admin URLs as-is; forcing ports causes broken previews.
        return raw;
    }

    if (normalizedPath.startsWith("/uploads/driver-documents/")) {
        return `http://127.0.0.1:5000${normalizedPath}`;
    }
    if (normalizedPath.startsWith("driver-documents/")) {
        return `http://127.0.0.1:5000/uploads/${normalizedPath}`;
    }
    if (normalizedPath.startsWith("/driver-documents/")) {
        return `http://127.0.0.1:5000/uploads${normalizedPath}`;
    }

    if (normalizedPath.includes("vendor-documents")) {
        if (raw.startsWith("/uploads/")) return `http://127.0.0.1:5000${raw}`;
        if (raw.startsWith("uploads/")) return `http://127.0.0.1:5000/${raw}`;
        if (raw.startsWith("/")) return `http://127.0.0.1:5000${raw}`;
        return `http://127.0.0.1:5000/uploads/${raw}`;
    }

    if (raw.startsWith("/uploads/")) return `http://127.0.0.1:5002${raw}`;
    if (raw.startsWith("uploads/")) return `http://127.0.0.1:5002/${raw}`;
    if (raw.startsWith("/")) return `http://127.0.0.1:5002${raw}`;
    return `http://127.0.0.1:5002/uploads/${raw}`;
}

function isPdfDocument(url: string | null | undefined): boolean {
    if (!url) return false;
    const value = String(url).toLowerCase();
    return value.includes("application/pdf") || value.endsWith(".pdf");
}

const vendorMapMarkerIcon = L.icon({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

async function runDriverOnboardingAction(id: number, action: "verify" | "reject", reason?: string) {
    if (action === "verify") {
        try {
            await apiRequest("PATCH", `/api/ops/onboarding/drivers/${id}/verify`);
            return;
        } catch {
            try {
                await apiRequest("PATCH", `/api/ops/drivers/${id}/status`, { status: "verified" });
                return;
            } catch {
                await apiRequest("PATCH", `/api/ops/drivers/${id}/status`, { status: "active" });
            }
            return;
        }
    }

    try {
        await apiRequest("PATCH", `/api/ops/onboarding/drivers/${id}/reject`, { reason });
        return;
    } catch {
        try {
            await apiRequest("PATCH", `/api/ops/drivers/${id}/status`, { status: "suspended", reason });
            return;
        } catch {
            await apiRequest("PATCH", `/api/ops/drivers/${id}/status`, { status: "inactive", reason });
        }
    }
}

// ---------- Document Image Preview ----------
function DocumentImagePreview({ url, icon: Icon, label, isLoading, onPreview }: {
    url: string | null | undefined;
    icon: React.ElementType;
    label: string;
    isLoading: boolean;
    onPreview: (url: string, label: string) => void;
}) {
    const isPdf = isPdfDocument(url);

    return (
        <div className="w-48 h-32 bg-gray-100 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 flex-shrink-0 relative overflow-hidden group">
            {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
            ) : url ? (
                <>
                    <button
                        type="button"
                        onClick={() => onPreview(url, label)}
                        className="absolute inset-0 z-10"
                        aria-label={`Preview ${label}`}
                    >
                        {isPdf ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-white text-gray-600">
                                <FileText className="w-8 h-8 mb-1 text-red-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wide">PDF Document</span>
                            </div>
                        ) : (
                            <img src={url} alt={label} className="w-full h-full object-cover" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => onPreview(url, label)}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-[10px] uppercase tracking-widest backdrop-blur-sm cursor-pointer"
                    >
                        Open Preview
                    </button>
                </>
            ) : (
                <>
                    <Icon className="w-8 h-8 mb-1 opacity-50" />
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-50">Missing File</span>
                </>
            )}
        </div>
    );
}

// ---------- Status Badge ----------
function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case "pending":
            return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
        case "verified":
            return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
        case "rejected":
            return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
        default:
            return <Badge variant="outline">{status}</Badge>;
    }
}

// =============================================
// MAIN COMPONENT
// =============================================
export default function OnboardingPage({
    pendingVendors, pendingVendorsLoading,
    allVendors, allVendorsLoading,
    pendingWorkers, pendingWorkersLoading,
    allWorkers, allWorkersLoading,
    pendingDrivers, pendingDriversLoading,
    allDrivers, allDriversLoading,
}: OnboardingPageProps) {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<OnboardingTab>("vendors");
    const [filter, setFilter] = useState<FilterTab>("pending");

    // Commission settings (global / read-only here)
    const { data: commissionSettings } = useQuery<{ vendorCommission: string; manpowerCommission: string; driverCommission: string }>({
        queryKey: ["/api/ops/settings/commission"],
    });

    // Review state
    const [selectedVendor, setSelectedVendor] = useState<PendingVendor | null>(null);
    const [selectedDriver, setSelectedDriver] = useState<PendingDriver | null>(null);
    const [selectedWorker, setSelectedWorker] = useState<PendingWorker | null>(null);
    const [docValidation, setDocValidation] = useState<Record<string, "valid" | "invalid" | null>>({});
    const [previewDoc, setPreviewDoc] = useState<{ url: string; label: string } | null>(null);
    const [vendorMapOpen, setVendorMapOpen] = useState(false);

    // Rejection dialog
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");
    const [rejectTarget, setRejectTarget] = useState<{ type: "vendor" | "driver" | "manpower"; id: number | string } | null>(null);

    // ---- Fetch docs when reviewing ----
    const vendorDocs = useQuery<VendorDocs>({
        queryKey: ["/api/ops/onboarding/vendors", selectedVendor?.id, "documents"],
        queryFn: async () => {
            const res = await fetch(`/api/ops/onboarding/vendors/${selectedVendor!.id}/documents`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch");
            return res.json();
        },
        enabled: !!selectedVendor,
    });

    const manpowerDocs = useQuery<ManpowerDocs>({
        queryKey: ["/api/ops/onboarding/manpower", selectedWorker?.id, "documents"],
        queryFn: async () => {
            const res = await fetch(`/api/ops/onboarding/manpower/${selectedWorker!.id}/documents`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch");
            return res.json();
        },
        enabled: !!selectedWorker,
    });

    const driverDocs = useQuery<DriverOnboardingDocs>({
        queryKey: ["/api/ops/onboarding/drivers", selectedDriver?.id, "documents"],
        queryFn: async () => {
            const res = await fetch(`/api/ops/onboarding/drivers/${selectedDriver!.id}/documents`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch");
            const row = await res.json();

            return {
                driverId: selectedDriver!.id,
                photoUrl: row?.photoUrl ?? row?.photo_url ?? selectedDriver?.photoUrl ?? null,
                aadharUrl: row?.aadharUrl ?? row?.aadhar_url ?? selectedDriver?.aadharUrl ?? null,
                addressProofUrl: row?.addressProofUrl ?? row?.address_proof_url ?? selectedDriver?.addressProofUrl ?? null,
                rcBookUrl: row?.rcBookUrl ?? row?.rc_book_url ?? selectedDriver?.rcBookUrl ?? null,
                licenseUrl: row?.licenseUrl ?? row?.license_url ?? selectedDriver?.licenseUrl ?? null,
            };
        },
        enabled: !!selectedDriver,
    });

    // ---- Mutations ----
    const verifyVendorMutation = useMutation({
        mutationFn: async (id: number) => { await apiRequest("PATCH", `/api/ops/onboarding/vendors/${id}/verify`); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/vendors"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/vendors/all"] });
            setSelectedVendor(null);
            setDocValidation({});
            toast({ title: "Vendor Verified", description: "Vendor can now list products on the marketplace." });
        },
    });

    const rejectVendorMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
            await apiRequest("PATCH", `/api/ops/onboarding/vendors/${id}/reject`, { reason });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/vendors"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/vendors/all"] });
            setSelectedVendor(null);
            setDocValidation({});
            setRejectDialogOpen(false);
            setRejectionReason("");
            toast({ title: "Vendor Rejected", description: "The vendor has been notified." });
        },
    });

    const verifyWorkerMutation = useMutation({
        mutationFn: async (id: string) => { await apiRequest("PATCH", `/api/ops/onboarding/manpower/${id}/verify`); },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/manpower"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/manpower/all"] });
            setSelectedWorker(null);
            setDocValidation({});
            toast({ title: "Worker Verified", description: "Worker can now be assigned to jobs." });
        },
    });

    const rejectWorkerMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
            await apiRequest("PATCH", `/api/ops/onboarding/manpower/${id}/reject`, { reason });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/manpower"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/manpower/all"] });
            setSelectedWorker(null);
            setDocValidation({});
            setRejectDialogOpen(false);
            setRejectionReason("");
            toast({ title: "Worker Rejected", description: "The worker has been notified." });
        },
    });

    const verifyDriverMutation = useMutation({
        mutationFn: async (id: number) => {
            await runDriverOnboardingAction(id, "verify");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/drivers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/drivers/all"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/drivers"] });
            setSelectedDriver(null);
            setDocValidation({});
            toast({ title: "Driver Verified", description: "Driver can now accept trips and go online." });
        },
    });

    const rejectDriverMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
            await runDriverOnboardingAction(id, "reject", reason);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/drivers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/onboarding/drivers/all"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ops/drivers"] });
            setSelectedDriver(null);
            setDocValidation({});
            setRejectDialogOpen(false);
            setRejectionReason("");
            toast({ title: "Driver Rejected", description: "The driver request has been rejected." });
        },
    });

    // ---- Helpers ----
    const handleRejectClick = (type: "vendor" | "driver" | "manpower", id: number | string) => {
        setRejectTarget({ type, id });
        setRejectionReason("");
        setRejectDialogOpen(true);
    };

    const handleRejectConfirm = () => {
        if (!rejectTarget || !rejectionReason.trim()) return;
        if (rejectTarget.type === "vendor") {
            rejectVendorMutation.mutate({ id: rejectTarget.id as number, reason: rejectionReason.trim() });
        } else if (rejectTarget.type === "driver") {
            rejectDriverMutation.mutate({ id: rejectTarget.id as number, reason: rejectionReason.trim() });
        } else {
            rejectWorkerMutation.mutate({ id: rejectTarget.id as string, reason: rejectionReason.trim() });
        }
    };

    const pendingVendorCount = pendingVendors?.length || 0;
    const pendingDriverCount = pendingDrivers?.length || 0;
    const pendingWorkerCount = pendingWorkers?.length || 0;

    const getFilteredList = <T extends { verificationStatus: string }>(pending: T[] | undefined, all: T[] | undefined) => {
        if (filter === "pending") return pending || [];
        const list = all || [];
        if (filter === "all") return list;
        return list.filter(i => i.verificationStatus === filter);
    };

    const toFiniteNumber = (value: unknown): number | null => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    const openVendorLocation = (vendor: PendingVendor) => {
        const lat = toFiniteNumber(vendor.shopLatitude);
        const lng = toFiniteNumber(vendor.shopLongitude);
        const locationText = vendor.locationLabel || vendor.googleMapsLocation || vendor.shopAddress || vendor.businessAddress || "";
        const url = lat !== null && lng !== null
            ? `https://www.google.com/maps?q=${lat},${lng}`
            : (locationText ? `https://www.google.com/maps?q=${encodeURIComponent(locationText)}` : "");

        if (!url) {
            toast({ title: "Location Unavailable", description: "No location data found for this vendor." });
            return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
    };

    // =============================================
    // VENDOR REVIEW VIEW (split-screen like reference)
    // =============================================
    if (selectedVendor) {
        const vendorLat = toFiniteNumber(selectedVendor.shopLatitude);
        const vendorLng = toFiniteNumber(selectedVendor.shopLongitude);
        const hasVendorCoords = vendorLat !== null && vendorLng !== null;
        const vendorAddressLine = selectedVendor.shopAddress || selectedVendor.businessAddress || null;
        const locationDisplay = selectedVendor.locationLabel || selectedVendor.googleMapsLocation || vendorAddressLine;
        const externalMapUrl = hasVendorCoords
            ? `https://www.google.com/maps?q=${vendorLat},${vendorLng}`
            : (locationDisplay ? `https://www.google.com/maps?q=${encodeURIComponent(locationDisplay)}` : null);
        const vendorMapCenter: [number, number] | null = hasVendorCoords
            ? [vendorLat as number, vendorLng as number]
            : null;

        const docs = vendorDocs.data;
        const profileDetails = (docs?.profileDetails && typeof docs.profileDetails === "object") ? docs.profileDetails : {};
        const companyDetails = (docs?.companyDetails && typeof docs.companyDetails === "object") ? docs.companyDetails : {};
        const bankDetails = (docs?.bankDetails && typeof docs.bankDetails === "object") ? docs.bankDetails : {};
        const addressDetails = (docs?.addressDetails && typeof docs.addressDetails === "object") ? docs.addressDetails : {};

        const detailSections = [
            {
                title: "Profile Details",
                rows: [
                    ["Full Name", profileDetails?.name || selectedVendor.ownerName || "N/A"],
                    ["Phone", profileDetails?.phone || selectedVendor.phone || "N/A"],
                    ["WhatsApp", profileDetails?.whatsapp || profileDetails?.whatsappNumber || selectedVendor.whatsappNumber || "N/A"],
                    ["Aadhaar Number", profileDetails?.aadhaar || profileDetails?.aadhar || "N/A"],
                    ["PAN Number", profileDetails?.pan || "N/A"],
                ],
            },
            {
                title: "Company Details",
                rows: [
                    ["Company Name", companyDetails?.companyName || selectedVendor.shopName || selectedVendor.name || "N/A"],
                    ["Business Type", companyDetails?.businessType || selectedVendor.businessType || "N/A"],
                    ["GST Number", companyDetails?.gst || selectedVendor.gstNumber || "N/A"],
                    ["Years of Experience", companyDetails?.yearsOfBusinessExperience || selectedVendor.yearsOfBusinessExperience || "N/A"],
                    ["Email", companyDetails?.email || selectedVendor.email || "N/A"],
                ],
            },
            {
                title: "Bank Details",
                rows: [
                    ["Bank Name", bankDetails?.bankName || "N/A"],
                    ["Account Number", bankDetails?.accountNo || bankDetails?.accountNumber || "N/A"],
                    ["IFSC", bankDetails?.ifsc || "N/A"],
                    ["Branch", bankDetails?.bankBranch || "N/A"],
                ],
            },
            {
                title: "Address Details",
                rows: [
                    ["Shop Address", selectedVendor.shopAddress || selectedVendor.businessAddress || addressDetails?.address || "N/A"],
                    ["Warehouse Address", selectedVendor.warehouseAddress || "N/A"],
                    ["Location Label", addressDetails?.locationLabel || selectedVendor.locationLabel || selectedVendor.googleMapsLocation || "N/A"],
                    ["Latitude", addressDetails?.latitude ?? selectedVendor.shopLatitude ?? "N/A"],
                    ["Longitude", addressDetails?.longitude ?? selectedVendor.shopLongitude ?? "N/A"],
                ],
            },
        ];

        const vendorDocFields = [
            { key: "gst", label: "GST Certificate", icon: Building2, url: normalizeDocUrl(docs?.gstUrl), hint: "Verify GST number and business name match." },
            { key: "passbook_cancelled_cheque", label: "Passbook / Cancelled Cheque", icon: CreditCard, url: normalizeDocUrl(docs?.cancelledChequeUrl), hint: "Validate account holder details and cheque/passbook clarity." },
            { key: "pan_image", label: "PAN Image", icon: CreditCard, url: normalizeDocUrl(docs?.panImageUrl), hint: "Verify PAN card details and clarity." },
            { key: "registration_certificate", label: "Registration Certificate", icon: FileText, url: normalizeDocUrl(docs?.registrationCertificateUrl), hint: "Verify business registration certificate." },
            { key: "vendor_shop", label: "Vendor Shop", icon: Building2, url: normalizeDocUrl(docs?.shopLicenseUrl), hint: "Verify shop photo and storefront visibility." },
            { key: "vendor_pan", label: "PAN Card", icon: IdCard, url: normalizeDocUrl(docs?.panUrl), hint: "Confirm PAN number and legal name are readable." },
            { key: "aadhar", label: "Aadhar Proof", icon: IdCard, url: normalizeDocUrl(docs?.aadharUrl), hint: "Check for clear photo and matching name." },
        ];

        const allValid = vendorDocFields.every(d => docValidation[d.key] === "valid");

        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button onClick={() => { setSelectedVendor(null); setDocValidation({}); }} variant="outline" size="icon" className="rounded-full">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Reviewing: {selectedVendor.name}</h2>
                            <p className="text-sm text-gray-500">Vendor ID: #{selectedVendor.id} &bull; {selectedVendor.email}</p>
                        </div>
                    </div>
                    <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-300 text-xs font-bold">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Needs Verification
                    </Badge>
                </div>

                <div className="flex gap-6" style={{ height: "calc(100vh - 320px)" }}>
                    {/* Left: Profile */}
                    <div className="w-1/3 bg-white rounded-2xl border border-gray-200 p-6 overflow-y-auto shadow-sm">
                        <div className="flex flex-col items-center mb-6 pb-6 border-b">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-2xl font-black mb-3 shadow-lg">
                                {selectedVendor.name.substring(0, 2).toUpperCase()}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">{selectedVendor.name}</h3>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mt-1">Vendor Profile</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[10px]"
                                        disabled={!externalMapUrl}
                                        onClick={() => {
                                            if (hasVendorCoords) {
                                                setVendorMapOpen(true);
                                            } else if (externalMapUrl) {
                                                window.open(externalMapUrl, "_blank", "noopener,noreferrer");
                                            }
                                        }}
                                    >
                                        <MapPin className="w-3 h-3 mr-1" /> View
                                    </Button>
                                </div>
                                <p className="text-sm font-semibold text-gray-900 break-words">{locationDisplay || "N/A"}</p>
                                {hasVendorCoords && (
                                    <p className="text-[10px] text-gray-500 mt-1">Lat: {vendorLat?.toFixed(6)}, Lng: {vendorLng?.toFixed(6)}</p>
                                )}
                            </div>
                            {detailSections.map((section) => (
                                <div key={section.title} className="rounded-xl border border-gray-200 p-3">
                                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-2">{section.title}</h4>
                                    <div className="space-y-2">
                                        {section.rows.map(([label, value]) => (
                                            <div key={`${section.title}-${label}`} className="grid grid-cols-2 gap-2">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
                                                <p className="text-xs font-semibold text-gray-900 break-words text-right">{String(value || "N/A")}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Applied On</p>
                                <p className="text-sm font-semibold text-gray-900">
                                    {selectedVendor.createdAt ? new Date(selectedVendor.createdAt).toLocaleDateString() : "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                <StatusBadge status={selectedVendor.verificationStatus} />
                            </div>
                            {selectedVendor.rejectionReason && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
                                    <p className="text-xs font-medium text-red-700">Previous Rejection:</p>
                                    <p className="text-xs text-red-600 mt-1">{selectedVendor.rejectionReason}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Document Viewer */}
                    <div className="w-2/3 bg-gray-50 rounded-2xl border border-gray-200 p-6 overflow-y-auto shadow-inner">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-cyan-500" /> Document Verification
                        </h3>
                        <div className="space-y-5">
                            {vendorDocFields.map(({ key, label, icon, url, hint }) => (
                                <div key={key} className="bg-white p-4 rounded-xl border shadow-sm flex gap-5">
                                    <DocumentImagePreview
                                        url={url}
                                        icon={icon}
                                        label={label}
                                        isLoading={vendorDocs.isLoading}
                                        onPreview={(previewUrl, previewLabel) => setPreviewDoc({ url: previewUrl, label: previewLabel })}
                                    />
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                                {label} {url && <span className="w-2 h-2 rounded-full bg-cyan-500" />}
                                            </h4>
                                            <p className="text-[10px] text-gray-500 mt-1">{hint}</p>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => setDocValidation(p => ({ ...p, [key]: "valid" }))}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition flex justify-center items-center gap-1 ${docValidation[key] === "valid" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-green-500/20 hover:text-green-500"}`}
                                            >
                                                <CheckCircle2 className="w-4 h-4" /> Valid
                                            </button>
                                            <button
                                                onClick={() => setDocValidation(p => ({ ...p, [key]: "invalid" }))}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition flex justify-center items-center gap-1 ${docValidation[key] === "invalid" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-red-500/20 hover:text-red-500"}`}
                                            >
                                                <XCircle className="w-4 h-4" /> Invalid
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="flex justify-end items-center gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => handleRejectClick("vendor", selectedVendor.id)} className="text-red-500 border-red-200 hover:bg-red-50">
                        <XCircle className="w-4 h-4 mr-1" /> Reject Vendor
                    </Button>
                    <Button
                        onClick={() => verifyVendorMutation.mutate(selectedVendor.id)}
                        disabled={!allValid || verifyVendorMutation.isPending}
                        className="bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30"
                    >
                        {verifyVendorMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                        Approve Vendor
                    </Button>
                </div>

                <RejectDialog
                    open={rejectDialogOpen}
                    onOpenChange={setRejectDialogOpen}
                    reason={rejectionReason}
                    onReasonChange={setRejectionReason}
                    onConfirm={handleRejectConfirm}
                    isPending={rejectVendorMutation.isPending}
                />

                <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
                    <DialogContent className="max-w-5xl">
                        <DialogHeader>
                            <DialogTitle>{previewDoc?.label || "Document Preview"}</DialogTitle>
                        </DialogHeader>
                        {previewDoc && (
                            <div className="max-h-[75vh] overflow-auto rounded-lg border bg-gray-50 p-2">
                                {isPdfDocument(previewDoc.url) ? (
                                    <iframe
                                        title={previewDoc.label}
                                        src={previewDoc.url}
                                        className="mx-auto h-[70vh] w-full rounded bg-white"
                                    />
                                ) : (
                                    <img
                                        src={previewDoc.url}
                                        alt={previewDoc.label}
                                        className="mx-auto h-auto max-h-[70vh] w-auto max-w-full rounded"
                                    />
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                <Dialog open={vendorMapOpen} onOpenChange={setVendorMapOpen}>
                    <DialogContent className="max-w-4xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><MapPin className="w-4 h-4 text-cyan-600" /> Vendor Location</DialogTitle>
                            <DialogDescription>{selectedVendor.name}</DialogDescription>
                        </DialogHeader>
                        {hasVendorCoords ? (
                            <div className="space-y-3">
                                <div className="h-[420px] rounded-xl border overflow-hidden bg-gray-100">
                                    {vendorMapCenter && (
                                        <MapContainer center={vendorMapCenter} zoom={16} className="w-full h-full" scrollWheelZoom>
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <Marker position={vendorMapCenter} icon={vendorMapMarkerIcon}>
                                                <Popup>
                                                    {selectedVendor.name}
                                                    <br />
                                                    {locationDisplay || "Vendor location"}
                                                </Popup>
                                            </Marker>
                                        </MapContainer>
                                    )}
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>Lat: {vendorLat?.toFixed(6)}, Lng: {vendorLng?.toFixed(6)}</span>
                                    {externalMapUrl && (
                                        <a href={externalMapUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-cyan-700 hover:underline">Open in Google Maps</a>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border p-4 text-sm text-gray-600">
                                Coordinates are not available for this vendor.
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // =============================================
    // MANPOWER REVIEW VIEW
    // =============================================
    if (selectedWorker) {
        const docs = manpowerDocs.data;
        const workerDocFields = [
            { key: "aadhar", label: "Aadhar / Identity", icon: IdCard, url: normalizeDocUrl(docs?.aadharUrl), hint: "Check for clear photo and matching name." },
            { key: "pan", label: "PAN Card", icon: CreditCard, url: normalizeDocUrl(docs?.panUrl), hint: "Verify tax identity and PAN number." },
            { key: "skill_cert", label: "Skill Certificate", icon: Award, url: normalizeDocUrl(docs?.skillCertificateUrl), hint: "Verify skill certification and validity." },
        ];

        const allValid = workerDocFields.every(d => docValidation[d.key] === "valid");

        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button onClick={() => { setSelectedWorker(null); setDocValidation({}); }} variant="outline" size="icon" className="rounded-full">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Reviewing: {selectedWorker.fullName}</h2>
                            <p className="text-sm text-gray-500">Worker ID: {selectedWorker.id.substring(0, 8)}… &bull; {selectedWorker.phone}</p>
                        </div>
                    </div>
                    <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-300 text-xs font-bold">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Needs Verification
                    </Badge>
                </div>

                <div className="flex gap-6" style={{ height: "calc(100vh - 320px)" }}>
                    {/* Left: Profile */}
                    <div className="w-1/3 bg-white rounded-2xl border border-gray-200 p-6 overflow-y-auto shadow-sm">
                        <div className="flex flex-col items-center mb-6 pb-6 border-b">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-2xl font-black mb-3 shadow-lg">
                                {selectedWorker.fullName.substring(0, 2).toUpperCase()}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">{selectedWorker.fullName}</h3>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mt-1">Worker Profile</p>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Phone</p>
                                    <p className="text-sm font-semibold text-gray-900">{selectedWorker.phone}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Skill</p>
                                    <p className="text-sm font-semibold text-gray-900">{selectedWorker.skill || "N/A"}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Experience</p>
                                    <p className="text-sm font-semibold text-gray-900">{selectedWorker.experience || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Location</p>
                                    <p className="text-sm font-semibold text-gray-900">{[selectedWorker.area, selectedWorker.city, selectedWorker.state].filter(Boolean).join(', ') || "N/A"}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Applied On</p>
                                <p className="text-sm font-semibold text-gray-900">
                                    {selectedWorker.createdAt ? new Date(selectedWorker.createdAt).toLocaleDateString() : "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                <StatusBadge status={selectedWorker.verificationStatus} />
                            </div>
                        </div>
                    </div>

                    {/* Right: Document Viewer */}
                    <div className="w-2/3 bg-gray-50 rounded-2xl border border-gray-200 p-6 overflow-y-auto shadow-inner">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-cyan-500" /> Document Verification
                        </h3>
                        <div className="space-y-5">
                            {workerDocFields.map(({ key, label, icon, url, hint }) => (
                                <div key={key} className="bg-white p-4 rounded-xl border shadow-sm flex gap-5">
                                    <DocumentImagePreview
                                        url={url}
                                        icon={icon}
                                        label={label}
                                        isLoading={manpowerDocs.isLoading}
                                        onPreview={(previewUrl, previewLabel) => setPreviewDoc({ url: previewUrl, label: previewLabel })}
                                    />
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                                {label} {url && <span className="w-2 h-2 rounded-full bg-cyan-500" />}
                                            </h4>
                                            <p className="text-[10px] text-gray-500 mt-1">{hint}</p>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => setDocValidation(p => ({ ...p, [key]: "valid" }))}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition flex justify-center items-center gap-1 ${docValidation[key] === "valid" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-green-500/20 hover:text-green-500"}`}
                                            >
                                                <CheckCircle2 className="w-4 h-4" /> Valid
                                            </button>
                                            <button
                                                onClick={() => setDocValidation(p => ({ ...p, [key]: "invalid" }))}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition flex justify-center items-center gap-1 ${docValidation[key] === "invalid" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-red-500/20 hover:text-red-500"}`}
                                            >
                                                <XCircle className="w-4 h-4" /> Invalid
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="flex justify-end items-center gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => handleRejectClick("manpower", selectedWorker.id)} className="text-red-500 border-red-200 hover:bg-red-50">
                        <XCircle className="w-4 h-4 mr-1" /> Reject Worker
                    </Button>
                    <Button
                        onClick={() => verifyWorkerMutation.mutate(selectedWorker.id)}
                        disabled={!allValid || verifyWorkerMutation.isPending}
                        className="bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30"
                    >
                        {verifyWorkerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                        Approve Worker
                    </Button>
                </div>

                <RejectDialog
                    open={rejectDialogOpen}
                    onOpenChange={setRejectDialogOpen}
                    reason={rejectionReason}
                    onReasonChange={setRejectionReason}
                    onConfirm={handleRejectConfirm}
                    isPending={rejectWorkerMutation.isPending}
                />

                <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
                    <DialogContent className="max-w-5xl">
                        <DialogHeader>
                            <DialogTitle>{previewDoc?.label || "Document Preview"}</DialogTitle>
                        </DialogHeader>
                        {previewDoc && (
                            <div className="max-h-[75vh] overflow-auto rounded-lg border bg-gray-50 p-2">
                                {isPdfDocument(previewDoc.url) ? (
                                    <iframe
                                        title={previewDoc.label}
                                        src={previewDoc.url}
                                        className="mx-auto h-[70vh] w-full rounded bg-white"
                                    />
                                ) : (
                                    <img
                                        src={previewDoc.url}
                                        alt={previewDoc.label}
                                        className="mx-auto h-auto max-h-[70vh] w-auto max-w-full rounded"
                                    />
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // =============================================
    // DRIVER REVIEW VIEW
    // =============================================
    if (selectedDriver) {
        const docs = driverDocs.data;
        const driverModel = (selectedDriver as any).vehicleModelName || (selectedDriver as any).vehicleModelId || null;
        const driverBodyType = (selectedDriver as any).bodyType || null;
        const driverWeight = (selectedDriver as any).vehicleWeight || null;
        const driverDimensions = (selectedDriver as any).vehicleDimensions || null;
        const driverDocFields = [
            { key: "photo", label: "Driver Photo", icon: Users, url: normalizeDocUrl(docs?.photoUrl), hint: "Verify profile photo clarity and face match." },
            { key: "aadhar", label: "Aadhar Proof", icon: IdCard, url: normalizeDocUrl(docs?.aadharUrl), hint: "Validate identity number and name." },
            { key: "license", label: "Driving License", icon: CreditCard, url: normalizeDocUrl(docs?.licenseUrl), hint: "Check license validity and class." },
            { key: "rc", label: "RC Book", icon: FileText, url: normalizeDocUrl(docs?.rcBookUrl), hint: "Vehicle registration proof must match vehicle number." },
            { key: "address", label: "Address Proof", icon: Building2, url: normalizeDocUrl(docs?.addressProofUrl), hint: "Verify current address details." },
        ];

        const allValid = driverDocFields.every(d => docValidation[d.key] === "valid");

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button onClick={() => { setSelectedDriver(null); setDocValidation({}); }} variant="outline" size="icon" className="rounded-full">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Reviewing: {selectedDriver.fullName}</h2>
                            <p className="text-sm text-gray-500">Driver ID: #{selectedDriver.id} &bull; {selectedDriver.phone}</p>
                        </div>
                    </div>
                    <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-300 text-xs font-bold">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Needs Verification
                    </Badge>
                </div>

                <div className="flex gap-6" style={{ height: "calc(100vh - 320px)" }}>
                    <div className="w-1/3 bg-white rounded-2xl border border-gray-200 p-6 overflow-y-auto shadow-sm">
                        <div className="flex flex-col items-center mb-6 pb-6 border-b">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white text-2xl font-black mb-3 shadow-lg">
                                {selectedDriver.fullName.substring(0, 2).toUpperCase()}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">{selectedDriver.fullName}</h3>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mt-1">Driver Profile</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email</p>
                                <p className="text-sm font-semibold text-gray-900">{selectedDriver.email || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">License Number</p>
                                <p className="text-sm font-semibold text-gray-900">{selectedDriver.licenseNumber || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Vehicle</p>
                                <p className="text-sm font-semibold text-gray-900">{[selectedDriver.vehicleType, selectedDriver.vehicleNumber].filter(Boolean).join(' • ') || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Model / Body Type</p>
                                <p className="text-sm font-semibold text-gray-900">{[driverModel, driverBodyType].filter(Boolean).join(' • ') || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Capacity / Dimensions</p>
                                <p className="text-sm font-semibold text-gray-900">{[driverWeight ? `${driverWeight} kg` : null, driverDimensions].filter(Boolean).join(' • ') || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Location</p>
                                <p className="text-sm font-semibold text-gray-900">{selectedDriver.location || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Applied On</p>
                                <p className="text-sm font-semibold text-gray-900">{selectedDriver.createdAt ? new Date(selectedDriver.createdAt).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                <StatusBadge status={selectedDriver.verificationStatus} />
                            </div>
                            {selectedDriver.rejectionReason && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
                                    <p className="text-xs font-medium text-red-700">Previous Rejection:</p>
                                    <p className="text-xs text-red-600 mt-1">{selectedDriver.rejectionReason}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-2/3 bg-gray-50 rounded-2xl border border-gray-200 p-6 overflow-y-auto shadow-inner">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-cyan-500" /> Document Verification
                        </h3>
                        <div className="space-y-5">
                            {driverDocFields.map(({ key, label, icon, url, hint }) => (
                                <div key={key} className="bg-white p-4 rounded-xl border shadow-sm flex gap-5">
                                    <DocumentImagePreview
                                        url={url}
                                        icon={icon}
                                        label={label}
                                        isLoading={driverDocs.isLoading}
                                        onPreview={(previewUrl, previewLabel) => setPreviewDoc({ url: previewUrl, label: previewLabel })}
                                    />
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                                {label} {url && <span className="w-2 h-2 rounded-full bg-cyan-500" />}
                                            </h4>
                                            <p className="text-[10px] text-gray-500 mt-1">{hint}</p>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => setDocValidation(p => ({ ...p, [key]: "valid" }))}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition flex justify-center items-center gap-1 ${docValidation[key] === "valid" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-green-500/20 hover:text-green-500"}`}
                                            >
                                                <CheckCircle2 className="w-4 h-4" /> Valid
                                            </button>
                                            <button
                                                onClick={() => setDocValidation(p => ({ ...p, [key]: "invalid" }))}
                                                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition flex justify-center items-center gap-1 ${docValidation[key] === "invalid" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-red-500/20 hover:text-red-500"}`}
                                            >
                                                <XCircle className="w-4 h-4" /> Invalid
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end items-center gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => handleRejectClick("driver", selectedDriver.id)} className="text-red-500 border-red-200 hover:bg-red-50">
                        <XCircle className="w-4 h-4 mr-1" /> Reject Driver
                    </Button>
                    <Button
                        onClick={() => verifyDriverMutation.mutate(selectedDriver.id)}
                        disabled={!allValid || verifyDriverMutation.isPending}
                        className="bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30"
                    >
                        {verifyDriverMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                        Approve Driver
                    </Button>
                </div>

                <RejectDialog
                    open={rejectDialogOpen}
                    onOpenChange={setRejectDialogOpen}
                    reason={rejectionReason}
                    onReasonChange={setRejectionReason}
                    onConfirm={handleRejectConfirm}
                    isPending={rejectDriverMutation.isPending}
                />

                <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
                    <DialogContent className="max-w-5xl">
                        <DialogHeader>
                            <DialogTitle>{previewDoc?.label || "Document Preview"}</DialogTitle>
                        </DialogHeader>
                        {previewDoc && (
                            <div className="max-h-[75vh] overflow-auto rounded-lg border bg-gray-50 p-2">
                                {isPdfDocument(previewDoc.url) ? (
                                    <iframe
                                        title={previewDoc.label}
                                        src={previewDoc.url}
                                        className="mx-auto h-[70vh] w-full rounded bg-white"
                                    />
                                ) : (
                                    <img
                                        src={previewDoc.url}
                                        alt={previewDoc.label}
                                        className="mx-auto h-auto max-h-[70vh] w-auto max-w-full rounded"
                                    />
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // =============================================
    // LIST VIEW (main state)
    // =============================================
    const filteredVendors = getFilteredList(pendingVendors, allVendors);
    const filteredDrivers = getFilteredList(pendingDrivers, allDrivers);
    const filteredWorkers = getFilteredList(pendingWorkers, allWorkers);
    const isVendorLoading = filter === "pending" ? pendingVendorsLoading : allVendorsLoading;
    const isDriverLoading = filter === "pending" ? pendingDriversLoading : allDriversLoading;
    const isWorkerLoading = filter === "pending" ? pendingWorkersLoading : allWorkersLoading;

    const FILTER_TABS: { key: FilterTab; label: string }[] = [
        { key: "pending", label: `Pending (${activeTab === "vendors" ? pendingVendorCount : activeTab === "drivers" ? pendingDriverCount : pendingWorkerCount})` },
        { key: "verified", label: "Verified" },
        { key: "rejected", label: "Rejected" },
        { key: "all", label: "All" },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Onboarding Hub</h2>
                    <p className="text-sm text-gray-500 mt-1">Review and verify vendor, driver and manpower applications before they go live.</p>
                </div>
                <div className="flex items-center gap-2">
                    {pendingVendorCount > 0 && (
                        <Badge className="bg-orange-500 text-white text-xs px-3 py-1">{pendingVendorCount} vendor{pendingVendorCount > 1 ? "s" : ""}</Badge>
                    )}
                    {pendingDriverCount > 0 && (
                        <Badge className="bg-blue-500 text-white text-xs px-3 py-1">{pendingDriverCount} driver{pendingDriverCount > 1 ? "s" : ""}</Badge>
                    )}
                    {pendingWorkerCount > 0 && (
                        <Badge className="bg-purple-500 text-white text-xs px-3 py-1">{pendingWorkerCount} worker{pendingWorkerCount > 1 ? "s" : ""}</Badge>
                    )}
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-5">
                <Card className="bg-orange-50 border-orange-100">
                    <CardContent className="p-5">
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Pending Review</p>
                        <p className="text-3xl font-black text-orange-600 mt-1">{pendingVendorCount + pendingDriverCount + pendingWorkerCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vendors Pending</p>
                        <p className="text-3xl font-black text-gray-900 mt-1">{pendingVendorCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Drivers Pending</p>
                        <p className="text-3xl font-black text-gray-900 mt-1">{pendingDriverCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Workers Pending</p>
                        <p className="text-3xl font-black text-gray-900 mt-1">{pendingWorkerCount}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Tabs: Vendors / Manpower */}
            <div className="flex items-center gap-4">
                <div className="inline-flex gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                    <Button
                        onClick={() => { setActiveTab("vendors"); setFilter("pending"); }}
                        variant="ghost"
                        className={`rounded-full px-5 py-2 text-xs font-semibold flex items-center gap-1.5 ${activeTab === "vendors" ? "bg-black text-cyan-400 shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                        <Store className="w-3.5 h-3.5" /> Vendors
                    </Button>
                    <Button
                        onClick={() => { setActiveTab("drivers"); setFilter("pending"); }}
                        variant="ghost"
                        className={`rounded-full px-5 py-2 text-xs font-semibold flex items-center gap-1.5 ${activeTab === "drivers" ? "bg-black text-cyan-400 shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                        <Truck className="w-3.5 h-3.5" /> Driver Requests
                    </Button>
                    <Button
                        onClick={() => { setActiveTab("manpower"); setFilter("pending"); }}
                        variant="ghost"
                        className={`rounded-full px-5 py-2 text-xs font-semibold flex items-center gap-1.5 ${activeTab === "manpower" ? "bg-black text-cyan-400 shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                        <Wrench className="w-3.5 h-3.5" /> Manpower
                    </Button>
                </div>

                {/* Filter Tabs */}
                <div className="inline-flex gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                    {FILTER_TABS.map(({ key, label }) => (
                        <Button
                            key={key}
                            onClick={() => setFilter(key)}
                            variant="ghost"
                            className={`rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-1 ${filter === key ? "bg-gray-900 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}
                        >
                            <Filter className="w-3 h-3" /> {label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Commission Info */}
            {commissionSettings && (
                <div className="flex items-center gap-4 p-3 bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Fixed Commission:</span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-bold text-cyan-700 bg-white border border-cyan-200 rounded-lg">
                        Vendors — {commissionSettings.vendorCommission}%
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-bold text-orange-700 bg-white border border-orange-200 rounded-lg">
                        Drivers — {commissionSettings.driverCommission}%
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-bold text-orange-700 bg-white border border-orange-200 rounded-lg">
                        Manpower — {commissionSettings.manpowerCommission}%
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">Manage in Settings</span>
                </div>
            )}

            {/* Table */}
            <Card className="overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Applicant</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contact</th>
                            {(activeTab === "manpower" || activeTab === "drivers") && <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{activeTab === 'drivers' ? 'Vehicle' : 'Skill'}</th>}
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Applied On</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(activeTab === "vendors" ? isVendorLoading : activeTab === "drivers" ? isDriverLoading : isWorkerLoading) ? (
                            <tr><td colSpan={6} className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto" /></td></tr>
                        ) : activeTab === "vendors" ? (
                            filteredVendors.length === 0 ? (
                                <tr><td colSpan={6} className="py-16 text-center">
                                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No {filter} vendors</p>
                                </td></tr>
                            ) : (
                                filteredVendors.map((v) => (
                                    <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                                                {v.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-900">{v.name}</p>
                                                <p className="text-[10px] text-gray-400">#{v.id}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">{v.email}</td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">
                                            {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "N/A"}
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={v.verificationStatus} /></td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="inline-flex items-center gap-2">
                                                <Button
                                                    onClick={() => openVendorLocation(v)}
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-[10px] font-bold uppercase tracking-widest"
                                                >
                                                    <MapPin className="w-3 h-3 mr-1" /> Location
                                                </Button>
                                                <Button
                                                    onClick={() => { setSelectedVendor(v); setDocValidation({}); }}
                                                    size="sm"
                                                    className="bg-black text-cyan-400 hover:bg-gray-800 text-[10px] font-bold uppercase tracking-widest"
                                                >
                                                    <Eye className="w-3 h-3 mr-1" /> Review File
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )
                        ) : activeTab === "drivers" ? (
                            filteredDrivers.length === 0 ? (
                                <tr><td colSpan={6} className="py-16 text-center">
                                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No {filter} drivers</p>
                                </td></tr>
                            ) : (
                                filteredDrivers.map((d) => (
                                    <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                                                {d.fullName.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-900">{d.fullName}</p>
                                                <p className="text-[10px] text-gray-400">#{d.id}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">{d.phone}</td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">{[d.vehicleType, (d as any).vehicleModelName, d.vehicleNumber].filter(Boolean).join(' • ') || '—'}</td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">
                                            {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "N/A"}
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={d.verificationStatus} /></td>
                                        <td className="px-6 py-4 text-right">
                                            <Button
                                                onClick={() => { setSelectedDriver(d); setDocValidation({}); }}
                                                size="sm"
                                                className="bg-black text-cyan-400 hover:bg-gray-800 text-[10px] font-bold uppercase tracking-widest"
                                            >
                                                <Eye className="w-3 h-3 mr-1" /> Review File
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )
                        ) : (
                            filteredWorkers.length === 0 ? (
                                <tr><td colSpan={6} className="py-16 text-center">
                                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No {filter} workers</p>
                                </td></tr>
                            ) : (
                                filteredWorkers.map((w) => (
                                    <tr key={w.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                                                {w.fullName.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-900">{w.fullName}</p>
                                                <p className="text-[10px] text-gray-400">{w.id.substring(0, 8)}…</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">{w.phone}</td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">{w.skill || '—'}</td>
                                        <td className="px-6 py-4 text-xs font-medium text-gray-600">
                                            {w.createdAt ? new Date(w.createdAt).toLocaleDateString() : "N/A"}
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={w.verificationStatus} /></td>
                                        <td className="px-6 py-4 text-right">
                                            <Button
                                                onClick={() => { setSelectedWorker(w); setDocValidation({}); }}
                                                size="sm"
                                                className="bg-black text-cyan-400 hover:bg-gray-800 text-[10px] font-bold uppercase tracking-widest"
                                            >
                                                <Eye className="w-3 h-3 mr-1" /> Review File
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )
                        )}
                    </tbody>
                </table>
            </Card>

            <RejectDialog
                open={rejectDialogOpen}
                onOpenChange={setRejectDialogOpen}
                reason={rejectionReason}
                onReasonChange={setRejectionReason}
                onConfirm={handleRejectConfirm}
                isPending={rejectVendorMutation.isPending || rejectDriverMutation.isPending || rejectWorkerMutation.isPending}
            />
        </div>
    );
}

// ---------- Reject Dialog ----------
function RejectDialog({ open, onOpenChange, reason, onReasonChange, onConfirm, isPending }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    reason: string; onReasonChange: (v: string) => void;
    onConfirm: () => void; isPending: boolean;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reject Application</DialogTitle>
                    <DialogDescription>
                        Please provide a reason for rejection. The applicant will see this reason.
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    placeholder="Enter rejection reason..."
                    value={reason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    rows={4}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={onConfirm}
                        disabled={!reason.trim() || isPending}
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <XCircle className="w-4 h-4 mr-1" />}
                        Confirm Rejection
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
