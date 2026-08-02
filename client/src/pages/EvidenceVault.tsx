import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  CheckCircle2,
  Clock3,
  FileKey2,
  Fingerprint,
  Hash,
  LockKeyhole,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type Severity = "low" | "medium" | "high" | "critical";
type SourceType =
  | "observation"
  | "document"
  | "message"
  | "system"
  | "external";

const severityStyle: Record<Severity, string> = {
  low: "border-chart-1/30 text-chart-1",
  medium: "border-primary/30 text-primary",
  high: "border-amber-400/30 text-amber-300",
  critical: "border-chart-3/30 text-chart-3",
};

export default function EvidenceVault() {
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const cases = trpc.cases.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = trpc.cases.detail.useQuery(
    { caseId: selectedId ?? 0 },
    { enabled: isAuthenticated && selectedId !== null, retry: false }
  );

  useEffect(() => {
    if (selectedId === null && cases.data?.[0]) setSelectedId(cases.data[0].id);
  }, [cases.data, selectedId]);

  const createCase = trpc.cases.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.cases.list.invalidate();
      setSelectedId(id);
      toast.success("Case opened and audit event recorded");
    },
    onError: error => toast.error(error.message),
  });

  const addEvidence = trpc.cases.addEvidence.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.cases.detail.invalidate(),
        utils.cases.list.invalidate(),
      ]);
      toast.success("Evidence sealed into the case record");
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
                Evidence Vault locked
              </h1>
              <p className="mt-4 max-w-xl text-muted-foreground">
                Cases, evidence, and audit history require a verified operator
                session.
              </p>
              <Button asChild className="mt-8">
                <a href={getLoginUrl()}>
                  <Fingerprint className="mr-2 h-4 w-4" />
                  Authenticate
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-14 pt-24 text-foreground">
      <div className="container">
        <header className="flex flex-col gap-5 border-b border-border/60 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-primary">
              <Archive className="h-4 w-4" /> EVIDENCE VAULT
            </div>
            <h1 className="mt-4 text-4xl text-foreground sm:text-5xl">
              Cases that remember.
            </h1>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              Preserve observations, source references, hashes, timestamps, and
              every operator action as one defensible record.
            </p>
          </div>
          <Badge
            variant="outline"
            className="w-fit border-chart-1/30 text-chart-1"
          >
            APPEND-ONLY EVIDENCE
          </Badge>
        </header>

        <div className="mt-8 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <aside className="space-y-4">
            <CreateCaseForm
              pending={createCase.isPending}
              onSubmit={input => createCase.mutate(input)}
            />
            <Card className="border-border/60 bg-card/45">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm tracking-wide">
                  CASE REGISTER
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cases.isLoading && (
                  <p className="font-mono text-xs text-muted-foreground">
                    LOADING REGISTER…
                  </p>
                )}
                {cases.error && (
                  <p className="text-sm leading-6 text-chart-3">
                    Vault unavailable: {cases.error.message}
                  </p>
                )}
                {cases.data?.length === 0 && (
                  <p className="text-sm leading-6 text-muted-foreground">
                    No cases yet. Open one only when there is a real event or
                    investigation to preserve.
                  </p>
                )}
                {cases.data?.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full border p-3 text-left transition ${selectedId === item.id ? "border-primary/50 bg-primary/[0.07]" : "border-border/50 bg-background/35 hover:border-primary/25"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium">
                        {item.title}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        #{item.id}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-[9px] uppercase ${severityStyle[item.severity]}`}
                      >
                        {item.severity}
                      </span>
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">
                        {item.status}
                      </span>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0">
            {!selectedId ? (
              <EmptyCase />
            ) : detail.isLoading ? (
              <Card className="border-border/60 bg-card/45">
                <CardContent className="py-16 text-center font-mono text-xs text-muted-foreground">
                  OPENING SEALED RECORD…
                </CardContent>
              </Card>
            ) : detail.data ? (
              <div className="space-y-5">
                <Card className="border-primary/25 bg-card/55">
                  <CardHeader className="border-b border-border/60">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">
                          CASE #{detail.data.case.id}
                        </p>
                        <CardTitle className="mt-2 text-2xl">
                          {detail.data.case.title}
                        </CardTitle>
                      </div>
                      <Badge
                        variant="outline"
                        className={severityStyle[detail.data.case.severity]}
                      >
                        {detail.data.case.severity.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-5 pt-6 sm:grid-cols-3">
                    <Metric
                      label="Status"
                      value={detail.data.case.status.toUpperCase()}
                    />
                    <Metric
                      label="Confidence"
                      value={`${detail.data.case.confidence}%`}
                    />
                    <Metric
                      label="Evidence"
                      value={String(detail.data.evidence.length)}
                    />
                    {detail.data.case.summary && (
                      <p className="text-sm leading-6 text-muted-foreground sm:col-span-3">
                        {detail.data.case.summary}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <FileKey2 className="h-5 w-5 text-primary" /> Evidence
                      timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {detail.data.evidence.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No evidence attached. Record the original source before
                        interpretation.
                      </p>
                    )}
                    {detail.data.evidence.map(record => (
                      <article
                        key={record.id}
                        className="border border-border/50 bg-background/35 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{record.label}</p>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-primary">
                              {record.sourceType}
                            </p>
                          </div>
                          <time className="font-mono text-[10px] text-muted-foreground">
                            {new Date(record.capturedAt).toLocaleString()}
                          </time>
                        </div>
                        {record.sourceReference && (
                          <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">
                            SOURCE: {record.sourceReference}
                          </p>
                        )}
                        {record.contentHash && (
                          <p className="mt-2 flex items-start gap-2 break-all font-mono text-[10px] text-chart-1">
                            <Hash className="mt-0.5 h-3 w-3 shrink-0" />
                            {record.contentHash}
                          </p>
                        )}
                        {record.notes && (
                          <p className="mt-3 border-t border-border/50 pt-3 text-sm leading-6 text-muted-foreground">
                            {record.notes}
                          </p>
                        )}
                      </article>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <Clock3 className="h-5 w-5 text-primary" /> Audit trail
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {detail.data.audit.map(event => (
                      <div
                        key={event.id}
                        className="grid gap-2 border-l border-primary/40 pl-4 sm:grid-cols-[150px_1fr]"
                      >
                        <time className="font-mono text-[10px] text-muted-foreground">
                          {new Date(event.createdAt).toLocaleString()}
                        </time>
                        <div>
                          <p className="font-mono text-xs text-primary">
                            {event.action}
                          </p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {JSON.stringify(event.details)}
                          </p>
                          {event.eventHash && (
                            <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">
                              SEAL {event.eventHash}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </section>

          <aside>
            {selectedId ? (
              <EvidenceForm
                caseId={selectedId}
                pending={addEvidence.isPending}
                onSubmit={input => addEvidence.mutate(input)}
              />
            ) : (
              <EmptyIntake />
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function CreateCaseForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (input: {
    title: string;
    summary?: string;
    severity: Severity;
    confidence: number;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [confidence, setConfidence] = useState(50);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ title, summary: summary || undefined, severity, confidence });
    setOpen(false);
    setTitle("");
    setSummary("");
  };

  if (!open)
    return (
      <Button className="w-full" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Open new case
      </Button>
    );
  return (
    <Card className="border-primary/30 bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">Open case</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Title">
            <Input
              required
              minLength={3}
              maxLength={255}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Summary">
            <Textarea
              maxLength={5000}
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />
          </Field>
          <Field label="Severity">
            <select
              className="h-10 w-full border border-input bg-background px-3 text-sm"
              value={severity}
              onChange={e => setSeverity(e.target.value as Severity)}
            >
              {["low", "medium", "high", "critical"].map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label={`Initial confidence — ${confidence}%`}>
            <input
              className="w-full"
              type="range"
              min="0"
              max="100"
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || title.trim().length < 3}>
              {pending ? "Opening…" : "Create"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EvidenceForm({
  caseId,
  pending,
  onSubmit,
}: {
  caseId: number;
  pending: boolean;
  onSubmit: (input: {
    caseId: number;
    label: string;
    sourceType: SourceType;
    sourceReference?: string;
    contentHash?: string;
    notes?: string;
    capturedAt: Date;
  }) => void;
}) {
  const [label, setLabel] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("observation");
  const [sourceReference, setSourceReference] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [notes, setNotes] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      caseId,
      label,
      sourceType,
      sourceReference: sourceReference || undefined,
      contentHash: contentHash || undefined,
      notes: notes || undefined,
      capturedAt: new Date(),
    });
    setLabel("");
    setSourceReference("");
    setContentHash("");
    setNotes("");
  };
  return (
    <Card className="sticky top-24 border-primary/25 bg-card/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          <FileKey2 className="h-4 w-4 text-primary" />
          Evidence intake
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Evidence label">
            <Input
              required
              minLength={2}
              maxLength={255}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Source type">
            <select
              className="h-10 w-full border border-input bg-background px-3 text-sm"
              value={sourceType}
              onChange={e => setSourceType(e.target.value as SourceType)}
            >
              {["observation", "document", "message", "system", "external"].map(
                value => (
                  <option key={value}>{value}</option>
                )
              )}
            </select>
          </Field>
          <Field label="Source reference">
            <Textarea
              placeholder="URL, document reference, device, sender, or origin"
              maxLength={5000}
              value={sourceReference}
              onChange={e => setSourceReference(e.target.value)}
            />
          </Field>
          <Field label="Content hash (optional)">
            <Input
              maxLength={128}
              value={contentHash}
              onChange={e => setContentHash(e.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              maxLength={10000}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </Field>
          <Button
            className="w-full"
            type="submit"
            disabled={pending || label.trim().length < 2}
          >
            {pending ? "Sealing…" : "Seal evidence"}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Evidence cannot be edited through this interface after submission.
            Correct mistakes with a new record so history remains visible.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground">
        {label.toUpperCase()}
      </p>
      <p className="mt-2 text-lg text-foreground">{value}</p>
    </div>
  );
}
function EmptyCase() {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardContent className="flex min-h-80 flex-col items-center justify-center text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        <p className="mt-5 text-lg">No case selected</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Select an existing case or open a new one.
        </p>
      </CardContent>
    </Card>
  );
}
function EmptyIntake() {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardContent className="py-10 text-center">
        <CheckCircle2 className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          Evidence intake activates after a case is selected.
        </p>
      </CardContent>
    </Card>
  );
}
