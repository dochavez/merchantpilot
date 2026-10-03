import type { Metadata } from 'next';
import DashboardShell from '@/components/DashboardShell';

export const metadata: Metadata = { title: 'Dashboard · MerchantPilot' };

export default function DashboardPage() {
  return <DashboardShell />;
}
