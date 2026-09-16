import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import Navigation from "./components/Navigation";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { ToastContainer } from "./components/NotificationToast";
import { BannerContainer } from "./components/NotificationBanner";

const About = lazy(() => import("./pages/About"));
const Auth = lazy(() => import("./pages/Auth"));
const EvidenceVault = lazy(() => import("./pages/EvidenceVault"));
const GitHubCallback = lazy(() => import("./pages/GitHubCallback"));
const Home = lazy(() => import("./pages/Home"));
const NotificationCenter = lazy(() => import("./pages/NotificationCenter"));
const SecurityCenter = lazy(() => import("./pages/SecurityCenter"));
const SupporterHub = lazy(() => import("./pages/SupporterHub"));
const Tools = lazy(() => import("./pages/Tools"));

function PageLoadingFallback() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-background px-4 pt-16 text-muted-foreground"
    >
      Loading OSIRIS workspace…
    </main>
  );
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tools" component={Tools} />
      <Route path="/security" component={SecurityCenter} />
      <Route path="/vault" component={EvidenceVault} />
      <Route path="/auth" component={Auth} />
      <Route path="/integrations/github/callback" component={GitHubCallback} />
      <Route path="/about" component={About} />
      <Route path="/supporters" component={SupporterHub} />
      <Route path="/notifications" component={NotificationCenter} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <NotificationProvider>
          <TooltipProvider>
            <Toaster />
            <BannerContainer />
            <Navigation />
            <Suspense fallback={<PageLoadingFallback />}>
              <Router />
            </Suspense>
            <ToastContainer />
            <Analytics />
            <SpeedInsights />
          </TooltipProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
