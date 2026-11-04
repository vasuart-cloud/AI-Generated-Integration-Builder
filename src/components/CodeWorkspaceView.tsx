import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileText,
  GitCompare,
  Lock,
  Redo2,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import {
  formatShortDate,
  IntegrationWithAccess,
  RunDetailPayload,
  studioApi,
} from '../lib/api';
import { CodeArtifact, GenerationRun } from '../shared/types';

interface CodeWorkspaceViewProps {
  actorId: string;
  runs: GenerationRun[];
  integrations: IntegrationWithAccess[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onOpenTraceView: (runId: string) => void;
  onBackToWorkbench: (runId: string) => void;
  onRefreshBootstrap: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

interface EditorHistoryState {
  past: string[];
  present: string;
  future: string[];
}

export const CodeWorkspaceView: React.FC<CodeWorkspaceViewProps> = ({
  actorId,
  runs,
  integrations,
  selectedRunId,
  onSelectRun,
  onOpenTraceView,
  onBackToWorkbench,
  onRefreshBootstrap,
  onNotify,
}) => {
  const runsWithCode = useMemo(() => runs.filter((r) => r.checkpointVersion >= 5 || r.status === 'ready_for_review'), [runs]);
  const effectiveRunId = selectedRunId ?? runsWithCode[0]?.id ?? runs[0]?.id ?? null;

  const [detail, setDetail] = useState<RunDetailPayload | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string>('src/apiClient.ts');
  const [historyByPath, setHistoryByPath] = useState<Record<string, EditorHistoryState>>({});
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!effectiveRunId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await studioApi.getRun(actorId, effectiveRunId);
        if (cancelled) return;
        setDetail(res);
        if (res.artifacts.length > 0) {
          const initialTabs = res.artifacts
            .slice(0, 4)
            .map((a) => a.path);
          setOpenTabs((prev) => (prev.length > 0 ? prev : initialTabs));
          const defaultFile =
            res.artifacts.find((a) => a.path === 'src/apiClient.ts')?.path ??
            res.artifacts[0].path;
          setActivePath((prev) =>
            res.artifacts.some((a) => a.path === prev) ? prev : defaultFile
          );
          const hist: Record<string, EditorHistoryState> = {};
          for (const art of res.artifacts) {
            hist[art.path] = { past: [], present: art.content, future: [] };
          }
          setHistoryByPath(hist);
        }
      } catch (err) {
        onNotify('error', err instanceof Error ? err.message : 'Unable to load code artifacts.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveRunId, actorId]);

  const activeArtifact: CodeArtifact | undefined = detail?.artifacts.find(
    (a) => a.path === activePath
  );
  const activeHistory = activeArtifact ? historyByPath[activeArtifact.path] : undefined;
  const currentBuffer = activeHistory?.present ?? activeArtifact?.content ?? '';
  const hasUnsavedChanges = Boolean(
    activeArtifact && currentBuffer !== activeArtifact.content
  );

  const integration =
    detail?.integration ?? integrations.find((i) => i.id === detail?.run.integrationId);
  const canEdit = integration?.access.canEdit ?? false;
  const run = detail?.run;

  const handleOpenFile = (path: string) => {
    setActivePath(path);
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path]);
    }
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.scrollTop = 0;
      if (gutterRef.current) gutterRef.current.scrollTop = 0;
    });
  };

  const handleCloseTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = openTabs.filter((t) => t !== path);
    setOpenTabs(remaining);
    if (activePath === path && remaining.length > 0) {
      setActivePath(remaining[remaining.length - 1]);
    }
  };

  const handleEditorChange = (nextText: string) => {
    if (!activeArtifact || !canEdit) return;
    setHistoryByPath((prev) => {
      const curr = prev[activeArtifact.path] ?? {
        past: [],
        present: activeArtifact.content,
        future: [],
      };
      return {
        ...prev,
        [activeArtifact.path]: {
          past: [...curr.past.slice(-25), curr.present],
          present: nextText,
          future: [],
        },
      };
    });
  };

  const handleUndo = () => {
    if (!activeArtifact || !activeHistory || activeHistory.past.length === 0) return;
    const previous = activeHistory.past[activeHistory.past.length - 1];
    const newPast = activeHistory.past.slice(0, -1);
    setHistoryByPath((prev) => ({
      ...prev,
      [activeArtifact.path]: {
        past: newPast,
        present: previous,
        future: [activeHistory.present, ...activeHistory.future],
      },
    }));
  };

  const handleRedo = () => {
    if (!activeArtifact || !activeHistory || activeHistory.future.length === 0) return;
    const next = activeHistory.future[0];
    const newFuture = activeHistory.future.slice(1);
    setHistoryByPath((prev) => ({
      ...prev,
      [activeArtifact.path]: {
        past: [...activeHistory.past, activeHistory.present],
        present: next,
        future: newFuture,
      },
    }));
  };

  const handleDiscardUnsaved = () => {
    if (!activeArtifact) return;
    setHistoryByPath((prev) => ({
      ...prev,
      [activeArtifact.path]: {
        past: [],
        present: activeArtifact.content,
        future: [],
      },
    }));
    onNotify('info', `Discarded unsaved edits in ${activeArtifact.path}.`);
  };

  const handleSave = async (restoreGenerated = false) => {
    if (!run || !activeArtifact) return;
    setSaving(true);
    try {
      const response = await studioApi.saveArtifact(actorId, run.id, {
        path: activeArtifact.path,
        content: currentBuffer,
        restoreGenerated,
      });

      setDetail((prev) =>
        prev
          ? {
              ...prev,
              run: response.run,
              artifacts: response.artifacts,
              traces: response.traces,
            }
          : prev
      );
      setHistoryByPath((prev) => ({
        ...prev,
        [response.artifact.path]: {
          past: [],
          present: response.artifact.content,
          future: [],
        },
      }));
      await onRefreshBootstrap();

      if (response.run.status === 'blocked' || response.run.status === 'failed') {
        onNotify(
          'error',
          `Saved v${response.run.codeVersion}, but verification flagged an issue—inspect details or View Trace.`
        );
      } else {
        onNotify(
          'success',
          `${
            restoreGenerated ? 'Restored generated baseline and saved' : 'Saved'
          } ${response.artifact.path} (Code v${response.run.codeVersion}).`
        );
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to save file.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!run || !integration) return;
    setDownloadingZip(true);
    try {
      await studioApi.downloadRunZip(
        actorId,
        run.id,
        `${integration.slug}-connector-v${run.codeVersion}.zip`
      );
      onNotify('success', `Downloaded ${integration.slug}-connector-v${run.codeVersion}.zip`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ZIP download failed.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const diffLines = useMemo(() => {
    if (!activeArtifact) return [];
    const baseLines = activeArtifact.generatedContent.split('\n');
    const currLines = currentBuffer.split('\n');
    const maxLen = Math.max(baseLines.length, currLines.length);
    const rows: Array<{
      line: number;
      status: 'same' | 'changed' | 'added' | 'removed';
      base?: string;
      curr?: string;
    }> = [];

    for (let i = 0; i < maxLen; i++) {
      const b = baseLines[i];
      const c = currLines[i];
      if (b === c) {
        rows.push({ line: i + 1, status: 'same', base: b, curr: c });
      } else if (b === undefined) {
        rows.push({ line: i + 1, status: 'added', curr: c });
      } else if (c === undefined) {
        rows.push({ line: i + 1, status: 'removed', base: b });
      } else {
        rows.push({ line: i + 1, status: 'changed', base: b, curr: c });
      }
    }
    return rows;
  }, [activeArtifact, currentBuffer]);

  if (!detail || !run || detail.artifacts.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
        <h1 className="text-lg font-bold text-slate-900">No Generated Code Artifacts Available</h1>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Approve Checkpoints #1 and #2 in the Multi-Agent Workbench so the Client Code and
          Resilience Agents synthesize your TypeScript connector files.
        </p>
        {effectiveRunId && (
          <button
            type="button"
            onClick={() => onBackToWorkbench(effectiveRunId)}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
          >
            Go to Multi-Agent Workbench
          </button>
        )}
      </div>
    );
  }

  const staticChecks = run.verificationResults.filter((v) => !v.isFixtureTest);
  const fixtureChecks = run.verificationResults.filter((v) => v.isFixtureTest);
  const lineNumbers = currentBuffer.split('\n').length;

  return (
    <div className="space-y-5">
      {/* Success or Failure Banner */}
      {run.status === 'ready_for_review' && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold text-emerald-950 text-sm">
                Integration code generated and saved successfully.
              </p>
              <p className="text-emerald-900 tabular-nums">
                Run ID: <code className="font-mono">{run.id}</code> · Code Version:{' '}
                <strong>v{run.codeVersion}</strong> · {detail.artifacts.length} files produced ·
                Validated with fixtures (Not deployed to production)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenTraceView(run.id)}
              className="px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg whitespace-nowrap"
            >
              Review Trace
            </button>
            <button
              type="button"
              disabled={downloadingZip}
              onClick={handleDownloadZip}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
            >
              <Download size={14} />
              {downloadingZip ? 'Packaging ZIP...' : 'Download ZIP'}
            </button>
          </div>
        </div>
      )}

      {run.failureBanner && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertCircle size={17} className="text-rose-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-950">{run.failureBanner.title}</p>
              <p className="text-rose-900">{run.failureBanner.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenTraceView(run.id)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-900 bg-white border border-rose-300 rounded-lg shrink-0"
          >
            View Trace
            <ExternalLink size={12} />
          </button>
        </div>
      )}

      {/* Workspace Header & Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {integration?.name} — Code Workspace
            </h1>
            <p className="text-xs text-slate-500 tabular-nums">
              Model: <code className="font-mono">{run.modelId}</code>
              {run.isSimulatedModel ? ' (simulated)' : ''} · Code v{run.codeVersion} ·{' '}
              {canEdit ? 'Owner Edit Mode' : 'View-Only Mode'}
            </p>
          </div>

          {runsWithCode.length > 1 && (
            <select
              aria-label="Switch code run version"
              value={run.id}
              onChange={(e) => onSelectRun(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
            >
              {runsWithCode.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} (v{r.codeVersion})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Editor Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 mr-2">
              <Lock size={13} />
              Owned by another developer (Read-only)
            </span>
          )}

          <button
            type="button"
            aria-label="Undo edit"
            disabled={!canEdit || !activeHistory || activeHistory.past.length === 0}
            onClick={handleUndo}
            className="p-2 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40"
            title="Undo"
          >
            <Undo2 size={14} />
          </button>

          <button
            type="button"
            aria-label="Redo edit"
            disabled={!canEdit || !activeHistory || activeHistory.future.length === 0}
            onClick={handleRedo}
            className="p-2 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40"
            title="Redo"
          >
            <Redo2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              showDiff
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <GitCompare size={13} />
            {showDiff ? 'Exit Diff' : 'See Diff'}
          </button>

          <button
            type="button"
            disabled={!canEdit || !hasUnsavedChanges}
            onClick={handleDiscardUnsaved}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            Discard
          </button>

          <button
            type="button"
            disabled={
              !canEdit ||
              saving ||
              (!activeArtifact?.isModifiedByDeveloper && !hasUnsavedChanges)
            }
            onClick={() => handleSave(true)}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            <RotateCcw size={13} />
            Restore Generated
          </button>

          <button
            type="button"
            disabled={!canEdit || saving || !hasUnsavedChanges}
            onClick={() => handleSave(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            <Save size={13} />
            {saving ? 'Saving...' : 'Save Version'}
          </button>

          {run.status !== 'ready_for_review' && (
            <button
              type="button"
              disabled={downloadingZip}
              onClick={handleDownloadZip}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
            >
              <Download size={13} />
              Download ZIP
            </button>
          )}
        </div>
      </div>

      {/* 3-Column IDE Grid: File Explorer | Syntax/Line-Numbered Editor | Verification Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Left: File Explorer */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Package Explorer</span>
              <span className="font-mono text-slate-400 tabular-nums">
                {detail.artifacts.length} files
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {detail.artifacts.map((art) => {
                const isSelected = art.path === activePath;
                const buf = historyByPath[art.path]?.present ?? art.content;
                const dirty = buf !== art.content;

                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => handleOpenFile(art.path)}
                    className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-sky-50 text-sky-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate font-mono">
                      {art.language === 'json' ? (
                        <FileJson size={14} className="text-amber-600 shrink-0" />
                      ) : art.language === 'markdown' ? (
                        <FileText size={14} className="text-slate-500 shrink-0" />
                      ) : (
                        <FileCode2 size={14} className="text-sky-600 shrink-0" />
                      )}
                      <span className="truncate">{art.path}</span>
                    </span>
                    <span className="font-mono text-[11px] shrink-0">
                      {dirty ? (
                        <span className="text-amber-700" title="Unsaved changes">
                          ●
                        </span>
                      ) : art.isModifiedByDeveloper ? (
                        <span className="text-sky-700" title="Modified from generated baseline">
                          M
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeArtifact && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 space-y-0.5 tabular-nums">
              <div>Saved by: {activeArtifact.savedBy}</div>
              <div>Last saved: {formatShortDate(activeArtifact.savedAt)}</div>
            </div>
          )}
        </div>

        {/* Center: Tabs + Code Editor / Diff Viewer */}
        <div className="xl:col-span-6 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          {/* Open File Tabs */}
          <div className="bg-slate-900 border-b border-slate-800 flex items-center overflow-x-auto">
            {openTabs.map((tabPath) => {
              const active = tabPath === activePath;
              return (
                <div
                  key={tabPath}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-mono border-r border-slate-800 cursor-pointer whitespace-nowrap ${
                    active ? 'bg-slate-950 text-sky-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => setActivePath(tabPath)}
                >
                  <span>{tabPath}</span>
                  {openTabs.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Close ${tabPath} tab`}
                      onClick={(e) => handleCloseTab(tabPath, e)}
                      className="text-slate-500 hover:text-white px-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Editor or Diff Content */}
          {showDiff ? (
            <div className="p-4 overflow-auto max-h-[540px] font-mono text-xs space-y-0.5 bg-slate-950 text-slate-200">
              <div className="pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                Comparing current buffer against original generated baseline for{' '}
                <strong className="text-white">{activeArtifact?.path}</strong>
              </div>
              {diffLines.map((row) => (
                <div
                  key={row.line}
                  className={`px-2 py-0.5 rounded-xs whitespace-pre-wrap break-all ${
                    row.status === 'added'
                      ? 'bg-emerald-950/80 text-emerald-300'
                      : row.status === 'removed'
                      ? 'bg-rose-950/80 text-rose-300'
                      : row.status === 'changed'
                      ? 'bg-amber-950/70 text-amber-200'
                      : 'text-slate-400'
                  }`}
                >
                  <span className="inline-block w-8 text-slate-600 select-none tabular-nums">
                    {row.line}
                  </span>
                  {row.status === 'changed'
                    ? `~ ${row.curr}  (was: ${row.base})`
                    : row.status === 'added'
                    ? `+ ${row.curr}`
                    : row.status === 'removed'
                    ? `- ${row.base}`
                    : `  ${row.curr}`}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[520px] max-h-[520px] overflow-hidden">
              {/* Line Numbers Gutter */}
              <div
                ref={gutterRef}
                aria-hidden="true"
                className="h-full py-4 px-3 bg-slate-900/70 border-r border-slate-800 text-right font-mono text-xs leading-6 text-slate-500 select-none tabular-nums overflow-hidden shrink-0"
              >
                {Array.from({ length: lineNumbers }, (_, idx) => (
                  <div key={idx + 1}>{idx + 1}</div>
                ))}
              </div>

              <label htmlFor="studio-code-editor" className="sr-only">
                Code editor for {activeArtifact?.path}
              </label>
              <textarea
                ref={editorRef}
                id="studio-code-editor"
                aria-label={`Code editor for ${activeArtifact?.path}`}
                readOnly={!canEdit}
                spellCheck={false}
                wrap="off"
                value={currentBuffer}
                onChange={(e) => handleEditorChange(e.target.value)}
                onScroll={(e) => {
                  if (gutterRef.current) {
                    gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                className="flex-1 h-full p-4 bg-slate-950 text-slate-100 font-mono text-xs leading-6 whitespace-pre resize-none focus:outline-none overflow-auto"
              />
            </div>
          )}
        </div>

        {/* Right: Static / Security / Fixture Test Inspector */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-5 overflow-y-auto max-h-[610px]">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-teal-700" />
              Verification Inspector
            </h2>
            <p className="text-xs text-slate-500">
              Separates static/security guards from sandbox fixture tests. Not live customer
              integration tests.
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-800">
              Static, Type &amp; Security Guards
            </h3>
            {staticChecks.map((chk) => (
              <div
                key={chk.name}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="text-slate-900">{chk.name}</span>
                  <span className={chk.passed ? 'text-emerald-700' : 'text-rose-700'}>
                    {chk.passed ? 'Pass' : 'Fail'}
                  </span>
                </div>
                <p className="text-slate-600 leading-snug">{chk.detail}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-semibold text-slate-800">
              Mock / Fixture Unit Tests (Sandbox)
            </h3>
            {fixtureChecks.map((chk) => (
              <div
                key={chk.name}
                className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="text-slate-900">{chk.name}</span>
                  <span className={chk.passed ? 'text-emerald-700' : 'text-rose-700'}>
                    {chk.passed ? 'Pass' : 'Fail'}
                  </span>
                </div>
                <p className="text-slate-600 leading-snug">{chk.detail}</p>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-lg bg-slate-100 text-[11px] text-slate-600 leading-relaxed">
            <strong>Production Readiness Notice:</strong> Passing static and fixture checks verifies
            code structure, host guards, and mock payloads. Run real staging credentials and peer
            security review outside this MVP before production rollout.
          </div>
        </div>
      </div>
    </div>
  );
};
