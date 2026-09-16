import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatMonitoringTimestamp } from "@/lib/monitoring-status";
import { Link } from "wouter";

export default function NotificationCenter() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const alerts = trpc.pegasus.listAlerts.useQuery(
    { limit: 50 },
    { enabled: Boolean(user), retry: false, refetchInterval: 30000 }
  );
  const acknowledge = trpc.pegasus.acknowledgeAlert.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.pegasus.listAlerts.invalidate(),
        utils.pegasus.overview.invalidate(),
      ]);
    },
  });

  return (
    <main className="container mx-auto max-w-4xl px-4 pb-12 pt-24">
      <h1 className="text-3xl font-bold">Security alerts</h1>
      <p className="mt-2 text-muted-foreground">
        Rule-triggered alerts from your durable PEGASUS security ledger. Routine
        profile changes remain in monitoring history.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        In-app viewing is available. Email and browser push delivery are not
        implemented; no email or push notification will be sent.
      </p>
      <div className="my-6 flex flex-wrap gap-3">
        <Link href="/tools" className="text-sm underline">
          Monitoring history
        </Link>
        <Link href="/security" className="text-sm underline">
          Security ledger
        </Link>
      </div>

      {loading ? (
        <p role="status">Loading sign-in status…</p>
      ) : !user ? (
        <p>
          Please{" "}
          <Link href="/auth" className="underline">
            sign in
          </Link>{" "}
          to view your alerts.
        </p>
      ) : (
        <>
          <Button
            variant="outline"
            disabled={alerts.isFetching}
            onClick={() => alerts.refetch()}
          >
            {alerts.isFetching ? "Refreshing…" : "Refresh alerts"}
          </Button>
          {acknowledge.error && (
            <p role="alert" className="mt-4">
              Could not acknowledge the alert. Refresh and try again.
            </p>
          )}
          {alerts.isLoading ? (
            <p role="status" className="mt-4">
              Loading alerts…
            </p>
          ) : alerts.error ? (
            <p role="alert" className="mt-4">
              Alerts are unavailable. This is not an empty inbox or an assurance
              of safety.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {!alerts.data?.length && (
                <p>
                  No rule-triggered security alerts recorded. This does not mean
                  every account or device is safe.
                </p>
              )}
              {alerts.data?.map(alert => (
                <Card key={alert.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{alert.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-xs">
                      {alert.severity.toUpperCase()} ·{" "}
                      {alert.status.toUpperCase()} · {alert.ruleId}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatMonitoringTimestamp(alert.createdAt)}
                    </p>
                    {alert.status === "open" && (
                      <Button
                        className="mt-3"
                        variant="outline"
                        disabled={acknowledge.isPending}
                        onClick={() =>
                          acknowledge.mutate({ alertId: alert.id })
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Acknowledgement records that you reviewed this alert. It
                      does not fix the underlying issue.
                    </p>
                  </CardContent>
                </Card>
              ))}
              {!!alerts.data?.length && (
                <p className="text-xs text-muted-foreground">
                  Showing up to 50 most recent alerts.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
