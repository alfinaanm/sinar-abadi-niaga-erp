// Utilitas Pemformatan Angka, Tanggal, dan Status untuk CV Sinar Abadi Niaga

export function formatRupiah(nilai: number | null | undefined): string {
  if (nilai === null || nilai === undefined || isNaN(nilai)) return 'Rp0';
  const format = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(nilai);
  // Format sesuai PRD 10.5: Rp1.250.000 (tanpa spasi setelah Rp jika memungkinkan, atau rapi)
  return format.replace(/\s+/g, '');
}

export function formatTanggal(tanggal: string | Date | null | undefined): string {
  if (!tanggal) return '-';
  const d = typeof tanggal === 'string' ? new Date(tanggal) : tanggal;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatTanggalWaktu(tanggal: string | Date | null | undefined): string {
  if (!tanggal) return '-';
  const d = typeof tanggal === 'string' ? new Date(tanggal) : tanggal;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export interface StatusBadgeInfo {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export function getStatusPesananBadge(status: string): StatusBadgeInfo {
  switch (status) {
    case 'draf':
      return {
        label: 'Draf',
        bgClass: 'bg-zinc-100 dark:bg-zinc-800',
        textClass: 'text-zinc-700 dark:text-zinc-300',
        borderClass: 'border-zinc-300 dark:border-zinc-700',
      };
    case 'dikonfirmasi':
      return {
        label: 'Dikonfirmasi',
        bgClass: 'bg-blue-50 dark:bg-blue-950/40',
        textClass: 'text-blue-700 dark:text-blue-300',
        borderClass: 'border-blue-200 dark:border-blue-800',
      };
    case 'dikirim':
      return {
        label: 'Dikirim',
        bgClass: 'bg-amber-50 dark:bg-amber-950/40',
        textClass: 'text-amber-700 dark:text-amber-300',
        borderClass: 'border-amber-200 dark:border-amber-800',
      };
    case 'lunas':
      return {
        label: 'Lunas',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
        textClass: 'text-emerald-700 dark:text-emerald-300',
        borderClass: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'dibatalkan':
      return {
        label: 'Dibatalkan',
        bgClass: 'bg-rose-50 dark:bg-rose-950/40',
        textClass: 'text-rose-700 dark:text-rose-300',
        borderClass: 'border-rose-200 dark:border-rose-800',
      };
    default:
      return {
        label: status,
        bgClass: 'bg-zinc-100 dark:bg-zinc-800',
        textClass: 'text-zinc-700 dark:text-zinc-300',
        borderClass: 'border-zinc-300 dark:border-zinc-700',
      };
  }
}

export function getStatusPembelianBadge(status: string): StatusBadgeInfo {
  switch (status) {
    case 'diajukan':
      return {
        label: 'Diajukan',
        bgClass: 'bg-amber-50 dark:bg-amber-950/40',
        textClass: 'text-amber-700 dark:text-amber-300',
        borderClass: 'border-amber-200 dark:border-amber-800',
      };
    case 'disetujui':
      return {
        label: 'Disetujui',
        bgClass: 'bg-blue-50 dark:bg-blue-950/40',
        textClass: 'text-blue-700 dark:text-blue-300',
        borderClass: 'border-blue-200 dark:border-blue-800',
      };
    case 'diterima':
      return {
        label: 'Diterima',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
        textClass: 'text-emerald-700 dark:text-emerald-300',
        borderClass: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'ditolak':
      return {
        label: 'Ditolak',
        bgClass: 'bg-rose-50 dark:bg-rose-950/40',
        textClass: 'text-rose-700 dark:text-rose-300',
        borderClass: 'border-rose-200 dark:border-rose-800',
      };
    case 'dibatalkan':
      return {
        label: 'Dibatalkan',
        bgClass: 'bg-zinc-100 dark:bg-zinc-800',
        textClass: 'text-zinc-700 dark:text-zinc-300',
        borderClass: 'border-zinc-300 dark:border-zinc-700',
      };
    default:
      return {
        label: status,
        bgClass: 'bg-zinc-100 dark:bg-zinc-800',
        textClass: 'text-zinc-700 dark:text-zinc-300',
        borderClass: 'border-zinc-300 dark:border-zinc-700',
      };
  }
}

/**
 * Utilitas untuk mengunduh data array object menjadi file CSV
 */
export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = cell === null || cell === undefined ? '' : String(cell);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
