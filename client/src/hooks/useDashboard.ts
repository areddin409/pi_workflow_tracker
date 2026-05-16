import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { DashboardStats } from '../types';

export function useDashboard() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard.get()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const refetch = () => {
    setLoading(true);
    api.dashboard.get().then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };

  return { data, loading, error, refetch };
}
