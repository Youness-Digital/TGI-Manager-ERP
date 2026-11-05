import { useEffect, useState } from "react";
import { Eye, FileDown, FileText, LoaderCircle, Plus, Printer, ReceiptText, Trash2 } from "lucide-react";
import CompanyLogo from "./CompanyLogo";
import DocumentLayout, { DocumentTable } from "./DocumentLayout";

const FIELD_CLASS = "mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-normal text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50";

function createItem() {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 };
}

export default function DocumentForm({ profiles, company }) {
  const [kind, setKind] = useState("Devis");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [documentNumber, setDocumentNumber] = useState(`TGI-${new Date().getFullYear()}-001`);
  const [items, setItems] = useState([]);
  const [taxRate, setTaxRate] = useState("20");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");
  const [generating, setGenerating] = useState(false);
  const [pdfResources, setPdfResources] = useState(null);
  const [pdfLoadError, setPdfLoadError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const discountAmount = subtotal * (Number(discountPercent) || 0) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (Number(taxRate) || 0) / 100;
  const totalWithTax = taxableAmount + taxAmount;
  const formatMoney = (value) => value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  useEffect(() => {
    let active = true;
    setPdfResources(null);
    setPdfLoadError("");

    import("../utils/pdfGenerator")
      .then(async (pdfModule) => {
        const readyCompany = await pdfModule.prepareCompanyForPdf(company);
        if (active) setPdfResources({ generateDocumentPDF: pdfModule.generateDocumentPDF, company: readyCompany });
      })
      .catch((error) => {
        console.error("Impossible de préparer le générateur PDF.", error);
        if (active) setPdfLoadError("Le générateur PDF n’a pas pu être préparé. Vérifiez le logo de l’entreprise et rechargez la page.");
      });

    return () => {
      active = false;
    };
  }, [company]);

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function addItem() {
    setItems((current) => [...current, createItem()]);
  }

  function createPdf(event) {
    event.preventDefault();
    if (!clientName.trim()) {
      setNoticeType("error");
      setNotice("Renseignez le nom du client avant de générer le document.");
      return;
    }
    if (items.length === 0) {
      setNoticeType("error");
      setNotice("Ajoutez au moins une prestation ou un article avant de générer le document.");
      return;
    }
    const invalidItem = items.some((item) =>
      !item.description.trim()
      || !Number.isFinite(Number(item.quantity))
      || Number(item.quantity) <= 0
      || !Number.isFinite(Number(item.unitPrice))
      || Number(item.unitPrice) < 0
    );
    if (invalidItem) {
      setNoticeType("error");
      setNotice("Vérifiez les lignes : désignation obligatoire, quantité positive et prix non négatif.");
      return;
    }
    if (
      !Number.isFinite(Number(taxRate))
      || Number(taxRate) < 0
      || Number(taxRate) > 100
      || !Number.isFinite(Number(discountPercent))
      || Number(discountPercent) < 0
      || Number(discountPercent) > 100
    ) {
      setNoticeType("error");
      setNotice("La TVA et la remise doivent être comprises entre 0 et 100 %.");
      return;
    }

    setNotice("");
    if (!pdfResources) {
      setNoticeType("error");
      setNotice(pdfLoadError || "Le générateur PDF est encore en cours de préparation. Réessayez dans quelques secondes.");
      return;
    }

    setGenerating(true);
    try {
      pdfResources.generateDocumentPDF({
        documentTitle: kind,
        reference: documentNumber.trim(),
        documentNumber,
        client: { name: clientName.trim(), address: clientAddress.trim() },
        company: pdfResources.company,
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
      setNoticeType("success");
      setNotice(`${kind} généré et téléchargé avec succès.`);
    } catch (error) {
      console.error("La génération du document PDF a échoué.", error);
      setNoticeType("error");
      setNotice("Impossible de générer le PDF. Vérifiez les données et réessayez.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
    <form noValidate onSubmit={createPdf} className="mx-auto w-full max-w-[1320px] space-y-5">
      <header className="relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-48 w-48 rounded-full bg-indigo-50 blur-3xl" />
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-300/70">
            {kind === "Devis" ? <FileText size={22} /> : <ReceiptText size={22} />}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-indigo-600">Espace commercial <span className="px-1 text-slate-300">/</span> Nouveau document</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-[26px]">Créer un {kind.toLocaleLowerCase("fr-FR")}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Renseignez le client et les prestations, puis vérifiez les totaux avant de télécharger le PDF.</p>
          </div>
        </div>
        <div className="mt-4 inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:mt-0" aria-label="Type de document">
          {["Devis", "Facture"].map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all duration-200 ${kind === value ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
            >
              {value === "Devis" ? <FileText size={14} /> : <ReceiptText size={14} />}
              {value}
            </button>
          ))}
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FileText size={16} /></span>
              <div>
                <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-indigo-600">01</span><h3 className="text-sm font-bold text-slate-900">Informations générales</h3></div>
                <p className="mt-0.5 text-[11px] text-slate-500">Client, coordonnées et référence de suivi.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
            <label className="block min-w-0 text-xs font-semibold text-slate-600">
              Nom du client <span className="text-rose-500">*</span>
              <input required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex. Résidence Les Jardins" className={FIELD_CLASS} />
            </label>
            <label className="block min-w-0 text-xs font-semibold text-slate-600">
              Référence
              <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Ex. TGI-2026-001" className={FIELD_CLASS} />
            </label>
            <label className="block min-w-0 text-xs font-semibold text-slate-600 md:col-span-2">
              Adresse du client
              <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Adresse, code postal, ville" className={FIELD_CLASS} />
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center md:px-6">
            <div>
              <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-indigo-600">02</span><h3 className="text-sm font-bold text-slate-900">Détail des prestations</h3></div>
              <p className="mt-1 text-[11px] text-slate-500">Désignation, quantité et prix unitaire hors taxes.</p>
            </div>
            <button type="button" onClick={addItem} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100">
              <Plus size={15} /> Ajouter une ligne
            </button>
          </div>
          <div className="space-y-3 p-4 md:p-5">
            {items.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm"><FileText size={18} /></span>
                <p className="mt-3 text-xs font-semibold text-slate-700">Aucune ligne ajoutée</p>
                <p className="mt-1 text-[11px] text-slate-500">Ajoutez une prestation ou un article pour chiffrer le document.</p>
                <button type="button" onClick={addItem} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"><Plus size={14} /> Ajouter la première ligne</button>
              </div>
            ) : (
              <>
              <div className="hidden grid-cols-[minmax(0,1fr)_100px_150px_36px] gap-3 px-4 pb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:grid">
                <span>Désignation</span><span>Quantité</span><span>Prix unitaire HT</span><span />
              </div>
              {items.map((item, index) => (
              <div key={item.id} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:border-indigo-200 sm:grid-cols-[minmax(0,1fr)_100px_150px_36px] sm:items-end sm:p-4">
                <label className="min-w-0 text-[11px] font-semibold text-slate-600">
                  Désignation <span className="text-rose-500">*</span>
                  <textarea rows={2} value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} placeholder="Décrivez la prestation ou l’article" className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal leading-5 text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" />
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  Quantité
                  <input type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" />
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  Prix unitaire HT (€)
                  <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" />
                </label>
                <button type="button" aria-label={`Supprimer la ligne ${index + 1}`} onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="flex h-9 w-9 items-center justify-center self-end rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:mb-0.5">
                  <Trash2 size={15} />
                </button>
                <p className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500 sm:col-span-4 sm:justify-end sm:gap-1 sm:border-0 sm:pt-0">Montant de la ligne <span className="text-xs font-bold text-slate-800">{formatMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</span></p>
              </div>
              ))}
              </>
            )}
          </div>
        </section>
        {notice && <p role={noticeType === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-xs ${noticeType === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{notice}</p>}
      </div>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-24">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-900 p-5 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white p-1">
                <CompanyLogo src={company?.logoUrl} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-300">Récapitulatif</p>
                <p className="mt-0.5 truncate text-sm font-bold">{kind} · {documentNumber || "Sans référence"}</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="text-slate-500">Client</span>
              <span className="max-w-[65%] truncate font-semibold text-slate-800">{clientName || "À renseigner"}</span>
            </div>
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="text-slate-500">Lignes</span>
              <span className="font-semibold text-slate-800">{items.length}</span>
            </div>
            <div className="space-y-3 border-t border-slate-100 pt-4 text-xs">
              <label className="flex items-center justify-between gap-3 text-slate-600">
                TVA (%)
                <input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-right text-xs font-semibold text-slate-800 outline-none focus:border-indigo-400" />
              </label>
              <label className="flex items-center justify-between gap-3 text-slate-600">
                Remise (%)
                <input type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-right text-xs font-semibold text-slate-800 outline-none focus:border-indigo-400" />
              </label>
            </div>
            <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Total HT</dt><dd className="font-semibold text-slate-800">{formatMoney(subtotal)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Remise ({discountPercent || 0}%)</dt><dd className="font-semibold text-rose-600">−{formatMoney(discountAmount)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">TVA ({taxRate || 0}%)</dt><dd className="font-semibold text-slate-800">{formatMoney(taxAmount)}</dd></div>
            </dl>
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="flex items-end justify-between gap-2">
                <span className="text-xs font-semibold text-indigo-800">Total TTC</span>
                <span className="text-xl font-bold tracking-tight text-indigo-700">{formatMoney(totalWithTax)}</span>
              </div>
            </div>
            <button type="submit" disabled={generating || !pdfResources || !items.length} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-xs font-bold text-white shadow-md shadow-indigo-200/80 transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55">
              {generating ? <LoaderCircle size={16} className="animate-spin" /> : <FileDown size={16} />}
              {generating ? "Génération en cours…" : pdfResources ? "Télécharger le PDF" : "Préparation du PDF…"}
            </button>
            <button type="button" onClick={() => setShowPreview((visible) => !visible)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700">
              <Eye size={15} /> {showPreview ? "Masquer l’aperçu imprimable" : "Aperçu imprimable"}
            </button>
            {pdfLoadError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-700">{pdfLoadError}</p>}
            <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">Document A4 · Mise en page avec retour à la ligne</p>
          </div>
        </section>
      </aside>
      </div>
    </form>
    {showPreview && (
      <section className="document-print-root mx-auto mt-8 w-full max-w-[1320px]">
        <div className="mb-3 flex justify-end print:hidden">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-700">
            <Printer size={15} /> Imprimer l’aperçu
          </button>
        </div>
        <DocumentLayout
          company={pdfResources?.company || company}
          documentType={kind}
          reference={documentNumber}
          dateEmission={new Date()}
        >
          <section className="mb-7 grid gap-5 sm:grid-cols-2">
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Facturé à</h2>
              <p className="font-bold text-slate-900">{clientName || "Client à renseigner"}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{clientAddress || "Adresse à renseigner"}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold text-slate-500">Date d’émission</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{new Date().toLocaleDateString("fr-FR")}</p>
            </div>
          </section>
          <DocumentTable
            caption="Détail des prestations"
            columns={[
              { key: "description", label: "Désignation" },
              { key: "quantity", label: "Qté", align: "right" },
              { key: "unitPrice", label: "Prix unitaire HT", align: "right", render: (value) => formatMoney(Number(value) || 0) },
              { key: "lineTotal", label: "Total HT", align: "right", render: (_, item) => formatMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)) },
            ]}
            rows={items}
          />
          <dl className="ml-auto mt-6 w-full max-w-sm space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt>Total HT</dt><dd className="text-right font-semibold tabular-nums">{formatMoney(subtotal)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Remise ({discountPercent || 0} %)</dt><dd className="text-right font-semibold tabular-nums">−{formatMoney(discountAmount)}</dd></div>
            <div className="flex justify-between gap-4"><dt>TVA ({taxRate || 0} %)</dt><dd className="text-right font-semibold tabular-nums">{formatMoney(taxAmount)}</dd></div>
            <div className="flex justify-between gap-4 border-t border-slate-300 pt-3 text-base font-extrabold text-slate-900"><dt>Total TTC</dt><dd className="text-right tabular-nums">{formatMoney(totalWithTax)}</dd></div>
          </dl>
        </DocumentLayout>
      </section>
    )}
    </>
  );
}
