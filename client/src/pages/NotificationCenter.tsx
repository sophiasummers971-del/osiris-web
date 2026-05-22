import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotifications } from "@/hooks/useNotifications";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  Settings,
  Bell,
  Mail,
  Smartphone,
} from "lucide-react";
import { useState } from "react";

const typeIcons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const typeColors = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  info: "text-blue-600 dark:text-blue-400",
};

export default function NotificationCenter() {
  const { user, loading: authLoading } = useAuth();
  const { notifications, markAsRead, dismiss } = useNotifications();
  const [activeTab, setActiveTab] = useState("all");

  const preferencesQuery = trpc.notifications.getPreferences.useQuery();
  const updatePreferencesMutation = trpc.notifications.updatePreferences.useMutation();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-4">Please log in to view notifications</p>
          <Button>Log In</Button>
        </div>
      </div>
    );
  }

  const handleTogglePreference = async (key: string, value: boolean) => {
    try {
      await updatePreferencesMutation.mutateAsync({
        [key]: value,
      });
    } catch (error) {
      console.error("Failed to update preference:", error);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "unread") return n.inAppStatus === "pending";
    if (activeTab === "read") return n.inAppStatus === "read";
    return true;
  });

  return (
    <div className="min-h-screen bg-background pt-20 pb-12">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Notification Center</h1>
          <p className="text-muted-foreground">
            Manage your notifications and notification preferences
          </p>
        </div>

        <Tabs defaultValue="notifications" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-card/50 border-border/50">
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6 space-y-4">
            {notifications.length === 0 ? (
              <Card className="bg-card/50 border-border/50">
                <CardContent className="pt-6 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No notifications yet</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  <Button
                    variant={activeTab === "all" ? "default" : "outline"}
                    onClick={() => setActiveTab("all")}
                    size="sm"
                  >
                    All
                  </Button>
                  <Button
                    variant={activeTab === "unread" ? "default" : "outline"}
                    onClick={() => setActiveTab("unread")}
                    size="sm"
                  >
                    Unread
                  </Button>
                  <Button
                    variant={activeTab === "read" ? "default" : "outline"}
                    onClick={() => setActiveTab("read")}
                    size="sm"
                  >
                    Read
                  </Button>
                </div>

                {filteredNotifications.map((notification) => {
                  const IconComponent = typeIcons[notification.type];
                  return (
                    <Card
                      key={notification.id}
                      className={`bg-card/50 border-border/50 cursor-pointer transition-all hover:shadow-md ${
                        notification.inAppStatus === "pending"
                          ? "border-primary/50"
                          : ""
                      }`}
                      onClick={() => {
                        if (notification.inAppStatus === "pending") {
                          markAsRead(notification.id);
                        }
                      }}
                    >
                      <CardContent className="pt-6">
                        <div className="flex gap-4">
                          <IconComponent
                            className={`${typeColors[notification.type]} h-6 w-6 flex-shrink-0 mt-1`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-semibold text-foreground">
                                  {notification.title}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {notification.message}
                                </p>
                              </div>
                              <div className="flex-shrink-0 flex gap-2">
                                {notification.inAppStatus === "pending" && (
                                  <span className="inline-block w-2 h-2 bg-primary rounded-full mt-2" />
                                )}
                              </div>
                            </div>
                            {notification.actionUrl && (
                              <a
                                href={notification.actionUrl}
                                className="text-sm text-primary hover:underline mt-2 inline-block"
                              >
                                {notification.actionLabel || "Learn more"}
                              </a>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismiss(notification.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="mt-6 space-y-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Notification Channels</CardTitle>
                <CardDescription>
                  Choose how you want to receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-semibold text-foreground">In-App Notifications</p>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications within the app
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferencesQuery.data?.inAppEnabled ?? true}
                    onChange={(e) =>
                      handleTogglePreference("inAppEnabled", e.target.checked)
                    }
                    className="w-5 h-5"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-semibold text-foreground">Email Notifications</p>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications via email
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferencesQuery.data?.emailEnabled ?? true}
                    onChange={(e) =>
                      handleTogglePreference("emailEnabled", e.target.checked)
                    }
                    className="w-5 h-5"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="font-semibold text-foreground">Push Notifications</p>
                      <p className="text-sm text-muted-foreground">
                        Receive browser push notifications
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferencesQuery.data?.pushEnabled ?? true}
                    onChange={(e) =>
                      handleTogglePreference("pushEnabled", e.target.checked)
                    }
                    className="w-5 h-5"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Email Frequency</CardTitle>
                <CardDescription>
                  How often do you want to receive email digests?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {["immediate", "daily", "weekly", "never"].map((freq) => (
                  <label key={freq} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-background/50 rounded">
                  <input
                    type="radio"
                    name="emailFrequency"
                    value={freq}
                    checked={preferencesQuery.data?.emailFrequency === freq}
                    onChange={(e) =>
                      updatePreferencesMutation.mutate({
                        emailFrequency: e.target.value as "immediate" | "daily" | "weekly" | "never",
                      })
                    }
                    className="w-4 h-4"
                  />
                    <span className="capitalize text-foreground">
                      {freq === "never" ? "Never" : `${freq.charAt(0).toUpperCase() + freq.slice(1)}`}
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
