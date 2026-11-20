import { useEffect, useState, type FormEvent } from 'react';
import {
  UserPlus,
  Wifi,
  WifiOff,
  Activity,
  Copy,
  Sun,
  Moon,
  Play,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, ApiProblemError } from '../api/client.ts';
import { evaluateFlag, type FlagEvaluationConfig, type UserSegmentDefinition } from '../shared/engine.ts';
import type { Environment, SdkInstance, User, UserRole } from '../types/flagship.ts';

interface TeamPageProps {
  currentUser: User;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function TeamRolesPage({ currentUser, onNotify }: TeamPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('flagship123');
  const [role, setRole] = useState<UserRole>('EDITOR');

  const load = async () => {
    const res = await apiFetch<{ items: User[] }>('/api/v1/auth/users');
    setUsers(res.items);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/v1/auth/users', {
        method: 'POST',
        body: JSON.stringify({ email, name, password, role }),
      });
      onNotify('success', 'Team member invited', `${name} added as ${role}.`);
      setEmail('');
      setName('');
      load();
    } catch (err) {
      onNotify('error', 'Failed to add user', err instanceof ApiProblemError ? err.detail : 'Requires Admin role.');
    }
  };

  const changeRole = async (userId: number, nextRole: UserRole) => {
    try {
      await apiFetch(`/api/v1/auth/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      onNotify('success', 'Role updated', `User #${userId} assigned ${nextRole}.`);
      load();
    } catch (err) {
      onNotify('error', 'Role update failed', err instanceof ApiProblemError ? err.detail : 'Requires Admin role.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
          Team Members &amp; Roles
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Four-tier RBAC: VIEWER (read-only), EDITOR (author changes), APPROVER (peer-review &amp; kill switch), ADMIN (full control).
        </p>
      </div>

      {currentUser.role === 'ADMIN' && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Add Team Member
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@flagship.dev"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Temporary Password"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="VIEWER">VIEWER</option>
                <option value="EDITOR">EDITOR</option>
                <option value="APPROVER">APPROVER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
              <th className="py-3 px-4">Member</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4 text-right">Change Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                  {u.name} {u.id === currentUser.id ? '(You)' : ''}
                </td>
                <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">{u.email}</td>
                <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {u.role}
                </td>
                <td className="py-3 px-4 text-right">
                  <select
                    disabled={currentUser.role !== 'ADMIN'}
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
                  >
                    <option value="VIEWER">VIEWER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="APPROVER">APPROVER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SdkSetupPageProps {
  environments: Environment[];
  selectedEnvId: number;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

const SNAPSHOT_STORAGE_PREFIX = 'flagship_sdk_snapshot_v1_';

export function SdkSetupPage({ environments, selectedEnvId, onNotify }: SdkSetupPageProps) {
  const activeEnv = environments.find((e) => e.id === selectedEnvId) ?? environments[0];
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [cachedFlags, setCachedFlags] = useState<Record<string, FlagEvaluationConfig>>({});
  const [cachedSegments, setCachedSegments] = useState<Record<string, UserSegmentDefinition>>({});
  const [simFlagKey, setSimFlagKey] = useState('new-checkout');
  const [simUserKey, setSimUserKey] = useState('user-42');
  const [simOutput, setSimOutput] = useState<string | null>(null);

  const storageKey = activeEnv ? `${SNAPSHOT_STORAGE_PREFIX}${activeEnv.sdk_key}` : '';

  // Load persisted snapshot immediately (FR6 startup resilience)
  useEffect(() => {
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setCachedFlags(parsed.flags || {});
        setCachedSegments(parsed.segments || {});
        setLastSyncTime(parsed.generatedAt || null);
      } catch {
        // ignore corrupt snapshot
      }
    }
  }, [storageKey]);

  // Connect live SSE unless simulateOffline is enabled
  useEffect(() => {
    if (!activeEnv || simulateOffline) {
      setSseConnected(false);
      return;
    }

    const es = new EventSource(`/api/v1/sdk/stream?sdkKey=${encodeURIComponent(activeEnv.sdk_key)}`);
    es.addEventListener('snapshot', (ev) => {
      const snap = JSON.parse((ev as MessageEvent).data);
      setCachedFlags(snap.flags || {});
      setCachedSegments(snap.segments || {});
      setLastSyncTime(new Date().toISOString());
      localStorage.setItem(storageKey, JSON.stringify(snap));
      setSseConnected(true);
    });
    es.addEventListener('flag-update', async () => {
      const snap = await fetch(`/api/v1/sdk/snapshot`, {
        headers: { 'X-FlagShip-SDK-Key': activeEnv.sdk_key },
      }).then((r) => r.json());
      setCachedFlags(snap.flags || {});
      setCachedSegments(snap.segments || {});
      setLastSyncTime(new Date().toISOString());
      localStorage.setItem(storageKey, JSON.stringify(snap));
    });
    es.onerror = () => {
      setSseConnected(false);
    };

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [activeEnv?.sdk_key, simulateOffline]);

  const evaluateLocally = () => {
    const cfg = cachedFlags[simFlagKey];
    if (!cfg) {
      setSimOutput(`OFFLINE_DEFAULT -> false (Flag '${simFlagKey}' not in local snapshot; safe fallback returned)`);
      return;
    }
    const segMap = new Map(Object.entries(cachedSegments));
    const t0 = performance.now();
    const res = evaluateFlag(cfg, { userKey: simUserKey, attributes: { plan: 'enterprise' } }, segMap);
    const micros = Math.max(1, Math.round((performance.now() - t0) * 1000));
    setSimOutput(
      `${res.variationKey} = ${JSON.stringify(res.value)} (reason: ${res.reason}, source: ${
        simulateOffline ? 'LOCAL_DISK_SNAPSHOT' : 'LIVE_MEMORY_CACHE'
      }, time: ${micros} µs)`,
    );
  };

  const mavenSnippet = `<dependency>
  <groupId>io.flagship</groupId>
  <artifactId>flagship-spring-boot-starter</artifactId>
  <version>1.0.0</version>
</dependency>`;

  const yamlSnippet = `flagship:
  server-url: ${window.location.origin}
  sdk-key: ${activeEnv?.sdk_key || 'fs_prod_...'}
  startup-timeout-ms: 1800
  snapshot-file: ./data/flagship-snapshot.json
  sse-enabled: true
  polling-fallback-interval-ms: 30000`;

  const javaSnippet = `@RestController
public class CheckoutController {
    private final FlagShipClient flagShip;

    public CheckoutController(FlagShipClient flagShip) {
        this.flagShip = flagShip;
    }

    @FeatureFlag(value = "new-dashboard", fallbackMethod = "legacyDashboard")
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return Map.of("mode", "next-gen");
    }

    @GetMapping("/checkout")
    public Map<String, Object> checkout(@RequestParam String userId) {
        EvaluationContext ctx = EvaluationContext.builder(userId)
            .attribute("plan", "enterprise")
            .build();
        boolean express = flagShip.isEnabled("new-checkout", ctx);
        return Map.of("expressCheckout", express);
    }
}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
          SDK Setup &amp; Offline Resilience Simulator
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Integrate the FlagShip Spring Boot Starter in under 15 minutes and test live SSE updates vs. local snapshot offline fallback.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {simulateOffline || !sseConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <WifiOff className="w-4 h-4" />
                {simulateOffline ? 'Simulated Server Outage (Evaluating from Local Snapshot)' : 'Connecting SSE...'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <Wifi className="w-4 h-4" />
                SSE Stream Connected ({Object.keys(cachedFlags).length} flags cached)
              </span>
            )}
            {lastSyncTime && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Last Snapshot: {new Date(lastSyncTime).toLocaleTimeString()}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSimulateOffline((v) => !v)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              simulateOffline
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            {simulateOffline ? 'Reconnect Server' : 'Simulate Server Offline'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={simFlagKey}
            onChange={(e) => setSimFlagKey(e.target.value)}
            placeholder="Flag key"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
          />
          <input
            type="text"
            value={simUserKey}
            onChange={(e) => setSimUserKey(e.target.value)}
            placeholder="User key"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={evaluateLocally}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white px-4 py-2"
          >
            <Play className="w-3.5 h-3.5" />
            Evaluate in SDK Cache
          </button>
        </div>

        {simOutput && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-mono text-slate-800 dark:text-slate-200">
            {simOutput}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">1. Maven Dependency (pom.xml)</h2>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(mavenSnippet);
                onNotify('info', 'Copied Maven snippet');
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
          <pre className="rounded-lg bg-slate-950 text-slate-100 p-3.5 text-xs font-mono overflow-x-auto">
            {mavenSnippet}
          </pre>

          <div className="flex items-center justify-between pt-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">2. Configuration (application.yml)</h2>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(yamlSnippet);
                onNotify('info', 'Copied YAML config');
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
          <pre className="rounded-lg bg-slate-950 text-slate-100 p-3.5 text-xs font-mono overflow-x-auto">
            {yamlSnippet}
          </pre>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">3. Spring Boot Usage (@FeatureFlag &amp; FlagShipClient)</h2>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(javaSnippet);
                onNotify('info', 'Copied Java code');
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
          <pre className="rounded-lg bg-slate-950 text-slate-100 p-3.5 text-xs font-mono overflow-x-auto">
            {javaSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function SystemHealthPage() {
  const [health, setHealth] = useState<{
    status: string;
    service: string;
    uptimeSeconds: number;
    connectedSseStreams: number;
    activeSdkInstances: number;
    timestamp: string;
  } | null>(null);
  const [instances, setInstances] = useState<SdkInstance[]>([]);

  const load = async () => {
    const [h, ins] = await Promise.all([
      apiFetch<typeof health>('/api/v1/health'),
      apiFetch<{ items: SdkInstance[] }>('/api/v1/sdk/instances'),
    ]);
    setHealth(h);
    setInstances(ins.items);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            System Health
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Actuator readiness, live SSE transport telemetry, and registered Spring Boot SDK instances.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {health && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Server Status</div>
            <div className="mt-1.5 flex items-center gap-2 text-lg font-bold text-emerald-600 dark:text-emerald-400">
              <Activity className="w-4 h-4" />
              {health.status}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Uptime</div>
            <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {health.uptimeSeconds}s
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Live SSE Streams</div>
            <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {health.connectedSseStreams}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Registered SDK Pods</div>
            <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {health.activeSdkInstances}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Connected SDK Instances</h2>
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            OpenAPI 3.1 Spec
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Instance ID</th>
                <th className="py-3 px-4">Application</th>
                <th className="py-3 px-4">Project · Env</th>
                <th className="py-3 px-4">Transport</th>
                <th className="py-3 px-4 text-right">Sync Latency</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {instances.map((ins) => (
                <tr key={ins.id}>
                  <td className="py-3 px-4 font-mono text-slate-900 dark:text-slate-100">{ins.instance_id}</td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                    {ins.app_name} (v{ins.sdk_version})
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {ins.project_name} · {ins.env_name}
                  </td>
                  <td className="py-3 px-4 font-mono text-indigo-600 dark:text-indigo-400">{ins.transport}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {ins.last_sync_latency_ms} ms
                  </td>
                  <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">{ins.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface SettingsPageProps {
  currentUser: User;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function SettingsPage({ currentUser, darkMode, onToggleDarkMode }: SettingsPageProps) {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Console appearance, operator session details, and resilience policy defaults.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Appearance Theme</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch between crisp Light mode and low-glare Dark mode.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </button>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Signed-in Operator</div>
            <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{currentUser.name}</div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Email</div>
            <div className="mt-1 font-mono text-slate-900 dark:text-slate-100">{currentUser.email}</div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Assigned Role</div>
            <div className="mt-1 font-mono font-semibold text-indigo-600 dark:text-indigo-400">{currentUser.role}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 text-xs">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Quality &amp; SLA Guardrails</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-600 dark:text-slate-400">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-semibold text-slate-800 dark:text-slate-200">SDK Startup Timeout</div>
            <div className="mt-0.5 font-mono">≤ 2,000 ms (falls back to saved disk snapshot)</div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-semibold text-slate-800 dark:text-slate-200">Kill-Switch Propagation SLA</div>
            <div className="mt-0.5 font-mono">≤ 5,000 ms p95 via SSE event-stream</div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-semibold text-slate-800 dark:text-slate-200">Hygiene Stale Thresholds</div>
            <div className="mt-0.5 font-mono">30 days unevaluated · 14 days at 100%</div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
            <div className="font-semibold text-slate-800 dark:text-slate-200">Deterministic Bucketing</div>
            <div className="mt-0.5 font-mono">MurmurHash3 32-bit (10,000 buckets)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
