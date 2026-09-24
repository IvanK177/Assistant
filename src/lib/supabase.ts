import { createClient } from '@supabase/supabase-js';
import type { AppState } from '../types';

const DEFAULT_SUPABASE_KEY = 'sb_publishable_bJXSna45NsyOKYAUUdLZ4g_k8IGsG1v';

// Environment variables from Vite (.env or Vercel Environment Variables)
const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Allow fallback to saved localStorage credentials if user configures in UI
const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('assistant_supabase_url') || '' : '';
const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('assistant_supabase_key') || '' : '';

// In browser, always route through /api/supabase proxy to completely prevent ISP blocks ('Failed to fetch') in Russia
function resolveSupabaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (storedUrl && !storedUrl.includes('.supabase.co')) {
      return storedUrl;
    }
    return `${window.location.origin}/api/supabase`;
  }
  return envUrl || 'https://uvvehsnukzuujncwjwqq.supabase.co';
}

export const SUPABASE_URL = resolveSupabaseUrl();
export const SUPABASE_ANON_KEY = storedKey || envAnonKey || DEFAULT_SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * Configure Supabase credentials dynamically (saved in localStorage and reloads)
 */
export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem('assistant_supabase_url', url.trim());
  localStorage.setItem('assistant_supabase_key', anonKey.trim());
  window.location.reload();
}

/**
 * Save user app state to Supabase 'assistant_data' table
 */
export async function saveCloudState(userId: string, state: AppState): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('assistant_data')
      .upsert({
        user_id: userId,
        state: state,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.warn('Supabase save error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('saveCloudState exception:', err);
    return false;
  }
}

/**
 * Load user app state from Supabase 'assistant_data' table
 */
export async function loadCloudState(userId: string): Promise<AppState | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('assistant_data')
      .select('state')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // PGRST116 is not found (first time)
        console.warn('Supabase load error:', error.message);
      }
      return null;
    }

    return (data?.state as AppState) || null;
  } catch (err) {
    console.error('loadCloudState exception:', err);
    return null;
  }
}
