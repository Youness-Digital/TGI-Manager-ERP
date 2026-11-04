import { lazy, Suspense, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import DocumentForm from "./components/DocumentForm";
import ProfileSettings from "./components/ProfileSettings";
import Dashboard from "./pages/Dashboard";
import { NAV_LINKS } from "./components/Sidebar";
import { companySettingsService } from "./services/dbService";

const ClientsPage = lazy(() => import("./pages/ClientsPage"));
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
  const [activePage, setActivePage] = useState("dashboard");
  const [profiles, setProfiles] = useState(() => loadSettings().profiles);
  const [company, setCompany] = useState(EMPTY_COMPANY);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles }));
    } catch (error) {
      console.error("Impossible d'enregistrer les profils locaux. Vérifiez l'espace de stockage disponible.", error);
    }
  }, [profiles]);

  useEffect(() => {
    let active = true;
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
  }, []);

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

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar activePage={activePage} onNavigate={setActivePage} profiles={profiles} />
      <div className="min-h-screen lg:pl-[248px]">
        <Topbar activePage={activePage} onNavigate={setActivePage} profiles={profiles} />
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-4 py-2 lg:hidden">
          {NAV_LINKS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              aria-current={activePage === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${activePage === id ? "bg-blue-50 text-brand" : "text-slate-500"}`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </nav>
        <main className="mx-auto max-w-[1450px] px-4 py-6 md:px-8 md:py-8">
          {activePage === "dashboard" && <Dashboard onNavigate={setActivePage} />}
          {activePage === "clients" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module clients…</div>}>
              <ClientsPage profiles={profiles} company={company} />
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
              <StockPage />
            </Suspense>
          )}
          {activePage === "equipe" && (
            <Suspense fallback={<div className="flex min-h-56 items-center justify-center text-sm text-muted">Chargement du module équipe…</div>}>
              <EquipePage />
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
        </main>
      </div>
    </div>
  );
}
