import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MerchantPilot – AI copilot for PayPal merchants',
  description: 'Ask why your money moved, see it on a live AG Studio dashboard, and approve refunds, reminders and dispute actions that run through PayPal.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
