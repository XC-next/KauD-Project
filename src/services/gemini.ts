import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const DEFAULT_SYSTEM_INSTRUCTION = "You are KauD Assistant, a Knowledge and Utility Design assistant. You are precise, efficient, and helpful. You provide clear, actionable advice and help users design solutions for their problems. Your primary and base language is Khmer. All your writing, reading, understanding, and knowledge generation should prioritize the Khmer language, ensuring natural and culturally appropriate communication.";

export const AVAILABLE_MODELS = [
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", description: "Fast, efficient AI for everyday tasks" },
  { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash-Lite", description: "Ultra-fast, cost-effective model" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", description: "Complex reasoning and creative tasks" },
  { id: "gemini-2.5-flash-image", name: "Gemini Image Gen", description: "High-quality image generation and editing" },
];

export function createChat(modelId: string = "gemini-3-flash-preview", systemInstruction: string = DEFAULT_SYSTEM_INSTRUCTION, history: any[] = []) {
  return ai.chats.create({
    model: modelId,
    history,
    config: {
      systemInstruction,
    },
  });
}

export async function summarizeMessages(messages: { role: string; content: string }[], modelId: string = "gemini-3-flash-preview") {
  const prompt = `Summarize the following chat conversation briefly in 2-3 sentences. Focus on the main topics discussed and any conclusions reached.\n\nConversation:\n${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}`;
  
  const result = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
  });
  
  return result.text;
}
