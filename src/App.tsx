import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Layers,
  Flag,
  Sliders,
  Users,
  GitBranch,
  History,
  CheckSquare,
  BarChart3,
  Sparkles,
  UserCog,
  Terminal,
  Activity,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { apiFetch, getStoredToken, setStoredToken } from './api/client.ts';
import type { Environment, Project, User } from './types/flagship.ts';
import { ToastContainer, type ToastMessage } from './components/Toast.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { ProjectsPage, EnvironmentsPage } from './pages/ProjectsAndEnvsPages.tsx';
import { FlagsListPage, FlagCreateEditPage, FlagDetailPage } from './pages/FlagsPages.tsx';
import { TargetingRulesPage, SegmentsPage, RolloutsPage } from './pages/TargetingAndSegmentsPages.tsx';
import { ChangeHistoryPage, ApprovalCenterPage } from './pages/GovernancePages.tsx';
import { ExperimentAnalyticsPage, FlagHygienePage } from './pages/AnalyticsAndHygienePages.tsx';
import { TeamRolesPage, SdkSetupPage, SystemHealthPage, SettingsPage } from './pages/PlatformPages.tsx';

type NavPageId =
  | 'overview'
  | 'projects'
  | 'environments'
  | 'flags'
  | 'flag-create'
  | 'flag-edit'
  | 'flag-detail'
  | 'targeting'
  | 'segments'
  | 'rollouts'
  | 'history'
  | 'approvals'
  | 'experiments'
  | 'hygiene'
  | 'team'
  | 'sdk-setup'
  | 'health'
  | 'settings';

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{ id: NavPageId; label: string; icon: typeof LayoutDashboard }>;
}> = [
  {
    title: 'Control Plane',
    items: [
      { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard },
      { id: 'projects', label: 'Projects', icon: FolderKanban },
      { id: 'environments', label: 'Environments', icon: Layers },
      { id: 'flags', label: 'Feature Flags', icon: Flag },
    ],
  },
  {
    title: 'Targeting & Delivery',
    items: [
      { id: 'targeting', label: 'Targeting Rules', icon: GitBranch },
      { id: 'segments', label: 'User Segments', icon: Users },
      { id: 'rollouts', label: 'Rollout Management', icon: Sliders },
    ],
  },
  {
    title: 'Governance & Insights',
    items: [
      { id: 'approvals', label: 'Approval Center', icon: CheckSquare },
      { id: 'history', label: 'Change History', icon: History },
      { id: 'experiments', label: 'Experiment Analytics', icon: BarChart3 },
      { id: 'hygiene', label: 'Flag Hygiene', icon: Sparkles },
    ],
  },
  {
    title: 'Platform & SDK',
    items: [
      { id: 'team', label: 'Team & Roles', icon: UserCog },
      { id: 'sdk-setup', label: 'SDK Setup', icon: Terminal },
      { id: 'health', label: 'System Health', icon: Activity },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [page, setPage] = useState<NavPageId>('overview');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number>(1);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<number>(3);
  const [activeFlagId, setActiveFlagId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => localStorage.getItem('flagship_theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('flagship_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const notify = useCallback(
    (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    [],
  );

  // Restore JWT session
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiFetch<{ user: User }>('/api/v1/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setStoredToken(null))
      .finally(() => setAuthChecking(false));
  }, []);

  const loadWorkspaceContext = useCallback(async () => {
    if (!user) return;
    try {
      const pRes = await apiFetch<{ items: Project[] }>('/api/v1/projects');
      setProjects(pRes.items);
      const pid =
        pRes.items.find((p) => p.id === selectedProjectId)?.id ?? pRes.items[0]?.id ?? 1;
      setSelectedProjectId(pid);
      const eRes = await apiFetch<{ items: Environment[] }>(`/api/v1/environments?projectId=${pid}`);
      setEnvironments(eRes.items);
      if (eRes.items.length > 0 && !eRes.items.some((e) => e.id === selectedEnvId)) {
        const prod = eRes.items.find((e) => e.key === 'production') ?? eRes.items[0];
        setSelectedEnvId(prod.id);
      }
    } catch {
      // handled per page
    }
  }, [user, selectedProjectId, selectedEnvId]);

  useEffect(() => {
    loadWorkspaceContext();
  }, [user, selectedProjectId]);

  // Real-time SSE listener for dashboard auto-refresh
  useEffect(() => {
    if (!user) return;
    const es = new EventSource('/api/v1/sdk/dashboard-stream');
    es.addEventListener('flag-update', () => {
      setRefreshSignal((s) => s + 1);
    });
    return () => es.close();
  }, [user]);

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    setPage('overview');
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Initializing FlagShip Control Plane...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={(u) => setUser(u)} />;
  }

  const activeProject = projects.find((p) => p.id === selectedProjectId);
  const currentPageLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === page)?.label ||
    (page === 'flag-create'
      ? 'Create Flag'
      : page === 'flag-edit'
        ? 'Edit Flag'
        : page === 'flag-detail'
          ? 'Flag Details'
          : 'Overview');

  const navigate = (nextPage: NavPageId) => {
    setPage(nextPage);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop & Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('overview')}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <Flag className="w-4 h-4" />
            </div>
            <span className="text-base font-bold tracking-tight font-display whitespace-nowrap">
              FlagShip
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1 text-slate-400"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-3 mb-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    page === item.id ||
                    (item.id === 'flags' &&
                      (page === 'flag-create' || page === 'flag-edit' || page === 'flag-detail'));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.name}
              </div>
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                {user.role}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 lg:px-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {activeProject?.name || 'Workspace'}
              </span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentPageLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              aria-label="Active Project"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Toggle color theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          {page === 'overview' && (
            <OverviewPage
              onNavigate={(target) => navigate(target as NavPageId)}
              refreshSignal={refreshSignal}
            />
          )}
          {page === 'projects' && (
            <ProjectsPage
              selectedProjectId={selectedProjectId}
              onSelectProject={(id) => {
                setSelectedProjectId(id);
                notify('info', 'Project switched');
              }}
              onNotify={notify}
              onProjectsChanged={loadWorkspaceContext}
            />
          )}
          {page === 'environments' && (
            <EnvironmentsPage projectId={selectedProjectId} onNotify={notify} />
          )}
          {page === 'flags' && (
            <FlagsListPage
              projectId={selectedProjectId}
              selectedEnvId={selectedEnvId}
              environments={environments}
              onSelectEnv={setSelectedEnvId}
              onOpenFlag={(id) => {
                setActiveFlagId(id);
                navigate('flag-detail');
              }}
              onCreateFlag={() => {
                setActiveFlagId(null);
                navigate('flag-create');
              }}
              onNotify={notify}
              refreshSignal={refreshSignal}
            />
          )}
          {(page === 'flag-create' || page === 'flag-edit') && (
            <FlagCreateEditPage
              projectId={selectedProjectId}
              editFlagId={page === 'flag-edit' ? activeFlagId : null}
              onSaved={(id) => {
                setActiveFlagId(id);
                navigate('flag-detail');
              }}
              onCancel={() => navigate('flags')}
              onNotify={notify}
            />
          )}
          {page === 'flag-detail' && activeFlagId && (
            <FlagDetailPage
              flagId={activeFlagId}
              selectedEnvId={selectedEnvId}
              onSelectEnv={setSelectedEnvId}
              onBack={() => navigate('flags')}
              onEdit={(id) => {
                setActiveFlagId(id);
                navigate('flag-edit');
              }}
              onOpenTargeting={(id) => {
                setActiveFlagId(id);
                navigate('targeting');
              }}
              onNotify={notify}
            />
          )}
          {page === 'targeting' && (
            <TargetingRulesPage
              projectId={selectedProjectId}
              selectedEnvId={selectedEnvId}
              environments={environments}
              initialFlagId={activeFlagId}
              onSelectEnv={setSelectedEnvId}
              onNotify={notify}
            />
          )}
          {page === 'segments' && (
            <SegmentsPage projectId={selectedProjectId} onNotify={notify} />
          )}
          {page === 'rollouts' && (
            <RolloutsPage
              projectId={selectedProjectId}
              selectedEnvId={selectedEnvId}
              environments={environments}
              onSelectEnv={setSelectedEnvId}
              onNotify={notify}
            />
          )}
          {page === 'history' && <ChangeHistoryPage onNotify={notify} />}
          {page === 'approvals' && (
            <ApprovalCenterPage
              currentUser={user}
              onNotify={notify}
              onApprovalResolved={() => setRefreshSignal((s) => s + 1)}
            />
          )}
          {page === 'experiments' && (
            <ExperimentAnalyticsPage environments={environments} onNotify={notify} />
          )}
          {page === 'hygiene' && <FlagHygienePage onNotify={notify} />}
          {page === 'team' && <TeamRolesPage currentUser={user} onNotify={notify} />}
          {page === 'sdk-setup' && (
            <SdkSetupPage
              environments={environments}
              selectedEnvId={selectedEnvId}
              onNotify={notify}
            />
          )}
          {page === 'health' && <SystemHealthPage />}
          {page === 'settings' && (
            <SettingsPage
              currentUser={user}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
            />
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
