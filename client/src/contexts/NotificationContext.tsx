import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

export type NotificationType = "success" | "error" | "warning" | "info";
export type DisplayLocation = "toast" | "banner" | "center";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  displayLocation: DisplayLocation;
  duration?: number;
  actionUrl?: string;
  actionLabel?: string;
  timestamp: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp">
  ) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp">) => {
      const id = `notification-${Date.now()}-${Math.random()}`;
      const newNotification: Notification = {
        ...notification,
        id,
        timestamp: Date.now(),
      };

      setNotifications(prev => [...prev, newNotification]);

      // Auto-remove toast notifications after duration
      if (
        notification.displayLocation === "toast" &&
        notification.duration !== undefined
      ) {
        setTimeout(() => {
          removeNotification(id);
        }, notification.duration);
      }

      return id;
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        clearNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
}
