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
          midia_url: string | null
          nome: string
          segment_id: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          tipo: Database["public"]["Enums"]["campaign_tipo"]
          total_destinatarios: number
          total_entregues: number
          total_enviados: number
          total_falhas: number
          total_lidos: number
          updated_at: string
        }
        Insert: {
          agendado_para?: string | null
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
          midia_url?: string | null
          nome: string
          segment_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          tipo?: Database["public"]["Enums"]["campaign_tipo"]
          total_destinatarios?: number
          total_entregues?: number
          total_enviados?: number
          total_falhas?: number
          total_lidos?: number
          updated_at?: string
        }
        Update: {
          agendado_para?: string | null
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
          midia_url?: string | null
          nome?: string
          segment_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          tipo?: Database["public"]["Enums"]["campaign_tipo"]
          total_destinatarios?: number
          total_entregues?: number
          total_enviados?: number
          total_falhas?: number
          total_lidos?: number
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
          bairro: string | null
          cep: string | null
          cidade: string | null
          como_conheceu: string | null
          complemento: string | null
          consentimento_whatsapp: boolean
          cpf_hash: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          email: string | null
          endereco: string | null
          id: string
          lat: number | null
          lifecycle_status:
            | Database["public"]["Enums"]["contact_lifecycle_status"]
            | null
          lng: number | null
          nome: string
          nome_normalizado: string | null
          numero: string | null
          observacoes: string | null
          opt_out_at: string | null
          opt_out_token: string
          origem: Database["public"]["Enums"]["contact_origem"]
          origem_detalhe: string | null
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
          quer_voluntariar: boolean | null
          recad_token: string | null
          tipo: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          como_conheceu?: string | null
          complemento?: string | null
          consentimento_whatsapp?: boolean
          cpf_hash?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          endereco?: string | null
          id?: string
          lat?: number | null
          lifecycle_status?:
            | Database["public"]["Enums"]["contact_lifecycle_status"]
            | null
          lng?: number | null
          nome: string
          nome_normalizado?: string | null
          numero?: string | null
          observacoes?: string | null
          opt_out_at?: string | null
          opt_out_token?: string
          origem?: Database["public"]["Enums"]["contact_origem"]
          origem_detalhe?: string | null
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
          quer_voluntariar?: boolean | null
          recad_token?: string | null
          tipo?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          como_conheceu?: string | null
          complemento?: string | null
          consentimento_whatsapp?: boolean
          cpf_hash?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          endereco?: string | null
          id?: string
          lat?: number | null
          lifecycle_status?:
            | Database["public"]["Enums"]["contact_lifecycle_status"]
            | null
          lng?: number | null
          nome?: string
          nome_normalizado?: string | null
          numero?: string | null
          observacoes?: string | null
          opt_out_at?: string | null
          opt_out_token?: string
          origem?: Database["public"]["Enums"]["contact_origem"]
          origem_detalhe?: string | null
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
          quer_voluntariar?: boolean | null
          recad_token?: string | null
          tipo?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
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
          contact_id: string | null
          conteudo: string | null
          from_name: string | null
          from_phone: string | null
          id: string
          instance_id: string | null
          payload: Json | null
          received_at: string
          tipo: string | null
        }
        Insert: {
          contact_id?: string | null
          conteudo?: string | null
          from_name?: string | null
          from_phone?: string | null
          id?: string
          instance_id?: string | null
          payload?: Json | null
          received_at?: string
          tipo?: string | null
        }
        Update: {
          contact_id?: string | null
          conteudo?: string | null
          from_name?: string | null
          from_phone?: string | null
          id?: string
          instance_id?: string | null
          payload?: Json | null
          received_at?: string
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
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          filtro?: Json
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          filtro?: Json
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          categoria: Database["public"]["Enums"]["tag_categoria"]
          cor: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["tag_categoria"]
          cor?: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["tag_categoria"]
          cor?: string
          created_at?: string
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
      normalize_phone_br: { Args: { input: string }; Returns: string }
      phone_last8: { Args: { input: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "operador" | "leitor"
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
      import_status: "pending" | "processing" | "done" | "error"
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
      tag_categoria: "perfil" | "territorio" | "acao" | "interno" | "origem"
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
      app_role: ["admin", "operador", "leitor"],
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
      import_status: ["pending", "processing", "done", "error"],
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
      tag_categoria: ["perfil", "territorio", "acao", "interno", "origem"],
    },
  },
} as const
