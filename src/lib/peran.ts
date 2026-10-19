import { PeranUser } from '@/types/database';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  Truck, 
  BarChart3, 
  Settings 
} from 'lucide-react';

export interface MenuItem {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  allowedRoles: PeranUser[];
}

export const MENU_ITEMS: MenuItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    allowedRoles: ['penjualan', 'gudang', 'manajer'],
  },
  {
    title: 'Barang dan Stok',
    href: '/barang',
    icon: Package,
    allowedRoles: ['penjualan', 'gudang', 'manajer'],
  },
  {
    title: 'Pelanggan',
    href: '/pelanggan',
    icon: Users,
    allowedRoles: ['penjualan', 'manajer'],
  },
  {
    title: 'Pesanan Jual',
    href: '/pesanan-jual',
    icon: ShoppingCart,
    allowedRoles: ['penjualan', 'gudang', 'manajer'],
  },
  {
    title: 'Pembelian',
    href: '/pembelian',
    icon: Truck,
    allowedRoles: ['gudang', 'manajer'],
  },
  {
    title: 'Laporan',
    href: '/laporan',
    icon: BarChart3,
    allowedRoles: ['manajer'],
  },
  {
    title: 'Pengaturan',
    href: '/pengaturan',
    icon: Settings,
    allowedRoles: ['manajer'],
  },
];

export function canAccessPath(path: string, role: PeranUser): boolean {
  if (path === '/dashboard' || path.startsWith('/dashboard/')) return true;
  if (path.startsWith('/barang')) return true;
  if (path.startsWith('/pelanggan')) return ['penjualan', 'manajer'].includes(role);
  if (path.startsWith('/pesanan-jual')) return true;
  if (path.startsWith('/pembelian')) return ['gudang', 'manajer'].includes(role);
  if (path.startsWith('/laporan')) return role === 'manajer';
  if (path.startsWith('/pengaturan')) return role === 'manajer';
  return true;
}

export function formatPeran(peran: PeranUser): string {
  switch (peran) {
    case 'manajer':
      return 'Manajer';
    case 'penjualan':
      return 'Staf Penjualan';
    case 'gudang':
      return 'Staf Gudang';
    default:
      return peran;
  }
}
