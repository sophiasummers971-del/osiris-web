import { Link } from "wouter";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Navigation() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <a className="flex items-center gap-2 font-mono font-bold text-lg text-primary hover:text-primary/80 transition">
              <span className="text-xl">◉</span>
              OpenOSINT
            </a>
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/">
              <a className="text-sm text-muted-foreground hover:text-foreground transition">Home</a>
            </Link>
            <Link href="/tools">
              <a className="text-sm text-muted-foreground hover:text-foreground transition">Tools</a>
            </Link>
            <Link href="/about">
              <a className="text-sm text-muted-foreground hover:text-foreground transition">About</a>
            </Link>
            <Link href="/supporters">
              <a className="text-sm text-muted-foreground hover:text-foreground transition">Supporters</a>
            </Link>
            <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition">
              Docs
            </a>
            <Button
              size="sm"
              variant="outline"
              className="border-primary/50 text-primary hover:bg-primary/10"
              asChild
            >
              <a href="https://github.com/OpenOSINT/OpenOSINT" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-4 w-4" />
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
