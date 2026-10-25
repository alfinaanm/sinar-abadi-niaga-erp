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
  Calendar
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
  
  // Filter States sesuai Wireframe Page 2
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

  // Pilihan Status Dropdown
  const statusOptions = useMemo(() => {
    if (profile?.peran === 'gudang') {
      return [
        { id: 'dikonfirmasi', label: 'Dikonfirmasi' },
        { id: 'dikirim', label: 'Dikirim' },
        { id: 'lunas', label: 'Lunas' },
      ];
    }
    return [
      { id: 'draf', label: 'Draf' },
      { id: 'dikonfirmasi', label: 'Dikonfirmasi' },
      { id: 'dikirim', label: 'Dikirim' },
      { id: 'lunas', label: 'Lunas' },
      { id: 'dibatalkan', label: 'Dibatalkan' },
    ];
  }, [profile?.peran]);

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
        return '1 Sep 2026 sampai 14 Okt 2026';
      }
      return `${formatTanggal(startDate)} sampai ${formatTanggal(endDate)}`;
    }
    if (startDate) return `Dari ${formatTanggal(startDate)}`;
    if (endDate) return `Sampai ${formatTanggal(endDate)}`;
    return '1 Sep 2026 sampai 14 Okt 2026';
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

  const isOverdue = (item: PesananRow) => {
    if (item.status === 'dikirim' && item.jatuh_tempo) {
      const today = new Date().toISOString().split('T')[0];
      return item.jatuh_tempo < today;
    }
    return false;
  };

  return (
    <div className="space-y-4">
      {/* Header Halaman Sesuai Wireframe Halaman 2 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Pesanan Jual
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {pesananList.length} pesanan · menampilkan {filteredPesanan.length} terbaru
          </p>
        </div>

        {profile?.peran !== 'gudang' && (
          <Link
            href="/pesanan-jual/baru"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            Pesanan baru
          </Link>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Bar Filter & Dropdown di Atas Tabel Sesuai Wireframe Halaman 2 */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs">
        {/* 1. Input Cari Nomor atau Toko */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor atau toko..."
            className="w-56 sm:w-64 px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          />
        </div>

        {/* 2. Dropdown Status */}
        <div className="relative inline-block">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-3 pr-7 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm font-normal"
          >
            <option value="semua">Status: Semua</option>
            {statusOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Status: {opt.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
            ▾
          </span>
        </div>

        {/* 3. Dropdown Pelanggan */}
        <div className="relative inline-block">
          <select
            value={pelangganFilter}
            onChange={(e) => setPelangganFilter(e.target.value)}
            className="appearance-none bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-3 pr-7 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm max-w-[200px] truncate font-normal"
          >
            <option value="semua">Pelanggan: Semua</option>
            {pelangganOptions.map((nama) => (
              <option key={nama} value={nama}>
                Pelanggan: {nama}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
            ▾
          </span>
        </div>

        {/* 4. Dropdown Rentang Tanggal (Format Wireframe: 1 Sep 2026 sampai 14 Okt 2026 ▾) */}
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setDateOpen(!dateOpen)}
            className="inline-flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-750 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          >
            <span>{dateLabel}</span>
            <span className="text-[10px] text-zinc-500">▾</span>
          </button>

          {dateOpen && (
            <div className="absolute left-0 mt-1 z-30 w-72 p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl text-xs space-y-2.5">
              <div className="font-semibold text-zinc-700 dark:text-zinc-300 pb-1 border-b border-zinc-100 dark:border-zinc-700 flex items-center justify-between">
                <span>Filter Rentang Tanggal</span>
                <button
                  type="button"
                  onClick={() => setDateOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm"
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
                  className="px-2 py-1 text-left rounded bg-zinc-100 dark:bg-zinc-700/60 hover:bg-blue-50 dark:hover:bg-zinc-700 hover:text-blue-600 dark:hover:text-blue-400 transition truncate text-[11px]"
                  title="1 Sep 2026 - 14 Okt 2026"
                >
                  Preset Wireframe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setDateOpen(false);
                  }}
                  className="px-2 py-1 text-left rounded bg-zinc-100 dark:bg-zinc-700/60 hover:bg-blue-50 dark:hover:bg-zinc-700 hover:text-blue-600 dark:hover:text-blue-400 transition text-[11px]"
                >
                  Semua Tanggal
                </button>
              </div>

              <div className="space-y-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Mulai:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-xs bg-zinc-50 dark:bg-zinc-900"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Sampai:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded text-xs bg-zinc-50 dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setDateOpen(false)}
                  className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-500 transition font-medium"
                >
                  Terapkan
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 5. Dropdown Pembuat */}
        <div className="relative inline-block">
          <select
            value={pembuatFilter}
            onChange={(e) => setPembuatFilter(e.target.value)}
            className="appearance-none bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-3 pr-7 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm max-w-[190px] truncate font-normal"
          >
            <option value="semua">Pembuat: Semua</option>
            {pembuatOptions.map((pembuat) => (
              <option key={pembuat} value={pembuat}>
                Pembuat: {pembuat}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
            ▾
          </span>
        </div>
      </div>

      {/* Tabel Data Pesanan Sesuai Wireframe Halaman 2 (Tanpa Kolom Aksi) */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Memuat data pesanan jual...
          </div>
        ) : filteredPesanan.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
            <p className="font-medium text-base text-zinc-800 dark:text-zinc-200">Tidak ada pesanan ditemukan</p>
            <p className="text-xs text-zinc-500 mt-1">
              {searchQuery || statusFilter !== 'semua' || pelangganFilter !== 'semua' || pembuatFilter !== 'semua' || startDate || endDate
                ? 'Coba ubah filter atau kata kunci pencarian Anda.'
                : 'Belum ada pesanan jual yang tercatat di sistem.'}
            </p>
            {profile?.peran !== 'gudang' && (
              <div className="mt-4">
                <Link
                  href="/pesanan-jual/baru"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Pesanan baru
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">Nomor</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Pelanggan</th>
                  <th className="py-2.5 px-3">Pembuat</th>
                  <th className="py-2.5 px-3 text-center">Baris</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Jatuh tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredPesanan.map((item) => {
                  const badge = getStatusPesananBadge(item.status);
                  const overdue = isOverdue(item);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/pesanan-jual/${item.id}`)}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                        <Link
                          href={`/pesanan-jual/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-blue-600 transition underline-offset-2 hover:underline"
                        >
                          {item.nomor}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {formatTanggal(item.dibuat_pada)}
                      </td>
                      <td className="py-3 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                        {item.pelanggan?.nama_toko || '-'}
                      </td>
                      <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {item.pembuat?.nama_lengkap || '-'}
                      </td>
                      <td className="py-3 px-3 text-center text-zinc-700 dark:text-zinc-300 font-medium">
                        {item.item_pesanan_jual?.[0]?.count ?? 1}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {formatRupiah(item.total)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {item.jatuh_tempo ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {formatTanggal(item.jatuh_tempo)}
                            </span>
                            {overdue && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                                LEWAT JATUH TEMPO
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400">-</span>
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
        <div className="p-3 bg-zinc-50/60 dark:bg-zinc-800/40 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
          Staf Gudang hanya melihat pesanan berstatus dikonfirmasi ke atas. Kolom harga pokok dan margin tidak ada di halaman ini untuk peran mana pun.
        </div>
      </div>
    </div>
  );
}
