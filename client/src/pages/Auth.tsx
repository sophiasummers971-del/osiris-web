import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;

    setPending(true);
    try {
      const supabase = getSupabaseClient();
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;

      if (result.data.session) {
        window.location.href = "/vault";
        return;
      }

      toast.success("Check your email to confirm the OSIRIS account");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Authentication failed"
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-28 text-foreground">
      <Card className="mx-auto max-w-md border-primary/30 bg-card/80">
        <CardHeader className="border-b border-border/60 text-center">
          <ShieldCheck className="mx-auto h-9 w-9 text-primary" />
          <CardTitle className="mt-3 text-2xl">
            Operator authentication
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Supabase verifies the identity. OSIRIS applies case ownership
            separately.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          {!isSupabaseConfigured ? (
            <p className="text-sm text-chart-3">
              Supabase Auth variables are missing from this deployment.
            </p>
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="operator-email">Email</Label>
                <Input
                  id="operator-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operator-password">Password</Label>
                <Input
                  id="operator-password"
                  type="password"
                  minLength={8}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={pending}>
                <Fingerprint className="mr-2 h-4 w-4" />
                {pending
                  ? "VERIFYING…"
                  : mode === "signin"
                    ? "Authenticate"
                    : "Create operator account"}
              </Button>
              <button
                className="w-full font-mono text-xs text-muted-foreground hover:text-primary"
                type="button"
                onClick={() =>
                  setMode(value => (value === "signin" ? "signup" : "signin"))
                }
              >
                {mode === "signin"
                  ? "No account? Create one"
                  : "Already registered? Sign in"}
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
