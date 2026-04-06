import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "./chat-stream";

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export async function fetchSessions(): Promise<ChatSession[]> {
  try {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      console.warn('[v0] Failed to fetch sessions:', error.message);
      return [];
    }
    return (data || []).map((d: any) => ({
      ...d,
      messages: (d.messages || []) as ChatMessage[],
    }));
  } catch (e) {
    console.warn('[v0] Error fetching sessions:', e);
    return [];
  }
}

export async function createSession(title?: string): Promise<ChatSession> {
  try {
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({ title: title || "محادثة جديدة", messages: [] })
      .select()
      .single();
    if (error) {
      console.warn('[v0] Failed to create session:', error.message);
      // Return a local-only session
      return {
        id: `local_${Date.now()}`,
        title: title || "محادثة جديدة",
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return { ...data, messages: (data.messages || []) as unknown as ChatMessage[] };
  } catch (e) {
    console.warn('[v0] Error creating session:', e);
    return {
      id: `local_${Date.now()}`,
      title: title || "محادثة جديدة",
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

export async function updateSessionMessages(id: string, messages: ChatMessage[]): Promise<void> {
  // Skip DB update for local-only sessions
  if (id.startsWith('local_')) return;
  
  try {
    const title = messages.find(m => m.role === "user")?.content?.slice(0, 50) || "محادثة جديدة";
    const { error } = await supabase
      .from("chat_sessions")
      .update({ messages: messages as any, title, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.warn('[v0] Failed to update session:', error.message);
    }
  } catch (e) {
    console.warn('[v0] Error updating session:', e);
  }
}

export async function deleteSession(id: string): Promise<void> {
  // Skip DB delete for local-only sessions
  if (id.startsWith('local_')) return;
  
  try {
    const { error } = await supabase.from("chat_sessions").delete().eq("id", id);
    if (error) {
      console.warn('[v0] Failed to delete session:', error.message);
    }
  } catch (e) {
    console.warn('[v0] Error deleting session:', e);
  }
}
