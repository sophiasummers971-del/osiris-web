export type PostureEnvironment = Record<string, string | undefined>;

export type PostureControl = {
  id:
    | "session"
    | "identity"
    | "database"
    | "intelligence"
    | "payments"
    | "treasury";
  label: string;
  ready: boolean;
  critical: boolean;
  reason?: string;
};

export function evaluateStaticPosture(
  environment: PostureEnvironment,
  authenticated: boolean
): PostureControl[] {
  const supabaseConfigured = Boolean(
    environment.VITE_SUPABASE_URL &&
      environment.VITE_SUPABASE_PUBLISHABLE_KEY
  );
  const aiConfigured = Boolean(
    environment.VERCEL_OIDC_TOKEN || environment.AI_GATEWAY_API_KEY
  );
  const stripeSecret = Boolean(environment.STRIPE_SECRET_KEY);
  const stripeWebhook = Boolean(environment.STRIPE_WEBHOOK_SECRET);
  const coinbaseConfigured = Boolean(
    environment.COINBASE_API_KEY_NAME &&
      environment.COINBASE_API_PRIVATE_KEY &&
      environment.COINBASE_PORTFOLIO_ID
  );

  return [
    {
      id: "session",
      label: "Session verification",
      ready: authenticated,
      critical: true,
      reason: authenticated ? undefined : "No verified Supabase session",
    },
    {
      id: "identity",
      label: "Identity gateway",
      ready: supabaseConfigured,
      critical: true,
      reason: supabaseConfigured
        ? undefined
        : "Supabase Auth is not fully configured",
    },
    {
      id: "database",
      label: "Operational database",
      ready: false,
      critical: true,
      reason: "Database probe has not completed",
    },
    {
      id: "intelligence",
      label: "AI intelligence gateway",
      ready: aiConfigured,
      critical: false,
      reason: aiConfigured
        ? undefined
        : "Vercel AI Gateway credentials are unavailable",
    },
    {
      id: "payments",
      label: "Payment isolation",
      ready: stripeSecret && stripeWebhook,
      critical: false,
      reason: !stripeSecret
        ? "Stripe server access is not configured"
        : !stripeWebhook
          ? "Stripe webhook signing is not configured"
          : undefined,
    },
    {
      id: "treasury",
      label: "Coinbase treasury",
      ready: coinbaseConfigured,
      critical: false,
      reason: coinbaseConfigured
        ? undefined
        : "Coinbase treasury credentials are not configured",
    },
  ];
}

export function assemblePosture({
  controls,
  database,
  isProduction,
  checkedAt,
}: {
  controls: PostureControl[];
  database: { ready: boolean; reason?: string };
  isProduction: boolean;
  checkedAt: Date;
}) {
  const resolvedControls = controls.map(control =>
    control.id === "database"
      ? { ...control, ready: database.ready, reason: database.reason }
      : control
  );
  const criticalReady = resolvedControls
    .filter(control => control.critical)
    .every(control => control.ready);

  return {
    status: criticalReady ? ("READY" as const) : ("DEGRADED" as const),
    authenticated:
      resolvedControls.find(control => control.id === "session")?.ready ?? false,
    environment: isProduction
      ? ("PRODUCTION" as const)
      : ("DEVELOPMENT" as const),
    checkedAt,
    controls: resolvedControls,
  };
}
