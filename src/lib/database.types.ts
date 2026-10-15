export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail_text: string | null
          from_text: string | null
          household_id: string
          id: string
          kind: string
          subject_id: string
          subject_name: string
          to_text: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail_text?: string | null
          from_text?: string | null
          household_id: string
          id?: string
          kind: string
          subject_id: string
          subject_name: string
          to_text?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail_text?: string | null
          from_text?: string | null
          household_id?: string
          id?: string
          kind?: string
          subject_id?: string
          subject_name?: string
          to_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          onboarding_completed_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          onboarding_completed_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          onboarding_completed_at?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          household_id: string
          id: string
          redeemed_at: string | null
          redeemed_by: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          household_id: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          household_id?: string
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          added_at: string
          added_by: string
          detail: string | null
          household_id: string
          id: string
          last_moved_at: string | null
          last_moved_by: string | null
          location_id: string
          name: string
        }
        Insert: {
          added_at?: string
          added_by: string
          detail?: string | null
          household_id: string
          id?: string
          last_moved_at?: string | null
          last_moved_by?: string | null
          location_id: string
          name: string
        }
        Update: {
          added_at?: string
          added_by?: string
          detail?: string | null
          household_id?: string
          id?: string
          last_moved_at?: string | null
          last_moved_by?: string | null
          location_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          id: string
          name: string
          onboarding_completed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_location: {
        Args: { p_name: string; p_parent_id?: string }
        Returns: {
          created_at: string
          household_id: string
          id: string
          name: string
          parent_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "locations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_container: {
        Args: { p_location_id: string }
        Returns: {
          created_at: string
          household_id: string
          id: string
          name: string
          parent_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "locations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_item: {
        Args: { p_item_id: string }
        Returns: {
          added_at: string
          added_by: string
          detail: string | null
          household_id: string
          id: string
          last_moved_at: string | null
          last_moved_by: string | null
          location_id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_location_path: {
        Args: { p_household_id: string; p_names: string[]; p_parent_id: string }
        Returns: string
      }
      is_household_member: {
        Args: { target_household_id: string }
        Returns: boolean
      }
      location_path_text: { Args: { p_location_id: string }; Returns: string }
      location_subtree_items: {
        Args: { p_location_id: string }
        Returns: {
          added_at: string
          added_by: string
          detail: string | null
          household_id: string
          id: string
          last_moved_at: string | null
          last_moved_by: string | null
          location_id: string
          name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      move_container: {
        Args: { p_location_id: string; p_new_parent_id: string }
        Returns: {
          created_at: string
          household_id: string
          id: string
          name: string
          parent_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "locations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_item: {
        Args: {
          p_item_id: string
          p_new_location_id?: string
          p_new_path?: string[]
        }
        Returns: {
          added_at: string
          added_by: string
          detail: string | null
          household_id: string
          id: string
          last_moved_at: string | null
          last_moved_by: string | null
          location_id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      normalize_place_name: { Args: { p_name: string }; Returns: string }
      profile_display_name_for: { Args: { p_email: string }; Returns: string }
      record_activity_event: {
        Args: {
          p_detail_text?: string
          p_from_text?: string
          p_household_id: string
          p_kind: string
          p_subject_id: string
          p_subject_name: string
          p_to_text?: string
        }
        Returns: undefined
      }
      redeem_invite: {
        Args: { p_code: string }
        Returns: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          household_id: string
          id: string
          redeemed_at: string | null
          redeemed_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rename_location: {
        Args: { p_location_id: string; p_name: string }
        Returns: {
          created_at: string
          household_id: string
          id: string
          name: string
          parent_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "locations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shares_household_with: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      stash_item: {
        Args: {
          p_detail?: string
          p_location_id?: string
          p_name: string
          p_new_path?: string[]
        }
        Returns: {
          added_at: string
          added_by: string
          detail: string | null
          household_id: string
          id: string
          last_moved_at: string | null
          last_moved_by: string | null
          location_id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_item: {
        Args: {
          p_detail?: string
          p_item_id: string
          p_location_id?: string
          p_name: string
          p_new_path?: string[]
        }
        Returns: {
          added_at: string
          added_by: string
          detail: string | null
          household_id: string
          id: string
          last_moved_at: string | null
          last_moved_by: string | null
          location_id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

