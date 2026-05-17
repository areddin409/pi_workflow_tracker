import { useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import TaskEditPanel from '../components/TaskEditPanel';
import { api } from '../lib/api';
import type { Task, Priority, TaskStatus, WaitingOn } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function isOverdue(task: Task): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return !!task.due_date && task.due_date < today && task.status !== 'completed';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const PRIORITY_CLASSES: Record<Priority, string> = {
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

const WAITING_ON_CLASSES = 'bg-blue-100 text-blue-700';

// ── Filter options ────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS: Priority[] = ['high', 'medium', 'low'];
const STATUS_OPTIONS: TaskStatus[] = ['pending', 'in_progress', 'waiting', 'completed'];
const WAITING_ON_OPTIONS: Array<Exclude<WaitingOn, null>> = ['client', 'adjuster', 'attorney', 'provider'];

// ── Add-task form default ─────────────────────────────────────────────────────

interface AddTaskForm {
  case_id: string;
  title: string;
  category: string;
  priority: Priority;
  due_date: string;
}

const EMPTY_FORM: AddTaskForm = {
  case_id: '',
  title: '',
  category: '',
  priority: 'medium',
  due_date: '',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Worklist() {
  const { data: tasks, loading, error, refetch } = useTasks();

  // Filters
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAttorney, setFilterAttorney] = useState('');
  const [filterWaitingOn, setFilterWaitingOn] = useState('');

  // Edit panel
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Add-task form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddTaskForm>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;
  if (!tasks) return <div className="p-6 text-gray-500">No data.</div>;

  // Derive unique categories and attorneys for filter dropdowns
  const categories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean) as string[])).sort();
  const attorneys = Array.from(new Set(tasks.map(t => t.attorney).filter(Boolean) as string[])).sort();

  // Apply filters
  const filtered = tasks.filter(task => {
    if (filterPriority && task.priority !== filterPriority) return false;
    if (filterStatus && task.status !== filterStatus) return false;
    if (filterCategory && task.category !== filterCategory) return false;
    if (filterAttorney && task.attorney !== filterAttorney) return false;
    if (filterWaitingOn && task.waiting_on !== filterWaitingOn) return false;
    return true;
  });

  // Handle add task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const caseId = parseInt(addForm.case_id, 10);
    if (!caseId || !addForm.title.trim()) return;
    setAddSaving(true);
    setAddError(null);
    try {
      await api.tasks.create({
        case_id: caseId,
        title: addForm.title.trim(),
        category: addForm.category.trim() || null,
        priority: addForm.priority,
        due_date: addForm.due_date || null,
      });
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
      refetch();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Worklist</h1>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
        >
          {showAddForm ? 'Cancel' : '+ Add Task'}
        </button>
      </div>

      {/* Add-task inline form */}
      {showAddForm && (
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">New Task</h2>
          <form onSubmit={handleAddTask} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Case ID</label>
              <input
                type="number"
                value={addForm.case_id}
                onChange={e => setAddForm(f => ({ ...f, case_id: e.target.value }))}
                required
                placeholder="e.g. 42"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={addForm.title}
                onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                required
                placeholder="Task title"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input
                type="text"
                value={addForm.category}
                onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. records"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={addForm.priority}
                onChange={e => setAddForm(f => ({ ...f, priority: e.target.value as Priority }))}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={addForm.due_date}
                onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={addSaving}
                className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded text-sm disabled:opacity-50"
              >
                {addSaving ? 'Adding…' : 'Add Task'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); setAddError(null); }}
                className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded text-sm text-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
          {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-3 flex flex-wrap gap-3 items-center">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filter</span>

        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterAttorney}
          onChange={e => setFilterAttorney(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Attorneys</option>
          {attorneys.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={filterWaitingOn}
          onChange={e => setFilterWaitingOn(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Waiting On</option>
          {WAITING_ON_OPTIONS.map(w => (
            <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
          ))}
        </select>

        {(filterPriority || filterStatus || filterCategory || filterAttorney || filterWaitingOn) && (
          <button
            onClick={() => {
              setFilterPriority('');
              setFilterStatus('');
              setFilterCategory('');
              setFilterAttorney('');
              setFilterWaitingOn('');
            }}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} of {tasks.length} tasks
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">No tasks match the current filters.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">Priority</th>
                <th className="px-4 py-3 text-left font-medium">Client</th>
                <th className="px-4 py-3 text-left font-medium">Attorney</th>
                <th className="px-4 py-3 text-left font-medium">Task</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Waiting On</th>
                <th className="px-4 py-3 text-left font-medium">Due Date</th>
                <th className="px-4 py-3 text-left font-medium">Days Open</th>
                <th className="px-4 py-3 text-left font-medium">Next Follow-Up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(task => (
                <tr
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                    isOverdue(task) ? 'bg-red-50 hover:bg-red-100' : ''
                  }`}
                >
                  {/* Priority */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PRIORITY_CLASSES[task.priority]}`}>
                      {task.priority}
                    </span>
                  </td>

                  {/* Client */}
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                    {task.client_name ?? '—'}
                  </td>

                  {/* Attorney */}
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {task.attorney ?? '—'}
                  </td>

                  {/* Task title */}
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                    <span className="block truncate">{task.title}</span>
                    {task.category && (
                      <span className="text-xs text-gray-400">{task.category}</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize whitespace-nowrap">
                    {task.status.replace(/_/g, ' ')}
                  </td>

                  {/* Waiting On */}
                  <td className="px-4 py-3">
                    {task.waiting_on ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${WAITING_ON_CLASSES}`}>
                        {task.waiting_on}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>

                  {/* Due Date */}
                  <td className={`px-4 py-3 text-sm whitespace-nowrap ${isOverdue(task) ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                    {formatDate(task.due_date)}
                  </td>

                  {/* Days Open */}
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {daysOpen(task.created_at)}d
                  </td>

                  {/* Next Follow-Up */}
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(task.next_follow_up)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Panel */}
      {selectedTask && (
        <TaskEditPanel
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
