import { useEffect, useMemo, useState } from "react";
import { ClipboardList, FileDown, LoaderCircle, Plus, Search, Truck, X } from "lucide-react";
import { commandesService, stockService, updateStockMovement } from "../services/dbService";

const EMPTY_ITEM = { stockItemId: "", reference: "", description: "", quantity: "1", unitPrice: "" };
const EMPTY_FORM = {
  documentType: "Commande",
  recipientType: "Fournisseur",
  recipient: "",
  date: "",
  items: [{ ...EMPTY_ITEM }],
  taxRate: "20",
  discountPercent: "0",
};

function formatDate(value) {
  if (!value) return "—";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function dateValue(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function documentType(record) {
  const type = String(record.documentType || record.type || record.bonType || "").toLocaleLowerCase("fr-FR");
  return type.includes("livraison") ? "Livraison" : "Commande";
}

async function createBonWithStockMovements(record) {
  const direction = documentType(record) === "Livraison" ? -1 : 1;
  const quantitiesByItem = new Map();
  for (const article of record.items || []) {
    if (!article.stockItemId) continue;
    quantitiesByItem.set(article.stockItemId, (quantitiesByItem.get(article.stockItemId) || 0) + Number(article.quantity || 0));
  }

  const appliedMovements = [];
  try {
    for (const [itemId, quantity] of quantitiesByItem) {
      const movement = { itemId, quantityChange: direction * quantity };
      await updateStockMovement(movement.itemId, movement.quantityChange);
      appliedMovements.push(movement);
    }
    return await commandesService.create(record);
  } catch (error) {
    const rollbackErrors = [];
    for (const movement of appliedMovements.reverse()) {
      try {
        await updateStockMovement(movement.itemId, -movement.quantityChange);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      console.error("La création du bon a échoué et certains mouvements de stock n’ont pas pu être annulés.", {
        error,
        rollbackErrors,
      });
      throw new Error("L’enregistrement a échoué et le stock n’a pas pu être entièrement restauré. Vérifiez le stock avant de réessayer.", { cause: error });
    }
    throw error;
  }
}

function BonModal({ stock, stockLoading, onClose, onCreate, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const isDelivery = form.documentType === "Livraison";
  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const discountAmount = subtotal * (Number(form.discountPercent) || 0) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (Number(form.taxRate) || 0) / 100;
  const totalWithTax = taxableAmount + taxAmount;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index, field, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, { ...EMPTY_ITEM }] }));
  }

  function removeItem(index) {
    setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function submit(event) {
    event.preventDefault();
    const recipient = form.recipient.trim();
    const items = form.items.map((item) => ({
      stockItemId: item.stockItemId,
      reference: item.reference,
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice) || 0,
      total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    }));
    onCreate({
      documentType: form.documentType,
      recipientType: form.recipientType,
      recipient,
      date: form.date,
      items,
      subtotal,
      discountPercent: Number(form.discountPercent) || 0,
      discountAmount,
      taxRate: Number(form.taxRate) || 0,
      taxAmount,
      total: totalWithTax,
      supplier: !isDelivery && form.recipientType === "Fournisseur" ? recipient : "",
      customer: (isDelivery || form.recipientType === "Client") ? recipient : "",
      client: (isDelivery || form.recipientType === "Client") ? recipient : "",
      relatedReference: "",
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="bon-modal-title" className="my-auto max-h-[92vh] w-full max-w-[650px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Achats & logistique</p>
            <h2 id="bon-modal-title" className="mt-1 text-lg font-bold text-ink">Créer un bon</h2>
            <p className="mt-1 text-xs text-muted">Renseignez le destinataire et ajoutez les lignes d’articles.</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink disabled:opacity-40"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Type de bon <span className="text-red-500">*</span>
              <select required value={form.documentType} onChange={(event) => {
                const nextType = event.target.value;
                setForm((current) => ({
                  ...current,
                  documentType: nextType,
                  recipientType: nextType === "Livraison" ? "Client" : "Fournisseur",
                }));
              }} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option value="Commande">Bon de commande</option>
                <option value="Livraison">Bon de livraison</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Destinataire : {isDelivery ? "Client" : form.recipientType}
              {!isDelivery && (
                <select value={form.recipientType} onChange={(event) => updateField("recipientType", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                  <option value="Fournisseur">Fournisseur</option>
                  <option value="Client">Client</option>
                </select>
              )}
              {isDelivery && <span className="mt-2 block rounded-xl border border-line bg-slate-100 px-3.5 py-3 text-sm font-normal text-slate-500">Client</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Nom du destinataire <span className="text-red-500">*</span>
              <input required maxLength={160} value={form.recipient} onChange={(event) => updateField("recipient", event.target.value)} placeholder={isDelivery ? "Nom du client" : form.recipientType === "Client" ? "Nom du client" : "Nom du fournisseur"} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Date <span className="text-red-500">*</span>
              <input required type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
          </div>

          <section className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h3 className="text-xs font-bold text-ink">Articles</h3><p className="mt-1 text-[10px] text-muted">Ajoutez une ou plusieurs lignes au bon.</p></div>
              <button type="button" onClick={addItem} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-[10px] font-semibold text-slate-600 transition hover:border-brand hover:text-brand"><Plus size={13} /> Ajouter une ligne</button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_90px_120px_100px_28px] sm:items-end">
                  <label className="block text-[11px] font-semibold text-slate-500">
                    Pièce du stock <span className="text-red-500">*</span>
                    <select required value={item.stockItemId} disabled={stockLoading || stock.length === 0} onChange={(event) => {
                      const selected = stock.find((entry) => entry.id === event.target.value);
                      setForm((current) => ({
                        ...current,
                        items: current.items.map((row, rowIndex) => rowIndex === index ? {
                          ...row,
                          stockItemId: selected?.id || "",
                          reference: selected?.reference || "",
                          description: selected?.designation || "",
                          unitPrice: selected?.unitPrice ?? "",
                        } : row),
                      }));
                    }} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs font-normal text-ink outline-none focus:border-brand disabled:opacity-60">
                      <option value="">{stockLoading ? "Chargement du stock…" : stock.length ? "Sélectionner une pièce" : "Aucune pièce dans le stock"}</option>
                      {stock.map((entry) => <option key={entry.id} value={entry.id}>{entry.reference} · {entry.designation} ({entry.quantity} en stock)</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] font-semibold text-slate-500">
                    Quantité <span className="text-red-500">*</span>
                    <input required type="number" min="0.01" step="any" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs font-normal text-ink outline-none transition focus:border-brand" />
                  </label>
                  <label className="block text-[11px] font-semibold text-slate-500">
                    Prix unitaire HT
                    <input type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(event) => updateItem(index, "unitPrice", event.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs font-normal text-ink outline-none focus:border-brand" />
                  </label>
                  <p className="pb-2 text-right text-xs font-semibold text-slate-600">{((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</p>
                  <button type="button" aria-label={`Supprimer la ligne ${index + 1}`} disabled={form.items.length === 1} onClick={() => removeItem(index)} className="mb-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X size={15} /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Fiscalité et remise</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">TVA (%)<input type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={(event) => updateField("taxRate", event.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Remise (%)<input type="number" min="0" max="100" step="0.01" value={form.discountPercent} onChange={(event) => updateField("discountPercent", event.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
            </div>
            <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
              <div className="flex justify-between"><dt className="text-slate-500">Total HT</dt><dd className="font-semibold text-ink">{subtotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Remise ({form.discountPercent || 0}%)</dt><dd className="font-semibold text-rose-700">−{discountAmount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">TVA ({form.taxRate || 0}%)</dt><dd className="font-semibold text-ink">{taxAmount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-sm"><dt className="font-bold text-slate-700">Total TTC</dt><dd className="font-bold text-blue-700">{totalWithTax.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</dd></div>
            </dl>
          </section>

          {!stockLoading && stock.length === 0 && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">Ajoutez d’abord les références dans le module Stock pour pouvoir créer un bon.</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={saving || stockLoading || stock.length === 0 || form.items.some((item) => !item.stockItemId)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? "Enregistrement…" : "Enregistrer le bon"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function BonsPage({ company = {}, profiles = {} }) {
  const [bons, setBons] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [activeTab, setActiveTab] = useState("Tous");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const unsubscribe = commandesService.subscribe(
      (records) => {
        if (!active) return;
        setBons(records);
        setLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les bons depuis Firestore.", error);
        setLoadError("Le chargement des bons a échoué. Vérifiez la connexion et les règles Firestore.");
        setLoading(false);
      },
    );
    const unsubscribeStock = stockService.subscribe(
      (records) => {
        if (!active) return;
        setStock(records);
        setStockLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger le stock nécessaire aux bons.", error);
        setLoadError("Le stock des articles n’a pas pu être chargé depuis Firestore.");
        setStockLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
      unsubscribeStock();
    };
  }, []);

  const filteredBons = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    return [...bons]
      .filter((bon) => activeTab === "Tous" || documentType(bon) === activeTab)
      .filter((bon) => !query || [
        bon.recipient,
        bon.supplier,
        bon.customer,
        bon.client,
        bon.reference,
        bon.documentType,
        ...(bon.items || bon.articles || []).map((item) => item.description || item.designation),
      ].some((value) => String(value ?? "").toLocaleLowerCase("fr-FR").includes(query)))
      .sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [bons, activeTab, search]);

  async function createBon(record) {
    setSaving(true);
    setFormError("");
    try {
      await createBonWithStockMovements(record);
      setModalOpen(false);
      setActionError("");
    } catch (error) {
      console.error("Impossible d’enregistrer le bon dans Firestore.", error);
      setFormError(error instanceof RangeError ? error.message : "L’enregistrement a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function exportBon(bon) {
    setActionError("");
    try {
      const pdf = await import("../utils/pdfGenerator");
      const readyCompany = await pdf.prepareCompanyForPdf(company);
      const options = { company: readyCompany, director: profiles.director, salesperson: profiles.salesperson };
      if (documentType(bon) === "Livraison") {
        pdf.generateBonLivraisonPDF(bon, options);
      } else {
        pdf.generateBonCommandePDF(bon, options);
      }
    } catch (error) {
      console.error("Impossible de générer le PDF du bon.", error);
      setActionError("Le PDF de ce bon n’a pas pu être généré.");
    }
  }

  const counts = useMemo(() => ({
    Commande: bons.filter((bon) => documentType(bon) === "Commande").length,
    Livraison: bons.filter((bon) => documentType(bon) === "Livraison").length,
  }), [bons]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Achats & logistique</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">Bons de commande & livraison</h2>
          <p className="mt-1 text-xs text-muted">Centralisez vos commandes et les bons de livraison associés.</p>
        </div>
        <button onClick={() => { setFormError(""); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark">
          <Plus size={16} /> Créer un bon
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-muted">Bons de commande</p><p className="mt-2 text-2xl font-bold tracking-tight text-ink">{loading ? "—" : counts.Commande}</p></div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand"><ClipboardList size={19} /></div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Commandes fournisseurs et clients</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-muted">Bons de livraison</p><p className="mt-2 text-2xl font-bold tracking-tight text-ink">{loading ? "—" : counts.Livraison}</p></div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Truck size={19} /></div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Livraisons clients enregistrées</p>
        </article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-sm font-bold text-ink">Registre des bons</h3>
            <p className="mt-1 text-[11px] text-muted">{loading ? "Synchronisation avec Firestore…" : `${filteredBons.length} ${filteredBons.length > 1 ? "bons affichés" : "bon affiché"}`}</p>
          </div>
          <label className="relative block sm:w-[280px]">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un bon…" aria-label="Rechercher un bon" className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-ink outline-none transition focus:border-brand focus:bg-white" />
          </label>
        </div>
        <div className="flex gap-1 border-b border-line px-4 pt-3 sm:px-5">
          {["Tous", "Commande", "Livraison"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab} className={`rounded-t-lg border-b-2 px-3 py-2.5 text-xs font-semibold transition ${activeTab === tab ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"}`}>
              {tab === "Tous" ? "Tous les bons" : `${tab === "Commande" ? "Commandes" : "Livraisons"} (${counts[tab]})`}
            </button>
          ))}
        </div>
        {loadError ? (
          <div role="alert" className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{loadError}</div>
        ) : loading ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted" role="status"><LoaderCircle size={25} className="animate-spin text-brand" /><span>Loading... Chargement des bons</span></div>
        ) : filteredBons.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-brand"><ClipboardList size={21} /></div>
            <p className="mt-4 text-sm font-bold text-ink">{search ? "Aucun résultat" : activeTab === "Tous" ? "Aucun bon pour le moment" : `Aucun bon de ${activeTab.toLocaleLowerCase("fr-FR")} pour le moment`}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted">{search ? "Essayez une autre recherche." : "Créez un bon pour suivre les articles commandés ou livrés."}</p>
            {!search && <button onClick={() => { setFormError(""); setModalOpen(true); }} className="mt-4 text-xs font-bold text-brand hover:text-brand-dark">Créer un bon</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
                <tr><th className="px-5 py-3.5">Type</th><th className="px-4 py-3.5">Référence</th><th className="px-4 py-3.5">Destinataire</th><th className="px-4 py-3.5">Date</th><th className="px-4 py-3.5">Articles</th><th className="px-5 py-3.5 text-right">Document</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredBons.map((bon) => {
                  const kind = documentType(bon);
                  const items = bon.items || bon.articles || [];
                  const recipient = bon.recipient || bon.supplier || bon.customer || bon.client || "—";
                  return (
                    <tr key={bon.id} className="text-xs transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${kind === "Livraison" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{kind}</span></td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-ink">{bon.reference || bon.number || bon.id}</td>
                      <td className="px-4 py-3.5 text-slate-600">{recipient}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{formatDate(bon.date)}</td>
                      <td className="px-4 py-3.5 text-slate-500">{items.length} {items.length === 1 ? "ligne" : "lignes"}</td>
                      <td className="px-5 py-3.5 text-right"><button onClick={() => exportBon(bon)} aria-label={`Exporter le PDF du bon ${kind.toLocaleLowerCase("fr-FR")} ${bon.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-[10px] font-bold text-slate-600 transition hover:border-brand hover:bg-blue-50 hover:text-brand"><FileDown size={14} /> PDF</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {actionError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">{actionError}</p>}
      {modalOpen && <BonModal stock={stock} stockLoading={stockLoading} onClose={() => setModalOpen(false)} onCreate={createBon} saving={saving} error={formError} />}
    </section>
  );
}
