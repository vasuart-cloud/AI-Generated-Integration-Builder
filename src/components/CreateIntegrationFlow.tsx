import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  FileCode2,
  FlaskConical,
  Lock,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  IntegrationWithAccess,
  studioApi,
  UI_LAYER_OPTIONS,
} from '../lib/api';
import {
  AuthType,
  CapabilityItem,
  Category,
  CollectorConfig,
  Developer,
  DocInputMode,
  DocumentationValidation,
  FailureInjectionType,
  FieldMappingItem,
  ModelOption,
  UILayer,
} from '../shared/types';

const CALENDLY_REFERENCE_URL =
  'https://developer.calendly.com/api-docs/overview/api/reference';

interface ChatTurn {
  id: string;
  sender: 'assistant' | 'developer';
  text: string;
}

interface CreateIntegrationFlowProps {
  actorId: string;
  currentDeveloper: Developer;
  categories: Category[];
  existingIntegrations: IntegrationWithAccess[];
  models: ModelOption[];
  activeIntegrationId: string | null;
  onDraftCreated: (integration: IntegrationWithAccess) => Promise<void>;
  onCategoryCreated: (category: Category) => Promise<void>;
  onCancelCreation: () => void;
  onRunStarted: (integrationId: string, runId: string) => Promise<void>;
  onOpenTraceForIntegration: (integrationId: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const CreateIntegrationFlow: React.FC<CreateIntegrationFlowProps> = ({
  actorId,
  currentDeveloper,
  categories,
  existingIntegrations,
  models,
  activeIntegrationId,
  onDraftCreated,
  onCategoryCreated,
  onCancelCreation,
  onRunStarted,
  onOpenTraceForIntegration,
  onNotify,
}) => {
  // Wizard stage: 1 = Conversational Definition, 2 = Docs Validation Gate, 3 = Capabilities & Model
  const [wizardStage, setWizardStage] = useState<1 | 2 | 3>(activeIntegrationId ? 2 : 1);
  const [draftIntegration, setDraftIntegration] = useState<IntegrationWithAccess | null>(null);

  // Stage 1: Conversational & Live Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: `Hi ${currentDeveloper.name.split(' ')[0]}! I'll help you create a new SaaS integration. Let's start with the integration name.`,
    },
  ]);
  const [stage1Error, setStage1Error] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);

  // New Category Modal
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatError, setNewCatError] = useState<string | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);

  // Stage 2: API Documentation Input & Hard Validation Gate
  const [docMode, setDocMode] = useState<DocInputMode>('url');
  const [docUrl, setDocUrl] = useState('');
  const [rawSpec, setRawSpec] = useState('');
  const [docFailureSim, setDocFailureSim] = useState<FailureInjectionType>('none');
  const [validatingDocs, setValidatingDocs] = useState(false);
  const [currentValidation, setCurrentValidation] = useState<DocumentationValidation | null>(null);
  const [lastValidatedSourceKey, setLastValidatedSourceKey] = useState<string>('');
  const [showValidationDetails, setShowValidationDetails] = useState(true);

  // Stage 3: Capability Discovery & Company Model Selection
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMappingItem[]>([]);
  const [collectorConfig, setCollectorConfig] = useState<CollectorConfig | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');
  const [pauseAfterCheckpoint1, setPauseAfterCheckpoint1] = useState<boolean>(false);
  const [startingRun, setStartingRun] = useState<boolean>(false);
  const [stage3Error, setStage3Error] = useState<string | null>(null);

  const prevActiveIdRef = useRef<string | null>(activeIntegrationId);

  // Load existing custom integration if activeIntegrationId is passed, or reset cleanly when starting fresh
  useEffect(() => {
    if (!activeIntegrationId) {
      const wasEditingExisting = prevActiveIdRef.current !== null;
      prevActiveIdRef.current = null;
      setDraftIntegration(null);
      setWizardStage(1);
      if (wasEditingExisting) {
        setName('');
        setDescription('');
        setCategoryId('');
        setCategorySearch('');
        setChatInput('');
        setStage1Error(null);
        setCurrentValidation(null);
        setLastValidatedSourceKey('');
        setDocMode('url');
        setDocUrl('');
        setRawSpec('');
        setDocFailureSim('none');
        setCapabilities([]);
        setFieldMappings([]);
        setCollectorConfig(null);
        setSelectedModelKey('');
        setStage3Error(null);
        setChatHistory([
          {
            id: `welcome-${Date.now()}`,
            sender: 'assistant',
            text: `Hi ${currentDeveloper.name.split(' ')[0]}! I'll help you create a new SaaS integration. Let's start with the integration name.`,
          },
        ]);
      }
      return;
    }

    prevActiveIdRef.current = activeIntegrationId;
    let cancelled = false;
    (async () => {
      try {
        const detail = await studioApi.getIntegrationDetail(actorId, activeIntegrationId);
        if (cancelled) return;
        setDraftIntegration(detail.integration);
        setName(detail.integration.name);
        setDescription(detail.integration.description);
        setCategoryId(detail.integration.categoryId);

        if (detail.latestValidValidation && detail.discovery) {
          setCurrentValidation(detail.latestValidValidation);
          setCapabilities(detail.discovery.capabilities);
          setFieldMappings(detail.discovery.fieldMappings);
          setCollectorConfig(
            detail.integration.collectorConfig ?? detail.discovery.defaultConfig
          );
          setDocFailureSim('none');
          if (detail.latestValidValidation.mode === 'url') {
            setDocMode('url');
            setDocUrl(detail.latestValidValidation.sourceUrl);
            setLastValidatedSourceKey(`url:${detail.latestValidValidation.sourceUrl.trim()}:none`);
          } else if (detail.latestValidValidation.mode === 'curated_fixture') {
            setDocMode('curated_fixture');
            setLastValidatedSourceKey('fixture:calendly');
          } else {
            setDocMode('openapi_paste');
            setRawSpec('');
            setLastValidatedSourceKey('openapi::0:none');
          }
          setWizardStage(3);
        } else {
          setCurrentValidation(detail.validations[0] ?? null);
          setLastValidatedSourceKey('');
          setWizardStage(2);
        }
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load draft integration.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeIntegrationId, actorId]);

  // Compute conversational step progress (1 to 3, then ready)
  const definitionStep = useMemo(() => {
    if (!name.trim()) return 1;
    if (description.trim().length < 8) return 2;
    if (!categoryId) return 3;
    return 4; // Ready for pre-creation summary & submission
  }, [name, description, categoryId]);

  const duplicateNameConflict = useMemo(() => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return null;
    return existingIntegrations.find(
      (i) =>
        i.id !== draftIntegration?.id &&
        i.status !== 'archived' &&
        i.name.toLowerCase() === trimmed
    );
  }, [name, existingIntegrations, draftIntegration?.id]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [categories, categorySearch]);

  // Parse conversational answer without fabricating missing details
  const handleSendChatTurn = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = chatInput.trim();
    if (!raw) return;

    const nextTurns: ChatTurn[] = [
      ...chatHistory,
      { id: `usr-${Date.now()}`, sender: 'developer', text: raw },
    ];

    const stepBeforeTurn = definitionStep;
    const isMultiClause = /\s[-:—]\s/.test(raw) || raw.length > 72;

    let nextName = name;
    let nextDesc = description;
    let nextCatId = categoryId;

    const lower = raw.toLowerCase();

    // Detect existing category mentions when at Step >= 3 or explicitly referenced in multi-clause prompt
    if (stepBeforeTurn >= 3 || (isMultiClause && /\b(category|in\s+[a-z])/i.test(raw))) {
      for (const cat of categories) {
        if (lower.includes(cat.name.toLowerCase())) {
          nextCatId = cat.id;
        }
      }
    }

    // Sequential capture for primary field if still empty
    if (!nextName.trim()) {
      const splitMatch = raw.split(/\s*[-:—]\s*/);
      if (splitMatch.length > 1 && splitMatch[0].trim().length <= 40) {
        nextName = splitMatch[0].trim();
        if (!nextDesc.trim() && splitMatch.slice(1).join(' - ').trim().length >= 8) {
          nextDesc = splitMatch.slice(1).join(' - ').trim();
        }
      } else if (raw.length <= 48) {
        nextName = raw;
      } else {
        nextName = raw.slice(0, 32).trim();
        nextDesc = raw;
      }
    } else if (nextDesc.trim().length < 8) {
      nextDesc = raw;
    }

    setName(nextName);
    setDescription(nextDesc);
    setCategoryId(nextCatId);
    setChatInput('');
    setStage1Error(null);

    let proposedNewCategory = '';
    if (stepBeforeTurn === 3 && !nextCatId && raw.length >= 2 && raw.length <= 48) {
      proposedNewCategory = raw
        .replace(/^(create|add|new)\s+(new\s+)?category\s*[:\-]?\s*/i, '')
        .trim();
      if (proposedNewCategory) {
        setNewCatName(proposedNewCategory);
        setNewCatDesc(
          `Custom connectors and data collectors for ${proposedNewCategory} workflows.`
        );
        setNewCatError(null);
        setShowNewCategoryModal(true);
      }
    }

    // Determine next sequential assistant prompt matching Feature 4 requirements
    let reply = '';
    if (!nextName.trim()) {
      reply = 'What would you like to name this integration?';
    } else if (
      existingIntegrations.some(
        (i) => i.status !== 'archived' && i.name.toLowerCase() === nextName.trim().toLowerCase()
      )
    ) {
      reply = `An active integration named "${nextName.trim()}" already exists in this workspace. Please provide a unique integration name.`;
    } else if (nextDesc.trim().length < 8) {
      reply = 'Great! Please describe what this integration will do.';
    } else if (!nextCatId) {
      reply = proposedNewCategory
        ? `Category "${proposedNewCategory}" is not in the catalog yet — opened the Create New Category dialog so you can save and select it.`
        : 'Which category does this integration belong to? Select CRM, Messaging, Collaboration, Scheduling, or click "+ Create New Category".';
    } else {
      const catLabel = categories.find((c) => c.id === nextCatId)?.name ?? nextCatId;
      reply = `All details captured for "${nextName.trim()}" in ${catLabel}. Review the summary on the right and click "Create Integration".`;
    }

    nextTurns.push({
      id: `ast-${Date.now() + 1}`,
      sender: 'assistant',
      text: reply,
    });
    setChatHistory(nextTurns);
  };

  const handleStepBackAnswer = () => {
    if (categoryId) {
      setCategoryId('');
      setChatHistory((prev) => [
        ...prev,
        {
          id: `back-${Date.now()}`,
          sender: 'assistant',
          text: 'Which category does this integration belong to? Select from the dropdown or click "+ Create New Category".',
        },
      ]);
    } else if (description) {
      setDescription('');
      setChatHistory((prev) => [
        ...prev,
        {
          id: `back-${Date.now()}`,
          sender: 'assistant',
          text: 'Great! Please describe what this integration will do.',
        },
      ]);
    } else if (name) {
      setName('');
      setChatHistory((prev) => [
        ...prev,
        {
          id: `back-${Date.now()}`,
          sender: 'assistant',
          text: 'What would you like to name this integration?',
        },
      ]);
    }
  };

  const handleQuickFillCalendly = () => {
    const schedulingCat = categories.find((c) => c.name.toLowerCase() === 'scheduling');
    setName('Calendly');
    setDescription(
      'Retrieve organization users and scheduling activity data from Calendly for SaaS visibility and governance.'
    );
    if (schedulingCat) {
      setCategoryId(schedulingCat.id);
    }
    setStage1Error(null);
    setChatHistory((prev) => [
      ...prev,
      {
        id: `usr-cal-${Date.now()}`,
        sender: 'developer',
        text: 'Calendly — Retrieve organization users and scheduling activity data from Calendly for SaaS visibility and governance.',
      },
      {
        id: `ast-cal-${Date.now() + 1}`,
        sender: 'assistant',
        text: 'All details captured for Calendly in Scheduling. Review the summary on the right and click "Create Integration".',
      },
    ]);
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCat(true);
    setNewCatError(null);
    try {
      const { category } = await studioApi.createCategory(actorId, {
        name: newCatName,
        description: newCatDesc,
      });
      await onCategoryCreated(category);
      setCategoryId(category.id);
      setShowNewCategoryModal(false);
      setNewCatName('');
      setNewCatDesc('');
      setChatHistory((prev) => [
        ...prev,
        {
          id: `ast-cat-${Date.now()}`,
          sender: 'assistant',
          text:
            name.trim() && description.trim().length >= 8
              ? `Created and selected new category "${category.name}" for "${name.trim()}". Review the summary on the right and click "Create Integration".`
              : `Created and selected new category "${category.name}".`,
        },
      ]);
      onNotify('success', `Category "${category.name}" created and selected.`);
    } catch (err) {
      setNewCatError(err instanceof Error ? err.message : 'Unable to create category.');
    } finally {
      setCreatingCat(false);
    }
  };

  const handleCreateDraft = async () => {
    setStage1Error(null);
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();

    if (!trimmedName) {
      setStage1Error('Integration Name is required.');
      return;
    }
    if (duplicateNameConflict) {
      setStage1Error(`An active integration named "${duplicateNameConflict.name}" already exists.`);
      return;
    }
    if (!trimmedDesc) {
      setStage1Error('Integration Description is required.');
      return;
    }
    if (trimmedDesc.length < 8) {
      setStage1Error('Provide a description (at least 8 characters) of what this integration will do.');
      return;
    }
    if (!categoryId) {
      setStage1Error('Category is required. Select a category for this integration.');
      return;
    }

    setCreatingDraft(true);
    try {
      if (draftIntegration) {
        const { integration } = await studioApi.updateIntegration(actorId, draftIntegration.id, {
          name: trimmedName,
          description: trimmedDesc,
          categoryId,
        });
        setDraftIntegration(integration);
        await onDraftCreated(integration);
        onNotify('success', `${integration.name} integration updated successfully.`);
      } else {
        const { integration } = await studioApi.createIntegrationDraft(actorId, {
          name: trimmedName,
          description: trimmedDesc,
          categoryId,
        });
        setDraftIntegration(integration);
        await onDraftCreated(integration);
        onNotify('success', `${integration.name} integration created successfully.`);
      }
      setWizardStage(2);
    } catch (err) {
      setStage1Error(err instanceof Error ? err.message : 'Failed to save integration.');
    } finally {
      setCreatingDraft(false);
    }
  };

  // Current source fingerprint to ensure Proceed is disabled if user changes URL/spec after validating!
  const currentSourceFingerprint =
    docMode === 'url'
      ? `url:${docUrl.trim()}:${docFailureSim}`
      : docMode === 'openapi_paste'
      ? `openapi:${rawSpec.trim().slice(0, 120)}:${rawSpec.trim().length}:${docFailureSim}`
      : 'fixture:calendly';

  const canProceedFromDocs =
    (currentValidation?.result === 'valid' &&
      (currentValidation.mode === 'curated_fixture' ||
        Boolean(currentValidation.prototypeConfirmed) ||
        lastValidatedSourceKey === currentSourceFingerprint)) ||
    Boolean(currentValidation?.prototypeConfirmed);

  const handleConfirmPrototype = async () => {
    if (!draftIntegration) return;
    setValidatingDocs(true);
    try {
      const res = await studioApi.confirmPrototypeMode(actorId, draftIntegration.id);
      setCurrentValidation(res.validation);
      setLastValidatedSourceKey(`prototype:${draftIntegration.id}`);
      if (res.capabilities) {
        setCapabilities(res.capabilities.capabilities);
        setFieldMappings(res.capabilities.fieldMappings);
        setCollectorConfig(res.capabilities.defaultConfig);
      }
      onNotify('success', 'Prototype mode confirmed. Proceed to Capability Discovery.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to confirm prototype mode.');
    } finally {
      setValidatingDocs(false);
    }
  };

  const runDocValidation = async (
    overrideMode?: DocInputMode,
    overrideUrl?: string,
    overrideFault?: FailureInjectionType
  ) => {
    if (!draftIntegration) return;
    const modeToUse = overrideMode ?? docMode;
    const urlToUse = overrideUrl !== undefined ? overrideUrl : docUrl;
    const faultToUse = overrideFault !== undefined ? overrideFault : docFailureSim;

    setValidatingDocs(true);
    try {
      const response = await studioApi.validateDocs(actorId, draftIntegration.id, {
        mode: modeToUse,
        url: modeToUse === 'url' ? urlToUse : undefined,
        rawSpec: modeToUse === 'openapi_paste' ? rawSpec : undefined,
        failureInjection: faultToUse,
      });

      setCurrentValidation(response.validation);
      setShowValidationDetails(true);

      if (response.validation.result === 'valid' && response.discovery) {
        const fp =
          modeToUse === 'curated_fixture'
            ? 'fixture:calendly'
            : modeToUse === 'url'
            ? `url:${urlToUse.trim()}:${faultToUse}`
            : `openapi:${rawSpec.trim().slice(0, 120)}:${rawSpec.trim().length}:${faultToUse}`;
        setLastValidatedSourceKey(fp);
        setCapabilities(response.discovery.capabilities);
        setFieldMappings(response.discovery.fieldMappings);
        setCollectorConfig(response.discovery.defaultConfig);
        onNotify('success', response.validation.summaryMessage);
      } else {
        setLastValidatedSourceKey('');
        onNotify(
          response.validation.result === 'unverifiable_live' ? 'info' : 'error',
          response.validation.summaryMessage
        );
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Documentation validation failed.');
    } finally {
      setValidatingDocs(false);
    }
  };

  const handleSpecFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDocMode('openapi_paste');
      setRawSpec(String(reader.result ?? ''));
      setCurrentValidation(null);
    };
    reader.readAsText(file);
  };

  const handleStartCodeGeneration = async () => {
    if (!draftIntegration || !collectorConfig) return;
    setStage3Error(null);

    if (!selectedModelKey) {
      setStage3Error('Select an approved Company LLM (or Deterministic Demo Engine) before starting code generation.');
      return;
    }

    const [modelProvider, modelId] = selectedModelKey.split('::') as [
      ModelOption['provider'],
      string
    ];

    setStartingRun(true);
    try {
      const opId = `start-${draftIntegration.id}-${Date.now()}`;
      const result = await studioApi.startRun(actorId, draftIntegration.id, {
        modelProvider,
        modelId,
        collectorConfig,
        operationId: opId,
        pauseAfterFirstCheckpoint: pauseAfterCheckpoint1,
      });
      await onRunStarted(draftIntegration.id, result.run.id);
    } catch (err) {
      setStage3Error(err instanceof Error ? err.message : 'Failed to start generation run.');
    } finally {
      setStartingRun(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Wizard Progression Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Integration Studio Builder</span>
            {draftIntegration && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-800">{draftIntegration.name}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {draftIntegration.access.canEdit
                    ? `Owner: ${currentDeveloper.name}`
                    : 'Read-only (Owned by another developer)'}
                </span>
              </>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {wizardStage === 1 && 'Step 1: Conversational Integration Definition'}
            {wizardStage === 2 && `Step 2: Configure Data Source & Validation Gate (${draftIntegration?.name})`}
            {wizardStage === 3 && `Step 3: Capability Discovery & Approved Model (${draftIntegration?.name})`}
          </h1>
        </div>

        {/* Stepper Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-medium">
          <button
            type="button"
            disabled={Boolean(draftIntegration && !draftIntegration.access.canEdit)}
            onClick={() => setWizardStage(1)}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap disabled:opacity-40 ${
              wizardStage === 1 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Definition
          </button>
          <button
            type="button"
            disabled={!draftIntegration || !draftIntegration.access.canEdit}
            onClick={() => draftIntegration && setWizardStage(2)}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap disabled:opacity-40 ${
              wizardStage === 2 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Validate Docs
          </button>
          <button
            type="button"
            disabled={!canProceedFromDocs || Boolean(draftIntegration && !draftIntegration.access.canEdit)}
            onClick={() => canProceedFromDocs && setWizardStage(3)}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap disabled:opacity-40 ${
              wizardStage === 3 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. Capabilities &amp; Model
          </button>
        </div>
      </div>

      {draftIntegration && !draftIntegration.access.canEdit ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <div className="flex items-start gap-3">
            <Lock size={18} className="text-slate-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">
                Read-Only Access: “{draftIntegration.name}” is Owned by Another Developer
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                {draftIntegration.access.reason} Only the integration creator can modify metadata,
                re-validate API documentation, or launch new generation runs.
              </p>
            </div>
          </div>
          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onCancelCreation}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
            >
              Return to Integration Catalog
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* =====================================================================
          SCREEN 3: CONVERSATIONAL ADD INTEGRATION (SPLIT PANE)
      ===================================================================== */}
      {wizardStage === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Pane: Structured Conversational Assistant */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between">
            <div>
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Integration Setup Assistant
                    </h2>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Step {Math.min(definitionStep, 3)} of 3 · {definitionStep === 1 ? 'Name' : definitionStep === 2 ? 'Description' : 'Category'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleQuickFillCalendly}
                  className="px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors whitespace-nowrap"
                >
                  Fill Calendly Demo Example
                </button>
              </div>

              <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
                {chatHistory.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex ${
                      turn.sender === 'developer' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                        turn.sender === 'developer'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      {turn.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50/60 space-y-3">
              <form onSubmit={handleSendChatTurn} className="flex items-center gap-2">
                <label htmlFor="conv-assistant-input" className="sr-only">
                  Reply to Integration Setup Assistant
                </label>
                <input
                  id="conv-assistant-input"
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    definitionStep === 1
                      ? 'Type integration name (e.g. Calendly)...'
                      : definitionStep === 2
                      ? 'Describe what this integration will do...'
                      : 'Type category or click Create New Category...'
                  }
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
                <button
                  type="submit"
                  aria-label="Send message to assistant"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Send size={13} />
                  Send
                </button>
              </form>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleStepBackAnswer}
                  className="text-slate-600 hover:text-slate-900 font-medium"
                >
                  Back / Edit Previous Answer
                </button>
                <button
                  type="button"
                  onClick={onCancelCreation}
                  className="text-rose-700 hover:text-rose-900 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Right Pane: Live Integration Definition Form & Pre-Creation Summary */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {definitionStep >= 4 ? 'Pre-Creation Summary' : 'Integration Definition'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Owner: <span className="font-semibold text-slate-800">{currentDeveloper.name}</span> · Status: <span className="font-semibold text-sky-700">Draft</span>
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {Math.min(definitionStep, 3)} / 3 answered
                </span>
              </div>

              {stage1Error && (
                <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{stage1Error}</span>
                </div>
              )}

              {/* 1. Integration Name */}
              <div>
                <label htmlFor="def-name-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Integration Name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="def-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Calendly"
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                    duplicateNameConflict
                      ? 'border-rose-400 focus:ring-rose-600'
                      : 'border-slate-300 focus:ring-sky-600'
                  }`}
                />
                {duplicateNameConflict && (
                  <p className="mt-1 text-xs text-rose-700">
                    Duplicate name: “{duplicateNameConflict.name}” already exists in this workspace.
                  </p>
                )}
              </div>

              {/* 2. Short Description */}
              <div>
                <label htmlFor="def-desc-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="def-desc-input"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this integration will do..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              {/* 3. Searchable Category Selector + Create New Category */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="def-category-select" className="text-xs font-semibold text-slate-700">
                    Category <span className="text-rose-600">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewCategoryModal(true);
                      setNewCatError(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
                  >
                    <Plus size={13} />
                    + Create New Category
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="search"
                    aria-label="Filter category options"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Filter categories..."
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                  <select
                    id="def-category-select"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    <option value="">Select category...</option>
                    {filteredCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* PRE-CREATION SUMMARY BLOCK */}
              {definitionStep >= 4 && (
                <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-2 text-xs">
                  <div className="font-bold text-sky-950 uppercase tracking-wider text-[11px]">
                    Pre-Creation Summary
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div>
                      <dt className="text-slate-500 font-medium">Integration Name:</dt>
                      <dd className="font-semibold text-slate-900">{name.trim()}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 font-medium">Category:</dt>
                      <dd className="font-semibold text-slate-900">
                        {categories.find((c) => c.id === categoryId)?.name ?? 'Scheduling'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 font-medium">Owner:</dt>
                      <dd className="font-semibold text-slate-900">{currentDeveloper.name}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 font-medium">Status:</dt>
                      <dd className="font-semibold text-sky-700">Draft</dd>
                    </div>
                    <div className="col-span-2 pt-1">
                      <dt className="text-slate-500 font-medium">Description:</dt>
                      <dd className="text-slate-700 leading-snug">{description.trim()}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            {/* Pre-Creation Buttons: Back, Cancel, Create Integration */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStepBackAnswer}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onCancelCreation}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>

              <button
                type="button"
                onClick={handleCreateDraft}
                disabled={
                  creatingDraft ||
                  !name.trim() ||
                  Boolean(duplicateNameConflict) ||
                  description.trim().length < 8 ||
                  !categoryId
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap shadow-xs"
              >
                {creatingDraft ? 'Creating Integration...' : 'Create Integration'}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 4: API DOCUMENTATION INPUT + HARD VALIDATION GATE
      ===================================================================== */}
      {wizardStage === 2 && draftIntegration && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            {/* Feature 5 Required Heading & Metadata Summary */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Connect {draftIntegration.name} API Documentation
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-700">Name:</span> {draftIntegration.name}
                  </div>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <div>
                    <span className="font-semibold text-slate-700">Category:</span> {categories.find((c) => c.id === draftIntegration.categoryId)?.name ?? 'Scheduling'}
                  </div>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <div>
                    <span className="font-semibold text-slate-700">Owner:</span> {currentDeveloper.name}
                  </div>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <div className="truncate max-w-xs" title={draftIntegration.description}>
                    <span className="font-semibold text-slate-700">Description:</span> {draftIntegration.description}
                  </div>
                </div>
              </div>

              {/* Source Mode Tabs */}
              <div
                className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium shrink-0"
                role="tablist"
                aria-label="Documentation source mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={docMode === 'url'}
                  onClick={() => setDocMode('url')}
                  className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    docMode === 'url' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  API Documentation URL
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={docMode === 'openapi_paste'}
                  onClick={() => setDocMode('openapi_paste')}
                  className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    docMode === 'openapi_paste'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Paste / Upload OpenAPI
                </button>
              </div>
            </div>

            {docMode === 'url' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="doc-url-input" className="text-xs font-semibold text-slate-700">
                    HTTPS API Reference URL <span className="text-rose-600">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setDocUrl(CALENDLY_REFERENCE_URL);
                      setDocFailureSim('none');
                    }}
                    className="text-xs font-semibold text-sky-700 hover:text-sky-900"
                  >
                    Use Calendly example
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    id="doc-url-input"
                    type="text"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://developer.calendly.com/api-docs/overview/api/reference"
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                  <button
                    type="button"
                    onClick={() => runDocValidation('url')}
                    disabled={validatingDocs}
                    className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {validatingDocs ? 'Validating on Server...' : 'Validate Documentation'}
                  </button>
                </div>

                {/* Quick Negative & Edge-Case Verification Bar */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700 inline-flex items-center gap-1">
                    <FlaskConical size={13} className="text-slate-500" />
                    Negative Gate Presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDocUrl('https://google.com');
                      setDocFailureSim('none');
                      runDocValidation('url', 'https://google.com', 'none');
                    }}
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-700"
                  >
                    Test https://google.com (Non-API Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocUrl('http://169.254.169.254/latest/meta-data');
                      setDocFailureSim('none');
                      runDocValidation('url', 'http://169.254.169.254/latest/meta-data', 'none');
                    }}
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-700"
                  >
                    Test SSRF Metadata IP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocFailureSim('doc_404');
                      runDocValidation('url', 'https://developer.example.com/missing', 'doc_404');
                    }}
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-700"
                  >
                    Simulate 404 Docs
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocFailureSim('suspicious_redirect');
                      runDocValidation('url', 'https://docs.example.com/api', 'suspicious_redirect');
                    }}
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-700"
                  >
                    Simulate Unsafe Redirect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="openapi-spec-textarea" className="text-xs font-semibold text-slate-700">
                    OpenAPI 3.x / Swagger JSON or YAML Specification
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer">
                    <Upload size={13} />
                    Upload .json / .yaml
                    <input
                      type="file"
                      accept=".json,.yaml,.yml"
                      onChange={handleSpecFileUpload}
                      className="sr-only"
                    />
                  </label>
                </div>

                <textarea
                  id="openapi-spec-textarea"
                  rows={8}
                  value={rawSpec}
                  onChange={(e) => setRawSpec(e.target.value)}
                  placeholder='{"openapi": "3.1.0", "info": {"title": "Calendly API", "version": "2.0"}, "servers": [{"url": "https://api.calendly.com"}], ...}'
                  className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                />

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDocFailureSim('malformed_docs');
                      runDocValidation('openapi_paste', undefined, 'malformed_docs');
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 underline"
                  >
                    Simulate Malformed Specification Fault
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocFailureSim('none');
                      runDocValidation('openapi_paste', undefined, 'none');
                    }}
                    disabled={validatingDocs}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    {validatingDocs ? 'Parsing OpenAPI...' : 'Validate Specification'}
                  </button>
                </div>
              </div>
            )}

            {/* Curated Calendly Fixture Option (Always honest, explicitly labeled Sandbox Mode) */}
            <div className="p-4 rounded-lg border border-sky-200 bg-sky-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-900">
                  Curated Calendly API v2 Demo Documentation (Sandbox Fixture)
                </p>
                <p className="text-xs text-slate-600">
                  If live <code className="font-mono">developer.calendly.com</code> renders via a
                  client-side SPA shell or external network is restricted, load the pre-reviewed
                  Calendly API v2 endpoint evidence explicitly in Sandbox Fixture Mode.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDocFailureSim('none');
                  runDocValidation('curated_fixture');
                }}
                disabled={validatingDocs}
                className="px-3.5 py-2 text-xs font-semibold text-sky-900 bg-white border border-sky-300 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Load Curated Calendly Demo Documentation (Fixture)
              </button>
            </div>

            {/* Validation Result Banner & Details Accordion */}
            {currentValidation && (
              <div
                className={`rounded-xl border p-5 space-y-4 ${
                  currentValidation.result === 'valid'
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : currentValidation.result === 'unverifiable_live' ||
                      currentValidation.result === 'partial'
                    ? 'border-amber-300 bg-amber-50/70'
                    : 'border-rose-300 bg-rose-50/70'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {currentValidation.result === 'valid' ? (
                      <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                    ) : currentValidation.result === 'invalid' ? (
                      <AlertCircle size={18} className="text-rose-700 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-900">
                          {currentValidation.result === 'valid'
                            ? currentValidation.mode === 'curated_fixture'
                              ? 'Valid Curated Demo Fixture (Sandbox Mode): Calendly API v2'
                              : `Valid API Documentation: ${currentValidation.evidence.providerName}`
                            : currentValidation.result === 'partial'
                            ? 'Partially Validated — Missing Required Evidence'
                            : currentValidation.result === 'unverifiable_live'
                            ? 'Unable to Verify Live Documentation'
                            : 'Documentation Validation Failed'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-600">
                          hash:{currentValidation.hash}
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed">
                        {currentValidation.summaryMessage}
                      </p>

                      {/* Prototype Mode Actions for Incomplete Extraction */}
                      {(currentValidation.result === 'partial' ||
                        currentValidation.result === 'unverifiable_live' ||
                        currentValidation.prototypeConfirmed) && (
                        <div className="mt-3 p-3.5 bg-amber-100/70 border border-amber-300 rounded-lg space-y-2.5 text-xs text-amber-950">
                          <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-amber-700 shrink-0" />
                            {currentValidation.prototypeConfirmed
                              ? 'Prototype Mode Active (Developer Confirmed)'
                              : 'Documentation site detected; endpoint extraction incomplete.'}
                          </div>
                          <p className="leading-relaxed">
                            {currentValidation.prototypeConfirmed
                              ? 'You have approved proceeding in Prototype Mode with standard endpoint capabilities under developer oversight. Proceed to Capability Discovery is enabled.'
                              : 'The documentation portal was safely verified via HTTPS, but dynamic JavaScript rendering prevented static extraction of all endpoints. You can proceed safely in Prototype Mode with curated/standard endpoints, upload/paste an OpenAPI spec, or use the curated Calendly fixture.'}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {!currentValidation.prototypeConfirmed && (
                              <button
                                type="button"
                                onClick={handleConfirmPrototype}
                                className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-xs text-white bg-amber-700 hover:bg-amber-800 rounded-md transition-colors"
                              >
                                <CheckCircle2 size={13} />
                                Continue in Prototype Mode
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setDocMode('openapi_paste');
                                setCurrentValidation(null);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 font-medium text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
                            >
                              <FileCode2 size={13} />
                              Paste or Upload API Specification
                            </button>

                            {(docUrl.toLowerCase().includes('calendly') ||
                              draftIntegration?.name.toLowerCase().includes('calendly')) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDocMode('curated_fixture');
                                  runDocValidation('curated_fixture');
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 font-medium text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
                              >
                                <Sparkles size={13} />
                                Use Curated Calendly API v2 Evidence
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {currentValidation.result !== 'valid' && (
                      <button
                        type="button"
                        onClick={() => onOpenTraceForIntegration(draftIntegration.id)}
                        className="text-xs font-semibold text-rose-800 hover:underline whitespace-nowrap"
                      >
                        View Trace
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowValidationDetails((v) => !v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md"
                    >
                      Validation Details
                      {showValidationDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>
                </div>

                {showValidationDetails && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-4 text-xs">
                    {/* Staged Checks */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {currentValidation.evidence.checks.map((chk) => (
                        <div
                          key={chk.id}
                          className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2"
                        >
                          {chk.passed ? (
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-semibold text-slate-900">{chk.label}</div>
                            <div className="text-slate-600">{chk.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Extracted Endpoints */}
                    {currentValidation.evidence.documentedEndpoints.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="font-semibold text-slate-900">
                          Grounded Endpoints ({currentValidation.evidence.documentedEndpoints.length})
                        </div>
                        <div className="divide-y divide-slate-100">
                          {currentValidation.evidence.documentedEndpoints.map((ep) => (
                            <div
                              key={`${ep.method}-${ep.path}`}
                              className="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                            >
                              <div className="font-mono text-slate-900">
                                <span className="font-semibold text-sky-700">{ep.method}</span>{' '}
                                {ep.path}
                              </div>
                              <div className="text-slate-500">
                                {ep.summary}
                                {ep.requiredScopes.length > 0 &&
                                  ` · Scopes: ${ep.requiredScopes.join(', ')}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata & Provenance */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                      <span>
                        Classifier Mode:{' '}
                        <code className="font-mono text-slate-800">
                          {currentValidation.evidence.classifierMode}
                        </code>
                      </span>
                      <span className="tabular-nums">
                        Checked at {new Date(currentValidation.checkedAt).toLocaleTimeString()}
                      </span>
                      {currentValidation.sourceUrl.startsWith('https://') && (
                        <a
                          href={currentValidation.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                        >
                          Source Reference
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer Gate Controls */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setWizardStage(1)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <ArrowLeft size={14} />
                Back to Definition
              </button>

              <button
                type="button"
                disabled={!canProceedFromDocs}
                onClick={() => setWizardStage(3)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Proceed to Capability Discovery
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SCREEN 5: CAPABILITY DISCOVERY + SELECT THE COMPANY MODEL
      ===================================================================== */}
      {wizardStage === 3 && draftIntegration && collectorConfig && (
        <div className="space-y-6">
          {/* Derived Activity Proxy & Unsupported Metric Disclosure Banner */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-950">
              <p className="font-semibold">
                Strict Evidence &amp; Metric Honesty Boundary ({currentValidation?.evidence.providerName})
              </p>
              <p className="leading-relaxed">
                A 30-day <code className="font-mono">/scheduled_events</code> count is labeled
                strictly as a <strong>derived scheduling-activity proxy</strong>—it is{' '}
                <strong>NOT</strong> interactive login activity, paid-license utilization, total
                seat allocation, or actual billed usage. Unsupported fields remain excluded unless
                proven in documented API schemas.
              </p>
            </div>
          </div>

          {/* Capability Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                Analyzed Capabilities &amp; Source Evidence
              </h2>
              <p className="text-xs text-slate-500">
                Every target collector task is classified as Documented, Derived, or Not available
                in source.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Target Capability</th>
                    <th className="py-3 px-4">Classification</th>
                    <th className="py-3 px-4">Endpoint &amp; Scope Evidence</th>
                    <th className="py-3 px-4">Engineering Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {capabilities.map((cap) => (
                    <tr key={cap.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-slate-900">{cap.taskName}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-semibold">
                        {cap.status === 'documented' && (
                          <span className="text-emerald-700">Documented</span>
                        )}
                        {cap.status === 'derived' && (
                          <span className="text-amber-700">Derived Proxy</span>
                        )}
                        {cap.status === 'unavailable' && (
                          <span className="text-rose-700">Not available in source</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                        {cap.endpointEvidence.length > 0 ? cap.endpointEvidence.join(', ') : '—'}
                        {cap.requiredScopes.length > 0 && (
                          <div className="text-slate-500 mt-0.5">
                            Scopes: {cap.requiredScopes.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 leading-relaxed max-w-md">
                        <div>{cap.rationale}</div>
                        {cap.proxyDisclosure && (
                          <div className="mt-1 font-medium text-amber-800">
                            {cap.proxyDisclosure}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data Mapping Preview */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Canonical Data Mapping Preview</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-4">Canonical Field</th>
                    <th className="py-2.5 px-4">Source Expression</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {fieldMappings.map((m) => (
                    <tr key={m.canonicalField}>
                      <td className="py-2.5 px-4 font-mono text-slate-900">{m.canonicalField}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{m.sourceExpression}</td>
                      <td className="py-2.5 px-4 font-medium">
                        {m.status === 'documented'
                          ? 'Documented'
                          : m.status === 'derived'
                          ? 'Derived'
                          : 'Unavailable'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Select Company-Approved LLM + Collector Parameters */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Company Model Registry Selection */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Cpu size={16} className="text-sky-700" />
                  Select Company-Approved LLM <span className="text-rose-600">*</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Model selection is persisted to run provenance and cannot be changed mid-run
                  without starting a new version. Unconfigured providers are disabled.
                </p>
              </div>

              <div className="space-y-3" role="radiogroup" aria-label="Company-approved models">
                {models.map((m) => {
                  const key = `${m.provider}::${m.modelId}`;
                  const selected = selectedModelKey === key;
                  const disabled = !m.configured || !m.allowed;

                  return (
                    <label
                      key={key}
                      className={`block p-4 rounded-xl border transition-colors ${
                        disabled
                          ? 'border-slate-200 bg-slate-50 opacity-70 cursor-not-allowed'
                          : selected
                          ? 'border-sky-600 bg-sky-50/50 cursor-pointer'
                          : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="company-model"
                            value={key}
                            disabled={disabled}
                            checked={selected}
                            onChange={() => setSelectedModelKey(key)}
                            className="mt-1"
                          />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {m.label}
                              </span>
                              <span className="text-xs font-mono text-slate-500">{m.modelId}</span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {m.complianceLabel} · {m.latencyNote}
                            </div>
                            <p className="text-xs text-slate-600">
                              {m.strengths.join(' · ')}
                            </p>
                            {disabled && m.disabledReason && (
                              <p className="text-xs font-medium text-amber-800 flex items-center gap-1 pt-0.5">
                                <Lock size={12} />
                                {m.disabledReason}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                          {disabled
                            ? 'Contact admin to configure'
                            : m.isSimulated
                            ? 'Simulated Sandbox'
                            : 'Configured'}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Right: Collector Runtime Configuration */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <FileCode2 size={16} className="text-sky-700" />
                    Connector Generation Parameters
                  </h2>
                  <p className="text-xs text-slate-500">
                    Least-privilege read-only configuration. No live customer secrets required.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label htmlFor="cfg-auth-type" className="block font-semibold text-slate-700 mb-1">
                      Authentication Type
                    </label>
                    <select
                      id="cfg-auth-type"
                      value={collectorConfig.authType}
                      onChange={(e) =>
                        setCollectorConfig({
                          ...collectorConfig,
                          authType: e.target.value as AuthType,
                        })
                      }
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="personal_access_token">Personal Access Token (Bearer)</option>
                      <option value="oauth2">OAuth 2.0 Authorization Code</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="cfg-window" className="block font-semibold text-slate-700 mb-1">
                      Activity Window (Days)
                    </label>
                    <input
                      id="cfg-window"
                      type="number"
                      min={7}
                      max={90}
                      value={collectorConfig.collectionWindowDays}
                      onChange={(e) =>
                        setCollectorConfig({
                          ...collectorConfig,
                          collectionWindowDays: Number(e.target.value) || 30,
                        })
                      }
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>

                  <div>
                    <label htmlFor="cfg-pagesize" className="block font-semibold text-slate-700 mb-1">
                      Page Size (10–100)
                    </label>
                    <input
                      id="cfg-pagesize"
                      type="number"
                      min={10}
                      max={100}
                      value={collectorConfig.pageSize}
                      onChange={(e) =>
                        setCollectorConfig({
                          ...collectorConfig,
                          pageSize: Math.min(100, Math.max(10, Number(e.target.value) || 50)),
                        })
                      }
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>

                  <div>
                    <label htmlFor="cfg-retries" className="block font-semibold text-slate-700 mb-1">
                      Bounded Max Retries
                    </label>
                    <input
                      id="cfg-retries"
                      type="number"
                      min={1}
                      max={5}
                      value={collectorConfig.maxRetries}
                      onChange={(e) =>
                        setCollectorConfig({
                          ...collectorConfig,
                          maxRetries: Math.min(5, Math.max(1, Number(e.target.value) || 3)),
                        })
                      }
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>

                  <div>
                    <label htmlFor="cfg-verbosity" className="block font-semibold text-slate-700 mb-1">
                      Structured Log Verbosity
                    </label>
                    <select
                      id="cfg-verbosity"
                      value={collectorConfig.logVerbosity}
                      onChange={(e) =>
                        setCollectorConfig({
                          ...collectorConfig,
                          logVerbosity: e.target.value as 'info' | 'debug' | 'warn',
                        })
                      }
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="info">info (standard redacted)</option>
                      <option value="debug">debug (verbose redacted)</option>
                      <option value="warn">warn (errors &amp; retries only)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="cfg-ratelimit" className="block font-semibold text-slate-700 mb-1">
                      Rate-Limit Policy
                    </label>
                    <select
                      id="cfg-ratelimit"
                      value={collectorConfig.rateLimitPolicy}
                      onChange={(e) =>
                        setCollectorConfig({
                          ...collectorConfig,
                          rateLimitPolicy: e.target.value as CollectorConfig['rateLimitPolicy'],
                        })
                      }
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="respect_retry_after_exponential_jitter">
                        Retry-After + Exp Jitter
                      </option>
                      <option value="strict_backoff">Strict Conservative Backoff</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-teal-700" />
                    Read-Only Scopes ({collectorConfig.scopes.length})
                  </div>
                  <p className="font-mono text-slate-600">{collectorConfig.scopes.join(', ')}</p>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={pauseAfterCheckpoint1}
                    onChange={(e) => setPauseAfterCheckpoint1(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-slate-900">
                      Pause automatically after Checkpoint #1 (Orchestrator)
                    </span>
                    <p className="text-slate-500">
                      Useful for testing durable Pause → Browser Refresh → Resume from saved
                      checkpoint.
                    </p>
                  </div>
                </label>

                {stage3Error && (
                  <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                    {stage3Error}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWizardStage(2)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <ArrowLeft size={14} />
                  Docs
                </button>
                <button
                  type="button"
                  disabled={startingRun || !selectedModelKey}
                  onClick={handleStartCodeGeneration}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {startingRun ? 'Starting Multi-Agent Run...' : 'Generate Integration Code'}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Category Modal */}
      {showNewCategoryModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-cat-title"
        >
          <form
            onSubmit={handleCreateCategorySubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 id="create-cat-title" className="text-base font-bold text-slate-900">
                Create New Integration Category
              </h2>
              <button
                type="button"
                aria-label="Close new category modal"
                onClick={() => setShowNewCategoryModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X size={16} />
              </button>
            </div>

            {newCatError && (
              <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                {newCatError}
              </div>
            )}

            <div>
              <label htmlFor="new-cat-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Category Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="new-cat-name"
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Identity & HRIS"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="new-cat-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                Category Description <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="new-cat-desc"
                rows={2}
                required
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Describe what SaaS tools belong in this category..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowNewCategoryModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingCat}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50"
              >
                {creatingCat ? 'Creating...' : 'Save Category'}
              </button>
            </div>
          </form>
        </div>
      )}
        </>
      )}
    </div>
  );
};
