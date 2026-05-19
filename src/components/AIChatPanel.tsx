import { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, CalendarPlus, Check, X, Mic, Square, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { createCalendarEvent } from '../lib/calendar';
import { sendMessage, resetChat, type AIResponse, type AIAction } from '../lib/gemini';
import { useTasks } from '../lib/store';

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
  const { addTask } = useTasks();

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
      const response = await sendMessage(input);
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

  const executeAction = async (msgIndex: number, action: AIAction) => {
    try {
      if (action.type === 'create_event' && action.data) {
        const { title, date, startHour, startMinute, endHour, endMinute, description } = action.data;
        // Build the date from parts so a "YYYY-MM-DD" string isn't parsed as
        // UTC midnight (which can shift the day in non-UTC timezones).
        const parts = typeof date === 'string' ? date.split('-').map(Number) : [];
        const start = parts.length === 3 && parts[0]
          ? new Date(parts[0], parts[1] - 1, parts[2])
          : new Date();
        start.setHours(startHour ?? 10, startMinute ?? 0, 0, 0);
        const end = new Date(start);
        if (typeof endHour === 'number') {
          end.setHours(endHour, endMinute ?? 0, 0, 0);
          if (end <= start) end.setTime(start.getTime() + 60 * 60 * 1000);
        } else {
          end.setTime(start.getTime() + 60 * 60 * 1000);
        }

        await createCalendarEvent(title || 'New Event', start, end, description || '');
        setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionExecuted: true } : m));
        setMessages(prev => [...prev, { role: 'assistant', text: `✅ Event "${title}" has been added to your Google Calendar!` }]);
      } else if (action.type === 'create_task' && action.data) {
        const { title, tag, time } = action.data;
        addTask(title || 'New Task', time || '', tag || '');
        setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionExecuted: true } : m));
        setMessages(prev => [...prev, { role: 'assistant', text: `✅ Task "${title}" has been added to your task list!` }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', text: `❌ Error: ${err.message || 'Action failed. Please make sure you are signed in.'}` }]);
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
                      {msg.action.type === 'create_event' ? '📅 Create Event' : 
                       msg.action.type === 'create_task' ? '✅ Create Task' :
                       msg.action.type === 'generate_study_plan' ? '📚 Study Plan' : 'Action'}
                    </span>
                    {msg.action.data?.title && (
                      <span className="text-xs text-gray-300">{msg.action.data.title}</span>
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
