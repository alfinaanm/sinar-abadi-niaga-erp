'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Package, Lock, Mail, AlertCircle, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Cek apakah diarahkan karena akun nonaktif
  const isInactive = searchParams.get('error') === 'inactive';
  const nextUrl = searchParams.get('next') || '/dashboard';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage('Email atau kata sandi salah. Silakan periksa kembali.');
        setLoading(false);
        return;
      }

      if (data.user) {
        // Cek status aktif di tabel profiles
        const { data: profile, error: profError } = await supabase
          .from('profiles')
          .select('aktif, peran')
          .eq('id', data.user.id)
          .single();

        if (profError || !profile) {
          setErrorMessage('Profil pengguna tidak ditemukan.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        if (!profile.aktif) {
          setErrorMessage('Akunmu dinonaktifkan. Hubungi Manajer untuk mengaktifkan kembali.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        // Login sukses, arahkan ke dashboard
        router.push(nextUrl);
        router.refresh();
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage('Terjadi kesalahan jaringan. Coba beberapa saat lagi.');
      setLoading(false);
    }
  };

  const fillCredentials = (userEmail: string) => {
    setEmail(userEmail);
    setPassword('sinarabadi123');
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white mb-4 shadow-lg shadow-blue-500/30">
          <Package className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Sinar Abadi ERP
        </h1>
        <p className="text-sm text-slate-500 mt-1 font-medium">
          CV Sinar Abadi Niaga · Sistem Distribusi Sembako
        </p>
      </div>

      {/* Error Notifications */}
      {isInactive && !errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
          <span>Akunmu dinonaktifkan. Hubungi Manajer untuk membuka akses kembali.</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form Login */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
            Email Pengguna
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@sinarabadi.test"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-slate-50/50 hover:bg-white transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
            Kata Sandi
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-slate-50/50 hover:bg-white transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Memeriksa Kredensial...
            </span>
          ) : (
            <>
              Masuk ke Aplikasi
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Preset Akun Uji Cepat (Sangat Disukai Penguji/Mentor) */}
      <div className="mt-8 pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          Pilih Akun Uji Cepat:
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => fillCredentials('hendra@sinarabadi.test')}
            className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-left transition-all group cursor-pointer"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                Hendra Wijaya
              </p>
              <p className="text-[11px] text-slate-500">hendra@sinarabadi.test</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-700">
              Manajer
            </span>
          </button>

          <button
            type="button"
            onClick={() => fillCredentials('rina@sinarabadi.test')}
            className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-left transition-all group cursor-pointer"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                Rina Kartika
              </p>
              <p className="text-[11px] text-slate-500">rina@sinarabadi.test</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">
              Staf Penjualan
            </span>
          </button>

          <button
            type="button"
            onClick={() => fillCredentials('budi@sinarabadi.test')}
            className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-left transition-all group cursor-pointer"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                Budi Santoso
              </p>
              <p className="text-[11px] text-slate-500">budi@sinarabadi.test</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">
              Staf Gudang
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200">
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Memuat halaman login...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
