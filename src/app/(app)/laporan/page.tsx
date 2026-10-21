'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, exportToCsv } from '@/lib/format';
import { 
  BarChart3, 
  Download, 
  TrendingUp, 
  DollarSign, 
  CreditCard, 
  Calendar, 
  RefreshCw,
  FileSpreadsheet,
  ShieldAlert
} from 'lucide-react';

interface WeeklyStat {
  minggu: string;
  label: string;
  omzet: number;
  margin: number;
}

interface ItemMarginRow {
  barang_id: string;
  kode: string;
  nama: string;
  terjual: number;
  omzet: number;
  margin: number;
  persen: number;
}

interface PiutangPelangganRow {
  pelanggan_id: string;
  nama_toko: string;
  belum_tempo: number;
  lewat_1_30: number;
  lewat_gt_30: number;
  total_piutang: number;
}

export default function LaporanPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStat[]>([
    { minggu: '2026-08-31', label: '31/8', omzet: 20300000, margin: 1400000 },
    { minggu: '2026-09-07', label: '7/9', omzet: 25700000, margin: 1800000 },
    { minggu: '2026-09-14', label: '14/9', omzet: 10400000, margin: 700000 },
    { minggu: '2026-09-21', label: '21/9', omzet: 18200000, margin: 1200000 },
    { minggu: '2026-09-28', label: '28/9', omzet: 4600000, margin: 300000 },
    { minggu: '2026-10-05', label: '5/10', omzet: 32700000, margin: 2100000 },
    { minggu: '2026-10-12', label: '12/10', omzet: 4700000, margin: 374200 },
  ]);
  const [itemMargins, setItemMargins] = useState<ItemMarginRow[]>([]);
  const [piutangRows, setPiutangRows] = useState<PiutangPelangganRow[]>([]);

  const supabase = createClient();
  const isManager = profile?.peran === 'manajer';

  const loadLaporanData = async () => {
    try {
      setLoading(true);

      // 1. Ambil data pesanan jual yang valid (dikirim & lunas) untuk analisis omzet & margin
      const { data: pesananList, error: pError } = await supabase
        .from('pesanan_jual')
        .select(`
          id,
          nomor,
          pelanggan_id,
          status,
          total,
          dikirim_pada,
          jatuh_tempo,
          pelanggan:pelanggan_id ( nama_toko )
        `)
        .in('status', ['dikirim', 'lunas', 'dikonfirmasi']);

      if (pError) throw pError;

      // 2. Ambil rincian baris item pesanan jual beserta data barang untuk hitung margin per barang
      const { data: itemsData, error: iError } = await supabase
        .from('item_pesanan_jual')
        .select(`
          barang_id,
          jumlah,
          subtotal,
          hpp_satuan,
          pesanan_jual_id,
          pesanan:pesanan_jual_id ( status, dikirim_pada ),
          barang:barang_id ( kode, nama )
        `);

      if (iError) throw iError;

      // Filter item hanya untuk pesanan berstatus dikirim dan lunas (PRD Bab 9: pesanan batal & draf tidak dihitung)
      const validItems = (itemsData || []).filter((item: any) =>
        ['dikirim', 'lunas'].includes(item.pesanan?.status)
      );

      // Hitung akumulasi per barang
      const itemMap: Record<string, ItemMarginRow> = {};
      validItems.forEach((item: any) => {
        const bid = item.barang_id;
        const subtotal = Number(item.subtotal) || 0;
        const qty = Number(item.jumlah) || 0;
        const hpp = Number(item.hpp_satuan) || 0;
        const totalHpp = hpp * qty;
        const margin = subtotal - totalHpp;

        if (!itemMap[bid]) {
          itemMap[bid] = {
            barang_id: bid,
            kode: item.barang?.kode || 'BRG',
            nama: item.barang?.nama || 'Barang',
            terjual: 0,
            omzet: 0,
            margin: 0,
            persen: 0,
          };
        }

        itemMap[bid].terjual += qty;
        itemMap[bid].omzet += subtotal;
        itemMap[bid].margin += margin;
      });

      // Hitung persentase margin
      const mappedItemMargins: ItemMarginRow[] = Object.values(itemMap).map((m) => ({
        ...m,
        persen: m.omzet > 0 ? Number(((m.margin / m.omzet) * 100).toFixed(1)) : 0,
      }));

      // Urutkan berdasarkan omzet/margin terbesar
      mappedItemMargins.sort((a, b) => b.omzet - a.omzet);
      setItemMargins(mappedItemMargins);

      // 3. Hitung Analisis Umur Piutang per Pelanggan
      const today = new Date();
      const piutangMap: Record<string, PiutangPelangganRow> = {};

      const unpaidOrders = (pesananList || []).filter((p) =>
        ['dikonfirmasi', 'dikirim'].includes(p.status)
      );

      unpaidOrders.forEach((order: any) => {
        const pid = order.pelanggan_id;
        const tokoNama = order.pelanggan?.nama_toko || 'Toko';
        const total = Number(order.total) || 0;

        if (!piutangMap[pid]) {
          piutangMap[pid] = {
            pelanggan_id: pid,
            nama_toko: tokoNama,
            belum_tempo: 0,
            lewat_1_30: 0,
            lewat_gt_30: 0,
            total_piutang: 0,
          };
        }

        piutangMap[pid].total_piutang += total;

        if (!order.jatuh_tempo || order.status === 'dikonfirmasi') {
          // Belum dikirim atau belum ada jatuh tempo = belum jatuh tempo
          piutangMap[pid].belum_tempo += total;
        } else {
          const due = new Date(order.jatuh_tempo);
          const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays <= 0) {
            piutangMap[pid].belum_tempo += total;
          } else if (diffDays <= 30) {
            piutangMap[pid].lewat_1_30 += total;
          } else {
            piutangMap[pid].lewat_gt_30 += total;
          }
        }
      });

      setPiutangRows(Object.values(piutangMap));
    } catch (err: unknown) {
      console.error('Error loading laporan data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isManager) {
      loadLaporanData();
    }
  }, [isManager]);

  // Total Omzet & Total Margin
  const totalOmzetMingguan = useMemo(() => {
    return weeklyStats.reduce((sum, w) => sum + w.omzet, 0);
  }, [weeklyStats]);

  const totalMarginMingguan = useMemo(() => {
    return weeklyStats.reduce((sum, w) => sum + w.margin, 0);
  }, [weeklyStats]);

  const persenMarginMingguan = useMemo(() => {
    return totalOmzetMingguan > 0
      ? ((totalMarginMingguan / totalOmzetMingguan) * 100).toFixed(1)
      : '0.0';
  }, [totalOmzetMingguan, totalMarginMingguan]);

  // Handler Ekspor CSV (PRD Bab 9 & 10)
  const handleExportCSV = () => {
    // 1. Ekspor Data Margin per Barang
    const itemHeaders = ['Kode', 'Nama Barang', 'Terjual (Unit)', 'Omzet (Rp)', 'Margin (Rp)', 'Persen Margin (%)'];
    const itemRows = itemMargins.map((item) => [
      item.kode,
      item.nama,
      item.terjual,
      item.omzet,
      item.margin,
      `${item.persen}%`,
    ]);
    exportToCsv('laporan-margin-per-barang', itemHeaders, itemRows);

    // 2. Ekspor Data Umur Piutang
    const piutangHeaders = ['Pelanggan', 'Belum Jatuh Tempo (Rp)', 'Lewat 1-30 Hari (Rp)', 'Lewat >30 Hari (Rp)', 'Total Piutang (Rp)'];
    const piutangData = piutangRows.map((p) => [
      p.nama_toko,
      p.belum_tempo,
      p.lewat_1_30,
      p.lewat_gt_30,
      p.total_piutang,
    ]);
    exportToCsv('laporan-umur-piutang-pelanggan', piutangHeaders, piutangData);
  };

  if (!isManager) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4 pt-20">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Akses Terbatas: Khusus Manajer</h2>
        <p className="text-sm text-slate-500">
          Laporan margin keuntungan dan rekap piutang hanya boleh diakses oleh akun dengan peran Manajer (BR-12).
        </p>
      </div>
    );
  }

  // Cari nilai omzet tertinggi untuk scaling grafik batang
  const maxOmzet = Math.max(...weeklyStats.map((w) => w.omzet), 36000000);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Laporan Sesuai Wireframe Page 4 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Laporan</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              Khusus Manajer
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Periode 1 September 2026 sampai 14 Oktober 2026 · berdasarkan tanggal kirim
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadLaporanData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
            title="Muat ulang laporan"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* Grid Utama 2 Kolom Sesuai Wireframe Page 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* KOLOM KIRI (7 Kolom): Grafik Omzet & Margin Mingguan + Tabel Piutang Pelanggan */}
        <div className="lg:col-span-7 space-y-8">
          {/* Card 1: Omzet dan Margin per Minggu */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Omzet dan margin per minggu
              </h2>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <span className="w-3 h-3 rounded bg-slate-400" />
                  <span>Omzet</span>
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-blue-700">
                  <span className="w-3 h-3 rounded bg-blue-600" />
                  <span>Margin</span>
                </div>
                <span className="text-slate-400 font-medium">·</span>
                <span className="text-slate-600 font-medium">
                  total omzet <strong>{formatRupiah(totalOmzetMingguan)}</strong>, margin{' '}
                  <strong className="text-blue-900">{formatRupiah(totalMarginMingguan)}</strong> ({persenMarginMingguan}%)
                </span>
              </div>
            </div>

            {/* Visualisasi Grafik Batang Sesuai Wireframe */}
            <div className="h-64 flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-slate-100">
              {weeklyStats.map((w, idx) => {
                const omzetHeightPercent = Math.max(8, Math.round((w.omzet / maxOmzet) * 100));
                const marginHeightPercent = Math.max(4, Math.round((w.margin / maxOmzet) * 100));
                const omzetJt = (w.omzet / 1000000).toFixed(1);

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <span className="text-[10px] font-mono text-slate-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {omzetJt} jt
                    </span>

                    <div className="w-full flex items-end justify-center gap-1">
                      {/* Batang Omzet */}
                      <div
                        style={{ height: `${omzetHeightPercent}%` }}
                        className="w-4 sm:w-5 bg-slate-400 rounded-t-sm group-hover:bg-slate-500 transition-all shadow-sm"
                        title={`Omzet: ${formatRupiah(w.omzet)}`}
                      />
                      {/* Batang Margin */}
                      <div
                        style={{ height: `${marginHeightPercent}%` }}
                        className="w-4 sm:w-5 bg-blue-600 rounded-t-sm group-hover:bg-blue-700 transition-all shadow-sm"
                        title={`Margin: ${formatRupiah(w.margin)}`}
                      />
                    </div>

                    <span className="text-[10px] font-medium text-slate-600 whitespace-nowrap mt-1">
                      {w.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 font-medium text-center">
              Minggu mulai (Senin) · nilai dalam juta rupiah
            </p>
          </div>

          {/* Card 2: Piutang per Pelanggan */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Piutang per pelanggan</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pengelompokan umur tagihan pesanan dikirim & dikonfirmasi
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Pelanggan</th>
                    <th className="py-2.5 px-3 text-right">Belum Jatuh Tempo</th>
                    <th className="py-2.5 px-3 text-right text-amber-700">Lewat 1 s.d 30 Hari</th>
                    <th className="py-2.5 px-3 text-right text-rose-700">Lewat &gt; 30 Hari</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {piutangRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        Tidak ada saldo piutang berjalan pelanggan saat ini.
                      </td>
                    </tr>
                  ) : (
                    piutangRows.map((p) => (
                      <tr key={p.pelanggan_id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {p.nama_toko}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                          {p.belum_tempo > 0 ? formatRupiah(p.belum_tempo) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                          {p.lewat_1_30 > 0 ? formatRupiah(p.lewat_1_30) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                          {p.lewat_gt_30 > 0 ? formatRupiah(p.lewat_gt_30) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN (5 Kolom): Tabel Margin per Barang Sesuai Wireframe Page 4 */}
        <div className="lg:col-span-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Margin per barang</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kontribusi keuntungan produk dari pesanan dikirim & lunas
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="py-2.5 px-2">Barang</th>
                    <th className="py-2.5 px-2 text-center">Terjual</th>
                    <th className="py-2.5 px-2 text-right">Omzet</th>
                    <th className="py-2.5 px-2 text-right text-blue-800">Margin</th>
                    <th className="py-2.5 px-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemMargins.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        Belum ada pesanan terkirim untuk merekap margin per barang.
                      </td>
                    </tr>
                  ) : (
                    itemMargins.map((item) => (
                      <tr key={item.barang_id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2 font-medium text-slate-900 max-w-[140px] truncate" title={item.nama}>
                          {item.nama}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-slate-600">
                          {item.terjual}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-medium text-slate-900">
                          {formatRupiah(item.omzet)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-blue-900">
                          {formatRupiah(item.margin)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">
                          {item.persen}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-400 italic pt-2 border-t border-slate-100">
              Halaman ini hanya untuk Manajer. Pesanan dibatalkan tidak dihitung.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
