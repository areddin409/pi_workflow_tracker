export type Phase = 'file_setup' | 'treating' | 'demand_drafting' | 'demand_sent' | 'negotiations' | 'closed';
export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'waiting' | 'completed';
export type WaitingOn = 'client' | 'adjuster' | 'attorney' | 'provider' | null;
export type ContactType = 'phone' | 'email' | 'text' | 'letter';
export type ContactStatus = 'answered' | 'voicemail' | 'no_answer';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type ScheduleType = 'initial_intro' | 'treating_checkin' | 'monthly_followup';
export type AssignedTo = 'case_manager' | 'attorney' | 'client' | 'provider' | 'adjuster';
export type ContactAttemptType = 'attempted' | 'not_attempted' | 'completed';
export type FollowUpType = 'none_needed' | 'cm_follow_up' | 'attorney_review' | 'attorney_contact' | 'urgent_escalation';

export interface CommunicationSummary {
  case_id: number;
  client_name: string;
  attorney: string;
  current_phase: Phase;
  date_assigned: string;
  initial_contact_date: string | null;
  last_contact_date: string | null;
  last_attempted: string | null;
  next_contact_due: string | null;
  contact_attempt_type: ContactAttemptType | null;
  contact_status: ContactStatus | null;
  client_sentiment: Sentiment | 'at_risk' | null;
  follow_up_type: FollowUpType | null;
  action_item: string | null;
  is_overdue: boolean;
}

export interface Case {
  id: number;
  client_name: string;
  attorney: string;
  current_phase: Phase;
  date_assigned: string;
  created_at: string;
  days_in_phase?: number;
  case_badge_priority?: Priority;
  latest_sentiment?: Sentiment | 'at_risk' | null;
}

export interface CaseDetail extends Case {
  tasks: Task[];
  latestContact: Contact | null;
  phaseHistory: CasePhaseHistory[];
  openSchedules: ContactSchedule[];
}

export interface CasePhaseHistory {
  id: number;
  case_id: number;
  phase: Phase;
  entered_at: string;
  exited_at: string | null;
}

export interface TaskTemplate {
  id: number;
  phase: Phase;
  title: string;
  priority: Priority;
  sort_order: number;
}

export interface Task {
  id: number;
  case_id: number;
  phase: Phase;
  template_id: number | null;
  category: string | null;
  title: string;
  priority: Priority;
  status: TaskStatus;
  waiting_on: WaitingOn;
  date_assigned: string | null;
  due_date: string | null;
  last_action: string | null;
  next_follow_up: string | null;
  completion_date: string | null;
  notes: string | null;
  created_at: string;
  client_name?: string;
  attorney?: string;
}

export interface Contact {
  id: number;
  case_id: number;
  contacted_at: string;
  last_attempted: string | null;
  next_contact_due: string | null;
  contact_type: ContactType;
  contact_status: ContactStatus;
  client_sentiment: Sentiment;
  follow_up_necessary: boolean;
  notes: string | null;
  action_item: string | null;
  created_at: string;
  client_name?: string;
  action_items?: ContactActionItem[];
}

export interface ContactSchedule {
  id: number;
  case_id: number;
  schedule_type: ScheduleType;
  due_date: string;
  completed_contact_id: number | null;
  completed_at: string | null;
  client_name?: string;
}

export interface ContactActionItem {
  id: number;
  contact_id: number;
  description: string;
  assigned_to: AssignedTo;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface PhaseSettings {
  phase: Phase;
  case_badge_priority: Priority;
  auto_due_offset_days: number | null;
  overdue_threshold_days: number | null;
}

export interface FocusItem {
  type: 'task' | 'contact' | 'action_item';
  id: number;
  label: string;
  client_name: string;
  urgency: number;
}

export interface DashboardStats {
  overdueTasks: number;
  dueToday: number;
  openTasks: number;
  totalCases: number;
  contactRate: number;
  overdueTasksList: Task[];
  contactScheduleList: ContactSchedule[];
  todaysFocus: FocusItem[];
  atRiskClients: Array<{ case_id: number; client_name: string; sentiment: Sentiment; next_contact_due: string | null }>;
  contactsNeedingContact: Array<{ case_id: number; client_name: string; next_contact_due: string | null; days_overdue: number }>;
  openTasksByPhase: Record<string, { count: number; tasks: Array<{ client_name: string; title: string }> }>;
  casesByPhase: Record<string, { count: number; cases: Array<{ case_id: number; client_name: string; attorney: string }> }>;
}
