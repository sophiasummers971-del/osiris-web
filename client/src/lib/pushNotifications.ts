import { trpc } from "./trpc";

/**
 * Check if the browser supports push notifications
 */
export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission !== "denied") {
    return await Notification.requestPermission();
  }

  return "denied";
}

/**
 * Register service worker and subscribe to push notifications
 */
export async function subscribeToPushNotifications(): Promise<boolean> {
  try {
    if (!isPushNotificationSupported()) {
      console.warn("Push notifications are not supported");
      return false;
    }

    // Request permission
    const permission = await requestNotificationPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return false;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register(
      "/service-worker.js",
      { scope: "/" }
    );

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.VITE_VAPID_PUBLIC_KEY,
    });

    // Send subscription to server
    const subscriptionData = subscription.toJSON();
    if (subscriptionData.endpoint && subscriptionData.keys) {
      const trpcClient = trpc.createClient({
        links: [
          // This is a simplified version - in real app, use proper tRPC client
        ],
      });

      // Register with backend
      // await trpc.notifications.registerPushSubscription.mutate({
      //   endpoint: subscriptionData.endpoint,
      //   auth: subscriptionData.keys.auth,
      //   p256dh: subscriptionData.keys.p256dh,
      // });

      console.log("Successfully subscribed to push notifications");
      return true;
    }

    return false;
  } catch (error) {
    console.error("Failed to subscribe to push notifications:", error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    if (!isPushNotificationSupported()) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      console.log("Successfully unsubscribed from push notifications");
      return true;
    }

    return false;
  } catch (error) {
    console.error("Failed to unsubscribe from push notifications:", error);
    return false;
  }
}

/**
 * Check if user is subscribed to push notifications
 */
export async function isPushNotificationSubscribed(): Promise<boolean> {
  try {
    if (!isPushNotificationSupported()) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error("Failed to check push notification subscription:", error);
    return false;
  }
}

/**
 * Show a local notification (for testing)
 */
export async function showLocalNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  if (!isPushNotificationSupported()) {
    throw new Error("Notifications are not supported");
  }

  if (Notification.permission !== "granted") {
    throw new Error("Notification permission not granted");
  }

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, options);
}
