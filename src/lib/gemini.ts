/// <reference types="vite/client" />
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export type AIActionType =
  | 'create_event'
  | 'create_task' | 'delete_task'
  | 'generate_study_plan' | 'add_subject' | 'add_study_session' | 'delete_subject'
  | 'add_habit' | 'checkin_habit' | 'delete_habit'
  | 'add_team_task' | 'move_team_task' | 'delete_team_task'
  | 'general';

export interface AIAction {
  type: AIActionType;
  data?: any;
}

export interface AIResponse {
  message: string;
  action?: AIAction;
}

const SYSTEM_PROMPT = `You are a helpful AI calendar and productivity assistant called "Cal AI". You help users manage their schedules, study plans, tasks, and daily productivity.

When a user asks you to:
1. **Create a calendar event**: Respond helpfully and include a JSON block like:
   \`\`\`action
   {"type":"create_event","data":{"title":"...","date":"YYYY-MM-DD","startHour":10,"startMinute":0,"endHour":12,"endMinute":0,"description":"..."}}
   \`\`\`
   Use 24-hour values for startHour/endHour and always include startMinute/endMinute (0 if not specified).
2. **Create a task**: Respond helpfully and include:
   \`\`\`action
   {"type":"create_task","data":{"title":"...","tag":"...","time":"HH:MM AM - HH:MM PM"}}
   \`\`\`
3. **Delete a task**: \`\`\`action
   {"type":"delete_task","data":{"title":"<existing task title>"}}
   \`\`\`
4. **Generate a study plan**: \`\`\`action
   {"type":"generate_study_plan","data":{"subjects":[{"title":"...","color":"blue","sessions":[{"day":"Monday","topic":"...","hours":2}]}]}}
   \`\`\`
5. **Add a study subject**: \`\`\`action
   {"type":"add_subject","data":{"title":"...","color":"blue"}}
   \`\`\`
6. **Add a study session** to an existing subject: \`\`\`action
   {"type":"add_study_session","data":{"subject":"<existing subject title>","day":"Monday","topic":"...","hours":2}}
   \`\`\`
7. **Delete a study subject**: \`\`\`action
   {"type":"delete_subject","data":{"title":"<existing subject title>"}}
   \`\`\`
8. **Add a habit**: \`\`\`action
   {"type":"add_habit","data":{"name":"...","icon":"✨","color":"green"}}
   \`\`\`
9. **Check in / mark a habit done today**: \`\`\`action
   {"type":"checkin_habit","data":{"name":"<existing habit name>"}}
   \`\`\`
10. **Delete a habit**: \`\`\`action
   {"type":"delete_habit","data":{"name":"<existing habit name>"}}
   \`\`\`
11. **Add a team task**: \`\`\`action
   {"type":"add_team_task","data":{"title":"...","assignee":"...","label":"General","status":"todo"}}
   \`\`\`
12. **Move a team task** (status: todo | in-progress | done): \`\`\`action
   {"type":"move_team_task","data":{"title":"<existing team task title>","status":"done"}}
   \`\`\`
13. **Delete a team task**: \`\`\`action
   {"type":"delete_team_task","data":{"title":"<existing team task title>"}}
   \`\`\`
14. **General questions**: Just respond naturally without any action block.

Rules:
- Output AT MOST ONE \`\`\`action\`\`\` block per reply, as valid minified JSON.
- For delete/move/checkin actions, use the EXACT existing names shown in the "Current data" context below; never invent IDs.
- colors must be one of: blue, purple, green, orange, red, cyan. days are full names (Monday…Sunday).
Be concise, friendly, and proactive. Use emojis sparingly.
Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

/**
 * Turns a raw Gemini/genai SDK error into a short, actionable message.
 * Avoids dumping raw JSON error blobs into the chat UI.
 */
function describeGeminiError(error: any): string {
  // The SDK packs the server JSON into error.message; collect every string we can.
  const raw = `${error?.message ?? ''} ${error?.status ?? ''} ${(() => {
    try { return JSON.stringify(error); } catch { return ''; }
  })()}`;

  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    return 'No Gemini API key configured. Add VITE_GEMINI_API_KEY to your .env file and restart the dev server.';
  }
  if (
    raw.includes('API key expired') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('API key not valid') ||
    raw.includes('INVALID_ARGUMENT')
  ) {
    return 'Your Gemini API key is expired or invalid. Generate a new key at https://aistudio.google.com/apikey, set it as VITE_GEMINI_API_KEY in your .env file, then restart the dev server.';
  }
  if (raw.includes('429') || raw.includes('Quota exceeded') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'You have exceeded your Gemini API quota. Please wait a while or check your usage limits in Google AI Studio.';
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('denied access')) {
    return 'Your Gemini API key was denied access or revoked. Generate a new key at https://aistudio.google.com/apikey and update your .env file.';
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND')) {
    return 'The requested Gemini model was not found. The model name may have changed — check the Google AI Studio model list.';
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || /overloaded|high demand/i.test(raw)) {
    return 'Gemini is experiencing high demand right now and did not respond after several automatic retries. This is temporary — please try again in a moment.';
  }
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('ENOTFOUND')) {
    return 'Could not reach the Gemini API. Check your internet connection and try again.';
  }

  // Last resort: surface the API's human-readable message if we can find one,
  // never the raw JSON envelope.
  try {
    const match = raw.match(/"message"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch { /* ignore */ }
  return error?.message
    ? String(error.message).slice(0, 200)
    : 'Failed to connect to the Gemini API. Please check your API key and network connection.';
}

/** True for temporary, retry-worthy failures (overload, rate spike, network blips). */
function isTransientError(error: any): boolean {
  const raw = `${error?.message ?? ''} ${error?.status ?? ''} ${(() => {
    try { return JSON.stringify(error); } catch { return ''; }
  })()}`;
  return /(\b503\b|UNAVAILABLE|overloaded|high demand|temporarily|try again later|\b429\b|RESOURCE_EXHAUSTED|Failed to fetch|NetworkError|ECONN|ETIMEDOUT|deadline)/i.test(raw);
}

/**
 * Runs `fn`, retrying transient failures with exponential backoff + jitter.
 * Non-transient errors (bad key, 403, 404…) throw immediately — no point retrying.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt === retries || !isTransientError(error)) throw error;
      const delay = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 400;
      console.warn(`Gemini transient error — retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Try these in order — if one model is overloaded (503), fall back to the next.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

/** Generate content, retrying transient errors and falling back across models. */
async function generateContentWithFallback(contents: any, retries = 2): Promise<any> {
  let lastError: any;
  for (const model of MODELS) {
    try {
      return await withRetry(() => ai.models.generateContent({ model, contents }), retries);
    } catch (error: any) {
      lastError = error;
      const raw = `${error?.message ?? ''} ${(() => {
        try { return JSON.stringify(error); } catch { return ''; }
      })()}`;
      // A bad/expired key or permission problem won't be fixed by another
      // model — fail fast instead of hammering every model.
      if (/API key|API_KEY_INVALID|PERMISSION_DENIED|\b403\b|expired/i.test(raw)) throw error;
      console.warn(`Model "${model}" unavailable — falling back to next model.`);
    }
  }
  throw lastError;
}

// ─── Local scheduling fallback ───────────────────────────────────────────────
// If the AI is unreachable, still handle plain "schedule X at TIME on DATE"
// requests so the core feature keeps working.

const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function parseScheduleCommand(input: string): AIResponse | null {
  const text = input.trim();
  // Tolerate common misspellings of "schedule" (sedule, shedule, schedual…).
  if (!/\b(s?c?h?edule|schedual|scedule|shedule|skedule|sedule|add|create|set ?up|book|plan|remind)\b/i.test(text)) return null;

  // ---- Time ----
  let hour: number | undefined;
  let minute = 0;
  let timeRaw = '';
  const tMer = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  const tColon = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const tAt = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i);
  const tm = tMer || tColon || tAt;
  if (tm) {
    timeRaw = tm[0];
    hour = parseInt(tm[1], 10);
    minute = tm[2] ? parseInt(tm[2], 10) : 0;
    const mer = tMer?.[3]?.toLowerCase().replace(/\./g, '');
    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
  }

  // ---- Date ----
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = new Date(startOfToday);
  let dateRaw = '';

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const monthDay = text.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})\\b`, 'i'))
    || text.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join('|')})\\b`, 'i'));
  const dom = text.match(/\b(?:date\s*(?:of)?|on(?:\s+the)?|day)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
    || text.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  const weekday = text.match(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`, 'i'));

  if (/\btomorrow\b/i.test(text)) {
    date.setDate(date.getDate() + 1);
    dateRaw = (text.match(/\btomorrow\b/i) || [''])[0];
  } else if (/\b(today|tonight)\b/i.test(text)) {
    dateRaw = (text.match(/\b(today|tonight)\b/i) || [''])[0];
  } else if (iso) {
    date = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    dateRaw = iso[0];
  } else if (monthDay) {
    const mIdx = MONTHS.findIndex(m => new RegExp(m, 'i').test(monthDay[0]));
    const day = parseInt(monthDay[0].match(/\d{1,2}/)![0], 10);
    date = new Date(now.getFullYear(), mIdx, day);
    if (date < startOfToday) date.setFullYear(date.getFullYear() + 1);
    dateRaw = monthDay[0];
  } else if (dom) {
    const day = parseInt(dom[1], 10);
    date = new Date(now.getFullYear(), now.getMonth(), day);
    if (date < startOfToday) date.setMonth(date.getMonth() + 1);
    dateRaw = dom[0];
  } else if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1].toLowerCase());
    let diff = (target - date.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    date.setDate(date.getDate() + diff);
    dateRaw = weekday[0];
  }

  // Need at least a time or a date to be a useful schedule command.
  if (hour === undefined && !dateRaw) return null;

  // ---- Title ----
  let title = text
    .replace(/^\s*(?:can you|could you|would you|please|hey|hi)\s+/i, '')
    .replace(/^\s*(?:s?c?h?edule|schedual|scedule|shedule|skedule|sedule|add|create|set ?up|book|plan|remind me to|remind)\s+/i, '');
  if (timeRaw) title = title.replace(new RegExp('\\b(?:at|in|on|by|for|from|@)?\\s*' + escapeRe(timeRaw), 'i'), ' ');
  if (dateRaw) title = title.replace(new RegExp('\\b(?:on|in|by|for|at)?\\s*' + escapeRe(dateRaw), 'i'), ' ');
  title = title
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:my|a|an|the|to|for|about)\s+/i, '')
    .replace(/[\s,.;:-]+$/, '')
    .trim();
  title = title ? title.replace(/\b\w/g, c => c.toUpperCase()) : 'New Event';

  const startHour = hour ?? 9;
  const endHour = (startHour + 1) % 24;

  return {
    message: `📅 The AI service is busy, so I created this directly from your request. Review the details and tap **Execute Action** to add it to your calendar.`,
    action: {
      type: 'create_event',
      data: {
        title,
        date: toYMD(date),
        startHour,
        startMinute: minute,
        endHour,
        endMinute: minute,
        description: '',
      },
    },
  };
}

let chatHistory: { role: string; parts: { text: string }[] }[] = [];

export function resetChat() {
  chatHistory = [];
}

export async function sendMessage(userMessage: string, context?: string): Promise<AIResponse> {
  chatHistory.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
    const systemParts = [{ text: SYSTEM_PROMPT }];
    if (context) systemParts.push({ text: `\n\nCurrent data (use these exact names for delete/move/checkin):\n${context}` });

    const response = await generateContentWithFallback([
      { role: 'user', parts: systemParts },
      { role: 'model', parts: [{ text: 'Understood! I\'m Cal AI, ready to help you manage your schedule and productivity. How can I help you today?' }] },
      ...chatHistory,
    ]);

    const text = response.text || 'Sorry, I couldn\'t generate a response. Please try again.';

    chatHistory.push({
      role: 'model',
      parts: [{ text }],
    });

    // Parse action blocks from the response
    const actionMatch = text.match(/```action\s*\n?([\s\S]*?)\n?```/);
    let action: AIAction | undefined;
    let cleanMessage = text;

    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1].trim());
        // Remove the action block from the displayed message
        cleanMessage = text.replace(/```action\s*\n?[\s\S]*?\n?```/, '').trim();
      } catch (e) {
        console.warn('Failed to parse AI action:', e);
      }
    }

    return { message: cleanMessage, action };
  } catch (error: any) {
    console.error('Gemini API error:', error);

    // Remove the failed message from history
    chatHistory.pop();

    // Last resort: if the user clearly asked to schedule something, build the
    // event locally so the core feature still works while the AI is down.
    const fallback = parseScheduleCommand(userMessage);
    if (fallback) return fallback;

    return {
      message: `⚠️ AI Error: ${describeGeminiError(error)}`,
    };
  }
}

export async function getAIInsight(context: string): Promise<string> {
  try {
    const response = await generateContentWithFallback([{
      role: 'user',
      parts: [{ text: `You are a productivity assistant. Based on this context, give ONE brief, actionable insight (2 sentences max):\n\n${context}` }],
    }], 2);
    return response.text || 'Keep up the great work! Stay focused on your priorities.';
  } catch {
    return 'Keep up the great work! Stay focused on your priorities.';
  }
}
