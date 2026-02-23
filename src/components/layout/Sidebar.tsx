'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap, Bot, Puzzle, FileText, Wrench,
  Ticket, LayoutDashboard, List, BarChart3,
  Mountain, BookOpen, RefreshCw,
  ClipboardList, User, FileCode, Cpu,
  Building2, TestTube, Rocket, Container,
  Activity, Globe, Settings, Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Agent Management',
    items: [
      { label: 'Jobs', href: '/jobs', icon: Zap },
      { label: 'Agents', href: '/agents', icon: Bot },
      { label: 'Skills', href: '/skills', icon: Puzzle },
      { label: 'Templates', href: '/templates', icon: FileText },
      { label: 'MCPs & Tools', href: '/tools', icon: Wrench },
    ],
  },
  {
    label: 'Work Management',
    items: [
      { label: 'Tickets', href: '/tickets', icon: Ticket },
      { label: 'Sprint Board', href: '/sprint', icon: LayoutDashboard },
      { label: 'Epics', href: '/epics', icon: Mountain },
      { label: 'Stories', href: '/stories', icon: BookOpen },
      { label: 'Sprints', href: '/sprints', icon: RefreshCw },
      { label: 'Backlog', href: '/backlog', icon: List },
    ],
  },
  {
    label: 'SDLC',
    items: [
      { label: 'PM', href: '/pm', icon: BarChart3 },
      { label: 'Product Owner', href: '/po', icon: User },
      { label: 'Specs', href: '/specs', icon: ClipboardList },
      { label: 'Design', href: '/design', icon: FileCode },
      { label: 'Architecture', href: '/architecture', icon: Cpu },
      { label: 'Docs', href: '/docs', icon: BookOpen },
      { label: 'Testing', href: '/testing', icon: TestTube },
    ],
  },
  {
    label: 'Ops',
    items: [
      { label: 'CI/CD', href: '/cicd', icon: Rocket },
      { label: 'Containers', href: '/containers', icon: Container },
      { label: 'Monitoring', href: '/monitoring', icon: Activity },
      { label: 'Environments', href: '/environments', icon: Globe },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 border-r overflow-y-auto"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="p-4">
        <Link href="/" className="flex items-center gap-2 mb-6">
          <Building2 size={20} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Agility Flow
          </span>
        </Link>

        <Link href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs mb-4 transition-colors"
          style={{
            background: pathname === '/' ? 'var(--bg-tertiary)' : 'transparent',
            color: pathname === '/' ? 'var(--accent)' : 'var(--text-secondary)',
          }}>
          <Home size={14} />
          Dashboard
        </Link>

        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="px-3 py-1 text-[9px] font-semibold tracking-widest uppercase"
              style={{ color: 'var(--text-muted)' }}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors"
                  style={{
                    background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  }}>
                  <Icon size={14} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <Link href="/settings"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors"
            style={{
              background: pathname === '/settings' ? 'var(--bg-tertiary)' : 'transparent',
              color: pathname === '/settings' ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
            <Settings size={14} />
            Settings
          </Link>
        </div>
      </div>
    </aside>
  );
}
