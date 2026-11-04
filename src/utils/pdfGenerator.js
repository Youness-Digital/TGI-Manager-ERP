import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const LAYOUT = {
  margin: 15,
  headerHeight: 64,
  footerHeight: 40,
};

const DEFAULT_CLAUSES = [
  {
    title: "Objet et périmètre",
    text: "Le présent contrat définit les prestations décrites dans le devis accepté et ses annexes. Toute prestation complémentaire fait l'objet d'un accord écrit entre les parties.",
  },
  {
    title: "Prix et règlement",
    text: "Les prix, échéances et modalités de règlement sont ceux indiqués au contrat et au devis associé. Toute modification tarifaire est communiquée au client avant son application.",
  },
  {
    title: "Obligations des parties",
    text: "Le prestataire réalise les prestations avec diligence et informe le client des contraintes techniques constatées. Le client facilite l'accès au site et transmet les informations nécessaires à la bonne exécution des travaux.",
  },
  {
    title: "Sécurité et accès au site",
    text: "Les interventions sont réalisées dans le respect des consignes de sécurité applicables au site. Le client signale les risques connus et met à disposition les accès et autorisations nécessaires.",
  },
  {
    title: "Réception et réserves",
    text: "À l'issue des travaux, les parties peuvent établir un compte rendu de réception. Les réserves éventuelles sont décrites par écrit et font l'objet d'un suivi convenu entre les parties.",
  },
  {
    title: "Dispositions générales",
    text: "Le présent modèle constitue une base générique à compléter et à faire valider selon la situation du client, la nature des prestations et la réglementation applicable. Il ne remplace pas un conseil juridique.",
  },
];

function text(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value, currency = "EUR") {
  const amount = number(value, NaN);
  if (!Number.isFinite(amount)) return text(value, "—");

  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleDateString("fr-FR");
  if (value instanceof Date) return value.toLocaleDateString("fr-FR");
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleDateString("fr-FR");
}

function fileName(value, fallback = "document-tgi") {
  const normalized = text(value, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${normalized || fallback}.pdf`;
}

export async function prepareCompanyForPdf(company = {}) {
  if (!company.logoUrl || company.logoDataUrl) return company;

  const logoUrl = new URL(company.logoUrl);
  if (logoUrl.protocol !== "https:" || !["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(logoUrl.hostname)) {
    throw new TypeError("L’URL du logo doit provenir de Firebase Storage.");
  }
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error(`Le chargement du logo a échoué (${response.status}).`);
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw new TypeError("Le fichier du logo n’est pas une image PNG, JPEG ou WebP valide.");
  }
  const blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024) throw new RangeError("Le logo dépasse la limite de 5 Mo.");
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return { ...company, logoDataUrl: `data:${contentType};base64,${btoa(binary)}` };
}

function addLogo(doc, company, x, y) {
  const logo = company.logoDataUrl || company.logo;
  if (logo) {
    try {
      const format = logo.startsWith("data:image/png") ? "PNG" : logo.startsWith("data:image/webp") ? "WEBP" : "JPEG";
      const { width: sourceWidth, height: sourceHeight } = doc.getImageProperties(logo);
      if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        throw new TypeError("Dimensions du logo invalides.");
      }
      const maxWidth = 24;
      const maxHeight = 19;
      const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      doc.addImage(logo, format, x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height, undefined, "MEDIUM");
      return;
    } catch (error) {
      console.warn("Le logo n'a pas pu être intégré au PDF.", error);
    }
  }

  doc.setDrawColor(213, 221, 233);
  doc.roundedRect(x, y, 24, 19, 2, 2, "S");
  doc.setTextColor(150, 161, 179);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("LOGO", x + 12, y + 10, { align: "center" });
}

function drawHeader(doc, { title, reference, issueDate, company }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = LAYOUT.margin;
  const right = pageWidth - margin;
  const companyLeft = margin + 31;
  const rightWidth = 78;

  doc.setFillColor(18, 35, 60);
  doc.rect(0, 0, pageWidth, 6, "F");
  doc.setFillColor(45, 114, 213);
  doc.rect(margin, 6, 28, 1, "F");
  addLogo(doc, company, margin, 11);

  doc.setTextColor(23, 36, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  if (company.name || company.legalName) {
    doc.text(doc.splitTextToSize(text(company.name || company.legalName), 71).slice(0, 2), companyLeft, 15);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(113, 128, 150);
  if (company.subtitle) doc.text(doc.splitTextToSize(text(company.subtitle), 71).slice(0, 2), companyLeft, 23);

  const contacts = [
    company.address,
    [company.phone, company.email].filter(Boolean).join(" · "),
    [company.ice && `ICE ${company.ice}`, company.rc && `RC ${company.rc}`].filter(Boolean).join(" · "),
    [company.patente && `Patente ${company.patente}`, company.siret && `SIRET ${company.siret}`].filter(Boolean).join(" · "),
    company.vatNumber && `TVA ${company.vatNumber}`,
    company.website,
  ].filter(Boolean);
  doc.setFontSize(6.5);
  doc.setTextColor(70, 84, 106);
  let contactY = 12;
  contacts.forEach((value) => {
    const lines = doc.splitTextToSize(text(value), rightWidth).slice(0, 1);
    if (contactY + lines.length * 3.1 <= 32) {
      doc.text(lines, right, contactY, { align: "right" });
      contactY += lines.length * 3.1;
    }
  });

  doc.setDrawColor(224, 231, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, 35, right, 35);
  doc.setFillColor(246, 249, 253);
  doc.setDrawColor(225, 233, 243);
  doc.roundedRect(margin, 38, pageWidth - margin * 2, 18, 2, 2, "FD");
  doc.setFillColor(45, 114, 213);
  doc.roundedRect(margin, 38, 2, 18, 1, 1, "F");
  doc.setTextColor(23, 36, 58);
  doc.setFont("helvetica", "bold");
  const titleText = text(title, "DOCUMENT").toLocaleUpperCase("fr-FR");
  let titleFontSize = 11;
  let titleLines = [];
  while (titleFontSize >= 8.5) {
    doc.setFontSize(titleFontSize);
    titleLines = doc.splitTextToSize(titleText, 111);
    if (titleLines.length <= 2) break;
    titleFontSize -= 0.5;
  }
  titleLines = titleLines.slice(0, 2);
  doc.text(titleLines, margin + 7, titleLines.length > 1 ? 44 : 48);
  doc.setDrawColor(218, 227, 238);
  doc.setLineWidth(0.35);
  doc.line(pageWidth - margin - 57, 41, pageWidth - margin - 57, 53);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(45, 75, 115);
  if (reference) doc.text("RÉFÉRENCE", right - 54, 43);
  if (issueDate) doc.text("ÉMIS LE", right, 43, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80, 95, 116);
  if (reference) {
    doc.text(doc.splitTextToSize(text(reference), 53).slice(0, 1), right - 54, 48);
  }
  if (issueDate) {
    doc.text(formatDate(issueDate), right, 48, { align: "right" });
  }

  return LAYOUT.headerHeight;
}

function drawSignatureBox(doc, { x, y, width, title, person }) {
  const imgSize = 19;
  doc.setDrawColor(213, 221, 233);
  doc.roundedRect(x, y, imgSize, imgSize, 1.5, 1.5, "S");
  if (person?.photo) {
    try {
      const format = person.photo.startsWith("data:image/png")
        ? "PNG"
        : person.photo.startsWith("data:image/webp")
          ? "WEBP"
          : "JPEG";
      const { width: sourceWidth, height: sourceHeight } = doc.getImageProperties(person.photo);
      if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        throw new TypeError("Dimensions de la photo invalides.");
      }
      const imageWidth = imgSize - 1;
      const imageHeight = imgSize - 1;
      const scale = Math.min(imageWidth / sourceWidth, imageHeight / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      doc.addImage(
        person.photo,
        format,
        x + (imgSize - width) / 2,
        y + (imgSize - height) / 2,
        width,
        height,
        undefined,
        "MEDIUM",
      );
    } catch (error) {
      console.warn(`La photo de ${title} n'a pas pu être intégrée au PDF.`, error);
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(150, 161, 179);
    doc.text("Photo", x + imgSize / 2, y + 10, { align: "center" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(113, 128, 150);
  doc.text(title, x + imgSize + 3, y + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(23, 36, 58);
  const personName = typeof person === "string" ? person : person?.name;
  doc.text(doc.splitTextToSize(text(personName, "À compléter"), width - imgSize - 4).slice(0, 1), x + imgSize + 3, y + 9);
  doc.setDrawColor(155, 168, 189);
  doc.line(x + imgSize + 3, y + 16, x + width - 2, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(113, 128, 150);
  doc.text("Signature", x + imgSize + 3, y + 19);
}

function drawFooter(doc, { reference, companyName, signatures, pageNumber, pageCount }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = LAYOUT.margin;
  const footerTop = pageHeight - 33;

  doc.setFillColor(247, 249, 252);
  doc.rect(0, pageHeight - 11, pageWidth, 11, "F");
  doc.setDrawColor(225, 231, 240);
  doc.setLineWidth(0.35);
  doc.line(margin, footerTop - 4, pageWidth - margin, footerTop - 4);
  if (signatures?.enabled) {
    const gap = 5;
    const width = (pageWidth - margin * 2 - gap * 2) / 3;
    drawSignatureBox(doc, {
      x: margin,
      y: footerTop,
      width,
      title: "Le Directeur",
      person: signatures.director,
    });
    drawSignatureBox(doc, {
      x: margin + width + gap,
      y: footerTop,
      width,
      title: "Le Client",
      person: signatures.client,
    });
    drawSignatureBox(doc, {
      x: margin + (width + gap) * 2,
      y: footerTop,
      width,
      title: "Le Commercial",
      person: signatures.salesperson,
    });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(130, 142, 160);
  const footerText = `${text(companyName)}${companyName ? " · " : ""}${text(reference, "Document")}`;
  doc.text(doc.splitTextToSize(footerText, pageWidth - margin * 2 - 34).slice(0, 1), margin, pageHeight - 6);
  doc.setTextColor(53, 78, 111);
  doc.setFont("helvetica", "bold");
  doc.text(`${pageNumber} / ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: "right" });
}

function normalizeOptions(record, options = {}) {
  const company = { ...(record?.company || {}), ...(options.company || {}) };
  return {
    company,
    signatures: options.signatures || {
      enabled: options.showSignatures !== false,
      director: options.director || record?.director,
      client: options.client || record?.client,
      salesperson: options.salesperson || record?.salesperson,
    },
  };
}

function createReport({ title, reference, issueDate, company, signatures, filename }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = LAYOUT.margin;
  const tableWidth = pageWidth - margin * 2;
  let cursorY = drawHeader(doc, { title, reference, issueDate, company });

  function drawPageChrome(pageNumber, pageCount, includeSignatures = false) {
    drawHeader(doc, { title, reference, issueDate, company });
    drawFooter(doc, {
      reference,
      companyName: company.name || company.legalName,
      signatures: includeSignatures ? signatures : { enabled: false },
      pageNumber,
      pageCount,
    });
  }

  function addSection(sectionTitle, rows, {
    columns,
    widths,
    startY,
    autoColumn,
    alignRight = false,
  } = {}) {
    if (sectionTitle) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.8);
      doc.setTextColor(23, 36, 58);
      const titleLines = doc.splitTextToSize(text(sectionTitle), tableWidth);
      const titleHeight = titleLines.length * 4 + 2;
      if (cursorY + titleHeight + 16 > pageHeight - LAYOUT.footerHeight) {
        doc.addPage();
        cursorY = LAYOUT.headerHeight;
      }
      doc.setFillColor(45, 114, 213);
      doc.roundedRect(margin, cursorY - 2.8, 1.3, 5, 0.6, 0.6, "F");
      doc.text(titleLines, margin + 4, cursorY);
      cursorY += titleHeight;
    }

    const head = columns ? [columns.map((column) => text(column))] : undefined;
    const columnCount = head?.[0]?.length || rows[0]?.length || 1;
    const requestedWidths = widths || Array.from({ length: columnCount }, () => tableWidth / columnCount);
    if (requestedWidths.length !== columnCount || requestedWidths.some((width) => !Number.isFinite(width) || width <= 0)) {
      throw new RangeError("Les largeurs du tableau doivent être positives et correspondre au nombre de colonnes.");
    }
    if (autoColumn != null && (!Number.isInteger(autoColumn) || autoColumn < 0 || autoColumn >= columnCount)) {
      throw new RangeError("L’index de la colonne automatique est invalide.");
    }
    const sectionWidth = alignRight ? Math.min(tableWidth, requestedWidths.reduce((sum, width) => sum + width, 0)) : tableWidth;
    const tableLeft = alignRight ? pageWidth - margin - sectionWidth : margin;
    const fixedIndices = requestedWidths.map((_, index) => index).filter((index) => index !== autoColumn);
    const fixedTotal = fixedIndices.reduce((sum, index) => sum + requestedWidths[index], 0);
    const autoPreferredWidth = autoColumn == null ? 0 : requestedWidths[autoColumn];
    const fixedScale = fixedTotal > 0 ? Math.max(0, sectionWidth - autoPreferredWidth) / fixedTotal : 1;
    const resolvedWidths = requestedWidths.map((width, index) => (
      index === autoColumn ? autoPreferredWidth : width * (autoColumn == null ? sectionWidth / fixedTotal : fixedScale)
    ));
    const columnStyles = Object.fromEntries(resolvedWidths.map((width, index) => [
      index,
      index === autoColumn
        ? { cellWidth: "auto", minCellWidth: width }
        : { cellWidth: width },
    ]));
    autoTable(doc, {
      startY: startY ?? cursorY,
      margin: {
        left: margin,
        right: margin,
        top: LAYOUT.headerHeight,
        bottom: 40,
      },
      startX: tableLeft,
      tableWidth: sectionWidth,
      head,
      body: rows.length ? rows : [["—"]],
      columnStyles,
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: { top: 3, right: 2.8, bottom: 3, left: 2.8 },
        overflow: "linebreak",
        cellWidth: "wrap",
        lineWidth: 0.15,
        lineColor: [222, 229, 238],
        textColor: [50, 64, 83],
        valign: "middle",
      },
      headStyles: {
        fillColor: [27, 55, 91],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: "bold",
        lineColor: [27, 55, 91],
      },
      alternateRowStyles: { fillColor: [246, 249, 253] },
      theme: "grid",
      ...(columnCount === 2 && columns?.[0] === "Information" ? {
        columnStyles: {
          ...columnStyles,
          0: {
            ...columnStyles[0],
            fillColor: [241, 245, 250],
            textColor: [62, 79, 102],
            fontStyle: "bold",
          },
        },
      } : {}),
      rowPageBreak: "auto",
      pageBreak: "auto",
      showHead: "everyPage",
      didParseCell: (data) => {
        if (alignRight && data.section === "body" && data.row.index === rows.length - 1) {
          data.cell.styles.fillColor = [232, 241, 252];
          data.cell.styles.textColor = [23, 50, 84];
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawPage: (data) => {
        drawPageChrome(data.pageNumber, doc.internal.getNumberOfPages());
      },
    });
    cursorY = doc.lastAutoTable.finalY + 5;
    return cursorY;
  }

  function addParagraph(sectionTitle, content) {
    if (!content) return;
    addSection(sectionTitle, [[text(content)]]);
  }

  function finish() {
    const pageCount = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      drawPageChrome(page, pageCount, page === pageCount);
    }
    doc.save(filename);
    return doc;
  }

  return { doc, addSection, addParagraph, finish, get cursorY() { return cursorY; } };
}

function recordRef(record, fallback = "") {
  return text(record?.reference || record?.number || record?.id, fallback);
}

function paymentStatus(client) {
  const explicit = client.paymentStatus || client.statutPaiement || client.status;
  if (explicit) return text(explicit);
  const due = number(client.balanceDue ?? client.amountDue ?? client.remainingAmount, 0);
  if (due <= 0) return "À jour";
  const rawDate = client.dueDate;
  const date = typeof rawDate?.toDate === "function"
    ? rawDate.toDate()
    : rawDate instanceof Date
      ? rawDate
      : rawDate
        ? new Date(rawDate)
        : null;
  return date && !Number.isNaN(date.getTime()) && date < new Date() ? "En retard" : "À payer";
}

function clientIdentity(client) {
  if (typeof client === "string") return client;
  return text(client?.name || client?.nom || client?.companyName || client?.company, "Client");
}

export function generateFicheClientPDF(client = {}, options = {}) {
  const { company, signatures } = normalizeOptions(client, options);
  const name = clientIdentity(client);
  const report = createReport({
    title: "Fiche client",
    reference: recordRef(client, client.id || name),
    issueDate: new Date(),
    company,
    signatures: { ...signatures, enabled: false },
    filename: fileName(`fiche-client-${name}`),
  });
  const rows = [
    ["Nom / raison sociale", name],
    ["Type de client", client.clientType || client.typeClient],
    ["Interlocuteur principal", client.mainContact || client.contactName || client.contact],
    ["Adresse", client.address || client.adresse],
    ["Adresse de facturation", client.billingAddress],
    ["Téléphone", client.phone || client.telephone],
    ["E-mail", client.email],
    ["ICE", client.ice],
    ["Registre de Commerce (RC)", client.rc],
    ["Patente", client.patente],
    ["SIRET", client.siret],
    ["TVA intracommunautaire", client.vatNumber || client.tva],
    ["Mode de paiement", client.paymentType || client.paymentFrequency || client.typePaiement],
    ["Statut de paiement", paymentStatus(client)],
    ["Solde dû", money(client.balanceDue ?? client.amountDue ?? client.remainingAmount)],
  ].filter(([, value]) => value !== undefined && value !== "");
  report.addSection("Coordonnées et compte", rows, { columns: ["Information", "Détail"] });
  report.addParagraph("Notes", client.notes || client.comment);
  return report.finish();
}

export function generateFicheStockPDF(item = {}, options = {}) {
  const { company } = normalizeOptions(item, { ...options, showSignatures: false });
  const reference = recordRef(item, item.reference || item.designation || "stock");
  const quantity = number(item.quantity ?? item.quantite, 0);
  const report = createReport({
    title: "Fiche de pièce — stock",
    reference,
    issueDate: new Date(),
    company,
    signatures: { enabled: false },
    filename: fileName(`fiche-stock-${reference}`),
  });
  report.addSection("Informations de la pièce", [
    ["Référence", text(item.reference, "—")],
    ["Désignation", text(item.designation || item.name, "—")],
    ["Quantité disponible", quantity],
    ["Alerte de stock", quantity < 5 ? "Stock bas — réapprovisionnement à vérifier" : "Niveau normal"],
    ["Prix unitaire", money(item.unitPrice ?? item.price ?? 0)],
    ["Valeur indicative du stock", money(quantity * number(item.unitPrice ?? item.price, 0))],
  ], { columns: ["Information", "Détail"] });
  return report.finish();
}

export function generateInventaireStockPDF(items = [], options = {}) {
  if (!Array.isArray(items)) throw new TypeError("items doit être un tableau.");
  const { company } = normalizeOptions({}, { ...options, showSignatures: false });
  const report = createReport({
    title: "Inventaire du stock",
    reference: `Situation au ${formatDate(new Date())}`,
    issueDate: new Date(),
    company,
    signatures: { enabled: false },
    filename: fileName("inventaire-stock"),
  });
  const rows = items.map((item) => {
    const quantity = number(item.quantity ?? item.quantite, 0);
    return [
      text(item.reference, "—"),
      text(item.designation || item.name, "Pièce"),
      quantity,
      money(item.unitPrice ?? item.price ?? 0),
      quantity < 5 ? "Stock bas" : "Normal",
    ];
  });
  report.addSection("Articles en stock", rows, {
    columns: ["Référence", "Désignation", "Qté", "Prix unitaire", "État"],
    widths: [27, 85, 18, 30, 25],
    autoColumn: 1,
  });
  return report.finish();
}

export function generateFicheEquipePDF(member = {}, options = {}) {
  const { company } = normalizeOptions(member, { ...options, showSignatures: false });
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.name || "Membre";
  const report = createReport({
    title: "Fiche membre de l’équipe",
    reference: recordRef(member, name),
    issueDate: new Date(),
    company,
    signatures: { enabled: false },
    filename: fileName(`fiche-equipe-${name}`),
  });
  report.addSection("Informations du personnel", [
    ["Nom complet", text(name)],
    ["Rôle", text(member.role, "Technicien")],
    ["Téléphone", text(member.phone, "—")],
    ["Identifiant interne", text(member.id, "—")],
  ], { columns: ["Information", "Détail"] });
  return report.finish();
}

export function generateListeEquipePDF(members = [], options = {}) {
  if (!Array.isArray(members)) throw new TypeError("members doit être un tableau.");
  const { company } = normalizeOptions({}, { ...options, showSignatures: false });
  const report = createReport({
    title: "Registre de l’équipe technique",
    reference: `Situation au ${formatDate(new Date())}`,
    issueDate: new Date(),
    company,
    signatures: { enabled: false },
    filename: fileName("registre-equipe"),
  });
  report.addSection("Personnel", members.map((member) => [
    [member.firstName, member.lastName].filter(Boolean).join(" ") || member.name || "Membre",
    text(member.role, "Technicien"),
    text(member.phone, "—"),
  ]), {
    columns: ["Nom complet", "Rôle", "Téléphone"],
    widths: [74, 55, 55],
    autoColumn: 0,
  });
  return report.finish();
}

export function generateFicheRecouvrementPDF(clientsList = [], options = {}) {
  if (!Array.isArray(clientsList)) throw new TypeError("clientsList doit être un tableau.");
  const normalized = normalizeOptions({}, { ...options, showSignatures: false });
  const report = createReport({
    title: "Suivi des paiements et recouvrement",
    reference: `Situation au ${formatDate(new Date())}`,
    issueDate: new Date(),
    company: normalized.company,
    signatures: { enabled: false },
    filename: fileName("fiche-recouvrement"),
  });
  const rows = clientsList.map((client) => [
    clientIdentity(client),
    text(client.paymentType || client.paymentFrequency || client.typePaiement, "—"),
    money(client.amountPaid ?? client.paidAmount ?? 0),
    money(client.balanceDue ?? client.amountDue ?? client.remainingAmount ?? 0),
    text(client.dueDate ? formatDate(client.dueDate) : "—"),
    paymentStatus(client),
  ]);
  report.addSection("État des comptes clients", rows, {
    columns: ["Client", "Périodicité", "Payé", "Solde dû", "Échéance", "Statut"],
    widths: [46, 24, 28, 28, 24, 30],
  });
  return report.finish();
}

export function generateRecuPaiementPDF(paiement = {}, client = {}, options = {}) {
  const { company, signatures } = normalizeOptions(paiement, { ...options, client: options.client || client });
  const receiptRef = recordRef(paiement, `REC-${Date.now()}`);
  const report = createReport({
    title: "Reçu de paiement",
    reference: receiptRef,
    issueDate: paiement.date || new Date(),
    company,
    signatures,
    filename: fileName(`recu-paiement-${receiptRef}`),
  });
  report.addSection("Payeur", [
    ["Client", clientIdentity(client)],
    ["Adresse", client.address || client.adresse || "—"],
    ["Mode de paiement", paiement.paymentMethod || paiement.modePaiement || paiement.method || "—"],
    ["Date de réception", formatDate(paiement.date || paiement.paidAt)],
    ["Référence de transaction", paiement.transactionReference || paiement.transactionId || "—"],
  ], { columns: ["Information", "Détail"] });
  report.addSection("Règlement reçu", [
    ["Montant", money(paiement.amount ?? paiement.montant, paiement.currency || "EUR")],
    ["Période concernée", paiement.period || paiement.periode || "—"],
    ["Référence facture", paiement.invoiceNumber || paiement.documentReference || "—"],
    ["Statut", paiement.status || "Payé"],
  ], { columns: ["Information", "Détail"] });
  const proofFiles = paiement.proofFiles || (paiement.proof ? [paiement.proof] : []);
  if (proofFiles.length) {
    report.addSection("Justificatifs archivés", proofFiles.map((proof) => [
      text(proof.name || proof.originalName || "Justificatif"),
      text(proof.contentType || "Fichier"),
    ]), { columns: ["Fichier", "Format"], widths: [130, 50] });
  }
  report.addParagraph("Montant en lettres / notes", paiement.amountInWords || paiement.notes);
  return report.finish();
}

export function generateContratPDF(contrat = {}, client = {}, options = {}) {
  const { company, signatures } = normalizeOptions(contrat, { ...options, client: options.client || client });
  const ref = recordRef(contrat, `CTR-${Date.now()}`);
  const contractType = text(contrat.contractType || contrat.type, "Installation");
  const category = text(contrat.category || contrat.categorie, "Simple");
  const categoryLabel = category.toLocaleLowerCase("fr-FR").includes("complet") ? "Complet" : "Simple";
  const report = createReport({
    title: `Contrat ${contractType.toLocaleLowerCase("fr-FR")} — ${categoryLabel}`,
    reference: ref,
    issueDate: contrat.date || new Date(),
    company,
    signatures,
    filename: fileName(`contrat-${ref}`),
  });
  report.addSection("Parties et objet", [
    ["Client", clientIdentity(client)],
    ["Adresse du client", client.address || client.adresse || "—"],
    ["Type de contrat", contractType],
    ["Catégorie", `Contrat ${categoryLabel}`],
    ["Lieu d’intervention / site", contrat.siteAddress || contrat.siteName || contrat.buildingName || contrat.site || "—"],
    ["Équipement / ascenseur", contrat.equipment || contrat.equipement || "—"],
    ["Date de début", formatDate(contrat.startDate || contrat.dateDebut)],
    ["Date de fin / durée", contrat.endDate ? formatDate(contrat.endDate) : text(contrat.duration || contrat.duree, "—")],
    ["Fréquence de suivi", contrat.maintenanceFrequency || "À définir selon le périmètre"],
    ["Modalités de règlement", contrat.paymentTerms || contrat.paymentSchedule || "Selon devis ou échéancier validé"],
    ["Statut du contrat", contrat.status || "Actif"],
    ["Montant", money(contrat.amount ?? contrat.montant)],
  ], { columns: ["Information", "Détail"] });
  report.addSection("Caractéristiques de l’ascenseur", [
    ["Marque", contrat.elevatorBrand || contrat.brand || "—"],
    ["Charge utile", contrat.capacityKg != null && contrat.capacityKg !== "" ? `${text(contrat.capacityKg)} kg` : "—"],
    ["Nombre de niveaux / étages", contrat.floorCount ?? contrat.floors ?? "—"],
    ["Numéro de série", contrat.serialNumber || "—"],
    ["Fréquence de maintenance", contrat.maintenanceFrequency || "—"],
  ], { columns: ["Caractéristique", "Valeur"] });
  report.addParagraph("Description des prestations", contrat.description || contrat.scope || contrat.prestations);
  const scopeItems = Array.isArray(contrat.scopeItems) ? contrat.scopeItems : [];
  if (scopeItems.length) {
    report.addSection("Prestations incluses", scopeItems.map((item, index) => [
      index + 1,
      text(item.description || item.designation || item.label, "Prestation"),
      text(item.quantity ?? 1),
      text(item.unit || "forfait"),
    ]), {
      columns: ["#", "Prestation / étape", "Qté", "Unité"],
      widths: [10, 100, 20, 35],
      autoColumn: 1,
    });
  }
  const clauses = Array.isArray(contrat.clauses) ? contrat.clauses : [
    {
      title: "Périmètre et prestations",
      text: text(contrat.description, `Le périmètre du contrat de type « ${contractType} » est défini dans la liste des prestations et le devis accepté. Toute prestation non listée fait l'objet d'un accord écrit.`),
    },
    {
      title: `Niveau de service — Contrat ${categoryLabel}`,
      text: categoryLabel === "Complet"
        ? "Les prestations détaillées ci-dessus constituent le périmètre complet convenu entre les parties. Les délais, visites et exclusions spécifiques sont précisés dans les conditions particulières."
        : "Le contrat couvre uniquement les prestations explicitement décrites ci-dessus. Toute extension de périmètre doit faire l'objet d'un devis ou d'un avenant accepté.",
    },
    {
      title: "Prix et règlement",
      text: `Le montant et les modalités de règlement sont ceux indiqués au présent contrat et au devis associé. Modalités convenues : ${text(contrat.paymentTerms || contrat.paymentSchedule, "à préciser par les parties")}.`,
    },
    ...DEFAULT_CLAUSES.slice(2),
  ];
  report.addSection("Conditions générales — modèle à adapter", clauses.map((clause) => [
    text(clause.title || clause.titre, "Clause"),
    text(clause.text || clause.content || clause.texte),
  ]), { columns: ["Clause", "Dispositions"] });
  report.addParagraph("Dispositions particulières", contrat.specialConditions || contrat.conditionsParticulieres);
  report.addParagraph("Lieu et date de signature", contrat.signaturePlace || "Fait en deux exemplaires, à ____________________, le ____________________.");
  return report.finish();
}

export function generateFicheInterventionPDF(intervention = {}, client = {}, options = {}) {
  const { company, signatures } = normalizeOptions(intervention, { ...options, client: options.client || client });
  const ref = recordRef(intervention, `INT-${Date.now()}`);
  const report = createReport({
    title: "Fiche d'intervention technique",
    reference: ref,
    issueDate: intervention.date || new Date(),
    company,
    signatures: { ...signatures, enabled: signatures.enabled },
    filename: fileName(`fiche-intervention-${ref}`),
  });
  report.addSection("Informations de visite", [
    ["Client", clientIdentity(client)],
    ["Lieu d’intervention / immeuble", intervention.siteAddress || intervention.siteName || intervention.buildingName || client.address || client.adresse || "—"],
    ["Équipement / ascenseur", intervention.equipment || intervention.equipement || "—"],
    ["Date et heure", `${formatDate(intervention.date)} ${text(intervention.time, "")}`.trim()],
    ["Technicien", intervention.technician || intervention.technicien || "—"],
    ["Type d'intervention", intervention.type || intervention.interventionType || "—"],
    ["Priorité", intervention.priority || intervention.priorite || "Normal"],
  ], { columns: ["Information", "Détail"] });

  const checklist = Array.isArray(intervention.checklist)
    ? intervention.checklist
    : Object.entries(intervention.checklist || {
      Cabine: false,
      Moteur: false,
      Portes: false,
      Parachute: false,
    }).map(([label, checked]) => ({ label, checked }));
  report.addSection("Checklist de sécurité", checklist.map((item) => [
    text(typeof item === "string" ? item : item.label || item.name || item.description),
    (typeof item === "object" ? item.checked : false) ? "[X]" : "[ ]",
    text(typeof item === "object" ? item.observation || item.notes : "", ""),
  ]), { columns: ["Élément contrôlé", "Fait", "Observations"], widths: [86, 17, 77] });
  const spareParts = intervention.spareParts || intervention.partsUsed || intervention.sparePartsUsed || [];
  if (spareParts.length) {
    report.addSection("Pièces de rechange utilisées", spareParts.map((part) => [
      text(part.designation || part.description || part.name || "Pièce"),
      text(part.quantity ?? part.quantite ?? 1),
    ]), { columns: ["Désignation", "Quantité"], widths: [145, 35] });
  }
  report.addParagraph("Rapport du technicien", intervention.report || intervention.description || intervention.rapport);
  report.addParagraph("Travaux à prévoir", intervention.followUp || intervention.followup || intervention.suite);
  report.addParagraph("Signature du technicien", `Nom : ${text(intervention.technician || intervention.technicien, "____________________")}     Signature : ____________________`);
  report.addParagraph("Signature du client", `Nom : ${text(intervention.clientRepresentative || client.contactName, "____________________")}     Signature : ____________________`);
  return report.finish();
}

function orderRows(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const quantity = number(item.quantity ?? item.quantite, 1);
    const rawPrice = item.unitPrice ?? item.price ?? item.prixUnitaire;
    const unitPrice = Number(rawPrice);
    const priceProvided = rawPrice !== undefined && rawPrice !== null && Number.isFinite(unitPrice);
    const rawTotal = item.total ?? item.amount;
    const total = Number(rawTotal);
    return [
      text(item.reference || item.sku, "—"),
      text(item.description || item.designation || item.name, "Article"),
      text(item.quantity ?? item.quantite ?? 1),
      priceProvided ? money(unitPrice) : "—",
      rawTotal !== undefined && Number.isFinite(total)
        ? money(total)
        : priceProvided
          ? money(quantity * unitPrice)
          : "—",
    ];
  });
}

function generateOrderPDF(record, { title, filenamePrefix, options = {}, signaturesEnabled = true }) {
  const { company, signatures } = normalizeOptions(record, options);
  const ref = recordRef(record, `${filenamePrefix.toUpperCase()}-${Date.now()}`);
  const report = createReport({
    title,
    reference: ref,
    issueDate: record.date || record.issueDate || new Date(),
    company,
    signatures: { ...signatures, enabled: signaturesEnabled && signatures.enabled },
    filename: fileName(`${filenamePrefix}-${ref}`),
  });
  report.addSection("Informations", [
    ["Fournisseur", record.supplier || record.fournisseur || "—"],
    ["Client / destinataire", record.customer || record.client || record.recipient || "—"],
    ["Adresse de livraison", record.deliveryAddress || record.adresseLivraison || "—"],
    ["Date prévue", formatDate(record.deliveryDate || record.dateLivraison)],
    ["Référence associée", record.relatedReference || record.referenceDocument || "—"],
  ], { columns: ["Information", "Détail"] });
  report.addSection("Articles", orderRows(record.items || record.articles || record.lines), {
    columns: ["Référence", "Désignation", "Qté", "Prix unitaire", "Total"],
    widths: [23, 76, 15, 31, 35],
    autoColumn: 1,
  });
  if (record.taxRate != null || record.discountPercent != null || record.subtotal != null) {
    const items = Array.isArray(record.items) ? record.items : Array.isArray(record.articles) ? record.articles : record.lines || [];
    const subtotal = number(record.subtotal, items.reduce((sum, item) => {
      const quantity = number(item.quantity ?? item.quantite, 1);
      const unitPrice = number(item.unitPrice ?? item.price ?? item.prixUnitaire, 0);
      return sum + number(item.total, quantity * unitPrice);
    }, 0));
    const discountPercent = number(record.discountPercent, 0);
    const discountAmount = number(record.discountAmount, subtotal * discountPercent / 100);
    const taxableSubtotal = Math.max(0, subtotal - discountAmount);
    const taxRate = number(record.taxRate, 20);
    const tax = number(record.taxAmount, taxableSubtotal * taxRate / 100);
    const total = number(record.total, taxableSubtotal + tax);
    report.addSection("Récapitulatif financier", [
      ["Total HT", money(subtotal)],
      [`Remise (${discountPercent} %)`, `−${money(discountAmount)}`],
      [`TVA (${taxRate} %)`, money(tax)],
      ["Total TTC", money(total)],
    ], { columns: ["Libellé", "Montant"], widths: [54, 36], alignRight: true });
  }
  report.addParagraph("Instructions / observations", record.notes || record.instructions || record.observations);
  return report.finish();
}

export function generateBonCommandePDF(commande = {}, options = {}) {
  return generateOrderPDF(commande, {
    title: "Bon de commande",
    filenamePrefix: "bon-commande",
    options,
  });
}

export function generateBonLivraisonPDF(livraison = {}, options = {}) {
  const reportRecord = { ...livraison, reference: livraison.reference || livraison.number || livraison.id };
  return generateOrderPDF(reportRecord, {
    title: "Bon de livraison",
    filenamePrefix: "bon-livraison",
    options,
  });
}

export function generateDevisFacturePDF(document = {}, options = {}) {
  const { company, signatures } = normalizeOptions(document, options);
  const documentKind = text(document.documentType || document.type).toLocaleLowerCase("fr-FR");
  const inferredTitle = ["invoice", "facture"].includes(documentKind) ? "Facture" : "Devis";
  const title = text(document.documentTitle || document.title, inferredTitle);
  const ref = recordRef(document, `TGI-${new Date().getFullYear()}-001`);
  const currency = document.currency || "EUR";
  const rows = (Array.isArray(document.items) ? document.items : []).map((item) => {
    const quantity = number(item.quantity ?? item.quantite, 1);
    const unitPrice = number(item.unitPrice ?? item.price ?? item.prixUnitaire, 0);
    const total = Number.isFinite(Number(item.total)) ? Number(item.total) : quantity * unitPrice;
    return [
      text(item.description || item.designation, "Prestation"),
      text(item.quantity ?? item.quantite ?? 1),
      money(unitPrice, currency),
      money(total, currency),
    ];
  });
  const subtotal = (Array.isArray(document.items) ? document.items : []).reduce((sum, item) => {
    const qty = number(item.quantity ?? item.quantite, 1);
    const price = number(item.unitPrice ?? item.price ?? item.prixUnitaire, 0);
    const total = Number.isFinite(Number(item.total)) ? Number(item.total) : qty * price;
    return sum + number(total);
  }, 0);
  const taxRate = number(document.taxRate ?? document.tvaRate ?? 20, 20);
  const discountPercent = number(document.discountPercent, 0);
  const discountAmount = number(document.discountAmount, subtotal * discountPercent / 100);
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const tax = document.taxAmount != null ? number(document.taxAmount) : taxableSubtotal * taxRate / 100;
  const total = document.total != null ? number(document.total) : taxableSubtotal + tax;

  const report = createReport({
    title,
    reference: ref,
    issueDate: document.issueDate || document.date || new Date(),
    company,
    signatures,
    filename: fileName(`${title}-${ref}`),
  });
  report.addSection("Client", [
    ["Nom / raison sociale", clientIdentity(document.client || document.customer || {})],
    ["Adresse", document.client?.address || document.customer?.address || document.clientAddress || "—"],
    ["E-mail", document.client?.email || document.customer?.email || "—"],
    ["Valable jusqu'au", document.validUntil ? formatDate(document.validUntil) : "—"],
  ], { columns: ["Information", "Détail"] });
  report.addSection("Prestations et fournitures", rows, {
    columns: ["Désignation", "Qté", "Prix unitaire HT", "Total HT"],
    widths: [85, 15, 40, 40],
    autoColumn: 0,
  });
  report.addSection("Totaux", [
    ["Total HT", money(subtotal, currency)],
    [`Remise (${discountPercent} %)`, `−${money(discountAmount, currency)}`],
    [`TVA (${taxRate} %)`, money(tax, currency)],
    ["Total TTC", money(total, currency)],
  ], { columns: ["Libellé", "Montant"], widths: [54, 36], alignRight: true });
  report.addParagraph("Notes et conditions", document.notes || document.terms);
  return report.finish();
}

export function generateDocumentPDF(options = {}) {
  return generateDevisFacturePDF(options, options);
}

export const generateQuotePDF = (options = {}) =>
  generateDevisFacturePDF({ ...options, documentTitle: options.documentTitle || "Devis" }, options);

export const generateInvoicePDF = (options = {}) =>
  generateDevisFacturePDF({ ...options, documentTitle: options.documentTitle || "Facture" }, options);

export default generateDocumentPDF;
