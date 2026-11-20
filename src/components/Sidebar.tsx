import React, { useState } from "react";
import { Resource, User } from "../types";
import {
  Calendar,
  LayoutDashboard,
  Plus,
  Search,
  BookOpen,
  Laptop,
  Layers,
  ChevronRight,
  Sparkles,
  GraduationCap,
  Cloud,
  Mail,
  LogOut,
  ShieldAlert,
  Scale,
  X,
  Settings,
} from "lucide-react";

interface SidebarProps {
  resources: Resource[];
  activeView: "dashboard" | "schedule" | "resource" | "grades" | "nextcloud" | "mail" | "ecampus";
  selectedResourceId?: string;
  unreadGradesCount?: number;
  unreadScheduleChangesCount?: number;
  unreadMailCount?: number;
  user?: User | null;
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
  onSelectView: (
    view: "dashboard" | "schedule" | "resource" | "grades" | "nextcloud" | "mail" | "ecampus",
    resourceId?: string
  ) => void;
  onOpenNewResourceModal: () => void;
  onOpenAdmin?: () => void;
  onOpenAccount?: () => void;
  onOpenAIConfig?: () => void;
  onOpenCopilot?: () => void;
  onLogout?: () => void;
  onOpenTerms?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  resources,
  activeView,
  selectedResourceId,
  unreadGradesCount = 0,
  unreadScheduleChangesCount = 0,
  unreadMailCount = 0,
  user,
  isOpenOnMobile = false,
  onCloseMobile,
  onSelectView,
  onOpenNewResourceModal,
  onOpenAdmin,
  onOpenAccount,
  onOpenAIConfig,
  onOpenCopilot,
  onLogout,
  onOpenTerms,
}) => {
  const [semesterFilter, setSemesterFilter] = useState<"ALL" | 1 | 2>(() => {
    const m = new Date().getMonth();
    return m >= 8 || m === 0 ? 1 : 2;
  });
  const [searchQuery, setSearchQuery] = useState("");

  const handleItemClick = (
    view: "dashboard" | "schedule" | "resource" | "grades" | "nextcloud" | "mail" | "ecampus",
    resourceId?: string
  ) => {
    onSelectView(view, resourceId);
    if (onCloseMobile) onCloseMobile();
  };

  const filteredResources = resources.filter((r) => {
    if (semesterFilter !== "ALL" && r.semester !== semesterFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.shortName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const saes = filteredResources.filter((r) => r.category === "SAE");
  const coreResources = filteredResources.filter((r) => r.category === "Ressource");

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenOnMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col h-screen select-none shrink-0 no-print transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
          isOpenOnMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* App Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl text-white shadow-none shrink-0">
                🎒
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-slate-900 leading-tight flex items-center gap-1.5 truncate">
                  Cartable Numérique
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">BUT Réseaux &amp; Télécoms</p>
              </div>
            </div>

            {/* Close button on mobile */}
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 md:hidden transition-colors shrink-0 ml-2"
              title="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        {/* Semester selector */}
        <div className="mt-4 flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
          <button
            onClick={() => setSemesterFilter("ALL")}
            className={`flex-1 py-1.5 rounded-md transition-all ${
              semesterFilter === "ALL"
                ? "bg-white text-slate-900 font-semibold border border-slate-200/80 shadow-none"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setSemesterFilter(1)}
            className={`flex-1 py-1.5 rounded-md transition-all ${
              semesterFilter === 1
                ? "bg-white text-slate-900 font-semibold border border-slate-200/80 shadow-none"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Semestre 1
          </button>
          <button
            onClick={() => setSemesterFilter(2)}
            className={`flex-1 py-1.5 rounded-md transition-all ${
              semesterFilter === 2
                ? "bg-white text-slate-900 font-semibold border border-slate-200/80 shadow-none"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Semestre 2
          </button>
        </div>

        {/* Search input */}
        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher une matière..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Primary Navigation */}
      <div className="p-3 border-b border-slate-200 space-y-1">
        <button
          onClick={() => handleItemClick("dashboard")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeView === "dashboard"
              ? "bg-blue-50 text-blue-700 border border-blue-200 font-semibold"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <LayoutDashboard className="w-4 h-4 text-blue-600" />
          <span>Tableau de Bord</span>
        </button>
        <button
          onClick={() => handleItemClick("schedule")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeView === "schedule"
              ? "bg-sky-50 text-sky-700 border border-sky-200 font-semibold"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <div className="relative">
            <Calendar className="w-4 h-4 text-sky-600" />
            {unreadScheduleChangesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-sky-500 rounded-full" />
            )}
          </div>
          <span className="flex-1 text-left">Emploi du Temps</span>
          {unreadScheduleChangesCount > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-600 text-white">
              {unreadScheduleChangesCount}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
              ADE
            </span>
          )}
        </button>
        <button
          onClick={() => handleItemClick("grades")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeView === "grades"
              ? "bg-amber-50 text-amber-800 border border-amber-200 font-semibold"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <div className="relative">
            <GraduationCap className="w-4 h-4 text-amber-600" />
            {unreadGradesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
            )}
          </div>
          <span className="flex-1 text-left">Relevé de Notes</span>
          {unreadGradesCount > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {unreadGradesCount}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
              Webnotes
            </span>
          )}
        </button>

        <button
          onClick={() => handleItemClick("nextcloud")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeView === "nextcloud"
              ? "bg-cyan-50 text-cyan-800 border border-cyan-200 font-semibold"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Cloud className="w-4 h-4 text-cyan-600" />
          <span className="flex-1 text-left">UniCloud IUT</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-100 text-cyan-700 font-semibold">
            Nextcloud
          </span>
        </button>

        <button
          onClick={() => handleItemClick("ecampus")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeView === "ecampus"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <BookOpen className="w-4 h-4 text-emerald-600" />
          <span className="flex-1 text-left">E-Campus</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-semibold">
            Moodle
          </span>
        </button>

        <button
          onClick={() => handleItemClick("mail")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeView === "mail"
              ? "bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <div className="relative">
            <Mail className="w-4 h-4 text-indigo-600" />
            {unreadMailCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />
            )}
          </div>
          <span className="flex-1 text-left">Messagerie Zimbra</span>
          {unreadMailCount > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {unreadMailCount}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
              IMAP
            </span>
          )}
        </button>

        {onOpenCopilot && (
          <button
            onClick={() => {
              onOpenCopilot();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors bg-gradient-to-r from-blue-50/80 via-indigo-50/80 to-purple-50/80 hover:from-blue-100 hover:to-indigo-100 text-blue-800 border border-blue-200/80 shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="flex-1 text-left">Copilot IA &amp; Outils</span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-blue-600 text-white">
              IA
            </span>
          </button>
        )}
      </div>

      {/* Resources list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Core Resources */}
        {coreResources.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold text-slate-500 tracking-wider uppercase">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Ressources ({coreResources.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {coreResources.map((res) => {
                const isSelected = activeView === "resource" && selectedResourceId === res.id;
                return (
                  <button
                    key={res.id}
                    onClick={() => handleItemClick("resource", res.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all group text-left ${
                      isSelected
                        ? "bg-slate-100 text-slate-900 font-semibold border border-slate-200"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span className="text-base shrink-0">{res.emoji}</span>
                    <span
                      className="font-mono text-[10.5px] px-1.5 py-0.5 rounded font-bold shrink-0"
                      style={{
                        backgroundColor: `${res.color}15`,
                        color: res.color,
                        borderColor: `${res.color}35`,
                        borderWidth: "1px",
                      }}
                    >
                      {res.code}
                    </span>
                    <span className="truncate flex-1 font-medium text-[12px]">{res.shortName}</span>
                    {(res.notesCount?.cm || 0) + (res.notesCount?.tp || 0) > 0 && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-mono border border-slate-200">
                        {(res.notesCount?.cm || 0) + (res.notesCount?.tp || 0)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SAÉs */}
        {saes.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold text-indigo-600 tracking-wider uppercase">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                SAÉs — Projets ({saes.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {saes.map((res) => {
                const isSelected = activeView === "resource" && selectedResourceId === res.id;
                return (
                  <button
                    key={res.id}
                    onClick={() => handleItemClick("resource", res.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all group text-left ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-950 font-semibold border border-indigo-200"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span className="text-base shrink-0">{res.emoji}</span>
                    <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                      {res.code}
                    </span>
                    <span className="truncate flex-1 font-medium text-[12px]">{res.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer User Profile & Actions */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-2.5">
        {user && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 shadow-2xs hover:border-blue-300 transition-colors">
            <div
              onClick={() => {
                if (onOpenAccount) onOpenAccount();
                if (onCloseMobile) onCloseMobile();
              }}
              title="Gérer mon compte, sauvegardes et suppression de données"
              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                {user.name ? user.name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate leading-tight group-hover:text-blue-700 transition-colors">
                  {user.name || user.username}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {user.role === "admin" ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                      Admin
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                      Étudiant
                    </span>
                  )}
                  <span className="text-[10.5px] text-slate-400 font-mono truncate">
                    {user.username}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0 ml-1">
              {onOpenAIConfig && (
                <button
                  onClick={() => {
                    onOpenAIConfig();
                    if (onCloseMobile) onCloseMobile();
                  }}
                  title="Configuration Intelligence Artificielle & Outils"
                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              )}
              {onOpenAccount && (
                <button
                  onClick={() => {
                    onOpenAccount();
                    if (onCloseMobile) onCloseMobile();
                  }}
                  title="Sauvegardes & Mon Compte"
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
              {user.role === "admin" && onOpenAdmin && (
                <button
                  onClick={onOpenAdmin}
                  title="Panneau d'administration BUT RT"
                  className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4" />
                </button>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Se déconnecter de Cartable"
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            onOpenNewResourceModal();
            if (onCloseMobile) onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition-colors shadow-2xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-blue-600" />
          <span>Ajouter une matière</span>
        </button>

        <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-slate-400">
          <button
            onClick={() => {
              if (onOpenTerms) onOpenTerms();
              if (onCloseMobile) onCloseMobile();
            }}
            className="flex items-center gap-1 hover:text-slate-700 transition-colors cursor-pointer text-left"
            title="Consulter les conditions générales et la décharge de responsabilité"
          >
            <Scale className="w-3 h-3 text-slate-400" />
            <span>Conditions &amp; Décharge</span>
          </button>
          <span className="font-mono text-[10px] text-slate-400">v1.0</span>
        </div>
      </div>
    </aside>
  </>
  );
};
