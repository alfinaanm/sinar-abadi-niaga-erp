-- ====================================================================
-- FUNGSI & PROSEDUR TERSIMPAN: OPERASIONAL ERP DISTRIBUSI LENGKAP
-- CV Sinar Abadi Niaga (Mematuhi BR-01, BR-08, BR-09, BR-10, BR-11, BR-12)
-- ====================================================================

-- 1. SECURE VIEW UNTUK PEMBELIAN (Harga Beli Satuan Hanya Terlihat oleh Manajer)
CREATE OR REPLACE VIEW public.v_pembelian
WITH (security_invoker = true) AS
SELECT 
    p.id,
    p.nomor,
    p.pemasok_id,
    p.barang_id,
    p.jumlah_dipesan,
    p.jumlah_diterima,
    CASE 
        WHEN public.current_user_role() = 'manajer' THEN p.harga_beli_satuan 
        ELSE NULL 
    END AS harga_beli_satuan,
    p.status,
    p.alasan_tolak,
    p.diajukan_oleh,
    p.diajukan_pada,
    p.diputuskan_oleh,
    p.diputuskan_pada,
    p.diterima_oleh,
    p.diterima_pada
FROM public.pembelian p;

-- 2. GENERATOR NOMOR PEMBELIAN (PO-00001, PO-00002, ...)
CREATE OR REPLACE FUNCTION public.generate_nomor_pembelian()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_num INT;
    v_nomor TEXT;
BEGIN
    SELECT COALESCE(MAX(SUBSTRING(nomor FROM 4)::INT), 0) + 1
    INTO v_next_num
    FROM public.pembelian
    WHERE nomor ~ '^PO-[0-9]+$';

    v_nomor := 'PO-' || LPAD(v_next_num::TEXT, 5, '0');
    RETURN v_nomor;
END;
$$;

-- 3. AJUKAN PEMBELIAN (Staf Gudang & Manajer, Jumlah 1 sampai 10.000)
CREATE OR REPLACE FUNCTION public.ajukan_pembelian(
    p_pemasok_id UUID,
    p_barang_id UUID,
    p_jumlah_dipesan INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_nomor_po TEXT;
    v_po_id UUID;
    v_pemasok_aktif BOOLEAN;
    v_barang_aktif BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role NOT IN ('gudang', 'manajer') THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Staf Gudang dan Manajer yang boleh mengajukan pembelian.';
    END IF;

    IF p_jumlah_dipesan < 1 OR p_jumlah_dipesan > 10000 THEN
        RAISE EXCEPTION 'Jumlah dipesan harus antara 1 sampai 10.000.';
    END IF;

    -- Validasi pemasok aktif
    SELECT aktif INTO v_pemasok_aktif FROM public.pemasok WHERE id = p_pemasok_id;
    IF v_pemasok_aktif IS NOT TRUE THEN
        RAISE EXCEPTION 'Pemasok tidak ditemukan atau nonaktif.';
    END IF;

    -- Validasi barang aktif
    SELECT aktif INTO v_barang_aktif FROM public.barang WHERE id = p_barang_id;
    IF v_barang_aktif IS NOT TRUE THEN
        RAISE EXCEPTION 'Barang tidak ditemukan atau nonaktif.';
    END IF;

    v_nomor_po := public.generate_nomor_pembelian();

    INSERT INTO public.pembelian (
        nomor,
        pemasok_id,
        barang_id,
        jumlah_dipesan,
        status,
        diajukan_oleh,
        diajukan_pada
    ) VALUES (
        v_nomor_po,
        p_pemasok_id,
        p_barang_id,
        p_jumlah_dipesan,
        'diajukan',
        v_user_id,
        now()
    ) RETURNING id INTO v_po_id;

    RETURN jsonb_build_object(
        'success', true,
        'pembelian_id', v_po_id,
        'nomor', v_nomor_po,
        'message', 'Pengajuan pembelian berhasil dibuat.'
    );
END;
$$;

-- 4. SETUJUI PEMBELIAN (Hanya Manajer, Wajib Isi Harga Beli Satuan > 0)
CREATE OR REPLACE FUNCTION public.setujui_pembelian(
    p_pembelian_id UUID,
    p_harga_beli_satuan NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_po RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role != 'manajer' THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Manajer yang boleh menyetujui pembelian.';
    END IF;

    IF p_harga_beli_satuan IS NULL OR p_harga_beli_satuan <= 0 THEN
        RAISE EXCEPTION 'Harga beli satuan wajib diisi dan harus lebih dari Rp0.';
    END IF;

    SELECT * INTO v_po FROM public.pembelian WHERE id = p_pembelian_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dokumen pembelian tidak ditemukan.';
    END IF;

    IF v_po.status != 'diajukan' THEN
        RAISE EXCEPTION 'Hanya pembelian berstatus "diajukan" yang dapat disetujui.';
    END IF;

    UPDATE public.pembelian SET
        status = 'disetujui',
        harga_beli_satuan = p_harga_beli_satuan,
        diputuskan_oleh = v_user_id,
        diputuskan_pada = now()
    WHERE id = p_pembelian_id;

    -- Catat di Audit Log (BR-12)
    INSERT INTO public.audit_log (
        pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
    ) VALUES (
        v_user_id,
        'setujui_pembelian',
        'pembelian',
        p_pembelian_id,
        jsonb_build_object('status', v_po.status),
        jsonb_build_object('status', 'disetujui', 'harga_beli_satuan', p_harga_beli_satuan)
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Pembelian disetujui dengan harga beli Rp' || p_harga_beli_satuan
    );
END;
$$;

-- 5. TOLAK PEMBELIAN (Hanya Manajer, Alasan Minimal 10 Karakter)
CREATE OR REPLACE FUNCTION public.tolak_pembelian(
    p_pembelian_id UUID,
    p_alasan_tolak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_po RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role != 'manajer' THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Manajer yang boleh menolak pembelian.';
    END IF;

    IF p_alasan_tolak IS NULL OR char_length(trim(p_alasan_tolak)) < 10 THEN
        RAISE EXCEPTION 'Alasan penolakan wajib diisi minimal 10 karakter.';
    END IF;

    SELECT * INTO v_po FROM public.pembelian WHERE id = p_pembelian_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dokumen pembelian tidak ditemukan.';
    END IF;

    IF v_po.status != 'diajukan' THEN
        RAISE EXCEPTION 'Hanya pembelian berstatus "diajukan" yang dapat ditolak.';
    END IF;

    UPDATE public.pembelian SET
        status = 'ditolak',
        alasan_tolak = trim(p_alasan_tolak),
        diputuskan_oleh = v_user_id,
        diputuskan_pada = now()
    WHERE id = p_pembelian_id;

    -- Catat di Audit Log (BR-12)
    INSERT INTO public.audit_log (
        pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
    ) VALUES (
        v_user_id,
        'tolak_pembelian',
        'pembelian',
        p_pembelian_id,
        jsonb_build_object('status', v_po.status),
        jsonb_build_object('status', 'ditolak', 'alasan_tolak', trim(p_alasan_tolak))
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Pengajuan pembelian berhasil ditolak.'
    );
END;
$$;

-- 6. BATALKAN PEMBELIAN (Pengaju membatalkan saat diajukan, Manajer membatalkan saat disetujui)
CREATE OR REPLACE FUNCTION public.batalkan_pembelian(p_pembelian_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_po RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;

    SELECT * INTO v_po FROM public.pembelian WHERE id = p_pembelian_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dokumen pembelian tidak ditemukan.';
    END IF;

    IF v_po.status = 'diajukan' THEN
        -- Boleh dibatalkan oleh pengaju atau Manajer
        IF v_po.diajukan_oleh != v_user_id AND v_role != 'manajer' THEN
            RAISE EXCEPTION 'Hanya pembuat pengajuan atau Manajer yang dapat membatalkan.';
        END IF;
    ELSIF v_po.status = 'disetujui' THEN
        -- Hanya Manajer sebelum barang diterima
        IF v_role != 'manajer' THEN
            RAISE EXCEPTION 'Pembelian yang sudah disetujui hanya boleh dibatalkan oleh Manajer.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Pembelian dengan status "%" tidak dapat dibatalkan.', v_po.status;
    END IF;

    UPDATE public.pembelian SET
        status = 'dibatalkan',
        diputuskan_oleh = v_user_id,
        diputuskan_pada = now()
    WHERE id = p_pembelian_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Pembelian berhasil dibatalkan.'
    );
END;
$$;

-- 7. TERIMA PEMBELIAN (Staf Gudang & Manajer, BR-10: 1x penerimaan, update stok & HPP)
CREATE OR REPLACE FUNCTION public.terima_pembelian(
    p_pembelian_id UUID,
    p_jumlah_diterima INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_po RECORD;
    v_stok_lama INT;
    v_stok_baru INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role NOT IN ('gudang', 'manajer') THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Staf Gudang dan Manajer yang boleh mencatat penerimaan barang.';
    END IF;

    SELECT * INTO v_po FROM public.pembelian WHERE id = p_pembelian_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dokumen pembelian tidak ditemukan.';
    END IF;

    -- BR-10: Penerimaan barang hanya untuk pembelian berstatus disetujui dan hanya satu kali
    IF v_po.status != 'disetujui' THEN
        IF v_po.status = 'diterima' THEN
            RAISE EXCEPTION 'Pembelian ini sudah pernah diterima sebelumnya (penerimaan hanya satu kali).';
        ELSE
            RAISE EXCEPTION 'Penerimaan barang hanya dapat dilakukan untuk pembelian berstatus "disetujui".';
        END IF;
    END IF;

    IF p_jumlah_diterima < 1 OR p_jumlah_diterima > v_po.jumlah_dipesan THEN
        RAISE EXCEPTION 'Jumlah diterima harus antara 1 sampai jumlah yang dipesan (%).', v_po.jumlah_dipesan;
    END IF;

    -- Update status pembelian menjadi diterima
    UPDATE public.pembelian SET
        status = 'diterima',
        jumlah_diterima = p_jumlah_diterima,
        diterima_oleh = v_user_id,
        diterima_pada = now()
    WHERE id = p_pembelian_id;

    -- Kunci dan perbarui data barang: stok bertambah & HPP diperbarui menjadi harga beli PO
    SELECT stok INTO v_stok_lama FROM public.barang WHERE id = v_po.barang_id FOR UPDATE;
    v_stok_baru := v_stok_lama + p_jumlah_diterima;

    UPDATE public.barang SET
        stok = v_stok_baru,
        harga_pokok = v_po.harga_beli_satuan,
        diperbarui_pada = now()
    WHERE id = v_po.barang_id;

    -- Catat di mutasi stok (BR-11)
    INSERT INTO public.mutasi_stok (
        barang_id,
        jenis,
        jumlah,
        stok_sesudah,
        nomor_dokumen,
        alasan,
        dibuat_oleh,
        dibuat_pada
    ) VALUES (
        v_po.barang_id,
        'masuk',
        p_jumlah_diterima,
        v_stok_baru,
        v_po.nomor,
        'Penerimaan pesanan pembelian ' || v_po.nomor,
        v_user_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Barang berhasil diterima sejumlah ' || p_jumlah_diterima || '. Stok bertambah dan HPP diperbarui.',
        'stok_baru', v_stok_baru
    );
END;
$$;

-- 8. PENYESUAIAN STOK FISIK / STOK OPNAME (Staf Gudang & Manajer, Alasan >= 10 Karakter, BR-11)
CREATE OR REPLACE FUNCTION public.sesuaikan_stok(
    p_barang_id UUID,
    p_stok_fisik INT,
    p_alasan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_stok_lama INT;
    v_selisih INT;
    v_nomor_adj TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role NOT IN ('gudang', 'manajer') THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Staf Gudang dan Manajer yang boleh melakukan penyesuaian stok.';
    END IF;

    IF p_stok_fisik < 0 THEN
        RAISE EXCEPTION 'Stok hasil penyesuaian tidak boleh negatif.';
    END IF;

    IF p_alasan IS NULL OR char_length(trim(p_alasan)) < 10 THEN
        RAISE EXCEPTION 'Alasan penyesuaian stok wajib diisi minimal 10 karakter.';
    END IF;

    SELECT stok INTO v_stok_lama FROM public.barang WHERE id = p_barang_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Barang tidak ditemukan.';
    END IF;

    v_selisih := p_stok_fisik - v_stok_lama;
    IF v_selisih = 0 THEN
        RAISE EXCEPTION 'Stok fisik yang diinput sama dengan stok saat ini di sistem (% unit).', v_stok_lama;
    END IF;

    v_nomor_adj := 'ADJ-' || TO_CHAR(now(), 'YYYYMMDD-HH24MISS');

    -- Update stok barang
    UPDATE public.barang SET
        stok = p_stok_fisik,
        diperbarui_pada = now()
    WHERE id = p_barang_id;

    -- Catat di mutasi stok (BR-11)
    INSERT INTO public.mutasi_stok (
        barang_id,
        jenis,
        jumlah,
        stok_sesudah,
        nomor_dokumen,
        alasan,
        dibuat_oleh,
        dibuat_pada
    ) VALUES (
        p_barang_id,
        'penyesuaian',
        v_selisih,
        p_stok_fisik,
        v_nomor_adj,
        trim(p_alasan),
        v_user_id,
        now()
    );

    -- Catat di Audit Log (BR-12)
    INSERT INTO public.audit_log (
        pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
    ) VALUES (
        v_user_id,
        'penyesuaian_stok',
        'barang',
        p_barang_id,
        jsonb_build_object('stok', v_stok_lama),
        jsonb_build_object('stok', p_stok_fisik, 'selisih', v_selisih, 'alasan', trim(p_alasan))
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Penyesuaian stok berhasil disimpan. Stok sistem kini: ' || p_stok_fisik,
        'stok_sebelum', v_stok_lama,
        'stok_sesudah', p_stok_fisik
    );
END;
$$;

-- 9. UBAH HARGA JUAL BARANG (Hanya Manajer, BR-01 & BR-12)
CREATE OR REPLACE FUNCTION public.ubah_harga_jual(
    p_barang_id UUID,
    p_harga_jual_baru NUMERIC(14,0)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_harga_lama NUMERIC(14,0);
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role != 'manajer' THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Manajer yang berhak mengubah harga jual.';
    END IF;

    IF p_harga_jual_baru IS NULL OR p_harga_jual_baru <= 0 THEN
        RAISE EXCEPTION 'Harga jual baru harus lebih dari Rp0.';
    END IF;

    SELECT harga_jual INTO v_harga_lama FROM public.barang WHERE id = p_barang_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Barang tidak ditemukan.';
    END IF;

    UPDATE public.barang SET
        harga_jual = p_harga_jual_baru,
        diperbarui_pada = now()
    WHERE id = p_barang_id;

    -- Catat di Audit Log (BR-12)
    INSERT INTO public.audit_log (
        pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
    ) VALUES (
        v_user_id,
        'ubah_harga_jual',
        'barang',
        p_barang_id,
        jsonb_build_object('harga_jual', v_harga_lama),
        jsonb_build_object('harga_jual', p_harga_jual_baru)
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Harga jual berhasil diubah menjadi Rp' || p_harga_jual_baru
    );
END;
$$;

-- 10. UBAH BATAS KREDIT DAN TERMIN PELANGGAN (Hanya Manajer, BR-05 & BR-12)
CREATE OR REPLACE FUNCTION public.ubah_batas_kredit_pelanggan(
    p_pelanggan_id UUID,
    p_batas_kredit_baru NUMERIC(14,0),
    p_termin_hari_baru INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_pelanggan RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role != 'manajer' THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Manajer yang berhak mengubah batas kredit pelanggan.';
    END IF;

    IF p_batas_kredit_baru IS NULL OR p_batas_kredit_baru < 0 THEN
        RAISE EXCEPTION 'Batas kredit tidak boleh bernilai negatif.';
    END IF;

    IF p_termin_hari_baru NOT IN (0, 7, 14, 30) THEN
        RAISE EXCEPTION 'Termin bayar hanya boleh 0, 7, 14, atau 30 hari.';
    END IF;

    SELECT * INTO v_pelanggan FROM public.pelanggan WHERE id = p_pelanggan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pelanggan tidak ditemukan.';
    END IF;

    UPDATE public.pelanggan SET
        batas_kredit = p_batas_kredit_baru,
        termin_hari = p_termin_hari_baru
    WHERE id = p_pelanggan_id;

    -- Catat di Audit Log (BR-12)
    INSERT INTO public.audit_log (
        pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
    ) VALUES (
        v_user_id,
        'ubah_batas_kredit',
        'pelanggan',
        p_pelanggan_id,
        jsonb_build_object('batas_kredit', v_pelanggan.batas_kredit, 'termin_hari', v_pelanggan.termin_hari),
        jsonb_build_object('batas_kredit', p_batas_kredit_baru, 'termin_hari', p_termin_hari_baru)
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Batas kredit dan termin bayar pelanggan berhasil diperbarui.'
    );
END;
$$;

-- 11. UBAH PERAN DAN STATUS AKTIF AKUN PENGGUNA (Hanya Manajer, BR-12)
CREATE OR REPLACE FUNCTION public.ubah_peran_dan_status_user(
    p_target_user_id UUID,
    p_peran_baru TEXT,
    p_aktif_baru BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_target RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role != 'manajer' THEN
        RAISE EXCEPTION 'Akses ditolak: hanya Manajer yang berhak mengubah peran dan status akun.';
    END IF;

    IF p_peran_baru NOT IN ('penjualan', 'gudang', 'manajer') THEN
        RAISE EXCEPTION 'Peran pengguna tidak valid.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil pengguna target tidak ditemukan.';
    END IF;

    -- Jangan biarkan manajer menonaktifkan akunnya sendiri bila tidak ada manajer lain
    IF p_target_user_id = v_user_id AND p_aktif_baru IS FALSE THEN
        RAISE EXCEPTION 'Anda tidak dapat menonaktifkan akun Anda sendiri.';
    END IF;

    UPDATE public.profiles SET
        peran = p_peran_baru,
        aktif = p_aktif_baru
    WHERE id = p_target_user_id;

    -- Catat di Audit Log (BR-12)
    INSERT INTO public.audit_log (
        pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
    ) VALUES (
        v_user_id,
        'ubah_peran',
        'profiles',
        p_target_user_id,
        jsonb_build_object('peran', v_target.peran, 'aktif', v_target.aktif),
        jsonb_build_object('peran', p_peran_baru, 'aktif', p_aktif_baru)
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Pengaturan akun pengguna berhasil diperbarui.'
    );
END;
$$;

-- Berikan hak akses eksekusi ke authenticated untuk semua fungsi di public schema
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Refresh cache skema PostgREST agar fungsi baru langsung terdeteksi
NOTIFY pgrst, 'reload schema';

