import React, { useState, useRef } from "react";
import { User, TwoFactorMethod } from "../types";
import { api } from "../services/api";
import {
  X,
  User as UserIcon,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Bookmark,
  Calendar,
  Shield,
  LogOut,
  RefreshCw,
  HardDrive,
  FileCheck,
  HelpCircle,
  FolderUp,
  Grid3X3,
  KeyRound,
  Save,
} from "lucide-react";

interface AccountModalProps {
  user: User;
  onClose: () => void;
  onDataReload?: () => void;
  onLogout?: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  user,
  onClose,
  onDataReload,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<"backup" | "2fa" | "danger">("backup");

  // 2FA Security Settings State
  const [preferred2FA, setPreferred2FA] = useState<TwoFactorMethod>(
    user.twoFactor?.preferredMethod || "passcode_grid"
  );
  const [hasGrid, setHasGrid] = useState<boolean>(Boolean(user.twoFactor?.hasGrid));
  const [hasTotp, setHasTotp] = useState<boolean>(Boolean(user.twoFactor?.hasTotp));
  const [gridInput, setGridInput] = useState("");
  const [totpInput, setTotpInput] = useState("");
  const [saving2FA, setSaving2FA] = useState(false);
  const [msg2FA, setMsg2FA] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Backup Download State
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Backup Import State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [importing, setImporting] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset Data State
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  // Delete Account State
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [confirmUsernameInput, setConfirmUsernameInput] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  // 1. Download Backup
  const handleDownloadBackup = async () => {
    setDownloading(true);
    setDownloadSuccess(false);
    try {
      await api.downloadBackupDirectly();
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err: any) {
      alert("Erreur lors du téléchargement de la sauvegarde : " + err.message);
    } finally {
      setDownloading(false);
    }
  };

  // 2. Select File for Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setImportSuccessMsg(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const json = JSON.parse(text);

        // Validation
        const target = json.data ? json.data : json;
        if (!target.notes && !target.stickyNotes && !target.lessons && !target.resources) {
          setParseError("Le fichier sélectionné ne contient pas de données Cartable Numérique valides.");
          setParsedBackup(null);
          return;
        }

        setParsedBackup(json);
      } catch (err) {
        setParseError("Format JSON invalide ou fichier corrompu.");
        setParsedBackup(null);
      }
    };
    reader.readAsText(file);
  };

  // 3. Confirm Import
  const handleConfirmImport = async () => {
    if (!parsedBackup) return;
    setImporting(true);
    setImportSuccessMsg(null);
    setParseError(null);
    try {
      const res = await api.importBackup({
        backupData: parsedBackup,
        mode: importMode,
      });
      setImportSuccessMsg(res.message);
      setSelectedFile(null);
      setParsedBackup(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (onDataReload) onDataReload();
    } catch (err: any) {
      setParseError(err.message || "Erreur lors de l'importation.");
    } finally {
      setImporting(false);
    }
  };

  // 4. Reset User Data
  const handleResetUserData = async () => {
    setResetting(true);
    try {
      const res = await api.resetUserData();
      setResetSuccessMsg(res.message);
      setShowResetConfirm(false);
      if (onDataReload) onDataReload();
      setTimeout(() => setResetSuccessMsg(null), 5000);
    } catch (err: any) {
      alert("Erreur lors de la réinitialisation : " + err.message);
    } finally {
      setResetting(false);
    }
  };

  // 5. Delete Account
  const handleDeleteAccount = async () => {
    if (confirmUsernameInput.trim().toLowerCase() !== user.username.toLowerCase()) {
      setDeleteAccountError(`Veuillez saisir exactement "${user.username}" pour confirmer.`);
      return;
    }
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await api.deleteAccount(confirmUsernameInput.trim());
      alert("Votre compte et toutes vos données ont été définitivement supprimés.");
      if (onLogout) {
        onLogout();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setDeleteAccountError(err.message || "Erreur lors de la suppression du compte.");
      setDeletingAccount(false);
    }
  };

  // 6. Save 2FA Config
  const handleSave2FA = async (opts?: { clearGrid?: boolean; clearTotp?: boolean }) => {
    setSaving2FA(true);
    setMsg2FA(null);
    try {
      const res = await api.update2FAConfig({
        preferredMethod: preferred2FA,
        grid: !opts?.clearGrid && gridInput.trim() ? gridInput.trim() : undefined,
        totpSecret: !opts?.clearTotp && totpInput.trim() ? totpInput.trim() : undefined,
        clearGrid: opts?.clearGrid,
        clearTotp: opts?.clearTotp,
      });
      if (res.user?.twoFactor) {
        setHasGrid(res.user.twoFactor.hasGrid);
        setHasTotp(res.user.twoFactor.hasTotp);
        setPreferred2FA(res.user.twoFactor.preferredMethod);
      }
      if (!opts?.clearGrid) setGridInput("");
      if (!opts?.clearTotp) setTotpInput("");
      setMsg2FA({ type: "ok", text: "Configuration 2FA enregistrée (chiffrée AES-256)." });
    } catch (err: any) {
      setMsg2FA({ type: "err", text: err.message || "Erreur sauvegarde 2FA" });
    } finally {
      setSaving2FA(false);
    }
  };

  // Helpers to count elements in parsed backup
  const targetParsedData = parsedBackup ? (parsedBackup.data ? parsedBackup.data : parsedBackup) : null;
  const countNotes = targetParsedData?.notes?.length ?? 0;
  const countStickies = targetParsedData?.stickyNotes?.length ?? 0;
  const countLessons = targetParsedData?.lessons?.length ?? 0;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        {/* Header Profil */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0 uppercase">
              {user.name ? user.name.charAt(0) : user.username.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  {user.name || user.username}
                </h3>
                {user.role === "admin" ? (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                    Admin
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-600 bg-slate-200/80 px-1.5 py-0.5 rounded">
                    Étudiant
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-slate-600">{user.username}</span>
                <span>•</span>
                <span>{user.department || "BUT RT Campus 3"}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors shrink-0 cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-4 pt-2 gap-2 shrink-0">
          <button
            onClick={() => setActiveTab("backup")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "backup"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Sauvegardes & Import</span>
          </button>

          <button
            onClick={() => setActiveTab("2fa")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "2fa"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Sécurité &amp; 2FA</span>
          </button>

          <button
            onClick={() => setActiveTab("danger")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "danger"
                ? "border-rose-600 text-rose-700"
                : "border-transparent text-slate-500 hover:text-rose-600"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Gestion & Suppression</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {resetSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resetSuccessMsg}</span>
            </div>
          )}

          {activeTab === "backup" && (
            <div className="space-y-4">
              {/* Card 1: Télécharger une sauvegarde */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-200 transition-colors space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                        Télécharger une sauvegarde de mes données
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Exportez l'ensemble de vos notes de cours (CM & TP), vos pense-bêtes post-it et les tâches de votre cahier de texte dans un fichier <code className="text-slate-700 bg-slate-100 px-1 py-0.2 rounded font-mono text-[11px]">.json</code> portable.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleDownloadBackup}
                    disabled={downloading}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {downloading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Génération en cours...</span>
                      </>
                    ) : downloadSuccess ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Sauvegarde téléchargée !</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger le fichier de sauvegarde</span>
                      </>
                    )}
                  </button>

                  <span className="text-[11px] text-slate-400">
                    Format universel JSON, lisible et restaurable à tout moment.
                  </span>
                </div>
              </div>

              {/* Card 2: Importer une sauvegarde */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-200 transition-colors space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      Importer et restaurer une sauvegarde
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Sélectionnez un fichier <code className="text-slate-700 bg-slate-100 px-1 py-0.2 rounded font-mono text-[11px]">.json</code> pour réinjecter vos données sur votre compte Cartable Numérique.
                    </p>
                  </div>
                </div>

                {/* File picker input */}
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-3.5 text-center bg-slate-50/50 hover:bg-slate-50 hover:border-emerald-300 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                    id="backup-file-upload"
                  />
                  <label
                    htmlFor="backup-file-upload"
                    className="cursor-pointer flex flex-col items-center justify-center gap-1.5 py-1"
                  >
                    <FolderUp className="w-6 h-6 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-700 hover:text-emerald-700">
                      {selectedFile ? selectedFile.name : "Cliquez ici pour choisir un fichier de sauvegarde (.json)"}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} Ko`
                        : "Sélectionnez votre fichier .json Cartable"}
                    </span>
                  </label>
                </div>

                {/* Parsed summary */}
                {parsedBackup && (
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
                      <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Fichier de sauvegarde analysé avec succès :</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs py-1">
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <span className="block font-bold text-slate-900 text-sm">{countNotes}</span>
                        <span className="text-[10.5px] text-slate-500">Note{countNotes > 1 ? "s" : ""}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <span className="block font-bold text-slate-900 text-sm">{countStickies}</span>
                        <span className="text-[10.5px] text-slate-500">Pense-bête{countStickies > 1 ? "s" : ""}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <span className="block font-bold text-slate-900 text-sm">{countLessons}</span>
                        <span className="text-[10.5px] text-slate-500">Leçon{countLessons > 1 ? "s" : ""}</span>
                      </div>
                    </div>

                    {/* Mode selection */}
                    <div className="pt-2 border-t border-emerald-200/60 flex items-center gap-4 text-xs">
                      <span className="font-semibold text-slate-700 text-[11px]">Mode :</span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "replace"}
                          onChange={() => setImportMode("replace")}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Remplacer tout</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "merge"}
                          onChange={() => setImportMode("merge")}
                          className="text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Fusionner</span>
                      </label>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleConfirmImport}
                        disabled={importing}
                        className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {importing ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Restauration en cours...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Confirmer et restaurer ces données</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {parseError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{parseError}</span>
                  </div>
                )}

                {importSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{importSuccessMsg}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "2fa" && (
            <div className="space-y-4">
              {msg2FA && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    msg2FA.type === "ok"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  {msg2FA.type === "ok" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{msg2FA.text}</span>
                </div>
              )}

              {/* Priority method */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    Méthode 2FA prioritaire (Bridge CAS Unicaen)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Utilisée automatiquement pour la connexion et la synchronisation eCampus / Webnotes.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPreferred2FA("passcode_grid")}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      preferred2FA === "passcode_grid"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-800"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Grid3X3 className="w-4 h-4" />
                      <span>1. Grille de codes</span>
                    </span>
                    {hasGrid && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
                        Actif
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferred2FA("totp")}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      preferred2FA === "totp"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-800"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4" />
                      <span>2. Code TOTP</span>
                    </span>
                    {hasTotp && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
                        Actif
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Grid 8x8 config */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Grid3X3 className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      Grille de codes (8×8 : A1 à H8)
                    </h4>
                  </div>
                  {hasGrid && (
                    <button
                      type="button"
                      onClick={() => handleSave2FA({ clearGrid: true })}
                      className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Effacer la grille
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {hasGrid
                    ? "Une grille est déjà enregistrée et chiffrée. Collez-en une nouvelle ci-dessous pour la remplacer."
                    : "Collez les 64 codes (6 chiffres) de votre grille Unicaen, ligne par ligne (A à H)."}
                </p>
                <textarea
                  rows={4}
                  placeholder={"272416 977520 144749 461312 604813 115834 437909 332959\n409512 428226 ..."}
                  value={gridInput}
                  onChange={(e) => setGridInput(e.target.value)}
                  className="w-full p-2.5 text-[11px] font-mono border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* TOTP Secret config */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      Secret TOTP (Application d'authentification)
                    </h4>
                  </div>
                  {hasTotp && (
                    <button
                      type="button"
                      onClick={() => handleSave2FA({ clearTotp: true })}
                      className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Effacer le secret
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {hasTotp
                    ? "Un secret TOTP est déjà enregistré et chiffré. Saisissez une nouvelle clé pour la remplacer."
                    : "Saisissez votre clé secrète Base32 ou votre URI otpauth://totp/..."}
                </p>
                <input
                  type="text"
                  placeholder="JBSWY3DPEHPK3PXP ou otpauth://totp/..."
                  value={totpInput}
                  onChange={(e) => setTotpInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSave2FA()}
                disabled={saving2FA}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving2FA ? "Enregistrement..." : "Enregistrer la configuration 2FA"}</span>
              </button>
            </div>
          )}

          {activeTab === "danger" && (
            <div className="space-y-4">
              {/* Action 1: Réinitialiser toutes mes données */}
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      Supprimer et réinitialiser toutes mes données
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Efface l'intégralité de vos notes de cours (CM, TP), vos pense-bêtes et votre agenda de révisions. Vos identifiants ENT et votre compte restent opérationnels.
                    </p>
                  </div>
                </div>

                {!showResetConfirm ? (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer mes notes et données</span>
                  </button>
                ) : (
                  <div className="p-3 bg-white border border-rose-300 rounded-xl space-y-2 animate-in fade-in duration-150">
                    <p className="text-xs font-semibold text-rose-900">
                      ⚠️ Êtes-vous certain de vouloir supprimer toutes vos données ? Cette action est irréversible (pensez à télécharger une sauvegarde au préalable).
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleResetUserData}
                        disabled={resetting}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {resetting ? "Suppression en cours..." : "Oui, supprimer définitivement mes données"}
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action 2: Supprimer définitivement mon compte (RGPD) */}
              <div className="p-4 rounded-xl border border-red-300 bg-red-50/60 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-red-600 text-white shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-red-950">
                      Supprimer mon compte et mes données (RGPD)
                    </h4>
                    <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
                      Conformément à la réglementation RGPD et aux conditions d'utilisation, cette action supprime votre profil étudiant, révoque vos sessions et détruit intégralement votre répertoire personnel sur le serveur.
                    </p>
                  </div>
                </div>

                {!showDeleteAccountModal ? (
                  <button
                    onClick={() => {
                      setShowDeleteAccountModal(true);
                      setConfirmUsernameInput("");
                      setDeleteAccountError(null);
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Supprimer définitivement mon compte</span>
                  </button>
                ) : (
                  <div className="p-3.5 bg-white border border-red-400 rounded-xl space-y-3 animate-in fade-in duration-150">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-red-900">
                        Confirmation de sécurité obligatoire
                      </p>
                      <p className="text-xs text-slate-600">
                        Pour confirmer la destruction définitive de votre compte et de vos données, veuillez saisir votre identifiant ENT ci-dessous :
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Votre identifiant : <span className="font-mono text-red-600 font-bold">{user.username}</span>
                      </label>
                      <input
                        type="text"
                        placeholder={user.username}
                        value={confirmUsernameInput}
                        onChange={(e) => setConfirmUsernameInput(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    {deleteAccountError && (
                      <p className="text-xs text-red-600 font-semibold">{deleteAccountError}</p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deletingAccount || confirmUsernameInput.trim().toLowerCase() !== user.username.toLowerCase()}
                        className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        {deletingAccount ? "Destruction du compte..." : "Confirmer la suppression irréversible"}
                      </button>
                      <button
                        onClick={() => setShowDeleteAccountModal(false)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {onLogout && (
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Se déconnecter</span>
              </button>
            )}
            <a
              href="http://localhost:3002"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1"
              title="Ouvrir le tableau de bord local de performance et tests autonomes"
            >
              <span>📊 Tests &amp; Performances ↗</span>
            </a>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
