import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Resource,
  Note,
  ScheduleEvent,
  SemesterReport,
  DetectedNewGrade,
  SyncStatus,
  ScheduleChangeNotification,
} from "./types";
import { api } from "./services/api";
import { getNotificationPermission, sendBrowserNotification } from "./utils/notifications";
import { NotificationToasts, AppToastNotification } from "./components/NotificationToasts";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./components/LoginPage";
import { AdminModal } from "./components/AdminModal";
import { TermsModal } from "./components/TermsModal";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { ScheduleView } from "./components/ScheduleView";
import { ResourceView } from "./components/ResourceView";
import { GradesView } from "./components/GradesView";
import { NextcloudView } from "./components/NextcloudView";
import { MailView } from "./components/MailView";
import { MoodleView } from "./components/MoodleView";
import { ResourceModal } from "./components/ResourceModal";
import { AccountModal } from "./components/AccountModal";
import { AIConfigModal } from "./components/AIConfigModal";
import { AICopilotDrawer } from "./components/AICopilotDrawer";
import {
  Menu,
  LayoutDashboard,
  Calendar,
  GraduationCap,
  Mail,
  Layers,
  Sparkles,
  Bot,
} from "lucide-react";

function MainContent() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [grades, setGrades] = useState<SemesterReport[]>([]);
  const [recentGrades, setRecentGrades] = useState<DetectedNewGrade[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [scheduleChanges, setScheduleChanges] = useState<ScheduleChangeNotification[]>([]);
  const [unreadMailCount, setUnreadMailCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showAIConfigModal, setShowAIConfigModal] = useState(false);
  const [showAICopilotDrawer, setShowAICopilotDrawer] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(getNotificationPermission());

  const seenStateRef = useRef<{
    initialized: boolean;
    grades: Set<string>;
    schedule: Set<string>;
    assignments: Set<string>;
    mailUnread: number;
  }>({
    initialized: false,
    grades: new Set(),
    schedule: new Set(),
    assignments: new Set(),
    mailUnread: 0,
  });

  const pushNotification = useCallback((notif: Omit<AppToastNotification, "id"> & { id?: string }) => {
    const id = notif.id || `${notif.category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nativeNotif = sendBrowserNotification(notif.title, { body: notif.body, tag: id });
    if (nativeNotif && notif.onClick) {
      nativeNotif.onclick = () => {
        window.focus();
        notif.onClick?.();
        nativeNotif.close();
      };
    }
  }, []);

  // Navigation & Mobile Drawer State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<"dashboard" | "schedule" | "resource" | "grades" | "nextcloud" | "mail" | "ecampus">("dashboard");
  const [selectedResourceId, setSelectedResourceId] = useState<string | undefined>("R201");
  const [preferredNoteId, setPreferredNoteId] = useState<string | undefined>(undefined);
  const [preferredMailId, setPreferredMailId] = useState<string | undefined>(undefined);
  const [preferredTab, setPreferredTab] = useState<"CM" | "TD" | "TP" | "QCM" | "GRADES" | "MOODLE" | undefined>(undefined);
  const [showResourceModal, setShowResourceModal] = useState(false);

  // Initial data loading for the authenticated student
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [resList, noteList, eventList, gradesList, recentData, changesData, mailUnread, assignmentsData] = await Promise.all([
        api.getResources(),
        api.getNotes(),
        api.getSchedule(),
        api.getGrades().catch(() => []),
        api.getRecentGrades().catch(() => ({ recentGrades: [], syncStatus: null })),
        api.getScheduleChanges().catch(() => ({ changes: [], unreadCount: 0 })),
        api.getMailUnreadCount().catch(() => 0),
        api.getMoodleAssignments().catch(() => ({ assignments: [], total: 0 })),
      ]);
      setResources(resList);
      setNotes(noteList);
      setEvents(eventList);
      setGrades(gradesList);
      setUnreadMailCount(mailUnread);
      if (recentData) {
        setRecentGrades(recentData.recentGrades || []);
        setSyncStatus(recentData.syncStatus || null);
      }
      if (changesData) {
        setScheduleChanges(changesData.changes || []);
      }

      // Initialiser les éléments déjà vus pour n'alerter que sur les nouveautés
      const storageKey = `backpack_seen_assignments_${user.username}`;
      let persistedAssignments: string[] = [];
      try {
        persistedAssignments = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch {}
      const initialAssignments = new Set<string>([
        ...persistedAssignments,
        ...(assignmentsData?.assignments || []).map(
          (a: any) => a.id || `${a.courseTitle || ""}:${a.name || ""}:${a.dueDate || ""}`
        ),
      ]);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(initialAssignments).slice(-500)));
      } catch {}

      seenStateRef.current = {
        initialized: true,
        grades: new Set((recentData?.recentGrades || []).map((g) => g.id)),
        schedule: new Set((changesData?.changes || []).map((c) => c.id)),
        assignments: initialAssignments,
        mailUnread,
      };
      if (resList.length > 0 && (!selectedResourceId || !resList.some((r) => r.id === selectedResourceId))) {
        setSelectedResourceId(resList[0].id);
      }
    } catch (err) {
      console.error("Error loading app data", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Surveillance automatique en arrière-plan (notes, mails, emploi du temps, devoirs Moodle)
  useEffect(() => {
    if (!user) return;

    const pollUpdates = async () => {
      if (!seenStateRef.current.initialized) return;
      try {
        const [eventList, gradesList, recentData, changesData, mailUnread, assignmentsData] = await Promise.all([
          api.getSchedule().catch(() => null),
          api.getGrades().catch(() => null),
          api.getRecentGrades().catch(() => null),
          api.getScheduleChanges().catch(() => null),
          api.getMailUnreadCount().catch(() => null),
          api.getMoodleAssignments().catch(() => null),
        ]);

        if (eventList) setEvents(eventList);
        if (gradesList) setGrades(gradesList);

        // 1. Nouvelles notes
        if (recentData) {
          setRecentGrades(recentData.recentGrades || []);
          setSyncStatus(recentData.syncStatus || null);
          for (const g of recentData.recentGrades || []) {
            if (!g.isRead && !seenStateRef.current.grades.has(g.id)) {
              seenStateRef.current.grades.add(g.id);
              pushNotification({
                id: `grade-${g.id}`,
                category: "grade",
                title: `Nouvelle note : ${g.evalName}`,
                body: `${g.resourceCode} • ${g.note}${g.moyennePromo ? ` (Promo : ${g.moyennePromo})` : ""}`,
                onClick: () => setActiveView("grades"),
              });
            }
          }
        }

        // 2. Changements d'emploi du temps
        if (changesData) {
          setScheduleChanges(changesData.changes || []);
          for (const c of changesData.changes || []) {
            if (!c.isRead && !seenStateRef.current.schedule.has(c.id)) {
              seenStateRef.current.schedule.add(c.id);
              pushNotification({
                id: `schedule-${c.id}`,
                category: "schedule",
                title: `Emploi du temps : ${c.title}`,
                body: c.message,
                onClick: () => setActiveView("schedule"),
              });
            }
          }
        }

        // 3. Nouveaux mails
        if (typeof mailUnread === "number") {
          setUnreadMailCount(mailUnread);
          if (mailUnread > seenStateRef.current.mailUnread) {
            const diff = mailUnread - seenStateRef.current.mailUnread;
            let title = diff > 1 ? `${diff} nouveaux mails reçus` : "Nouveau mail reçu";
            let body = "Consultez votre messagerie Unicaen.";
            try {
              const inbox = await api.getMailMessages(3, 0, true, "INBOX");
              const latestUnread = inbox.messages.find((m) => m.isUnread) || inbox.messages[0];
              if (latestUnread) {
                title = `Mail de ${latestUnread.from}`;
                body = latestUnread.subject || "(Sans objet)";
              }
            } catch {
              // Garder le message générique si la lecture du détail échoue
            }
            pushNotification({
              category: "mail",
              title,
              body,
              onClick: () => setActiveView("mail"),
            });
          }
          seenStateRef.current.mailUnread = mailUnread;
        }

        // 4. Nouveaux devoirs Moodle (uniquement futurs et non déjà vus)
        if (assignmentsData?.assignments) {
          const storageKey = `backpack_seen_assignments_${user.username}`;
          const nowMs = Date.now();
          let updatedSeen = false;
          for (const a of assignmentsData.assignments as any[]) {
            const assignKey = a.id || `${a.courseTitle || ""}:${a.name || ""}:${a.dueDate || ""}`;
            if (!seenStateRef.current.assignments.has(assignKey)) {
              seenStateRef.current.assignments.add(assignKey);
              updatedSeen = true;
              const isPastDue = a.dueDate ? new Date(a.dueDate).getTime() < nowMs : false;
              if (!isPastDue) {
                const assignTitle = a.name || a.title || "Devoir";
                const courseLabel = a.courseTitle || a.courseName || "Moodle";
                pushNotification({
                  id: `moodle-${assignKey}`,
                  category: "moodle",
                  title: `Nouveau devoir Moodle : ${assignTitle}`,
                  body:
                    courseLabel +
                    (a.dueDate ? ` • Échéance : ${new Date(a.dueDate).toLocaleDateString("fr-FR")}` : ""),
                  onClick: () => setActiveView("dashboard"),
                });
              }
            }
          }
          if (updatedSeen) {
            try {
              localStorage.setItem(
                storageKey,
                JSON.stringify(Array.from(seenStateRef.current.assignments).slice(-500))
              );
            } catch {}
          }
        }
      } catch (err) {
        console.warn("[AutoPoll] Erreur lors de la vérification en arrière-plan :", err);
      }
    };

    const interval = setInterval(() => {
      void pollUpdates();
    }, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, pushNotification]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-3 select-none">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl text-white shadow-none">
          🎒
        </div>
        <div className="text-sm font-semibold text-slate-800">Initialisation de votre session...</div>
        <div className="text-xs text-slate-400 font-mono">Vérification de l'authentification CAS</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleSelectView = (
    view: "dashboard" | "schedule" | "resource" | "grades" | "nextcloud" | "mail" | "ecampus",
    resourceId?: string
  ) => {
    setActiveView(view);
    if (resourceId) {
      setSelectedResourceId(resourceId);
      setPreferredNoteId(undefined);
      setPreferredTab(undefined);
    }
  };

  const handleOpenResource = (
    resourceId: string,
    preferredType?: "CM" | "TD" | "TP" | "QCM" | "GRADES" | "MOODLE",
    noteId?: string
  ) => {
    setSelectedResourceId(resourceId);
    setPreferredNoteId(noteId);
    setPreferredTab(preferredType);
    setActiveView("resource");
  };

  const handleSyncGrades = async () => {
    const res = await api.syncGradesNow();
    if (res.recentGrades) setRecentGrades(res.recentGrades);
    if (res.syncStatus) setSyncStatus(res.syncStatus);
    const updatedGrades = await api.getGrades().catch(() => []);
    if (updatedGrades.length > 0) setGrades(updatedGrades);
    return res;
  };

  const handleMarkGradeRead = async (id?: string) => {
    const res = await api.markGradeAsRead(id);
    if (res.recentGrades) setRecentGrades(res.recentGrades);
    if (res.syncStatus) setSyncStatus(res.syncStatus);
  };

  const handleMarkScheduleChangeRead = async (id?: string) => {
    const res = await api.markScheduleChangeAsRead(id);
    if (res.changes) setScheduleChanges(res.changes);
  };

  const selectedResource =
    resources.find((r) => r.id === selectedResourceId || r.code === selectedResourceId) ||
    resources[0];

  const unreadScheduleChangesCount = scheduleChanges.filter((c) => !c.isRead).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-3 select-none">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl text-white shadow-none">
          🎒
        </div>
        <div className="text-sm font-semibold text-slate-800">Chargement de votre Cartable Numérique...</div>
        <div className="text-xs text-slate-400 font-mono">
          Synchronisation des cours et notes de {user.name || user.username}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 relative">
      {/* Sidebar Navigation (Desktop fixed + Mobile sliding drawer) */}
      <Sidebar
        resources={resources}
        activeView={activeView}
        selectedResourceId={selectedResourceId}
        unreadGradesCount={syncStatus?.unreadCount || 0}
        unreadScheduleChangesCount={unreadScheduleChangesCount}
        unreadMailCount={unreadMailCount}
        user={user}
        isOpenOnMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectView={(view, resId) => {
          handleSelectView(view, resId);
          setMobileMenuOpen(false);
        }}
        onOpenNewResourceModal={() => setShowResourceModal(true)}
        onOpenAdmin={() => setShowAdminModal(true)}
        onOpenAccount={() => setShowAccountModal(true)}
        onOpenAIConfig={() => setShowAIConfigModal(true)}
        onOpenCopilot={() => setShowAICopilotDrawer(true)}
        onOpenTerms={() => setShowTermsModal(true)}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        {/* Mobile Header Bar */}
        <header className="md:hidden bg-white/90 backdrop-blur-md border-b border-slate-200 px-3.5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex items-center justify-between z-30 shrink-0 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
              title="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg shrink-0">🎒</span>
              <div className="min-w-0">
                <h2 className="text-xs font-bold text-slate-900 truncate leading-tight">
                  {activeView === "dashboard"
                    ? "Tableau de Bord"
                    : activeView === "schedule"
                    ? "Emploi du Temps"
                    : activeView === "resource"
                    ? `${selectedResource?.code || "Ressource"} - ${selectedResource?.shortName || ""}`
                    : activeView === "grades"
                    ? "Relevé de Notes"
                    : activeView === "nextcloud"
                    ? "UniCloud"
                    : "Messagerie Zimbra"}
                </h2>
                <p className="text-[10px] text-slate-500 font-medium truncate">BUT RT Campus 3</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => handleSelectView("mail")}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 relative transition-colors"
              title="Messagerie"
            >
              <Mail className="w-4 h-4 text-indigo-600" />
              {unreadMailCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-1 ring-white" />
              )}
            </button>
            <button
              onClick={() => setShowAccountModal(true)}
              className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center uppercase shadow-xs cursor-pointer hover:bg-blue-700 transition-colors"
              title="Mon Compte & Sauvegardes"
            >
              {user.name?.[0] || user.username[0]}
            </button>
          </div>
        </header>

        {/* Views Container */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0 pb-20 md:pb-0">
          {activeView === "dashboard" && (
            <Dashboard
              resources={resources}
              notes={notes}
              events={events}
              recentGrades={recentGrades}
              syncStatus={syncStatus}
              scheduleChanges={scheduleChanges}
              onOpenResource={handleOpenResource}
              onOpenSchedule={() => setActiveView("schedule")}
              onOpenGrades={() => setActiveView("grades")}
              onOpenMail={() => setActiveView("mail")}
              onOpenCopilot={() => setShowAICopilotDrawer(true)}
              onOpenAIConfig={() => setShowAIConfigModal(true)}
              onSyncGrades={handleSyncGrades}
              onMarkGradeRead={handleMarkGradeRead}
              onMarkScheduleChangeRead={handleMarkScheduleChangeRead}
            />
          )}

          {activeView === "schedule" && (
            <ScheduleView
              events={events}
              resources={resources}
              onOpenResource={(code) => handleOpenResource(code)}
              onOpenMail={(mailId) => {
                setPreferredMailId(mailId);
                setActiveView("mail");
              }}
              onRefreshEvents={loadData}
            />
          )}

          {activeView === "resource" && selectedResource && (
            <ResourceView
              key={selectedResource.id}
              resource={selectedResource}
              initialNoteId={preferredNoteId}
              initialTab={preferredTab}
              onOpenScheduleForResource={(code) => {
                setActiveView("schedule");
              }}
              onOpenGrades={() => {
                setActiveView("grades");
              }}
            />
          )}

          {activeView === "grades" && (
            <GradesView
              grades={grades}
              resources={resources}
              onOpenResource={(code, preferredType) => handleOpenResource(code, preferredType)}
              onRefreshGrades={loadData}
            />
          )}

          {activeView === "nextcloud" && (
            <NextcloudView
              resources={resources}
              onOpenResourceNote={(resourceId, noteId) => {
                handleOpenResource(resourceId, undefined, noteId);
              }}
            />
          )}

          {activeView === "ecampus" && (
            <MoodleView resources={resources} onOpenResource={handleOpenResource} />
          )}

          {activeView === "mail" && (
            <MailView
              resources={resources}
              initialSelectedId={preferredMailId}
              onOpenResource={(code) => handleOpenResource(code)}
            />
          )}
        </div>

        {/* Mobile Bottom Navigation Bar (Flottante & Arrondie, Edge-to-Edge) */}
        <nav className="md:hidden fixed left-3 right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-xl shadow-slate-900/10 rounded-3xl px-2 py-1.5 flex items-center justify-around z-30 select-none">
          <button
            onClick={() => handleSelectView("dashboard")}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-all ${
              activeView === "dashboard" ? "bg-blue-50 text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[10px]">Accueil</span>
          </button>

          <button
            onClick={() => handleSelectView("schedule")}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-all relative ${
              activeView === "schedule" ? "bg-sky-50 text-sky-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="relative">
              <Calendar className="w-4 h-4" />
              {unreadScheduleChangesCount > 0 && (
                <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 bg-sky-500 rounded-full" />
              )}
            </div>
            <span className="text-[10px]">Agenda</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-all ${
              activeView === "resource" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="text-[10px]">Matières</span>
          </button>

          <button
            onClick={() => handleSelectView("grades")}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-all relative ${
              activeView === "grades" ? "bg-amber-50 text-amber-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="relative">
              <GraduationCap className="w-4 h-4" />
              {(syncStatus?.unreadCount || 0) > 0 && (
                <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 bg-amber-500 rounded-full" />
              )}
            </div>
            <span className="text-[10px]">Notes</span>
          </button>

          <button
            onClick={() => handleSelectView("mail")}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-2xl transition-all relative ${
              activeView === "mail" ? "bg-indigo-50 text-indigo-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="relative">
              <Mail className="w-4 h-4" />
              {unreadMailCount > 0 && (
                <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 bg-rose-500 rounded-full" />
              )}
            </div>
            <span className="text-[10px]">Mails</span>
          </button>
        </nav>
      </main>

      {/* Modal create resource */}
      {showResourceModal && (
        <ResourceModal
          onClose={() => setShowResourceModal(false)}
          onResourceCreated={(newRes) => {
            setResources((prev) => [...prev, newRes]);
            setSelectedResourceId(newRes.id);
            setActiveView("resource");
          }}
        />
      )}

      {/* Admin Modal */}
      <AdminModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
      />

      {/* Terms & Disclaimer Modal (Mandatoire lors de la 1ère connexion) */}
      <TermsModal
        isOpen={!user.termsAcceptedAt}
        isMandatory={true}
      />

      {/* Terms & Disclaimer Modal (Mode consultation libre) */}
      <TermsModal
        isOpen={!!user.termsAcceptedAt && showTermsModal}
        isMandatory={false}
        onClose={() => setShowTermsModal(false)}
      />

      {/* Account, Backup & Data Management Modal */}
      {showAccountModal && user && (
        <AccountModal
          user={user}
          onClose={() => setShowAccountModal(false)}
          onDataReload={loadData}
          onLogout={logout}
        />
      )}

      {/* Floating Copilot IA Button */}
      {!showAICopilotDrawer && (
        <button
          onClick={() => setShowAICopilotDrawer(true)}
          className="fixed bottom-20 md:bottom-6 right-5 z-40 px-3.5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2 font-semibold text-xs cursor-pointer group select-none"
          title="Ouvrir le Copilot Universitaire IA"
        >
          <Sparkles className="w-4 h-4 animate-pulse text-amber-300" />
          <span className="font-semibold tracking-wide">Copilot IA</span>
        </button>
      )}

      {/* AI Configuration Modal */}
      <AIConfigModal
        isOpen={showAIConfigModal}
        onClose={() => setShowAIConfigModal(false)}
      />

      {/* AI Copilot Drawer */}
      <AICopilotDrawer
        isOpen={showAICopilotDrawer}
        onClose={() => setShowAICopilotDrawer(false)}
        onOpenConfig={() => {
          setShowAICopilotDrawer(false);
          setShowAIConfigModal(true);
        }}
        onNavigateToResource={(code) => handleOpenResource(code)}
        onNavigateToSchedule={() => setActiveView("schedule")}
        onNavigateToGrades={() => setActiveView("grades")}
        onNavigateToMail={() => setActiveView("mail")}
      />

      {/* Demande d'activation des notifications natives uniquement (aucun toast in-app) */}
      <NotificationToasts
        toasts={[]}
        onDismiss={() => {}}
        permission={notifPermission}
        onPermissionChange={setNotifPermission}
      />

      <PWAInstallPrompt />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}

export default App;
