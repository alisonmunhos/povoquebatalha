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
          erro: string | null
          failed_at: string | null
          id: string
          message_id: string | null
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
          erro?: string | null
          failed_at?: string | null
          id?: string
          message_id?: string | null
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
          erro?: string | null
          failed_at?: string | null
          id?: string
          message_id?: string | null
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
          custom_fields: Json
          email: string | null
          endereco: string | null
          endereco_completo: string | null
          formas_ajuda: Json
          geocoded_at: string | null
          geocoding_provider: string | null
          geocoding_status:
            | Database["public"]["Enums"]["geocoding_status"]
            | null
          id: string
          import_id: string | null
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
          phone_status:
            | Database["public"]["Enums"]["contact_phone_status"]
            | null
          phone_whatsapp_candidate: string | null
          profissao: string | null
          quer_voluntariar: boolean | null
          recad_token: string | null
          referencia: string | null
          tipo: string | null
          tipo_contato: string | null
          uf: string | null
          updated_at: string
          whatsapp_status: Database["public"]["Enums"]["whatsapp_status"] | null
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
          custom_fields?: Json
          email?: string | null
          endereco?: string | null
          endereco_completo?: string | null
          formas_ajuda?: Json
          geocoded_at?: string | null
          geocoding_provider?: string | null
          geocoding_status?:
            | Database["public"]["Enums"]["geocoding_status"]
            | null
          id?: string
          import_id?: string | null
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
          phone_status?:
            | Database["public"]["Enums"]["contact_phone_status"]
            | null
          phone_whatsapp_candidate?: string | null
          profissao?: string | null
          quer_voluntariar?: boolean | null
          recad_token?: string | null
          referencia?: string | null
          tipo?: string | null
          tipo_contato?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_status?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
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
          custom_fields?: Json
          email?: string | null
          endereco?: string | null
          endereco_completo?: string | null
          formas_ajuda?: Json
          geocoded_at?: string | null
          geocoding_provider?: string | null
          geocoding_status?:
            | Database["public"]["Enums"]["geocoding_status"]
            | null
          id?: string
          import_id?: string | null
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
          phone_status?:
            | Database["public"]["Enums"]["contact_phone_status"]
            | null
          phone_whatsapp_candidate?: string | null
          profissao?: string | null
          quer_voluntariar?: boolean | null
          recad_token?: string | null
          referencia?: string | null
          tipo?: string | null
          tipo_contato?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_status?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          contact_id: string
          conteudo: string
          created_at: string
          erro: string | null
          id: string
          inbound_id: string | null
          message_id: string | null
          origem: string
          sent_by: string | null
          status: string
          template_id: string | null
          zaap_id: string | null
        }
        Insert: {
          contact_id: string
          conteudo: string
          created_at?: string
          erro?: string | null
          id?: string
          inbound_id?: string | null
          message_id?: string | null
          origem: string
          sent_by?: string | null
          status?: string
          template_id?: string | null
          zaap_id?: string | null
        }
        Update: {
          contact_id?: string
          conteudo?: string
          created_at?: string
          erro?: string | null
          id?: string
          inbound_id?: string | null
          message_id?: string | null
          origem?: string
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
      geocode_cache: {
        Row: {
          created_at: string
          endereco_completo: string
          latitude: number | null
          longitude: number | null
          provider: string | null
          status: string
        }
        Insert: {
          created_at?: string
          endereco_completo: string
          latitude?: number | null
          longitude?: number | null
          provider?: string | null
          status: string
        }
        Update: {
          created_at?: string
          endereco_completo?: string
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
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "operador" | "leitor" | "vrm" | "territorio"
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
      app_role: ["admin", "operador", "leitor", "vrm", "territorio"],
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
