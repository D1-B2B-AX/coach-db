export interface Coach {
  id: string;
  employee_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  organization: string | null;
  subjects: string[];
  is_new: boolean;
  availability: "available" | "unavailable" | "unknown";
  skill_stack: string[];
  notion_url: string | null;
  portfolio_url: string | null;
  available_fields: string[];
  availability_detail: string | null;
  notes: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  operator: string | null;
  status: "active" | "completed";
  client: string | null;
  lead: string | null;
  instructor_name: string | null;
}

export interface CoachMemo {
  id: string;
  coach_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export interface CoachWithCourses extends Coach {
  courses: Course[];
}

export interface SyncLog {
  id: string;
  synced_by: string;
  status: "started" | "success" | "failed";
  total_rows: number | null;
  created_count: number | null;
  updated_count: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}
