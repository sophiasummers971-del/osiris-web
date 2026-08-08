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

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const [supabaseUser, setSupabaseUser] = useState<SupabaseFallbackUser | null>(
    null
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
      })
      .finally(() => {
        if (mounted) setSupabaseLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const fallbackUser = session?.user ? toFallbackUser(session.user) : null;
      setSupabaseUser(fallbackUser);
      void meQuery.refetch();
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [meQuery.refetch, toFallbackUser]);

  const state = useMemo(() => {
    const user = meQuery.data ?? supabaseUser;

    localStorage.setItem("manus-runtime-user-info", JSON.stringify(user));

    return {
      user,
      loading:
        supabaseLoading ||
        logoutMutation.isPending ||
        (meQuery.isLoading && !supabaseUser),
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    supabaseLoading,
    supabaseUser,
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
