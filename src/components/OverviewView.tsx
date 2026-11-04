import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Code2,
  Compass,
  FolderGit2,
  Lock,
  PlayCircle,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import {
  formatIntegrationStatus,
  formatRunStatus,
  formatShortDate,
  IntegrationWithAccess,
} from '../lib/api';
import { AuditEvent, Category, Developer, GenerationRun, ModelOption } from '../shared/types';
import { ProductIcon } from './BrandIcons';

interface OverviewViewProps {
  currentDeveloper: Developer;
  integrations: IntegrationWithAccess[];
  categories: Category[];
  runs: GenerationRun[];
  models: ModelOption[];
  audits: AuditEvent[];
  onNavigate: (view: string, context?: { integrationId?: string; runId?: string }) => void;
  onStartGuidedDemo: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  currentDeveloper,
  integrations,
  categories,
  runs,
  models,
  audits,
  onNavigate,
  onStartGuidedDemo,
}) => {
  const systemCount = integrations.filter((i) => i.isDefault).length;
  const customIntegrations = integrations.filter((i) => !i.isDefault);
  const ownedByMe = customIntegrations.filter((i) => i.ownerId === currentDeveloper.id);
  const configuredModels = models.filter((m) => m.configured && m.allowed);

  return (
    <div className="space-y-8">
      {/* Hero Workspace Banner */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>Workspace: {currentDeveloper.preferences.workspaceName}</span>
            <span aria-hidden="true">·</span>
            <span>Developer: {currentDeveloper.name}</span>
            <span aria-hidden="true">·</span>
            <span>{currentDeveloper.roleTitle}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            From API documentation to trustworthy integration code—with developers in control.
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Validate SaaS API specifications against SSRF and evidence gates, verify documented vs.
            derived vs. unsupported metrics, supervise an 8-agent checkpointed code pipeline with
            human approvals, and export verified TypeScript packages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onStartGuidedDemo}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Compass size={15} className="text-sky-700" />
            Launch Guided Demo
          </button>
          <button
            type="button"
            onClick={() => onNavigate('create')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus size={15} />
            Add Integration
          </button>
        </div>
      </section>

      {/* Metrics Strip (Single-level hairline grid, tabular-nums) */}
      <section className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-500">System Catalog References</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{systemCount}</p>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Lock size={12} className="text-slate-400" />
            Managed by CloudEagle · View only
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-500">My Custom Integrations</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{ownedByMe.length}</p>
          <p className="text-xs text-slate-500 tabular-nums">
            {customIntegrations.length} total custom in {categories.length} categories
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-500">Multi-Agent Generation Runs</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{runs.length}</p>
          <p className="text-xs text-slate-500 tabular-nums">
            {runs.filter((r) => r.status === 'awaiting_approval').length} awaiting approval ·{' '}
            {runs.filter((r) => r.status === 'ready_for_review').length} validated
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-slate-500">Approved Models Available</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {configuredModels.length} / {models.length}
          </p>
          <p className="text-xs text-slate-500">Server-proxied &amp; deterministic sandbox</p>
        </div>
      </section>

      {/* Two-Column Operational Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Recent Runs & Custom Integrations */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Active &amp; Recent Generation Runs
                </h2>
                <p className="text-xs text-slate-500">
                  Durable server-persisted checkpoints survive route switches and browser refreshes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('catalog')}
                className="text-xs font-medium text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 whitespace-nowrap"
              >
                Browse Catalog
                <ArrowRight size={13} />
              </button>
            </div>

            {runs.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                  <FolderGit2 size={18} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    No generation runs started yet
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Create a custom integration (such as Calendly in the Scheduling category),
                    validate its API documentation, and launch a supervised multi-agent run.
                  </p>
                </div>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('create')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
                  >
                    <Plus size={14} />
                    Create Custom Integration
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {runs.slice(0, 5).map((run) => {
                  const integ = integrations.find((i) => i.id === run.integrationId);
                  return (
                    <div
                      key={run.id}
                      className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <ProductIcon
                          iconKey={integ?.iconKey ?? 'custom'}
                          name={integ?.name ?? 'Integration'}
                          size="sm"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {integ?.name ?? run.integrationId}
                            </span>
                            <span className="text-xs font-mono text-slate-500">{run.id}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                            <span
                              className={
                                run.status === 'ready_for_review'
                                  ? 'text-emerald-700 font-medium'
                                  : run.status === 'failed' || run.status === 'blocked'
                                  ? 'text-rose-700 font-medium'
                                  : run.status === 'awaiting_approval'
                                  ? 'text-amber-700 font-medium'
                                  : 'text-sky-700 font-medium'
                              }
                            >
                              {formatRunStatus(run.status)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Checkpoint v{run.checkpointVersion}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              {run.modelId}
                              {run.isSimulatedModel ? ' (simulated)' : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatShortDate(run.updatedAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate('runs', { integrationId: run.integrationId, runId: run.id })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap"
                        >
                          <PlayCircle size={13} />
                          Supervise Run
                        </button>
                        {(run.status === 'ready_for_review' || run.checkpointVersion >= 5) && (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate('code', {
                                integrationId: run.integrationId,
                                runId: run.id,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 transition-colors whitespace-nowrap"
                          >
                            <Code2 size={13} />
                            Code
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {customIntegrations.length > 0 && (
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Latest custom integration:{' '}
                <strong className="text-slate-900">{customIntegrations[0].name}</strong> (
                {formatIntegrationStatus(customIntegrations[0].status)})
              </span>
              <button
                type="button"
                onClick={() => onNavigate('my_integrations')}
                className="font-medium text-sky-700 hover:underline whitespace-nowrap"
              >
                Open My Integrations
              </button>
            </div>
          )}
        </div>

        {/* Right: Governance & Recent Audit Trail */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Workspace Audit Trail</h2>
                <p className="text-xs text-slate-500">
                  Server-verified actor attribution and RBAC enforcement log
                </p>
              </div>
              <BookOpen size={15} className="text-slate-400" />
            </div>

            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {audits.slice(0, 7).map((audit) => (
                <div key={audit.id} className="px-6 py-3 space-y-1">
                  <p className="text-xs text-slate-800 leading-snug">{audit.summary}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                    <span className="font-medium text-slate-700">{audit.actorName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[11px]">{audit.action}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatShortDate(audit.time)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
            <ShieldAlert size={15} className="text-slate-500 shrink-0 mt-0.5" />
            <span>
              Switch between <strong>Asha Patel</strong> and <strong>Ravi Menon</strong> in the top
              bar Demo Identity Switcher to verify creator-only RBAC and system immutability.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
