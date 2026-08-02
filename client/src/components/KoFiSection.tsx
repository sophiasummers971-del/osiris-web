import { Heart, Users, Zap, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Ko-Fi Supporter Section Component
 * Displays pricing tiers and calls to action for Ko-Fi support
 */

interface Tier {
  name: string;
  price: string;
  icon: React.ReactNode;
  benefits: string[];
  color: string;
  highlighted?: boolean;
}

export default function KoFiSection() {
  const tiers: Tier[] = [
    {
      name: "Coffee Supporter",
      price: "£3/month",
      icon: <Heart className="w-6 h-6" />,
      benefits: [
        "Supporter Discord access",
        "Monthly thank you post",
        "Exclusive wallpapers",
        "Early access to 1 post/month",
      ],
      color: "from-amber-500 to-orange-600",
    },
    {
      name: "Creator Patron",
      price: "£9.99/month",
      icon: <Users className="w-6 h-6" />,
      benefits: [
        "Everything above, plus:",
        "Early access to ALL content",
        "Monthly live Q&A",
        "Behind-the-scenes videos",
        "Direct message access",
      ],
      color: "from-purple-500 to-pink-600",
      highlighted: true,
    },
    {
      name: "VIP Creator",
      price: "£24.99/month",
      icon: <Zap className="w-6 h-6" />,
      benefits: [
        "Everything above, plus:",
        "Monthly 30-min consultation",
        "Custom AI art requests",
        "Exclusive tutorials",
        "Private resource library",
      ],
      color: "from-yellow-500 to-red-600",
    },
  ];

  return (
    <section className="py-20 bg-card/30 border-t border-border/50">
      <div className="container mx-auto max-w-6xl px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block mb-4 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30">
            <span className="text-sm font-semibold text-primary">
              Support the Creator
            </span>
          </div>
          <h2 className="text-4xl font-bold mb-4 text-foreground">
            Join the Community
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Support AI-driven content, visuals, and digital systems. Get early
            access to experiments, behind-the-scenes drops, and exclusive ideas.
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {tiers.map((tier, idx) => (
            <div
              key={idx}
              className={`rounded-lg border transition-all ${
                tier.highlighted
                  ? "border-primary/50 shadow-lg scale-105 bg-gradient-to-br " +
                    tier.color
                  : "border-border/50 bg-card/50"
              }`}
            >
              {/* Highlight Badge */}
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold">
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className="p-8">
                {/* Icon */}
                <div
                  className={`mb-4 ${tier.highlighted ? "text-white" : "text-primary"}`}
                >
                  {tier.icon}
                </div>

                {/* Tier Name */}
                <h3
                  className={`text-2xl font-bold mb-2 ${tier.highlighted ? "text-white" : "text-foreground"}`}
                >
                  {tier.name}
                </h3>

                {/* Price */}
                <div
                  className={`text-3xl font-bold mb-6 ${tier.highlighted ? "text-white" : "text-primary"}`}
                >
                  {tier.price}
                </div>

                {/* Benefits */}
                <ul className="space-y-3 mb-8">
                  {tier.benefits.map((benefit, bidx) => (
                    <li
                      key={bidx}
                      className={`flex items-start gap-3 text-sm ${
                        tier.highlighted
                          ? "text-white/90"
                          : "text-muted-foreground"
                      }`}
                    >
                      <Gift className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  className={`w-full ${
                    tier.highlighted
                      ? "bg-white text-primary hover:bg-white/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                  onClick={() =>
                    window.open("https://ko-fi.com/sj_inside", "_blank")
                  }
                >
                  Support on Ko-Fi
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* One-Time Option */}
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Or send a one-time tip:</p>
          <Button
            variant="outline"
            className="border-primary/50 text-primary hover:bg-primary/10"
            onClick={() => window.open("https://ko-fi.com/sj_inside", "_blank")}
          >
            Buy a Coffee (£5)
          </Button>
        </div>
      </div>
    </section>
  );
}
