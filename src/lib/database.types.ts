// PLACEHOLDER — hand-written, not machine-generated.
//
// `npm run db:types` (supabase gen types typescript --local) needs a running
// local Supabase stack (Docker) and at least one migration to generate
// anything real; neither exists yet in this scaffold. This file has the
// shape an empty-schema generation produces, so `src/server/db/*` type-checks
// now. Regenerate for real — and delete this comment — once the Pair session
// adds the first migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
