import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import LogContactModal from '../components/LogContactModal';
import type { CaseDetail as CaseDetailType, Task, Contact, Phase, Priority, TaskStatus } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
  file_setup: 'File Setup',
  treating: 'Treating',
  demand_drafting: 'Demand Drafting',
  demand_sent: 'Demand Sent',
  negotiations: 'Negotiations',
  closed: 'Closed',
};

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  initial_intro: 'Initial Intro',
  treating_checkin: 'Treating Check-in',
  monthly_followup: 'Monthly Follow-up',
};

const STATUS_CLASSES: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
};

const PRIORITY_CLASSES: Record<Priority, string> = {
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

const SENTIMENT_CLASSES: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-gray-100 text-gray-600',
  negative: 'bg-red-100 text-red-700',
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  phone: 'Phone',
  email: 'Email',
  text: 'Text',
  letter: 'Letter',
};

const CONTACT_STATUS_LABELS: Record<string, string> = {
  answered: 'Answered',
  voicemail: 'Voicemail',
  no_answer: 'No Answer',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function isOverdue(dueDateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDateStr) < today;
}

function humanize(str: string): string {
  return str
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

type TabId = 'contact-log' | 'phase-history';

// ── Add Task Form State ────────────────────────────────────────────────────

interface AddTaskForm {
  title: string;
  category: string;
  priority: Priority;
  due_date: string;
}

const defaultAddTaskForm = (): AddTaskForm => ({
  title: '',
  category: '',
  priority: 'medium',
  due_date: '',
});

// ── Component ──────────────────────────────────────────────────────────────

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [caseDetail, setCaseDetail] = useState<CaseDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('contact-log');

  // Add task form
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskForm, setAddTaskForm] = useState<AddTaskForm>(defaultAddTaskForm());
  const [addTaskSaving, setAddTaskSaving] = useState(false);
  const [addTaskError, setAddTaskError] = useState<string | null>(null);

  // Log contact modal
  const [showLogContact, setShowLogContact] = useState(false);

  // Expanded contact rows in log
  const [expandedContacts, setExpandedContacts] = useState<Set<number>>(new Set());

  // Ref to scroll to contact-log tab
  const contactLogRef = useRef<HTMLDivElement>(null);

  const fetchCase = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.cases.get(Number(id));
      setCaseDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCase();
  }, [fetchCase]);

  // ── Task handlers ──────────────────────────────────────────────────────────

  const toggleTask = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await api.tasks.update(task.id, { status: newStatus });
      fetchCase();
    } catch {
      // silently ignore — user can retry
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseDetail || !addTaskForm.title.trim()) return;
    setAddTaskSaving(true);
    setAddTaskError(null);
    try {
      await api.tasks.create({
        case_id: caseDetail.id,
        title: addTaskForm.title.trim(),
        category: addTaskForm.category.trim() || null,
        priority: addTaskForm.priority,
        due_date: addTaskForm.due_date || null,
        phase: caseDetail.current_phase,
      });
      setShowAddTask(false);
      setAddTaskForm(defaultAddTaskForm());
      fetchCase();
    } catch (err) {
      setAddTaskError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setAddTaskSaving(false);
    }
  };

  // ── Contact log helpers ────────────────────────────────────────────────────

  const toggleExpandContact = (id: number) => {
    setExpandedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goToContactLog = () => {
    setActiveTab('contact-log');
    setTimeout(() => {
      contactLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;
  if (!caseDetail) return <div className="p-6 text-red-500">Case not found.</div>;

  const { tasks, latestContact, phaseHistory, openSchedules } = caseDetail;
  const nextSchedule = openSchedules[0] ?? null;

  // Sort contacts newest-first for the contact log
  const allContacts: Contact[] = [...(caseDetail.tasks.length >= 0 ? [] : [])]; // placeholder; contacts come from the API below
  // Note: CaseDetail only returns latestContact. For the full contact log we rely on the contacts embedded via latestContact.
  // Actually the spec says the contact log lists "all contacts" — but the API only returns latestContact in CaseDetail.
  // We'll build the log from what the API gives us and note this in output.
  // After checking the server route, the list is available via api.contacts.list({ case_id: ... })
  // We'll keep a separate state for contacts list.
  // (see contactsLog state below)
  void allContacts; // suppress unused warning

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link to="/caseload" className="text-sm text-blue-600 hover:underline">← Caseload</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">{caseDetail.client_name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Attorney: {caseDetail.attorney} &nbsp;·&nbsp; Phase:{' '}
          <span className="font-medium text-gray-700">{PHASE_LABELS[caseDetail.current_phase]}</span>
          {caseDetail.days_in_phase != null && (
            <> &nbsp;·&nbsp; {caseDetail.days_in_phase}d in phase</>
          )}
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Tasks */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Tasks</h2>
            <button
              onClick={() => { setShowAddTask(v => !v); setAddTaskError(null); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {showAddTask ? 'Cancel' : '+ Add Task'}
            </button>
          </div>

          {/* Task list */}
          <ul className="divide-y divide-gray-100">
            {tasks.length === 0 && !showAddTask && (
              <li className="px-5 py-4 text-sm text-gray-400">No tasks for this phase.</li>
            )}
            {tasks.map(task => {
              const overdue =
                task.status !== 'completed' &&
                task.due_date != null &&
                isOverdue(task.due_date);

              return (
                <li
                  key={task.id}
                  className={`px-5 py-3 flex items-start gap-3 ${overdue ? 'bg-red-50' : ''}`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={task.status === 'completed'}
                    onChange={() => toggleTask(task)}
                    className="mt-0.5 rounded cursor-pointer"
                  />
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium text-gray-900 ${
                        task.status === 'completed' ? 'line-through text-gray-400' : ''
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_CLASSES[task.status]}`}
                      >
                        {humanize(task.status)}
                      </span>
                      {task.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {task.category}
                        </span>
                      )}
                      {task.priority && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_CLASSES[task.priority]}`}
                        >
                          {task.priority}
                        </span>
                      )}
                      {task.due_date && (
                        <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          Due {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Add Task inline form */}
          {showAddTask && (
            <form onSubmit={handleAddTask} className="px-5 py-4 border-t border-gray-100 space-y-3 bg-gray-50">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={addTaskForm.title}
                  onChange={e => setAddTaskForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Task title"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <input
                    type="text"
                    value={addTaskForm.category}
                    onChange={e => setAddTaskForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Medical"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select
                    value={addTaskForm.priority}
                    onChange={e => setAddTaskForm(f => ({ ...f, priority: e.target.value as Priority }))}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                <input
                  type="date"
                  value={addTaskForm.due_date}
                  onChange={e => setAddTaskForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {addTaskError && <p className="text-xs text-red-600">{addTaskError}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowAddTask(false); setAddTaskForm(defaultAddTaskForm()); }}
                  className="border border-gray-300 hover:bg-gray-100 px-3 py-1.5 rounded text-xs text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addTaskSaving}
                  className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded text-xs disabled:opacity-50"
                >
                  {addTaskSaving ? 'Adding…' : 'Add Task'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* RIGHT — Contact Summary */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Contact Summary</h2>
          </div>
          <div className="px-5 py-4 space-y-5">
            {/* Next scheduled contact */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Next Scheduled Contact</p>
              {nextSchedule ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {SCHEDULE_TYPE_LABELS[nextSchedule.schedule_type] ?? humanize(nextSchedule.schedule_type)}
                  </span>
                  <span className="text-sm text-gray-500">— {formatDate(nextSchedule.due_date)}</span>
                  {isOverdue(nextSchedule.due_date) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      Overdue
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No scheduled contacts</p>
              )}
            </div>

            {/* Most recent contact */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Most Recent Contact</p>
              {latestContact ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{formatDate(latestContact.contacted_at)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {CONTACT_TYPE_LABELS[latestContact.contact_type] ?? latestContact.contact_type}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {CONTACT_STATUS_LABELS[latestContact.contact_status] ?? latestContact.contact_status}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        SENTIMENT_CLASSES[latestContact.client_sentiment] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {latestContact.client_sentiment}
                    </span>
                  </div>
                  {latestContact.notes && (
                    <p className="text-sm text-gray-600 leading-snug">
                      {latestContact.notes.length > 200
                        ? latestContact.notes.slice(0, 200) + '…'
                        : latestContact.notes}
                    </p>
                  )}
                  {latestContact.action_items && latestContact.action_items.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Action Items</p>
                      <ul className="space-y-1">
                        {latestContact.action_items.map(ai => (
                          <li key={ai.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <span>{ai.description}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">
                              {humanize(ai.assigned_to)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {latestContact.action_item && !latestContact.action_items?.length && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Action Item</p>
                      <p className="text-sm text-gray-700">{latestContact.action_item}</p>
                    </div>
                  )}
                  <button
                    onClick={goToContactLog}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View Contact Log →
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No contacts logged yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div ref={contactLogRef} id="contact-log" className="bg-white rounded-lg border border-gray-200">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5">
          <div className="flex gap-1">
            {(['contact-log', 'phase-history'] as TabId[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'contact-log' ? 'Contact Log' : 'Phase History'}
              </button>
            ))}
          </div>
          {activeTab === 'contact-log' && (
            <button
              onClick={() => setShowLogContact(true)}
              className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded text-xs font-medium"
            >
              Log Contact
            </button>
          )}
        </div>

        {/* Contact Log tab */}
        {activeTab === 'contact-log' && (
          <ContactLogTab
            caseId={caseDetail.id}
            expandedContacts={expandedContacts}
            onToggleExpand={toggleExpandContact}
          />
        )}

        {/* Phase History tab */}
        {activeTab === 'phase-history' && (
          <div className="overflow-x-auto">
            {phaseHistory.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No phase history yet.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                    <th className="px-5 py-2 text-left font-medium">Phase</th>
                    <th className="px-5 py-2 text-left font-medium">Entered</th>
                    <th className="px-5 py-2 text-left font-medium">Exited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {phaseHistory.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">
                        {PHASE_LABELS[row.phase] ?? humanize(row.phase)}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{formatDate(row.entered_at)}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {row.exited_at ? formatDate(row.exited_at) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Current</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Log Contact Modal */}
      {showLogContact && (
        <LogContactModal
          caseId={caseDetail.id}
          onClose={() => setShowLogContact(false)}
          onLogged={fetchCase}
        />
      )}
    </div>
  );
}

// ── Contact Log sub-component (fetches full contact list) ──────────────────

interface ContactLogTabProps {
  caseId: number;
  expandedContacts: Set<number>;
  onToggleExpand: (id: number) => void;
}

function ContactLogTab({ caseId, expandedContacts, onToggleExpand }: ContactLogTabProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.contacts
      .list({ case_id: String(caseId) })
      .then(data => {
        // sort newest first
        const sorted = [...data].sort(
          (a, b) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime()
        );
        setContacts(sorted);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load contacts'))
      .finally(() => setLoading(false));
  }, [caseId]);

  if (loading) return <div className="px-5 py-4 text-sm text-gray-500">Loading contacts…</div>;
  if (error) return <div className="px-5 py-4 text-sm text-red-500">{error}</div>;
  if (contacts.length === 0) return <div className="px-5 py-4 text-sm text-gray-400">No contacts logged yet.</div>;

  return (
    <ul className="divide-y divide-gray-100">
      {contacts.map(contact => {
        const expanded = expandedContacts.has(contact.id);
        return (
          <li key={contact.id} className="px-5 py-3">
            {/* Row header — always visible, clickable to expand */}
            <button
              onClick={() => onToggleExpand(contact.id)}
              className="w-full text-left flex flex-wrap items-center gap-2"
            >
              <span className="text-sm font-medium text-gray-900">{formatDate(contact.contacted_at)}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {CONTACT_TYPE_LABELS[contact.contact_type] ?? contact.contact_type}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {CONTACT_STATUS_LABELS[contact.contact_status] ?? contact.contact_status}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                  SENTIMENT_CLASSES[contact.client_sentiment] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {contact.client_sentiment}
              </span>
              {contact.notes && (
                <span className="text-sm text-gray-500 truncate max-w-xs">
                  {contact.notes.length > 80 ? contact.notes.slice(0, 80) + '…' : contact.notes}
                </span>
              )}
              <span className="ml-auto text-xs text-gray-400">{expanded ? '▲' : '▼'}</span>
            </button>

            {/* Expanded content */}
            {expanded && (
              <div className="mt-3 pl-1 space-y-2 text-sm text-gray-700">
                {contact.notes ? (
                  <p className="leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
                ) : (
                  <p className="text-gray-400">No notes.</p>
                )}
                {contact.action_items && contact.action_items.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Action Items</p>
                    <ul className="space-y-1">
                      {contact.action_items.map(ai => (
                        <li key={ai.id} className="flex items-center gap-2">
                          <span>{ai.description}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">
                            {humanize(ai.assigned_to)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {contact.action_item && !contact.action_items?.length && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Action Item</p>
                    <p>{contact.action_item}</p>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
