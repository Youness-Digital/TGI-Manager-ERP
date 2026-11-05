function validDateParts(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function formatDateSafe(value) {
  if (value == null || value === "") return "—";

  let date;
  if (typeof value?.toDate === "function") {
    return formatDateSafe(value.toDate());
  }
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" || (typeof value === "string" && /^\d{9,13}$/.test(value.trim()))) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return "—";
    date = new Date(Math.abs(timestamp) < 100_000_000_000 ? timestamp * 1000 : timestamp);
  } else if (typeof value === "object" && Number.isFinite(value?.seconds)) {
    date = new Date(value.seconds * 1000);
  } else {
    const raw = String(value).trim();
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const compactDate = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    const frenchDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);

    if (isoDate || compactDate) {
      const [, year, month, day] = isoDate || compactDate;
      date = validDateParts(Number(year), Number(month), Number(day));
    } else if (frenchDate) {
      const [, day, month, year] = frenchDate;
      date = validDateParts(Number(year), Number(month), Number(day));
    } else {
      date = new Date(raw);
    }
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 9999) {
    return "—";
  }
  return date.toLocaleDateString("fr-FR");
}
