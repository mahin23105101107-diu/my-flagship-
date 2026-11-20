import { useEffect, useState } from 'react';
import { RotateCcw, CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { apiFetch, ApiProblemError } from '../api/client.ts';
import type { AuditLog, ChangeRequest, FlagVersion, User } from '../types/flagship.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface ChangeHistoryPageProps {
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export function ChangeHistoryPage({ onNotify }: ChangeHistoryPageProps) {
  const [tab, setTab] = useState<'versions' | 'audit'>('versions');
  const [versions, setVersions] = useState<FlagVersion[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [rollbackTarget, setRollbackTarget] = useState<FlagVersion | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [vRes, aRes] = await Promise.all([
        apiFetch<{ items: FlagVersion[] }>('/api/v1/versions'),
        apiFetch<{ items: AuditLog[] }>('/api/v1/audit?size=40'),
      ]);
      setVersions(vRes.items);
      setAudits(aRes.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const confirmRollback = async () => {
    if (!rollbackTarget) return;
    try {
      const res = await apiFetch<{ newVersion: number }>(`/api/v1/versions/${rollbackTarget.id}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ reason: `Rolled back via Change History UI to v${rollbackTarget.version}` }),
      });
      onNotify(
        'success',
        'Rollback Executed',
        `${rollbackTarget.flag_key} restored to v${rollbackTarget.version} (now v${res.newVersion}).`,
      );
      setRollbackTarget(null);
      load();
    } catch (err) {
      onNotify('error', 'Rollback failed', err instanceof ApiProblemError ? err.detail : 'Requires Approver role.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Change History
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Immutable version snapshots (Command Pattern rollback) and platform audit trail.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setTab('versions')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'versions'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Flag Versions &amp; Rollback
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'audit'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Audit Logs
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : tab === 'versions' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {versions.map((v) => (
            <div key={v.id} className="p-4 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 flex-1 min-w-[260px]">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {v.flag_key}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                    v{v.version}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{v.env_name}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">by {v.author_name}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{v.reason}</p>
                <pre className="mt-1.5 rounded bg-slate-50 dark:bg-slate-950 p-2 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                  {JSON.stringify(v.snapshot)}
                </pre>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {new Date(v.created_at).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => setRollbackTarget(v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Rollback to v{v.version}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {a.actor_email}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {a.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(rollbackTarget)}
        title={`Rollback ${rollbackTarget?.flag_key} to v${rollbackTarget?.version}?`}
        description="This restores the exact configuration snapshot from that version, creates a new version entry, and immediately pushes updates to connected SDKs via SSE."
        confirmLabel="Execute Rollback"
        variant="danger"
        onConfirm={confirmRollback}
        onCancel={() => setRollbackTarget(null)}
      />
    </div>
  );
}

interface ApprovalCenterPageProps {
  currentUser: User;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
  onApprovalResolved: () => void;
}

export function ApprovalCenterPage({
  currentUser,
  onNotify,
  onApprovalResolved,
}: ApprovalCenterPageProps) {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await apiFetch<{ items: ChangeRequest[] }>(`/api/v1/approvals${qs}`);
      setRequests(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const handleDecision = async (cr: ChangeRequest, decision: 'approve' | 'reject') => {
    try {
      await apiFetch(`/api/v1/approvals/${cr.id}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({
          comment: decision === 'approve' ? 'Verified and approved for production' : 'Changes requested',
        }),
      });
      onNotify(
        decision === 'approve' ? 'success' : 'info',
        decision === 'approve' ? 'Production Change Approved' : 'Change Request Rejected',
        `${cr.flag_key} (${cr.env_name})`,
      );
      onApprovalResolved();
      load();
    } catch (err) {
      onNotify(
        'error',
        err instanceof ApiProblemError ? err.title : 'Action Blocked',
        err instanceof ApiProblemError ? err.detail : (err as Error).message,
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
            Approval Center
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Peer-review gate for Production changes. Authors are strictly prevented from self-approving their own requests.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
          {['PENDING', 'APPROVED', 'REJECTED', ''].map((st) => (
            <button
              key={st || 'ALL'}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {st || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No {statusFilter.toLowerCase() || ''} change requests found.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((cr) => {
            const isSelfAuthored = cr.author_id === currentUser.id;
            return (
              <div
                key={cr.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                        {cr.title}
                      </h3>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        CR #{cr.id} · {cr.env_name}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Author: {cr.author_name} ({cr.author_email}) · Reason: {cr.reason}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cr.status === 'PENDING' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        Pending Review
                      </span>
                    ) : cr.status === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approved by {cr.approval?.approver_name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                        <XCircle className="w-3.5 h-3.5" />
                        Rejected
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                      Before Configuration
                    </div>
                    <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                      {JSON.stringify(cr.beforeSnapshot, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 p-3">
                    <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1.5">
                      Proposed Configuration
                    </div>
                    <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto">
                      {JSON.stringify(cr.afterSnapshot, null, 2)}
                    </pre>
                  </div>
                </div>

                {cr.status === 'PENDING' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {isSelfAuthored ? (
                      <div className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <ShieldAlert className="w-4 h-4" />
                        Self-approval disabled: you authored this request. Switch to Approver/Admin peer to approve.
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Approving immediately updates Production and broadcasts via SSE.
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(cr, 'reject')}
                        className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(cr, 'approve')}
                        className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        Approve &amp; Deploy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
