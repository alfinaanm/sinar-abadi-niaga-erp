# ERP Distribusi — CV Sinar Abadi Niaga

> **Bootcamp AI Web Programming · Capstone Project**  
> Sistem ERP internal untuk operasional distribusi sembako: pengadaan dari pemasok, manajemen stok gudang *real-time*, dan penjualan ke toko kelontong dengan sistem tempo.

---

## 📌 Ringkasan Solusi

CV Sinar Abadi Niaga adalah distributor kebutuhan pokok toko kelontong di area Bekasi dan Jakarta Timur. Aplikasi ERP Distribusi ini menggantikan pencatatan nota tulis tangan dan file Excel bergantian, menyelesaikan kendala-kendala utama operasional:
- **Pencegahan Stok Minus & Race Condition**: Menghilangkan insiden janji stok ganda ke dua toko yang berbeda dengan penguncian konkurensi database atomik (*all-or-nothing*).
- **Proteksi Plafon Kredit & Jatuh Tempo**: Mencegah penerbitan pesanan bagi pelanggan yang telah melebihi batas kredit atau memiliki tagihan macet yang lewat tanggal jatuh tempo.
- **Kerahasiaan Harga Pokok & Margin (HPP)**: Membatasi angka harga beli, harga pokok, dan margin keuntungan agar **hanya bisa diakses oleh Manajer**, baik di antarmuka maupun pada layer API database.
- **Pengawasan Alur Status Ketat**: Setiap peran hanya dapat mengeksekusi tahapan miliknya (Sales: draf & konfirmasi; Gudang: pengiriman & stok opname; Manajer: persetujuan PO, pelunasan, pembatalan berstok, dan audit).

---

## 👥 Kredensial 5 Akun Uji Resmi (Sesuai Data Contoh)

Semua akun uji menggunakan kata sandi seragam: `Latihan#2026`

| Peran (*Role*) | Nama Pengguna | Email Login | Status | Kasus Uji & Batas Akses Utama |
| :--- | :--- | :--- | :---: | :--- |
| **Manajer** *(Owner)* | Hendra Wijaya | `hendra@sinarabadi.test` | Aktif | Akses penuh: melihat HPP & margin, grafik laporan keuangan, ekspor CSV, setujui/tolak PO, pelunasan, diskon s/d 25%, kelola akun & jejak audit. |
| **Staf Penjualan** *(Sales 1)* | Rina Kartika | `rina@sinarabadi.test` | Aktif | Buat draf pesanan, diskon maks 10%, konfirmasi draf miliknya, tambah pelanggan (limit Rp0), pantau stok & harga jual. HPP & margin tersembunyi total. |
| **Staf Penjualan** *(Sales 2)* | Dimas Prasetyo | `dimas@sinarabadi.test` | Aktif | Hak akses sama dengan Rina; dipakai untuk simulasi pengujian konkurensi (TC-08) saat dua sales mengonfirmasi pesanan serentak. |
| **Staf Gudang** *(Warehouse)* | Joko Susanto | `joko@sinarabadi.test` | Aktif | Mengirim pesanan (hitung jatuh tempo otomatis), ajukan PO, terima barang datang, penyesuaian stok opname fisik ($\ge 10$ karakter). Harga beli & HPP tersembunyi total. |
| **Staf Penjualan** *(Nonaktif)* | Agus Salim | `agus@sinarabadi.test` | **Nonaktif** | Dikhususkan untuk validasi **TC-02** (memastikan pengguna nonaktif ditolak masuk dengan pesan *"Akun dinonaktifkan. Hubungi Manajer"*). |

---

## 🏛️ Keputusan Arsitektur & Keamanan (*Architecture Decisions*)

1. **Framework & Tampilan Modern**:
   - Dibangun dengan **Next.js (App Router)** dan **TypeScript** untuk performa tinggi, *type-safety*, dan struktur rute modular.
   - Styling menggunakan **Tailwind CSS** dengan estetika bersih, elegan, dan ramah pengguna sesuai lembar acuan `Wireframe_ERP.pdf`.
   - Menggunakan tag `<meta name="robots" content="noindex, nofollow" />` pada root layout untuk memastikan aplikasi internal tidak terindeks mesin pencari (PRD Bab 10).

2. **Kerahasiaan Dagang & Data Masking (BR-12)**:
   - Nilai sensitif (`harga_pokok` pada barang, `harga_beli_satuan` pada pembelian, dan `hpp_satuan` pada baris pesanan) dilindungi di level database menggunakan *Security Invoker Views* (`v_barang`, `v_pembelian`, `v_item_pesanan_jual`).
   - Query client-side dari Staf Penjualan dan Gudang secara otomatis menghasilkan `NULL` pada kolom-kolom tersebut, mencegah kebocoran data melalui tab DevTools Network / REST API.

3. **Integritas Konkurensi & Atomisitas Stok (BR-06)**:
   - Pemotongan stok pesanan jual dilakukan lewat *Stored Procedure* database PostgreSQL (`konfirmasi_pesanan_jual`).
   - Menerapkan penguncian baris eksplisit (`SELECT ... FOR UPDATE`) pada tabel `barang` dan `pesanan_jual` untuk mencegah *race condition* bila dua pesanan dikonfirmasi pada detik yang sama.
   - Bersifat *All-or-Nothing*: bila 1 barang saja kurang stok, seluruh transaksi dibatalkan (*rollback*) dan tidak ada stok yang berkurang sebagian.

4. **Mesin Alur Status Terisolasi (State Machine Isolation)**:
   - Transisi status divalidasi ketat di RPC database:
     - `draf` ➔ `dikonfirmasi` (Sales pembuat / Manajer)
     - `dikonfirmasi` ➔ `dikirim` (Gudang / Manajer; otomatis isi tanggal kirim & tanggal jatuh tempo)
     - `dikirim` ➔ `lunas` (Khusus Manajer; catat tanggal lunas)
     - `draf` / `dikonfirmasi` ➔ `dibatalkan` (Pembatalan berstatus dikonfirmasi wajib alasan $\ge 10$ karakter dan otomatis mengembalikan stok ke gudang)
   - Transisi liar di luar alur di atas ditolak keras oleh database (BR-07).

5. **Jejak Audit Permanen (*Append-Only Audit Trail*) (BR-12)**:
   - Setiap tindakan sensitif (perubahan harga jual, perubahan batas kredit, perubahan peran/aktivasi user, persetujuan/penolakan PO, pembatalan pesanan dikonfirmasi, penyesuaian stok opname, dan pelunasan) dicatat ke tabel `audit_log` bersama identitas pelaku, waktu WIB, dan nilai sebelum vs sesudah (JSONB).
   - Tabel audit log bersifat *append-only* (tidak dapat diubah atau dihapus oleh pengguna).

---

## 🗺️ Peta Halaman & Navigasi

| Rute URL | Menu | Peran yang Diizinkan | Fungsi Utama |
| :--- | :--- | :--- | :--- |
| `/login` | Masuk | Publik / Belum login | Autentikasi 3 peran dengan kartu kredensial uji cepat. |
| `/dashboard` | Dashboard | Semua Peran | Ringkasan operasional: omzet, piutang, stok menipis, PO antrean, dan grafik mingguan adaptif peran. |
| `/barang` | Barang dan Stok | Semua Peran | Katalog master sembako, label stok menipis, riwayat Kartu Stok, modal penyesuaian stok opname fisik, dan proteksi HPP rahasia. |
| `/pelanggan` | Pelanggan | `penjualan`, `manajer` | Daftar toko pelanggan, pemantauan piutang berjalan & tagihan lewat tempo, modal tambah pelanggan (Sales limit Rp0), dan pengaturan plafon kredit oleh Manajer. |
| `/pesanan-jual` | Pesanan Jual | Semua Peran | Daftar seluruh pesanan jual dengan filter pencarian, status, dan tanggal. Gudang hanya melihat status $\ge$ `dikonfirmasi`. |
| `/pesanan-jual/baru`| Buat Draf | `penjualan`, `manajer` | Formulir input pesanan (1–20 baris barang) dengan pembatasan diskon otomatis sesuai hak peran. |
| `/pesanan-jual/[id]`| Detail Pesanan | Semua Peran | Informasi tagihan pelanggan, alur tombol status kontekstual, cetak surat jalan tanpa harga untuk sopir, dan tabel item ber-HPP khusus Manajer. |
| `/pembelian` | Pembelian | `gudang`, `manajer` | Tab Order Pembelian (PO 1–10.000) dan Tab Data 4 Pemasok. Fitur approval Manajer dan pencatatan fisik barang datang oleh Gudang. |
| `/laporan` | Laporan | `manajer` | Visualisasi grafik omzet dan margin 8 minggu terakhir, analisis umur piutang per pelanggan, margin kontribusi per barang, dan tombol **Ekspor CSV**. |
| `/pengaturan` | Pengaturan | `manajer` | Manajemen akun & peran pengguna, serta tabel riwayat Jejak Audit Log (*audit trail*). |

---

## 🚀 Panduan Menjalankan Secara Lokal (*Local Setup*)

### 1. Prasyarat
- **Node.js** versi 18.18+ atau 20+
- Akun **Supabase** (proyek PostgreSQL aktif)

### 2. Kloning Repository & Instal Dependensi
```bash
git clone https://github.com/alfinaanm/erp-sinar-abadi-niaga.git
cd erp-sinar-abadi-niaga
npm install
```

### 3. Konfigurasi Environment Variables
Salin file `.env.example` menjadi `.env.local`:
```bash
cp .env.example .env.local
```
Buka `.env.local` dan lengkapi kredensial proyek Supabase kamu:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Eksekusi Skrip Database di Supabase SQL Editor
Jalankan file SQL yang tersedia di folder `docs/` secara berurutan pada menu **SQL Editor** Supabase Dashboard:
1. `docs/schema.sql`: Membuat ekstensi, 9 tabel inti, constraint aturan bisnis, view data masking, dan kebijakan Row Level Security (RLS).
2. `docs/functions_pesanan_jual.sql`: Stored procedures untuk alur pesanan jual, atomic stock lock, dan proteksi diskon/HPP.
3. `docs/functions_erp.sql`: Stored procedures untuk alur pembelian ke pemasok, penyesuaian stok opname fisik, update harga/kredit, dan audit logging.
4. `docs/create_users.sql`: Mendaftarkan 5 akun pengguna uji resmi ke auth Supabase dan tabel `profiles`.
5. `docs/seed.sql`: Memuat data awal 16 barang master, 4 pemasok sembako, dan 10 toko pelanggan.

### 5. Jalankan Aplikasi
```bash
npm run dev
```
Buka peramban di **[http://localhost:3000](http://localhost:3000)** dan masuk dengan salah satu akun uji di atas.

---

## 📋 Matriks Kepatuhan Aturan Bisnis (BR-01 s/d BR-12)

- **BR-01**: Kode barang unik, harga jual $> 0$, stok bilangan bulat non-negatif. Label stok menipis otomatis aktif jika $\text{stok} \le \text{stok minimum}$. Hanya Manajer yang dapat menambah barang dan mengubah harga jual.
- **BR-02**: Pesanan jual berisi 1–20 baris barang unik. Pelanggan dan barang harus berstatus aktif.
- **BR-03**: Diskon per baris. Staf Penjualan dibatasi maks 10%, Manajer dibatasi maks 25%. Subtotal dibulatkan ke rupiah terdekat.
- **BR-04**: Jika subtotal baris berada di bawah harga pokok (HPP), konfirmasi untuk Sales ditolak dengan pesan *"Harga di bawah batas, minta persetujuan Manajer"* tanpa membocorkan angka HPP.
- **BR-05**: Pelanggan baru dari Sales mendapat plafon kredit Rp0 sampai diubah Manajer. Konfirmasi ditolak bila piutang berjalan melebihi batas kredit atau pelanggan memiliki tagihan jatuh tempo yang belum lunas.
- **BR-06**: Pengurangan stok atomik *all-or-nothing* dengan penguncian `FOR UPDATE` untuk mencegah stok minus akibat *race condition*.
- **BR-07**: Alur status terisolasi. Jatuh tempo dihitung otomatis saat Staf Gudang menandai dikirim ($\text{tgl kirim} + \text{termin}$).
- **BR-08**: Pesanan dikonfirmasi hanya boleh dibatalkan Manajer dengan alasan $\ge 10$ karakter, dan stok seluruh barang otomatis dikembalikan.
- **BR-09**: Pengajuan pembelian (PO) 1–10.000 unit. Hanya Manajer yang menyetujui (wajib isi harga beli $> 0$) atau menolak (alasan $\ge 10$ karakter).
- **BR-10**: Penerimaan barang hanya untuk PO disetujui dan hanya 1 kali. Stok bertambah dan harga pokok barang otomatis diperbarui.
- **BR-11**: Setiap perubahan tercatat di mutasi kartu stok. Penyesuaian fisik stok opname wajib menyertakan alasan minimal 10 karakter.
- **BR-12**: Harga beli, harga pokok, dan margin keuntungan rahasia khusus Manajer (dilindungi view RLS). Aksi sensitif dicatat ke `audit_log` (*before-after values*).

---

## 📄 Lisensi & Kepemilikan

Proyek ini dikembangkan sebagai karya **Capstone Project Bootcamp AI Web Programming** untuk studi kasus operasional **CV Sinar Abadi Niaga**. Dilindungi untuk penggunaan internal dan keperluan evaluasi akademik.
