import { useState } from 'react';
import { Plus, X, Flame } from 'lucide-react';
import { useHabits, todayStr } from '../lib/store';
import { cn } from '../lib/utils';
import { format, subDays } from 'date-fns';

const habitColorMap: Record<string, { bgIcon: string, text: string, bgActive: string, shadow: string }> = {
  green: { bgIcon: 'bg-green-500/20', text: 'text-green-400', bgActive: 'bg-green-500', shadow: 'shadow-[0_0_10px_rgba(34,197,94,0.3)]' },
  blue: { bgIcon: 'bg-blue-500/20', text: 'text-blue-400', bgActive: 'bg-blue-500', shadow: 'shadow-[0_0_10px_rgba(59,130,246,0.3)]' },
  purple: { bgIcon: 'bg-purple-500/20', text: 'text-purple-400', bgActive: 'bg-purple-500', shadow: 'shadow-[0_0_10px_rgba(168,85,247,0.3)]' },
  orange: { bgIcon: 'bg-orange-500/20', text: 'text-orange-400', bgActive: 'bg-orange-500', shadow: 'shadow-[0_0_10px_rgba(249,115,22,0.3)]' },
  red: { bgIcon: 'bg-red-500/20', text: 'text-red-400', bgActive: 'bg-red-500', shadow: 'shadow-[0_0_10px_rgba(239,68,68,0.3)]' },
  cyan: { bgIcon: 'bg-cyan-500/20', text: 'text-cyan-400', bgActive: 'bg-cyan-500', shadow: 'shadow-[0_0_10px_rgba(6,182,212,0.3)]' },
};

export default function HabitsView() {
  const { habits, addHabit, toggleCheckin, deleteHabit, getStreak } = useHabits();
  
  const [isAdding, setIsAdding] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  
  const handleAdd = () => {
    if (newHabitName.trim()) {
      const colors = ['green', 'blue', 'purple', 'orange', 'red', 'cyan'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      addHabit(newHabitName.trim(), color, '✨');
      setNewHabitName('');
      setIsAdding(false);
    }
  };

  // Generate last 7 days for the quick check-in view
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = subDays(new Date(), 6 - i);
    return {
      dateStr: format(d, 'yyyy-MM-dd'),
      label: format(d, 'EEEE').charAt(0),
      isToday: i === 6
    };
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="pt-4 pb-6 border-b border-[#2C2C2C] flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Habits</h1>
          <p className="text-[var(--text-secondary)]">Track your daily routines and build consistency.</p>
        </div>
      </header>

      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <h2 className="text-lg font-medium">Your Habits</h2>
          {isAdding ? (
             <div className="flex items-center gap-2">
               <input
                 autoFocus
                 type="text"
                 value={newHabitName}
                 onChange={e => setNewHabitName(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleAdd()}
                 placeholder="Habit name"
                 className="bg-[#222] border border-[#444] rounded px-3 py-1.5 text-sm text-white outline-none"
               />
               <button onClick={handleAdd} className="text-sm font-medium text-blue-400">Add</button>
               <button onClick={() => setIsAdding(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
             </div>
          ) : (
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" /> New Habit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.map(habit => {
            const streak = getStreak(habit.id);
            return (
              <div key={habit.id} className="bg-[#222] border border-[#333] rounded-xl p-5 relative group">
                <button 
                  onClick={() => deleteHabit(habit.id)}
                  className="absolute top-3 right-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <div className="flex items-center gap-3 mb-6">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg", habitColorMap[habit.color]?.bgIcon || 'bg-blue-500/20', habitColorMap[habit.color]?.text || 'text-blue-400')}>
                    {habit.icon}
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{habit.name}</h3>
                    <p className="text-xs text-orange-400 flex items-center gap-1 mt-0.5">
                      <Flame className="w-3 h-3" /> {streak} day streak
                    </p>
                  </div>
                </div>

                <div className="flex justify-between">
                  {last7Days.map((day) => {
                    const isChecked = habit.checkins.includes(day.dateStr);
                    return (
                      <div key={day.dateStr} className="flex flex-col items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-medium",
                          day.isToday ? "text-blue-400" : "text-gray-500"
                        )}>
                          {day.label}
                        </span>
                        <button
                          onClick={() => toggleCheckin(habit.id, day.dateStr)}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                            isChecked 
                              ? cn("text-white", habitColorMap[habit.color]?.bgActive || 'bg-blue-500', habitColorMap[habit.color]?.shadow) 
                              : "bg-[#111] border border-[#333] text-transparent hover:border-gray-500"
                          )}
                        >
                          {isChecked && <Plus className="w-4 h-4 rotate-45" />} {/* Using Plus rotated as a generic check mark alternative, or just simple style */}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            );
          })}
        </div>
        
        {habits.length === 0 && !isAdding && (
          <div className="text-center p-12 border border-[#333] border-dashed rounded-xl text-gray-500">
            You don't have any habits yet. Start tracking today!
          </div>
        )}
      </div>
    </div>
  );
}
