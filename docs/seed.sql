-- ====================================================================
-- SEED DATA AWAL: ERP DISTRIBUSI - CV SINAR ABADI NIAGA
-- Disesuaikan dengan PRD_ERP.md dan Data_Contoh_ERP.xlsx
-- ====================================================================

-- 1. PEMASOK (4 Supplier Sembako)
INSERT INTO public.pemasok (kode, nama, telepon, alamat, aktif) VALUES
('SUP-01', 'PT Pangan Nusantara', '021-88991122', 'Jl. Raya Industri No. 12, Cikarang', true),
('SUP-02', 'CV Sumber Manis', '021-88334455', 'Jl. Pasar Induk Cibitung No. 45, Bekasi', true),
('SUP-03', 'PT Bogasari Utama', '021-43990011', 'Kawasan Industri Pulogadung, Jakarta Timur', true),
('SUP-04', 'PT Indofood Makmur', '021-5201234', 'Jl. Jend. Sudirman Kav. 76-78, Jakarta Selatan', true)
ON CONFLICT (kode) DO NOTHING;

-- 2. PELANGGAN (10 Toko & Minimarket)
INSERT INTO public.pelanggan (kode, nama_toko, telepon, alamat, batas_kredit, termin_hari, aktif) VALUES
('PLG-001', 'Toko Berkah Jaya', '0812-1111-2222', 'Jl. Kemakmuran No. 10, Kranji, Bekasi', 15000000, 14, true),
('PLG-002', 'Minimarket Sentosa Mart', '0812-2222-3333', 'Jl. Bintara Jaya No. 5, Bekasi Barat', 35000000, 30, true),
('PLG-003', 'Toko Ibu Sari', '0812-3333-4444', 'Jl. Mayor Oking No. 22, Bekasi Timur', 10000000, 7, true),
('PLG-004', 'Toko Maju Bersama', '0812-4444-5555', 'Jl. KH Noer Ali No. 8, Kalimalang', 5000000, 7, true),
('PLG-005', 'Toko Rejeki Lancar', '0812-5555-6666', 'Jl. Pejuang Pratama No. 15, Medan Satria', 12000000, 14, true),
('PLG-006', 'Toko Sumber Rezeki', '0812-6666-7777', 'Jl. Patriot No. 3, Jaka Sampurna', 8000000, 7, true),
('PLG-007', 'Grosir Murah Meriah', '0812-7777-8888', 'Jl. Raya Bekasi Km 18, Cakung, Jakarta Timur', 30000000, 30, true),
('PLG-008', 'Toko Amanah', '0812-8888-9999', 'Jl. I Gusti Ngurah Rai No. 40, Klender', 7500000, 14, true),
('PLG-009', 'Toko Sederhana', '0812-9999-0000', 'Jl. Pondok Kopi Raya No. 11, Duren Sawit', 5000000, 0, true),
('PLG-010', 'Toko Berkah Mandiri', '0813-1010-2020', 'Jl. Rawabebek No. 7, Bekasi Barat', 0, 0, true)
ON CONFLICT (kode) DO NOTHING;

-- 3. BARANG (16 Barang Master, 1 Nonaktif, Sesuai Kasus Uji)
INSERT INTO public.barang (kode, nama, satuan, harga_jual, harga_pokok, stok, stok_minimum, aktif) VALUES
('BRG-001', 'Minyak Goreng Pouch 2 L isi 6', 'dus', 226000, 208000, 45, 10, true),
('BRG-002', 'Gula Pasir 1 kg isi 20', 'dus', 365000, 340000, 30, 10, true),
('BRG-003', 'Tepung Terigu 1 kg isi 12', 'dus', 138000, 125000, 25, 8, true),
('BRG-004', 'Beras Premium 5 kg isi 5', 'bal', 345000, 318000, 20, 5, true),
('BRG-005', 'Mi Instan Goreng isi 40', 'dus', 118000, 108000, 50, 15, true),
('BRG-006', 'Mi Instan Kuah isi 40', 'dus', 112000, 101500, 40, 15, true),
('BRG-007', 'Air Mineral 600 ml isi 24', 'dus', 48000, 41500, 60, 20, true),
('BRG-008', 'Saus Sambal 340 ml isi 24', 'dus', 178000, 162000, 8, 8, true),   -- Stok menipis
('BRG-009', 'Kopi Sachet 3 in 1 isi 120', 'dus', 160000, 145000, 0, 12, true),  -- Stok habis (0)
('BRG-010', 'Teh Celup isi 25 box isi 24', 'dus', 158000, 142000, 15, 6, true),
('BRG-011', 'Susu Kental Manis 370 g isi 48', 'dus', 560000, 520000, 1, 5, true), -- Sisa stok 1 (uji race condition)
('BRG-012', 'Sabun Cuci Piring 750 ml isi 12', 'dus', 170000, 152000, 18, 5, true),
('BRG-013', 'Deterjen Bubuk 800 g isi 12', 'dus', 215000, 195000, 14, 6, true),
('BRG-014', 'Kecap Manis 550 ml isi 12', 'dus', 240000, 218000, 12, 5, true),
('BRG-015', 'Margarin 200 g isi 48', 'dus', 340000, 310000, 0, 4, true),     -- Stok habis (0)
('BRG-016', 'Minyak Jagung 1 L isi 12', 'dus', 480000, 430000, 0, 2, false)    -- Nonaktif (BR-05)
ON CONFLICT (kode) DO NOTHING;
