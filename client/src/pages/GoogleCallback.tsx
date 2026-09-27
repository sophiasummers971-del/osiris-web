import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
export default function GoogleCallback() {
  const started = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const complete = trpc.googleMonitoring.complete.useMutation({
    onSuccess: () => window.location.replace("/tools?google=connected"),
  });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code"),
      state = params.get("state");
    const expected = sessionStorage.getItem("osiris-google-state");
    sessionStorage.removeItem("osiris-google-state");
    window.history.replaceState({}, "", "/integrations/google/callback");
    if (!code || !state || state !== expected || params.has("error")) {
      setInvalid(true);
      return;
    }
    complete.mutate({ code, state });
  }, [complete]);
  return (
    <main className="mx-auto max-w-xl px-4 pt-28">
      <h1>Connecting Google</h1>
      <p role="status">
        {invalid
          ? "Google authorization was cancelled or did not match this browser. Return to Intelligence and start again."
          : complete.error
            ? complete.error.data?.code === "UNAUTHORIZED"
              ? "Your OSIRIS session expired. Sign in and start again from Intelligence."
              : `Connection could not be completed. Reference: ${complete.error.message.match(/GOOGLE_[A-Z_]+/)?.[0] ?? "GOOGLE_REQUEST_FAILED"}. Return to Intelligence and share this reference for diagnosis.`
            : "Verifying the connection…"}
      </p>
      <a href="/tools">Return to Intelligence</a>
    </main>
  );
}
