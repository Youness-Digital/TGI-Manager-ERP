import { useEffect, useMemo, useState } from "react";
import {
  ascenseursService,
  clientsService,
  sitesService,
} from "../services/dbService";
import { generateFicheClientPDF, prepareCompanyForPdf } from "../utils/pdfGenerator";
import FileUploader from "../components/FileUploader";
import {
  Building2,
  LoaderCircle,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

const EMPTY_CLIENT = {
  name: "",
  clientType: "Entreprise",
  ice: "",
  rc: "",
  patente: "",
  ifNumber: "",
  email: "",
  phone: "",
  mainContact: "",
  contactName: "",
  contactFunction: "",
  contactPhone: "",
  contactEmail: "",
  address: "",
  city: "",
  billingAddress: "",
  paymentType: "Mensuel",
  paymentMode: "",
  dueDate: "",
  balanceDue: 0,
  lastPaymentDate: "",
  paymentStatus: "À jour",
  notes: "",
};

const EMPTY_SITE = {
  name: "",
  address: "",
  city: "",
  accessFloor: "",
  onsiteContact: "",
  contactRole: "Gardien",
  contactPhone: "",
  notes: "",
};

const EMPTY_ELEVATOR = {
  siteId: "",
  referenceInternal: "",
  serialNumber: "",
  brand: "Autre",
  model: "",
  type: "Électrique à traction",
  status: "En service",
  commissioningDate: "",
};

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

function dateLabel(value) {
  if (value == null || value === "") return "—";
  const parsed = typeof value?.toDate === "function"
    ? value.toDate()
    : value instanceof Date
      ? value
      : new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("fr-FR");
}

function paymentStatus(client) {
  const rawBalance = client.balanceDue ?? client.amountDue ?? client.remainingAmount;
  if (rawBalance == null) return client.paymentStatus || "À jour";
  const balance = Number(rawBalance);
  if (!Number.isFinite(balance)) return client.paymentStatus || "—";
  if (balance <= 0) return "À jour";
  if (client.dueDate) {
    const due = typeof client.dueDate?.toDate === "function" ? client.dueDate.toDate() : new Date(client.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(due.getTime()) && due < today) return "En retard";
  }
  return "À payer";
}

function formatDh(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 2 }).format(amount)} DH`;
}

function formatIdentifier(value) {
  const identifier = String(value || "");
  return /^\d+$/.test(identifier)
    ? identifier.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
    : identifier;
}

function Field({ label, name, value, onChange, required, type = "text", min, step, className = "" }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}{required && <span className="text-rose-500"> *</span>}
      <input className={INPUT_CLASS} name={name} type={type} value={value ?? ""} onChange={onChange} required={required} min={min} step={step} />
    </label>
  );
}

export default function ClientsPage({ company = {} }) {
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [elevators, setElevators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [elevatorsLoading, setElevatorsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [relatedError, setRelatedError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingId, setExportingId] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [form, setForm] = useState(EMPTY_CLIENT);
  const [formError, setFormError] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [quickFormType, setQuickFormType] = useState("");
  const [siteForm, setSiteForm] = useState(EMPTY_SITE);
  const [elevatorForm, setElevatorForm] = useState(EMPTY_ELEVATOR);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickFormError, setQuickFormError] = useState("");
  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const selectedClientSites = sites.filter((site) => site.clientId === selectedClientId);
  const selectedClientElevators = elevators.filter((elevator) => elevator.clientId === selectedClientId);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    const unsubscribe = clientsService.subscribe(
      (records) => {
        if (!active) return;
        setClients(records);
        setLoading(false);
      },
      (subscriptionError) => {
        if (!active) return;
        console.error("Impossible de charger les clients depuis Firestore.", subscriptionError);
        setLoadError(subscriptionError);
        setLoading(false);
      },
    );
    const unsubscribeSites = sitesService.subscribe(
      (records) => {
        if (!active) return;
        setSites(records);
        setSitesLoading(false);
      },
      (subscriptionError) => {
        if (!active) return;
        console.error("Impossible de charger les sites des clients depuis Firestore.", subscriptionError);
        setRelatedError(subscriptionError);
        setSitesLoading(false);
      },
    );
    const unsubscribeElevators = ascenseursService.subscribe(
      (records) => {
        if (!active) return;
        setElevators(records);
        setElevatorsLoading(false);
      },
      (subscriptionError) => {
        if (!active) return;
        console.error("Impossible de charger les ascenseurs des clients depuis Firestore.", subscriptionError);
        setRelatedError(subscriptionError);
        setElevatorsLoading(false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
      unsubscribeSites();
      unsubscribeElevators();
    };
  }, []);

  const visibleClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return clients;
    return clients.filter((client) =>
      [client.name, client.clientType, client.email, client.phone, client.ice, client.rc, client.mainContact]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query)),
    );
  }, [clients, search]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function saveClient(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError("Le nom ou la raison sociale du client est obligatoire.");
      return;
    }
    const balanceDue = Number(form.balanceDue);
    if (!Number.isFinite(balanceDue) || balanceDue < 0) {
      setFormError("Le solde dû doit être un nombre positif ou nul.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await clientsService.create({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        mainContact: form.contactName.trim() || form.mainContact.trim(),
        contactName: form.contactName.trim() || form.mainContact.trim(),
        contactFunction: form.contactFunction.trim(),
        contactPhone: form.contactPhone.trim() || form.phone.trim(),
        contactEmail: form.contactEmail.trim() || form.email.trim(),
        balanceDue,
        paymentStatus: paymentStatus({ ...form, balanceDue }),
        notes: form.notes.trim(),
      });
      setForm(EMPTY_CLIENT);
      setModalOpen(false);
      setActionError("");
      setActionSuccess("La fiche client a bien été enregistrée.");
    } catch (saveError) {
      console.error("Impossible d’enregistrer le client.", saveError);
      setFormError("L’enregistrement a échoué. Vérifiez votre connexion puis réessayez.");
    } finally {
      setSaving(false);
    }
  }

  function openClientDetails(client) {
    setSelectedClientId(client.id);
    setQuickFormType("");
    setQuickFormError("");
  }

  function openSiteForm() {
    setSiteForm(EMPTY_SITE);
    setQuickFormError("");
    setQuickFormType("site");
  }

  function openElevatorForm() {
    setElevatorForm({ ...EMPTY_ELEVATOR, siteId: selectedClientSites[0]?.id || "" });
    setQuickFormError("");
    setQuickFormType("elevator");
  }

  async function saveClientSite(event) {
    event.preventDefault();
    if (!selectedClient) return;
    if (!siteForm.name.trim() || !siteForm.address.trim() || !siteForm.city.trim()) {
      setQuickFormError("Le nom du site, son adresse et sa ville sont obligatoires.");
      return;
    }
    setQuickSaving(true);
    setQuickFormError("");
    try {
      await sitesService.create({
        ...siteForm,
        clientId: selectedClient.id,
        clientName: selectedClient.name || "Client",
        name: siteForm.name.trim(),
        address: siteForm.address.trim(),
        city: siteForm.city.trim(),
        accessFloor: siteForm.accessFloor.trim(),
        onsiteContact: siteForm.onsiteContact.trim(),
        contactPhone: siteForm.contactPhone.trim(),
        notes: siteForm.notes.trim(),
        status: "Actif",
      });
      setQuickFormType("");
      setActionSuccess("Le site a été rattaché au client.");
    } catch (error) {
      console.error("Impossible d’ajouter le site à la fiche client.", error);
      setQuickFormError("Le site n’a pas pu être enregistré. Vérifiez la connexion et les règles Firestore.");
    } finally {
      setQuickSaving(false);
    }
  }

  async function saveClientElevator(event) {
    event.preventDefault();
    if (!selectedClient) return;
    const site = selectedClientSites.find((entry) => entry.id === elevatorForm.siteId);
    if (!site) {
      setQuickFormError("Sélectionnez un site existant pour rattacher l’ascenseur.");
      return;
    }
    setQuickSaving(true);
    setQuickFormError("");
    try {
      await ascenseursService.create({
        ...elevatorForm,
        clientId: selectedClient.id,
        clientName: selectedClient.name || "Client",
        siteId: site.id,
        site: {
          name: site.name || "",
          address: site.address || "",
          city: site.city || "",
          accessFloor: site.accessFloor || "",
          onsiteContact: site.onsiteContact || "",
          contactRole: site.contactRole || "Gardien",
          contactPhone: site.contactPhone || "",
        },
        referenceInternal: elevatorForm.referenceInternal.trim(),
        serialNumber: elevatorForm.serialNumber.trim(),
        model: elevatorForm.model.trim(),
        status: elevatorForm.status || "En service",
      });
      setQuickFormType("");
      setActionSuccess("L’ascenseur a été rattaché au client et au site.");
    } catch (error) {
      console.error("Impossible d’ajouter l’ascenseur à la fiche client.", error);
      setQuickFormError("L’ascenseur n’a pas pu être enregistré. Vérifiez la connexion et les règles Firestore.");
    } finally {
      setQuickSaving(false);
    }
  }

  async function exportClient(client) {
    setActionError("");
    setExportingId(client.id);
    try {
      const readyCompany = await prepareCompanyForPdf(company);
      generateFicheClientPDF(client, { company: readyCompany });
    } catch (exportError) {
      console.error("Impossible de générer le PDF de la fiche client.", exportError);
      setActionError("Le PDF de cette fiche client n’a pas pu être généré. Vérifiez le logo de l’entreprise et réessayez.");
    } finally {
      setExportingId("");
    }
  }

  return (
    <section className="erp-module space-y-5">
      <header className="erp-page-header flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-700"><Users size={16} /> Répertoire clients</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">Gérez vos fiches, pièces jointes et informations de facturation.</p>
        </div>
        <button onClick={() => { setForm(EMPTY_CLIENT); setFormError(""); setModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-indigo-700">
          <Plus size={18} /> Ajouter un client
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Clients enregistrés</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{loading ? "—" : clients.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Sites clients</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{sitesLoading ? "—" : sites.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Ascenseurs rattachés</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{elevatorsLoading ? "—" : elevators.length}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-slate-900">Tous les clients</h2><p className="mt-1 text-sm text-slate-500">Fiches synchronisées avec Firestore en temps réel.</p></div>
          <label className="relative block sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un client…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
          </label>
        </div>
        {actionError && <p role="alert" className="mx-5 mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}
        {actionSuccess && <p role="status" className="mx-5 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionSuccess}</p>}
        {loadError && <p className="m-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Erreur de chargement des clients : {loadError.message}</p>}
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} /> Chargement…</div>
        ) : visibleClients.length === 0 ? (
          <div className="p-12 text-center"><Building2 className="mx-auto mb-3 text-slate-300" size={30} /><p className="font-medium text-slate-700">{search ? "Aucun résultat" : "Aucun client pour le moment"}</p><p className="mt-1 text-sm text-slate-500">Ajoutez une fiche pour commencer.</p></div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-[1340px] min-w-[1340px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[190px]" /><col className="w-[100px]" /><col className="w-[170px]" />
                <col className="w-[155px]" /><col className="w-[140px]" /><col className="w-[165px]" />
                <col className="w-[220px]" /><col className="w-[200px]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-3 py-3.5 font-semibold">Client</th><th className="px-3 py-3.5 font-semibold">Type</th><th className="px-3 py-3.5 font-semibold">Contact</th><th className="px-3 py-3.5 font-semibold">ICE / RC</th><th className="px-3 py-3.5 font-semibold">Sites / ascenseurs</th><th className="px-3 py-3.5 font-semibold">Paiement</th><th className="px-3 py-3.5 font-semibold">Documents</th><th className="px-3 py-3.5 text-right font-semibold">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleClients.map((client) => (
                  <tr key={client.id} className="align-middle transition-all duration-200 hover:bg-slate-50">
                    <td className="break-words px-3 py-4 align-middle"><p className="break-words font-semibold text-slate-900">{client.name}</p><p className="mt-1 break-words text-xs text-slate-500">{[client.address || client.billingAddress, client.city].filter(Boolean).join(" · ") || "Adresse non renseignée"}</p></td>
                    <td className="px-3 py-4 align-middle"><span className="inline-block max-w-full whitespace-normal break-words rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">{client.clientType || "Entreprise"}</span></td>
                    <td className="px-3 py-4 align-middle"><p className="break-words text-slate-700">{client.contactName || client.mainContact || "—"}{client.contactFunction ? <span className="text-xs text-slate-500"> · {client.contactFunction}</span> : ""}</p><p className="mt-1 break-words text-xs text-slate-500">{client.contactPhone || client.phone || "—"}</p><p className="break-words text-xs text-slate-500">{client.contactEmail || client.email || "—"}</p></td>
                    <td className="break-words px-3 py-4 align-middle text-slate-600"><p className="break-words">ICE {client.ice ? formatIdentifier(client.ice) : "—"}</p><p className="mt-1 break-words text-xs text-slate-500">RC {client.rc ? formatIdentifier(client.rc) : "—"}</p><p className="break-words text-xs text-slate-500">Patente {client.patente ? formatIdentifier(client.patente) : "—"}{client.ifNumber ? ` · IF ${formatIdentifier(client.ifNumber)}` : ""}</p></td>
                    <td className="px-3 py-4 align-middle">
                      {sitesLoading || elevatorsLoading ? <span className="text-xs text-slate-400">Chargement…</span> : (() => {
                        const clientSites = sites.filter((site) => site.clientId === client.id);
                        const clientElevators = elevators.filter((elevator) => elevator.clientId === client.id);
                        return (
                          <details className="group max-w-xs">
                            <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700 marker:hidden">
                              <span>{clientSites.length} site(s)</span><span className="mx-1.5 text-slate-300">·</span><span>{clientElevators.length} ascenseur(s)</span>
                            </summary>
                            {(clientSites.length > 0 || clientElevators.length > 0) && (
                              <div className="mt-2 space-y-2 border-l-2 border-indigo-100 pl-2.5">
                                {clientSites.map((site) => {
                                  const siteElevators = clientElevators.filter((elevator) => elevator.siteId === site.id);
                                  return <div key={site.id}><p className="text-[11px] font-semibold text-slate-700">{site.name || "Site sans nom"} <span className="font-normal text-slate-400">({site.city || "ville non renseignée"})</span></p><p className="text-[10px] text-slate-500">{siteElevators.length ? siteElevators.map((elevator) => elevator.number || elevator.referenceInternal || elevator.serialNumber || "Ascenseur").join(", ") : "Aucun équipement rattaché"}</p></div>;
                                })}
                                {clientElevators.filter((elevator) => !clientSites.some((site) => site.id === elevator.siteId)).map((elevator) => <p key={elevator.id} className="text-[10px] text-amber-700">{elevator.number || elevator.referenceInternal || "Ascenseur"} · site non associé</p>)}
                              </div>
                            )}
                          </details>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-4 align-middle">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{client.paymentType || client.paymentFrequency || "Mensuel"}</span>
                      <p className="mt-2 text-xs text-slate-600">{client.paymentMode || "Mode —"}</p>
                      <p className="mt-1 text-xs text-slate-500">Solde : {formatDh(client.balanceDue ?? client.amountDue ?? client.remainingAmount)}</p>
                      <p className="mt-1 text-[10px] text-slate-500">Échéance : {dateLabel(client.dueDate)}</p>
                      <p className="text-[10px] text-slate-500">Dernier règlement : {dateLabel(client.lastPaymentDate || client.lastPaidAt)}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentStatus(client) === "En retard" ? "bg-rose-50 text-rose-700" : paymentStatus(client) === "À jour" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{paymentStatus(client)}</span>
                    </td>
                    <td className="px-3 py-4 align-middle">
                      {(() => {
                        const files = [
                          ...(client.documents || []),
                          ...(client.attachments || []).filter((legacy) => !(client.documents || []).some((file) => file.path && file.path === legacy.path)),
                        ];
                        return <p className="text-xs text-slate-600">{files.length ? `${files.length} fichier(s) joint(s)` : "Aucun fichier"}</p>;
                      })()}
                    </td>
                    <td className="px-3 py-4 align-middle"><div className="flex flex-nowrap justify-end gap-1.5 whitespace-nowrap">
                      <button type="button" onClick={() => openClientDetails(client)} className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">Fiche</button>
                      <button type="button" onClick={() => exportClient(client)} disabled={exportingId === client.id} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{exportingId === client.id && <LoaderCircle size={13} className="animate-spin" />}PDF</button>
                      <FileUploader collectionName="clients" recordId={client.id} fieldName="documents" files={[...(client.documents || []), ...(client.attachments || []).filter((legacy) => !(client.documents || []).some((file) => file.path && file.path === legacy.path))]} />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {relatedError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Les informations des sites ou des équipements sont indisponibles : {relatedError.message}</p>}

      {selectedClient && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !quickSaving) setSelectedClientId(""); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="client-detail-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 p-5 backdrop-blur sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Fiche client · {selectedClient.clientType || "Entreprise"}</p>
              <h2 id="client-detail-title" className="mt-1 text-xl font-bold text-slate-900">{selectedClient.name || "Client"}</h2>
              <p className="mt-1 text-xs text-slate-500">{[selectedClient.address || selectedClient.billingAddress, selectedClient.city].filter(Boolean).join(" · ") || "Adresse non renseignée"}</p>
            </div>
            <button type="button" onClick={() => setSelectedClientId("")} aria-label="Fermer la fiche client" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
          </header>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Contact et identification</h3>
                <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-slate-500">Contact</dt><dd className="break-words font-medium text-slate-800">{selectedClient.contactName || selectedClient.mainContact || "—"}</dd>
                  <dt className="text-slate-500">Fonction</dt><dd className="break-words text-slate-700">{selectedClient.contactFunction || "—"}</dd>
                  <dt className="text-slate-500">Téléphone</dt><dd className="break-words text-slate-700">{selectedClient.contactPhone || selectedClient.phone || "—"}</dd>
                  <dt className="text-slate-500">Email</dt><dd className="break-all text-slate-700">{selectedClient.contactEmail || selectedClient.email || "—"}</dd>
                  <dt className="text-slate-500">ICE / RC / IF</dt><dd className="break-words text-slate-700">{[selectedClient.ice && `ICE ${selectedClient.ice}`, selectedClient.rc && `RC ${selectedClient.rc}`, selectedClient.ifNumber && `IF ${selectedClient.ifNumber}`, selectedClient.patente && `Patente ${selectedClient.patente}`].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className="text-slate-500">Facturation</dt><dd className="break-words text-slate-700">{selectedClient.billingAddress || "—"}</dd>
                </dl>
              </section>
              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Paiement et recouvrement</h3>
                <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-slate-500">Périodicité</dt><dd className="text-slate-700">{selectedClient.paymentType || selectedClient.paymentFrequency || "Mensuel"}</dd>
                  <dt className="text-slate-500">Mode</dt><dd className="text-slate-700">{selectedClient.paymentMode || selectedClient.paymentMethod || "—"}</dd>
                  <dt className="text-slate-500">Échéance</dt><dd className="text-slate-700">{dateLabel(selectedClient.dueDate)}</dd>
                  <dt className="text-slate-500">Solde dû</dt><dd className="font-semibold text-slate-800">{formatDh(selectedClient.balanceDue ?? selectedClient.amountDue ?? selectedClient.remainingAmount ?? 0)}</dd>
                  <dt className="text-slate-500">Dernier paiement</dt><dd className="text-slate-700">{dateLabel(selectedClient.lastPaymentDate || selectedClient.lastPaidAt)}</dd>
                  <dt className="text-slate-500">Statut</dt><dd><span className={`rounded-full px-2 py-1 text-xs font-semibold ${paymentStatus(selectedClient) === "En retard" ? "bg-rose-50 text-rose-700" : paymentStatus(selectedClient) === "À jour" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{paymentStatus(selectedClient)}</span></dd>
                </dl>
              </section>
            </div>
            {selectedClient.notes && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selectedClient.notes}</p></section>}
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="text-sm font-bold text-slate-800">Sites et ascenseurs</h3><p className="mt-1 text-xs text-slate-500">{sitesLoading || elevatorsLoading ? "Chargement des rattachements…" : `${selectedClientSites.length} site(s) · ${selectedClientElevators.length} ascenseur(s)`}</p></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openSiteForm} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"><Plus size={14} /> Ajouter un site</button>
                  <button type="button" onClick={openElevatorForm} disabled={!selectedClientSites.length} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={14} /> Ajouter un ascenseur</button>
                </div>
              </div>
              {!selectedClientSites.length && !selectedClientElevators.length && !sitesLoading && !elevatorsLoading ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">Aucun site ou ascenseur n’est encore rattaché à ce client.</p> : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {selectedClientSites.map((site) => {
                    const siteElevators = selectedClientElevators.filter((elevator) => elevator.siteId === site.id);
                    return <article key={site.id} className="rounded-lg bg-slate-50 p-3">
                      <p className="font-semibold text-slate-800">{site.name || "Site sans nom"}</p>
                      <p className="mt-1 text-xs text-slate-500">{[site.address, site.city].filter(Boolean).join(" · ") || "Adresse non renseignée"}</p>
                      <p className="mt-2 text-xs font-medium text-indigo-700">{siteElevators.length} ascenseur(s)</p>
                      {siteElevators.map((elevator) => <p key={elevator.id} className="mt-1 text-xs text-slate-600">{elevator.referenceInternal || elevator.number || elevator.serialNumber || "Ascenseur"} · {elevator.brand || "Marque inconnue"} · {elevator.status || "En service"}</p>)}
                    </article>;
                  })}
                  {selectedClientElevators.filter((elevator) => !selectedClientSites.some((site) => site.id === elevator.siteId)).map((elevator) => <article key={elevator.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="font-semibold text-amber-800">{elevator.referenceInternal || elevator.number || "Ascenseur"}</p><p className="mt-1 text-xs text-amber-700">Équipement sans site associé.</p></article>)}
                </div>
              )}
            </section>
            {quickFormError && !quickFormType && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{quickFormError}</p>}
          </div>
        </section>
      </div>}

      {quickFormType && selectedClient && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
        <form
          onSubmit={quickFormType === "site" ? saveClientSite : saveClientElevator}
          className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-lg font-bold text-slate-900">{quickFormType === "site" ? "Ajouter un site" : "Ajouter un ascenseur"}</h3><p className="mt-1 text-xs text-slate-500">Client : {selectedClient.name}</p></div>
            <button type="button" onClick={() => setQuickFormType("")} disabled={quickSaving} aria-label="Fermer" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X size={18} /></button>
          </div>
          {quickFormType === "site" ? <>
            <Field label="Nom de l’immeuble / résidence" required value={siteForm.name} onChange={(event) => setSiteForm((current) => ({ ...current, name: event.target.value }))} />
            <Field label="Adresse complète" required value={siteForm.address} onChange={(event) => setSiteForm((current) => ({ ...current, address: event.target.value }))} />
            <Field label="Ville" required value={siteForm.city} onChange={(event) => setSiteForm((current) => ({ ...current, city: event.target.value }))} />
            <Field label="Étage / accès" value={siteForm.accessFloor} onChange={(event) => setSiteForm((current) => ({ ...current, accessFloor: event.target.value }))} />
            <Field label="Contact sur place" value={siteForm.onsiteContact} onChange={(event) => setSiteForm((current) => ({ ...current, onsiteContact: event.target.value }))} />
            <Field label="Téléphone du contact" type="tel" value={siteForm.contactPhone} onChange={(event) => setSiteForm((current) => ({ ...current, contactPhone: event.target.value }))} />
          </> : <>
            <label className="block text-sm font-medium text-slate-700">Site associé<select required value={elevatorForm.siteId} onChange={(event) => setElevatorForm((current) => ({ ...current, siteId: event.target.value }))} className={INPUT_CLASS}><option value="">Sélectionner un site</option>{selectedClientSites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.city}</option>)}</select></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Référence interne" value={elevatorForm.referenceInternal} onChange={(event) => setElevatorForm((current) => ({ ...current, referenceInternal: event.target.value }))} />
              <Field label="N° de série" value={elevatorForm.serialNumber} onChange={(event) => setElevatorForm((current) => ({ ...current, serialNumber: event.target.value }))} />
              <label className="block text-sm font-medium text-slate-700">Marque<select value={elevatorForm.brand} onChange={(event) => setElevatorForm((current) => ({ ...current, brand: event.target.value }))} className={INPUT_CLASS}>{["Otis", "Schindler", "Kone", "Thyssenkrupp", "Orona", "Autre"].map((brand) => <option key={brand}>{brand}</option>)}</select></label>
              <Field label="Modèle" value={elevatorForm.model} onChange={(event) => setElevatorForm((current) => ({ ...current, model: event.target.value }))} />
              <label className="block text-sm font-medium text-slate-700">Type<select value={elevatorForm.type} onChange={(event) => setElevatorForm((current) => ({ ...current, type: event.target.value }))} className={INPUT_CLASS}>{["Électrique à traction", "Hydraulique", "Monte-charge", "Monte-personne", "Escalator", "Élévateur PMR"].map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700">État<select value={elevatorForm.status} onChange={(event) => setElevatorForm((current) => ({ ...current, status: event.target.value }))} className={INPUT_CLASS}>{["En service", "En panne", "À l'arrêt", "En modernisation"].map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700">Mise en service<input type="date" value={elevatorForm.commissioningDate} onChange={(event) => setElevatorForm((current) => ({ ...current, commissioningDate: event.target.value }))} className={INPUT_CLASS} /></label>
            </div>
          </>}
          {quickFormError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{quickFormError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setQuickFormType("")} disabled={quickSaving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={quickSaving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{quickSaving && <LoaderCircle size={15} className="animate-spin" />}{quickSaving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </form>
      </div>}

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="client-modal-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 p-5 backdrop-blur sm:p-6">
            <div><h2 id="client-modal-title" className="text-xl font-bold text-slate-900">Ajouter un client</h2><p className="mt-1 text-sm text-slate-500">Les champs marqués d’un astérisque sont obligatoires.</p></div>
            <button disabled={saving} onClick={() => setModalOpen(false)} aria-label="Fermer" className="rounded-lg p-2 text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X size={20} /></button>
          </div>
          <form onSubmit={saveClient} className="space-y-6 p-5 sm:p-6">
            <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Informations du client</h3><div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom / Raison sociale" name="name" value={form.name} onChange={updateField} required />
              <label className="block text-sm font-medium text-slate-700">Type de client<select required name="clientType" value={form.clientType || "Entreprise"} onChange={updateField} className={INPUT_CLASS}><option>Syndic</option><option>Copropriété</option><option>Promoteur</option><option>Entreprise</option><option>Particulier</option><option>Administration</option></select></label>
              <Field label="Nom du contact" name="contactName" value={form.contactName} onChange={updateField} />
              <Field label="Fonction du contact" name="contactFunction" value={form.contactFunction} onChange={updateField} />
              <Field label="Téléphone du contact" name="contactPhone" type="tel" value={form.contactPhone} onChange={updateField} />
              <Field label="Email du contact" name="contactEmail" type="email" value={form.contactEmail} onChange={updateField} />
              <Field label="Téléphone général" name="phone" type="tel" value={form.phone} onChange={updateField} />
              <Field label="Email général" name="email" type="email" value={form.email} onChange={updateField} />
              <Field label="ICE" name="ice" value={form.ice} onChange={updateField} />
              <Field label="Registre de Commerce (RC)" name="rc" value={form.rc} onChange={updateField} />
              <Field label="Patente" name="patente" value={form.patente} onChange={updateField} />
              <Field label="Identifiant fiscal (IF)" name="ifNumber" value={form.ifNumber} onChange={updateField} />
              <label className="block text-sm font-medium text-slate-700">Périodicité<select name="paymentType" value={form.paymentType} onChange={updateField} className={INPUT_CLASS}><option>Mensuel</option><option>Trimestriel</option></select></label>
              <label className="block text-sm font-medium text-slate-700">Mode de paiement<select name="paymentMode" value={form.paymentMode} onChange={updateField} className={INPUT_CLASS}><option value="">Non renseigné</option><option>Virement</option><option>Chèque</option><option>Espèces</option><option>Prélèvement</option><option>Autre</option></select></label>
              <Field label="Échéance du prochain paiement" name="dueDate" type="date" value={form.dueDate} onChange={updateField} />
              <Field label="Solde dû (DH)" name="balanceDue" type="number" min="0" step="0.01" value={form.balanceDue} onChange={updateField} />
              <Field label="Date du dernier paiement" name="lastPaymentDate" type="date" value={form.lastPaymentDate} onChange={updateField} />
            </div></div>
            <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Adresses</h3><div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Adresse complète du client<textarea name="address" value={form.address} onChange={updateField} rows={3} className={INPUT_CLASS} /></label>
              <Field label="Ville" name="city" value={form.city} onChange={updateField} />
              <label className="block text-sm font-medium text-slate-700">Adresse complète de facturation<textarea name="billingAddress" value={form.billingAddress} onChange={updateField} rows={3} className={INPUT_CLASS} /></label>
            </div></div>
            <label className="block text-sm font-medium text-slate-700">Notes<textarea name="notes" value={form.notes} onChange={updateField} rows={3} className={INPUT_CLASS} /></label>
            {formError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-50 disabled:opacity-50">Annuler</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{saving && <LoaderCircle size={16} className="animate-spin" />}{saving ? "Enregistrement…" : "Enregistrer le client"}</button>
            </div>
          </form>
        </div>
      </div>}
    </section>
  );
}
