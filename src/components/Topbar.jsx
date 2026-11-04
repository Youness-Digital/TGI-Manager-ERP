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

const USER_PROFILES = {
  "laassasyouness5@gmail.com": {
    name: "Youness Laassas",
    role: "Commercial",
    profileKey: "salesperson",
  },
  "techniquegi39@gmail.com": {
    name: "Khalid Laassas",
    role: "Directeur Général",
    profileKey: "director",
  },
};

export default function Topbar({ activePage, onNavigate, profiles, user, onSignOut, company }) {
  const [title, subtitle] = pageTitles[activePage] || pageTitles.dashboard;
  const email = user?.email?.trim().toLocaleLowerCase("fr-FR") || "";
  const matchedProfile = USER_PROFILES[email];
  const roleProfile = matchedProfile?.profileKey ? profiles?.[matchedProfile.profileKey] : null;
  const displayName = matchedProfile?.name || user?.displayName || "Utilisateur TGI";
  const displayRole = matchedProfile?.role || "Membre de l’équipe";
  const photo = roleProfile?.photo || user?.photoURL || "";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("fr-FR");

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
        <button
          onClick={() => onNavigate("profile")}
          aria-label={`Profil de ${displayName}, ${displayRole} — ouvrir les paramètres`}
          title={`${displayName} · ${displayRole} · ${email}`}
          className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pl-1 pr-2 shadow-sm transition-all duration-200 hover:border-indigo-200 hover:shadow-md sm:gap-3 sm:pl-1.5 sm:pr-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-bold text-white ring-2 ring-indigo-100 transition group-hover:ring-indigo-200">
            {photo ? (
              <img src={photo} alt={`Photo de ${displayName}`} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[130px] truncate text-xs font-semibold text-slate-800">{displayName}</span>
            <span className="mt-0.5 block max-w-[130px] truncate text-[10px] font-medium text-slate-500">{displayRole}</span>
            <span className="hidden max-w-[150px] truncate text-[10px] text-slate-400 xl:block">{email || "E-mail non renseigné"}</span>
          </span>
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
