import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Send, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listWhatsappTemplates,
  saveWhatsappTemplateDraft,
  deleteWhatsappTemplateDraft,
  submitWhatsappTemplate,
  TEMPLATE_VARIABLES,
  type WhatsappTemplateRow,
} from "@/lib/whatsapp-templates.functions";

export const Route = createFileRoute("/_authenticated/comunicacao/templates")({
  head: () => ({
    meta: [
      { title: "Templates oficiais — Comunicação" },
      {
        name: "description",
        content:
          "Crie e acompanhe os modelos de mensagem aprovados pela Meta para envios no WhatsApp oficial.",
      },
      { property: "og:title", content: "Templates oficiais — Comunicação" },
      {
        property: "og:description",
        content: "Modelos de mensagem do WhatsApp oficial e situação de aprovação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS_UI: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pendente", className: "bg-blue-100 text-blue-800 border-blue-300" },
  approved: { label: "Aprovado", className: "bg-green-100 text-green-800 border-green-300" },
  rejected: { label: "Rejeitado", className: "bg-red-100 text-red-800 border-red-300" },
  paused: { label: "Pausado", className: "bg-yellow-100 text-yellow-900 border-yellow-300" },
  disabled: { label: "Desativado", className: "bg-yellow-100 text-yellow-900 border-yellow-300" },
};

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing (divulgação)",
  UTILITY: "Utilidade (aviso/serviço)",
  AUTHENTICATION: "Autenticação (código)",
};

type FormState = {
  id?: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  body_text: string;
  header_type: "NONE" | "TEXT";
  header_text: string;
  footer_text: string;
  variable_labels: string[];
  example_values: string[];
};

const EMPTY: FormState = {
  name: "",
  category: "UTILITY",
  language: "pt_BR",
  body_text: "",
  header_type: "NONE",
  header_text: "",
  footer_text: "",
  variable_labels: [],
  example_values: [],
};

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhatsappTemplates);
  const saveFn = useServerFn(saveWhatsappTemplateDraft);
  const deleteFn = useServerFn(deleteWhatsappTemplateDraft);
  const submitFn = useServerFn(submitWhatsappTemplate);

  const [form, setForm] = useState<FormState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listFn(),
  });

  const save = useMutation({
    mutationFn: (payload: FormState) =>
      saveFn({
        data: {
          ...(payload.id ? { id: payload.id } : {}),
          name: payload.name.trim().toLowerCase(),
          language: payload.language,
          category: payload.category,
          body_text: payload.body_text,
          variable_labels: payload.variable_labels,
          example_values: payload.example_values,
          header_type: payload.header_type,
          header_text: payload.header_type === "TEXT" ? payload.header_text : null,
          footer_text: payload.footer_text.trim() ? payload.footer_text.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Rascunho salvo.");
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Rascunho excluído.");
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir."),
  });

  const submit = useMutation({
    mutationFn: (id: string) => submitFn({ data: { id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Modelo enviado para aprovação da Meta.");
        setSubmitError(null);
        setForm(null);
      } else {
        setSubmitError(res.error);
        toast.error("A Meta recusou o envio.");
      }
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Falha ao enviar.";
      setSubmitError(msg);
      toast.error(msg);
    },
  });

  function startNew() {
    setSubmitError(null);
    setForm({ ...EMPTY });
  }

  function startEdit(t: WhatsappTemplateRow) {
    setSubmitError(t.rejected_reason ?? null);
    setForm({
      id: t.id,
      name: t.name,
      category: (t.category as FormState["category"]) ?? "UTILITY",
      language: t.language,
      body_text: t.body_text,
      header_type: (t.header_type as FormState["header_type"]) ?? "NONE",
      header_text: t.header_text ?? "",
      footer_text: t.footer_text ?? "",
      variable_labels: t.variable_labels,
      example_values: t.example_values,
    });
  }

  function addVariable() {
    setForm((f) => {
      if (!f) return f;
      const n = f.variable_labels.length + 1;
      return {
        ...f,
        body_text: `${f.body_text}{{${n}}}`,
        variable_labels: [...f.variable_labels, "primeiro_nome"],
        example_values: [...f.example_values, ""],
      };
    });
  }

  function removeLastVariable() {
    setForm((f) => {
      if (!f || f.variable_labels.length === 0) return f;
      const n = f.variable_labels.length;
      return {
        ...f,
        body_text: f.body_text.replaceAll(`{{${n}}}`, ""),
        variable_labels: f.variable_labels.slice(0, -1),
        example_values: f.example_values.slice(0, -1),
      };
    });
  }

  const templates = q.data?.templates ?? [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Templates oficiais (Meta)</h1>
        <p className="text-sm text-muted-foreground">
          Modelos aprovados pela Meta, necessários para iniciar conversas fora da janela de 24
          horas. As variáveis são numeradas ({"{{1}}"}, {"{{2}}"}…) e a ordem importa. Isto é
          separado da biblioteca de mensagens livres.
        </p>
      </header>

      {!form && (
        <Button onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo modelo
        </Button>
      )}

      {form && (
        <section className="rounded-lg border-2 bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{form.id ? "Editar rascunho" : "Novo modelo"}</h2>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
              <X className="h-4 w-4 mr-1" /> Fechar
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nome técnico</Label>
              <Input
                id="tpl-name"
                value={form.name}
                placeholder="convite_plenaria"
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
                }
              />
              <p className="text-xs text-muted-foreground">
                Só minúsculas, números e underscore.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as FormState["category"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cabeçalho</Label>
              <Select
                value={form.header_type}
                onValueChange={(v) =>
                  setForm({ ...form, header_type: v as FormState["header_type"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sem cabeçalho</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.header_type === "TEXT" && (
              <div className="space-y-1.5">
                <Label htmlFor="tpl-header">Texto do cabeçalho</Label>
                <Input
                  id="tpl-header"
                  value={form.header_text}
                  onChange={(e) => setForm({ ...form, header_text: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Corpo da mensagem</Label>
            <Textarea
              id="tpl-body"
              rows={5}
              value={form.body_text}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              placeholder="Olá {{1}}, confirme sua presença aqui: {{2}}"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addVariable}>
                <Plus className="h-4 w-4 mr-1" /> variável
              </Button>
              {form.variable_labels.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={removeLastVariable}>
                  Remover última variável
                </Button>
              )}
            </div>
          </div>

          {form.variable_labels.length > 0 && (
            <div className="space-y-3">
              <Label>Variáveis</Label>
              {form.variable_labels.map((label, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-[auto_1fr_1fr] items-end">
                  <span className="text-sm font-mono pb-2">{`{{${i + 1}}}`}</span>
                  <Select
                    value={label}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        variable_labels: form.variable_labels.map((l, j) => (j === i ? v : l)),
                      })
                    }
                  >
                    <SelectTrigger aria-label={`Variável ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_VARIABLES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`Exemplo da variável ${i + 1}`}
                    placeholder="Valor de exemplo"
                    value={form.example_values[i] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        example_values: form.variable_labels.map((_, j) =>
                          j === i ? e.target.value : (form.example_values[j] ?? ""),
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tpl-footer">Rodapé (opcional)</Label>
            <Input
              id="tpl-footer"
              value={form.footer_text}
              onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
            />
          </div>

          {submitError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-1" /> Salvar rascunho
            </Button>
            <Button
              variant="secondary"
              disabled={!form.id || submit.isPending}
              onClick={() => form.id && submit.mutate(form.id)}
            >
              <Send className="h-4 w-4 mr-1" /> Enviar para aprovação
            </Button>
            {!form.id && (
              <span className="text-xs text-muted-foreground self-center">
                Salve o rascunho antes de enviar para a Meta.
              </span>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Modelos cadastrados</h2>
        {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!q.isLoading && templates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum modelo criado ainda. Crie o primeiro para poder iniciar conversas no WhatsApp
            oficial.
          </p>
        )}
        {templates.map((t) => {
          const ui = STATUS_UI[t.status] ?? STATUS_UI["draft"]!;
          return (
            <div key={t.id} className="rounded-lg border-2 bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{t.name}</span>
                <Badge variant="outline" className={ui.className}>
                  {ui.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {CATEGORY_LABEL[t.category] ?? t.category} · {t.language}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{t.body_text}</p>
              {t.rejected_reason && (
                <p className="text-xs text-red-700">Motivo: {t.rejected_reason}</p>
              )}
              {t.status === "draft" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(t)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={submit.isPending}
                    onClick={() => submit.mutate(t.id)}
                  >
                    <Send className="h-4 w-4 mr-1" /> Enviar para aprovação
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={del.isPending}
                    onClick={() => del.mutate(t.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
