import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { AlertTriangle, CheckCircle2, FlaskConical, Trash2, Search } from 'lucide-react';
import { apiFetch, ApiProblemError } from '../api/client.ts';
import type {
  Environment,
  ExperimentAnalyticsDetail,
  ExperimentSummary,
  StaleFlagItem,
} from '../types/flagship.ts';

interface ExperimentsPageProps {
  environments: Environment[];
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function ExperimentAnalyticsPage({ environments, onNotify }: ExperimentsPageProps) {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [detail, setDetail] = useState<ExperimentAnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: ExperimentSummary[] }>('/api/v1/experiments');
      setExperiments(res.items);
      if (res.items.length > 0 && !selectedKey) {
        setSelectedKey(res.items[0].key);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const loadDetail = async (key: string) => {
    if (!key) return;
    const d = await apiFetch<ExperimentAnalyticsDetail>(`/api/v1/analytics/experiments/${key}`);
    setDetail(d);
  };

  useEffect(() => {
    if (selectedKey) loadDetail(selectedKey);
  }, [selectedKey]);

  const sendBatchEvents = async () => {
    if (!detail) return;
    const prodEnv = environments.find((e) => e.key === 'production') ?? environments[0];
    if (!prodEnv) return;

    const exposures = [];
    const conversions = [];
    const vars = detail.variations;
    for (let i = 0; i < 40; i++) {
      const v = vars[i % vars.length];
      const userKey = `batch-u-${Date.now()}-${i}`;
      exposures.push({
        flagKey: detail.flagKey,
        experimentId: detail.experimentId,
        userKey,
        variationKey: v.key,
        reason: 'PERCENTAGE_ROLLOUT',
      });
      if (i % (v.key === vars[0].key ? 3 : 6) === 0) {
        conversions.push({
          flagKey: detail.flagKey,
          experimentId: detail.experimentId,
          eventName: detail.conversionEventName || 'conversion',
          userKey,
          variationKey: v.key,
          value: 1,
        });
      }
    }

    try {
      const res = await apiFetch<{ acceptedExposures: number; acceptedConversions: number }>(
        '/api/v1/events/batch',
        {
          method: 'POST',
          headers: { 'X-FlagShip-SDK-Key': prodEnv.sdk_key },
          body: JSON.stringify({ exposures, conversions }),
        },
      );
      onNotify(
        'success',
        'SDK Event Batch Ingested',
        `Recorded ${res.acceptedExposures} exposures and ${res.acceptedConversions} conversions.`,
      );
      loadDetail(detail.flagKey);
      loadList();
    } catch (err) {
      onNotify('error', 'Batch ingestion failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Experiment Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Measure variation conversion lift, Z-test significance, and Chi-Square Sample Ratio Mismatch (SRM).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
          >
            {experiments.map((ex) => (
              <option key={ex.key} value={ex.key}>
                {ex.key} ({ex.experiment_id || 'experiment'})
              </option>
            ))}
          </select>
          {detail && (
            <button
              type="button"
              onClick={sendBatchEvents}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white whitespace-nowrap shrink-0"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Ingest SDK Event Batch
            </button>
          )}
        </div>
      </div>

      {loading && !detail ? (
        <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : !detail ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500">
          No active experiments configured. Enable experiment tracking when creating or editing a feature flag.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Exposures</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {detail.totalExposures.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Conversions</div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {detail.totalConversions.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Statistical Significance</div>
              <div className="mt-1.5 flex items-center gap-2">
                {detail.significance.significant ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Significant (p={detail.significance.pValue})
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Not Significant (p={detail.significance.pValue})
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
                Uplift: {detail.significance.upliftPercent > 0 ? '+' : ''}
                {detail.significance.upliftPercent}% · z={detail.significance.zScore}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sample Ratio Mismatch (SRM)</div>
              <div className="mt-1.5 flex items-center gap-2">
                {detail.srm.mismatchDetected ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                    SRM Detected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Balanced Ratio
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
                χ²={detail.srm.chiSquare} · p={detail.srm.pValue}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display mb-4">
                Conversion Rate by Variation
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detail.variations}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="key" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(val) => [`${val ?? 0}%`, 'Conversion Rate']} />
                    <Bar dataKey="conversionRate" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display mb-4">
                Daily Exposure Volume
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={detail.dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="exposures" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Variation</th>
                  <th className="py-3 px-4 text-right">Expected Split</th>
                  <th className="py-3 px-4 text-right">Exposures</th>
                  <th className="py-3 px-4 text-right">Conversions</th>
                  <th className="py-3 px-4 text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {detail.variations.map((v) => (
                  <tr key={v.key}>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{v.name}</div>
                      <div className="text-xs font-mono text-slate-500">{v.key}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {v.expectedWeight}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {v.exposures.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {v.conversions.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                      {v.conversionRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface FlagHygienePageProps {
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function FlagHygienePage({ onNotify }: FlagHygienePageProps) {
  const [items, setItems] = useState<StaleFlagItem[]>([]);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<'all' | 'unused' | 'full'>('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: StaleFlagItem[] }>('/api/v1/analytics/hygiene');
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const archiveStale = async (item: StaleFlagItem) => {
    try {
      await apiFetch(`/api/v1/flags/${item.flagId}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived: true }),
      });
      onNotify('success', 'Stale Flag Archived', `${item.flagKey} removed from active snapshots.`);
      load();
    } catch (err) {
      onNotify('error', 'Archive failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  const filtered = items.filter((it) => {
    const matchesSearch =
      !search.trim() ||
      it.flagKey.toLowerCase().includes(search.toLowerCase()) ||
      it.flagName.toLowerCase().includes(search.toLowerCase()) ||
      it.projectName.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (reasonFilter === 'unused') return it.daysSinceEval >= 30;
    if (reasonFilter === 'full') return it.daysAtFullRollout >= 14;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
          Flag Hygiene
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Identifies technical-debt flags unevaluated for 30+ days or stuck at 100% production rollout for 14+ days.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter stale flags by key, project..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5">
          {[
            { id: 'all', label: 'All Stale' },
            { id: 'unused', label: 'Unused ≥ 30d' },
            { id: 'full', label: '100% Rollout ≥ 14d' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setReasonFilter(f.id as 'all' | 'unused' | 'full')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                reasonFilter === f.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="h-40 animate-pulse bg-slate-100 dark:bg-slate-800" />
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-600 dark:text-slate-400">
            No stale flags found matching your criteria. Your flag inventory is clean.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Flag</th>
                  <th className="py-3 px-4">Project · Owner</th>
                  <th className="py-3 px-4 text-right">Rollout</th>
                  <th className="py-3 px-4">Stale Reason &amp; Cleanup Recommendation</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filtered.map((item) => (
                  <tr key={item.flagId}>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.flagName}</div>
                      <div className="text-xs font-mono text-slate-500">{item.flagKey}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {item.projectName} · {item.ownerName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200">
                      {item.rolloutPercentage}%
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-medium text-amber-600 dark:text-amber-400">{item.staleReason}</div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">{item.recommendation}</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => archiveStale(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
