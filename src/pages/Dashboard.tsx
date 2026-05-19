import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  FileText, Plus, ArrowRight, Play, Pause, RotateCcw,
  CheckCircle2, Circle, Activity, Flame, Zap, Sparkles, X, Clock, Trash2
} from 'lucide-react';
import { format, subDays, startOfWeek } from 'date-fns';
import { useTasks, useHabits, useNotes } from '../lib/store';
import { getAIInsight } from '../lib/gemini';
import { cn } from '../lib/utils';

const FOCUS_DURATION = 25 * 60; // 25 min Pomodoro

export default function Dashboard() {
  const { todayTasks, addTask, toggleTask, deleteTask, completedToday, totalToday } = useTasks();
  const { habits, getStreak } = useHabits();
  const { addNote } = useNotes();

  const [insight, setInsight] = useState('Analyzing your data...');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // ── Focus timer (Pomodoro) ──────────────────────────────────────────────
  const [focusSecondsLeft, setFocusSecondsLeft] = useState(FOCUS_DURATION);
  const [focusRunning, setFocusRunning] = useState(false);

  useEffect(() => {
    if (!focusRunning) return;
    const id = setInterval(() => {
      setFocusSecondsLeft(s => {
        if (s <= 1) {
          setFocusRunning(false);
          return FOCUS_DURATION;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [focusRunning]);

  const focusClock = `${String(Math.floor(focusSecondsLeft / 60)).padStart(2, '0')}:${String(focusSecondsLeft % 60).padStart(2, '0')}`;

  const resetFocus = () => {
    setFocusRunning(false);
    setFocusSecondsLeft(FOCUS_DURATION);
  };

  // ── New note ────────────────────────────────────────────────────────────
  const [noteSaved, setNoteSaved] = useState(false);
  const handleNewNote = () => {
    addNote(`Quick Note · ${format(new Date(), 'MMM d, h:mm a')}`);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  // ── Derived stats ───────────────────────────────────────────────────────
  const focusScore = totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100);
  const bestStreak = Math.max(...habits.map(h => getStreak(h.id)), 0);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Real, stable 28-day habit heatmap (4 weeks, Monday-first) computed from
  // actual check-ins — no more random flicker.
  const heatmap = useMemo(() => {
    const gridStart = startOfWeek(subDays(new Date(), 21), { weekStartsOn: 1 });
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    return Array.from({ length: 28 }).map((_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      const key = format(d, 'yyyy-MM-dd');
      const isFuture = key > todayKey;
      const count = isFuture ? 0 : habits.filter(hb => hb.checkins.includes(key)).length;
      const ratio = habits.length ? count / habits.length : 0;
      return { key, isFuture, count, ratio };
    });
  }, [habits]);

  const heatColor = (cell: { isFuture: boolean; count: number; ratio: number }) => {
    if (cell.isFuture) return 'bg-[#1f1f1f]';
    if (cell.count === 0) return 'bg-[#2e2e2e]';
    if (cell.ratio <= 0.34) return 'bg-green-500/30';
    if (cell.ratio <= 0.67) return 'bg-green-500/60';
    return 'bg-green-500';
  };

  useEffect(() => {
    const fetchInsight = async () => {
      const context = `User has completed ${completedToday} out of ${totalToday} tasks today. Their best habit streak is ${bestStreak} days. Give a motivating insight.`;
      const aiInsight = await getAIInsight(context);
      setInsight(aiInsight);
    };
    fetchInsight();
  }, [completedToday, totalToday, bestStreak]);

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      addTask(newTaskTitle.trim());
      setNewTaskTitle('');
      setIsAddingTask(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero section */}
      <section className="pt-4 pb-8 border-b border-[#2C2C2C]">
        <h1 className="text-2xl sm:text-3xl font-semibold mb-2 tracking-tight">{greeting}! 👋</h1>
        <p className="text-[var(--text-secondary)]">
          {totalToday === 0
            ? 'No tasks scheduled for today — add one to get started.'
            : completedToday === totalToday
              ? 'All tasks done for today. Great work! 🎉'
              : `You have ${totalToday - completedToday} priority task${totalToday - completedToday === 1 ? '' : 's'} scheduled for today.`}
        </p>
      </section>

      {/* Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

        {/* Left Column */}
        <div className="xl:col-span-2 space-y-8">
          {/* Today's Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-400" /> Today's Focus
              </h2>
              <button
                onClick={() => setIsAddingTask(true)}
                className="text-sm flex items-center gap-1 text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" /> Add task
              </button>
            </div>

            <div className="space-y-2">
              {isAddingTask && (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-[#444] bg-[#222]">
                  <Circle className="w-5 h-5 text-gray-500 shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTask();
                      if (e.key === 'Escape') { setIsAddingTask(false); setNewTaskTitle(''); }
                    }}
                    placeholder="What do you need to do?"
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-white"
                  />
                  <button onClick={handleAddTask} className="text-blue-400 text-sm font-medium shrink-0">Add</button>
                  <button onClick={() => { setIsAddingTask(false); setNewTaskTitle(''); }} className="text-gray-500 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
                </div>
              )}

              {todayTasks.length === 0 && !isAddingTask ? (
                <div className="text-center p-6 border border-[#333] border-dashed rounded-xl text-gray-500 text-sm">
                  No tasks for today. Enjoy your day!
                </div>
              ) : (
                todayTasks.map((task, i) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3) }}
                    className={cn(
                      "group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border transition-all",
                      task.done
                        ? 'border-[#222] bg-[rgba(255,255,255,0.02)] opacity-60'
                        : 'border-[#333] bg-[#222] hover:border-[#555]'
                    )}
                  >
                    <button
                      onClick={() => toggleTask(task.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <span className="shrink-0 text-[var(--text-muted)] group-hover:text-white transition-colors">
                        {task.done ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Circle className="w-5 h-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn(
                          "block font-medium text-sm truncate",
                          task.done ? 'line-through text-[var(--text-muted)]' : 'text-[#f5f5f5]'
                        )}>
                          {task.title}
                        </span>
                        {task.time && (
                          <span className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{task.time}
                          </span>
                        )}
                      </span>
                    </button>

                    <div className="flex items-center gap-3 shrink-0 pl-8 sm:pl-0">
                      {task.tag && (
                        <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-[#444] text-[var(--text-secondary)]">
                          {task.tag}
                        </span>
                      )}
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Delete task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Habits & Productivity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-stretch">
             {/* Habit Heatmap */}
             <div className="flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                   <h2 className="text-sm font-medium flex items-center gap-2">
                     <Activity className="w-4 h-4 text-green-400" /> Best Habit Streak
                   </h2>
                   <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 shrink-0">
                     {bestStreak} {bestStreak === 1 ? 'Day' : 'Days'}
                   </span>
                </div>
                <div className="flex-1 bg-[#222] border border-[#333] rounded-xl p-4 flex flex-col justify-center">
                   <div className="w-full max-w-[210px] mx-auto">
                     <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-[10px] text-center text-gray-500">
                        <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                     </div>
                     <div className="grid grid-cols-7 gap-1.5">
                       {heatmap.map((cell) => (
                          <div
                            key={cell.key}
                            title={cell.isFuture ? cell.key : `${cell.key}: ${cell.count}/${habits.length} habits`}
                            className={cn("w-full aspect-square rounded-sm", heatColor(cell))}
                          />
                       ))}
                     </div>
                     <p className="text-[10px] text-gray-500 mt-2 text-center">Last 4 weeks of habit check-ins</p>
                   </div>
                </div>
             </div>

             {/* Productivity Score */}
             <div className="flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                   <h2 className="text-sm font-medium flex items-center gap-2">
                     <Zap className="w-4 h-4 text-amber-400" /> Focus Score
                   </h2>
                   <span className="text-xs text-gray-400 shrink-0">Today</span>
                </div>
                <div className="flex-1 min-h-[180px] bg-[#222] border border-[#333] rounded-xl p-4 flex flex-col justify-center items-center relative overflow-hidden">
                   <div className="text-4xl font-light text-white z-10 flex items-baseline gap-1">
                      {focusScore}<span className="text-lg text-gray-500 font-medium">/100</span>
                   </div>
                   <p className="text-xs text-green-400 mt-2 z-10 flex items-center gap-1 text-center">
                      <Flame className="w-3 h-3 shrink-0" /> {completedToday}/{totalToday || 0} tasks completed
                   </p>
                   <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#f59e0b" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 - (283 * focusScore) / 100} strokeLinecap="round" transform="rotate(-90 50 50)" />
                   </svg>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" /> AI Insights
            </h2>
            <div className="glass-panel p-5 rounded-xl border border-blue-500/20 bg-blue-500/5 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
               <p className="text-sm text-[var(--text-secondary)] leading-relaxed relative z-10 break-words">
                 {insight}
               </p>
               <button
                 onClick={() => setFocusRunning(true)}
                 className="mt-4 text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors relative z-10"
               >
                 Start focus session <ArrowRight className="w-3 h-3" />
               </button>
            </div>
          </div>

          {/* Focus Timer */}
          <div className="space-y-3">
             <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Focus Timer</h2>
             <div className="bg-[#222] border border-[#333] rounded-xl p-5 flex flex-col items-center gap-4">
                <div className={cn(
                  "text-4xl font-mono font-light tabular-nums tracking-wide transition-colors",
                  focusRunning ? "text-orange-400" : "text-white"
                )}>
                  {focusClock}
                </div>
                <div className="flex items-center gap-2 w-full">
                   <button
                     onClick={() => setFocusRunning(r => !r)}
                     className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-sm font-medium transition-colors"
                   >
                     {focusRunning ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Start Focus</>}
                   </button>
                   <button
                     onClick={resetFocus}
                     className="p-2 rounded-lg border border-[#333] text-[var(--text-muted)] hover:text-white hover:bg-[#2A2A2A] transition-colors"
                     aria-label="Reset timer"
                   >
                     <RotateCcw className="w-4 h-4" />
                   </button>
                </div>
             </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#2C2C2C]">
             <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Quick Commands</h2>
             <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIsAddingTask(true)}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-[#333] bg-[#222] hover:bg-[#2A2A2A] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-300">New Task</span>
                </button>
                <button
                  onClick={handleNewNote}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-[#333] bg-[#222] hover:bg-[#2A2A2A] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    {noteSaved ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <FileText className="w-4 h-4 text-green-400" />}
                  </div>
                  <span className="text-xs font-medium text-gray-300">{noteSaved ? 'Note saved!' : 'New Note'}</span>
                </button>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
