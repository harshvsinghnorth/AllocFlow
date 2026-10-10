import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  Boxes,
  ClipboardList,
  DoorClosed,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  X,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { ROLE_LABELS, useAuth } from '../lib/auth';
import type { AppNotification, UserRole } from '../lib/types';
import { formatRelative } from '../lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

/**
 * The navigation is the visible half of the RBAC model: a role only ever sees
 * the destinations it is permitted to reach. The server enforces the same
 * matrix independently, so hiding a link is a usability measure, not the
 * security boundary.
 */
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['STUDENT', 'WARDEN', 'SUPERVISOR', 'SECURITY', 'MESS_STAFF', 'ADMIN'] },
  { to: '/explorer', label: 'Hostel Explorer', icon: Boxes, roles: ['STUDENT', 'WARDEN', 'SUPERVISOR', 'ADMIN'] },
  { to: '/my-room', label: 'My Room', icon: DoorClosed, roles: ['STUDENT'] },
  { to: '/requests', label: 'Housekeeping & Repairs', icon: ClipboardList, roles: ['STUDENT', 'WARDEN', 'SUPERVISOR', 'ADMIN'] },
  { to: '/gatepass', label: 'Gatepass', icon: ShieldCheck, roles: ['STUDENT', 'WARDEN', 'ADMIN'] },
  { to: '/verify', label: 'Gate Verification', icon: ScanLine, roles: ['SECURITY', 'ADMIN'] },
  { to: '/electricity', label: 'Electricity', icon: Zap, roles: ['STUDENT', 'WARDEN', 'SUPERVISOR', 'ADMIN'] },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, roles: ['STUDENT', 'WARDEN', 'SUPERVISOR', 'SECURITY', 'MESS_STAFF', 'ADMIN'] },
  { to: '/mess', label: 'Mess', icon: UtensilsCrossed, roles: ['STUDENT', 'MESS_STAFF', 'WARDEN', 'SUPERVISOR', 'ADMIN'] },
  { to: '/raids', label: 'Inspections', icon: Sparkles, roles: ['WARDEN', 'SUPERVISOR', 'ADMIN'] },
  { to: '/allocate', label: 'Allocation Desk', icon: Building2, roles: ['WARDEN', 'SUPERVISOR', 'ADMIN'] },
];

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: AppNotification[]; unread: number }>('/notifications'),
    // Alerts are the one thing users expect to arrive without a reload.
    refetchInterval: 45_000,
  });

  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        className="btn-ghost relative p-2"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="card absolute right-0 z-40 mt-2 w-80 animate-fade-in overflow-hidden p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-200">Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-300 hover:text-brand-200"
                  onClick={() => markAll.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {data?.items.length ? (
                data.items.map((n) => (
                  <div
                    key={n.id}
                    className={clsx(
                      'border-b border-white/[0.04] px-4 py-3 last:border-0',
                      !n.isRead && 'bg-brand-500/[0.06]',
                    )}
                  >
                    <p className="text-sm font-medium text-slate-200">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{n.body}</p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {formatRelative(n.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);

  // A route change should always dismiss the mobile drawer.
  useEffect(() => setMobileNav(false), [location.pathname]);

  if (!user) return null;
  const items = NAV.filter((i) => i.roles.includes(user.role));

  const navList = (
    <nav className="space-y-1">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.07] bg-surface-1/50 p-4 backdrop-blur lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg">
            <Boxes className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-base font-extrabold leading-none tracking-tight text-white">
              AllocFlow
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Hostel Management</p>
          </div>
        </div>
        {navList}
        <div className="mt-auto border-t border-white/[0.07] pt-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-semibold text-slate-200">{user.name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            type="button"
            className="nav-link w-full"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------- mobile drawer ---------- */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileNav(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slide-in flex-col border-r border-white/10 bg-surface-1 p-4">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600">
                  <Boxes className="h-5 w-5 text-white" />
                </div>
                <p className="text-base font-extrabold tracking-tight text-white">AllocFlow</p>
              </div>
              <button
                type="button"
                className="btn-ghost p-2"
                onClick={() => setMobileNav(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navList}
            <div className="mt-auto border-t border-white/[0.07] pt-3">
              <p className="mb-2 px-2 text-sm font-semibold text-slate-200">{user.name}</p>
              <button
                type="button"
                className="nav-link w-full"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ---------- content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.07] bg-surface-0/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <button
            type="button"
            className="btn-ghost p-2 lg:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <Boxes className="h-5 w-5 text-brand-400" />
            <span className="font-extrabold tracking-tight text-white">AllocFlow</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="badge hidden bg-white/[0.06] text-slate-300 sm:inline-flex">
              {ROLE_LABELS[user.role]}
            </span>
            <NotificationBell />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
