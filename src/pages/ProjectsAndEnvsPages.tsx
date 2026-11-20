import { useEffect, useState, type FormEvent } from 'react';
import { FolderPlus, KeyRound, Copy, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { apiFetch, ApiProblemError } from '../api/client.ts';
import type { Environment, Project } from '../types/flagship.ts';

interface ProjectsPageProps {
  selectedProjectId: number | null;
  onSelectProject: (id: number) => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onProjectsChanged: () => void;
}

export function ProjectsPage({
  selectedProjectId,
  onSelectProject,
  onNotify,
  onProjectsChanged,
}: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: Project[] }>('/api/v1/projects');
      setProjects(res.items);
    } catch (err) {
      onNotify('error', 'Failed to load projects', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiFetch<Project>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ key, name, description }),
      });
      onNotify('success', 'Project created', `${created.name} initialized with 3 environments.`);
      setKey('');
      setName('');
      setDescription('');
      setShowCreate(false);
      onProjectsChanged();
      load();
    } catch (err) {
      onNotify('error', 'Create project failed', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Projects
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Organize feature flags, segments, and isolated environments by application domain.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white whitespace-nowrap shrink-0"
        >
          <FolderPlus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Create Project</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Project Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!key) {
                    setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                  }
                }}
                placeholder="Billing Microservice"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Project Key
              </label>
              <input
                type="text"
                required
                pattern="[a-z0-9-]+"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase())}
                placeholder="billing-service"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Subscription billing, invoicing, and payment retry flags."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Create Project
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          <div className="h-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">No projects found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => {
            const isSelected = selectedProjectId === p.id;
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-5 bg-white dark:bg-slate-900 transition-colors ${
                  isSelected
                    ? 'border-indigo-500 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                      {p.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      <span>{p.key}</span>
                      <span aria-hidden="true">·</span>
                      <span>Owner: {p.owner_name}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectProject(p.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {isSelected ? 'Active Workspace' : 'Switch To'}
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{p.description}</p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>{p.flag_count ?? 0} feature flags</span>
                  <span aria-hidden="true">·</span>
                  <span>{p.env_count ?? 3} environments</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface EnvironmentsPageProps {
  projectId: number;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function EnvironmentsPage({ projectId, onNotify }: EnvironmentsPageProps) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: Environment[] }>(`/api/v1/environments?projectId=${projectId}`);
      setEnvs(res.items);
    } catch (err) {
      onNotify('error', 'Failed to load environments', (err as Error).message);
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
      await apiFetch('/api/v1/environments', {
        method: 'POST',
        body: JSON.stringify({ projectId, key, name, requireApproval }),
      });
      onNotify('success', 'Environment created', `${name} added to project.`);
      setKey('');
      setName('');
      setRequireApproval(false);
      setShowCreate(false);
      load();
    } catch (err) {
      onNotify('error', 'Failed to create environment', err instanceof ApiProblemError ? err.detail : 'Error');
    }
  };

  const toggleApproval = async (env: Environment) => {
    try {
      await apiFetch(`/api/v1/environments/${env.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ requireApproval: !env.require_approval }),
      });
      onNotify('success', 'Environment updated', `Approval requirement updated for ${env.name}.`);
      load();
    } catch (err) {
      onNotify('error', 'Update failed', err instanceof ApiProblemError ? err.detail : 'Admin role required.');
    }
  };

  const rotateKey = async (env: Environment) => {
    try {
      await apiFetch(`/api/v1/environments/${env.id}/rotate-sdk-key`, { method: 'POST' });
      onNotify('success', 'SDK Key rotated', `New SDK key generated for ${env.name}.`);
      load();
    } catch (err) {
      onNotify('error', 'Key rotation failed', err instanceof ApiProblemError ? err.detail : 'Admin role required.');
    }
  };

  const copyKey = (sdkKey: string) => {
    navigator.clipboard.writeText(sdkKey);
    onNotify('info', 'Copied SDK Key', 'SDK key copied to clipboard.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Environments
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage isolated release stages, SDK authentication keys, and peer-approval guardrails.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white whitespace-nowrap shrink-0"
        >
          Add Environment
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. QA Sandbox)"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              required
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="Key (e.g. qa-sandbox)"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
                className="rounded border-slate-300"
              />
              Require Peer Approval
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Create Environment
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Environment</th>
                  <th className="py-3 px-4">SDK Key</th>
                  <th className="py-3 px-4">Approval Gate</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {envs.map((env) => (
                  <tr key={env.id}>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{env.name}</div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{env.key}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                        <span>{env.sdk_key}</span>
                        <button
                          type="button"
                          onClick={() => copyKey(env.sdk_key)}
                          title="Copy SDK Key"
                          className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {env.require_approval ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <ShieldCheck className="w-4 h-4" />
                          Peer Approval Required
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <ShieldOff className="w-4 h-4" />
                          Direct Updates
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleApproval(env)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Toggle Gate
                      </button>
                      <button
                        type="button"
                        onClick={() => rotateKey(env)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Rotate Key
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
