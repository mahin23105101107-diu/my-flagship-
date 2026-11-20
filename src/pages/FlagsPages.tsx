import { useEffect, useState, type FormEvent } from 'react';
import {
  Search,
  Plus,
  ShieldAlert,
  CheckCircle2,
  PowerOff,
  Archive,
  Play,
  Sliders,
  ArrowLeft,
} from 'lucide-react';
import { apiFetch, ApiProblemError } from '../api/client.ts';
import type { FlagType } from '../shared/engine.ts';
import type { Environment, EvaluationPreviewResponse, FeatureFlag } from '../types/flagship.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface FlagsListPageProps {
  projectId: number;
  selectedEnvId: number;
  environments: Environment[];
  onSelectEnv: (id: number) => void;
  onOpenFlag: (flagId: number) => void;
  onCreateFlag: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  refreshSignal: number;
}

export function FlagsListPage({
  projectId,
  selectedEnvId,
  environments,
  onSelectEnv,
  onOpenFlag,
  onCreateFlag,
  onNotify,
  refreshSignal,
}: FlagsListPageProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadFlags = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        projectId: String(projectId),
        page: String(page),
        size: '12',
        archived: String(showArchived),
      });
      if (search.trim()) qs.set('search', search.trim());
      if (typeFilter) qs.set('type', typeFilter);
      const res = await apiFetch<{ items: FeatureFlag[]; total: number }>(`/api/v1/flags?${qs}`);
      setFlags(res.items);
      setTotal(res.total);
    } catch (err) {
      onNotify('error', 'Failed to load feature flags', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, [projectId, page, search, typeFilter, showArchived, refreshSignal]);

  const toggleKillSwitch = async (flag: FeatureFlag, currentlyKilled: boolean) => {
    try {
      await apiFetch(`/api/v1/flags/${flag.id}/toggle-kill-switch`, {
        method: 'POST',
        body: JSON.stringify({
          environmentId: selectedEnvId,
          killSwitchActive: !currentlyKilled,
          reason: !currentlyKilled ? 'Operator triggered emergency kill switch' : 'Operator cleared kill switch',
        }),
      });
      onNotify(
        !currentlyKilled ? 'info' : 'success',
        !currentlyKilled ? 'Kill Switch Activated' : 'Kill Switch Cleared',
        `${flag.key} updated and streamed via SSE.`,
      );
      loadFlags();
    } catch (err) {
      onNotify('error', 'Kill Switch failed', err instanceof ApiProblemError ? err.detail : 'Requires Approver role.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Feature Flags
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage boolean, string, number, and JSON feature configurations across environments.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateFlag}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Flag
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search flags by key or name..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5">
            {['', 'BOOLEAN', 'STRING', 'NUMBER', 'JSON'].map((t) => (
              <button
                key={t || 'ALL'}
                type="button"
                onClick={() => {
                  setPage(1);
                  setTypeFilter(t);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  typeFilter === t
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {t || 'All Types'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedEnvId}
            onChange={(e) => onSelectEnv(Number(e.target.value))}
            aria-label="Select environment"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show Archived
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : flags.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No feature flags match your filters.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Create your first flag to begin configuring targeting rules and gradual rollouts.
            </p>
            <button
              type="button"
              onClick={onCreateFlag}
              className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white"
            >
              Create First Flag
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Flag</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Env Status</th>
                  <th className="py-3 px-4 text-right">Rollout</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {flags.map((flag) => {
                  const cfg = flag.configurations.find((c) => c.environment_id === selectedEnvId);
                  const killed = Boolean(cfg?.kill_switch_active);
                  const enabled = Boolean(cfg?.enabled);

                  return (
                    <tr
                      key={flag.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenFlag(flag.id)}
                          className="text-left group"
                        >
                          <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                            {flag.name}
                          </div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {flag.key}
                            {flag.experiment_active ? ` · Exp: ${flag.experiment_id || 'active'}` : ''}
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {flag.type}
                      </td>
                      <td className="py-3 px-4">
                        {killed ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Kill Switch Active
                          </span>
                        ) : enabled ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <PowerOff className="w-3.5 h-3.5" />
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200">
                        {cfg ? `${cfg.rollout_percentage}%` : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {flag.owner_name}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleKillSwitch(flag, killed)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                            killed
                              ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                              : 'border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                          }`}
                        >
                          {killed ? 'Clear Kill Switch' : 'Kill Switch'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenFlag(flag.id)}
                          className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > 12 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="tabular-nums">Showing page {page} ({total} total flags)</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 12 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface FlagCreateEditPageProps {
  projectId: number;
  editFlagId?: number | null;
  onSaved: (flagId: number) => void;
  onCancel: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function FlagCreateEditPage({
  projectId,
  editFlagId,
  onSaved,
  onCancel,
  onNotify,
}: FlagCreateEditPageProps) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FlagType>('BOOLEAN');
  const [varAKey, setVarAKey] = useState('on');
  const [varAName, setVarAName] = useState('Enabled');
  const [varAValue, setVarAValue] = useState('true');
  const [varBKey, setVarBKey] = useState('off');
  const [varBName, setVarBName] = useState('Disabled');
  const [varBValue, setVarBValue] = useState('false');
  const [experimentActive, setExperimentActive] = useState(false);
  const [experimentId, setExperimentId] = useState('');
  const [conversionEventName, setConversionEventName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editFlagId) return;
    apiFetch<FeatureFlag>(`/api/v1/flags/${editFlagId}`).then((f) => {
      setKey(f.key);
      setName(f.name);
      setDescription(f.description);
      setType(f.type);
      setExperimentActive(Boolean(f.experiment_active));
      setExperimentId(f.experiment_id || '');
      setConversionEventName(f.conversion_event_name || '');
    });
  }, [editFlagId]);

  const handleTypeChange = (nextType: FlagType) => {
    setType(nextType);
    if (nextType === 'BOOLEAN') {
      setVarAKey('on');
      setVarAName('Enabled');
      setVarAValue('true');
      setVarBKey('off');
      setVarBName('Disabled');
      setVarBValue('false');
    } else if (nextType === 'STRING') {
      setVarAKey('treatment');
      setVarAName('Treatment');
      setVarAValue('modern-grid');
      setVarBKey('control');
      setVarBName('Control');
      setVarBValue('classic-list');
    } else if (nextType === 'NUMBER') {
      setVarAKey('high');
      setVarAName('Increased Limit');
      setVarAValue('100');
      setVarBKey('baseline');
      setVarBName('Baseline Limit');
      setVarBValue('25');
    } else {
      setVarAKey('variant');
      setVarAName('Promo Banner');
      setVarAValue('{"discount": 20, "theme": "indigo"}');
      setVarBKey('default');
      setVarBName('Standard Banner');
      setVarBValue('{"discount": 0, "theme": "slate"}');
    }
  };

  const parseTypedValue = (raw: string): unknown => {
    if (type === 'BOOLEAN') return raw === 'true';
    if (type === 'NUMBER') {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`Invalid number: ${raw}`);
      return n;
    }
    if (type === 'JSON') return JSON.parse(raw);
    return raw;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editFlagId) {
        await apiFetch(`/api/v1/flags/${editFlagId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            description,
            experimentActive,
            experimentId: experimentId || null,
            conversionEventName: conversionEventName || null,
          }),
        });
        onNotify('success', 'Flag updated', `${key} metadata saved.`);
        onSaved(editFlagId);
      } else {
        const variations = [
          { key: varAKey, name: varAName, value: parseTypedValue(varAValue) },
          { key: varBKey, name: varBName, value: parseTypedValue(varBValue) },
        ];
        const created = await apiFetch<{ id: number }>('/api/v1/flags', {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            key,
            name,
            description,
            type,
            variations,
            defaultVariationKey: varBKey,
            offVariationKey: varBKey,
            experimentActive,
            experimentId: experimentId || null,
            conversionEventName: conversionEventName || null,
          }),
        });
        onNotify('success', 'Feature flag created', `${key} initialized across all environments.`);
        onSaved(created.id);
      }
    } catch (err) {
      onNotify(
        'error',
        'Validation error',
        err instanceof ApiProblemError ? err.detail : (err as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            {editFlagId ? `Edit Flag: ${key}` : 'Create Feature Flag'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Define flag schema, typed variations, and optional experiment tracking.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!editFlagId && !key) {
                  setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                }
              }}
              placeholder="Smart Retry Policy"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Unique Flag Key
            </label>
            <input
              type="text"
              required
              disabled={Boolean(editFlagId)}
              pattern="[a-z0-9-]+"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              placeholder="smart-retry-policy"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Controls exponential backoff retry strategy for payment webhooks."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        {!editFlagId && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Flag Return Type
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['BOOLEAN', 'STRING', 'NUMBER', 'JSON'] as FlagType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`py-2 text-xs font-mono font-medium rounded-lg border transition-colors ${
                      type === t
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Named Variations
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={varAKey}
                  onChange={(e) => setVarAKey(e.target.value)}
                  placeholder="Treatment key"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  required
                  value={varAName}
                  onChange={(e) => setVarAName(e.target.value)}
                  placeholder="Treatment label"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  required
                  value={varAValue}
                  onChange={(e) => setVarAValue(e.target.value)}
                  placeholder="Treatment value"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={varBKey}
                  onChange={(e) => setVarBKey(e.target.value)}
                  placeholder="Default/Off key"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  required
                  value={varBName}
                  onChange={(e) => setVarBName(e.target.value)}
                  placeholder="Default/Off label"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  required
                  value={varBValue}
                  onChange={(e) => setVarBValue(e.target.value)}
                  placeholder="Default/Off value"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </>
        )}

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={experimentActive}
              onChange={(e) => setExperimentActive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Track as Controlled Experiment (Exposure &amp; Conversion Analytics)
          </label>

          {experimentActive && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={experimentId}
                onChange={(e) => setExperimentId(e.target.value)}
                placeholder="Experiment ID (e.g. exp-retry-v1)"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={conversionEventName}
                onChange={(e) => setConversionEventName(e.target.value)}
                placeholder="Conversion event (e.g. payment_succeeded)"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          >
            {submitting ? 'Saving...' : editFlagId ? 'Save Changes' : 'Create Flag'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface FlagDetailPageProps {
  flagId: number;
  selectedEnvId: number;
  onSelectEnv: (envId: number) => void;
  onBack: () => void;
  onEdit: (flagId: number) => void;
  onOpenTargeting: (flagId: number) => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function FlagDetailPage({
  flagId,
  selectedEnvId,
  onSelectEnv,
  onBack,
  onEdit,
  onOpenTargeting,
  onNotify,
}: FlagDetailPageProps) {
  const [flag, setFlag] = useState<FeatureFlag | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  // Evaluation Preview Sandbox state
  const [evalUserKey, setEvalUserKey] = useState('user-42');
  const [evalPlan, setEvalPlan] = useState('enterprise');
  const [evalAppVersion, setEvalAppVersion] = useState('2.5.0');
  const [evalEmail, setEvalEmail] = useState('dev@flagship.dev');
  const [evalResult, setEvalResult] = useState<EvaluationPreviewResponse | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const f = await apiFetch<FeatureFlag>(`/api/v1/flags/${flagId}`);
      setFlag(f);
    } catch (err) {
      onNotify('error', 'Failed to load flag details', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [flagId]);

  const activeCfg = flag?.configurations.find((c) => c.environment_id === selectedEnvId) ?? flag?.configurations[0];

  const runPreview = async () => {
    if (!flag || !activeCfg) return;
    try {
      const res = await apiFetch<EvaluationPreviewResponse>(`/api/v1/flags/${flag.id}/evaluate-preview`, {
        method: 'POST',
        body: JSON.stringify({
          environmentId: activeCfg.environment_id,
          userKey: evalUserKey,
          attributes: {
            plan: evalPlan,
            appVersion: evalAppVersion,
            email: evalEmail,
          },
        }),
      });
      setEvalResult(res);
    } catch (err) {
      onNotify('error', 'Evaluation preview failed', (err as Error).message);
    }
  };

  const toggleKillSwitch = async () => {
    if (!flag || !activeCfg) return;
    try {
      await apiFetch(`/api/v1/flags/${flag.id}/toggle-kill-switch`, {
        method: 'POST',
        body: JSON.stringify({
          environmentId: activeCfg.environment_id,
          killSwitchActive: !activeCfg.kill_switch_active,
          reason: !activeCfg.kill_switch_active ? 'Emergency kill switch from Flag Detail' : 'Cleared kill switch',
        }),
      });
      onNotify('success', 'Kill switch updated', `${flag.key} updated in ${activeCfg.env_name}.`);
      load();
    } catch (err) {
      onNotify('error', 'Action failed', err instanceof ApiProblemError ? err.detail : 'Requires Approver role.');
    }
  };

  const handleArchive = async () => {
    if (!flag) return;
    try {
      await apiFetch(`/api/v1/flags/${flag.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived: !flag.archived }),
      });
      onNotify('success', flag.archived ? 'Flag restored' : 'Flag archived');
      setArchiveConfirm(false);
      onBack();
    } catch (err) {
      onNotify('error', 'Archive failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  if (loading || !flag) {
    return <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
              {flag.name}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>{flag.key}</span>
              <span aria-hidden="true">·</span>
              <span>{flag.type}</span>
              <span aria-hidden="true">·</span>
              <span>Owner: {flag.owner_name}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenTargeting(flag.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Sliders className="w-3.5 h-3.5" />
            Targeting &amp; Rollouts
          </button>
          <button
            type="button"
            onClick={() => onEdit(flag.id)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Edit Metadata
          </button>
          <button
            type="button"
            onClick={() => setArchiveConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 whitespace-nowrap shrink-0"
          >
            <Archive className="w-3.5 h-3.5" />
            {flag.archived ? 'Restore' : 'Archive'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {flag.configurations.map((cfg) => (
          <button
            key={cfg.environment_id}
            type="button"
            onClick={() => onSelectEnv(cfg.environment_id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeCfg?.environment_id === cfg.environment_id
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {cfg.env_name} ({cfg.rollout_percentage}%)
          </button>
        ))}
      </div>

      {activeCfg && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {activeCfg.env_name} State
                </h2>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  v{activeCfg.version}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Status</div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {activeCfg.kill_switch_active
                      ? 'Kill Switch Active'
                      : activeCfg.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Rollout</div>
                  <div className="mt-1 font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {activeCfg.rollout_percentage}%
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Emergency Kill Switch forces off-variation immediately across all SDKs.
                </div>
                <button
                  type="button"
                  onClick={toggleKillSwitch}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 ${
                    activeCfg.kill_switch_active
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  {activeCfg.kill_switch_active ? 'Restore Flag' : 'Trigger Kill Switch'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                Variations
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {flag.variations.map((v) => (
                  <div key={v.key} className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{v.name}</div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{v.key}</div>
                    </div>
                    <code className="text-xs font-mono bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded text-slate-800 dark:text-slate-200 max-w-xs truncate">
                      {JSON.stringify(v.value)}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                Live Evaluation Preview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Evaluates using the exact deterministic MurmurHash3 + Chain-of-Responsibility engine shared with the Java SDK.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">userKey</label>
                <input
                  type="text"
                  value={evalUserKey}
                  onChange={(e) => setEvalUserKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">plan</label>
                <input
                  type="text"
                  value={evalPlan}
                  onChange={(e) => setEvalPlan(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">appVersion</label>
                <input
                  type="text"
                  value={evalAppVersion}
                  onChange={(e) => setEvalAppVersion(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">email</label>
                <input
                  type="text"
                  value={evalEmail}
                  onChange={(e) => setEvalEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={runPreview}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white"
            >
              <Play className="w-3.5 h-3.5" />
              Run Evaluation
            </button>

            {evalResult && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Returned Variation</span>
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {evalResult.variationKey} ({JSON.stringify(evalResult.value)})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Evaluation Reason</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{evalResult.reason}</span>
                </div>
                {evalResult.bucket !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Deterministic Bucket</span>
                    <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {evalResult.bucket.toFixed(2)}%
                    </span>
                  </div>
                )}
                {evalResult.evaluatedAtMicros !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Evaluation Time</span>
                    <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {evalResult.evaluatedAtMicros} µs
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={archiveConfirm}
        title={flag.archived ? 'Restore Feature Flag' : 'Archive Feature Flag'}
        description={`Are you sure you want to ${flag.archived ? 'restore' : 'archive'} '${flag.key}'? Archived flags are removed from active SDK evaluation snapshots.`}
        confirmLabel={flag.archived ? 'Restore Flag' : 'Archive Flag'}
        variant={flag.archived ? 'primary' : 'danger'}
        onConfirm={handleArchive}
        onCancel={() => setArchiveConfirm(false)}
      />
    </div>
  );
}
