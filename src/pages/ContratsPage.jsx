import { useEffect, useMemo, useState } from "react";
import { FileDown, FileText, LoaderCircle, Plus, Search, X } from "lucide-react";
import { ascenseursService, clientsService, contratsService, devisService, sitesService } from "../services/dbService";

const CONTRACT_TEMPLATES = {
  "Installation|Simple": {
    description: "Fourniture, pose et mise en service d’un ascenseur selon le devis et les caractéristiques techniques validés par les parties.",
    scopeItems: ["Étude et préparation du site", "Pose de l’équipement", "Essais et mise en service"],
    specialConditions: "Les travaux de maçonnerie, l’alimentation électrique et les adaptations non mentionnées au devis sont exclus sauf accord écrit.",
  },
  "Installation|Complet": {
    description: "Prise en charge complète du projet d’installation, de la préparation technique à la réception de l’équipement.",
    scopeItems: ["Étude technique et coordination du chantier", "Fourniture et installation de l’équipement", "Essais de sécurité et mise en service", "Remise des documents techniques et réception"],
    specialConditions: "Le calendrier dépend de la disponibilité du site, des autorisations et de l’avancement des travaux préparatoires.",
  },
  "Intervention|Simple": {
    description: "Intervention ponctuelle de diagnostic ou de dépannage sur l’équipement désigné, selon le rapport d’intervention associé.",
    scopeItems: ["Diagnostic de la panne", "Main-d’œuvre de dépannage", "Compte rendu de visite"],
    specialConditions: "Les pièces de rechange et travaux supplémentaires sont chiffrés séparément et réalisés après validation du client.",
  },
  "Intervention|Complet": {
    description: "Prestations de maintenance et d’intervention renforcées sur l’équipement, comprenant le suivi préventif et le traitement des anomalies.",
    scopeItems: ["Visites préventives planifiées", "Diagnostic et dépannage selon les conditions convenues", "Contrôles de sécurité et compte rendu", "Suivi des anomalies et recommandations"],
    specialConditions: "Les délais d’intervention, les horaires de permanence et les exclusions doivent être confirmés dans les conditions particulières signées.",
  },
};

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeScopeItem(description = "") {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, description, quantity: "1", unit: "forfait" };
}

function createInitialForm() {
  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  const template = CONTRACT_TEMPLATES["Installation|Simple"];
  return {
    clientId: "",
    siteId: "",
    ascenseurId: "",
    devisId: "",
    date: dateInputValue(new Date()),
    siteAddress: "",
    contractType: "Installation",
    category: "Simple",
    startDate: dateInputValue(start),
    endDate: dateInputValue(end),
    amount: "",
    elevatorBrand: "",
    capacityKg: "",
    floorCount: "",
    serialNumber: "",
    maintenanceFrequency: "À définir",
    paymentTerms: "Selon devis validé",
    status: "Actif",
    description: template.description,
    scopeItems: template.scopeItems.map(makeScopeItem),
    specialConditions: template.specialConditions,
  };
}

function formatDate(value) {
  if (!value) return "—";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

function ContractModal({ clients, sites, elevators, quotes, clientsLoading, onClose, onCreate, saving, error }) {
  const [form, setForm] = useState(createInitialForm);
  const [validationError, setValidationError] = useState("");
  const clientSites = sites.filter((site) => site.clientId === form.clientId);
  const siteElevators = elevators.filter((elevator) => elevator.siteId === form.siteId);
  const clientQuotes = quotes.filter((quote) => quote.clientId === form.clientId);

  function applyTemplate(contractType = form.contractType, category = form.category) {
    const template = CONTRACT_TEMPLATES[`${contractType}|${category}`];
    if (!template) return;
    setForm((current) => ({
      ...current,
      contractType,
      category,
      description: template.description,
      scopeItems: template.scopeItems.map(makeScopeItem),
      specialConditions: template.specialConditions,
    }));
  }

  function submit(event) {
    event.preventDefault();
    const client = clients.find((entry) => entry.id === form.clientId);
    const site = clientSites.find((entry) => entry.id === form.siteId);
    const elevator = siteElevators.find((entry) => entry.id === form.ascenseurId);
    const quote = clientQuotes.find((entry) => entry.id === form.devisId);
    setValidationError("");
    if (!client || (form.siteId && !site) || (form.ascenseurId && !elevator) || (form.devisId && !quote)) {
      setValidationError("Vérifiez le client et les liens sélectionnés (site, ascenseur, devis).");
      return;
    }
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      setValidationError("La date de fin ne peut pas précéder la date de début.");
      return;
    }
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 0) {
      setValidationError("Le montant du contrat doit être un nombre positif ou nul.");
      return;
    }
    onCreate({
      clientId: client.id,
      clientName: client.name || "Client",
      clientAddress: client.address || "",
      siteId: site?.id || "",
      siteName: site?.name || "",
      site: site ? {
        name: site.name || "",
        address: site.address || "",
        city: site.city || "",
        accessFloor: site.accessFloor || "",
        onsiteContact: site.onsiteContact || "",
        contactRole: site.contactRole || "",
        contactPhone: site.contactPhone || "",
      } : null,
      siteAddress: form.siteAddress.trim() || [site?.name, site?.address, site?.city].filter(Boolean).join(", "),
      ascenseurId: elevator?.id || "",
      ascenseur: elevator ? {
        number: elevator.number || "",
        referenceInternal: elevator.referenceInternal || "",
        serialNumber: elevator.serialNumber || "",
        brand: elevator.brand || "",
        model: elevator.model || "",
        type: elevator.type || "",
        stops: Number(elevator.stops) || 0,
        ratedLoadKg: Number(elevator.ratedLoadKg) || 0,
        persons: Number(elevator.persons) || 0,
        speedMps: Number(elevator.speedMps) || 0,
      } : null,
      devisId: quote?.id || "",
      devisReference: quote?.number || quote?.reference || "",
      date: form.date,
      contractType: form.contractType,
      category: form.category,
      startDate: form.startDate,
      endDate: form.endDate,
      amount: Number(form.amount),
      elevatorBrand: form.elevatorBrand.trim(),
      capacityKg: Number(form.capacityKg) || 0,
      floorCount: Number(form.floorCount) || 0,
      serialNumber: form.serialNumber.trim(),
      maintenanceFrequency: form.maintenanceFrequency,
      paymentTerms: form.paymentTerms,
      status: form.status,
      description: form.description.trim(),
      scopeItems: form.scopeItems.filter((item) => item.description.trim()).map(({ description, quantity, unit }) => ({
        description: description.trim(),
        quantity: Number(quantity) || 1,
        unit: unit.trim() || "forfait",
      })),
      specialConditions: form.specialConditions.trim(),
    });
  }

  const hasClients = clients.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="contract-modal-title" className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Gestion contractuelle</p>
            <h2 id="contract-modal-title" className="mt-1 text-lg font-bold text-ink">Ajouter un contrat</h2>
            <p className="mt-1 text-xs text-muted">Associez le contrat à un client et définissez ses conditions principales.</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <label className="block text-xs font-semibold text-slate-600">
            Client <span className="text-red-500">*</span>
            <select
              required
              value={form.clientId}
              onChange={(event) => setForm((current) => ({
                ...current,
                clientId: event.target.value,
                siteId: "",
                ascenseurId: "",
                devisId: "",
                siteAddress: "",
                amount: "",
                elevatorBrand: "",
                capacityKg: "",
                floorCount: "",
                serialNumber: "",
              }))}
              disabled={clientsLoading || !hasClients}
              className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
            >
              <option value="">{clientsLoading ? "Chargement des clients…" : hasClients ? "Sélectionner un client" : "Aucun client disponible"}</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}</option>)}
            </select>
            {!clientsLoading && !hasClients && <span className="mt-1.5 block text-[11px] font-normal text-amber-700">Créez d’abord une fiche client pour pouvoir établir un contrat.</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Site / immeuble
              <select
                value={form.siteId}
                onChange={(event) => {
                  const site = sites.find((entry) => entry.id === event.target.value);
                  setForm((current) => ({
                    ...current,
                    siteId: event.target.value,
                    ascenseurId: "",
                    siteAddress: [site?.name, site?.address, site?.city].filter(Boolean).join(", "),
                  }));
                }}
                disabled={!form.clientId}
                className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
              >
                <option value="">Aucun site sélectionné</option>
                {clientSites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.city || "Ville non renseignée"}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Devis associé
              <select
                value={form.devisId}
                onChange={(event) => {
                  const quote = clientQuotes.find((entry) => entry.id === event.target.value);
                  const quoteSite = sites.find((entry) => entry.id === quote?.siteId);
                  const quoteElevator = elevators.find((entry) => entry.id === quote?.ascenseurId);
                  setForm((current) => ({
                    ...current,
                    devisId: event.target.value,
                    amount: quote ? String(quote.total || 0) : current.amount,
                    paymentTerms: quote?.terms || current.paymentTerms,
                    siteId: quote?.siteId || current.siteId,
                    siteAddress: quoteSite ? [quoteSite.name, quoteSite.address, quoteSite.city].filter(Boolean).join(", ") : current.siteAddress,
                    ascenseurId: quote?.ascenseurId || current.ascenseurId,
                    elevatorBrand: quoteElevator?.brand || current.elevatorBrand,
                    capacityKg: quoteElevator ? String(quoteElevator.ratedLoadKg || "") : current.capacityKg,
                    floorCount: quoteElevator ? String(quoteElevator.stops || "") : current.floorCount,
                    serialNumber: quoteElevator?.serialNumber || current.serialNumber,
                  }));
                }}
                disabled={!form.clientId}
                className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
              >
                <option value="">Aucun devis associé</option>
                {clientQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.number || quote.reference} · {formatAmount(quote.total)}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Ascenseur concerné
              <select
                value={form.ascenseurId}
                onChange={(event) => {
                  const elevator = siteElevators.find((entry) => entry.id === event.target.value);
                  setForm((current) => ({
                    ...current,
                    ascenseurId: event.target.value,
                    elevatorBrand: elevator?.brand || "",
                    capacityKg: elevator ? String(elevator.ratedLoadKg || "") : "",
                    floorCount: elevator ? String(elevator.stops || "") : "",
                    serialNumber: elevator?.serialNumber || "",
                  }));
                }}
                disabled={!form.siteId}
                className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
              >
                <option value="">Aucun ascenseur sélectionné (ex. nouvelle installation)</option>
                {siteElevators.map((elevator) => <option key={elevator.id} value={elevator.id}>{elevator.number || elevator.referenceInternal || "Ascenseur"} · {elevator.brand || "Marque"} {elevator.model || ""}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-600">
            Adresse du site / nom de l’immeuble <span className="text-red-500">*</span>
            <input required maxLength={240} value={form.siteAddress} onChange={(event) => setForm((current) => ({ ...current, siteAddress: event.target.value }))} placeholder="Résidence Al Andalous, adresse complète" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Type de contrat <span className="text-red-500">*</span>
              <select value={form.contractType} onChange={(event) => applyTemplate(event.target.value, form.category)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option value="Installation">Installation</option>
                <option value="Intervention">Intervention</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Catégorie <span className="text-red-500">*</span>
              <select value={form.category} onChange={(event) => applyTemplate(form.contractType, event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option value="Simple">Contrat Simple</option>
                <option value="Complet">Contrat Complet</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Date du contrat
              <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Date de début <span className="text-red-500">*</span>
              <input required type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Date de fin
              <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Montant (€) <span className="text-red-500">*</span>
              <input required min="0" step="0.01" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0,00" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Statut du contrat
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option>Actif</option><option>Suspendu</option><option>Résilié</option>
              </select>
            </label>
          </div>

          <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-900">Modèle de contrat</h3>
                <p className="mt-1 text-[11px] leading-5 text-indigo-700">4 modèles prêts à personnaliser : installation ou intervention, simple ou complet.</p>
              </div>
              <button type="button" onClick={() => applyTemplate()} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100">
                <FileText size={14} /> Charger le modèle sélectionné
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Caractéristiques de l’ascenseur</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">Marque<input maxLength={100} value={form.elevatorBrand} onChange={(event) => setForm((current) => ({ ...current, elevatorBrand: event.target.value }))} placeholder="Ex. Otis, KONE" className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Charge utile (kg)<input type="number" min="0" step="1" value={form.capacityKg} onChange={(event) => setForm((current) => ({ ...current, capacityKg: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Nombre de niveaux / étages<input type="number" min="0" step="1" value={form.floorCount} onChange={(event) => setForm((current) => ({ ...current, floorCount: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Numéro de série<input maxLength={120} value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Fréquence de suivi (si applicable)<select value={form.maintenanceFrequency} onChange={(event) => setForm((current) => ({ ...current, maintenanceFrequency: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand"><option>À définir</option><option>Mensuelle</option><option>Trimestrielle</option><option>Annuelle</option><option>Sans maintenance</option></select></label>
              <label className="block text-xs font-semibold text-slate-600">Modalités de règlement<select value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand"><option>Selon devis validé</option><option>À la commande</option><option>Par étapes</option><option>Mensuel</option><option>Trimestriel</option></select></label>
            </div>
          </section>

          <section className="rounded-xl border border-line p-4">
            <div className="mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Périmètre du contrat</h3>
              <p className="mt-1 text-[11px] text-muted">Les prestations ci-dessous seront détaillées dans le contrat PDF.</p>
            </div>
            <label className="mb-4 block text-xs font-semibold text-slate-600">
              Objet et description
              <textarea rows={3} maxLength={3000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal leading-5 text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h4 className="text-xs font-semibold text-slate-700">Prestations incluses</h4><p className="mt-1 text-[10px] text-muted">Ajoutez, modifiez ou retirez des lignes.</p></div>
              <button type="button" disabled={form.scopeItems.length >= 20} onClick={() => setForm((current) => ({ ...current, scopeItems: [...current.scopeItems, makeScopeItem()] }))} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-[10px] font-semibold text-slate-600 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50">
                <Plus size={13} /> Ajouter une ligne
              </button>
            </div>
            <div className="space-y-2">
              {form.scopeItems.map((item, index) => (
                <div key={item.id} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_90px_110px_32px] sm:items-center">
                  <input aria-label={`Prestation ${index + 1}`} required value={item.description} onChange={(event) => setForm((current) => ({ ...current, scopeItems: current.scopeItems.map((row) => row.id === item.id ? { ...row, description: event.target.value } : row) }))} placeholder="Décrire la prestation ou l’étape" className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-ink outline-none focus:border-brand" />
                  <input aria-label={`Quantité prestation ${index + 1}`} type="number" min="1" step="1" value={item.quantity} onChange={(event) => setForm((current) => ({ ...current, scopeItems: current.scopeItems.map((row) => row.id === item.id ? { ...row, quantity: event.target.value } : row) }))} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-ink outline-none focus:border-brand" />
                  <input aria-label={`Unité prestation ${index + 1}`} maxLength={30} value={item.unit} onChange={(event) => setForm((current) => ({ ...current, scopeItems: current.scopeItems.map((row) => row.id === item.id ? { ...row, unit: event.target.value } : row) }))} placeholder="Unité / forfait" className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-ink outline-none focus:border-brand" />
                  <button type="button" aria-label={`Supprimer la prestation ${index + 1}`} disabled={form.scopeItems.length === 1} onClick={() => setForm((current) => ({ ...current, scopeItems: current.scopeItems.filter((row) => row.id !== item.id) }))} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><X size={14} /></button>
                </div>
              ))}
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-600">
              Conditions particulières
              <textarea rows={2} maxLength={2000} value={form.specialConditions} onChange={(event) => setForm((current) => ({ ...current, specialConditions: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal leading-5 text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-blue-50" />
            </label>
          </section>

          {(error || validationError) && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error || validationError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={saving || !hasClients || clientsLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? "Enregistrement…" : "Enregistrer le contrat"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function ContratsPage({ company = {}, profiles = {} }) {
  const [contracts, setContracts] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [elevators, setElevators] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [relationsError, setRelationsError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const unsubscribeContracts = contratsService.subscribe(
      (records) => {
        if (!active) return;
        setContracts(records);
        setLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les contrats depuis Firestore.", error);
        setLoadError("Le chargement des contrats a échoué. Vérifiez la connexion et les règles Firestore.");
        setLoading(false);
      },
    );
    const unsubscribeClients = clientsService.subscribe(
      (records) => {
        if (active) setClients(records);
        if (active) setClientsLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les clients nécessaires aux contrats.", error);
        setClientsLoading(false);
        setLoadError("La liste des clients n’a pas pu être chargée. Vérifiez la connexion et les règles Firestore.");
      },
    );
    const unsubscribeSites = sitesService.subscribe(
      (records) => { if (active) setSites(records); },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les sites pour les contrats.", error);
        setRelationsError("La liste des sites n’est pas disponible.");
      },
    );
    const unsubscribeElevators = ascenseursService.subscribe(
      (records) => { if (active) setElevators(records); },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les ascenseurs pour les contrats.", error);
        setRelationsError("La liste des ascenseurs n’est pas disponible.");
      },
    );
    const unsubscribeQuotes = devisService.subscribe(
      (records) => { if (active) setQuotes(records); },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les devis pour les contrats.", error);
        setRelationsError("La liste des devis n’est pas disponible.");
      },
    );

    return () => {
      active = false;
      unsubscribeContracts();
      unsubscribeClients();
      unsubscribeSites();
      unsubscribeElevators();
      unsubscribeQuotes();
    };
  }, []);

  const filteredContracts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    if (!query) return contracts;
    return contracts.filter((contract) =>
      [contract.number, contract.clientName, contract.contractType, contract.category, contract.amount, contract.elevatorBrand, contract.serialNumber, contract.siteName, contract.site?.name, contract.devisReference, contract.status]
        .some((value) => String(value ?? "").toLocaleLowerCase("fr-FR").includes(query)),
    );
  }, [contracts, search]);

  async function createContract(record) {
    setSaving(true);
    setFormError("");
    try {
      await contratsService.create(record);
      setModalOpen(false);
      setActionError("");
    } catch (error) {
      console.error("Impossible de créer le contrat dans Firestore.", error);
      setFormError("L’enregistrement a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function exportContract(contract) {
    setActionError("");
    try {
      const { generateContratPDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      const client = clients.find((entry) => entry.id === contract.clientId) || { name: contract.clientName || "Client" };
      generateContratPDF(contract, client, { company: readyCompany, director: profiles.director, salesperson: profiles.salesperson });
    } catch (error) {
      console.error("Impossible de générer le PDF du contrat.", error);
      setActionError(`Le PDF du contrat ${contract.id || ""} n’a pas pu être généré.`);
    }
  }

  return (
    <section className="erp-module space-y-5">
      <div className="erp-page-header flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Gestion contractuelle</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">Contrats</h2>
          <p className="mt-1 text-xs text-muted">Suivez les contrats d’installation et d’intervention de vos clients.</p>
        </div>
        <button onClick={() => { setFormError(""); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark">
          <Plus size={16} /> Ajouter un contrat
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-sm font-bold text-ink">Tous les contrats</h3>
            <p className="mt-1 text-[11px] text-muted">{loading ? "Synchronisation avec Firestore…" : `${contracts.length} ${contracts.length > 1 ? "contrats enregistrés" : "contrat enregistré"}`}</p>
          </div>
          <label className="relative block sm:w-[280px]">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un contrat…" aria-label="Rechercher un contrat" className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-ink outline-none transition focus:border-brand focus:bg-white" />
          </label>
        </div>

        {relationsError && <p role="alert" className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{relationsError} Vous pouvez toujours saisir le site manuellement.</p>}
        {loadError ? (
          <div role="alert" className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{loadError}</div>
        ) : loading ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted" role="status"><LoaderCircle size={25} className="animate-spin text-brand" /><span>Loading... Chargement des contrats</span></div>
        ) : filteredContracts.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-brand"><FileText size={21} /></div>
            <p className="mt-4 text-sm font-bold text-ink">{search ? "Aucun résultat" : "Aucun contrat pour le moment"}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted">{search ? "Essayez une autre recherche." : "Ajoutez votre premier contrat pour le retrouver ici."}</p>
            {!search && <button onClick={() => { setFormError(""); setModalOpen(true); }} className="mt-4 text-xs font-bold text-brand hover:text-brand-dark">Ajouter un contrat</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
                <tr><th className="px-5 py-3.5">Client / ascenseur</th><th className="px-4 py-3.5">Type</th><th className="px-4 py-3.5">Catégorie</th><th className="px-4 py-3.5">Caractéristiques</th><th className="px-4 py-3.5">Maintenance</th><th className="px-4 py-3.5">Période</th><th className="px-4 py-3.5">Montant</th><th className="px-4 py-3.5">Statut</th><th className="px-5 py-3.5 text-right">Fiche</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredContracts.map((contract) => {
                  const client = clients.find((entry) => entry.id === contract.clientId);
                  const contractType = contract.contractType || contract.type;
                  const category = contract.category || contract.categorie;
                  return (
                    <tr key={contract.id} className="text-xs transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5"><p className="font-semibold text-ink">{client?.name || contract.clientName || "Client"} <span className="font-mono text-[9px] text-slate-400">{contract.number || ""}</span></p><p className="mt-1 text-[10px] text-slate-500">{contract.siteName || contract.site?.name || contract.siteAddress || "Site non précisé"}</p><p className="mt-1 text-[10px] text-slate-400">{contract.ascenseur?.number || contract.ascenseur?.referenceInternal || contract.elevatorBrand || "Ascenseur non lié"}{contract.ascenseur?.serialNumber || contract.serialNumber ? ` · S/N ${contract.ascenseur?.serialNumber || contract.serialNumber}` : ""}</p><p className="mt-1 text-[10px] text-slate-400">{contract.devisReference ? `Devis ${contract.devisReference}` : "Sans devis associé"}</p></td>
                      <td className="px-4 py-3.5"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{contractType || "—"}</span></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{category ? `Contrat ${category}` : "—"}</td>
                      <td className="px-4 py-3.5 text-slate-500"><p>{contract.capacityKg ? `${contract.capacityKg} kg` : "Charge —"}</p><p className="mt-1 text-[10px]">{contract.floorCount ? `${contract.floorCount} niveaux` : "Niveaux —"}</p></td>
                      <td className="px-4 py-3.5 text-slate-500">{contract.maintenanceFrequency || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{formatDate(contract.startDate || contract.dateDebut)} – {formatDate(contract.endDate || contract.dateFin)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-ink">{formatAmount(contract.amount ?? contract.montant)}</td>
                      <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${contract.status === "Résilié" ? "bg-rose-50 text-rose-700" : contract.status === "Suspendu" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{contract.status || "Actif"}</span></td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => exportContract(contract)} aria-label={`Exporter le PDF du contrat ${contract.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-[10px] font-bold text-slate-600 transition hover:border-brand hover:bg-blue-50 hover:text-brand"><FileDown size={14} /> PDF</button>
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
      {modalOpen && <ContractModal clients={clients} sites={sites} elevators={elevators} quotes={quotes} clientsLoading={clientsLoading} onClose={() => setModalOpen(false)} onCreate={createContract} saving={saving} error={formError} />}
    </section>
  );
}
