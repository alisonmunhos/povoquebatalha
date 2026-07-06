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
        }
        Relationships: [
          {
            foreignKeyName: "automations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
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
        ]
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
          arquivado_at: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          coletivo_alicerce: boolean | null
          como_conheceu: string | null
          complemento: string | null
          consentimento_at: string | null
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
          whatsapp_status: Database["public"]["Enums"]["whatsapp_status"] | null
          zona_eleitoral: string | null
        }
        Insert: {
          arquivado_at?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          coletivo_alicerce?: boolean | null
          como_conheceu?: string | null
          complemento?: string | null
          consentimento_at?: string | null
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
          whatsapp_status?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
          zona_eleitoral?: string | null
        }
        Update: {
          arquivado_at?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          coletivo_alicerce?: boolean | null
          como_conheceu?: string | null
          complemento?: string | null
          consentimento_at?: string | null
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
          whatsapp_status?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
          zona_eleitoral?: string | null
        }
        Relationships: [
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
          assigned_to: string | null
          contact_id: string | null
          created_at: string
          flagged: boolean
          from_phone: string | null
          id: string
          last_message_at: string | null
          last_message_direction: string | null
          last_message_preview: string | null
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          flagged?: boolean
          from_phone?: string | null
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          flagged?: boolean
          from_phone?: string | null
          id?: string
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
          contact_id: string
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
          read_at: string | null
          sent_by: string | null
          status: string
          template_id: string | null
          zaap_id: string | null
        }
        Insert: {
          contact_id: string
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
          read_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: string | null
          zaap_id?: string | null
        }
        Update: {
          contact_id?: string
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
          read_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: string | null
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
          form_definition_id: string
          help_text: string | null
          id: string
          label: string
          order_index: number
          required: boolean
          source: string
        }
        Insert: {
          catalog_field_key?: string | null
          created_at?: string
          form_definition_id: string
          help_text?: string | null
          id?: string
          label: string
          order_index: number
          required?: boolean
          source: string
        }
        Update: {
          catalog_field_key?: string | null
          created_at?: string
          form_definition_id?: string
          help_text?: string | null
          id?: string
          label?: string
          order_index?: number
          required?: boolean
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
        ]
      }
      form_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          event_key: string
          id: string
          is_active: boolean
          is_fixed: boolean
          slug: string
          source_form_type: Database["public"]["Enums"]["source_form_type"]
          success_screen_order: string
          title: string
          tracked_form_link_id: string | null
          updated_at: string
          updated_by: string | null
          whatsapp_button_enabled: boolean
          whatsapp_button_message: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_key: string
          id?: string
          is_active?: boolean
          is_fixed?: boolean
          slug: string
          source_form_type: Database["public"]["Enums"]["source_form_type"]
          success_screen_order?: string
          title: string
          tracked_form_link_id?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_button_enabled?: boolean
          whatsapp_button_message?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_key?: string
          id?: string
          is_active?: boolean
          is_fixed?: boolean
          slug?: string
          source_form_type?: Database["public"]["Enums"]["source_form_type"]
          success_screen_order?: string
          title?: string
          tracked_form_link_id?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp_button_enabled?: boolean
          whatsapp_button_message?: string | null
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
          media_filename: string | null
          media_mime: string | null
          media_size: number | null
          media_url: string | null
          payload: Json | null
          read_at: string | null
          received_at: string
          resolved_at: string | null
          resolved_by: string | null
          tipo: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          conteudo?: string | null
          from_name?: string | null
          from_phone?: string | null
          id?: string
          instance_id?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_size?: number | null
          media_url?: string | null
          payload?: Json | null
          read_at?: string | null
          received_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          tipo?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          conteudo?: string | null
          from_name?: string | null
          from_phone?: string | null
          id?: string
          instance_id?: string | null
          media_filename?: string | null
          media_mime?: string | null
          media_size?: number | null
          media_url?: string | null
          payload?: Json | null
          read_at?: string | null
          received_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          tipo?: string | null
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
          category: string | null
          created_at: string
          created_by: string | null
          event_key: string | null
          id: string
          kind: string
          link: string | null
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
          category?: string | null
          created_at?: string
          created_by?: string | null
          event_key?: string | null
          id?: string
          kind: string
          link?: string | null
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
          category?: string | null
          created_at?: string
          created_by?: string | null
          event_key?: string | null
          id?: string
          kind?: string
          link?: string | null
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
      profiles: {
        Row: {
          contact_id: string | null
          created_at: string
          full_name: string | null
          id: string
          invited_by: string | null
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
          invited_by?: string | null
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
          invited_by?: string | null
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
        Relationships: []
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
      normalize_phone_br: { Args: { input: string }; Returns: string }
      phone_last8: { Args: { input: string }; Returns: string }
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
