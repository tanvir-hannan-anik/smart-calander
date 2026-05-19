/// <reference types="vite/client" />
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export interface AIAction {
  type: 'create_event' | 'create_task' | 'generate_study_plan' | 'general';
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
   {"type":"create_event","data":{"title":"...","date":"YYYY-MM-DD","startHour":10,"endHour":12,"description":"..."}}
   \`\`\`
2. **Create a task**: Respond helpfully and include:
   \`\`\`action
   {"type":"create_task","data":{"title":"...","tag":"...","time":"HH:MM AM - HH:MM PM"}}
   \`\`\`
3. **Generate a study plan**: Respond with a structured plan and include:
   \`\`\`action
   {"type":"generate_study_plan","data":{"subjects":[{"title":"...","sessions":[{"day":"Monday","topic":"...","hours":2}]}]}}
   \`\`\`
4. **General questions**: Just respond naturally without any action block.

Be concise, friendly, and proactive. Always suggest concrete next steps. Use emojis sparingly but effectively.
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

let chatHistory: { role: string; parts: { text: string }[] }[] = [];

export function resetChat() {
  chatHistory = [];
}

export async function sendMessage(userMessage: string): Promise<AIResponse> {
  chatHistory.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: 'Understood! I\'m Cal AI, ready to help you manage your schedule and productivity. How can I help you today?' }] },
        ...chatHistory,
      ],
    });

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

    return {
      message: `⚠️ AI Error: ${describeGeminiError(error)}`,
    };
  }
}

export async function getAIInsight(context: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [{ text: `You are a productivity assistant. Based on this context, give ONE brief, actionable insight (2 sentences max):\n\n${context}` }],
      }],
    });
    return response.text || 'Keep up the great work! Stay focused on your priorities.';
  } catch {
    return 'Keep up the great work! Stay focused on your priorities.';
  }
}
