import { trpc } from "@/lib/trpc";
import { StripeCheckout } from "./StripeCheckout";
import { Loader2 } from "lucide-react";

export function ProductsList() {
  const {
    data: products,
    isLoading,
    error,
  } = trpc.stripe.getProducts.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
        Failed to load products. Please try again later.
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="rounded-lg border border-muted bg-muted/50 p-8 text-center text-muted-foreground">
        No products available at this time.
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {products.map(product => (
        <StripeCheckout
          key={product.id}
          productId={product.id}
          productName={product.name}
          productDescription={product.description || undefined}
          amount={product.amount}
          interval={product.interval}
        />
      ))}
    </div>
  );
}
