import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, User, Globe, Server, Shield, Zap, Search, FileText, Phone, Lock, Eye, Database } from "lucide-react";
import { Helmet } from "react-helmet";

const TOOLS_DETAILED = [
  {
    name: "search_email",
    icon: Mail,
    method: "holehe",
    status: "active",
    description: "Enumerate online services linked to an email address",
    usage: "$ openosint email target@example.com -t 60",
    output: "[+] Spotify        https://open.spotify.com/user/target\n[+] WordPress      https://wordpress.com/target\n[+] Gravatar       https://gravatar.com/target\n[+] Office365      email used",
  },
  {
    name: "search_username",
    icon: User,
    method: "sherlock",
    status: "active",
    description: "Search for username across 300+ platforms",
    usage: "$ openosint username johndoe99",
    output: "[+] GitHub         https://github.com/johndoe99\n[+] Twitter        https://twitter.com/johndoe99\n[+] Reddit         https://reddit.com/user/johndoe99",
  },
  {
    name: "search_breach",
    icon: Shield,
    method: "HaveIBeenPwned API",
    status: "api_required",
    description: "Check data breach exposure for email addresses",
    usage: "$ openosint breach target@example.com",
    output: "[+] LinkedIn (2016-05-05) — leaked: Email addresses, Passwords\n[+] Adobe (2013-10-04) — leaked: Email addresses, Password hints",
    requires: "HIBP_API_KEY",
  },
  {
    name: "search_whois",
    icon: Globe,
    method: "python-whois",
    status: "active",
    description: "Retrieve WHOIS registration data for domains",
    usage: "$ openosint whois example.com",
    output: "[+] Registrar: ICANN\n[+] Created: 1995-08-14\n[+] Expires: 2024-08-13\n[+] Name Servers: A.IANA-SERVERS.NET",
  },
  {
    name: "search_ip",
    icon: Server,
    method: "ipinfo.io",
    status: "active",
    description: "Retrieve geolocation and ASN data for IP addresses",
    usage: "$ openosint ip 8.8.8.8",
    output: "[+] Hostname: dns.google\n[+] Org: AS15169 Google LLC\n[+] City: Mountain View, CA, US",
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
    output: '[+] "johndoe" site:linkedin.com\n    https://www.google.com/search?q=%22johndoe%22+site%3Alinkedin.com\n[+] "johndoe" leaked OR breach OR dump',
  },
  {
    name: "search_paste",
    icon: FileText,
    method: "psbdmp.ws",
    status: "active",
    description: "Search Pastebin dumps for mentions of a target",
    usage: "$ openosint paste target@example.com",
    output: "[+] https://pastebin.com/aB1cD2eF (2023-04-12)\n[+] https://pastebin.com/xY3zA4bC (2022-11-08)",
  },
  {
    name: "search_phone",
    icon: Phone,
    method: "phoneinfoga",
    status: "active",
    description: "Gather phone intelligence (carrier, country, line type)",
    usage: "$ openosint phone +14155552671",
    output: "[+] Country: United States\n[+] Carrier: AT&T\n[+] Line type: Mobile",
  },
  {
    name: "search_shodan",
    icon: Eye,
    method: "Shodan API",
    status: "api_required",
    description: "Query Shodan for open ports, banners, and CVEs",
    usage: "$ openosint shodan 8.8.8.8",
    output: "[+] IP: 8.8.8.8\n[+] Org: Google LLC\n[+] Country: United States\n[+] Open ports: 53, 443",
    requires: "SHODAN_API_KEY",
  },
  {
    name: "search_virustotal",
    icon: Zap,
    method: "VirusTotal API",
    status: "api_required",
    description: "Check IP, domain, URL, or hash against 70+ antivirus engines",
    usage: "$ openosint virustotal 8.8.8.8",
    output: "[VirusTotal] Type: ip\n[VirusTotal] Country: US\n[VirusTotal] Malicious: 0\n[VirusTotal] Harmless: 72",
    requires: "VIRUSTOTAL_API_KEY",
  },
  {
    name: "search_censys",
    icon: Database,
    method: "Censys API",
    status: "api_required",
    description: "Query Censys for internet-facing infrastructure data",
    usage: "$ openosint censys 8.8.8.8",
    output: "[+] IP: 8.8.8.8\n[+] Org: Google LLC\n[+] Open ports: 53, 443\n[+] Services: DNS, HTTPS",
    requires: "CENSYS_API_ID, CENSYS_SECRET",
  },
];

export default function Tools() {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://osirisweb-2gqv98je.manus.space/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Tools",
        "item": "https://osirisweb-2gqv98je.manus.space/tools"
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>OSINT Tools Reference - OpenOSINT</title>
        <meta name="description" content="Complete reference for all 12 integrated OpenOSINT tools including holehe, sherlock, sublist3r, and more with usage examples." />
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      </Helmet>
      {/* Header */}
      <section className="border-b border-border/50 py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <h1 className="mb-4 text-4xl font-bold text-primary">12 Integrated Tools</h1>
          <p className="text-lg text-muted-foreground">
            Complete reference for all OpenOSINT tools with usage examples and output samples.
          </p>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="space-y-8">
            {TOOLS_DETAILED.map((tool, idx) => {
              const Icon = tool.icon;
              const statusColor = tool.status === "active" ? "bg-chart-1/20 text-chart-1" : "bg-chart-3/20 text-chart-3";

              return (
                <Card key={idx} className="bg-card/50 border-border/50 overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <Icon className="h-6 w-6 text-primary mt-1" />
                        <div>
                          <CardTitle className="font-mono text-lg">{tool.name}</CardTitle>
                          <CardDescription className="text-sm">{tool.method}</CardDescription>
                        </div>
                      </div>
                      <Badge className={statusColor} variant="secondary">
                        {tool.status === "active" ? "Active" : "API Key"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{tool.description}</p>

                    {/* Usage */}
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-foreground">Usage</h4>
                      <pre className="bg-background/50 p-3 rounded-lg overflow-x-auto text-xs font-mono text-chart-1">
                        {tool.usage}
                      </pre>
                    </div>

                    {/* Output */}
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-foreground">Sample Output</h4>
                      <pre className="bg-background/50 p-3 rounded-lg overflow-x-auto text-xs font-mono text-chart-1">
                        {tool.output}
                      </pre>
                    </div>

                    {/* Requirements */}
                    {tool.requires && (
                      <div className="border-t border-border/30 pt-3">
                        <h4 className="mb-2 text-sm font-semibold text-foreground">Requires</h4>
                        <code className="text-xs text-chart-3">{tool.requires}</code>
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
          <h2 className="mb-8 text-3xl font-bold text-foreground">Environment Variables</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { var: "ANTHROPIC_API_KEY", desc: "Anthropic API key (required for AI agent)" },
              { var: "HIBP_API_KEY", desc: "HaveIBeenPwned API key for breach checking" },
              { var: "IPINFO_TOKEN", desc: "ipinfo.io token for higher rate limits" },
              { var: "IP2LOCATION_API_KEY", desc: "IP2Location API key for enhanced IP intelligence" },
              { var: "SHODAN_API_KEY", desc: "Shodan API key for internet scanning" },
              { var: "VIRUSTOTAL_API_KEY", desc: "VirusTotal API key for malware detection" },
              { var: "CENSYS_API_ID", desc: "Censys API ID for infrastructure data" },
              { var: "CENSYS_SECRET", desc: "Censys API Secret for infrastructure data" },
            ].map((item, idx) => (
              <Card key={idx} className="bg-background/50 border-border/50">
                <CardHeader>
                  <CardTitle className="font-mono text-sm text-primary">{item.var}</CardTitle>
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
