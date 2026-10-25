'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/chat', icon: '💬', label: 'Chat Agent' },
  { href: '/events/new', icon: '➕', label: 'New Event' },
  { href: '/events', icon: '📅', label: 'All Events' },
  { href: '/approvals', icon: '✅', label: 'Approvals' },
  { href: '/test-runs', icon: '🧪', label: 'Test Runs' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🎫</div>
        <div className="sidebar-logo-text">
          ERM Agent
          <span>Event Registration Manager</span>
        </div>
      </div>

      <div className="nav-section-label">Navigation</div>

      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 'var(--space-3)' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>Agent v1.0</div>
          <div>Human-in-the-loop gate</div>
          <div>Synthetic data only</div>
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: '12px', padding: 'var(--space-2) var(--space-3)' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
