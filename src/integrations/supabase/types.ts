export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      assistant_files: {
        Row: {
          assistant_id: string
          created_at: string
          file_size: number
          file_type: string
          filename: string
          id: string
          processed: boolean
          storage_path: string | null
          user_id: string
        }
        Insert: {
          assistant_id: string
          created_at?: string
          file_size: number
          file_type: string
          filename: string
          id?: string
          processed?: boolean
          storage_path?: string | null
          user_id: string
        }
        Update: {
          assistant_id?: string
          created_at?: string
          file_size?: number
          file_type?: string
          filename?: string
          id?: string
          processed?: boolean
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_files_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistants: {
        Row: {
          created_at: string
          id: string
          language: string
          name: string
          position: string
          status: string
          system_prompt: string
          theme: string
          updated_at: string
          user_id: string
          vapi_assistant_id: string | null
          voice_id: string
          welcome_message: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          name: string
          position?: string
          status?: string
          system_prompt: string
          theme?: string
          updated_at?: string
          user_id: string
          vapi_assistant_id?: string | null
          voice_id: string
          welcome_message: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          name?: string
          position?: string
          status?: string
          system_prompt?: string
          theme?: string
          updated_at?: string
          user_id?: string
          vapi_assistant_id?: string | null
          voice_id?: string
          welcome_message?: string
        }
        Relationships: []
      }
      call_analytics: {
        Row: {
          assistant_id: string | null
          average_duration_seconds: number | null
          created_at: string
          date: string
          failed_calls: number | null
          id: string
          success_rate: number | null
          successful_calls: number | null
          total_calls: number | null
          total_cost: number | null
          total_duration_seconds: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assistant_id?: string | null
          average_duration_seconds?: number | null
          created_at?: string
          date: string
          failed_calls?: number | null
          id?: string
          success_rate?: number | null
          successful_calls?: number | null
          total_calls?: number | null
          total_cost?: number | null
          total_duration_seconds?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assistant_id?: string | null
          average_duration_seconds?: number | null
          created_at?: string
          date?: string
          failed_calls?: number | null
          id?: string
          success_rate?: number | null
          successful_calls?: number | null
          total_calls?: number | null
          total_cost?: number | null
          total_duration_seconds?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_analytics_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          analysis: Json | null
          assistant_id: string | null
          call_type: string
          costs: Json | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          ended_reason: string | null
          id: string
          messages: Json | null
          metadata: Json | null
          phone_number: string | null
          recording_url: string | null
          started_at: string | null
          status: string
          transcript: Json | null
          updated_at: string
          user_id: string
          vapi_assistant_id: string | null
          vapi_call_id: string
        }
        Insert: {
          analysis?: Json | null
          assistant_id?: string | null
          call_type: string
          costs?: Json | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          messages?: Json | null
          metadata?: Json | null
          phone_number?: string | null
          recording_url?: string | null
          started_at?: string | null
          status: string
          transcript?: Json | null
          updated_at?: string
          user_id: string
          vapi_assistant_id?: string | null
          vapi_call_id: string
        }
        Update: {
          analysis?: Json | null
          assistant_id?: string | null
          call_type?: string
          costs?: Json | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          messages?: Json | null
          metadata?: Json | null
          phone_number?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          transcript?: Json | null
          updated_at?: string
          user_id?: string
          vapi_assistant_id?: string | null
          vapi_call_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
