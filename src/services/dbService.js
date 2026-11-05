import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { createModelRecord, getModelDefinition, normalizeModelRecord } from "../models/erpModels";

const COLLECTIONS = [
  "clients",
  "documents",
  "sites",
  "ascenseurs",
  "paiements",
  "contrats",
  "interventions",
  "commandes",
  "mouvements_stock",
  "devis",
  "factures",
  "stock",
  "equipe",
  "settings",
];

const DOCUMENT_MIME_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const PAYMENT_PROOF_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function assertCollection(collectionName) {
  if (!COLLECTIONS.includes(collectionName)) {
    throw new TypeError(`Collection non prise en charge : ${collectionName}`);
  }
}

function assertRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Les données Firestore doivent être un objet.");
  }
}

/**
 * Crée un document dans une collection ERP prise en charge.
 * Les horodatages sont générés par Firestore.
 */
export async function createRecord(collectionName, record) {
  assertCollection(collectionName);
  assertRecord(record);

  const model = getModelDefinition(collectionName);
  const normalizedRecord = createModelRecord(collectionName, record);
  const suppliedNumber = normalizedRecord.number || normalizedRecord.reference || normalizedRecord.documentNumber;
  if (model?.numberPrefix && suppliedNumber) {
    normalizedRecord.number ||= suppliedNumber;
    normalizedRecord.reference ||= suppliedNumber;
  }

  const recordRef = doc(collection(db, collectionName));
  const timestamps = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (model?.numberPrefix && !suppliedNumber) {
    const year = new Date().getFullYear();
    const counterRef = doc(db, "counters", `${model.firestoreCollection}-${year}`);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const currentValue = snapshot.exists() ? Number(snapshot.data().value) : 0;
      if (!Number.isSafeInteger(currentValue) || currentValue < 0) {
        throw new TypeError(`Le compteur de numérotation ${model.firestoreCollection}-${year} est invalide.`);
      }

      const sequence = currentValue + 1;
      const generatedNumber = `${model.numberPrefix}-${year}-${String(sequence).padStart(4, "0")}`;
      const payload = {
        ...normalizedRecord,
        number: generatedNumber,
        reference: generatedNumber,
        ...("documentNumber" in normalizedRecord ? { documentNumber: generatedNumber } : {}),
        ...timestamps,
      };

      transaction.set(counterRef, {
        value: sequence,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(recordRef, payload);
    });
  } else {
    await setDoc(recordRef, {
      ...normalizedRecord,
      ...timestamps,
    });
  }

  return recordRef.id;
}

/** Crée un article et journalise son stock initial dans la même transaction. */
export async function createStockRecord(record) {
  assertRecord(record);
  const stockRecord = createModelRecord("stock", record);
  const openingQuantity = Number(stockRecord.quantity);
  if (!Number.isFinite(openingQuantity) || openingQuantity < 0) {
    throw new TypeError("La quantité initiale doit être un nombre positif ou nul.");
  }

  const stockRef = doc(collection(db, "stock"));
  const suppliedNumber = stockRecord.number || stockRecord.reference || stockRecord.documentNumber;
  stockRecord.number ||= suppliedNumber;
  stockRecord.reference ||= suppliedNumber;
  const timestamps = { createdAt: serverTimestamp(), updatedAt: serverTimestamp() };

  if (openingQuantity === 0) {
    await setDoc(stockRef, { ...stockRecord, ...timestamps });
    return stockRef.id;
  }

  const movementModel = getModelDefinition("mouvements_stock");
  if (!movementModel?.numberPrefix || !movementModel.firestoreCollection) {
    throw new Error("Le modèle de numérotation des mouvements de stock est introuvable.");
  }
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", `${movementModel.firestoreCollection}-${year}`);
  const movementRef = doc(collection(db, "mouvements_stock"));

  await runTransaction(db, async (transaction) => {
    const counterSnapshot = await transaction.get(counterRef);
    const counterValue = counterSnapshot.exists() ? Number(counterSnapshot.data().value) : 0;
    if (!Number.isSafeInteger(counterValue) || counterValue < 0) {
      throw new TypeError(`Le compteur de numérotation ${movementModel.firestoreCollection}-${year} est invalide.`);
    }
    const sequence = counterValue + 1;
    if (!Number.isSafeInteger(sequence)) {
      throw new RangeError(`Le compteur de numérotation ${movementModel.firestoreCollection}-${year} a atteint sa limite.`);
    }
    const movementNumber = `${movementModel.numberPrefix}-${year}-${String(sequence).padStart(4, "0")}`;
    const movement = createModelRecord("mouvements_stock", {
      number: movementNumber,
      reference: movementNumber,
      itemId: stockRef.id,
      itemReference: stockRecord.reference || "",
      itemDesignation: stockRecord.designation || "",
      movementType: "Entrée",
      quantity: openingQuantity,
      quantityBefore: 0,
      quantityAfter: openingQuantity,
      unit: stockRecord.unit || "unité",
      date: new Date().toISOString().slice(0, 10),
      reason: "Stock initial",
      sourceType: "Création d’article",
    });

    transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(stockRef, { ...stockRecord, ...timestamps });
    transaction.set(movementRef, {
      ...movement,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return stockRef.id;
}

/** Enregistre un règlement et actualise sa facture associée atomiquement. */
export async function createInvoicePayment(record) {
  assertRecord(record);
  if (!record.factureId) return createRecord("paiements", record);
  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new TypeError("Le montant du règlement doit être supérieur à zéro.");
  }

  const paymentModel = getModelDefinition("paiements");
  if (!paymentModel?.numberPrefix || !paymentModel.firestoreCollection) {
    throw new Error("Le modèle de numérotation des reçus est introuvable.");
  }
  const invoiceRef = doc(db, "factures", record.factureId);
  const paymentRef = doc(collection(db, "paiements"));
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", `${paymentModel.firestoreCollection}-${year}`);

  await runTransaction(db, async (transaction) => {
    const invoiceSnapshot = await transaction.get(invoiceRef);
    const counterSnapshot = await transaction.get(counterRef);
    if (!invoiceSnapshot.exists()) throw new Error("La facture sélectionnée n’existe plus.");

    const invoice = invoiceSnapshot.data();
    if (invoice.clientId && record.clientId !== invoice.clientId) {
      throw new TypeError("Le client du règlement ne correspond pas au client de la facture.");
    }
    const total = Number(invoice.total ?? invoice.amountDue);
    if (!Number.isFinite(total) || total <= 0) {
      throw new TypeError("Le total de la facture est invalide.");
    }
    const currentPaid = Number(invoice.paidAmount ?? 0);
    const currentBalance = invoice.balanceDue == null
      ? Math.max(0, total - currentPaid)
      : Number(invoice.balanceDue);
    if (!Number.isFinite(currentPaid) || currentPaid < 0 || !Number.isFinite(currentBalance) || currentBalance < 0) {
      throw new TypeError("Le solde de la facture est invalide.");
    }
    const roundedAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
    const nextPaid = Math.round((currentPaid + roundedAmount + Number.EPSILON) * 100) / 100;
    const nextBalance = Math.max(0, Math.round((currentBalance - roundedAmount + Number.EPSILON) * 100) / 100);
    if (roundedAmount > currentBalance + 0.009) {
      throw new RangeError(`Le règlement dépasse le solde de la facture (${currentBalance.toFixed(2)}).`);
    }

    const counterValue = counterSnapshot.exists() ? Number(counterSnapshot.data().value) : 0;
    if (!Number.isSafeInteger(counterValue) || counterValue < 0) {
      throw new TypeError(`Le compteur de numérotation ${paymentModel.firestoreCollection}-${year} est invalide.`);
    }
    const sequence = counterValue + 1;
    if (!Number.isSafeInteger(sequence)) {
      throw new RangeError(`Le compteur de numérotation ${paymentModel.firestoreCollection}-${year} a atteint sa limite.`);
    }
    const receiptNumber = `${paymentModel.numberPrefix}-${year}-${String(sequence).padStart(4, "0")}`;
    const payment = createModelRecord("paiements", {
      ...record,
      number: receiptNumber,
      reference: receiptNumber,
      receiptNumber,
      factureId: invoiceSnapshot.id,
      invoiceNumber: invoice.number || invoice.reference || invoice.documentNumber || "",
      contratId: record.contratId || invoice.contratId || "",
      devisId: record.devisId || invoice.devisId || "",
      siteId: record.siteId || invoice.siteId || "",
      site: record.site || invoice.site || null,
      ascenseurId: record.ascenseurId || invoice.ascenseurId || "",
      ascenseur: record.ascenseur || invoice.ascenseur || null,
      clientId: invoice.clientId || record.clientId || "",
      clientName: invoice.clientName || record.clientName || "",
      amount: roundedAmount,
      amountDue: total,
      balanceDue: nextBalance,
      currency: invoice.currency || record.currency || "EUR",
      dueDate: invoice.dueDate || "",
      status: "Payé",
    });

    transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() }, { merge: true });
    transaction.update(invoiceRef, {
      paidAmount: nextPaid,
      balanceDue: nextBalance,
      status: nextBalance === 0 ? "Payée" : "Partiellement payée",
      updatedAt: serverTimestamp(),
    });
    transaction.set(paymentRef, {
      ...payment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return paymentRef.id;
}

/** Récupère une fiche par son identifiant ou null si elle n'existe pas. */
export async function getRecord(collectionName, recordId) {
  assertCollection(collectionName);
  if (!recordId) throw new TypeError("Un identifiant de document est requis.");

  const snapshot = await getDoc(doc(db, collectionName, recordId));
  return snapshot.exists()
    ? { id: snapshot.id, ...normalizeModelRecord(collectionName, snapshot.data()) }
    : null;
}

/** Liste les fiches d'une collection. */
export async function listRecords(collectionName) {
  assertCollection(collectionName);

  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((entry) => ({
    id: entry.id,
    ...normalizeModelRecord(collectionName, entry.data()),
  }));
}

/** Écoute les changements d'une collection et retourne la fonction de désabonnement. */
export function subscribeRecords(collectionName, onRecords, onError) {
  assertCollection(collectionName);
  if (typeof onRecords !== "function") {
    throw new TypeError("Un callback de réception des données est requis.");
  }

  return onSnapshot(
    collection(db, collectionName),
    (snapshot) => onRecords(snapshot.docs.map((entry) => ({
      id: entry.id,
      ...normalizeModelRecord(collectionName, entry.data()),
    }))),
    onError,
  );
}

/** Met à jour les champs fournis d'une fiche existante. */
export async function updateRecord(collectionName, recordId, changes) {
  assertCollection(collectionName);
  if (!recordId) throw new TypeError("Un identifiant de document est requis.");
  assertRecord(changes);

  await updateDoc(doc(db, collectionName, recordId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
  return recordId;
}

/** Ajuste le stock et journalise le mouvement dans une même transaction Firestore. */
export async function updateStockMovement(itemId, quantityChange, details = {}) {
  if (!itemId) throw new TypeError("Un identifiant de pièce est requis.");
  if (!Number.isFinite(quantityChange) || quantityChange === 0) {
    throw new TypeError("La variation de stock doit être un nombre fini différent de zéro.");
  }
  assertRecord(details);

  const itemRef = doc(db, "stock", itemId);
  const movementRef = doc(collection(db, "mouvements_stock"));
  const movementModel = getModelDefinition("mouvements_stock");
  if (!movementModel?.numberPrefix || !movementModel.firestoreCollection) {
    throw new Error("Le modèle de numérotation des mouvements de stock est introuvable.");
  }
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", `${movementModel.firestoreCollection}-${year}`);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists()) throw new Error(`La pièce de stock ${itemId} n’existe plus.`);
    const counterSnapshot = await transaction.get(counterRef);

    const currentQuantity = Number(snapshot.data().quantity);
    if (!Number.isFinite(currentQuantity)) {
      throw new TypeError(`La quantité en stock de la pièce ${itemId} est invalide.`);
    }
    const nextQuantity = currentQuantity + quantityChange;
    if (nextQuantity < 0) {
      throw new RangeError(`Stock insuffisant pour la pièce ${snapshot.data().designation || itemId}.`);
    }

    const counterValue = counterSnapshot.exists() ? Number(counterSnapshot.data().value) : 0;
    if (!Number.isSafeInteger(counterValue) || counterValue < 0) {
      throw new TypeError(`Le compteur de numérotation ${movementModel.firestoreCollection}-${year} est invalide.`);
    }
    const sequence = counterValue + 1;
    if (!Number.isSafeInteger(sequence)) {
      throw new RangeError(`Le compteur de numérotation ${movementModel.firestoreCollection}-${year} a atteint sa limite.`);
    }
    const number = `${movementModel.numberPrefix}-${year}-${String(sequence).padStart(4, "0")}`;
    const movement = createModelRecord("mouvements_stock", {
      ...details,
      number,
      reference: number,
      itemId,
      itemReference: snapshot.data().reference || "",
      itemDesignation: snapshot.data().designation || "",
      movementType: quantityChange > 0 ? "Entrée" : "Sortie",
      quantity: Math.abs(quantityChange),
      quantityBefore: currentQuantity,
      quantityAfter: nextQuantity,
      unit: snapshot.data().unit || "unité",
      date: details.date || new Date().toISOString().slice(0, 10),
    });

    transaction.set(counterRef, { value: sequence, updatedAt: serverTimestamp() }, { merge: true });
    transaction.update(itemRef, {
      quantity: nextQuantity,
      updatedAt: serverTimestamp(),
    });
    transaction.set(movementRef, {
      ...movement,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return itemId;
}

/** Supprime une fiche par son identifiant. */
export async function deleteRecord(collectionName, recordId) {
  assertCollection(collectionName);
  if (!recordId) throw new TypeError("Un identifiant de document est requis.");

  await deleteDoc(doc(db, collectionName, recordId));
  return recordId;
}

function getValidatedFile(file, allowedTypes, maxBytes, fallbackType = "") {
  if (!file || typeof file !== "object" || typeof file.name !== "string") {
    throw new TypeError("Sélectionnez un fichier valide.");
  }
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  const contentType = file.type || fallbackType || DOCUMENT_MIME_TYPES[extension] || "";
  if (!allowedTypes.has(contentType)) {
    throw new TypeError("Format non autorisé. Vérifiez le type de fichier.");
  }
  if (file.size > maxBytes) {
    throw new RangeError(`Le fichier dépasse la limite autorisée de ${Math.floor(maxBytes / (1024 * 1024))} Mo.`);
  }
  return contentType;
}

function uniqueStorageName(fileName) {
  const safeName = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-100);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName || "file"}`;
}

async function uploadToStorage(file, path, contentType) {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType,
    customMetadata: { originalName: file.name },
  });
  const downloadURL = await getDownloadURL(snapshot.ref);
  return {
    name: file.name,
    path: snapshot.ref.fullPath,
    downloadURL,
    contentType,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

/** Upload un PDF, fichier Word ou Excel et lie ses métadonnées à la fiche client. */
export async function uploadClientAttachment(clientId, file) {
  if (!clientId) throw new TypeError("Un identifiant de client est requis.");
  const contentType = getValidatedFile(file, new Set(Object.values(DOCUMENT_MIME_TYPES)), MAX_DOCUMENT_BYTES);
  const metadata = await uploadToStorage(
    file,
    `clients/${clientId}/attachments/${uniqueStorageName(file.name)}`,
    contentType,
  );
  try {
    await updateDoc(doc(db, "clients", clientId), {
      attachments: arrayUnion(metadata),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Le fichier a été envoyé, mais son lien n'a pas pu être enregistré sur la fiche client.", error);
    throw new Error("Fichier envoyé dans Storage, mais impossible de le lier à la fiche client.", { cause: error });
  }
  return metadata;
}

/** Upload un plan, PV ou document technique et le lie à un ascenseur. */
export async function uploadElevatorAttachment(elevatorId, file) {
  if (!elevatorId) throw new TypeError("Un identifiant d’ascenseur est requis.");
  const contentType = getValidatedFile(file, new Set(Object.values(DOCUMENT_MIME_TYPES)), MAX_DOCUMENT_BYTES);
  const metadata = await uploadToStorage(
    file,
    `ascenseurs/${elevatorId}/attachments/${uniqueStorageName(file.name)}`,
    contentType,
  );
  try {
    await updateDoc(doc(db, "ascenseurs", elevatorId), {
      attachments: arrayUnion(metadata),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Le fichier a été envoyé, mais son lien n'a pas pu être enregistré sur l’ascenseur.", error);
    throw new Error("Fichier envoyé dans Storage, mais impossible de le lier à la fiche de l’ascenseur.", { cause: error });
  }
  return metadata;
}

/** Upload une preuve PDF ou image et rattache ses métadonnées à un paiement. */
export async function uploadPaymentProof(paymentId, file) {
  if (!paymentId) throw new TypeError("Un identifiant de paiement est requis.");
  const extension = file?.name?.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  const fallbackType = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[extension];
  const contentType = getValidatedFile(file, PAYMENT_PROOF_MIME_TYPES, MAX_DOCUMENT_BYTES, fallbackType);
  const metadata = await uploadToStorage(
    file,
    `payments/${paymentId}/proofs/${uniqueStorageName(file.name)}`,
    contentType,
  );
  try {
    await updateDoc(doc(db, "paiements", paymentId), {
      proofFiles: arrayUnion(metadata),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("La preuve a été envoyée, mais son lien n'a pas pu être enregistré sur le paiement.", error);
    throw new Error("Preuve envoyée dans Storage, mais impossible de la lier au paiement.", { cause: error });
  }
  return metadata;
}

/** Upload ou remplace le logo de l'entreprise dans Firebase Storage. */
export async function uploadCompanyLogo(file) {
  const contentType = getValidatedFile(file, LOGO_MIME_TYPES, MAX_LOGO_BYTES);
  return uploadToStorage(file, "company-assets/logo", contentType);
}

export const companySettingsService = {
  get: () => getRecord("settings", "company"),
  subscribe(onSettings, onError) {
    if (typeof onSettings !== "function") throw new TypeError("Un callback de réception des paramètres est requis.");
    return onSnapshot(
      doc(db, "settings", "company"),
      (snapshot) => onSettings(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
      onError,
    );
  },
  async save(settings) {
    assertRecord(settings);
    await setDoc(doc(db, "settings", "company"), {
      ...settings,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },
  uploadLogo: uploadCompanyLogo,
};

function collectionMethods(collectionName) {
  return {
    create: (record) => createRecord(collectionName, record),
    get: (recordId) => getRecord(collectionName, recordId),
    list: () => listRecords(collectionName),
    subscribe: (onRecords, onError) => subscribeRecords(collectionName, onRecords, onError),
    update: (recordId, changes) => updateRecord(collectionName, recordId, changes),
    remove: (recordId) => deleteRecord(collectionName, recordId),
  };
}

export const clientsService = collectionMethods("clients");
export const sitesService = collectionMethods("sites");
export const ascenseursService = collectionMethods("ascenseurs");
export const documentsService = collectionMethods("documents");
export const paiementsService = collectionMethods("paiements");
export const contratsService = collectionMethods("contrats");
export const interventionsService = collectionMethods("interventions");
export const commandesService = collectionMethods("commandes");
export const bonsService = collectionMethods("commandes");
export const mouvementsStockService = collectionMethods("mouvements_stock");
export const devisService = collectionMethods("devis");
export const facturesService = collectionMethods("factures");
export const stockService = collectionMethods("stock");
export const equipeService = collectionMethods("equipe");
