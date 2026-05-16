import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Case } from '../types';

export function useCases(params?: { include_closed?: boolean }) {
  const [data, setData] = useState<Case[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.cases.list(params)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.include_closed]);

  const refetch = () => {
    setLoading(true);
    api.cases.list(params).then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };

  return { data, loading, error, refetch };
}
