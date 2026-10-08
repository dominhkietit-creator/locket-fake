import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Supabase project credentials
export const SUPABASE_URL = 'https://idbeoxpdoshiprtjaxvu.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_vynJaPKuXC-05O7jBy9AnQ_JvyTd7CJ';

export const isSupabaseConfigured = () => {
  return (
    SUPABASE_URL &&
    SUPABASE_URL !== 'https://supabase.co' &&
    SUPABASE_URL.includes('.supabase.co') &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY.length > 20
  );
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
