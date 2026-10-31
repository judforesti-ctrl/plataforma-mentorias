-- Pedidos da Juliana para o tutorial do mentor (31/10/2026).
-- 1. Ferramentas da trilha: o mentor do módulo também inclui ferramentas online do arsenal para os alunos, abrindo no dia do
--    módulo DELE, e muda ou tira só as que ele incluiu (turma_ferramentas.criado_por). A administração continua com tudo.
-- 2. fin_mentor_conferencias: o "Está certo" do mentor no extrato do mês (Notas fiscais), com o total que ele viu.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 48 (e do 60 para o extrato).

-- 1. Mentor inclui ferramentas nos módulos dele
drop policy if exists mentor_incluir on public.turma_ferramentas;
create policy mentor_incluir on public.turma_ferramentas for insert to authenticated
  with check (criado_por = auth.uid() and modulo_id is not null and eh_mentor_do_modulo(modulo_id)
              and exists (select 1 from public.modulos m where m.id = modulo_id and m.turma_id = turma_ferramentas.turma_id));

drop policy if exists mentor_mudar on public.turma_ferramentas;
create policy mentor_mudar on public.turma_ferramentas for update to authenticated
  using (criado_por = auth.uid() and modulo_id is not null and eh_mentor_do_modulo(modulo_id))
  with check (criado_por = auth.uid() and modulo_id is not null and eh_mentor_do_modulo(modulo_id)
              and exists (select 1 from public.modulos m where m.id = modulo_id and m.turma_id = turma_ferramentas.turma_id));

drop policy if exists mentor_tirar on public.turma_ferramentas;
create policy mentor_tirar on public.turma_ferramentas for delete to authenticated
  using (criado_por = auth.uid() and modulo_id is not null and eh_mentor_do_modulo(modulo_id));

-- 2. "Está certo" do mentor no extrato do mês
create table if not exists public.fin_mentor_conferencias (
  perfil_id uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  total numeric(14, 2) not null,
  conferido_em timestamptz not null default now(),
  primary key (perfil_id, mes)
);

alter table public.fin_mentor_conferencias enable row level security;
revoke all on public.fin_mentor_conferencias from anon;
drop policy if exists admin_tudo on public.fin_mentor_conferencias;
create policy admin_tudo on public.fin_mentor_conferencias for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists proprio_ler on public.fin_mentor_conferencias;
create policy proprio_ler on public.fin_mentor_conferencias for select to authenticated using (perfil_id = auth.uid());
drop policy if exists proprio_criar on public.fin_mentor_conferencias;
create policy proprio_criar on public.fin_mentor_conferencias for insert to authenticated with check (perfil_id = auth.uid());
drop policy if exists proprio_mudar on public.fin_mentor_conferencias;
create policy proprio_mudar on public.fin_mentor_conferencias for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
