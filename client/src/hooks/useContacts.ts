import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Contact } from '../types';

export function useContacts(params?: Record<string, string | boolean>) {
  const [data, setData] = useState<Contact[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.contacts.list(params)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = () => {
    setLoading(true);
    api.contacts.list(params).then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };

  return { data, loading, error, refetch };
}
