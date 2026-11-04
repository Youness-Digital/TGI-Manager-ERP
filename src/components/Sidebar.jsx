import {
  BarChart3,
  Box,
  ClipboardList,
  FileText,
  HandCoins,
  LayoutDashboard,
  Settings,
  Users,
  Wrench,
} from "lucide-react";

export const NAV_LINKS = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "clients", label: "Clients", Icon: Users },
  { id: "recouvrement", label: "Recouvrement", Icon: HandCoins },
  { id: "contrats", label: "Contrats", Icon: FileText },
  { id: "interventions", label: "Interventions", Icon: Wrench },
  { id: "bons", label: "Bons", Icon: ClipboardList },
  { id: "stock", label: "Stock", Icon: Box },
  { id: "equipe", label: "Équipe", Icon: Users },
  { id: "documents", label: "Devis & factures", Icon: BarChart3 },
  { id: "profile", label: "Paramètres", Icon: Settings },
];

export default function Sidebar({ activePage, onNavigate, profiles }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-line bg-white px-5 py-6 lg:flex">
      <button onClick={() => onNavigate("dashboard")} className="mb-9 flex items-center gap-3 px-1 text-left">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-lg shadow-blue-200">
          <span className="text-sm font-extrabold tracking-tight">TGI</span>
        </div>
        <div>
          <div className="text-[15px] font-extrabold tracking-tight text-ink">TGI Manager</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ascenseurs</div>
        </div>
      </button>

      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Gestion</p>
      <nav aria-label="Navigation principale" className="space-y-1">
        {NAV_LINKS.map(({ id, label, Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition ${
                active ? "bg-blue-50 text-brand" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
              }`}
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl bg-slate-50 p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Équipe référente</p>
        <div className="flex -space-x-2">
          {[profiles.director, profiles.salesperson].map((person, index) => (
            <div key={index} className="h-8 w-8 overflow-hidden rounded-full border-2 border-white bg-slate-200">
              {person.photo ? (
                <img src={person.photo} alt={person.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                  {person.name?.slice(0, 1) || (index === 0 ? "D" : "C")}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-ink">Équipe TGI</p>
        <p className="mt-0.5 text-[10px] text-slate-400">Informations appliquées aux PDF</p>
      </div>
    </aside>
  );
}
