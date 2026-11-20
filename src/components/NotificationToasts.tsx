import React from "react";
import { Bell, Mail, GraduationCap, Calendar, BookOpen, X } from "lucide-react";
import { getNotificationPermission, isNotificationSupported, requestNotificationPermission } from "../utils/notifications";

export type NotificationCategory = "mail" | "grade" | "schedule" | "moodle";

export interface AppToastNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  onClick?: () => void;
}

interface NotificationToastsProps {
  toasts: AppToastNotification[];
  onDismiss: (id: string) => void;
  permission: NotificationPermission;
  onPermissionChange: (perm: NotificationPermission) => void;
}

const CATEGORY_STYLES: Record<
  NotificationCategory,
  { icon: React.ReactNode; badge: string; border: string }
> = {
  mail: {
    icon: <Mail className="w-4 h-4 text-blue-600" />,
    badge: "bg-blue-50 border-blue-200",
    border: "border-blue-200",
  },
  grade: {
    icon: <GraduationCap className="w-4 h-4 text-amber-600" />,
    badge: "bg-amber-50 border-amber-200",
    border: "border-amber-200",
  },
  schedule: {
    icon: <Calendar className="w-4 h-4 text-sky-600" />,
    badge: "bg-sky-50 border-sky-200",
    border: "border-sky-200",
  },
  moodle: {
    icon: <BookOpen className="w-4 h-4 text-indigo-600" />,
    badge: "bg-indigo-50 border-indigo-200",
    border: "border-indigo-200",
  },
};

export const NotificationToasts: React.FC<NotificationToastsProps> = ({
  toasts,
  onDismiss,
  permission,
  onPermissionChange,
}) => {
  const showPermissionBanner =
    isNotificationSupported() && permission === "default" && getNotificationPermission() === "default";

  if (toasts.length === 0 && !showPermissionBanner) return null;

  const handleEnableNotifications = async () => {
    const res = await requestNotificationPermission();
    onPermissionChange(res);
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
      {showPermissionBanner && (
        <div className="pointer-events-auto bg-white border border-slate-200 rounded-2xl p-3 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">Notifications bureau</p>
              <p className="text-[11px] text-slate-500 truncate">Alertes mails, notes, EDT &amp; devoirs</p>
            </div>
          </div>
          <button
            onClick={handleEnableNotifications}
            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg shrink-0 transition-colors cursor-pointer"
          >
            Activer
          </button>
        </div>
      )}

      {toasts.map((toast) => {
        const style = CATEGORY_STYLES[toast.category];
        return (
          <div
            key={toast.id}
            onClick={() => {
              toast.onClick?.();
              onDismiss(toast.id);
            }}
            className={`pointer-events-auto bg-white border ${style.border} rounded-2xl p-3.5 shadow-lg flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition-colors`}
          >
            <div className={`w-8 h-8 rounded-xl border ${style.badge} flex items-center justify-center shrink-0 mt-0.5`}>
              {style.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{toast.title}</p>
              <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">{toast.body}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(toast.id);
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 shrink-0"
              aria-label="Fermer la notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
