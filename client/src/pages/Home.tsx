import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BellRing,
  Binary,
  CheckCircle2,
  CircleDashed,
  Database,
  Eye,
  Fingerprint,
  LockKeyhole,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Link } from "wouter";

const operationalLanes = [
  {
    title: "Monitor",
    description:
      "Observe system health, security controls, and alert channels without pretending that unconfigured integrations are active.",
    icon: Radar,
    href: "/security",
    state: "LIVE",
  },
  {
    title: "Investigate",
    description:
      "Use the OSINT capability registry for authorised intelligence gathering and evidence-led analysis.",
    icon: Eye,
    href: "/tools",
    state: "CONTROLLED",
  },
  {
    title: "Respond",
    description:
      "Route warnings through the notification centre and preserve a clear decision trail before taking action.",
    icon: Siren,
    href: "/notifications",
    state: "ARMED",
  },
];

const doctrine = [
  "Verify before escalation",
  "Separate evidence from assumptions",
  "Expose degraded systems honestly",
  "Keep secrets on the server",
];

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const health = trpc.system.health.useQuery({ timestamp: 0 });
  const posture = trpc.system.posture.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const systemState = health.data?.ok
    ? "ONLINE"
    : health.isError
      ? "FAULT"
      : "CHECKING";
  const postureState =
    posture.data?.status ?? (isAuthenticated ? "CHECKING" : "LOCKED");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-border/70 pt-20">
        <div
          className="osiris-grid absolute inset-0 opacity-40"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,oklch(0.65_0.15_200_/_0.12),transparent_32%),linear-gradient(to_bottom,transparent,var(--background))]" />

        <div className="container relative py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <div className="mb-6 flex flex-wrap items-center gap-3 font-mono text-xs tracking-[0.22em]">
                <Badge
                  variant="outline"
                  className="border-primary/50 bg-primary/10 text-primary"
                >
                  OSIRIS // COMMAND LAYER
                </Badge>
                <span className="text-muted-foreground">
                  SECURITY • INTELLIGENCE • RESPONSE
                </span>
              </div>

              <h1 className="max-w-4xl text-5xl font-bold leading-[0.95] tracking-[-0.06em] sm:text-7xl lg:text-8xl">
                See clearly.
                <span className="block text-foreground">Act deliberately.</span>
              </h1>

              <p className="mt-8 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                OSIRIS is an operational security workspace. It gathers signals,
                exposes weak controls, supports authorised investigation, and
                keeps response decisions tied to evidence.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="font-mono tracking-wide">
                  <Link href="/security">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Open security centre
                  </Link>
                </Button>
                {!loading && !isAuthenticated && (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="font-mono"
                  >
                    <a href={getLoginUrl()}>
                      <Fingerprint className="mr-2 h-4 w-4" />
                      Authenticate
                    </a>
                  </Button>
                )}
              </div>
            </div>

            <Card className="border-primary/30 bg-card/75 shadow-[0_0_50px_oklch(0.65_0.15_200_/_0.08)] backdrop-blur">
              <CardHeader className="border-b border-border/60 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-sm tracking-[0.18em]">
                    SYSTEM POSTURE
                  </CardTitle>
                  <Activity className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-6 font-mono text-sm">
                <StatusRow
                  label="Core service"
                  value={systemState}
                  healthy={systemState === "ONLINE"}
                />
                <StatusRow
                  label="Security controls"
                  value={postureState}
                  healthy={postureState === "READY"}
                />
                <StatusRow
                  label="Identity"
                  value={user ? user.name || user.email || "VERIFIED" : "GUEST"}
                  healthy={Boolean(user)}
                />
                <div className="border-t border-border/60 pt-4 text-xs leading-5 text-muted-foreground">
                  {isAuthenticated
                    ? "Configuration status is measured server-side. Secret values are never returned to this screen."
                    : "Authenticate to reveal protected configuration posture. Public health remains visible."}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-14 grid border-x border-t border-border/60 md:grid-cols-3">
            {operationalLanes.map(
              ({ title, description, icon: Icon, href, state }) => (
                <Link
                  key={title}
                  href={href}
                  className="group border-b border-border/60 bg-card/25 p-6 transition duration-200 hover:bg-primary/[0.06] md:border-r last:md:border-r-0"
                >
                  <div className="flex items-center justify-between gap-4">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="font-mono text-[10px] tracking-[0.18em] text-chart-1">
                      {state}
                    </span>
                  </div>
                  <h2 className="mt-8 text-xl text-foreground">{title}</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </Link>
              )
            )}
          </div>
        </div>
      </section>

      <section className="container grid gap-8 py-14 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <div className="flex items-center gap-3 text-primary">
            <Binary className="h-5 w-5" />
            <span className="font-mono text-xs tracking-[0.2em]">
              OPERATING DOCTRINE
            </span>
          </div>
          <h2 className="mt-5 max-w-md text-3xl leading-tight">
            Strength comes from disciplined structure, not feature count.
          </h2>
        </div>

        <div className="grid gap-px overflow-hidden border border-border/60 bg-border/60 sm:grid-cols-2">
          {doctrine.map((item, index) => (
            <div
              key={item}
              className="flex min-h-28 items-start gap-4 bg-card p-5"
            >
              <span className="font-mono text-xs text-primary">
                0{index + 1}
              </span>
              <div>
                <CheckCircle2 className="mb-3 h-4 w-4 text-chart-1" />
                <p className="text-sm leading-6 text-foreground">{item}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusRow({
  label,
  value,
  healthy,
}: {
  label: string;
  value: string;
  healthy: boolean;
}) {
  const Icon = healthy
    ? CheckCircle2
    : value === "CHECKING"
      ? CircleDashed
      : ShieldAlert;

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-muted-foreground">
        {label === "Identity" ? (
          <LockKeyhole className="h-4 w-4" />
        ) : label === "Core service" ? (
          <Database className="h-4 w-4" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {label}
      </span>
      <span
        className={
          healthy
            ? "flex items-center gap-2 text-chart-1"
            : "flex items-center gap-2 text-chart-3"
        }
      >
        <Icon className="h-4 w-4" />
        {value}
      </span>
    </div>
  );
}
