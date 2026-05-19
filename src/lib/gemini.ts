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

    let errorMessage = 'Failed to connect to Gemini API. Please check your API key.';
    if (error.message?.includes('429') || error.message?.includes('Quota exceeded')) {
      errorMessage = 'You have exceeded your Gemini API quota. Please try again later or check your Google AI Studio billing limits.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      message: `⚠️ AI Error: ${errorMessage}`,
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
