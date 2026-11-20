import React, { useState, useEffect } from "react";
import { AdminUserSummary } from "../types";
import { api } from "../services/api";
import {
  ShieldAlert,
  Users,
  X,
  ShieldCheck,
  User,
  Clock,
  CheckCircle2,
  RefreshCw,
  FolderLock,
} from "lucide-react";

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAdminUsers();
      setUsers(data.users);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message || "Erreur lors de la récupération des utilisateurs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Administration Cartable BUT RT
              </h2>
              <p className="text-xs text-slate-500">
                Gestion des comptes étudiants et statut du cloisonnement multi-tenant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Isolation Banner */}
        <div className="px-6 py-3 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <FolderLock className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>
              <strong>Isolation active :</strong> Chaque dossier{" "}
              <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[11px]">
                data/users/&lt;username&gt;/
              </code>{" "}
              est strictement cloisonné.
            </span>
          </div>
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="flex items-center gap-1 text-blue-700 hover:text-blue-800 font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Actualiser</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Comptes enregistrés ({total})
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Département : BUT Réseaux & Télécoms - Campus 3
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Utilisateur</th>
                  <th className="py-2.5 px-3">Identifiant</th>
                  <th className="py-2.5 px-3">Rôle</th>
                  <th className="py-2.5 px-3">Conditions &amp; Décharge</th>
                  <th className="py-2.5 px-3">1ère connexion</th>
                  <th className="py-2.5 px-4">Dernière activité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-800 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs uppercase">
                        {u.name ? u.name.charAt(0) : u.username.charAt(0)}
                      </div>
                      <span>{u.name || u.username}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {u.username}
                    </td>
                    <td className="py-3 px-3">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <ShieldCheck className="w-3 h-3 text-amber-600" />
                          Administrateur
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <User className="w-3 h-3 text-slate-400" />
                          Étudiant
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {u.termsAcceptedAt ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Signé ({new Date(u.termsAcceptedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Non signé
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {new Date(u.firstLoginAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>
                          {new Date(u.lastLoginAt).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Aucun utilisateur enregistré.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">Multi-tenant vérifié</span>
            </div>
            <a
              href="http://localhost:3002"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold hover:underline"
              title="Ouvrir le tableau de bord local des tests autonomes et performances"
            >
              <span>📊 Observatoire de Performance (Port 3002) ↗</span>
            </a>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white text-slate-700 font-medium transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
