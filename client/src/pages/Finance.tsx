import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Fingerprint,
  Landmark,
  LockKeyhole,
  Radio,
} from "lucide-react";

const formatMoney = (value: string | number, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));

type RouterOutputs = inferRouterOutputs<AppRouter>;
type TreasuryData = RouterOutputs["coinbase"]["treasury"];
type StripeStatusData = RouterOutputs["stripe"]["status"];

export default function Finance() {
  const { isAuthenticated, loading } = useAuth();
  const queryOptions = {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  } as const;
  const treasury = trpc.coinbase.treasury.useQuery(undefined, queryOptions);
  const stripe = trpc.stripe.status.useQuery(undefined, queryOptions);
  const products = trpc.stripe.getProducts.useQuery(undefined, queryOptions);
  const orders = trpc.stripe.getUserOrders.useQuery(undefined, queryOptions);
  const subscription = trpc.stripe.getUserSubscription.useQuery(
    undefined,
    queryOptions
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-background pb-16 pt-24">
        <div className="container grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-background pt-28">
        <div className="container max-w-3xl">
          <Card className="border-primary/30 bg-card/80">
            <CardContent className="flex flex-col items-center px-6 py-16 text-center">
              <LockKeyhole className="h-10 w-10 text-primary" />
              <h1 className="mt-6 text-3xl text-foreground">
                Protected finance surface
              </h1>
              <p className="mt-4 max-w-xl text-muted-foreground">
                Treasury balances and payment configuration are available only
                to a verified OSIRIS operator.
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

  return (
    <main className="min-h-screen bg-background pb-16 pt-24">
      <div className="container">
        <header className="border-b border-border/60 pb-8">
          <div className="flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-primary">
            <CircleDollarSign className="h-4 w-4" /> FINANCE CONTROL
          </div>
          <h1 className="mt-4 text-4xl text-foreground sm:text-5xl">
            Treasury and payments
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Read-only Coinbase treasury visibility and a server-measured Stripe
            connection check. No trading, transfers, or withdrawal controls are
            available here.
          </p>
        </header>

        <section className="mt-8 grid gap-8 xl:grid-cols-2">
          <CoinbasePanel
            data={treasury.data}
            isLoading={treasury.isLoading}
            isError={treasury.isError}
          />
          <StripePanel
            data={stripe.data}
            isLoading={stripe.isLoading}
            isError={stripe.isError}
            productCount={products.data?.length}
            orderCount={orders.data?.length}
            subscriptionStatus={subscription.data?.status ?? null}
            dataDegraded={
              products.isError || orders.isError || subscription.isError
            }
          />
        </section>
      </div>
    </main>
  );
}

function CoinbasePanel({
  data,
  isLoading,
  isError,
}: {
  data?: TreasuryData;
  isLoading: boolean;
  isError: boolean;
}) {
  const connected = data?.status === "connected";

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="flex items-center gap-3 text-lg">
            <Landmark className="h-5 w-5 text-primary" /> Coinbase Treasury
          </CardTitle>
          <StatusBadge
            loading={isLoading}
            connected={connected}
            label={data?.status}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <PanelSkeleton />
        ) : isError || !data ? (
          <Degraded message="Coinbase treasury is temporarily unavailable" />
        ) : data.status !== "connected" ? (
          <Degraded message={data.reason} />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric
                label="Total value"
                value={formatMoney(data.balances.total, data.portfolio.currency)}
              />
              <Metric
                label="Cash equivalent"
                value={formatMoney(
                  data.balances.cashEquivalent,
                  data.portfolio.currency
                )}
              />
              <Metric
                label="Crypto"
                value={formatMoney(data.balances.crypto, data.portfolio.currency)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline">{data.portfolio.name}</Badge>
              <span>{data.portfolio.type}</span>
              <span>Checked {new Date(data.checkedAt).toLocaleTimeString()}</span>
            </div>
            {data.positions.length === 0 ? (
              <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                This portfolio currently has no positions.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">GBP value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.positions.map(position => (
                    <TableRow key={position.asset}>
                      <TableCell className="font-medium">
                        {position.asset}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {position.crypto.toLocaleString("en-GB", {
                          maximumFractionDigits: 8,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(position.fiat, data.portfolio.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StripePanel({
  data,
  isLoading,
  isError,
  productCount,
  orderCount,
  subscriptionStatus,
  dataDegraded,
}: {
  data?: StripeStatusData;
  isLoading: boolean;
  isError: boolean;
  productCount?: number;
  orderCount?: number;
  subscriptionStatus: string | null;
  dataDegraded: boolean;
}) {
  const connected = data?.status === "connected";

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="flex items-center gap-3 text-lg">
            <Radio className="h-5 w-5 text-primary" /> Stripe Payments
          </CardTitle>
          <StatusBadge
            loading={isLoading}
            connected={connected}
            label={data?.status}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <PanelSkeleton />
        ) : isError || !data ? (
          <Degraded message="Stripe account status is temporarily unavailable" />
        ) : data.status !== "connected" ? (
          <Degraded message={data.reason} />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric label="Mode" value={data.mode.toUpperCase()} />
              <Metric
                label="Charges"
                value={data.chargesEnabled ? "ENABLED" : "DISABLED"}
              />
              <Metric
                label="Webhook"
                value={data.webhookConfigured ? "CONFIGURED" : "MISSING"}
              />
            </div>
            <div className="divide-y divide-border/60 border-y border-border/60">
              <InfoRow label="Payouts" ready={data.payoutsEnabled} />
              <InfoRow label="Account details" ready={data.detailsSubmitted} />
              <InfoRow label="Checkout server" ready={data.checkoutConfigured} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric label="Products" value={productCount ?? "—"} />
              <Metric label="Orders" value={orderCount ?? "—"} />
              <Metric
                label="Subscription"
                value={subscriptionStatus?.toUpperCase() ?? "NONE"}
              />
            </div>
            {dataDegraded && (
              <p className="text-xs leading-5 text-chart-3">
                Stripe is connected, but OSIRIS could not read all local payment
                records. This does not prove that checkout settlement failed.
              </p>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              Connection readiness does not prove settlement. Final verification
              requires a Stripe test-mode checkout and signed webhook delivery.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  loading,
  connected,
  label,
}: {
  loading: boolean;
  connected: boolean;
  label?: string;
}) {
  return (
    <Badge
      className={
        connected
          ? "bg-chart-1/15 text-chart-1"
          : "bg-chart-3/15 text-chart-3"
      }
    >
      {loading ? "CHECKING" : connected ? "CONNECTED" : label?.toUpperCase() ?? "DEGRADED"}
    </Badge>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function Degraded({ message }: { message: string }) {
  return (
    <div className="border border-chart-3/30 bg-chart-3/[0.05] p-5">
      <AlertTriangle className="h-5 w-5 text-chart-3" />
      <p className="mt-3 text-sm text-foreground">Action required</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border/60 bg-background/35 p-4">
      <p className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
        {label.toUpperCase()}
      </p>
      <p className="mt-2 text-lg font-medium text-foreground">{value}</p>
    </div>
  );
}

function InfoRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          ready
            ? "flex items-center gap-2 text-chart-1"
            : "flex items-center gap-2 text-chart-3"
        }
      >
        {ready ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        {ready ? "READY" : "ACTION REQUIRED"}
      </span>
    </div>
  );
}
