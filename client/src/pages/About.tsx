import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Helmet } from "react-helmet";

export default function About() {
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
        "name": "About",
        "item": "https://osirisweb-2gqv98je.manus.space/about"
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>About OpenOSINT - Architecture & Philosophy</title>
        <meta name="description" content="Learn about the architecture, design, and philosophy behind OpenOSINT, the AI-powered OSINT framework." />
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      </Helmet>
      {/* Header */}
      <section className="border-b border-border/50 py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <h1 className="mb-4 text-4xl font-bold text-primary">About OpenOSINT</h1>
          <p className="text-lg text-muted-foreground">
            Learn about the architecture, design, and philosophy behind OpenOSINT.
          </p>
        </div>
      </section>

      {/* Architecture */}
      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">Architecture</h2>
          <div className="space-y-4">
            {[
              {
                layer: "Core Tools",
                path: "openosint/tools/",
                desc: "Async wrappers around external OSINT binaries and APIs. Stateless.",
              },
              {
                layer: "AI Agent",
                path: "openosint/agent.py",
                desc: "Anthropic tool use loop. Maintains conversation history per session.",
              },
              {
                layer: "REPL",
                path: "openosint/repl.py",
                desc: "Interactive terminal session. prompt_toolkit + Rich.",
              },
              {
                layer: "MCP Server",
                path: "openosint/mcp_server.py",
                desc: "MCP tool schema exposure for external AI clients.",
              },
              {
                layer: "CLI",
                path: "openosint/cli.py",
                desc: "Entry point. Launches REPL or direct commands.",
              },
            ].map((item, idx) => (
              <Card key={idx} className="bg-card/50 border-border/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="font-mono text-lg">{item.layer}</CardTitle>
                      <CardDescription className="font-mono text-xs">{item.path}</CardDescription>
                    </div>
                    <Badge className="bg-primary/20 text-primary">Layer {idx + 1}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 p-4 bg-background/50 rounded-lg border border-border/30">
            <p className="text-sm text-muted-foreground">
              <strong>Design Principle:</strong> No layer imports from a layer above it. This ensures clean separation of concerns and allows each layer to be tested and deployed independently.
            </p>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="border-b border-border/50 py-20 bg-card/30">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">Design Philosophy</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                title: "No Hallucination",
                desc: "The AI layer uses Anthropic native tool use API. The model issues hard stops when it needs a tool, your code executes it, and real output goes back. Hallucination in tool results is structurally impossible.",
              },
              {
                title: "Modular Framework",
                desc: "Each tool is independent and stateless. You can use individual tools via CLI, chain them in the REPL, or expose them via MCP to external AI clients.",
              },
              {
                title: "Timeout Enforcement",
                desc: "All external binaries run as managed subprocesses with hard timeout enforcement. No hanging processes, no resource leaks.",
              },
              {
                title: "Local or Cloud",
                desc: "Use Anthropic's Claude for AI reasoning, or run a local Ollama model instead. No API key required when using Ollama.",
              },
            ].map((item, idx) => (
              <Card key={idx} className="bg-background/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Installation Methods */}
      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">Installation Methods</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>From PyPI</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/50 p-3 rounded text-xs font-mono text-chart-1 overflow-x-auto">
{`$ pip install openosint
$ export ANTHROPIC_API_KEY=sk-ant-...
$ openosint`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>From Source</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/50 p-3 rounded text-xs font-mono text-chart-1 overflow-x-auto">
{`$ git clone https://github.com/OpenOSINT/OpenOSINT.git
$ cd OpenOSINT
$ pip install -e .
$ openosint`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>With Docker</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/50 p-3 rounded text-xs font-mono text-chart-1 overflow-x-auto">
{`$ docker-compose up
$ docker exec -it openosint openosint`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>With Ollama (Local)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/50 p-3 rounded text-xs font-mono text-chart-1 overflow-x-auto">
{`$ ollama pull llama3.2
$ pip install ollama
$ openosint --provider ollama`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* External Dependencies */}
      <section className="border-b border-border/50 py-20 bg-card/30">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">External Dependencies</h2>
          <p className="mb-6 text-muted-foreground">
            The following binaries must be present in your PATH. If a binary is absent, the corresponding tool returns a descriptive error. All other tools remain operational.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { binary: "holehe", purpose: "Email account enumeration", install: "pip install holehe" },
              { binary: "sherlock", purpose: "Username enumeration (300+ platforms)", install: "pip install sherlock-project" },
              { binary: "sublist3r", purpose: "Subdomain enumeration", install: "pip install sublist3r" },
              { binary: "phoneinfoga", purpose: "Phone number intelligence", install: "Download binary from GitHub" },
            ].map((dep, idx) => (
              <Card key={idx} className="bg-background/50 border-border/50">
                <CardHeader>
                  <CardTitle className="font-mono text-sm">{dep.binary}</CardTitle>
                  <CardDescription>{dep.purpose}</CardDescription>
                </CardHeader>
                <CardContent>
                  <code className="text-xs text-chart-1">{dep.install}</code>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Legal */}
      <section className="py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">Legal & Licensing</h2>
          <div className="space-y-6">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>License</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  OpenOSINT is licensed under the MIT License. You are free to use, modify, and distribute this software for any purpose.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50 border-chart-3/50">
              <CardHeader>
                <CardTitle className="text-chart-3">Legal Disclaimer</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  OpenOSINT is intended for <strong>legal and authorized use only</strong>. Users are solely responsible for ensuring their use complies with all applicable laws. The authors accept no liability for misuse.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Sponsorship</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  OpenOSINT is sponsored by <a href="https://www.ip2location.com" className="text-primary hover:underline">IP2Location</a>. A Security Plan API key is provided free of charge for the IP2Location integration.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
