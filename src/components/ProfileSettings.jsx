import { useRef, useState } from "react";
import { Building2, Check, ImageUp, LoaderCircle, Save, ShieldCheck, Upload, Users } from "lucide-react";
import { companySettingsService } from "../services/dbService";

const COMPANY_FIELDS = [
  { key: "name", label: "Nom commercial", placeholder: "Nom affiché sur vos documents" },
  { key: "legalName", label: "Raison sociale", placeholder: "Dénomination juridique" },
  { key: "subtitle", label: "Activités", placeholder: "Installation · Maintenance · Modernisation" },
  { key: "ice", label: "ICE", placeholder: "Identifiant commun de l'entreprise" },
  { key: "rc", label: "Registre de commerce (RC)", placeholder: "Ville et numéro RC" },
  { key: "patente", label: "Patente / taxe professionnelle", placeholder: "Numéro de patente" },
  { key: "siret", label: "SIRET", placeholder: "Numéro SIRET" },
  { key: "vatNumber", label: "TVA intracommunautaire", placeholder: "Numéro de TVA" },
  { key: "phone", label: "Téléphone", placeholder: "+212 …" },
  { key: "email", label: "E-mail", placeholder: "contact@entreprise.ma", type: "email" },
  { key: "website", label: "Site web", placeholder: "https://www.entreprise.ma", type: "url" },
];

function PhotoField({ label, person, onChange }) {
  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onChange({ ...person, error: "Sélectionnez un fichier image." });
      event.target.value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      onChange({ ...person, error: "La photo doit faire moins de 3 Mo." });
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 640 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          onChange({ ...person, error: "Impossible de traiter cette photo." });
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        onChange({ ...person, photo: canvas.toDataURL("image/jpeg", 0.82), error: "" });
      };
      image.onerror = () => onChange({ ...person, error: "Impossible de décoder cette photo." });
      image.src = String(reader.result);
    };
    reader.onerror = () => onChange({ ...person, error: "La lecture de la photo a échoué." });
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-lg shadow-slate-200/30">
      <div className="flex items-start gap-4">
        <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-slate-100 ring-4 ring-slate-50">
          {person.photo ? (
            <img src={person.photo} alt={`Photo de ${person.name || label}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-300">{label.slice(0, 1)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">Portrait affiché dans l’équipe et disponible pour les documents.</p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand">
            <ImageUp size={14} /> Choisir une photo
            <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
          </label>
          {person.error && <p role="alert" className="mt-2 text-xs text-red-600">{person.error}</p>}
        </div>
      </div>
      <label className="mt-5 block text-xs font-semibold text-slate-600">
        Nom affiché
        <input
          value={person.name || ""}
          onChange={(event) => onChange({ ...person, name: event.target.value })}
          placeholder={`Nom du ${label.toLocaleLowerCase("fr-FR")}`}
          className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50"
        />
      </label>
    </article>
  );
}

export default function ProfileSettings({
  profiles,
  company,
  companyLoading = false,
  companyError = "",
  savingCompany = false,
  onProfilesChange,
  onCompanyChange,
  onSaveCompany,
}) {
  const logoInputRef = useRef(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  function updateProfile(key, value) {
    onProfilesChange({ ...profiles, [key]: value });
  }

  function updateCompanyField(field, value) {
    onCompanyChange({ ...company, [field]: value });
    setSaveMessage("");
  }

  async function saveCompany(event) {
    event.preventDefault();
    setSaveMessage("");
    try {
      await onSaveCompany(company);
      setSaveMessage("Les coordonnées de l’entreprise ont été enregistrées dans Firestore.");
    } catch {
      setSaveMessage("");
    }
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLogoError("");
    setSaveMessage("");
    setLogoUploading(true);
    try {
      const uploaded = await companySettingsService.uploadLogo(file);
      const nextCompany = {
        ...company,
        logoUrl: uploaded.downloadURL,
        logoPath: uploaded.path,
        logoName: uploaded.name,
      };
      onCompanyChange(nextCompany);
      await onSaveCompany(nextCompany);
      setSaveMessage("Logo envoyé et enregistré dans les paramètres de l’entreprise.");
    } catch (error) {
      console.error("Impossible d'envoyer ou d'enregistrer le logo de l'entreprise.", error);
      setLogoError(error.message || "Le logo n’a pas pu être envoyé.");
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <section className="erp-module mx-auto max-w-[1180px] space-y-6">
      <div className="erp-page-header flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
            <Building2 size={23} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-indigo-600">Configuration de l’espace</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight md:text-2xl">Identité de l’entreprise</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 md:text-sm">Les coordonnées enregistrées dans Firestore sont réutilisées sur les devis, factures, contrats et fiches PDF.</p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-lg shadow-slate-200/30 md:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand"><Users size={18} /></div>
          <div><h3 className="text-sm font-bold text-ink">Équipe signataire</h3><p className="mt-1 text-xs text-muted">Les portraits restent sur cet appareil et peuvent être ajoutés aux documents.</p></div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <PhotoField label="Directeur" person={profiles.director} onChange={(value) => updateProfile("director", value)} />
          <PhotoField label="Commercial" person={profiles.salesperson} onChange={(value) => updateProfile("salesperson", value)} />
        </div>
      </section>

      <form onSubmit={saveCompany} className="space-y-5">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-lg shadow-slate-200/30 md:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-ink">Informations légales et coordonnées</h3>
              <p className="mt-1 text-xs text-muted">Gérées dans le document Firestore <code className="rounded bg-slate-100 px-1.5 py-0.5">settings/company</code>.</p>
            </div>
            {companyLoading && <span className="inline-flex items-center gap-1.5 text-[11px] text-muted"><LoaderCircle size={14} className="animate-spin" /> Chargement</span>}
          </div>

          {companyError && <p role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{companyError}</p>}

          <div className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-slate-50 p-4 md:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-[86px] w-[150px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-blue-200 bg-white">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt="Logo de l’entreprise" className="max-h-full max-w-full object-contain p-2" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-300"><ImageUp size={23} /><span className="text-[9px] font-bold uppercase tracking-wider">Logo</span></div>
                )}
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-ink">Logo de l’entreprise</h4>
                <p className="mt-1 max-w-lg text-[11px] leading-5 text-muted">PNG, JPEG ou WebP · 5 Mo max. Stocké dans Firebase Storage et intégré aux PDF.</p>
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-brand shadow-sm ring-1 ring-blue-100 transition hover:ring-brand disabled:opacity-60">
                  {logoUploading ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
                  {logoUploading ? "Envoi du logo…" : company.logoUrl ? "Remplacer le logo" : "Importer le logo"}
                </button>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadLogo} />
                {logoError && <p role="alert" className="mt-2 text-xs text-red-600">{logoError}</p>}
              </div>
            </div>
          </div>

          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            {COMPANY_FIELDS.map(({ key, label, placeholder, type }) => (
              <label key={key} className="block text-xs font-semibold text-slate-600">
                {label}
                <input
                  type={type || "text"}
                  maxLength={240}
                  value={company[key] || ""}
                  onChange={(event) => updateCompanyField(key, event.target.value)}
                  placeholder={placeholder}
                  className="mt-2 w-full rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50"
                />
              </label>
            ))}
            <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
              Adresse du siège
              <textarea rows={2} maxLength={500} value={company.address || ""} onChange={(event) => updateCompanyField("address", event.target.value)} placeholder="Adresse, code postal, ville et pays" className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal leading-5 text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
              Adresse de facturation
              <textarea rows={2} maxLength={500} value={company.billingAddress || ""} onChange={(event) => updateCompanyField("billingAddress", event.target.value)} placeholder="Laisser vide si identique à l’adresse du siège" className="mt-2 w-full resize-y rounded-xl border border-line bg-slate-50 px-3.5 py-3 text-sm font-normal leading-5 text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </label>
          </div>
        </section>

        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-lg shadow-slate-200/30 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-start gap-2 text-xs leading-5 text-slate-500">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            Les informations de l’entreprise sont sauvegardées dans Firestore ; les profils signataires restent locaux.
          </div>
          <button type="submit" disabled={savingCompany || companyLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">
            {savingCompany ? <LoaderCircle size={15} className="animate-spin" /> : saveMessage ? <Check size={15} /> : <Save size={15} />}
            {savingCompany ? "Enregistrement…" : "Enregistrer les paramètres"}
          </button>
          {saveMessage && <p role="status" className="text-xs font-medium text-emerald-700 sm:basis-full">{saveMessage}</p>}
        </div>
      </form>
    </section>
  );
}
