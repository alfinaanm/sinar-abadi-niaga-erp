'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { MENU_ITEMS, canAccessPath, formatPeran } from '@/lib/peran';
import { Package, LogOut, ShieldAlert, User } from 'lucide-react';

export default function AppClientShell({ children }: { children: React.ReactNode }) {
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

        {/* User Card Singkat */}
        <div className="p-4 mx-4 my-4 rounded-xl bg-slate-800/60 border border-slate-750 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">
              {profile.nama_lengkap}
            </p>
            <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50 uppercase tracking-wider">
              {formatPeran(profile.peran)}
            </span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Sidebar: Logout */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-950/20 transition-colors"
          >
            <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
            <span>Keluar Sistem</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
              Role: {formatPeran(profile.peran)}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Sistem Distribusi Sembako</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-slate-700">Database Aktif</span>
          </div>
        </header>

        {/* Content Page Body */}
        <main className="flex-1 overflow-y-auto p-8">
          {isAllowed ? (
            children
          ) : (
            <div className="max-w-md mx-auto my-16 bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Akses Ditolak
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Peran Anda sebagai <strong>{formatPeran(profile.peran)}</strong> tidak memiliki izin untuk membuka halaman ini.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition"
              >
                Kembali ke Dashboard
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
