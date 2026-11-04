import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  FlaskConical,
  Lock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import {
  formatRunStatus,
  formatShortDate,
  IntegrationWithAccess,
  RunDetailPayload,
  studioApi,
} from '../lib/api';
import {
  AgentStep,
  Approval,
  Developer,
  FailureInjectionType,
  GenerationRun,
} from '../shared/types';

interface AgentWorkbenchViewProps {
  actorId: string;
  currentDeveloper: Developer;
  runs: GenerationRun[];
  integrations: IntegrationWithAccess[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onOpenCodeWorkspace: (integrationId: string, runId: string) => void;
  onOpenTraceView: (runId: string, agentId?: string, traceId?: string) => void;
  onCreateIntegration: () => void;
  onRefreshBootstrap: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const DEMO_LAB_FAULTS: Array<{ value: FailureInjectionType; label: string }> = [
  { value: 'none', label: 'None (Nominal Execution)' },
  { value: 'auth_401', label: 'Auth 401 — Expired / Invalid Token' },
  { value: 'permission_403', label: 'Permission 403 — Missing Scope' },
  { value: 'rate_limit_429', label: 'Rate Limit 429 — Retry-After Exhausted' },
  { value: 'provider_500', label: 'Provider 500 — Upstream Gateway Error' },
  { value: 'invalid_schema', label: 'Invalid JSON / Schema Mismatch' },
  { value: 'unsafe_pagination_redirect', label: 'Unsafe Cross-Origin Pagination Redirect' },
  { value: 'model_unavailable', label: 'Selected LLM Unavailable (503)' },
  { value: 'security_blocking_issue', label: 'Security Reviewer Blocking Secret Issue' },
  { value: 'interrupted_run', label: 'Interrupted Worker Mid-Stage' },
];

export const AgentWorkbenchView: React.FC<AgentWorkbenchViewProps> = ({
  actorId,
  runs,
  integrations,
  selectedRunId,
  onSelectRun,
  onOpenCodeWorkspace,
  onOpenTraceView,
  onCreateIntegration,
  onRefreshBootstrap,
  onNotify,
}) => {
  const effectiveRunId = selectedRunId ?? runs[0]?.id ?? null;
  const [detail, setDetail] = useState<RunDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [approvalFeedback, setApprovalFeedback] = useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const loadRunDetail = async (id: string) => {
    setLoading(true);
    try {
      const payload = await studioApi.getRun(actorId, id);
      setDetail(payload);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to load run details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveRunId) {
      loadRunDetail(effectiveRunId);
    } else {
      setDetail(null);
    }
  }, [effectiveRunId, actorId]);

  const handleControl = async (command: 'pause' | 'resume' | 'cancel' | 'retry') => {
    if (!detail) return;
    setActionBusy(true);
    try {
      const next = await studioApi.controlRun(actorId, detail.run.id, command, {
        operationId: `ctrl-${command}-${Date.now()}`,
      });
      setDetail(next);
      await onRefreshBootstrap();
      if (command === 'cancel') {
        setShowCancelConfirm(false);
      }
      onNotify(
        next.run.status === 'failed' || next.run.status === 'blocked' ? 'error' : 'info',
        `Run ${detail.run.id}: ${formatRunStatus(next.run.status)}`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : `Command ${command} failed.`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleApprovalDecision = async (
    approval: Approval,
    decision: 'approve' | 'request_changes' | 'reject'
  ) => {
    if (!detail) return;
    const fb = approvalFeedback[approval.id] ?? '';
    if (decision === 'request_changes' && !fb.trim()) {
      onNotify('error', 'Enter reviewer feedback before clicking Request Changes.');
      return;
    }

    setActionBusy(true);
    try {
      const next = await studioApi.submitApproval(
        actorId,
        detail.run.id,
        approval.id,
        decision,
        fb
      );
      setDetail(next);
      await onRefreshBootstrap();
      if (next.run.status === 'ready_for_review') {
        onNotify('success', 'Integration code generated and saved successfully.');
      } else {
        onNotify('info', `Checkpoint decision recorded (${decision}).`);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Approval submission failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleFaultInjectionChange = async (fault: FailureInjectionType) => {
    if (!detail) return;
    setActionBusy(true);
    try {
      const next = await studioApi.injectRunFault(actorId, detail.run.id, fault);
      setDetail(next);
      await onRefreshBootstrap();
      if (fault !== 'none') {
        onNotify(
          'error',
          `Demo Lab fault "${fault}" active on run ${detail.run.id}.`
        );
      } else {
        onNotify('info', 'Cleared Demo Lab fault simulation. Ready to retry step.');
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to update Demo Lab fault.');
    } finally {
      setActionBusy(false);
    }
  };

  if (runs.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
        <h1 className="text-lg font-bold text-slate-900">No Multi-Agent Runs Yet</h1>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Create a custom integration, validate its API documentation, select an approved Company
          LLM, and start a supervised code-generation run.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onCreateIntegration}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
          >
            Create Integration &amp; Start Run
          </button>
        </div>
      </div>
    );
  }

  const run = detail?.run;
  const integration =
    detail?.integration ?? integrations.find((i) => i.id === run?.integrationId);
  const canEdit = integration?.access.canEdit ?? false;
  const pendingApproval = detail?.approvals.find((a) => a.status === 'pending');

  const completedStagesCount =
    detail?.steps.filter((s) => s.status === 'succeeded').length ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Run Selector & Progress Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">Multi-Agent Workbench</span>
            {run && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{run.id}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {completedStagesCount} / 8 stages succeeded
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Checkpoint v{run.checkpointVersion}</span>
              </>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {integration?.name ?? 'Integration'} — Supervised Generation Pipeline
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="workbench-run-picker" className="sr-only">
            Select Generation Run
          </label>
          <select
            id="workbench-run-picker"
            aria-label="Select generation run"
            value={effectiveRunId ?? ''}
            onChange={(e) => onSelectRun(e.target.value)}
            className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            {runs.map((r) => {
              const intName =
                integrations.find((i) => i.id === r.integrationId)?.name ?? r.integrationId;
              return (
                <option key={r.id} value={r.id}>
                  {intName} · {r.id} ({formatRunStatus(r.status)})
                </option>
              );
            })}
          </select>

          {run && (
            <button
              type="button"
              onClick={() => loadRunDetail(run.id)}
              aria-label="Refresh run state from server"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Sync Checkpoint
            </button>
          )}
        </div>
      </div>

      {/* Persistent Contextual Failure Banner (with direct View Trace link!) */}
      {run?.failureBanner && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-rose-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-bold text-rose-950 flex flex-wrap items-center gap-2">
                <span>{run.failureBanner.title}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{run.failureBanner.code}</span>
              </div>
              <p className="text-rose-900 leading-relaxed">{run.failureBanner.message}</p>
              <p className="text-rose-800">
                <strong>Recommended Remediation:</strong> {run.failureBanner.remediation}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                onOpenTraceView(
                  run.id,
                  run.failureBanner?.failedAgentId,
                  run.failureBanner?.traceId
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-900 bg-white border border-rose-300 hover:bg-rose-100 rounded-lg whitespace-nowrap"
            >
              View Trace ({run.failureBanner.traceId})
              <ExternalLink size={12} />
            </button>
            {canEdit && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleControl('retry')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg whitespace-nowrap"
              >
                <RotateCcw size={13} />
                Retry Step
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success Completion Banner */}
      {run?.status === 'ready_for_review' && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-bold text-emerald-950 text-sm">
                Integration code generated and saved successfully.
              </p>
              <p className="text-emerald-900 tabular-nums">
                Run <code className="font-mono">{run.id}</code> · Code v{run.codeVersion} ·{' '}
                {detail?.artifacts.length ?? 0} files generated ·{' '}
                {run.verificationResults.filter((v) => v.passed).length}/
                {run.verificationResults.length} static &amp; fixture checks passed ·{' '}
                <strong>Not deployed to production</strong>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenCodeWorkspace(run.integrationId, run.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
            >
              <Code2 size={14} />
              View &amp; Edit Code
            </button>
            <button
              type="button"
              onClick={() => onOpenTraceView(run.id)}
              className="px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg whitespace-nowrap"
            >
              Review Trace
            </button>
          </div>
        </div>
      )}

      {/* Non-Owner View-Only Notice */}
      {!canEdit && integration && (
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-700 flex items-center gap-2">
          <Lock size={14} className="text-slate-500 shrink-0" />
          <span>{integration.access.reason} Run controls and approvals are read-only.</span>
        </div>
      )}

      {/* 3-Column Standout Workbench Layout */}
      {detail && run && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: 8-Stage Agent Execution Graph / Pipeline */}
          <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Agent Execution Graph (Sequential DAG)
              </h2>
              <p className="text-xs text-slate-500">
                Dependencies &amp; durable checkpoints per stage
              </p>
            </div>

            <div className="divide-y divide-slate-200">
              {detail.steps.map((step: AgentStep) => {
                const isCurrent = run.currentStage === step.agentId;
                return (
                  <div
                    key={step.id}
                    className={`p-4 space-y-2 transition-colors ${
                      isCurrent ? 'bg-sky-50/50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                          <span className="font-mono text-slate-400 tabular-nums">
                            0{step.sequenceOrder}.
                          </span>
                          <span>{step.agentName}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {step.executionEngine}
                          {step.isSimulatedEngine ? ' (simulated)' : ''}
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-semibold whitespace-nowrap ${
                          step.status === 'succeeded'
                            ? 'text-emerald-700'
                            : step.status === 'waiting_approval'
                            ? 'text-amber-700'
                            : step.status === 'failed'
                            ? 'text-rose-700'
                            : step.status === 'paused'
                            ? 'text-slate-700'
                            : step.status === 'cancelled'
                            ? 'text-slate-400'
                            : 'text-sky-700'
                        }`}
                      >
                        {step.status.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">{step.activitySummary}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums pt-1">
                      <span>
                        {step.dependsOn.length > 0
                          ? `Depends on: ${step.dependsOn.join(', ')}`
                          : 'Entrypoint stage'}
                        {step.durationMs !== undefined ? ` · ${step.durationMs}ms` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenTraceView(run.id, step.agentId)}
                        className="text-sky-700 hover:underline font-medium"
                      >
                        Trace
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CENTER COLUMN: Mandatory Human Approval Gate + Observable Agent Activity Feed */}
          <div className="xl:col-span-5 space-y-6">
            {/* Active Mandatory Approval Card */}
            {pendingApproval && (
              <div className="bg-white border-2 border-amber-400 rounded-xl p-5 space-y-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      Mandatory Human-in-the-Loop Checkpoint · Risk: {pendingApproval.riskLevel}
                    </div>
                    <h2 className="text-base font-bold text-slate-900">
                      {pendingApproval.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenTraceView(run.id, pendingApproval.gateAgentId)}
                    className="text-xs font-medium text-sky-700 hover:underline whitespace-nowrap"
                  >
                    Inspect Trace
                  </button>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">
                  {pendingApproval.requestedAction}
                </p>

                <div className="space-y-2 text-xs">
                  <div className="font-semibold text-slate-900">Grounded Evidence</div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {pendingApproval.evidenceItems.map((ev, idx) => (
                      <li key={idx}>{ev}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5 text-xs">
                  <div className="font-semibold text-amber-950">
                    Unsupported Fields &amp; Scope Disclosures
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-amber-900">
                    {pendingApproval.unavailableDisclosures.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                </div>

                <div className="text-xs text-slate-500">
                  <strong>Affected Artifacts:</strong>{' '}
                  <span className="font-mono">
                    {pendingApproval.affectedArtifacts.join(', ')}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor={`feedback-${pendingApproval.id}`}
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Reviewer Note / Change Feedback (required for Request Changes)
                  </label>
                  <textarea
                    id={`feedback-${pendingApproval.id}`}
                    rows={2}
                    disabled={!canEdit}
                    value={approvalFeedback[pendingApproval.id] ?? ''}
                    onChange={(e) =>
                      setApprovalFeedback((prev) => ({
                        ...prev,
                        [pendingApproval.id]: e.target.value,
                      }))
                    }
                    placeholder="Add audit note or specify required adjustments..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    disabled={!canEdit || actionBusy}
                    onClick={() => handleApprovalDecision(pendingApproval, 'reject')}
                    className="px-3.5 py-2 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg disabled:opacity-40"
                  >
                    Reject &amp; Block
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || actionBusy}
                    onClick={() => handleApprovalDecision(pendingApproval, 'request_changes')}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40"
                  >
                    Request Changes
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || actionBusy}
                    onClick={() => handleApprovalDecision(pendingApproval, 'approve')}
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-40"
                  >
                    Approve Checkpoint
                  </button>
                </div>
              </div>
            )}

            {/* Observable Agent Activity Feed (No fabricated private chain-of-thought!) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Observable Agent Activity &amp; Audit Feed
                  </h2>
                  <p className="text-xs text-slate-500">
                    Actionable engineering decisions &amp; citations (private model reasoning is
                    never fabricated)
                  </p>
                </div>
                <Terminal size={15} className="text-slate-400" />
              </div>

              <div className="divide-y divide-slate-200 max-h-[540px] overflow-y-auto">
                {detail.traces.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500 text-center">
                    No activity recorded yet. Resume run to execute next stage.
                  </div>
                ) : (
                  detail.traces.map((tr) => (
                    <div key={tr.id} className="p-4 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2 text-slate-500 tabular-nums">
                        <span
                          className={`font-semibold ${
                            tr.level === 'error' || tr.level === 'security'
                              ? 'text-rose-700'
                              : tr.level === 'warn'
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {tr.type.replace('_', ' ')}
                          {tr.providerModel
                            ? ` · ${tr.providerModel}${tr.isSimulated ? ' (simulated)' : ''}`
                            : ''}
                        </span>
                        <span>{formatShortDate(tr.timestamp)}</span>
                      </div>
                      <p className="text-slate-800 leading-relaxed">{tr.message}</p>
                      {tr.recommendedAction && (
                        <p className="text-slate-600">
                          <strong>Next action:</strong> {tr.recommendedAction}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>{tr.id}</span>
                        <button
                          type="button"
                          onClick={() => onOpenTraceView(run.id, tr.agentId, tr.id)}
                          className="text-sky-700 hover:underline font-sans"
                        >
                          Open Redacted Trace
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Run Controls + Checkpoint Provenance + Demo Failure Lab */}
          <div className="xl:col-span-3 space-y-5">
            {/* Persistent Run Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-slate-900">Run Controls &amp; State</h2>
                <p className="text-xs text-slate-500">
                  Status: <strong className="text-slate-900">{formatRunStatus(run.status)}</strong>
                </p>
              </div>

              {run.status === 'paused' && (
                <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-950 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Clock size={13} />
                    Paused at Checkpoint v{run.checkpointVersion}
                  </div>
                  <p>
                    Next stage on Resume: <code className="font-mono">{run.currentStage}</code>.
                    Completed stages, approvals, and generated files are preserved across browser
                    refresh.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={
                    !canEdit ||
                    actionBusy ||
                    run.status === 'paused' ||
                    run.status === 'cancelled' ||
                    run.status === 'ready_for_review'
                  }
                  onClick={() => handleControl('pause')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 whitespace-nowrap"
                >
                  <Pause size={13} />
                  Pause Run
                </button>

                <button
                  type="button"
                  disabled={!canEdit || actionBusy || run.status !== 'paused'}
                  onClick={() => handleControl('resume')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-40 whitespace-nowrap"
                >
                  <Play size={13} />
                  Resume
                </button>

                <button
                  type="button"
                  disabled={
                    !canEdit ||
                    actionBusy ||
                    (run.status !== 'failed' && run.status !== 'blocked')
                  }
                  onClick={() => handleControl('retry')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg disabled:opacity-40 whitespace-nowrap"
                >
                  <RotateCcw size={13} />
                  Retry Step
                </button>

                <button
                  type="button"
                  disabled={!canEdit || actionBusy || run.status === 'cancelled'}
                  onClick={() => setShowCancelConfirm(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-lg disabled:opacity-40 whitespace-nowrap"
                >
                  <Square size={12} />
                  Cancel Run
                </button>
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-500">Selected Model</span>
                  <span className="font-mono text-slate-900 truncate max-w-[150px]">
                    {run.modelId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Execution Mode</span>
                  <span className="font-medium text-slate-900">
                    {run.isSimulatedModel ? 'Simulated Demo' : 'Live Server SDK'}
                  </span>
                </div>
                <div className="flex justify-between tabular-nums">
                  <span className="text-slate-500">Generated Files</span>
                  <span className="font-medium text-slate-900">{detail.artifacts.length}</span>
                </div>
                <div className="flex justify-between tabular-nums">
                  <span className="text-slate-500">Approvals Signed</span>
                  <span className="font-medium text-slate-900">
                    {detail.approvals.filter((a) => a.status === 'approved').length} / 3
                  </span>
                </div>
              </div>

              {detail.artifacts.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenCodeWorkspace(run.integrationId, run.id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <Code2 size={14} />
                  Open Code Workspace ({detail.artifacts.length} files)
                </button>
              )}
            </div>

            {/* Demo Lab Deterministic Failure Toggle Panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <FlaskConical size={15} className="text-amber-700" />
                Demo Lab: Fault Simulation
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Clearly labeled deterministic fault injector. Injecting a fault genuinely transitions
                the run to failed/blocked, logs a redacted trace, and blocks success until resolved.
              </p>

              <label htmlFor="demo-lab-fault-select" className="sr-only">
                Select Demo Lab Fault Simulation
              </label>
              <select
                id="demo-lab-fault-select"
                aria-label="Demo Lab Fault Simulation"
                disabled={!canEdit || actionBusy || run.status === 'cancelled'}
                value={run.activeFailureInjection}
                onChange={(e) =>
                  handleFaultInjectionChange(e.target.value as FailureInjectionType)
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                {DEMO_LAB_FAULTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              {run.activeFailureInjection !== 'none' && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Active simulation: <code>{run.activeFailureInjection}</code>. Set back to{' '}
                    <strong>None</strong> and click <strong>Retry Step</strong> to recover.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Run Confirmation Dialog (Explicitly distinguishes Cancel Run vs Delete Integration) */}
      {showCancelConfirm && run && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-run-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start justify-between">
              <h2 id="cancel-run-title" className="text-base font-bold text-slate-900">
                Permanently Cancel Run {run.id}?
              </h2>
              <button
                type="button"
                aria-label="Dismiss cancel run dialog"
                onClick={() => setShowCancelConfirm(false)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cancelling this generation run permanently terminates pending agent tasks and disables
              resuming this run. Already generated draft files and audit traces will be retained,
              and your integration definition ({integration?.name}) will <strong>not</strong> be
              deleted.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Keep Run Active
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleControl('cancel')}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Confirm Cancel Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
