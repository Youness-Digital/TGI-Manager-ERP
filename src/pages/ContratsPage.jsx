import { useEffect, useMemo, useState } from "react";
import { FileDown, FileText, LoaderCircle, Plus, Search, X } from "lucide-react";
import { clientsService, contratsService } from "../services/dbService";

const EMPTY_FORM = {
  clientId: "",
  siteAddress: "",
  contractType: "Installation",
  category: "Simple",
  startDate: "",
  endDate: "",
  amount: "",
  elevatorBrand: "",
  capacityKg: "",
  floorCount: "",
  serialNumber: "",
  maintenanceFrequency: "Mensuelle",
  status: "Actif",
};

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

function ContractModal({ clients, clientsLoading, onClose, onCreate, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);

  function submit(event) {
    event.preventDefault();
    const client = clients.find((entry) => entry.id === form.clientId);
    if (!client) return;
    onCreate({
      clientId: client.id,
      clientName: client.name || "Client",
      siteAddress: form.siteAddress.trim(),
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
      status: form.status,
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
              onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}
              disabled={clientsLoading || !hasClients}
              className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
            >
              <option value="">{clientsLoading ? "Chargement des clients…" : hasClients ? "Sélectionner un client" : "Aucun client disponible"}</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name || "Client sans nom"}</option>)}
            </select>
            {!clientsLoading && !hasClients && <span className="mt-1.5 block text-[11px] font-normal text-amber-700">Créez d’abord une fiche client pour pouvoir établir un contrat.</span>}
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Adresse du site / nom de l’immeuble <span className="text-red-500">*</span>
            <input required maxLength={240} value={form.siteAddress} onChange={(event) => setForm((current) => ({ ...current, siteAddress: event.target.value }))} placeholder="Résidence Al Andalous, adresse complète" className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              Type de contrat <span className="text-red-500">*</span>
              <select value={form.contractType} onChange={(event) => setForm((current) => ({ ...current, contractType: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option value="Installation">Installation</option>
                <option value="Intervention">Intervention</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Catégorie <span className="text-red-500">*</span>
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50">
                <option value="Simple">Contrat Simple</option>
                <option value="Complet">Contrat Complet</option>
              </select>
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

          <section className="rounded-xl border border-line bg-slate-50/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Caractéristiques de l’ascenseur</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">Marque<input maxLength={100} value={form.elevatorBrand} onChange={(event) => setForm((current) => ({ ...current, elevatorBrand: event.target.value }))} placeholder="Ex. Otis, KONE" className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Charge utile (kg)<input type="number" min="0" step="1" value={form.capacityKg} onChange={(event) => setForm((current) => ({ ...current, capacityKg: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Nombre de niveaux / étages<input type="number" min="0" step="1" value={form.floorCount} onChange={(event) => setForm((current) => ({ ...current, floorCount: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600">Numéro de série<input maxLength={120} value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand" /></label>
              <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">Fréquence de maintenance<select value={form.maintenanceFrequency} onChange={(event) => setForm((current) => ({ ...current, maintenanceFrequency: event.target.value }))} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-normal text-ink outline-none focus:border-brand"><option>Mensuelle</option><option>Trimestrielle</option></select></label>
            </div>
          </section>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
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
  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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

    return () => {
      active = false;
      unsubscribeContracts();
      unsubscribeClients();
    };
  }, []);

  const filteredContracts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    if (!query) return contracts;
    return contracts.filter((contract) =>
      [contract.clientName, contract.contractType, contract.category, contract.amount, contract.elevatorBrand, contract.serialNumber, contract.status]
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
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
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
                      <td className="px-5 py-3.5"><p className="font-semibold text-ink">{client?.name || contract.clientName || "Client"}</p><p className="mt-1 text-[10px] text-slate-500">{contract.siteAddress || "Site non précisé"}</p><p className="mt-1 text-[10px] text-slate-400">{contract.elevatorBrand || "Marque —"} · S/N {contract.serialNumber || "—"}</p></td>
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
      {modalOpen && <ContractModal clients={clients} clientsLoading={clientsLoading} onClose={() => setModalOpen(false)} onCreate={createContract} saving={saving} error={formError} />}
    </section>
  );
}
