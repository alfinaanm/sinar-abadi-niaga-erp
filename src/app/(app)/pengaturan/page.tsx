'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatTanggalWaktu } from '@/lib/format';
import { formatPeran } from '@/lib/peran';
import { PeranUser } from '@/types/database';
import { 
  Settings, 
  Users, 
  FileText, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  X, 
  RefreshCw,
  Search,
  Filter,
  ShieldAlert
} from 'lucide-react';

interface ProfileItem {
  id: string;
  nama_lengkap: string;
  peran: PeranUser;
  aktif: boolean;
  dibuat_pada: string;
}

interface AuditLogRow {
  id: number;
  pelaku_id: string | null;
  aksi: string;
  nama_tabel: string;
  data_id: string;
  nilai_lama: Record<string, unknown> | null;
  nilai_baru: Record<string, unknown>;
  dibuat_pada: string;
  pelaku?: {
    nama_lengkap: string;
  };
}

export default function PengaturanPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [profilesList, setProfilesList] = useState<ProfileItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State Edit Pengguna
  const [selectedUser, setSelectedUser] = useState<ProfileItem | null>(null);
  const [formPeran, setFormPeran] = useState<PeranUser>('penjualan');
  const [formAktif, setFormAktif] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();
  const isManager = profile?.peran === 'manajer';

  const fetchData = async () => {
    try {
      setLoading(true);
      setActionMsg(null);

      // 1. Ambil data profil semua pengguna
      const { data: profData, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .order('dibuat_pada', { ascending: true });

      if (profError) throw profError;
      setProfilesList(profData as ProfileItem[]);

      // 2. Ambil data audit log dengan join nama pelaku
      const { data: logData, error: logError } = await supabase
        .from('audit_log')
        .select(`
          id,
          pelaku_id,
          aksi,
          nama_tabel,
          data_id,
          nilai_lama,
          nilai_baru,
          dibuat_pada,
          pelaku:pelaku_id ( nama_lengkap )
        `)
        .order('id', { ascending: false })
        .limit(100);

      if (logError) throw logError;
      setAuditLogs((logData as unknown as AuditLogRow[]) || []);
    } catch (err: unknown) {
      console.error('Error fetching pengaturan data:', err);
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat data pengaturan',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isManager) {
      fetchData();
    }
  }, [isManager]);

  // Filter Audit Log
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (actionFilter !== 'semua' && log.aksi !== actionFilter) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const namaPelaku = log.pelaku?.nama_lengkap?.toLowerCase() || '';
      const aksi = log.aksi.toLowerCase();
      const tabel = log.nama_tabel.toLowerCase();

      return namaPelaku.includes(q) || aksi.includes(q) || tabel.includes(q);
    });
  }, [auditLogs, actionFilter, searchQuery]);

  // Handler Buka Modal Edit User
  const openEditUser = (u: ProfileItem) => {
    setSelectedUser(u);
    setFormPeran(u.peran);
    setFormAktif(u.aktif);
  };

  // Submit Perubahan Akun (BR-12)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      // Panggil RPC ubah_peran_dan_status_user agar tercatat di audit log
      const { data, error } = await supabase.rpc('ubah_peran_dan_status_user', {
        p_target_user_id: selectedUser.id,
        p_peran_baru: formPeran,
        p_aktif_baru: formAktif,
      });

      if (error) {
        // Fallback update langsung
        const { error: updErr } = await supabase
          .from('profiles')
          .update({ peran: formPeran, aktif: formAktif })
          .eq('id', selectedUser.id);
        if (updErr) throw updErr;
      }

      setActionMsg({
        type: 'success',
        text: (data as { message?: string })?.message || `Pengaturan akun ${selectedUser.nama_lengkap} berhasil diperbarui.`,
      });
      setSelectedUser(null);
      fetchData();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memperbarui akun pengguna.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isManager) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4 pt-20">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Akses Terbatas: Khusus Manajer</h2>
        <p className="text-sm text-slate-500">
          Halaman Pengaturan Akun dan Jejak Audit Log hanya dapat diakses oleh Manajer (BR-12).
        </p>
      </div>
    );
  }

  // Helper Format Aksi Badge
  const formatAksiBadge = (aksi: string) => {
    switch (aksi) {
      case 'ubah_harga_jual':
        return { label: 'Ubah Harga Jual', cls: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'ubah_batas_kredit':
        return { label: 'Ubah Batas Kredit', cls: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'ubah_peran':
        return { label: 'Ubah Peran / Akun', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'setujui_pembelian':
        return { label: 'Setujui PO', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'tolak_pembelian':
        return { label: 'Tolak PO', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'batalkan_pesanan':
        return { label: 'Batalkan Pesanan', cls: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'penyesuaian_stok':
        return { label: 'Stok Opname', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'pelunasan':
        return { label: 'Catat Pelunasan', cls: 'bg-teal-100 text-teal-800 border-teal-200' };
      default:
        return { label: aksi.replace(/_/g, ' '), cls: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pengaturan Sistem</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              Khusus Manajer
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manajemen hak akses pengguna dan riwayat jejak audit (Audit Trail) seluruh aksi sensitif
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm self-start sm:self-auto"
          title="Muat ulang data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Pesan Status Aksi */}
      {actionMsg && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center justify-between gap-3 ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {actionMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            )}
            <span>{actionMsg.text}</span>
          </div>
          <button onClick={() => setActionMsg(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab Navigasi: Akun Pengguna vs Audit Log */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Pengguna & Peran ({profilesList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Jejak Audit Log ({auditLogs.length})</span>
        </button>
      </div>

      {activeTab === 'users' ? (
        /* TAB 1: Manajemen Akun Pengguna & Peran */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Daftar Akun Karyawan</h2>
              <p className="text-xs text-slate-500">Akun terdaftar dalam sistem CV Sinar Abadi Niaga</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Nama Pengguna</th>
                  <th className="py-3 px-4">Peran Hak Akses</th>
                  <th className="py-3 px-4 text-center">Status Akun</th>
                  <th className="py-3 px-4">Terdaftar Pada</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Memuat akun pengguna...</span>
                      </div>
                    </td>
                  </tr>
                ) : profilesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Tidak ada data pengguna.
                    </td>
                  </tr>
                ) : (
                  profilesList.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{user.nama_lengkap}</p>
                        {user.id === profile?.id && (
                          <span className="text-[10px] text-blue-600 font-bold">(Akun Anda Saat Ini)</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          {formatPeran(user.peran)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            user.aktif
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {user.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {formatTanggalWaktu(user.dibuat_pada)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => openEditUser(user)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 font-semibold text-[11px] transition-colors"
                        >
                          Ubah Hak Akses
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB 2: Jejak Audit Log (Audit Trail) */
        <div className="space-y-4">
          {/* Filter Bar Audit Log */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {(
                [
                  { id: 'semua', label: 'Semua Aksi' },
                  { id: 'ubah_harga_jual', label: 'Harga Jual' },
                  { id: 'ubah_batas_kredit', label: 'Batas Kredit' },
                  { id: 'penyesuaian_stok', label: 'Stok Opname' },
                  { id: 'setujui_pembelian', label: 'Setujui PO' },
                  { id: 'tolak_pembelian', label: 'Tolak PO' },
                  { id: 'batalkan_pesanan', label: 'Batal Pesanan' },
                  { id: 'pelunasan', label: 'Pelunasan' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActionFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    actionFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari pelaku, tabel, data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>

          {/* Tabel Audit Log */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Waktu (WIB)</th>
                    <th className="py-3 px-4">Pelaku</th>
                    <th className="py-3 px-4">Aksi Sensitif</th>
                    <th className="py-3 px-4">Tabel / Target</th>
                    <th className="py-3 px-4">Nilai Sebelum</th>
                    <th className="py-3 px-4">Nilai Sesudah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          <span>Memuat riwayat jejak audit...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Tidak ada riwayat audit log yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => {
                      const badge = formatAksiBadge(log.aksi);

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                            {formatTanggalWaktu(log.dibuat_pada)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {log.pelaku?.nama_lengkap || 'Sistem'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-medium">
                              {log.nama_tabel}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500 text-[11px] max-w-xs truncate" title={JSON.stringify(log.nilai_lama)}>
                            {log.nilai_lama ? JSON.stringify(log.nilai_lama) : '-'}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-900 text-[11px] max-w-xs truncate" title={JSON.stringify(log.nilai_baru)}>
                            {JSON.stringify(log.nilai_baru)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-500">
              Menampilkan {filteredAuditLogs.length} catatan audit log terakhir (Append-Only, tidak dapat diubah/dihapus).
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ubah Peran & Status Akun */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Kelola Hak Akses Pengguna</h3>
                <p className="text-[11px] text-slate-500">{selectedUser.nama_lengkap}</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pilih Peran Akun</label>
                <select
                  value={formPeran}
                  onChange={(e) => setFormPeran(e.target.value as PeranUser)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="penjualan">Staf Penjualan (Sales)</option>
                  <option value="gudang">Staf Gudang (Warehouse)</option>
                  <option value="manajer">Manajer (Owner/Administrator)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Peran menentukan akses menu, batas diskon, dan hak melihat harga pokok (HPP).
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status Aktivasi Akun</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={formAktif}
                      onChange={() => setFormAktif(true)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-slate-800">Aktif (Dapat Login)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!formAktif}
                      onChange={() => setFormAktif(false)}
                      disabled={selectedUser.id === profile?.id}
                      className="text-rose-600 focus:ring-rose-500 disabled:opacity-50"
                    />
                    <span className="font-medium text-rose-700">Nonaktif</span>
                  </label>
                </div>
                {selectedUser.id === profile?.id && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    Anda tidak dapat menonaktifkan akun Anda sendiri saat sedang masuk.
                  </p>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
