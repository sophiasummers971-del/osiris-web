import React from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Notification, useNotification } from "@/contexts/NotificationContext";

const bannerStyles = {
  success: "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100",
  error: "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100",
  warning: "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700 text-yellow-900 dark:text-yellow-100",
  info: "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100",
};

const iconStyles = {
  success: { icon: CheckCircle, color: "text-green-600 dark:text-green-400" },
  error: { icon: AlertCircle, color: "text-red-600 dark:text-red-400" },
  warning: { icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400" },
  info: { icon: Info, color: "text-blue-600 dark:text-blue-400" },
};

function BannerNotification({ notification }: { notification: Notification }) {
  const { removeNotification } = useNotification();
  const { icon: IconComponent, color } = iconStyles[notification.type];

  return (
    <div
      className={`${bannerStyles[notification.type]} border-l-4 px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <IconComponent className={`${color} h-5 w-5 flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{notification.title}</h3>
          <p className="text-sm mt-1 opacity-90">{notification.message}</p>
          {notification.actionUrl && (
            <a
              href={notification.actionUrl}
              className="text-sm font-medium mt-2 inline-block hover:underline"
            >
              {notification.actionLabel || "Learn more"}
            </a>
          )}
        </div>
        <button
          onClick={() => removeNotification(notification.id)}
          className="flex-shrink-0 hover:opacity-70 transition-opacity"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function BannerContainer() {
  const { notifications } = useNotification();
  const banners = notifications.filter((n) => n.displayLocation === "banner");

  if (banners.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex flex-col gap-0 pointer-events-auto">
      {banners.map((notification) => (
        <BannerNotification key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
