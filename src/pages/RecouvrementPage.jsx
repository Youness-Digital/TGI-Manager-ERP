import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileCheck2, HandCoins, LoaderCircle, Plus, Search, Upload, X } from "lucide-react";
import { clientsService, paiementsService, uploadPaymentProof } from "../services/dbService";

const EMPTY_FORM = {
  clientId: "",
  amount: "",
  date: "",
  paymentMethod: "Virement",
  period: "",
  proofFile: null,
};

const METHODS = ["Espèces", "Chèque", "Virement"];

function formatDate(value) {
  if (!value) return "—";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function dateValue(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

function clientIsOverdue(client) {
  const status = String(client?.paymentStatus || client?.statutPaiement || "").toLocaleLowerCase("fr-FR");
  if (["retard", "impay", "overdue", "late"].some((value) => status.includes(value))) return true;
  const balance = Number(client?.balanceDue ?? client?.amountDue ?? client?.remainingAmount);
  const rawDate = client?.dueDate;
  const dueDate = typeof rawDate?.toDate === "function" ? rawDate.toDate() : rawDate ? new Date(rawDate) : null;
  return Number.isFinite(balance) && balance > 0 && dueDate instanceof Date && !Number.isNaN(dueDate.getTime()) && dueDate < new Date();
}

function PaymentModal({ clients, clientsLoading, onClose, onCreate, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);

  function submit(event) {
    event.preventDefault();
    const client = clients.find((entry) => entry.id === form.clientId);
    if (!client) return;
    onCreate({
      clientId: client.id,
      clientName: client.name || "Client",
      amount: Number(form.amount),
      date: form.date,
      paymentMethod: form.paymentMethod,
      period: form.period.trim(),
      status: "Payé",
    }, form.proofFile);
  }

  const hasClients = clients.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="payment-modal-title" className="my-auto w-full max-w-[540px] rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Suivi financier</p>
            <h2 id="payment-modal-title" className="mt-1 text-lg font-bold text-ink">Enregistrer un paiement</h2>
            <p className="mt-1 text-xs text-muted">Le règlement sera associé à la fiche du client sélectionné.</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink disabled:opacity-40"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">
            Client <span className="text-red-500">*</span>
            <select required value={form.clientId} onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))} disabled={clientsLoading || !hasClients} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60">
              <option value="">{clientsLoading ? "Chargement des clients…" : hasClients ? "Sélectionner un client" : "Aucun client disponible"}</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}</option>)}
            </select>
            {!clientsLoading && !hasClients && <span className="mt-1.5 block text-[11px] font-normal text-amber-700">Créez d’abord une fiche client pour enregistrer son paiement.</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Montant payé (€) <span className="text-red-500">*</span>
              <input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0,00" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Date du paiement <span className="text-red-500">*</span>
              <input required type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Méthode de paiement <span className="text-red-500">*</span>
              <select value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Mois / trimestre concerné <span className="text-red-500">*</span>
              <input required maxLength={80} value={form.period} onChange={(event) => setForm((current) => ({ ...current, period: event.target.value }))} placeholder="Ex. Janvier 2026 ou T1 2026" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-600">
            Preuve de paiement (PDF, JPG ou PNG)
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setForm((current) => ({ ...current, proofFile: event.target.files?.[0] || null }))} className="mt-2 block w-full rounded-xl border border-line bg-slate-50 px-3 py-2.5 text-xs font-normal text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-blue-700" />
            <span className="mt-1 block text-[10px] font-normal text-slate-400">{form.proofFile ? form.proofFile.name : "Taille maximale : 20 Mo."}</span>
          </label>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={saving || !hasClients || clientsLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? "Enregistrement…" : "Enregistrer le paiement"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function RecouvrementPage({ company = {}, profiles = {} }) {
  const [payments, setPayments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("Tous");
  const [uploadingPaymentId, setUploadingPaymentId] = useState("");
  const proofInput = useRef(null);
  const proofPaymentId = useRef("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const unsubscribePayments = paiementsService.subscribe(
      (records) => {
        if (!active) return;
        setPayments(records);
        setLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les paiements depuis Firestore.", error);
        setLoadError("Le chargement des paiements a échoué. Vérifiez la connexion et les règles Firestore.");
        setLoading(false);
      },
    );
    const unsubscribeClients = clientsService.subscribe(
      (records) => {
        if (!active) return;
        setClients(records);
        setClientsLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les clients nécessaires au recouvrement.", error);
        setClientsLoading(false);
        setLoadError("La liste des clients n’a pas pu être chargée. Vérifiez la connexion et les règles Firestore.");
      },
    );

    return () => {
      active = false;
      unsubscribePayments();
      unsubscribeClients();
    };
  }, []);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    const ordered = [...payments].sort((a, b) => dateValue(b.date) - dateValue(a.date));
    return ordered.filter((payment) => {
      const client = clients.find((entry) => entry.id === payment.clientId);
      const overdue = clientIsOverdue(client);
      const matchesStatus = paymentFilter === "Tous" || (paymentFilter === "En retard" ? overdue : !overdue);
      const matchesQuery = !query || [payment.clientName, payment.period, payment.paymentMethod, payment.amount, payment.status]
        .some((value) => String(value ?? "").toLocaleLowerCase("fr-FR").includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [payments, clients, search, paymentFilter]);

  const totalCollected = useMemo(() => payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0), [payments]);

  async function createPayment(record, proofFile) {
    setSaving(true);
    setFormError("");
    try {
      const paymentId = await paiementsService.create(record);
      setModalOpen(false);
      setActionError("");
      if (proofFile) {
        try {
          await uploadPaymentProof(paymentId, proofFile);
        } catch (uploadError) {
          console.error("Le paiement a été enregistré, mais sa preuve n’a pas pu être téléversée.", uploadError);
          setActionError("Le paiement a été créé, mais la preuve n’a pas pu être jointe. Réessayez depuis la ligne du paiement.");
        }
      }
    } catch (error) {
      console.error("Impossible d’enregistrer le paiement dans Firestore.", error);
      setFormError("L’enregistrement a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  function chooseProof(paymentId) {
    proofPaymentId.current = paymentId;
    proofInput.current?.click();
  }

  async function attachPaymentProof(event) {
    const file = event.target.files?.[0];
    const paymentId = proofPaymentId.current;
    event.target.value = "";
    if (!file || !paymentId) return;
    setUploadingPaymentId(paymentId);
    setActionError("");
    try {
      await uploadPaymentProof(paymentId, file);
    } catch (error) {
      console.error("Impossible de joindre la preuve de paiement.", error);
      setActionError("La preuve n’a pas pu être téléversée. Vérifiez le format, la taille et les règles Firebase Storage.");
    } finally {
      setUploadingPaymentId("");
    }
  }

  async function exportReceipt(payment) {
    setActionError("");
    try {
      const { generateRecuPaiementPDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      const client = clients.find((entry) => entry.id === payment.clientId) || { name: payment.clientName || "Client" };
      generateRecuPaiementPDF(payment, client, { company: readyCompany, director: profiles.director, salesperson: profiles.salesperson });
    } catch (error) {
      console.error("Impossible de générer le reçu PDF du paiement.", error);
      setActionError("Le reçu PDF de ce paiement n’a pas pu être généré.");
    }
  }

  async function exportRecoverySheet() {
    setActionError("");
    try {
      const { generateFicheRecouvrementPDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      const clientsWithPayments = clients.map((client) => {
        const clientPayments = payments.filter((payment) => payment.clientId === client.id);
        return {
          ...client,
          amountPaid: clientPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
        };
      });
      generateFicheRecouvrementPDF(clientsWithPayments, { company: readyCompany, director: profiles.director, salesperson: profiles.salesperson });
    } catch (error) {
      console.error("Impossible de générer la fiche de recouvrement.", error);
      setActionError("La fiche globale de recouvrement n’a pas pu être générée.");
    }
  }

  return (
    <section className="space-y-5">
      <input ref={proofInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={attachPaymentProof} className="hidden" />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Suivi financier</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">Recouvrement & paiements</h2>
          <p className="mt-1 text-xs text-muted">Consultez les règlements reçus et préparez vos relances.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={exportRecoverySheet} disabled={loading || clientsLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50">
            <Download size={15} /> Exporter Fiche Recouvrement
          </button>
          <button onClick={() => { setFormError(""); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark">
            <Plus size={16} /> Ajouter un paiement
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-muted">Paiements enregistrés</p><p className="mt-2 text-2xl font-bold tracking-tight text-ink">{loading ? "—" : payments.length}</p></div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand"><FileCheck2 size={19} /></div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Historique actualisé en temps réel</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-muted">Montant total enregistré</p><p className="mt-2 text-2xl font-bold tracking-tight text-ink">{loading ? "—" : formatAmount(totalCollected)}</p></div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><HandCoins size={19} /></div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Cumul des paiements reçus</p>
        </article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-sm font-bold text-ink">Historique des paiements</h3>
            <p className="mt-1 text-[11px] text-muted">{loading ? "Synchronisation avec Firestore…" : `${payments.length} ${payments.length > 1 ? "paiements enregistrés" : "paiement enregistré"}`}</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <label className="relative block sm:w-[280px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un paiement…" aria-label="Rechercher un paiement" className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-ink outline-none transition focus:border-brand focus:bg-white" />
            </label>
            <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Filtrer par état de paiement">
              {["Tous", "En retard", "À jour"].map((filter) => (
                <button key={filter} type="button" onClick={() => setPaymentFilter(filter)} aria-pressed={paymentFilter === filter} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${paymentFilter === filter ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{filter}</button>
              ))}
            </div>
          </div>
        </div>
        {loadError ? (
          <div role="alert" className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{loadError}</div>
        ) : loading ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted" role="status"><LoaderCircle size={25} className="animate-spin text-brand" /><span>Loading... Chargement des paiements</span></div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-brand"><HandCoins size={21} /></div>
            <p className="mt-4 text-sm font-bold text-ink">{search ? "Aucun résultat" : "Aucun paiement pour le moment"}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted">{search ? "Essayez une autre recherche." : "Ajoutez un règlement pour démarrer le suivi des paiements."}</p>
            {!search && <button onClick={() => { setFormError(""); setModalOpen(true); }} className="mt-4 text-xs font-bold text-brand hover:text-brand-dark">Ajouter un paiement</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[790px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
                <tr><th className="px-5 py-3.5">Client</th><th className="px-4 py-3.5">Date</th><th className="px-4 py-3.5">Période</th><th className="px-4 py-3.5">Méthode</th><th className="px-4 py-3.5">Montant</th><th className="px-4 py-3.5">État du compte</th><th className="px-4 py-3.5">Preuve</th><th className="px-5 py-3.5 text-right">Reçu</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredPayments.map((payment) => {
                  const client = clients.find((entry) => entry.id === payment.clientId);
                  const overdue = clientIsOverdue(client);
                  return (
                    <tr key={payment.id} className="text-xs transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5"><p className="font-semibold text-ink">{client?.name || payment.clientName || "Client"}</p></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{formatDate(payment.date)}</td>
                      <td className="px-4 py-3.5 text-slate-500">{payment.period || "—"}</td>
                      <td className="px-4 py-3.5 text-slate-500">{payment.paymentMethod || payment.method || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-ink">{formatAmount(payment.amount)}</td>
                      <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${overdue ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{overdue ? "En retard" : "À jour"}</span></td>
                      <td className="px-4 py-3.5">{(payment.proofFiles || []).length ? <div className="flex flex-col gap-1">{payment.proofFiles.map((proof, index) => <a key={`${proof.path}-${index}`} href={proof.downloadURL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline"><FileCheck2 size={12} />{proof.name || "Voir preuve"}</a>)}<button type="button" onClick={() => chooseProof(payment.id)} className="text-left text-[10px] font-semibold text-slate-500 hover:text-blue-700">Ajouter un justificatif</button></div> : <button type="button" onClick={() => chooseProof(payment.id)} disabled={uploadingPaymentId === payment.id} className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline disabled:opacity-50">{uploadingPaymentId === payment.id ? <LoaderCircle size={12} className="animate-spin" /> : <Upload size={12} />}{uploadingPaymentId === payment.id ? "Envoi…" : "Joindre"}</button>}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => exportReceipt(payment)} aria-label={`Exporter le reçu PDF pour ${client?.name || payment.clientName || "ce client"}`} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2.5 py-2 text-[10px] font-bold text-slate-600 transition hover:border-brand hover:bg-blue-50 hover:text-brand"><FileCheck2 size={14} /> PDF Reçu</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {actionError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">{actionError}</p>}
      {modalOpen && <PaymentModal clients={clients} clientsLoading={clientsLoading} onClose={() => setModalOpen(false)} onCreate={createPayment} saving={saving} error={formError} />}
    </section>
  );
}
