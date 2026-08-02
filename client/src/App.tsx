import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import Navigation from "./components/Navigation";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { ToastContainer } from "./components/NotificationToast";
import { BannerContainer } from "./components/NotificationBanner";
import Home from "./pages/Home";
import Tools from "./pages/Tools";
import About from "./pages/About";
import SupporterHub from "./pages/SupporterHub";
import NotificationCenter from "./pages/NotificationCenter";
import { CheckoutSuccess } from "./pages/CheckoutSuccess";
import { CheckoutCancel } from "./pages/CheckoutCancel";
import SecurityCenter from "./pages/SecurityCenter";
import EvidenceVault from "./pages/EvidenceVault";
import Auth from "./pages/Auth";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tools" component={Tools} />
      <Route path="/security" component={SecurityCenter} />
      <Route path="/vault" component={EvidenceVault} />
      <Route path="/auth" component={Auth} />
      <Route path="/about" component={About} />
      <Route path="/supporters" component={SupporterHub} />
      <Route path="/notifications" component={NotificationCenter} />
      <Route path="/checkout-success" component={CheckoutSuccess} />
      <Route path="/checkout-cancel" component={CheckoutCancel} />
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
            <Router />
            <ToastContainer />
          </TooltipProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
