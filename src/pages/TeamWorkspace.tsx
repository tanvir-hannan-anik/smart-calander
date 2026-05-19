import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { useTeam } from '../lib/store';

type Status = 'todo' | 'in-progress' | 'done';
const ORDER: Status[] = ['todo', 'in-progress', 'done'];

export default function TeamWorkspace() {
  const { members, tasks, addTeamTask, moveTask, deleteTeamTask } = useTeam();

  const [isAddingTask, setIsAddingTask] = useState<Status | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const handleAddTask = (status: Status) => {
    if (newTaskTitle.trim()) {
      const task = addTeamTask(newTaskTitle.trim(), members[0]?.name || 'Unassigned', 'General');
      if (status !== 'todo') moveTask(task.id, status);
      setNewTaskTitle('');
      setIsAddingTask(null);
    }
  };

  const moveRelative = (id: string, current: Status, dir: -1 | 1) => {
    const next = ORDER[ORDER.indexOf(current) + dir];
    if (next) moveTask(id, next);
  };

  const columns: { id: Status, title: string }[] = [
    { id: 'todo', title: 'To Do' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'done', title: 'Done' }
  ];

  return (
    <div className="h-full flex flex-col">
      <header className="pt-4 pb-6 border-b border-[#2C2C2C] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Team Workspace</h1>
          <p className="text-[var(--text-secondary)]">Collaborate on group projects and assignments.</p>
        </div>
        <div className="flex -space-x-2">
          {members.map(m => (
            <div key={m.id} className="w-8 h-8 rounded-full border-2 border-[var(--bg-main)] bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs" title={m.name}>
              {m.avatar}
            </div>
          ))}
          <button className="w-8 h-8 rounded-full border-2 border-[var(--bg-main)] bg-[#333] hover:bg-[#444] flex items-center justify-center text-xs transition-colors">
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex gap-6 overflow-x-auto py-6 min-h-0">
        {columns.map(col => (
          <div key={col.id} className="flex-shrink-0 w-80 flex flex-col bg-[#1C1C1C] rounded-xl border border-[#2C2C2C] max-h-full">
            <div className="p-4 border-b border-[#2C2C2C] flex justify-between items-center bg-[#222] rounded-t-xl shrink-0">
              <span className="font-medium text-sm">{col.title}</span>
              <span className="bg-[#111] text-xs px-2 py-0.5 rounded-full text-gray-400">
                {tasks.filter(t => t.status === col.id).length}
              </span>
            </div>
            
            <div className="p-3 flex-1 overflow-y-auto space-y-3 hide-scrollbar">
              {tasks.filter(t => t.status === col.id).map(task => (
                <div key={task.id} className="bg-[#2a2a2a] p-3 rounded-lg border border-[#3a3a3a] group hover:border-gray-500 transition-colors">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-[#444] text-[var(--text-secondary)]">
                      {task.label}
                    </span>
                    <button
                      onClick={() => deleteTeamTask(task.id)}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      aria-label="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-medium mb-3">{task.title}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#333]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px]">
                        {members.find(m => m.name === task.assignee)?.avatar || '👤'}
                      </div>
                      <span className="text-xs text-gray-500 truncate max-w-[90px]">{task.assignee}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveRelative(task.id, col.id, -1)}
                        disabled={col.id === 'todo'}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        aria-label="Move left"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveRelative(task.id, col.id, 1)}
                        disabled={col.id === 'done'}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        aria-label="Move right"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {isAddingTask === col.id ? (
                <div className="bg-[#2a2a2a] p-2 rounded-lg border border-blue-500">
                  <input
                    autoFocus
                    type="text"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddTask(col.id);
                      if (e.key === 'Escape') { setIsAddingTask(null); setNewTaskTitle(''); }
                    }}
                    placeholder="Task title..."
                    className="w-full bg-transparent text-sm outline-none mb-1 text-white placeholder-gray-500"
                  />
                  <div className="flex justify-end items-center gap-2 mt-1">
                    <button onClick={() => { setIsAddingTask(null); setNewTaskTitle(''); }} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
                    <button
                      onClick={() => handleAddTask(col.id)}
                      disabled={!newTaskTitle.trim()}
                      className="text-blue-400 hover:text-blue-300 disabled:opacity-40 text-xs font-medium"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAddingTask(col.id)}
                  className="w-full py-2 flex justify-center text-[var(--text-muted)] hover:text-white transition-colors bg-[#222] rounded-lg border border-dashed border-[#333] hover:border-gray-500"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
