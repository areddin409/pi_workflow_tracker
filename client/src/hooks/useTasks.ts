import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { Task } from '../types';

export function useTasks(params?: Record<string, string | boolean>) {
  const [data, setData] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(() => {
    setLoading(true);
    api.tasks.list(params)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]); // stable dep via serialization

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const update = (id: number, body: Partial<Task>) => api.tasks.update(id, body);
  const refetch = fetchTasks;

  return { data, loading, error, refetch, update };
}
