'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, formatTanggal, getStatusPesananBadge } from '@/lib/format';
import { 
  Plus, 
  Search, 
  ShoppingCart, 
  AlertCircle, 
  RefreshCw,
  Calendar,
  Truck,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  X
} from 'lucide-react';

interface PesananRow {
  id: string;
  nomor: string;
  pelanggan_id: string;
  status: 'draf' | 'dikonfirmasi' | 'dikirim' | 'lunas' | 'dibatalkan';
  total: number;
  dibuat_pada: string;
  dikirim_pada: string | null;
  jatuh_tempo: string | null;
  dilunasi_pada: string | null;
  pelanggan?: {
    nama_toko: string;
  };
  pembuat?: {
    nama_lengkap: string;
  };
  item_pesanan_jual?: Array<{ count: number }>;
}

export default function PesananJualPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [pesananList, setPesananList] = useState<PesananRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('semua');
  const [pelangganFilter, setPelangganFilter] = useState<string>('semua');
  const [pembuatFilter, setPembuatFilter] = useState<string>('semua');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateOpen, setDateOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPesanan = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const supabase = createClient();

      let query = supabase
        .from('pesanan_jual')
        .select(`
          id,
          nomor,
          pelanggan_id,
          status,
          total,
          dibuat_pada,
          dikirim_pada,
          jatuh_tempo,
          dilunasi_pada,
          pelanggan:pelanggan_id ( nama_toko ),
          pembuat:dibuat_oleh ( nama_lengkap ),
          item_pesanan_jual ( count )
        `)
        .order('dibuat_pada', { ascending: false });

      // Staf Gudang hanya boleh melihat dikonfirmasi ke atas (PRD Bab 7 & Wireframe)
      if (profile?.peran === 'gudang') {
        query = query.in('status', ['dikonfirmasi', 'dikirim', 'lunas']);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPesananList((data as unknown as PesananRow[]) || []);
    } catch (err: unknown) {
      console.error('Gagal mengambil data pesanan jual:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile) {
      fetchPesanan();
    }
  }, [authLoading, profile]);

  const isOverdue = (item: PesananRow) => {
    if (item.status === 'dikirim' && item.jatuh_tempo) {
      const today = new Date().toISOString().split('T')[0];
      return item.jatuh_tempo < today;
    }
    return false;
  };

  // Statistik Ringkas KPI Pesanan Jual (seragam dengan Pelanggan & Barang)
  const stats = useMemo(() => {
    const total = pesananList.length;
    const totalNilai = pesananList
      .filter((p) => p.status !== 'dibatalkan')
      .reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    const dikonfirmasi = pesananList.filter((p) => p.status === 'dikonfirmasi').length;
    const dikirim = pesananList.filter((p) => p.status === 'dikirim').length;
    const lunas = pesananList.filter((p) => p.status === 'lunas').length;
    const overdueCount = pesananList.filter((p) => isOverdue(p)).length;

    return { total, totalNilai, dikonfirmasi, dikirim, lunas, overdueCount };
  }, [pesananList]);

  // Pilihan Pelanggan Unik dari Data
  const pelangganOptions = useMemo(() => {
    const setToko = new Set<string>();
    pesananList.forEach((it) => {
      if (it.pelanggan?.nama_toko) setToko.add(it.pelanggan.nama_toko);
    });
    return Array.from(setToko).sort();
  }, [pesananList]);

  // Pilihan Pembuat Unik dari Data
  const pembuatOptions = useMemo(() => {
    const setPembuat = new Set<string>();
    pesananList.forEach((it) => {
      if (it.pembuat?.nama_lengkap) setPembuat.add(it.pembuat.nama_lengkap);
    });
    return Array.from(setPembuat).sort();
  }, [pesananList]);

  // Label Rentang Tanggal sesuai Wireframe
  const dateLabel = useMemo(() => {
    if (startDate && endDate) {
      if (startDate === '2026-09-01' && endDate === '2026-10-14') {
        return '1 Sep 2026 s.d 14 Okt 2026';
      }
      return `${formatTanggal(startDate)} s.d ${formatTanggal(endDate)}`;
    }
    if (startDate) return `Dari ${formatTanggal(startDate)}`;
    if (endDate) return `Sampai ${formatTanggal(endDate)}`;
    return '1 Sep 2026 s.d 14 Okt 2026';
  }, [startDate, endDate]);

  // Filter Data Gabungan
  const filteredPesanan = useMemo(() => {
    return pesananList.filter((item) => {
      // 1. Filter Status
      if (statusFilter !== 'semua' && item.status !== statusFilter) {
        return false;
      }
      // 2. Filter Pelanggan
      if (pelangganFilter !== 'semua' && item.pelanggan?.nama_toko !== pelangganFilter) {
        return false;
      }
      // 3. Filter Pembuat
      if (pembuatFilter !== 'semua' && item.pembuat?.nama_lengkap !== pembuatFilter) {
        return false;
      }
      // 4. Filter Rentang Tanggal
      if (startDate) {
        const itemDate = item.dibuat_pada.split('T')[0];
        if (itemDate < startDate) return false;
      }
      if (endDate) {
        const itemDate = item.dibuat_pada.split('T')[0];
        if (itemDate > endDate) return false;
      }
      // 5. Input Pencarian
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const noMatch = item.nomor?.toLowerCase().includes(query);
        const tokoMatch = item.pelanggan?.nama_toko?.toLowerCase().includes(query);
        const pembuatMatch = item.pembuat?.nama_lengkap?.toLowerCase().includes(query);
        return noMatch || tokoMatch || pembuatMatch;
      }
      return true;
    });
  }, [pesananList, statusFilter, pelangganFilter, pembuatFilter, startDate, endDate, searchQuery]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Halaman (Seragam dengan Pelanggan & Barang) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pesanan Jual</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {pesananList.length} Pesanan
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Daftar pesanan penjualan, penerbitan invoice, dan pemantauan status pesanan pelanggan
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPesanan}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {profile?.peran !== 'gudang' && (
            <Link
              href="/pesanan-jual/baru"
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Pesanan Baru</span>
            </Link>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl text-sm flex items-center justify-between gap-3 bg-rose-50 text-rose-800 border border-rose-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3 Kartu Ringkasan KPI Pesanan Jual (Persis Gaya Modul Pelanggan) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Pesanan</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total} Dokumen</p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">{formatRupiah(stats.totalNilai)} total perputaran</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Siap Kirim (Gudang)</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{stats.dikonfirmasi} Pesanan</p>
            <p className="text-xs text-amber-600 mt-0.5 font-medium">Pesanan dikonfirmasi siap diproses</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Tagihan Lewat Tempo</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{stats.overdueCount} Pesanan</p>
            <p className="text-xs text-rose-600 mt-0.5 font-medium">Pesanan dikirim melampaui tanggal tempo</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar Card Terpadu (Sesuai Gaya Pelanggan) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        {/* Baris Atas: Status Pills & Search Box */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {(
              profile?.peran === 'gudang'
                ? [
                    { id: 'semua', label: 'Semua Status' },
                    { id: 'dikonfirmasi', label: `Dikonfirmasi (${stats.dikonfirmasi})` },
                    { id: 'dikirim', label: `Dikirim (${stats.dikirim})` },
                    { id: 'lunas', label: `Lunas (${stats.lunas})` },
                  ]
                : [
                    { id: 'semua', label: 'Semua Status' },
                    { id: 'draf', label: 'Draf' },
                    { id: 'dikonfirmasi', label: `Dikonfirmasi (${stats.dikonfirmasi})` },
                    { id: 'dikirim', label: `Dikirim (${stats.dikirim})` },
                    { id: 'lunas', label: `Lunas (${stats.lunas})` },
                    { id: 'dibatalkan', label: 'Dibatalkan' },
                  ]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
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
              placeholder="Cari nomor pesanan, toko, pembuat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
            />
          </div>
        </div>

        {/* Baris Bawah: Secondary Filters (Pelanggan, Pembuat, Rentang Tanggal) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" />
            Filter Lanjutan:
          </span>

          {/* Dropdown Pelanggan */}
          <div className="relative">
            <select
              value={pelangganFilter}
              onChange={(e) => setPelangganFilter(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-7 py-1.5 text-xs text-slate-700 font-medium hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-[200px] truncate"
            >
              <option value="semua">Pelanggan: Semua Toko</option>
              {pelangganOptions.map((nama) => (
                <option key={nama} value={nama}>
                  Toko: {nama}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
              ▾
            </span>
          </div>

          {/* Dropdown Pembuat (Jika ada variasi akun pembuat) */}
          {pembuatOptions.length > 1 && (
            <div className="relative">
              <select
                value={pembuatFilter}
                onChange={(e) => setPembuatFilter(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-7 py-1.5 text-xs text-slate-700 font-medium hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-[180px] truncate"
              >
                <option value="semua">Pembuat: Semua Staf</option>
                {pembuatOptions.map((nama) => (
                  <option key={nama} value={nama}>
                    Sales: {nama}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                ▾
              </span>
            </div>
          )}

          {/* Popover Rentang Tanggal */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDateOpen(!dateOpen)}
              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateLabel}</span>
              <span className="text-[10px] text-slate-400">▾</span>
            </button>

            {dateOpen && (
              <div className="absolute left-0 mt-1.5 z-30 w-72 p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xl text-xs space-y-2.5">
                <div className="font-semibold text-slate-800 pb-1.5 border-b border-slate-100 flex items-center justify-between">
                  <span>Filter Rentang Tanggal</span>
                  <button
                    type="button"
                    onClick={() => setDateOpen(false)}
                    className="text-slate-400 hover:text-slate-600 text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('2026-09-01');
                      setEndDate('2026-10-14');
                      setDateOpen(false);
                    }}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-left text-slate-700 font-medium text-[11px]"
                  >
                    Semua Periode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('2026-10-01');
                      setEndDate('2026-10-31');
                      setDateOpen(false);
                    }}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-left text-slate-700 font-medium text-[11px]"
                  >
                    Oktober 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('2026-09-01');
                      setEndDate('2026-09-30');
                      setDateOpen(false);
                    }}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-left text-slate-700 font-medium text-[11px]"
                  >
                    September 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setDateOpen(false);
                    }}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-left text-slate-700 font-medium text-[11px]"
                  >
                    Reset Tanggal
                  </button>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Mulai:</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 rounded-lg border border-slate-200 text-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Sampai:</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 rounded-lg border border-slate-200 text-slate-800 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tombol Reset Filter jika ada filter aktif */}
          {(statusFilter !== 'semua' || pelangganFilter !== 'semua' || pembuatFilter !== 'semua' || startDate || endDate || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('semua');
                setPelangganFilter('semua');
                setPembuatFilter('semua');
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors font-medium ml-auto"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabel Data Pesanan Sesuai Standar Modul Pelanggan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span>Memuat data pesanan jual...</span>
          </div>
        ) : filteredPesanan.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-base text-slate-800">Tidak ada pesanan ditemukan</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery || statusFilter !== 'semua' || pelangganFilter !== 'semua' || pembuatFilter !== 'semua' || startDate || endDate
                ? 'Coba ubah filter atau kata kunci pencarian Anda.'
                : 'Belum ada pesanan jual yang tercatat di sistem.'}
            </p>
            {profile?.peran !== 'gudang' && (
              <div className="mt-4">
                <Link
                  href="/pesanan-jual/baru"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Pesanan Baru</span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Nomor</th>
                  <th className="py-3 px-3">Tanggal</th>
                  <th className="py-3 px-4">Pelanggan</th>
                  <th className="py-3 px-3">Pembuat</th>
                  <th className="py-3 px-2 text-center">Baris</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4">Jatuh Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPesanan.map((item) => {
                  const badge = getStatusPesananBadge(item.status);
                  const overdue = isOverdue(item);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/pesanan-jual/${item.id}`)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 group-hover:text-blue-600 transition-colors whitespace-nowrap">
                        {item.nomor}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {formatTanggal(item.dibuat_pada)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {item.pelanggan?.nama_toko || '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {item.pembuat?.nama_lengkap || '-'}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-700 font-mono font-medium whitespace-nowrap">
                        {item.item_pesanan_jual?.[0]?.count ?? 1}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatRupiah(item.total)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.jatuh_tempo ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-slate-700 font-medium">
                              {formatTanggal(item.jatuh_tempo)}
                            </span>
                            {overdue && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 whitespace-nowrap">
                                Lewat jatuh tempo
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Catatan Keterangan Wireframe Halaman 2 */}
        <div className="p-3.5 bg-slate-50/60 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            Staf Gudang hanya melihat pesanan berstatus dikonfirmasi ke atas. Kolom harga pokok dan margin tidak ada di halaman ini untuk peran mana pun (BR-12).
          </span>
          <span className="text-slate-400 font-mono text-[11px] shrink-0">
            Menampilkan {filteredPesanan.length} dari {pesananList.length} pesanan
          </span>
        </div>
      </div>
    </div>
  );
}
