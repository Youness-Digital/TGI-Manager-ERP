import { useEffect, useState } from "react";
import { Eye, FileDown, FileText, LoaderCircle, Plus, Printer, ReceiptText, Trash2 } from "lucide-react";
import CompanyLogo from "./CompanyLogo";
import DocumentLayout, { DocumentTable } from "./DocumentLayout";
import FileUploader from "./FileUploader";
import { ascenseursService, clientsService, devisService, facturesService, sitesService } from "../services/dbService";
import RecordDetailsDialog from "./RecordDetailsDialog";

const FIELD_CLASS = "mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-normal text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50";

function dateInputValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function daysFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

function formatDocumentDate(value) {
  if (!value) return "—";
  const date = typeof value?.toDate === "function"
    ? value.toDate()
    : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function createItem() {
  return { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 };
}

export default function DocumentForm({ profiles, company }) {
  const [kind, setKind] = useState("Devis");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedElevatorId, setSelectedElevatorId] = useState("");
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [elevators, setElevators] = useState([]);
  const [relatedDataError, setRelatedDataError] = useState("");
  const [issueDate, setIssueDate] = useState(() => dateInputValue(new Date()));
  const [validUntil, setValidUntil] = useState(() => daysFromToday(30));
  const [quoteStatus, setQuoteStatus] = useState("Brouillon");
  const [invoiceDueDate, setInvoiceDueDate] = useState(() => daysFromToday(30));
  const [invoiceStatus, setInvoiceStatus] = useState("À payer");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [terms, setTerms] = useState("");
  const [savedQuote, setSavedQuote] = useState(null);
  const [savedInvoice, setSavedInvoice] = useState(null);
  const [savedQuotes, setSavedQuotes] = useState([]);
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState("");
  const [invoicesError, setInvoicesError] = useState("");
  const [quoteActionError, setQuoteActionError] = useState("");
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
  const [detailDocument, setDetailDocument] = useState(null);
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const discountAmount = subtotal * (Number(discountPercent) || 0) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (Number(taxRate) || 0) / 100;
  const totalWithTax = taxableAmount + taxAmount;
  const formatMoney = (value, currency = "MAD") => currency === "MAD"
    ? `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
    : value.toLocaleString("fr-FR", { style: "currency", currency });
  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const clientSites = sites.filter((site) => site.clientId === selectedClientId);
  const selectedSite = clientSites.find((site) => site.id === selectedSiteId);
  const siteElevators = elevators.filter((elevator) => elevator.siteId === selectedSiteId);
  const selectedElevator = siteElevators.find((elevator) => elevator.id === selectedElevatorId);
  const selectedQuote = savedQuotes.find((quote) => quote.id === selectedQuoteId);
  const clientQuotes = savedQuotes.filter((quote) => quote.clientId === selectedClientId);
  const invoiceDraftSnapshot = JSON.stringify({
    clientId: selectedClientId,
    clientName,
    clientAddress,
    siteId: selectedSiteId,
    ascenseurId: selectedElevatorId,
    devisId: selectedQuoteId,
    issueDate,
    dueDate: invoiceDueDate,
    status: invoiceStatus,
    items,
    taxRate,
    discountPercent,
    terms,
  });
  const invoiceIsSaved = savedInvoice?.snapshot === invoiceDraftSnapshot;

  useEffect(() => {
    let active = true;
    const subscriptions = [
      [clientsService, setClients, "Impossible de charger les clients pour le devis."],
      [sitesService, setSites, "Impossible de charger les sites pour le devis."],
      [ascenseursService, setElevators, "Impossible de charger les ascenseurs pour le devis."],
    ].map(([service, setRecords, errorMessage]) => service.subscribe(
      setRecords,
      (error) => {
        if (!active) return;
        console.error(errorMessage, error);
        setRelatedDataError("Les clients, sites ou ascenseurs n’ont pas pu être chargés. Vérifiez la connexion et les règles Firestore.");
      },
    ));
    const unsubscribeQuotes = devisService.subscribe(
      (records) => {
        if (!active) return;
        const sortedRecords = [...records].sort((left, right) => String(right.issueDate || "").localeCompare(String(left.issueDate || "")));
        setSavedQuotes(sortedRecords);
        setQuotesLoading(false);
        setQuotesError("");
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les devis depuis Firestore.", error);
        setQuotesError("Les devis enregistrés n’ont pas pu être chargés.");
        setQuotesLoading(false);
      },
    );
    const unsubscribeInvoices = facturesService.subscribe(
      (records) => {
        if (!active) return;
        const sortedRecords = [...records].sort((left, right) => String(right.issueDate || "").localeCompare(String(left.issueDate || "")));
        setSavedInvoices(sortedRecords);
        setInvoicesLoading(false);
        setInvoicesError("");
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les factures depuis Firestore.", error);
        setInvoicesError("Les factures enregistrées n’ont pas pu être chargées.");
        setInvoicesLoading(false);
      },
    );
    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      unsubscribeQuotes();
      unsubscribeInvoices();
    };
  }, []);

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

  function exportSavedQuote(quote) {
    setQuoteActionError("");
    if (!pdfResources) {
      setQuoteActionError(pdfLoadError || "Le générateur PDF n’est pas encore prêt.");
      return;
    }
    try {
      pdfResources.generateDocumentPDF({
        ...quote,
        documentTitle: "Devis",
        company: pdfResources.company,
        director: profiles.director,
        salesperson: profiles.salesperson,
      });
    } catch (error) {
      console.error("Impossible de générer le PDF du devis enregistré.", error);
      setQuoteActionError(`Le PDF du devis ${quote.number || quote.reference || ""} n’a pas pu être généré.`);
    }
  }

  function exportSavedInvoice(invoice) {
    setQuoteActionError("");
    if (!pdfResources) {
      setQuoteActionError(pdfLoadError || "Le générateur PDF n’est pas encore prêt.");
      return;
    }
    try {
      pdfResources.generateDocumentPDF({
        ...invoice,
        documentTitle: "Facture",
        company: pdfResources.company,
        director: profiles.director,
        salesperson: profiles.salesperson,
      });
    } catch (error) {
      console.error("Impossible de générer le PDF de la facture enregistrée.", error);
      setQuoteActionError(`Le PDF de la facture ${invoice.number || invoice.reference || ""} n’a pas pu être généré.`);
    }
  }

  async function createPdf(event) {
    event.preventDefault();
    if (!clientName.trim()) {
      setNoticeType("error");
      setNotice("Renseignez le nom du client avant de générer le document.");
      return;
    }
    if (!selectedClient) {
      setNoticeType("error");
      setNotice("Sélectionnez une fiche client pour enregistrer le document et le rattacher à son compte.");
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
    if (kind === "Devis" && (!issueDate || !validUntil || validUntil < issueDate)) {
      setNoticeType("error");
      setNotice("La date d’émission et la date de validité sont obligatoires, et la validité ne peut pas précéder l’émission.");
      return;
    }
    if (kind === "Facture" && (!issueDate || !invoiceDueDate || invoiceDueDate < issueDate)) {
      setNoticeType("error");
      setNotice("La date d’émission et l’échéance sont obligatoires, et l’échéance ne peut pas précéder l’émission.");
      return;
    }

    setNotice("");
    if (!pdfResources) {
      setNoticeType("error");
      setNotice(pdfLoadError || "Le générateur PDF est encore en cours de préparation. Réessayez dans quelques secondes.");
      return;
    }

    setGenerating(true);
    let documentForPdf;
    try {
      if (kind === "Devis") {
        const quoteRecord = {
          documentTitle: "Devis",
          documentType: "Devis",
          date: issueDate,
          issueDate,
          validUntil,
          clientId: selectedClient.id,
          clientName: selectedClient.name || clientName.trim(),
          clientType: selectedClient.clientType || "",
          clientAddress: clientAddress.trim(),
          clientBillingAddress: selectedClient.billingAddress || "",
          clientIce: selectedClient.ice || "",
          clientIfNumber: selectedClient.ifNumber || "",
          clientRc: selectedClient.rc || "",
          clientPhone: selectedClient.phone || "",
          clientEmail: selectedClient.email || "",
          client: {
            name: selectedClient.name || clientName.trim(),
            address: clientAddress.trim(),
            email: selectedClient.email || "",
            phone: selectedClient.phone || "",
            ice: selectedClient.ice || "",
            ifNumber: selectedClient.ifNumber || "",
            rc: selectedClient.rc || "",
          },
          siteId: selectedSite?.id || "",
          site: selectedSite ? {
            name: selectedSite.name || "",
            address: selectedSite.address || "",
            city: selectedSite.city || "",
            accessFloor: selectedSite.accessFloor || "",
          } : null,
          ascenseurId: selectedElevator?.id || "",
          ascenseur: selectedElevator ? {
            number: selectedElevator.number || "",
            referenceInternal: selectedElevator.referenceInternal || "",
            serialNumber: selectedElevator.serialNumber || "",
            brand: selectedElevator.brand || "",
            model: selectedElevator.model || "",
            type: selectedElevator.type || "",
            stops: Number(selectedElevator.stops) || 0,
            ratedLoadKg: Number(selectedElevator.ratedLoadKg) || 0,
          } : null,
          items: items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            total: Number(item.quantity) * Number(item.unitPrice),
          })),
          taxRate: Number(taxRate) || 0,
          discountPercent: Number(discountPercent) || 0,
          subtotal,
          discountAmount,
          taxAmount,
          total: totalWithTax,
          currency: "MAD",
          terms: terms.trim(),
          status: quoteStatus,
        };
        const snapshot = JSON.stringify(quoteRecord);
        if (savedQuote?.snapshot === snapshot) {
          documentForPdf = savedQuote.document;
        } else {
          const quoteId = await devisService.create(quoteRecord);
          const savedRecord = await devisService.get(quoteId);
          if (!savedRecord) throw new Error("Le devis enregistré est introuvable.");
          documentForPdf = savedRecord;
          setSavedQuote({ snapshot, document: savedRecord });
          setDocumentNumber(savedRecord.number || savedRecord.reference);
        }
      } else {
        const invoiceRecord = {
          documentTitle: "Facture",
          documentType: "Facture",
          date: issueDate,
          issueDate,
          dueDate: invoiceDueDate,
          clientId: selectedClient.id,
          clientName: selectedClient.name || clientName.trim(),
          clientType: selectedClient.clientType || "",
          clientAddress: clientAddress.trim(),
          clientBillingAddress: selectedClient.billingAddress || "",
          clientIce: selectedClient.ice || "",
          clientIfNumber: selectedClient.ifNumber || "",
          clientRc: selectedClient.rc || "",
          clientPhone: selectedClient.phone || "",
          clientEmail: selectedClient.email || "",
          client: {
            name: selectedClient.name || clientName.trim(),
            address: clientAddress.trim(),
            email: selectedClient.email || "",
            phone: selectedClient.phone || "",
            ice: selectedClient.ice || "",
            ifNumber: selectedClient.ifNumber || "",
            rc: selectedClient.rc || "",
          },
          devisId: selectedQuote?.id || "",
          devisReference: selectedQuote?.number || selectedQuote?.reference || "",
          siteId: selectedSite?.id || "",
          site: selectedSite ? {
            name: selectedSite.name || "",
            address: selectedSite.address || "",
            city: selectedSite.city || "",
            accessFloor: selectedSite.accessFloor || "",
          } : null,
          ascenseurId: selectedElevator?.id || "",
          ascenseur: selectedElevator ? {
            number: selectedElevator.number || "",
            referenceInternal: selectedElevator.referenceInternal || "",
            serialNumber: selectedElevator.serialNumber || "",
            brand: selectedElevator.brand || "",
            model: selectedElevator.model || "",
            type: selectedElevator.type || "",
            stops: Number(selectedElevator.stops) || 0,
            ratedLoadKg: Number(selectedElevator.ratedLoadKg) || 0,
          } : null,
          items: items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            total: Number(item.quantity) * Number(item.unitPrice),
          })),
          taxRate: Number(taxRate) || 0,
          discountPercent: Number(discountPercent) || 0,
          subtotal,
          discountAmount,
          taxAmount,
          total: totalWithTax,
          paidAmount: 0,
          balanceDue: totalWithTax,
          currency: selectedQuote?.currency || "MAD",
          terms: terms.trim(),
          status: invoiceStatus,
        };
        const snapshot = invoiceDraftSnapshot;
        if (savedInvoice?.snapshot === snapshot) {
          documentForPdf = savedInvoice.document;
        } else {
          const invoiceId = await facturesService.create(invoiceRecord);
          const savedRecord = await facturesService.get(invoiceId);
          if (!savedRecord) throw new Error("La facture enregistrée est introuvable.");
          documentForPdf = savedRecord;
          setSavedInvoice({ snapshot, document: savedRecord });
        }
      }
    } catch (error) {
      console.error(`Impossible d’enregistrer le ${kind.toLocaleLowerCase("fr-FR")} dans Firestore.`, error);
      setNoticeType("error");
      setNotice(`Le ${kind.toLocaleLowerCase("fr-FR")} n’a pas pu être enregistré. Vérifiez la connexion et les règles Firestore.`);
      setGenerating(false);
      return;
    }

    try {
      pdfResources.generateDocumentPDF({
        ...documentForPdf,
        documentTitle: kind,
        company: pdfResources.company,
        director: profiles.director,
        salesperson: profiles.salesperson,
      });
      setNoticeType("success");
      setNotice(kind === "Devis" || kind === "Facture"
        ? `${kind} ${documentForPdf.number || documentForPdf.reference} enregistré dans Firestore et téléchargé en PDF.`
        : `${kind} généré et téléchargé avec succès.`);
    } catch (error) {
      console.error("La génération du document PDF a échoué.", error);
      setNoticeType("error");
      setNotice((kind === "Devis" || kind === "Facture") && documentForPdf
        ? `Le ${kind.toLocaleLowerCase("fr-FR")} ${documentForPdf.number || documentForPdf.reference} est enregistré, mais le PDF n’a pas pu être généré.`
        : "Impossible de générer le PDF. Vérifiez les données et réessayez.");
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
            {kind === "Devis" && (
              <>
                <label className="block min-w-0 text-xs font-semibold text-slate-600 md:col-span-2">
                  Fiche client <span className="text-rose-500">*</span>
                  <select
                    required
                    value={selectedClientId}
                    onChange={(event) => {
                      const nextClient = clients.find((client) => client.id === event.target.value);
                      setSelectedClientId(event.target.value);
                      setSelectedSiteId("");
                      setSelectedElevatorId("");
                      setClientName(nextClient?.name || "");
                      setClientAddress(nextClient?.billingAddress || nextClient?.address || "");
                    }}
                    className={FIELD_CLASS}
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}{client.clientType ? ` · ${client.clientType}` : ""}</option>)}
                  </select>
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Site / immeuble
                  <select
                    value={selectedSiteId}
                    onChange={(event) => {
                      setSelectedSiteId(event.target.value);
                      setSelectedElevatorId("");
                    }}
                    disabled={!selectedClientId}
                    className={FIELD_CLASS}
                  >
                    <option value="">Aucun site sélectionné</option>
                    {clientSites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.city || "Ville non renseignée"}</option>)}
                  </select>
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Ascenseur concerné
                  <select value={selectedElevatorId} onChange={(event) => setSelectedElevatorId(event.target.value)} disabled={!selectedSiteId} className={FIELD_CLASS}>
                    <option value="">Aucun ascenseur sélectionné</option>
                    {siteElevators.map((elevator) => <option key={elevator.id} value={elevator.id}>{elevator.number || elevator.referenceInternal || "Ascenseur"} · {elevator.brand || "Marque"} {elevator.model || ""}</option>)}
                  </select>
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Date d’émission <span className="text-rose-500">*</span>
                  <input required type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={FIELD_CLASS} />
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Valable jusqu’au <span className="text-rose-500">*</span>
                  <input required type="date" min={issueDate} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={FIELD_CLASS} />
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Statut du devis
                  <select value={quoteStatus} onChange={(event) => setQuoteStatus(event.target.value)} className={FIELD_CLASS}>
                    <option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option><option>Expiré</option>
                  </select>
                </label>
              </>
            )}
            {kind === "Facture" && (
              <>
                <label className="block min-w-0 text-xs font-semibold text-slate-600 md:col-span-2">
                  Fiche client <span className="text-rose-500">*</span>
                  <select
                    required
                    value={selectedClientId}
                    onChange={(event) => {
                      const nextClient = clients.find((client) => client.id === event.target.value);
                      setSelectedClientId(event.target.value);
                      setSelectedSiteId("");
                      setSelectedElevatorId("");
                      setSelectedQuoteId("");
                      setClientName(nextClient?.name || "");
                      setClientAddress(nextClient?.billingAddress || nextClient?.address || "");
                    }}
                    className={FIELD_CLASS}
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}{client.clientType ? ` · ${client.clientType}` : ""}</option>)}
                  </select>
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Devis associé
                  <select
                    value={selectedQuoteId}
                    onChange={(event) => {
                      const nextQuote = savedQuotes.find((quote) => quote.id === event.target.value);
                      setSelectedQuoteId(event.target.value);
                      setSelectedSiteId(nextQuote?.siteId || "");
                      setSelectedElevatorId(nextQuote?.ascenseurId || "");
                      if (nextQuote) {
                        setItems((nextQuote.items || []).map((item) => ({ ...item, id: crypto.randomUUID() })));
                        setTaxRate(String(nextQuote.taxRate ?? 20));
                        setDiscountPercent(String(nextQuote.discountPercent ?? 0));
                        setTerms(nextQuote.terms || "");
                      }
                    }}
                    disabled={!selectedClientId}
                    className={FIELD_CLASS}
                  >
                    <option value="">Facture sans devis</option>
                    {clientQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.number || quote.reference} · {formatMoney(Number(quote.total) || 0, quote.currency || "MAD")} · {quote.status || "Brouillon"}</option>)}
                  </select>
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Site / immeuble
                  <select value={selectedSiteId} onChange={(event) => { setSelectedSiteId(event.target.value); setSelectedElevatorId(""); }} disabled={!selectedClientId} className={FIELD_CLASS}>
                    <option value="">Aucun site sélectionné</option>
                    {clientSites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.city || "Ville non renseignée"}</option>)}
                  </select>
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Ascenseur concerné
                  <select value={selectedElevatorId} onChange={(event) => setSelectedElevatorId(event.target.value)} disabled={!selectedSiteId} className={FIELD_CLASS}>
                    <option value="">Aucun ascenseur sélectionné</option>
                    {siteElevators.map((elevator) => <option key={elevator.id} value={elevator.id}>{elevator.number || elevator.referenceInternal || "Ascenseur"} · {elevator.brand || "Marque"} {elevator.model || ""}</option>)}
                  </select>
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Date d’émission <span className="text-rose-500">*</span>
                  <input required type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={FIELD_CLASS} />
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Échéance <span className="text-rose-500">*</span>
                  <input required type="date" min={issueDate} value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} className={FIELD_CLASS} />
                </label>
                <label className="block min-w-0 text-xs font-semibold text-slate-600">
                  Statut de paiement
                  <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)} className={FIELD_CLASS}>
                    <option>À payer</option><option>En retard</option><option>Envoyée</option><option>Brouillon</option>
                  </select>
                </label>
              </>
            )}
            <label className="block min-w-0 text-xs font-semibold text-slate-600">
              Nom du client <span className="text-rose-500">*</span>
              <input required value={clientName} readOnly={Boolean(selectedClient)} onChange={(e) => setClientName(e.target.value)} placeholder="Ex. Résidence Les Jardins" className={`${FIELD_CLASS} ${selectedClient ? "cursor-not-allowed bg-slate-100" : ""}`} />
            </label>
            <label className="block min-w-0 text-xs font-semibold text-slate-600">
              Référence
              <input value={kind === "Devis" ? (savedQuote?.document.number || "Attribuée à l’enregistrement") : kind === "Facture" ? (invoiceIsSaved ? (savedInvoice.document.number || savedInvoice.document.reference) : "Attribuée à l’enregistrement") : documentNumber} readOnly placeholder="Ex. TGI-2026-001" className={`${FIELD_CLASS} cursor-not-allowed bg-slate-100`} />
            </label>
            <label className="block min-w-0 text-xs font-semibold text-slate-600 md:col-span-2">
              Adresse du client
              <input value={clientAddress} readOnly={kind !== "Facture"} onChange={(e) => setClientAddress(e.target.value)} placeholder="Adresse, code postal, ville" className={`${FIELD_CLASS} ${kind !== "Facture" ? "cursor-not-allowed bg-slate-100" : ""}`} />
            </label>
            {relatedDataError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 md:col-span-2">{relatedDataError}</p>}
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
                  Prix unitaire HT (DH)
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
        {(kind === "Devis" || kind === "Facture") && (
          <label className="block rounded-2xl border border-slate-200 bg-white p-5 text-xs font-semibold text-slate-600 shadow-sm">
            Conditions et modalités
            <textarea rows={3} value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="Délais, modalités de paiement, durée d’intervention, exclusions…" className={`${FIELD_CLASS} resize-y`} />
          </label>
        )}
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
                <p className="mt-0.5 truncate text-sm font-bold">{kind} · {kind === "Devis" ? (savedQuote?.document.number || "Référence automatique") : kind === "Facture" ? (invoiceIsSaved ? (savedInvoice.document.number || savedInvoice.document.reference) : "Référence automatique") : documentNumber || "Sans référence"}</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between text-xs">
              <span className="text-slate-500">Client</span>
              <span className="max-w-[65%] truncate font-semibold text-slate-800">{clientName || "À renseigner"}</span>
            </div>
            {kind === "Devis" && selectedSite && (
              <div className="mb-4 flex items-center justify-between gap-3 text-xs">
                <span className="shrink-0 text-slate-500">Site / ascenseur</span>
                <span className="max-w-[65%] truncate text-right font-semibold text-slate-800">{selectedSite.name}{selectedElevator ? ` · ${selectedElevator.number || selectedElevator.referenceInternal || selectedElevator.serialNumber}` : ""}</span>
              </div>
            )}
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
    {kind === "Devis" && (
      <section className="mx-auto mt-7 w-full max-w-[1320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-bold text-slate-900">Devis enregistrés</h2>
          <p className="mt-1 text-[11px] text-slate-500">Historique Firestore, statuts et réexport des documents PDF.</p>
        </div>
        {quotesError && <p role="alert" className="m-5 rounded-lg bg-rose-50 px-4 py-3 text-xs text-rose-700">{quotesError}</p>}
        {quoteActionError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-xs text-rose-700">{quoteActionError}</p>}
        {quotesLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Chargement des devis…</div>
        ) : !savedQuotes.length ? (
          <p className="p-10 text-center text-xs text-slate-500">Aucun devis enregistré pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Référence</th><th className="px-4 py-3">Client / site</th><th className="px-4 py-3">Émis le / validité</th><th className="px-4 py-3">Total TTC</th><th className="px-4 py-3">Statut</th><th className="px-5 py-3 text-right">PDF</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savedQuotes.map((quote) => (
                  <tr key={quote.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-800">{quote.number || quote.reference || "—"}</td>
                    <td className="px-4 py-3.5"><p className="font-semibold text-slate-800">{quote.clientName || quote.client?.name || "Client"}</p><p className="mt-1 text-[10px] text-slate-500">{[quote.site?.name, quote.ascenseur?.number || quote.ascenseur?.referenceInternal].filter(Boolean).join(" · ") || "Sans site / ascenseur associé"}</p></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600"><p>{formatDocumentDate(quote.issueDate || quote.date)}</p><p className="mt-1 text-[10px] text-slate-400">Valable au {formatDocumentDate(quote.validUntil)}</p></td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800">{formatMoney(Number(quote.total) || 0, quote.currency || "MAD")}</td>
                    <td className="px-4 py-3.5"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">{quote.status || "Brouillon"}</span></td>
                    <td className="px-5 py-3.5 text-right"><div className="flex flex-wrap items-center justify-end gap-1.5"><button type="button" onClick={() => setDetailDocument({ kind: "Devis", record: quote })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"><Eye size={13} /> Détails</button><FileUploader collectionName="devis" recordId={quote.id} files={quote.attachments || []} categories={["devis", "autre"]} /><button type="button" onClick={() => exportSavedQuote(quote)} disabled={!pdfResources} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"><FileDown size={13} /> Télécharger</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )}
    {kind === "Facture" && (
      <section className="mx-auto mt-7 w-full max-w-[1320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-bold text-slate-900">Factures enregistrées</h2>
          <p className="mt-1 text-[11px] text-slate-500">Factures Firestore, échéances et soldes à régler.</p>
        </div>
        {invoicesError && <p role="alert" className="m-5 rounded-lg bg-rose-50 px-4 py-3 text-xs text-rose-700">{invoicesError}</p>}
        {quoteActionError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-xs text-rose-700">{quoteActionError}</p>}
        {invoicesLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Chargement des factures…</div>
        ) : !savedInvoices.length ? (
          <p className="p-10 text-center text-xs text-slate-500">Aucune facture enregistrée pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-xs">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3">Référence</th><th className="px-4 py-3">Client / équipement</th><th className="px-4 py-3">Échéance</th><th className="px-4 py-3">Total TTC</th><th className="px-4 py-3">Réglé / solde</th><th className="px-4 py-3">Statut</th><th className="px-5 py-3 text-right">PDF</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-800">{invoice.number || invoice.reference || "—"}</td>
                    <td className="px-4 py-3.5"><p className="font-semibold text-slate-800">{invoice.clientName || invoice.client?.name || "Client"}</p><p className="mt-1 text-[10px] text-slate-500">{[invoice.site?.name, invoice.ascenseur?.number || invoice.ascenseur?.referenceInternal].filter(Boolean).join(" · ") || "Sans site / ascenseur associé"}</p></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600"><p>{formatDocumentDate(invoice.dueDate)}</p><p className="mt-1 text-[10px] text-slate-400">Émise le {formatDocumentDate(invoice.issueDate || invoice.date)}</p></td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800">{formatMoney(Number(invoice.total) || 0, invoice.currency || "MAD")}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600"><p>{formatMoney(Number(invoice.paidAmount) || 0, invoice.currency || "MAD")}</p><p className="mt-1 text-[10px] text-rose-600">Solde {formatMoney(Number(invoice.balanceDue) || 0, invoice.currency || "MAD")}</p></td>
                    <td className="px-4 py-3.5"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">{invoice.status || "À payer"}</span></td>
                    <td className="px-5 py-3.5 text-right"><div className="flex flex-wrap items-center justify-end gap-1.5"><button type="button" onClick={() => setDetailDocument({ kind: "Facture", record: invoice })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700"><Eye size={13} /> Détails</button><FileUploader collectionName="factures" recordId={invoice.id} files={invoice.attachments || []} categories={["facture", "preuve de paiement", "autre"]} /><button type="button" onClick={() => exportSavedInvoice(invoice)} disabled={!pdfResources} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"><FileDown size={13} /> Télécharger</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )}
    {detailDocument && <RecordDetailsDialog
      title={`${detailDocument.kind} · ${detailDocument.record.clientName || detailDocument.record.client?.name || "Client"}`}
      reference={detailDocument.record.number || detailDocument.record.reference || detailDocument.record.id}
      onClose={() => setDetailDocument(null)}
      sections={[
        { title: "Client et équipement", fields: [
          ["Client", detailDocument.record.clientName || detailDocument.record.client?.name],
          ["Adresse", detailDocument.record.clientAddress || detailDocument.record.client?.address],
          ["ICE / IF / RC", [detailDocument.record.clientIce || detailDocument.record.client?.ice, detailDocument.record.clientIfNumber || detailDocument.record.client?.ifNumber, detailDocument.record.clientRc || detailDocument.record.client?.rc]],
          ["Téléphone / email", [detailDocument.record.clientPhone || detailDocument.record.client?.phone, detailDocument.record.clientEmail || detailDocument.record.client?.email]],
          ["Site", [detailDocument.record.site?.name, detailDocument.record.site?.address, detailDocument.record.site?.city]],
          ["Ascenseur", [detailDocument.record.ascenseur?.referenceInternal || detailDocument.record.ascenseur?.number, detailDocument.record.ascenseur?.brand, detailDocument.record.ascenseur?.model, detailDocument.record.ascenseur?.serialNumber]],
        ] },
        { title: "Lignes et montants", fields: [
          ["Articles / prestations", (detailDocument.record.items || []).map((item) => `${item.description || item.designation || "Ligne"} · ${item.quantity ?? 0} ${item.unit || ""} · ${formatMoney(item.total ?? Number(item.quantity) * Number(item.unitPrice), detailDocument.record.currency || "MAD")}`)],
          ["Total HT", formatMoney(detailDocument.record.subtotal, detailDocument.record.currency || "MAD")],
          ["Remise", `${detailDocument.record.discountPercent || 0}% · ${formatMoney(detailDocument.record.discountAmount, detailDocument.record.currency || "MAD")}`],
          ["TVA", `${detailDocument.record.taxRate || 0}% · ${formatMoney(detailDocument.record.taxAmount, detailDocument.record.currency || "MAD")}`],
          ["Total TTC", formatMoney(detailDocument.record.total, detailDocument.record.currency || "MAD")],
          ["Déjà réglé", formatMoney(detailDocument.record.paidAmount, detailDocument.record.currency || "MAD")],
          ["Solde", formatMoney(detailDocument.record.balanceDue, detailDocument.record.currency || "MAD")],
        ] },
        { title: "Suivi", fields: [
          ["Date d’émission", formatDocumentDate(detailDocument.record.issueDate || detailDocument.record.date)],
          [detailDocument.kind === "Devis" ? "Valide jusqu’au" : "Échéance", formatDocumentDate(detailDocument.kind === "Devis" ? detailDocument.record.validUntil : detailDocument.record.dueDate)],
          ["Statut", detailDocument.record.status],
          ["Conditions", detailDocument.record.terms],
          ["Notes", detailDocument.record.notes],
          ["Pièces jointes", (detailDocument.record.attachments || []).map((file) => file.nom || file.name)],
        ] },
      ]}
    />}
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
          reference={kind === "Devis" ? (savedQuote?.document.number || "Attribuée à l’enregistrement") : kind === "Facture" ? (invoiceIsSaved ? (savedInvoice.document.number || savedInvoice.document.reference) : "Attribuée à l’enregistrement") : documentNumber}
          dateEmission={issueDate}
        >
          <section className="mb-7 grid gap-5 sm:grid-cols-2">
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Facturé à</h2>
              <p className="font-bold text-slate-900">{clientName || "Client à renseigner"}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{clientAddress || "Adresse à renseigner"}</p>
              {selectedClient && <p className="mt-1 text-xs text-slate-500">{[selectedClient.phone, selectedClient.email, selectedClient.ice && `ICE ${selectedClient.ice}`, selectedClient.rc && `RC ${selectedClient.rc}`].filter(Boolean).join(" · ")}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold text-slate-500">Date d’émission</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{formatDocumentDate(issueDate)}</p>
              {kind === "Devis" && <><p className="mt-2 text-xs font-semibold text-slate-500">Valable jusqu’au</p><p className="mt-1 text-sm font-bold text-slate-800">{formatDocumentDate(validUntil)}</p><p className="mt-2 text-xs font-semibold text-slate-500">Statut</p><p className="mt-1 text-sm font-bold text-slate-800">{quoteStatus}</p></>}
              {kind === "Facture" && <><p className="mt-2 text-xs font-semibold text-slate-500">Échéance</p><p className="mt-1 text-sm font-bold text-slate-800">{formatDocumentDate(invoiceDueDate)}</p><p className="mt-2 text-xs font-semibold text-slate-500">Statut</p><p className="mt-1 text-sm font-bold text-slate-800">{invoiceStatus}</p></>}
            </div>
          </section>
          {(kind === "Devis" || kind === "Facture") && (selectedSite || selectedElevator) && (
            <section className="mb-7 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 print:bg-slate-50 print:[print-color-adjust:exact]">
              {selectedSite && <div><h2 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Site concerné</h2><p className="mt-1 text-sm font-semibold text-slate-800">{selectedSite.name}</p><p className="mt-1 whitespace-pre-line text-xs text-slate-600">{[selectedSite.address, selectedSite.city].filter(Boolean).join(", ")}</p></div>}
              {selectedElevator && <div><h2 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ascenseur concerné</h2><p className="mt-1 text-sm font-semibold text-slate-800">{selectedElevator.number || selectedElevator.referenceInternal || "Ascenseur"} · {selectedElevator.brand} {selectedElevator.model}</p><p className="mt-1 text-xs text-slate-600">{[selectedElevator.type, selectedElevator.serialNumber && `S/N ${selectedElevator.serialNumber}`, selectedElevator.stops && `${selectedElevator.stops} niveaux`, selectedElevator.ratedLoadKg && `${selectedElevator.ratedLoadKg} kg`].filter(Boolean).join(" · ")}</p></div>}
            </section>
          )}
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
          {(kind === "Devis" || kind === "Facture") && terms && <p className="mt-6 whitespace-pre-line break-words text-xs leading-5 text-slate-600"><strong className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Conditions et modalités</strong>{terms}</p>}
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
