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
  ShieldAlert,
  Mail,
  Send,
  Eye,
  Check,
  Clock,
  Package,
  ExternalLink,
  Sparkles
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
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'email'>('users');
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

  // State Notifikasi Email (Fitur Nilai Tambah PRD Bab 11)
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatusData, setEmailStatusData] = useState<{
    lowStockCount: number;
    mode: string;
    sampleItems: any[];
    targetRoles: string[];
  } | null>(null);
  const [emailResult, setEmailResult] = useState<{
    success: boolean;
    mode: string;
    recipients: string[];
    itemCount: number;
    timestamp: string;
    subject: string;
    message: string;
    messageId?: string;
    htmlPreview?: string;
  } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');

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

      // 3. Ambil status notifikasi email
      try {
        const resEmail = await fetch('/api/notifications/email-stok');
        if (resEmail.ok) {
          const jsonEmail = await resEmail.json();
          setEmailStatusData(jsonEmail);
        }
      } catch (err) {
        console.warn('Gagal memuat status notifikasi email:', err);
      }
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

  // Handler Kirim Notifikasi Email Stok Menipis
  const handleSendStockEmail = async () => {
    try {
      setSendingEmail(true);
      setActionMsg(null);
      const res = await fetch('/api/notifications/email-stok', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim email notifikasi');

      setEmailResult(data);
      if (data.htmlPreview) {
        setPreviewHtml(data.htmlPreview);
      }
      setActionMsg({
        type: 'success',
        text: data.message || `Notifikasi email berhasil diproses untuk ${data.itemCount} barang.`,
      });

      // Muat ulang ringkasan status email
      const resStatus = await fetch('/api/notifications/email-stok');
      if (resStatus.ok) setEmailStatusData(await resStatus.json());
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengirim notifikasi email',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  // Handler Pratinjau Desain Template Email (HTML)
  const handleOpenEmailPreview = async () => {
    if (previewHtml) {
      setShowPreviewModal(true);
      return;
    }

    try {
      setSendingEmail(true);
      const res = await fetch('/api/notifications/email-stok?force=true', { method: 'POST' });
      const data = await res.json();
      if (data.htmlPreview) {
        setPreviewHtml(data.htmlPreview);
        setEmailResult(data);
        setShowPreviewModal(true);
      } else {
        throw new Error('Tidak ada data pratinjau');
      }
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: 'Gagal memuat pratinjau template email.',
      });
    } finally {
      setSendingEmail(false);
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

      {/* Tab Navigasi: Akun Pengguna vs Audit Log vs Notifikasi Email */}
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

        <button
          onClick={() => setActiveTab('email')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'email'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Notifikasi Email (Stok)</span>
          {emailStatusData && emailStatusData.lowStockCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white leading-none">
              {emailStatusData.lowStockCount}
            </span>
          )}
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

          <div className="overflow-x-auto scrollbar-none">
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
      ) : activeTab === 'audit' ? (
        /* TAB 2: Jejak Audit Log (Audit Trail) */
        <div className="space-y-4">
          {/* Filter Bar Audit Log */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
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
            <div className="overflow-x-auto scrollbar-none">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3 whitespace-nowrap">Waktu (WIB)</th>
                    <th className="py-3 px-3">Pelaku</th>
                    <th className="py-3 px-3">Aksi Sensitif</th>
                    <th className="py-3 px-3">Tabel / Target</th>
                    <th className="py-3 px-3">Nilai Sebelum</th>
                    <th className="py-3 px-3">Nilai Sesudah</th>
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
                          <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                            {formatTanggalWaktu(log.dibuat_pada)}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                            {log.pelaku?.nama_lengkap || 'Sistem'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-medium">
                              {log.nama_tabel}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-500 text-[11px] max-w-[150px] truncate" title={JSON.stringify(log.nilai_lama)}>
                            {log.nilai_lama ? JSON.stringify(log.nilai_lama) : '-'}
                          </td>
                          <td className="py-3 px-3 font-mono font-medium text-slate-900 text-[11px] max-w-[150px] truncate" title={JSON.stringify(log.nilai_baru)}>
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
      ) : (
        /* TAB 3: Layanan Notifikasi Email Stok Menipis (Fitur Nilai Tambah PRD Bab 11) */
        <div className="space-y-6">
          {/* 4 Kartu Metrik Notifikasi Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Kartu 1: Status Layanan */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[130px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status Layanan
                </span>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-lg font-bold text-slate-900">
                    {emailStatusData?.mode === 'resend' ? 'Resend API Aktif' : 'Mode Simulasi (Ready)'}
                  </p>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {emailStatusData?.mode === 'resend' ? 'Terkoneksi langsung ke inbox' : 'Sandbox aktif untuk pengujian'}
                </p>
              </div>
            </div>

            {/* Kartu 2: Jadwal Pengiriman */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[130px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Jadwal Otomatis
                </span>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Pukul 07:00 WIB</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Setiap pagi via endpoint /api/notifications
                </p>
              </div>
            </div>

            {/* Kartu 3: Target Penerima */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[130px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Target Penerima
                </span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Manajer & Gudang</p>
                <p className="text-xs text-slate-500 mt-1 font-medium truncate">
                  hendra@, agus@, joko@sinarabadi.test
                </p>
              </div>
            </div>

            {/* Kartu 4: Barang Menipis Terdeteksi */}
            <div className="bg-white p-5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-sm flex flex-col justify-between min-h-[130px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Stok Perlu Pengadaan
                </span>
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-rose-700">
                  {emailStatusData?.lowStockCount ?? 0} Barang
                </p>
                <p className="text-xs text-rose-600 mt-1 font-medium">
                  Kuantitas ≤ batas stok minimum
                </p>
              </div>
            </div>
          </div>

          {/* Panel Kontrol & Aksi Notifikasi Email */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  Kontrol Pengiriman Notifikasi Email
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sesuai <strong>PRD_ERP.md Bab 11.1</strong>: Kirim rekap email stok menipis secara instan dan periksa pratinjau template HTML.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleOpenEmailPreview}
                  disabled={sendingEmail}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-2 shadow-sm transition disabled:opacity-50"
                >
                  <Eye className="w-4 h-4 text-slate-500" />
                  <span>Pratinjau Template</span>
                </button>

                <button
                  onClick={handleSendStockEmail}
                  disabled={sendingEmail}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition disabled:opacity-50"
                >
                  {sendingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Memproses Pengiriman...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Kirim Notifikasi Email Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Hasil Eksekusi Pengiriman Terakhir */}
            {emailResult && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Hasil Eksekusi: {emailResult.message}</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700">
                    ID: {emailResult.messageId || 'simulasi'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-emerald-200/60">
                  <div>
                    <span className="text-emerald-700 font-medium">Subjek:</span>{' '}
                    <span className="font-semibold">{emailResult.subject}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-medium">Penerima ({emailResult.recipients?.length}):</span>{' '}
                    <span className="font-mono text-[11px]">{emailResult.recipients?.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-medium">Jumlah Barang:</span>{' '}
                    <span className="font-bold">{emailResult.itemCount} Item</span>
                  </div>
                </div>
              </div>
            )}

            {/* Catatan Kepatuhan Regulasi & Keamanan Data (BR-12) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-600">
              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Kepatuhan Aturan Bisnis & Rahasia Dagang (BR-12)
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
                <li>Template email tidak mencantumkan angka harga pokok (HPP) maupun margin barang, sehingga aman untuk Staf Gudang.</li>
                <li>Endpoint API otomatis diproteksi dan hanya mengirimkan email ke akun aktif berstatus Manajer dan Staf Gudang.</li>
                <li>Mendukung penyedia email API seperti Resend (`RESEND_API_KEY`) dan otomatis fallback ke mode simulasi sandbox bila kunci API belum diisi.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Pratinjau Desain Template Email (HTML) */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  Pratinjau Notifikasi Email Stok Menipis
                </h3>
                <p className="text-[11px] text-slate-500">
                  Desain responsif HTML yang diterima oleh Manajer dan Staf Gudang
                </p>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs shrink-0">
              <p><strong className="text-slate-700">Pengirim:</strong> CV Sinar Abadi Niaga &lt;notifikasi@sinarabadi.test&gt;</p>
              <p><strong className="text-slate-700">Kepada:</strong> hendra@sinarabadi.test, agus@sinarabadi.test, joko@sinarabadi.test</p>
              <p><strong className="text-slate-700">Subjek:</strong> [PERINGATAN STOK] Rekap Barang Menipis & Kritis - CV Sinar Abadi Niaga</p>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 p-2 bg-slate-100">
              <iframe
                title="Email Preview"
                srcDoc={previewHtml}
                className="w-full h-[460px] bg-white rounded-lg border-0 shadow-sm"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm"
              >
                Tutup Pratinjau
              </button>
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
