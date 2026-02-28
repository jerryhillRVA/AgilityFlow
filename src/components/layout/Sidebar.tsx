'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Zap, Bot, Puzzle, FileText, Wrench,
  Ticket, LayoutDashboard, List, BarChart3,
  Mountain, BookOpen, RefreshCw,
  ClipboardList, User, FileCode, Cpu,
  Building2, TestTube, Rocket, Container,
  Activity, Globe, Settings, Home, ChevronDown,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
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

const SIDEBAR_COLLAPSE_KEY = 'agilityflow-sidebar-collapsed';

function loadCollapsedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    if (stored) return JSON.parse(stored);
    // Default: all sections collapsed
    const defaults: Record<string, boolean> = {};
    for (const section of navSections) {
      defaults[section.label] = true;
    }
    return defaults;
  } catch {
    return {};
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsedState);

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(collapsed));
  }, [collapsed]);

  // Auto-expand section when navigating to a page within it
  useEffect(() => {
    for (const section of navSections) {
      if (collapsed[section.label] && section.items.some(item => pathname === item.href)) {
        setCollapsed(prev => ({ ...prev, [section.label]: false }));
        break;
      }
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSection(label: string) {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r overflow-y-auto"
      style={{
        borderColor: 'var(--glass-border)',
        background: 'var(--gradient-sidebar)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: '1px 0 12px rgba(0, 0, 0, 0.3)',
      }}>
      <div className="p-4">
        <Link href="/" className="flex items-center gap-2.5 mb-6">
          <Building2 size={22} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Agility Flow
          </span>
        </Link>

        <Link href="/"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm mb-4 sidebar-nav-item ${pathname === '/' ? 'nav-active-indicator' : ''}`}
          style={{
            background: pathname === '/' ? 'var(--bg-tertiary)' : 'transparent',
            color: pathname === '/' ? 'var(--accent)' : 'var(--text-secondary)',
            boxShadow: pathname === '/' ? 'var(--shadow-sm)' : 'none',
          }}>
          <Home size={16} />
          Dashboard
        </Link>

        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            <button
              onClick={() => toggleSection(section.label)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold tracking-widest uppercase cursor-pointer transition-colors duration-150"
              style={{ color: 'var(--text-muted)' }}
            >
              {section.label}
              <ChevronDown
                size={12}
                className={`transition-transform duration-150 ${collapsed[section.label] ? '-rotate-90' : ''}`}
              />
            </button>
            {!collapsed[section.label] && (
              <div className="animate-fade-in">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm sidebar-nav-item ${isActive ? 'nav-active-indicator' : ''}`}
                      style={{
                        background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                        boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                      }}>
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <Link href="/settings"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm sidebar-nav-item ${pathname === '/settings' ? 'nav-active-indicator' : ''}`}
            style={{
              background: pathname === '/settings' ? 'var(--bg-tertiary)' : 'transparent',
              color: pathname === '/settings' ? 'var(--accent)' : 'var(--text-secondary)',
              boxShadow: pathname === '/settings' ? 'var(--shadow-sm)' : 'none',
            }}>
            <Settings size={16} />
            Settings
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
