import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

type SupabaseFallbackUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: "supabase";
  role: "user";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

const OPERATOR_SESSION_KEY = "osiris-operator-session";

function readStoredOperator(): SupabaseFallbackUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(OPERATOR_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      id?: string;
      email?: string | null;
      name?: string | null;
      createdAt?: string;
    };

    if (!parsed.id && !parsed.email) return null;

    const createdAt = parsed.createdAt ? new Date(parsed.createdAt) : new Date();

    return {
      id: 0,
      openId: parsed.id ? `supabase:${parsed.id}` : "supabase:operator",
      name: parsed.name ?? null,
      email: parsed.email ?? null,
      loginMethod: "supabase",
      role: "user",
      createdAt,
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
  } catch {
    return null;
  }
}

function storeOperator(user: SupabaseFallbackUser | null) {
  if (typeof window === "undefined") return;

  if (!user) {
    window.localStorage.removeItem(OPERATOR_SESSION_KEY);
    return;
  }

  window.localStorage.setItem(
    OPERATOR_SESSION_KEY,
    JSON.stringify({
      id: user.openId.replace(/^supabase:/, ""),
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    })
  );
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const [supabaseUser, setSupabaseUser] = useState<SupabaseFallbackUser | null>(
    null
  );
  const [storedOperator, setStoredOperator] = useState<SupabaseFallbackUser | null>(
    () => readStoredOperator()
  );
  const [supabaseLoading, setSupabaseLoading] = useState(isSupabaseConfigured);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const toFallbackUser = useCallback((sessionUser: {
    id: string;
    email?: string;
    created_at?: string;
    user_metadata?: { name?: string; full_name?: string };
  }): SupabaseFallbackUser => {
    const createdAt = sessionUser.created_at
      ? new Date(sessionUser.created_at)
      : new Date();

    return {
      id: 0,
      openId: `supabase:${sessionUser.id}`,
      name:
        sessionUser.user_metadata?.full_name ??
        sessionUser.user_metadata?.name ??
        null,
      email: sessionUser.email ?? null,
      loginMethod: "supabase",
      role: "user",
      createdAt,
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      if (isSupabaseConfigured) {
        await getSupabaseClient().auth.signOut();
      }
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      setSupabaseUser(null);
      setStoredOperator(null);
      storeOperator(null);
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSupabaseLoading(false);
      return;
    }

    let mounted = true;
    const supabase = getSupabaseClient();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const fallbackUser = data.session?.user
          ? toFallbackUser(data.session.user)
          : null;
        setSupabaseUser(fallbackUser);
        if (fallbackUser) {
          storeOperator(fallbackUser);
          setStoredOperator(fallbackUser);
        }
      })
      .finally(() => {
        if (mounted) setSupabaseLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const fallbackUser = session?.user ? toFallbackUser(session.user) : null;
      setSupabaseUser(fallbackUser);
      if (fallbackUser) {
        storeOperator(fallbackUser);
        setStoredOperator(fallbackUser);
      }
      void meQuery.refetch();
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [meQuery.refetch, toFallbackUser]);

  const state = useMemo(() => {
    const user = meQuery.data ?? supabaseUser ?? storedOperator;

    localStorage.setItem("manus-runtime-user-info", JSON.stringify(user));

    return {
      user,
      loading:
        supabaseLoading ||
        logoutMutation.isPending ||
        (meQuery.isLoading && !supabaseUser && !storedOperator),
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    supabaseLoading,
    supabaseUser,
    storedOperator,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [redirectOnUnauthenticated, redirectPath, state.loading, state.user]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
