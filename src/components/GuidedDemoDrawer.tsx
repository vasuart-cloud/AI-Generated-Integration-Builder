import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  ExternalLink,
  X,
} from 'lucide-react';

interface GuidedStep {
  stepNumber: number;
  title: string;
  instruction: string;
  targetView: string;
  actionLabel: string;
}

const GUIDED_DEMO_STEPS: GuidedStep[] = [
  {
    stepNumber: 1,
    title: 'First-Run Developer Onboarding',
    instruction:
      'Review the 3-step Developer Onboarding Wizard (Welcome, 7-Stage Workflow Guardrails, Workspace Setup), then land on the Integration Catalog in Tile mode.',
    targetView: 'onboarding',
    actionLabel: 'Open Onboarding Wizard',
  },
  {
    stepNumber: 2,
    title: 'Toggle List Mode & Filter Categories',
    instruction:
      'In Integration Catalog, switch between Tile and List views and click CRM, Messaging, Collaboration, and Scheduling category filters.',
    targetView: 'catalog',
    actionLabel: 'Go to Integration Catalog',
  },
  {
    stepNumber: 3,
    title: 'Inspect Locked System Integration (Salesforce)',
    instruction:
      'Click "Details" on Salesforce. Verify the lock indicator ("Managed by CloudEagle: view only") and confirm Edit/Delete controls are absent.',
    targetView: 'catalog',
    actionLabel: 'Inspect Catalog',
  },
  {
    stepNumber: 4,
    title: 'Create Calendly via Conversational Builder (Owner: Asha)',
    instruction:
      'Ensure Demo Identity Switcher is set to Asha Patel. Click "Fill Calendly Demo Example" or chat step-by-step (Scheduling category, Developer Console + API-only), then click "Create Draft Integration".',
    targetView: 'create',
    actionLabel: 'Open Conversational Builder',
  },
  {
    stepNumber: 5,
    title: 'Negative Validation Gate: Reject https://google.com',
    instruction:
      'In Step 2 (Configure Data Source), test https://google.com. Verify server rejection ("general website, not an API reference") and confirm Proceed stays disabled.',
    targetView: 'create',
    actionLabel: 'Test Docs Gate',
  },
  {
    stepNumber: 6,
    title: 'Validate Calendly Docs or Load Curated Sandbox Fixture',
    instruction:
      'Click "Use Calendly example" and Validate Documentation—or if live fetch returns client-rendered SPA shell, click "Load Curated Calendly Demo Documentation (Fixture)" (labeled Sandbox Mode).',
    targetView: 'create',
    actionLabel: 'Validate Calendly Source',
  },
  {
    stepNumber: 7,
    title: 'Inspect Capabilities & Select Company Model',
    instruction:
      'Proceed to Step 3: inspect Documented endpoints, Derived 30-day scheduled-events proxy disclosure, and Unavailable login/license fields. Select an available Company LLM or Deterministic Demo Engine.',
    targetView: 'create',
    actionLabel: 'Inspect Capabilities & Model',
  },
  {
    stepNumber: 8,
    title: 'Generate, Pause After Checkpoint, Refresh & Resume',
    instruction:
      'Check "Pause automatically after Checkpoint #1" (or click Pause Run in the workbench), reload the browser to verify server persistence, then click Resume.',
    targetView: 'runs',
    actionLabel: 'Open Multi-Agent Workbench',
  },
  {
    stepNumber: 9,
    title: 'Approve Mandatory Human Checkpoints (#1, #2, #3)',
    instruction:
      'Review evidence on Approval #1 (Capabilities & Unavailable Fields), Approval #2 (Least-Privilege Read-Only Scopes), and Approval #3 (Code & Security Review) to complete packaging.',
    targetView: 'runs',
    actionLabel: 'Review Approvals',
  },
  {
    stepNumber: 10,
    title: 'Inspect, Edit, Diff & Save Versioned TypeScript Code',
    instruction:
      'Open Code Workspace: inspect src/apiClient.ts, src/users.ts, src/usage.ts, src/pagination.ts, src/errors.ts, and src/logger.ts. Edit a file, view Diff, and click Save Version.',
    targetView: 'code',
    actionLabel: 'Open Code Workspace',
  },
  {
    stepNumber: 11,
    title: 'Inject Simulated 429 or Unsafe Pagination Fault → View Trace → Retry',
    instruction:
      'In Multi-Agent Workbench Demo Lab, select "Rate Limit 429" or "Unsafe Cross-Origin Pagination Redirect". Click "View Trace" on the error banner, then reset fault to None and click "Retry Step".',
    targetView: 'runs',
    actionLabel: 'Open Demo Lab in Workbench',
  },
  {
    stepNumber: 12,
    title: 'Verify Success Banner & Download ZIP Package',
    instruction:
      'Confirm the green "Integration code generated and saved successfully" banner (distinguishing Fixture-Validated from Deployed) and click "Download ZIP".',
    targetView: 'code',
    actionLabel: 'Export ZIP in Code Workspace',
  },
  {
    stepNumber: 13,
    title: 'Switch Demo Identity to Ravi → Verify Owner RBAC',
    instruction:
      'Use the top-bar Demo Identity Switcher to switch to Ravi Menon. Confirm Asha’s Calendly integration is View-Only (no Edit/Delete/Save). Switch back to Asha to edit or archive with warning.',
    targetView: 'catalog',
    actionLabel: 'Verify RBAC in Catalog',
  },
];

interface GuidedDemoDrawerProps {
  onNavigateStepTarget: (targetView: string, stepNumber: number) => void;
  onClose: () => void;
}

export const GuidedDemoDrawer: React.FC<GuidedDemoDrawerProps> = ({
  onNavigateStepTarget,
  onClose,
}) => {
  const [idx, setIdx] = useState(0);
  const current = GUIDED_DEMO_STEPS[idx];

  return (
    <aside
      aria-label="Interactive Guided Demo Walkthrough"
      className="bg-slate-900 text-white border border-slate-700 rounded-xl p-4 mb-6 shadow-md"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2 text-xs text-sky-300 font-medium tabular-nums">
            <Compass size={14} />
            <span>
              Interactive Guided Demo · Step {current.stepNumber} of {GUIDED_DEMO_STEPS.length}
            </span>
            <span className="text-slate-400">
              (Highlights working controls — never auto-clicks irreversible actions)
            </span>
          </div>
          <h2 className="text-sm font-bold text-white">{current.title}</h2>
          <p className="text-xs text-slate-300 leading-relaxed">{current.instruction}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-40"
          >
            <ArrowLeft size={13} />
            Prev
          </button>

          <button
            type="button"
            onClick={() => onNavigateStepTarget(current.targetView, current.stepNumber)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg whitespace-nowrap"
          >
            {current.actionLabel}
            <ExternalLink size={12} />
          </button>

          <button
            type="button"
            disabled={idx === GUIDED_DEMO_STEPS.length - 1}
            onClick={() => setIdx((i) => Math.min(GUIDED_DEMO_STEPS.length - 1, i + 1))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-40"
          >
            Next
            <ArrowRight size={13} />
          </button>

          <button
            type="button"
            aria-label="Close guided demo"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-md"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
};
