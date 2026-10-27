import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendLowStockAlertEmail, LowStockItem, EmailRecipient } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore inside Route Handler
            }
          },
        },
      }
    );

    // Ambil data user yang sedang login (jika pemicu manual)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let triggeredByName = 'Jadwal Otomatis (Cron)';
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('nama_lengkap, peran')
        .eq('id', user.id)
        .single();

      if (profile) {
        triggeredByName = `${profile.nama_lengkap} (${profile.peran})`;
      }
    }

    // 1. Ambil seluruh barang berstatus aktif yang stoknya <= stok_minimum
    // Menggunakan query RPC / direct query
    const { data: rawBarang, error: barangError } = await supabase
      .from('barang')
      .select('id, kode, nama, satuan, stok, stok_minimum')
      .eq('aktif', true)
      .order('stok', { ascending: true });

    if (barangError) {
      throw new Error(`Gagal membaca data barang: ${barangError.message}`);
    }

    const url = new URL(req.url);
    const isTestMode =
      url.searchParams.get('force') === 'true' || url.searchParams.get('test') === 'true';

    let lowStockItems: LowStockItem[] = (rawBarang || []).filter(
      (b) => b.stok <= b.stok_minimum
    );

    if (lowStockItems.length === 0) {
      if (isTestMode) {
        // Mode Pengujian/Pratinjau: Gunakan sampel barang untuk menampilkan format email
        lowStockItems = (rawBarang || []).slice(0, 3).map((b, idx) => ({
          ...b,
          stok: idx === 0 ? 0 : Math.max(1, Math.floor(b.stok_minimum * 0.5)),
        }));
        if (lowStockItems.length === 0) {
          lowStockItems = [
            { id: '1', kode: 'MGP-01', nama: 'Minyak Goreng Sawit 1L', satuan: 'Pouch', stok: 0, stok_minimum: 20 },
            { id: '2', kode: 'GUL-01', nama: 'Gula Pasir Kristal Putih 1kg', satuan: 'kg', stok: 4, stok_minimum: 15 },
          ];
        }
      } else {
        return NextResponse.json({
          success: true,
          message: 'Semua stok dalam batas aman (tidak ada barang di bawah stok minimum). Tidak ada email yang perlu dikirim.',
          itemCount: 0,
          items: [],
        });
      }
    }

    // 2. Ambil profil penerima (Manajer dan Staf Gudang aktif)
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, peran')
      .in('peran', ['manajer', 'gudang'])
      .eq('aktif', true);

    if (profileError) {
      throw new Error(`Gagal membaca penerima notifikasi: ${profileError.message}`);
    }

    // Mapping email default resmi sesuai PRD & data contoh jika auth email privat
    const defaultEmails: Record<string, string> = {
      'Hendra Wijaya': 'hendra@sinarabadi.test',
      'Agus Prasetyo': 'agus@sinarabadi.test',
      'Joko Susilo': 'joko@sinarabadi.test',
    };

    const recipients: EmailRecipient[] = (profiles || []).map((p) => ({
      nama: p.nama_lengkap,
      peran: p.peran,
      email:
        defaultEmails[p.nama_lengkap] ||
        `${p.nama_lengkap.toLowerCase().replace(/\s+/g, '.')}@sinarabadi.test`,
    }));

    // Tambahkan minimal penerima resmi jika profiles kosong di sesi testing
    if (recipients.length === 0) {
      recipients.push(
        { nama: 'Hendra Wijaya', peran: 'manajer', email: 'hendra@sinarabadi.test' },
        { nama: 'Agus Prasetyo', peran: 'gudang', email: 'agus@sinarabadi.test' }
      );
    }

    // 3. Kirim Email Notifikasi
    const result = await sendLowStockAlertEmail({
      recipients,
      items: lowStockItems,
      triggeredBy: triggeredByName,
    });

    return NextResponse.json({
      ...result,
      items: lowStockItems,
    });
  } catch (err: unknown) {
    console.error('Error pada endpoint notifikasi email:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Terjadi kesalahan sistem',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    // Hitung barang menipis saat ini
    const { data: barang } = await supabase
      .from('barang')
      .select('id, kode, nama, satuan, stok, stok_minimum')
      .eq('aktif', true);

    const lowStockItems = (barang || []).filter((b) => b.stok <= b.stok_minimum);

    const hasResend = !!(
      process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')
    );

    return NextResponse.json({
      service: 'Notifikasi Email Stok Menipis ERP',
      status: 'ready',
      mode: hasResend ? 'resend' : 'simulasi',
      lowStockCount: lowStockItems.length,
      sampleItems: lowStockItems.slice(0, 5),
      targetRoles: ['manajer', 'gudang'],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Gagal memeriksa status notifikasi',
      },
      { status: 500 }
    );
  }
}
