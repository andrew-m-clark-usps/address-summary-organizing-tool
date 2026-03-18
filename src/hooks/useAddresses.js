import { useState, useEffect, useCallback } from 'react';
import { getAddresses, addAddress, updateAddress, deleteAddress } from '../services/addressService';
import { SAMPLE_ADDRESSES } from '../utils/constants';

export const useAddresses = () => {
  const [addresses, setAddresses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const pageSize = 50;

  const load = useCallback(async (p=1) => {
    setLoading(true);
    try {
      const result = await getAddresses(p, pageSize);
      if (result.total === 0) {
        // Seed with sample data
        const { saveAddresses } = await import('../services/addressService');
        await saveAddresses(SAMPLE_ADDRESSES);
        const r2 = await getAddresses(p, pageSize);
        setAddresses(r2.data);
        setTotal(r2.total);
      } else {
        setAddresses(result.data);
        setTotal(result.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const add = async (addr) => { await addAddress(addr); load(page); };
  const update = async (id, u) => { await updateAddress(id, u); load(page); };
  const del = async (id) => { await deleteAddress(id); load(page); };

  return { addresses, total, page, setPage, pageSize, loading, add, update, del, reload: load };
};
