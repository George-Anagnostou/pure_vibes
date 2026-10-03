// Initial schema types. Regenerate after migrations with `npm run db:types`.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };
type Customer = { user_id: string; stripe_customer_id: string; created_at: string };
type Subscription = {
  id: string; user_id: string; status: string; price_id: string | null;
  current_period_end: string | null; cancel_at_period_end: boolean;
  event_created: number; updated_at: string;
};
export type WorkflowRun = {
  id: string; user_id: string; input: string; status: string; output: Json | null;
  model: string; input_tokens: number | null; output_tokens: number | null;
  error: string | null; created_at: string; completed_at: string | null;
};
// Glass Box tables (supabase/migrations/20261003190000_glass_box.sql)
export type ProfileRow = { user_id: string; dials: Json; hard_lines: Json; ranked_priorities: Json; budget_cents: number; updated_at: string };
export type AgentKeyRow = { id: string; user_id: string; name: string; key_hash: string; created_at: string; last_used_at: string | null };
export type ReviewRow = {
  id: string; user_id: string; agent_name: string; task: string; plan: string;
  stated: Json; revealed: Json | null; critique: Json | null; status: string; created_at: string; decided_at: string | null;
};
export type ContractRow = {
  id: string; review_id: string; user_id: string; ranked_priorities: Json; dials: Json; hard_lines: Json;
  budget_cents: number; plan_guidance: string | null; notes: string | null; added_by_human: Json; removed_by_human: Json; created_at: string;
};
export type EventRow = { id: string; review_id: string; user_id: string; type: string; action: string; detail: Json; created_at: string };
export type SpendRow = {
  id: string; review_id: string; user_id: string; amount_cents: number; purpose: string;
  stripe_payment_intent_id: string | null; status: string; created_at: string;
};
type Ins<Row, Req extends keyof Row> = Pick<Row, Req> & Partial<Omit<Row, Req>>;

export type Database = {
  public: {
    Tables: {
      billing_customers: Table<Customer, Pick<Customer, "user_id" | "stripe_customer_id"> & { created_at?: string }>;
      subscriptions: Table<Subscription, Omit<Subscription, "updated_at" | "cancel_at_period_end"> & { updated_at?: string; cancel_at_period_end?: boolean }>;
      stripe_events: Table<{ id: string; processed_at: string }, { id: string; processed_at?: string }>;
      workflow_runs: Table<WorkflowRun, Pick<WorkflowRun, "user_id" | "input" | "model"> & Partial<Omit<WorkflowRun, "user_id" | "input" | "model">>>;
      profiles: Table<ProfileRow, Ins<ProfileRow, "user_id">>;
      agent_keys: Table<AgentKeyRow, Ins<AgentKeyRow, "user_id" | "name" | "key_hash">>;
      reviews: Table<ReviewRow, Ins<ReviewRow, "user_id" | "agent_name" | "task" | "plan">>;
      contracts: Table<ContractRow, Ins<ContractRow, "review_id" | "user_id" | "ranked_priorities" | "dials" | "hard_lines" | "budget_cents">>;
      events: Table<EventRow, Ins<EventRow, "review_id" | "user_id" | "type" | "action">>;
      spends: Table<SpendRow, Ins<SpendRow, "review_id" | "user_id" | "amount_cents" | "purpose">>;
    };
    Views: { [_ in never]: never };
    Functions: {
      approve_review: {
        Args: { p_review_id: string; p_ranked_priorities: Json; p_dials: Json; p_hard_lines: Json; p_budget_cents: number; p_plan_guidance: string; p_notes: string | null; p_added_by_human?: Json; p_removed_by_human?: Json };
        Returns: string;
      };
      save_profile: { Args: { p_ranked_priorities: Json; p_dials: Json; p_hard_lines: Json; p_budget_cents: number }; Returns: undefined };
      reject_review: { Args: { p_review_id: string }; Returns: undefined };
      request_spend: { Args: { p_review_id: string; p_amount_cents: number; p_purpose: string }; Returns: Json };
      reserve_workflow: { Args: { p_user_id: string; p_input: string; p_model: string }; Returns: string };
      sync_subscription: {
        Args: {
          p_event_id: string; p_event_created: number; p_customer_id: string;
          p_subscription_id: string; p_status: string; p_price_id: string | null;
          p_period_end: string | null; p_cancel_at_period_end: boolean;
        };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
