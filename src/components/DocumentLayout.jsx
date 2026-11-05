import CompanyLogo from "./CompanyLogo";
import { formatDateSafe } from "../utils/dateUtils";

export function DocumentTable({ columns, rows, caption }) {
  const columnWeights = columns.map((column, index) => {
    const width = Number(column.width);
    if (Number.isFinite(width) && width > 0) return width;
    return column.align === "right" ? 1 : index === 0 ? 3 : 2;
  });
  const totalWeight = columnWeights.reduce((total, width) => total + width, 0) || 1;

  return (
    <div className="document-table-wrap w-full max-w-full">
      <table className="document-table w-full max-w-full table-fixed border-collapse text-left text-sm">
        {caption && <caption className="mb-3 break-words text-left text-base font-bold text-slate-900">{caption}</caption>}
        <colgroup>
          {columns.map((column, index) => (
            <col
              key={column.key}
              style={{ width: `${(columnWeights[index] / totalWeight) * 100}%` }}
            />
          ))}
        </colgroup>
        <thead className="bg-gray-100 text-xs font-bold uppercase tracking-wide text-slate-600 print:bg-gray-100 print:[print-color-adjust:exact]">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
              className={`break-words border-b border-slate-200 px-2 py-2.5 align-middle sm:px-3 ${column.align === "right" ? "text-right" : "text-left"}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-slate-700">
          {rows.map((row, rowIndex) => (
            <tr key={row.id || row.key || rowIndex} className="break-inside-avoid">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`break-words px-2 py-2.5 align-top sm:px-3 ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`}
                >
                  {column.render ? column.render(row[column.key], row) : row[column.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentLayout({
  children,
  company = {},
  documentType,
  reference,
  dateEmission,
}) {
  const companyName = company.name || company.legalName || "TGI ASCENSEURS";
  const contacts = [
    company.address,
    [company.phone, company.email].filter(Boolean).join(" · "),
    [company.ice && `ICE ${company.ice}`, company.rc && `RC ${company.rc}`].filter(Boolean).join(" · "),
    company.website,
  ].filter(Boolean);

  return (
    <article className="document-layout mx-auto w-full max-w-[210mm] bg-white p-6 text-slate-800 shadow-xl sm:p-10 print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-col items-start justify-between gap-5 border-b-2 border-blue-600 pb-6 sm:flex-row print:flex-row print:items-start print:border-b-2 print:border-blue-600">
        <div className="flex min-w-0 items-center gap-4">
          <CompanyLogo src={company.logoUrl || company.logoDataUrl} className="h-16 w-24 shrink-0" />
          <div className="min-w-0">
            <p className="text-lg font-extrabold tracking-tight text-slate-900">{companyName}</p>
            {company.subtitle && <p className="mt-1 text-xs text-slate-500">{company.subtitle}</p>}
          </div>
        </div>
        <address className="max-w-full space-y-1 text-left text-xs not-italic leading-5 text-gray-700 sm:max-w-[48%] sm:text-right print:text-right">
          {contacts.map((contact, index) => (
            <p key={`${index}-${contact}`} className={index === 0 ? "font-bold uppercase" : ""}>{contact}</p>
          ))}
        </address>
      </header>

      <section className="mt-6 mb-8 flex flex-col gap-4 overflow-hidden rounded-r-lg border-l-8 border-blue-600 bg-[#F8FAFC] px-4 py-4 shadow-sm sm:px-6 sm:py-6 md:flex-row md:items-center md:justify-between print:overflow-hidden print:border-l-8 print:border-blue-600 print:bg-[#F8FAFC] print:[print-color-adjust:exact]">
        <h1 className="whitespace-nowrap text-xl font-extrabold uppercase tracking-wide text-[#1E293B] sm:text-2xl">
          {documentType}
        </h1>
        <dl className="flex w-full min-w-0 flex-wrap gap-4 border-t-2 border-gray-200 pt-4 sm:flex-nowrap sm:gap-8 md:w-auto md:border-l-2 md:border-t-0 md:pt-0 md:pl-6 print:border-l-2 print:border-t-0 print:pl-6 print:pt-0">
          <div className="flex min-w-0 flex-1 flex-col md:max-w-48">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Référence</dt>
            <dd className="mt-1 break-all font-mono text-sm font-semibold text-gray-800">{reference || "—"}</dd>
          </div>
          <div className="flex shrink-0 flex-col whitespace-nowrap">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Émis le</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-800">{formatDateSafe(dateEmission)}</dd>
          </div>
        </dl>
      </section>

      <div className="document-content mt-7">{children}</div>
    </article>
  );
}
