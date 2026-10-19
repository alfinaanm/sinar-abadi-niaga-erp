'use client';

import React, { useEffect, useState } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  omzetOktober: number;
  pesananDikirimCount: number;
  marginOktober: number;
  marginPersen: number;
  piutangBerjalan: number;
  piutangLewatTempo: number;
  stokMenipisCount: number;
}

interface ItemStokMenipis {
  id: string;
  kode: string;
  nama: string;
  stok: number;
  stok_minimum: number;
}

interface PembelianMenunggu {
  id: string;
  nomor: string;
  nama_barang: string;
  jumlah_dipesan: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    omzetOktober: 40184400,
    pesananDikirimCount: 8,
    marginOktober: 2620400,
    marginPersen: 6.5,
    piutangBerjalan: 63777000,
    piutangLewatTempo: 3398800,
    stokMenipisCount: 4,
  });
  const [stokMenipis, setStokMenipis] = useState<ItemStokMenipis[]>([]);
  const [pembelianMenunggu, setPembelianMenunggu] = useState<PembelianMenunggu[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const isManager = profile?.peran === 'manajer';

  useEffect(() => {
    async function loadDashboardData() {
      try {
        // 1. Ambil daftar barang yang stoknya menipis
        const { data: items } = await supabase
          .from('barang')
          .select('id, kode, nama, stok, stok_minimum')
          .filter('stok', 'lte', 'stok_minimum')
          .eq('aktif', true)
          .limit(5);

        if (items) {
          setStokMenipis(items as ItemStokMenipis[]);
          setStats((prev) => ({ ...prev, stokMenipisCount: items.length }));
        }

        // 2. Ambil pembelian berstatus diajukan
        const { data: poList } = await supabase
          .from('pembelian')
          .select('id, nomor, jumlah_dipesan, barang:barang_id(nama)')
          .eq('status', 'diajukan')
          .limit(4);

        if (poList) {
          setPembelianMenunggu(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            poList.map((po: any) => ({
              id: po.id,
              nomor: po.nomor,
              nama_barang: po.barang?.nama || 'Barang',
              jumlah_dipesan: po.jumlah_dipesan,
            }))
          );
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [supabase]);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Dashboard Sesuai Wireframe */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Selamat datang, <span className="font-semibold text-slate-800">{profile?.nama_lengkap}</span> ({formatPeran(profile?.peran || 'penjualan')}) · Data operasional CV Sinar Abadi Niaga
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Sistem Aktif & Terlindungi RLS
          </span>
        </div>
      </div>

      {/* 4 Kartu KPI Sesuai Wireframe */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: Omzet */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Omzet Oktober
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatRupiah(stats.omzetOktober)}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {stats.pesananDikirimCount} pesanan dikirim & lunas
          </p>
        </div>

        {/* KPI 2: Margin (Hanya Tampil untuk Manajer sesuai BR-12 & Wireframe) */}
        {isManager ? (
          <div className="bg-white p-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-white to-blue-50/30 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between text-blue-700 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                Margin Oktober <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-normal">Khusus Manajer</span>
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-blue-900">
              {formatRupiah(stats.marginOktober)}
            </p>
            <p className="text-xs text-blue-600 mt-1 font-medium">
              {stats.marginPersen}% dari total omzet
            </p>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-center text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider mb-1">
              Margin Keuntungan
            </span>
            <p className="text-sm font-medium italic text-slate-500">
              Informasi rahasia khusus Manajer
            </p>
          </div>
        )}

        {/* KPI 3: Piutang Berjalan */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Piutang Berjalan
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatRupiah(stats.piutangBerjalan)}
          </p>
          <p className="text-xs text-red-600 mt-1 font-medium">
            Lewat tempo: {formatRupiah(stats.piutangLewatTempo)}
          </p>
        </div>

        {/* KPI 4: Stok Menipis */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Barang Stok Menipis
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-600">
            {stats.stokMenipisCount} Barang
          </p>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Stok ≤ batas stok minimum
          </p>
        </div>
      </div>

      {/* Konten Utama 2 Kolom (Sesuai Wireframe) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Kolom Kiri: Visualisasi Omzet Mingguan (2 Kolom Grid) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Omzet {isManager ? '& Margin ' : ''}per Minggu
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                8 Minggu terakhir (dalam juta rupiah)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-400" />
                <span className="text-slate-600 font-medium">Omzet</span>
              </div>
              {isManager && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-blue-600" />
                  <span className="text-slate-600 font-medium">Margin</span>
                </div>
              )}
            </div>
          </div>

          {/* Bar Chart Sederhana & Responsif Sesuai Wireframe */}
          <div className="h-64 flex items-end justify-between gap-3 pt-8 pb-4 px-2 border-b border-slate-100">
            {[
              { tgl: '31/8', omzet: 20.3, margin: 1.4 },
              { tgl: '7/9', omzet: 25.7, margin: 1.8 },
              { tgl: '14/9', omzet: 10.4, margin: 0.7 },
              { tgl: '21/9', omzet: 18.2, margin: 1.2 },
              { tgl: '28/9', omzet: 4.6, margin: 0.3 },
              { tgl: '5/10', omzet: 32.7, margin: 2.1 },
              { tgl: '12/10', omzet: 4.7, margin: 0.3 },
            ].map((bar, idx) => {
              const maxVal = 36;
              const omzetHeight = (bar.omzet / maxVal) * 100;
              const marginHeight = (bar.margin / maxVal) * 100;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                  <span className="text-[10px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    {bar.omzet}jt
                  </span>
                  <div className="w-full flex items-end justify-center gap-1 h-full">
                    {/* Batang Omzet */}
                    <div
                      style={{ height: `${omzetHeight}%` }}
                      className="w-1/2 bg-slate-300 group-hover:bg-slate-400 rounded-t-md transition-all"
                    />
                    {/* Batang Margin (Khusus Manajer) */}
                    {isManager && (
                      <div
                        style={{ height: `${marginHeight}%` }}
                        className="w-1/2 bg-blue-600 group-hover:bg-blue-700 rounded-t-md transition-all"
                      />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium mt-1">
                    {bar.tgl}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-3 text-center">
            Minggu mulai (Senin) · Total 45 transaksi dari data contoh
          </p>
        </div>

        {/* Kolom Kanan: Widget Operasional Stok Menipis & Pembelian */}
        <div className="space-y-6">
          {/* Widget 1: Stok Menipis */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                Stok Menipis
              </h3>
              <Link href="/barang" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                Semua <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {stokMenipis.length > 0 ? (
                stokMenipis.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between">
                    <div className="overflow-hidden pr-2">
                      <p className="font-semibold text-slate-800 truncate">{item.nama}</p>
                      <p className="text-slate-400 text-[11px]">{item.kode}</p>
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

          {/* Widget 2: Pembelian Menunggu Keputusan */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                Pembelian Menunggu
              </h3>
              <Link href="/pembelian" className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                Kelola <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {pembelianMenunggu.length > 0 ? (
                pembelianMenunggu.map((po) => (
                  <div key={po.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{po.nomor}</p>
                      <p className="text-slate-500 text-[11px] truncate max-w-[140px]">{po.nama_barang}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-600">{po.jumlah_dipesan} unit</span>
                      {isManager && (
                        <Link
                          href="/pembelian"
                          className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 text-[11px]"
                        >
                          Tinjau
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-slate-400">
                  <p>Tidak ada pembelian menunggu keputusan</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
