import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Boxes,
  CheckCircle2,
  Code2,
  Compass,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  PlayCircle,
  PlusCircle,
  Search,
  Settings,
  TerminalSquare,
  Users,
  X,
} from 'lucide-react';
import {
  BootstrapPayload,
  formatRunStatus,
  IntegrationWithAccess,
  studioApi,
} from './lib/api';
import { Category, DeveloperPreferences } from './shared/types';
import { AgentWorkbenchView } from './components/AgentWorkbenchView';
import { CatalogView } from './components/CatalogView';
import { CodeWorkspaceView } from './components/CodeWorkspaceView';
import { CreateIntegrationFlow } from './components/CreateIntegrationFlow';
import { GuidedDemoDrawer } from './components/GuidedDemoDrawer';
import { LoginPage } from './components/LoginPage';
import { OnboardingModal } from './components/OnboardingModal';
import { OverviewView } from './components/OverviewView';
import { SettingsView } from './components/SettingsView';
import { TracesView } from './components/TracesView';

type NavView =
  | 'overview'
  | 'catalog'
  | 'create'
  | 'my_integrations'
  | 'runs'
  | 'code'
  | 'traces'
  | 'settings';

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  traceRunId?: string;
}

const STORAGE_ACTOR_KEY = 'ce_studio_demo_actor_id';
const STORAGE_NAV_KEY = 'ce_studio_nav_state';
const STORAGE_AUTH_SESSION_KEY = 'ce_studio_demo_authenticated_user';

export default function App() {
  const isAutostart = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  }, []);

  // Demo Authentication Session (Persisted in sessionStorage across browser refreshes)
  const [authenticatedUser, setAuthenticatedUser] = useState<string | null>(() => {
    return window.sessionStorage.getItem(STORAGE_AUTH_SESSION_KEY);
  });

  const [actorId, setActorId] = useState<string>(() => {
    return window.localStorage.getItem(STORAGE_ACTOR_KEY) || 'dev-asha';
  });

  // Restore route & active run across browser refreshes!
  const initialNav = useMemo(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_NAV_KEY);
      if (saved) {
        return JSON.parse(saved) as {
          view: NavView;
          activeIntegrationId: string | null;
          activeRunId: string | null;
        };
      }
    } catch {
      // Ignore malformed session state
    }
    return {
      view: 'catalog' as NavView,
      activeIntegrationId: null,
      activeRunId: null,
    };
  }, []);

  const [activeView, setActiveView] = useState<NavView>(initialNav.view);
  const [activeIntegrationId, setActiveIntegrationId] = useState<string | null>(
    initialNav.activeIntegrationId
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(initialNav.activeRunId);
  const [traceRunFilter, setTraceRunFilter] = useState<string | null>(null);
  const [traceAgentFilter, setTraceAgentFilter] = useState<string | null>(null);
  const [traceIntegrationFilter, setTraceIntegrationFilter] = useState<string | null>(null);
  const [traceIdFilter, setTraceIdFilter] = useState<string | null>(null);

  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState<boolean>(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Feature 1: Developer Onboarding Modal displays immediately on login and EVERY TIME developer refreshes browser while authenticated
  // Implemented using application initialization state (true if authenticatedUser exists), not persistent completion state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return Boolean(window.sessionStorage.getItem(STORAGE_AUTH_SESSION_KEY));
  });

  const [showGuidedDemo, setShowGuidedDemo] = useState<boolean>(false);
  const [showHelpMenu, setShowHelpMenu] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showUserProfileMenu, setShowUserProfileMenu] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [quickSearch, setQuickSearch] = useState<string>('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    window.sessionStorage.setItem(
      STORAGE_NAV_KEY,
      JSON.stringify({
        view: activeView,
        activeIntegrationId,
        activeRunId,
      })
    );
  }, [activeView, activeIntegrationId, activeRunId]);

  const pushToast = useCallback(
    (type: 'success' | 'error' | 'info', message: string, traceRunId?: string) => {
      const id = `tst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-2), { id, type, message, traceRunId }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5500);
    },
    []
  );

  const loadBootstrap = useCallback(async (targetActorId = actorId) => {
    try {
      setBootstrapError(null);
      const data = await studioApi.bootstrap(targetActorId, false);
      setBootstrap(data);
      return data;
    } catch (err) {
      setBootstrapError(
        err instanceof Error ? err.message : 'Unable to connect to Integration Studio server.'
      );
      return null;
    } finally {
      setLoadingBootstrap(false);
    }
  }, [actorId]);

  useEffect(() => {
    if (!authenticatedUser) {
      setLoadingBootstrap(false);
      return;
    }
    setLoadingBootstrap(true);
    loadBootstrap(actorId);
  }, [authenticatedUser, actorId, loadBootstrap]);

  const handleSwitchDeveloper = (nextActorId: string) => {
    window.localStorage.setItem(STORAGE_ACTOR_KEY, nextActorId);
    setActorId(nextActorId);
    setShowNotifications(false);
    setShowHelpMenu(false);
    pushToast(
      'info',
      `Switched Demo Identity to ${nextActorId === 'dev-asha' ? 'Asha Patel (Developer A)' : 'Ravi Menon (Developer B)'}.`
    );
  };

  const handleLoginSuccess = (username: string) => {
    window.sessionStorage.setItem(STORAGE_AUTH_SESSION_KEY, username);
    setAuthenticatedUser(username);
    // Redirect to Integration Catalog landing page
    setActiveView('catalog');
    setActiveIntegrationId(null);
    // Display onboarding modal immediately
    setShowOnboarding(true);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem(STORAGE_AUTH_SESSION_KEY);
    setAuthenticatedUser(null);
    setShowOnboarding(false);
    setShowUserProfileMenu(false);
  };

  const handleUpdatePreferences = async (patch: Partial<DeveloperPreferences>) => {
    const res = await studioApi.updatePreferences(actorId, patch);
    setBootstrap((prev) =>
      prev
        ? {
            ...prev,
            currentDeveloper: res.developer,
          }
        : prev
    );
  };

  const handleNavigate = (
    nextView: NavView,
    context?: {
      integrationId?: string | null;
      runId?: string | null;
      traceRunId?: string | null;
      traceIntegrationId?: string | null;
      agentId?: string | null;
      traceId?: string | null;
    }
  ) => {
    setActiveView(nextView);
    if (context?.integrationId !== undefined) {
      setActiveIntegrationId(context.integrationId);
    }
    if (context?.runId !== undefined) {
      setActiveRunId(context.runId);
    }
    if (context?.traceRunId !== undefined) {
      setTraceRunFilter(context.traceRunId);
    }
    if (context?.traceIntegrationId !== undefined) {
      setTraceIntegrationFilter(context.traceIntegrationId);
    }
    if (context?.agentId !== undefined) {
      setTraceAgentFilter(context.agentId);
    }
    if (context?.traceId !== undefined) {
      setTraceIdFilter(context.traceId);
    }
    setMobileMenuOpen(false);
    setShowHelpMenu(false);
    setShowNotifications(false);
  };

  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickSearch.trim().toLowerCase();
    if (!q || !bootstrap) return;

    const matchedRun = bootstrap.runs.find((r) => r.id.toLowerCase().includes(q));
    if (matchedRun) {
      handleNavigate('runs', {
        integrationId: matchedRun.integrationId,
        runId: matchedRun.id,
      });
      setQuickSearch('');
      return;
    }

    const matchedInt = bootstrap.integrations.find((i) =>
      i.name.toLowerCase().includes(q)
    );
    if (matchedInt) {
      if (!matchedInt.isDefault && matchedInt.access.canEdit) {
        handleNavigate('create', { integrationId: matchedInt.id });
      } else {
        handleNavigate('catalog');
      }
      setQuickSearch('');
      return;
    }

    handleNavigate('traces', {
      traceRunId: null,
      traceIntegrationId: null,
      agentId: 'all',
    });
    setQuickSearch('');
  };

  const latestActiveRun = useMemo(() => {
    if (!bootstrap || bootstrap.runs.length === 0) return null;
    if (activeRunId) {
      const found = bootstrap.runs.find((r) => r.id === activeRunId);
      if (found) return found;
    }
    return bootstrap.runs[0];
  }, [bootstrap, activeRunId]);

  const alertItems = useMemo(() => {
    if (!bootstrap) return [];
    return bootstrap.runs.filter(
      (r) =>
        r.status === 'awaiting_approval' ||
        r.status === 'failed' ||
        r.status === 'blocked' ||
        r.status === 'paused'
    );
  }, [bootstrap]);

  const breadcrumbLabel: Record<NavView, string> = {
    overview: 'Overview',
    catalog: 'Integration Catalog',
    create: 'Create & Configure Integration',
    my_integrations: 'My Integrations',
    runs: 'Runs & Multi-Agent Workbench',
    code: 'Code Workspace',
    traces: 'Redacted Traces',
    settings: 'Settings & Governance',
  };

  const navItems: Array<{ id: NavView; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { id: 'catalog', label: 'Integration Catalog', icon: <Boxes size={16} /> },
    { id: 'create', label: 'Create Integration', icon: <PlusCircle size={16} /> },
    { id: 'my_integrations', label: 'My Integrations', icon: <FolderKanban size={16} /> },
    { id: 'runs', label: 'Runs & Agents', icon: <PlayCircle size={16} /> },
    { id: 'code', label: 'Code Workspace', icon: <Code2 size={16} /> },
    { id: 'traces', label: 'Traces', icon: <TerminalSquare size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  ];

  // Feature 1: Route protection - display login page when opened without active demo session
  if (!authenticatedUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (loadingBootstrap && !bootstrap) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full space-y-4">
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (bootstrapError || !bootstrap) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-rose-200 rounded-xl p-6 max-w-md w-full space-y-4">
          <h1 className="text-base font-bold text-slate-900">Workspace Initialization Failed</h1>
          <p className="text-xs text-rose-700">{bootstrapError}</p>
          <button
            type="button"
            onClick={() => loadBootstrap(actorId)}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const currentDeveloper = bootstrap.currentDeveloper;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Dark Left Navigation Sidebar (Desktop) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-slate-900 text-slate-200 shrink-0 border-r border-slate-800">
        <div className="px-5 py-5 border-b border-slate-800">
          <button
            type="button"
            onClick={() => handleNavigate('overview')}
            className="text-left focus:outline-none"
          >
            <div className="font-display font-bold text-base text-white tracking-tight">
              CloudEagle Studio
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Developer Integration Workbench
            </div>
          </button>
        </div>

        <nav aria-label="Primary Sidebar Navigation" className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'create') {
                    handleNavigate('create', { integrationId: null });
                  } else if (item.id === 'traces') {
                    handleNavigate('traces', {
                      traceRunId: null,
                      traceIntegrationId: null,
                      agentId: 'all',
                    });
                  } else {
                    handleNavigate(item.id);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2.5 text-xs">
          <button
            type="button"
            onClick={() => setShowGuidedDemo((v) => !v)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold transition-colors whitespace-nowrap"
          >
            <Compass size={14} />
            {showGuidedDemo ? 'Hide Guided Demo' : 'Guided Demo (13 Steps)'}
          </button>
          <div className="text-[11px] text-slate-400 px-1 truncate">
            Workspace: {currentDeveloper.preferences.workspaceName}
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div className="w-64 bg-slate-900 text-slate-200 h-full flex flex-col justify-between p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="font-display font-bold text-white">CloudEagle Studio</span>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'create') {
                        handleNavigate('create', { integrationId: null });
                      } else if (item.id === 'traces') {
                        handleNavigate('traces', {
                          traceRunId: null,
                          traceIntegrationId: null,
                          agentId: 'all',
                        });
                      } else {
                        handleNavigate(item.id);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      activeView === item.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          {/* Left: Mobile Menu + Breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
            >
              <Menu size={18} />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs min-w-0">
              <button
                type="button"
                onClick={() => handleNavigate('overview')}
                className="text-slate-500 hover:text-slate-900 font-medium hidden sm:inline whitespace-nowrap"
              >
                {currentDeveloper.preferences.workspaceName}
              </button>
              <span aria-hidden="true" className="text-slate-300 hidden sm:inline">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {breadcrumbLabel[activeView]}
              </span>
            </nav>
          </div>

          {/* Right: Persistent Run Status + Quick Search + Demo Identity Switcher + Help + Notifications */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Persistent Run Status Indicator Across Pages */}
            {latestActiveRun && (
              <button
                type="button"
                onClick={() =>
                  handleNavigate('runs', {
                    integrationId: latestActiveRun.integrationId,
                    runId: latestActiveRun.id,
                  })
                }
                className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 whitespace-nowrap tabular-nums"
              >
                <Activity size={13} className="text-sky-600" />
                <span className="font-mono">{latestActiveRun.id}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRunStatus(latestActiveRun.status)}</span>
              </button>
            )}

            {/* Quick Jump Search */}
            <form onSubmit={handleQuickSearchSubmit} className="hidden md:block relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                aria-label="Quick search integrations or runs"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Jump to integration or run..."
                className="w-48 pl-8 pr-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </form>

            {/* Demo Identity Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2 sm:px-2.5 py-1">
              <Users size={13} className="text-slate-500 shrink-0" />
              <label htmlFor="demo-identity-select" className="text-[11px] font-medium text-slate-600 hidden sm:inline whitespace-nowrap">
                Demo identity switcher:
              </label>
              <select
                id="demo-identity-select"
                aria-label="Demo identity switcher"
                value={currentDeveloper.id}
                onChange={(e) => handleSwitchDeveloper(e.target.value)}
                className="max-w-[125px] sm:max-w-none truncate text-xs font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
              >
                {bootstrap.developers.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name} ({dev.id === 'dev-asha' ? 'Developer A' : 'Developer B'})
                  </option>
                ))}
              </select>
            </div>

            {/* Notifications Menu */}
            <div className="relative">
              <button
                type="button"
                aria-label={`Notifications (${alertItems.length} active items)`}
                onClick={() => {
                  setShowNotifications((v) => !v);
                  setShowHelpMenu(false);
                }}
                className="inline-flex items-center gap-1 p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Bell size={16} />
                {alertItems.length > 0 && (
                  <span className="text-[11px] font-bold text-amber-800 tabular-nums">
                    {alertItems.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-40 space-y-2 text-xs">
                  <div className="font-semibold text-slate-900 pb-2 border-b border-slate-100">
                    Run Checkpoints &amp; Alerts
                  </div>
                  {alertItems.length === 0 ? (
                    <p className="text-slate-500 py-2">No pending approvals or failed runs.</p>
                  ) : (
                    alertItems.slice(0, 5).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          handleNavigate('runs', {
                            integrationId: r.integrationId,
                            runId: r.id,
                          })
                        }
                        className="w-full text-left p-2 rounded-lg hover:bg-slate-50 space-y-0.5"
                      >
                        <div className="font-semibold text-slate-900 font-mono">{r.id}</div>
                        <div className="text-slate-600">{formatRunStatus(r.status)}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Help & Replay Onboarding Menu */}
            <div className="relative">
              <button
                type="button"
                aria-label="Help and onboarding menu"
                onClick={() => {
                  setShowHelpMenu((v) => !v);
                  setShowNotifications(false);
                }}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <HelpCircle size={16} />
              </button>

              {showHelpMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-40 text-xs space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHelpMenu(false);
                      setShowOnboarding(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 font-medium text-slate-800"
                  >
                    Replay Onboarding Wizard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowHelpMenu(false);
                      setShowGuidedDemo(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 font-medium text-slate-800"
                  >
                    Launch 13-Step Guided Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate('settings')}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 font-medium text-slate-800"
                  >
                    Model Registry &amp; Security Limits
                  </button>
                </div>
              )}
            </div>

            {/* User Profile & Logout Menu */}
            <div className="relative">
              <button
                type="button"
                aria-label={`User profile menu for ${currentDeveloper.name}`}
                onClick={() => {
                  setShowUserProfileMenu((v) => !v);
                  setShowHelpMenu(false);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  {currentDeveloper.avatarInitials || 'AP'}
                </div>
                <span className="text-xs font-semibold hidden md:inline">{currentDeveloper.name}</span>
              </button>

              {showUserProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-40 text-xs space-y-1">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="font-semibold text-slate-900">{currentDeveloper.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{currentDeveloper.email}</p>
                    <p className="text-[10px] text-sky-700 font-medium mt-0.5">{currentDeveloper.roleTitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserProfileMenu(false);
                      setShowOnboarding(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 font-medium text-slate-800"
                  >
                    Open Onboarding Tour
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 text-rose-700 font-semibold flex items-center gap-2"
                  >
                    <LogOut size={14} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {showGuidedDemo && (
            <GuidedDemoDrawer
              onNavigateStepTarget={(target, stepNumber) => {
                if (target === 'onboarding') {
                  setShowOnboarding(true);
                  return;
                }
                if (target === 'create') {
                  if (stepNumber === 3) {
                    handleNavigate('create', { integrationId: null });
                  } else {
                    const editableCustom =
                      bootstrap.integrations.find(
                        (i) => !i.isDefault && i.access.canEdit && i.id === activeIntegrationId
                      ) ??
                      bootstrap.integrations.find((i) => !i.isDefault && i.access.canEdit) ??
                      null;
                    handleNavigate('create', { integrationId: editableCustom?.id ?? null });
                  }
                  return;
                }
                if (target === 'traces') {
                  handleNavigate('traces', {
                    traceRunId: null,
                    traceIntegrationId: null,
                    agentId: 'all',
                  });
                  return;
                }
                handleNavigate(target as NavView);
              }}
              onClose={() => setShowGuidedDemo(false)}
            />
          )}

          {activeView === 'overview' && (
            <OverviewView
              currentDeveloper={currentDeveloper}
              integrations={bootstrap.integrations}
              categories={bootstrap.categories}
              runs={bootstrap.runs}
              models={bootstrap.models}
              audits={bootstrap.audits}
              onNavigate={(v, ctx) =>
                handleNavigate(v as NavView, {
                  integrationId: ctx?.integrationId,
                  runId: ctx?.runId,
                })
              }
              onStartGuidedDemo={() => setShowGuidedDemo(true)}
            />
          )}

          {(activeView === 'catalog' || activeView === 'my_integrations') && (
            <CatalogView
              mode={activeView === 'my_integrations' ? 'mine' : 'all'}
              currentDeveloper={currentDeveloper}
              developers={bootstrap.developers}
              integrations={bootstrap.integrations}
              categories={bootstrap.categories}
              runs={bootstrap.runs}
              viewMode={currentDeveloper.preferences.catalogViewMode}
              onChangeViewMode={(next) => {
                handleUpdatePreferences({ catalogViewMode: next });
              }}
              onAddIntegration={() => handleNavigate('create', { integrationId: null })}
              onConfigureDocsOrCapabilities={(integrationId) =>
                handleNavigate('create', { integrationId })
              }
              onOpenRunWorkbench={(integrationId, runId) =>
                handleNavigate('runs', { integrationId, runId: runId ?? null })
              }
              onOpenCodeWorkspace={(integrationId, runId) =>
                handleNavigate('code', { integrationId, runId })
              }
              onUpdateIntegration={async (integrationId, patch) => {
                await studioApi.updateIntegration(actorId, integrationId, patch);
                await loadBootstrap(actorId);
                pushToast('success', `Updated metadata for "${patch.name}".`);
              }}
              onDeleteOrArchiveIntegration={async (integrationId, actionMode) => {
                await studioApi.deleteOrArchiveIntegration(actorId, integrationId, actionMode);
                await loadBootstrap(actorId);
                pushToast(
                  'info',
                  `${actionMode === 'archive' ? 'Archived' : 'Soft-deleted'} integration while preserving audit trail.`
                );
              }}
            />
          )}

          {activeView === 'create' && (
            <CreateIntegrationFlow
              actorId={actorId}
              currentDeveloper={currentDeveloper}
              categories={bootstrap.categories}
              existingIntegrations={bootstrap.integrations}
              models={bootstrap.models}
              activeIntegrationId={activeIntegrationId}
              onDraftCreated={async (created: IntegrationWithAccess) => {
                setActiveIntegrationId(created.id);
                await loadBootstrap(actorId);
                pushToast('success', `Draft integration "${created.name}" saved (Owner: ${currentDeveloper.name}).`);
              }}
              onCategoryCreated={async (_cat: Category) => {
                await loadBootstrap(actorId);
              }}
              onCancelCreation={() => handleNavigate('catalog', { integrationId: null })}
              onRunStarted={async (integrationId, runId) => {
                await loadBootstrap(actorId);
                handleNavigate('runs', { integrationId, runId });
                pushToast('info', `Started supervised multi-agent run ${runId}.`);
              }}
              onOpenTraceForIntegration={(integrationId) => {
                handleNavigate('traces', {
                  traceRunId: null,
                  traceIntegrationId: integrationId,
                  agentId: 'all',
                });
              }}
              onNotify={(type, msg) => pushToast(type, msg)}
            />
          )}

          {activeView === 'runs' && (
            <AgentWorkbenchView
              actorId={actorId}
              currentDeveloper={currentDeveloper}
              runs={bootstrap.runs}
              integrations={bootstrap.integrations}
              selectedRunId={activeRunId}
              onSelectRun={(runId) => setActiveRunId(runId)}
              onOpenCodeWorkspace={(integrationId, runId) =>
                handleNavigate('code', { integrationId, runId })
              }
              onOpenTraceView={(runId, agentId, traceId) => {
                handleNavigate('traces', {
                  traceRunId: runId,
                  traceIntegrationId: null,
                  agentId: agentId ?? 'all',
                  traceId: traceId ?? null,
                });
              }}
              onCreateIntegration={() => handleNavigate('create', { integrationId: null })}
              onRefreshBootstrap={async () => {
                await loadBootstrap(actorId);
              }}
              onNotify={(type, msg) => pushToast(type, msg, activeRunId ?? undefined)}
            />
          )}

          {activeView === 'code' && (
            <CodeWorkspaceView
              actorId={actorId}
              runs={bootstrap.runs}
              integrations={bootstrap.integrations}
              selectedRunId={activeRunId}
              onSelectRun={(runId) => setActiveRunId(runId)}
              onOpenTraceView={(runId) => {
                handleNavigate('traces', {
                  traceRunId: runId,
                  traceIntegrationId: null,
                  agentId: 'all',
                  traceId: null,
                });
              }}
              onBackToWorkbench={(runId) => handleNavigate('runs', { runId })}
              onRefreshBootstrap={async () => {
                await loadBootstrap(actorId);
              }}
              onNotify={(type, msg) => pushToast(type, msg, activeRunId ?? undefined)}
            />
          )}

          {activeView === 'traces' && (
            <TracesView
              actorId={actorId}
              runs={bootstrap.runs}
              integrations={bootstrap.integrations}
              initialRunId={traceRunFilter}
              initialAgentId={traceAgentFilter}
              initialIntegrationId={traceIntegrationFilter}
              initialTraceId={traceIdFilter}
              onJumpToRunWorkbench={(runId) => handleNavigate('runs', { runId })}
              onRetryFailedRun={async (runId) => {
                await studioApi.controlRun(actorId, runId, 'retry', {
                  failureInjection: 'none',
                  operationId: `trace-retry-${Date.now()}`,
                });
                await loadBootstrap(actorId);
                pushToast('success', `Cleared fault simulation and retried run ${runId}.`);
                handleNavigate('runs', { runId });
              }}
              onNotify={(type, msg) => pushToast(type, msg)}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              currentDeveloper={currentDeveloper}
              models={bootstrap.models}
              audits={bootstrap.audits}
              onResetWorkspace={async () => {
                await studioApi.resetWorkspace(actorId);
                setActiveIntegrationId(null);
                setActiveRunId(null);
                await loadBootstrap(actorId);
                pushToast('info', 'Reset demo workspace to clean initial catalog seed.');
              }}
              onReplayOnboarding={() => setShowOnboarding(true)}
            />
          )}
        </main>
      </div>

      {/* First-Run / On-Refresh Developer Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          developer={currentDeveloper}
          onClose={() => setShowOnboarding(false)}
          onExploreCatalog={() => handleNavigate('catalog')}
          onCreateFirstIntegration={() => handleNavigate('create', { integrationId: null })}
        />
      )}

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-md flex items-start justify-between gap-3 text-xs ${
                t.type === 'error'
                  ? 'bg-rose-950 text-white border-rose-800'
                  : t.type === 'success'
                  ? 'bg-slate-900 text-white border-slate-700'
                  : 'bg-white text-slate-900 border-slate-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {t.type === 'success' && (
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="leading-snug">{t.message}</p>
                  {t.type === 'error' && t.traceRunId && (
                    <button
                      type="button"
                      onClick={() =>
                        handleNavigate('traces', {
                          traceRunId: t.traceRunId,
                          traceIntegrationId: null,
                          agentId: 'all',
                        })
                      }
                      className="underline font-semibold text-rose-200 hover:text-white"
                    >
                      View Trace
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="opacity-70 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
