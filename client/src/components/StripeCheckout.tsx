import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface StripeCheckoutProps {
  productId: number;
  productName: string;
  productDescription?: string;
  amount: string;
  interval: string;
}

export function StripeCheckout({
  productId,
  productName,
  productDescription,
  amount,
  interval,
}: StripeCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false);
  const createCheckoutMutation =
    trpc.stripe.createCheckoutSession.useMutation();

  const handleCheckout = async () => {
    setIsLoading(true);
    try {
      const successUrl = `${window.location.origin}/checkout-success`;
      const cancelUrl = `${window.location.origin}/checkout-cancel`;

      const result = await createCheckoutMutation.mutateAsync({
        productId,
        successUrl,
        cancelUrl,
      });

      if (result.sessionUrl) {
        window.open(result.sessionUrl, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to create checkout session. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const displayAmount = `$${parseFloat(amount).toFixed(2)}`;
  const displayInterval = interval === "one_time" ? "" : `/${interval}`;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{productName}</CardTitle>
        {productDescription && (
          <CardDescription>{productDescription}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-2xl font-bold">
          {displayAmount}
          {displayInterval && (
            <span className="text-sm font-normal text-muted-foreground">
              {displayInterval}
            </span>
          )}
        </div>
        <Button
          onClick={handleCheckout}
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Purchase Now"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
