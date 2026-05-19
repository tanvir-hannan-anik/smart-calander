import { useState } from 'react';
import { Plus, GripVertical, CheckCircle2 } from 'lucide-react';
import { useTeam } from '../lib/store';

export default function TeamWorkspace() {
  const { members, tasks, addMember, addTeamTask, moveTask, deleteTeamTask } = useTeam();
  
  const [isAddingTask, setIsAddingTask] = useState<string | null>(null); // column status
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const handleAddTask = (status: 'todo' | 'in-progress' | 'done') => {
    if (newTaskTitle.trim()) {
      addTeamTask(newTaskTitle.trim(), members[0]?.name || 'Unassigned', 'General');
      setNewTaskTitle('');
      setIsAddingTask(null);
    }
  };

  const columns: { id: 'todo' | 'in-progress' | 'done', title: string }[] = [
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
                <div key={task.id} className="bg-[#2a2a2a] p-3 rounded-lg border border-[#3a3a3a] group cursor-grab hover:border-gray-500 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-[#444] text-[var(--text-secondary)]">
                      {task.label}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {col.id !== 'done' && (
                        <button onClick={() => moveTask(task.id, 'done')} className="text-gray-500 hover:text-green-400">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      <GripVertical className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                  <p className="text-sm font-medium mb-3">{task.title}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#333]">
                    <span className="text-xs text-gray-500">{task.assignee}</span>
                    <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px]">
                      {members.find(m => m.name === task.assignee)?.avatar || '👤'}
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
                    onKeyDown={e => e.key === 'Enter' && handleAddTask(col.id)}
                    placeholder="Task title..."
                    className="w-full bg-transparent text-sm outline-none mb-1 text-white placeholder-gray-500"
                  />
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
