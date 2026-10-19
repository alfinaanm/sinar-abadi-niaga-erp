'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { MENU_ITEMS, canAccessPath, formatPeran } from '@/lib/peran';
import { Package, LogOut, ShieldAlert, User } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // 1. Tampilan saat data sesi masih dimuat
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium tracking-wide">
            Memuat sesi Sinar Abadi ERP...
          </p>
        </div>
      </div>
    );
  }

  // 2. Jika belum login, dialihkan ke /login
  if (!user || !profile) {
    if (typeof window !== 'undefined') {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
    }
    return null;
  }

  // 3. Pemeriksaan hak akses peran di halaman ini
  const isAllowed = canAccessPath(pathname, profile.peran);

  // Filter menu yang berhak dilihat peran saat ini
  const visibleMenuItems = MENU_ITEMS.filter((item) =>
    item.allowedRoles.includes(profile.peran)
  );

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Sidebar Navigasi Kiri (Sesuai Wireframe) */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col flex-shrink-0 border-r border-slate-800">
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-tight">
              Sinar Abadi ERP
            </h1>
            <p className="text-xs text-slate-400 font-medium">CV Sinar Abadi Niaga</p>
          </div>
        </div>

        {/* Menu Navigasi Berdasarkan Peran */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Info & Tombol Keluar (Sesuai Wireframe) */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-700">
              <User className="w-5 h-5" />
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {profile.nama_lengkap}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-slate-400 font-medium truncate">
                  {formatPeran(profile.peran)}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Konten Halaman Utama */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {!isAllowed ? (
          // Layar Akses Ditolak jika peran tidak berhak
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">
                Akses Ditolak
              </h2>
              <p className="text-sm text-slate-600 mb-6">
                Halaman ini tidak tersedia untuk peran{' '}
                <span className="font-semibold text-slate-800">
                  {formatPeran(profile.peran)}
                </span>
                .
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all"
              >
                Kembali ke Dashboard
              </Link>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
