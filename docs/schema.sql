-- ====================================================================
-- SKEMA DATABASE ERP DISTRIBUSI - CV SINAR ABADI NIAGA
-- Disesuaikan 100% dengan ERD_ERP.pdf dan PRD_ERP.md
-- ====================================================================

-- 0. EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 1. TABEL PROFILES (Terhubung 1:1 ke auth.users)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama_lengkap TEXT NOT NULL CHECK (char_length(nama_lengkap) >= 3),
    peran TEXT NOT NULL CHECK (peran IN ('penjualan', 'gudang', 'manajer')),
    aktif BOOLEAN NOT NULL DEFAULT true,
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper function untuk membaca peran user saat ini secara aman
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT peran INTO v_role 
    FROM public.profiles 
    WHERE id = auth.uid() AND aktif = true;
    RETURN v_role;
END;
$$;

-- Trigger otomatis saat user baru mendaftar di auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'nama_lengkap', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'peran', 'penjualan'),
        true
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- 2. TABEL PEMASOK (Perusahaan tempat membeli barang)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.pemasok (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode TEXT NOT NULL UNIQUE CHECK (kode ~ '^[A-Z0-9-]{3,12}$'),
    nama TEXT NOT NULL,
    telepon TEXT,
    alamat TEXT,
    aktif BOOLEAN NOT NULL DEFAULT true,
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====================================================================
-- 3. TABEL PELANGGAN (Toko & Minimarket)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.pelanggan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode TEXT NOT NULL UNIQUE,
    nama_toko TEXT NOT NULL,
    telepon TEXT,
    alamat TEXT,
    batas_kredit NUMERIC(14,0) NOT NULL DEFAULT 0 CHECK (batas_kredit >= 0),
    termin_hari INT NOT NULL DEFAULT 0 CHECK (termin_hari IN (0, 7, 14, 30)),
    aktif BOOLEAN NOT NULL DEFAULT true,
    dibuat_oleh UUID REFERENCES public.profiles(id),
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====================================================================
-- 4. TABEL BARANG (Master Barang & Stok)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode TEXT NOT NULL UNIQUE,
    nama TEXT NOT NULL,
    satuan TEXT NOT NULL, -- 'dus', 'bal', 'karung'
    harga_jual NUMERIC(14,0) NOT NULL CHECK (harga_jual > 0),
    harga_pokok NUMERIC(14,0) NOT NULL DEFAULT 0 CHECK (harga_pokok >= 0), -- RAHASIA
    stok INT NOT NULL DEFAULT 0 CHECK (stok >= 0), -- BR-01: Tidak boleh negatif
    stok_minimum INT NOT NULL DEFAULT 0 CHECK (stok_minimum >= 0),
    aktif BOOLEAN NOT NULL DEFAULT true,
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====================================================================
-- 5. TABEL PEMBELIAN (Order Pembelian ke Pemasok)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.pembelian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor TEXT NOT NULL UNIQUE, -- Contoh: PO-00001
    pemasok_id UUID NOT NULL REFERENCES public.pemasok(id),
    barang_id UUID NOT NULL REFERENCES public.barang(id),
    jumlah_dipesan INT NOT NULL CHECK (jumlah_dipesan BETWEEN 1 AND 10000), -- BR-09
    jumlah_diterima INT CHECK (jumlah_diterima IS NULL OR (jumlah_diterima BETWEEN 1 AND jumlah_dipesan)),
    harga_beli_satuan NUMERIC(14,0), -- RAHASIA, wajib > 0 saat disetujui
    status TEXT NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan', 'disetujui', 'ditolak', 'dibatalkan', 'diterima')),
    alasan_tolak TEXT,
    diajukan_oleh UUID REFERENCES public.profiles(id),
    diajukan_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    diputuskan_oleh UUID REFERENCES public.profiles(id),
    diputuskan_pada TIMESTAMPTZ,
    diterima_oleh UUID REFERENCES public.profiles(id),
    diterima_pada TIMESTAMPTZ,
    CONSTRAINT chk_alasan_tolak CHECK (status != 'ditolak' OR char_length(alasan_tolak) >= 10)
);

-- ====================================================================
-- 6. TABEL PESANAN_JUAL (Header Sales Order)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.pesanan_jual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor TEXT NOT NULL UNIQUE, -- Contoh: SO-00001
    pelanggan_id UUID NOT NULL REFERENCES public.pelanggan(id),
    status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dikonfirmasi', 'dikirim', 'lunas', 'dibatalkan')),
    total NUMERIC(14,0) NOT NULL DEFAULT 0 CHECK (total >= 0),
    dibuat_oleh UUID REFERENCES public.profiles(id),
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dikonfirmasi_pada TIMESTAMPTZ,
    dikirim_pada TIMESTAMPTZ,
    jatuh_tempo DATE,
    dilunasi_pada TIMESTAMPTZ,
    dibatalkan_pada TIMESTAMPTZ,
    alasan_batal TEXT,
    CONSTRAINT chk_jatuh_tempo CHECK (status NOT IN ('dikirim', 'lunas') OR jatuh_tempo IS NOT NULL),
    CONSTRAINT chk_dilunasi CHECK (status != 'lunas' OR dilunasi_pada IS NOT NULL),
    CONSTRAINT chk_alasan_batal CHECK (status != 'dibatalkan' OR alasan_batal IS NULL OR char_length(alasan_batal) >= 10)
);

-- ====================================================================
-- 7. TABEL ITEM_PESANAN_JUAL (Rincian Baris Barang SO)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.item_pesanan_jual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pesanan_jual_id UUID NOT NULL REFERENCES public.pesanan_jual(id) ON DELETE CASCADE,
    barang_id UUID NOT NULL REFERENCES public.barang(id),
    jumlah INT NOT NULL CHECK (jumlah >= 1), -- BR-02
    harga_satuan NUMERIC(14,0) NOT NULL CHECK (harga_satuan > 0),
    diskon_persen NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (diskon_persen BETWEEN 0 AND 25), -- BR-03
    subtotal NUMERIC(14,0) NOT NULL CHECK (subtotal >= 0),
    hpp_satuan NUMERIC(14,0), -- RAHASIA: Diisi saat konfirmasi, kosong selama draf
    CONSTRAINT uq_pesanan_barang UNIQUE (pesanan_jual_id, barang_id) -- BR-02: 1 barang 1x per pesanan
);

-- ====================================================================
-- 8. TABEL MUTASI_STOK (Kartu Stok Append-Only)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.mutasi_stok (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barang_id UUID NOT NULL REFERENCES public.barang(id),
    jenis TEXT NOT NULL CHECK (jenis IN ('masuk', 'keluar', 'batal', 'penyesuaian')),
    jumlah INT NOT NULL CHECK (jumlah != 0),
    stok_sesudah INT NOT NULL CHECK (stok_sesudah >= 0), -- BR-01: Stok tidak boleh negatif
    nomor_dokumen TEXT NOT NULL,
    alasan TEXT,
    dibuat_oleh UUID REFERENCES public.profiles(id),
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_alasan_penyesuaian CHECK (jenis != 'penyesuaian' OR char_length(alasan) >= 10)
);

-- ====================================================================
-- 9. TABEL AUDIT_LOG (Pencatatan Aksi Sensitif Append-Only)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pelaku_id UUID REFERENCES public.profiles(id),
    aksi TEXT NOT NULL,
    nama_tabel TEXT NOT NULL,
    data_id UUID NOT NULL,
    nilai_lama JSONB,
    nilai_baru JSONB NOT NULL,
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====================================================================
-- RAHASIA DAGANG: DYNAMIC DATA MASKING VIEW (HPP & MARGIN)
-- Menggunakan security_invoker = true agar mematuhi RLS tabel barang
-- ====================================================================
CREATE OR REPLACE VIEW public.v_barang 
WITH (security_invoker = true) AS
SELECT 
    b.id,
    b.kode,
    b.nama,
    b.satuan,
    b.harga_jual,
    CASE 
        WHEN public.current_user_role() = 'manajer' THEN b.harga_pokok 
        ELSE NULL 
    END AS harga_pokok,
    b.stok,
    b.stok_minimum,
    b.aktif,
    b.diperbarui_pada
FROM public.barang b;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) - AKTIF DI SEMUA TABEL
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pemasok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pelanggan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pembelian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesanan_jual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_pesanan_jual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutasi_stok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 1. POLICIES PROFILES
DROP POLICY IF EXISTS "Semua user aktif bisa melihat profiles" ON public.profiles;
CREATE POLICY "Semua user aktif bisa melihat profiles"
    ON public.profiles FOR SELECT TO authenticated
    USING (aktif = true);

DROP POLICY IF EXISTS "Hanya Manajer yang bisa mengelola profiles" ON public.profiles;
CREATE POLICY "Hanya Manajer yang bisa mengelola profiles"
    ON public.profiles FOR ALL TO authenticated
    USING (public.current_user_role() = 'manajer');

-- 2. POLICIES PEMASOK
DROP POLICY IF EXISTS "Staf Gudang dan Manajer bisa melihat pemasok" ON public.pemasok;
CREATE POLICY "Staf Gudang dan Manajer bisa melihat pemasok"
    ON public.pemasok FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('gudang', 'manajer'));

DROP POLICY IF EXISTS "Staf Gudang dan Manajer bisa mengelola pemasok" ON public.pemasok;
CREATE POLICY "Staf Gudang dan Manajer bisa mengelola pemasok"
    ON public.pemasok FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('gudang', 'manajer'));

DROP POLICY IF EXISTS "Staf Gudang dan Manajer bisa update pemasok" ON public.pemasok;
CREATE POLICY "Staf Gudang dan Manajer bisa update pemasok"
    ON public.pemasok FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('gudang', 'manajer'));

-- 3. POLICIES PELANGGAN
DROP POLICY IF EXISTS "Staf Penjualan dan Manajer bisa melihat pelanggan" ON public.pelanggan;
CREATE POLICY "Staf Penjualan dan Manajer bisa melihat pelanggan"
    ON public.pelanggan FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('penjualan', 'manajer'));

DROP POLICY IF EXISTS "Staf Penjualan dan Manajer bisa menambah pelanggan" ON public.pelanggan;
CREATE POLICY "Staf Penjualan dan Manajer bisa menambah pelanggan"
    ON public.pelanggan FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('penjualan', 'manajer'));

DROP POLICY IF EXISTS "Hanya Manajer yang bisa update pelanggan (termasuk batas kredit)" ON public.pelanggan;
CREATE POLICY "Hanya Manajer yang bisa update pelanggan (termasuk batas kredit)"
    ON public.pelanggan FOR UPDATE TO authenticated
    USING (public.current_user_role() = 'manajer');

-- 4. POLICIES BARANG
DROP POLICY IF EXISTS "Semua peran aktif bisa melihat barang" ON public.barang;
CREATE POLICY "Semua peran aktif bisa melihat barang"
    ON public.barang FOR SELECT TO authenticated
    USING (aktif = true OR public.current_user_role() = 'manajer');

DROP POLICY IF EXISTS "Hanya Manajer yang bisa menambah barang" ON public.barang;
CREATE POLICY "Hanya Manajer yang bisa menambah barang"
    ON public.barang FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() = 'manajer');

DROP POLICY IF EXISTS "Manajer dan Gudang bisa update data barang" ON public.barang;
CREATE POLICY "Manajer dan Gudang bisa update data barang"
    ON public.barang FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('gudang', 'manajer'));

-- 5. POLICIES PEMBELIAN
DROP POLICY IF EXISTS "Staf Gudang dan Manajer bisa melihat pembelian" ON public.pembelian;
CREATE POLICY "Staf Gudang dan Manajer bisa melihat pembelian"
    ON public.pembelian FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('gudang', 'manajer'));

DROP POLICY IF EXISTS "Staf Gudang dan Manajer bisa mengajukan pembelian" ON public.pembelian;
CREATE POLICY "Staf Gudang dan Manajer bisa mengajukan pembelian"
    ON public.pembelian FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('gudang', 'manajer'));

DROP POLICY IF EXISTS "Staf Gudang dan Manajer bisa update pembelian sesuai peran" ON public.pembelian;
CREATE POLICY "Staf Gudang dan Manajer bisa update pembelian sesuai peran"
    ON public.pembelian FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('gudang', 'manajer'));

-- 6. POLICIES PESANAN_JUAL
DROP POLICY IF EXISTS "Staf Penjualan dan Manajer bisa melihat pesanan jual" ON public.pesanan_jual;
CREATE POLICY "Staf Penjualan dan Manajer bisa melihat pesanan jual"
    ON public.pesanan_jual FOR SELECT TO authenticated
    USING (
        public.current_user_role() = 'manajer'
        OR (public.current_user_role() = 'penjualan')
        OR (public.current_user_role() = 'gudang' AND status IN ('dikonfirmasi', 'dikirim', 'lunas'))
    );

DROP POLICY IF EXISTS "Staf Penjualan dan Manajer bisa membuat draf pesanan" ON public.pesanan_jual;
CREATE POLICY "Staf Penjualan dan Manajer bisa membuat draf pesanan"
    ON public.pesanan_jual FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('penjualan', 'manajer'));

DROP POLICY IF EXISTS "Update pesanan jual sesuai hak peran" ON public.pesanan_jual;
CREATE POLICY "Update pesanan jual sesuai hak peran"
    ON public.pesanan_jual FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('penjualan', 'gudang', 'manajer'));

-- 7. POLICIES ITEM_PESANAN_JUAL
DROP POLICY IF EXISTS "Akses baris pesanan mengikuti akses header pesanan" ON public.item_pesanan_jual;
CREATE POLICY "Akses baris pesanan mengikuti akses header pesanan"
    ON public.item_pesanan_jual FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.pesanan_jual pj 
        WHERE pj.id = item_pesanan_jual.pesanan_jual_id
    ));

DROP POLICY IF EXISTS "Staf Penjualan dan Manajer bisa menambah item pesanan" ON public.item_pesanan_jual;
CREATE POLICY "Staf Penjualan dan Manajer bisa menambah item pesanan"
    ON public.item_pesanan_jual FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('penjualan', 'manajer'));

DROP POLICY IF EXISTS "Staf Penjualan dan Manajer bisa update/hapus item draf" ON public.item_pesanan_jual;
CREATE POLICY "Staf Penjualan dan Manajer bisa update/hapus item draf"
    ON public.item_pesanan_jual FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('penjualan', 'manajer'));

DROP POLICY IF EXISTS "Staf Penjualan dan Manajer bisa hapus item draf" ON public.item_pesanan_jual;
CREATE POLICY "Staf Penjualan dan Manajer bisa hapus item draf"
    ON public.item_pesanan_jual FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('penjualan', 'manajer'));

-- 8. POLICIES MUTASI_STOK (Append-Only)
DROP POLICY IF EXISTS "Semua peran aktif bisa melihat mutasi stok" ON public.mutasi_stok;
CREATE POLICY "Semua peran aktif bisa melihat mutasi stok"
    ON public.mutasi_stok FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Gudang dan Manajer bisa mencatat mutasi stok" ON public.mutasi_stok;
CREATE POLICY "Gudang dan Manajer bisa mencatat mutasi stok"
    ON public.mutasi_stok FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('gudang', 'manajer'));

-- 9. POLICIES AUDIT_LOG (Append-Only & Rahasia Manajer)
DROP POLICY IF EXISTS "Hanya Manajer yang bisa membaca audit log" ON public.audit_log;
CREATE POLICY "Hanya Manajer yang bisa membaca audit log"
    ON public.audit_log FOR SELECT TO authenticated
    USING (public.current_user_role() = 'manajer');

DROP POLICY IF EXISTS "Sistem/User bisa mencatat audit log" ON public.audit_log;
CREATE POLICY "Sistem/User bisa mencatat audit log"
    ON public.audit_log FOR INSERT TO authenticated
    WITH CHECK (true);
