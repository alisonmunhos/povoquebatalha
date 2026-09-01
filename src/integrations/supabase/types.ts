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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          event: string
          id: string
          meta: Json
          target_user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event: string
          id?: string
          meta?: Json
          target_user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event?: string
          id?: string
          meta?: Json
          target_user_id?: string | null
        }
        Relationships: []
      }
      agitacao_contact_logs: {
        Row: {
          action: Database["public"]["Enums"]["agitacao_action"]
          contact_id: string
          created_at: string
          follow_up_at: string | null
          follow_up_by: string | null
          follow_up_status: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          metadata: Json
          note: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["agitacao_action"]
          contact_id: string
          created_at?: string
          follow_up_at?: string | null
          follow_up_by?: string | null
          follow_up_status?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["agitacao_action"]
          contact_id?: string
          created_at?: string
          follow_up_at?: string | null
          follow_up_by?: string | null
          follow_up_status?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          metadata?: Json
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agitacao_contact_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      agitation_link_pauses: {
        Row: {
          contact_id: string
          mission_id: string
          paused_at: string
        }
        Insert: {
          contact_id: string
          mission_id: string
          paused_at?: string
        }
        Update: {
          contact_id?: string
          mission_id?: string
          paused_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agitation_link_pauses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agitation_link_pauses_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agitation_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      agitation_mission_claims: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          claimed_at: string
          completed_at: string | null
          id: string
          mission_id: string
          task_count: number
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          claimed_at?: string
          completed_at?: string | null
          id?: string
          mission_id: string
          task_count?: number
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          claimed_at?: string
          completed_at?: string | null
          id?: string
          mission_id?: string
          task_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agitation_mission_claims_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agitation_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      agitation_mission_eligible_users: {
        Row: {
          created_at: string
          mission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          mission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          mission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agitation_mission_eligible_users_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agitation_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      agitation_missions: {
        Row: {
          archived_at: string | null
          batch_size: number
          cooldown_minutes: number
          coordinator_phone: string | null
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          instructions: string | null
          is_open: boolean
          media_filename: string | null
          media_mime: string | null
          media_path: string | null
          message_template: string
          open_notified_at: string | null
          opened_at: string | null
          paused_at: string | null
          source_filters: Json | null
          starts_at: string | null
          title: string
          whatsapp_message_template: string | null
        }
        Insert: {
          archived_at?: string | null
          batch_size?: number
          cooldown_minutes?: number
          coordinator_phone?: string | null
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          instructions?: string | null
          is_open?: boolean
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          message_template: string
          open_notified_at?: string | null
          opened_at?: string | null
          paused_at?: string | null
          source_filters?: Json | null
          starts_at?: string | null
          title: string
          whatsapp_message_template?: string | null
        }
        Update: {
          archived_at?: string | null
          batch_size?: number
          cooldown_minutes?: number
          coordinator_phone?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          instructions?: string | null
          is_open?: boolean
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          message_template?: string
          open_notified_at?: string | null
          opened_at?: string | null
          paused_at?: string | null
          source_filters?: Json | null
          starts_at?: string | null
          title?: string
          whatsapp_message_template?: string | null
        }
        Relationships: []
      }
      agitation_tasks: {
        Row: {
          assigned_at: string | null
          assigned_contact_id: string | null
          assigned_to_user_at: string | null
          assigned_user_id: string | null
          claim_id: string | null
          completed_at: string | null
          contact_id: string
          created_at: string
          id: string
          mission_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_contact_id?: string | null
          assigned_to_user_at?: string | null
          assigned_user_id?: string | null
          claim_id?: string | null
          completed_at?: string | null
          contact_id: string
          created_at?: string
          id?: string
          mission_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_contact_id?: string | null
          assigned_to_user_at?: string | null
          assigned_user_id?: string | null
          claim_id?: string | null
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          mission_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agitation_tasks_assigned_contact_id_fkey"
            columns: ["assigned_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agitation_tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "agitation_mission_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agitation_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agitation_tasks_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agitation_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_reply_log: {
        Row: {
          contact_id: string | null
          id: string
          phone: string
          replied_at: string
          trigger_id: string
        }
        Insert: {
          contact_id?: string | null
          id?: string
          phone: string
          replied_at?: string
          trigger_id: string
        }
        Update: {
          contact_id?: string | null
          id?: string
          phone?: string
          replied_at?: string
          trigger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_reply_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_reply_log_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "auto_reply_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_reply_triggers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          phrase: string
          response_text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          phrase: string
          response_text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          phrase?: string
          response_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      automation_deliveries: {
        Row: {
          automation_id: string
          contact_id: string
          created_at: string
          error: string | null
          id: string
          rendered_body: string | null
          sent_at: string | null
          status: string
          template_id: string | null
          zapi_message_id: string | null
        }
        Insert: {
          automation_id: string
          contact_id: string
          created_at?: string
          error?: string | null
          id?: string
          rendered_body?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          zapi_message_id?: string | null
        }
        Update: {
          automation_id?: string
          contact_id?: string
          created_at?: string
          error?: string | null
          id?: string
          rendered_body?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          zapi_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_deliveries_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_deliveries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_deliveries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          delay_seconds: number
          event_key: string
          id: string
          notes: string | null
          require_consent: boolean
          template_id: string
          updated_at: string
          updated_by: string | null
          whatsapp_template_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          event_key: string
          id?: string
          notes?: string | null
          require_consent?: boolean
          template_id: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_template_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          event_key?: string
          id?: string
          notes?: string | null
          require_consent?: boolean
          template_id?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_whatsapp_template_id_fkey"
            columns: ["whatsapp_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          delivered_at: string | null
          endpoint_used: string | null
          erro: string | null
          failed_at: string | null
          fallback_reason: string | null
          id: string
          link_description: string | null
          link_image: string | null
          link_title: string | null
          link_url: string | null
          message_id: string | null
          preview_status: string | null
          read_at: string | null
          rendered_message: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["recipient_status"]
          tentativas: number
          updated_at: string
          zaap_id: string | null
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          endpoint_used?: string | null
          erro?: string | null
          failed_at?: string | null
          fallback_reason?: string | null
          id?: string
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          link_url?: string | null
          message_id?: string | null
          preview_status?: string | null
          read_at?: string | null
          rendered_message?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          tentativas?: number
          updated_at?: string
          zaap_id?: string | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          endpoint_used?: string | null
          erro?: string | null
          failed_at?: string | null
          fallback_reason?: string | null
          id?: string
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          link_url?: string | null
          message_id?: string | null
          preview_status?: string | null
          read_at?: string | null
          rendered_message?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["recipient_status"]
          tentativas?: number
          updated_at?: string
          zaap_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          agendado_para: string | null
          audience_ids: Json | null
          canceled_at: string | null
          canceled_by: string | null
          canceled_motivo: string | null
          created_at: string
          created_by: string | null
          delay_max_ms: number
          delay_min_ms: number
          descricao: string | null
          filtro_adhoc: Json | null
          id: string
          instance_id: string | null
          is_system: boolean
          janela_fim: string
          janela_inicio: string
          link_description: string | null
          link_image: string | null
          link_title: string | null
          link_url: string | null
          mensagem_template: string
          midia_caption: string | null
          midia_filename: string | null
          midia_mime: string | null
          midia_path: string | null
          midia_url: string | null
          nome: string
          paused_at: string | null
          paused_motivo: string | null
          segment_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          tipo: Database["public"]["Enums"]["campaign_tipo"]
          total_destinatarios: number
          total_entregues: number
          total_enviados: number
          total_falhas: number
          total_lidos: number
          ultimo_lote_at: string | null
          updated_at: string
          whatsapp_template_id: string | null
        }
        Insert: {
          agendado_para?: string | null
          audience_ids?: Json | null
          canceled_at?: string | null
          canceled_by?: string | null
          canceled_motivo?: string | null
          created_at?: string
          created_by?: string | null
          delay_max_ms?: number
          delay_min_ms?: number
          descricao?: string | null
          filtro_adhoc?: Json | null
          id?: string
          instance_id?: string | null
          is_system?: boolean
          janela_fim?: string
          janela_inicio?: string
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          link_url?: string | null
          mensagem_template: string
          midia_caption?: string | null
          midia_filename?: string | null
          midia_mime?: string | null
          midia_path?: string | null
          midia_url?: string | null
          nome: string
          paused_at?: string | null
          paused_motivo?: string | null
          segment_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          tipo?: Database["public"]["Enums"]["campaign_tipo"]
          total_destinatarios?: number
          total_entregues?: number
          total_enviados?: number
          total_falhas?: number
          total_lidos?: number
          ultimo_lote_at?: string | null
          updated_at?: string
          whatsapp_template_id?: string | null
        }
        Update: {
          agendado_para?: string | null
          audience_ids?: Json | null
          canceled_at?: string | null
          canceled_by?: string | null
          canceled_motivo?: string | null
          created_at?: string
          created_by?: string | null
          delay_max_ms?: number
          delay_min_ms?: number
          descricao?: string | null
          filtro_adhoc?: Json | null
          id?: string
          instance_id?: string | null
          is_system?: boolean
          janela_fim?: string
          janela_inicio?: string
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          link_url?: string | null
          mensagem_template?: string
          midia_caption?: string | null
          midia_filename?: string | null
          midia_mime?: string | null
          midia_path?: string | null
          midia_url?: string | null
          nome?: string
          paused_at?: string | null
          paused_motivo?: string | null
          segment_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          tipo?: Database["public"]["Enums"]["campaign_tipo"]
          total_destinatarios?: number
          total_entregues?: number
          total_enviados?: number
          total_falhas?: number
          total_lidos?: number
          ultimo_lote_at?: string | null
          updated_at?: string
          whatsapp_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_template_id_fkey"
            columns: ["whatsapp_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      choice_screen_options: {
        Row: {
          choice_screen_id: string
          description: string | null
          id: string
          label: string
          order_index: number
          target_form_slug: string | null
          target_type: string
          target_url: string | null
        }
        Insert: {
          choice_screen_id: string
          description?: string | null
          id?: string
          label: string
          order_index: number
          target_form_slug?: string | null
          target_type: string
          target_url?: string | null
        }
        Update: {
          choice_screen_id?: string
          description?: string | null
          id?: string
          label?: string
          order_index?: number
          target_form_slug?: string | null
          target_type?: string
          target_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "choice_screen_options_choice_screen_id_fkey"
            columns: ["choice_screen_id"]
            isOneToOne: false
            referencedRelation: "choice_screens"
            referencedColumns: ["id"]
          },
        ]
      }
      choice_screens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          slug: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          slug: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          slug?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_audit_log: {
        Row: {
          action: string
          changes: Json | null
          contact_id: string
          created_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          contact_id: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          contact_id?: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_audit_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_duplicates: {
        Row: {
          contact_a: string
          contact_b: string
          created_at: string
          id: string
          match_type: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          score: number | null
          snoozed_until: string | null
          status: string
        }
        Insert: {
          contact_a: string
          contact_b: string
          created_at?: string
          id?: string
          match_type: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number | null
          snoozed_until?: string | null
          status?: string
        }
        Update: {
          contact_a?: string
          contact_b?: string
          created_at?: string
          id?: string
          match_type?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number | null
          snoozed_until?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_duplicates_contact_a_fkey"
            columns: ["contact_a"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_duplicates_contact_b_fkey"
            columns: ["contact_b"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_merges: {
        Row: {
          confianca: string | null
          created_at: string
          field_choices: Json
          id: string
          merged_id: string | null
          merged_snapshot: Json
          motivo: string | null
          performed_by: string | null
          survivor_id: string | null
        }
        Insert: {
          confianca?: string | null
          created_at?: string
          field_choices?: Json
          id?: string
          merged_id?: string | null
          merged_snapshot: Json
          motivo?: string | null
          performed_by?: string | null
          survivor_id?: string | null
        }
        Update: {
          confianca?: string | null
          created_at?: string
          field_choices?: Json
          id?: string
          merged_id?: string | null
          merged_snapshot?: Json
          motivo?: string | null
          performed_by?: string | null
          survivor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_source_events: {
        Row: {
          contact_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["source_event_type"]
          id: string
          metadata: Json
          source_form_type:
            | Database["public"]["Enums"]["source_form_type"]
            | null
          source_link_id: string | null
          source_module: Database["public"]["Enums"]["source_module"]
          source_user_contact_id: string | null
          source_user_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["source_event_type"]
          id?: string
          metadata?: Json
          source_form_type?:
            | Database["public"]["Enums"]["source_form_type"]
            | null
          source_link_id?: string | null
          source_module: Database["public"]["Enums"]["source_module"]
          source_user_contact_id?: string | null
          source_user_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["source_event_type"]
          id?: string
          metadata?: Json
          source_form_type?:
            | Database["public"]["Enums"]["source_form_type"]
            | null
          source_link_id?: string | null
          source_module?: Database["public"]["Enums"]["source_module"]
          source_user_contact_id?: string | null
          source_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_source_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_source_events_source_link_id_fkey"
            columns: ["source_link_id"]
            isOneToOne: false
            referencedRelation: "tracked_form_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_source_events_source_user_contact_id_fkey"
            columns: ["source_user_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          active_capture_channel:
            | Database["public"]["Enums"]["capture_channel"]
            | null
          active_captured_by_user_id: string | null
          active_tracking_form_id: string | null
          active_tracking_label: string | null
          active_tracking_link_id: string | null
          arquivado_at: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          coletivo_alicerce: boolean | null
          como_conheceu: string | null
          complemento: string | null
          consentimento_at: string | null
          consentimento_dados_sensiveis: boolean
          consentimento_dados_sensiveis_at: string | null
          consentimento_lgpd: boolean
          consentimento_lgpd_at: string | null
          consentimento_whatsapp: boolean
          cpf_hash: string | null
          created_at: string
          created_by: string | null
          created_by_source_user_id: string | null
          custom_fields: Json
          disponibilidade: Json
          email: string | null
          email_secundario: string | null
          endereco: string | null
          endereco_completo: string | null
          faixa_etaria: string | null
          formas_ajuda: Json
          formas_ajuda_outro: string | null
          geocoded_at: string | null
          geocoding_match_score: number | null
          geocoding_precision:
            | Database["public"]["Enums"]["geocoding_precision"]
            | null
          geocoding_provider: string | null
          geocoding_status:
            | Database["public"]["Enums"]["geocoding_status"]
            | null
          id: string
          import_id: string | null
          imported_at: string | null
          imported_by_user_id: string | null
          instituicao: string | null
          is_system_user: boolean
          last_source_module:
            | Database["public"]["Enums"]["source_module"]
            | null
          last_source_user_id: string | null
          lat: number | null
          latitude: number | null
          lifecycle_status:
            | Database["public"]["Enums"]["contact_lifecycle_status"]
            | null
          lng: number | null
          longitude: number | null
          movimento_social_nome: string | null
          nome: string
          nome_normalizado: string | null
          nome_social: string | null
          numero: string | null
          observacoes: string | null
          opt_out_at: string | null
          opt_out_motivo: string | null
          opt_out_token: string
          origem: Database["public"]["Enums"]["contact_origem"]
          origem_detalhe: string | null
          participa_movimento_social: boolean | null
          phone_ddd: string | null
          phone_ddi: string | null
          phone_digits: string | null
          phone_e164: string | null
          phone_last8: string | null
          phone_last9: string | null
          phone_raw: string | null
          phone_secundario_e164: string | null
          phone_secundario_last8: string | null
          phone_secundario_raw: string | null
          phone_status:
            | Database["public"]["Enums"]["contact_phone_status"]
            | null
          phone_whatsapp_candidate: string | null
          primary_source_module:
            | Database["public"]["Enums"]["source_module"]
            | null
          profissao: string | null
          quem_indicou: string | null
          quer_voluntariar: boolean | null
          recad_token: string | null
          rede_social: string | null
          referencia: string | null
          source_captured_at: string | null
          source_form_type:
            | Database["public"]["Enums"]["source_form_type"]
            | null
          source_link_id: string | null
          system_role: Database["public"]["Enums"]["app_role"] | null
          tipo: string | null
          tipo_contato: string | null
          uf: string | null
          updated_at: string
          whatsapp_checked_at: string | null
          whatsapp_status: Database["public"]["Enums"]["whatsapp_status"] | null
          zona_eleitoral: string | null
        }
        Insert: {
          active_capture_channel?:
            | Database["public"]["Enums"]["capture_channel"]
            | null
          active_captured_by_user_id?: string | null
          active_tracking_form_id?: string | null
          active_tracking_label?: string | null
          active_tracking_link_id?: string | null
          arquivado_at?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          coletivo_alicerce?: boolean | null
          como_conheceu?: string | null
          complemento?: string | null
          consentimento_at?: string | null
          consentimento_dados_sensiveis?: boolean
          consentimento_dados_sensiveis_at?: string | null
          consentimento_lgpd?: boolean
          consentimento_lgpd_at?: string | null
          consentimento_whatsapp?: boolean
          cpf_hash?: string | null
          created_at?: string
          created_by?: string | null
          created_by_source_user_id?: string | null
          custom_fields?: Json
          disponibilidade?: Json
          email?: string | null
          email_secundario?: string | null
          endereco?: string | null
          endereco_completo?: string | null
          faixa_etaria?: string | null
          formas_ajuda?: Json
          formas_ajuda_outro?: string | null
          geocoded_at?: string | null
          geocoding_match_score?: number | null
          geocoding_precision?:
            | Database["public"]["Enums"]["geocoding_precision"]
            | null
          geocoding_provider?: string | null
          geocoding_status?:
            | Database["public"]["Enums"]["geocoding_status"]
            | null
          id?: string
          import_id?: string | null
          imported_at?: string | null
          imported_by_user_id?: string | null
          instituicao?: string | null
          is_system_user?: boolean
          last_source_module?:
            | Database["public"]["Enums"]["source_module"]
            | null
          last_source_user_id?: string | null
          lat?: number | null
          latitude?: number | null
          lifecycle_status?:
            | Database["public"]["Enums"]["contact_lifecycle_status"]
            | null
          lng?: number | null
          longitude?: number | null
          movimento_social_nome?: string | null
          nome: string
          nome_normalizado?: string | null
          nome_social?: string | null
          numero?: string | null
          observacoes?: string | null
          opt_out_at?: string | null
          opt_out_motivo?: string | null
          opt_out_token?: string
          origem?: Database["public"]["Enums"]["contact_origem"]
          origem_detalhe?: string | null
          participa_movimento_social?: boolean | null
          phone_ddd?: string | null
          phone_ddi?: string | null
          phone_digits?: string | null
          phone_e164?: string | null
          phone_last8?: string | null
          phone_last9?: string | null
          phone_raw?: string | null
          phone_secundario_e164?: string | null
          phone_secundario_last8?: string | null
          phone_secundario_raw?: string | null
          phone_status?:
            | Database["public"]["Enums"]["contact_phone_status"]
            | null
          phone_whatsapp_candidate?: string | null
          primary_source_module?:
            | Database["public"]["Enums"]["source_module"]
            | null
          profissao?: string | null
          quem_indicou?: string | null
          quer_voluntariar?: boolean | null
          recad_token?: string | null
          rede_social?: string | null
          referencia?: string | null
          source_captured_at?: string | null
          source_form_type?:
            | Database["public"]["Enums"]["source_form_type"]
            | null
          source_link_id?: string | null
          system_role?: Database["public"]["Enums"]["app_role"] | null
          tipo?: string | null
          tipo_contato?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_checked_at?: string | null
          whatsapp_status?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
          zona_eleitoral?: string | null
        }
        Update: {
          active_capture_channel?:
            | Database["public"]["Enums"]["capture_channel"]
            | null
          active_captured_by_user_id?: string | null
          active_tracking_form_id?: string | null
          active_tracking_label?: string | null
          active_tracking_link_id?: string | null
          arquivado_at?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          coletivo_alicerce?: boolean | null
          como_conheceu?: string | null
          complemento?: string | null
          consentimento_at?: string | null
          consentimento_dados_sensiveis?: boolean
          consentimento_dados_sensiveis_at?: string | null
          consentimento_lgpd?: boolean
          consentimento_lgpd_at?: string | null
          consentimento_whatsapp?: boolean
          cpf_hash?: string | null
          created_at?: string
          created_by?: string | null
          created_by_source_user_id?: string | null
          custom_fields?: Json
          disponibilidade?: Json
          email?: string | null
          email_secundario?: string | null
          endereco?: string | null
          endereco_completo?: string | null
          faixa_etaria?: string | null
          formas_ajuda?: Json
          formas_ajuda_outro?: string | null
          geocoded_at?: string | null
          geocoding_match_score?: number | null
          geocoding_precision?:
            | Database["public"]["Enums"]["geocoding_precision"]
            | null
          geocoding_provider?: string | null
          geocoding_status?:
            | Database["public"]["Enums"]["geocoding_status"]
            | null
          id?: string
          import_id?: string | null
          imported_at?: string | null
          imported_by_user_id?: string | null
          instituicao?: string | null
          is_system_user?: boolean
          last_source_module?:
            | Database["public"]["Enums"]["source_module"]
            | null
          last_source_user_id?: string | null
          lat?: number | null
          latitude?: number | null
          lifecycle_status?:
            | Database["public"]["Enums"]["contact_lifecycle_status"]
            | null
          lng?: number | null
          longitude?: number | null
          movimento_social_nome?: string | null
          nome?: string
          nome_normalizado?: string | null
          nome_social?: string | null
          numero?: string | null
          observacoes?: string | null
          opt_out_at?: string | null
          opt_out_motivo?: string | null
          opt_out_token?: string
          origem?: Database["public"]["Enums"]["contact_origem"]
          origem_detalhe?: string | null
          participa_movimento_social?: boolean | null
          phone_ddd?: string | null
          phone_ddi?: string | null
          phone_digits?: string | null
          phone_e164?: string | null
          phone_last8?: string | null
          phone_last9?: string | null
          phone_raw?: string | null
          phone_secundario_e164?: string | null
          phone_secundario_last8?: string | null
          phone_secundario_raw?: string | null
          phone_status?:
            | Database["public"]["Enums"]["contact_phone_status"]
            | null
          phone_whatsapp_candidate?: string | null
          primary_source_module?:
            | Database["public"]["Enums"]["source_module"]
            | null
          profissao?: string | null
          quem_indicou?: string | null
          quer_voluntariar?: boolean | null
          recad_token?: string | null
          rede_social?: string | null
          referencia?: string | null
          source_captured_at?: string | null
          source_form_type?:
            | Database["public"]["Enums"]["source_form_type"]
            | null
          source_link_id?: string | null
          system_role?: Database["public"]["Enums"]["app_role"] | null
          tipo?: string | null
          tipo_contato?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_checked_at?: string | null
          whatsapp_status?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
          zona_eleitoral?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_active_tracking_form_id_fkey"
            columns: ["active_tracking_form_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_active_tracking_link_id_fkey"
            columns: ["active_tracking_link_id"]
            isOneToOne: false
            referencedRelation: "tracked_form_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_source_link_id_fkey"
            columns: ["source_link_id"]
            isOneToOne: false
            referencedRelation: "tracked_form_links"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          actor_id: string | null
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          contact_id: string | null
          created_at: string
          first_message_direction: string | null
          flagged: boolean
          from_phone: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_direction: string | null
          last_message_preview: string | null
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          first_message_direction?: string | null
          flagged?: boolean
          from_phone?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          first_message_direction?: string | null
          flagged?: boolean
          from_phone?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          contact_id: string | null
          conteudo: string
          created_at: string
          delivered_at: string | null
          endpoint_used: string | null
          erro: string | null
          failed_at: string | null
          fallback_reason: string | null
          id: string
          inbound_id: string | null
          link_description: string | null
          link_image: string | null
          link_title: string | null
          link_url: string | null
          media_filename: string | null
          media_mime: string | null
          media_path: string | null
          message_id: string | null
          origem: string
          preview_status: string | null
          reaction_emoji: string | null
          reaction_target_wa_id: string | null
          read_at: string | null
          sent_by: string | null
          status: string
          template_id: string | null
          to_phone: string | null
          zaap_id: string | null
        }
        Insert: {
          contact_id?: string | null
          conteudo: string
          created_at?: string
          delivered_at?: string | null
          endpoint_used?: string | null
          erro?: string | null
          failed_at?: string | null
          fallback_reason?: string | null
          id?: string
          inbound_id?: string | null
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          link_url?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          message_id?: string | null
          origem: string
          preview_status?: string | null
          reaction_emoji?: string | null
          reaction_target_wa_id?: string | null
          read_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: string | null
          to_phone?: string | null
          zaap_id?: string | null
        }
        Update: {
          contact_id?: string | null
          conteudo?: string
          created_at?: string
          delivered_at?: string | null
          endpoint_used?: string | null
          erro?: string | null
          failed_at?: string | null
          fallback_reason?: string | null
          id?: string
          inbound_id?: string | null
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          link_url?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          message_id?: string | null
          origem?: string
          preview_status?: string | null
          reaction_emoji?: string | null
          reaction_target_wa_id?: string | null
          read_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: string | null
          to_phone?: string | null
          zaap_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_inbound_id_fkey"
            columns: ["inbound_id"]
            isOneToOne: false
            referencedRelation: "inbound_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          contact_id: string
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          event_id: string
          id?: string
          status: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cover_mime: string | null
          cover_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_published: boolean
          linked_form_definition_id: string | null
          linked_form_start_section_id: string | null
          location: string | null
          post_decline_body: string | null
          post_decline_button_text: string | null
          post_decline_button_url: string | null
          post_decline_title: string | null
          post_rsvp_body: string | null
          post_rsvp_button_text: string | null
          post_rsvp_button_url: string | null
          post_rsvp_title: string | null
          slug: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_mime?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_published?: boolean
          linked_form_definition_id?: string | null
          linked_form_start_section_id?: string | null
          location?: string | null
          post_decline_body?: string | null
          post_decline_button_text?: string | null
          post_decline_button_url?: string | null
          post_decline_title?: string | null
          post_rsvp_body?: string | null
          post_rsvp_button_text?: string | null
          post_rsvp_button_url?: string | null
          post_rsvp_title?: string | null
          slug: string
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_mime?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_published?: boolean
          linked_form_definition_id?: string | null
          linked_form_start_section_id?: string | null
          location?: string | null
          post_decline_body?: string | null
          post_decline_button_text?: string | null
          post_decline_button_url?: string | null
          post_decline_title?: string | null
          post_rsvp_body?: string | null
          post_rsvp_button_text?: string | null
          post_rsvp_button_url?: string | null
          post_rsvp_title?: string | null
          slug?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_linked_form_definition_id_fkey"
            columns: ["linked_form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_linked_form_start_section_id_fkey"
            columns: ["linked_form_start_section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      form_custom_answers: {
        Row: {
          answer_text: string | null
          contact_id: string
          created_at: string
          form_definition_id: string
          id: string
          question_id: string
          question_label: string
        }
        Insert: {
          answer_text?: string | null
          contact_id: string
          created_at?: string
          form_definition_id: string
          id?: string
          question_id: string
          question_label: string
        }
        Update: {
          answer_text?: string | null
          contact_id?: string
          created_at?: string
          form_definition_id?: string
          id?: string
          question_id?: string
          question_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_custom_answers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_custom_answers_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_custom_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_definition_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definition_questions: {
        Row: {
          catalog_field_key: string | null
          created_at: string
          custom_options: Json | null
          custom_response_type: string | null
          form_definition_id: string
          help_text: string | null
          id: string
          label: string
          link_text: string | null
          link_url: string | null
          order_index: number
          required: boolean
          section_id: string | null
          source: string
        }
        Insert: {
          catalog_field_key?: string | null
          created_at?: string
          custom_options?: Json | null
          custom_response_type?: string | null
          form_definition_id: string
          help_text?: string | null
          id?: string
          label: string
          link_text?: string | null
          link_url?: string | null
          order_index: number
          required?: boolean
          section_id?: string | null
          source: string
        }
        Update: {
          catalog_field_key?: string | null
          created_at?: string
          custom_options?: Json | null
          custom_response_type?: string | null
          form_definition_id?: string
          help_text?: string | null
          id?: string
          label?: string
          link_text?: string | null
          link_url?: string | null
          order_index?: number
          required?: boolean
          section_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_definition_questions_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_definition_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          event_key: string
          header_image_mime: string | null
          header_image_path: string | null
          id: string
          is_active: boolean
          is_fixed: boolean
          layout_mode: string
          prefill_from_token: boolean
          push_button_enabled: boolean
          slug: string
          source_form_type: Database["public"]["Enums"]["source_form_type"]
          success_screen_order: string
          title: string
          tracked_form_link_id: string | null
          tracking_name: string | null
          updated_at: string
          updated_by: string | null
          whatsapp_button_enabled: boolean
          whatsapp_button_message: string | null
          whatsapp_button_phone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_key: string
          header_image_mime?: string | null
          header_image_path?: string | null
          id?: string
          is_active?: boolean
          is_fixed?: boolean
          layout_mode?: string
          prefill_from_token?: boolean
          push_button_enabled?: boolean
          slug: string
          source_form_type: Database["public"]["Enums"]["source_form_type"]
          success_screen_order?: string
          title: string
          tracked_form_link_id?: string | null
          tracking_name?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_button_enabled?: boolean
          whatsapp_button_message?: string | null
          whatsapp_button_phone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_key?: string
          header_image_mime?: string | null
          header_image_path?: string | null
          id?: string
          is_active?: boolean
          is_fixed?: boolean
          layout_mode?: string
          prefill_from_token?: boolean
          push_button_enabled?: boolean
          slug?: string
          source_form_type?: Database["public"]["Enums"]["source_form_type"]
          success_screen_order?: string
          title?: string
          tracked_form_link_id?: string | null
          tracking_name?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_button_enabled?: boolean
          whatsapp_button_message?: string | null
          whatsapp_button_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_definitions_tracked_form_link_id_fkey"
            columns: ["tracked_form_link_id"]
            isOneToOne: false
            referencedRelation: "tracked_form_links"
            referencedColumns: ["id"]
          },
        ]
      }
      form_question_branch_rules: {
        Row: {
          id: string
          next_section_id: string | null
          option_value: string
          question_id: string
        }
        Insert: {
          id?: string
          next_section_id?: string | null
          option_value: string
          question_id: string
        }
        Update: {
          id?: string
          next_section_id?: string | null
          option_value?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_question_branch_rules_next_section_id_fkey"
            columns: ["next_section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_question_branch_rules_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_definition_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_sections: {
        Row: {
          account_creation_role: Database["public"]["Enums"]["app_role"] | null
          confirmation_active: boolean | null
          confirmation_event_key: string | null
          created_at: string
          default_next_section_id: string | null
          description: string | null
          form_definition_id: string
          id: string
          linked_event_id: string | null
          order_index: number
          push_button_enabled: boolean | null
          section_type: string
          success_screen_order: string | null
          title: string | null
          updated_at: string
          whatsapp_button_enabled: boolean | null
          whatsapp_button_message: string | null
          whatsapp_button_phone: string | null
        }
        Insert: {
          account_creation_role?: Database["public"]["Enums"]["app_role"] | null
          confirmation_active?: boolean | null
          confirmation_event_key?: string | null
          created_at?: string
          default_next_section_id?: string | null
          description?: string | null
          form_definition_id: string
          id?: string
          linked_event_id?: string | null
          order_index: number
          push_button_enabled?: boolean | null
          section_type?: string
          success_screen_order?: string | null
          title?: string | null
          updated_at?: string
          whatsapp_button_enabled?: boolean | null
          whatsapp_button_message?: string | null
          whatsapp_button_phone?: string | null
        }
        Update: {
          account_creation_role?: Database["public"]["Enums"]["app_role"] | null
          confirmation_active?: boolean | null
          confirmation_event_key?: string | null
          created_at?: string
          default_next_section_id?: string | null
          description?: string | null
          form_definition_id?: string
          id?: string
          linked_event_id?: string | null
          order_index?: number
          push_button_enabled?: boolean | null
          section_type?: string
          success_screen_order?: string | null
          title?: string | null
          updated_at?: string
          whatsapp_button_enabled?: boolean | null
          whatsapp_button_message?: string | null
          whatsapp_button_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_sections_default_next_section_id_fkey"
            columns: ["default_next_section_id"]
            isOneToOne: false
            referencedRelation: "form_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_sections_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_sections_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          created_at: string
          endereco_completo: string
          geocoding_match_score: number | null
          geocoding_precision:
            | Database["public"]["Enums"]["geocoding_precision"]
            | null
          latitude: number | null
          longitude: number | null
          provider: string | null
          status: string
        }
        Insert: {
          created_at?: string
          endereco_completo: string
          geocoding_match_score?: number | null
          geocoding_precision?:
            | Database["public"]["Enums"]["geocoding_precision"]
            | null
          latitude?: number | null
          longitude?: number | null
          provider?: string | null
          status: string
        }
        Update: {
          created_at?: string
          endereco_completo?: string
          geocoding_match_score?: number | null
          geocoding_precision?:
            | Database["public"]["Enums"]["geocoding_precision"]
            | null
          latitude?: number | null
          longitude?: number | null
          provider?: string | null
          status?: string
        }
        Relationships: []
      }
      import_audit_log: {
        Row: {
          action: string
          affected_count: number
          created_at: string
          details: Json
          id: string
          import_id: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          affected_count?: number
          created_at?: string
          details?: Json
          id?: string
          import_id?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          affected_count?: number
          created_at?: string
          details?: Json
          id?: string
          import_id?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_log_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          contact_id: string | null
          created_at: string
          erro: string | null
          id: string
          import_id: string
          linha: number
          preview: Json | null
          raw: Json
          status: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          import_id: string
          linha: number
          preview?: Json | null
          raw: Json
          status?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          import_id?: string
          linha?: number
          preview?: Json | null
          raw?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          atualizados: number
          created_at: string
          created_by: string | null
          criados: number
          duplicados: number
          erro_msg: string | null
          erros: number
          file_name: string | null
          file_path: string
          id: string
          mapeamento: Json
          status: Database["public"]["Enums"]["import_status"]
          total: number
          updated_at: string
        }
        Insert: {
          atualizados?: number
          created_at?: string
          created_by?: string | null
          criados?: number
          duplicados?: number
          erro_msg?: string | null
          erros?: number
          file_name?: string | null
          file_path: string
          id?: string
          mapeamento?: Json
          status?: Database["public"]["Enums"]["import_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          atualizados?: number
          created_at?: string
          created_by?: string | null
          criados?: number
          duplicados?: number
          erro_msg?: string | null
          erros?: number
          file_name?: string | null
          file_path?: string
          id?: string
          mapeamento?: Json
          status?: Database["public"]["Enums"]["import_status"]
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      inbound_messages: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          conteudo: string | null
          from_name: string | null
          from_phone: string | null
          id: string
          instance_id: string | null
          is_system_event: boolean
          latitude: number | null
          location_name: string | null
          longitude: number | null
          media_download_failed_at: string | null
          media_filename: string | null
          media_mime: string | null
          media_path: string | null
          media_size: number | null
          media_url: string | null
          payload: Json | null
          reaction_emoji: string | null
          reaction_target_wa_id: string | null
          read_at: string | null
          received_at: string
          reply_to_wa_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          shared_contacts: Json | null
          tipo: string | null
          wa_message_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          conteudo?: string | null
          from_name?: string | null
          from_phone?: string | null
          id?: string
          instance_id?: string | null
          is_system_event?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          media_download_failed_at?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_size?: number | null
          media_url?: string | null
          payload?: Json | null
          reaction_emoji?: string | null
          reaction_target_wa_id?: string | null
          read_at?: string | null
          received_at?: string
          reply_to_wa_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shared_contacts?: Json | null
          tipo?: string | null
          wa_message_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          conteudo?: string | null
          from_name?: string | null
          from_phone?: string | null
          id?: string
          instance_id?: string | null
          is_system_event?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          media_download_failed_at?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_size?: number | null
          media_url?: string | null
          payload?: Json | null
          reaction_emoji?: string | null
          reaction_target_wa_id?: string | null
          read_at?: string | null
          received_at?: string
          reply_to_wa_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shared_contacts?: Json | null
          tipo?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_pages: {
        Row: {
          content: string
          id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          id?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_events: {
        Row: {
          contact_id: string | null
          id: string
          payload: Json | null
          received_at: string
          recipient_id: string | null
          tipo: string
        }
        Insert: {
          contact_id?: string | null
          id?: string
          payload?: Json | null
          received_at?: string
          recipient_id?: string | null
          tipo: string
        }
        Update: {
          contact_id?: string | null
          id?: string
          payload?: Json | null
          received_at?: string
          recipient_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          active: boolean
          archived_at: string | null
          body: string
          buttons: Json
          category: string | null
          created_at: string
          created_by: string | null
          event_key: string | null
          id: string
          kind: string
          link: string | null
          link_description: string | null
          link_image: string | null
          link_title: string | null
          media_filename: string | null
          media_mime: string | null
          media_path: string | null
          media_url: string | null
          shortcut: string | null
          title: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          body: string
          buttons?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          event_key?: string | null
          id?: string
          kind: string
          link?: string | null
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_url?: string | null
          shortcut?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          body?: string
          buttons?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          event_key?: string | null
          id?: string
          kind?: string
          link?: string | null
          link_description?: string | null
          link_image?: string | null
          link_title?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_url?: string | null
          shortcut?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          batch_id: string | null
          body: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          cta_kind: string | null
          cta_label: string | null
          cta_payload: Json | null
          expires_at: string | null
          id: string
          image_url: string | null
          kind: string
          mission_id: string | null
          read_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          body?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          cta_kind?: string | null
          cta_label?: string | null
          cta_payload?: Json | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          mission_id?: string | null
          read_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          body?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          cta_kind?: string | null
          cta_label?: string | null
          cta_payload?: Json | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          mission_id?: string | null
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "agitation_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          contact_id: string | null
          created_at: string
          full_name: string | null
          id: string
          inbox_access: boolean
          invited_by: string | null
          requested_role: Database["public"]["Enums"]["app_role"] | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["user_access_status"]
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          inbox_access?: boolean
          invited_by?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"] | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["user_access_status"]
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          inbox_access?: boolean
          invited_by?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"] | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["user_access_status"]
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          contact_id: string | null
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          auth: string
          contact_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          auth?: string
          contact_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_triage_decisions: {
        Row: {
          contact_id: string
          created_at: string
          decision: string
          id: string
          segment_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          decision: string
          id?: string
          segment_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          decision?: string
          id?: string
          segment_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_triage_decisions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_triage_decisions_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_triage_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          label: string | null
          segment_id: string
          token: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          segment_id: string
          token: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          segment_id?: string
          token?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "segment_triage_shares_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          filtro: Json
          id: string
          member_ids: string[]
          nome: string
          tipo: Database["public"]["Enums"]["segment_tipo"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          filtro?: Json
          id?: string
          member_ids?: string[]
          nome: string
          tipo?: Database["public"]["Enums"]["segment_tipo"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          filtro?: Json
          id?: string
          member_ids?: string[]
          nome?: string
          tipo?: Database["public"]["Enums"]["segment_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      system_notification_settings: {
        Row: {
          body_template: string
          key: string
          recipient_roles: string[]
          title_template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_template: string
          key: string
          recipient_roles?: string[]
          title_template: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_template?: string
          key?: string
          recipient_roles?: string[]
          title_template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          categoria: Database["public"]["Enums"]["tag_categoria"]
          cor: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["tag_categoria"]
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["tag_categoria"]
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      territory_contact_logs: {
        Row: {
          action: Database["public"]["Enums"]["territory_log_action"]
          contact_id: string
          created_at: string
          follow_up_at: string | null
          follow_up_by: string | null
          follow_up_status: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["territory_log_action"]
          contact_id: string
          created_at?: string
          follow_up_at?: string | null
          follow_up_by?: string | null
          follow_up_status?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["territory_log_action"]
          contact_id?: string
          created_at?: string
          follow_up_at?: string | null
          follow_up_by?: string | null
          follow_up_status?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "territory_contact_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_form_links: {
        Row: {
          created_at: string
          created_by_user_id: string
          expires_at: string | null
          form_definition_id: string | null
          id: string
          is_active: boolean
          label: string | null
          metadata: Json
          source_form_type: Database["public"]["Enums"]["source_form_type"]
          source_module: Database["public"]["Enums"]["source_module"]
          token: string
          updated_at: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          expires_at?: string | null
          form_definition_id?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          metadata?: Json
          source_form_type: Database["public"]["Enums"]["source_form_type"]
          source_module: Database["public"]["Enums"]["source_module"]
          token: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          expires_at?: string | null
          form_definition_id?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          metadata?: Json
          source_form_type?: Database["public"]["Enums"]["source_form_type"]
          source_module?: Database["public"]["Enums"]["source_module"]
          token?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "tracked_form_links_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_territory_scopes: {
        Row: {
          bairro: string | null
          cidade: string | null
          created_at: string
          created_by: string | null
          id: string
          uf: string | null
          user_id: string
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          uf?: string | null
          user_id: string
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          uf?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_log: {
        Row: {
          erro: string | null
          evento: string
          id: string
          payload: Json | null
          processado: boolean
          provider: string
          received_at: string
        }
        Insert: {
          erro?: string | null
          evento: string
          id?: string
          payload?: Json | null
          processado?: boolean
          provider?: string
          received_at?: string
        }
        Update: {
          erro?: string | null
          evento?: string
          id?: string
          payload?: Json | null
          processado?: boolean
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
      whatsapp_flow_sessions: {
        Row: {
          ad_referral: Json | null
          answers: Json
          completed_at: string | null
          contact_id: string | null
          created_at: string
          current_step_index: number
          expires_at: string
          flow_id: string
          id: string
          invalid_attempts: number
          last_prompt_at: string | null
          path_key: string
          pending_multi: Json
          phone: string
          status: string
          trigger_kind: string | null
          updated_at: string
        }
        Insert: {
          ad_referral?: Json | null
          answers?: Json
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          current_step_index?: number
          expires_at?: string
          flow_id: string
          id?: string
          invalid_attempts?: number
          last_prompt_at?: string | null
          path_key?: string
          pending_multi?: Json
          phone: string
          status?: string
          trigger_kind?: string | null
          updated_at?: string
        }
        Update: {
          ad_referral?: Json | null
          answers?: Json
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          current_step_index?: number
          expires_at?: string
          flow_id?: string
          id?: string
          invalid_attempts?: number
          last_prompt_at?: string | null
          path_key?: string
          pending_multi?: Json
          phone?: string
          status?: string
          trigger_kind?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_flow_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_flow_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_flow_steps: {
        Row: {
          catalog_field_key: string
          created_at: string
          flow_id: string
          id: string
          kind: string
          option_routes: Json
          options: Json
          order_index: number
          path_key: string
          prompt: string
          required: boolean
          response_kind: string
          updated_at: string
        }
        Insert: {
          catalog_field_key: string
          created_at?: string
          flow_id: string
          id?: string
          kind?: string
          option_routes?: Json
          options?: Json
          order_index?: number
          path_key?: string
          prompt: string
          required?: boolean
          response_kind?: string
          updated_at?: string
        }
        Update: {
          catalog_field_key?: string
          created_at?: string
          flow_id?: string
          id?: string
          kind?: string
          option_routes?: Json
          options?: Json
          order_index?: number
          path_key?: string
          prompt?: string
          required?: boolean
          response_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_flows: {
        Row: {
          active: boolean
          allow_update_existing: boolean
          closing_message: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          opening_message: string
          priority: number
          trigger_ad_ids: string[]
          trigger_keywords: string[]
          trigger_on_ad: boolean
          trigger_on_first_contact: boolean
          updated_at: string
          whatsapp_template_id: string | null
        }
        Insert: {
          active?: boolean
          allow_update_existing?: boolean
          closing_message?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          opening_message?: string
          priority?: number
          trigger_ad_ids?: string[]
          trigger_keywords?: string[]
          trigger_on_ad?: boolean
          trigger_on_first_contact?: boolean
          updated_at?: string
          whatsapp_template_id?: string | null
        }
        Update: {
          active?: boolean
          allow_update_existing?: boolean
          closing_message?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          opening_message?: string
          priority?: number
          trigger_ad_ids?: string[]
          trigger_keywords?: string[]
          trigger_on_ad?: boolean
          trigger_on_first_contact?: boolean
          updated_at?: string
          whatsapp_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_flows_whatsapp_template_id_fkey"
            columns: ["whatsapp_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          config: Json
          created_at: string
          id: string
          inbound_to_inbox_enabled: boolean
          last_ping: string | null
          nome: string
          numero_conectado: string | null
          provider: string
          rate_per_minute: number
          status: Database["public"]["Enums"]["instance_status"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          inbound_to_inbox_enabled?: boolean
          last_ping?: string | null
          nome: string
          numero_conectado?: string | null
          provider?: string
          rate_per_minute?: number
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          inbound_to_inbox_enabled?: boolean
          last_ping?: string | null
          nome?: string
          numero_conectado?: string | null
          provider?: string
          rate_per_minute?: number
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body_text: string
          buttons: Json
          category: string
          created_at: string
          created_by: string | null
          example_values: Json
          footer_text: string | null
          header_example: string | null
          header_text: string | null
          header_type: string
          id: string
          language: string
          meta_template_id: string | null
          name: string
          parameter_format: string
          rejected_reason: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          body_text?: string
          buttons?: Json
          category?: string
          created_at?: string
          created_by?: string | null
          example_values?: Json
          footer_text?: string | null
          header_example?: string | null
          header_text?: string | null
          header_type?: string
          id?: string
          language?: string
          meta_template_id?: string | null
          name: string
          parameter_format?: string
          rejected_reason?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          body_text?: string
          buttons?: Json
          category?: string
          created_at?: string
          created_by?: string | null
          example_values?: Json
          footer_text?: string | null
          header_example?: string | null
          header_text?: string | null
          header_type?: string
          id?: string
          language?: string
          meta_template_id?: string | null
          name?: string
          parameter_format?: string
          rejected_reason?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_contact_source: {
        Args: {
          _contact_id: string
          _event_type: Database["public"]["Enums"]["source_event_type"]
          _metadata?: Json
          _source_form_type: Database["public"]["Enums"]["source_form_type"]
          _source_link_id: string
          _source_module: Database["public"]["Enums"]["source_module"]
          _source_user_id: string
        }
        Returns: string
      }
      assign_mission_direct: {
        Args: { _count: number; _mission_id: string; _user_id: string }
        Returns: {
          claim_id: string
          task_ids: string[]
        }[]
      }
      assign_mission_tasks_to_user: {
        Args: { _mission_id: string; _task_ids: string[]; _user_id: string }
        Returns: {
          claim_id: string
          task_ids: string[]
        }[]
      }
      build_endereco_completo: {
        Args: {
          p_bairro: string
          p_cep: string
          p_cidade: string
          p_complemento: string
          p_endereco: string
          p_numero: string
          p_uf: string
        }
        Returns: string
      }
      claim_mission_batch: {
        Args: { _mission_id: string }
        Returns: {
          claim_id: string
          task_ids: string[]
        }[]
      }
      complete_mission_claim: {
        Args: { _claim_id: string }
        Returns: undefined
      }
      detect_contact_duplicates_for: { Args: { _id: string }; Returns: number }
      link_or_create_user_contact: {
        Args: {
          _email: string
          _full_name: string
          _phone: string
          _user_id: string
        }
        Returns: string
      }
      merge_contacts: {
        Args: {
          p_confianca?: string
          p_field_overrides?: Json
          p_merged: string
          p_motivo?: string
          p_survivor: string
        }
        Returns: string
      }
      name_is_subset: { Args: { _a: string; _b: string }; Returns: boolean }
      name_tokens: { Args: { _n: string }; Returns: string[] }
      normalize_phone_br: { Args: { input: string }; Returns: string }
      notify_mission_targets:
        | {
            Args: {
              _body: string
              _mission_id: string
              _title: string
              _user_ids: string[]
            }
            Returns: {
              batch_id: string | null
              body: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              cta_kind: string | null
              cta_label: string | null
              cta_payload: Json | null
              expires_at: string | null
              id: string
              image_url: string | null
              kind: string
              mission_id: string | null
              read_at: string | null
              title: string
              updated_at: string
              user_id: string
            }[]
            SetofOptions: {
              from: "*"
              to: "notifications"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: {
              _batch_id?: string
              _body: string
              _mission_id: string
              _title: string
              _user_ids: string[]
            }
            Returns: {
              batch_id: string | null
              body: string | null
              cancelled_at: string | null
              cancelled_by: string | null
              created_at: string
              created_by: string | null
              cta_kind: string | null
              cta_label: string | null
              cta_payload: Json | null
              expires_at: string | null
              id: string
              image_url: string | null
              kind: string
              mission_id: string | null
              read_at: string | null
              title: string
              updated_at: string
              user_id: string
            }[]
            SetofOptions: {
              from: "*"
              to: "notifications"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      phone_last8: { Args: { input: string }; Returns: string }
      recalc_conversation_unread: {
        Args: { p_contact_id?: string; p_from_phone?: string }
        Returns: undefined
      }
      release_mission_pending: {
        Args: { _mission_id: string; _older_than_hours?: number }
        Returns: undefined
      }
      rescan_contact_duplicates: { Args: never; Returns: number }
      resolve_tracked_link: {
        Args: { _token: string }
        Returns: {
          created_by_name: string
          expired: boolean
          id: string
          is_active: boolean
          source_form_type: Database["public"]["Enums"]["source_form_type"]
          source_module: Database["public"]["Enums"]["source_module"]
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      agitacao_action:
        | "whatsapp_aberto"
        | "contato_realizado"
        | "observacao"
        | "pediu_atualizacao"
        | "nao_respondeu"
      app_role:
        | "admin"
        | "operador"
        | "leitor"
        | "vrm"
        | "territorio"
        | "comunicacao"
        | "agitador"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "done"
        | "canceled"
      campaign_tipo: "text" | "image" | "document" | "link"
      capture_channel: "formulario_publico" | "captacao_atribuida"
      contact_lifecycle_status:
        | "importado_aguardando_recadastro"
        | "link_enviado"
        | "recadastro_iniciado"
        | "recadastro_concluido"
        | "nao_respondeu"
        | "telefone_invalido"
        | "precisa_revisao"
        | "duplicado_possivel"
        | "duplicado_mesclado"
        | "nao_enviar"
      contact_origem: "recadastro" | "inscricao" | "import" | "manual"
      contact_phone_status:
        | "valido"
        | "precisa_revisao"
        | "invalido"
        | "sem_ddd"
        | "sem_nono_digito"
        | "duplicado_possivel"
      geocoding_precision: "exato" | "rua" | "cep" | "cidade"
      geocoding_status:
        | "pendente"
        | "localizado"
        | "aproximado"
        | "erro"
        | "precisa_revisao"
      import_status:
        | "pending"
        | "processing"
        | "done"
        | "error"
        | "previewed"
        | "confirmed"
        | "canceled"
        | "reverted"
      instance_status: "disconnected" | "qr" | "connected" | "error"
      recipient_status:
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "opted_out"
        | "canceled"
      segment_tipo: "dinamico" | "estatico"
      source_event_type:
        | "contato_criado"
        | "contato_atualizado"
        | "inscricao_simples"
        | "cadastro_completo"
        | "link_aberto"
        | "origem_atribuida"
      source_form_type: "cadastro_completo" | "receber_informacoes"
      source_module:
        | "gestao_base"
        | "territorio"
        | "agitacao"
        | "mapa"
        | "inbox"
        | "ficha_contato"
        | "relacionamento"
        | "link_publico"
        | "formulario_publico"
        | "importacao"
        | "manual"
        | "outro"
      tag_categoria:
        | "perfil"
        | "territorio"
        | "acao"
        | "interno"
        | "origem"
        | "interesse"
        | "prioridade"
        | "restricao"
        | "campanha"
      territory_log_action:
        | "whatsapp_aberto"
        | "contato_realizado"
        | "nao_encontrado"
        | "pediu_atualizacao"
        | "observacao"
      user_access_status:
        | "ativo"
        | "suspenso"
        | "revogado"
        | "pendente_aprovacao"
      whatsapp_status:
        | "desconhecido"
        | "confirmado"
        | "invalido"
        | "erro_envio"
        | "opt_out"
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
    Enums: {
      agitacao_action: [
        "whatsapp_aberto",
        "contato_realizado",
        "observacao",
        "pediu_atualizacao",
        "nao_respondeu",
      ],
      app_role: [
        "admin",
        "operador",
        "leitor",
        "vrm",
        "territorio",
        "comunicacao",
        "agitador",
      ],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "done",
        "canceled",
      ],
      campaign_tipo: ["text", "image", "document", "link"],
      capture_channel: ["formulario_publico", "captacao_atribuida"],
      contact_lifecycle_status: [
        "importado_aguardando_recadastro",
        "link_enviado",
        "recadastro_iniciado",
        "recadastro_concluido",
        "nao_respondeu",
        "telefone_invalido",
        "precisa_revisao",
        "duplicado_possivel",
        "duplicado_mesclado",
        "nao_enviar",
      ],
      contact_origem: ["recadastro", "inscricao", "import", "manual"],
      contact_phone_status: [
        "valido",
        "precisa_revisao",
        "invalido",
        "sem_ddd",
        "sem_nono_digito",
        "duplicado_possivel",
      ],
      geocoding_precision: ["exato", "rua", "cep", "cidade"],
      geocoding_status: [
        "pendente",
        "localizado",
        "aproximado",
        "erro",
        "precisa_revisao",
      ],
      import_status: [
        "pending",
        "processing",
        "done",
        "error",
        "previewed",
        "confirmed",
        "canceled",
        "reverted",
      ],
      instance_status: ["disconnected", "qr", "connected", "error"],
      recipient_status: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "opted_out",
        "canceled",
      ],
      segment_tipo: ["dinamico", "estatico"],
      source_event_type: [
        "contato_criado",
        "contato_atualizado",
        "inscricao_simples",
        "cadastro_completo",
        "link_aberto",
        "origem_atribuida",
      ],
      source_form_type: ["cadastro_completo", "receber_informacoes"],
      source_module: [
        "gestao_base",
        "territorio",
        "agitacao",
        "mapa",
        "inbox",
        "ficha_contato",
        "relacionamento",
        "link_publico",
        "formulario_publico",
        "importacao",
        "manual",
        "outro",
      ],
      tag_categoria: [
        "perfil",
        "territorio",
        "acao",
        "interno",
        "origem",
        "interesse",
        "prioridade",
        "restricao",
        "campanha",
      ],
      territory_log_action: [
        "whatsapp_aberto",
        "contato_realizado",
        "nao_encontrado",
        "pediu_atualizacao",
        "observacao",
      ],
      user_access_status: [
        "ativo",
        "suspenso",
        "revogado",
        "pendente_aprovacao",
      ],
      whatsapp_status: [
        "desconhecido",
        "confirmado",
        "invalido",
        "erro_envio",
        "opt_out",
      ],
    },
  },
} as const
