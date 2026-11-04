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
import CompanyLogo from "./CompanyLogo";

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

export default function Sidebar({ activePage, onNavigate, profiles, company }) {
  const director = profiles?.director || { name: "Directeur", photo: "" };
  const salesperson = profiles?.salesperson || { name: "Commercial", photo: "" };

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r border-white/[0.07] bg-[#10172a] px-4 py-5 text-white lg:flex">
      <button onClick={() => onNavigate("dashboard")} className="mb-8 flex items-center gap-3 rounded-xl px-2 py-1 text-left transition-all duration-200 hover:bg-white/[0.04]">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg shadow-black/20">
          <CompanyLogo src={company?.logoUrl} className="h-full w-full" />
        </div>
        <div>
          <div className="text-[14px] font-bold tracking-tight text-white">{company?.name || "TGI Ascenseurs"}</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Manager · ERP</div>
        </div>
      </button>

      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Espace de travail</p>
      <nav aria-label="Navigation principale" className="space-y-1">
        {NAV_LINKS.map(({ id, label, Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={active ? "page" : undefined}
              className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[12px] font-semibold transition-all duration-200 hover:translate-x-0.5 ${
                active ? "border-indigo-400/20 bg-indigo-500/15 text-indigo-200 shadow-inner shadow-indigo-950/10" : "border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "bg-indigo-400/15" : "bg-transparent group-hover:bg-white/[0.04]"}`}>
                <Icon size={16} strokeWidth={1.8} className={active ? "text-indigo-200" : "text-slate-500 group-hover:text-slate-300"} />
              </span>
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_10px_rgba(165,180,252,0.7)]" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Équipe référente</p>
        <div className="flex -space-x-2">
          {[director, salesperson].map((person, index) => (
            <div key={index} className="h-8 w-8 overflow-hidden rounded-full border-2 border-[#151d31] bg-slate-700">
              {person.photo ? (
                <img src={person.photo} alt={person.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-300">
                  {person.name?.slice(0, 1) || (index === 0 ? "D" : "C")}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-200">Équipe TGI</p>
        <p className="mt-0.5 text-[10px] text-slate-500">Profils utilisés dans les documents</p>
      </div>
    </aside>
  );
}
