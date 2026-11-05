import { lazy, Suspense, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import DocumentForm from "./components/DocumentForm";
import LoginPage from "./components/LoginPage";
import ProfileSettings from "./components/ProfileSettings";
import CompanyLogo from "./components/CompanyLogo";
import Dashboard from "./pages/Dashboard";
import { NAV_LINKS } from "./components/Sidebar";
import { auth } from "./firebase";
import { companySettingsService } from "./services/dbService";

const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const AscenseursPage = lazy(() => import("./pages/AscenseursPage"));
const ContratsPage = lazy(() => import("./pages/ContratsPage"));
const InterventionsPage = lazy(() => import("./pages/InterventionsPage"));
const RecouvrementPage = lazy(() => import("./pages/RecouvrementPage"));
const BonsPage = lazy(() => import("./pages/BonsPage"));
const StockPage = lazy(() => import("./pages/StockPage"));
const EquipePage = lazy(() => import("./pages/EquipePage"));

const STORAGE_KEY = "tgi-manager-profiles-v1";

const DEFAULT_PROFILES = {
  director: { name: "Directeur", photo: "" },
  salesperson: { name: "Commercial", photo: "" },
};

const EMPTY_COMPANY = {
  name: "",
  legalName: "",
  subtitle: "",
  ice: "",
  rc: "",
  patente: "",
  siret: "",
  vatNumber: "",
  address: "",
  billingAddress: "",
  phone: "",
  email: "",
  website: "",
  logoUrl: "",
  logoPath: "",
};

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { profiles: DEFAULT_PROFILES };
    const parsed = JSON.parse(saved);
    return {
      profiles: { ...DEFAULT_PROFILES, ...parsed.profiles },
    };
  } catch (error) {
    console.error("Impossible de charger les paramètres locaux.", error);
    return { profiles: DEFAULT_PROFILES };
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [activePage, setActivePage] = useState("dashboard");
  const [profiles, setProfiles] = useState(() => loadSettings().profiles);
  const [company, setCompany] = useState(EMPTY_COMPANY);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setAuthError("");
        setAuthLoading(false);
      },
      (error) => {
        console.error("Impossible de restaurer la session Firebase.", error);
        setAuthError("La session n’a pas pu être vérifiée. Rechargez la page ou reconnectez-vous.");
        setAuthLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles }));
    } catch (error) {
      console.error("Impossible d'enregistrer les profils locaux. Vérifiez l'espace de stockage disponible.", error);
    }
  }, [profiles]);

  useEffect(() => {
    if (!user) {
      setCompanyLoading(false);
      return undefined;
    }

    let active = true;
    setCompanyLoading(true);
    setCompanyError("");
    const unsubscribe = companySettingsService.subscribe(
      (record) => {
        if (!active) return;
        const { id, updatedAt, ...fields } = record || {};
        setCompany({ ...EMPTY_COMPANY, ...fields });
        setCompanyLoading(false);
        setCompanyError("");
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les paramètres de l'entreprise depuis Firestore.", error);
        setCompanyLoading(false);
        setCompanyError("Les paramètres de l’entreprise n’ont pas pu être chargés depuis Firestore.");
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);

  async function saveCompanySettings(nextCompany) {
    setSavingCompany(true);
    setCompanyError("");
    try {
      await companySettingsService.save(nextCompany);
      setCompany((current) => ({ ...current, ...nextCompany }));
    } catch (error) {
      console.error("Impossible d'enregistrer les paramètres de l'entreprise dans Firestore.", error);
      setCompanyError("L’enregistrement Firestore a échoué. Vérifiez la connexion et les règles de sécurité.");
      throw error;
    } finally {
      setSavingCompany(false);
    }
  }

  async function handleSignOut() {
    setSignOutError("");
    try {
      await signOut(auth);
      setActivePage("dashboard");
    } catch (error) {
      console.error("La déconnexion Firebase a échoué.", error);
      setSignOutError("La déconnexion a échoué. Vérifiez votre connexion puis réessayez.");
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div role="status" className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-10 py-8 text-center shadow-xl shadow-slate-200/50">
          <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-black">
            <CompanyLogo className="h-full w-full" />
            <span className="absolute inset-0 animate-spin rounded-xl border-2 border-transparent border-t-indigo-400" />
          </span>
          <span className="text-sm font-semibold text-slate-700">Vérification de votre session…</span>
          <span className="text-xs text-slate-400">Connexion sécurisée à TGI Manager</span>
        </div>
      </main>
    );
  }

  if (!user) return <LoginPage initialError={authError} />;

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[#f6f7fb] text-slate-800">
      <Sidebar activePage={activePage} onNavigate={setActivePage} profiles={profiles} company={company} />
      <div className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain">
        <Topbar activePage={activePage} onNavigate={setActivePage} profiles={profiles} user={user} onSignOut={handleSignOut} company={company} />
        {signOutError && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 md:mx-8">{signOutError}</p>}
        <nav aria-label="Navigation principale" className="sticky top-[76px] z-[9] flex gap-1 overflow-x-auto border-b border-slate-200/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur lg:hidden">
          {NAV_LINKS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              aria-current={activePage === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 ${activePage === id ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-[1450px] flex-1 px-4 py-5 md:px-8 md:py-7">
          <div key={activePage} className="page-enter">
          {activePage === "dashboard" && <Dashboard onNavigate={setActivePage} />}
          {activePage === "clients" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module clients…</div>}>
              <ClientsPage profiles={profiles} company={company} />
            </Suspense>
          )}
          {activePage === "ascenseurs" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du parc ascenseurs…</div>}>
              <AscenseursPage />
            </Suspense>
          )}
          {activePage === "contrats" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module contrats…</div>}>
              <ContratsPage profiles={profiles} company={company} />
            </Suspense>
          )}
          {activePage === "interventions" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module interventions…</div>}>
              <InterventionsPage profiles={profiles} company={company} />
            </Suspense>
          )}
          {activePage === "recouvrement" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module recouvrement…</div>}>
              <RecouvrementPage profiles={profiles} company={company} />
            </Suspense>
          )}
          {activePage === "bons" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module des bons…</div>}>
              <BonsPage profiles={profiles} company={company} />
            </Suspense>
          )}
          {activePage === "stock" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module stock…</div>}>
              <StockPage company={company} />
            </Suspense>
          )}
          {activePage === "equipe" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module équipe…</div>}>
              <EquipePage company={company} />
            </Suspense>
          )}
          {activePage === "documents" && <DocumentForm profiles={profiles} company={company} />}
          {activePage === "profile" && (
            <ProfileSettings
              profiles={profiles}
              company={company}
              companyLoading={companyLoading}
              companyError={companyError}
              savingCompany={savingCompany}
              onProfilesChange={setProfiles}
              onCompanyChange={setCompany}
              onSaveCompany={saveCompanySettings}
            />
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
