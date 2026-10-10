import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bed,
  Building2,
  ClipboardList,
  DoorOpen,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatTile,
  StatusBadge,
} from '../../components/ui';
import { formatCurrency, formatDateTime, formatRelative, titleCase } from '../../lib/format';

/** Shapes returned by GET /dashboard, which varies by role. */
interface StudentDash {
  role: 'STUDENT';
  booking: {
    id: number; bedIndex: number; roomNumber: string; floor: number;
    capacity: number; occupiedBeds: number; hostelCode: string; hostelName: string;
  } | null;
  openRequests: number;
  activeGatepass: { reference: string; status: string; fromTime: string; toTime: string; reason: string } | null;
  unreadAlerts: number;
  announcements: { id: number; title: string; category: string; createdAt: string }[];
  recentBills: { period: string; amount: string; isPaid: boolean; dueDate: string }[];
  outstandingAmount: string;
}

interface StaffDash {
  role: 'WARDEN' | 'SUPERVISOR' | 'ADMIN';
  occupancy: {
    totalRooms: number; totalBeds: number; occupiedBeds: number;
    fullRooms: number; blockedRooms: number; freeBeds: number; occupancyRate: number;
  };
  pendingRequests: number;
  pendingGatepasses: number;
  upcomingRaids: { id: number; floor: number | null; scheduledFor: string; purpose: string; hostelCode: string }[];
  recentRequests: {
    id: number; type: string; category: string | null; status: string; priority: string;
    createdAt: string; studentName: string; roomNumber: string | null; hostelCode: string | null;
  }[];
  byHostel: { hostelId: number; code: string; name: string; accentColor: string; totalBeds: number; occupiedBeds: number; occupancyRate: number }[];
}

interface SecurityDash {
  role: 'SECURITY';
  currentlyOut: {
    id: number; reference: string; checkedOutAt: string; toTime: string;
    studentName: string; rollNumber: string; hostelCode: string | null; roomNumber: string | null; isOverdue: boolean;
  }[];
  currentlyOutCount: number;
  overdueCount: number;
  checkedOutToday: number;
  awaitingDeparture: number;
}

interface MessDash {
  role: 'MESS_STAFF';
  overall: { averageRating: string; responses: number };
  byMeal: { meal: string; averageRating: string; responses: number }[];
  recentComments: { id: number; meal: string; rating: number; comment: string | null; createdAt: string; studentName: string }[];
}

type Dash = StudentDash | StaffDash | SecurityDash | MessDash;

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dash>('/dashboard'),
  });

  if (isLoading) return <LoadingBlock label="Loading your dashboard…" />;
  if (isError || !data) {
    return <ErrorBlock message="Could not load the dashboard." onRetry={() => refetch()} />;
  }

  // Greet with the whole name: splitting on the first token turns
  // "Dr. Ramesh Iyer" into "Dr.", and titles are common among hostel staff.
  const greeting = user?.name ? `Welcome back, ${user.name}` : 'Welcome back';

  if (data.role === 'STUDENT') return <StudentView d={data} greeting={greeting} />;
  if (data.role === 'SECURITY') return <SecurityView d={data} greeting={greeting} />;
  if (data.role === 'MESS_STAFF') return <MessView d={data} greeting={greeting} />;
  return <StaffView d={data} greeting={greeting} />;
}

/* ------------------------------------------------------------------ */

function StudentView({ d, greeting }: { d: StudentDash; greeting: string }) {
  return (
    <div className="animate-fade-in">
      <PageHeader title={greeting} subtitle="Your hostel at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Your room"
          value={d.booking ? d.booking.roomNumber : 'Not allocated'}
          hint={d.booking ? `${d.booking.hostelCode} · floor ${d.booking.floor} · bed ${d.booking.bedIndex}` : 'Book a room from the explorer'}
          tone={d.booking ? 'brand' : 'amber'}
          icon={<Bed className="h-4 w-4" />}
        />
        <StatTile
          label="Open requests"
          value={d.openRequests}
          hint="Housekeeping and repairs in progress"
          tone={d.openRequests > 0 ? 'amber' : 'green'}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatTile
          label="Gatepass"
          value={d.activeGatepass ? titleCase(d.activeGatepass.status) : 'None active'}
          hint={d.activeGatepass?.reference ?? 'Request one when you need to leave'}
          tone={d.activeGatepass?.status === 'APPROVED' ? 'green' : 'default'}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <StatTile
          label="Electricity due"
          value={formatCurrency(d.outstandingAmount)}
          hint="Outstanding on your room"
          tone={Number(d.outstandingAmount) > 0 ? 'amber' : 'green'}
          icon={<Zap className="h-4 w-4" />}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Latest announcements"
          action={<Link to="/announcements" className="text-xs font-medium text-brand-300 hover:text-brand-200">View all</Link>}
        >
          {d.announcements.length ? (
            <ul className="space-y-2.5">
              {d.announcements.map((a) => (
                <li key={a.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-200">{a.title}</p>
                    <span className="badge shrink-0 bg-white/[0.06] text-slate-400">
                      {titleCase(a.category)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">{formatRelative(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No announcements yet" icon={<Megaphone className="h-6 w-6" />} />
          )}
        </Card>

        <Card
          title="Recent electricity bills"
          action={<Link to="/electricity" className="text-xs font-medium text-brand-300 hover:text-brand-200">View all</Link>}
        >
          {d.recentBills.length ? (
            <ul className="space-y-2">
              {d.recentBills.map((b) => (
                <li key={b.period} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{b.period}</p>
                    <p className="text-[11px] text-slate-500">Due {b.dueDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-100">
                      {formatCurrency(b.amount)}
                    </p>
                    <StatusBadge status={b.isPaid ? 'RESOLVED' : 'PENDING'} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No bills yet"
              description="Bills appear once you have an allocated room."
              icon={<Zap className="h-6 w-6" />}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StaffView({ d, greeting }: { d: StaffDash; greeting: string }) {
  const o = d.occupancy;
  return (
    <div className="animate-fade-in">
      <PageHeader
        title={greeting}
        subtitle={d.role === 'WARDEN' ? 'Your hostel block today.' : 'Campus-wide hostel operations.'}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Occupancy"
          value={`${o.occupancyRate}%`}
          hint={`${o.occupiedBeds} of ${o.totalBeds} beds`}
          tone={o.occupancyRate > 90 ? 'red' : o.occupancyRate > 75 ? 'amber' : 'green'}
          icon={<Users className="h-4 w-4" />}
        />
        <StatTile
          label="Beds free"
          value={o.freeBeds}
          hint={`${o.fullRooms} rooms full · ${o.blockedRooms} blocked`}
          tone="brand"
          icon={<DoorOpen className="h-4 w-4" />}
        />
        <StatTile
          label="Open requests"
          value={d.pendingRequests}
          hint="Housekeeping and repairs"
          tone={d.pendingRequests > 0 ? 'amber' : 'green'}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatTile
          label="Gatepasses pending"
          value={d.pendingGatepasses}
          hint="Awaiting your decision"
          tone={d.pendingGatepasses > 0 ? 'amber' : 'green'}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Occupancy by block"
          action={<Link to="/explorer" className="text-xs font-medium text-brand-300 hover:text-brand-200">Explore</Link>}
        >
          <ul className="space-y-3">
            {d.byHostel.map((h) => (
              <li key={h.hostelId}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-200">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.accentColor }} />
                    {h.code}
                    <span className="hidden truncate text-xs font-normal text-slate-500 sm:inline">
                      {h.name}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {h.occupiedBeds}/{h.totalBeds} · {h.occupancyRate}%
                  </span>
                </div>
                <ProgressBar value={h.occupancyRate} tone={h.accentColor} />
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Open requests"
          action={<Link to="/requests" className="text-xs font-medium text-brand-300 hover:text-brand-200">Manage</Link>}
        >
          {d.recentRequests.length ? (
            <ul className="space-y-2">
              {d.recentRequests.map((r) => (
                <li key={r.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {r.category ?? titleCase(r.type)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {r.studentName} · room {r.roomNumber ?? '—'} ({r.hostelCode ?? '—'})
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      {(r.priority === 'HIGH' || r.priority === 'URGENT') && (
                        <StatusBadge status={r.priority} />
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">{formatRelative(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing open" description="All requests are resolved." icon={<ClipboardList className="h-6 w-6" />} />
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card
          title="Upcoming inspections"
          action={<Link to="/raids" className="text-xs font-medium text-brand-300 hover:text-brand-200">Schedule</Link>}
        >
          {d.upcomingRaids.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.upcomingRaids.map((r) => (
                <li key={r.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="text-sm font-medium text-slate-200">{r.purpose}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.hostelCode} · {r.floor ? `floor ${r.floor}` : 'whole block'} ·{' '}
                    {formatDateTime(r.scheduledFor)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No inspections scheduled" icon={<Sparkles className="h-6 w-6" />} />
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SecurityView({ d, greeting }: { d: SecurityDash; greeting: string }) {
  return (
    <div className="animate-fade-in">
      <PageHeader title={greeting} subtitle="Gate activity right now." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Currently out" value={d.currentlyOutCount} hint="Students outside the hostel" tone="brand" icon={<DoorOpen className="h-4 w-4" />} />
        <StatTile label="Overdue returns" value={d.overdueCount} hint="Past their approved window" tone={d.overdueCount > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatTile label="Checked out today" value={d.checkedOutToday} hint="Departures recorded" icon={<ShieldCheck className="h-4 w-4" />} />
        <StatTile label="Awaiting departure" value={d.awaitingDeparture} hint="Approved, not yet left" tone="amber" icon={<Building2 className="h-4 w-4" />} />
      </div>

      <div className="mt-5">
        <Card
          title="Students currently outside"
          action={<Link to="/verify" className="text-xs font-medium text-brand-300 hover:text-brand-200">Verify a pass</Link>}
        >
          {d.currentlyOut.length ? (
            <div className="table-wrap">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    <th className="th">Student</th>
                    <th className="th">Reference</th>
                    <th className="th">Room</th>
                    <th className="th">Left at</th>
                    <th className="th">Due back</th>
                  </tr>
                </thead>
                <tbody>
                  {d.currentlyOut.map((g) => (
                    <tr key={g.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="td">
                        <span className="font-medium text-slate-200">{g.studentName}</span>
                        <span className="block text-xs text-slate-500">{g.rollNumber}</span>
                      </td>
                      <td className="td font-mono text-xs">{g.reference}</td>
                      <td className="td">{g.roomNumber ?? '—'} <span className="text-slate-500">{g.hostelCode ?? ''}</span></td>
                      <td className="td">{formatDateTime(g.checkedOutAt)}</td>
                      <td className="td">
                        {formatDateTime(g.toTime)}
                        {g.isOverdue && <span className="ml-2"><StatusBadge status="REJECTED" /></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Everyone is in" description="No students are currently signed out." icon={<ShieldCheck className="h-6 w-6" />} />
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MessView({ d, greeting }: { d: MessDash; greeting: string }) {
  return (
    <div className="animate-fade-in">
      <PageHeader title={greeting} subtitle="How the mess is being received." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Overall rating"
          value={`${Number(d.overall.averageRating).toFixed(1)} / 5`}
          hint={`${d.overall.responses} responses`}
          tone={Number(d.overall.averageRating) >= 3.5 ? 'green' : 'amber'}
          icon={<Star className="h-4 w-4" />}
        />
        {d.byMeal.slice(0, 3).map((m) => (
          <StatTile
            key={m.meal}
            label={titleCase(m.meal)}
            value={`${Number(m.averageRating).toFixed(1)} / 5`}
            hint={`${m.responses} responses`}
            tone={Number(m.averageRating) >= 3.5 ? 'green' : 'amber'}
          />
        ))}
      </div>

      <div className="mt-5">
        <Card
          title="Recent comments"
          action={<Link to="/mess" className="text-xs font-medium text-brand-300 hover:text-brand-200">Manage menu</Link>}
        >
          {d.recentComments.length ? (
            <ul className="space-y-2">
              {d.recentComments.map((c) => (
                <li key={c.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-slate-300">{c.comment}</p>
                    <span className="badge shrink-0 bg-amber-500/15 text-amber-300">
                      {c.rating} ★
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {c.studentName} · {titleCase(c.meal)} · {formatRelative(c.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No comments yet" icon={<Star className="h-6 w-6" />} />
          )}
        </Card>
      </div>
    </div>
  );
}
