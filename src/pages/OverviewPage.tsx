import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { ArrowUpRight, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import type { AuditLog } from '../types/flagship.ts';

interface OverviewResponse {
  kpis: {
    totalProjects: number;
    totalFlags: number;
    enabledFlags: number;
    activeRollouts: number;
    pendingApprovals: number;
    connectedSdks: number;
  };
  recentChanges: AuditLog[];
  rolloutActivity: Array<{
    flagKey: string;
    environment: string;
    rolloutPercentage: number;
    enabled: number;
    killSwitchActive: number;
    updatedAt: string;
  }>;
}

interface OverviewPageProps {
  onNavigate: (page: string) => void;
  refreshSignal: number;
}

export function OverviewPage({ onNavigate, refreshSignal }: OverviewPageProps) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<OverviewResponse>('/api/v1/analytics/overview')
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load overview metrics.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshSignal]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-6 text-sm text-rose-700 dark:text-rose-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const kpiCards = [
    { label: 'Total Projects', value: data.kpis.totalProjects, target: 'projects' },
    { label: 'Total Flags', value: data.kpis.totalFlags, target: 'flags' },
    { label: 'Enabled Flags', value: data.kpis.enabledFlags, target: 'flags' },
    { label: 'Active Rollouts', value: data.kpis.activeRollouts, target: 'rollouts' },
    { label: 'Pending Approvals', value: data.kpis.pendingApprovals, target: 'approvals' },
    { label: 'Connected SDKs', value: data.kpis.connectedSdks, target: 'health' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Platform Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Live control plane metrics across projects, production rollouts, approvals, and connected SDK instances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('flag-create')}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0"
        >
          New Feature Flag
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate(kpi.target)}
            className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {kpi.label}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums font-display">
              {kpi.value}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                Production Rollout Activity
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current percentage allocation per flag in Production
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('rollouts')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
            >
              Manage Rollouts
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.rolloutActivity} margin={{ top: 8, right: 12, left: -16, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis
                  dataKey="flagKey"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                <Tooltip
                  formatter={(value) => [`${value ?? 0}%`, 'Rollout']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="rolloutPercentage" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                Production Status Snapshot
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kill-switch and rollout state
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('flags')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
            >
              View All
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.rolloutActivity.map((item) => (
              <div key={item.flagKey} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                    {item.flagKey}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {item.environment}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {item.rolloutPercentage}%
                  </span>
                  {item.killSwitchActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Killed
                    </span>
                  ) : item.enabled ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Off
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
            Recent Changes
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
          >
            Full Change History
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4">Action</th>
                <th className="py-2.5 pr-4">Entity</th>
                <th className="py-2.5 pr-4">Summary</th>
                <th className="py-2.5 pr-4">Actor</th>
                <th className="py-2.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {data.recentChanges.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 pr-4 font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                    {log.entity_id}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">{log.summary}</td>
                  <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {log.actor_email}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
