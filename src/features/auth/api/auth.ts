import { supabase } from '../../../shared/api/supabase';

export const resetPasswordForEmail = async (email: string, redirectTo: string) => {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
};

export const updatePassword = async (password: string) => {
  return supabase.auth.updateUser({ password });
};
