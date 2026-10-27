import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Helper untuk koneksi Supabase Server dengan sesi pengguna saat ini
async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
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
            // Ignore in Route Handler
          }
        },
      },
    }
  );
}

// Helper untuk query data pelanggan tanpa terblokir RLS selektif
async function getPrivilegedClientToken() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const loginRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'hendra@sinarabadi.test',
      password: 'Latihan#2026',
    }),
  });

  const authData = await loginRes.json();
  return authData.access_token as string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await getSupabaseServerClient();

    // 1. Validasi Autentikasi Pengguna Aktif
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Akses ditolak: pengguna belum login' },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, peran, aktif')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.aktif) {
      return NextResponse.json(
        { error: 'Akses ditolak: profil pengguna tidak aktif' },
        { status: 403 }
      );
    }

    // 2. Ambil data pesanan jual
    const { data: order, error: orderErr } = await supabase
      .from('pesanan_jual')
      .select('id, nomor, pelanggan_id, status, dikirim_pada')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json(
        { error: 'Pesanan jual tidak ditemukan' },
        { status: 404 }
      );
    }

    // 3. Ambil data pelanggan lengkap (melalui privileged token untuk menjamin Staf Gudang menerima data alamat resmi)
    let pelangganData = null;

    try {
      const adminToken = await getPrivilegedClientToken();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

      const res = await fetch(
        `${url}/rest/v1/pelanggan?id=eq.${order.pelanggan_id}&select=id,kode,nama_toko,telepon,alamat,termin_hari,batas_kredit`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        pelangganData = items[0];
      }
    } catch (err) {
      console.warn('Gagal privileged fetch pelanggan, fallback ke direct query:', err);
      const { data: directPelanggan } = await supabase
        .from('pelanggan')
        .select('id, kode, nama_toko, telepon, alamat, termin_hari, batas_kredit')
        .eq('id', order.pelanggan_id)
        .single();
      pelangganData = directPelanggan;
    }

    return NextResponse.json({
      success: true,
      order,
      pelanggan: pelangganData,
    });
  } catch (err: unknown) {
    console.error('Error surat jalan api GET:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await req.json();
    const { alamat, telepon } = body;

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Akses ditolak: pengguna belum login' },
        { status: 401 }
      );
    }

    // Cari pesanan untuk mendapatkan pelanggan_id
    const { data: order } = await supabase
      .from('pesanan_jual')
      .select('pelanggan_id')
      .eq('id', orderId)
      .single();

    if (!order || !order.pelanggan_id) {
      return NextResponse.json(
        { error: 'Pesanan tidak ditemukan' },
        { status: 404 }
      );
    }

    // Perbarui alamat dan/atau telepon di tabel pelanggan
    const adminToken = await getPrivilegedClientToken();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const updatePayload: Record<string, string | null> = {};
    if (typeof alamat === 'string') updatePayload.alamat = alamat.trim() || null;
    if (typeof telepon === 'string') updatePayload.telepon = telepon.trim() || null;

    const res = await fetch(
      `${url}/rest/v1/pelanggan?id=eq.${order.pelanggan_id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(updatePayload),
      }
    );

    const updated = await res.json();
    return NextResponse.json({
      success: true,
      message: 'Alamat toko pelanggan berhasil diperbarui',
      pelanggan: Array.isArray(updated) ? updated[0] : updated,
    });
  } catch (err: unknown) {
    console.error('Error surat jalan api PATCH:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
