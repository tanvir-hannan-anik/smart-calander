import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, CheckSquare, Clock, Command,
  Settings, Users, BookOpen, Layers,
  MessageSquare, Sparkles, Mic, Plus, Search,
  ChevronLeft, LayoutGrid, LogOut, Menu, X
} from 'lucide-react';
import { cn } from './lib/utils';
import Dashboard from './pages/Dashboard';
import CalendarView from './pages/CalendarView';
import StudyPlanner from './pages/StudyPlanner';
import HabitsView from './pages/HabitsView';
import TeamWorkspace from './pages/TeamWorkspace';
import AIChatPanel from './components/AIChatPanel';
import { logout } from './lib/auth';

type ViewState = 'dashboard' | 'calendar' | 'planner' | 'habits' | 'team';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  // AI panel + sidebar default open on desktop, closed on mobile so they
  // don't cover the whole screen on first load.
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    import('./lib/auth').then(({ initAuth }) => {
      initAuth(
        (user) => setUser(user),
        () => setUser(null)
      );
    });
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const { googleSignIn } = await import('./lib/auth');
      const result = await googleSignIn();
      if (result) setUser(result.user);
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
  }

  const navigation = [
    { name: 'Dashboard', id: 'dashboard', icon: LayoutGrid },
    { name: 'Calendar', id: 'calendar', icon: Calendar },
    { name: 'Study Planner', id: 'planner', icon: BookOpen },
    { name: 'Habits', id: 'habits', icon: CheckSquare },
    { name: 'Team Workspace', id: 'team', icon: Users },
  ] as const;

  return (
    <div className="flex h-screen w-full bg-[var(--bg-main)] text-[var(--text-primary)] font-sans overflow-hidden selection:bg-[var(--accent-blue)] selection:text-white">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar — off-canvas drawer on mobile, static column on desktop */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-[260px] flex-shrink-0 flex flex-col border-r border-[#2C2C2C] bg-[var(--bg-sidebar)] transform transition-transform duration-300 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button (mobile only) */}
        <button
          onClick={() => setIsSidebarOpen(false)}
          className="lg:hidden absolute top-3 right-3 z-10 p-1.5 rounded-md hover:bg-white/10 text-[var(--text-muted)] hover:text-white transition-colors"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Workspace Switcher */}
        <div className="h-14 flex items-center px-4 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors border-b border-[#2C2C2C] group">
          {user ? (
            <>
              <div className="w-6 h-6 rounded bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold mr-3 shadow-sm overflow-hidden">
                {user.photoURL ? <img src={user.photoURL} alt="Avatar" /> : user.email?.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-sm flex-1 truncate">{user.displayName || 'My Space'}</span>
              <button onClick={handleLogout} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[#333] rounded">
                <LogOut className="w-4 h-4 text-red-400" />
              </button>
            </>
          ) : (
            <button 
              onClick={handleLogin} 
              disabled={isLoggingIn}
              className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium text-white shadow-sm"
            >
              {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
          )}
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative group cursor-text" onClick={() => setIsAiPanelOpen(true)}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
            <input 
              type="text" 
              placeholder="Search or ask AI..." 
              className="w-full bg-[#2A2A2A] border border-transparent focus:border-[#444] rounded-md py-1.5 pl-9 pr-3 text-sm text-white placeholder-[var(--text-muted)] outline-none transition-all shadow-inner focus:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-50 text-[10px] font-mono select-none">
              <span className="px-1 border border-[#444] rounded uppercase">Ctrl</span>
              <span className="px-1 border border-[#444] rounded uppercase">K</span>
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="px-3 pb-2 flex items-center gap-1">
          <button onClick={() => setIsAiPanelOpen(true)} className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded bg-[#2A2A2A] hover:bg-[#333] transition-colors text-sm font-medium border border-[#333]">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span>Ask AI</span>
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded bg-[#2A2A2A] hover:bg-[#333] transition-colors border border-[#333]">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-2 mt-2">Views</div>
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id as ViewState);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-1.5 rounded text-sm font-medium transition-all group",
                  isActive 
                    ? "bg-[rgba(255,255,255,0.1)] text-white" 
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white"
                )}
              >
                <Icon className={cn(
                  "w-[18px] h-[18px] transition-colors", 
                  isActive ? "text-white" : "text-[var(--text-muted)] group-hover:text-white"
                )} />
                {item.name}
              </button>
            );
          })}

          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-2 mt-6">Playlists & Labels</div>
          <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white transition-all group">
            <span className="w-2 h-2 rounded-full bg-red-400 opacity-80 group-hover:opacity-100"></span>
            Urgent Tasks
          </button>
          <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white transition-all group">
            <span className="w-2 h-2 rounded-full bg-green-400 opacity-80 group-hover:opacity-100"></span>
            Exam Prep
          </button>
        </div>

        {/* Footer Settings */}
        <div className="p-3 border-t border-[#2C2C2C]">
          <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white transition-all group">
            <Settings className="w-[18px] h-[18px] text-[var(--text-muted)] group-hover:text-white transition-colors" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-transparent shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 rounded-md hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-[var(--text-secondary)] truncate">
              {navigation.find(n => n.id === currentView)?.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
             <button
              onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
              className={cn(
                "p-1.5 rounded-md flex items-center gap-2 text-sm font-medium transition-all",
                isAiPanelOpen ? "bg-white/10 text-white" : "text-[var(--text-muted)] hover:bg-white/5 hover:text-white"
              )}
            >
              <Sparkles className="w-4 h-4" />
              <span>AI Agent</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-12 pt-2 scroll-smooth">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {currentView === 'dashboard' && <Dashboard />}
              {currentView === 'calendar' && <CalendarView />}
              {currentView === 'planner' && <StudyPlanner />}
              {currentView === 'habits' && <HabitsView />}
              {currentView === 'team' && <TeamWorkspace />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Right AI Assistant Panel — full-screen overlay on mobile, side column on desktop */}
      <AnimatePresence>
        {isAiPanelOpen && (
          <>
            <motion.div
              key="ai-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsAiPanelOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              key="ai-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed lg:static inset-y-0 right-0 z-50 w-full sm:w-[400px] lg:w-[340px] flex-shrink-0 border-l border-[#2C2C2C] bg-[#1C1C1C] flex flex-col h-full"
            >
              <AIChatPanel onClose={() => setIsAiPanelOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
