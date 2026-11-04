import { useState } from "react";
import Icon from "./Icon";

const initialItems = [
  { description: "Installation d'un ascenseur électrique 6 personnes — fourniture, pose, mise en service et essais de sécurité.", quantity: 1, unitPrice: 18400 },
  { description: "Contrat de maintenance préventive — visites trimestrielles et assistance technique.", quantity: 1, unitPrice: 960 },
];

export default function DocumentForm({ profiles, company }) {
  const [kind, setKind] = useState("Devis");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [documentNumber, setDocumentNumber] = useState(`TGI-${new Date().getFullYear()}-001`);
  const [items, setItems] = useState(initialItems);
  const [taxRate, setTaxRate] = useState("20");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [notice, setNotice] = useState("");
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const discountAmount = subtotal * (Number(discountPercent) || 0) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (Number(taxRate) || 0) / 100;
  const totalWithTax = taxableAmount + taxAmount;
  const formatMoney = (value) => value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  async function createPdf(event) {
    event.preventDefault();
    if (!clientName.trim()) {
      setNotice("Renseignez le nom du client avant de générer le document.");
      return;
    }
    try {
      const { generateDocumentPDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      generateDocumentPDF({
        documentTitle: kind,
        documentNumber,
        client: { name: clientName.trim(), address: clientAddress.trim() },
        company: readyCompany,
        director: profiles.director,
        salesperson: profiles.salesperson,
        items,
        taxRate: Number(taxRate) || 0,
        discountPercent: Number(discountPercent) || 0,
        subtotal,
        discountAmount,
        taxAmount,
        total: totalWithTax,
      });
      setNotice(`${kind} généré et téléchargé avec succès.`);
    } catch (error) {
      console.error("La génération du document PDF a échoué.", error);
      setNotice("Impossible de générer le PDF. Vérifiez les données et réessayez.");
    }
  }

  return (
    <form onSubmit={createPdf} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-white p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink">Informations du document</h2>
              <p className="mt-1 text-xs text-muted">Les champs essentiels pour établir votre document.</p>
            </div>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {["Devis", "Facture"].map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setKind(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${kind === value ? "bg-white text-brand shadow-sm" : "text-slate-500"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              Nom du client *
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex. Résidence Les Jardins" className="mt-2 w-full rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Référence
              <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className="mt-2 w-full rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white" />
            </label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">
              Adresse du client
              <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Adresse, code postal, ville" className="mt-2 w-full rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white" />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink">Prestations & fournitures</h2>
              <p className="mt-1 text-xs text-muted">Les désignations longues sont automatiquement renvoyées à la ligne dans le PDF.</p>
            </div>
            <button type="button" onClick={() => setItems([...items, { description: "", quantity: 1, unitPrice: 0 }])} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand">
              <Icon name="plus" size={14} /> Ajouter
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_85px_130px_28px] md:items-end">
                <label className="text-[11px] font-semibold text-slate-500">
                  Désignation
                  <textarea rows={2} value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} placeholder="Description détaillée de la prestation" className="mt-1.5 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-xs font-normal leading-5 text-ink outline-none focus:border-brand" />
                </label>
                <label className="text-[11px] font-semibold text-slate-500">
                  Quantité
                  <input type="number" min="0" step="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", Number(e.target.value))} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-normal text-ink outline-none focus:border-brand" />
                </label>
                <label className="text-[11px] font-semibold text-slate-500">
                  Prix unitaire HT (€)
                  <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))} className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-normal text-ink outline-none focus:border-brand" />
                </label>
                <button type="button" aria-label="Supprimer la ligne" disabled={items.length === 1} onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} className="mb-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 md:p-6">
          <h2 className="text-sm font-bold text-ink">TVA et remise</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">TVA (%)<input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white" /></label>
            <label className="text-xs font-semibold text-slate-600">Remise (%)<input type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white" /></label>
          </div>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-xs">
            <div className="flex justify-between"><dt className="text-slate-500">Total HT</dt><dd className="font-semibold text-ink">{formatMoney(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Remise ({discountPercent || 0}%)</dt><dd className="font-semibold text-rose-700">−{formatMoney(discountAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">TVA ({taxRate || 0}%)</dt><dd className="font-semibold text-ink">{formatMoney(taxAmount)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-sm"><dt className="font-bold text-slate-700">Total TTC</dt><dd className="font-bold text-brand">{formatMoney(totalWithTax)}</dd></div>
          </dl>
        </section>
        {notice && <p role="status" className={`rounded-lg px-4 py-3 text-xs ${notice.includes("succès") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{notice}</p>}
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-white p-5">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand"><Icon name="file" /></div>
        <h2 className="text-sm font-bold text-ink">Document prêt à envoyer</h2>
        <p className="mt-2 text-xs leading-5 text-muted">Un PDF professionnel avec votre en-tête, les lignes de détail et les espaces de signatures de votre équipe.</p>
        <div className="my-5 space-y-3 border-y border-line py-4 text-xs text-slate-500">
          <div className="flex items-center justify-between"><span>Format</span><strong className="font-semibold text-ink">PDF · A4</strong></div>
          <div className="flex items-center justify-between"><span>Articles</span><strong className="font-semibold text-ink">{items.length}</strong></div>
          <div className="flex items-center justify-between"><span>Équipe</span><strong className="font-semibold text-ink">Directeur & commercial</strong></div>
        </div>
        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white transition hover:bg-brand-dark">
          <Icon name="download" size={16} /> Générer le PDF
        </button>
        <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">Mise en page optimisée · Retours à la ligne automatiques</p>
      </aside>
    </form>
  );
}
