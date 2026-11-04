import { LogOut, Plus } from "lucide-react";
import InstallPrompt from "./InstallPrompt";
import CompanyLogo from "./CompanyLogo";

const pageTitles = {
  dashboard: ["Vue d'ensemble", "Suivez votre activité et vos documents en un coup d'œil."],
  clients: ["Clients", "Gérez les fiches et les coordonnées de vos clients."],
  recouvrement: ["Recouvrement", "Suivez les paiements et les échéances clients."],
  contrats: ["Contrats", "Centralisez vos contrats d'installation et d'intervention."],
  interventions: ["Interventions", "Suivez les visites et travaux de vos techniciens."],
  bons: ["Bons de commande & livraison", "Gérez les commandes fournisseurs et les livraisons."],
  stock: ["Gestion du stock", "Suivez les pièces détachées et leurs disponibilités."],
  equipe: ["Équipe technique", "Gérez le personnel affecté aux interventions."],
  documents: ["Devis & factures", "Créez des devis et factures prêts à envoyer."],
  profile: ["Paramètres", "Personnalisez les coordonnées et photos de votre équipe."],
};

export default function Topbar({ activePage, onNavigate, profiles, user, onSignOut, company }) {
  const [title, subtitle] = pageTitles[activePage] || pageTitles.dashboard;
  const director = profiles?.director || { name: "Directeur", photo: "" };
  return (
    <header className="sticky top-0 z-10 flex min-h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] backdrop-blur-xl md:px-9">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-black shadow-sm sm:flex">
            <CompanyLogo src={company?.logoUrl} className="h-full w-full" />
          </div>
          <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="hidden h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)] sm:inline-block" />
          <h1 className="truncate text-[18px] font-semibold tracking-tight text-slate-900">{title}</h1>
        </div>
        <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <InstallPrompt />
        <button
          onClick={() => onNavigate("documents")}
          className="hidden items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md sm:flex"
        >
          <Plus size={16} /> Nouveau document
        </button>
        <span className="hidden max-w-[180px] truncate text-xs text-slate-500 xl:block" title={user?.email}>{user?.email}</span>
        <button
          onClick={() => onNavigate("profile")}
          aria-label="Ouvrir les paramètres du profil"
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-gradient-to-br from-indigo-50 to-slate-100 text-sm font-bold text-indigo-700 transition-all duration-200 hover:ring-4 hover:ring-indigo-100"
        >
          {director.photo ? (
            <img src={director.photo} alt={director.name} className="h-full w-full object-cover" />
          ) : (
            director.name?.slice(0, 1) || "D"
          )}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
