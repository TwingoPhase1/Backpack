import React, { useState, useEffect } from "react";
import { LessonReminder } from "../types";
import { api } from "../services/api";
import {
  BellRing,
  X,
  ArrowRight,
  Clock,
  BookOpen,
  MapPin,
  CheckCircle,
} from "lucide-react";
import {
  requestNotificationPermission,
  sendBrowserNotification,
  getNotificationPermission,
} from "../utils/notifications";

interface EveningReminderBannerProps {
  onOpenResource?: (resourceCode: string) => void;
}

export const EveningReminderBanner: React.FC<EveningReminderBannerProps> = ({
  onOpenResource,
}) => {
  const [reminders, setReminders] = useState<LessonReminder[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission());

  useEffect(() => {
    const fetchReminders = async () => {
      try {
        const res = await api.getLessonReminders();
        const active = res.reminders || [];
        setReminders(active);

        // Envoyer une notification desktop si la permission est accordée
        if (active.length > 0 && getNotificationPermission() === "granted") {
          active.forEach((rem) => {
            const hasNotified = sessionStorage.getItem(`notif_sent_${rem.id}`);
            if (!hasNotified) {
              sendBrowserNotification(
                rem.isEveningBefore
                  ? `🔔 Rappel Révision : Cours de ${rem.resourceCode} demain !`
                  : `📌 Rappel : Cours de ${rem.resourceCode} aujourd'hui !`,
                {
                  body: rem.reminderMessage,
                }
              );
              sessionStorage.setItem(`notif_sent_${rem.id}`, "true");
            }
          });
        }
      } catch (e) {
        console.error("Erreur chargement rappels de leçons", e);
      }
    };

    fetchReminders();
    // Re-vérifier toutes les 15 minutes
    const interval = setInterval(fetchReminders, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEnableDesktopNotifications = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === "granted" && reminders.length > 0) {
      reminders.forEach((rem) => {
        sendBrowserNotification(
          rem.isEveningBefore
            ? `🔔 Rappel Révision : Cours de ${rem.resourceCode} demain !`
            : `📌 Rappel : Cours de ${rem.resourceCode} aujourd'hui !`,
          {
            body: rem.reminderMessage,
          }
        );
      });
    }
  };

  if (dismissed || reminders.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-4 shadow-sm relative overflow-hidden animate-fadeIn">
      {/* Background soft glow */}
      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 mt-0.5 border border-white/20 shadow-xs animate-bounce">
            <BellRing className="w-5 h-5 text-white" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full border border-white/20">
                🔔 Rappel de Révision (Veille de cours)
              </span>
              <span className="text-xs text-amber-100 font-medium">
                {reminders.length} cours programmé{reminders.length > 1 ? "s" : ""} prochainement
              </span>
            </div>

            {/* List of active reminders */}
            <div className="space-y-2 pt-1">
              {reminders.map((rem) => (
                <div
                  key={rem.id}
                  className="bg-black/15 backdrop-blur-xs rounded-xl p-3 border border-white/15 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white text-slate-900 shadow-xs">
                        {rem.resourceCode}
                      </span>
                      <h4 className="text-sm font-bold text-white leading-tight">
                        {rem.lessonTitle}
                      </h4>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-amber-100 flex-wrap">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5 text-amber-200" />
                        {new Date(rem.nextCourseDate).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        à{" "}
                        {new Date(rem.nextCourseDate).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>

                      {rem.nextCourseLocation && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-200" />
                          Salle : {rem.nextCourseLocation}
                        </span>
                      )}
                    </div>
                  </div>

                  {onOpenResource && (
                    <button
                      onClick={() => onOpenResource(rem.resourceCode)}
                      className="px-3 py-1.5 bg-white hover:bg-amber-50 text-slate-900 rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                      <span>Réviser maintenant</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Browser notification permission request button */}
            {permission !== "granted" && (
              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={handleEnableDesktopNotifications}
                  className="text-xs text-white underline hover:text-amber-100 font-semibold inline-flex items-center gap-1"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  Recevoir aussi ces rappels en notifications sur mon ordinateur (bureau)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors shrink-0"
          title="Fermer cette notification pour cette session"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
