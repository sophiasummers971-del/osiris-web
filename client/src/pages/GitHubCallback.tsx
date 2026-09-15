import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef } from "react";

export default function GitHubCallback() {
  const started = useRef(false);
  const complete = trpc.monitoring.completeGitHubConnection.useMutation({
    onSuccess: () => window.location.replace("/tools?github=connected"),
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const parameters = new URLSearchParams(window.location.search);
    const code = parameters.get("code");
    const state = parameters.get("state");
    if (code && state) complete.mutate({ code, state });
  }, [complete]);

  const missingParameters =
    !new URLSearchParams(window.location.search).get("code") ||
    !new URLSearchParams(window.location.search).get("state");

  return (
    <main className="min-h-screen bg-background px-4 pt-28 text-foreground">
      <Card className="mx-auto max-w-xl border-border/50 bg-card/60">
        <CardHeader>
          <CardTitle>Connecting GitHub</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {missingParameters
            ? "GitHub did not return a valid authorization response."
            : complete.error
              ? complete.error.message
              : "OSIRIS is verifying and securing the connection…"}
        </CardContent>
      </Card>
    </main>
  );
}
