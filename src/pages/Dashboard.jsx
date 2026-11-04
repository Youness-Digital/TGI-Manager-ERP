import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AlertCircle,
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FilePlus2,
  HandCoins,
  LoaderCircle,
  UsersRound,
  Wrench,
} from "lucide-react";
import {
  clientsService,
  contratsService,
  interventionsService,
  paiementsService,
} from "../services/dbService";

const EMPTY_DATA = {
  clients: [],
  contracts: [],
  interventions: [],
  payments: [],
};

const EMPTY_ERRORS = {
  clients: "",
  contracts: "",
  interventions: "",
  payments: "",
};

const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const AnalyticsCharts = lazy(() => import("../components/DashboardCharts"));
const STATUS_STYLES = {
  active: "bg-amber-50 text-amber-700 ring-amber-200",
  finished: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function getDate(value) {
  if (!value) return null;
  const date = typeof value?.toDate === "function"
    ? value.toDate()
    : value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : typeof value === "object" && Number.isFinite(value.seconds)
          ? new Date(value.seconds * 1000)
          : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getActivityDate(record) {
  return getDate(record.updatedAt)
    || getDate(record.createdAt)
    || getDate(record.date)
    || getDate(record.interventionDate);
}

function isFinished(intervention) {
  const status = String(intervention.status || intervention.statut || "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["termine", "terminee", "finished", "complete", "completed", "done", "closed", "cloture", "cloturee"]
    .includes(status);
}

function isUrgent(intervention) {
  const priority = String(intervention.priority || intervention.priorite || "").toLocaleLowerCase("fr-FR");
  return ["urgent", "critique", "haute", "high", "critical"].some((value) => priority.includes(value));
}

function getOverdueReason(client) {
  const paymentStatus = String(client.paymentStatus || client.statutPaiement || "").toLocaleLowerCase("fr-FR");
  const balance = Number(client.balanceDue ?? client.amountDue ?? client.remainingAmount);
  const dueDate = getDate(client.dueDate);
  const lateStatus = ["retard", "impay", "overdue", "late"].some((value) => paymentStatus.includes(value));
  const unpaidBalanceOverdue = Number.isFinite(balance)
    && balance > 0
    && dueDate
    && dueDate < new Date();
  if (!lateStatus && !unpaidBalanceOverdue) return null;

  const details = [];
  if (Number.isFinite(balance) && balance > 0) details.push(formatCurrency(balance));
  if (dueDate) details.push(`échéance ${formatDate(dueDate)}`);
  return details.join(" · ") || "Paiement à régulariser";
}

function formatDate(value) {
  const date = getDate(value);
  return date
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date)
    : "—";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function makeMonthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function getRecordMonth(record) {
  const date = getDate(record.createdAt) || getDate(record.date) || getDate(record.interventionDate);
  return date ? makeMonthKey(date) : null;
}

function buildMonthlyPayments(payments, now = new Date()) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: makeMonthKey(date),
      label: MONTH_LABEL.format(date).replace(".", ""),
      total: 0,
    };
  });
  const monthMap = new Map(months.map((month) => [month.key, month]));

  payments.forEach((payment) => {
    const date = getDate(payment.date) || getDate(payment.paidAt) || getDate(payment.createdAt);
    if (!date) return;
    const month = monthMap.get(makeMonthKey(date));
    const amount = Number(payment.amount ?? payment.montant ?? payment.paidAmount);
    if (month && Number.isFinite(amount)) month.total += amount;
  });

  return months;
}

function monthOverMonth(records, now = new Date(), amountSelector = () => 1) {
  const currentMonth = makeMonthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const previousMonth = makeMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const totals = records.reduce((result, record) => {
    const month = getRecordMonth(record);
    if (month === currentMonth) result.current += amountSelector(record);
    if (month === previousMonth) result.previous += amountSelector(record);
    return result;
  }, { current: 0, previous: 0 });

  if (totals.previous === 0) {
    return totals.current > 0
      ? { label: `+${totals.current} ce mois`, direction: "up" }
      : { label: "Aucune évolution", direction: "neutral" };
  }
  const change = Math.round(((totals.current - totals.previous) / totals.previous) * 100);
  return {
    label: `${change > 0 ? "+" : ""}${change}% vs mois dernier`,
    direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
}

function Trend({ trend }) {
  const Icon = trend.direction === "down" ? ArrowDownRight : ArrowUpRight;
  const color = trend.direction === "down"
    ? "text-rose-600"
    : trend.direction === "up"
      ? "text-emerald-700"
      : "text-slate-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      {trend.direction !== "neutral" && <Icon size={14} />}
      {trend.label}
    </span>
  );
}

function StatCard({ label, value, note, trend, Icon, iconStyle, gradient, onClick }) {
  return (
    <article className={`group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-200/50 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl ${onClick ? "cursor-pointer" : ""}`}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 truncate text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconStyle}`}>
          <Icon size={20} strokeWidth={2} />
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-slate-500">{note}</p>
        <Trend trend={trend} />
      </div>
      {onClick && (
        <button type="button" onClick={onClick} aria-label={`Ouvrir ${label}`} className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200" />
      )}
    </article>
  );
}

function QuickAction({ label, description, Icon, style, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${style}`}><Icon size={19} /></span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{description}</span>
      </span>
      <ArrowRight size={15} className="ml-auto shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
    </button>
  );
}

function PanelTitle({ eyebrow, title, action, onAction }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
      <div>
        {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p>}
        <h2 className={`${eyebrow ? "mt-1" : ""} text-base font-semibold text-slate-900`}>{title}</h2>
      </div>
      {action && (
        <button type="button" onClick={onAction} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50">
          {action} <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

function DashboardLoader() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-white shadow-lg shadow-slate-200/40">
      <LoaderCircle size={30} className="animate-spin text-blue-600" />
      <p className="text-sm font-medium text-slate-600">Chargement de votre activité…</p>
      <p className="text-xs text-slate-400">Synchronisation des données en temps réel</p>
    </div>
  );
}

export default function Dashboard({ onNavigate = () => {} }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [errors, setErrors] = useState(EMPTY_ERRORS);
  const [loaded, setLoaded] = useState({
    clients: false,
    contracts: false,
    interventions: false,
    payments: false,
  });

  useEffect(() => {
    let active = true;
    const subscriptions = [
      ["clients", clientsService.subscribe],
      ["contracts", contratsService.subscribe],
      ["interventions", interventionsService.subscribe],
      ["payments", paiementsService.subscribe],
    ].map(([key, subscribe]) => subscribe(
      (records) => {
        if (!active) return;
        setData((current) => ({ ...current, [key]: records }));
        setLoaded((current) => ({ ...current, [key]: true }));
        setErrors((current) => ({ ...current, [key]: "" }));
      },
      (error) => {
        if (!active) return;
        console.error(`Impossible de charger ${key} depuis Firestore.`, error);
        setLoaded((current) => ({ ...current, [key]: true }));
        setErrors((current) => ({
          ...current,
          [key]: "Certaines données n’ont pas pu être synchronisées.",
        }));
      },
    ));

    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const now = new Date();
  const recentInterventions = useMemo(
    () => [...data.interventions]
      .sort((left, right) => (getActivityDate(right)?.getTime() || 0) - (getActivityDate(left)?.getTime() || 0))
      .slice(0, 5),
    [data.interventions],
  );
  const ongoingInterventions = data.interventions.filter((intervention) => !isFinished(intervention));
  const finishedInterventions = data.interventions.length - ongoingInterventions.length;
  const totalPayments = data.payments.reduce((total, payment) => {
    const amount = Number(payment.amount ?? payment.montant ?? payment.paidAmount);
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);
  const monthlyPayments = useMemo(() => buildMonthlyPayments(data.payments, now), [data.payments]);
  const paymentTrend = monthOverMonth(
    data.payments,
    now,
    (payment) => {
      const amount = Number(payment.amount ?? payment.montant ?? payment.paidAmount);
      return Number.isFinite(amount) ? amount : 0;
    },
  );
  const activeInterventionTrend = monthOverMonth(
    data.interventions.filter((intervention) => !isFinished(intervention)),
    now,
  );
  const interventionBreakdown = [
    { name: "En cours", value: ongoingInterventions.length },
    { name: "Terminées", value: finishedInterventions },
  ];
  const overdueClients = data.clients
    .map((client) => ({ client, reason: getOverdueReason(client) }))
    .filter(({ reason }) => reason)
    .slice(0, 5);
  const pendingInterventions = [...ongoingInterventions]
    .sort((left, right) => Number(isUrgent(right)) - Number(isUrgent(left)))
    .slice(0, 5);
  const isLoading = Object.values(loaded).some((value) => !value);
  const loadErrors = Object.values(errors).filter(Boolean);

  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-600 px-6 py-7 text-white shadow-lg shadow-blue-900/10 md:px-8">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-blue-100 ring-1 ring-white/15">
            <CalendarDays size={14} /> {today}
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">Vue d’ensemble</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">
            Votre centre de contrôle pour piloter l’activité commerciale, financière et technique.
          </p>
          <div className="absolute -right-10 -top-24 -z-10 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-1 -top-16 -z-10 h-64 w-64 rounded-full border border-white/10" />
        </div>
      </section>

      <section aria-label="Actions rapides">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Raccourcis</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">Actions rapides</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickAction label="Nouveau client" description="Ajouter une fiche au répertoire" Icon={UsersRound} style="bg-blue-50 text-blue-700" onClick={() => onNavigate("clients")} />
          <QuickAction label="Créer un devis" description="Préparer un devis ou une facture" Icon={FilePlus2} style="bg-violet-50 text-violet-700" onClick={() => onNavigate("documents")} />
          <QuickAction label="Nouvelle intervention" description="Planifier une visite technique" Icon={Wrench} style="bg-amber-50 text-amber-700" onClick={() => onNavigate("interventions")} />
        </div>
      </section>

      {isLoading ? <DashboardLoader /> : (
        <>
          {loadErrors.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {loadErrors[0]} Vérifiez votre connexion et les règles d’accès Firestore.
            </div>
          )}

          <section aria-label="Statistiques de l'activité" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard
              label="Total clients"
              value={data.clients.length}
              note="Fiches clients enregistrées"
              trend={monthOverMonth(data.clients, now)}
              Icon={Building2}
              iconStyle="bg-blue-50 text-blue-700"
              gradient="from-blue-500 to-cyan-400"
              onClick={() => onNavigate("clients")}
            />
            <StatCard
              label="Total contrats"
              value={data.contracts.length}
              note="Installation et intervention"
              trend={monthOverMonth(data.contracts, now)}
              Icon={FileCheck2}
              iconStyle="bg-violet-50 text-violet-700"
              gradient="from-violet-500 to-indigo-400"
              onClick={() => onNavigate("contrats")}
            />
            <StatCard
              label="Interventions en cours"
              value={ongoingInterventions.length}
              note="Interventions non terminées"
              trend={activeInterventionTrend}
              Icon={Wrench}
              iconStyle="bg-amber-50 text-amber-700"
              gradient="from-amber-400 to-orange-400"
              onClick={() => onNavigate("interventions")}
            />
            <StatCard
              label="Total des paiements"
              value={formatCurrency(totalPayments)}
              note={`${data.payments.length} règlement${data.payments.length > 1 ? "s" : ""} enregistré${data.payments.length > 1 ? "s" : ""}`}
              trend={paymentTrend}
              Icon={HandCoins}
              iconStyle="bg-emerald-50 text-emerald-700"
              gradient="from-emerald-400 to-teal-400"
              onClick={() => onNavigate("recouvrement")}
            />
          </section>

          <Suspense fallback={<div role="status" className="flex min-h-72 items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white text-sm text-slate-500 shadow-lg"><LoaderCircle size={20} className="animate-spin text-blue-600" />Chargement des graphiques…</div>}>
            <AnalyticsCharts
              monthlyPayments={monthlyPayments}
              interventionBreakdown={interventionBreakdown}
              ongoingCount={ongoingInterventions.length}
              finishedCount={finishedInterventions}
              hasInterventions={data.interventions.length > 0}
              onNavigate={onNavigate}
            />
          </Suspense>

          <section aria-label="Alertes et actions urgentes" className="grid gap-5 xl:grid-cols-2">
            <article className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-lg shadow-rose-100/40">
              <PanelTitle
                eyebrow="À relancer"
                title="Retards de paiement"
                action="Recouvrement"
                onAction={() => onNavigate("recouvrement")}
              />
              <div className="p-4 sm:p-5">
                {overdueClients.length > 0 ? (
                  <ul className="space-y-2.5">
                    {overdueClients.map(({ client, reason }, index) => (
                      <li key={client.id || `${client.name || "client"}-${index}`} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700"><AlertCircle size={17} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">{client.name || client.companyName || "Client"}</span>
                          <span className="mt-0.5 block truncate text-xs text-rose-700">{reason}</span>
                        </span>
                        <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">Retard</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex min-h-32 flex-col items-center justify-center rounded-xl bg-emerald-50/70 px-4 text-center">
                    <CheckCircle2 size={22} className="text-emerald-600" />
                    <p className="mt-2 text-sm font-semibold text-emerald-800">Aucun retard signalé</p>
                    <p className="mt-1 text-xs text-emerald-700">Les fiches de clients ne signalent pas d’impayé.</p>
                  </div>
                )}
              </div>
            </article>

            <article className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-lg shadow-orange-100/40">
              <PanelTitle
                eyebrow="À suivre"
                title="Interventions en attente"
                action="Équipe technique"
                onAction={() => onNavigate("interventions")}
              />
              <div className="p-4 sm:p-5">
                {pendingInterventions.length > 0 ? (
                  <ul className="space-y-2.5">
                    {pendingInterventions.map((intervention, index) => {
                      const urgent = isUrgent(intervention);
                      return (
                        <li key={intervention.id || `${intervention.clientName || "intervention"}-${index}`} className={`flex items-center gap-3 rounded-xl border p-3 ${urgent ? "border-orange-200 bg-orange-50/70" : "border-slate-100 bg-slate-50/70"}`}>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${urgent ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                            {urgent ? <AlertTriangle size={17} /> : <Clock3 size={17} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">{intervention.clientName || intervention.client?.name || "Client non renseigné"}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {intervention.interventionType || intervention.type || "Intervention technique"} · {formatDate(intervention.date || intervention.interventionDate)}
                            </span>
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${urgent ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>
                            {urgent ? "Urgent" : intervention.status || intervention.statut || "En cours"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex min-h-32 flex-col items-center justify-center rounded-xl bg-emerald-50/70 px-4 text-center">
                    <CheckCircle2 size={22} className="text-emerald-600" />
                    <p className="mt-2 text-sm font-semibold text-emerald-800">Tout est à jour</p>
                    <p className="mt-1 text-xs text-emerald-700">Aucune intervention ouverte ou urgente.</p>
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg shadow-slate-200/50">
            <PanelTitle
              eyebrow="Derniers mouvements"
              title="Activité récente"
              action="Toutes les interventions"
              onAction={() => onNavigate("interventions")}
            />
            {recentInterventions.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Wrench size={21} /></span>
                <p className="mt-3 text-sm font-semibold text-slate-700">Aucune intervention enregistrée</p>
                <p className="mt-1 text-xs text-slate-500">Les interventions récentes apparaîtront ici.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold md:px-6">Client</th>
                      <th className="px-4 py-3.5 font-semibold">Intervention</th>
                      <th className="px-4 py-3.5 font-semibold">Technicien</th>
                      <th className="px-4 py-3.5 font-semibold">Date</th>
                      <th className="px-5 py-3.5 font-semibold md:px-6">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentInterventions.map((intervention, index) => {
                      const finished = isFinished(intervention);
                      const status = intervention.status || intervention.statut || (finished ? "Terminé" : "En cours");
                      return (
                        <tr key={intervention.id || `${intervention.clientId || intervention.clientName || "intervention"}-${index}`} className="transition hover:bg-slate-50/70">
                          <td className="px-5 py-4 font-semibold text-slate-900 md:px-6">{intervention.clientName || intervention.client?.name || "Client non renseigné"}</td>
                          <td className="px-4 py-4 text-slate-600">{intervention.interventionType || intervention.type || "Intervention technique"}</td>
                          <td className="px-4 py-4 text-slate-600">{intervention.technician || intervention.technicien || "—"}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(getActivityDate(intervention))}</td>
                          <td className="px-5 py-4 md:px-6">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${finished ? STATUS_STYLES.finished : STATUS_STYLES.active}`}>
                              {finished ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="text-center text-[11px] text-slate-400">Tendances calculées à partir des enregistrements Firestore des deux derniers mois. Elles ne constituent pas une prévision.</p>
        </>
      )}
    </div>
  );
}
