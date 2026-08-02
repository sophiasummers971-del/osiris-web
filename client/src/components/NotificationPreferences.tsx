import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

export function NotificationPreferences() {
  const { data: preferences, isLoading } =
    trpc.notifications.getPreferences.useQuery();
  const updatePreferencesMutation =
    trpc.notifications.updatePreferences.useMutation();

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [emailFrequency, setEmailFrequency] = useState<
    "immediate" | "daily" | "weekly" | "never"
  >("daily");
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [categoryPreferences, setCategoryPreferences] = useState<
    Record<string, boolean>
  >({
    supporter: true,
    content: true,
    system: true,
    admin: true,
  });

  useEffect(() => {
    if (preferences) {
      setEmailEnabled(preferences.emailEnabled);
      setPushEnabled(preferences.pushEnabled);
      setInAppEnabled(preferences.inAppEnabled);
      if (
        preferences.emailFrequency &&
        ["immediate", "daily", "weekly", "never"].includes(
          preferences.emailFrequency
        )
      ) {
        setEmailFrequency(
          preferences.emailFrequency as
            | "immediate"
            | "daily"
            | "weekly"
            | "never"
        );
      }
      setQuietHoursStart(preferences.quietHoursStart || "22:00");
      setQuietHoursEnd(preferences.quietHoursEnd || "08:00");
      if (preferences.categoryPreferences) {
        try {
          setCategoryPreferences(JSON.parse(preferences.categoryPreferences));
        } catch (e) {
          console.error("Failed to parse category preferences", e);
        }
      }
    }
  }, [preferences]);

  const handleSave = async () => {
    try {
      await updatePreferencesMutation.mutateAsync({
        emailEnabled,
        pushEnabled,
        inAppEnabled,
        emailFrequency,
        quietHoursStart,
        quietHoursEnd,
        categoryPreferences: JSON.stringify(categoryPreferences),
      });
      toast.success("Notification preferences saved!");
    } catch (error) {
      console.error("Failed to save preferences:", error);
      toast.error("Failed to save preferences. Please try again.");
    }
  };

  const toggleCategory = (category: string) => {
    setCategoryPreferences(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Channel Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Channels</CardTitle>
          <CardDescription>
            Choose how you want to receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">
                Email Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications via email
              </p>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
          </div>

          {/* Email Frequency */}
          {emailEnabled && (
            <div className="ml-6 space-y-2">
              <Label htmlFor="email-frequency" className="text-sm">
                Email Frequency
              </Label>
              <Select
                value={emailFrequency}
                onValueChange={value =>
                  setEmailFrequency(
                    value as "immediate" | "daily" | "weekly" | "never"
                  )
                }
              >
                <SelectTrigger id="email-frequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="daily">Daily Digest</SelectItem>
                  <SelectItem value="weekly">Weekly Digest</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="border-t pt-4" />

          {/* Push Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">
                Push Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Browser push notifications
              </p>
            </div>
            <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
          </div>

          <div className="border-t pt-4" />

          {/* In-App Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-medium">
                In-App Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Toasts and banners on the website
              </p>
            </div>
            <Switch checked={inAppEnabled} onCheckedChange={setInAppEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Quiet Hours</CardTitle>
          <CardDescription>
            Don't receive notifications during these hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quiet-start" className="text-sm">
                Start Time
              </Label>
              <input
                id="quiet-start"
                type="time"
                value={quietHoursStart}
                onChange={e => setQuietHoursStart(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end" className="text-sm">
                End Time
              </Label>
              <input
                id="quiet-end"
                type="time"
                value={quietHoursEnd}
                onChange={e => setQuietHoursEnd(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Categories</CardTitle>
          <CardDescription>
            Choose which types of notifications you want to receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(categoryPreferences).map(([category, enabled]) => (
            <div key={category} className="flex items-center justify-between">
              <Label className="capitalize text-base font-medium">
                {category} Notifications
              </Label>
              <Switch
                checked={enabled as boolean}
                onCheckedChange={() => toggleCategory(category)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={handleSave}
          disabled={updatePreferencesMutation.isPending}
          className="gap-2"
        >
          {updatePreferencesMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save Preferences
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
