import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, CalendarClock, Sliders, Users } from 'lucide-react';
import { apiFetch, ApiProblemError } from '../api/client.ts';
import { computeDeterministicBucket, type RuleGroupNode } from '../shared/engine.ts';
import type { Environment, FeatureFlag, ScheduledChange, UserSegment } from '../types/flagship.ts';
import { RuleBuilder } from '../components/RuleBuilder.tsx';

interface TargetingPageProps {
  projectId: number;
  selectedEnvId: number;
  environments: Environment[];
  initialFlagId?: number | null;
  onSelectEnv: (envId: number) => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function TargetingRulesPage({
  projectId,
  selectedEnvId,
  environments,
  initialFlagId,
  onSelectEnv,
  onNotify,
}: TargetingPageProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [selectedFlagId, setSelectedFlagId] = useState<number | null>(initialFlagId ?? null);
  const [flagDetail, setFlagDetail] = useState<FeatureFlag | null>(null);
  const [segments, setSegments] = useState<UserSegment[]>([]);

  // Individual target form
  const [targetUserKey, setTargetUserKey] = useState('');
  const [targetVarKey, setTargetVarKey] = useState('');

  // New rule form
  const [ruleName, setRuleName] = useState('');
  const [rulePriority, setRulePriority] = useState(1);
  const [ruleVarKey, setRuleVarKey] = useState('');
  const [ruleTree, setRuleTree] = useState<RuleGroupNode>({
    kind: 'GROUP',
    operator: 'AND',
    children: [{ kind: 'CONDITION', attribute: 'plan', operator: 'EQUALS', value: 'enterprise' }],
  });

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: FeatureFlag[] }>(`/api/v1/flags?projectId=${projectId}&size=50`),
      apiFetch<{ items: UserSegment[] }>(`/api/v1/segments?projectId=${projectId}`),
    ]).then(([fRes, sRes]) => {
      setFlags(fRes.items);
      setSegments(sRes.items);
      if (fRes.items.length > 0 && !selectedFlagId) {
        setSelectedFlagId(fRes.items[0].id);
      }
    });
  }, [projectId]);

  const loadDetail = async (id: number) => {
    const f = await apiFetch<FeatureFlag>(`/api/v1/flags/${id}`);
    setFlagDetail(f);
    if (f.variations.length > 0) {
      setTargetVarKey(f.variations[0].key);
      setRuleVarKey(f.variations[0].key);
    }
  };

  useEffect(() => {
    if (selectedFlagId) loadDetail(selectedFlagId);
  }, [selectedFlagId]);

  const activeCfg = flagDetail?.configurations.find((c) => c.environment_id === selectedEnvId) ?? flagDetail?.configurations[0];

  const addTarget = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeCfg || !targetUserKey.trim()) return;
    try {
      await apiFetch('/api/v1/targeting/targets', {
        method: 'POST',
        body: JSON.stringify({
          flagConfigurationId: activeCfg.id,
          userKey: targetUserKey.trim(),
          variationKey: targetVarKey,
        }),
      });
      setTargetUserKey('');
      onNotify('success', 'User target added', `Pinned ${targetUserKey} to ${targetVarKey}.`);
      loadDetail(flagDetail!.id);
    } catch (err) {
      onNotify('error', 'Failed to add target', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  const removeTarget = async (id: number) => {
    await apiFetch(`/api/v1/targeting/targets/${id}`, { method: 'DELETE' });
    onNotify('info', 'User target removed');
    loadDetail(flagDetail!.id);
  };

  const addRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeCfg || !ruleName.trim()) return;
    try {
      await apiFetch('/api/v1/targeting/rules', {
        method: 'POST',
        body: JSON.stringify({
          flagConfigurationId: activeCfg.id,
          name: ruleName.trim(),
          priority: rulePriority,
          variationKey: ruleVarKey,
          rootRule: ruleTree,
        }),
      });
      setRuleName('');
      onNotify('success', 'Targeting rule created', 'Rule added to evaluation chain.');
      loadDetail(flagDetail!.id);
    } catch (err) {
      onNotify('error', 'Failed to add rule', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  const removeRule = async (id: number) => {
    await apiFetch(`/api/v1/targeting/rules/${id}`, { method: 'DELETE' });
    onNotify('info', 'Targeting rule deleted');
    loadDetail(flagDetail!.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Targeting Rules
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Evaluation Order: 1. Kill Switch · 2. Individual Targets · 3. Priority Segment Rules · 4. Percentage Rollout · 5. Default
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedFlagId ?? ''}
            onChange={(e) => setSelectedFlagId(Number(e.target.value))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
          >
            {flags.map((f) => (
              <option key={f.id} value={f.id}>
                {f.key} ({f.type})
              </option>
            ))}
          </select>
          <select
            value={selectedEnvId}
            onChange={(e) => onSelectEnv(Number(e.target.value))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeCfg && flagDetail && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
              Step 2: Individual User Targets
            </h2>
            <form onSubmit={addTarget} className="flex gap-2">
              <input
                type="text"
                required
                value={targetUserKey}
                onChange={(e) => setTargetUserKey(e.target.value)}
                placeholder="user-vip-99"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <select
                value={targetVarKey}
                onChange={(e) => setTargetVarKey(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              >
                {flagDetail.variations.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.key}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white shrink-0"
              >
                Add
              </button>
            </form>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(activeCfg.targets || []).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                  No individual user overrides in {activeCfg.env_name}.
                </p>
              ) : (
                (activeCfg.targets || []).map((t) => (
                  <div key={t.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-800 dark:text-slate-200">{t.user_key}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">
                        → {t.variation_key}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTarget(t.id)}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                Step 3: Active Priority Rules ({activeCfg.env_name})
              </h2>
              {(activeCfg.rules || []).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No segment or attribute rules configured for this environment.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {(activeCfg.rules || []).map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          #{r.priority} {r.name} → <span className="font-mono text-indigo-600 dark:text-indigo-400">{r.variation_key}</span>
                        </div>
                        <pre className="mt-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 overflow-x-auto">
                          {JSON.stringify(r.rootRule)}
                        </pre>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRule(r.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={addRule}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                Add New Composite Targeting Rule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Rule Name"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  min={1}
                  value={rulePriority}
                  onChange={(e) => setRulePriority(Number(e.target.value))}
                  placeholder="Priority"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <select
                  value={ruleVarKey}
                  onChange={(e) => setRuleVarKey(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                >
                  {flagDetail.variations.map((v) => (
                    <option key={v.key} value={v.key}>
                      Serve: {v.key}
                    </option>
                  ))}
                </select>
              </div>
              <RuleBuilder node={ruleTree} segments={segments} onChange={setRuleTree} />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Save Targeting Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface SegmentsPageProps {
  projectId: number;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function SegmentsPage({ projectId, onNotify }: SegmentsPageProps) {
  const [segments, setSegments] = useState<UserSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rootRule, setRootRule] = useState<RuleGroupNode>({
    kind: 'GROUP',
    operator: 'AND',
    children: [{ kind: 'CONDITION', attribute: 'email', operator: 'CONTAINS', value: '@partner.io' }],
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: UserSegment[] }>(`/api/v1/segments?projectId=${projectId}`);
      setSegments(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/v1/segments', {
        method: 'POST',
        body: JSON.stringify({ projectId, key, name, description, rootRule }),
      });
      onNotify('success', 'Segment created', `${name} is ready for flag targeting.`);
      setKey('');
      setName('');
      setDescription('');
      load();
    } catch (err) {
      onNotify('error', 'Create segment failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/v1/segments/${id}`, { method: 'DELETE' });
      onNotify('info', 'Segment deleted');
      load();
    } catch (err) {
      onNotify('error', 'Delete failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
          User Segments
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Reusable audience cohorts powered by nested AND/OR Composite rule trees.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-3">
          {loading ? (
            <div className="h-40 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          ) : segments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
              No segments created for this project yet.
            </div>
          ) : (
            segments.map((seg) => (
              <div
                key={seg.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{seg.name}</h3>
                    </div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{seg.key}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(seg.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {seg.description && <p className="text-xs text-slate-600 dark:text-slate-400">{seg.description}</p>}
                <pre className="rounded-md bg-slate-50 dark:bg-slate-950 p-2.5 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                  {JSON.stringify(seg.rootRule, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={handleCreate}
          className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 self-start"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
            Create New Segment
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!key) setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
              }}
              placeholder="Segment Name"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              required
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="segment-key"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
            />
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Audience criteria description"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
          />
          <RuleBuilder node={rootRule} onChange={setRootRule} />
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white"
            >
              Create Segment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RolloutsPageProps {
  projectId: number;
  selectedEnvId: number;
  environments: Environment[];
  onSelectEnv: (id: number) => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function RolloutsPage({
  projectId,
  selectedEnvId,
  environments,
  onSelectEnv,
  onNotify,
}: RolloutsPageProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [schedules, setSchedules] = useState<ScheduledChange[]>([]);
  const [selectedFlagId, setSelectedFlagId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [percentage, setPercentage] = useState(25);
  const [rolloutVarKey, setRolloutVarKey] = useState('');
  const [reason, setReason] = useState('');
  const [schedDate, setSchedDate] = useState(() => new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
  const [schedPct, setSchedPct] = useState(50);

  const load = async () => {
    const [fRes, sRes] = await Promise.all([
      apiFetch<{ items: FeatureFlag[] }>(`/api/v1/flags?projectId=${projectId}&size=50`),
      apiFetch<{ items: ScheduledChange[] }>('/api/v1/rollouts/schedules'),
    ]);
    setFlags(fRes.items);
    setSchedules(sRes.items);
    if (fRes.items.length > 0 && !selectedFlagId) {
      setSelectedFlagId(fRes.items[0].id);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const currentFlag = flags.find((f) => f.id === selectedFlagId) ?? flags[0];
  const currentCfg = currentFlag?.configurations.find((c) => c.environment_id === selectedEnvId);

  useEffect(() => {
    if (currentFlag && currentCfg) {
      setEnabled(Boolean(currentCfg.enabled));
      setPercentage(currentCfg.rollout_percentage);
      setRolloutVarKey(currentCfg.rollout_variation_key || currentFlag.variations[0]?.key || '');
    }
  }, [selectedFlagId, selectedEnvId, flags]);

  const applyRollout = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentFlag || !currentCfg) return;
    try {
      const res = await apiFetch<{ status: string; message?: string }>(
        `/api/v1/targeting/config/${currentFlag.id}/${selectedEnvId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            enabled,
            rolloutPercentage: percentage,
            rolloutVariationKey: rolloutVarKey,
            reason: reason || `Adjust rollout to ${percentage}%`,
          }),
        },
      );
      if (res.status === 'PENDING_APPROVAL') {
        onNotify('info', 'Approval Request Submitted', res.message || 'Queued in Approval Center.');
      } else {
        onNotify('success', 'Rollout Updated', `${currentFlag.key} updated to ${percentage}% in ${currentCfg.env_name}.`);
      }
      setReason('');
      load();
    } catch (err) {
      onNotify('error', 'Rollout update failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  const scheduleRollout = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentFlag) return;
    try {
      await apiFetch('/api/v1/rollouts/schedules', {
        method: 'POST',
        body: JSON.stringify({
          flagId: currentFlag.id,
          environmentId: selectedEnvId,
          scheduledFor: new Date(schedDate).toISOString(),
          payload: { enabled: true, rolloutPercentage: schedPct, rolloutVariationKey: rolloutVarKey },
          reason: `Scheduled expansion to ${schedPct}%`,
        }),
      });
      onNotify('success', 'Rollout Scheduled', `${currentFlag.key} scheduled for ${schedPct}%.`);
      load();
    } catch (err) {
      onNotify('error', 'Schedule failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  const cancelSchedule = async (id: number) => {
    await apiFetch(`/api/v1/rollouts/schedules/${id}`, { method: 'DELETE' });
    onNotify('info', 'Scheduled change cancelled');
    load();
  };

  // Sample cohort preservation check for 8 deterministic user keys
  const sampleUsers = ['alice-101', 'bob-204', 'carol-309', 'dave-412', 'erin-518', 'frank-623', 'grace-731', 'henry-845'];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Rollout Management
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure deterministic MurmurHash3 gradual rollouts and schedule future releases.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedFlagId ?? ''}
            onChange={(e) => setSelectedFlagId(Number(e.target.value))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
          >
            {flags.map((f) => (
              <option key={f.id} value={f.id}>
                {f.key}
              </option>
            ))}
          </select>
          <select
            value={selectedEnvId}
            onChange={(e) => onSelectEnv(Number(e.target.value))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name} {env.require_approval ? '(Approval Gate)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {currentFlag && currentCfg && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={applyRollout}
            className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                  Percentage Rollout ({currentCfg.env_name})
                </h2>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Flag Enabled
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-600 dark:text-slate-400">Traffic Percentage</span>
                <span className="font-mono font-bold text-lg text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {percentage}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={percentage}
                onChange={(e) => setPercentage(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-slate-400 font-mono mt-1">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Rollout Variation
                </label>
                <select
                  value={rolloutVarKey}
                  onChange={(e) => setRolloutVarKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                >
                  {currentFlag.variations.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.key} ({v.name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Change Reason
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Canary ramp-up"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors"
            >
              {currentCfg.require_approval ? 'Submit Change Request for Approval' : 'Apply Rollout Immediately'}
            </button>
          </form>

          <div className="lg:col-span-6 space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                Sticky Cohort Bucket Preview (MurmurHash3)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Users whose deterministic bucket is below {percentage}% receive <span className="font-mono">{rolloutVarKey}</span>. Raising the slider never evicts existing cohort members.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {sampleUsers.map((u) => {
                  const bucket = computeDeterministicBucket(currentFlag.key, u);
                  const included = enabled && bucket < percentage;
                  return (
                    <div
                      key={u}
                      className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-3 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-slate-800 dark:text-slate-200">{u}</span>
                      <span
                        className={`font-mono tabular-nums font-medium ${
                          included ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {bucket.toFixed(1)}% · {included ? rolloutVarKey : currentFlag.default_variation_key}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <form
              onSubmit={scheduleRollout}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                  Schedule Future Rollout
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="datetime-local"
                  required
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="md:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={schedPct}
                  onChange={(e) => setSchedPct(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                Schedule Release
              </button>

              {schedules.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  {schedules.map((sc) => (
                    <div key={sc.id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          {sc.flag_key}
                        </span>{' '}
                        <span className="text-slate-500">
                          ({sc.env_name} · {String(sc.payload.rolloutPercentage)}% · {sc.status})
                        </span>
                      </div>
                      {sc.status === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={() => cancelSchedule(sc.id)}
                          className="text-rose-600 dark:text-rose-400 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
