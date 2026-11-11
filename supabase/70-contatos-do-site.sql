-- Script 70 · Contatos do site da Mentorei entram em Vendas (2026-11-11, pedido da Juliana)
-- O formulário "20 minutos. Seu desafio no centro." do site (mentorei.com.br) manda o contato para /api/contato-site,
-- que cria a oportunidade na etapa nova "Contato novo" e avisa por e-mail quem está em configuracoes.contatos_site.avisar.
-- Pode rodar de novo sem problema.

-- 1. Etapa nova "novo" (Contato novo), antes de "Primeiro contato feito"
alter table public.oportunidades drop constraint if exists oportunidades_etapa_check;
alter table public.oportunidades add constraint oportunidades_etapa_check
  check (etapa in ('prospectar', 'novo', 'contato', 'reuniao', 'apresentacao', 'proposta', 'negociacao', 'fechado', 'perdido'));

create or replace function public.nome_etapa(e text) returns text
language sql immutable as $$
  select case e when 'prospectar' then 'A prospectar' when 'novo' then 'Contato novo' when 'contato' then 'Primeiro contato feito'
    when 'reuniao' then 'Reunião marcada' when 'apresentacao' then 'Apresentação feita' when 'proposta' then 'Proposta enviada'
    when 'negociacao' then 'Negociação' when 'fechado' then 'Fechado' when 'perdido' then 'Perdido' else e end $$;

-- 2. O funil continua andando sozinho: ligação, e-mail ou WhatsApp registrados num "Contato novo" → Primeiro contato feito
create or replace function public.marcar_interacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ordem constant text[] := array['prospectar', 'novo', 'contato', 'reuniao', 'apresentacao', 'proposta', 'negociacao'];
  atual text; alvo text;
begin
  if new.tipo in ('email', 'whatsapp', 'reuniao', 'apresentacao', 'ligacao', 'proposta') then
    update oportunidades set ultima_interacao_em = greatest(ultima_interacao_em, new.quando) where id = new.oportunidade_id
      returning etapa into atual;
    alvo := case new.tipo when 'reuniao' then 'reuniao' when 'apresentacao' then 'apresentacao' when 'proposta' then 'proposta' else 'contato' end;
    if atual = any(ordem) and array_position(ordem, alvo) > array_position(ordem, atual) then
      update oportunidades set etapa = alvo, chance = null, responsavel_id = coalesce(responsavel_id, new.por) where id = new.oportunidade_id;
      insert into interacoes (oportunidade_id, tipo, texto, por) values (new.oportunidade_id, 'etapa', nome_etapa(atual) || ' → ' || nome_etapa(alvo) || ' · automático', new.por);
    end if;
  end if;
  return new;
end $$;

-- 3. Quem recebe o aviso de contato novo do site: Cintia e Viviane (pelos perfis de administração com esses nomes)
insert into public.configuracoes (chave, valor)
select 'contatos_site', jsonb_build_object('avisar', coalesce(jsonb_agg(id order by nome), '[]'::jsonb))
from public.perfis where papel = 'admin' and ativo and (nome ilike 'cintia%' or nome ilike 'cíntia%' or nome ilike 'viviane%')
on conflict (chave) do nothing;
