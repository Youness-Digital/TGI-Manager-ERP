import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Cog, LoaderCircle, MapPin, Paperclip, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { ascenseursService, clientsService, sitesService, uploadElevatorAttachment } from "../services/dbService";

const FIELD_CLASS = "mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50";
const ELEVATOR_TYPES = [
  "Électrique à traction",
  "Hydraulique",
  "Monte-charge",
  "Monte-personne",
  "Escalator",
  "Élévateur PMR",
];
const BRANDS = ["Otis", "Schindler", "Kone", "Thyssenkrupp", "Orona", "Autre"];
const STATUSES = ["En service", "En panne", "À l'arrêt", "En modernisation"];

const EMPTY_SITE = {
  clientId: "",
  name: "",
  address: "",
  city: "",
  accessFloor: "",
  onsiteContact: "",
  contactRole: "Gardien",
  contactPhone: "",
  notes: "",
  status: "Actif",
};

function createEmptyElevator() {
  return {
    referenceInternal: "",
    serialNumber: "",
    brand: "Autre",
    model: "",
    type: ELEVATOR_TYPES[0],
    clientId: "",
    siteId: "",
    stops: "",
    ratedLoadKg: "",
    persons: "",
    speedMps: "",
    machineryType: "Avec local",
    doorType: "Automatiques",
    entrances: "1",
    installationYear: "",
    commissioningDate: "",
    warrantyEndDate: "",
    status: "En service",
    lastMaintenanceDate: "",
    nextMaintenanceDate: "",
    lastRegulatoryInspectionDate: "",
    inspectionOrganization: "",
    nextRegulatoryInspectionDate: "",
    notes: "",
  };
}

function dateLabel(value) {
  if (!value) return "—";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}

function Field({ label, value, onChange, type = "text", required = false, min, step, placeholder }) {
  return (
    <label className="block min-w-0 text-xs font-semibold text-slate-600">
      {label}{required && <span className="text-rose-500"> *</span>}
      <input
        required={required}
        type={type}
        min={min}
        step={step}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        className={FIELD_CLASS}
      />
    </label>
  );
}

function SiteModal({ clients, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(EMPTY_SITE);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const client = clients.find((entry) => entry.id === form.clientId);
    if (!client) return;
    onSave({
      ...form,
      clientName: client.name || "Client",
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      accessFloor: form.accessFloor.trim(),
      onsiteContact: form.onsiteContact.trim(),
      contactPhone: form.contactPhone.trim(),
      notes: form.notes.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="site-modal-title" className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Parc immobilier</p>
            <h2 id="site-modal-title" className="mt-1 text-lg font-bold text-ink">Ajouter un site</h2>
            <p className="mt-1 text-xs text-muted">Un site peut accueillir plusieurs ascenseurs.</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">
            Client <span className="text-rose-500">*</span>
            <select required value={form.clientId} onChange={(event) => update("clientId", event.target.value)} className={FIELD_CLASS}>
              <option value="">Sélectionner un client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}</option>)}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom de l’immeuble / résidence" required value={form.name} onChange={(event) => update("name", event.target.value)} />
            <Field label="Ville" required value={form.city} onChange={(event) => update("city", event.target.value)} />
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Adresse complète <span className="text-rose-500">*</span>
              <textarea required rows={2} value={form.address} onChange={(event) => update("address", event.target.value)} className={`${FIELD_CLASS} resize-y`} />
            </label>
            <Field label="Étage / accès" value={form.accessFloor} onChange={(event) => update("accessFloor", event.target.value)} placeholder="Ex. entrée principale, sous-sol" />
            <Field label="Contact sur place" value={form.onsiteContact} onChange={(event) => update("onsiteContact", event.target.value)} />
            <label className="block text-xs font-semibold text-slate-600">
              Rôle du contact
              <select value={form.contactRole} onChange={(event) => update("contactRole", event.target.value)} className={FIELD_CLASS}>
                <option>Gardien</option><option>Syndic</option><option>Responsable technique</option><option>Autre</option>
              </select>
            </label>
            <Field label="Téléphone du contact" type="tel" value={form.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} />
            <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
              Notes
              <textarea rows={2} value={form.notes} onChange={(event) => update("notes", event.target.value)} className={`${FIELD_CLASS} resize-y`} />
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
            <button type="submit" disabled={saving || !clients.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? "Enregistrement…" : "Enregistrer le site"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ElevatorModal({ elevator, clients, sites, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(() => elevator
    ? { ...createEmptyElevator(), ...elevator }
    : createEmptyElevator());
  const clientSites = sites.filter((site) => site.clientId === form.clientId);
  const selectedClient = clients.find((client) => client.id === form.clientId);
  const selectedSite = clientSites.find((site) => site.id === form.siteId);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!selectedClient || !selectedSite) return;
    const editableFields = { ...form };
    delete editableFields.id;
    onSave({
      ...editableFields,
      clientId: selectedClient.id,
      clientName: selectedClient.name || "Client",
      siteId: selectedSite.id,
      site: {
        name: selectedSite.name || "",
        address: selectedSite.address || "",
        city: selectedSite.city || "",
        accessFloor: selectedSite.accessFloor || "",
        onsiteContact: selectedSite.onsiteContact || "",
        contactRole: selectedSite.contactRole || "Gardien",
        contactPhone: selectedSite.contactPhone || "",
      },
      referenceInternal: form.referenceInternal.trim(),
      serialNumber: form.serialNumber.trim(),
      model: form.model.trim(),
      stops: Number(form.stops) || 0,
      ratedLoadKg: Number(form.ratedLoadKg) || 0,
      persons: Number(form.persons) || 0,
      speedMps: Number(form.speedMps) || 0,
      entrances: Number(form.entrances) || 0,
      installationYear: form.installationYear ? Number(form.installationYear) : "",
      inspectionOrganization: form.inspectionOrganization.trim(),
      notes: form.notes.trim(),
    });
  }

  function updateClient(clientId) {
    setForm((current) => ({ ...current, clientId, siteId: "" }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="elevator-modal-title" className="my-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Parc installé</p>
            <h2 id="elevator-modal-title" className="mt-1 text-lg font-bold text-ink">{elevator ? "Modifier un ascenseur" : "Ajouter un ascenseur"}</h2>
            <p className="mt-1 text-xs text-muted">Associez l’équipement à son client et à son site avant de compléter sa fiche technique.</p>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <section className="rounded-xl border border-line bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Identification et rattachement</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                Client <span className="text-rose-500">*</span>
                <select required value={form.clientId} onChange={(event) => updateClient(event.target.value)} className={FIELD_CLASS}>
                  <option value="">Sélectionner un client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Site / immeuble <span className="text-rose-500">*</span>
                <select required value={form.siteId} onChange={(event) => update("siteId", event.target.value)} disabled={!form.clientId} className={FIELD_CLASS}>
                  <option value="">Sélectionner un site</option>
                  {clientSites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.city}</option>)}
                </select>
                {form.clientId && !clientSites.length && <span className="mt-1 block text-[10px] font-normal text-amber-700">Créez d’abord un site pour ce client.</span>}
              </label>
              <Field label="Référence interne" value={form.referenceInternal} onChange={(event) => update("referenceInternal", event.target.value)} placeholder="Ex. ASC-CASA-001" />
              <Field label="Numéro de série" value={form.serialNumber} onChange={(event) => update("serialNumber", event.target.value)} />
              <label className="block text-xs font-semibold text-slate-600">
                Marque <span className="text-rose-500">*</span>
                <select required value={form.brand} onChange={(event) => update("brand", event.target.value)} className={FIELD_CLASS}>
                  {BRANDS.map((brand) => <option key={brand}>{brand}</option>)}
                </select>
              </label>
              <Field label="Modèle" value={form.model} onChange={(event) => update("model", event.target.value)} />
              <label className="block text-xs font-semibold text-slate-600">
                Type d’équipement <span className="text-rose-500">*</span>
                <select required value={form.type} onChange={(event) => update("type", event.target.value)} className={FIELD_CLASS}>
                  {ELEVATOR_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                État <span className="text-rose-500">*</span>
                <select required value={form.status} onChange={(event) => update("status", event.target.value)} className={FIELD_CLASS}>
                  {STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-line p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Caractéristiques techniques</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nombre de niveaux / arrêts" type="number" min="0" step="1" value={form.stops} onChange={(event) => update("stops", event.target.value)} />
              <Field label="Charge nominale (kg)" type="number" min="0" step="1" value={form.ratedLoadKg} onChange={(event) => update("ratedLoadKg", event.target.value)} />
              <Field label="Nombre de personnes" type="number" min="0" step="1" value={form.persons} onChange={(event) => update("persons", event.target.value)} />
              <Field label="Vitesse (m/s)" type="number" min="0" step="0.01" value={form.speedMps} onChange={(event) => update("speedMps", event.target.value)} />
              <label className="block text-xs font-semibold text-slate-600">
                Machinerie
                <select value={form.machineryType} onChange={(event) => update("machineryType", event.target.value)} className={FIELD_CLASS}>
                  <option value="Avec local">Avec local</option><option value="Sans local (MRL)">Sans local (MRL)</option><option value="Autre">Autre</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Type de portes
                <select value={form.doorType} onChange={(event) => update("doorType", event.target.value)} className={FIELD_CLASS}>
                  <option>Automatiques</option><option>Battantes</option><option>Autre</option>
                </select>
              </label>
              <Field label="Nombre d’accès" type="number" min="0" step="1" value={form.entrances} onChange={(event) => update("entrances", event.target.value)} />
            </div>
          </section>

          <section className="rounded-xl border border-line p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Installation, garantie et suivi</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Année d’installation" type="number" min="1900" step="1" value={form.installationYear} onChange={(event) => update("installationYear", event.target.value)} />
              <Field label="Mise en service" type="date" value={form.commissioningDate} onChange={(event) => update("commissioningDate", event.target.value)} />
              <Field label="Fin de garantie" type="date" value={form.warrantyEndDate} onChange={(event) => update("warrantyEndDate", event.target.value)} />
              <Field label="Dernière visite d’entretien" type="date" value={form.lastMaintenanceDate} onChange={(event) => update("lastMaintenanceDate", event.target.value)} />
              <Field label="Prochaine visite prévue" type="date" value={form.nextMaintenanceDate} onChange={(event) => update("nextMaintenanceDate", event.target.value)} />
              <Field label="Dernier contrôle réglementaire" type="date" value={form.lastRegulatoryInspectionDate} onChange={(event) => update("lastRegulatoryInspectionDate", event.target.value)} />
              <Field label="Organisme de contrôle" value={form.inspectionOrganization} onChange={(event) => update("inspectionOrganization", event.target.value)} />
              <Field label="Prochain contrôle réglementaire" type="date" value={form.nextRegulatoryInspectionDate} onChange={(event) => update("nextRegulatoryInspectionDate", event.target.value)} />
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">
                Notes
                <textarea rows={2} value={form.notes} onChange={(event) => update("notes", event.target.value)} className={`${FIELD_CLASS} resize-y`} />
              </label>
            </div>
          </section>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
            <button type="submit" disabled={saving || !clients.length || !clientSites.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-60">
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? "Enregistrement…" : elevator ? "Enregistrer les modifications" : "Ajouter au parc"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function AscenseursPage() {
  const [elevators, setElevators] = useState([]);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dependenciesLoading, setDependenciesLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [elevatorModalOpen, setElevatorModalOpen] = useState(false);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [editingElevator, setEditingElevator] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploadingId, setUploadingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const attachmentInput = useRef(null);
  const attachmentElevatorId = useRef("");

  useEffect(() => {
    let active = true;
    const reportError = (label) => (error) => {
      if (!active) return;
      console.error(label, error);
      setLoadError("Le parc, les clients ou les sites n’ont pas pu être chargés. Vérifiez la connexion et les règles Firestore.");
      setLoading(false);
      setDependenciesLoading(false);
    };

    const unsubscribeElevators = ascenseursService.subscribe((records) => {
      if (!active) return;
      setElevators(records);
      setLoading(false);
      setLoadError("");
    }, reportError("Impossible de charger le parc des ascenseurs depuis Firestore."));
    const unsubscribeClients = clientsService.subscribe((records) => {
      if (!active) return;
      setClients(records);
      setDependenciesLoading(false);
    }, reportError("Impossible de charger les clients des équipements."));
    const unsubscribeSites = sitesService.subscribe((records) => {
      if (!active) return;
      setSites(records);
      setDependenciesLoading(false);
    }, reportError("Impossible de charger les sites des équipements."));

    return () => {
      active = false;
      unsubscribeElevators();
      unsubscribeClients();
      unsubscribeSites();
    };
  }, []);

  const filteredElevators = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    return elevators
      .filter((elevator) => statusFilter === "Tous" || (elevator.status || "En service") === statusFilter)
      .filter((elevator) => !query || [
        elevator.number,
        elevator.referenceInternal,
        elevator.serialNumber,
        elevator.brand,
        elevator.model,
        elevator.type,
        elevator.clientName,
        elevator.site?.name,
        elevator.site?.city,
      ].some((value) => String(value || "").toLocaleLowerCase("fr-FR").includes(query)));
  }, [elevators, search, statusFilter]);

  async function saveElevator(record) {
    setSaving(true);
    setFormError("");
    try {
      if (editingElevator) await ascenseursService.update(editingElevator.id, record);
      else await ascenseursService.create(record);
      setElevatorModalOpen(false);
      setEditingElevator(null);
      setActionError("");
    } catch (error) {
      console.error("Impossible d’enregistrer l’ascenseur dans Firestore.", error);
      setFormError("L’enregistrement a échoué. Vérifiez la connexion et les règles Firestore.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSite(record) {
    setSaving(true);
    setFormError("");
    try {
      await sitesService.create(record);
      setSiteModalOpen(false);
      setActionError("");
    } catch (error) {
      console.error("Impossible d’enregistrer le site dans Firestore.", error);
      setFormError("L’enregistrement du site a échoué. Vérifiez la connexion et les règles Firestore.");
    } finally {
      setSaving(false);
    }
  }

  function openElevatorModal(elevator = null) {
    setEditingElevator(elevator);
    setFormError("");
    setElevatorModalOpen(true);
  }

  async function deleteElevator(elevator) {
    if (!window.confirm(`Supprimer l’ascenseur ${elevator.number || elevator.referenceInternal || ""} du parc ?`)) return;
    setDeletingId(elevator.id);
    setActionError("");
    try {
      await ascenseursService.remove(elevator.id);
    } catch (error) {
      console.error("Impossible de supprimer l’ascenseur.", error);
      setActionError("La suppression a échoué. Vérifiez la connexion puis réessayez.");
    } finally {
      setDeletingId("");
    }
  }

  function chooseAttachments(elevatorId) {
    attachmentElevatorId.current = elevatorId;
    attachmentInput.current?.click();
  }

  async function uploadAttachments(event) {
    const files = Array.from(event.target.files || []);
    const elevatorId = attachmentElevatorId.current;
    event.target.value = "";
    if (!files.length || !elevatorId) return;
    setUploadingId(elevatorId);
    setActionError("");
    try {
      const results = await Promise.allSettled(files.map((file) => uploadElevatorAttachment(elevatorId, file)));
      const failures = results.filter((result) => result.status === "rejected");
      failures.forEach((result) => console.error("Une pièce jointe d’ascenseur n’a pas pu être téléversée.", result.reason));
      if (failures.length) {
        setActionError(`${failures.length} fichier(s) sur ${files.length} n’ont pas été téléversés. Vérifiez le format PDF/Word/Excel et la taille maximale.`);
      }
    } catch (error) {
      console.error("Impossible de téléverser les pièces jointes de l’ascenseur.", error);
      setActionError("Les fichiers n’ont pas pu être téléversés.");
    } finally {
      setUploadingId("");
    }
  }

  const activeCount = elevators.filter((elevator) => (elevator.status || "En service") === "En service").length;
  const downCount = elevators.filter((elevator) => ["En panne", "À l'arrêt"].includes(elevator.status)).length;

  return (
    <section className="erp-module space-y-5">
      <input ref={attachmentInput} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={uploadAttachments} />
      <header className="erp-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand"><Cog size={16} /> Parc installé</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ascenseurs & sites</h1>
          <p className="mt-1 text-sm text-slate-500">Reliez chaque équipement à son client et à son immeuble, et centralisez ses caractéristiques et échéances.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => { setFormError(""); setSiteModalOpen(true); }} disabled={!clients.length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand disabled:opacity-50">
            <MapPin size={15} /> Ajouter un site
          </button>
          <button type="button" onClick={() => openElevatorModal()} disabled={!clients.length || dependenciesLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50">
            <Plus size={16} /> Ajouter un ascenseur
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card"><p className="text-xs font-medium text-muted">Équipements enregistrés</p><p className="mt-2 text-2xl font-bold tracking-tight text-ink">{loading ? "—" : elevators.length}</p></article>
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card"><p className="text-xs font-medium text-muted">En service</p><p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">{loading ? "—" : activeCount}</p></article>
        <article className="rounded-2xl border border-line bg-white p-5 shadow-card"><p className="text-xs font-medium text-muted">En panne / à l’arrêt</p><p className="mt-2 text-2xl font-bold tracking-tight text-rose-700">{loading ? "—" : downCount}</p></article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-sm font-bold text-ink">Parc des équipements</h2>
            <p className="mt-1 text-[11px] text-muted">{loading ? "Synchronisation avec Firestore…" : `${filteredElevators.length} équipement(s) affiché(s)`}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block sm:w-[260px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un ascenseur…" aria-label="Rechercher un ascenseur" className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-ink outline-none focus:border-brand focus:bg-white" />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrer par état" className="rounded-xl border border-line bg-slate-50 px-3 py-2.5 text-xs text-ink outline-none focus:border-brand">
              <option>Tous</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
        </div>
        {loadError ? (
          <p role="alert" className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{loadError}</p>
        ) : loading || dependenciesLoading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted"><LoaderCircle size={22} className="animate-spin text-brand" /> Chargement du parc…</div>
        ) : !clients.length ? (
          <div className="p-12 text-center"><Building2 className="mx-auto mb-3 text-slate-300" size={30} /><p className="font-semibold text-slate-700">Aucun client disponible</p><p className="mt-1 text-sm text-slate-500">Créez une fiche client avant d’ajouter un site ou un ascenseur.</p></div>
        ) : filteredElevators.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <Cog size={26} className="text-slate-300" />
            <p className="mt-3 text-sm font-bold text-ink">{search || statusFilter !== "Tous" ? "Aucun résultat" : "Aucun équipement dans le parc"}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted">Ajoutez d’abord un site client, puis rattachez-y ses ascenseurs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
                <tr><th className="px-5 py-3.5">Référence / série</th><th className="px-4 py-3.5">Client / site</th><th className="px-4 py-3.5">Équipement</th><th className="px-4 py-3.5">Caractéristiques</th><th className="px-4 py-3.5">Prochaine visite</th><th className="px-4 py-3.5">Prochain contrôle</th><th className="px-4 py-3.5">État</th><th className="px-5 py-3.5 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredElevators.map((elevator) => {
                  const client = clients.find((entry) => entry.id === elevator.clientId);
                  const site = sites.find((entry) => entry.id === elevator.siteId) || elevator.site || {};
                  const status = elevator.status || "En service";
                  const statusClass = status === "En service" ? "bg-emerald-50 text-emerald-700" : status === "En panne" || status === "À l'arrêt" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
                  return (
                    <tr key={elevator.id} className="align-top text-xs transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5"><p className="font-semibold text-ink">{elevator.number || elevator.referenceInternal || "—"}</p><p className="mt-1 text-[10px] text-slate-400">S/N {elevator.serialNumber || "—"}</p></td>
                      <td className="px-4 py-3.5"><p className="font-semibold text-ink">{client?.name || elevator.clientName || "Client"}</p><p className="mt-1 text-slate-500">{site.name || "Site"}</p><p className="mt-1 text-[10px] text-slate-400">{[site.city, site.address].filter(Boolean).join(" · ") || "Adresse non renseignée"}</p></td>
                      <td className="px-4 py-3.5"><p className="font-semibold text-slate-700">{elevator.brand || "—"} {elevator.model || ""}</p><p className="mt-1 text-[10px] text-slate-500">{elevator.type || "—"}</p></td>
                      <td className="px-4 py-3.5 text-slate-500"><p>{elevator.stops || 0} niveaux · {elevator.ratedLoadKg || 0} kg</p><p className="mt-1 text-[10px]">{elevator.persons || 0} pers. · {elevator.speedMps || 0} m/s</p></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{dateLabel(elevator.nextMaintenanceDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">{dateLabel(elevator.nextRegulatoryInspectionDate)}</td>
                      <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>{status}</span></td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => openElevatorModal(elevator)} className="rounded-lg border border-line px-2.5 py-2 text-[10px] font-semibold text-slate-600 hover:border-brand hover:text-brand">Modifier</button>
                          <button type="button" onClick={() => chooseAttachments(elevator.id)} disabled={uploadingId === elevator.id} aria-label="Joindre plans ou documents" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-[10px] font-semibold text-slate-600 hover:border-brand hover:text-brand disabled:opacity-50">
                            {uploadingId === elevator.id ? <LoaderCircle size={12} className="animate-spin" /> : <Upload size={12} />}<span>{elevator.attachments?.length || 0}</span>
                          </button>
                          <button type="button" onClick={() => deleteElevator(elevator)} disabled={deletingId === elevator.id} aria-label="Supprimer l’ascenseur" className="rounded-lg border border-line p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"><Trash2 size={13} /></button>
                        </div>
                        {elevator.attachments?.length > 0 && <div className="mt-2 flex max-w-64 flex-wrap justify-end gap-1">{elevator.attachments.map((file, index) => <a key={`${file.path || file.name}-${index}`} href={file.downloadURL} target="_blank" rel="noreferrer" title={file.name} className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-1.5 py-1 text-[9px] text-slate-600 hover:text-brand"><Paperclip size={10} /><span className="max-w-28 truncate">{file.name}</span></a>)}</div>}
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
      {siteModalOpen && <SiteModal clients={clients} onClose={() => setSiteModalOpen(false)} onSave={saveSite} saving={saving} error={formError} />}
      {elevatorModalOpen && <ElevatorModal elevator={editingElevator} clients={clients} sites={sites} onClose={() => { setElevatorModalOpen(false); setEditingElevator(null); }} onSave={saveElevator} saving={saving} error={formError} />}
    </section>
  );
}
