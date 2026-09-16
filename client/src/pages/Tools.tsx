import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  User,
  Globe,
  Server,
  Shield,
  Zap,
  Search,
  FileText,
  Phone,
  Lock,
  Eye,
  Database,
  Github,
} from "lucide-react";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  describeMonitoringError,
  formatMonitoringTimestamp,
} from "@/lib/monitoring-status";

const TOOLS_DETAILED = [
  {
    name: "search_email",
    icon: Mail,
    method: "holehe",
    status: "active",
    description: "Enumerate online services linked to an email address",
    usage: "$ openosint email target@example.com -t 60",
    output:
      "[+] Spotify        https://open.spotify.com/user/target\n[+] WordPress      https://wordpress.com/target\n[+] Gravatar       https://gravatar.com/target\n[+] Office365      email used",
  },
  {
    name: "search_username",
    icon: User,
    method: "sherlock",
    status: "active",
    description: "Search for username across 300+ platforms",
    usage: "$ openosint username johndoe99",
    output:
      "[+] GitHub         https://github.com/johndoe99\n[+] Twitter        https://twitter.com/johndoe99\n[+] Reddit         https://reddit.com/user/johndoe99",
  },
  {
    name: "search_breach",
    icon: Shield,
    method: "HaveIBeenPwned API",
    status: "api_required",
    description: "Check data breach exposure for email addresses",
    usage: "$ openosint breach target@example.com",
    output:
      "[+] LinkedIn (2016-05-05) — leaked: Email addresses, Passwords\n[+] Adobe (2013-10-04) — leaked: Email addresses, Password hints",
    requires: "HIBP_API_KEY",
  },
  {
    name: "search_whois",
    icon: Globe,
    method: "python-whois",
    status: "active",
    description: "Retrieve WHOIS registration data for domains",
    usage: "$ openosint whois example.com",
    output:
      "[+] Registrar: ICANN\n[+] Created: 1995-08-14\n[+] Expires: 2024-08-13\n[+] Name Servers: A.IANA-SERVERS.NET",
  },
  {
    name: "search_ip",
    icon: Server,
    method: "ipinfo.io",
    status: "active",
    description: "Retrieve geolocation and ASN data for IP addresses",
    usage: "$ openosint ip 8.8.8.8",
    output:
      "[+] Hostname: dns.google\n[+] Org: AS15169 Google LLC\n[+] City: Mountain View, CA, US",
  },
  {
    name: "search_domain",
    icon: Globe,
    method: "sublist3r",
    status: "active",
    description: "Enumerate subdomains for a target domain",
    usage: "$ openosint domain example.com",
    output: "[+] mail.example.com\n[+] dev.example.com\n[+] api.example.com",
  },
  {
    name: "generate_dorks",
    icon: Search,
    method: "built-in",
    status: "active",
    description: "Generate 12 targeted Google dork URLs for any target",
    usage: "$ openosint dorks johndoe",
    output:
      '[+] "johndoe" site:linkedin.com\n    https://www.google.com/search?q=%22johndoe%22+site%3Alinkedin.com\n[+] "johndoe" leaked OR breach OR dump',
  },
  {
    name: "search_paste",
    icon: FileText,
    method: "psbdmp.ws",
    status: "active",
    description: "Search Pastebin dumps for mentions of a target",
    usage: "$ openosint paste target@example.com",
    output:
      "[+] https://pastebin.com/aB1cD2eF (2023-04-12)\n[+] https://pastebin.com/xY3zA4bC (2022-11-08)",
  },
  {
    name: "search_phone",
    icon: Phone,
    method: "phoneinfoga",
    status: "active",
    description: "Gather phone intelligence (carrier, country, line type)",
    usage: "$ openosint phone +14155552671",
    output:
      "[+] Country: United States\n[+] Carrier: AT&T\n[+] Line type: Mobile",
  },
  {
    name: "search_shodan",
    icon: Eye,
    method: "Shodan API",
    status: "api_required",
    description: "Query Shodan for open ports, banners, and CVEs",
    usage: "$ openosint shodan 8.8.8.8",
    output:
      "[+] IP: 8.8.8.8\n[+] Org: Google LLC\n[+] Country: United States\n[+] Open ports: 53, 443",
    requires: "SHODAN_API_KEY",
  },
  {
    name: "search_virustotal",
    icon: Zap,
    method: "VirusTotal API",
    status: "api_required",
    description: "Check IP, domain, URL, or hash against 70+ antivirus engines",
    usage: "$ openosint virustotal 8.8.8.8",
    output:
      "[VirusTotal] Type: ip\n[VirusTotal] Country: US\n[VirusTotal] Malicious: 0\n[VirusTotal] Harmless: 72",
    requires: "VIRUSTOTAL_API_KEY",
  },
  {
    name: "search_censys",
    icon: Database,
    method: "Censys API",
    status: "api_required",
    description: "Query Censys for internet-facing infrastructure data",
    usage: "$ openosint censys 8.8.8.8",
    output:
      "[+] IP: 8.8.8.8\n[+] Org: Google LLC\n[+] Open ports: 53, 443\n[+] Services: DNS, HTTPS",
    requires: "CENSYS_API_ID, CENSYS_SECRET",
  },
];

export default function Tools() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const connections = trpc.monitoring.listConnections.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });
  const activity = trpc.monitoring.listActivity.useQuery(
    { limit: 8 },
    { enabled: Boolean(user), retry: false }
  );
  const beginGitHub = trpc.monitoring.beginGitHubConnection.useMutation({
    onSuccess: result => window.location.assign(result.authorizationUrl),
  });
  const disconnect = trpc.monitoring.disconnect.useMutation({
    onSuccess: () => utils.monitoring.listConnections.invalidate(),
  });
  const runNow = trpc.monitoring.runNow.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.monitoring.listConnections.invalidate(),
        utils.monitoring.listActivity.invalidate(),
      ]);
    },
  });
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://osirisweb-2gqv98je.manus.space/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Tools",
        item: "https://osirisweb-2gqv98je.manus.space/tools",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background pt-16 text-foreground">
      <Helmet>
        <title>Intelligence Capability Registry — OSIRIS</title>
        <meta
          name="description"
          content="Candidate OSINT capabilities for authorised OSIRIS investigations, including their requirements and sample output."
        />
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      </Helmet>
      {/* Header */}
      <section className="border-b border-border/50 py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <h1 className="mb-4 text-4xl font-bold text-primary">
            Intelligence capability registry
          </h1>
          <p className="text-lg text-muted-foreground">
            Documented investigation capabilities and requirements. A listing
            here does not claim that a connector is currently deployed.
          </p>
        </div>
      </section>

      <section className="border-b border-border/50 py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <Card className="border-border/50 bg-card/60">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Github className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle>GitHub account monitoring</CardTitle>
                  <CardDescription>
                    Detect protected account-profile and two-factor security
                    changes every fifteen minutes.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!user ? (
                <p className="text-sm text-muted-foreground">
                  Sign in to connect a GitHub account.
                </p>
              ) : connections.data?.length ? (
                <div className="space-y-2">
                  {connections.data.map(connection => {
                    const monitoringError = describeMonitoringError(
                      connection.lastErrorCode
                    );
                    return (
                      <div
                        className="space-y-3 rounded-lg border border-border/50 p-3"
                        key={connection.id}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-mono text-sm">
                            {connection.displayName ??
                              connection.providerAccountId}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              {connection.status}
                            </Badge>
                            {connection.status === "active" && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={runNow.isPending}
                                  onClick={() =>
                                    runNow.mutate({
                                      connectionId: connection.id,
                                    })
                                  }
                                >
                                  {runNow.isPending ? "Checking…" : "Check now"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={disconnect.isPending}
                                  onClick={() =>
                                    disconnect.mutate({
                                      connectionId: connection.id,
                                    })
                                  }
                                >
                                  Disconnect
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <div>
                            <dt className="font-medium text-foreground">
                              Last checked
                            </dt>
                            <dd>
                              {formatMonitoringTimestamp(
                                connection.lastCheckedAt
                              )}
                            </dd>
                          </div>
                          {connection.status === "active" && (
                            <div>
                              <dt className="font-medium text-foreground">
                                Next scheduled check
                              </dt>
                              <dd>
                                {formatMonitoringTimestamp(
                                  connection.nextCheckAt
                                )}
                              </dd>
                            </div>
                          )}
                        </dl>
                        {monitoringError && (
                          <p className="text-sm text-destructive" role="alert">
                            {monitoringError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Button
                  disabled={beginGitHub.isPending}
                  onClick={() => beginGitHub.mutate()}
                >
                  <Github className="mr-2 h-4 w-4" />
                  {beginGitHub.isPending ? "Preparing…" : "Connect GitHub"}
                </Button>
              )}
              {beginGitHub.error && (
                <p className="text-sm text-destructive">
                  {beginGitHub.error.message}
                </p>
              )}
              {disconnect.error && (
                <p className="text-sm text-destructive">
                  {disconnect.error.message}
                </p>
              )}
              {runNow.data && (
                <p className="text-sm text-muted-foreground">
                  Check complete: {runNow.data.processed} processed,{" "}
                  {runNow.data.failed} failed.
                </p>
              )}
              {runNow.error && (
                <p className="text-sm text-destructive">
                  {runNow.error.message}
                </p>
              )}
              {user && activity.data && (
                <div className="space-y-4 border-t border-border/50 pt-4">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Recent monitoring activity
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Latest account checks and security-relevant changes.
                    </p>
                  </div>
                  {activity.data.runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No monitoring checks have run yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activity.data.runs.map(run => (
                        <div
                          className="flex flex-col gap-2 rounded-lg border border-border/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                          key={run.id}
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              GitHub account check
                            </p>
                            <p className="text-muted-foreground">
                              {formatMonitoringTimestamp(
                                run.finishedAt ?? run.startedAt
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {run.observationCount > 0 && (
                              <Badge variant="outline">
                                {run.observationCount} change
                                {run.observationCount === 1 ? "" : "s"}
                              </Badge>
                            )}
                            <Badge
                              variant={
                                run.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {run.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {activity.data.observations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        Detected changes
                      </h4>
                      {activity.data.observations.map(observation => (
                        <div
                          className="flex flex-col gap-2 rounded-lg border border-border/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                          key={observation.id}
                        >
                          <div>
                            <p className="font-mono font-medium text-foreground">
                              {observation.signal}
                            </p>
                            <p className="text-muted-foreground">
                              {observation.category} ·{" "}
                              {formatMonitoringTimestamp(
                                observation.observedAt
                              )}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {observation.severity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activity.error && (
                <p className="text-sm text-destructive">
                  Monitoring history is temporarily unavailable.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="space-y-8">
            {TOOLS_DETAILED.map((tool, idx) => {
              const Icon = tool.icon;
              const statusColor =
                tool.status === "active"
                  ? "bg-chart-1/20 text-chart-1"
                  : "bg-chart-3/20 text-chart-3";

              return (
                <Card
                  key={idx}
                  className="bg-card/50 border-border/50 overflow-hidden"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <Icon className="h-6 w-6 text-primary mt-1" />
                        <div>
                          <CardTitle className="font-mono text-lg">
                            {tool.name}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            {tool.method}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge className={statusColor} variant="secondary">
                        {tool.status === "active"
                          ? "Reference"
                          : "Credential required"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {tool.description}
                    </p>

                    {/* Usage */}
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-foreground">
                        Usage
                      </h4>
                      <pre className="bg-background/50 p-3 rounded-lg overflow-x-auto text-xs font-mono text-chart-1">
                        {tool.usage}
                      </pre>
                    </div>

                    {/* Output */}
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-foreground">
                        Sample Output
                      </h4>
                      <pre className="bg-background/50 p-3 rounded-lg overflow-x-auto text-xs font-mono text-chart-1">
                        {tool.output}
                      </pre>
                    </div>

                    {/* Requirements */}
                    {tool.requires && (
                      <div className="border-t border-border/30 pt-3">
                        <h4 className="mb-2 text-sm font-semibold text-foreground">
                          Requires
                        </h4>
                        <code className="text-xs text-chart-3">
                          {tool.requires}
                        </code>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Environment Variables Reference */}
      <section className="border-t border-border/50 py-20 bg-card/30">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">
            Environment Variables
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                var: "AI",
                desc: "Cloudflare Workers AI binding (required for AI intelligence)",
              },
              {
                var: "HIBP_API_KEY",
                desc: "HaveIBeenPwned API key for breach checking",
              },
              {
                var: "IPINFO_TOKEN",
                desc: "ipinfo.io token for higher rate limits",
              },
              {
                var: "IP2LOCATION_API_KEY",
                desc: "IP2Location API key for enhanced IP intelligence",
              },
              {
                var: "SHODAN_API_KEY",
                desc: "Shodan API key for internet scanning",
              },
              {
                var: "VIRUSTOTAL_API_KEY",
                desc: "VirusTotal API key for malware detection",
              },
              {
                var: "CENSYS_API_ID",
                desc: "Censys API ID for infrastructure data",
              },
              {
                var: "CENSYS_SECRET",
                desc: "Censys API Secret for infrastructure data",
              },
            ].map((item, idx) => (
              <Card key={idx} className="bg-background/50 border-border/50">
                <CardHeader>
                  <CardTitle className="font-mono text-sm text-primary">
                    {item.var}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
