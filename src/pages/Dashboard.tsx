import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Plus, ArrowRight, Play, CheckCircle2, Circle, 
  Activity, Flame, Zap, Sparkles, X, Clock
} from 'lucide-react';
import { useTasks, useHabits, todayStr } from '../lib/store';
import { getAIInsight } from '../lib/gemini';

export default function Dashboard() {
  const { todayTasks, addTask, toggleTask, completedToday, totalToday } = useTasks();
  const { habits, getStreak } = useHabits();
  
  const [insight, setInsight] = useState('Analyzing your data...');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  
  const focusScore = totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100);
  const bestStreak = Math.max(...habits.map(h => getStreak(h.id)), 0);

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
        <h1 className="text-3xl font-semibold mb-2 tracking-tight">Good morning! 👋</h1>
        <p className="text-[var(--text-secondary)]">You have {totalToday - completedToday} priority tasks scheduled for today.</p>
      </section>

      {/* Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
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
                  <Circle className="w-5 h-5 text-gray-500" />
                  <input
                    autoFocus
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                    placeholder="What do you need to do?"
                    className="flex-1 bg-transparent border-none outline-none text-sm text-white"
                  />
                  <button onClick={handleAddTask} className="text-blue-400 text-sm font-medium">Add</button>
                  <button onClick={() => setIsAddingTask(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
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
                    transition={{ delay: i * 0.1 }}
                    onClick={() => toggleTask(task.id)}
                    className={`group flex items-start flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                      task.done 
                        ? 'border-[#222] bg-[rgba(255,255,255,0.02)] opacity-60' 
                        : 'border-[#333] bg-[#222] hover:border-[#555]'
                    }`}
                  >
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button className="flex-shrink-0 mt-0.5 sm:mt-0 text-[var(--text-muted)] hover:text-white transition-colors">
                        {task.done ? <CheckCircle2 className="w-5 h-5 text-gray-400" /> : <Circle className="w-5 h-5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium text-sm truncate ${task.done ? 'line-through text-[var(--text-muted)]' : 'text-[#f5f5f5]'}`}>
                          {task.title}
                        </p>
                        {task.time && <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3"/>{task.time}</p>}
                      </div>
                    </div>
                    {task.tag && (
                      <span className="mt-3 sm:mt-0 ml-8 sm:ml-4 text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-[#444] text-[var(--text-secondary)]">
                        {task.tag}
                      </span>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>
          
          {/* Habits & Productivity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
             {/* Habit Heatmap */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <h2 className="text-sm font-medium flex items-center gap-2">
                     <Activity className="w-4 h-4 text-green-400" /> Best Habit Streak
                   </h2>
                   <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">{bestStreak} Days</span>
                </div>
                <div className="bg-[#222] border border-[#333] rounded-xl p-4">
                   <div className="grid grid-cols-7 gap-1.5 mb-2 text-[10px] text-center text-gray-500">
                      <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                   </div>
                   <div className="grid grid-cols-7 gap-1.5 auto-rows-max h-[100px] content-start">
                     {Array.from({length: 28}).map((_, i) => (
                        <div key={i} className={`w-full aspect-square rounded-sm ${Math.random() > 0.3 ? (Math.random() > 0.5 ? 'bg-green-500' : 'bg-green-400/50') : 'bg-[#333]'}`}></div>
                     ))}
                   </div>
                </div>
             </div>

             {/* Productivity Score */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <h2 className="text-sm font-medium flex items-center gap-2">
                     <Zap className="w-4 h-4 text-amber-400" /> Focus Score
                   </h2>
                   <span className="text-xs text-gray-400">Today</span>
                </div>
                <div className="bg-[#222] border border-[#333] rounded-xl p-4 flex flex-col justify-center items-center relative overflow-hidden h-[155px]">
                   <div className="text-4xl font-light text-white z-10 flex items-baseline gap-1">
                      {focusScore}<span className="text-lg text-gray-500 font-medium">/100</span>
                   </div>
                   <p className="text-xs text-green-400 mt-2 z-10 flex items-center gap-1">
                      <Flame className="w-3 h-3" /> Based on task completion
                   </p>
                   {/* Background circular track */}
                   <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#f59e0b" strokeWidth="8" strokeDasharray="220" strokeDashoffset={220 - (220 * focusScore) / 100} strokeLinecap="round" transform="rotate(-90 50 50)" />
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
               <p className="text-sm text-[var(--text-secondary)] leading-relaxed relative z-10">
                 {insight}
               </p>
               <button className="mt-4 text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors relative z-10">
                 Schedule focus time <ArrowRight className="w-3 h-3" />
               </button>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#2C2C2C]">
             <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Quick Commands</h2>
             <div className="grid grid-cols-2 gap-3">
                <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-[#333] bg-[#222] hover:bg-[#2A2A2A] transition-colors whitespace-nowrap">
                  <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Play className="w-4 h-4 text-orange-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-300">Start Focus</span>
                </button>
                <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-[#333] bg-[#222] hover:bg-[#2A2A2A] transition-colors whitespace-nowrap">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-300">New Note</span>
                </button>
             </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
