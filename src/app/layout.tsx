import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Event Registration Manager',
  description: 'Human-in-the-loop event registration agent with capacity, waitlist, and approval controls.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body style={{ height: '100%' }}>
        <div className="app-shell" style={{ height: '100vh', overflow: 'hidden' }}>
          <Sidebar />
          <main className="main-content" style={{ overflowY: 'auto', height: '100vh', padding: 0 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
