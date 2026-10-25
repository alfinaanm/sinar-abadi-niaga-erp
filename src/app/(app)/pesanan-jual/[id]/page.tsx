'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { 
  formatRupiah, 
  formatTanggal, 
  formatTanggalWaktu, 
  getStatusPesananBadge 
} from '@/lib/format';
import { 
  ArrowLeft, 
  ShoppingCart, 
  Printer, 
  CheckCircle2, 
  Truck, 
  XCircle, 
  AlertCircle, 
  AlertTriangle,
  Building2,
  Calendar,
  Clock,
  Check,
  TrendingUp,
  FileText
} from 'lucide-react';

interface PesananDetail {
  id: string;
  nomor: string;
  pelanggan_id: string;
  status: 'draf' | 'dikonfirmasi' | 'dikirim' | 'lunas' | 'dibatalkan';
  total: number;
  dibuat_oleh: string;
  dibuat_pada: string;
  dikonfirmasi_pada: string | null;
  dikirim_pada: string | null;
  jatuh_tempo: string | null;
  dilunasi_pada: string | null;
  dibatalkan_pada: string | null;
  alasan_batal: string | null;
  pelanggan?: {
    id?: string;
    kode: string;
    nama_toko: string;
    telepon: string | null;
    alamat: string | null;
    termin_hari: number;
    batas_kredit: number;
  };
  pembuat?: {
    nama_lengkap: string;
  };
}

interface ItemRow {
  id: string;
  barang_id: string;
  jumlah: number;
  harga_satuan: number;
  diskon_persen: number;
  subtotal: number;
  hpp_satuan: number | null; // NULL jika non-manajer
  barang?: {
    kode: string;
    nama: string;
    satuan: string;
  };
}

export default function DetailPesananJualPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusAction = searchParams.get('status_action');
  const { profile, loading: authLoading } = useAuth();
  const [pesanan, setPesanan] = useState<PesananDetail | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [piutangBerjalan, setPiutangBerjalan] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal Batal
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [batalReason, setBatalReason] = useState<string>('');
  const [batalError, setBatalError] = useState<string | null>(null);

  // Surat Jalan Cetak View
  const [printMode, setPrintMode] = useState<boolean>(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const supabase = createClient();

      // 1. Fetch Header
      const { data: pj, error: pjErr } = await supabase
        .from('pesanan_jual')
        .select(`
          id,
          nomor,
          pelanggan_id,
          status,
          total,
          dibuat_oleh,
          dibuat_pada,
          dikonfirmasi_pada,
          dikirim_pada,
          jatuh_tempo,
          dilunasi_pada,
          dibatalkan_pada,
          alasan_batal,
          pelanggan:pelanggan_id ( id, kode, nama_toko, telepon, alamat, termin_hari, batas_kredit ),
          pembuat:dibuat_oleh ( nama_lengkap )
        `)
        .eq('id', resolvedParams.id)
        .single();

      if (pjErr) throw pjErr;
      const orderData = pj as unknown as PesananDetail;
      setPesanan(orderData);

      // Hitung piutang berjalan untuk kartu Pelanggan sesuai wireframe
      if (orderData.pelanggan_id) {
        try {
          const { data: pOrders } = await supabase
            .from('pesanan_jual')
            .select('total')
            .eq('pelanggan_id', orderData.pelanggan_id)
            .in('status', ['dikonfirmasi', 'dikirim']);

          let sumPiutang = 0;
          pOrders?.forEach((o) => {
            sumPiutang += Number(o.total || 0);
          });
          setPiutangBerjalan(sumPiutang);
        } catch (e) {
          console.warn('Gagal menghitung piutang berjalan:', e);
        }
      }

      // 2. Fetch Items melalui secure view v_item_pesanan_jual
      const { data: itData, error: itErr } = await supabase
        .from('v_item_pesanan_jual')
        .select(`
          id,
          barang_id,
          jumlah,
          harga_satuan,
          diskon_persen,
          subtotal,
          hpp_satuan,
          barang:barang_id ( kode, nama, satuan )
        `)
        .eq('pesanan_jual_id', resolvedParams.id);

      if (itErr) throw itErr;
      setItems((itData as unknown as ItemRow[]) || []);
    } catch (err: unknown) {
      console.error('Gagal mengambil rincian pesanan:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Pesanan tidak ditemukan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile) {
      fetchDetail();
    }
  }, [authLoading, profile, resolvedParams.id]);

  useEffect(() => {
    if (statusAction === 'draf') {
      setSuccessMsg('Draf pesanan jual baru berhasil dibuat dan tersimpan di sistem.');
    } else if (statusAction === 'dikonfirmasi') {
      setSuccessMsg('Pesanan jual baru berhasil dibuat dan langsung dikonfirmasi. Stok telah dikurangi.');
    }
  }, [statusAction]);

  // Aksi 1: Konfirmasi Pesanan (Draf -> Dikonfirmasi)
  const handleKonfirmasi = async () => {
    if (!pesanan) return;
    if (!confirm(`Konfirmasi pesanan ${pesanan.nomor}? Stok barang akan dikurangi secara otomatis.`)) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      const supabase = createClient();

      const { data, error } = await supabase.rpc('konfirmasi_pesanan_jual', {
        p_pesanan_id: pesanan.id,
      });

      if (error) throw error;

      setSuccessMsg('Pesanan berhasil dikonfirmasi dan stok telah dikurangi.');
      await fetchDetail();
    } catch (err: unknown) {
      console.error('Konfirmasi gagal:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengonfirmasi pesanan');
    } finally {
      setActionLoading(false);
    }
  };

  // Aksi 2: Kirim Pesanan (Dikonfirmasi -> Dikirim)
  const handleKirim = async () => {
    if (!pesanan) return;
    if (!confirm(`Tandai pesanan ${pesanan.nomor} sebagai TELAH DIKIRIM ke pelanggan?`)) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      const supabase = createClient();

      const { data, error } = await supabase.rpc('kirim_pesanan_jual', {
        p_pesanan_id: pesanan.id,
      });

      if (error) throw error;

      setSuccessMsg('Pesanan berhasil dikirim dan tanggal jatuh tempo telah diisi.');
      await fetchDetail();
    } catch (err: unknown) {
      console.error('Pengiriman gagal:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim pesanan');
    } finally {
      setActionLoading(false);
    }
  };

  // Aksi 3: Lunasi Pesanan (Dikirim -> Lunas)
  const handleLunasi = async () => {
    if (!pesanan) return;
    if (!confirm(`Catat pelunasan pembayaran untuk pesanan ${pesanan.nomor}?`)) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      const supabase = createClient();

      const { data, error } = await supabase.rpc('lunasi_pesanan_jual', {
        p_pesanan_id: pesanan.id,
      });

      if (error) throw error;

      setSuccessMsg('Pesanan berhasil dilunasi.');
      await fetchDetail();
    } catch (err: unknown) {
      console.error('Pelunasan gagal:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat pelunasan');
    } finally {
      setActionLoading(false);
    }
  };

  // Aksi 4: Batalkan Pesanan (Draf atau Dikonfirmasi)
  const handleBatalkan = async () => {
    if (!pesanan) return;
    setBatalError(null);

    if (pesanan.status === 'dikonfirmasi') {
      if (!batalReason || batalReason.trim().length < 10) {
        setBatalError('Alasan pembatalan minimal 10 karakter (BR-08).');
        return;
      }
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      const supabase = createClient();

      const { data, error } = await supabase.rpc('batalkan_pesanan_jual', {
        p_pesanan_id: pesanan.id,
        p_alasan: batalReason || 'Dibatalkan oleh pengguna',
      });

      if (error) throw error;

      setShowCancelModal(false);
      setSuccessMsg('Pesanan berhasil dibatalkan.');
      await fetchDetail();
    } catch (err: unknown) {
      console.error('Pembatalan gagal:', err);
      setBatalError(err instanceof Error ? err.message : 'Gagal membatalkan pesanan');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-zinc-500 text-sm">
        <ShoppingCart className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
        Memuat detail pesanan jual...
      </div>
    );
  }

  if (!pesanan) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertCircle className="w-12 h-12 mx-auto text-rose-500" />
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Pesanan Tidak Ditemukan</h2>
        <Link
          href="/pesanan-jual"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Pesanan
        </Link>
      </div>
    );
  }

  const badge = getStatusPesananBadge(pesanan.status);
  const isManager = profile?.peran === 'manajer';
  const isSalesCreator = profile?.peran === 'penjualan' && pesanan.dibuat_oleh === profile.id;
  const isGudangOrManager = profile?.peran === 'gudang' || isManager;
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = pesanan.status === 'dikirim' && pesanan.jatuh_tempo && pesanan.jatuh_tempo < today;

  // Perhitungan total margin untuk Manajer
  const totalHPP = items.reduce((acc, it) => acc + (it.hpp_satuan ? it.hpp_satuan * it.jumlah : 0), 0);
  const totalMarginRp = isManager && totalHPP > 0 ? pesanan.total - totalHPP : null;
  const marginPersen = totalMarginRp !== null && pesanan.total > 0 ? (totalMarginRp / pesanan.total) * 100 : null;

  // Mode Cetak Surat Jalan (BR Nilai Tambah 11.2)
  if (printMode) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col items-center print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:block">
        {/* Bar Aksi Pratinjau (Hanya tampil di layar, tersembunyi saat cetak/PDF) */}
        <div className="w-full max-w-3xl flex items-center justify-between bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-6 py-3.5 rounded-t-xl border border-b-0 border-zinc-200 dark:border-zinc-800 shadow-sm print:hidden">
          <button
            type="button"
            onClick={() => setPrintMode(false)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali ke Detail
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 hidden sm:inline">Pratinjau Surat Jalan Pengiriman</span>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-500 shadow transition active:scale-95"
            >
              <Printer className="w-4 h-4" /> Cetak Sekarang
            </button>
          </div>
        </div>

        {/* Lembar Dokumen Surat Jalan (Kertas Putih Bersih) */}
        <div className="w-full max-w-3xl bg-white text-zinc-900 p-8 sm:p-10 space-y-6 font-sans shadow-2xl rounded-b-xl border border-zinc-200 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:max-w-none print:w-full">
          {/* Header Surat Jalan */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold tracking-wide uppercase text-zinc-900">CV SINAR ABADI NIAGA</h2>
            <p className="text-xs text-zinc-600">Distributor Kebutuhan Toko Kelontong & Sembako - Bekasi</p>
            <div className="inline-block border-y-2 border-zinc-900 py-1 px-8 my-2 font-black text-sm tracking-widest text-zinc-900">
              SURAT JALAN PENGIRIMAN BARANG
            </div>
          </div>

          {/* Informasi Pengiriman */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-semibold text-zinc-600">TUJUAN PENGIRIMAN:</p>
              <p className="font-bold text-sm text-zinc-900">{pesanan.pelanggan?.nama_toko}</p>
              <p className="text-zinc-700">{pesanan.pelanggan?.alamat || '-'}</p>
              <p className="text-zinc-700">Telp: {pesanan.pelanggan?.telepon || '-'}</p>
            </div>
            <div className="text-right space-y-1">
              <p><strong>No. Dokumen:</strong> {pesanan.nomor}</p>
              <p><strong>Tanggal Kirim:</strong> {formatTanggal(pesanan.dikirim_pada || new Date())}</p>
              <p><strong>Status:</strong> Barang Resmi Diberangkatkan</p>
            </div>
          </div>

          {/* Daftar Barang (TANPA HARGA untuk Pengemudi - PRD 11.2) */}
          <table className="w-full text-xs border border-zinc-300">
            <thead className="bg-zinc-100 font-bold border-b border-zinc-300">
              <tr>
                <th className="p-2 border-r border-zinc-300 text-center w-10">No</th>
                <th className="p-2 border-r border-zinc-300 text-left">Kode Barang</th>
                <th className="p-2 border-r border-zinc-300 text-left">Nama Barang</th>
                <th className="p-2 border-r border-zinc-300 text-center w-24">Jumlah</th>
                <th className="p-2 text-center w-20">Satuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td className="p-2 border-r border-zinc-200 text-center">{i + 1}</td>
                  <td className="p-2 border-r border-zinc-200 font-mono">{it.barang?.kode}</td>
                  <td className="p-2 border-r border-zinc-200 font-medium">{it.barang?.nama}</td>
                  <td className="p-2 border-r border-zinc-200 text-center font-bold text-sm">{it.jumlah}</td>
                  <td className="p-2 text-center uppercase">{it.barang?.satuan}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Kolom Tanda Tangan */}
          <div className="grid grid-cols-3 gap-6 text-center text-xs pt-8 print:break-inside-avoid">
            <div>
              <p className="font-medium text-zinc-600">Diserahkan Oleh (Gudang),</p>
              <div className="h-20" />
              <p className="border-t border-zinc-400 pt-1 font-semibold">( ............................ )</p>
            </div>
            <div>
              <p className="font-medium text-zinc-600">Pengemudi / Kurir,</p>
              <div className="h-20" />
              <p className="border-t border-zinc-400 pt-1 font-semibold">( ............................ )</p>
            </div>
            <div>
              <p className="font-medium text-zinc-600">Diterima Oleh (Toko),</p>
              <div className="h-20" />
              <p className="border-t border-zinc-400 pt-1 font-semibold">( ............................ )</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const batasKredit = pesanan.pelanggan?.batas_kredit ?? 0;
  const sisaBatas = Math.max(0, batasKredit - piutangBerjalan);

  return (
    <div className="space-y-6 pb-16">
      {/* Breadcrumb & Header Sesuai Wireframe Page 3 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/pesanan-jual"
            className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition"
            title="Kembali ke Pesanan Jual"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">
              <Link href="/pesanan-jual" className="hover:text-blue-600 transition">
                Pesanan Jual
              </Link>{' '}
              / <span className="font-mono text-zinc-700 dark:text-zinc-300">{pesanan.nomor}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 font-mono">
                {pesanan.nomor}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
              >
                {badge.label}
              </span>
            </div>
          </div>
        </div>

        {/* Tombol Aksi di Header Sesuai Wireframe Page 3 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status DIKONFIRMASI Sesuai Wireframe: Batalkan (Manajer) & Tandai dikirim */}
          {pesanan.status === 'dikonfirmasi' && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!isManager) {
                    alert('Hanya Manajer yang berhak membatalkan pesanan yang sudah dikonfirmasi (BR-08).');
                    return;
                  }
                  setBatalReason('');
                  setBatalError(null);
                  setShowCancelModal(true);
                }}
                disabled={actionLoading}
                className={`px-4 py-2 text-xs font-medium rounded-lg border transition shadow-sm ${
                  isManager
                    ? 'text-rose-700 dark:text-rose-300 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer'
                    : 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 cursor-not-allowed opacity-70'
                }`}
                title={isManager ? 'Batalkan pesanan dan kembalikan stok ke gudang' : 'Hanya Manajer yang berhak membatalkan pesanan dikonfirmasi (BR-08)'}
              >
                Batalkan (Manajer)
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isGudangOrManager) {
                    alert('Hanya Staf Gudang atau Manajer yang berhak menandai pesanan telah dikirim (BR-07).');
                    return;
                  }
                  handleKirim();
                }}
                disabled={actionLoading}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition shadow-sm ${
                  isGudangOrManager
                    ? 'text-white bg-blue-600 hover:bg-blue-500 cursor-pointer'
                    : 'text-white/80 bg-blue-400 cursor-not-allowed opacity-70'
                }`}
                title={isGudangOrManager ? 'Tandai pesanan telah dikirim ke pelanggan' : 'Hanya Staf Gudang atau Manajer yang berhak mengirim (BR-07)'}
              >
                {actionLoading ? 'Memproses...' : 'Tandai dikirim'}
              </button>
            </>
          )}

          {/* Status DRAF: Batalkan & Konfirmasi */}
          {pesanan.status === 'draf' && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!isSalesCreator && !isManager) {
                    alert('Hanya pembuat pesanan atau Manajer yang berhak membatalkan draf ini.');
                    return;
                  }
                  setBatalReason('Draf dibatalkan oleh pembuat');
                  handleBatalkan();
                }}
                disabled={actionLoading}
                className="px-3.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-white dark:bg-zinc-800 border border-rose-300 dark:border-rose-800 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition disabled:opacity-50"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isSalesCreator && !isManager) {
                    alert('Hanya pembuat pesanan atau Manajer yang berhak mengonfirmasi draf ini.');
                    return;
                  }
                  handleKonfirmasi();
                }}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {actionLoading ? 'Memproses...' : 'Konfirmasi'}
              </button>
            </>
          )}

          {/* Status DIKIRIM: Catat pelunasan (Manajer) & Surat Jalan */}
          {pesanan.status === 'dikirim' && (
            <>
              <button
                type="button"
                onClick={() => setPrintMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-750 transition shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-500" />
                Surat Jalan
              </button>
              {isManager && (
                <button
                  type="button"
                  onClick={handleLunasi}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {actionLoading ? 'Memproses...' : 'Catat pelunasan (Manajer)'}
                </button>
              )}
            </>
          )}

          {/* Status LUNAS: Surat Jalan */}
          {pesanan.status === 'lunas' && (
            <button
              type="button"
              onClick={() => setPrintMode(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-750 transition shadow-sm"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-500" />
              Surat Jalan
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Grid 2 Kolom Sesuai Wireframe Page 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* KOLOM KIRI (8 dari 12): Baris barang & Riwayat status */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. Tabel Baris barang */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden text-xs">
            <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                Baris barang
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3">Kode</th>
                    <th className="py-2.5 px-3">Barang</th>
                    <th className="py-2.5 px-3">Jumlah</th>
                    <th className="py-2.5 px-3 text-right">Harga satuan</th>
                    <th className="py-2.5 px-3 text-center">Diskon</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    {/* Kolom biru (harga pokok, margin) khusus Manajer */}
                    {isManager && (
                      <>
                        <th className="py-2.5 px-3 text-right bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 font-semibold border-l border-blue-100 dark:border-blue-900">
                          Harga pokok
                        </th>
                        <th className="py-2.5 px-3 text-right bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 font-semibold border-l border-blue-100 dark:border-blue-900">
                          Margin
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {items.map((it) => {
                    const hppTotal = it.hpp_satuan ? it.hpp_satuan * it.jumlah : null;
                    const marginBaris = hppTotal !== null ? it.subtotal - hppTotal : null;

                    return (
                      <tr key={it.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="py-2.5 px-3 font-mono font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                          {it.barang?.kode}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100">
                          {it.barang?.nama}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                          {it.jumlah} <span className="text-zinc-500 lowercase">{it.barang?.satuan || 'dus'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                          {formatRupiah(it.harga_satuan)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {it.diskon_persen}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {formatRupiah(it.subtotal)}
                        </td>

                        {/* Kolom biru HPP & Margin khusus Manajer */}
                        {isManager && (
                          <>
                            <td className="py-2.5 px-3 text-right font-mono bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300 border-l border-blue-100/60 dark:border-blue-900/40 whitespace-nowrap">
                              {it.hpp_satuan ? formatRupiah(it.hpp_satuan) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-medium bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300 border-l border-blue-100/60 dark:border-blue-900/40 whitespace-nowrap">
                              {marginBaris !== null ? formatRupiah(marginBaris) : '-'}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Baris Total Sesuai Wireframe Page 3 */}
                <tfoot className="border-t border-zinc-200 dark:border-zinc-700 font-bold bg-zinc-50/60 dark:bg-zinc-800/40">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3 text-right text-zinc-900 dark:text-zinc-100">
                      Total
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-900 dark:text-zinc-100 whitespace-nowrap font-bold">
                      {formatRupiah(pesanan.total)}
                    </td>
                    {isManager && (
                      <>
                        <td className="py-2.5 px-3 bg-blue-50/50 dark:bg-blue-950/30 border-l border-blue-100 dark:border-blue-900" />
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900 dark:text-blue-200 bg-blue-50/50 dark:bg-blue-950/30 border-l border-blue-100 dark:border-blue-900 whitespace-nowrap">
                          {totalMarginRp !== null ? formatRupiah(totalMarginRp) : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Catatan Keterangan Wireframe Page 3 */}
            <div className="p-3 bg-zinc-50/60 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800/60 text-[11px] text-zinc-500 dark:text-zinc-400">
              Kolom biru (harga pokok, margin) hanya tampil untuk Manajer dan diambil lewat fungsi khusus Manajer.{pesanan.status !== 'draf' ? ' Isi baris terkunci karena status bukan draf.' : ''}
            </div>
          </div>

          {/* 2. Tabel Riwayat status Sesuai Wireframe Page 3 */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden text-xs">
            <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                Riwayat status
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3 w-40">Waktu</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Oleh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {/* Baris Draf */}
                  <tr>
                    <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {formatTanggalWaktu(pesanan.dibuat_pada)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                      draf dibuat
                    </td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                      {pesanan.pembuat?.nama_lengkap || 'Staf Penjualan'}
                    </td>
                  </tr>

                  {/* Baris Dikonfirmasi */}
                  {pesanan.dikonfirmasi_pada && (
                    <tr>
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {formatTanggalWaktu(pesanan.dikonfirmasi_pada)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                        dikonfirmasi, stok dikurangi
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                        {pesanan.pembuat?.nama_lengkap || 'Staf Penjualan'}
                      </td>
                    </tr>
                  )}

                  {/* Baris Dikirim */}
                  {pesanan.dikirim_pada && (
                    <tr>
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {formatTanggalWaktu(pesanan.dikirim_pada)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                        dikirim {pesanan.jatuh_tempo ? `(jatuh tempo ${formatTanggal(pesanan.jatuh_tempo)})` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                        Staf Gudang
                      </td>
                    </tr>
                  )}

                  {/* Baris Lunas */}
                  {pesanan.dilunasi_pada && (
                    <tr>
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {formatTanggalWaktu(pesanan.dilunasi_pada)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-emerald-700 dark:text-emerald-400">
                        lunas (pembayaran diterima)
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                        Manajer
                      </td>
                    </tr>
                  )}

                  {/* Baris Batal */}
                  {pesanan.status === 'dibatalkan' && (
                    <tr className="bg-rose-50/40 dark:bg-rose-950/20">
                      <td className="py-2.5 px-3 whitespace-nowrap text-rose-700 dark:text-rose-400">
                        {formatTanggalWaktu(pesanan.dibatalkan_pada || pesanan.dibuat_pada)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-rose-700 dark:text-rose-400">
                        dibatalkan {pesanan.alasan_batal ? `(alasan: ${pesanan.alasan_batal})` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-rose-700 dark:text-rose-400">
                        {isManager ? 'Manajer' : (pesanan.pembuat?.nama_lengkap || 'Pengguna')}
                      </td>
                    </tr>
                  )}

                  {/* Baris "berikutnya" sesuai Wireframe Page 3 */}
                  {pesanan.status !== 'lunas' && pesanan.status !== 'dibatalkan' && (
                    <tr className="text-zinc-400 dark:text-zinc-500 italic bg-zinc-50/40 dark:bg-zinc-850/30">
                      <td className="py-2.5 px-3 font-normal">berikutnya</td>
                      <td className="py-2.5 px-3 font-normal" colSpan={2}>
                        {pesanan.status === 'draf' && 'dikonfirmasi (Staf Penjualan atau Manajer)'}
                        {pesanan.status === 'dikonfirmasi' && 'dikirim (Staf Gudang atau Manajer)'}
                        {pesanan.status === 'dikirim' && 'catat pelunasan (Manajer)'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN (4 dari 12): Kartu Pelanggan & Tabel Tombol per peran */}
        <div className="lg:col-span-4 space-y-6">
          {/* 1. Kartu Pelanggan Sesuai Wireframe Page 3 */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm space-y-3 text-xs">
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Pelanggan
              </h3>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                {pesanan.pelanggan?.nama_toko || '-'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                {pesanan.pelanggan?.kode} · {pesanan.pelanggan?.alamat || 'Alamat tidak tersedia'}
              </p>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500 dark:text-zinc-400">Termin bayar</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {pesanan.pelanggan?.termin_hari ?? 0} hari
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500 dark:text-zinc-400">Batas kredit</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {formatRupiah(batasKredit)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500 dark:text-zinc-400">Piutang berjalan</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatRupiah(piutangBerjalan)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500 dark:text-zinc-400">Sisa batas</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatRupiah(sisaBatas)}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Tabel Tombol per peran Sesuai Wireframe Page 3 */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden text-xs">
            <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                Tombol per peran
              </h3>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2 px-3 w-28">Status</th>
                  <th className="py-2 px-3">Tombol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr className={pesanan.status === 'draf' ? 'bg-blue-50/40 dark:bg-blue-950/20 font-medium' : ''}>
                  <td className="py-2 px-3 font-mono text-zinc-700 dark:text-zinc-300">draf</td>
                  <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">
                    Konfirmasi, Batalkan (pembuat atau Manajer)
                  </td>
                </tr>
                <tr className={pesanan.status === 'dikonfirmasi' ? 'bg-blue-50/40 dark:bg-blue-950/20 font-medium' : ''}>
                  <td className="py-2 px-3 font-mono text-zinc-700 dark:text-zinc-300">dikonfirmasi</td>
                  <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">
                    Tandai dikirim (Gudang, Manajer); Batalkan (Manajer)
                  </td>
                </tr>
                <tr className={pesanan.status === 'dikirim' ? 'bg-blue-50/40 dark:bg-blue-950/20 font-medium' : ''}>
                  <td className="py-2 px-3 font-mono text-zinc-700 dark:text-zinc-300">dikirim</td>
                  <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">
                    Catat pelunasan (Manajer)
                  </td>
                </tr>
                <tr className={['lunas', 'dibatalkan'].includes(pesanan.status) ? 'bg-blue-50/40 dark:bg-blue-950/20 font-medium' : ''}>
                  <td className="py-2 px-3 font-mono text-zinc-700 dark:text-zinc-300">lunas, dibatalkan</td>
                  <td className="py-2 px-3 text-zinc-500 italic">Tidak ada</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Input Alasan Pembatalan Pesanan Dikonfirmasi (BR-08: Wajib Minimal 10 Karakter) */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Konfirmasi Pembatalan Pesanan
              </h3>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Membatalkan pesanan yang sudah dikonfirmasi akan mengembalikan seluruh stok barang ke gudang dan tercatat di audit log.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Alasan Pembatalan (Minimal 10 karakter - BR-08) <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={batalReason}
                onChange={(e) => setBatalReason(e.target.value)}
                placeholder="Contoh: Toko membatalkan pesanan karena kendala operasional cabang"
                className="w-full p-2.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <p className="text-[11px] text-zinc-400 mt-1 text-right">
                {batalReason.trim().length}/10 karakter
              </p>
            </div>

            {batalError && (
              <p className="text-xs text-rose-600 font-medium">{batalError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleBatalkan}
                disabled={actionLoading || batalReason.trim().length < 10}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition disabled:opacity-50"
              >
                {actionLoading ? 'Membatalkan...' : 'Ya, Batalkan & Kembalikan Stok'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
