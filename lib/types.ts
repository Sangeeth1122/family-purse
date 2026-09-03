export type Transaction = {
  id: string;
  kind: "pl" | "settlement";
  type:
    | "expense"
    | "revenue"
    | "interest_income"
    | "interest_expense"
    | "card_payment"
    | "loan_repayment"
    | "transfer";
  scope_type: "personal" | "project";
  scope_id: string;
  amount: number;
  category_id: string | null;
  spent_through: "credit_card" | "manual" | null;
  card_id: string | null;
  date: string;
  note: string | null;
  created_by: string;
  counterparty_user_id: string | null;
  linked_loan_id: string | null;
  transfer_group_id: string | null;
  created_at: string;
};

export type Category = {
  id: string;
  family_id: string;
  name: string;
  color: string;
  system: boolean;
  sort_order: number;
  active: boolean;
};

export type Budget = {
  id: string;
  family_id: string;
  name: string;
  type: "monthly" | "project";
  total_amount: number;
  start_date: string;
  end_date: string;
  project_id: string | null;
  created_by: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LegacyBudget = {
  id: string;
  scope_type: "personal" | "project";
  scope_id: string;
  category_id: string;
  amount: number;
  period: "monthly" | "one_time" | "custom";
  start_date: string | null;
  end_date: string | null;
};

export type BudgetListItem = {
  id: string;
  name: string;
  type: "monthly" | "project";
  total_amount: number;
  start_date: string;
  end_date: string;
  project_id: string | null;
  active: boolean;
  created_at: string;
  total_spent: number;
  total_allocated: number;
};

export type BudgetAllocation = {
  id: string;
  budget_id: string;
  category_id: string;
  amount: number;
  created_at: string;
  category_name?: string;
  category_color?: string;
  spent?: number;
};

export type BudgetDetail = {
  budget: Budget;
  allocations: (BudgetAllocation & { category_name: string; category_color: string; spent: number })[];
  total_spent: number;
};

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  family_id: string | null;
  created_at: string;
};

export type Family = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
};

export type Card = {
  id: string;
  user_id: string;
  name: string;
  status: "active" | "closed";
};

export type Loan = {
  id: string;
  direction: "given" | "taken";
  counterparty_user_id: string | null;
  counterparty_name: string | null;
  principal_amount: number;
  interest_rate: number | null;
  start_date: string;
  due_date: string | null;
  reminder_frequency: "monthly" | "none";
  status: "active" | "closed";
  repayment_total: number;
  created_by: string;
  created_at: string;
  note: string | null;
};

export type Reminder = {
  id: string;
  loan_id: string | null;
  card_id: string | null;
  category_id: string | null;
  due_date: string;
  status: "pending" | "sent" | "dismissed";
  type: "card_payment_due" | "loan_interest_check" | "loan_due" | "budget_threshold";
  title: string;
  amount: number | null;
};

export type Project = {
  id: string;
  family_id: string;
  name: string;
  status: "active" | "archived";
  budget: number | null;
  created_by: string;
  created_at: string;
  target_date: string | null;
};

export type ProjectRole = "owner" | "contributor" | "viewer";

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
};

export type ProjectInvitation = {
  id: string;
  project_id: string;
  inviter_id: string;
  invitee_id: string;
  role: ProjectRole;
  status: "pending" | "accepted" | "cancelled";
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
};

export type MemberWithSpend = UserRow & {
  /** Family-wide P&L spend this month (for the family view). */
  spend_this_month: number;
};