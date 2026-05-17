import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { CommunicationSummary } from '../types';

export function useCommunication() {
  const [data, setData] = useState<CommunicationSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    api.communication.list()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
