import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export function CheckoutSuccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setTimeout(() => {
      setLocation("/supporters");
    }, 5000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Payment Successful!</h1>
          <p className="text-muted-foreground">
            Thank you for your purchase. You'll be redirected to your account shortly.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => setLocation("/supporters")}
            className="w-full"
            size="lg"
          >
            Go to Supporters Page
          </Button>
          
          <Button
            onClick={() => setLocation("/")}
            variant="outline"
            className="w-full"
            size="lg"
          >
            Return Home
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Redirecting in 5 seconds...
        </p>
      </div>
    </div>
  );
}
