'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah } from '@/lib/format';
import { 
  ArrowLeft, 
  ShoppingCart, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Building2,
  Package,
  Calendar,
  CreditCard,
  ShieldAlert
} from 'lucide-react';

interface PelangganOption {
  id: string;
  kode: string;
  nama_toko: string;
  batas_kredit: number;
  termin_hari: number;
  aktif: boolean;
}

interface BarangOption {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  harga_jual: number;
  harga_pokok?: number | null; // Hanya jika peran = manajer
  stok: number;
  stok_minimum: number;
  aktif: boolean;
}

interface ItemFormRow {
  barang_id: string;
  jumlah: number;
  harga_satuan: number;
  diskon_persen: number;
  subtotal: number;
  stok_tersedia: number;
  nama_barang: string;
  satuan: string;
  harga_pokok?: number | null;
}

export default function BuatPesananJualBaruPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [pelangganList, setPelangganList] = useState<PelangganOption[]>([]);
  const [barangList, setBarangList] = useState<BarangOption[]>([]);
  const [selectedPelangganId, setSelectedPelangganId] = useState<string>('');
  const [piutangBerjalan, setPiutangBerjalan] = useState<number>(0);
  const [hasOverdue, setHasOverdue] = useState<boolean>(false);
  const [items, setItems] = useState<ItemFormRow[]>([
    {
      barang_id: '',
      jumlah: 1,
      harga_satuan: 0,
      diskon_persen: 0,
      subtotal: 0,
      stok_tersedia: 0,
      nama_barang: '',
      satuan: '',
      harga_pokok: null,
    },
  ]);

  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Akses hanya untuk staf penjualan dan manajer
  useEffect(() => {
    if (!authLoading && profile?.peran === 'gudang') {
      router.replace('/pesanan-jual');
    }
  }, [authLoading, profile, router]);

  // Load pelanggan & barang
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        const supabase = createClient();

        // 1. Pelanggan aktif
        const { data: pData, error: pErr } = await supabase
          .from('pelanggan')
          .select('id, kode, nama_toko, batas_kredit, termin_hari, aktif')
          .eq('aktif', true)
          .order('nama_toko');

        if (pErr) throw pErr;
        setPelangganList(pData || []);

        // 2. Barang aktif melalui secure view v_barang
        const { data: bData, error: bErr } = await supabase
          .from('v_barang')
          .select('*')
          .eq('aktif', true)
          .order('nama');

        if (bErr) throw bErr;
        setBarangList(bData || []);
      } catch (err: unknown) {
        console.error('Gagal mengambil data master:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat data master');
      } finally {
        setLoadingData(false);
      }
    };

    if (!authLoading && profile) {
      fetchData();
    }
  }, [authLoading, profile]);

  // Saat pelanggan dipilih, hitung piutang berjalan & cek tagihan lewat jatuh tempo
  useEffect(() => {
    const checkCustomerStatus = async () => {
      if (!selectedPelangganId) {
        setPiutangBerjalan(0);
        setHasOverdue(false);
        return;
      }

      try {
        const supabase = createClient();

        // Piutang berjalan (status dikonfirmasi atau dikirim)
        const { data: orders, error: oErr } = await supabase
          .from('pesanan_jual')
          .select('total, status, jatuh_tempo')
          .eq('pelanggan_id', selectedPelangganId)
          .in('status', ['dikonfirmasi', 'dikirim']);

        if (oErr) throw oErr;

        let totalPiutang = 0;
        let overdueFound = false;
        const today = new Date().toISOString().split('T')[0];

        orders?.forEach((o) => {
          totalPiutang += Number(o.total || 0);
          if (o.status === 'dikirim' && o.jatuh_tempo && o.jatuh_tempo < today) {
            overdueFound = true;
          }
        });

        setPiutangBerjalan(totalPiutang);
        setHasOverdue(overdueFound);
      } catch (err) {
        console.error('Gagal menghitung piutang pelanggan:', err);
      }
    };

    checkCustomerStatus();
  }, [selectedPelangganId]);

  const selectedPelanggan = useMemo(() => {
    return pelangganList.find((p) => p.id === selectedPelangganId);
  }, [pelangganList, selectedPelangganId]);

  // Hitung total nilai pesanan
  const totalPesanan = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  }, [items]);

  const sisaBatasKredit = useMemo(() => {
    if (!selectedPelanggan) return 0;
    return selectedPelanggan.batas_kredit - piutangBerjalan;
  }, [selectedPelanggan, piutangBerjalan]);

  const isExceedingCredit = useMemo(() => {
    if (!selectedPelanggan) return false;
    return (piutangBerjalan + totalPesanan) > selectedPelanggan.batas_kredit;
  }, [selectedPelanggan, piutangBerjalan, totalPesanan]);

  // Tambah baris barang baru
  const handleAddItemRow = () => {
    if (items.length >= 20) {
      alert('Maksimal 20 baris barang per pesanan (BR-02).');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        barang_id: '',
        jumlah: 1,
        harga_satuan: 0,
        diskon_persen: 0,
        subtotal: 0,
        stok_tersedia: 0,
        nama_barang: '',
        satuan: '',
        harga_pokok: null,
      },
    ]);
  };

  // Hapus baris barang
  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      alert('Pesanan harus memiliki minimal 1 baris barang (BR-02).');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Perubahan pilihan barang pada baris
  const handleBarangChange = (index: number, barangId: string) => {
    // Cek apakah barang sudah dipilih di baris lain (BR-02)
    const alreadySelected = items.some((it, i) => i !== index && it.barang_id === barangId);
    if (alreadySelected && barangId !== '') {
      alert('Barang ini sudah ada dalam daftar pesanan. Satu barang hanya boleh muncul 1 kali (BR-02).');
      return;
    }

    const brg = barangList.find((b) => b.id === barangId);
    setItems((prev) => {
      const next = [...prev];
      if (!brg) {
        next[index] = {
          barang_id: '',
          jumlah: 1,
          harga_satuan: 0,
          diskon_persen: 0,
          subtotal: 0,
          stok_tersedia: 0,
          nama_barang: '',
          satuan: '',
          harga_pokok: null,
        };
      } else {
        const qty = next[index].jumlah || 1;
        const disc = next[index].diskon_persen || 0;
        const sub = Math.round(qty * brg.harga_jual * (1 - disc / 100));
        next[index] = {
          barang_id: brg.id,
          jumlah: qty,
          harga_satuan: brg.harga_jual,
          diskon_persen: disc,
          subtotal: sub,
          stok_tersedia: brg.stok,
          nama_barang: brg.nama,
          satuan: brg.satuan,
          harga_pokok: brg.harga_pokok ?? null,
        };
      }
      return next;
    });
  };

  // Perubahan kuantitas atau diskon pada baris
  const handleRowValueChange = (
    index: number,
    field: 'jumlah' | 'diskon_persen',
    value: number
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[index] };

      if (field === 'jumlah') {
        row.jumlah = Math.max(1, Math.floor(value));
      } else if (field === 'diskon_persen') {
        const maxAllowed = profile?.peran === 'manajer' ? 25 : 10;
        let disc = Math.max(0, value);
        if (disc > maxAllowed) {
          disc = maxAllowed;
          alert(
            profile?.peran === 'manajer'
              ? 'Maksimal diskon Manajer adalah 25% (BR-03).'
              : 'Maksimal diskon Staf Penjualan adalah 10% (BR-03).'
          );
        }
        row.diskon_persen = disc;
      }

      // Hitung subtotal bulat rupiah terdekat (BR-03)
      row.subtotal = Math.round(row.jumlah * row.harga_satuan * (1 - row.diskon_persen / 100));
      next[index] = row;
      return next;
    });
  };

  // Submit pesanan (simpan sebagai draf atau langsung konfirmasi)
  const handleSubmit = async (langsungKonfirmasi: boolean) => {
    setErrorMessage(null);

    if (!selectedPelangganId) {
      setErrorMessage('Pilih pelanggan terlebih dahulu.');
      return;
    }

    // Validasi baris barang
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.barang_id) {
        setErrorMessage(`Baris ke-${i + 1} belum memilih barang.`);
        return;
      }
      if (it.jumlah < 1) {
        setErrorMessage(`Jumlah barang pada baris ke-${i + 1} minimal 1.`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const supabase = createClient();

      // 1. Buat nomor pesanan otomatis (SO-XXXXX)
      let nomorPesanan = '';
      try {
        const { data: noData, error: noErr } = await supabase.rpc('generate_nomor_pesanan_jual');
        if (!noErr && noData) {
          nomorPesanan = noData;
        }
      } catch (err) {
        console.warn('RPC generate_nomor_pesanan_jual tidak tersedia:', err);
      }

      if (!nomorPesanan) {
        // Fallback: hitung dari pesanan terakhir di tabel
        const { data: lastPj } = await supabase
          .from('pesanan_jual')
          .select('nomor')
          .order('dibuat_pada', { ascending: false })
          .limit(1);

        let nextNum = 1;
        if (lastPj && lastPj.length > 0 && lastPj[0].nomor) {
          const match = lastPj[0].nomor.match(/SO-(\d+)/);
          if (match) {
            nextNum = parseInt(match[1], 10) + 1;
          }
        }
        nomorPesanan = `SO-${String(nextNum).padStart(5, '0')}`;
      }

      // 2. Simpan header pesanan_jual
      const { data: pjData, error: pjErr } = await supabase
        .from('pesanan_jual')
        .insert({
          nomor: nomorPesanan,
          pelanggan_id: selectedPelangganId,
          status: 'draf',
          total: totalPesanan,
          dibuat_oleh: profile?.id,
        })
        .select('id, nomor')
        .single();

      if (pjErr) throw pjErr;

      // 3. Simpan baris item_pesanan_jual
      const itemsPayload = items.map((it) => ({
        pesanan_jual_id: pjData.id,
        barang_id: it.barang_id,
        jumlah: it.jumlah,
        harga_satuan: it.harga_satuan,
        diskon_persen: it.diskon_persen,
        subtotal: it.subtotal,
      }));

      const { error: itemsErr } = await supabase
        .from('item_pesanan_jual')
        .insert(itemsPayload);

      if (itemsErr) throw itemsErr;

      // 4. Jika user memilih Langsung Konfirmasi, panggil fungsi RPC
      if (langsungKonfirmasi) {
        const { error: konfirmasiErr } = await supabase.rpc('konfirmasi_pesanan_jual', {
          p_pesanan_id: pjData.id,
        });

        if (konfirmasiErr) {
          // Jika konfirmasi gagal, pesanan tetap tersimpan sebagai draf
          setSuccessMessage(
            `Pesanan ${pjData.nomor} tersimpan sebagai DRAF (namun belum dikonfirmasi: ${konfirmasiErr.message}). Mengalihkan ke halaman detail...`
          );
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          router.refresh();
          router.push(`/pesanan-jual/${pjData.id}?status_action=draf`);
          return;
        }
      }

      setSuccessMessage(
        langsungKonfirmasi
          ? `Pesanan ${pjData.nomor} berhasil dibuat dan langsung dikonfirmasi! Membuka halaman detail pesanan...`
          : `Pesanan ${pjData.nomor} berhasil disimpan sebagai DRAF! Membuka halaman detail pesanan...`
      );
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      router.refresh();
      router.push(`/pesanan-jual/${pjData.id}?status_action=${langsungKonfirmasi ? 'dikonfirmasi' : 'draf'}`);
    } catch (err: unknown) {
      console.error('Gagal membuat pesanan jual:', err);
      const msg =
        (err as { message?: string })?.message ||
        (err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan pesanan');
      setErrorMessage(msg);
      setSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <div className="p-12 text-center text-zinc-500 text-sm">
        <ShoppingCart className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
        Menyiapkan formulir pesanan baru...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Tombol Kembali & Judul */}
      <div className="flex items-center gap-3">
        <Link
          href="/pesanan-jual"
          className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Buat Pesanan Jual Baru (Draf)
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Formulir penyusunan Sales Order dengan validasi batas kredit, termin, dan diskon.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-sm flex items-start gap-2.5 shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">Pesanan Berhasil Disimpan!</p>
            <p className="mt-0.5 text-xs">{successMessage}</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Gagal memproses pesanan</p>
            <p className="mt-0.5 text-xs">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Bagian 1: Pilih Pelanggan & Info Finansial */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-5">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-600" />
          Informasi Pelanggan
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Pilih Toko / Pelanggan <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedPelangganId}
              onChange={(e) => setSelectedPelangganId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Pilih Toko Pelanggan --</option>
              {pelangganList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama_toko} ({p.kode}) - Termin {p.termin_hari} Hari
                </option>
              ))}
            </select>
          </div>

          {selectedPelanggan && (
            <div className="grid grid-cols-3 gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
              <div>
                <span className="text-zinc-500 dark:text-zinc-400 block">Batas Kredit</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                  {formatRupiah(selectedPelanggan.batas_kredit)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 dark:text-zinc-400 block">Piutang Berjalan</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                  {formatRupiah(piutangBerjalan)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 dark:text-zinc-400 block">Sisa Batas Kredit</span>
                <span
                  className={`font-semibold mt-0.5 block ${
                    sisaBatasKredit < 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {formatRupiah(sisaBatasKredit)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Warning Peringatan Overdue atau Limit */}
        {hasOverdue && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3 text-xs text-rose-800 dark:text-rose-300">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-bold">Peringatan Tagihan Lewat Jatuh Tempo (BR-05)</p>
              <p className="mt-0.5">
                Pelanggan ini memiliki tagihan pesanan berstatus dikirim yang sudah melewati tanggal jatuh tempo. Anda masih bisa menyimpan pesanan sebagai Draf, namun konfirmasi pesanan akan ditolak oleh sistem sampai tagihan dilunasi.
              </p>
            </div>
          </div>
        )}

        {isExceedingCredit && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">Total Pesanan Melebihi Batas Kredit (BR-05)</p>
              <p className="mt-0.5">
                Total piutang berjalan ditambah pesanan ini ({formatRupiah(piutangBerjalan + totalPesanan)}) melebihi batas kredit pelanggan ({formatRupiah(selectedPelanggan?.batas_kredit)}). Konfirmasi akan ditolak sistem.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bagian 2: Daftar Item Barang (1-20 Baris) */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            Baris Barang Pesanan ({items.length}/20)
          </h2>

          <button
            type="button"
            onClick={handleAddItemRow}
            disabled={items.length >= 20}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Baris Barang
          </button>
        </div>

        {/* Tabel Input Baris */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 uppercase font-medium border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-2.5 px-3 w-10">No</th>
                <th className="py-2.5 px-3 min-w-[240px]">Barang</th>
                <th className="py-2.5 px-3 w-28 text-center">Stok Gudang</th>
                <th className="py-2.5 px-3 w-24 text-center">Jumlah</th>
                <th className="py-2.5 px-3 w-32 text-right">Harga Satuan</th>
                <th className="py-2.5 px-3 w-28 text-center">
                  Diskon % {profile?.peran === 'manajer' ? '(Maks 25%)' : '(Maks 10%)'}
                </th>
                <th className="py-2.5 px-3 w-36 text-right">Subtotal</th>
                <th className="py-2.5 px-3 w-12 text-center">Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map((row, idx) => {
                const isStockInsufficient = row.barang_id && row.jumlah > row.stok_tersedia;
                const isBelowHPP =
                  row.barang_id &&
                  row.harga_pokok !== null &&
                  row.harga_pokok !== undefined &&
                  row.subtotal < (row.harga_pokok * row.jumlah);

                return (
                  <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-3 text-center text-zinc-400 font-medium">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <select
                        value={row.barang_id}
                        onChange={(e) => handleBarangChange(idx, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">-- Pilih Barang --</option>
                        {barangList.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nama} (Stok: {b.stok} {b.satuan}) - {formatRupiah(b.harga_jual)}
                          </option>
                        ))}
                      </select>

                      {isBelowHPP && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          ⚠ Subtotal di bawah HPP (membutuhkan persetujuan Manajer).
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {row.barang_id ? (
                        <span
                          className={`font-semibold ${
                            row.stok_tersedia <= 0
                              ? 'text-rose-600'
                              : row.stok_tersedia <= 5
                              ? 'text-amber-600'
                              : 'text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {row.stok_tersedia} {row.satuan}
                        </span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="number"
                        min="1"
                        value={row.jumlah}
                        onChange={(e) =>
                          handleRowValueChange(idx, 'jumlah', parseInt(e.target.value) || 1)
                        }
                        className={`w-full text-center px-2 py-1.5 rounded-lg border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isStockInsufficient
                            ? 'border-rose-400 text-rose-600 font-bold'
                            : 'border-zinc-300 dark:border-zinc-700'
                        }`}
                      />
                      {isStockInsufficient && (
                        <p className="text-[10px] text-rose-500 text-center mt-0.5">Kurang stok</p>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-medium text-zinc-800 dark:text-zinc-200">
                      {formatRupiah(row.harga_satuan)}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={profile?.peran === 'manajer' ? '25' : '10'}
                          value={row.diskon_persen}
                          onChange={(e) =>
                            handleRowValueChange(idx, 'diskon_persen', parseFloat(e.target.value) || 0)
                          }
                          className="w-16 text-center px-1.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="ml-1 text-zinc-500">%</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      {formatRupiah(row.subtotal)}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        disabled={items.length <= 1}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Ringkasan Subtotal dan Total Pesanan */}
        <div className="flex flex-col sm:flex-row items-end justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 gap-4">
          <div className="text-xs text-zinc-500">
            * Subtotal baris = jumlah × harga satuan × (100% - diskon), dibulatkan ke rupiah terdekat (BR-03).
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">Total Nilai Pesanan:</span>
            <span className="text-xl font-bold text-emerald-600">
              {formatRupiah(totalPesanan)}
            </span>
          </div>
        </div>
      </div>

      {/* Tombol Aksi */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        <Link
          href="/pesanan-jual"
          className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-750 transition text-center"
        >
          Batalkan
        </Link>

        <button
          type="button"
          onClick={() => handleSubmit(false)}
          disabled={submitting}
          className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition shadow-sm text-center disabled:opacity-50"
        >
          {submitting ? 'Menyimpan & Mengalihkan...' : 'Simpan sebagai Draf'}
        </button>

        <button
          type="button"
          onClick={() => handleSubmit(true)}
          disabled={submitting || isExceedingCredit || hasOverdue}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-sm disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          {submitting ? 'Memproses & Mengalihkan...' : 'Simpan & Konfirmasi'}
        </button>
      </div>
    </div>
  );
}
