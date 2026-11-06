import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Code2,
  FileSearch,
  PlusCircle,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Developer } from '../shared/types';

interface OnboardingModalProps {
  developer: Developer;
  onClose: () => void;
  onExploreCatalog: () => void;
  onCreateFirstIntegration: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  developer,
  onClose,
  onExploreCatalog,
  onCreateFirstIntegration,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);

  const steps = [
    {
      number: 1,
      title: 'Explore Integrations',
      description: 'Browse existing SaaS connectors by category using grid or list view.',
      icon: <Boxes size={20} className="text-sky-600" />,
      detail: (
        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            The integration catalog organizes enterprise SaaS connectors across CRM (Salesforce, HubSpot),
            Messaging (WhatsApp, SMS), Collaboration (Teams, Slack, Meet), and Scheduling (Calendly).
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
              <span className="font-semibold text-slate-800">Tile &amp; List Views:</span> Toggle layouts with persistent preferences.
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
              <span className="font-semibold text-slate-800">Category Filters:</span> Filter instantly by CRM, Messaging, Collaboration, Scheduling, or custom categories.
            </div>
          </div>
        </div>
      ),
    },
    {
      number: 2,
      title: 'Create an Integration',
      description: 'Create and own a new connector using the conversational AI assistant.',
      icon: <PlusCircle size={20} className="text-sky-600" />,
      detail: (
        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            The interactive assistant guides you sequentially through the connector name, description,
            and category selection (with on-the-fly custom category creation).
          </p>
          <div className="p-3 rounded-lg border border-sky-100 bg-sky-50/60 text-xs text-slate-700 space-y-1">
            <div className="font-semibold text-sky-900">Creator Ownership &amp; RBAC:</div>
            <p>
              Integrations you create are owned by you ({developer.name}). System default integrations remain
              locked and immutable for security and audit integrity.
            </p>
          </div>
        </div>
      ),
    },
    {
      number: 3,
      title: 'Generate Integration Code',
      description: "Provide API documentation, select your organization's approved LLM, and let specialized agents generate integration code.",
      icon: <FileSearch size={20} className="text-sky-600" />,
      detail: (
        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Validate live HTTPS documentation or OpenAPI specs against SSRF and evidence gates. Supervise
            an 8-agent generation pipeline using company-approved LLMs with full activity logs and citations.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
              <span className="font-semibold text-slate-800">Doc Verification:</span> Rejects invalid web pages like google.com.
            </div>
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
              <span className="font-semibold text-slate-800">Approved Models:</span> Enterprise-governed LLM selection before code synthesis.
            </div>
          </div>
        </div>
      ),
    },
    {
      number: 4,
      title: 'Review, Test and Approve',
      description: 'Review code, approve agent checkpoints, troubleshoot errors and prepare the integration for deployment.',
      icon: <Code2 size={20} className="text-sky-600" />,
      detail: (
        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Developer approvals are mandatory before advancing stages. Inspect, edit, diff, and version
            generated TypeScript code, export ZIP packages, and audit redacted execution traces.
          </p>
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-xs text-amber-950 flex items-start gap-2">
            <ShieldCheck size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <span>
              <strong>Human-in-the-Loop Governance:</strong> Capabilities, auth scopes, and security reviews
              require developer sign-off—nothing deploys blindly.
            </span>
          </div>
        </div>
      ),
    },
  ];

  const currentStepData = steps[currentStep - 1];

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleGetStarted = (action: 'catalog' | 'create') => {
    onClose();
    if (action === 'create') {
      onCreateFirstIntegration();
    } else {
      onExploreCatalog();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/50">
          {/* Signed-in developer avatar and name */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-semibold text-xs flex items-center justify-center shrink-0 shadow-xs">
              {developer.avatarInitials || 'AP'}
            </div>
            <div className="text-xs">
              <span className="font-semibold text-slate-900">{developer.name}</span>
              <span className="text-slate-400 mx-1.5">·</span>
              <span className="text-slate-500">{developer.roleTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
            >
              Skip Tour
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close onboarding modal"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className="grid grid-cols-4 bg-slate-100 gap-0.5">
          {steps.map((s) => (
            <button
              key={s.number}
              type="button"
              onClick={() => setCurrentStep(s.number)}
              className={`h-1.5 transition-colors ${
                s.number <= currentStep ? 'bg-sky-600' : 'bg-slate-200'
              }`}
              title={`Step ${s.number}: ${s.title}`}
            />
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 md:p-8 space-y-6 flex-1">
          {/* Main Title & Short Description */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-sky-600 tracking-wider uppercase">
              Step {currentStep} of 4 — {currentStepData.title}
            </div>
            <h2
              id="onboarding-modal-title"
              className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight"
            >
              Welcome, Asha! Your AI Integration Workspace is Ready.
            </h2>
            <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
              Build production-ready SaaS integration code from API documentation using AI agents, with human approvals and complete traceability.
            </p>
          </div>

          {/* Active Step Highlight Card */}
          <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                {currentStepData.icon}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  STEP {currentStepData.number} — {currentStepData.title}
                </h3>
                <p className="text-xs font-medium text-slate-700">
                  {currentStepData.description}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              {currentStepData.detail}
            </div>
          </div>

          {/* Step Breadcrumb Dots */}
          <div className="flex items-center justify-center gap-2 pt-1">
            {steps.map((s) => (
              <button
                key={s.number}
                type="button"
                onClick={() => setCurrentStep(s.number)}
                aria-label={`Jump to step ${s.number}`}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  s.number === currentStep
                    ? 'w-6 bg-sky-600'
                    : s.number < currentStep
                    ? 'bg-sky-300'
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Skip Tour
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors shadow-xs"
              >
                Next
                <ArrowRight size={14} />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGetStarted('catalog')}
                  className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Explore Catalog
                </button>
                <button
                  type="button"
                  onClick={() => handleGetStarted('create')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors shadow-xs"
                >
                  Get Started
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
