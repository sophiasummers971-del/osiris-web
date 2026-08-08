import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Activity,
  BellRing,
  CheckCircle2,
  Clock3,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Radio,
  ServerCog,
  ShieldCheck,
  ShieldQuestion,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const responseProtocol = [
  ["Detect", "Confirm that a signal is real and identify its source."],
  [
    "Preserve",
    "Record timestamps, context, and original evidence before changing anything.",
  ],
  ["Contain", "Limit exposure with the smallest reversible action that works."],
  [
    "Escalate",
    "Notify the correct person only when evidence and severity justify it.",
  ],
];

export default function SecurityCenter() {
  const { isAuthenticated, loading } = useAuth();
  const posture = trpc.system.posture.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: 60_000,
  });
  const pegasus = trpc.pegasus.overview.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: 60_000,
  });
  const acknowledgeAlert = trpc.pegasus.acknowledgeAlert.useMutation({
    onSuccess: async () => {
      await pegasus.refetch();
      toast.success("PEGASUS alert acknowledged");
    },
    onError: error => toast.error(error.message),
  });

  if (!loading && !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background pt-28">
        <div className="container max-w-3xl">
          <Card className="border-primary/30 bg-card/80">
            <CardContent className="flex flex-col items-center px-6 py-16 text-center">
              <LockKeyhole className="h-10 w-10 text-primary" />
              <h1 className="mt-6 text-3xl text-foreground">
                Protected security surface
              </h1>
              <p className="mt-4 max-w-xl text-muted-foreground">
                Configuration posture is restricted because even the presence or
                absence of a control is operational information.
              </p>
              <Button asChild className="mt-8">
                <a href={getLoginUrl()}>
                  <Fingerprint className="mr-2 h-4 w-4" />
                  Authenticate to continue
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const data = posture.data;
  const readyCount =
    data?.controls.filter(control => control.ready).length ?? 0;
  const totalCount = data?.controls.length ?? 0;

  return (
    <main className="min-h-screen bg-background pb-16 pt-24">
      <div className="container">
        <header className="flex flex-col gap-6 border-b border-border/60 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-primary">
              <ShieldCheck className="h-4 w-4" /> SECURITY CENTRE
            </div>
            <h1 className="mt-4 text-4xl text-foreground sm:text-5xl">
              Operational posture
            </h1>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              A server-measured view of the controls OSIRIS depends on. This
              screen reports configuration readiness—not imaginary threat
              detection.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              className={
                data?.status === "READY"
                  ? "bg-chart-1/15 text-chart-1"
                  : "bg-chart-3/15 text-chart-3"
              }
            >
              {data?.status ?? "CHECKING"}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {readyCount}/{totalCount} CONTROLS
            </span>
          </div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {(data?.controls ?? []).map(control => (
            <Card
              key={control.id}
              className={
                control.ready
                  ? "border-chart-1/25 bg-card/60"
                  : "border-chart-3/30 bg-card/60"
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  {control.ready ? (
                    <CheckCircle2 className="h-5 w-5 text-chart-1" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-chart-3" />
                  )}
                  {control.critical && (
                    <span className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
                      CRITICAL
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="min-h-12 text-sm font-medium">{control.label}</p>
                <p
                  className={
                    control.ready
                      ? "mt-3 font-mono text-xs text-chart-1"
                      : "mt-3 font-mono text-xs text-chart-3"
                  }
                >
                  {control.ready ? "CONFIGURED" : "ACTION REQUIRED"}
                </p>
                {!control.ready && control.reason && (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {control.reason}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs tracking-[0.18em] text-primary">
                <Activity className="h-4 w-4" /> PEGASUS EVIDENCE
              </div>
              <h2 className="mt-2 text-2xl text-foreground">
                Defensive event record
              </h2>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">
                {pegasus.data?.eventCount ?? 0} EVENTS
              </Badge>
              <Badge
                className={
                  pegasus.data?.integrity === false
                    ? "bg-destructive/15 text-destructive"
                    : "bg-chart-1/15 text-chart-1"
                }
              >
                {pegasus.data?.integrity === false
                  ? "CHAIN WARNING"
                  : "CHAIN VERIFIED"}
              </Badge>
            </div>
          </div>

          {pegasus.error ? (
            <Card className="border-chart-3/30 bg-card/60">
              <CardContent className="flex gap-3 py-6 text-sm text-muted-foreground">
                <AlertTriangle className="h-5 w-5 shrink-0 text-chart-3" />
                <span>
                  PEGASUS storage is not online yet: {pegasus.error.message}
                </span>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/60 bg-card/45">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-primary" /> Alerts
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {pegasus.data?.openAlertCount ?? 0} OPEN
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!pegasus.data?.alerts.length && (
                    <p className="text-sm text-muted-foreground">
                      No verified alert has been recorded. Silence means no
                      evidence has arrived—not that every device is safe.
                    </p>
                  )}
                  {pegasus.data?.alerts.map(alert => (
                    <div
                      key={alert.id}
                      className="rounded-md border border-border/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {alert.ruleId} · {alert.severity.toUpperCase()} ·{" "}
                            {alert.status.toUpperCase()}
                          </p>
                        </div>
                        {alert.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acknowledgeAlert.isPending}
                            onClick={() =>
                              acknowledgeAlert.mutate({ alertId: alert.id })
                            }
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/45">
                <CardHeader>
                  <CardTitle className="text-lg">Latest observations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!pegasus.data?.latestEvents.length && (
                    <p className="text-sm text-muted-foreground">
                      No collector has recorded an observation yet. PEGASUS is
                      ready to receive evidence but does not invent it.
                    </p>
                  )}
                  {pegasus.data?.latestEvents.map(event => (
                    <div
                      key={event.id}
                      className="rounded-md border border-border/60 p-4"
                    >
                      <p className="text-sm font-medium">{event.signal}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {event.source} · {event.confidence}% CONFIDENCE ·{" "}
                        {new Date(event.observedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/60 bg-card/45">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-3 text-lg">
                <Radio className="h-5 w-5 text-primary" /> Response protocol
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/60 p-0">
              {responseProtocol.map(([title, description], index) => (
                <div
                  key={title}
                  className="grid gap-3 p-5 sm:grid-cols-[80px_1fr]"
                >
                  <span className="font-mono text-xs text-primary">
                    0{index + 1} / {title.toUpperCase()}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/60 bg-card/45">
              <CardContent className="space-y-5 pt-6">
                <InfoRow
                  icon={ServerCog}
                  label="Environment"
                  value={data?.environment ?? "CHECKING"}
                />
                <InfoRow
                  icon={KeyRound}
                  label="Session"
                  value={data?.authenticated ? "VERIFIED" : "LOCKED"}
                />
                <InfoRow
                  icon={Clock3}
                  label="Last check"
                  value={
                    data?.checkedAt
                      ? new Date(data.checkedAt).toLocaleTimeString()
                      : "PENDING"
                  }
                />
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/[0.04]">
              <CardContent className="pt-6">
                <BellRing className="h-5 w-5 text-primary" />
                <h2 className="mt-4 text-lg text-foreground">Alert routing</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Review operational warnings and control which channels are
                  allowed to interrupt you.
                </p>
                <Button asChild variant="outline" className="mt-5 w-full">
                  <Link href="/notifications">Open notification centre</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldQuestion;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-3 text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}
