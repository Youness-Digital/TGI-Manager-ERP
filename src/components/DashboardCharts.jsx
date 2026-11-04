import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight } from "lucide-react";

const PIE_COLORS = ["#f59e0b", "#10b981"];

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTrend(value) {
  if (value >= 10000) return `${Math.round(value / 1000)} k€`;
  if (value >= 1000) return `${(value / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€`;
  return formatCurrency(value);
}

function PanelTitle({ eyebrow, title }) {
  return (
    <div className="border-b border-slate-100 px-5 py-4 md:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">{title}</h2>
    </div>
  );
}

function EmptyChart({ children }) {
  return <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-slate-500">{children}</div>;
}

export default function DashboardCharts({
  monthlyPayments,
  interventionBreakdown,
  ongoingCount,
  finishedCount,
  hasInterventions,
  onNavigate,
}) {
  return (
    <section aria-label="Analyses" className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
      <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg shadow-slate-200/50">
        <PanelTitle eyebrow="Trésorerie" title="Évolution des paiements" />
        {monthlyPayments.some((month) => month.total > 0) ? (
          <div className="h-[300px] px-2 pb-4 pt-5 sm:px-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyPayments} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="paymentBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.78} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={8} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(value) => value === 0 ? "0" : formatTrend(value)}
                  width={58}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  formatter={(value) => [formatCurrency(Number(value)), "Paiements"]}
                  labelFormatter={(label) => `Mois : ${label}`}
                  contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 8px 24px rgba(15, 23, 42, .08)", fontSize: 12 }}
                />
                <Bar dataKey="total" name="Paiements" fill="url(#paymentBarGradient)" radius={[7, 7, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart>Aucun paiement daté sur les six derniers mois.</EmptyChart>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs">
          <span className="text-slate-500">Période affichée : 6 derniers mois</span>
          <button type="button" onClick={() => onNavigate("recouvrement")} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-800">
            Voir les paiements <ArrowRight size={13} />
          </button>
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg shadow-slate-200/50">
        <PanelTitle eyebrow="Équipe terrain" title="État des interventions" />
        {hasInterventions ? (
          <>
            <div className="h-[260px] px-3 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={interventionBreakdown}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="46%"
                    innerRadius={62}
                    outerRadius={94}
                    paddingAngle={4}
                    cornerRadius={5}
                    stroke="none"
                  >
                    {interventionBreakdown.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} intervention${Number(value) > 1 ? "s" : ""}`, name]}
                    contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 8px 24px rgba(15, 23, 42, .08)", fontSize: 12 }}
                  />
                  <Legend verticalAlign="bottom" iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-slate-600">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mx-5 mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-amber-50/80 p-3"><p className="text-xs text-amber-700">En cours</p><p className="mt-1 text-xl font-bold text-amber-800">{ongoingCount}</p></div>
              <div className="rounded-xl bg-emerald-50/80 p-3"><p className="text-xs text-emerald-700">Terminées</p><p className="mt-1 text-xl font-bold text-emerald-800">{finishedCount}</p></div>
            </div>
          </>
        ) : (
          <EmptyChart>Aucune intervention à répartir pour le moment.</EmptyChart>
        )}
      </article>
    </section>
  );
}
