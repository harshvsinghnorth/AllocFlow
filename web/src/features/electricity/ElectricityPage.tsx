import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { BillSummary, ElectricityBill } from '../../lib/types';
import {
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatTile,
  StatusBadge,
} from '../../components/ui';
import { formatCurrency, formatNumber } from '../../lib/format';

/** FR8 — electricity usage and billing for students and hostel staff. */
export default function ElectricityPage() {
  const { user } = useAuth();
  return user?.role === 'STUDENT' ? <StudentBills /> : <StaffBills />;
}

function StudentBills() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['electricity', 'me'],
    queryFn: () =>
      api<{
        room: { roomNumber: string; floor: number; hostelCode: string; hostelName: string } | null;
        bills: ElectricityBill[];
        summary: BillSummary;
        occupants?: number;
      }>('/electricity/me'),
  });

  if (isLoading) return <LoadingBlock />;
  if (isError || !data) return <ErrorBlock message="Could not load your bills." onRetry={() => refetch()} />;

  if (!data.room) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Electricity" />
        <Card>
          <EmptyState
            title="No room allocated"
            description="Electricity bills are issued against your room. Book one to see them here."
            icon={<Zap className="h-6 w-6" />}
          />
        </Card>
      </div>
    );
  }

  const chart = [...data.bills]
    .reverse()
    .map((b) => ({ period: b.period, units: Number(b.unitsConsumed), amount: Number(b.amount) }));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Electricity"
        subtitle={`Room ${data.room.roomNumber}, floor ${data.room.floor} · ${data.room.hostelName}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={formatCurrency(data.summary.outstandingAmount)}
          hint="Across all unpaid bills"
          tone={Number(data.summary.outstandingAmount) > 0 ? 'amber' : 'green'}
          icon={<Zap className="h-4 w-4" />}
        />
        <StatTile label="Paid to date" value={formatCurrency(data.summary.paidAmount)} tone="green" />
        <StatTile label="Total units" value={formatNumber(data.summary.totalUnits)} hint="kWh billed" />
        <StatTile
          label="Sharing with"
          value={data.occupants ?? 1}
          hint="Occupants splitting the bill"
          tone="brand"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Consumption by month">
          {chart.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  />
                  <Bar dataKey="units" name="Units (kWh)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No consumption data yet" icon={<Zap className="h-6 w-6" />} />
          )}
        </Card>

        <Card title="Your bills" className="p-0">
          {data.bills.length ? (
            <div className="table-wrap">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    <th className="th">Period</th>
                    <th className="th">Units</th>
                    <th className="th">Room total</th>
                    <th className="th">Your share</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bills.map((b) => (
                    <tr key={b.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="td font-medium text-slate-200">{b.period}</td>
                      <td className="td tabular-nums">{formatNumber(b.unitsConsumed)}</td>
                      <td className="td tabular-nums">{formatCurrency(b.amount)}</td>
                      <td className="td font-semibold tabular-nums text-slate-100">
                        {formatCurrency(b.perHeadShare ?? b.amount)}
                      </td>
                      <td className="td">
                        <StatusBadge status={b.isPaid ? 'RESOLVED' : 'PENDING'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No bills issued yet" icon={<Zap className="h-6 w-6" />} />
          )}
        </Card>
      </div>
    </div>
  );
}

function StaffBills() {
  const queryClient = useQueryClient();

  const ledger = useQuery({
    queryKey: ['electricity', 'ledger'],
    queryFn: () => api<{ items: ElectricityBill[]; summary: BillSummary }>('/electricity?limit=300'),
  });

  const trend = useQuery({
    queryKey: ['electricity', 'trend'],
    queryFn: () =>
      api<{ period: string; totalUnits: string; totalAmount: string; paidAmount: string | null; billedRooms: number }[]>(
        '/electricity/trend',
      ),
  });

  const setPaid = useMutation({
    mutationFn: ({ id, isPaid }: { id: number; isPaid: boolean }) =>
      api(`/electricity/${id}/paid`, { method: 'PATCH', body: { isPaid } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['electricity'] }),
  });

  if (ledger.isLoading) return <LoadingBlock />;
  if (ledger.isError || !ledger.data) {
    return <ErrorBlock message="Could not load the billing ledger." onRetry={() => ledger.refetch()} />;
  }

  const chart = (trend.data ?? []).map((t) => ({
    period: t.period,
    billed: Number(t.totalAmount),
    collected: Number(t.paidAmount ?? 0),
  }));

  const unpaid = ledger.data.items.filter((b) => !b.isPaid);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Electricity Billing" subtitle="Usage and collection across your block." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Billed" value={formatCurrency(ledger.data.summary.totalAmount)} hint={`${ledger.data.summary.billCount} bills`} />
        <StatTile label="Collected" value={formatCurrency(ledger.data.summary.paidAmount)} tone="green" />
        <StatTile label="Outstanding" value={formatCurrency(ledger.data.summary.outstandingAmount)} hint={`${unpaid.length} unpaid`} tone={unpaid.length ? 'amber' : 'green'} />
        <StatTile label="Units billed" value={formatNumber(ledger.data.summary.totalUnits)} hint="kWh" />
      </div>

      <div className="mt-5">
        <Card title="Billed vs collected">
          {chart.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="billed" name="Billed" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Collected" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No billing history yet" icon={<Zap className="h-6 w-6" />} />
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title={`Ledger (${ledger.data.items.length})`} className="p-0">
          <div className="table-wrap max-h-[32rem] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-1">
                <tr className="border-b border-white/[0.07]">
                  <th className="th">Room</th>
                  <th className="th">Period</th>
                  <th className="th">Units</th>
                  <th className="th">Amount</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {ledger.data.items.map((b) => (
                  <tr key={b.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="td font-medium text-slate-200">
                      {b.roomNumber} <span className="text-slate-500">{b.hostelCode}</span>
                    </td>
                    <td className="td">{b.period}</td>
                    <td className="td tabular-nums">{formatNumber(b.unitsConsumed)}</td>
                    <td className="td tabular-nums">{formatCurrency(b.amount)}</td>
                    <td className="td"><StatusBadge status={b.isPaid ? 'RESOLVED' : 'PENDING'} /></td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={setPaid.isPending}
                        onClick={() => setPaid.mutate({ id: b.id, isPaid: !b.isPaid })}
                      >
                        {b.isPaid ? 'Mark unpaid' : 'Mark paid'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
