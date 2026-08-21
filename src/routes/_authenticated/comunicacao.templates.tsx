import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Plus, Send, Trash2, Save, X, Download, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listWhatsappTemplates,
  saveWhatsappTemplateDraft,
  deleteWhatsappTemplateDraft,
  submitWhatsappTemplate,
  importWhatsappTemplatesFromMeta,
  extractNamedVars,
  TEMPLATE_VARIABLES,
  type WhatsappTemplateRow,
  type TemplateButton,
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
  header_example: string;
  footer_text: string;
  example_values: Record<string, string>;
  buttons: TemplateButton[];
};

const EMPTY: FormState = {
  name: "",
  category: "UTILITY",
  language: "pt_BR",
  body_text: "",
  header_type: "NONE",
  header_text: "",
  header_example: "",
  footer_text: "",
  example_values: {},
  buttons: [],
};

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhatsappTemplates);
  const saveFn = useServerFn(saveWhatsappTemplateDraft);
  const deleteFn = useServerFn(deleteWhatsappTemplateDraft);
  const submitFn = useServerFn(submitWhatsappTemplate);
  const importFn = useServerFn(importWhatsappTemplatesFromMeta);

  const [form, setForm] = useState<FormState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const q = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => listFn(),
  });

  const save = useMutation({
    mutationFn: (payload: FormState) => {
      const usedBody = extractNamedVars(payload.body_text);
      const usedHeader =
        payload.header_type === "TEXT" ? extractNamedVars(payload.header_text) : [];
      const examples: Record<string, string> = {};
      for (const name of usedBody) examples[name] = payload.example_values[name] ?? "";
      return saveFn({
        data: {
          ...(payload.id ? { id: payload.id } : {}),
          name: payload.name.trim().toLowerCase(),
          language: payload.language,
          category: payload.category,
          body_text: payload.body_text,
          example_values: examples,
          header_type: payload.header_type,
          header_text: payload.header_type === "TEXT" ? payload.header_text : null,
          header_example:
            usedHeader.length > 0 && payload.header_example.trim()
              ? payload.header_example.trim()
              : null,
          footer_text: payload.footer_text.trim() ? payload.footer_text.trim() : null,
          buttons: payload.buttons,
        },
      });
    },
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

  const importMeta = useMutation({
    mutationFn: () => importFn(),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`${res.imported} importados, ${res.existing} já existiam.`);
      } else {
        toast.error(res.error);
      }
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível importar da Meta."),
  });

  function startNew() {
    setSubmitError(null);
    setForm({ ...EMPTY, example_values: {} });
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
      header_example: t.header_example ?? "",
      footer_text: t.footer_text ?? "",
      example_values: { ...t.example_values },
      buttons: [...(t.buttons ?? [])],
    });
  }

  /** Insere {{variavel}} na posição do cursor do corpo (ou no final). */
  function insertBodyVariable(name: string) {
    setForm((f) => {
      if (!f) return f;
      const token = `{{${name}}}`;
      const el = bodyRef.current;
      const pos = el ? (el.selectionStart ?? f.body_text.length) : f.body_text.length;
      const body_text = f.body_text.slice(0, pos) + token + f.body_text.slice(pos);
      return {
        ...f,
        body_text,
        example_values: { ...f.example_values, [name]: f.example_values[name] ?? "" },
      };
    });
  }

  // Criação de botão pela UI só suporta tipo URL por enquanto (item 3 do
  // roteiro) — QUICK_REPLY e PHONE_NUMBER continuam existindo no schema/backend
  // pra templates importados da Meta com esses tipos, só não têm criação aqui ainda.
  function addUrlButton() {
    setForm((f) => {
      if (!f || f.buttons.length >= 3) return f;
      return { ...f, buttons: [...f.buttons, { type: "URL", text: "", url: "" }] };
    });
  }
  function updateUrlButton(idx: number, patch: { text?: string; url?: string }) {
    setForm((f) => {
      if (!f) return f;
      return {
        ...f,
        buttons: f.buttons.map((b, i) => (i === idx && b.type === "URL" ? { ...b, ...patch } : b)),
      };
    });
  }
  function removeButton(idx: number) {
    setForm((f) => (f ? { ...f, buttons: f.buttons.filter((_, i) => i !== idx) } : f));
  }

  function insertHeaderVariable(name: string) {
    setForm((f) => {
      if (!f) return f;
      // A Meta permite apenas uma variável no cabeçalho: substitui a anterior.
      const cleaned = f.header_text.replace(/\{\{[a-z_]+\}\}/g, "").trimEnd();
      return { ...f, header_text: `${cleaned}{{${name}}}` };
    });
  }

  const templates = q.data?.templates ?? [];
  const bodyVars = form ? extractNamedVars(form.body_text) : [];
  const headerVar =
    form && form.header_type === "TEXT" ? extractNamedVars(form.header_text)[0] : undefined;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Templates oficiais (Meta)</h1>
        <p className="text-sm text-muted-foreground">
          Modelos aprovados pela Meta, necessários para iniciar conversas fora da janela de 24
          horas. As variáveis usam o nome real (ex.: {"{{primeiro_nome}}"}), iguais aos da
          biblioteca de mensagens livres. Isto é separado das mensagens livres.
        </p>
      </header>

      {!form && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={startNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo modelo
          </Button>
          <Button
            variant="outline"
            disabled={importMeta.isPending}
            onClick={() => importMeta.mutate()}
          >
            <Download className="h-4 w-4 mr-1" />
            {importMeta.isPending ? "Importando…" : "Importar da Meta"}
          </Button>
        </div>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-1" /> variável no cabeçalho
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <DropdownMenuItem key={v} onSelect={() => insertHeaderVariable(v)}>
                        {v}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">
                  A Meta permite apenas uma variável no cabeçalho.
                </p>
                {headerVar && (
                  <Input
                    aria-label={`Exemplo da variável do cabeçalho ${headerVar}`}
                    placeholder={`Exemplo para {{${headerVar}}}`}
                    value={form.header_example}
                    onChange={(e) => setForm({ ...form, header_example: e.target.value })}
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Corpo da mensagem</Label>
            <Textarea
              id="tpl-body"
              ref={bodyRef}
              rows={5}
              value={form.body_text}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              placeholder="Olá {{primeiro_nome}}, confirme sua presença aqui: {{link_inscricao}}"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> variável
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {TEMPLATE_VARIABLES.map((v) => (
                  <DropdownMenuItem key={v} onSelect={() => insertBodyVariable(v)}>
                    {v}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {bodyVars.length > 0 && (
            <div className="space-y-3">
              <Label>Variáveis usadas no texto</Label>
              {bodyVars.map((name) => (
                <div key={name} className="grid gap-2 md:grid-cols-[1fr_1fr] items-center">
                  <span className="text-sm font-mono">{`{{${name}}}`}</span>
                  <Input
                    aria-label={`Exemplo da variável ${name}`}
                    placeholder="Valor de exemplo"
                    value={form.example_values[name] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        example_values: { ...form.example_values, [name]: e.target.value },
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

          <div className="space-y-2">
            <Label>Botões (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Até 3 botões. Criação por aqui só suporta botão de link (URL) por enquanto.
            </p>
            {form.buttons.map((b, idx) =>
              b.type === "URL" ? (
                <div key={idx} className="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-center border rounded-md p-2">
                  <Input
                    aria-label={`Texto do botão ${idx + 1}`}
                    placeholder="Texto (até 25 caracteres)"
                    maxLength={25}
                    value={b.text}
                    onChange={(e) => updateUrlButton(idx, { text: e.target.value })}
                  />
                  <Input
                    aria-label={`URL do botão ${idx + 1}`}
                    placeholder="https://…"
                    value={b.url}
                    onChange={(e) => updateUrlButton(idx, { url: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeButton(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div key={idx} className="flex items-center justify-between gap-2 border rounded-md p-2 text-sm">
                  <span>
                    {b.text} <span className="text-xs text-muted-foreground">({b.type})</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeButton(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={form.buttons.length >= 3}
              onClick={addUrlButton}
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar botão de link
            </Button>
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
            Nenhum modelo criado ainda. Crie o primeiro ou use “Importar da Meta” para trazer os
            que já existem na conta oficial.
          </p>
        )}
        {templates.map((t) => {
          const ui = STATUS_UI[t.status] ?? STATUS_UI["draft"]!;
          const positional = t.parameter_format === "positional";
          return (
            <div key={t.id} className="rounded-lg border-2 bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{t.name}</span>
                <Badge variant="outline" className={ui.className}>
                  {ui.label}
                </Badge>
                {t.source === "meta_import" && (
                  <Badge variant="outline" className="text-xs">
                    Importado da Meta
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {CATEGORY_LABEL[t.category] ?? t.category} · {t.language}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{t.body_text}</p>
              {t.buttons && t.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.buttons.map((b, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs gap-1">
                      {b.type === "URL" && <Link2 className="h-3 w-3" />}
                      {b.text}
                    </Badge>
                  ))}
                </div>
              )}
              {t.rejected_reason && (
                <p className="text-xs text-red-700">Motivo: {t.rejected_reason}</p>
              )}
              {positional && (
                <p className="text-xs text-muted-foreground">
                  Este modelo usa variáveis numeradas ({"{{1}}"}, {"{{2}}"}) e não pode ser
                  editado por aqui. Ele continua visível e o status é atualizado
                  automaticamente pela Meta.
                </p>
              )}
              {t.status !== "draft" && !positional && (
                <p className="text-xs text-muted-foreground">
                  Já enviado à Meta — não é possível editar. Crie um novo modelo para
                  alterar o texto.
                </p>
              )}
              {t.status === "draft" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={positional || t.source !== "app"}
                    onClick={() => startEdit(t)}
                  >
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
