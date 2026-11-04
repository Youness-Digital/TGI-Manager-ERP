import { useEffect, useState } from "react";
import { Download, Info, X } from "lucide-react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function getInstallInstructions() {
  if (isIosDevice()) {
    return {
      title: "Installer sur iPhone ou iPad",
      steps: "Ouvrez ce site dans Safari, touchez Partager, puis « Sur l’écran d’accueil » et confirmez avec Ajouter.",
    };
  }

  const userAgent = window.navigator.userAgent;
  if (/android/i.test(userAgent)) {
    return {
      title: "Installer sur Android",
      steps: "Dans Chrome, ouvrez le menu ⋮ puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».",
    };
  }

  return {
    title: "Installer sur ordinateur",
    steps: "Dans Chrome ou Edge, utilisez l’icône Installer dans la barre d’adresse. Sinon, ouvrez le menu du navigateur et choisissez « Installer TGI Manager ».",
  };
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const instructions = getInstallInstructions();

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallEvent(event);
    }

    function handleAppInstalled() {
      setInstalled(true);
      setInstallEvent(null);
      setShowInstructions(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installEvent) {
      setShowInstructions((visible) => !visible);
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      } else {
        setShowInstructions(true);
      }
      setInstallEvent(null);
    } catch (error) {
      console.error("La fenêtre d’installation de TGI Manager n’a pas pu être ouverte.", error);
      setShowInstructions(true);
      setInstallEvent(null);
    }
  }

  if (installed) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={installApp}
        aria-expanded={showInstructions}
        aria-controls="install-instructions"
        className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-brand transition hover:border-blue-200 hover:bg-blue-100"
      >
        <Download size={15} />
        <span className="hidden sm:inline">Installer l’application</span>
        <span className="sm:hidden">Installer</span>
      </button>
      {showInstructions && (
        <div id="install-instructions" role="status" className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-4 text-xs leading-5 text-slate-600 shadow-xl">
          <div className="flex items-start gap-2.5">
            <Info size={16} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">{instructions.title}</p>
              <p className="mt-1">{instructions.steps}</p>
              <p className="mt-2 text-[10px] text-slate-400">L’installation nécessite le site en HTTPS (ou localhost pour les tests) et un navigateur compatible.</p>
            </div>
            <button type="button" onClick={() => setShowInstructions(false)} aria-label="Fermer les instructions" className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
