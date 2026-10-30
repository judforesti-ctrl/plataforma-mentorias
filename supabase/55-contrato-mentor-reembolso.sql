-- 30/10/2026, dois pedidos da Juliana:
-- 1) CONTRATO DE PRESTAÇÃO DE SERVIÇO DO MENTOR: o mentor parceiro (papel 'mentor') assina na plataforma. Uma linha por mentor e
--    versão do texto (public/assets/contrato-mentor.js): quando viu pela primeira vez, quando deixou para depois e a assinatura
--    (nome, CPF/CNPJ, e-mail, resumo SHA-256 do texto assinado, navegador). A hora da assinatura é a do banco, não a do aparelho.
--    Depois de assinada, a linha não muda mais (nem pelo próprio mentor).
-- 2) REEMBOLSO COBRADO DO CLIENTE: a despesa que o cliente reembolsa guarda a linha a receber criada para cobrá-la (com o imposto).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 52.

alter table public.fin_despesas add column if not exists reembolso_receber_id uuid references public.fin_receber (id) on delete set null;

create table if not exists public.contratos_mentor (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  versao text not null,
  visto_em timestamptz not null default now(),
  adiado_em timestamptz,
  aceito_em timestamptz,
  nome text,
  documento text,
  email text,
  texto_hash text,
  navegador text,
  primary key (perfil_id, versao)
);

-- hora da assinatura = hora do banco; assinatura não volta atrás
create or replace function public.contrato_assinado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.aceito_em is not null and not eh_admin() then
    raise exception 'Contrato já assinado não pode ser mudado.';
  end if;
  if new.aceito_em is not null and (tg_op = 'INSERT' or old.aceito_em is null) then
    if new.nome is null or new.documento is null or new.texto_hash is null then
      raise exception 'Para assinar, informe nome e CPF ou CNPJ.';
    end if;
    new.aceito_em := now();
  end if;
  return new;
end $$;
drop trigger if exists contrato_assinado on public.contratos_mentor;
create trigger contrato_assinado before insert or update on public.contratos_mentor for each row execute function public.contrato_assinado();

alter table public.contratos_mentor enable row level security;
revoke all on public.contratos_mentor from anon;
drop policy if exists admin_tudo on public.contratos_mentor;
drop policy if exists contrato_ler on public.contratos_mentor;
drop policy if exists contrato_criar on public.contratos_mentor;
drop policy if exists contrato_mudar on public.contratos_mentor;
create policy admin_tudo on public.contratos_mentor for all to authenticated using (eh_admin()) with check (eh_admin());
create policy contrato_ler on public.contratos_mentor for select to authenticated using (perfil_id = auth.uid());
create policy contrato_criar on public.contratos_mentor for insert to authenticated with check (perfil_id = auth.uid());
create policy contrato_mudar on public.contratos_mentor for update to authenticated using (perfil_id = auth.uid() and aceito_em is null) with check (perfil_id = auth.uid());

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as contrato_e_reembolso;
