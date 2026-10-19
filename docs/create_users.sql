-- ====================================================================
-- PEMBUATAN 3 AKUN UJI DI SUPABASE AUTH & PROFILES
-- Password untuk semua akun uji: sinarabadi123
-- ====================================================================

DO $$
DECLARE
    v_user_id_1 UUID := gen_random_uuid();
    v_user_id_2 UUID := gen_random_uuid();
    v_user_id_3 UUID := gen_random_uuid();
    v_encrypted_pw TEXT := extensions.crypt('sinarabadi123', extensions.gen_salt('bf'));
BEGIN
    -- 1. Hendra Wijaya (Peran: Manajer)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'hendra@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_user_id_1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'hendra@sinarabadi.test', v_encrypted_pw, now(),
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Hendra Wijaya","peran":"manajer"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_user_id_1, 'Hendra Wijaya', 'manajer', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'manajer', nama_lengkap = 'Hendra Wijaya', aktif = true;
    ELSE
        UPDATE public.profiles 
        SET peran = 'manajer', nama_lengkap = 'Hendra Wijaya', aktif = true 
        WHERE id = (SELECT id FROM auth.users WHERE email = 'hendra@sinarabadi.test');
    END IF;

    -- 2. Rina Kartika (Peran: Staf Penjualan)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rina@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_user_id_2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'rina@sinarabadi.test', v_encrypted_pw, now(),
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Rina Kartika","peran":"penjualan"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_user_id_2, 'Rina Kartika', 'penjualan', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'penjualan', nama_lengkap = 'Rina Kartika', aktif = true;
    ELSE
        UPDATE public.profiles 
        SET peran = 'penjualan', nama_lengkap = 'Rina Kartika', aktif = true 
        WHERE id = (SELECT id FROM auth.users WHERE email = 'rina@sinarabadi.test');
    END IF;

    -- 3. Budi Santoso (Peran: Staf Gudang)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'budi@sinarabadi.test') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            v_user_id_3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'budi@sinarabadi.test', v_encrypted_pw, now(),
            '{"provider":"email","providers":["email"]}',
            '{"nama_lengkap":"Budi Santoso","peran":"gudang"}',
            now(), now()
        );
        INSERT INTO public.profiles (id, nama_lengkap, peran, aktif)
        VALUES (v_user_id_3, 'Budi Santoso', 'gudang', true)
        ON CONFLICT (id) DO UPDATE SET peran = 'gudang', nama_lengkap = 'Budi Santoso', aktif = true;
    ELSE
        UPDATE public.profiles 
        SET peran = 'gudang', nama_lengkap = 'Budi Santoso', aktif = true 
        WHERE id = (SELECT id FROM auth.users WHERE email = 'budi@sinarabadi.test');
    END IF;
END $$;
