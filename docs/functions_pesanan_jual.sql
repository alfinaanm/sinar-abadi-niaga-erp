-- ====================================================================
-- FUNGSI & PROSEDUR TERSIMPAN: ALUR STATUS PESANAN JUAL & PENCEGAHAN RACE CONDITION
-- CV Sinar Abadi Niaga (Mematuhi BR-01 s/d BR-08, BR-11, BR-12)
-- ====================================================================

-- 1. SECURE VIEW UNTUK ITEM PESANAN JUAL (HPP Hanya Terlihat oleh Manajer)
CREATE OR REPLACE VIEW public.v_item_pesanan_jual
WITH (security_invoker = true) AS
SELECT 
    i.id,
    i.pesanan_jual_id,
    i.barang_id,
    i.jumlah,
    i.harga_satuan,
    i.diskon_persen,
    i.subtotal,
    CASE 
        WHEN public.current_user_role() = 'manajer' THEN i.hpp_satuan 
        ELSE NULL 
    END AS hpp_satuan
FROM public.item_pesanan_jual i;

-- 2. GENERATOR NOMOR PESANAN JUAL (SO-00001, SO-00002, ...)
CREATE OR REPLACE FUNCTION public.generate_nomor_pesanan_jual()
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
    FROM public.pesanan_jual
    WHERE nomor ~ '^SO-[0-9]+$';

    v_nomor := 'SO-' || LPAD(v_next_num::TEXT, 5, '0');
    RETURN v_nomor;
END;
$$;

-- 3. FUNGSI KONFIRMASI PESANAN JUAL (ATOMIC & CONCURRENCY GUARD DENGAN FOR UPDATE)
CREATE OR REPLACE FUNCTION public.konfirmasi_pesanan_jual(p_pesanan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_pj RECORD;
    v_pelanggan RECORD;
    v_piutang_berjalan NUMERIC(14,0);
    v_item RECORD;
    v_item_count INT;
    v_stok INT;
    v_hpp NUMERIC(14,0);
    v_nama_barang TEXT;
    v_aktif BOOLEAN;
    v_stok_baru INT;
    v_has_overdue BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Profil pengguna tidak valid atau tidak aktif.';
    END IF;

    -- Ambil data pesanan jual dan kunci barisnya
    SELECT * INTO v_pj FROM public.pesanan_jual WHERE id = p_pesanan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan jual tidak ditemukan.';
    END IF;

    IF v_pj.status != 'draf' THEN
        RAISE EXCEPTION 'Hanya pesanan berstatus draf yang dapat dikonfirmasi. Status saat ini: %.', v_pj.status;
    END IF;

    -- BR-07: Staf Penjualan hanya boleh konfirmasi draf miliknya
    IF v_role = 'penjualan' AND v_pj.dibuat_oleh != v_user_id THEN
        RAISE EXCEPTION 'Staf Penjualan hanya boleh mengonfirmasi pesanan yang dibuat sendiri.';
    END IF;

    -- Validasi jumlah baris (1 sampai 20 baris) (BR-02)
    SELECT COUNT(*) INTO v_item_count FROM public.item_pesanan_jual WHERE pesanan_jual_id = p_pesanan_id;
    IF v_item_count < 1 OR v_item_count > 20 THEN
        RAISE EXCEPTION 'Pesanan jual harus berisi antara 1 sampai 20 baris barang (saat ini: % baris).', v_item_count;
    END IF;

    -- Ambil data pelanggan (BR-02: harus aktif)
    SELECT * INTO v_pelanggan FROM public.pelanggan WHERE id = v_pj.pelanggan_id;
    IF NOT FOUND OR NOT v_pelanggan.aktif THEN
        RAISE EXCEPTION 'Pelanggan tidak ditemukan atau berstatus tidak aktif.';
    END IF;

    -- BR-05: Cek tagihan lewat jatuh tempo pada pesanan yang sudah dikirim
    SELECT EXISTS (
        SELECT 1 FROM public.pesanan_jual
        WHERE pelanggan_id = v_pj.pelanggan_id
          AND status = 'dikirim'
          AND jatuh_tempo < CURRENT_DATE
    ) INTO v_has_overdue;

    IF v_has_overdue THEN
        RAISE EXCEPTION 'Pelanggan memiliki pesanan berstatus dikirim yang sudah lewat jatuh tempo. Pelunasan diperlukan sebelum pesanan baru dapat dikonfirmasi.';
    END IF;

    -- BR-05: Cek batas kredit (piutang berjalan = dikonfirmasi + dikirim)
    SELECT COALESCE(SUM(total), 0) INTO v_piutang_berjalan
    FROM public.pesanan_jual
    WHERE pelanggan_id = v_pj.pelanggan_id
      AND status IN ('dikonfirmasi', 'dikirim');

    IF (v_piutang_berjalan + v_pj.total) > v_pelanggan.batas_kredit THEN
        RAISE EXCEPTION 'Total piutang berjalan (Rp%) ditambah pesanan baru (Rp%) melebihi batas kredit pelanggan (Rp%).',
            to_char(v_piutang_berjalan, 'FM999,999,999,999'),
            to_char(v_pj.total, 'FM999,999,999,999'),
            to_char(v_pelanggan.batas_kredit, 'FM999,999,999,999');
    END IF;

    -- Validasi tiap baris barang (BR-03, BR-04, BR-06)
    -- Lakukan lock FOR UPDATE pada tabel barang untuk mencegah race condition
    FOR v_item IN 
        SELECT ipj.*, b.nama AS nama_barang
        FROM public.item_pesanan_jual ipj
        JOIN public.barang b ON b.id = ipj.barang_id
        WHERE ipj.pesanan_jual_id = p_pesanan_id
        ORDER BY ipj.id
    LOOP
        -- Lock baris barang
        SELECT b.stok, b.harga_pokok, b.nama, b.aktif
        INTO v_stok, v_hpp, v_nama_barang, v_aktif
        FROM public.barang b
        WHERE b.id = v_item.barang_id
        FOR UPDATE;

        IF NOT v_aktif THEN
            RAISE EXCEPTION 'Barang "%" tidak aktif.', v_nama_barang;
        END IF;

        -- BR-03: Diskon maksimal
        IF v_role = 'penjualan' AND v_item.diskon_persen > 10 THEN
            RAISE EXCEPTION 'Staf Penjualan hanya boleh memberi diskon maksimal 10%% pada barang "%".', v_nama_barang;
        END IF;
        IF v_item.diskon_persen > 25 THEN
            RAISE EXCEPTION 'Diskon pada barang "%" melebihi batas maksimal 25%%.', v_nama_barang;
        END IF;

        -- BR-04: Subtotal di bawah HPP
        IF v_item.subtotal < (v_hpp * v_item.jumlah) THEN
            IF v_role != 'manajer' THEN
                RAISE EXCEPTION 'Harga di bawah batas, minta persetujuan Manajer';
            END IF;
        END IF;

        -- BR-06: Cek kecukupan stok
        IF v_stok < v_item.jumlah THEN
            RAISE EXCEPTION 'Stok barang "%" tidak mencukupi (tersedia: %, dibutuhkan: %).', v_nama_barang, v_stok, v_item.jumlah;
        END IF;
    END LOOP;

    -- Bila semua lolos, kurangi stok dan catat mutasi stok secara atomik
    FOR v_item IN 
        SELECT ipj.* 
        FROM public.item_pesanan_jual ipj
        WHERE ipj.pesanan_jual_id = p_pesanan_id
    LOOP
        SELECT stok, harga_pokok INTO v_stok, v_hpp 
        FROM public.barang 
        WHERE id = v_item.barang_id FOR UPDATE;

        v_stok_baru := v_stok - v_item.jumlah;

        -- Update stok barang
        UPDATE public.barang
        SET stok = v_stok_baru,
            diperbarui_pada = now()
        WHERE id = v_item.barang_id;

        -- Catat mutasi stok (BR-11)
        INSERT INTO public.mutasi_stok (
            barang_id, jenis, jumlah, stok_sesudah, nomor_dokumen, alasan, dibuat_oleh
        ) VALUES (
            v_item.barang_id,
            'keluar',
            -v_item.jumlah,
            v_stok_baru,
            v_pj.nomor,
            'Pengurangan stok konfirmasi pesanan ' || v_pj.nomor,
            v_user_id
        );

        -- Simpan HPP historis saat konfirmasi pada item_pesanan_jual
        UPDATE public.item_pesanan_jual
        SET hpp_satuan = v_hpp
        WHERE id = v_item.id;
    END LOOP;

    -- Update status pesanan jual
    UPDATE public.pesanan_jual
    SET status = 'dikonfirmasi',
        dikonfirmasi_pada = now()
    WHERE id = p_pesanan_id;

    RETURN jsonb_build_object(
        'success', true,
        'nomor', v_pj.nomor,
        'status', 'dikonfirmasi'
    );
END;
$$;

-- 4. FUNGSI PEMBATALAN PESANAN JUAL (DRAF / DIKONFIRMASI DENGAN PENGEMBALIAN STOK)
CREATE OR REPLACE FUNCTION public.batalkan_pesanan_jual(p_pesanan_id UUID, p_alasan TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_pj RECORD;
    v_item RECORD;
    v_stok INT;
    v_stok_baru INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Profil pengguna tidak valid atau tidak aktif.';
    END IF;

    SELECT * INTO v_pj FROM public.pesanan_jual WHERE id = p_pesanan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan jual tidak ditemukan.';
    END IF;

    IF v_pj.status = 'dibatalkan' THEN
        RAISE EXCEPTION 'Pesanan sudah dibatalkan sebelumnya.';
    ELSIF v_pj.status IN ('dikirim', 'lunas') THEN
        RAISE EXCEPTION 'Pesanan berstatus % tidak dapat dibatalkan (BR-08).', v_pj.status;
    END IF;

    -- PEMBATALAN DRAF
    IF v_pj.status = 'draf' THEN
        IF v_role = 'penjualan' AND v_pj.dibuat_oleh != v_user_id THEN
            RAISE EXCEPTION 'Staf Penjualan hanya boleh membatalkan draf yang dibuat sendiri.';
        END IF;

        UPDATE public.pesanan_jual
        SET status = 'dibatalkan',
            dibatalkan_pada = now(),
            alasan_batal = COALESCE(p_alasan, 'Draf dibatalkan oleh pengguna')
        WHERE id = p_pesanan_id;

        RETURN jsonb_build_object('success', true, 'status', 'dibatalkan');
    END IF;

    -- PEMBATALAN DIKONFIRMASI (BR-08)
    IF v_pj.status = 'dikonfirmasi' THEN
        IF v_role != 'manajer' THEN
            RAISE EXCEPTION 'Pesanan yang sudah dikonfirmasi hanya boleh dibatalkan oleh Manajer (BR-08).';
        END IF;

        IF p_alasan IS NULL OR char_length(trim(p_alasan)) < 10 THEN
            RAISE EXCEPTION 'Alasan pembatalan harus diisi minimal 10 karakter (BR-08).';
        END IF;

        -- Kembalikan stok semua barang secara atomik
        FOR v_item IN 
            SELECT * FROM public.item_pesanan_jual WHERE pesanan_jual_id = p_pesanan_id
        LOOP
            SELECT stok INTO v_stok FROM public.barang WHERE id = v_item.barang_id FOR UPDATE;
            v_stok_baru := v_stok + v_item.jumlah;

            UPDATE public.barang 
            SET stok = v_stok_baru,
                diperbarui_pada = now()
            WHERE id = v_item.barang_id;

            -- Catat kartu stok (BR-11)
            INSERT INTO public.mutasi_stok (
                barang_id, jenis, jumlah, stok_sesudah, nomor_dokumen, alasan, dibuat_oleh
            ) VALUES (
                v_item.barang_id,
                'batal',
                v_item.jumlah,
                v_stok_baru,
                v_pj.nomor,
                'Pengembalian stok pembatalan pesanan: ' || trim(p_alasan),
                v_user_id
            );
        END LOOP;

        UPDATE public.pesanan_jual
        SET status = 'dibatalkan',
            dibatalkan_pada = now(),
            alasan_batal = trim(p_alasan)
        WHERE id = p_pesanan_id;

        -- Catat ke audit log (BR-12)
        INSERT INTO public.audit_log (
            pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
        ) VALUES (
            v_user_id,
            'BATALKAN_PESANAN_DIKONFIRMASI',
            'pesanan_jual',
            p_pesanan_id,
            jsonb_build_object('status', 'dikonfirmasi', 'nomor', v_pj.nomor),
            jsonb_build_object('status', 'dibatalkan', 'alasan_batal', trim(p_alasan))
        );

        RETURN jsonb_build_object('success', true, 'status', 'dibatalkan');
    END IF;

    RAISE EXCEPTION 'Transisi pembatalan tidak diizinkan.';
END;
$$;

-- 5. FUNGSI PENGIRIMAN PESANAN JUAL (DIKONFIRMASI -> DIKIRIM)
CREATE OR REPLACE FUNCTION public.kirim_pesanan_jual(p_pesanan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_pj RECORD;
    v_pelanggan RECORD;
    v_jatuh_tempo DATE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role NOT IN ('gudang', 'manajer') THEN
        RAISE EXCEPTION 'Hanya Staf Gudang dan Manajer yang boleh mencatat pengiriman pesanan (BR-07).';
    END IF;

    SELECT * INTO v_pj FROM public.pesanan_jual WHERE id = p_pesanan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan jual tidak ditemukan.';
    END IF;

    IF v_pj.status != 'dikonfirmasi' THEN
        RAISE EXCEPTION 'Hanya pesanan berstatus dikonfirmasi yang dapat dikirim. Status saat ini: %.', v_pj.status;
    END IF;

    -- Hitung jatuh tempo: tanggal kirim hari ini + termin bayar pelanggan (BR-07)
    SELECT termin_hari INTO v_pelanggan FROM public.pelanggan WHERE id = v_pj.pelanggan_id;
    v_jatuh_tempo := (CURRENT_DATE + (COALESCE(v_pelanggan.termin_hari, 0) || ' days')::INTERVAL)::DATE;

    UPDATE public.pesanan_jual
    SET status = 'dikirim',
        dikirim_pada = now(),
        jatuh_tempo = v_jatuh_tempo
    WHERE id = p_pesanan_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'dikirim',
        'jatuh_tempo', v_jatuh_tempo
    );
END;
$$;

-- 6. FUNGSI PELUNASAN PESANAN JUAL (DIKIRIM -> LUNAS)
CREATE OR REPLACE FUNCTION public.lunasi_pesanan_jual(p_pesanan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_pj RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: pengguna belum masuk.';
    END IF;

    SELECT peran INTO v_role FROM public.profiles WHERE id = v_user_id AND aktif = true;
    IF v_role != 'manajer' THEN
        RAISE EXCEPTION 'Hanya Manajer yang berhak mencatat pelunasan pesanan (BR-07).';
    END IF;

    SELECT * INTO v_pj FROM public.pesanan_jual WHERE id = p_pesanan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan jual tidak ditemukan.';
    END IF;

    IF v_pj.status != 'dikirim' THEN
        RAISE EXCEPTION 'Hanya pesanan berstatus dikirim yang dapat dilunasi. Status saat ini: %.', v_pj.status;
    END IF;

    UPDATE public.pesanan_jual
    SET status = 'lunas',
        dilunasi_pada = now()
    WHERE id = p_pesanan_id;

    -- Catat ke audit log (BR-12)
    INSERT INTO public.audit_log (
        pelaku_id, aksi, nama_tabel, data_id, nilai_lama, nilai_baru
    ) VALUES (
        v_user_id,
        'PELUNASAN_PESANAN',
        'pesanan_jual',
        p_pesanan_id,
        jsonb_build_object('status', 'dikirim', 'nomor', v_pj.nomor, 'total', v_pj.total),
        jsonb_build_object('status', 'lunas', 'dilunasi_pada', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'lunas'
    );
END;
$$;

-- 7. TRIGGER GUARD STATUS PESANAN JUAL
CREATE OR REPLACE FUNCTION public.guard_pesanan_jual_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        -- Pesanan selain draf tidak boleh diedit total atau pelanggannya
        IF OLD.status != 'draf' AND (OLD.total != NEW.total OR OLD.pelanggan_id != NEW.pelanggan_id) THEN
            RAISE EXCEPTION 'Data pesanan tidak boleh diubah jika status bukan draf (BR-02).';
        END IF;
        RETURN NEW;
    END IF;

    -- Validasi alur state machine yang kaku (Bab 6)
    IF OLD.status = 'draf' AND NEW.status NOT IN ('dikonfirmasi', 'dibatalkan') THEN
        RAISE EXCEPTION 'Transisi tidak sah: Draf hanya boleh berubah ke Dikonfirmasi atau Dibatalkan.';
    ELSIF OLD.status = 'dikonfirmasi' AND NEW.status NOT IN ('dikirim', 'dibatalkan') THEN
        RAISE EXCEPTION 'Transisi tidak sah: Dikonfirmasi hanya boleh berubah ke Dikirim atau Dibatalkan.';
    ELSIF OLD.status = 'dikirim' AND NEW.status != 'lunas' THEN
        RAISE EXCEPTION 'Transisi tidak sah: Dikirim hanya boleh berubah ke Lunas.';
    ELSIF OLD.status IN ('lunas', 'dibatalkan') THEN
        RAISE EXCEPTION 'Transisi tidak sah: Status % adalah status akhir dan tidak dapat diubah lagi.', OLD.status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pesanan_jual_status ON public.pesanan_jual;
CREATE TRIGGER trg_guard_pesanan_jual_status
    BEFORE UPDATE ON public.pesanan_jual
    FOR EACH ROW EXECUTE FUNCTION public.guard_pesanan_jual_status();
