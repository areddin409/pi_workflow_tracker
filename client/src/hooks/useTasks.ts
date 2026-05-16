import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Task } from '../types';

export function useTasks(params?: Record<string, string | boolean | number>) {
  const [data, setData] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.tasks.list(params)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = () => {
    setLoading(true);
    api.tasks.list(params).then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };

  return { data, loading, error, refetch };
}
