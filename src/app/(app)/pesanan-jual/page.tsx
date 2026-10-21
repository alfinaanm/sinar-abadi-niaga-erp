'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, formatTanggal, getStatusPesananBadge } from '@/lib/format';
import { 
  Plus, 
  Search, 
  Filter, 
  ShoppingCart, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  XCircle,
  Eye,
  RefreshCw
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
}

export default function PesananJualPage() {
  const { profile, loading: authLoading } = useAuth();
  const [pesananList, setPesananList] = useState<PesananRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('semua');
  const [searchQuery, setSearchQuery] = useState('');
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
          pembuat:dibuat_oleh ( nama_lengkap )
        `)
        .order('dibuat_pada', { ascending: false });

      // Staf Gudang hanya boleh melihat dikonfirmasi ke atas (PRD Bab 7)
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

  // Tab filter list disesuaikan dengan peran
  const statusTabs = useMemo(() => {
    if (profile?.peran === 'gudang') {
      return [
        { id: 'semua', label: 'Semua Siap / Kirim' },
        { id: 'dikonfirmasi', label: 'Dikonfirmasi (Siap Kirim)' },
        { id: 'dikirim', label: 'Dikirim' },
        { id: 'lunas', label: 'Lunas' },
      ];
    }
    return [
      { id: 'semua', label: 'Semua Status' },
      { id: 'draf', label: 'Draf' },
      { id: 'dikonfirmasi', label: 'Dikonfirmasi' },
      { id: 'dikirim', label: 'Dikirim' },
      { id: 'lunas', label: 'Lunas' },
      { id: 'dibatalkan', label: 'Dibatalkan' },
    ];
  }, [profile?.peran]);

  const filteredPesanan = useMemo(() => {
    return pesananList.filter((item) => {
      // Filter status tab
      if (statusFilter !== 'semua' && item.status !== statusFilter) {
        return false;
      }
      // Filter search
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const noMatch = item.nomor?.toLowerCase().includes(query);
        const tokoMatch = item.pelanggan?.nama_toko?.toLowerCase().includes(query);
        const pembuatMatch = item.pembuat?.nama_lengkap?.toLowerCase().includes(query);
        return noMatch || tokoMatch || pembuatMatch;
      }
      return true;
    });
  }, [pesananList, statusFilter, searchQuery]);

  const isOverdue = (item: PesananRow) => {
    if (item.status === 'dikirim' && item.jatuh_tempo) {
      const today = new Date().toISOString().split('T')[0];
      return item.jatuh_tempo < today;
    }
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-emerald-600" />
            Pesanan Jual (Sales Order)
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Kelola transaksi penjualan, status pengiriman gudang, dan riwayat pesanan pelanggan.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPesanan}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-750 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>

          {profile?.peran !== 'gudang' && (
            <Link
              href="/pesanan-jual/baru"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Pesanan Baru
            </Link>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Bar Filter & Pencarian */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Input Cari */}
        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor SO, toko, atau pembuat..."
            className="w-full pl-9 pr-4 py-1.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Tabel Data Pesanan */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            Memuat data pesanan jual...
          </div>
        ) : filteredPesanan.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 dark:text-zinc-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
            <p className="font-medium text-base text-zinc-800 dark:text-zinc-200">Tidak ada pesanan ditemukan</p>
            <p className="text-xs text-zinc-500 mt-1">
              {searchQuery || statusFilter !== 'semua'
                ? 'Coba ganti filter atau kata kunci pencarian Anda.'
                : 'Belum ada pesanan jual yang tercatat di sistem.'}
            </p>
            {profile?.peran !== 'gudang' && (
              <div className="mt-4">
                <Link
                  href="/pesanan-jual/baru"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Buat Pesanan Pertama
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 font-medium text-xs border-b border-zinc-200 dark:border-zinc-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">No. Pesanan</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Pelanggan</th>
                  <th className="py-3 px-4">Pembuat</th>
                  <th className="py-3 px-4 text-right">Total Nilai</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Jatuh Tempo</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredPesanan.map((item) => {
                  const badge = getStatusPesananBadge(item.status);
                  const overdue = isOverdue(item);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`/pesanan-jual/${item.id}`}
                          className="hover:text-emerald-600 transition"
                        >
                          {item.nomor}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {formatTanggal(item.dibuat_pada)}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                        {item.pelanggan?.nama_toko || 'Toko tidak diketahui'}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400 text-xs">
                        {item.pembuat?.nama_lengkap || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {formatRupiah(item.total)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
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
                      <td className="py-3.5 px-4 text-center">
                        <Link
                          href={`/pesanan-jual/${item.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Rincian
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
