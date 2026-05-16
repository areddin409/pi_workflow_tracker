import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ContactSchedule } from '../types';

type ScheduleParams = {
  overdue?: boolean;
  due_today?: boolean;
  due_this_week?: boolean;
  due_this_month?: boolean;
};

export function useContactSchedule(params?: ScheduleParams) {
  const [data, setData] = useState<ContactSchedule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    setLoading(true);
    api.contactSchedule
      .list(params)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return { data, loading, error };
}
