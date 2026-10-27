'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, formatTanggal } from '@/lib/format';
import { 
  Users, 
  Search, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  CreditCard, 
  Edit3, 
  X, 
  RefreshCw,
  Phone,
  MapPin,
  ShieldCheck
} from 'lucide-react';

interface PelangganItem {
  id: string;
  kode: string;
  nama_toko: string;
  telepon: string | null;
  alamat: string | null;
  batas_kredit: number;
  termin_hari: 0 | 7 | 14 | 30;
  aktif: boolean;
  dibuat_pada: string;
  piutang_berjalan?: number;
  has_overdue?: boolean;
}

export default function PelangganPage() {
  const { profile } = useAuth();
  const [pelangganList, setPelangganList] = useState<PelangganItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'semua' | 'lewat_tempo' | 'nonaktif'>('semua');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [showTambahModal, setShowTambahModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPelanggan, setSelectedPelanggan] = useState<PelangganItem | null>(null);

  // Form State Tambah
  const [formKode, setFormKode] = useState('');
  const [formNamaToko, setFormNamaToko] = useState('');
  const [formTelepon, setFormTelepon] = useState('');
  const [formAlamat, setFormAlamat] = useState('');
  const [formBatasKredit, setFormBatasKredit] = useState<number>(0);
  const [formTermin, setFormTermin] = useState<0 | 7 | 14 | 30>(14);
  const [formAktif, setFormAktif] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();
  const isManager = profile?.peran === 'manajer';

  const fetchPelanggan = async () => {
    try {
      setLoading(true);
      setActionMsg(null);

      // 1. Ambil data pelanggan
      const { data: pelangganData, error: pError } = await supabase
        .from('pelanggan')
        .select('*')
        .order('kode', { ascending: true });

      if (pError) throw pError;

      // 2. Ambil data pesanan berstatus dikonfirmasi dan dikirim untuk hitung piutang berjalan & overdue
      const { data: activeOrders, error: oError } = await supabase
        .from('pesanan_jual')
        .select('pelanggan_id, total, status, jatuh_tempo')
        .in('status', ['dikonfirmasi', 'dikirim']);

      if (oError) throw oError;

      const todayStr = new Date().toISOString().split('T')[0];

      // Petakan piutang berjalan dan tagihan lewat tempo per pelanggan
      const piutangMap: Record<string, { total: number; hasOverdue: boolean }> = {};

      activeOrders?.forEach((order) => {
        if (!piutangMap[order.pelanggan_id]) {
          piutangMap[order.pelanggan_id] = { total: 0, hasOverdue: false };
        }
        piutangMap[order.pelanggan_id].total += Number(order.total) || 0;

        // Tagihan lewat jatuh tempo jika status dikirim dan jatuh_tempo < hari ini
        if (order.status === 'dikirim' && order.jatuh_tempo && order.jatuh_tempo < todayStr) {
          piutangMap[order.pelanggan_id].hasOverdue = true;
        }
      });

      const mapped: PelangganItem[] = (pelangganData || []).map((p) => ({
        ...p,
        piutang_berjalan: piutangMap[p.id]?.total || 0,
        has_overdue: piutangMap[p.id]?.hasOverdue || false,
      }));

      setPelangganList(mapped);
    } catch (err: unknown) {
      console.error('Error fetching pelanggan:', err);
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat data pelanggan',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      fetchPelanggan();
    }
  }, [profile]);

  // Filter Data
  const filteredPelanggan = useMemo(() => {
    return pelangganList.filter((item) => {
      const matchSearch =
        item.nama_toko.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.kode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.alamat && item.alamat.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (filterTab === 'lewat_tempo') {
        return item.has_overdue;
      }
      if (filterTab === 'nonaktif') {
        return !item.aktif;
      }
      return true;
    });
  }, [pelangganList, searchQuery, filterTab]);

  // Statistik Ringkas
  const stats = useMemo(() => {
    const total = pelangganList.length;
    const totalPiutang = pelangganList.reduce((acc, p) => acc + (p.piutang_berjalan || 0), 0);
    const overdueCount = pelangganList.filter((p) => p.has_overdue).length;
    return { total, totalPiutang, overdueCount };
  }, [pelangganList]);

  // Handler Buka Modal Edit
  const openEditModal = (p: PelangganItem) => {
    setSelectedPelanggan(p);
    setFormKode(p.kode);
    setFormNamaToko(p.nama_toko);
    setFormTelepon(p.telepon || '');
    setFormAlamat(p.alamat || '');
    setFormBatasKredit(p.batas_kredit);
    setFormTermin(p.termin_hari);
    setFormAktif(p.aktif);
    setShowEditModal(true);
  };

  // Submit Tambah Pelanggan (Staf Penjualan limit Rp0, Manajer bebas atur)
  const handleTambahPelanggan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (!formKode.trim() || !formNamaToko.trim()) {
        throw new Error('Kode dan Nama Toko wajib diisi.');
      }

      // BR-05: Pelanggan baru dari Staf Penjualan mendapat batas kredit Rp0
      const batasKreditFinal = isManager ? formBatasKredit : 0;
      const terminFinal = isManager ? formTermin : 0;

      const { error } = await supabase.from('pelanggan').insert({
        kode: formKode.trim().toUpperCase(),
        nama_toko: formNamaToko.trim(),
        telepon: formTelepon.trim() || null,
        alamat: formAlamat.trim() || null,
        batas_kredit: batasKreditFinal,
        termin_hari: terminFinal,
        aktif: true,
        dibuat_oleh: profile?.id,
      });

      if (error) throw error;

      setActionMsg({
        type: 'success',
        text: `Pelanggan ${formNamaToko} (${formKode}) berhasil didaftarkan.`,
      });
      setShowTambahModal(false);
      fetchPelanggan();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mendaftarkan pelanggan.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Edit Pelanggan (Hanya Manajer yang boleh ubah batas kredit & termin, BR-05 & BR-12)
  const handleEditPelanggan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPelanggan) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      // Jika Manajer mengubah batas kredit atau termin, gunakan RPC untuk mencatat audit log
      if (
        isManager &&
        (formBatasKredit !== selectedPelanggan.batas_kredit ||
          formTermin !== selectedPelanggan.termin_hari)
      ) {
        const { error: rpcErr } = await supabase.rpc('ubah_batas_kredit_pelanggan', {
          p_pelanggan_id: selectedPelanggan.id,
          p_batas_kredit_baru: formBatasKredit,
          p_termin_hari_baru: formTermin,
        });

        if (rpcErr) {
          console.warn('RPC ubah_batas_kredit_pelanggan fallback:', rpcErr);
        }
      }

      // Update data umum pelanggan
      const updateData: Record<string, unknown> = {
        nama_toko: formNamaToko.trim(),
        telepon: formTelepon.trim() || null,
        alamat: formAlamat.trim() || null,
      };

      if (isManager) {
        updateData.batas_kredit = formBatasKredit;
        updateData.termin_hari = formTermin;
        updateData.aktif = formAktif;
      }

      const { error } = await supabase
        .from('pelanggan')
        .update(updateData)
        .eq('id', selectedPelanggan.id);

      if (error) throw error;

      setActionMsg({
        type: 'success',
        text: `Data pelanggan ${selectedPelanggan.nama_toko} berhasil diperbarui.`,
      });
      setShowEditModal(false);
      fetchPelanggan();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memperbarui data pelanggan.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data Pelanggan</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {pelangganList.length} Toko Terdaftar
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manajemen toko kelontong & minimarket, batas kredit, dan pemantauan piutang berjalan
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPelanggan}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setFormKode(`PLG-${String(pelangganList.length + 1).padStart(3, '0')}`);
              setFormNamaToko('');
              setFormTelepon('');
              setFormAlamat('');
              setFormBatasKredit(isManager ? 10000000 : 0);
              setFormTermin(14);
              setShowTambahModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Pelanggan</span>
          </button>
        </div>
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

      {/* 3 Kartu Ringkasan KPI Pelanggan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Toko Aktif</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total} Pelanggan</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Piutang Berjalan</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatRupiah(stats.totalPiutang)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Tagihan Lewat Tempo</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{stats.overdueCount} Toko</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(
            [
              { id: 'semua', label: 'Semua Pelanggan' },
              { id: 'lewat_tempo', label: `Lewat Tempo (${stats.overdueCount})` },
              { id: 'nonaktif', label: 'Nonaktif' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                filterTab === tab.id
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
            placeholder="Cari nama toko, kode, atau alamat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
          />
        </div>
      </div>

      {/* Tabel Data Pelanggan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-none">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-3">Nama Toko & Kontak</th>
                <th className="py-3 px-2 text-center">Termin</th>
                <th className="py-3 px-3 text-right">Batas Kredit</th>
                <th className="py-3 px-3 text-right">Piutang Berjalan</th>
                <th className="py-3 px-3 text-right">Sisa Limit</th>
                <th className="py-3 px-2 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data pelanggan...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredPelanggan.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Tidak ada pelanggan yang cocok dengan pencarian/filter.
                  </td>
                </tr>
              ) : (
                filteredPelanggan.map((p) => {
                  const piutang = p.piutang_berjalan || 0;
                  const sisaLimit = p.batas_kredit - piutang;
                  const isLimitHabis = sisaLimit <= 0 && p.batas_kredit > 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {p.kode}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900 leading-snug">{p.nama_toko}</p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          {p.telepon && (
                            <span className="flex items-center gap-1 whitespace-nowrap">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {p.telepon}
                            </span>
                          )}
                          {p.alamat && (
                            <span className="flex items-center gap-1 truncate max-w-[180px]" title={p.alamat}>
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              {p.alamat}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[10px] font-medium">
                          {p.termin_hari === 0 ? 'Tunai' : `${p.termin_hari} hr`}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-slate-900 whitespace-nowrap">
                        {formatRupiah(p.batas_kredit)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                        {formatRupiah(piutang)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium whitespace-nowrap">
                        <span className={isLimitHabis ? 'text-rose-600 font-bold' : sisaLimit < 2000000 ? 'text-amber-600' : 'text-emerald-700'}>
                          {formatRupiah(sisaLimit)}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        {p.has_overdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <Clock className="w-3 h-3 text-rose-600" />
                            Lewat Tempo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Lancar
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                          title="Edit Pelanggan"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Tambah Pelanggan Baru */}
      {showTambahModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Tambah Pelanggan Baru</h3>
              <button onClick={() => setShowTambahModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTambahPelanggan} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kode Pelanggan</label>
                <input
                  type="text"
                  required
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono uppercase focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Toko / Usaha</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Toko Maju Jaya"
                  value={formNamaToko}
                  onChange={(e) => setFormNamaToko(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor Telepon / WhatsApp</label>
                <input
                  type="text"
                  placeholder="Contoh: 0812-3456-7890"
                  value={formTelepon}
                  onChange={(e) => setFormTelepon(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Kirim Lengkap</label>
                <textarea
                  rows={2}
                  placeholder="Alamat toko, kecamatan, kota..."
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              {/* Batas Kredit: Khusus Manajer bisa set, Sales dikunci Rp0 sesuai BR-05 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Batas Kredit</label>
                  </div>
                  <input
                    type="number"
                    min={0}
                    disabled={!isManager}
                    value={isManager ? formBatasKredit : 0}
                    onChange={(e) => setFormBatasKredit(parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-semibold ${
                      !isManager ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'
                    }`}
                  />
                  {!isManager && (
                    <p className="text-[10px] text-amber-600 mt-1 leading-tight">
                      Default Rp0 (Hanya Manajer yang berhak memberi plafon kredit)
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Termin Bayar</label>
                  <select
                    disabled={!isManager}
                    value={formTermin}
                    onChange={(e) => setFormTermin(parseInt(e.target.value) as 0 | 7 | 14 | 30)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium ${
                      !isManager ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'
                    }`}
                  >
                    <option value={0}>Tunai (0 hari)</option>
                    <option value={7}>7 Hari</option>
                    <option value={14}>14 Hari</option>
                    <option value={30}>30 Hari</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTambahModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Daftarkan Pelanggan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Pelanggan (Batas kredit & termin hanya bisa diedit Manajer) */}
      {showEditModal && selectedPelanggan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Edit Toko {selectedPelanggan.kode}</h3>
                <p className="text-[11px] text-slate-500">
                  {isManager ? 'Akses Penuh Manajer (Plafon & Termin)' : 'Staf Penjualan: Hanya edit kontak'}
                </p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditPelanggan} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Toko</label>
                <input
                  type="text"
                  required
                  value={formNamaToko}
                  onChange={(e) => setFormNamaToko(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor Telepon</label>
                <input
                  type="text"
                  value={formTelepon}
                  onChange={(e) => setFormTelepon(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Toko</label>
                <textarea
                  rows={2}
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              {/* Batas Kredit & Termin: Khusus Manajer (BR-05 & BR-12) */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Batas Kredit (Rp)</label>
                  </div>
                  <input
                    type="number"
                    min={0}
                    disabled={!isManager}
                    value={formBatasKredit}
                    onChange={(e) => setFormBatasKredit(parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-semibold ${
                      !isManager ? 'bg-slate-200/60 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'
                    }`}
                  />
                  {!isManager && (
                    <span className="text-[10px] text-slate-400 mt-1 block">Khusus Manajer</span>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Termin Bayar</label>
                  <select
                    disabled={!isManager}
                    value={formTermin}
                    onChange={(e) => setFormTermin(parseInt(e.target.value) as 0 | 7 | 14 | 30)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium ${
                      !isManager ? 'bg-slate-200/60 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'
                    }`}
                  >
                    <option value={0}>0 hari (Tunai)</option>
                    <option value={7}>7 hari</option>
                    <option value={14}>14 hari</option>
                    <option value={30}>30 hari</option>
                  </select>
                </div>
              </div>

              {isManager && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Pelanggan</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={formAktif}
                        onChange={() => setFormAktif(true)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-medium text-slate-800">Aktif (Bisa dilayani)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!formAktif}
                        onChange={() => setFormAktif(false)}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span className="font-medium text-rose-700">Nonaktif</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
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
