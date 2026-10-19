export type PeranUser = 'penjualan' | 'gudang' | 'manajer';

export type StatusPesananJual = 'draf' | 'dikonfirmasi' | 'dikirim' | 'lunas' | 'dibatalkan';

export type StatusPembelian = 'diajukan' | 'disetujui' | 'ditolak' | 'dibatalkan' | 'diterima';

export type JenisMutasiStok = 'masuk' | 'keluar' | 'batal' | 'penyesuaian';

export interface Profile {
  id: string;
  nama_lengkap: string;
  peran: PeranUser;
  aktif: boolean;
  dibuat_pada: string;
}

export interface Pemasok {
  id: string;
  kode: string;
  nama: string;
  telepon: string | null;
  alamat: string | null;
  aktif: boolean;
  dibuat_pada: string;
}

export interface Pelanggan {
  id: string;
  kode: string;
  nama_toko: string;
  telepon: string | null;
  alamat: string | null;
  batas_kredit: number;
  termin_hari: 0 | 7 | 14 | 30;
  aktif: boolean;
  dibuat_oleh: string | null;
  dibuat_pada: string;
}

export interface Barang {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  harga_jual: number;
  harga_pokok?: number | null; // Rahasia hanya Manajer
  stok: number;
  stok_minimum: number;
  aktif: boolean;
  diperbarui_pada: string;
}

export interface Pembelian {
  id: string;
  nomor: string;
  pemasok_id: string;
  barang_id: string;
  jumlah_dipesan: number;
  jumlah_diterima: number | null;
  harga_beli_satuan: number | null; // Rahasia hanya Manajer
  status: StatusPembelian;
  alasan_tolak: string | null;
  diajukan_oleh: string | null;
  diajukan_pada: string;
  diputuskan_oleh: string | null;
  diputuskan_pada: string | null;
  diterima_oleh: string | null;
  diterima_pada: string | null;
  // Relasi join
  pemasok?: Pemasok;
  barang?: Barang;
}

export interface PesananJual {
  id: string;
  nomor: string;
  pelanggan_id: string;
  status: StatusPesananJual;
  total: number;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  dikonfirmasi_pada: string | null;
  dikirim_pada: string | null;
  jatuh_tempo: string | null;
  dilunasi_pada: string | null;
  dibatalkan_pada: string | null;
  alasan_batal: string | null;
  // Relasi join
  pelanggan?: Pelanggan;
  item_pesanan_jual?: ItemPesananJual[];
  pembuat?: Profile;
}

export interface ItemPesananJual {
  id: string;
  pesanan_jual_id: string;
  barang_id: string;
  jumlah: number;
  harga_satuan: number;
  diskon_persen: number;
  subtotal: number;
  hpp_satuan?: number | null; // Rahasia hanya Manajer
  // Relasi join
  barang?: Barang;
}

export interface MutasiStok {
  id: number;
  barang_id: string;
  jenis: JenisMutasiStok;
  jumlah: number;
  stok_sesudah: number;
  nomor_dokumen: string;
  alasan: string | null;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  // Relasi join
  barang?: Barang;
  pelaku?: Profile;
}

export interface AuditLog {
  id: number;
  pelaku_id: string | null;
  aksi: string;
  nama_tabel: string;
  data_id: string;
  nilai_lama: Record<string, unknown> | null;
  nilai_baru: Record<string, unknown>;
  dibuat_pada: string;
  // Relasi join
  pelaku?: Profile;
}
