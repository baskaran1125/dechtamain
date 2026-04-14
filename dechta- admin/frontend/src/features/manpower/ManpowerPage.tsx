import { useState } from "react";
import { Loader2, User, Phone, Wrench, Briefcase, MapPin, Star, Clock, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { exportToCsv } from "@/utils/exportCsv";
import type { Manpower } from "@/types";

interface ManpowerPageProps {
    manpower: Manpower[] | undefined;
    manpowerLoading: boolean;
    filter?: 'all' | 'online' | 'offline';
    onFilterChange?: (filter: 'all' | 'online' | 'offline') => void;
}

export default function ManpowerPage({ manpower, manpowerLoading, filter = 'all', onFilterChange }: ManpowerPageProps) {
    const [selectedWorker, setSelectedWorker] = useState<Manpower | null>(null);
    const filteredManpower = (manpower ?? []).filter((worker) => {
        if (filter === 'online') {
            return worker.isOnline || worker.status === 'active' || worker.status === 'available';
        }
        if (filter === 'offline') {
            return !(worker.isOnline || worker.status === 'active' || worker.status === 'available');
        }
        return true;
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Manpower Management</h2>
                    <p className="text-sm text-gray-500 mt-1">All registered workers</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => exportToCsv(filteredManpower, [
                            { key: 'fullName', header: 'Name' },
                            { key: 'phone', header: 'Phone' },
                            { key: 'skill', header: 'Skill' },
                            { key: 'experience', header: 'Experience' },
                            { key: 'area', header: 'Area' },
                            { key: 'city', header: 'City' },
                            { key: 'state', header: 'State' },
                            { key: 'rating', header: 'Rating' },
                            { key: 'status', header: 'Status' },
                            { key: 'isOnline', header: 'Online' },
                        ], 'manpower_export')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-600 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" /> Export CSV
                    </button>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {(['all', 'online', 'offline'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => onFilterChange?.(f)}
                                className={`px-4 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${filter === f ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    <div className="text-sm font-semibold text-gray-600 px-4 py-2 bg-gray-100 rounded-lg">{filteredManpower.length} Workers</div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <Table className="w-full text-sm">
                        <TableHeader className="bg-gray-50 text-gray-600 border-b border-gray-200">
                            <TableRow>
                                <TableHead className="px-6 py-3 text-left font-semibold">Name</TableHead>
                                <TableHead className="px-6 py-3 text-left font-semibold">Phone</TableHead>
                                <TableHead className="px-6 py-3 text-left font-semibold">Skill</TableHead>
                                <TableHead className="px-6 py-3 text-left font-semibold">Experience</TableHead>
                                <TableHead className="px-6 py-3 text-left font-semibold">Location</TableHead>
                                <TableHead className="px-6 py-3 text-left font-semibold">Rating</TableHead>
                                <TableHead className="px-6 py-3 text-left font-semibold">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-gray-100">
                            {manpowerLoading ? (
                                <TableRow><TableCell colSpan={7} className="px-6 py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-500" /></TableCell></TableRow>
                            ) : filteredManpower.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="px-6 py-8 text-center text-gray-500 italic">No workers found</TableCell></TableRow>
                            ) : (
                                filteredManpower.map(worker => (
                                    <TableRow key={worker.id} className="hover:bg-cyan-50/30 transition-colors cursor-pointer" onClick={() => setSelectedWorker(worker)}>
                                        <TableCell className="px-6 py-4 font-medium text-cyan-700 hover:underline">{worker.fullName}</TableCell>
                                        <TableCell className="px-6 py-4 text-gray-600">{worker.phone}</TableCell>
                                        <TableCell className="px-6 py-4">
                                            {worker.skill ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {worker.skill.split(',').slice(0, 3).map((s, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 bg-cyan-50 text-cyan-700 text-xs rounded-md border border-cyan-100 whitespace-nowrap">
                                                            {s.trim()}
                                                        </span>
                                                    ))}
                                                    {worker.skill.split(',').length > 3 && (
                                                        <span className="px-2 py-0.5 bg-gray-50 text-gray-500 text-xs rounded-md border border-gray-200">
                                                            +{worker.skill.split(',').length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-600">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="px-6 py-4 text-gray-600">{worker.experience || '—'}</TableCell>
                                        <TableCell className="px-6 py-4 text-gray-600">{[worker.area, worker.city, worker.state].filter(Boolean).join(', ') || '—'}</TableCell>
                                        <TableCell className="px-6 py-4 text-gray-600">⭐ {worker.rating || '0'}</TableCell>
                                        <TableCell className="px-6 py-4">
                                            <StatusBadge
                                                label={worker.status}
                                                colorClass={
                                                    worker.status === 'available' ? 'bg-green-100 text-green-700' :
                                                    worker.status === 'busy' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-gray-100 text-gray-700'
                                                }
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) }
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Worker Detail Modal */}
            <Dialog open={!!selectedWorker} onOpenChange={(open) => !open && setSelectedWorker(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-gray-900">Worker Details</DialogTitle>
                    </DialogHeader>
                    {selectedWorker && (
                        <div className="space-y-4 mt-2">
                            <div className="flex items-center gap-3 pb-4 border-b">
                                <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center">
                                    <User className="w-6 h-6 text-cyan-600" />
                                </div>
                                <div>
                                    <div className="font-semibold text-lg text-gray-900">{selectedWorker.fullName}</div>
                                    <StatusBadge
                                        label={selectedWorker.status}
                                        colorClass={
                                            selectedWorker.status === 'available' ? 'bg-green-100 text-green-700' :
                                            selectedWorker.status === 'busy' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-gray-100 text-gray-700'
                                        }
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 text-sm">
                                <div className="flex items-center gap-3">
                                    <Phone className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-500">Phone:</span>
                                    <span className="font-medium text-gray-900">{selectedWorker.phone}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Wrench className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-500">Skills:</span>
                                    <div className="flex flex-wrap gap-1">
                                        {selectedWorker.skill ? selectedWorker.skill.split(',').map((s, idx) => (
                                            <span key={idx} className="px-2 py-0.5 bg-cyan-50 text-cyan-700 text-xs rounded-md border border-cyan-100">
                                                {s.trim()}
                                            </span>
                                        )) : <span className="font-medium text-gray-900">—</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Briefcase className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-500">Experience:</span>
                                    <span className="font-medium text-gray-900">{selectedWorker.experience || '—'}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <MapPin className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-500">Location:</span>
                                    <span className="font-medium text-gray-900">{[selectedWorker.area, selectedWorker.city, selectedWorker.state].filter(Boolean).join(', ') || '—'}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Star className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-500">Rating:</span>
                                    <span className="font-medium text-gray-900">⭐ {selectedWorker.rating || '0'} ({selectedWorker.reviewsCount || '0'} reviews)</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Clock className="w-4 h-4 text-gray-400" />
                                    <span className="text-gray-500">Joined:</span>
                                    <span className="font-medium text-gray-900">{selectedWorker.createdAt ? new Date(selectedWorker.createdAt).toLocaleDateString() : '—'}</span>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-3 border-t text-sm">
                                <div className={`px-3 py-1 rounded-full ${selectedWorker.isApproved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {selectedWorker.isApproved ? 'Approved' : 'Pending Approval'}
                                </div>
                                <div className={`px-3 py-1 rounded-full ${selectedWorker.isOnline ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {selectedWorker.isOnline ? 'Online' : 'Offline'}
                                </div>
                                {selectedWorker.isFrozen && (
                                    <div className="px-3 py-1 rounded-full bg-red-100 text-red-700">Frozen</div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
