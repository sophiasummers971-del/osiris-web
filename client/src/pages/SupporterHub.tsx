import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  Lock,
  Unlock,
  Heart,
  Video,
  BookOpen,
  Gift,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Supporter Hub Page
 * Exclusive content and early access for Ko-Fi supporters
 */

interface ExclusiveContent {
  id: string;
  title: string;
  description: string;
  tier: "coffee" | "patron" | "vip";
  type: "video" | "tutorial" | "resource" | "post";
  icon: React.ReactNode;
  date: string;
  preview: string;
}

export default function SupporterHub() {
  const [selectedTier, setSelectedTier] = useState<
    "all" | "coffee" | "patron" | "vip"
  >("all");
  const [userTier, setUserTier] = useState<
    "none" | "coffee" | "patron" | "vip"
  >("none");

  const exclusiveContent: ExclusiveContent[] = [
    {
      id: "1",
      title: "Behind-the-Scenes AI Art Process",
      description:
        "Watch how I create stunning AI art from concept to final render",
      tier: "patron",
      type: "video",
      icon: <Video className="w-5 h-5" />,
      date: "2026-05-15",
      preview:
        "See the complete workflow, tools, and techniques I use for AI art generation.",
    },
    {
      id: "2",
      title: "Monthly Q&A Recording",
      description: "Exclusive Q&A session with all supporters",
      tier: "patron",
      type: "video",
      icon: <Video className="w-5 h-5" />,
      date: "2026-05-10",
      preview: "Ask anything about AI, content creation, and digital systems.",
    },
    {
      id: "3",
      title: "AI Art Masterclass",
      description: "Step-by-step tutorial on advanced AI art techniques",
      tier: "vip",
      type: "tutorial",
      icon: <BookOpen className="w-5 h-5" />,
      date: "2026-05-08",
      preview:
        "Learn professional techniques for creating gallery-quality AI art.",
    },
    {
      id: "4",
      title: "Custom Request Template",
      description: "Template and guidelines for requesting custom AI work",
      tier: "vip",
      type: "resource",
      icon: <Gift className="w-5 h-5" />,
      date: "2026-05-05",
      preview: "Get exactly what you want with our custom request system.",
    },
    {
      id: "5",
      title: "Early Access: New AI Tools",
      description:
        "First access to new OSINT and AI tools before public release",
      tier: "coffee",
      type: "post",
      icon: <Unlock className="w-5 h-5" />,
      date: "2026-05-01",
      preview: "Be the first to try new tools and features.",
    },
    {
      id: "6",
      title: "Private Resource Library",
      description: "Access to curated AI tools, prompts, and resources",
      tier: "vip",
      type: "resource",
      icon: <BookOpen className="w-5 h-5" />,
      date: "2026-04-28",
      preview: "Exclusive collection of tools, prompts, and workflows.",
    },
  ];

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "coffee":
        return "bg-amber-500/20 text-amber-700 border-amber-500/30";
      case "patron":
        return "bg-purple-500/20 text-purple-700 border-purple-500/30";
      case "vip":
        return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
      default:
        return "bg-gray-500/20 text-gray-700 border-gray-500/30";
    }
  };

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case "coffee":
        return "Coffee Supporter";
      case "patron":
        return "Creator Patron";
      case "vip":
        return "VIP Creator";
      default:
        return "Unknown";
    }
  };

  const canAccess = (contentTier: string) => {
    if (userTier === "none") return false;
    if (userTier === "vip") return true;
    if (
      userTier === "patron" &&
      (contentTier === "patron" || contentTier === "coffee")
    )
      return true;
    if (userTier === "coffee" && contentTier === "coffee") return true;
    return false;
  };

  const filteredContent = exclusiveContent.filter(
    item => selectedTier === "all" || item.tier === selectedTier
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: `${window.location.origin}`,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Supporters",
                item: `${window.location.origin}/supporters`,
              },
            ],
          })}
        </script>
      </Helmet>
      {/* Header */}
      <section className="border-b border-border/50 py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold">Supporter Hub</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Exclusive content, early access, and behind-the-scenes drops for our
            amazing supporters.
          </p>
        </div>
      </section>

      {/* User Status */}
      <section className="border-b border-border/50 py-8 bg-card/30">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold mb-2">Your Status</h2>
              <p className="text-muted-foreground">
                {userTier === "none"
                  ? "Not a supporter yet. Join to unlock exclusive content!"
                  : `You are a ${getTierLabel(userTier)}`}
              </p>
            </div>
            {userTier === "none" && (
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={() =>
                  window.open("https://ko-fi.com/sj_inside", "_blank")
                }
              >
                <Heart className="w-4 h-4 mr-2" />
                Become a Supporter
              </Button>
            )}
          </div>

          {/* Tier Selector (for demo) */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={userTier === "none" ? "default" : "outline"}
              onClick={() => setUserTier("none")}
              size="sm"
            >
              Not Supporter
            </Button>
            <Button
              variant={userTier === "coffee" ? "default" : "outline"}
              onClick={() => setUserTier("coffee")}
              size="sm"
            >
              Coffee Supporter
            </Button>
            <Button
              variant={userTier === "patron" ? "default" : "outline"}
              onClick={() => setUserTier("patron")}
              size="sm"
            >
              Creator Patron
            </Button>
            <Button
              variant={userTier === "vip" ? "default" : "outline"}
              onClick={() => setUserTier("vip")}
              size="sm"
            >
              VIP Creator
            </Button>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12">
        <div className="container mx-auto max-w-6xl px-4">
          {/* Filter */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Exclusive Content</h2>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedTier === "all" ? "default" : "outline"}
                onClick={() => setSelectedTier("all")}
                size="sm"
              >
                All
              </Button>
              <Button
                variant={selectedTier === "coffee" ? "default" : "outline"}
                onClick={() => setSelectedTier("coffee")}
                size="sm"
              >
                Coffee
              </Button>
              <Button
                variant={selectedTier === "patron" ? "default" : "outline"}
                onClick={() => setSelectedTier("patron")}
                size="sm"
              >
                Patron
              </Button>
              <Button
                variant={selectedTier === "vip" ? "default" : "outline"}
                onClick={() => setSelectedTier("vip")}
                size="sm"
              >
                VIP
              </Button>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContent.map(content => (
              <Card
                key={content.id}
                className={`relative border-border/50 ${
                  canAccess(content.tier)
                    ? "bg-card/50"
                    : "bg-card/30 opacity-75"
                }`}
              >
                {!canAccess(content.tier) && (
                  <div className="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center z-10">
                    <Lock className="w-8 h-8 text-white" />
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="text-primary mt-1">{content.icon}</div>
                      <div>
                        <CardTitle className="text-lg">
                          {content.title}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {new Date(content.date).toLocaleDateString()}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={getTierColor(content.tier)}>
                      {getTierLabel(content.tier)}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {content.preview}
                  </p>

                  {canAccess(content.tier) ? (
                    <Button
                      className="w-full bg-primary hover:bg-primary/90"
                      size="sm"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Access Content
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      size="sm"
                      onClick={() =>
                        window.open("https://ko-fi.com/sj_inside", "_blank")
                      }
                    >
                      <Heart className="w-4 h-4 mr-2" />
                      Upgrade to Access
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-border/50 py-12 bg-card/30">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold mb-8">Why Support?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Early Access",
                description: "Get new content and tools before public release",
              },
              {
                title: "Behind-the-Scenes",
                description: "See how AI art and digital systems are created",
              },
              {
                title: "Community",
                description:
                  "Join a supportive community of creators and innovators",
              },
            ].map((benefit, idx) => (
              <Card key={idx} className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg">{benefit.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Products / Services Section */}
      <section className="py-12 border-t border-border/50 bg-card/20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold mb-8">Services & Subscriptions</h2>
          <p className="text-muted-foreground mb-8">
            Support our work directly through one-time purchases or recurring
            subscriptions.
          </p>
          {/* Products will be loaded here */}
          <div className="text-center py-8 text-muted-foreground">
            <p>
              Products coming soon. Configure your offerings in the admin panel.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Support?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join our community and get exclusive access to behind-the-scenes
            content, early releases, and more.
          </p>
          <Button
            size="lg"
            className="bg-primary hover:bg-primary/90"
            onClick={() => window.open("https://ko-fi.com/sj_inside", "_blank")}
          >
            <Heart className="w-5 h-5 mr-2" />
            Support on Ko-Fi
          </Button>
        </div>
      </section>
    </div>
  );
}
