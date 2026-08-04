import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Bell, Fingerprint, Github, Menu, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const links = [
  ["Command", "/"],
  ["Security", "/security"],
  ["Vault", "/vault"],
  ["Finance", "/finance"],
  ["Intelligence", "/tools"],
  ["Alerts", "/notifications"],
  ["About", "/about"],
] as const;

export default function Navigation() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 font-mono font-bold tracking-[0.16em] text-primary"
        >
          <span className="grid h-8 w-8 place-items-center border border-primary/50 bg-primary/10">
            <ShieldCheck className="h-4 w-4" />
          </span>
          OSIRIS
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 font-mono text-xs tracking-wide transition ${location === href ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="Open OSIRIS repository"
          >
            <a
              href="https://github.com/sophiasummers971-del/osiris-web"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
          {isAuthenticated ? (
            <div className="flex items-center gap-2 border border-chart-1/25 bg-chart-1/[0.06] px-3 py-2 font-mono text-[10px] text-chart-1">
              <span className="h-1.5 w-1.5 rounded-full bg-chart-1" />
              {user?.name || "VERIFIED"}
            </div>
          ) : (
            <Button asChild size="sm" variant="outline">
              <a href={getLoginUrl()}>
                <Fingerprint className="mr-2 h-4 w-4" />
                Authenticate
              </a>
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setOpen(value => !value)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background px-4 py-4 lg:hidden">
          <div className="container flex flex-col gap-1 p-0">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="px-3 py-3 font-mono text-sm text-muted-foreground hover:bg-card hover:text-primary"
              >
                {label}
              </Link>
            ))}
            {!isAuthenticated && (
              <a
                href={getLoginUrl()}
                className="mt-2 px-3 py-3 font-mono text-sm text-primary"
              >
                Authenticate
              </a>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
