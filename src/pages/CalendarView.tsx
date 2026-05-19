import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, Filter, X } from 'lucide-react';
import { 
  format, addDays, startOfWeek, endOfWeek, 
  eachDayOfInterval, isSameDay, isToday, addWeeks, subWeeks, parseISO
} from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { listUpcomingEvents, createCalendarEvent } from '../lib/calendar';

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '10:00', duration: 1, description: '' });
  const [isCreating, setIsCreating] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  
  const days = eachDayOfInterval({
    start: weekStart,
    end: weekEnd,
  });

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const fetchedEvents = await listUpcomingEvents();
      
      const displayEvents = fetchedEvents.map((evt, idx) => {
        const startDate = evt.start.dateTime ? parseISO(evt.start.dateTime) : new Date();
        const endDate = evt.end.dateTime ? parseISO(evt.end.dateTime) : new Date(startDate.getTime() + 60*60*1000);
        
        let color = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
        if (idx % 3 === 1) color = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
        if (idx % 3 === 2) color = 'bg-orange-500/20 text-orange-300 border-orange-500/30';
        if (evt.summary?.toLowerCase().includes('study')) color = 'bg-green-500/20 text-green-300 border-green-500/30';

        return {
          id: evt.id,
          title: evt.summary || 'Untitled Event',
          date: startDate,
          startTime: format(startDate, 'HH:mm'),
          duration: (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60),
          color
        };
      });
      setEvents(displayEvents);
    } catch (error) {
      console.error('Error fetching calendar events', error);
      setEvents([
        { id: '1', title: 'Sign in to sync Google Calendar', date: new Date(), startTime: '10:00', duration: 1, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  const handleCreateEvent = async () => {
    if (!newEvent.title) return;
    setIsCreating(true);
    try {
      const startDate = new Date(`${newEvent.date}T${newEvent.startTime}`);
      const endDate = new Date(startDate.getTime() + newEvent.duration * 60 * 60 * 1000);
      await createCalendarEvent(newEvent.title, startDate, endDate, newEvent.description);
      setIsModalOpen(false);
      setNewEvent({ title: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '10:00', duration: 1, description: '' });
      fetchEvents(); // reload events
    } catch (error: any) {
      alert(`Error creating event: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] relative">
      {/* Header */}
      <header className="flex items-center justify-between mb-6 border-b border-[#2C2C2C] pb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{format(currentDate, 'MMMM yyyy')}</h1>
          <div className="flex items-center gap-1 bg-[#222] rounded-md p-1 border border-[#333]">
            <button onClick={prevWeek} className="p-1 hover:bg-[#333] rounded transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={today} className="px-3 py-1 text-sm font-medium hover:bg-[#333] rounded transition-colors">Today</button>
            <button onClick={nextWeek} className="p-1 hover:bg-[#333] rounded transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button className="p-2 border border-[#333] rounded-md text-[var(--text-muted)] hover:text-white transition-colors bg-[#222]">
              <Search className="w-4 h-4" />
           </button>
           <button className="p-2 border border-[#333] rounded-md text-[var(--text-muted)] hover:text-white transition-colors bg-[#222]">
              <Filter className="w-4 h-4" />
           </button>
           <button 
             onClick={() => setIsModalOpen(true)}
             className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
           >
              <Plus className="w-4 h-4" /> New Event
           </button>
        </div>
      </header>

      {/* Week Grid */}
      <div className="flex-1 flex flex-col min-h-0 border border-[#333] rounded-xl overflow-hidden bg-[#1A1A1A]">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-[#333] bg-[#222]">
          {days.map((day, i) => (
            <div key={i} className="py-3 px-2 text-center border-r border-[#333] last:border-0">
              <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase mb-1">
                {format(day, 'EEE')}
              </p>
              <div className={cn(
                "w-8 h-8 mx-auto flex items-center justify-center rounded-full text-sm font-medium transition-colors",
                isToday(day) ? "bg-blue-600 text-white" : "text-white"
              )}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Timeline Body */}
        <div className="flex-1 overflow-y-auto relative bg-[#1c1c1c]">
          <div className="absolute inset-0 grid grid-cols-7">
            {days.map((day, colIdx) => (
              <div key={colIdx} className="border-r border-[#333] border-dashed last:border-0 relative min-h-[800px]">
                 {Array.from({length: 12}).map((_, i) => (
                    <div key={i} className="absolute left-0 right-0 border-t border-[#2C2C2C] border-dashed h-16" style={{ top: `${i * 64}px`}}>
                       {colIdx === 0 && (
                          <span className="absolute -left-12 top-[-10px] text-[10px] text-[var(--text-muted)] font-mono">
                             {i + 8}:00
                          </span>
                       )}
                    </div>
                 ))}

                 {events.filter(e => isSameDay(e.date, day)).map((event) => {
                    const hour = parseInt(event.startTime.split(':')[0]);
                    const top = (hour - 8) * 64;
                    const height = event.duration * 64;
                    return (
                      <motion.div
                         initial={{ opacity: 0, scale: 0.95 }}
                         animate={{ opacity: 1, scale: 1 }}
                         key={event.id}
                         className={cn(
                           "absolute left-1 right-1 rounded p-2 text-xs border backdrop-blur-sm truncate cursor-pointer transition-transform hover:scale-[1.02]",
                           event.color
                         )}
                         style={{ top: `${top}px`, height: `${height}px` }}
                      >
                         <div className="font-semibold">{event.title}</div>
                         <div className="opacity-80 mt-0.5">{event.startTime}</div>
                      </motion.div>
                    )
                 })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-[#222] border border-[#333] rounded-xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">New Calendar Event</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Title</label>
                  <input type="text" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Event title..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
                    <input type="date" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Start Time</label>
                    <input type="time" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Duration (hours)</label>
                  <input type="number" step="0.5" min="0.5" value={newEvent.duration} onChange={e => setNewEvent({...newEvent, duration: parseFloat(e.target.value)})} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Description (optional)</label>
                  <textarea value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-20" placeholder="Add some details..." />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button onClick={handleCreateEvent} disabled={!newEvent.title || isCreating} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors">
                  {isCreating ? 'Saving...' : 'Save to Google Calendar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
