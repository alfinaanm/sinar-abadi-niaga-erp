'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatPeran } from '@/lib/peran';
import { 
  TrendingUp, 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  Package, 
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
  Truck,
  Plus,
  Phone,
  ShoppingCart,
  FileText,
  AlertCircle,
  Calendar,
  Layers,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';

// --- INTERFACES ---

interface RawOrder {
  id: string;
  nomor: string;
  status: string;
  total: number;
  dibuat_pada: string;
  dikonfirmasi_pada: string | null;
  dikirim_pada: string | null;
  dilunasi_pada: string | null;
  jatuh_tempo: string | null;
  dibuat_oleh: string | null;
  pelanggan?: {
    id: string;
    nama_toko: string;
    telepon: string;
    alamat: string;
    batas_kredit: number;
  } | null;
}

interface RawBarang {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  stok_minimum: number;
  harga_jual: number;
  aktif: boolean;
}

interface RawPembelian {
  id: string;
  nomor: string;
  jumlah_dipesan: number;
  status: string;
  diajukan_pada: string;
  diputuskan_pada?: string | null;
  barang?: { nama: string; kode: string } | null;
  pemasok?: { nama: string } | null;
}

interface WeeklyBarData {
  tgl: string;
  omzet: number;
  margin: number;
  transaksiCount: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const userRole = profile?.peran || 'penjualan';
  const isManager = userRole === 'manajer';
  const supabase = createClient();

  // Tab tampilan untuk Manajer (agar bisa memantau perspektif Penjualan dan Gudang)
  const [activeManagerTab, setActiveManagerTab] = useState<'manajer' | 'penjualan' | 'gudang'>('manajer');

  // Data Mentah Real-Time
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [barangList, setBarangList] = useState<RawBarang[]>([]);
  const [pembelianList, setPembelianList] = useState<RawPembelian[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [itemsData, setItemsData] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter tanggal / nama bulan saat ini
  const namaBulan = useMemo(() => {
    return new Date().toLocaleDateString('id-ID', { month: 'long' });
  }, []);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const formatTanggal = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatSingkat = (val: number) => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}jt`;
    if (val > 0) return `${Math.round(val / 1000)}rb`;
    return '0';
  };

  // --- FETCH DATA DASHBOARD ---
  const loadDashboardData = useCallback(async () => {
    try {
      setRefreshing(true);

      // 1. Ambil Pesanan Jual beserta data Pelanggan
      const { data: ordersData } = await supabase
        .from('pesanan_jual')
        .select(`
          id, nomor, status, total, dibuat_pada, dikonfirmasi_pada, dikirim_pada, dilunasi_pada, jatuh_tempo, dibuat_oleh,
          pelanggan:pelanggan_id (id, nama_toko, telepon, alamat, batas_kredit)
        `)
        .order('dibuat_pada', { ascending: false });

      if (ordersData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setOrders(ordersData as any);
      }

      // 2. Ambil Barang dan Stok
      const { data: barangData } = await supabase
        .from('barang')
        .select('id, kode, nama, satuan, stok, stok_minimum, harga_jual, aktif')
        .eq('aktif', true)
        .order('nama', { ascending: true });

      if (barangData) {
        setBarangList(barangData);
      }

      // 3. Ambil Pembelian (Hanya Gudang & Manajer yang memiliki izin RLS ke pembelian)
      if (userRole === 'gudang' || userRole === 'manajer') {
        const { data: poData } = await supabase
          .from('pembelian')
          .select(`
            id, nomor, jumlah_dipesan, status, diajukan_pada, diputuskan_pada,
            barang:barang_id (nama, kode),
            pemasok:pemasok_id (nama)
          `)
          .order('diajukan_pada', { ascending: false });

        if (poData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setPembelianList(poData as any);
        }
      }

      // 4. Ambil Item Pesanan Jual untuk Margin (Khusus Manajer)
      if (userRole === 'manajer') {
        const { data: items } = await supabase
          .from('item_pesanan_jual')
          .select('id, pesanan_jual_id, jumlah, subtotal, hpp_satuan, barang:barang_id(harga_pokok)');

        if (items) {
          setItemsData(items);
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, userRole]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // =========================================================================
  // LOGIKA PERHITUNGAN ROLE STAF PENJUALAN
  // =========================================================================
  const salesMetrics = useMemo(() => {
    // Pesanan yang dibuat oleh user sales saat ini
    const myOrders = orders.filter((o) => o.dibuat_oleh === profile?.id);
    // Jika belum ada pesanan milik akun sales ini (misal data dummy), tampilkan semua pesanan
    const activeOrders = myOrders.length > 0 ? myOrders : orders;

    const draf = activeOrders.filter((o) => o.status === 'draf');
    const dikonfirmasi = activeOrders.filter((o) => o.status === 'dikonfirmasi');
    const dikirim = activeOrders.filter((o) => o.status === 'dikirim');
    const lunas = activeOrders.filter((o) => o.status === 'lunas');
    const dibatalkan = activeOrders.filter((o) => o.status === 'dibatalkan');

    const totalNilaiPesanan = activeOrders
      .filter((o) => o.status !== 'dibatalkan')
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    // Pelanggan dengan tagihan jatuh tempo (pesanan belum lunas: dikonfirmasi / dikirim)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tagihanJatuhTempo = orders
      .filter((o) => ['dikonfirmasi', 'dikirim'].includes(o.status) && o.jatuh_tempo)
      .map((o) => {
        const jtDate = new Date(o.jatuh_tempo as string);
        jtDate.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - jtDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return {
          ...o,
          diffDays,
          isOverdue: diffDays > 0,
          isToday: diffDays === 0,
        };
      })
      .sort((a, b) => b.diffDays - a.diffDays);

    return {
      totalPesanan: activeOrders.length,
      totalNilaiPesanan,
      drafCount: draf.length,
      drafTotal: draf.reduce((s, o) => s + Number(o.total || 0), 0),
      dikonfirmasiCount: dikonfirmasi.length,
      dikonfirmasiTotal: dikonfirmasi.reduce((s, o) => s + Number(o.total || 0), 0),
      dikirimCount: dikirim.length,
      dikirimTotal: dikirim.reduce((s, o) => s + Number(o.total || 0), 0),
      lunasCount: lunas.length,
      lunasTotal: lunas.reduce((s, o) => s + Number(o.total || 0), 0),
      dibatalkanCount: dibatalkan.length,
      dibatalkanTotal: dibatalkan.reduce((s, o) => s + Number(o.total || 0), 0),
      pesananTerbaru: activeOrders.slice(0, 8),
      tagihanJatuhTempo,
    };
  }, [orders, profile?.id]);

  // =========================================================================
  // LOGIKA PERHITUNGAN ROLE GUDANG
  // =========================================================================
  const warehouseMetrics = useMemo(() => {
    // 1. Pesanan Siap Kirim (status dikonfirmasi, menunggu dikirim oleh gudang)
    const pesananSiapKirim = orders.filter((o) => o.status === 'dikonfirmasi');

    // 2. Stok Menipis (stok <= stok_minimum)
    const stokMenipis = barangList
      .filter((b) => b.stok <= b.stok_minimum)
      .sort((a, b) => a.stok - b.stok);

    // 3. Pembelian Menunggu Barang (status disetujui manajer, siap diterima gudang)
    const pembelianMenungguBarang = pembelianList.filter((p) => p.status === 'disetujui');

    return {
      pesananSiapKirim,
      stokMenipis,
      pembelianMenungguBarang,
      siapKirimCount: pesananSiapKirim.length,
      stokMenipisCount: stokMenipis.length,
      menungguBarangCount: pembelianMenungguBarang.length,
    };
  }, [orders, barangList, pembelianList]);

  // =========================================================================
  // LOGIKA PERHITUNGAN ROLE MANAJER (Omzet, Margin, Piutang, Grafik)
  // =========================================================================
  const managerMetrics = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== 'dibatalkan');
    const totalOmzet = validOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const pesananSelesaiCount = validOrders.filter((o) => ['dikirim', 'lunas'].includes(o.status)).length;

    // Hitung margin
    let totalMargin = 0;
    if (itemsData.length > 0) {
      const validOrderIds = new Set(validOrders.map((o) => o.id));
      for (const it of itemsData) {
        if (validOrderIds.has(it.pesanan_jual_id)) {
          const hpp = it.hpp_satuan != null && Number(it.hpp_satuan) > 0
            ? Number(it.hpp_satuan)
            : Number(it.barang?.harga_pokok || 0);
          totalMargin += (Number(it.subtotal || 0) - (hpp * Number(it.jumlah || 0)));
        }
      }
    }
    const marginPersen = totalOmzet > 0 ? (totalMargin / totalOmzet) * 100 : 0;

    // Piutang berjalan & lewat tempo
    const todayStr = new Date().toISOString().split('T')[0];
    const piutangOrders = orders.filter((o) => ['dikonfirmasi', 'dikirim'].includes(o.status));
    const piutangBerjalan = piutangOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const piutangLewatTempo = piutangOrders
      .filter((o) => o.jatuh_tempo && o.jatuh_tempo < todayStr)
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    // Stok Menipis
    const menipisList = barangList
      .filter((b) => b.stok <= b.stok_minimum)
      .sort((a, b) => a.stok - b.stok);

    // PO Menunggu Persetujuan Manajer (status diajukan)
    const poMenungguApproval = pembelianList.filter((p) => p.status === 'diajukan');

    // Grafik Mingguan 8 Minggu
    const refDate = new Date();
    const day = refDate.getDay();
    const diffToMonday = refDate.getDate() - day + (day === 0 ? -6 : 1);
    const curMonday = new Date(refDate);
    curMonday.setDate(diffToMonday);
    curMonday.setHours(0, 0, 0, 0);

    const weekBuckets: WeeklyBarData[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(curMonday);
      start.setDate(start.getDate() - (i * 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const label = `${start.getDate()}/${start.getMonth() + 1}`;
      const ordersInWeek = validOrders.filter((o) => {
        const d = new Date(o.dibuat_pada || o.dikonfirmasi_pada || '');
        return d >= start && d < end;
      });

      const weekOmzet = ordersInWeek.reduce((s, o) => s + Number(o.total || 0), 0);
      let weekMargin = 0;
      if (itemsData.length > 0) {
        const weekOrderIds = new Set(ordersInWeek.map((o) => o.id));
        for (const it of itemsData) {
          if (weekOrderIds.has(it.pesanan_jual_id)) {
            const hpp = it.hpp_satuan != null && Number(it.hpp_satuan) > 0
              ? Number(it.hpp_satuan)
              : Number(it.barang?.harga_pokok || 0);
            weekMargin += (Number(it.subtotal || 0) - (hpp * Number(it.jumlah || 0)));
          }
        }
      }

      weekBuckets.push({
        tgl: label,
        omzet: weekOmzet,
        margin: weekMargin,
        transaksiCount: ordersInWeek.length,
      });
    }

    return {
      totalOmzet,
      pesananSelesaiCount,
      totalPesananAktif: validOrders.length,
      totalMargin,
      marginPersen,
      piutangBerjalan,
      piutangLewatTempo,
      menipisList,
      stokMenipisCount: menipisList.length,
      poMenungguApproval,
      weekBuckets,
      maxChartVal: Math.max(...weekBuckets.map((b) => b.omzet), 1),
    };
  }, [orders, itemsData, barangList, pembelianList]);

  // Peran yang sedang aktif ditampilkan
  const effectiveRole = isManager ? activeManagerTab : userRole;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER UTAMA DASHBOARD */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {effectiveRole === 'penjualan' && 'Dashboard Staf Penjualan'}
            {effectiveRole === 'gudang' && 'Dashboard Staf Gudang'}
            {effectiveRole === 'manajer' && 'Dashboard Manajer'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Selamat datang, <span className="font-semibold text-slate-800">{profile?.nama_lengkap}</span> ({formatPeran(profile?.peran || 'penjualan')}) · CV Sinar Abadi Niaga
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadDashboardData()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            title="Sinkronkan data terbaru"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Menyinkronkan...' : 'Segarkan Data'}
          </button>

          {effectiveRole === 'penjualan' && (
            <Link
              href="/pesanan-jual/baru"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Pesanan Baru
            </Link>
          )}

          {effectiveRole === 'gudang' && (
            <Link
              href="/pembelian"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajukan Pembelian
            </Link>
          )}
        </div>
      </div>

      {/* TAB SWITCHER UNTUK MANAJER (Manajer dapat mengawasi semua dashboard) */}
      {isManager && (
        <div className="flex items-center gap-2 p-1.5 bg-slate-200/70 rounded-xl w-fit">
          <button
            onClick={() => setActiveManagerTab('manajer')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              activeManagerTab === 'manajer'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dashboard Manajer (Omzet & Margin)
          </button>
          <button
            onClick={() => setActiveManagerTab('penjualan')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              activeManagerTab === 'penjualan'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Perspektif Penjualan
          </button>
          <button
            onClick={() => setActiveManagerTab('gudang')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              activeManagerTab === 'gudang'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Perspektif Gudang
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. TAMPILAN DASHBOARD STAF PENJUALAN */}
      {/* =================================================================== */}
      {effectiveRole === 'penjualan' && (
        <div className="space-y-8">
          {/* BAGIAN 1: KARTU METRIK PESANAN PEMBUAT PER STATUS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Pesanan Saya per Status
              </h2>
              <span className="text-xs text-slate-500">
                Total {salesMetrics.totalPesanan} pesanan terdaftar
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Status Draf */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold text-slate-600">Draf</span>
                  <FileText className="w-4 h-4 text-slate-400" />
                </div>
                <p className="text-xl font-bold text-slate-900">{salesMetrics.drafCount}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{formatRupiah(salesMetrics.drafTotal)}</p>
              </div>

              {/* Status Dikonfirmasi */}
              <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between text-blue-600 mb-1">
                  <span className="text-xs font-semibold">Dikonfirmasi</span>
                  <CheckCircle2 className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-xl font-bold text-blue-900">{salesMetrics.dikonfirmasiCount}</p>
                <p className="text-[11px] text-blue-600 mt-0.5 truncate">{formatRupiah(salesMetrics.dikonfirmasiTotal)}</p>
              </div>

              {/* Status Dikirim */}
              <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between text-amber-600 mb-1">
                  <span className="text-xs font-semibold">Dikirim</span>
                  <Truck className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-xl font-bold text-amber-900">{salesMetrics.dikirimCount}</p>
                <p className="text-[11px] text-amber-600 mt-0.5 truncate">{formatRupiah(salesMetrics.dikirimTotal)}</p>
              </div>

              {/* Status Lunas */}
              <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between text-emerald-600 mb-1">
                  <span className="text-xs font-semibold">Lunas</span>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-xl font-bold text-emerald-900">{salesMetrics.lunasCount}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5 truncate">{formatRupiah(salesMetrics.lunasTotal)}</p>
              </div>

              {/* Status Dibatalkan */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow transition opacity-80">
                <div className="flex items-center justify-between text-rose-500 mb-1">
                  <span className="text-xs font-semibold text-rose-600">Dibatalkan</span>
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                </div>
                <p className="text-xl font-bold text-rose-900">{salesMetrics.dibatalkanCount}</p>
                <p className="text-[11px] text-rose-600 mt-0.5 truncate">{formatRupiah(salesMetrics.dibatalkanTotal)}</p>
              </div>
            </div>
          </div>

          {/* BAGIAN 2: 2 KOLOM (KIRI: PELANGGAN JATUH TEMPO, KANAN: PESANAN DIBUAT TERBARU) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* KOLOM KIRI: PELANGGAN DENGAN TAGIHAN JATUH TEMPO */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    Pelanggan dengan Tagihan Jatuh Tempo
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tagihan piutang berjalan yang mendekati atau telah lewat jatuh tempo
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  salesMetrics.tagihanJatuhTempo.filter(t => t.isOverdue).length > 0
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {salesMetrics.tagihanJatuhTempo.length} Tagihan
                </span>
              </div>

              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[420px] mt-2 text-xs">
                {salesMetrics.tagihanJatuhTempo.length > 0 ? (
                  salesMetrics.tagihanJatuhTempo.map((tagihan) => (
                    <div key={tagihan.id} className="py-3 flex items-start justify-between gap-3 hover:bg-slate-50/70 rounded-lg px-2 -mx-2 transition">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 truncate">
                            {tagihan.pelanggan?.nama_toko || 'Toko Pelanggan'}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            tagihan.isOverdue
                              ? 'bg-rose-100 text-rose-700'
                              : tagihan.isToday
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {tagihan.isOverdue
                              ? `Lewat ${tagihan.diffDays} hari`
                              : tagihan.isToday
                              ? 'Jatuh tempo hari ini'
                              : `Tempo ${Math.abs(tagihan.diffDays)} hari lagi`}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                          <span>{tagihan.nomor}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {formatTanggal(tagihan.jatuh_tempo)}
                          </span>
                          {tagihan.pelanggan?.telepon && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1 text-slate-600">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {tagihan.pelanggan.telepon}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 space-y-1">
                        <p className="font-bold text-slate-900 text-sm">
                          {formatRupiah(tagihan.total)}
                        </p>
                        <Link
                          href={`/pesanan-jual/${tagihan.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          Lihat Pesanan <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60 mb-2" />
                    <p className="font-semibold text-slate-700">Tidak ada tagihan jatuh tempo</p>
                    <p className="text-[11px] text-slate-400 mt-1">Semua pelanggan tertib pembayaran kredit.</p>
                  </div>
                )}
              </div>
            </div>

            {/* KOLOM KANAN: PESANAN TERBARU SAYA */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                    Pesanan Penjualan Terbaru
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Riwayat pesanan jual yang Anda daftarkan ke sistem
                  </p>
                </div>
                <Link
                  href="/pesanan-jual"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                >
                  Semua Pesanan <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[420px] mt-2 text-xs">
                {salesMetrics.pesananTerbaru.length > 0 ? (
                  salesMetrics.pesananTerbaru.map((order) => {
                    const statusColors: Record<string, string> = {
                      draf: 'bg-slate-100 text-slate-700 border-slate-200',
                      dikonfirmasi: 'bg-blue-50 text-blue-700 border-blue-200',
                      dikirim: 'bg-amber-50 text-amber-700 border-amber-200',
                      lunas: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      dibatalkan: 'bg-rose-50 text-rose-700 border-rose-200',
                    };

                    return (
                      <Link
                        key={order.id}
                        href={`/pesanan-jual/${order.id}`}
                        className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 rounded-lg px-2 -mx-2 transition group"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 group-hover:text-blue-600 transition">
                              {order.nomor}
                            </span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusColors[order.status] || 'bg-slate-100 text-slate-700'}`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[11px] truncate">
                            {order.pelanggan?.nama_toko || 'Toko Pelanggan'} · {formatTanggal(order.dibuat_pada)}
                          </p>
                        </div>

                        <div className="text-right flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            {formatRupiah(order.total)}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition" />
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <p className="font-semibold text-slate-700">Belum ada pesanan dibuat</p>
                    <p className="text-[11px] text-slate-400 mt-1">Klik tombol Pesanan Baru di atas untuk mulai membuat sales order.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. TAMPILAN DASHBOARD STAF GUDANG */}
      {/* =================================================================== */}
      {effectiveRole === 'gudang' && (
        <div className="space-y-8">
          {/* 3 KARTU KPI UTAMA GUDANG */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* KPI 1: Pesanan Siap Kirim */}
            <div className="bg-white p-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-white to-blue-50/30 shadow-sm hover:shadow transition">
              <div className="flex items-center justify-between text-blue-600 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Pesanan Siap Kirim
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-blue-900">
                {warehouseMetrics.siapKirimCount}
              </p>
              <p className="text-xs text-blue-600 mt-1 font-medium">
                Dikonfirmasi · Perlu pengiriman & surat jalan
              </p>
            </div>

            {/* KPI 2: Stok Menipis */}
            <div className="bg-white p-6 rounded-2xl border border-rose-200 bg-gradient-to-br from-white to-rose-50/30 shadow-sm hover:shadow transition">
              <div className="flex items-center justify-between text-rose-600 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Stok Menipis & Habis
                </span>
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-rose-900">
                {warehouseMetrics.stokMenipisCount}
              </p>
              <p className="text-xs text-rose-600 mt-1 font-medium">
                Stok fisik ≤ batas stok minimum
              </p>
            </div>

            {/* KPI 3: Pembelian Menunggu Barang */}
            <div className="bg-white p-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/30 shadow-sm hover:shadow transition">
              <div className="flex items-center justify-between text-emerald-600 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Pembelian Menunggu Barang
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-emerald-900">
                {warehouseMetrics.menungguBarangCount}
              </p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">
                PO disetujui Manajer · Menunggu fisik datang
              </p>
            </div>
          </div>

          {/* 3 BAGIAN OPERASIONAL GUDANG */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* BAGIAN 1: PESANAN SIAP KIRIM */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-600" />
                    Pesanan Siap Kirim
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pesanan terkonfirmasi untuk dipersiapkan fisik
                  </p>
                </div>
                <Link
                  href="/pesanan-jual"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                >
                  Semua ({warehouseMetrics.siapKirimCount}) <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[460px] mt-2 text-xs">
                {warehouseMetrics.pesananSiapKirim.length > 0 ? (
                  warehouseMetrics.pesananSiapKirim.map((po) => (
                    <div key={po.id} className="py-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{po.nomor}</p>
                          <p className="text-slate-700 font-semibold text-xs mt-0.5">
                            {po.pelanggan?.nama_toko || 'Toko Pelanggan'}
                          </p>
                          <p className="text-slate-400 text-[11px] mt-0.5 truncate max-w-[220px]">
                            {po.pelanggan?.alamat || 'Alamat toko'}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Siap Kirim
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-400 text-[11px]">
                          Konfirmasi: {formatTanggal(po.dikonfirmasi_pada || po.dibuat_pada)}
                        </span>
                        <Link
                          href={`/pesanan-jual/${po.id}`}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] rounded-lg shadow-sm transition"
                        >
                          Kirim & Surat Jalan
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60 mb-2" />
                    <p className="font-semibold text-slate-700">Tidak ada antrean kirim</p>
                    <p className="text-[11px] text-slate-400 mt-1">Semua pesanan yang siap sudah dikirim.</p>
                  </div>
                )}
              </div>
            </div>

            {/* BAGIAN 2: STOK MENIPIS & KRITIS */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    Stok Menipis & Kritis
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Barang dengan kuantitas di bawah batas aman
                  </p>
                </div>
                <Link
                  href="/barang"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                >
                  Semua ({warehouseMetrics.stokMenipisCount}) <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[460px] mt-2 text-xs">
                {warehouseMetrics.stokMenipis.length > 0 ? (
                  warehouseMetrics.stokMenipis.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 pr-1">
                        <p className="font-semibold text-slate-800 truncate">{item.nama}</p>
                        <p className="text-slate-400 text-[11px] font-mono">{item.kode}</p>
                      </div>

                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div>
                          <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                            item.stok === 0
                              ? 'bg-red-100 text-red-700 font-black'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {item.stok} {item.satuan}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-0.5">Min: {item.stok_minimum}</p>
                        </div>
                        <Link
                          href="/pembelian"
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Ajukan PO untuk barang ini"
                        >
                          <Plus className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60 mb-2" />
                    <p className="font-semibold text-slate-700">Semua stok aman</p>
                    <p className="text-[11px] text-slate-400 mt-1">Tidak ada barang dengan stok di bawah minimum.</p>
                  </div>
                )}
              </div>
            </div>

            {/* BAGIAN 3: PEMBELIAN MENUNGGU BARANG (PO DISETUJUI MANAJER) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-600" />
                    Pembelian Menunggu Barang
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    PO disetujui, siap diterima saat kiriman tiba
                  </p>
                </div>
                <Link
                  href="/pembelian"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                >
                  Kelola ({warehouseMetrics.menungguBarangCount}) <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[460px] mt-2 text-xs">
                {warehouseMetrics.pembelianMenungguBarang.length > 0 ? (
                  warehouseMetrics.pembelianMenungguBarang.map((po) => (
                    <div key={po.id} className="py-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{po.nomor}</p>
                          <p className="text-slate-700 font-semibold text-xs mt-0.5">
                            {po.barang?.nama || 'Barang PO'}
                          </p>
                          <p className="text-slate-400 text-[11px] mt-0.5">
                            Pemasok: {po.pemasok?.nama || 'Pemasok'}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {po.jumlah_dipesan} unit
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-400 text-[11px]">
                          Disetujui: {formatTanggal(po.diputuskan_pada || po.diajukan_pada)}
                        </span>
                        <Link
                          href="/pembelian"
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] rounded-lg shadow-sm transition"
                        >
                          Catat Penerimaan
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">Tidak ada pengiriman ditunggu</p>
                    <p className="text-[11px] text-slate-400 mt-1">Semua pembelian disetujui telah selesai diterima.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. TAMPILAN DASHBOARD MANAJER (OMZET, MARGIN, KEUANGAN LENGKAP) */}
      {/* =================================================================== */}
      {effectiveRole === 'manajer' && (
        <div className="space-y-8">
          {/* 4 KARTU KPI KEUANGAN MANAJER */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* KPI 1: Omzet */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Omzet {namaBulan}
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {formatRupiah(managerMetrics.totalOmzet)}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {managerMetrics.pesananSelesaiCount} pesanan selesai · {managerMetrics.totalPesananAktif} pesanan aktif
              </p>
            </div>

            {/* KPI 2: Margin (KHUSUS MANAJER, RAHASIA DAGANG BR-12) */}
            <div className="bg-white p-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-white to-blue-50/30 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between text-blue-700 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                  Margin {namaBulan}
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-normal">Khusus Manajer</span>
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-900">
                {formatRupiah(managerMetrics.totalMargin)}
              </p>
              <p className="text-xs text-blue-600 mt-1 font-medium">
                {managerMetrics.marginPersen.toFixed(1)}% dari total omzet
              </p>
            </div>

            {/* KPI 3: Piutang Berjalan */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Piutang Berjalan
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {formatRupiah(managerMetrics.piutangBerjalan)}
              </p>
              <p className="text-xs text-red-600 mt-1 font-medium">
                Lewat tempo: {formatRupiah(managerMetrics.piutangLewatTempo)}
              </p>
            </div>

            {/* KPI 4: Stok Menipis */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Barang Stok Menipis
                </span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-rose-600">
                {managerMetrics.stokMenipisCount} Barang
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Stok ≤ batas stok minimum
              </p>
            </div>
          </div>

          {/* KONTEN 2 KOLOM: GRAFIK DAN WIDGET OPERASIONAL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Kolom Kiri: Visualisasi Omzet Mingguan (2 Kolom Grid) */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Omzet & Margin per Minggu
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    8 Minggu terakhir dari transaksi nyata sistem
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-slate-400" />
                    <span className="text-slate-600 font-medium">Omzet</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-blue-600" />
                    <span className="text-slate-600 font-medium">Margin</span>
                  </div>
                </div>
              </div>

              {/* Bar Chart Sederhana & Responsif Sesuai Wireframe */}
              <div className="h-64 flex items-end justify-between gap-3 pt-8 pb-4 px-2 border-b border-slate-100">
                {managerMetrics.weekBuckets.map((bar, idx) => {
                  const omzetHeight = bar.omzet > 0 ? Math.max((bar.omzet / managerMetrics.maxChartVal) * 100, 8) : 0;
                  const marginHeight = bar.margin > 0 ? Math.max((bar.margin / managerMetrics.maxChartVal) * 100, 5) : 0;

                  return (
                    <div 
                      key={idx} 
                      className="flex-1 flex flex-col items-center gap-1 h-full justify-end group cursor-pointer relative"
                      title={`Minggu ${bar.tgl} · Omzet: ${formatRupiah(bar.omzet)} · Margin: ${formatRupiah(bar.margin)} (${bar.transaksiCount} pesanan)`}
                    >
                      <span className="text-[10px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {formatSingkat(bar.omzet)}
                      </span>
                      <div className="w-full flex items-end justify-center gap-1 h-full">
                        {/* Batang Omzet */}
                        <div
                          style={{ height: `${omzetHeight}%` }}
                          className={`w-1/2 ${bar.omzet > 0 ? 'bg-slate-400 group-hover:bg-slate-500' : 'bg-slate-100'} rounded-t-md transition-all`}
                        />
                        {/* Batang Margin */}
                        <div
                          style={{ height: `${marginHeight}%` }}
                          className={`w-1/2 ${bar.margin > 0 ? 'bg-blue-600 group-hover:bg-blue-700' : 'bg-slate-100'} rounded-t-md transition-all`}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium mt-1">
                        {bar.tgl}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-3 text-center">
                Minggu mulai (Senin) · Total {managerMetrics.totalPesananAktif} pesanan aktif dalam sistem
              </p>
            </div>

            {/* Kolom Kanan: Widget Stok Menipis & Pembelian Menunggu Keputusan */}
            <div className="space-y-6">
              {/* Widget 1: Stok Menipis */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    Stok Menipis
                  </h3>
                  <Link href="/barang" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                    Semua ({managerMetrics.stokMenipisCount}) <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {managerMetrics.menipisList.length > 0 ? (
                    managerMetrics.menipisList.slice(0, 5).map((item) => (
                      <div key={item.id} className="py-2.5 flex items-center justify-between">
                        <div className="overflow-hidden pr-2">
                          <p className="font-semibold text-slate-800 truncate">{item.nama}</p>
                          <p className="text-slate-400 text-[11px] font-mono">{item.kode}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`font-bold px-2 py-0.5 rounded ${item.stok === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {item.stok}
                          </span>
                          <span className="text-slate-400 text-[11px] ml-1">/ min {item.stok_minimum}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-slate-400">Tidak ada stok menipis</p>
                  )}
                </div>
              </div>

              {/* Widget 2: Pembelian Menunggu Approval Manajer */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-500" />
                    Menunggu Persetujuan PO
                  </h3>
                  <Link href="/pembelian" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                    Kelola ({managerMetrics.poMenungguApproval.length}) <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {managerMetrics.poMenungguApproval.length > 0 ? (
                    managerMetrics.poMenungguApproval.slice(0, 5).map((po) => (
                      <div key={po.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">{po.nomor}</p>
                          <p className="text-slate-500 text-[11px] truncate max-w-[140px]">{po.barang?.nama || 'Barang'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-600">{po.jumlah_dipesan} unit</span>
                          <Link
                            href="/pembelian"
                            className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 text-[11px]"
                          >
                            Tinjau
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-4 text-center text-slate-400">
                      <p>Tidak ada pembelian menunggu persetujuan</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
