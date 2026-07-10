import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface SignInParams {
  email: string;
  password: string;
}

/**
 * On success, app/_layout.tsx's useAuthGuard detects the new session and
 * redirects to the correct tab group automatically — callers don't need to
 * navigate themselves.
 */
export function useSignIn() {
  return useMutation({
    mutationFn: async ({ email, password }: SignInParams) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
    },
  });
}
