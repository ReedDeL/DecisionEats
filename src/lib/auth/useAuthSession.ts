import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface AuthSessionState {
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
}

const initialAuthSessionState: AuthSessionState = {
  isLoading: true,
  isAuthenticated: false,
  userId: null,
  email: null,
};

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState(initialAuthSessionState);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (active && !authEventSeen) {
        setState({
          isLoading: false,
          isAuthenticated: !error && data.session !== null,
          userId: !error ? (data.session?.user.id ?? null) : null,
          email: !error ? (data.session?.user.email ?? null) : null,
        });
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      if (active)
        setState({
          isLoading: false,
          isAuthenticated: session !== null,
          userId: session?.user.id ?? null,
          email: session?.user.email ?? null,
        });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
