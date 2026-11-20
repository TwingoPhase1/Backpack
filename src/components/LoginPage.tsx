import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { GridCellChallenge, TwoFactorMethod } from "../types";
import {
  GraduationCap,
  Lock,
  User as UserIcon,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Mail,
  Calendar,
  Grid3X3,
  KeyRound,
  Save,
} from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login, verify2FA } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2FA Step state
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [availableMethods, setAvailableMethods] = useState<TwoFactorMethod[]>(["passcode_grid", "totp"]);
  const [selectedMethod, setSelectedMethod] = useState<TwoFactorMethod>("passcode_grid");
  const [gridCell, setGridCell] = useState<GridCellChallenge | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [showAutoConfig, setShowAutoConfig] = useState(false);
  const [totpSecretInput, setTotpSecretInput] = useState("");
  const [gridTextInput, setGridTextInput] = useState("");
  const [save2FA, setSave2FA] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !password) {
      setError("Veuillez saisir votre identifiant ENT et votre mot de passe.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(cleanUser, password);
      if (res.requires2FA && res.challengeId) {
        setChallengeId(res.challengeId);
        const methods = res.methods && res.methods.length > 0 ? res.methods : (["passcode_grid", "totp"] as TwoFactorMethod[]);
        setAvailableMethods(methods);
        setSelectedMethod(methods.includes("passcode_grid") ? "passcode_grid" : methods[0]);
        setGridCell(res.gridCell || null);
        setOtpCode("");
      }
    } catch (err: any) {
      setError(err.message || "Échec de l'authentification ENT Unicaen.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setError(null);

    const hasAutoSecret =
      (selectedMethod === "totp" && totpSecretInput.trim().length > 0) ||
      (selectedMethod === "passcode_grid" && gridTextInput.trim().length > 0);

    if (!otpCode.trim() && !hasAutoSecret) {
      setError("Veuillez saisir le code à 6 chiffres (ou configurer votre clé / grille automatique).");
      return;
    }

    setIsSubmitting(true);
    try {
      await verify2FA({
        challengeId,
        method: selectedMethod,
        code: otpCode.trim() || undefined,
        totpSecret: selectedMethod === "totp" && totpSecretInput.trim() ? totpSecretInput.trim() : undefined,
        grid: selectedMethod === "passcode_grid" && gridTextInput.trim() ? gridTextInput.trim() : undefined,
        save2FA: hasAutoSecret ? save2FA : false,
      });
    } catch (err: any) {
      setError(err.message || "Code 2FA invalide ou expiré.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold text-lg sm:text-xl tracking-wider">
            RT
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Cartable BUT RT</h1>
            <p className="text-[11px] sm:text-xs font-semibold text-blue-600 uppercase tracking-wider">
              Campus 3 • IUT Grand Ouest Normandie
            </p>
          </div>
        </div>

        <h2 className="mt-4 sm:mt-6 text-center text-lg sm:text-xl font-bold text-slate-800">
          Connexion
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
          Tout votre espace étudiant au même endroit : emploi du temps, notes, cours, messagerie et aide aux révisions.
        </p>
      </div>

      <div className="mt-6 sm:mt-8 w-full max-w-md mx-auto">
        <div className="bg-white py-6 sm:py-8 px-4 sm:px-10 border border-slate-200 rounded-2xl shadow-sm">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 text-sm text-red-700 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Erreur de connexion</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!challengeId ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Identifiant ENT Unicaen
                </label>
                <div className="relative rounded-lg border border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Identifiant universitaire"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting}
                    className="block w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 rounded-lg focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Votre identifiant habituel de l'université
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Mot de passe ENT
                </label>
                <div className="relative rounded-lg border border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="block w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Vérification CAS Unicaen...</span>
                  </>
                ) : (
                  <>
                    <span>Accéder à mon tableau de bord</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify2FA} className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-bold text-slate-800">
                    Validation 2FA requise
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setChallengeId(null);
                    setError(null);
                    setOtpCode("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Retour</span>
                </button>
              </div>

              {/* Method switcher: Priority 1 Grille, Priority 2 TOTP */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!availableMethods.includes("passcode_grid") && availableMethods.length > 0}
                  onClick={() => {
                    setSelectedMethod("passcode_grid");
                    setError(null);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedMethod === "passcode_grid"
                      ? "bg-blue-50 border-blue-500 text-blue-700 shadow-2xs"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  } disabled:opacity-40`}
                >
                  <Grid3X3 className="w-4 h-4" />
                  <span>Grille de codes</span>
                </button>

                <button
                  type="button"
                  disabled={!availableMethods.includes("totp") && availableMethods.length > 0}
                  onClick={() => {
                    setSelectedMethod("totp");
                    setError(null);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedMethod === "totp"
                      ? "bg-blue-50 border-blue-500 text-blue-700 shadow-2xs"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  } disabled:opacity-40`}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Code TOTP</span>
                </button>
              </div>

              {selectedMethod === "passcode_grid" && gridCell && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
                      Case demandée sur votre grille
                    </p>
                    <p className="text-xs text-blue-900 mt-0.5">
                      Ligne <strong>{gridCell.row}</strong> • Colonne <strong>{gridCell.col}</strong>
                    </p>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-mono font-bold text-lg tracking-wider shadow-xs">
                    {gridCell.label}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {selectedMethod === "passcode_grid"
                    ? `Code de la case ${gridCell?.label || ""} (6 chiffres)`
                    : "Code TOTP (6 chiffres)"}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={isSubmitting}
                  className="block w-full px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Optional auto-solve configuration */}
              <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-3 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setShowAutoConfig(!showAutoConfig)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Save className="w-3.5 h-3.5 text-blue-600" />
                    <span>Connexion & synchro automatique (optionnel)</span>
                  </span>
                  <span className="text-[11px] text-blue-600">
                    {showAutoConfig ? "Masquer" : "Configurer"}
                  </span>
                </button>

                {showAutoConfig && (
                  <div className="space-y-2.5 pt-1 border-t border-slate-200/80">
                    {selectedMethod === "passcode_grid" ? (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Collez les 64 codes de votre grille 8×8 (lignes A à H) :
                        </label>
                        <textarea
                          rows={4}
                          placeholder={"272416 977520 144749 461312 604813 115834 437909 332959\n..."}
                          value={gridTextInput}
                          onChange={(e) => setGridTextInput(e.target.value)}
                          className="w-full p-2 text-[11px] font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Clé secrète TOTP (Base32 ou lien otpauth://) :
                        </label>
                        <input
                          type="text"
                          placeholder="JBSWY3DPEHPK3PXP ou otpauth://..."
                          value={totpSecretInput}
                          onChange={(e) => setTotpSecretInput(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={save2FA}
                        onChange={(e) => setSave2FA(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Mémoriser (chiffré AES-256) pour eCampus &amp; Webnotes</span>
                    </label>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validation 2FA en cours...</span>
                  </>
                ) : (
                  <>
                    <span>Valider et se connecter</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Présentation simple des fonctionnalités (sans jargon technique) */}
          <div className="mt-7 pt-5 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-[11px] text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="truncate">Emploi du temps</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-[11px] text-slate-600">
                <GraduationCap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="truncate">Notes &amp; moyennes</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-[11px] text-slate-600">
                <Mail className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <span className="truncate">Messagerie étudiante</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-[11px] text-slate-600">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="truncate">Espace privé</span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Cartable BUT RT • Campus 3 (Ifs) • Université de Caen Normandie
        </p>
      </div>
    </div>
  );
};
