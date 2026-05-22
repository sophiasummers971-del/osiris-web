import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import KoFiSection from "@/components/KoFiSection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, User, Globe, Server, Shield, Zap, Github, ExternalLink } from "lucide-react";
import { useState } from "react";

const TOOLS = [
  {
    id: "email",
    name: "search_email",
    icon: Mail,
    method: "holehe",
    description: "Enumerate online services linked to an email address",
    status: "active",
    color: "cyan",
  },
  {
    id: "username",
    name: "search_username",
    icon: User,
    method: "sherlock",
    description: "Search for username across 300+ platforms",
    status: "active",
    color: "lime",
  },
  {
    id: "domain",
    name: "search_domain",
    icon: Globe,
    method: "sublist3r",
    description: "Enumerate subdomains for a target domain",
    status: "active",
    color: "cyan",
  },
  {
    id: "breach",
    name: "search_breach",
    icon: Shield,
    method: "HaveIBeenPwned API",
    description: "Check data breach exposure for email addresses",
    status: "api_required",
    color: "magenta",
  },
  {
    id: "ip",
    name: "search_ip",
    icon: Server,
    method: "ipinfo.io",
    description: "Retrieve geolocation and ASN data for IP addresses",
    status: "active",
    color: "cyan",
  },
  {
    id: "virustotal",
    name: "search_virustotal",
    icon: Zap,
    method: "VirusTotal API",
    description: "Check IP, domain, URL, or hash against 70+ antivirus engines",
    status: "api_required",
    color: "magenta",
  },
];

const FEATURES = [
  {
    title: "Interactive REPL",
    description: "Claude Code-style terminal where AI decides which tools to run and chains them intelligently based on findings.",
  },
  {
    title: "Direct CLI",
    description: "Run individual OSINT tools without AI for scripting or quick lookups.",
  },
  {
    title: "MCP Server",
    description: "Expose all 12 tools to any MCP-compatible AI client (Claude Code, Claude Desktop).",
  },
  {
    title: "Async Architecture",
    description: "Built on Python asyncio with hard timeout enforcement for all external binaries.",
  },
  {
    title: "AI-Powered",
    description: "Uses Anthropic native tool use API or local Ollama models for intelligent investigation.",
  },
  {
    title: "No Hallucination",
    description: "Real tool output goes back to the AI—hallucination in tool results is structurally impossible.",
  },
];

export default function Home() {
  // The userAuth hooks provides authentication state
  // To implement login/logout functionality, simply call logout() or redirect to getLoginUrl()
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32">
        {/* Background Image */}
        <div
          className="absolute inset-0 z-0 opacity-40"
          style={{
            backgroundImage: "url('https://d2xsxph8kpxj0f.cloudfront.net/310519663330074234/2Gqv98JeaGjkNNNZLvxRr8/hero-grid-background-hkggqSHNuFVSDFM6moWyzL.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-background/0 via-background/50 to-background" />

        {/* Content */}
        <div className="container relative z-10 mx-auto max-w-5xl px-4">
          <div className="mb-6 inline-block">
            <Badge className="bg-accent text-accent-foreground border-accent/50">
              AI-Powered OSINT Framework
            </Badge>
          </div>

          <h1 className="mb-6 text-5xl font-bold tracking-tight text-primary">
            OpenOSINT
          </h1>

          <p className="mb-8 max-w-2xl text-lg text-muted-foreground">
            An AI-powered OSINT agent, MCP server, and CLI for Open Source Intelligence. Investigate targets across email, usernames, domains, IPs, and more with intelligent tool chaining.
          </p>

          <div className="flex flex-wrap gap-4">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Github className="mr-2 h-4 w-4" />
              View on GitHub
            </Button>
            <Button size="lg" variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
              <ExternalLink className="mr-2 h-4 w-4" />
              Documentation
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t border-border/50 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-3xl font-bold text-foreground">Key Features</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, idx) => (
              <Card key={idx} className="bg-card/50 border-border/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tools Showcase */}
      <section className="border-t border-border/50 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-3xl font-bold text-foreground">12 Integrated Tools</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isExpanded = expandedTool === tool.id;
              const statusColor = tool.status === "active" ? "bg-chart-1/20 text-chart-1" : "bg-chart-3/20 text-chart-3";

              return (
                <Card
                  key={tool.id}
                  className="cursor-pointer bg-card/50 border-border/50 backdrop-blur transition-all hover:border-primary/50 hover:shadow-lg"
                  onClick={() => setExpandedTool(isExpanded ? null : tool.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 text-primary mt-1" />
                        <div>
                          <CardTitle className="text-base font-mono text-foreground">{tool.name}</CardTitle>
                          <CardDescription className="text-xs text-muted-foreground">{tool.method}</CardDescription>
                        </div>
                      </div>
                      <Badge className={statusColor} variant="secondary">
                        {tool.status === "active" ? "Active" : "API Key"}
                      </Badge>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="border-t border-border/50 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-3xl font-bold text-foreground">Interactive Demo</h2>
          <div className="rounded-lg border border-border/50 bg-card/30 p-8 backdrop-blur">
            <div className="aspect-video bg-background/50 rounded-lg border border-border/30 flex items-center justify-center">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663330074234/2Gqv98JeaGjkNNNZLvxRr8/hero-grid-background-hkggqSHNuFVSDFM6moWyzL.webp"
                alt="Demo"
                className="rounded-lg w-full h-full object-cover"
              />
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Interactive REPL session showing email investigation with breach check and username tracing
            </p>
          </div>
        </div>
      </section>

      {/* Installation Section */}
      <section className="border-t border-border/50 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-3xl font-bold text-foreground">Quick Start</h2>
          <Tabs defaultValue="install" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-card/50 border-border/50">
              <TabsTrigger value="install">Installation</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="config">Configuration</TabsTrigger>
            </TabsList>

            <TabsContent value="install" className="mt-6">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle>Install OpenOSINT</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-background/50 p-4 rounded-lg overflow-x-auto text-sm font-mono text-chart-1">
{`$ git clone https://github.com/OpenOSINT/OpenOSINT.git
$ cd OpenOSINT
$ pip install -e .
$ export ANTHROPIC_API_KEY=sk-ant-...`}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="usage" className="mt-6">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle>Start the Interactive REPL</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-background/50 p-4 rounded-lg overflow-x-auto text-sm font-mono text-chart-1">
{`$ openosint
openosint ❯ investigate target@example.com

  → generate_dorks('target@example.com')
  → search_email('target@example.com')
  ✓ Found: Spotify, WordPress, Gravatar, Office365

  → search_breach('target@example.com')
  ✓ Found in 2 breaches: LinkedIn (2016), Adobe (2013)

  ✓ Report saved → reports/2026-05-11_report.md`}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="config" className="mt-6">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle>Environment Variables</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="font-mono">
                      <span className="text-chart-1">ANTHROPIC_API_KEY</span>
                      <span className="text-muted-foreground"> — Anthropic API key (required)</span>
                    </div>
                    <div className="font-mono">
                      <span className="text-chart-1">HIBP_API_KEY</span>
                      <span className="text-muted-foreground"> — HaveIBeenPwned API key</span>
                    </div>
                    <div className="font-mono">
                      <span className="text-chart-1">SHODAN_API_KEY</span>
                      <span className="text-muted-foreground"> — Shodan API key</span>
                    </div>
                    <div className="font-mono">
                      <span className="text-chart-1">VIRUSTOTAL_API_KEY</span>
                      <span className="text-muted-foreground"> — VirusTotal API key</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Architecture Section */}
      <section className="border-t border-border/50 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-3xl font-bold text-foreground">Architecture</h2>
          <div className="rounded-lg border border-border/50 bg-card/30 p-8 backdrop-blur">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663330074234/2Gqv98JeaGjkNNNZLvxRr8/architecture-diagram-visual-PrEYoBWSX9FWWWatYWxfEM.webp"
              alt="Architecture Diagram"
              className="w-full rounded-lg"
            />
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[
              { layer: "Core Tools", desc: "Async wrappers around OSINT binaries" },
              { layer: "AI Agent", desc: "Anthropic tool use loop" },
              { layer: "REPL", desc: "Interactive terminal session" },
              { layer: "MCP Server", desc: "Tool schema exposure" },
              { layer: "CLI", desc: "Entry point & commands" },
            ].map((item, idx) => (
              <Card key={idx} className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-mono">{item.layer}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Ko-Fi Supporter Section */}
      <KoFiSection />

      {/* CTA Section */}
      <section className="border-t border-border/50 py-20 bg-card/30">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="mb-6 text-3xl font-bold text-foreground">Ready to Investigate?</h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Start using OpenOSINT today. It's free, open-source, and designed for security professionals.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" className="bg-primary hover:bg-primary/90">
              Get Started
            </Button>
            <Button size="lg" variant="outline" className="border-primary/50">
              Read Docs
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12 bg-background/50">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <h3 className="mb-4 font-mono font-bold text-foreground">OpenOSINT</h3>
              <p className="text-sm text-muted-foreground">
                AI-powered OSINT framework for intelligent investigation.
              </p>
            </div>
            <div>
              <h4 className="mb-4 font-mono font-semibold text-foreground">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-primary hover:underline">GitHub</a></li>
                <li><a href="#" className="text-primary hover:underline">Documentation</a></li>
                <li><a href="#" className="text-primary hover:underline">Issues</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-mono font-semibold text-foreground">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="text-primary hover:underline">License (MIT)</a></li>
                <li><a href="#" className="text-primary hover:underline">Disclaimer</a></li>
                <li><a href="#" className="text-primary hover:underline">Sponsors</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-border/30 pt-8 text-center text-sm text-muted-foreground">
            <p>© 2026 OpenOSINT. Sponsored by IP2Location. Licensed under MIT.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
