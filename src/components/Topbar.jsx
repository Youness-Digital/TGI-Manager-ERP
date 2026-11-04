import { Plus } from "lucide-react";
import InstallPrompt from "./InstallPrompt";

const pageTitles = {
  dashboard: ["Vue d'ensemble", "Suivez votre activité et vos documents en un coup d'œil."],
  clients: ["Clients", "Gérez les fiches et les coordonnées de vos clients."],
  recouvrement: ["Recouvrement", "Suivez les paiements et les échéances clients."],
  contrats: ["Contrats", "Centralisez vos contrats d'installation et d'intervention."],
  interventions: ["Interventions", "Suivez les visites et travaux de vos techniciens."],
  bons: ["Bons de commande & livraison", "Gérez les commandes fournisseurs et les livraisons."],
  documents: ["Devis & factures", "Créez des devis et factures prêts à envoyer."],
  profile: ["Paramètres", "Personnalisez les coordonnées et photos de votre équipe."],
};

export default function Topbar({ activePage, onNavigate, profiles }) {
  const [title, subtitle] = pageTitles[activePage];
  const director = profiles.director;
  return (
    <header className="sticky top-0 z-10 flex min-h-[84px] items-center justify-between border-b border-line bg-white/90 px-5 backdrop-blur md:px-9">
      <div className="min-w-0">
        <h1 className="truncate text-[19px] font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 hidden text-xs text-muted sm:block">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <InstallPrompt />
        <button
          onClick={() => onNavigate("documents")}
          className="hidden items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark sm:flex"
        >
          <Plus size={16} /> Nouveau document
        </button>
        <button
          onClick={() => onNavigate("profile")}
          aria-label="Ouvrir les paramètres du profil"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-line bg-slate-100 text-sm font-bold text-brand"
        >
          {director.photo ? (
            <img src={director.photo} alt={director.name} className="h-full w-full object-cover" />
          ) : (
            director.name?.slice(0, 1) || "D"
          )}
        </button>
      </div>
    </header>
  );
}
