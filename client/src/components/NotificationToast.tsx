import React from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Notification, useNotification } from "@/contexts/NotificationContext";

const typeStyles = {
  success: {
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    icon: CheckCircle,
    iconColor: "text-green-600 dark:text-green-400",
    title: "text-green-900 dark:text-green-100",
    message: "text-green-800 dark:text-green-200",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    icon: AlertCircle,
    iconColor: "text-red-600 dark:text-red-400",
    title: "text-red-900 dark:text-red-100",
    message: "text-red-800 dark:text-red-200",
  },
  warning: {
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    border: "border-yellow-200 dark:border-yellow-800",
    icon: AlertTriangle,
    iconColor: "text-yellow-600 dark:text-yellow-400",
    title: "text-yellow-900 dark:text-yellow-100",
    message: "text-yellow-800 dark:text-yellow-200",
  },
  info: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    icon: Info,
    iconColor: "text-blue-600 dark:text-blue-400",
    title: "text-blue-900 dark:text-blue-100",
    message: "text-blue-800 dark:text-blue-200",
  },
};

function ToastNotification({ notification }: { notification: Notification }) {
  const { removeNotification } = useNotification();
  const style = typeStyles[notification.type];
  const IconComponent = style.icon;

  return (
    <div
      className={`${style.bg} ${style.border} border rounded-lg p-4 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-300`}
      role="alert"
    >
      <div className="flex gap-3">
        <IconComponent className={`${style.iconColor} h-5 w-5 flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <h3 className={`${style.title} font-semibold text-sm`}>
            {notification.title}
          </h3>
          <p className={`${style.message} text-sm mt-1`}>
            {notification.message}
          </p>
          {notification.actionUrl && (
            <a
              href={notification.actionUrl}
              className={`${style.title} text-sm font-medium mt-2 inline-block hover:underline`}
            >
              {notification.actionLabel || "Learn more"}
            </a>
          )}
        </div>
        <button
          onClick={() => removeNotification(notification.id)}
          className={`${style.title} hover:opacity-70 transition-opacity flex-shrink-0`}
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { notifications } = useNotification();
  const toasts = notifications.filter((n) => n.displayLocation === "toast");

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-auto">
      {toasts.map((notification) => (
        <ToastNotification key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
