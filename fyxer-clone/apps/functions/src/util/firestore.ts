import * as admin from 'firebase-admin';
import { getApp, initializeApp, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let app: App;
try { app = getApp(); } catch { app = initializeApp(); }
export const db = getFirestore(app);
export const FieldValue = admin.firestore.FieldValue;

