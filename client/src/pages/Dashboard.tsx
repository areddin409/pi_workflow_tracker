import { useState } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { useContactSchedule } from '../hooks/useContactSchedule';
import StatCard from '../components/StatCard';
import type { ContactSchedule } from '../types';

type ScheduleFilter = 'due_today' | 'due_this_week' | 'due_this_month';

const PHASE_LABELS: Record<string, string> = {
  file_setup: 'File Setup',
  treating: 'Treating',
  demand_drafting: 'Demand Draft',
  demand_sent: 'Demand Sent',
  negotiations: 'Negotiations',
};

const SENTIMENT_COLORS: Record<string, string> = {
  negative: 'bg-red-100 text-red-700',
  neutral: 'bg-yellow-100 text-yellow-700',
  positive: 'bg-green-100 text-green-700',
};

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  initial_intro: 'Initial Intro',
  treating_checkin: 'Treating Check-in',
  monthly_followup: 'Monthly Follow-up',
};

function daysOverdue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

export default function Dashboard() {
  const { data, loading } = useDashboard();
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('due_today');
  const { data: scheduleData } = useContactSchedule({ [scheduleFilter]: true });

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!data) return <div className="p-6 text-red-500">Failed to load dashboard.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          label="Overdue Tasks"
          value={data.overdueTasks}
          highlight={data.overdueTasks > 0 ? 'red' : undefined}
        />
        <StatCard
          label="Due Today"
          value={data.dueToday}
          highlight={data.dueToday > 0 ? 'yellow' : undefined}
        />
        <StatCard label="Open Tasks" value={data.openTasks} />
        <StatCard label="Total Cases" value={data.totalCases} />
        <StatCard
          label="Contact Rate"
          value={`${data.contactRate}%`}
          highlight={data.contactRate === 100 ? 'green' : 'yellow'}
        />
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-2 gap-6">
        {/* Overdue Tasks list */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Overdue Tasks</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {data.overdueTasksList.length === 0 ? (
              <li className="px-5 py-4 text-sm text-gray-400">No overdue tasks</li>
            ) : (
              data.overdueTasksList.map(task => (
                <li key={task.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.client_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{task.title}</p>
                  </div>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    {task.due_date ? `${daysOverdue(task.due_date)}d overdue` : 'overdue'}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Contact Schedule */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Contact Schedule</h2>
            <div className="flex gap-1">
              {(['due_today', 'due_this_week', 'due_this_month'] as ScheduleFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setScheduleFilter(f)}
                  className={`text-xs px-2 py-1 rounded ${
                    scheduleFilter === f
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {f === 'due_today' ? 'Today' : f === 'due_this_week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {(scheduleData ?? []).length === 0 ? (
              <li className="px-5 py-4 text-sm text-gray-400">No contacts scheduled</li>
            ) : (
              (scheduleData ?? []).map((cs: ContactSchedule) => {
                const overdueDays = daysOverdue(cs.due_date);
                return (
                  <li key={cs.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cs.client_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {SCHEDULE_TYPE_LABELS[cs.schedule_type] ?? cs.schedule_type}
                      </p>
                    </div>
                    {overdueDays > 0 ? (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        {overdueDays}d overdue
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-gray-400">{cs.due_date}</span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>

      {/* Today's Focus */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Today's Focus</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {data.todaysFocus.length === 0 ? (
            <li className="px-5 py-4 text-sm text-gray-400">Nothing urgent today</li>
          ) : (
            data.todaysFocus.map((item, i) => (
              <li key={`${item.type}-${item.id}-${i}`} className="px-5 py-3 flex items-center gap-3">
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                    item.urgency === 1 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {item.urgency === 1 ? 'Urgent' : 'Today'}
                </span>
                <span className="shrink-0 text-xs text-gray-400 capitalize">
                  {item.type.replace('_', ' ')}
                </span>
                <span className="text-sm font-medium text-gray-900">{item.client_name}</span>
                <span className="text-sm text-gray-600 truncate">— {item.label}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* At-Risk Clients */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">At-Risk Clients</h2>
        </div>
        {data.atRiskClients.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No at-risk clients</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-2 text-left font-medium">Client</th>
                <th className="px-5 py-2 text-left font-medium">Sentiment</th>
                <th className="px-5 py-2 text-left font-medium">Next Contact Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.atRiskClients.map(client => (
                <tr key={client.case_id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{client.client_name}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        SENTIMENT_COLORS[client.sentiment]
                      }`}
                    >
                      {client.sentiment}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {client.next_contact_due ?? 'None scheduled'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
