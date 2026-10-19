# Test Plan & Kesiapan Rilis: ERP Distribusi CV Sinar Abadi Niaga

Dokumen ini memuat matriks hak akses, peta rute halaman, skenario pengujian komprehensif berbasis aturan bisnis (BR) dan user story (US), serta checklist kesiapan rilis untuk Capstone Project AI Web Programming.

---

## 1. Matriks Hak Akses Tiga Peran

| Modul / Aksi | Staf Penjualan (`staf_penjualan`) | Staf Gudang (`staf_gudang`) | Manajer (`manajer`) |
| :--- | :---: | :---: | :---: |
| **Dashboard** | Dashboard Penjualan (tanpa margin) | Dashboard Gudang (tanpa margin) | Dashboard Lengkap (omzet, margin, piutang) |
| **Data Pelanggan** | Baca & Tambah (limit kredit Rp0) | Tidak tampil | Penuh (atur batas kredit & termin) |
| **Data Barang & Stok** | Baca stok & harga jual | Ubah nama, satuan, stok min, sesuaikan stok | Penuh (tambah barang, ubah harga jual, lihat HPP) |
| **Harga Pokok (HPP) & Margin** | **Ditolak / Tersembunyi (RLS)** | **Ditolak / Tersembunyi (RLS)** | Penuh |
| **Pesanan Jual: Buat Draf** | Ya (diskon maks 10%) | Tidak | Ya (diskon maks 25%) |
| **Pesanan Jual: Konfirmasi** | Ya (hanya draf miliknya) | Tidak | Ya (semua draf & pesanan di bawah HPP) |
| **Pesanan Jual: Kirim** | Tidak | Ya (isi tgl kirim & jatuh tempo) | Ya |
| **Pesanan Jual: Batal** | Batal draf miliknya | Tidak | Batal dikonfirmasi (alasan ≥ 10 char) |
| **Pesanan Jual: Pelunasan** | Tidak | Tidak | Ya (catat tanggal lunas) |
| **Pembelian ke Pemasok** | Tidak | Ajukan pembelian & catat penerimaan | Setujui/tolak (isi harga beli) & terima |
| **Laporan & Audit Log** | Tidak tampil | Tidak tampil | Penuh (grafik mingguan, log audit, ekspor CSV) |
| **Pengaturan Pengguna** | Tidak tampil | Tidak tampil | Kelola akun, peran, dan status aktif |

---

## 2. Peta Rute Halaman & Penjagaan Akses

| Alamat Halaman | Peran yang Diizinkan | Belum Masuk | Peran Lain yang Mencoba Akses |
| :--- | :--- | :--- | :--- |
| `/login` | Publik (belum login) | Tetap di `/login` | Dialihkan ke `/dashboard` |
| `/dashboard` | Semua peran (`manajer`, `staf_penjualan`, `staf_gudang`) | Ke `/login` | Tampilan disesuaikan perannya |
| `/barang` | Semua peran | Ke `/login` | Penjualan/Gudang tanpa kolom HPP & margin |
| `/pelanggan` | `staf_penjualan`, `manajer` | Ke `/login` | Halaman Akses Ditolak (Gudang) |
| `/pesanan-jual` | Semua peran | Ke `/login` | Gudang hanya melihat pesanan status `dikonfirmasi` ke atas |
| `/pesanan-jual/baru` | `staf_penjualan`, `manajer` | Ke `/login` | Halaman Akses Ditolak (Gudang) |
| `/pesanan-jual/[id]` | Semua peran (tampilan adaptif) | Ke `/login` | Kolom HPP dan tombol aksi mengikuti peran |
| `/pembelian` | `staf_gudang`, `manajer` | Ke `/login` | Halaman Akses Ditolak (Penjualan) |
| `/laporan` | `manajer` | Ke `/login` | Halaman Akses Ditolak (Penjualan & Gudang) |
| `/pengaturan` | `manajer` | Ke `/login` | Halaman Akses Ditolak (Penjualan & Gudang) |

---

## 3. Tabel Skenario Pengujian (Minimal 15 Test Cases)

Status: **Belum Diuji** / **Lulus** / **Gagal**.

| Kode | Rujukan | Akun Uji | Langkah Pengujian | Hasil yang Diharapkan | Hasil Sebenarnya | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | US-01, US-04, US-10 | 3 Peran | Login bergantian dengan akun Staf Penjualan, Staf Gudang, dan Manajer | Setiap akun berhasil masuk dan langsung diarahkan ke Dashboard sesuai perannya | Menunggu pengujian | Belum Diuji |
| **TC-02** | BR-01, BR-12 | Akun Nonaktif | Login dengan akun yang statusnya `aktif = false` di tabel `profiles` | Ditolak masuk dengan pesan "Akun dinonaktifkan. Hubungi Manajer" | Menunggu pengujian | Belum Diuji |
| **TC-03** | US-02, BR-02, BR-03 | Staf Penjualan | Membuat draf pesanan jual baru, memilih pelanggan aktif, menambah 2 barang, dan memberi diskon 5% pada item pertama | Draf berhasil disimpan, subtotal dan total terhitung otomatis dengan rumus diskon yang benar | Menunggu pengujian | Belum Diuji |
| **TC-04** | BR-03 (Uji Negatif) | Staf Penjualan | Mengisi diskon 11% pada salah satu baris pesanan jual | Sistem menolak penyimpanan dengan validasi: "Diskon Staf Penjualan maksimal 10%" | Menunggu pengujian | Belum Diuji |
| **TC-05** | BR-03 (Kasus Batas) | Manajer | Mengisi diskon 25% (lolos), lalu mencoba mengisi diskon 26% (tolak) | Diskon 25% berhasil disimpan; diskon 26% ditolak dengan pesan: "Diskon maksimal 25%" | Menunggu pengujian | Belum Diuji |
| **TC-06** | US-03, BR-06, BR-07 | Staf Penjualan | Mengonfirmasi draf pesanan jual saat stok semua barang mencukupi | Status berubah menjadi `dikonfirmasi`, stok seluruh barang berkurang otomatis, piutang berjalan bertambah | Menunggu pengujian | Belum Diuji |
| **TC-07** | BR-06 (All-or-Nothing) | Staf Penjualan | Mengonfirmasi pesanan berisi 2 barang: Barang A (stok cukup) dan Barang B (stok kurang) | Konfirmasi ditolak total; stok Barang A dan B sama sekali tidak berubah (tidak ada pemotongan sebagian) | Menunggu pengujian | Belum Diuji |
| **TC-08** | BR-06 (Concurrency) | 2 Sales Bersamaan | Dua sales membuka pesanan berbeda yang sama-sama memesan Barang C (sisa stok 1), lalu klik Konfirmasi bersamaan | Satu pesanan berhasil `dikonfirmasi`, satu pesanan gagal dengan notifikasi stok habis; stok akhir tepat 0 (tidak minus) | Menunggu pengujian | Belum Diuji |
| **TC-09** | BR-05 (Uji Negatif) | Staf Penjualan | Mengonfirmasi pesanan yang nilai totalnya membuat piutang berjalan pelanggan melebihi batas kredit | Konfirmasi ditolak dengan pesan: "Pesanan melebihi batas kredit pelanggan" | Menunggu pengujian | Belum Diuji |
| **TC-10** | BR-05 (Uji Negatif) | Staf Penjualan | Mengonfirmasi pesanan untuk pelanggan yang memiliki pesanan `dikirim` yang sudah melewati tanggal jatuh tempo | Konfirmasi ditolak dengan pesan: "Pelanggan memiliki tagihan lewat jatuh tempo" | Menunggu pengujian | Belum Diuji |
| **TC-11** | BR-04, BR-12 (Data Rahasia) | Staf Penjualan | Mengonfirmasi pesanan yang subtotal salah satu barisnya di bawah harga pokok (HPP) barang | Konfirmasi ditolak dengan pesan: "Harga di bawah batas, minta persetujuan Manajer" tanpa memunculkan angka HPP | Menunggu pengujian | Belum Diuji |
| **TC-12** | US-04, BR-07 | Staf Gudang | Menandai pesanan berstatus `dikonfirmasi` menjadi `dikirim` | Status berubah menjadi `dikirim`; tanggal kirim terisi hari ini; tanggal jatuh tempo terhitung otomatis (tgl kirim + termin pelanggan) | Menunggu pengujian | Belum Diuji |
| **TC-13** | US-09, BR-07 | Manajer | Mencatat pelunasan pesanan jual berstatus `dikirim` | Status berubah menjadi `lunas`; tanggal bayar tercatat; pesanan keluar dari piutang berjalan | Menunggu pengujian | Belum Diuji |
| **TC-14** | BR-08 (Uji Negatif & Positif) | Manajer | Membatalkan pesanan `dikonfirmasi`: mencoba dengan alasan < 10 karakter (tolak), lalu coba dengan alasan ≥ 10 karakter (lolos) | Alasan pendek ditolak; alasan cukup berhasil membatalkan pesanan dan stok semua barang kembali ke gudang | Menunggu pengujian | Belum Diuji |
| **TC-15** | US-07, BR-09, BR-10 | Staf Gudang | Mencatat penerimaan barang dari pembelian yang sudah disetujui Manajer | Status pembelian menjadi `diterima`, stok bertambah sejumlah diterima, HPP barang terupdate; penerimaan ulang ditolak | Menunggu pengujian | Belum Diuji |
| **TC-16** | BR-12 (Uji Tembus RLS) | Staf Penjualan | Membuka tab DevTools Network / memanggil query database langsung ke tabel `item_costs` | Query ditolak (403 Forbidden) atau data `harga_pokok` bernilai `null` / kosong | Menunggu pengujian | Belum Diuji |
| **TC-17** | BR-07 (Uji State Machine) | Staf Penjualan | Mencoba mengubah paksa status pesanan dari `draf` langsung ke `dikirim` atau `lunas` lewat API / Console | Ditolak oleh trigger/function database: "Perpindahan status tidak diizinkan" | Menunggu pengujian | Belum Diuji |
| **TC-18** | BR-12 (Audit Trail) | Manajer | Memeriksa tabel `audit_logs` setelah melakukan perubahan harga jual, batas kredit, dan pembatalan pesanan | Tercatat log baru dengan kolom: pelaku, aksi, data yang diubah, nilai sebelum, nilai sesudah, dan waktu secara akurat | Menunggu pengujian | Belum Diuji |

---

## 4. Checklist Kesiapan Rilis (10 Poin Capstone)

- [ ] **1. Aplikasi Terbuka di URL Netlify Tanpa Error**: Halaman utama dapat diakses publik, tidak ada *white screen* atau error 500.
- [ ] **2. Semua Akun Login Berfungsi**: Akun `manajer`, `staf_penjualan`, dan `staf_gudang` dapat masuk di URL tayang.
- [ ] **3. Kunci Rahasia Aman**: File `.env.local` terdaftar di `.gitignore`, tidak ada *service role key* atau secret yang ter-commit ke GitHub.
- [ ] **4. RLS Aktif di Semua Tabel**: Row Level Security aktif pada 100% tabel di Supabase Security Advisors.
- [ ] **5. Route Guard URL Bar**: Mengetik alamat halaman di luar peran (misal `/laporan` dengan akun Sales) menampilkan halaman "Akses Ditolak" dan tidak menampilkan data.
- [ ] **6. Dashboard & Data Riil**: Data contoh (16 barang, 4 pemasok, 10 pelanggan, 45 pesanan) terisi; grafik omzet dan margin mingguan tampil.
- [ ] **7. Audit Log Terisi**: Seluruh aksi sensitif tercatat di log audit dan log tersebut tidak bisa diubah/dihapus pengguna.
- [ ] **8. Tag Noindex Terpasang**: `<meta name="robots" content="noindex" />` terpasang di root layout aplikasi internal.
- [ ] **9. README Informatif**: Berisi deskripsi solusi, cara menjalankan lokal, kredensial akun uji, dan catatan keputusan arsitektur.
- [ ] **10. Repo Publik**: Link GitHub dapat dibuka dan diperiksa dari jendela *Incognito* / *Private Browser* tanpa login.
