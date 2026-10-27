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
  const [periodeFilter, setPeriodeFilter] = useState<'semua' | 'oktober' | 'september' | '30hari'>('semua');
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

  const periodeLabel = useMemo(() => {
    switch (periodeFilter) {
      case 'oktober':
        return '1 Oktober 2026 sampai 31 Oktober 2026';
      case 'september':
        return '1 September 2026 sampai 30 September 2026';
      case '30hari':
        return '30 Hari Terakhir';
      default:
        return '1 September 2026 sampai 14 Oktober 2026';
    }
  }, [periodeFilter]);

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
          dibuat_pada,
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
          pesanan:pesanan_jual_id ( status, dikirim_pada, dibuat_pada ),
          barang:barang_id ( kode, nama, harga_pokok )
        `);

      if (iError) throw iError;

      // Filter pesanan dan item sesuai periodeFilter yang dipilih
      const filterByDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (periodeFilter === 'oktober') {
          return d.getFullYear() === 2026 && d.getMonth() === 9; // Oktober
        }
        if (periodeFilter === 'september') {
          return d.getFullYear() === 2026 && d.getMonth() === 8; // September
        }
        if (periodeFilter === '30hari') {
          const thirtyDaysAgo = new Date('2026-09-14T00:00:00');
          return d >= thirtyDaysAgo;
        }
        return true;
      };

      // Filter item hanya untuk pesanan berstatus dikirim dan lunas (PRD Bab 9: pesanan batal & draf tidak dihitung)
      const validItems = (itemsData || []).filter((item: any) => {
        const isValidStatus = ['dikirim', 'lunas'].includes(item.pesanan?.status);
        const matchPeriode = filterByDate(item.pesanan?.dikirim_pada || item.pesanan?.dibuat_pada);
        return isValidStatus && matchPeriode;
      });

      // Hitung akumulasi per barang
      const itemMap: Record<string, ItemMarginRow> = {};
      validItems.forEach((item: any) => {
        const bid = item.barang_id;
        const subtotal = Number(item.subtotal) || 0;
        const qty = Number(item.jumlah) || 0;
        const hpp = Number(item.hpp_satuan || item.barang?.harga_pokok) || 0;
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

      // 4. Hitung bucket mingguan dari data nyata jika tersedia
      if (pesananList && pesananList.length > 0) {
        const weeksDef = [
          { start: new Date('2026-08-31'), end: new Date('2026-09-07'), label: '31/8', minggu: '2026-08-31' },
          { start: new Date('2026-09-07'), end: new Date('2026-09-14'), label: '7/9', minggu: '2026-09-07' },
          { start: new Date('2026-09-14'), end: new Date('2026-09-21'), label: '14/9', minggu: '2026-09-14' },
          { start: new Date('2026-09-21'), end: new Date('2026-09-28'), label: '21/9', minggu: '2026-09-21' },
          { start: new Date('2026-09-28'), end: new Date('2026-10-05'), label: '28/9', minggu: '2026-09-28' },
          { start: new Date('2026-10-05'), end: new Date('2026-10-12'), label: '5/10', minggu: '2026-10-05' },
          { start: new Date('2026-10-12'), end: new Date('2026-10-19'), label: '12/10', minggu: '2026-10-12' },
        ];

        const computedWeeks: WeeklyStat[] = weeksDef.map((w) => {
          const ordersInWeek = pesananList.filter((p: any) => {
            const d = new Date(p.dikirim_pada || p.dibuat_pada || '');
            return d >= w.start && d < w.end && ['dikirim', 'lunas'].includes(p.status);
          });

          const omzet = ordersInWeek.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
          const orderIds = new Set(ordersInWeek.map((o: any) => o.id));

          let margin = 0;
          if (itemsData && itemsData.length > 0) {
            for (const it of (itemsData as any[])) {
              if (orderIds.has(it.pesanan_jual_id)) {
                const sub = Number(it.subtotal || 0);
                const b = Array.isArray(it.barang) ? it.barang[0] : it.barang;
                const hpp = Number(it.hpp_satuan || b?.harga_pokok || 0);
                const qty = Number(it.jumlah || 0);
                margin += (sub - (hpp * qty));
              }
            }
          }

          return {
            minggu: w.minggu,
            label: w.label,
            omzet,
            margin,
          };
        });

        const hasRealWeekly = computedWeeks.some((w) => w.omzet > 0);
        if (hasRealWeekly) {
          setWeeklyStats(computedWeeks);
        }
      }
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
  }, [isManager, periodeFilter]);

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
    <div className="p-8 max-w-7xl mx-auto space-y-6">
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
            Periode {periodeLabel} · berdasarkan tanggal kirim
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dropdown Periode di Samping Ekspor CSV */}
          <div className="relative">
            <select
              value={periodeFilter}
              onChange={(e) => setPeriodeFilter(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
            >
              <option value="semua">Semua Periode (Sep - Okt 2026)</option>
              <option value="oktober">Bulan Ini (Oktober 2026)</option>
              <option value="september">Bulan Lalu (September 2026)</option>
              <option value="30hari">30 Hari Terakhir</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
              ▾
            </span>
          </div>

          <button
            onClick={loadLaporanData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
            title="Muat ulang laporan"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* Grid Utama 2 Kolom Seimbang Sesuai Wireframe Page 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KOLOM KIRI: Grafik Omzet & Margin Mingguan + Tabel Piutang Pelanggan */}
        <div className="space-y-6">
          {/* Card 1: Omzet dan Margin per Minggu */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Omzet dan margin per minggu
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <span className="w-2.5 h-2.5 rounded bg-slate-400" />
                  <span>Omzet</span>
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-blue-700">
                  <span className="w-2.5 h-2.5 rounded bg-blue-600" />
                  <span>Margin</span>
                </div>
                <span className="text-slate-400 font-medium">·</span>
                <span className="text-slate-600 font-medium">
                  total omzet <strong>{formatRupiah(totalOmzetMingguan)}</strong>, margin{' '}
                  <strong className="text-blue-900">{formatRupiah(totalMarginMingguan)}</strong> ({persenMarginMingguan}%)
                </span>
              </div>
            </div>

            {/* Visualisasi Grafik Batang Berdiri Kokoh dengan Tinggi Eksplisit */}
            <div className="h-56 flex items-end justify-between gap-1 sm:gap-2 pt-4 pb-2 px-2 border-b border-slate-100">
              {weeklyStats.map((w, idx) => {
                const omzetHeightPercent = Math.max(6, Math.min(100, Math.round((w.omzet / maxOmzet) * 100)));
                const marginHeightPercent = Math.max(4, Math.min(100, Math.round((w.margin / maxOmzet) * 100)));
                const omzetJt = (w.omzet / 1000000).toFixed(1);

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <span className="text-[10px] font-mono text-slate-500 font-medium mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {omzetJt} jt
                    </span>

                    {/* Kontainer batang dengan tinggi terukur 160px (h-40) agar height % pasti muncul */}
                    <div className="w-full h-40 flex items-end justify-center gap-1 sm:gap-1.5 pb-1">
                      {/* Batang Omzet */}
                      <div
                        style={{ height: `${omzetHeightPercent}%` }}
                        className="w-3.5 sm:w-5 bg-slate-400 rounded-t group-hover:bg-slate-500 transition-all shadow-sm min-h-[6px]"
                        title={`Omzet: ${formatRupiah(w.omzet)}`}
                      />
                      {/* Batang Margin */}
                      <div
                        style={{ height: `${marginHeightPercent}%` }}
                        className="w-3.5 sm:w-5 bg-blue-600 rounded-t group-hover:bg-blue-700 transition-all shadow-sm min-h-[6px]"
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
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Piutang per pelanggan</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pengelompokan umur tagihan pesanan dikirim & dikonfirmasi
              </p>
            </div>

            <div className="overflow-hidden">
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="py-2.5 px-3 w-[34%]">Pelanggan</th>
                    <th className="py-2.5 px-2.5 text-right w-[22%]">Belum Tempo</th>
                    <th className="py-2.5 px-2.5 text-right text-amber-700 w-[22%]">Lewat 1-30 Hr</th>
                    <th className="py-2.5 px-2.5 text-right text-rose-700 w-[22%]">Lewat &gt;30 Hr</th>
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
                        <td className="py-2.5 px-3 font-semibold text-slate-900 truncate" title={p.nama_toko}>
                          {p.nama_toko}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-medium text-slate-800 truncate">
                          {p.belum_tempo > 0 ? formatRupiah(p.belum_tempo) : '-'}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-amber-700 truncate">
                          {p.lewat_1_30 > 0 ? formatRupiah(p.lewat_1_30) : '-'}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-rose-700 truncate">
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

        {/* KOLOM KANAN: Tabel Margin per Barang Sesuai Wireframe Page 4 */}
        <div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Margin per barang</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kontribusi keuntungan produk dari pesanan dikirim & lunas
              </p>
            </div>

            <div className="overflow-hidden">
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="py-2.5 px-3 w-[32%]">Barang</th>
                    <th className="py-2.5 px-2 text-center w-[14%]">Terjual</th>
                    <th className="py-2.5 px-2.5 text-right w-[24%]">Omzet</th>
                    <th className="py-2.5 px-2.5 text-right text-blue-800 w-[22%]">Margin</th>
                    <th className="py-2.5 px-2 text-right w-[8%]">%</th>
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
                        <td className="py-2 px-3 font-medium text-slate-900 truncate" title={item.nama}>
                          {item.nama}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-slate-600 truncate">
                          {item.terjual}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-medium text-slate-900 truncate">
                          {formatRupiah(item.omzet)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-blue-900 truncate">
                          {formatRupiah(item.margin)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600 truncate">
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
