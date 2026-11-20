import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-white border border-blue-200 rounded-2xl p-3 shadow-lg flex items-center gap-3 max-w-xs">
      <img src="/icon-192.png" alt="Backpack" className="w-9 h-9 rounded-xl shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-900 truncate">Installer Backpack</p>
        <p className="text-[11px] text-slate-500 truncate">Ouvrir comme une vraie app</p>
      </div>
      <button
        onClick={handleInstall}
        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Installer</span>
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
        aria-label="Fermer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
