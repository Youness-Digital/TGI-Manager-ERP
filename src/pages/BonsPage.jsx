import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Eye, FileDown, LoaderCircle, Plus, Search, Truck, X } from "lucide-react";
import FileUploader from "../components/FileUploader";
import RecordDetailsDialog from "../components/RecordDetailsDialog";
import { formatMoney } from "../utils/currency";
import {
  ascenseursService,
  clientsService,
  commandesService,
  contratsService,
  devisService,
  facturesService,
  sitesService,
  stockService,
  updateStockMovement,
} from "../services/dbService";

const EMPTY_ITEM = { stockItemId: "", reference: "", description: "", quantity: "1", unitPrice: "" };
const EMPTY_FORM = {
  documentType: "Commande",
  recipientType: "Fournisseur",
  recipient: "",
  clientId: "",
  siteId: "",
  ascenseurId: "",
  devisId: "",
  contratId: "",
  factureId: "",
  commandeId: "",
  status: "Brouillon",
  expectedDate: "",
  observations: "",
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
  if (type.includes("livraison")) return "Livraison";
  if (type.includes("réception") || type.includes("reception")) return "Réception";
  return "Commande";
}

async function createBonWithStockMovements(record) {
  const type = documentType(record);
  const direction = type === "Livraison" ? -1 : type === "Réception" ? 1 : 0;
  if (!direction) return commandesService.create(record);
  const quantitiesByItem = new Map();
  for (const article of record.items || []) {
    if (!article.stockItemId) continue;
    quantitiesByItem.set(article.stockItemId, (quantitiesByItem.get(article.stockItemId) || 0) + Number(article.quantity || 0));
  }

  const appliedMovements = [];
  try {
    for (const [itemId, quantity] of quantitiesByItem) {
      const movement = { itemId, quantityChange: direction * quantity };
      await updateStockMovement(movement.itemId, movement.quantityChange, {
        date: record.date,
        reason: `Bon de ${type.toLocaleLowerCase("fr-FR")}`,
        sourceType: `Bon ${type}`,
        devisId: record.devisId || "",
        contratId: record.contratId || "",
        factureId: record.factureId || "",
        clientId: record.clientId || "",
        fournisseurId: record.fournisseurId || "",
        notes: record.refLiee || "",
      });
      appliedMovements.push(movement);
    }
    return await commandesService.create(record);
  } catch (error) {
    const rollbackErrors = [];
    for (const movement of appliedMovements.reverse()) {
      try {
        await updateStockMovement(movement.itemId, -movement.quantityChange, {
          reason: "Annulation d’un mouvement après échec de création du bon",
          sourceType: "Annulation",
        });
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

function BonModal({ stock, stockLoading, bons, clients, sites, ascenseurs, devis, factures, contrats, onClose, onCreate, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const isDelivery = form.documentType === "Livraison";
  const isReceipt = form.documentType === "Réception";
  const usesClient = isDelivery || (!isReceipt && form.recipientType === "Client");
  const selectedClient = clients.find((client) => client.id === form.clientId);
  const clientSites = sites.filter((site) => site.clientId === form.clientId);
  const siteAscenseurs = ascenseurs.filter((elevator) => elevator.siteId === form.siteId);
  const linkedOrders = bons.filter((bon) => documentType(bon) === "Commande");
  const availableQuotes = devis.filter((quote) => !form.clientId || quote.clientId === form.clientId);
  const availableInvoices = factures.filter((invoice) => !form.clientId || invoice.clientId === form.clientId);
  const availableContracts = contrats.filter((contract) => !form.clientId || contract.clientId === form.clientId);
  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const discountAmount = subtotal * (Number(form.discountPercent) || 0) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (Number(form.taxRate) || 0) / 100;
  const totalWithTax = taxableAmount + taxAmount;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectOrder(orderId) {
    const order = linkedOrders.find((entry) => entry.id === orderId);
    if (!order) {
      setForm((current) => ({ ...current, commandeId: "", recipient: "", items: [{ ...EMPTY_ITEM }] }));
      return;
    }
    setForm((current) => ({
      ...current,
      commandeId: order.id,
      recipient: order.recipient || "",
      items: (order.items || []).map((item) => ({
        stockItemId: item.stockItemId || "",
        reference: item.reference || "",
        description: item.description || item.designation || "",
        quantity: String(item.quantity ?? 1),
        unitPrice: String(item.unitPrice ?? ""),
      })),
    }));
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
    const recipient = usesClient ? (selectedClient?.name || "").trim() : form.recipient.trim();
    const selectedSite = sites.find((site) => site.id === form.siteId);
    const selectedElevator = ascenseurs.find((elevator) => elevator.id === form.ascenseurId);
    const selectedQuote = devis.find((quote) => quote.id === form.devisId);
    const selectedInvoice = factures.find((invoice) => invoice.id === form.factureId);
    const selectedContract = contrats.find((contract) => contract.id === form.contratId);
    const selectedOrder = linkedOrders.find((order) => order.id === form.commandeId);
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
      recipient,
      recipientType: usesClient ? "Client" : "Fournisseur",
      clientId: usesClient ? form.clientId : (selectedOrder?.clientId || ""),
      clientName: usesClient ? recipient : (selectedOrder?.clientName || ""),
      fournisseurName: usesClient ? "" : recipient,
      siteId: form.siteId || selectedOrder?.siteId || "",
      site: selectedSite ? { name: selectedSite.name || "", address: selectedSite.address || "", city: selectedSite.city || "" } : (selectedOrder?.site || null),
      ascenseurId: form.ascenseurId || selectedOrder?.ascenseurId || "",
      ascenseur: selectedElevator ? { referenceInternal: selectedElevator.referenceInternal || "", serialNumber: selectedElevator.serialNumber || "", brand: selectedElevator.brand || selectedElevator.marque || "" } : (selectedOrder?.ascenseur || null),
      devisId: form.devisId,
      devisReference: selectedQuote?.number || selectedQuote?.reference || "",
      contratId: form.contratId,
      contratReference: selectedContract?.number || selectedContract?.reference || "",
      factureId: form.factureId,
      factureReference: selectedInvoice?.number || selectedInvoice?.reference || "",
      commandeId: form.commandeId,
      commandeReference: selectedOrder?.reference || selectedOrder?.number || "",
      status: form.status,
      expectedDate: form.expectedDate,
      observations: form.observations.trim(),
      date: form.date,
      items,
      subtotal,
      discountPercent: Number(form.discountPercent) || 0,
      discountAmount,
      taxRate: Number(form.taxRate) || 0,
      taxAmount,
      total: totalWithTax,
      currency: "MAD",
      supplier: !usesClient ? recipient : "",
      customer: usesClient ? recipient : "",
      client: usesClient ? recipient : "",
      relatedReference: selectedOrder?.reference || selectedOrder?.number || selectedQuote?.number || selectedQuote?.reference || selectedContract?.number || selectedContract?.reference || selectedInvoice?.number || selectedInvoice?.reference || "",
      refLiee: selectedOrder?.reference || selectedOrder?.number || selectedQuote?.number || selectedQuote?.reference || selectedContract?.number || selectedContract?.reference || selectedInvoice?.number || selectedInvoice?.reference || "",
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
                  clientId: nextType === "Livraison" ? current.clientId : "",
                  commandeId: "",
                  status: nextType === "Livraison" ? "Livré" : nextType === "Réception" ? "Reçu" : "Brouillon",
                }));
              }} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option value="Commande">Bon de commande</option>
                <option value="Livraison">Bon de livraison</option>
                <option value="Réception">Bon de réception fournisseur</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Destinataire : {usesClient ? "Client" : "Fournisseur"}
              {!isDelivery && !isReceipt && (
                <select value={form.recipientType} onChange={(event) => updateField("recipientType", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                  <option value="Fournisseur">Fournisseur</option>
                  <option value="Client">Client</option>
                </select>
              )}
              {(isDelivery || isReceipt) && <span className="mt-2 block rounded-xl border border-line bg-slate-100 px-3.5 py-3 text-sm font-normal text-slate-500">{isDelivery ? "Client" : "Fournisseur"}</span>}
            </label>
            {usesClient ? (
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Client <span className="text-red-500">*</span>
                <select required value={form.clientId} onChange={(event) => {
                  const clientId = event.target.value;
                  setForm((current) => ({ ...current, clientId, siteId: "", ascenseurId: "", devisId: "", contratId: "", factureId: "" }));
                }} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                  <option value="">Sélectionner un client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}</option>)}
                </select>
              </label>
            ) : (
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Fournisseur <span className="text-red-500">*</span>
                <input required maxLength={160} value={form.recipient} onChange={(event) => updateField("recipient", event.target.value)} placeholder="Nom du fournisseur" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
              </label>
            )}
            {isReceipt && (
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                Commande fournisseur liée
                <select value={form.commandeId} onChange={(event) => selectOrder(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                  <option value="">Réception sans commande associée</option>
                  {linkedOrders.map((order) => <option key={order.id} value={order.id}>{order.reference || order.number || order.id} · {order.recipient || "Fournisseur"}</option>)}
                </select>
              </label>
            )}
            {usesClient && form.clientId && (
              <>
                <label className="block text-xs font-semibold text-slate-600">
                  Site d’intervention / livraison
                  <select value={form.siteId} onChange={(event) => setForm((current) => ({ ...current, siteId: event.target.value, ascenseurId: "" }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                    <option value="">Aucun site sélectionné</option>
                    {clientSites.map((site) => <option key={site.id} value={site.id}>{site.name || "Site"} · {site.city || "Ville non renseignée"}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Ascenseur / équipement
                  <select value={form.ascenseurId} onChange={(event) => updateField("ascenseurId", event.target.value)} disabled={!form.siteId} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60">
                    <option value="">Aucun équipement sélectionné</option>
                    {siteAscenseurs.map((elevator) => <option key={elevator.id} value={elevator.id}>{elevator.referenceInternal || elevator.serialNumber || "Ascenseur"} · {elevator.brand || elevator.marque || "Marque non renseignée"}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Devis lié
                  <select value={form.devisId} onChange={(event) => updateField("devisId", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                    <option value="">Aucun devis lié</option>
                    {availableQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.number || quote.reference || quote.id}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Contrat lié
                  <select value={form.contratId} onChange={(event) => updateField("contratId", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                    <option value="">Aucun contrat lié</option>
                    {availableContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.number || contract.reference || contract.id}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Facture liée
                  <select value={form.factureId} onChange={(event) => updateField("factureId", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                    <option value="">Aucune facture liée</option>
                    {availableInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number || invoice.reference || invoice.id}</option>)}
                  </select>
                </label>
              </>
            )}
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Date <span className="text-red-500">*</span>
              <input required type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Statut
              <select value={form.status} onChange={(event) => updateField("status", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option>Brouillon</option><option>En cours</option><option>Partiellement reçu</option><option>Reçu</option><option>Livré</option><option>Annulé</option>
              </select>
            </label>
            {form.documentType === "Commande" && <label className="block text-xs font-semibold text-slate-600">
              Date prévue
              <input type="date" value={form.expectedDate} onChange={(event) => updateField("expectedDate", event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>}
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Observations
              <textarea rows={2} maxLength={1000} value={form.observations} onChange={(event) => updateField("observations", event.target.value)} className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
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
                  <p className="pb-2 text-right text-xs font-semibold text-slate-600">{formatMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</p>
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
              <div className="flex justify-between"><dt className="text-slate-500">Total HT</dt><dd className="font-semibold text-ink">{formatMoney(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Remise ({form.discountPercent || 0}%)</dt><dd className="font-semibold text-rose-700">−{formatMoney(discountAmount)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">TVA ({form.taxRate || 0}%)</dt><dd className="font-semibold text-ink">{formatMoney(taxAmount)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-sm"><dt className="font-bold text-slate-700">Total TTC</dt><dd className="font-bold text-blue-700">{formatMoney(totalWithTax)}</dd></div>
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
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [ascenseurs, setAscenseurs] = useState([]);
  const [devis, setDevis] = useState([]);
  const [factures, setFactures] = useState([]);
  const [contrats, setContrats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
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
    const unsubscribeRelated = [
      [clientsService, setClients, "clients"],
      [sitesService, setSites, "sites"],
      [ascenseursService, setAscenseurs, "ascenseurs"],
      [devisService, setDevis, "devis"],
      [facturesService, setFactures, "factures"],
      [contratsService, setContrats, "contrats"],
    ].map(([service, setRecords, label]) => service.subscribe(
      (records) => { if (active) setRecords(records); },
      (error) => {
        if (!active) return;
        console.error(`Impossible de charger ${label} pour les relations des bons.`, error);
        setLoadError("Certaines données liées aux bons n’ont pas pu être chargées. Vérifiez la connexion et les règles Firestore.");
      },
    ));

    return () => {
      active = false;
      unsubscribe();
      unsubscribeStock();
      unsubscribeRelated.forEach((unsubscribeRecord) => unsubscribeRecord());
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
        bon.clientName,
        bon.fournisseurName,
        bon.refLiee,
        bon.site?.name,
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
      } else if (documentType(bon) === "Réception") {
        pdf.generateBonReceptionPDF(bon, options);
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
    Réception: bons.filter((bon) => documentType(bon) === "Réception").length,
  }), [bons]);

  return (
    <section className="erp-module space-y-5">
      <div className="erp-page-header flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Achats & logistique</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">Bons de commande, livraison & réception</h2>
          <p className="mt-1 text-xs text-muted">Reliez les bons aux clients, sites, équipements et documents commerciaux.</p>
        </div>
        <button onClick={() => { setFormError(""); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark">
          <Plus size={16} /> Créer un bon
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-muted">Bons de réception</p><p className="mt-2 text-2xl font-bold tracking-tight text-ink">{loading ? "—" : counts.Réception}</p></div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Truck size={19} /></div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Réceptions fournisseurs et entrées stock</p>
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
          {["Tous", "Commande", "Livraison", "Réception"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab} className={`rounded-t-lg border-b-2 px-3 py-2.5 text-xs font-semibold transition ${activeTab === tab ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"}`}>
              {tab === "Tous" ? "Tous les bons" : `${tab === "Commande" ? "Commandes" : tab === "Livraison" ? "Livraisons" : "Réceptions"} (${counts[tab]})`}
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
                  const recipient = bon.clientName || bon.fournisseurName || bon.recipient || bon.supplier || bon.customer || bon.client || "—";
                  return (
                    <tr key={bon.id} className="text-xs transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${kind === "Livraison" ? "bg-emerald-50 text-emerald-700" : kind === "Réception" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{kind}</span></td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-ink">{bon.reference || bon.number || bon.id}<span className="block text-[10px] font-normal text-slate-400">{bon.status || "—"}</span></td>
                      <td className="px-4 py-3.5 text-slate-600">{recipient}<span className="block text-[10px] text-slate-400">{bon.site?.name || ""}{bon.refLiee ? ` · Lié à ${bon.refLiee}` : ""}</span></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{formatDate(bon.date)}</td>
                      <td className="px-4 py-3.5 text-slate-500">{items.length} {items.length === 1 ? "ligne" : "lignes"}</td>
                      <td className="px-5 py-3.5 text-right"><div className="flex flex-wrap items-center justify-end gap-1.5"><button type="button" onClick={() => setDetailRecord(bon)} aria-label={`Voir les détails du bon ${bon.number || bon.reference || ""}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-[10px] font-semibold text-slate-600 transition hover:border-brand hover:text-brand"><Eye size={13} /> Détails</button><FileUploader collectionName="commandes" recordId={bon.id} files={bon.attachments || []} /><button onClick={() => exportBon(bon)} aria-label={`Exporter le PDF du bon ${kind.toLocaleLowerCase("fr-FR")} ${bon.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-[10px] font-bold text-slate-600 transition hover:border-brand hover:bg-blue-50 hover:text-brand"><FileDown size={14} /> PDF</button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {actionError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">{actionError}</p>}
      {detailRecord && <RecordDetailsDialog
        title={`${documentType(detailRecord)} · ${detailRecord.recipient || detailRecord.clientName || detailRecord.fournisseurName || "Destinataire"}`}
        reference={detailRecord.number || detailRecord.reference || detailRecord.id}
        onClose={() => setDetailRecord(null)}
        sections={[
          { title: "Informations du bon", fields: [
            ["Type", documentType(detailRecord)],
            ["Date", formatDate(detailRecord.date)],
            ["Statut", detailRecord.status],
            ["Destinataire", detailRecord.recipient || detailRecord.clientName || detailRecord.fournisseurName],
            ["Site", detailRecord.site?.name || detailRecord.site?.address],
            ["Équipement", detailRecord.ascenseur?.referenceInternal || detailRecord.ascenseur?.serialNumber],
            ["Référence liée", detailRecord.refLiee || detailRecord.relatedReference],
            ["Échéance prévue", formatDate(detailRecord.expectedDate)],
            ["Réception", formatDate(detailRecord.receivedAt)],
            ["Livraison", formatDate(detailRecord.deliveredAt)],
          ] },
          { title: "Articles et totaux", fields: [
            ["Lignes", (detailRecord.items || detailRecord.articles || []).map((item) => `${item.description || item.designation || "Article"} · ${item.quantity ?? 0} ${item.unit || ""} · ${formatMoney(item.total ?? (Number(item.quantity) * Number(item.unitPrice)), detailRecord.currency || "MAD")}`)],
            ["Total HT", formatMoney(detailRecord.subtotal, detailRecord.currency || "MAD")],
            ["Remise", `${detailRecord.discountPercent || 0}% · ${formatMoney(detailRecord.discountAmount, detailRecord.currency || "MAD")}`],
            ["TVA", `${detailRecord.taxRate || 0}% · ${formatMoney(detailRecord.taxAmount, detailRecord.currency || "MAD")}`],
            ["Total TTC", formatMoney(detailRecord.total, detailRecord.currency || "MAD")],
          ] },
          { title: "Observations", fields: [["Observations", detailRecord.observations], ["Notes", detailRecord.notes]] },
        ]}
      />}
      {modalOpen && <BonModal stock={stock} stockLoading={stockLoading} bons={bons} clients={clients} sites={sites} ascenseurs={ascenseurs} devis={devis} factures={factures} contrats={contrats} onClose={() => setModalOpen(false)} onCreate={createBon} saving={saving} error={formError} />}
    </section>
  );
}
