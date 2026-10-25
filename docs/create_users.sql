-- ====================================================================
-- PEMULIHAN & PEMBUATAN 5 AKUN UJI RESMI DI SUPABASE AUTH & PROFILES
-- Sesuai Data_Contoh_ERP.xlsx, PRD_ERP.md, dan test-plan.md
-- Password untuk semua akun uji: Latihan#2026
-- ====================================================================

-- 1. Pastikan tabel public.profiles tersedia lengkap beserta fungsi & trigger
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
    ON CONFLICT (id) DO UPDATE 
    SET 
        nama_lengkap = EXCLUDED.nama_lengkap,
        peran = EXCLUDED.peran;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Konfigurasi Row Level Security (RLS) pada tabel profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Semua user aktif bisa melihat profiles" ON public.profiles;
DROP POLICY IF EXISTS "User bisa melihat profile sendiri atau profile aktif" ON public.profiles;
CREATE POLICY "User bisa melihat profile sendiri atau profile aktif"
    ON public.profiles FOR SELECT TO authenticated
    USING (id = auth.uid() OR aktif = true OR public.current_user_role() = 'manajer');

DROP POLICY IF EXISTS "Hanya Manajer yang bisa mengelola profiles" ON public.profiles;
CREATE POLICY "Hanya Manajer yang bisa mengelola profiles"
    ON public.profiles FOR ALL TO authenticated
    USING (public.current_user_role() = 'manajer');

-- 2. Buat atau Sinkronkan Akun di auth.users & public.profiles
DO $$
DECLARE
    v_uid_hendra UUID := gen_random_uuid();
    v_uid_rina UUID := gen_random_uuid();
    v_uid_dimas UUID := gen_random_uuid();
    v_uid_joko UUID := gen_random_uuid();
    v_uid_agus UUID := gen_random_uuid();
    v_uid_budi UUID := gen_random_uuid();
    v_encrypted_pw TEXT := extensions.crypt('Latihan#2026', extensions.gen_salt('bf'));
BEGIN
    -- 1. Hendra Wijaya (Manajer, Aktif)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'hendra@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_uid_hendra, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'hendra@sinarabadi.test', v_encrypted_pw, now(),
            '', '', '', '',
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Hendra Wijaya","peran":"manajer"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_hendra, 'Hendra Wijaya', 'manajer', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'manajer', nama_lengkap = 'Hendra Wijaya', aktif = true;
    ELSE
        SELECT id INTO v_uid_hendra FROM auth.users WHERE email = 'hendra@sinarabadi.test';
        UPDATE auth.users 
        SET encrypted_password = v_encrypted_pw,
            raw_user_meta_data = '{"nama_lengkap":"Hendra Wijaya","peran":"manajer"}'::jsonb,
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            updated_at = now()
        WHERE id = v_uid_hendra;

        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_hendra, 'Hendra Wijaya', 'manajer', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'manajer', nama_lengkap = 'Hendra Wijaya', aktif = true;
    END IF;

    -- 2. Rina Kartika (Staf Penjualan, Aktif)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rina@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_uid_rina, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'rina@sinarabadi.test', v_encrypted_pw, now(),
            '', '', '', '',
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Rina Kartika","peran":"penjualan"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_rina, 'Rina Kartika', 'penjualan', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'penjualan', nama_lengkap = 'Rina Kartika', aktif = true;
    ELSE
        SELECT id INTO v_uid_rina FROM auth.users WHERE email = 'rina@sinarabadi.test';
        UPDATE auth.users 
        SET encrypted_password = v_encrypted_pw,
            raw_user_meta_data = '{"nama_lengkap":"Rina Kartika","peran":"penjualan"}'::jsonb,
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            updated_at = now()
        WHERE id = v_uid_rina;

        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_rina, 'Rina Kartika', 'penjualan', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'penjualan', nama_lengkap = 'Rina Kartika', aktif = true;
    END IF;

    -- 3. Dimas Prasetyo (Staf Penjualan 2, Aktif)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dimas@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_uid_dimas, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'dimas@sinarabadi.test', v_encrypted_pw, now(),
            '', '', '', '',
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Dimas Prasetyo","peran":"penjualan"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_dimas, 'Dimas Prasetyo', 'penjualan', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'penjualan', nama_lengkap = 'Dimas Prasetyo', aktif = true;
    ELSE
        SELECT id INTO v_uid_dimas FROM auth.users WHERE email = 'dimas@sinarabadi.test';
        UPDATE auth.users 
        SET encrypted_password = v_encrypted_pw,
            raw_user_meta_data = '{"nama_lengkap":"Dimas Prasetyo","peran":"penjualan"}'::jsonb,
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            updated_at = now()
        WHERE id = v_uid_dimas;

        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_dimas, 'Dimas Prasetyo', 'penjualan', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'penjualan', nama_lengkap = 'Dimas Prasetyo', aktif = true;
    END IF;

    -- 4. Joko Susanto (Staf Gudang, Aktif)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'joko@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_uid_joko, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'joko@sinarabadi.test', v_encrypted_pw, now(),
            '', '', '', '',
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Joko Susanto","peran":"gudang"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_joko, 'Joko Susanto', 'gudang', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'gudang', nama_lengkap = 'Joko Susanto', aktif = true;
    ELSE
        SELECT id INTO v_uid_joko FROM auth.users WHERE email = 'joko@sinarabadi.test';
        UPDATE auth.users 
        SET encrypted_password = v_encrypted_pw,
            raw_user_meta_data = '{"nama_lengkap":"Joko Susanto","peran":"gudang"}'::jsonb,
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            updated_at = now()
        WHERE id = v_uid_joko;

        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_joko, 'Joko Susanto', 'gudang', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'gudang', nama_lengkap = 'Joko Susanto', aktif = true;
    END IF;

    -- 5. Agus Salim (Staf Penjualan, NONAKTIF -> Uji TC-02)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'agus@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_uid_agus, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'agus@sinarabadi.test', v_encrypted_pw, now(),
            '', '', '', '',
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Agus Salim","peran":"penjualan"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_agus, 'Agus Salim', 'penjualan', false)
        ON CONFLICT (id) DO UPDATE SET peran = 'penjualan', nama_lengkap = 'Agus Salim', aktif = false;
    ELSE
        SELECT id INTO v_uid_agus FROM auth.users WHERE email = 'agus@sinarabadi.test';
        UPDATE auth.users 
        SET encrypted_password = v_encrypted_pw,
            raw_user_meta_data = '{"nama_lengkap":"Agus Salim","peran":"penjualan"}'::jsonb,
            confirmation_token = COALESCE(confirmation_token, ''),
            recovery_token = COALESCE(recovery_token, ''),
            email_change_token_new = COALESCE(email_change_token_new, ''),
            email_change = COALESCE(email_change, ''),
            updated_at = now()
        WHERE id = v_uid_agus;

        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_uid_agus, 'Agus Salim', 'penjualan', false)
        ON CONFLICT (id) DO UPDATE SET peran = 'penjualan', nama_lengkap = 'Agus Salim', aktif = false;
    END IF;
      
    -- Sinkronisasi cadangan: pastikan seluruh akun di auth.users ada di profiles
    INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
    SELECT 
        u.id,
        COALESCE(u.raw_user_meta_data->>'nama_lengkap', split_part(u.email, '@', 1)),
        COALESCE(u.raw_user_meta_data->>'peran', 'penjualan'),
        true
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
    ON CONFLICT (id) DO NOTHING;
END $$;

-- 3. PERBAIKAN KRUSIAL: Sinkronkan auth.identities untuk semua akun
-- GoTrue Supabase mewajibkan entri di auth.identities agar bisa login email/password
DO $$
DECLARE
    v_has_provider_id BOOLEAN;
    v_has_identity_id BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) INTO v_has_provider_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'identity_id'
    ) INTO v_has_identity_id;

    IF v_has_provider_id AND v_has_identity_id THEN
        EXECUTE '
            INSERT INTO auth.identities (
                identity_id, id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
            )
            SELECT 
                gen_random_uuid(), u.id::text, u.id,
                jsonb_build_object(''sub'', u.id::text, ''email'', u.email, ''email_verified'', false, ''phone_verified'', false),
                ''email'', u.id::text, now(), now(), now()
            FROM auth.users u
            WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = ''email'')
        ';
    ELSIF v_has_identity_id THEN
        EXECUTE '
            INSERT INTO auth.identities (
                identity_id, id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            )
            SELECT 
                gen_random_uuid(), u.id::text, u.id,
                jsonb_build_object(''sub'', u.id::text, ''email'', u.email, ''email_verified'', false, ''phone_verified'', false),
                ''email'', now(), now(), now()
            FROM auth.users u
            WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = ''email'')
        ';
    ELSIF v_has_provider_id THEN
        EXECUTE '
            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
            )
            SELECT 
                u.id::text, u.id,
                jsonb_build_object(''sub'', u.id::text, ''email'', u.email, ''email_verified'', false, ''phone_verified'', false),
                ''email'', u.id::text, now(), now(), now()
            FROM auth.users u
            WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = ''email'')
        ';
    ELSE
        EXECUTE '
            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            )
            SELECT 
                u.id::text, u.id,
                jsonb_build_object(''sub'', u.id::text, ''email'', u.email, ''email_verified'', false, ''phone_verified'', false),
                ''email'', now(), now(), now()
            FROM auth.users u
            WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = ''email'')
        ';
    END IF;
END $$;

-- 4. Pulihkan Foreign Keys dari tabel lain ke public.profiles (jika sempat terputus)
DO $$
BEGIN
    -- Tabel pelanggan
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pelanggan') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'pelanggan_dibuat_oleh_fkey') THEN
            ALTER TABLE public.pelanggan ADD CONSTRAINT pelanggan_dibuat_oleh_fkey FOREIGN KEY (dibuat_oleh) REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- Tabel pesanan_jual
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pesanan_jual') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'pesanan_jual_dibuat_oleh_fkey') THEN
            ALTER TABLE public.pesanan_jual ADD CONSTRAINT pesanan_jual_dibuat_oleh_fkey FOREIGN KEY (dibuat_oleh) REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- Tabel pembelian
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pembelian') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'pembelian_diajukan_oleh_fkey') THEN
            ALTER TABLE public.pembelian ADD CONSTRAINT pembelian_diajukan_oleh_fkey FOREIGN KEY (diajukan_oleh) REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'pembelian_diputuskan_oleh_fkey') THEN
            ALTER TABLE public.pembelian ADD CONSTRAINT pembelian_diputuskan_oleh_fkey FOREIGN KEY (diputuskan_oleh) REFERENCES public.profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'pembelian_diterima_oleh_fkey') THEN
            ALTER TABLE public.pembelian ADD CONSTRAINT pembelian_diterima_oleh_fkey FOREIGN KEY (diterima_oleh) REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- Tabel mutasi_stok
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mutasi_stok') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'mutasi_stok_dibuat_oleh_fkey') THEN
            ALTER TABLE public.mutasi_stok ADD CONSTRAINT mutasi_stok_dibuat_oleh_fkey FOREIGN KEY (dibuat_oleh) REFERENCES public.profiles(id);
        END IF;
    END IF;

    -- Tabel audit_log
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_log') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'audit_log_pelaku_id_fkey') THEN
            ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pelaku_id_fkey FOREIGN KEY (pelaku_id) REFERENCES public.profiles(id);
        END IF;
    END IF;
END $$;
