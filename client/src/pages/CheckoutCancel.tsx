import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export function CheckoutCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-amber-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Payment Cancelled</h1>
          <p className="text-muted-foreground">
            Your payment was cancelled. No charges have been made to your
            account.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => setLocation("/supporters")}
            className="w-full"
            size="lg"
          >
            Try Again
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
      </div>
    </div>
  );
}
