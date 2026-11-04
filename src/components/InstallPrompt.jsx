import { useEffect, useState } from "react";
import { Download } from "lucide-react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [iosInstall, setIosInstall] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallEvent(event);
    }

    function handleAppInstalled() {
      setInstalled(true);
      setInstallEvent(null);
      setShowIosInstructions(false);
    }

    if (!isStandalone() && isIosDevice()) setIosInstall(true);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installEvent) {
      setShowIosInstructions((visible) => !visible);
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallEvent(null);
    } catch (error) {
      console.error("La fenêtre d’installation de TGI Manager n’a pas pu être ouverte.", error);
    }
  }

  if (installed || (!installEvent && !iosInstall)) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={installApp}
        className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-brand transition hover:border-blue-200 hover:bg-blue-100"
      >
        <Download size={15} />
        <span className="hidden sm:inline">Installer l’application</span>
        <span className="sm:hidden">Installer</span>
      </button>
      {showIosInstructions && iosInstall && (
        <div role="status" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl">
          Sur iPhone ou iPad : touchez <strong>Partager</strong> dans Safari, puis <strong>Sur l’écran d’accueil</strong>.
        </div>
      )}
    </div>
  );
}
