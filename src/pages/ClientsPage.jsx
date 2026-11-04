import { useEffect, useMemo, useRef, useState } from "react";
import { clientsService, uploadClientAttachment } from "../services/dbService";
import { generateFicheClientPDF, prepareCompanyForPdf } from "../utils/pdfGenerator";
import { Building2, FileText, LoaderCircle, Plus, Search, Upload, Users, X } from "lucide-react";

const EMPTY_CLIENT = {
  name: "",
  ice: "",
  rc: "",
  patente: "",
  email: "",
  phone: "",
  mainContact: "",
  address: "",
  billingAddress: "",
  paymentType: "Mensuel",
};

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

function Field({ label, name, value, onChange, required, type = "text", className = "" }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}{required && <span className="text-rose-500"> *</span>}
      <input className={INPUT_CLASS} name={name} type={type} value={value || ""} onChange={onChange} required={required} />
    </label>
  );
}

export default function ClientsPage({ company = {} }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [form, setForm] = useState(EMPTY_CLIENT);
  const [formError, setFormError] = useState("");
  const fileInput = useRef(null);
  const uploadClientId = useRef("");

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
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const visibleClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return clients;
    return clients.filter((client) =>
      [client.name, client.email, client.phone, client.ice, client.rc, client.mainContact]
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
    setSaving(true);
    setFormError("");
    try {
      await clientsService.create({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
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

  async function exportClient(client) {
    setActionError("");
    try {
      const readyCompany = await prepareCompanyForPdf(company);
      generateFicheClientPDF(client, { company: readyCompany });
    } catch (exportError) {
      console.error("Impossible de générer le PDF de la fiche client.", exportError);
      setActionError("Le PDF de cette fiche client n’a pas pu être généré. Vérifiez le logo de l’entreprise et réessayez.");
    }
  }

  function selectAttachment(clientId) {
    uploadClientId.current = clientId;
    fileInput.current?.click();
  }

  async function uploadAttachments(event) {
    const files = Array.from(event.target.files || []);
    const clientId = uploadClientId.current;
    event.target.value = "";
    if (!files.length || !clientId) return;
    setUploadingId(clientId);
    setActionError("");
    setActionSuccess("");
    try {
      const results = await Promise.allSettled(files.map((file) => uploadClientAttachment(clientId, file)));
      const failed = results.filter((result) => result.status === "rejected");
      failed.forEach((result) => console.error("Un fichier client n’a pas pu être téléversé.", result.reason));
      if (failed.length) {
        setActionError(`${failed.length} fichier(s) sur ${files.length} n’ont pas pu être téléversés. Vérifiez le format, la taille et les règles Firebase Storage.`);
      } else {
        setActionSuccess(`${files.length} fichier(s) joint(s) avec succès.`);
      }
    } catch (uploadError) {
      console.error("Impossible de téléverser les pièces jointes.", uploadError);
      setActionError("Les fichiers n’ont pas pu être téléversés. Vérifiez le format, la taille et les règles Firebase Storage.");
    } finally {
      setUploadingId("");
    }
  }

  return (
    <section className="erp-module space-y-5">
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx"
        multiple
        className="hidden"
        onChange={uploadAttachments}
      />
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Clients enregistrés</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{loading ? "—" : clients.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Pièces jointes</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{loading ? "—" : clients.reduce((sum, client) => sum + (client.attachments?.length || 0), 0)}</p>
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
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-5 py-3.5 font-semibold">Client</th><th className="px-5 py-3.5 font-semibold">Contact</th><th className="px-5 py-3.5 font-semibold">ICE / RC</th><th className="px-5 py-3.5 font-semibold">Paiement</th><th className="px-5 py-3.5 font-semibold">Documents</th><th className="px-5 py-3.5 text-right font-semibold">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleClients.map((client) => (
                  <tr key={client.id} className="align-top transition-all duration-200 hover:bg-slate-50">
                    <td className="px-5 py-4"><p className="font-semibold text-slate-900">{client.name}</p><p className="mt-1 max-w-xs truncate text-xs text-slate-500">{client.billingAddress || client.address || "Adresse non renseignée"}</p></td>
                    <td className="px-5 py-4"><p className="text-slate-700">{client.mainContact || "—"}</p><p className="mt-1 text-xs text-slate-500">{client.phone || ""}{client.phone && client.email ? " · " : ""}{client.email || ""}</p></td>
                    <td className="px-5 py-4 text-slate-600"><p>{client.ice ? `ICE ${client.ice}` : "—"}</p><p className="mt-1 text-xs text-slate-500">{client.rc ? `RC ${client.rc}` : ""}{client.patente ? ` · Patente ${client.patente}` : ""}</p></td>
                    <td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{client.paymentType || "Mensuel"}</span></td>
                    <td className="px-5 py-4">
                      {(client.attachments || []).length === 0 ? <span className="text-xs text-slate-400">Aucun fichier</span> : <div className="flex max-w-56 flex-wrap gap-1.5">{client.attachments.map((file, index) => <a key={`${file.downloadURL}-${index}`} href={file.downloadURL} target="_blank" rel="noreferrer" title={file.name} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700"><FileText size={13} /><span className="max-w-32 truncate">{file.name}</span></a>)}</div>}
                    </td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2">
                      <button onClick={() => exportClient(client)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">PDF</button>
                      <button onClick={() => selectAttachment(client.id)} disabled={uploadingId === client.id} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                        {uploadingId === client.id ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />} Joindre
                      </button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="client-modal-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 p-5 backdrop-blur sm:p-6">
            <div><h2 id="client-modal-title" className="text-xl font-bold text-slate-900">Ajouter un client</h2><p className="mt-1 text-sm text-slate-500">Les champs marqués d’un astérisque sont obligatoires.</p></div>
            <button disabled={saving} onClick={() => setModalOpen(false)} aria-label="Fermer" className="rounded-lg p-2 text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X size={20} /></button>
          </div>
          <form onSubmit={saveClient} className="space-y-6 p-5 sm:p-6">
            <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Informations du client</h3><div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom / Raison sociale" name="name" value={form.name} onChange={updateField} required />
              <Field label="Interlocuteur principal" name="mainContact" value={form.mainContact} onChange={updateField} />
              <Field label="Email" name="email" type="email" value={form.email} onChange={updateField} />
              <Field label="Téléphone" name="phone" type="tel" value={form.phone} onChange={updateField} />
              <Field label="ICE" name="ice" value={form.ice} onChange={updateField} />
              <Field label="Registre de Commerce (RC)" name="rc" value={form.rc} onChange={updateField} />
              <Field label="Patente" name="patente" value={form.patente} onChange={updateField} />
              <label className="block text-sm font-medium text-slate-700">Type de paiement<select name="paymentType" value={form.paymentType} onChange={updateField} className={INPUT_CLASS}><option>Mensuel</option><option>Trimestriel</option></select></label>
            </div></div>
            <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Adresses</h3><div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Adresse complète du client<textarea name="address" value={form.address} onChange={updateField} rows={3} className={INPUT_CLASS} /></label>
              <label className="block text-sm font-medium text-slate-700">Adresse complète de facturation<textarea name="billingAddress" value={form.billingAddress} onChange={updateField} rows={3} className={INPUT_CLASS} /></label>
            </div></div>
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
