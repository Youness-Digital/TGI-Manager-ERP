import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Eye, FileDown, LoaderCircle, Plus, Search, X } from "lucide-react";
import FileUploader from "../components/FileUploader";
import RecordDetailsDialog from "../components/RecordDetailsDialog";
import {
  ascenseursService,
  clientsService,
  contratsService,
  equipeService,
  interventionsService,
  sitesService,
  stockService,
  updateStockMovement,
} from "../services/dbService";

const EMPTY_FORM = {
  clientId: "",
  siteId: "",
  ascenseurId: "",
  contratId: "",
  siteAddress: "",
  date: "",
  startTime: "",
  endTime: "",
  technicianId: "",
  interventionType: "Dépannage",
  diagnosis: "",
  workPerformed: "",
  recommendations: "",
  followUp: "",
  nextVisitDate: "",
  contactName: "",
  contactPhone: "",
  clientSignature: "",
  report: "",
  status: "En cours",
  priority: "Normal",
  checklist: {
    Cabine: false,
    "Portes palières": false,
    "Moteur / traction": false,
    Frein: false,
    Parachute: false,
    "Alarme / communication": false,
    "Éclairage de secours": false,
    "Niveau d’arrêt": false,
  },
  spareParts: [{ stockItemId: "", designation: "", reference: "", quantity: "1" }],
};

function formatDate(value) {
  if (!value) return "—";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

const STATUS_CLASSES = {
  Planifiée: "bg-blue-50 text-blue-700 ring-blue-200",
  "En cours": "bg-amber-50 text-amber-700 ring-amber-200",
  Terminé: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Terminée: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Annulée: "bg-slate-100 text-slate-600 ring-slate-200",
};

function teamMemberName(member) {
  return member ? [member.firstName, member.lastName].filter(Boolean).join(" ") || member.name || "Membre" : "";
}

async function createInterventionWithStock(record) {
  const quantitiesByItem = new Map();
  for (const part of record.spareParts || []) {
    if (!part.stockItemId) continue;
    quantitiesByItem.set(part.stockItemId, (quantitiesByItem.get(part.stockItemId) || 0) + Number(part.quantity || 0));
  }

  const appliedMovements = [];
  try {
    for (const [itemId, quantity] of quantitiesByItem) {
      const movement = { itemId, quantityChange: -quantity };
      await updateStockMovement(movement.itemId, movement.quantityChange, {
        date: record.date,
        reason: `Pièces utilisées pour l’intervention ${record.interventionType || ""}`.trim(),
        sourceType: "Intervention",
        clientId: record.clientId || "",
        contratId: record.contratId || "",
        actorId: record.technicianId || "",
        actorName: record.technician || "",
        notes: record.number || record.ascenseur?.referenceInternal || "",
      });
      appliedMovements.push(movement);
    }
    return await interventionsService.create(record);
  } catch (error) {
    const rollbackErrors = [];
    for (const movement of appliedMovements.reverse()) {
      try {
        await updateStockMovement(movement.itemId, -movement.quantityChange, {
          reason: "Annulation d’un mouvement après échec de création de l’intervention",
          sourceType: "Annulation",
        });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      console.error("La création de l’intervention a échoué et certains mouvements de stock n’ont pas pu être annulés.", {
        error,
        rollbackErrors,
      });
      throw new Error("L’enregistrement a échoué et le stock n’a pas pu être entièrement restauré. Vérifiez le stock avant de réessayer.", { cause: error });
    }
    throw error;
  }
}

function InterventionModal({ clients, clientsLoading, sites, sitesLoading, ascenseurs, equipmentLoading, contracts, contractsLoading, team, teamLoading, stock, stockLoading, onClose, onCreate, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const clientSites = sites.filter((site) => site.clientId === form.clientId);
  const siteElevators = ascenseurs.filter((elevator) => elevator.siteId === form.siteId);
  const clientContracts = contracts.filter((contract) => contract.clientId === form.clientId);
  const selectedSite = clientSites.find((site) => site.id === form.siteId);
  const selectedElevator = siteElevators.find((elevator) => elevator.id === form.ascenseurId);
  const selectedContract = clientContracts.find((contract) => contract.id === form.contratId);

  function submit(event) {
    event.preventDefault();
    const client = clients.find((entry) => entry.id === form.clientId);
    if (!client) return;
    const timeToMinutes = (value) => {
      if (!value) return null;
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    };
    const startMinutes = timeToMinutes(form.startTime);
    const endMinutes = timeToMinutes(form.endTime);
    const durationMinutes = startMinutes != null && endMinutes != null
      ? (endMinutes >= startMinutes ? endMinutes : endMinutes + 24 * 60) - startMinutes
      : 0;
    const siteSnapshot = selectedSite ? {
      name: selectedSite.name || "",
      address: selectedSite.address || "",
      city: selectedSite.city || "",
      accessFloor: selectedSite.accessFloor || "",
      onsiteContact: selectedSite.onsiteContact || selectedSite.contactName || "",
      contactPhone: selectedSite.contactPhone || "",
    } : null;
    const elevatorSnapshot = selectedElevator ? {
      number: selectedElevator.number || "",
      referenceInternal: selectedElevator.referenceInternal || "",
      serialNumber: selectedElevator.serialNumber || "",
      brand: selectedElevator.brand || selectedElevator.marque || "",
      model: selectedElevator.model || "",
      type: selectedElevator.type || "",
      stops: Number(selectedElevator.stops) || 0,
    } : null;
    onCreate({
      clientId: client.id,
      clientName: client.name || "Client",
      clientType: client.clientType || "",
      siteId: selectedSite?.id || "",
      site: siteSnapshot,
      siteAddress: selectedSite
        ? [selectedSite.name, selectedSite.address, selectedSite.city].filter(Boolean).join(", ")
        : form.siteAddress.trim(),
      ascenseurId: selectedElevator?.id || "",
      equipmentId: selectedElevator?.id || "",
      ascenseur: elevatorSnapshot,
      contratId: selectedContract?.id || "",
      contractReference: selectedContract?.number || selectedContract?.reference || "",
      contactName: form.contactName.trim() || siteSnapshot?.onsiteContact || "",
      contactPhone: form.contactPhone.trim() || siteSnapshot?.contactPhone || "",
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      durationMinutes,
      technicianId: form.technicianId,
      technician: teamMemberName(team.find((member) => member.id === form.technicianId)),
      interventionType: form.interventionType,
      type: form.interventionType,
      report: form.report.trim(),
      diagnosis: form.diagnosis.trim(),
      workPerformed: form.workPerformed.trim(),
      recommendations: form.recommendations.trim(),
      followUp: form.followUp.trim(),
      nextVisitDate: form.nextVisitDate,
      clientSignature: form.clientSignature.trim(),
      status: form.status,
      priority: form.priority,
      checklist: Object.entries(form.checklist).map(([label, checked]) => ({ label, checked })),
      spareParts: form.spareParts
        .filter((part) => part.stockItemId)
        .map((part) => ({
          stockItemId: part.stockItemId,
          reference: part.reference,
          designation: part.designation,
          quantity: Number(part.quantity) || 0,
        })),
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
      <section role="dialog" aria-modal="true" aria-labelledby="intervention-modal-title" className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Équipe technique</p>
            <h2 id="intervention-modal-title" className="mt-1 text-lg font-bold text-ink">Planifier une intervention</h2>
            <p className="mt-1 text-xs text-muted">Enregistrez la visite et son compte rendu pour le suivi du site.</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink disabled:opacity-40"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">
            Client <span className="text-red-500">*</span>
            <select required value={form.clientId} onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value, siteId: "", ascenseurId: "", contratId: "", siteAddress: "" }))} disabled={clientsLoading || !hasClients} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60">
              <option value="">{clientsLoading ? "Chargement des clients…" : hasClients ? "Sélectionner un client" : "Aucun client disponible"}</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}</option>)}
            </select>
            {!clientsLoading && !hasClients && <span className="mt-1.5 block text-[11px] font-normal text-amber-700">Créez une fiche client avant de planifier une intervention.</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Site / immeuble
              <select value={form.siteId} onChange={(event) => setForm((current) => ({ ...current, siteId: event.target.value, ascenseurId: "" }))} disabled={!form.clientId} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60">
                <option value="">{sitesLoading ? "Chargement des sites…" : "Site non enregistré / saisie libre"}</option>
                {clientSites.map((site) => <option key={site.id} value={site.id}>{site.name || "Site"} · {site.city || "Ville non renseignée"}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Ascenseur concerné
              <select value={form.ascenseurId} onChange={(event) => setForm((current) => ({ ...current, ascenseurId: event.target.value }))} disabled={!form.siteId} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60">
                <option value="">{equipmentLoading ? "Chargement des équipements…" : "Aucun équipement sélectionné"}</option>
                {siteElevators.map((elevator) => <option key={elevator.id} value={elevator.id}>{elevator.referenceInternal || elevator.serialNumber || "Ascenseur"} · {elevator.brand || elevator.marque || "Autre"} {elevator.model || ""}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Contrat associé
              <select value={form.contratId} onChange={(event) => {
                const contract = clientContracts.find((entry) => entry.id === event.target.value);
                setForm((current) => ({ ...current, contratId: event.target.value, siteId: contract?.siteId || current.siteId, ascenseurId: contract?.ascenseurId || current.ascenseurId }));
              }} disabled={!form.clientId} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60">
                <option value="">{contractsLoading ? "Chargement des contrats…" : "Aucun contrat associé"}</option>
                {clientContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.number || contract.reference || contract.id} · {contract.contractType || contract.type || "Contrat"}</option>)}
              </select>
            </label>
            {!form.siteId && <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Adresse du site / nom de l’immeuble <span className="text-red-500">*</span>
              <input required maxLength={240} value={form.siteAddress} onChange={(event) => setForm((current) => ({ ...current, siteAddress: event.target.value }))} placeholder="Résidence, adresse complète et ville" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>}
            <label className="block text-xs font-semibold text-slate-600">
              Contact sur place
              <input maxLength={160} value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} placeholder={selectedSite?.onsiteContact || "Gardien, syndic…"} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Téléphone du contact
              <input type="tel" maxLength={40} value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder={selectedSite?.contactPhone || "Téléphone"} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Date de l’intervention <span className="text-red-500">*</span>
              <input required type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Heure de début
              <input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Heure de fin
              <input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Technicien <span className="text-red-500">*</span>
              <select required value={form.technicianId} onChange={(event) => setForm((current) => ({ ...current, technicianId: event.target.value }))} disabled={teamLoading || team.length === 0} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60">
                <option value="">{teamLoading ? "Chargement de l’équipe…" : team.length ? "Sélectionner un technicien" : "Aucun membre enregistré"}</option>
                {team.map((member) => <option key={member.id} value={member.id}>{teamMemberName(member)} · {member.role || "Technicien"}</option>)}
              </select>
              {!teamLoading && !team.length && <span className="mt-1.5 block text-[11px] font-normal text-amber-700">Ajoutez un membre dans le module Équipe avant de planifier l’intervention.</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Type d’intervention <span className="text-red-500">*</span>
              <select value={form.interventionType} onChange={(event) => setForm((current) => ({ ...current, interventionType: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option>Installation</option>
                <option>Maintenance préventive</option>
                <option>Dépannage</option>
                <option>Modernisation</option>
                <option>Contrôle réglementaire</option>
                <option>Visite technique</option>
                <option>Entretien régulier</option>
                <option>Panne</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Statut <span className="text-red-500">*</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option>En cours</option>
                <option>Terminée</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Priorité
              <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option>Faible</option><option>Normal</option><option>Urgent</option><option>Critique</option>
              </select>
            </label>
          </div>

          <section className="rounded-xl border border-line bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Checklist de sécurité</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys(form.checklist).map((item) => (
                <label key={item} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={form.checklist[item]} onChange={(event) => setForm((current) => ({ ...current, checklist: { ...current.checklist, [item]: event.target.checked } }))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  {item}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Pièces de rechange utilisées</h3>
              <button type="button" onClick={() => setForm((current) => ({ ...current, spareParts: [...current.spareParts, { stockItemId: "", designation: "", reference: "", quantity: "1" }] }))} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-[10px] font-semibold text-slate-600 hover:border-brand hover:text-brand"><Plus size={13} /> Ajouter une pièce</button>
            </div>
            <div className="space-y-2">
              {form.spareParts.map((part, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_32px]">
                  <select aria-label="Pièce de stock" value={part.stockItemId} disabled={stockLoading || stock.length === 0} onChange={(event) => {
                    const selected = stock.find((item) => item.id === event.target.value);
                    setForm((current) => ({ ...current, spareParts: current.spareParts.map((row, rowIndex) => rowIndex === index ? {
                      ...row,
                      stockItemId: selected?.id || "",
                      designation: selected?.designation || "",
                      reference: selected?.reference || "",
                      quantity: "1",
                    } : row) }));
                  }} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-ink outline-none focus:border-brand disabled:opacity-60">
                    <option value="">{stockLoading ? "Chargement du stock…" : stock.length ? "Sélectionner une pièce" : "Aucune pièce en stock"}</option>
                    {stock.filter((item) => Number(item.quantity) > 0).map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.designation} ({item.quantity} en stock)</option>)}
                  </select>
                  <input aria-label="Quantité" type="number" min="1" step="1" max={stock.find((item) => item.id === part.stockItemId)?.quantity || undefined} value={part.quantity} onChange={(event) => setForm((current) => ({ ...current, spareParts: current.spareParts.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row) }))} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-ink outline-none focus:border-brand" />
                  <button type="button" aria-label="Supprimer la pièce" disabled={form.spareParts.length === 1} onClick={() => setForm((current) => ({ ...current, spareParts: current.spareParts.filter((_, rowIndex) => rowIndex !== index) }))} className="flex h-9 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X size={15} /></button>
                </div>
              ))}
            </div>
          </section>

          <label className="block text-xs font-semibold text-slate-600">
            Compte rendu de l’intervention <span className="text-red-500">*</span>
            <textarea required rows={4} maxLength={5000} value={form.report} onChange={(event) => setForm((current) => ({ ...current, report: event.target.value }))} placeholder="Décrivez le motif de la visite, les contrôles réalisés et les suites à donner…" className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal leading-5 text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Diagnostic
              <textarea rows={3} maxLength={2500} value={form.diagnosis} onChange={(event) => setForm((current) => ({ ...current, diagnosis: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Travaux réalisés
              <textarea rows={3} maxLength={2500} value={form.workPerformed} onChange={(event) => setForm((current) => ({ ...current, workPerformed: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Recommandations
              <textarea rows={2} maxLength={2000} value={form.recommendations} onChange={(event) => setForm((current) => ({ ...current, recommendations: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Suite à donner
              <textarea rows={2} maxLength={2000} value={form.followUp} onChange={(event) => setForm((current) => ({ ...current, followUp: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Prochaine visite prévue
              <input type="date" min={form.date || undefined} value={form.nextVisitDate} onChange={(event) => setForm((current) => ({ ...current, nextVisitDate: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Nom du représentant client / visa
              <input maxLength={160} value={form.clientSignature} onChange={(event) => setForm((current) => ({ ...current, clientSignature: event.target.value }))} placeholder="Nom du signataire sur site" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={saving || !hasClients || clientsLoading || sitesLoading || equipmentLoading || contractsLoading || !team.length || teamLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? "Enregistrement…" : "Enregistrer l’intervention"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function InterventionsPage({ company = {}, profiles = {} }) {
  const [interventions, setInterventions] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [ascenseurs, setAscenseurs] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [team, setTeam] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const unsubscribeInterventions = interventionsService.subscribe(
      (records) => {
        if (!active) return;
        setInterventions(records);
        setLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les interventions depuis Firestore.", error);
        setLoadError("Le chargement des interventions a échoué. Vérifiez la connexion et les règles Firestore.");
        setLoading(false);
      },
    );
    const unsubscribeSites = sitesService.subscribe(
      (records) => {
        if (!active) return;
        setSites(records);
        setSitesLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les sites nécessaires aux interventions.", error);
        setSitesLoading(false);
        setLoadError("Les sites n’ont pas pu être chargés depuis Firestore.");
      },
    );
    const unsubscribeElevators = ascenseursService.subscribe(
      (records) => {
        if (!active) return;
        setAscenseurs(records);
        setEquipmentLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger le parc installé pour les interventions.", error);
        setEquipmentLoading(false);
        setLoadError("Les ascenseurs n’ont pas pu être chargés depuis Firestore.");
      },
    );
    const unsubscribeContracts = contratsService.subscribe(
      (records) => {
        if (!active) return;
        setContracts(records);
        setContractsLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger les contrats nécessaires aux interventions.", error);
        setContractsLoading(false);
        setLoadError("Les contrats n’ont pas pu être chargés depuis Firestore.");
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
        console.error("Impossible de charger les clients nécessaires aux interventions.", error);
        setClientsLoading(false);
        setLoadError("La liste des clients n’a pas pu être chargée. Vérifiez la connexion et les règles Firestore.");
      },
    );
    const unsubscribeTeam = equipeService.subscribe(
      (records) => {
        if (!active) return;
        setTeam(records);
        setTeamLoading(false);
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger l’équipe nécessaire aux interventions.", error);
        setTeamLoading(false);
        setLoadError("La liste des techniciens n’a pas pu être chargée depuis Firestore.");
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
        console.error("Impossible de charger le stock nécessaire aux interventions.", error);
        setStockLoading(false);
        setLoadError("La liste des pièces n’a pas pu être chargée depuis Firestore.");
      },
    );

    return () => {
      active = false;
      unsubscribeInterventions();
      unsubscribeClients();
      unsubscribeSites();
      unsubscribeElevators();
      unsubscribeContracts();
      unsubscribeTeam();
      unsubscribeStock();
    };
  }, []);

  const filteredInterventions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    if (!query) return interventions;
    return interventions.filter((intervention) =>
      [intervention.number, intervention.clientName, intervention.siteAddress, intervention.site?.name, intervention.ascenseur?.referenceInternal, intervention.ascenseur?.serialNumber, intervention.technician || intervention.technicien, intervention.interventionType || intervention.type, intervention.status || intervention.statut, intervention.priority || intervention.priorite, intervention.report || intervention.rapport, ...(intervention.spareParts || []).map((part) => part.designation)]
        .some((value) => String(value ?? "").toLocaleLowerCase("fr-FR").includes(query)),
    );
  }, [interventions, search]);

  async function createIntervention(record) {
    setSaving(true);
    setFormError("");
    try {
      await createInterventionWithStock(record);
      setModalOpen(false);
      setActionError("");
    } catch (error) {
      console.error("Impossible de créer l’intervention dans Firestore.", error);
      setFormError(error instanceof RangeError ? error.message : "L’enregistrement a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function exportIntervention(intervention) {
    setActionError("");
    try {
      const { generateFicheInterventionPDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      const client = clients.find((entry) => entry.id === intervention.clientId) || { name: intervention.clientName || "Client" };
      generateFicheInterventionPDF(intervention, client, { company: readyCompany, director: profiles.director, salesperson: profiles.salesperson });
    } catch (error) {
      console.error("Impossible de générer le PDF de l’intervention.", error);
      setActionError("La fiche PDF de cette intervention n’a pas pu être générée.");
    }
  }

  return (
    <section className="erp-module space-y-5">
      <div className="erp-page-header flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Équipe technique</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">Interventions</h2>
          <p className="mt-1 text-xs text-muted">Planifiez les visites et suivez leur avancement sur le terrain.</p>
        </div>
        <button onClick={() => { setFormError(""); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark">
          <Plus size={16} /> Nouvelle intervention
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-sm font-bold text-ink">Toutes les interventions</h3>
            <p className="mt-1 text-[11px] text-muted">{loading ? "Synchronisation avec Firestore…" : `${interventions.length} ${interventions.length > 1 ? "interventions enregistrées" : "intervention enregistrée"}`}</p>
          </div>
          <label className="relative block sm:w-[280px]">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une intervention…" aria-label="Rechercher une intervention" className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-ink outline-none transition focus:border-brand focus:bg-white" />
          </label>
        </div>

        {loadError ? (
          <div role="alert" className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{loadError}</div>
        ) : loading ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted" role="status"><LoaderCircle size={25} className="animate-spin text-brand" /><span>Loading... Chargement des interventions</span></div>
        ) : filteredInterventions.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-brand"><ClipboardCheck size={21} /></div>
            <p className="mt-4 text-sm font-bold text-ink">{search ? "Aucun résultat" : "Aucune intervention pour le moment"}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted">{search ? "Essayez une autre recherche." : "Ajoutez votre première intervention pour organiser le suivi technique."}</p>
            {!search && <button onClick={() => { setFormError(""); setModalOpen(true); }} className="mt-4 text-xs font-bold text-brand hover:text-brand-dark">Planifier une intervention</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
                <tr><th className="px-5 py-3.5">Client / site</th><th className="px-4 py-3.5">Date</th><th className="px-4 py-3.5">Technicien</th><th className="px-4 py-3.5">Type</th><th className="px-4 py-3.5">Priorité</th><th className="px-4 py-3.5">Rapport / pièces</th><th className="px-4 py-3.5">Statut</th><th className="px-5 py-3.5 text-right">Fiche</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredInterventions.map((intervention) => {
                  const client = clients.find((entry) => entry.id === intervention.clientId);
                  const status = intervention.status || intervention.statut || "En cours";
                  const priority = intervention.priority || intervention.priorite || "Normal";
                  return (
                    <tr key={intervention.id} className="text-xs transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5"><p className="font-semibold text-ink">{client?.name || intervention.clientName || "Client"}</p><p className="mt-1 max-w-[220px] truncate text-[10px] text-slate-500" title={intervention.siteAddress}>{intervention.site?.name || intervention.siteAddress || "Site non précisé"}</p><p className="mt-1 text-[10px] text-slate-400">{intervention.ascenseur?.referenceInternal || intervention.ascenseur?.serialNumber || "Équipement non précisé"}{intervention.number ? ` · ${intervention.number}` : ""}</p></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{formatDate(intervention.date || intervention.dateIntervention)}</td>
                      <td className="px-4 py-3.5 text-slate-600">{intervention.technician || intervention.technicien || "—"}</td>
                      <td className="px-4 py-3.5"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{intervention.interventionType || intervention.type || "—"}</span></td>
                      <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${priority === "Critique" ? "animate-pulse bg-red-100 text-red-800" : priority === "Urgent" ? "bg-orange-100 text-orange-800" : priority === "Faible" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>{priority}</span></td>
                      <td className="max-w-[220px] px-4 py-3.5 text-slate-500"><p className="truncate" title={intervention.report || intervention.rapport}>{intervention.report || intervention.rapport || "—"}</p><p className="mt-1 text-[10px]">{(intervention.spareParts || []).length} pièce(s) · {Object.values(intervention.checklist || {}).filter((item) => typeof item === "object" ? item.checked : item).length} contrôles</p></td>
                      <td className="px-4 py-3.5"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${STATUS_CLASSES[status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>{status}</span></td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button type="button" onClick={() => setDetailRecord(intervention)} aria-label={`Voir les détails de l’intervention ${intervention.number || ""}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-[10px] font-semibold text-slate-600 transition hover:border-brand hover:text-brand"><Eye size={13} /> Détails</button>
                        <FileUploader collectionName="interventions" recordId={intervention.id} files={intervention.attachments || []} categories={["pv de réception", "carnet d'entretien", "autre"]} />
                        <button onClick={() => exportIntervention(intervention)} aria-label={`Exporter le PDF de l’intervention ${intervention.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-[10px] font-bold text-slate-600 transition hover:border-brand hover:bg-blue-50 hover:text-brand"><FileDown size={14} /> PDF</button>
                        </div>
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
      {detailRecord && <RecordDetailsDialog
        title={`${detailRecord.interventionType || detailRecord.type || "Intervention"} · ${detailRecord.clientName || clients.find((client) => client.id === detailRecord.clientId)?.name || "Client"}`}
        reference={detailRecord.number || detailRecord.reference || detailRecord.id}
        onClose={() => setDetailRecord(null)}
        sections={[
          { title: "Planification et affectation", fields: [
            ["Client", detailRecord.clientName],
            ["Site", detailRecord.site?.name || detailRecord.siteAddress],
            ["Adresse du site", [detailRecord.site?.address, detailRecord.site?.city]],
            ["Ascenseur", [detailRecord.ascenseur?.referenceInternal || detailRecord.ascenseur?.serialNumber, detailRecord.ascenseur?.brand, detailRecord.ascenseur?.model]],
            ["Contrat", detailRecord.contractReference],
            ["Technicien", detailRecord.technician || detailRecord.technicien],
            ["Date prévue / réalisée", formatDate(detailRecord.date || detailRecord.dateIntervention)],
            ["Horaires", [detailRecord.startTime, detailRecord.endTime]],
            ["Statut", detailRecord.status || detailRecord.statut],
            ["Priorité", detailRecord.priority || detailRecord.priorite],
          ] },
          { title: "Rapport technique", fields: [
            ["Diagnostic", detailRecord.diagnosis],
            ["Travaux effectués", detailRecord.workPerformed || detailRecord.report || detailRecord.rapport],
            ["Recommandations", detailRecord.recommendations],
            ["Suivi / prochaine visite", [detailRecord.followUp, formatDate(detailRecord.nextVisitDate)]],
            ["Pièces utilisées", (detailRecord.spareParts || []).map((part) => `${part.designation || part.description || part.name || "Pièce"} · ${part.quantity ?? 1}`)],
            ["Contrôles", Object.entries(detailRecord.checklist || {}).map(([name, value]) => `${name} : ${typeof value === "object" ? (value.checked ? "OK" : "Non réalisé") : (value ? "OK" : "Non réalisé")}`)],
            ["Notes", detailRecord.notes],
          ] },
        ]}
      />}
      {modalOpen && <InterventionModal clients={clients} clientsLoading={clientsLoading} sites={sites} sitesLoading={sitesLoading} ascenseurs={ascenseurs} equipmentLoading={equipmentLoading} contracts={contracts} contractsLoading={contractsLoading} team={team} teamLoading={teamLoading} stock={stock} stockLoading={stockLoading} onClose={() => setModalOpen(false)} onCreate={createIntervention} saving={saving} error={formError} />}
    </section>
  );
}
