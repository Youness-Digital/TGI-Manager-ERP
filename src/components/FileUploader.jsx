import { useRef, useState } from "react";
import { CheckCircle2, Download, ExternalLink, FileText, LoaderCircle, Paperclip, Trash2, Upload, XCircle } from "lucide-react";
import { deleteRecordAttachment, runFirebaseUploadDiagnostic, uploadRecordAttachment } from "../services/dbService";

const DEFAULT_CATEGORIES = [
  "contrat",
  "devis",
  "facture",
  "preuve de paiement",
  "plan",
  "pv de réception",
  "carnet d'entretien",
  "autre",
];

function attachmentName(file) {
  return file?.nom || file?.name || "Document";
}

function attachmentUrl(file) {
  return file?.url || file?.downloadURL || "";
}

function formatSize(value) {
  const size = Number(value ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} Ko`
    : `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function FileUploader({
  collectionName,
  recordId,
  files = [],
  fieldName,
  categories = DEFAULT_CATEGORIES,
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif",
  buttonLabel = "Joindre",
  disabled = false,
}) {
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [category, setCategory] = useState(categories.includes("autre") ? "autre" : categories[0]);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retryFiles, setRetryFiles] = useState([]);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [diagnosticStages, setDiagnosticStages] = useState([]);

  async function uploadFiles(selectedFiles) {
    if (!selectedFiles.length || !recordId || progress || diagnosticRunning) return;
    setError("");
    setSuccess("");
    setOpen(true);
    setRetryFiles([]);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const failures = [];
    for (const [index, file] of selectedFiles.entries()) {
      setProgress({
        name: file.name,
        current: index + 1,
        total: selectedFiles.length,
        percent: 0,
      });
      try {
        await uploadRecordAttachment(collectionName, recordId, file, {
          category,
          fieldName,
          signal: controller.signal,
          onProgress: (fraction) => setProgress({
            name: file.name,
            current: index + 1,
            total: selectedFiles.length,
            percent: Math.round(fraction * 100),
          }),
        });
      } catch (uploadError) {
        const code = uploadError?.code || uploadError?.cause?.code || "upload/failed";
        const message = [
          uploadError?.message || String(uploadError),
          uploadError?.cause?.message,
        ].filter((detail, detailIndex, details) => detail && details.indexOf(detail) === detailIndex).join(" — ");
        console.error(`Échec Firebase (${code}) pour « ${file.name} » dans ${collectionName}/${recordId} : ${message}`, uploadError);
        failures.push({ file, code, message });
        if (controller.signal.aborted) {
          for (const queuedFile of selectedFiles.slice(index + 1)) {
            failures.push({ file: queuedFile, code: "storage/canceled", message: "Fichier non envoyé car la file a été annulée." });
          }
          break;
        }
      }
    }
    abortControllerRef.current = null;
    setProgress(null);
    if (failures.length) {
      setRetryFiles(failures.map(({ file }) => file));
      setError(`Échec de l'envoi — ${failures.map(({ file, code, message }) => `${file.name} (${code}) : ${message}`).join(" · ")}`);
    } else {
      setSuccess(`${selectedFiles.length} fichier(s) joint(s).`);
    }
  }

  async function runDiagnostic() {
    if (diagnosticRunning || progress) return;
    setOpen(true);
    setError("");
    setSuccess("");
    setDiagnosticStages([]);
    setDiagnosticRunning(true);
    try {
      await runFirebaseUploadDiagnostic((stage) => {
        setDiagnosticStages((current) => {
          const existingIndex = current.findIndex((entry) => entry.id === stage.id);
          if (existingIndex < 0) return [...current, stage];
          return current.map((entry) => entry.id === stage.id ? stage : entry);
        });
      });
    } catch (diagnosticError) {
      console.error("Le diagnostic Firebase n’a pas pu démarrer.", diagnosticError);
      setDiagnosticStages((current) => [...current, {
        id: "startup",
        label: "Démarrage du diagnostic",
        status: "error",
        error: {
          code: diagnosticError?.code || "diagnostic/failed",
          message: diagnosticError?.message || String(diagnosticError),
          ...(diagnosticError?.serverResponse ? { serverResponse: diagnosticError.serverResponse } : {}),
        },
      }]);
    } finally {
      setDiagnosticRunning(false);
    }
  }

  function cancelUploads() {
    abortControllerRef.current?.abort();
  }

  function handleSelect(event) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    void uploadFiles(selectedFiles);
  }

  async function removeFile(file) {
    const name = attachmentName(file);
    if (!window.confirm(`Supprimer « ${name} » ?`)) return;
    setError("");
    setSuccess("");
    try {
      await deleteRecordAttachment(collectionName, recordId, file, fieldName);
      setSuccess("Le fichier a été supprimé.");
    } catch (deleteError) {
      console.error(`Impossible de supprimer « ${name} » de ${collectionName}/${recordId}.`, deleteError);
      setError(`La suppression a échoué : ${deleteError.message}`);
    }
  }

  return (
    <div className="relative min-w-0">
      <input ref={inputRef} type="file" accept={accept} multiple className="hidden" onChange={handleSelect} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || !recordId || Boolean(progress) || diagnosticRunning}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {progress ? <LoaderCircle size={12} className="animate-spin" /> : <Upload size={12} />}
          {progress ? `${progress.percent}%` : buttonLabel}
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-100"
        >
          <Paperclip size={12} /> {files.length}
        </button>
      </div>
      {open && <div className="box-border mt-2 w-72 max-w-[calc(100vw-2rem)] min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
        {categories.length > 1 && <label className="mb-2 block min-w-0 text-[10px] font-medium text-slate-500">
          Catégorie
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="box-border mt-1 block w-full max-w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-700">
            {categories.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>}
        {progress && <div role="status" aria-live="polite" className="mb-2 rounded-md bg-blue-50 p-2 text-[10px] text-blue-700">
          <p className="truncate">Envoi {progress.current}/{progress.total} : {progress.name} · {progress.percent}%</p>
          <div
            role="progressbar"
            aria-label={`Progression de l’envoi de ${progress.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-100"
          >
            <div className="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{ width: `${progress.percent}%` }} />
          </div>
          <button type="button" onClick={cancelUploads} className="mt-2 inline-flex items-center gap-1 font-semibold text-rose-700 hover:text-rose-900">
            <XCircle size={12} /> Annuler la file
          </button>
        </div>}
        {error && <p role="alert" className="mb-2 break-words rounded-md bg-rose-50 p-2 text-[10px] text-rose-700">{error}</p>}
        {retryFiles.length > 0 && <button type="button" onClick={() => void uploadFiles(retryFiles)} disabled={Boolean(progress)} className="mb-2 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Réessayer l’envoi ({retryFiles.length})</button>}
        {success && <p role="status" className="mb-2 rounded-md bg-emerald-50 p-2 text-[10px] text-emerald-700">{success}</p>}
        {import.meta.env.DEV && <div className="mb-2 border-b border-slate-100 pb-2">
          <button type="button" onClick={() => void runDiagnostic()} disabled={diagnosticRunning || Boolean(progress)} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            {diagnosticRunning ? <LoaderCircle size={12} className="animate-spin" /> : <Upload size={12} />}
            {diagnosticRunning ? "Test Firebase en cours…" : "Tester l’envoi Firebase"}
          </button>
          {diagnosticStages.length > 0 && <ul aria-live="polite" className="mt-2 space-y-1">
            {diagnosticStages.map((stage) => <li key={stage.id} className={`break-words rounded-md p-1.5 text-[10px] ${stage.status === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
              <span className="inline-flex items-center gap-1 font-semibold">
                {stage.status === "ok" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {stage.label}: {stage.status === "ok" ? "OK" : "ERREUR"}
              </span>
              {stage.detail && <p>{stage.detail}</p>}
              {stage.error && <pre className="mt-1 whitespace-pre-wrap break-words font-sans">{JSON.stringify(stage.error, null, 2)}</pre>}
            </li>)}
          </ul>}
        </div>}
        {files.length ? <ul className="max-h-44 space-y-1.5 overflow-y-auto">
          {files.map((file, index) => {
            const name = attachmentName(file);
            const url = attachmentUrl(file);
            return <li key={`${file.path || url || name}-${index}`} className="flex min-w-0 items-center gap-1.5 rounded-md bg-slate-50 p-1.5">
              <FileText size={12} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p title={name} className="truncate text-[10px] font-medium text-slate-700">{name}</p>
                <p className="truncate text-[9px] text-slate-400">{file.categorie || "Document"}{formatSize(file.taille ?? file.size) ? ` · ${formatSize(file.taille ?? file.size)}` : ""}</p>
              </div>
              {url && <a href={url} target="_blank" rel="noreferrer" title="Ouvrir" aria-label={`Ouvrir ${name}`} className="shrink-0 p-1 text-slate-500 hover:text-blue-700"><ExternalLink size={12} /></a>}
              {url && <a href={url} download={name} title="Télécharger" aria-label={`Télécharger ${name}`} className="shrink-0 p-1 text-slate-500 hover:text-blue-700"><Download size={12} /></a>}
              <button type="button" onClick={() => removeFile(file)} title="Supprimer" aria-label={`Supprimer ${name}`} className="shrink-0 p-1 text-slate-400 hover:text-rose-600"><Trash2 size={12} /></button>
            </li>;
          })}
        </ul> : <p className="py-2 text-center text-[10px] text-slate-400">Aucun fichier joint</p>}
      </div>}
    </div>
  );
}
