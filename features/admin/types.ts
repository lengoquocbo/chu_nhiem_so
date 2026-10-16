export type SchoolYear = { id: string; name: string; start_date: string; end_date: string; status: string };
export type AcademicTerm = { id: string; school_year_id: string; name: string; term_number: number; start_date: string; end_date: string; status: string };
export type Grade = { id: string; name: string; school_year_id: string };
export type ClassTermLink = { id: string; academic_term_id: string; academic_terms?: AcademicTerm | null; homeroom_term_assignments?: { id: string; teacher_id: string; status: string; profiles?: Teacher | null }[] };
export type ClassRow = { id: string; name: string; class_code: string; homeroom_teacher_id: string | null; grade_block_id: string; school_year_id: string; class_academic_terms?: ClassTermLink[] };
export type Teacher = { id: string; full_name: string };
export type StudentItem = { id: string; full_name: string };
export type CreatedAccount = { email: string; temporary_password: string };
export type StaffAccount = {
  user_id: string;
  email: string;
  full_name: string;
  roles: string[];
  created_at: string | null;
  last_sign_in_at: string | null;
};
