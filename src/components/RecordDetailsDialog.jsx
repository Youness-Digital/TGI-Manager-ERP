import { X } from "lucide-react";

export default function RecordDetailsDialog({ title, reference, sections, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-details-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 p-5 backdrop-blur sm:p-6">
          <div className="min-w-0">
            <p className="break-all text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">{reference || "Fiche détaillée"}</p>
            <h2 id="record-details-title" className="mt-1 break-words text-xl font-bold text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer les détails" className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </header>
        <div className="space-y-4 p-5 sm:p-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{section.title}</h3>
              <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                {section.fields.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-slate-700">
                      {Array.isArray(value)
                        ? value.filter((item) => item != null && item !== "").join(" · ") || "—"
                        : value == null || value === "" ? "—" : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
