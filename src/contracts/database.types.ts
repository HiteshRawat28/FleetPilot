// Schema-derived P0 snapshot. Regenerate and review after the local Supabase
// stack can apply migrations. Do not hand-edit after generation is established.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name: string;
          role: Database["public"]["Enums"]["user_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          registration_number: string;
          registration_number_normalized: string;
          name_model: string;
          type: string;
          max_load_kg: number;
          odometer_km: number;
          acquisition_cost: number;
          region: string;
          status: Database["public"]["Enums"]["vehicle_status"];
          archived_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          registration_number: string;
          name_model: string;
          type: string;
          max_load_kg: number;
          odometer_km?: number;
          acquisition_cost?: number;
          region: string;
          status?: Database["public"]["Enums"]["vehicle_status"];
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          registration_number?: string;
          name_model?: string;
          type?: string;
          max_load_kg?: number;
          odometer_km?: number;
          acquisition_cost?: number;
          region?: string;
          status?: Database["public"]["Enums"]["vehicle_status"];
          archived_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      drivers: {
        Row: {
          id: string;
          name: string;
          license_number: string;
          license_number_normalized: string;
          license_category: string;
          license_expiry_date: string;
          contact_number: string;
          safety_score: number;
          status: Database["public"]["Enums"]["driver_status"];
          archived_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          license_number: string;
          license_category: string;
          license_expiry_date: string;
          contact_number: string;
          safety_score?: number;
          status?: Database["public"]["Enums"]["driver_status"];
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          license_number?: string;
          license_category?: string;
          license_expiry_date?: string;
          contact_number?: string;
          safety_score?: number;
          status?: Database["public"]["Enums"]["driver_status"];
          archived_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      trips: {
        Row: {
          id: string;
          source: string;
          destination: string;
          vehicle_id: string;
          driver_id: string;
          cargo_weight_kg: number;
          planned_distance_km: number;
          start_odometer_km: number | null;
          final_odometer_km: number | null;
          actual_distance_km: number | null;
          revenue: number;
          status: Database["public"]["Enums"]["trip_status"];
          dispatched_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          destination: string;
          vehicle_id: string;
          driver_id: string;
          cargo_weight_kg: number;
          planned_distance_km: number;
          start_odometer_km?: number | null;
          final_odometer_km?: number | null;
          actual_distance_km?: number | null;
          revenue?: number;
          status?: Database["public"]["Enums"]["trip_status"];
          dispatched_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          source?: string;
          destination?: string;
          vehicle_id?: string;
          driver_id?: string;
          cargo_weight_kg?: number;
          planned_distance_km?: number;
          start_odometer_km?: number | null;
          final_odometer_km?: number | null;
          actual_distance_km?: number | null;
          revenue?: number;
          status?: Database["public"]["Enums"]["trip_status"];
          dispatched_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      maintenance_logs: {
        Row: {
          id: string;
          vehicle_id: string;
          maintenance_type: string;
          description: string | null;
          status: Database["public"]["Enums"]["maintenance_status"];
          opened_at: string;
          closed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          maintenance_type: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["maintenance_status"];
          opened_at?: string;
          closed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          maintenance_type?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["maintenance_status"];
          closed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      fuel_logs: {
        Row: {
          id: string;
          vehicle_id: string;
          trip_id: string | null;
          liters: number;
          cost: number;
          logged_date: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          trip_id?: string | null;
          liters: number;
          cost: number;
          logged_date?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vehicle_id?: string;
          trip_id?: string | null;
          liters?: number;
          cost?: number;
          logged_date?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          vehicle_id: string;
          trip_id: string | null;
          maintenance_log_id: string | null;
          category: Database["public"]["Enums"]["expense_category"];
          amount: number;
          expense_date: string;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          trip_id?: string | null;
          maintenance_log_id?: string | null;
          category: Database["public"]["Enums"]["expense_category"];
          amount: number;
          expense_date?: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vehicle_id?: string;
          trip_id?: string | null;
          maintenance_log_id?: string | null;
          category?: Database["public"]["Enums"]["expense_category"];
          amount?: number;
          expense_date?: string;
          description?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      user_role:
        "fleet_manager" | "dispatcher" | "safety_officer" | "financial_analyst";
      vehicle_status: "available" | "on_trip" | "in_shop" | "retired";
      driver_status: "available" | "on_trip" | "off_duty" | "suspended";
      trip_status: "draft" | "dispatched" | "completed" | "cancelled";
      maintenance_status: "active" | "closed";
      expense_category: "maintenance" | "toll" | "other";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
