import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { useContactSchedule } from '../hooks/useContactSchedule';
import type { ContactSchedule, Phase } from '../types';

type ScheduleFilter = 'due_today' | 'due_this_week' | 'due_this_month';
type CardId = 'overdue' | 'today' | 'open' | 'cases' | 'contact' | null;

const SENTIMENT_COLORS: Record<string, string> = {
  negative: 'bg-red-100 text-red-700',
  at_risk: 'bg-red-100 text-red-700',
  neutral: 'bg-yellow-100 text-yellow-700',
  positive: 'bg-green-100 text-green-700',
};

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  initial_intro: 'Initial Intro',
  treating_checkin: 'Treating Check-in',
  monthly_followup: 'Monthly Follow-up',
};

const PHASE_LABELS: Record<Phase, string> = {
  file_setup: 'File Setup',
  treating: 'Treating',
  demand_drafting: 'Demand Drafting',
  demand_sent: 'Demand Sent',
  negotiations: 'Negotiations',
  closed: 'Closed',
};

const PHASE_COLORS: Record<string, string> = {
  file_setup: 'text-indigo-600',
  treating: 'text-cyan-600',
  demand_drafting: 'text-amber-600',
  demand_sent: 'text-gray-500',
  negotiations: 'text-green-600',
};

const OPEN_PHASES: Phase[] = ['file_setup', 'treating', 'demand_drafting', 'demand_sent', 'negotiations'];

function daysOverdue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export default function Dashboard() {
  const { data, loading } = useDashboard();
  const navigate = useNavigate();
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('due_today');
  const { data: scheduleData, error: scheduleError } = useContactSchedule({ [scheduleFilter]: true });
  const [activeCard, setActiveCard] = useState<CardId>(null);
  const [activePhase, setActivePhase] = useState<string | null>(null);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!data) return <div className="p-6 text-red-500">Failed to load dashboard.</div>;

  const scheduleItems = scheduleData ?? [];

  const toggleCard = (id: CardId) => {
    if (activeCard === id) { setActiveCard(null); setActivePhase(null); }
    else { setActiveCard(id); setActivePhase(null); }
  };

  const togglePhase = (phase: string) => {
    setActivePhase(activePhase === phase ? null : phase);
  };

  const cardClass = (id: CardId) =>
    `rounded-lg border-2 p-3 text-center cursor-pointer transition-all ${
      activeCard === id
        ? 'border-blue-500 bg-blue-50 shadow-md -translate-y-0.5'
        : 'border-gray-200 bg-white hover:border-gray-300'
    }`;

  const phaseTileClass = (phase: string) =>
    `p-2.5 text-center cursor-pointer transition-colors rounded ${
      activePhase === phase ? 'bg-blue-50' : 'hover:bg-gray-50'
    }`;

  const contacted = data.totalCases - (data.contactsNeedingContact?.length ?? 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className={cardClass('overdue')} onClick={() => toggleCard('overdue')}>
          <div className="text-2xl font-bold text-red-500">{data.overdueTasks}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Overdue Tasks</div>
        </div>
        <div className={cardClass('today')} onClick={() => toggleCard('today')}>
          <div className="text-2xl font-bold text-amber-500">{data.dueToday}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Due Today</div>
        </div>
        <div className={cardClass('open')} onClick={() => toggleCard('open')}>
          <div className="text-2xl font-bold text-gray-900">{data.openTasks}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Open Tasks</div>
        </div>
        <div className={cardClass('cases')} onClick={() => toggleCard('cases')}>
          <div className="text-2xl font-bold text-gray-900">{data.totalCases}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Total Cases</div>
        </div>
        <div className={cardClass('contact')} onClick={() => toggleCard('contact')}>
          <div className="text-2xl font-bold text-amber-500">{data.contactRate}%</div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Contact Rate</div>
          <div className="text-xs text-amber-700 mt-1">{contacted} of {data.totalCases} contacted</div>
          <div className="mt-1.5 bg-gray-200 rounded h-1 overflow-hidden">
            <div style={{ width: `${data.contactRate}%` }} className="h-full bg-amber-500 rounded" />
          </div>
        </div>
      </div>

      {/* ── Expandable detail panel ── */}
      {activeCard && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">

          {/* Overdue Tasks */}
          {activeCard === 'overdue' && (
            <>
              <div className="px-4 py-2.5 bg-red-50 border-b border-gray-200">
                <span className="text-sm font-semibold text-red-600">Overdue Tasks ({data.overdueTasks})</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {data.overdueTasksList.length === 0 ? (
                  <li className="px-4 py-4 text-sm text-gray-400">No overdue tasks</li>
                ) : data.overdueTasksList.map(task => (
                  <li key={task.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{task.client_name}</p>
                      <p className="text-xs text-gray-500">{task.title}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {task.due_date ? `${daysOverdue(task.due_date)}d overdue` : 'overdue'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Due Today */}
          {activeCard === 'today' && (
            <>
              <div className="px-4 py-2.5 bg-amber-50 border-b border-gray-200">
                <span className="text-sm font-semibold text-amber-700">Due Today ({data.dueToday})</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {data.dueToday === 0 ? (
                  <li className="px-4 py-4 text-sm text-gray-400">Nothing due today</li>
                ) : (
                  data.todaysFocus.filter(f => f.type === 'task' && f.urgency === 2).map(item => (
                    <li key={item.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.client_name}</p>
                        <p className="text-xs text-gray-500">{item.label}</p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}

          {/* Open Tasks — phase drill-down */}
          {activeCard === 'open' && (
            <>
              <div className="px-4 py-2.5 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-900">
                  Open Tasks by Phase ({data.openTasks}) — click a phase to see tasks
                </span>
              </div>
              <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `repeat(${OPEN_PHASES.length}, 1fr)` }}>
                {OPEN_PHASES.map((phase, i) => {
                  const phaseData = data.openTasksByPhase?.[phase];
                  return (
                    <div
                      key={phase}
                      onClick={() => togglePhase(phase)}
                      className={`${phaseTileClass(phase)} ${i < OPEN_PHASES.length - 1 ? 'border-r border-gray-100' : ''}`}
                    >
                      <div className={`text-xl font-bold ${PHASE_COLORS[phase] ?? 'text-gray-700'}`}>
                        {phaseData?.count ?? 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{PHASE_LABELS[phase]}</div>
                    </div>
                  );
                })}
              </div>
              {activePhase && data.openTasksByPhase?.[activePhase] && (
                <div className="px-4 py-3 bg-gray-50">
                  <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${PHASE_COLORS[activePhase]}`}>
                    {PHASE_LABELS[activePhase as Phase]}
                  </div>
                  <ul className="space-y-1.5">
                    {data.openTasksByPhase[activePhase].tasks.map((t, idx) => (
                      <li key={idx} className="flex items-center justify-between text-sm border-b border-gray-100 pb-1">
                        <span className="font-medium text-gray-900">{t.client_name}</span>
                        <span className="text-gray-500 truncate ml-3">— {t.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Total Cases — phase drill-down */}
          {activeCard === 'cases' && (
            <>
              <div className="px-4 py-2.5 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-900">
                  Active Cases by Phase ({data.totalCases}) — click a phase to see clients
                </span>
              </div>
              <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `repeat(${OPEN_PHASES.length}, 1fr)` }}>
                {OPEN_PHASES.map((phase, i) => {
                  const phaseData = data.casesByPhase?.[phase];
                  return (
                    <div
                      key={phase}
                      onClick={() => togglePhase(phase)}
                      className={`${phaseTileClass(phase)} ${i < OPEN_PHASES.length - 1 ? 'border-r border-gray-100' : ''}`}
                    >
                      <div className={`text-xl font-bold ${PHASE_COLORS[phase] ?? 'text-gray-700'}`}>
                        {phaseData?.count ?? 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{PHASE_LABELS[phase]}</div>
                    </div>
                  );
                })}
              </div>
              {activePhase && data.casesByPhase?.[activePhase] && (
                <div className="px-4 py-3 bg-gray-50">
                  <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${PHASE_COLORS[activePhase]}`}>
                    {PHASE_LABELS[activePhase as Phase]}
                  </div>
                  <ul className="space-y-1.5">
                    {data.casesByPhase[activePhase].cases.map(c => (
                      <li key={c.case_id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-1">
                        <span className="font-medium text-gray-900">{c.client_name}</span>
                        <span className="text-gray-500">{c.attorney}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Contact Rate */}
          {activeCard === 'contact' && (
            <>
              <div className="px-4 py-2.5 bg-amber-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-amber-700">
                  Contact Rate — {contacted} of {data.totalCases} contacted ({data.contactRate}%)
                </span>
                <button onClick={() => navigate('/communication')} className="text-xs text-blue-600 hover:underline">
                  View Communication Hub →
                </button>
              </div>
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="bg-gray-200 rounded h-2 overflow-hidden">
                  <div style={{ width: `${data.contactRate}%` }} className="h-full bg-gradient-to-r from-green-500 to-amber-500 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-2">
                <div className="px-4 py-3 border-r border-gray-100">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">
                    Completed ({contacted})
                  </p>
                  <p className="text-xs text-gray-400 italic">See Communication Hub for full list</p>
                </div>
                <div className="px-4 py-3 bg-red-50">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
                    Needs Contact ({data.contactsNeedingContact?.length ?? 0})
                  </p>
                  <ul className="space-y-1.5">
                    {(data.contactsNeedingContact ?? []).map(c => (
                      <li key={c.case_id} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-900">{c.client_name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.days_overdue > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {c.days_overdue > 0 ? `${c.days_overdue}d overdue` : 'Due soon'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Existing two-column section ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Contact Schedule</h2>
            <div className="flex gap-1">
              {(['due_today', 'due_this_week', 'due_this_month'] as ScheduleFilter[]).map(f => (
                <button key={f} onClick={() => setScheduleFilter(f)}
                  className={`text-xs px-2 py-1 rounded ${scheduleFilter === f ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {f === 'due_today' ? 'Today' : f === 'due_this_week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {scheduleError ? (
              <li className="px-4 py-4 text-sm text-red-500">Failed to load contact schedule</li>
            ) : scheduleItems.length === 0 ? (
              <li className="px-4 py-4 text-sm text-gray-400">No contacts scheduled</li>
            ) : scheduleItems.map((cs: ContactSchedule) => {
              const od = daysOverdue(cs.due_date);
              return (
                <li key={cs.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{cs.client_name}</p>
                    <p className="text-xs text-gray-500">{SCHEDULE_TYPE_LABELS[cs.schedule_type] ?? cs.schedule_type}</p>
                  </div>
                  {od > 0 ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{od}d overdue</span>
                  ) : (
                    <span className="text-xs text-gray-400">{formatDate(cs.due_date)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">At-Risk Clients</h2>
          </div>
          {data.atRiskClients.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-400">No at-risk clients</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left font-medium">Client</th>
                  <th className="px-4 py-2 text-left font-medium">Sentiment</th>
                  <th className="px-4 py-2 text-left font-medium">Next Contact Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.atRiskClients.map(client => (
                  <tr key={client.case_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{client.client_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SENTIMENT_COLORS[client.sentiment] ?? 'bg-gray-100 text-gray-600'}`}>
                        {client.sentiment}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {client.next_contact_due ? formatDate(client.next_contact_due) : 'None scheduled'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Today's Focus ── */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Today's Focus</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {data.todaysFocus.length === 0 ? (
            <li className="px-4 py-4 text-sm text-gray-400">Nothing urgent today</li>
          ) : data.todaysFocus.map(item => (
            <li key={`${item.type}-${item.id}`} className="px-4 py-3 flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.urgency === 1 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {item.urgency === 1 ? 'Urgent' : 'Today'}
              </span>
              <span className="text-xs text-gray-400 capitalize">{item.type.replace(/_/g, ' ')}</span>
              <span className="text-sm font-medium text-gray-900">{item.client_name}</span>
              <span className="text-sm text-gray-600 truncate">— {item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
