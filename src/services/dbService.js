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
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from "firebase/storage";
import { auth, db, storage } from "../firebase";
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
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_CLIENT_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_RECORD_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const STORAGE_UPLOAD_TIMEOUT_MS = 60 * 1000;
const CLIENT_DOCUMENT_CATEGORIES = new Set([
  "contrat",
  "devis",
  "facture",
  "preuve de paiement",
  "plan",
  "pv de réception",
  "carnet d'entretien",
  "autre",
]);
const ATTACHMENT_COLLECTIONS = new Set([
  "clients",
  "contrats",
  "devis",
  "factures",
  "commandes",
  "paiements",
  "interventions",
  "ascenseurs",
  "stock",
  "equipe",
]);
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
      currency: invoice.currency || record.currency || "MAD",
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
    .slice(-120);
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName || "file"}`;
}

async function uploadToStorage(file, path, contentType, onProgress, signal) {
  if (!auth.currentUser) {
    const error = new Error("Vous devez être connecté pour envoyer un fichier.");
    error.code = "auth/not-authenticated";
    throw error;
  }
  if (signal?.aborted) {
    const error = new Error("L’envoi a été annulé.");
    error.code = "storage/canceled";
    throw error;
  }

  const storageRef = ref(storage, path);
  const metadata = {
    contentType,
    customMetadata: { originalName: file.name },
  };
  let snapshot;
  if (typeof onProgress === "function" || signal) {
    snapshot = await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, metadata);
      let settled = false;
      let unsubscribe = () => {};
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        signal?.removeEventListener("abort", cancelUpload);
        callback(value);
      };
      const cancelUpload = () => {
        const error = new Error("L’envoi a été annulé.");
        error.code = "storage/canceled";
        finish(reject, error);
        task.cancel();
      };
      const timeoutId = setTimeout(() => {
        const error = new Error(`L’envoi n’a pas progressé après ${STORAGE_UPLOAD_TIMEOUT_MS / 1000} secondes.`);
        error.code = "storage/upload-timeout";
        finish(reject, error);
        task.cancel();
      }, STORAGE_UPLOAD_TIMEOUT_MS);

      signal?.addEventListener("abort", cancelUpload, { once: true });
      if (signal?.aborted) {
        cancelUpload();
        return;
      }
      unsubscribe = task.on(
        "state_changed",
        (state) => onProgress?.(state.totalBytes ? state.bytesTransferred / state.totalBytes : 0),
        (error) => finish(reject, error),
        () => finish(resolve, task.snapshot),
      );
    });
  } else {
    snapshot = await uploadBytes(storageRef, file, metadata);
  }
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

function diagnosticError(error) {
  return {
    code: error?.code || error?.cause?.code || "unknown",
    message: error?.message || String(error),
    ...(error?.serverResponse || error?.cause?.serverResponse
      ? { serverResponse: error?.serverResponse || error?.cause?.serverResponse }
      : {}),
  };
}

/**
 * Vérifie l’authentification, Storage et Firestore avec un fichier temporaire supprimé après le test.
 */
export async function runFirebaseUploadDiagnostic(onStage = () => {}) {
  const user = auth.currentUser;
  const now = Date.now();
  const suffix = Math.random().toString(36).slice(2, 9);
  const path = user ? `diagnostics/${user.uid}/${now}_${suffix}.txt` : "";
  const testDocumentId = `storage-diagnostic-${now}-${suffix}`;
  const file = new File(["TGI Manager Firebase upload diagnostic"], "tgi-storage-diagnostic.txt", {
    type: "text/plain",
  });
  let uploaded = false;
  let firestoreAttempted = false;

  const report = (stage) => {
    onStage(stage);
    if (stage.status === "error") console.error(`[Diagnostic Firebase] ${stage.label}`, stage.error);
    else console.info(`[Diagnostic Firebase] ${stage.label}: ${stage.status.toUpperCase()}`, stage.detail || "");
  };

  console.info("[Diagnostic Firebase] Configuration", {
    bucket: storage.app.options.storageBucket || "(aucun bucket configuré)",
    uid: user?.uid || "(non authentifié)",
    path: path || "(indisponible)",
    size: file.size,
    type: file.type,
  });

  if (!user) {
    const error = { code: "storage/unauthenticated", message: "Aucun utilisateur Firebase authentifié." };
    report({ id: "session", label: "Session Firebase", status: "error", error });
    return;
  }
  report({ id: "session", label: "Session Firebase", status: "ok", detail: `UID ${user.uid}` });

  try {
    const storageRef = ref(storage, path);
    const snapshot = await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: { purpose: "temporary-diagnostic", uid: user.uid },
      });
      let settled = false;
      let unsubscribe = () => {};
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        callback(value);
      };
      const timeoutId = setTimeout(() => {
        const error = new Error(`L’envoi de test a dépassé ${STORAGE_UPLOAD_TIMEOUT_MS / 1000} secondes.`);
        error.code = "storage/upload-timeout";
        finish(reject, error);
        task.cancel();
      }, STORAGE_UPLOAD_TIMEOUT_MS);
      unsubscribe = task.on(
        "state_changed",
        (state) => console.info("[Diagnostic Firebase] Progression Storage", {
          transferred: state.bytesTransferred,
          total: state.totalBytes,
        }),
        (error) => finish(reject, error),
        () => finish(resolve, task.snapshot),
      );
    });
    uploaded = true;
    report({ id: "storage", label: "Envoi Storage", status: "ok", detail: path });

    let downloadURL;
    try {
      downloadURL = await getDownloadURL(snapshot.ref);
      report({ id: "url", label: "URL de téléchargement", status: "ok", detail: "URL reçue" });
    } catch (error) {
      report({ id: "url", label: "URL de téléchargement", status: "error", error: diagnosticError(error) });
      return;
    }

    try {
      firestoreAttempted = true;
      await setDoc(doc(db, "documents", testDocumentId), {
        type: "diagnostic-storage",
        nom: file.name,
        url: downloadURL,
        storagePath: path,
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
      report({ id: "firestore", label: "Enregistrement Firestore", status: "ok", detail: `documents/${testDocumentId}` });
    } catch (error) {
      report({ id: "firestore", label: "Enregistrement Firestore", status: "error", error: diagnosticError(error) });
    }
  } catch (error) {
    report({
      id: "storage",
      label: "Envoi Storage",
      status: "error",
      error: diagnosticError(error),
    });
  } finally {
    const cleanupErrors = [];
    if (firestoreAttempted) {
      try {
        await deleteDoc(doc(db, "documents", testDocumentId));
      } catch (error) {
        cleanupErrors.push({ target: `documents/${testDocumentId}`, error: diagnosticError(error) });
      }
    }
    if (uploaded) {
      try {
        await deleteObject(ref(storage, path));
      } catch (error) {
        cleanupErrors.push({ target: path, error: diagnosticError(error) });
      }
    }
    if (cleanupErrors.length) {
      report({
        id: "cleanup",
        label: "Nettoyage des données de test",
        status: "error",
        error: cleanupErrors,
      });
    } else {
      report({ id: "cleanup", label: "Nettoyage des données de test", status: "ok" });
    }
  }
}

async function ensureUploadWasNotCanceled(signal, path) {
  if (!signal?.aborted) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    console.error(`L’envoi a été annulé, mais le fichier ${path} n’a pas pu être supprimé.`, error);
    throw new Error("L’envoi a été annulé, mais le fichier Storage temporaire n’a pas pu être supprimé.", { cause: error });
  }
  const error = new Error("L’envoi a été annulé.");
  error.code = "storage/canceled";
  throw error;
}

/** Upload un document client dans Storage et lie ses métadonnées à la fiche client. */
export async function uploadClientAttachment(clientId, file, { category = "autre", onProgress, signal } = {}) {
  if (!clientId) throw new TypeError("Un identifiant de client est requis.");
  if (!CLIENT_DOCUMENT_CATEGORIES.has(category)) throw new TypeError("La catégorie de document client est invalide.");
  const contentType = getValidatedFile(file, new Set(Object.values(DOCUMENT_MIME_TYPES)), MAX_CLIENT_DOCUMENT_BYTES);
  if (file.size <= 0) throw new RangeError("Le fichier est vide.");
  const metadata = await uploadToStorage(
    file,
    `clients/${clientId}/documents/${uniqueStorageName(file.name)}`,
    contentType,
    onProgress,
    signal,
  );
  await ensureUploadWasNotCanceled(signal, metadata.path);
  const document = {
    nom: metadata.name,
    url: metadata.downloadURL,
    type: metadata.contentType,
    taille: metadata.size,
    categorie: category,
    dateAjout: new Date().toISOString(),
    path: metadata.path,
  };
  try {
    await updateDoc(doc(db, "clients", clientId), {
      documents: arrayUnion(document),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Le fichier a été envoyé, mais son lien n'a pas pu être enregistré sur la fiche client.", error);
    try {
      await deleteObject(ref(storage, metadata.path));
    } catch (cleanupError) {
      console.error("Le fichier orphelin n’a pas pu être supprimé après l’échec de son association au client.", cleanupError);
    }
    throw new Error("Fichier envoyé dans Storage, mais impossible de le lier à la fiche client.", { cause: error });
  }
  return document;
}

/** Supprime le document client de Storage et ses métadonnées Firestore. */
export async function deleteClientAttachment(clientId, attachment) {
  if (!clientId || !attachment || typeof attachment !== "object") {
    throw new TypeError("Un client et un document valide sont requis pour la suppression.");
  }
  const storagePath = attachment.path;
  const isDocumentPath = storagePath?.startsWith(`clients/${clientId}/documents/`);
  const isLegacyAttachmentPath = storagePath?.startsWith(`clients/${clientId}/attachments/`);
  if (!isDocumentPath && !isLegacyAttachmentPath) {
    throw new TypeError("Le chemin du document client est invalide.");
  }
  const clientRef = doc(db, "clients", clientId);
  const attachmentChanges = {
    ...(isDocumentPath ? { documents: arrayRemove(attachment) } : { attachments: arrayRemove(attachment) }),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(clientRef, attachmentChanges);
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code === "storage/object-not-found") return;
    try {
      await updateDoc(clientRef, {
        ...(isDocumentPath ? { documents: arrayUnion(attachment) } : { attachments: arrayUnion(attachment) }),
        updatedAt: serverTimestamp(),
      });
    } catch (restoreError) {
      console.error("Le fichier n’a pas pu être supprimé et son lien n’a pas pu être restauré sur le client.", restoreError);
      throw new Error("La suppression du fichier a échoué et son lien n’a pas pu être restauré.", { cause: error });
    }
    throw new Error("Le lien du document a été restauré, mais le fichier Storage n’a pas pu être supprimé.", { cause: error });
  }
}

/** Upload une pièce jointe d’un enregistrement ERP pris en charge. */
export async function uploadRecordAttachment(collectionName, recordId, file, {
  category = "autre",
  onProgress,
  fieldName,
  signal,
} = {}) {
  if (!ATTACHMENT_COLLECTIONS.has(collectionName)) {
    throw new TypeError(`Les pièces jointes ne sont pas prises en charge pour ${collectionName}.`);
  }
  if (collectionName === "clients") {
    return uploadClientAttachment(recordId, file, { category, onProgress, signal });
  }
  if (!recordId) throw new TypeError("Un identifiant d’enregistrement est requis.");
  if (!CLIENT_DOCUMENT_CATEGORIES.has(category)) throw new TypeError("La catégorie du document est invalide.");
  const expectedField = collectionName === "paiements" ? "proofFiles" : "attachments";
  if (fieldName && fieldName !== expectedField) {
    throw new TypeError(`Le champ de pièces jointes autorisé pour ${collectionName} est ${expectedField}.`);
  }
  const isPaymentProof = collectionName === "paiements";
  const allowedTypes = isPaymentProof
    ? PAYMENT_PROOF_MIME_TYPES
    : new Set(Object.values(DOCUMENT_MIME_TYPES));
  const paymentFallback = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[file?.name?.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || ""];
  const contentType = getValidatedFile(file, allowedTypes, MAX_RECORD_ATTACHMENT_BYTES, paymentFallback);
  if (file.size <= 0) throw new RangeError("Le fichier est vide.");
  const metadata = await uploadToStorage(
    file,
    `records/${collectionName}/${recordId}/documents/${uniqueStorageName(file.name)}`,
    contentType,
    onProgress,
    signal,
  );
  await ensureUploadWasNotCanceled(signal, metadata.path);
  const attachment = {
    nom: metadata.name,
    url: metadata.downloadURL,
    type: metadata.contentType,
    taille: metadata.size,
    categorie: category,
    dateAjout: metadata.uploadedAt,
    path: metadata.path,
    name: metadata.name,
    downloadURL: metadata.downloadURL,
    contentType: metadata.contentType,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt,
  };
  try {
    await updateDoc(doc(db, collectionName, recordId), {
      [expectedField]: arrayUnion(attachment),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`Le fichier a été envoyé, mais son lien n'a pas pu être enregistré dans ${collectionName}/${recordId}.`, error);
    try {
      await deleteObject(ref(storage, metadata.path));
    } catch (cleanupError) {
      console.error("Le fichier orphelin n’a pas pu être supprimé après l’échec de son association.", cleanupError);
    }
    throw new Error("Fichier envoyé dans Storage, mais impossible de le lier à l’enregistrement.", { cause: error });
  }
  return attachment;
}

/** Supprime les métadonnées et le fichier Storage associé à un enregistrement ERP. */
export async function deleteRecordAttachment(collectionName, recordId, attachment, fieldName) {
  if (!ATTACHMENT_COLLECTIONS.has(collectionName) || collectionName === "clients") {
    if (collectionName === "clients") return deleteClientAttachment(recordId, attachment);
    throw new TypeError(`Les pièces jointes ne sont pas prises en charge pour ${collectionName}.`);
  }
  if (!recordId || !attachment || typeof attachment !== "object") {
    throw new TypeError("Un enregistrement et une pièce jointe valide sont requis pour la suppression.");
  }
  const expectedField = collectionName === "paiements" ? "proofFiles" : "attachments";
  if (fieldName && fieldName !== expectedField) {
    throw new TypeError(`Le champ de pièces jointes autorisé pour ${collectionName} est ${expectedField}.`);
  }
  const storagePath = attachment.path;
  const currentPath = `records/${collectionName}/${recordId}/documents/`;
  const legacyPaths = collectionName === "paiements"
    ? [`payments/${recordId}/proofs/`]
    : collectionName === "ascenseurs"
      ? [`ascenseurs/${recordId}/attachments/`]
      : [];
  const isCurrent = storagePath?.startsWith(currentPath);
  const isLegacy = legacyPaths.some((path) => storagePath?.startsWith(path));
  if (!isCurrent && !isLegacy) throw new TypeError("Le chemin de la pièce jointe est invalide.");
  const recordRef = doc(db, collectionName, recordId);
  const removeField = { [expectedField]: arrayRemove(attachment), updatedAt: serverTimestamp() };
  await updateDoc(recordRef, removeField);
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code === "storage/object-not-found") return;
    try {
      await updateDoc(recordRef, {
        [expectedField]: arrayUnion(attachment),
        updatedAt: serverTimestamp(),
      });
    } catch (restoreError) {
      console.error("Le lien de la pièce jointe n’a pas pu être restauré après l’échec de la suppression Storage.", restoreError);
      throw new Error("La suppression a échoué et le lien de la pièce jointe n’a pas pu être restauré.", { cause: error });
    }
    throw new Error("Le lien de la pièce jointe a été restauré, mais le fichier Storage n’a pas pu être supprimé.", { cause: error });
  }
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
  const contentType = getValidatedFile(file, PAYMENT_PROOF_MIME_TYPES, MAX_RECORD_ATTACHMENT_BYTES, fallbackType);
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
