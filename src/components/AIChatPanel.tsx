import { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, CalendarPlus, Check, X, Mic, Square, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { createCalendarEvent, describeReminders, CalendarAuthError } from '../lib/calendar';
import { sendMessage, resetChat, type AIResponse, type AIAction } from '../lib/gemini';
import { useTasks, useHabits, useStudyPlanner, useTeam } from '../lib/store';

const findByName = <T extends Record<string, any>>(items: T[], key: keyof T, name?: string): T | undefined => {
  if (!name) return undefined;
  const n = String(name).trim().toLowerCase();
  return items.find(i => String(i[key]).toLowerCase() === n)
    || items.find(i => String(i[key]).toLowerCase().includes(n));
};
const HABIT_ICONS = ['✨', '🔥', '💪', '🧠', '🎯', '📈', '🌱'];
const COLORS = ['blue', 'purple', 'green', 'orange', 'red', 'cyan'];
const randOf = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const ACTION_LABELS: Record<string, string> = {
  create_event: '📅 Create Event',
  create_task: '✅ Create Task',
  delete_task: '🗑️ Delete Task',
  generate_study_plan: '📚 Study Plan',
  add_subject: '📘 Add Subject',
  add_study_session: '📝 Add Session',
  delete_subject: '🗑️ Delete Subject',
  add_habit: '🔁 Add Habit',
  checkin_habit: '🔥 Check-in Habit',
  delete_habit: '🗑️ Delete Habit',
  add_team_task: '👥 Add Team Task',
  move_team_task: '↔️ Move Team Task',
  delete_team_task: '🗑️ Delete Team Task',
};

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  action?: AIAction;
  actionExecuted?: boolean;
}

export default function AIChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hi! I\'m Cal AI 🤖 — your smart calendar and productivity assistant. I can help you create events, manage tasks, build study plans, or answer any productivity question. What would you like to do?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { tasks, addTask, deleteTask } = useTasks();
  const { habits, addHabit, toggleCheckin, deleteHabit } = useHabits();
  const { subjects, addSubject, deleteSubject, addSession } = useStudyPlanner();
  const { tasks: teamTasks, addTeamTask, moveTask, deleteTeamTask } = useTeam();

  const buildContext = () => {
    const lines: string[] = [];
    if (tasks.length) lines.push(`Tasks: ${tasks.map(t => t.title).join(' | ')}`);
    if (habits.length) lines.push(`Habits: ${habits.map(h => h.name).join(' | ')}`);
    if (subjects.length) lines.push(`Subjects: ${subjects.map(s => s.title).join(' | ')}`);
    if (teamTasks.length) lines.push(`Team tasks: ${teamTasks.map(t => `${t.title} (${t.status})`).join(' | ')}`);
    return lines.join('\n');
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setInput(currentTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      setInput('');
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    const userMsg: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendMessage(input, buildContext());
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        text: response.message,
        action: response.action,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `⚠️ Sorry, something went wrong: ${error.message || 'Unknown error'}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const reply = (msgIndex: number, text: string) => {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionExecuted: true } : m));
    setMessages(prev => [...prev, { role: 'assistant', text }]);
  };

  const executeAction = async (msgIndex: number, action: AIAction) => {
    const d = action.data || {};
    try {
      switch (action.type) {
        case 'create_event': {
          const parts = typeof d.date === 'string' ? d.date.split('-').map(Number) : [];
          const start = parts.length === 3 && parts[0]
            ? new Date(parts[0], parts[1] - 1, parts[2])
            : new Date();
          start.setHours(d.startHour ?? 10, d.startMinute ?? 0, 0, 0);
          const end = new Date(start);
          if (typeof d.endHour === 'number') {
            end.setHours(d.endHour, d.endMinute ?? 0, 0, 0);
            if (end <= start) end.setTime(start.getTime() + 3_600_000);
          } else {
            end.setTime(start.getTime() + 3_600_000);
          }
          await createCalendarEvent(d.title || 'New Event', start, end, d.description || '');
          const when = start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          reply(msgIndex, `✅ "${d.title}" saved to your Google Calendar for ${when}.\n🔔 Reminders set automatically: ${describeReminders()}.`);
          break;
        }
        case 'create_task':
          addTask(d.title || 'New Task', d.time || '', d.tag || '');
          reply(msgIndex, `✅ Task "${d.title}" added to your task list.`);
          break;
        case 'delete_task': {
          const t = findByName(tasks, 'title', d.title);
          if (!t) throw new Error(`No task named "${d.title}" found.`);
          deleteTask(t.id);
          reply(msgIndex, `🗑️ Task "${t.title}" deleted.`);
          break;
        }
        case 'add_subject':
          addSubject(d.title || 'New Subject', COLORS.includes(d.color) ? d.color : randOf(COLORS));
          reply(msgIndex, `✅ Subject "${d.title}" added to your Study Planner.`);
          break;
        case 'delete_subject': {
          const s = findByName(subjects, 'title', d.title);
          if (!s) throw new Error(`No subject named "${d.title}" found.`);
          deleteSubject(s.id);
          reply(msgIndex, `🗑️ Subject "${s.title}" deleted.`);
          break;
        }
        case 'add_study_session': {
          const s = findByName(subjects, 'title', d.subject);
          if (!s) throw new Error(`No subject named "${d.subject}" found. Add the subject first.`);
          addSession(s.id, d.topic || 'New Session', d.day || 'Monday', Number(d.hours) || 1);
          reply(msgIndex, `✅ Session "${d.topic}" added to ${s.title} on ${d.day || 'Monday'}.`);
          break;
        }
        case 'generate_study_plan': {
          const subs = Array.isArray(d.subjects) ? d.subjects : [];
          let count = 0;
          subs.forEach((sub: any) => {
            const created = addSubject(sub.title || 'New Subject', COLORS.includes(sub.color) ? sub.color : randOf(COLORS));
            (sub.sessions || []).forEach((se: any) => {
              addSession(created.id, se.topic || 'Session', se.day || 'Monday', Number(se.hours) || 1);
              count++;
            });
          });
          reply(msgIndex, `✅ Study plan created: ${subs.length} subject(s), ${count} session(s) added to your Study Planner.`);
          break;
        }
        case 'add_habit':
          addHabit(d.name || 'New Habit', COLORS.includes(d.color) ? d.color : randOf(COLORS), d.icon || randOf(HABIT_ICONS));
          reply(msgIndex, `✅ Habit "${d.name}" added. Keep your streak going!`);
          break;
        case 'checkin_habit': {
          const h = findByName(habits, 'name', d.name);
          if (!h) throw new Error(`No habit named "${d.name}" found.`);
          if (!h.checkins.includes(new Date().toISOString().split('T')[0])) toggleCheckin(h.id);
          reply(msgIndex, `✅ Checked in "${h.name}" for today. 🔥`);
          break;
        }
        case 'delete_habit': {
          const h = findByName(habits, 'name', d.name);
          if (!h) throw new Error(`No habit named "${d.name}" found.`);
          deleteHabit(h.id);
          reply(msgIndex, `🗑️ Habit "${h.name}" deleted.`);
          break;
        }
        case 'add_team_task': {
          const created = addTeamTask(d.title || 'New Task', d.assignee || 'Unassigned', d.label || 'General');
          const status = ['todo', 'in-progress', 'done'].includes(d.status) ? d.status : 'todo';
          if (status !== 'todo') moveTask(created.id, status);
          reply(msgIndex, `✅ Team task "${d.title}" added to ${status}.`);
          break;
        }
        case 'move_team_task': {
          const t = findByName(teamTasks, 'title', d.title);
          if (!t) throw new Error(`No team task named "${d.title}" found.`);
          const status = ['todo', 'in-progress', 'done'].includes(d.status) ? d.status : 'done';
          moveTask(t.id, status);
          reply(msgIndex, `✅ Moved "${t.title}" to ${status}.`);
          break;
        }
        case 'delete_team_task': {
          const t = findByName(teamTasks, 'title', d.title);
          if (!t) throw new Error(`No team task named "${d.title}" found.`);
          deleteTeamTask(t.id);
          reply(msgIndex, `🗑️ Team task "${t.title}" deleted.`);
          break;
        }
        default:
          setMessages(prev => [...prev, { role: 'assistant', text: 'I prepared an action but could not recognise its type.' }]);
      }
    } catch (err: any) {
      const text = err instanceof CalendarAuthError
        ? `🔌 Google Calendar isn't connected. Open the **Calendar** tab and click "Connect Google Calendar", then try this action again.`
        : `❌ ${err?.message || 'Action failed. Please make sure you are signed in.'}`;
      setMessages(prev => [...prev, { role: 'assistant', text }]);
    }
  };

  const handleClearChat = () => {
    resetChat();
    setMessages([{ role: 'assistant', text: 'Chat cleared! How can I help you?' }]);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#2e2e2e]">
      <header className="flex items-center justify-between p-4 border-b border-[#2e2e2e]">
        <div className="flex items-center gap-2 text-blue-400">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold text-sm tracking-wide">Cal AI</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleClearChat}
            className="px-2 py-1 text-[10px] rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
          >
            Clear
          </button>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-3 max-w-[90%]", 
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-md gradient-animated flex shrink-0 items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              
              <div className={cn(
                "p-3 rounded-lg text-sm leading-relaxed min-w-0",
                msg.role === 'user'
                  ? "bg-blue-600 text-white"
                  : "bg-[#2A2A2A] text-gray-200 border border-[#3A3A3A]"
              )}>
                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.text}</div>
                
                {msg.action && !msg.actionExecuted && (
                  <div className="mt-3 bg-[#1e1e1e] border border-[#3a3a3a] rounded-md p-2 flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
                      {ACTION_LABELS[msg.action.type] || '⚙️ Action'}
                    </span>
                    {(msg.action.data?.title || msg.action.data?.name || msg.action.data?.subject) && (
                      <span className="text-xs text-gray-300">
                        {msg.action.data.title || msg.action.data.name || msg.action.data.subject}
                      </span>
                    )}
                    <button 
                      onClick={() => executeAction(i, msg.action!)}
                      className="flex items-center justify-center gap-2 bg-white text-black py-1.5 rounded text-xs font-medium hover:bg-gray-200 transition-colors"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Execute Action
                    </button>
                  </div>
                )}
                {msg.actionExecuted && (
                  <div className="mt-2 flex items-center gap-1 text-green-400 text-xs">
                    <Check className="w-3 h-3" /> Action completed
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 mr-auto"
            >
              <div className="w-6 h-6 rounded-md gradient-animated flex shrink-0 items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="p-3 rounded-lg bg-[#2A2A2A] border border-[#3A3A3A] flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-gray-400">Thinking...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-[#2e2e2e] bg-[#222]">
        <div className={cn(
          "flex items-end gap-2 bg-[#1a1a1a] border rounded-xl p-2 transition-colors",
          isRecording ? "border-red-500/50" : "border-[#3a3a3a] focus-within:border-blue-500/50"
        )}>
          <button 
            onClick={toggleRecording}
            className={cn(
              "p-2 transition-colors rounded-lg",
              isRecording ? "text-red-400 bg-red-400/10 hover:bg-red-400/20" : "text-gray-400 hover:text-white"
            )}
            title={isRecording ? "Stop recording (Voice)" : "Start voice input"}
          >
             {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask AI or type a command..."
            className="w-full bg-transparent border-none focus:ring-0 resize-none text-sm placeholder:text-gray-500 py-2 max-h-32 min-h-[40px] outline-none"
            rows={1}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:bg-gray-700 hover:bg-blue-500 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 text-center">
           <span className="text-[10px] text-gray-500 font-mono">Press Shift + Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
