-- Etapa 3 da reforma do Inbox: tabela de tags "fixadas" como chip dinâmico
-- (segunda fileira, abaixo dos 9 chips fixos). Compartilhada com toda a
-- equipe — sem coluna de usuário na chave, é global por design: quem fixa
-- ou desfixa uma tag muda o que TODA a equipe vê.
create table if not exists public.inbox_tag_pins (
  tag_id uuid primary key references public.tags(id) on delete cascade,
  pinned_by uuid not null references auth.users(id),
  pinned_at timestamptz not null default now()
);

grant select, insert, delete on public.inbox_tag_pins to authenticated;
grant all on public.inbox_tag_pins to service_role;

alter table public.inbox_tag_pins enable row level security;

create policy "inbox_tag_pins staff manage" on public.inbox_tag_pins
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
