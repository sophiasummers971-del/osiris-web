import { useEffect } from "react";
import {
  useNotification,
  type NotificationType,
  type DisplayLocation,
} from "@/contexts/NotificationContext";
import { trpc } from "@/lib/trpc";

/**
 * Hook to manage notifications with tRPC integration
 */
export function useNotifications() {
  const { addNotification } = useNotification();
  const { data: unreadCount } = trpc.notifications.getUnreadCount.useQuery(
    undefined,
    { refetchInterval: 30000 } // Refetch every 30 seconds
  );

  const { data: notifications } = trpc.notifications.getNotifications.useQuery(
    { limit: 50, offset: 0 },
    { refetchInterval: 30000 }
  );

  const markAsReadMutation = trpc.notifications.markAsRead.useMutation();
  const dismissMutation = trpc.notifications.dismiss.useMutation();

  // Show a toast when new notifications arrive
  useEffect(() => {
    if (unreadCount && unreadCount.count > 0) {
      // You can add logic here to show a "new notifications" badge
    }
  }, [unreadCount?.count]);

  const showNotification = (
    title: string,
    message: string,
    type: NotificationType = "info",
    options?: {
      duration?: number;
      displayLocation?: DisplayLocation;
      actionUrl?: string;
      actionLabel?: string;
    }
  ) => {
    return addNotification({
      title,
      message,
      type,
      displayLocation: options?.displayLocation || "toast",
      duration: options?.duration || 5000,
      actionUrl: options?.actionUrl,
      actionLabel: options?.actionLabel,
    });
  };

  const markAsRead = async (notificationId: number) => {
    try {
      await markAsReadMutation.mutateAsync({ notificationId });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const dismiss = async (notificationId: number) => {
    try {
      await dismissMutation.mutateAsync({ notificationId });
    } catch (error) {
      console.error("Failed to dismiss notification:", error);
    }
  };

  return {
    notifications: notifications?.notifications || [],
    unreadCount: unreadCount?.count || 0,
    showNotification,
    markAsRead,
    dismiss,
    isLoading: !notifications,
  };
}
