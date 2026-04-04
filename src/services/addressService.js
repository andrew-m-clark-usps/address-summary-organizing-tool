/**
 * addressService.js
 * User-scoped IndexedDB CRUD via localForage.
 * Each user sees ONLY their own address records.
 */
import localforage from 'localforage';
import { getSession } from './authService';

const db = localforage.createInstance({ name: 'usps_addresses_v2' });

const userKey = () => {
  const s = getSession();
  return s ? `records_${s.username}` : 'records_guest';
};

export const getAddresses = async (page = 1, pageSize = 50) => {
  const all   = (await db.getItem(userKey())) || [];
  const start = (page - 1) * pageSize;
  return { data: all.slice(start, start + pageSize), total: all.length, page, pageSize };
};

export const getAllAddresses = async () => {
  return (await db.getItem(userKey())) || [];
};

export const saveAddresses = async (records) => {
  await db.setItem(userKey(), records);
};

export const addAddress = async (address) => {
  const all  = (await db.getItem(userKey())) || [];
  const rec  = { ...address, id: Date.now(), status: 'draft', submittedAt: new Date().toISOString() };
  all.push(rec);
  await db.setItem(userKey(), all);
  return rec;
};

export const updateAddress = async (id, updates) => {
  const all = (await db.getItem(userKey())) || [];
  const idx = all.findIndex(r => r.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates };
    await db.setItem(userKey(), all);
  }
};

export const deleteAddress = async (id) => {
  const all = (await db.getItem(userKey())) || [];
  await db.setItem(userKey(), all.filter(r => r.id !== id));
};

export const clearAddresses = async () => {
  await db.removeItem(userKey());
};

export const submitForReview = async (ids) => {
  const all = (await db.getItem(userKey())) || [];
  ids.forEach(id => {
    const idx = all.findIndex(r => r.id === id);
    if (idx >= 0) all[idx] = { ...all[idx], status: 'pending', submittedAt: new Date().toISOString() };
  });
  await db.setItem(userKey(), all);
};

export const updateStatus = async (id, status) => {
  await updateAddress(id, { status });
};
