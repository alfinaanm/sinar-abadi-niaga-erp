'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, formatTanggalWaktu } from '@/lib/format';
import { 
  Package, 
  Search, 
  Plus, 
  AlertTriangle, 
  History, 
  SlidersHorizontal, 
  Edit3, 
  CheckCircle2, 
  X, 
  RefreshCw,
  Info,
  ShieldAlert
} from 'lucide-react';

interface BarangItem {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  harga_jual: number;
  harga_pokok?: number | null;
  stok: number;
  stok_minimum: number;
  aktif: boolean;
  diperbarui_pada: string;
}

interface MutasiRow {
  id: number;
  jenis: 'masuk' | 'keluar' | 'batal' | 'penyesuaian';
  jumlah: number;
  stok_sesudah: number;
  nomor_dokumen: string;
  alasan: string | null;
  dibuat_pada: string;
  pelaku?: {
    nama_lengkap: string;
  };
}

export default function BarangPage() {
  const { profile } = useAuth();
  const [barangList, setBarangList] = useState<BarangItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'semua' | 'menipis' | 'habis' | 'nonaktif'>('semua');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [selectedBarang, setSelectedBarang] = useState<BarangItem | null>(null);
  const [showTambahModal, setShowTambahModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showKartuModal, setShowKartuModal] = useState(false);

  // Form State Tambah / Edit
  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formSatuan, setFormSatuan] = useState('dus');
  const [formHargaJual, setFormHargaJual] = useState<number>(0);
  const [formStokMin, setFormStokMin] = useState<number>(5);
  const [formAktif, setFormAktif] = useState(true);

  // Form State Penyesuaian Stok
  const [stokFisik, setStokFisik] = useState<number>(0);
  const [alasanAdjust, setAlasanAdjust] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // State Kartu Stok
  const [mutasiList, setMutasiList] = useState<MutasiRow[]>([]);
  const [loadingMutasi, setLoadingMutasi] = useState(false);

  const supabase = createClient();
  const isManager = profile?.peran === 'manajer';
  const isGudang = profile?.peran === 'gudang';
  const canAdjustStock = isManager || isGudang;

  const fetchBarang = async () => {
    try {
      setLoading(true);
      setActionMsg(null);

      // Gunakan v_barang untuk keamanan otomatis RLS & Data Masking HPP
      const { data, error } = await supabase
        .from('v_barang')
        .select('*')
        .order('kode', { ascending: true });

      if (error) {
        // Fallback ke tabel barang jika view belum tersedia
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('barang')
          .select('id, kode, nama, satuan, harga_jual, stok, stok_minimum, aktif, diperbarui_pada')
          .order('kode', { ascending: true });

        if (fallbackErr) throw fallbackErr;
        setBarangList(fallbackData as BarangItem[]);
      } else {
        setBarangList(data as BarangItem[]);
      }
    } catch (err: unknown) {
      console.error('Error fetching barang:', err);
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat data barang',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      fetchBarang();
    }
  }, [profile]);

  // Filter Data
  const filteredBarang = useMemo(() => {
    return barangList.filter((item) => {
      const matchSearch =
        item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.kode.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      if (filterTab === 'menipis') {
        return item.aktif && item.stok <= item.stok_minimum && item.stok > 0;
      }
      if (filterTab === 'habis') {
        return item.aktif && item.stok === 0;
      }
      if (filterTab === 'nonaktif') {
        return !item.aktif;
      }
      return true;
    });
  }, [barangList, searchQuery, filterTab]);

  // Statistik Ringkas
  const stats = useMemo(() => {
    const total = barangList.length;
    const menipis = barangList.filter((b) => b.aktif && b.stok <= b.stok_minimum).length;
    const habis = barangList.filter((b) => b.aktif && b.stok === 0).length;
    return { total, menipis, habis };
  }, [barangList]);

  // Handler Buka Modal Edit
  const openEditModal = (b: BarangItem) => {
    setSelectedBarang(b);
    setFormKode(b.kode);
    setFormNama(b.nama);
    setFormSatuan(b.satuan);
    setFormHargaJual(b.harga_jual);
    setFormStokMin(b.stok_minimum);
    setFormAktif(b.aktif);
    setShowEditModal(true);
  };

  // Handler Buka Modal Penyesuaian Stok
  const openAdjustModal = (b: BarangItem) => {
    setSelectedBarang(b);
    setStokFisik(b.stok);
    setAlasanAdjust('');
    setShowAdjustModal(true);
  };

  // Handler Buka Modal Kartu Stok
  const openKartuStok = async (b: BarangItem) => {
    setSelectedBarang(b);
    setShowKartuModal(true);
    setLoadingMutasi(true);
    try {
      const { data, error } = await supabase
        .from('mutasi_stok')
        .select(`
          id,
          jenis,
          jumlah,
          stok_sesudah,
          nomor_dokumen,
          alasan,
          dibuat_pada,
          pelaku:dibuat_oleh ( nama_lengkap )
        `)
        .eq('barang_id', b.id)
        .order('id', { ascending: false });

      if (error) throw error;
      setMutasiList((data as unknown as MutasiRow[]) || []);
    } catch (err: unknown) {
      console.error('Error fetching mutasi:', err);
    } finally {
      setLoadingMutasi(false);
    }
  };

  // Submit Tambah Barang (Hanya Manajer)
  const handleTambahBarang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (!formKode.trim() || !formNama.trim() || formHargaJual <= 0) {
        throw new Error('Mohon isi kode, nama, dan harga jual yang valid (> Rp0).');
      }

      const { error } = await supabase.from('barang').insert({
        kode: formKode.trim().toUpperCase(),
        nama: formNama.trim(),
        satuan: formSatuan,
        harga_jual: formHargaJual,
        stok: 0,
        stok_minimum: formStokMin,
        aktif: true,
      });

      if (error) throw error;

      setActionMsg({ type: 'success', text: `Barang ${formKode} berhasil ditambahkan.` });
      setShowTambahModal(false);
      fetchBarang();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menambah barang.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Edit Barang
  const handleEditBarang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarang) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      const updatePayload: Partial<BarangItem> = {
        nama: formNama.trim(),
        satuan: formSatuan,
        stok_minimum: formStokMin,
        aktif: formAktif,
      };

      // Hanya Manajer yang boleh mengubah harga jual (BR-01)
      if (isManager) {
        if (formHargaJual <= 0) {
          throw new Error('Harga jual harus lebih dari Rp0.');
        }
        if (formHargaJual !== selectedBarang.harga_jual) {
          // Panggil RPC ubah_harga_jual agar tercatat di audit log
          const { error: rpcErr } = await supabase.rpc('ubah_harga_jual', {
            p_barang_id: selectedBarang.id,
            p_harga_jual_baru: formHargaJual,
          });
          if (rpcErr) {
            // fallback update langsung jika RPC belum tersedia
            updatePayload.harga_jual = formHargaJual;
          }
        }
      }

      const { error } = await supabase
        .from('barang')
        .update(updatePayload)
        .eq('id', selectedBarang.id);

      if (error) throw error;

      setActionMsg({ type: 'success', text: `Data barang ${selectedBarang.kode} berhasil diperbarui.` });
      setShowEditModal(false);
      fetchBarang();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memperbarui barang.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Penyesuaian Stok (BR-11)
  const handleAdjustStok = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarang) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (stokFisik < 0) {
        throw new Error('Stok fisik hasil penyesuaian tidak boleh bernilai negatif.');
      }
      if (alasanAdjust.trim().length < 10) {
        throw new Error('Alasan penyesuaian wajib diisi minimal 10 karakter.');
      }

      const { data, error } = await supabase.rpc('sesuaikan_stok', {
        p_barang_id: selectedBarang.id,
        p_stok_fisik: stokFisik,
        p_alasan: alasanAdjust.trim(),
      });

      if (error) throw error;

      setActionMsg({
        type: 'success',
        text: (data as { message?: string })?.message || `Penyesuaian stok ${selectedBarang.kode} berhasil disimpan.`,
      });
      setShowAdjustModal(false);
      fetchBarang();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyesuaikan stok.',
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
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Barang dan Stok</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {barangList.length} Barang
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Katalog barang sembako, pemantauan stok real-time gudang, dan kartu mutasi
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBarang}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isManager && (
            <button
              onClick={() => {
                setFormKode(`BRG-${String(barangList.length + 1).padStart(3, '0')}`);
                setFormNama('');
                setFormSatuan('dus');
                setFormHargaJual(100000);
                setFormStokMin(5);
                setShowTambahModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Barang</span>
            </button>
          )}
        </div>
      </div>

      {/* Pesan Aksi */}
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
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            )}
            <span>{actionMsg.text}</span>
          </div>
          <button onClick={() => setActionMsg(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3 Kartu Ringkasan Stok */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Produk</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total} Item</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Stok Menipis (≤ Min)</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{stats.menipis} Barang</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Stok Habis (0)</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{stats.habis} Barang</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(
            [
              { id: 'semua', label: 'Semua Barang' },
              { id: 'menipis', label: `Menipis (${stats.menipis})` },
              { id: 'habis', label: `Habis (${stats.habis})` },
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
            placeholder="Cari kode atau nama barang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
          />
        </div>
      </div>

      {/* Tabel Barang */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4 text-center">Satuan</th>
                <th className="py-3 px-4 text-right">Stok Fisik</th>
                <th className="py-3 px-4 text-right">Min</th>
                <th className="py-3 px-4 text-right">Harga Jual</th>
                {isManager && (
                  <th className="py-3 px-4 text-right text-blue-700 bg-blue-50/50">
                    Harga Pokok (HPP)
                  </th>
                )}
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isManager ? 9 : 8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Memuat katalog barang...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBarang.length === 0 ? (
                <tr>
                  <td colSpan={isManager ? 9 : 8} className="py-12 text-center text-slate-400">
                    Tidak ada barang yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredBarang.map((b) => {
                  const isMenipis = b.aktif && b.stok <= b.stok_minimum && b.stok > 0;
                  const isHabis = b.aktif && b.stok === 0;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {b.kode}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {b.nama}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-600">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px]">
                          {b.satuan}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        <div className="flex items-center justify-end gap-1.5">
                          <span
                            className={
                              isHabis
                                ? 'text-rose-600 font-bold'
                                : isMenipis
                                ? 'text-amber-600 font-bold'
                                : 'text-slate-800'
                            }
                          >
                            {b.stok}
                          </span>
                          {isHabis && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 font-bold">
                              Habis
                            </span>
                          )}
                          {isMenipis && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-bold">
                              Menipis
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500 font-mono">
                        {b.stok_minimum}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900">
                        {formatRupiah(b.harga_jual)}
                      </td>
                      {isManager && (
                        <td className="py-3 px-4 text-right font-mono font-semibold text-blue-900 bg-blue-50/30">
                          {b.harga_pokok ? formatRupiah(b.harga_pokok) : '-'}
                        </td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.aktif
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {b.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Tombol Kartu Stok (Semua Peran) */}
                          <button
                            onClick={() => openKartuStok(b)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                            title="Lihat Riwayat Kartu Stok"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Tombol Penyesuaian Stok (Gudang & Manajer) */}
                          {canAdjustStock && (
                            <button
                              onClick={() => openAdjustModal(b)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 transition-colors"
                              title="Penyesuaian Stok Opname"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Tombol Edit Barang (Gudang data non-harga, Manajer penuh) */}
                          {(isManager || isGudang) && (
                            <button
                              onClick={() => openEditModal(b)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                              title="Edit Data Barang"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Tambah Barang Baru (Manajer Only) */}
      {showTambahModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Tambah Barang Baru</h3>
              <button onClick={() => setShowTambahModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTambahBarang} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kode Barang</label>
                <input
                  type="text"
                  required
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono uppercase focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Barang & Kemasan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Minyak Goreng Pouch 2 L isi 6"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Satuan</label>
                  <select
                    value={formSatuan}
                    onChange={(e) => setFormSatuan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="dus">dus</option>
                    <option value="bal">bal</option>
                    <option value="karung">karung</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stok Minimum</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formStokMin}
                    onChange={(e) => setFormStokMin(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Harga Jual (Rp)</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formHargaJual}
                  onChange={(e) => setFormHargaJual(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-semibold focus:ring-2 focus:ring-blue-500"
                />
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
                  {submitting ? 'Menyimpan...' : 'Simpan Barang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Barang */}
      {showEditModal && selectedBarang && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Edit Barang {selectedBarang.kode}</h3>
                <p className="text-[11px] text-slate-500">
                  {isManager ? 'Akses Penuh Manajer' : 'Staf Gudang: Tidak boleh mengubah harga jual'}
                </p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditBarang} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Barang</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Satuan</label>
                  <select
                    value={formSatuan}
                    onChange={(e) => setFormSatuan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="dus">dus</option>
                    <option value="bal">bal</option>
                    <option value="karung">karung</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stok Minimum</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formStokMin}
                    onChange={(e) => setFormStokMin(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Harga Jual: Hanya bisa diedit Manajer (BR-01) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Harga Jual (Rp)</label>
                  {!isManager && (
                    <span className="text-[10px] text-amber-600 font-medium">Hanya Manajer yang bisa mengubah</span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  disabled={!isManager}
                  value={formHargaJual}
                  onChange={(e) => setFormHargaJual(parseInt(e.target.value) || 0)}
                  className={`w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-semibold ${
                    !isManager ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status Penjualan</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={formAktif}
                      onChange={() => setFormAktif(true)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-slate-800">Aktif (Bisa dipesan)</span>
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

      {/* MODAL 3: Penyesuaian Stok Fisik / Opname (BR-11) */}
      {showAdjustModal && selectedBarang && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Penyesuaian Stok (Hitung Fisik)</h3>
                <p className="text-[11px] text-slate-500 font-mono">{selectedBarang.kode} · {selectedBarang.nama}</p>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustStok} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500 font-medium">Stok Sistem Saat Ini</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{selectedBarang.stok} {selectedBarang.satuan}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-500 font-medium">Selisih Penyesuaian</p>
                  <p className={`text-xl font-bold mt-0.5 ${
                    stokFisik - selectedBarang.stok > 0
                      ? 'text-emerald-600'
                      : stokFisik - selectedBarang.stok < 0
                      ? 'text-rose-600'
                      : 'text-slate-500'
                  }`}>
                    {stokFisik - selectedBarang.stok > 0 ? `+${stokFisik - selectedBarang.stok}` : stokFisik - selectedBarang.stok}
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Stok Hasil Hitungan Fisik ({selectedBarang.satuan})
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={stokFisik}
                  onChange={(e) => setStokFisik(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-base font-bold font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Alasan Penyesuaian (Wajib minimal 10 karakter)
                  </label>
                  <span className={`text-[10px] font-mono ${
                    alasanAdjust.trim().length >= 10 ? 'text-emerald-600 font-bold' : 'text-slate-400'
                  }`}>
                    {alasanAdjust.trim().length}/10 karakter
                  </span>
                </div>
                <textarea
                  required
                  rows={3}
                  placeholder="Contoh: Hasil stok opname fisik akhir bulan ditemukan selisih barang rusak di rak B."
                  value={alasanAdjust}
                  onChange={(e) => setAlasanAdjust(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || alasanAdjust.trim().length < 10 || stokFisik === selectedBarang.stok}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Penyesuaian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Kartu Stok / Mutasi Stok (US-08, BR-11) */}
      {showKartuModal && selectedBarang && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Kartu Stok: {selectedBarang.kode}</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedBarang.nama} · Stok Saat Ini: <span className="font-bold text-slate-900">{selectedBarang.stok} {selectedBarang.satuan}</span>
                </p>
              </div>
              <button onClick={() => setShowKartuModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingMutasi ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span>Memuat mutasi kartu stok...</span>
                </div>
              ) : mutasiList.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  Belum ada catatan mutasi stok untuk barang ini.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">No. Dokumen</th>
                      <th className="py-2.5 px-3 text-center">Jenis</th>
                      <th className="py-2.5 px-3 text-right">Perubahan</th>
                      <th className="py-2.5 px-3 text-right">Sisa Stok</th>
                      <th className="py-2.5 px-3">Pelaku</th>
                      <th className="py-2.5 px-3">Keterangan / Alasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mutasiList.map((m) => {
                      const isPlus = m.jumlah > 0;
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 text-slate-500 font-mono whitespace-nowrap">
                            {formatTanggalWaktu(m.dibuat_pada)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-blue-700">
                            {m.nomor_dokumen}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.jenis === 'masuk'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.jenis === 'keluar'
                                ? 'bg-rose-100 text-rose-800'
                                : m.jenis === 'batal'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {m.jenis}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                            isPlus ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {isPlus ? `+${m.jumlah}` : m.jumlah}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                            {m.stok_sesudah}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {m.pelaku?.nama_lengkap || 'Sistem'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate" title={m.alasan || '-'}>
                            {m.alasan || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end flex-shrink-0">
              <button
                onClick={() => setShowKartuModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
