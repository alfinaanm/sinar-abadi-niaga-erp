'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, formatTanggal, getStatusPembelianBadge } from '@/lib/format';
import { 
  Truck, 
  Search, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  PackageCheck, 
  Ban, 
  X, 
  RefreshCw,
  Building2,
  DollarSign,
  Phone,
  MapPin,
  Edit3
} from 'lucide-react';

interface PembelianRow {
  id: string;
  nomor: string;
  pemasok_id: string;
  barang_id: string;
  jumlah_dipesan: number;
  jumlah_diterima: number | null;
  harga_beli_satuan: number | null;
  status: 'diajukan' | 'disetujui' | 'ditolak' | 'dibatalkan' | 'diterima';
  alasan_tolak: string | null;
  diajukan_pada: string;
  diajukan_oleh: string | null;
  diputuskan_pada: string | null;
  diterima_pada: string | null;
  pemasok?: {
    nama: string;
    kode: string;
  };
  barang?: {
    nama: string;
    kode: string;
    satuan: string;
  };
  pengaju?: {
    nama_lengkap: string;
  };
}

interface PemasokRow {
  id: string;
  kode: string;
  nama: string;
  telepon: string | null;
  alamat: string | null;
  aktif: boolean;
}

interface BarangOption {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
}

export default function PembelianPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'pembelian' | 'pemasok'>('pembelian');
  const [pembelianList, setPembelianList] = useState<PembelianRow[]>([]);
  const [pemasokList, setPemasokList] = useState<PemasokRow[]>([]);
  const [barangOptions, setBarangOptions] = useState<BarangOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('semua');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [showAjukanModal, setShowAjukanModal] = useState(false);
  const [showSetujuiModal, setShowSetujuiModal] = useState(false);
  const [showTolakModal, setShowTolakModal] = useState(false);
  const [showTerimaModal, setShowTerimaModal] = useState(false);
  const [showPemasokModal, setShowPemasokModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PembelianRow | null>(null);
  const [selectedPemasok, setSelectedPemasok] = useState<PemasokRow | null>(null);

  // Form State Ajukan PO
  const [formPemasokId, setFormPemasokId] = useState('');
  const [formBarangId, setFormBarangId] = useState('');
  const [formJumlahPesan, setFormJumlahPesan] = useState<number>(10);

  // Form State Aksi PO
  const [hargaBeliInput, setHargaBeliInput] = useState<number>(0);
  const [alasanTolakInput, setAlasanTolakInput] = useState('');
  const [jumlahTerimaInput, setJumlahTerimaInput] = useState<number>(0);

  // Form State Pemasok
  const [pemasokKode, setPemasokKode] = useState('');
  const [pemasokNama, setPemasokNama] = useState('');
  const [pemasokTelepon, setPemasokTelepon] = useState('');
  const [pemasokAlamat, setPemasokAlamat] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();
  const isManager = profile?.peran === 'manajer';

  const fetchData = async () => {
    try {
      setLoading(true);
      setActionMsg(null);

      // 1. Ambil data pembelian dengan join pemasok, barang, dan pengaju
      const { data: poData, error: poError } = await supabase
        .from('pembelian')
        .select(`
          id,
          nomor,
          pemasok_id,
          barang_id,
          jumlah_dipesan,
          jumlah_diterima,
          harga_beli_satuan,
          status,
          alasan_tolak,
          diajukan_pada,
          diajukan_oleh,
          diputuskan_pada,
          diterima_pada,
          pemasok:pemasok_id ( kode, nama ),
          barang:barang_id ( kode, nama, satuan ),
          pengaju:diajukan_oleh ( nama_lengkap )
        `)
        .order('diajukan_pada', { ascending: false });

      if (poError) throw poError;
      setPembelianList((poData as unknown as PembelianRow[]) || []);

      // 2. Ambil data pemasok
      const { data: supData, error: supError } = await supabase
        .from('pemasok')
        .select('*')
        .order('kode', { ascending: true });

      if (supError) throw supError;
      setPemasokList(supData as PemasokRow[]);

      // 3. Ambil opsi barang aktif
      const { data: brgData, error: brgError } = await supabase
        .from('barang')
        .select('id, kode, nama, satuan, stok')
        .eq('aktif', true)
        .order('kode', { ascending: true });

      if (brgError) throw brgError;
      setBarangOptions(brgData as BarangOption[]);

      // Inisialisasi default form ajukan jika belum ada
      if (supData && supData.length > 0 && !formPemasokId) {
        setFormPemasokId(supData[0].id);
      }
      if (brgData && brgData.length > 0 && !formBarangId) {
        setFormBarangId(brgData[0].id);
      }
    } catch (err: unknown) {
      console.error('Error fetching data pembelian:', err);
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat data pembelian',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      fetchData();
    }
  }, [profile]);

  // Filter Data PO
  const filteredPO = useMemo(() => {
    return pembelianList.filter((po) => {
      const matchSearch =
        po.nomor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (po.barang?.nama && po.barang.nama.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (po.pemasok?.nama && po.pemasok.nama.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (statusFilter !== 'semua' && po.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [pembelianList, searchQuery, statusFilter]);

  // Statistik PO
  const stats = useMemo(() => {
    const total = pembelianList.length;
    const diajukan = pembelianList.filter((p) => p.status === 'diajukan').length;
    const disetujui = pembelianList.filter((p) => p.status === 'disetujui').length;
    return { total, diajukan, disetujui };
  }, [pembelianList]);

  // Submit Ajukan Pembelian Baru (Staf Gudang & Manajer, BR-09)
  const handleAjukanPO = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (formJumlahPesan < 1 || formJumlahPesan > 10000) {
        throw new Error('Jumlah dipesan harus antara 1 sampai 10.000.');
      }

      // Coba panggil RPC ajukan_pembelian
      const { data, error } = await supabase.rpc('ajukan_pembelian', {
        p_pemasok_id: formPemasokId,
        p_barang_id: formBarangId,
        p_jumlah_dipesan: formJumlahPesan,
      });

      if (error) {
        // Fallback insert langsung
        const nextNum = `PO-${String(pembelianList.length + 1).padStart(5, '0')}`;
        const { error: insErr } = await supabase.from('pembelian').insert({
          nomor: nextNum,
          pemasok_id: formPemasokId,
          barang_id: formBarangId,
          jumlah_dipesan: formJumlahPesan,
          status: 'diajukan',
          diajukan_oleh: profile?.id,
        });
        if (insErr) throw insErr;
      }

      setActionMsg({
        type: 'success',
        text: (data as { message?: string })?.message || 'Pengajuan pembelian berhasil diajukan.',
      });
      setShowAjukanModal(false);
      fetchData();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengajukan pembelian.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Setujui PO (Manajer isi harga beli satuan, BR-09)
  const handleSetujuiPO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO || !isManager) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (hargaBeliInput <= 0) {
        throw new Error('Harga beli satuan wajib diisi dan harus lebih dari Rp0.');
      }

      const { data, error } = await supabase.rpc('setujui_pembelian', {
        p_pembelian_id: selectedPO.id,
        p_harga_beli_satuan: hargaBeliInput,
      });

      if (error) throw error;

      setActionMsg({
        type: 'success',
        text: (data as { message?: string })?.message || `PO ${selectedPO.nomor} disetujui.`,
      });
      setShowSetujuiModal(false);
      fetchData();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyetujui pembelian.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Tolak PO (Manajer alasan minimal 10 karakter, BR-09)
  const handleTolakPO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO || !isManager) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (alasanTolakInput.trim().length < 10) {
        throw new Error('Alasan penolakan wajib diisi minimal 10 karakter.');
      }

      const { data, error } = await supabase.rpc('tolak_pembelian', {
        p_pembelian_id: selectedPO.id,
        p_alasan_tolak: alasanTolakInput.trim(),
      });

      if (error) throw error;

      setActionMsg({
        type: 'success',
        text: (data as { message?: string })?.message || `PO ${selectedPO.nomor} berhasil ditolak.`,
      });
      setShowTolakModal(false);
      fetchData();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menolak pembelian.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Terima Barang (Gudang & Manajer, BR-10: 1x penerimaan, update stok & HPP)
  const handleTerimaPO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO) return;
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (jumlahTerimaInput < 1 || jumlahTerimaInput > selectedPO.jumlah_dipesan) {
        throw new Error(`Jumlah diterima harus antara 1 sampai ${selectedPO.jumlah_dipesan}.`);
      }

      const { data, error } = await supabase.rpc('terima_pembelian', {
        p_pembelian_id: selectedPO.id,
        p_jumlah_diterima: jumlahTerimaInput,
      });

      if (error) throw error;

      setActionMsg({
        type: 'success',
        text: (data as { message?: string })?.message || `Barang PO ${selectedPO.nomor} berhasil diterima dan stok bertambah.`,
      });
      setShowTerimaModal(false);
      fetchData();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat penerimaan barang.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Batalkan PO
  const handleBatalkanPO = async (po: PembelianRow) => {
    if (!confirm(`Batalkan pesanan pembelian ${po.nomor}?`)) return;
    try {
      setLoading(true);
      setActionMsg(null);

      const { data, error } = await supabase.rpc('batalkan_pembelian', {
        p_pembelian_id: po.id,
      });

      if (error) throw error;

      setActionMsg({
        type: 'success',
        text: (data as { message?: string })?.message || `PO ${po.nomor} berhasil dibatalkan.`,
      });
      fetchData();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membatalkan pembelian.',
      });
      setLoading(false);
    }
  };

  // Simpan / Edit Pemasok
  const handleSimpanPemasok = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setActionMsg(null);

      if (!pemasokKode.trim() || !pemasokNama.trim()) {
        throw new Error('Kode dan Nama Pemasok wajib diisi.');
      }

      if (selectedPemasok) {
        // Edit pemasok
        const { error } = await supabase
          .from('pemasok')
          .update({
            nama: pemasokNama.trim(),
            telepon: pemasokTelepon.trim() || null,
            alamat: pemasokAlamat.trim() || null,
          })
          .eq('id', selectedPemasok.id);
        if (error) throw error;
        setActionMsg({ type: 'success', text: `Data pemasok ${pemasokNama} diperbarui.` });
      } else {
        // Tambah pemasok baru
        const { error } = await supabase.from('pemasok').insert({
          kode: pemasokKode.trim().toUpperCase(),
          nama: pemasokNama.trim(),
          telepon: pemasokTelepon.trim() || null,
          alamat: pemasokAlamat.trim() || null,
          aktif: true,
        });
        if (error) throw error;
        setActionMsg({ type: 'success', text: `Pemasok baru ${pemasokNama} berhasil ditambahkan.` });
      }

      setShowPemasokModal(false);
      fetchData();
    } catch (err: unknown) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan data pemasok.',
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
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pembelian ke Pemasok</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {pembelianList.length} Order Pembelian
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Pengadaan stok sembako, persetujuan Manajer, dan penerimaan fisik gudang
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setFormJumlahPesan(10);
              setShowAjukanModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Ajukan Pembelian</span>
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

      {/* 3 Kartu Ringkasan Pembelian */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Pengajuan PO</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total} Dokumen</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Menunggu Keputusan</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{stats.diajukan} PO</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Disetujui / Menunggu Barang</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.disetujui} PO</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <PackageCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tab Navigasi: Order Pembelian vs Data Pemasok */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('pembelian')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'pembelian'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Daftar Pembelian (PO)</span>
        </button>

        <button
          onClick={() => setActiveTab('pemasok')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'pemasok'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Data Pemasok ({pemasokList.length})</span>
        </button>
      </div>

      {activeTab === 'pembelian' ? (
        <>
          {/* Filter Status & Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {(
                [
                  { id: 'semua', label: 'Semua Status' },
                  { id: 'diajukan', label: 'Diajukan' },
                  { id: 'disetujui', label: 'Disetujui' },
                  { id: 'diterima', label: 'Diterima' },
                  { id: 'ditolak', label: 'Ditolak' },
                  { id: 'dibatalkan', label: 'Dibatalkan' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === tab.id
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
                placeholder="Cari nomor PO, barang, pemasok..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>

          {/* Tabel Pembelian */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">No. PO</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Pemasok</th>
                    <th className="py-3 px-4">Barang</th>
                    <th className="py-3 px-4 text-center">Dipesan</th>
                    <th className="py-3 px-4 text-center">Diterima</th>
                    {isManager && (
                      <th className="py-3 px-4 text-right text-blue-700 bg-blue-50/50">
                        Harga Beli Satuan
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
                          <span>Memuat daftar pesanan pembelian...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredPO.length === 0 ? (
                    <tr>
                      <td colSpan={isManager ? 9 : 8} className="py-12 text-center text-slate-400">
                        Tidak ada pesanan pembelian yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    filteredPO.map((po) => {
                      const badge = getStatusPembelianBadge(po.status);
                      const isOwner = po.diajukan_oleh === profile?.id;

                      return (
                        <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {po.nomor}
                          </td>
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {formatTanggal(po.diajukan_pada)}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">
                            {po.pemasok?.nama || 'Pemasok'}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {po.barang?.nama || 'Barang'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-slate-800">
                            {po.jumlah_dipesan} {po.barang?.satuan}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-slate-600">
                            {po.jumlah_diterima !== null ? `${po.jumlah_diterima} ${po.barang?.satuan}` : '-'}
                          </td>

                          {/* Harga Beli Satuan: Kolom Rahasia Khusus Manajer (BR-12) */}
                          {isManager && (
                            <td className="py-3 px-4 text-right font-mono font-semibold text-blue-900 bg-blue-50/30">
                              {po.harga_beli_satuan ? formatRupiah(po.harga_beli_satuan) : '-'}
                            </td>
                          )}

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                              title={po.status === 'ditolak' && po.alasan_tolak ? `Alasan tolak: ${po.alasan_tolak}` : undefined}
                            >
                              {badge.label}
                            </span>
                            {po.status === 'ditolak' && po.alasan_tolak && (
                              <p className="text-[10px] text-rose-600 italic mt-0.5 max-w-xs truncate mx-auto" title={po.alasan_tolak}>
                                {po.alasan_tolak}
                              </p>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* 1. Status DIAJUKAN */}
                              {po.status === 'diajukan' && (
                                <>
                                  {isManager && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setSelectedPO(po);
                                          setHargaBeliInput(100000);
                                          setShowSetujuiModal(true);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] shadow-sm transition-colors"
                                      >
                                        Setujui
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectedPO(po);
                                          setAlasanTolakInput('');
                                          setShowTolakModal(true);
                                        }}
                                        className="px-2.5 py-1 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold text-[11px] transition-colors"
                                      >
                                        Tolak
                                      </button>
                                    </>
                                  )}
                                  {(isOwner || isManager) && (
                                    <button
                                      onClick={() => handleBatalkanPO(po)}
                                      className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11px]"
                                      title="Batalkan Pengajuan"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}

                              {/* 2. Status DISETUJUI */}
                              {po.status === 'disetujui' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setSelectedPO(po);
                                      setJumlahTerimaInput(po.jumlah_dipesan);
                                      setShowTerimaModal(true);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-sm transition-colors flex items-center gap-1"
                                  >
                                    <PackageCheck className="w-3.5 h-3.5" />
                                    <span>Terima Barang</span>
                                  </button>

                                  {isManager && (
                                    <button
                                      onClick={() => handleBatalkanPO(po)}
                                      className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11px]"
                                      title="Batalkan Pembelian"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}

                              {/* 3. Status Selesai (Diterima, Ditolak, Dibatalkan) */}
                              {['diterima', 'ditolak', 'dibatalkan'].includes(po.status) && (
                                <span className="text-[11px] text-slate-400 font-medium">-</span>
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
        </>
      ) : (
        /* Tab Data Pemasok */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-base">Daftar Pemasok Resmi</h2>
            <button
              onClick={() => {
                setSelectedPemasok(null);
                setPemasokKode(`SUP-0${pemasokList.length + 1}`);
                setPemasokNama('');
                setPemasokTelepon('');
                setPemasokAlamat('');
                setShowPemasokModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Pemasok</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pemasokList.map((sup) => (
              <div
                key={sup.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-100 text-blue-800">
                      {sup.kode}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-1">{sup.nama}</h3>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPemasok(sup);
                      setPemasokKode(sup.kode);
                      setPemasokNama(sup.nama);
                      setPemasokTelepon(sup.telepon || '');
                      setPemasokAlamat(sup.alamat || '');
                      setShowPemasokModal(true);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{sup.telepon || 'Tidak ada telepon'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-500">{sup.alamat || 'Alamat belum diatur'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: Ajukan Pembelian Baru (Staf Gudang & Manajer, BR-09) */}
      {showAjukanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Ajukan Pembelian ke Pemasok</h3>
              <button onClick={() => setShowAjukanModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAjukanPO} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pilih Pemasok</label>
                <select
                  required
                  value={formPemasokId}
                  onChange={(e) => setFormPemasokId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {pemasokList.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.kode} - {sup.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pilih Barang yang Dipesan</label>
                <select
                  required
                  value={formBarangId}
                  onChange={(e) => setFormBarangId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {barangOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.kode} - {b.nama} (Sisa stok: {b.stok} {b.satuan})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Jumlah Dipesan (1 - 10.000)</label>
                  <span className="text-[10px] text-slate-400 font-mono">BR-09</span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  required
                  value={formJumlahPesan}
                  onChange={(e) => setFormJumlahPesan(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono font-bold text-base focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAjukanModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Mengajukan...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Setujui PO & Isi Harga Beli Satuan (Manajer Only, BR-09 & BR-12) */}
      {showSetujuiModal && selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Persetujuan Pembelian {selectedPO.nomor}</h3>
                <p className="text-[11px] text-slate-500 font-medium">Khusus Manajer · Wajib menentukan harga beli</p>
              </div>
              <button onClick={() => setShowSetujuiModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSetujuiPO} className="space-y-4 text-xs">
              <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 text-slate-800 space-y-1">
                <p><span className="text-slate-500">Pemasok:</span> <strong>{selectedPO.pemasok?.nama}</strong></p>
                <p><span className="text-slate-500">Barang:</span> <strong>{selectedPO.barang?.nama}</strong></p>
                <p><span className="text-slate-500">Jumlah:</span> <strong>{selectedPO.jumlah_dipesan} {selectedPO.barang?.satuan}</strong></p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Harga Beli Satuan dari Pemasok (Rp)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  placeholder="Contoh: 208000"
                  value={hargaBeliInput}
                  onChange={(e) => setHargaBeliInput(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono font-bold text-base focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Estimasi Total Beli: <strong>{formatRupiah(hargaBeliInput * selectedPO.jumlah_dipesan)}</strong>
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSetujuiModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || hargaBeliInput <= 0}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Setujui Pembelian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Tolak Pembelian (Manajer, Alasan >= 10 karakter, BR-09) */}
      {showTolakModal && selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Tolak Pembelian {selectedPO.nomor}</h3>
              <button onClick={() => setShowTolakModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTolakPO} className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Alasan Penolakan</label>
                  <span className={`text-[10px] font-mono ${
                    alasanTolakInput.trim().length >= 10 ? 'text-emerald-600 font-bold' : 'text-slate-400'
                  }`}>
                    {alasanTolakInput.trim().length}/10 karakter
                  </span>
                </div>
                <textarea
                  rows={3}
                  required
                  placeholder="Contoh: Stok di gudang masih mencukupi untuk 2 minggu ke depan."
                  value={alasanTolakInput}
                  onChange={(e) => setAlasanTolakInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTolakModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || alasanTolakInput.trim().length < 10}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Menolak...' : 'Tolak Pembelian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Terima Barang Datang (Gudang & Manajer, BR-10) */}
      {showTerimaModal && selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Penerimaan Barang: {selectedPO.nomor}</h3>
                <p className="text-[11px] text-slate-500">Penerimaan fisik hanya 1 kali (kekurangan tidak ditunggu)</p>
              </div>
              <button onClick={() => setShowTerimaModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTerimaPO} className="space-y-4 text-xs">
              <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200 text-slate-800 space-y-1">
                <p><span className="text-slate-500">Barang:</span> <strong>{selectedPO.barang?.nama}</strong></p>
                <p><span className="text-slate-500">Jumlah Dipesan:</span> <strong>{selectedPO.jumlah_dipesan} {selectedPO.barang?.satuan}</strong></p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jumlah yang Benar-Benar Diterima ({selectedPO.barang?.satuan})
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedPO.jumlah_dipesan}
                  required
                  value={jumlahTerimaInput}
                  onChange={(e) => setJumlahTerimaInput(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono font-bold text-base focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Maksimal {selectedPO.jumlah_dipesan} {selectedPO.barang?.satuan}. Stok dan HPP barang akan otomatis ter-update di sistem.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTerimaModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || jumlahTerimaInput < 1 || jumlahTerimaInput > selectedPO.jumlah_dipesan}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Konfirmasi Penerimaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Tambah / Edit Pemasok */}
      {showPemasokModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {selectedPemasok ? 'Edit Data Pemasok' : 'Tambah Pemasok Baru'}
              </h3>
              <button onClick={() => setShowPemasokModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimpanPemasok} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kode Pemasok (Contoh: SUP-01)</label>
                <input
                  type="text"
                  required
                  disabled={!!selectedPemasok}
                  value={pemasokKode}
                  onChange={(e) => setPemasokKode(e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 rounded-xl border border-slate-200 font-mono uppercase ${
                    selectedPemasok ? 'bg-slate-100 cursor-not-allowed text-slate-500' : 'focus:ring-2 focus:ring-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Perusahaan / Supplier</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT Pangan Nusantara"
                  value={pemasokNama}
                  onChange={(e) => setPemasokNama(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor Telepon</label>
                <input
                  type="text"
                  placeholder="Contoh: 021-88991122"
                  value={pemasokTelepon}
                  onChange={(e) => setPemasokTelepon(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Kantor / Gudang Supplier</label>
                <textarea
                  rows={2}
                  value={pemasokAlamat}
                  onChange={(e) => setPemasokAlamat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPemasokModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Pemasok'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
