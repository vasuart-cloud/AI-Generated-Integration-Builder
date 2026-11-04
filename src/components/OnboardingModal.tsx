import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Code2,
  FileSearch,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Developer, DeveloperPreferences } from '../shared/types';

interface OnboardingModalProps {
  developer: Developer;
  onSavePreferences: (patch: Partial<DeveloperPreferences>) => Promise<void>;
  onClose: () => void;
  onExploreCatalog: () => void;
  onCreateFirstIntegration: () => void;
}

const WORKFLOW_STEPS = [
  '1. Choose / Create Integration',
  '2. Validate API Docs',
  '3. Discover Capabilities',
  '4. Choose Approved LLM',
  '5. Supervise Agents',
  '6. Review Code',
  '7. Validate & Save',
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  developer,
  onSavePreferences,
  onClose,
  onExploreCatalog,
  onCreateFirstIntegration,
}) => {
  const initialStep = Math.min(Math.max(developer.preferences.onboardingStep || 1, 1), 3);
  const [step, setStep] = useState<number>(initialStep);
  const [workspaceName, setWorkspaceName] = useState(
    developer.preferences.workspaceName || 'cloudeagle-integrations-prod-prep'
  );
  const [preferredEditor, setPreferredEditor] = useState<'studio_code' | 'monaco_compat'>(
    developer.preferences.preferredEditor || 'studio_code'
  );
  const [saving, setSaving] = useState(false);

  const handleStepChange = async (nextStep: number) => {
    setStep(nextStep);
    await onSavePreferences({ onboardingStep: nextStep });
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await onSavePreferences({ onboardingCompleted: true, onboardingStep: step });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async (destination: 'catalog' | 'create') => {
    setSaving(true);
    try {
      await onSavePreferences({
        onboardingCompleted: true,
        onboardingStep: 3,
        workspaceName: workspaceName.trim() || 'cloudeagle-integrations-prod-prep',
        preferredEditor,
        preferredLanguage: 'typescript',
      });
      onClose();
      if (destination === 'create') {
        onCreateFirstIntegration();
      } else {
        onExploreCatalog();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full overflow-hidden shadow-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-900">Developer Onboarding</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Step {step} of 3</span>
            <span aria-hidden="true">·</span>
            <span>Signed in as {developer.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              Skip Onboarding
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss onboarding dialog"
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="w-full h-1 bg-slate-100">
          <div
            className="h-full bg-sky-600 transition-transform duration-150 origin-left"
            style={{ transform: `scaleX(${step / 3})` }}
          />
        </div>

        {/* Body */}
        <div className="p-6 md:p-8 space-y-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-medium text-sky-700">
                  CloudEagle Developer Integration Studio
                </p>
                <h2
                  id="onboarding-title"
                  className="text-2xl font-bold text-slate-900 tracking-tight"
                >
                  From API documentation to trustworthy integration code—with developers in control.
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                  Turn supported SaaS API docs into a typed API client, auth setup, user and
                  activity collectors, pagination, retry/error handling, and structured logs—with
                  human approvals and full traceability.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <div className="w-8 h-8 rounded-md bg-white border border-slate-200 text-sky-700 flex items-center justify-center">
                    <FileSearch size={16} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Discover APIs</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Validate HTTPS API references or OpenAPI specs server-side with SSRF guards and
                    citation-backed endpoint extraction.
                  </p>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <div className="w-8 h-8 rounded-md bg-white border border-slate-200 text-sky-700 flex items-center justify-center">
                    <Code2 size={16} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Generate Code</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Supervise an 8-stage resumable multi-agent pipeline using company-approved LLMs
                    and mandatory human checkpoints.
                  </p>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <div className="w-8 h-8 rounded-md bg-white border border-slate-200 text-sky-700 flex items-center justify-center">
                    <ShieldCheck size={16} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Review &amp; Test</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Inspect, edit, diff, and version TypeScript files, run static &amp; fixture
                    checks, download ZIP packages, and audit redacted traces.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2
                  id="onboarding-title"
                  className="text-xl font-bold text-slate-900 tracking-tight"
                >
                  How the Supervised Integration Workflow Works
                </h2>
                <p className="text-sm text-slate-600">
                  Every stage enforces verifiable documentation evidence and explicit developer
                  sign-off before advancing.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {WORKFLOW_STEPS.map((label) => (
                  <div
                    key={label}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/70 space-y-2">
                <h3 className="text-xs font-semibold text-amber-900">
                  Non-Negotiable Engineering Guardrails
                </h3>
                <ul className="text-xs text-amber-900/90 space-y-1.5 list-disc pl-4">
                  <li>
                    <strong>Unsupported source fields cannot be fabricated:</strong> If an API does
                    not expose login timestamps or paid-license utilization (such as Calendly API
                    v2), those fields are explicitly marked unavailable rather than guessed.
                  </li>
                  <li>
                    <strong>Mandatory human checkpoints:</strong> Capability assumptions, read-only
                    auth scopes, and security reviews require explicit developer approval.
                  </li>
                  <li>
                    <strong>Deployment is not automatic:</strong> Generated packages are validated
                    against fixtures and exported for peer review—never silently deployed to
                    production.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h2
                  id="onboarding-title"
                  className="text-xl font-bold text-slate-900 tracking-tight"
                >
                  Confirm Developer Workspace Setup
                </h2>
                <p className="text-sm text-slate-600">
                  Preferences are saved to your developer profile ({developer.email}). You can
                  replay onboarding anytime from the Help menu.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="onboard-workspace-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Target Workspace
                  </label>
                  <input
                    id="onboard-workspace-input"
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-lang-select"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Runtime &amp; Connector Language
                  </label>
                  <select
                    id="onboard-lang-select"
                    value="typescript"
                    disabled
                    className="w-full px-3 py-2 text-sm border border-slate-200 bg-slate-100 text-slate-700 rounded-lg"
                  >
                    <option value="typescript">TypeScript (Node.js 22 Strict ESM — Supported)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    TypeScript is enabled with full static contract &amp; fixture test verification.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="onboard-editor-select"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Preferred Code Workspace Mode
                  </label>
                  <select
                    id="onboard-editor-select"
                    value={preferredEditor}
                    onChange={(e) =>
                      setPreferredEditor(e.target.value as 'studio_code' | 'monaco_compat')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    <option value="studio_code">
                      Studio Code Editor (Line numbers, Diff viewer, Undo/Redo &amp; Version history)
                    </option>
                    <option value="monaco_compat">
                      Compact High-Contrast Keybindings Mode
                    </option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                <CheckCircle2 size={16} className="text-teal-700 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Security Notice:</strong> Provider API keys and documentation fetches run
                  exclusively on the server. Generated connectors reference secrets via{' '}
                  <code className="font-mono text-slate-800">process.env</code> only, and all trace
                  logs scrub tokens and PII automatically.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => handleStepChange(step - 1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            ) : (
              <span className="text-xs text-slate-500">Resumable per developer profile</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => handleStepChange(step + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap"
              >
                Continue
                <ArrowRight size={14} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleFinish('catalog')}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  Explore Integrations
                </button>
                <button
                  type="button"
                  onClick={() => handleFinish('create')}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap"
                >
                  Create Your First Integration
                  <ArrowRight size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
