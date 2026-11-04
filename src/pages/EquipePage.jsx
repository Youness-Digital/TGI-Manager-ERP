import { useEffect, useMemo, useState } from "react";
import { FileDown, LoaderCircle, Pencil, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { equipeService } from "../services/dbService";

const EMPTY_FORM = { firstName: "", lastName: "", phone: "", role: "Technicien" };
const FIELD_CLASS = "mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50";

function memberName(member) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ") || member.name || "Membre sans nom";
}

function TeamModal({ member, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(member ? {
    firstName: member.firstName || "",
    lastName: member.lastName || "",
    phone: member.phone || "",
    role: member.role || "Technicien",
  } : EMPTY_FORM);
  const isEditing = Boolean(member);

  function submit(event) {
    event.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    onSave({ firstName, lastName, name: [firstName, lastName].filter(Boolean).join(" "), phone: form.phone.trim(), role: form.role });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="team-modal-title" className="my-auto w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand">Ressources humaines</p><h2 id="team-modal-title" className="mt-1 text-lg font-bold text-ink">{isEditing ? "Modifier un membre" : "Ajouter un membre"}</h2></div>
          <button type="button" aria-label="Fermer" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">Prénom <span className="text-red-500">*</span><input required maxLength={100} value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} className={FIELD_CLASS} /></label>
            <label className="block text-xs font-semibold text-slate-600">Nom <span className="text-red-500">*</span><input required maxLength={100} value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} className={FIELD_CLASS} /></label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Téléphone<input type="tel" maxLength={40} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+212…" className={FIELD_CLASS} /></label>
          <label className="block text-xs font-semibold text-slate-600">Rôle <span className="text-red-500">*</span>
            <select required value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className={FIELD_CLASS}><option>Technicien</option><option>Chef d'équipe</option></select>
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-60">{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}{saving ? "Enregistrement…" : isEditing ? "Enregistrer les modifications" : "Ajouter à l’équipe"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function EquipePage({ company = {} }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [editingMember, setEditingMember] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = equipeService.subscribe(
      (records) => {
        if (!active) return;
        setMembers(records);
        setLoading(false);
        setLoadError("");
      },
      (error) => {
        if (!active) return;
        console.error("Impossible de charger l’équipe depuis Firestore.", error);
        setLoadError("L’équipe n’a pas pu être chargée. Vérifiez la connexion et les règles Firestore.");
        setLoading(false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    const sorted = [...members].sort((a, b) => memberName(a).localeCompare(memberName(b), "fr"));
    return query ? sorted.filter((member) => [memberName(member), member.phone, member.role].some((value) => String(value || "").toLocaleLowerCase("fr-FR").includes(query))) : sorted;
  }, [members, search]);

  async function saveMember(record) {
    setSaving(true);
    setFormError("");
    try {
      if (editingMember) await equipeService.update(editingMember.id, record);
      else await equipeService.create(record);
      setModalOpen(false);
      setEditingMember(null);
      setActionError("");
    } catch (error) {
      console.error("Impossible d’enregistrer le membre d’équipe dans Firestore.", error);
      setFormError("L’enregistrement a échoué. Vérifiez votre connexion et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMember(member) {
    if (!window.confirm(`Supprimer ${memberName(member)} de l’équipe ?`)) return;
    setDeletingId(member.id);
    setActionError("");
    try {
      await equipeService.remove(member.id);
    } catch (error) {
      console.error("Impossible de supprimer le membre d’équipe.", error);
      setActionError("La suppression a échoué. Vérifiez la connexion et réessayez.");
    } finally {
      setDeletingId("");
    }
  }

  function openModal(member = null) {
    setEditingMember(member);
    setFormError("");
    setModalOpen(true);
  }

  async function exportMember(member) {
    setActionError("");
    try {
      const { generateFicheEquipePDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      generateFicheEquipePDF(member, { company: readyCompany });
    } catch (error) {
      console.error("Impossible de générer la fiche PDF du membre.", error);
      setActionError("La fiche PDF de ce membre n’a pas pu être générée.");
    }
  }

  async function exportTeam() {
    setActionError("");
    try {
      const { generateListeEquipePDF, prepareCompanyForPdf } = await import("../utils/pdfGenerator");
      const readyCompany = await prepareCompanyForPdf(company);
      generateListeEquipePDF(filteredMembers, { company: readyCompany });
    } catch (error) {
      console.error("Impossible de générer le registre PDF de l’équipe.", error);
      setActionError("Le registre PDF de l’équipe n’a pas pu être généré.");
    }
  }

  return (
    <section className="erp-module space-y-5">
      <div className="erp-page-header flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Ressources humaines</p><h2 className="mt-1 text-xl font-bold tracking-tight text-ink">Équipe technique</h2><p className="mt-1 text-xs text-muted">Gérez les techniciens disponibles pour les interventions.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={exportTeam} disabled={loading || !filteredMembers.length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"><FileDown size={15} /> Exporter l’équipe</button>
          <button onClick={() => openModal()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark"><Plus size={16} /> Ajouter un membre</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><h3 className="text-sm font-bold text-ink">Personnel</h3><p className="mt-1 text-[11px] text-muted">{loading ? "Synchronisation avec Firestore…" : `${filteredMembers.length} ${filteredMembers.length === 1 ? "membre affiché" : "membres affichés"}`}</p></div>
          <label className="relative block sm:w-[280px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un membre…" aria-label="Rechercher un membre" className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-ink outline-none focus:border-brand focus:bg-white" /></label>
        </div>
        {loadError ? <div role="alert" className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{loadError}</div> : loading ? (
          <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted" role="status"><LoaderCircle size={22} className="animate-spin text-brand" />Loading… Chargement de l’équipe</div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center"><UserRound size={24} className="text-slate-300" /><p className="mt-3 text-sm font-bold text-ink">{search ? "Aucun membre trouvé" : "Aucun membre enregistré"}</p><p className="mt-1 text-xs text-muted">{search ? "Essayez une autre recherche." : "Ajoutez les techniciens pour les affecter aux interventions."}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead className="bg-slate-50 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400"><tr><th className="px-5 py-3.5">Nom</th><th className="px-4 py-3.5">Téléphone</th><th className="px-4 py-3.5">Rôle</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-line">{filteredMembers.map((member) => <tr key={member.id} className="text-xs transition hover:bg-slate-50/70">
                <td className="px-5 py-3.5 font-semibold text-ink">{memberName(member)}</td><td className="px-4 py-3.5 text-slate-600">{member.phone || "—"}</td><td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${member.role === "Chef d'équipe" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>{member.role || "Technicien"}</span></td>
                <td className="px-5 py-3.5 text-right"><div className="inline-flex gap-1"><button onClick={() => exportMember(member)} aria-label={`Exporter la fiche PDF de ${memberName(member)}`} className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-brand"><FileDown size={14} /></button><button onClick={() => openModal(member)} aria-label={`Modifier ${memberName(member)}`} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-brand"><Pencil size={14} /></button><button onClick={() => deleteMember(member)} aria-label={`Supprimer ${memberName(member)}`} disabled={deletingId === member.id} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 size={14} /></button></div></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {actionError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">{actionError}</p>}
      {modalOpen && <TeamModal member={editingMember} onClose={() => { setModalOpen(false); setEditingMember(null); }} onSave={saveMember} saving={saving} error={formError} />}
    </section>
  );
}
