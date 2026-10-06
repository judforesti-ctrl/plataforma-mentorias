-- Ferramentas online dentro da plataforma (ex.: Roda do Comunicador Influente).
-- O mentorado responde na plataforma e o resultado fica guardado em "testes", visível para ele e para os mentores dele.

alter table public.testes add column if not exists ferramenta_id text;

create policy testes_mentorado_criar on public.testes for insert to authenticated
  with check (mentorado_id = meu_mentorado());
create policy testes_mentorado_atualizar on public.testes for update to authenticated
  using (mentorado_id = meu_mentorado()) with check (mentorado_id = meu_mentorado());

-- Correção: ao aceitar o convite, o próprio sistema liga o login ao mentorado (sem usuário logado).
-- Antes, essa ligação era barrada pela proteção da ficha e o convite de mentorado dava erro.
create or replace function public.protege_mentorado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or eh_admin() then return new; end if;  -- sistema (convite, editor SQL) ou administração
  if new.programa_id <> old.programa_id or new.perfil_id is distinct from old.perfil_id or new.status <> old.status then
    raise exception 'Só o administrador muda o programa, o login ou a situação do mentorado.';
  end if;
  if not eh_mentor_de(old.id) then
    if (to_jsonb(new) - 'email' - 'cargo' - 'tempo_de_casa' - 'pessoas_no_time' - 'gestor_direto')
       <> (to_jsonb(old) - 'email' - 'cargo' - 'tempo_de_casa' - 'pessoas_no_time' - 'gestor_direto') then
      raise exception 'O mentorado só atualiza os próprios dados de cadastro.';
    end if;
  end if;
  return new;
end $$;
