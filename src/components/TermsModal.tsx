import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  ShieldAlert,
  ShieldCheck,
  Scale,
  Lock,
  Calendar,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  X,
  LogOut,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";

interface TermsModalProps {
  isOpen: boolean;
  isMandatory?: boolean;
  onClose?: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({
  isOpen,
  isMandatory = false,
  onClose,
}) => {
  const { user, acceptTerms, logout } = useAuth();
  const [checkAffiliation, setCheckAffiliation] = useState(false);
  const [checkLiability, setCheckLiability] = useState(false);
  const [checkPrivacy, setCheckPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const allChecked = checkAffiliation && checkLiability && checkPrivacy;

  const handleAccept = async () => {
    if (!allChecked) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await acceptTerms("1.0");
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement de votre acceptation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefuse = () => {
    logout();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 ${
        isMandatory ? "cursor-default" : ""
      }`}
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100/80 text-blue-700 border border-blue-200">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Conditions Générales &amp; Décharge de Responsabilité
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Cartable Numérique • BUT Réseaux &amp; Télécoms — Campus 3 (Ifs)
              </p>
            </div>
          </div>
          {!isMandatory && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Status notice */}
        {isMandatory ? (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200/80 flex items-center gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Première connexion requise :</strong> Veuillez prendre connaissance des conditions
              ci-dessous et valider votre accord pour accéder à votre espace de travail.
            </span>
          </div>
        ) : (
          user?.termsAcceptedAt && (
            <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200/80 flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Conditions acceptées le{" "}
                <strong>
                  {new Date(user.termsAcceptedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>{" "}
                (Version {user.termsVersion || "1.0"})
              </span>
            </div>
          )
        )}

        {/* Scrollable Terms Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed border-b border-slate-100">
          {/* Article 1 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2 text-[13px]">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              1. Nature du Service &amp; Non-affiliation Officielle
            </h3>
            <p>
              <strong>Cartable Numérique</strong> est un outil d'organisation et d'assistance aux études
              développé à titre <strong>strictement personnel et indépendant</strong> par un étudiant,
              au bénéfice des promotions du département BUT Réseaux &amp; Télécoms (Campus 3 - Ifs).
            </p>
            <p className="mt-1 text-slate-500">
              Cet outil n'est <strong>ni affilié, ni commandité, ni approuvé, ni maintenu par
              l'Université de Caen Normandie</strong>, l'IUT Grand Ouest Normandie ou le Ministère de
              l'Enseignement Supérieur et de la Recherche.
            </p>
          </div>

          {/* Article 2 */}
          <div className="p-3.5 rounded-lg bg-amber-50/50 border border-amber-200/70">
            <h3 className="font-bold text-amber-950 mb-1 flex items-center gap-2 text-[13px]">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              2. Clause Intégrale de Non-Responsabilité (Disclaimer)
            </h3>
            <p className="text-amber-900 mb-2">
              En utilisant ce service, vous reconnaissez et convenez expressément que le créateur/développeur
              de Cartable Numérique <strong>décline toute responsabilité</strong> dans les situations suivantes :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>
                <strong>Emploi du temps &amp; Assiduité :</strong> Les événements et alertes de planning
                sont donnés à titre strictement indicatif. Vous restez le{" "}
                <strong>seul et unique responsable</strong> de vérifier votre planning officiel sur l'ENT
                Unicaen (ADE Campus). Aucune contestation en cas de retard, absence injustifiée,
                changement de salle ou de professeur ne pourra être imputée à Cartable Numérique.
              </li>
              <li>
                <strong>Relevés de notes &amp; Délibérations :</strong> Les moyennes et évaluations
                récupérées automatiquement sont données à titre de consultation rapide. Seules les
                données du portail Scodoc officiel et les jurys semestriels font autorité.
              </li>
              <li>
                <strong>Disponibilité &amp; Pannes Unicaen :</strong> Le service dépend des infrastructures
                tiers de l'Université (CAS, Moodle E-Campus, Zimbra, UniCloud). Le développeur ne
                garantit aucun taux de disponibilité et ne saurait être responsable des lenteurs, coupures
                ou indisponibilités du réseau.
              </li>
              <li>
                <strong>Sauvegardes de vos cours :</strong> L'étudiant est invité à exporter régulièrement
                ses notes (via les boutons Export Markdown, Zip ou UniCloud intégrés). Le développeur ne
                pourra être tenu responsable de toute perte accidentelle de données.
              </li>
            </ul>
          </div>

          {/* Article 3 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2 text-[13px]">
              <Lock className="w-4 h-4 text-emerald-600" />
              3. Protection des Données Personnelles (RGPD) &amp; Mots de passe
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>
                <strong>Zéro mot de passe stocké sur disque :</strong> Vos identifiants ENT ne sont jamais
                écrits dans un fichier de base de données. Ils sont exclusivement transmis au serveur CAS
                officiel de l'Université et conservés temporairement en mémoire vive (RAM) le temps de la
                session active pour permettre la synchronisation IMAP (Zimbra) et WebDAV (UniCloud).
              </li>
              <li>
                <strong>Cloisonnement hermétique :</strong> Vos notes, documents, mails et fichiers sont
                stockés dans un dossier isolé (<code>data/users/&lt;votre_login&gt;/</code>) strictement
                inaccessible aux autres étudiants.
              </li>
              <li>
                <strong>Aucun pistage ni revente :</strong> Zéro tracker publicitaire, zéro analyse
                commerciale, aucune revente ou partage de données à des tiers.
              </li>
              <li>
                <strong>Droit de suppression :</strong> Vous pouvez demander à tout moment la suppression
                immédiate et définitive de votre compte et de toutes vos données stockées.
              </li>
            </ul>
          </div>

          {/* Article 4 */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2 text-[13px]">
              <FileText className="w-4 h-4 text-indigo-600" />
              4. Engagement de l'Étudiant &amp; Usage Loyal
            </h3>
            <p>
              L'étudiant s'engage à utiliser la plateforme dans le respect de la législation française, du
              règlement intérieur de l'IUT et de la charte informatique de l'Université de Caen Normandie.
              Toute tentative d'usurpation d'identité, d'accès non autorisé aux espaces d'autres étudiants
              ou d'attaque par déni de service entraînera la désactivation immédiate du compte.
            </p>
          </div>
        </div>

        {/* Mandatory Agreement Checkboxes (Only if mandatory or unaccepted) */}
        {isMandatory && (
          <div className="px-6 py-3.5 bg-slate-50/90 border-b border-slate-200 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Consentement obligatoire pour continuer
            </p>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkAffiliation}
                onChange={(e) => setCheckAffiliation(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>
                J'atteste être étudiant en <strong>BUT Réseaux &amp; Télécoms</strong> et j'utilise
                exclusivement mon propre compte institutionnel Unicaen.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkLiability}
                onChange={(e) => setCheckLiability(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>
                <strong>J'accepte la décharge totale de responsabilité :</strong> je reconnais que
                Cartable est un projet étudiant indépendant et que je demeure seul responsable de
                vérifier mes cours, notes et absences sur l'ENT officiel (ADE, Scodoc, Zimbra).
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkPrivacy}
                onChange={(e) => setCheckPrivacy(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>
                J'accepte la politique de confidentialité RGPD et le traitement localisé de mes données.
              </span>
            </label>

            {error && (
              <div className="p-2 rounded bg-red-50 text-red-700 border border-red-200 text-xs">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 bg-white flex items-center justify-between gap-3 flex-wrap">
          {isMandatory ? (
            <>
              <button
                onClick={handleRefuse}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Refuser et se déconnecter</span>
              </button>

              <button
                onClick={handleAccept}
                disabled={!allChecked || isSubmitting}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isSubmitting ? "Enregistrement..." : "J'accepte et j'accède à mon Cartable"}
                </span>
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Cartable BUT RT • Campus 3 (Ifs)
              </span>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
