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
export type Database = {
  public: {
    Tables: {
      billing_customers: Table<Customer, Pick<Customer, "user_id" | "stripe_customer_id"> & { created_at?: string }>;
      subscriptions: Table<Subscription, Omit<Subscription, "updated_at" | "cancel_at_period_end"> & { updated_at?: string; cancel_at_period_end?: boolean }>;
      stripe_events: Table<{ id: string; processed_at: string }, { id: string; processed_at?: string }>;
      workflow_runs: Table<WorkflowRun, Pick<WorkflowRun, "user_id" | "input" | "model"> & Partial<Omit<WorkflowRun, "user_id" | "input" | "model">>>;
    };
    Views: { [_ in never]: never };
    Functions: {
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
