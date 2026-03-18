import localforage from 'localforage';

const store = localforage.createInstance({ name: 'usps_addresses' });

export const getAddresses = async (page=1, pageSize=50) => {
  const all = await store.getItem('records') || [];
  const start = (page-1)*pageSize;
  return { data: all.slice(start, start+pageSize), total: all.length, page, pageSize };
};

export const saveAddresses = async (records) => {
  await store.setItem('records', records);
};

export const addAddress = async (address) => {
  const all = await store.getItem('records') || [];
  const newAddr = { ...address, id: Date.now() };
  all.push(newAddr);
  await store.setItem('records', all);
  return newAddr;
};

export const updateAddress = async (id, updates) => {
  const all = await store.getItem('records') || [];
  const idx = all.findIndex(r => r.id === id);
  if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; await store.setItem('records', all); }
};

export const deleteAddress = async (id) => {
  const all = await store.getItem('records') || [];
  await store.setItem('records', all.filter(r => r.id !== id));
};

export const clearAddresses = async () => {
  await store.removeItem('records');
};
