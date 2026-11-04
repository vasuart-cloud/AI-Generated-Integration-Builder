import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  formatShortDate,
  IntegrationWithAccess,
  studioApi,
} from '../lib/api';
import { GenerationRun, TraceEvent } from '../shared/types';

interface TracesViewProps {
  actorId: string;
  runs: GenerationRun[];
  integrations: IntegrationWithAccess[];
  initialRunId: string | null;
  initialAgentId: string | null;
  initialIntegrationId: string | null;
  initialTraceId?: string | null;
  onJumpToRunWorkbench: (runId: string) => void;
  onRetryFailedRun: (runId: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const TracesView: React.FC<TracesViewProps> = ({
  actorId,
  runs,
  integrations,
  initialRunId,
  initialAgentId,
  initialIntegrationId,
  initialTraceId,
  onJumpToRunWorkbench,
  onRetryFailedRun,
  onNotify,
}) => {
  const [runFilter, setRunFilter] = useState<string>(initialRunId ?? '');
  const [integrationFilter, setIntegrationFilter] = useState<string>(initialIntegrationId ?? '');
  const [agentFilter, setAgentFilter] = useState<string>(initialAgentId ?? 'all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(initialTraceId ?? null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setRunFilter(initialRunId ?? '');
  }, [initialRunId]);

  useEffect(() => {
    setAgentFilter(initialAgentId ?? 'all');
  }, [initialAgentId]);

  useEffect(() => {
    setIntegrationFilter(initialIntegrationId ?? '');
  }, [initialIntegrationId]);

  useEffect(() => {
    if (initialTraceId) {
      setSelectedTraceId(initialTraceId);
    }
  }, [initialTraceId]);

  const fetchTraces = async () => {
    setLoading(true);
    try {
      const res = await studioApi.getTraces(actorId, {
        runId: runFilter || undefined,
        integrationId: integrationFilter || undefined,
        agentId: agentFilter !== 'all' ? agentFilter : undefined,
        level: levelFilter !== 'all' ? levelFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setTraces(res.traces);
      if (res.traces.length > 0) {
        setSelectedTraceId((prev) =>
          prev && res.traces.some((t) => t.id === prev) ? prev : res.traces[0].id
        );
      } else {
        setSelectedTraceId(null);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to fetch redacted traces.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraces();
  }, [actorId, runFilter, integrationFilter, agentFilter, levelFilter]);

  const selectedTrace = traces.find((t) => t.id === selectedTraceId) ?? traces[0] ?? null;
  const associatedRun = selectedTrace
    ? runs.find((r) => r.id === selectedTrace.runId)
    : undefined;
  const associatedIntegration = selectedTrace
    ? integrations.find((i) => i.id === selectedTrace.integrationId)
    : undefined;

  const handleCopyTraceId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
      onNotify('info', `Copied trace ID ${id} to clipboard.`);
    } catch {
      onNotify('info', `Trace ID: ${id}`);
    }
  };

  const handleDownloadSanitizedLogs = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        redactionPolicy: 'Bearer tokens, API keys, OAuth secrets, and email PII automatically scrubbed',
        count: traces.length,
        traces,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloudeagle-sanitized-traces-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onNotify('success', 'Downloaded sanitized trace log bundle.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Redacted Traces &amp; Observability
          </h1>
          <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
            <ShieldCheck size={14} className="text-teal-700" />
            Tokens, Bearer headers, API keys, OAuth codes, and member email PII are automatically
            redacted server-side before persistence or export.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchTraces}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            disabled={traces.length === 0}
            onClick={handleDownloadSanitizedLogs}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            <Download size={13} />
            Download Sanitized Logs
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchTraces();
          }}
          className="relative lg:col-span-2 flex gap-2"
        >
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              aria-label="Search traces"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search trace ID, request ID, error class, message..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            Search
          </button>
        </form>

        <select
          aria-label="Filter traces by integration"
          value={integrationFilter}
          onChange={(e) => setIntegrationFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Integrations</option>
          {integrations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter traces by run"
          value={runFilter}
          onChange={(e) => setRunFilter(e.target.value)}
          className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Runs &amp; Doc Gates</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} ({r.status})
            </option>
          ))}
        </select>

        <select
          aria-label="Filter traces by agent"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Agents / Stages</option>
          <option value="orchestrator">Orchestrator</option>
          <option value="doc_analyst">Documentation Analyst</option>
          <option value="capability_agent">Capability &amp; Mapping</option>
          <option value="auth_agent">Authentication Agent</option>
          <option value="client_code_agent">Client Code Agent</option>
          <option value="resilience_agent">Resilience Agent</option>
          <option value="security_reviewer">Security Reviewer</option>
          <option value="test_packaging_agent">Test &amp; Packaging</option>
        </select>

        <select
          aria-label="Filter traces by severity level"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Levels</option>
          <option value="error">Errors Only</option>
          <option value="security">Security Blocks</option>
          <option value="warn">Warnings</option>
          <option value="info">Info / Checkpoints</option>
        </select>
      </div>

      {/* Master-Detail Trace Timeline & Inspector */}
      {loading && traces.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900">Loading redacted trace events...</p>
          <p className="text-xs text-slate-500">Fetching sanitized observability timeline from server.</p>
        </div>
      ) : traces.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900">No trace events match current filters</p>
          <p className="text-xs text-slate-500">
            Validate documentation or start a multi-agent run to generate structured trace events.
          </p>
          {(runFilter || integrationFilter || agentFilter !== 'all' || levelFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setRunFilter('');
                setIntegrationFilter('');
                setAgentFilter('all');
                setLevelFilter('all');
                setSearchQuery('');
              }}
              className="mt-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Clear Trace Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Trace Event List */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 text-xs font-semibold text-slate-700 flex justify-between">
              <span>Trace Timeline</span>
              <span className="tabular-nums text-slate-400">{traces.length} events</span>
            </div>

            <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
              {traces.map((tr) => {
                const active = selectedTrace?.id === tr.id;
                return (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => setSelectedTraceId(tr.id)}
                    className={`w-full text-left p-4 space-y-1.5 transition-colors ${
                      active ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                      <span
                        className={`font-semibold ${
                          tr.level === 'error' || tr.level === 'security'
                            ? 'text-rose-700'
                            : tr.level === 'warn'
                            ? 'text-amber-700'
                            : 'text-slate-800'
                        }`}
                      >
                        [{tr.level.toUpperCase()}] {tr.type}
                      </span>
                      <span className="text-slate-400">{formatShortDate(tr.timestamp)}</span>
                    </div>
                    <p className="text-xs text-slate-700 line-clamp-2">{tr.message}</p>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                      <span>{tr.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{tr.runId}</span>
                      {tr.durationMs !== undefined && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{tr.durationMs}ms</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Selected Trace Detail Inspector */}
          {selectedTrace && (
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="space-y-1">
                  <div className="text-xs font-mono text-slate-500 flex items-center gap-2">
                    <span>{selectedTrace.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>Req: {selectedTrace.requestId}</span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900">
                    Trace Event Detail ({selectedTrace.type})
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyTraceId(selectedTrace.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    {copiedId === selectedTrace.id ? <Check size={13} /> : <Copy size={13} />}
                    Copy Trace ID
                  </button>

                  {associatedRun && (
                    <button
                      type="button"
                      onClick={() => onJumpToRunWorkbench(associatedRun.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg"
                    >
                      Open Run
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <p className="text-sm text-slate-900 leading-relaxed font-medium">
                  {selectedTrace.message}
                </p>

                {selectedTrace.errorClassification && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold font-mono">
                        Classification: {selectedTrace.errorClassification}
                      </div>
                      {selectedTrace.recommendedAction && (
                        <div className="mt-1">
                          <strong>Recommended Action:</strong> {selectedTrace.recommendedAction}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs border-t border-slate-200 pt-4 tabular-nums">
                <div>
                  <dt className="text-slate-500">Integration</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {associatedIntegration?.name ?? selectedTrace.integrationId}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Agent / Stage</dt>
                  <dd className="font-mono text-slate-900 mt-0.5">
                    {selectedTrace.agentId ?? 'pipeline'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Provider / Model</dt>
                  <dd className="font-mono text-slate-900 mt-0.5">
                    {selectedTrace.providerModel
                      ? `${selectedTrace.providerModel}${
                          selectedTrace.isSimulated ? ' (simulated)' : ''
                        }`
                      : 'Deterministic Server Policy'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Duration &amp; Timestamp</dt>
                  <dd className="text-slate-900 mt-0.5">
                    {selectedTrace.durationMs !== undefined ? `${selectedTrace.durationMs}ms · ` : ''}
                    {formatShortDate(selectedTrace.timestamp)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-700">
                  Sanitized Metadata &amp; Redacted Payload
                </div>
                <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
                  {JSON.stringify(selectedTrace.sanitizedMetadata, null, 2)}
                </pre>
              </div>

              {associatedRun &&
                (associatedRun.status === 'failed' || associatedRun.status === 'blocked') &&
                associatedIntegration?.access.canEdit && (
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-600">
                      Run <code className="font-mono">{associatedRun.id}</code> is currently{' '}
                      <strong>{associatedRun.status}</strong>.
                    </span>
                    <button
                      type="button"
                      onClick={() => onRetryFailedRun(associatedRun.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
                    >
                      <RotateCcw size={13} />
                      Clear Fault &amp; Retry Step
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
