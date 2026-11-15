-- Mentorei Ao Vivo · materiais da aula por e-mail (pedido da Juliana, 15/11/2026). RODADO pelo Claude pelo conector no mesmo dia
-- (migrações aovivo_15_email_dos_materiais, aovivo_16_email_trocas, aovivo_17_estado_email). Pode rodar de novo.
-- O aluno que NÃO entrou pela plataforma deixa o e-mail no celular; quando a aula é encerrada, /api/aovivo-email (plataforma)
-- manda os PDFs da aula, o que ele fez e os links das ferramentas; o contato vai para Vendas › Pessoa física e, se ele marcou
-- "Quero receber conteúdos", para o funil "Alunos das aulas ao vivo" (criado parado: a Juliana revisa e liga).
-- Precisa do script 42 (registrar_pessoa_fisica com p_conteudos), rodado no mesmo dia.

alter table public.aovivo_participantes
  add column if not exists email text,
  add column if not exists quer_conteudos boolean not null default false,
  add column if not exists email_pedido_em timestamptz,
  add column if not exists email_enviado_em timestamptz,
  add column if not exists email_trocas integer not null default 0;

create or replace function public.aovivo_pedir_email(p_sessao uuid, p_participante uuid, p_token uuid, p_email text, p_conteudos boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v text := lower(btrim(coalesce(p_email, ''))); v_fase text; p public.aovivo_participantes;
begin
  if v !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(v) > 160 then raise exception 'Confira o e-mail.'; end if;
  select * into p from public.aovivo_participantes where id = p_participante and token = p_token and sessao_id = p_sessao for update;
  if not found then raise exception 'Você saiu da sala. Entre de novo.'; end if;
  if p.turma_aluno_id is not null then raise exception 'Você entrou pela plataforma: os materiais da aula já ficam na sua área.'; end if;
  -- depois de enviado, dá para corrigir o e-mail só duas vezes (para ninguém usar a aula para mandar e-mail a qualquer um)
  if p.email_enviado_em is not null and p.email is distinct from v then
    if p.email_trocas >= 2 then raise exception 'Você já trocou o e-mail duas vezes. Peça ajuda a quem conduz a aula.'; end if;
    update public.aovivo_participantes set email_trocas = email_trocas + 1, email_enviado_em = null where id = p.id;
  end if;
  update public.aovivo_participantes set email = v, quer_conteudos = coalesce(p_conteudos, false), email_pedido_em = now() where id = p.id;
  select fase into v_fase from public.aovivo_sessoes where id = p_sessao;
  return jsonb_build_object('ok', true, 'encerrada', v_fase = 'encerrada');
end $$;
grant execute on function public.aovivo_pedir_email(uuid, uuid, uuid, text, boolean) to anon, authenticated;

-- aovivo_estado: o "eu" ganhou email, email_enviado e quer_conteudos (só a própria pessoa, pelo token). O texto completo da função
-- está no banco (migração aovivo_17_estado_email): é a do script 75 com
--   || jsonb_build_object('email', p.email, 'email_enviado', p.email_enviado_em is not null, 'quer_conteudos', p.quer_conteudos)
-- no fim do v_eu.

-- Funil "Alunos das aulas ao vivo" (parado) com 3 e-mails: criado em 15/11 pelo conector (id 135e8c31-3ab0-4c70-9637-cc5d14de0712).
