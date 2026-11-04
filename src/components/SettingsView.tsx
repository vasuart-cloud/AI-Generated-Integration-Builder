import React, { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Lock,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { formatShortDate } from '../lib/api';
import { AuditEvent, Developer, ModelOption } from '../shared/types';

interface SettingsViewProps {
  currentDeveloper: Developer;
  models: ModelOption[];
  audits: AuditEvent[];
  onResetWorkspace: () => Promise<void>;
  onReplayOnboarding: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentDeveloper,
  models,
  audits,
  onResetWorkspace,
  onReplayOnboarding,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const handleConfirmReset = async () => {
    setResetBusy(true);
    try {
      await onResetWorkspace();
      setConfirmReset(false);
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Workspace Settings &amp; Security Governance
          </h1>
          <p className="text-sm text-slate-600">
            Inspect company-approved LLM availability, server-enforced RBAC rules, and workspace
            audit provenance.
          </p>
        </div>

        <button
          type="button"
          onClick={onReplayOnboarding}
          className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap"
        >
          Replay Developer Onboarding
        </button>
      </div>

      {/* Server Model Registry Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Cpu size={16} className="text-sky-700" />
              Company-Approved Model Registry (Server Managed)
            </h2>
            <p className="text-xs text-slate-500">
              Secrets remain strictly in server environment variables; API keys are never accepted
              or rendered in the browser.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4">Configured Model ID</th>
                <th className="py-3 px-4">Compliance &amp; Execution</th>
                <th className="py-3 px-4">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {models.map((m) => (
                <tr key={`${m.provider}-${m.modelId}`}>
                  <td className="py-3 px-4 font-semibold text-slate-900">{m.providerLabel}</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{m.modelId}</td>
                  <td className="py-3 px-4 text-slate-600">{m.complianceLabel}</td>
                  <td className="py-3 px-4">
                    {m.configured && m.allowed ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <CheckCircle2 size={13} />
                        {m.isSimulated ? 'Available (Simulated Sandbox)' : 'Configured & Active'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <Lock size={13} />
                        Disabled — Contact admin to configure
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Enterprise Security & Trust Invariants */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <ShieldCheck size={16} className="text-teal-700" />
          Enforced Security &amp; Trust Controls
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="font-semibold text-slate-900">1. SSRF &amp; Untrusted Docs Isolation</div>
            <p className="text-slate-600 leading-relaxed">
              Documentation fetches run server-side over HTTPS only, blocking localhost, private
              IPs, cloud metadata (<code className="font-mono">169.254.169.254</code>), DNS
              rebinding, oversized payloads, and cross-origin redirects.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="font-semibold text-slate-900">2. RBAC &amp; System Immutability</div>
            <p className="text-slate-600 leading-relaxed">
              Seeded CloudEagle catalog entries return HTTP 403 on mutation for every user. Custom
              integrations allow edit/archive/delete strictly by their creating owner.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="font-semibold text-slate-900">
              3. Honest Metric Boundaries (Zero Fabrication)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Unsupported fields (such as Calendly login history or paid seat utilization) are
              explicitly marked unavailable. Derived 30-day scheduled event counts are clearly
              disclosed as proxies.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
            <div className="font-semibold text-slate-900">
              4. MVP Scope &amp; No Auto-Deployment
            </div>
            <p className="text-slate-600 leading-relaxed">
              Generated code is validated against static security checks and sandbox fixtures, then
              exported as a versioned ZIP. Live production deployment is intentionally out of scope.
            </p>
          </div>
        </div>
      </section>

      {/* Complete Audit Log & Demo Workspace Reset */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Immutable Audit Log</h2>
            <p className="text-xs text-slate-500">
              Active session actor: <strong>{currentDeveloper.name}</strong> ({currentDeveloper.id})
            </p>
          </div>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg"
            >
              <RotateCcw size={13} />
              Reset Demo Workspace
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-800 font-medium">Reset custom demo data?</span>
              <button
                type="button"
                disabled={resetBusy}
                onClick={handleConfirmReset}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="divide-y divide-slate-200 max-h-72 overflow-y-auto text-xs">
          {audits.map((a) => (
            <div key={a.id} className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-900">{a.actorName}</span>{' '}
                <span className="font-mono text-slate-500">[{a.action}]</span> —{' '}
                <span className="text-slate-700">{a.summary}</span>
              </div>
              <span className="text-slate-400 tabular-nums shrink-0">{formatShortDate(a.time)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
