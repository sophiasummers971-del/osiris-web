import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Binary,
  Eye,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Helmet } from "react-helmet";

const layers = [
  {
    title: "Command",
    icon: Binary,
    text: "One operational view for posture, intelligence, alerts, and response decisions.",
  },
  {
    title: "Security",
    icon: ShieldCheck,
    text: "Server-measured readiness with critical controls separated from optional capabilities.",
  },
  {
    title: "Intelligence",
    icon: Eye,
    text: "Authorised OSINT capabilities treated as evidence sources, never automatic truth.",
  },
  {
    title: "Response",
    icon: Siren,
    text: "A deliberate detect, preserve, contain, and escalate protocol.",
  },
];

const boundaries = [
  "OSIRIS does not claim that a documented tool is deployed.",
  "OSIRIS does not expose secret values to the browser.",
  "OSIRIS does not turn suspicion into accusation.",
  "OSIRIS does not perform intrusive action without authority and evidence.",
];

export default function About() {
  return (
    <main className="min-h-screen bg-background pb-16 pt-24 text-foreground">
      <Helmet>
        <title>About OSIRIS — Architecture & Doctrine</title>
        <meta
          name="description"
          content="The architecture, operating doctrine, and safety boundaries behind OSIRIS."
        />
      </Helmet>

      <div className="container">
        <header className="max-w-4xl border-b border-border/60 pb-10">
          <Badge variant="outline" className="border-primary/40 text-primary">
            SYSTEM DOCTRINE
          </Badge>
          <h1 className="mt-5 text-4xl text-foreground sm:text-6xl">
            Built for clarity under pressure.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            OSIRIS is a security intelligence and response workspace. Its
            purpose is not to collect random utilities; it is to reduce
            uncertainty, preserve evidence, expose weak controls, and support
            proportionate action.
          </p>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          {layers.map(({ title, icon: Icon, text }, index) => (
            <Card key={title} className="border-border/60 bg-card/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="font-mono text-xs text-muted-foreground">
                    LAYER 0{index + 1}
                  </span>
                </div>
                <CardTitle className="pt-5">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {text}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <div className="flex items-center gap-3 text-primary">
              <LockKeyhole className="h-5 w-5" />
              <span className="font-mono text-xs tracking-[0.18em]">
                HARD BOUNDARIES
              </span>
            </div>
            <h2 className="mt-5 text-3xl">
              Power without discipline is just another vulnerability.
            </h2>
          </div>
          <div className="divide-y divide-border/60 border border-border/60 bg-card/35">
            {boundaries.map((boundary, index) => (
              <div key={boundary} className="flex gap-4 p-5">
                <span className="font-mono text-xs text-primary">
                  0{index + 1}
                </span>
                <p className="text-sm leading-6 text-muted-foreground">
                  {boundary}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 border border-chart-3/25 bg-chart-3/[0.04] p-6">
          <div className="flex items-start gap-4">
            <Scale className="mt-1 h-5 w-5 shrink-0 text-chart-3" />
            <div>
              <h2 className="text-lg text-foreground">Authorised use only</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Intelligence functions must be used lawfully, proportionately,
                and only against systems, accounts, or investigations for which
                the operator has permission or another valid legal basis.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
