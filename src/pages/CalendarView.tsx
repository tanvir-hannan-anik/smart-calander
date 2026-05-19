import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, X, BellRing, CalendarOff, Loader2 } from 'lucide-react';
import {
  format, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isToday, addWeeks, subWeeks, parseISO
} from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { listUpcomingEvents, createCalendarEvent, describeReminders, CalendarAuthError } from '../lib/calendar';
import { isCalendarConnected } from '../lib/auth';

interface CalendarViewProps {
  calendarConnected?: boolean;
  onReconnect?: () => Promise<void>;
}

const HOUR_PX = 56;            // height of one hour row
const DAY_PX = 24 * HOUR_PX;   // full-day column height

interface DisplayEvent {
  id: string;
  title: string;
  date: Date;
  startMinutes: number; // minutes from midnight
  duration: number;     // hours
  startLabel: string;
  color: string;
  description?: string;
  htmlLink?: string;
}

export default function CalendarView({ calendarConnected = false, onReconnect }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [reconnecting, setReconnecting] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '10:00', duration: 1, description: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const fetchEvents = async () => {
    // Don't attempt to fetch if we know there's no token — avoids a guaranteed 401.
    if (!isCalendarConnected()) {
      setAuthError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setAuthError(false);
    setErrMsg('');
    try {
      const fetched = await listUpcomingEvents();
      const display: DisplayEvent[] = fetched.map((evt, idx) => {
        const startDate = evt.start.dateTime ? parseISO(evt.start.dateTime) : new Date();
        const endDate = evt.end.dateTime ? parseISO(evt.end.dateTime) : new Date(startDate.getTime() + 60 * 60 * 1000);

        let color = 'bg-blue-500/25 text-blue-200 border-blue-500/40';
        if (idx % 3 === 1) color = 'bg-purple-500/25 text-purple-200 border-purple-500/40';
        if (idx % 3 === 2) color = 'bg-orange-500/25 text-orange-200 border-orange-500/40';
        if (evt.summary?.toLowerCase().includes('study')) color = 'bg-green-500/25 text-green-200 border-green-500/40';

        return {
          id: evt.id,
          title: evt.summary || 'Untitled Event',
          date: startDate,
          startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
          duration: Math.max((endDate.getTime() - startDate.getTime()) / 3_600_000, 0.5),
          startLabel: format(startDate, 'h:mm a'),
          color,
          description: evt.description,
          htmlLink: evt.htmlLink,
        };
      });
      setEvents(display);
    } catch (error: any) {
      console.error('Error fetching calendar events', error);
      setEvents([]);
      if (error instanceof CalendarAuthError) {
        setAuthError(true);
      } else {
        setErrMsg(error?.message || 'Could not load your Google Calendar.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when the week changes OR when the calendar becomes connected.
  useEffect(() => { fetchEvents(); }, [currentDate, calendarConnected]);

  // Scroll the timeline to ~7 AM on first load instead of midnight.
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_PX;
    }
  }, [loading]);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      // Use the parent's reconnect handler if provided (so the global banner also updates)
      if (onReconnect) {
        await onReconnect();
      }
      await fetchEvents();
    } catch (err) {
      console.error('Reconnect failed', err);
    } finally {
      setReconnecting(false);
    }
  };

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
      fetchEvents();
    } catch (error: any) {
      if (error instanceof CalendarAuthError) {
        setIsModalOpen(false);
        setAuthError(true);
      } else {
        alert(`Error creating event: ${error?.message || 'Unknown error'}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] relative">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-[#2C2C2C] pb-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <h1 className="text-xl sm:text-2xl font-bold">{format(currentDate, 'MMMM yyyy')}</h1>
          <div className="flex items-center gap-1 bg-[#222] rounded-md p-1 border border-[#333]">
            <button onClick={prevWeek} className="p-1 hover:bg-[#333] rounded transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={today} className="px-3 py-1 text-sm font-medium hover:bg-[#333] rounded transition-colors">Today</button>
            <button onClick={nextWeek} className="p-1 hover:bg-[#333] rounded transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button
             onClick={fetchEvents}
             title="Refresh"
             className="p-2 border border-[#333] rounded-md text-[var(--text-muted)] hover:text-white transition-colors bg-[#222]"
           >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
           </button>
           <button
             onClick={() => setIsModalOpen(true)}
             className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
           >
              <Plus className="w-4 h-4" /> New Event
           </button>
        </div>
      </header>

      {/* Connection / error notices */}
      {authError && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <CalendarOff className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200 flex-1">
            Google Calendar isn't connected. Connect your account to see and save your events with automatic reminders.
          </p>
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            className="shrink-0 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium transition-colors"
          >
            {reconnecting ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
        </div>
      )}
      {errMsg && !authError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errMsg}
        </div>
      )}

      {/* Week Grid — scrolls horizontally on small screens so columns stay readable */}
      <div className="flex-1 min-h-0 overflow-x-auto">
       <div className="h-full min-w-[720px] lg:min-w-0 flex flex-col border border-[#333] rounded-xl overflow-hidden bg-[#1A1A1A]">
        {/* Days Header */}
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[#333] bg-[#222]">
          <div className="border-r border-[#333]" />
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

        {/* Timeline Body — full 24h, scrollable, minute-accurate */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative bg-[#1c1c1c]">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#1c1c1c]/70">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          )}
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: DAY_PX }}>
            {/* Time gutter */}
            <div className="relative border-r border-[#333]">
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] font-mono"
                     style={{ top: h * HOUR_PX }}>
                  {h === 0 ? '' : `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day, colIdx) => {
              const dayEvents = events.filter(e => isSameDay(e.date, day));
              return (
                <div key={colIdx} className="border-r border-[#333] last:border-0 relative">
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-[#2C2C2C]"
                         style={{ top: h * HOUR_PX, height: HOUR_PX }} />
                  ))}

                  {dayEvents.map((event) => {
                    const top = (event.startMinutes / 60) * HOUR_PX;
                    const height = Math.max(event.duration * HOUR_PX, 24);
                    return (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={event.id}
                        title={`${event.title} · ${event.startLabel}`}
                        onClick={() => setSelectedEvent(event)}
                        className={cn(
                          "absolute left-1 right-1 rounded-md p-1.5 text-[11px] border backdrop-blur-sm overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] z-10",
                          event.color
                        )}
                        style={{ top, height }}
                      >
                        <div className="font-semibold leading-tight truncate">{event.title}</div>
                        <div className="opacity-80 mt-0.5">{event.startLabel}</div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {!loading && !authError && !errMsg && events.length === 0 && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-[var(--text-muted)] pointer-events-none">
              No upcoming events. Click “New Event” to schedule one.
            </div>
          )}
        </div>
       </div>
      </div>

      {/* New Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-[#222] border border-[#333] rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
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
                  <input type="text" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Event title..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
                    <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Start Time</label>
                    <input type="time" value={newEvent.startTime} onChange={e => setNewEvent({ ...newEvent, startTime: e.target.value })} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Duration (hours)</label>
                  <input type="number" step="0.5" min="0.5" value={newEvent.duration} onChange={e => setNewEvent({ ...newEvent, duration: parseFloat(e.target.value) || 1 })} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Description (optional)</label>
                  <textarea value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} className="w-full bg-[#1A1A1A] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-20" placeholder="Add some details..." />
                </div>

                <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                  <BellRing className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--text-secondary)]">
                    Reminders are added automatically: <span className="text-blue-300">{describeReminders()}</span>.
                  </p>
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

      {/* Event Details Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedEvent(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#222] border border-[#333] rounded-xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold truncate pr-4">{selectedEvent.title}</h2>
                <button onClick={() => setSelectedEvent(null)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{format(selectedEvent.date, 'EEEE, MMMM d')}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>
                    {selectedEvent.startLabel} - {format(new Date(selectedEvent.date.getTime() + selectedEvent.duration * 60 * 60 * 1000), 'h:mm a')}
                    <span className="ml-2 opacity-60">({selectedEvent.duration} hr{selectedEvent.duration !== 1 ? 's' : ''})</span>
                  </span>
                </div>

                {selectedEvent.description && (
                  <div className="mt-4 p-3 bg-[#1A1A1A] rounded-lg border border-[#333] text-sm text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {selectedEvent.description}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[#333] flex justify-end gap-3">
                <button onClick={() => setSelectedEvent(null)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  Close
                </button>
                {selectedEvent.htmlLink && (
                  <a
                    href={selectedEvent.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#1A1A1A] border border-[#444] hover:bg-[#333] text-white rounded-md text-sm font-medium transition-colors"
                  >
                    Open in Google Calendar
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
