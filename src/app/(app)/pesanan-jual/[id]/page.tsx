'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
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
    kode: string;
    nama_toko: string;
    telepon: string | null;
    alamat: string | null;
    termin_hari: number;
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
  const { profile, loading: authLoading } = useAuth();
  const [pesanan, setPesanan] = useState<PesananDetail | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
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
          pelanggan:pelanggan_id ( kode, nama_toko, telepon, alamat, termin_hari ),
          pembuat:dibuat_oleh ( nama_lengkap )
        `)
        .eq('id', resolvedParams.id)
        .single();

      if (pjErr) throw pjErr;
      setPesanan(pj as unknown as PesananDetail);

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
      <div className="bg-white text-zinc-900 p-8 max-w-3xl mx-auto space-y-6 print:p-0 print:m-0 font-sans">
        <div className="flex items-center justify-between border-b pb-4 print:hidden">
          <button
            onClick={() => setPrintMode(false)}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali ke Detail
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500"
          >
            <Printer className="w-4 h-4" /> Cetak Sekarang
          </button>
        </div>

        {/* Header Surat Jalan */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold tracking-wide uppercase">CV SINAR ABADI NIAGA</h2>
          <p className="text-xs text-zinc-600">Distributor Kebutuhan Toko Kelontong & Sembako - Bekasi</p>
          <div className="inline-block border-y-2 border-zinc-900 py-1 px-8 my-2 font-black text-sm tracking-widest">
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
        <div className="grid grid-cols-3 gap-6 text-center text-xs pt-8">
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
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/pesanan-jual"
            className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 font-mono">
                {pesanan.nomor}
              </h1>
              <span
                className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Dibuat oleh <span className="font-medium">{pesanan.pembuat?.nama_lengkap || 'Pengguna'}</span> pada{' '}
              {formatTanggalWaktu(pesanan.dibuat_pada)}
            </p>
          </div>
        </div>

        {/* Tombol Surat Jalan (Khusus status dikirim atau lunas) */}
        {['dikirim', 'lunas'].includes(pesanan.status) && (
          <button
            onClick={() => setPrintMode(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-750 transition"
          >
            <Printer className="w-4 h-4 text-zinc-500" />
            Cetak Surat Jalan
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Status Timeline Stepper */}
      {pesanan.status !== 'dibatalkan' ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
          <div className="grid grid-cols-4 gap-2 text-center text-xs relative">
            {/* Step 1: Draf */}
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold mb-1.5 shadow-sm">
                <Check className="w-4 h-4" />
              </div>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Draf</span>
              <span className="text-[11px] text-zinc-500">{formatTanggal(pesanan.dibuat_pada)}</span>
            </div>

            {/* Step 2: Dikonfirmasi */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1.5 shadow-sm ${
                  ['dikonfirmasi', 'dikirim', 'lunas'].includes(pesanan.status)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'
                }`}
              >
                {['dikonfirmasi', 'dikirim', 'lunas'].includes(pesanan.status) ? (
                  <Check className="w-4 h-4" />
                ) : (
                  '2'
                )}
              </div>
              <span
                className={`font-semibold ${
                  ['dikonfirmasi', 'dikirim', 'lunas'].includes(pesanan.status)
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-400'
                }`}
              >
                Dikonfirmasi
              </span>
              <span className="text-[11px] text-zinc-500">
                {pesanan.dikonfirmasi_pada ? formatTanggal(pesanan.dikonfirmasi_pada) : '-'}
              </span>
            </div>

            {/* Step 3: Dikirim */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1.5 shadow-sm ${
                  ['dikirim', 'lunas'].includes(pesanan.status)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'
                }`}
              >
                {['dikirim', 'lunas'].includes(pesanan.status) ? (
                  <Check className="w-4 h-4" />
                ) : (
                  '3'
                )}
              </div>
              <span
                className={`font-semibold ${
                  ['dikirim', 'lunas'].includes(pesanan.status)
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-400'
                }`}
              >
                Dikirim
              </span>
              <span className="text-[11px] text-zinc-500">
                {pesanan.dikirim_pada ? formatTanggal(pesanan.dikirim_pada) : '-'}
              </span>
            </div>

            {/* Step 4: Lunas */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1.5 shadow-sm ${
                  pesanan.status === 'lunas'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'
                }`}
              >
                {pesanan.status === 'lunas' ? <Check className="w-4 h-4" /> : '4'}
              </div>
              <span
                className={`font-semibold ${
                  pesanan.status === 'lunas' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'
                }`}
              >
                Lunas
              </span>
              <span className="text-[11px] text-zinc-500">
                {pesanan.dilunasi_pada ? formatTanggal(pesanan.dilunasi_pada) : '-'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-start gap-3">
          <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-rose-800 dark:text-rose-200">Pesanan Telah Dibatalkan</p>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
              Dibatalkan pada: <strong>{formatTanggalWaktu(pesanan.dibatalkan_pada)}</strong>
            </p>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
              Alasan: <em>&ldquo;{pesanan.alasan_batal || '-'}&rdquo;</em>
            </p>
          </div>
        </div>
      )}

      {/* Info Pelanggan & Jatuh Tempo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Toko */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <span className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Toko Pelanggan
          </span>
          <p className="font-bold text-base text-zinc-900 dark:text-zinc-100">
            {pesanan.pelanggan?.nama_toko}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {pesanan.pelanggan?.alamat || 'Alamat tidak tersedia'}
          </p>
          <p className="text-xs text-zinc-500">Telp: {pesanan.pelanggan?.telepon || '-'}</p>
        </div>

        {/* Pembayaran & Jatuh Tempo */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <span className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-emerald-600" />
            Termin & Jatuh Tempo
          </span>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Termin: {pesanan.pelanggan?.termin_hari ?? 0} Hari
          </p>
          {pesanan.jatuh_tempo ? (
            <div>
              <p className="text-xs text-zinc-500">Jatuh Tempo:</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {formatTanggal(pesanan.jatuh_tempo)}
                </span>
                {isOverdue && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                    OVERDUE
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 italic">Jatuh tempo terisi otomatis saat pesanan dikirim</p>
          )}
        </div>

        {/* Ringkasan Finansial */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <span className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Total Transaksi
          </span>
          <p className="text-2xl font-black text-emerald-600">
            {formatRupiah(pesanan.total)}
          </p>
          {isManager && totalMarginRp !== null && (
            <div className="text-xs border-t border-zinc-100 dark:border-zinc-800 pt-1.5 text-zinc-500">
              <span>Margin Kotor: </span>
              <strong className="text-emerald-700 dark:text-emerald-400">
                {formatRupiah(totalMarginRp)} ({marginPersen?.toFixed(1)}%)
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Tabel Rincian Item */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-600" />
          Rincian Barang yang Dipesan
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 uppercase font-medium border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">No</th>
                <th className="py-2.5 px-3">Kode</th>
                <th className="py-2.5 px-3">Nama Barang</th>
                <th className="py-2.5 px-3 text-center">Jumlah</th>
                <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                <th className="py-2.5 px-3 text-center">Diskon</th>
                <th className="py-2.5 px-3 text-right">Subtotal</th>
                {/* RAHASIA: Kolom HPP dan Margin HANYA untuk Manajer (BR-12) */}
                {isManager && (
                  <>
                    <th className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400">
                      HPP Satuan
                    </th>
                    <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                      Margin Baris
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map((it, idx) => {
                const hppTotal = it.hpp_satuan ? it.hpp_satuan * it.jumlah : null;
                const marginBaris = hppTotal !== null ? it.subtotal - hppTotal : null;

                return (
                  <tr key={it.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-3 text-center text-zinc-400 font-medium">{idx + 1}</td>
                    <td className="py-3 px-3 font-mono text-zinc-600 dark:text-zinc-400">
                      {it.barang?.kode}
                    </td>
                    <td className="py-3 px-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {it.barang?.nama}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-zinc-900 dark:text-zinc-100">
                      {it.jumlah} <span className="font-normal text-zinc-500 uppercase">{it.barang?.satuan}</span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-zinc-800 dark:text-zinc-200">
                      {formatRupiah(it.harga_satuan)}
                    </td>
                    <td className="py-3 px-3 text-center text-zinc-600 dark:text-zinc-400">
                      {it.diskon_persen > 0 ? `${it.diskon_persen}%` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-zinc-900 dark:text-zinc-100">
                      {formatRupiah(it.subtotal)}
                    </td>

                    {/* HPP & Margin khusus Manajer */}
                    {isManager && (
                      <>
                        <td className="py-3 px-3 text-right text-amber-700 dark:text-amber-400 font-mono">
                          {it.hpp_satuan ? formatRupiah(it.hpp_satuan) : '-'}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400 font-semibold font-mono">
                          {marginBaris !== null ? formatRupiah(marginBaris) : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons Panel Sesuai Hak Akses & Status (BR-07, BR-08) */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-zinc-500">
          Hak aksi status: Draf (Penjualan/Manajer), Kirim (Gudang/Manajer), Pelunasan (Manajer).
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status DRAF: Konfirmasi & Batalkan */}
          {pesanan.status === 'draf' && (isSalesCreator || isManager) && (
            <>
              <button
                type="button"
                onClick={() => {
                  setBatalReason('Draf dibatalkan oleh pembuat');
                  handleBatalkan();
                }}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-100 transition disabled:opacity-50"
              >
                Batalkan Draf
              </button>
              <button
                type="button"
                onClick={handleKonfirmasi}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {actionLoading ? 'Memproses...' : 'Konfirmasi Pesanan (Kurangi Stok)'}
              </button>
            </>
          )}

          {/* Status DIKONFIRMASI: Kirim (Gudang/Manajer) & Batalkan (Manajer Saja) */}
          {pesanan.status === 'dikonfirmasi' && (
            <>
              {isManager && (
                <button
                  type="button"
                  onClick={() => {
                    setBatalReason('');
                    setBatalError(null);
                    setShowCancelModal(true);
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-100 transition disabled:opacity-50"
                >
                  Batalkan Pesanan (Kembalikan Stok)
                </button>
              )}
              {isGudangOrManager && (
                <button
                  type="button"
                  onClick={handleKirim}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  <Truck className="w-4 h-4" />
                  {actionLoading ? 'Memproses...' : 'Kirim Pesanan (Muat Truk)'}
                </button>
              )}
            </>
          )}

          {/* Status DIKIRIM: Catat Pelunasan (Manajer Saja) */}
          {pesanan.status === 'dikirim' && isManager && (
            <button
              type="button"
              onClick={handleLunasi}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {actionLoading ? 'Memproses...' : 'Catat Pelunasan Pembayaran'}
            </button>
          )}

          {/* Status Akhir: Lunas / Dibatalkan */}
          {pesanan.status === 'lunas' && (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-xl">
              <Check className="w-4 h-4" />
              Pesanan Lunas Sepenuhnya
            </span>
          )}

          {pesanan.status === 'dibatalkan' && (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-800 bg-rose-100 rounded-xl">
              <XCircle className="w-4 h-4" />
              Status Akhir: Dibatalkan
            </span>
          )}
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
