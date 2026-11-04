import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

const COLLECTIONS = [
  "clients",
  "documents",
  "paiements",
  "contrats",
  "interventions",
  "commandes",
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

  const reference = await addDoc(collection(db, collectionName), {
    ...record,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return reference.id;
}

/** Récupère une fiche par son identifiant ou null si elle n'existe pas. */
export async function getRecord(collectionName, recordId) {
  assertCollection(collectionName);
  if (!recordId) throw new TypeError("Un identifiant de document est requis.");

  const snapshot = await getDoc(doc(db, collectionName, recordId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Liste les fiches d'une collection. */
export async function listRecords(collectionName) {
  assertCollection(collectionName);

  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

/** Écoute les changements d'une collection et retourne la fonction de désabonnement. */
export function subscribeRecords(collectionName, onRecords, onError) {
  assertCollection(collectionName);
  if (typeof onRecords !== "function") {
    throw new TypeError("Un callback de réception des données est requis.");
  }

  return onSnapshot(
    collection(db, collectionName),
    (snapshot) => onRecords(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
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

/** Ajuste atomique du stock, sans autoriser une sortie supérieure à la quantité disponible. */
export async function updateStockMovement(itemId, quantityChange) {
  if (!itemId) throw new TypeError("Un identifiant de pièce est requis.");
  if (!Number.isFinite(quantityChange) || quantityChange === 0) {
    throw new TypeError("La variation de stock doit être un nombre fini différent de zéro.");
  }

  const itemRef = doc(db, "stock", itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists()) throw new Error(`La pièce de stock ${itemId} n’existe plus.`);

    const currentQuantity = Number(snapshot.data().quantity);
    if (!Number.isFinite(currentQuantity)) {
      throw new TypeError(`La quantité en stock de la pièce ${itemId} est invalide.`);
    }
    if (currentQuantity + quantityChange < 0) {
      throw new RangeError(`Stock insuffisant pour la pièce ${snapshot.data().designation || itemId}.`);
    }

    transaction.update(itemRef, {
      quantity: increment(quantityChange),
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
export const documentsService = collectionMethods("documents");
export const paiementsService = collectionMethods("paiements");
export const contratsService = collectionMethods("contrats");
export const interventionsService = collectionMethods("interventions");
export const commandesService = collectionMethods("commandes");
export const stockService = collectionMethods("stock");
export const equipeService = collectionMethods("equipe");
