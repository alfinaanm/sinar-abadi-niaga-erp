import React, { Suspense } from 'react';
import AppClientShell from '@/components/app-client-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-medium tracking-wide">
              Memuat sesi Sinar Abadi ERP...
            </p>
          </div>
        </div>
      }
    >
      <AppClientShell>{children}</AppClientShell>
    </Suspense>
  );
}
