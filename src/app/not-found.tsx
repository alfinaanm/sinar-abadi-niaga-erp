import Link from 'next/link';
import { Package, ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
      <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 rounded-3xl p-8 text-center space-y-6 shadow-2xl backdrop-blur-md">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400">
          <Package className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-700 text-slate-300">
            Error 404
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-2">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Halaman yang Anda tuju tidak tersedia atau telah dipindahkan. Pastikan alamat URL yang Anda masukkan sudah benar.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Kembali ke Dashboard</span>
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Halaman Masuk</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
