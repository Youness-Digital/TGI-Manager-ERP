import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, FileDown, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { stockService } from "../services/dbService";

const EMPTY_FORM = { reference: "", designation: "", quantity: "0", unitPrice: "0" };
const FIELD_CLASS = "mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50";

function StockModal({ item, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(item
    ? {
      reference: item.reference || "",
      designation: item.designation || "",
      quantity: String(item.quantity ?? 0),
      unitPrice: String(item.unitPrice ?? 0),
    }
    : EMPTY_FORM);
  const isEditing = Boolean(item);

  function submit(event) {
    event.preventDefault();
    onSave({
      reference: form.reference.trim(),
      designation: form.designation.trim(),
      quantity: Number(form.quantity),
      unitPrice: Number(form.unitPrice),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="stock-modal-title" className="my-auto w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Pièces détachées</p>
            <h2 id="stock-modal-title" className="mt-1 text-lg font-bold text-ink">{isEditing ? "Modifier une pièce" : "Ajouter une pièce"}</h2>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">Référence <span className="text-red-500">*</span>
            <input required maxLength={100} value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Ex. CAB-001" className={FIELD_CLASS} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">Désignation de la pièce <span className="text-red-500">*</span>
            <input required maxLength={200} value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} placeholder="Ex. Contacteur de porte" className={FIELD_CLASS} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">Quantité en stock <span className="text-red-500">*</span>
              <input required type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} className={FIELD_CLASS} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">Prix unitaire (€) <span className="text-red-500">*</span>
              <input required type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => setForm((current) => ({ ...current, unitPrice: event.target.value }))} className={FIELD_CLASS} />
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? "Enregistrement…" : isEditing ? "Enregistrer les modifications" : "Ajouter au stock"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function StockPage({ company = {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = stockService.subscribe(
      (records) => {
        if (!active) return;
        setItems(records);
        setLoading(false);
        setLoadError("");
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger le stock depuis Firestore.", error);
        setLoadError("Le stock n’a pas pu être chargé. Vérifiez la connexion et les règles Firestore.");
        setLoading(false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    const sorted = [...items].sort((a, b) => String(a.designation || "").localeCompare(String(b.designation || ""), "fr"));
    return query
      ? sorted.filter((item) => [item.reference, item.designation].some((value) => String(value || "").toLocaleLowerCase("fr-FR").includes(query)))
      : sorted;
  }, [items, search]);

  async function saveItem(record) {
    setSaving(true);
    setFormError("");
    try {
      if (editingItem) await stockService.update(editingItem.id, record);
      else await stockService.create(record);
      setModalOpen(false);
      setEditingItem(null);
      setActionError("");
    } catch (error) {
      console.error("Impossible d’enregistrer la pièce dans Firestore.", error);
      setFormError("L’enregistrement a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Supprimer la pièce « ${item.designation} » du stock ?`)) return;
    setDeletingId(item.id);
    setActionError("");
    try {
      await stockService.remove(item.id);
    } catch (error) {
      console.error("Impossible de supprimer la pièce du stock.", error);
      setActionError("La suppression a échoué. Vérifiez la connexion et réessayez.");
    } finally {
      setDeletingId("");
    }
  }

  function openModal(item = null) {
    setEditingItem(item);
    setFormError("");
    setModalOpen(true);
  }

  async function exportItem(item) {
    setActionError("");
    try {
      const { generateFicheStockPDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      generateFicheStockPDF(item, { company: readyCompany });
    } catch (error) {
      console.error("Impossible de générer la fiche PDF de la pièce.", error);
      setActionError("La fiche PDF de cette pièce n’a pas pu être générée.");
    }
  }

  async function exportInventory() {
    setActionError("");
    try {
      const { generateInventaireStockPDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      generateInventaireStockPDF(filteredItems, { company: readyCompany });
    } catch (error) {
      console.error("Impossible de générer l’inventaire PDF du stock.", error);
      setActionError("L’inventaire PDF du stock n’a pas pu être généré.");
    }
  }

  const lowStockCount = items.filter((item) => Number(item.quantity) < 5).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Achats & logistique</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">Gestion du stock</h2>
          <p className="mt-1 text-xs text-muted">Suivez les pièces détachées et leurs niveaux de disponibilité.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={exportInventory} disabled={loading || !filteredItems.length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"><FileDown size={15} /> Exporter l’inventaire</button>
          <button onClick={() => openModal()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark"><Plus size={16} /> Ajouter une pièce</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-muted">Références en stock</p><p className="mt-2 text-2xl font-bold text-ink">{loading ? "—" : items.length}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand"><Box size={19} /></div></div>
        </article>
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-muted">Alertes de stock bas</p><p className="mt-2 text-2xl font-bold text-ink">{loading ? "—" : lowStockCount}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><AlertTriangle size={19} /></div></div>
        </article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><h3 className="text-sm font-bold text-ink">Inventaire des pièces</h3><p className="mt-1 text-[11px] text-muted">{loading ? "Synchronisation avec Firestore…" : `${filteredItems.length} ${filteredItems.length === 1 ? "référence affichée" : "références affichées"}`}</p></div>
          <label className="relative block sm:w-[280px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une pièce…" aria-label="Rechercher une pièce" className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-ink outline-none focus:border-brand focus:bg-white" /></label>
        </div>
        {loadError ? <div role="alert" className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{loadError}</div> : loading ? (
          <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted" role="status"><LoaderCircle size={22} className="animate-spin text-brand" />Loading… Chargement du stock</div>
        ) : filteredItems.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center"><Box size={24} className="text-slate-300" /><p className="mt-3 text-sm font-bold text-ink">{search ? "Aucune pièce trouvée" : "Le stock est vide"}</p><p className="mt-1 text-xs text-muted">{search ? "Essayez une autre recherche." : "Ajoutez les premières pièces pour les retrouver dans les bons et interventions."}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400"><tr><th className="px-5 py-3.5">Référence</th><th className="px-4 py-3.5">Désignation</th><th className="px-4 py-3.5">Quantité</th><th className="px-4 py-3.5">Prix unitaire</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((item) => {
                  const low = Number(item.quantity) < 5;
                  return <tr key={item.id} className="text-xs transition hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-ink">{item.reference || "—"}</td>
                    <td className="px-4 py-3.5 text-slate-600">{item.designation || "—"}</td>
                    <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${low ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>{Number(item.quantity) || 0}{low ? " · Stock bas" : ""}</span></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{Number(item.unitPrice || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</td>
                    <td className="px-5 py-3.5 text-right"><div className="inline-flex gap-1"><button onClick={() => exportItem(item)} aria-label={`Exporter la fiche PDF de ${item.designation}`} className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-brand"><FileDown size={14} /></button><button onClick={() => openModal(item)} aria-label={`Modifier ${item.designation}`} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-brand"><Pencil size={14} /></button><button onClick={() => deleteItem(item)} aria-label={`Supprimer ${item.designation}`} disabled={deletingId === item.id} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 size={14} /></button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {actionError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">{actionError}</p>}
      {modalOpen && <StockModal item={editingItem} onClose={() => { setModalOpen(false); setEditingItem(null); }} onSave={saveItem} saving={saving} error={formError} />}
    </section>
  );
}
