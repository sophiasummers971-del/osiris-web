import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  describeMonitoringError,
  formatMonitoringTimestamp,
} from "@/lib/monitoring-status";

export default function GoogleMonitoring({
  authenticated,
}: {
  authenticated: boolean;
}) {
  const utils = trpc.useUtils();
  const config = trpc.googleMonitoring.configuration.useQuery(undefined, {
    enabled: authenticated,
    retry: false,
  });
  const connections = trpc.monitoring.listConnections.useQuery(undefined, {
    enabled: authenticated,
    retry: false,
  });
  const begin = trpc.googleMonitoring.begin.useMutation({
    onSuccess: data => {
      sessionStorage.setItem("osiris-google-state", data.state);
      window.location.assign(data.authorizationUrl);
    },
  });
  const disconnect = trpc.googleMonitoring.disconnect.useMutation({
    onSuccess: () => utils.monitoring.listConnections.invalidate(),
  });
  const run = trpc.monitoring.runNow.useMutation({
    onSuccess: async () => {
      await utils.monitoring.listConnections.invalidate();
      await utils.monitoring.listActivity.invalidate();
    },
  });
  return (
    <Card className="mb-6 border-border/50 bg-card/60">
      <CardHeader>
        <CardTitle>Google security-email monitoring</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          Checks new message headers for English-language Google security
          notices. No email bodies or attachments are collected. Notices are
          unverified reports to review, not proof of compromise. Historical mail
          is not imported.
        </p>
        <p>
          Metadata permission covers headers across the mailbox. This first
          version records medium-priority notices in PEGASUS; it does not send
          high/critical alarm emails for them.
        </p>
        {!authenticated ? (
          <p>Sign in to manage Google connections.</p>
        ) : (
          <>
            {config.isLoading ? (
              <p>Checking connector availability…</p>
            ) : !config.data?.configured ? (
              <p>
                Not connected: Google app registration and connector activation
                are required.
              </p>
            ) : (
              <Button disabled={begin.isPending} onClick={() => begin.mutate()}>
                Connect Google account
              </Button>
            )}
            {connections.data
              ?.filter(c => c.provider === "google")
              .map(c => (
                <section key={c.id} className="space-y-2 rounded border p-3">
                  <p className="break-all">
                    {c.displayName} — {c.status}
                  </p>
                  <p>
                    Last attempt: {formatMonitoringTimestamp(c.lastCheckedAt)}
                  </p>
                  <p>{describeMonitoringError(c.lastErrorCode)}</p>
                  {c.status === "active" && (
                    <Button
                      disabled={run.isPending}
                      onClick={() => run.mutate({ connectionId: c.id })}
                    >
                      Check now
                    </Button>
                  )}
                  {c.status !== "disconnected" && (
                    <Button
                      variant="outline"
                      disabled={disconnect.isPending}
                      onClick={() => disconnect.mutate({ connectionId: c.id })}
                    >
                      Disconnect Google
                    </Button>
                  )}
                </section>
              ))}
          </>
        )}
        {(begin.error ||
          disconnect.error ||
          run.error ||
          config.error ||
          connections.error) && (
          <p role="alert">
            Google monitoring could not complete this request. Check
            configuration or retry.
          </p>
        )}
        {run.data && (
          <p>
            Check complete: {run.data.processed} processed, {run.data.failed}{" "}
            failed.
          </p>
        )}
        {disconnect.data && (
          <p>
            {disconnect.data.revoked
              ? "Disconnected and Google access revoked."
              : "Local monitoring stopped. Remove OSIRIS access in your Google Account to finish revocation."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
