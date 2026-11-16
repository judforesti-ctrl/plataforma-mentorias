-- 78 · Mentorei Ao Vivo: QR code para entrar como item do roteiro e capa no telão (16/11/2026).
-- Já rodado pelo Claude no banco (migrações aovivo_20_qr_no_roteiro, aovivo_21_botao_qr_antes_de_comecar e
-- aovivo_22_capa_so_antes_do_qr). Este arquivo é o registro do que mudou.
--
-- Pedido da Juliana: o QR code não pode ser sempre a primeira coisa no telão. O mentor explica antes e põe o QR code
-- onde quiser no roteiro; antes de começar, o telão mostra a capa dos slides do mentor.
--
-- O que mudou:
-- 1) aovivo_atividades.tipo aceita 'entrada' (o item "📱 QR code para entrar"; pergunta = frase opcional no telão).
-- 2) aovivo_salvar_roteiro aceita 'entrada' (pergunta até 120, sem config, opções nem tempo).
-- 3) aovivo_ir_para no item 'entrada' = fase 'lobby' com atividade {id, tipo 'entrada', ordem, pergunta, iniciada_em};
--    o slide também leva 'ordem'; 'a_seguir' e a contagem das atividades (numero/total) não contam o 'entrada'.
-- 4) aovivo_publico devolve 'capa' (imagem do 1º slide, só quando existe QR code DEPOIS dele) e 'entrada_ordem'.
-- 5) aovivo_mudar_fase('lobby') (botão "QR code" do painel e tecla Q) grava extra = {"qr": true}: mostra o QR code
--    mesmo antes de começar (sem isso o telão mostraria a capa).
-- 6) aovivo_reiniciar volta comecou_em = null (o telão volta a começar pela capa). O editor ganhou "Zerar para a próxima
--    aula" para aula já encerrada (ensaio).
-- 7) aovivo_gestao_lista não conta o 'entrada' como atividade.

alter table public.aovivo_atividades drop constraint if exists aovivo_atividades_tipo_check;
alter table public.aovivo_atividades add constraint aovivo_atividades_tipo_check
  check (tipo = any (array['slide','nuvem','quiz','votacao','escala','grupo','ferramenta','entrada']));

create or replace function public.aovivo_publico(p_sessao uuid)
 returns jsonb language sql stable security definer set search_path to ''
as $function$
  select jsonb_build_object(
    'id', s.id, 'codigo', s.codigo, 'titulo', s.titulo,
    'modo_equipes', s.modo_equipes, 'equipes', to_jsonb(s.equipes),
    'fase', s.fase, 'atividade', s.atividade, 'extra', s.extra, 'versao', s.versao,
    'tela_preta', s.tela_preta, 'comecou_em', s.comecou_em,
    'avaliacao', case when s.avaliacao_link = '-' then null
                      else coalesce(nullif(s.avaliacao_link, ''),
                        case when s.modulo_id is not null then 'https://plataforma.mentorei.com.br/avaliar.html?m=' || s.modulo_id::text end) end,
    'modulo', s.modulo_id is not null,
    'capa', (select a.config->>'imagem' from public.aovivo_atividades a
              where a.sessao_id = s.id and not a.arquivada and a.tipo = 'slide'
                and exists (select 1 from public.aovivo_atividades e where e.sessao_id = s.id and not e.arquivada and e.tipo = 'entrada' and e.ordem > a.ordem)
              order by a.ordem, a.criado_em limit 1),
    'entrada_ordem', (select min(a.ordem) from public.aovivo_atividades a
              where a.sessao_id = s.id and not a.arquivada and a.tipo = 'entrada'))
  from public.aovivo_sessoes s where s.id = p_sessao;
$function$;

create or replace function public.aovivo_mudar_fase(p_sessao uuid, p_chave text, p_fase text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if p_fase not in ('lobby', 'encerrada') then raise exception 'Fase inválida.'; end if;
  if p_fase = 'encerrada' then
    update public.aovivo_sessoes set fase = 'encerrada', extra = public.aovivo_ranking_dados(p_sessao) where id = p_sessao;
    begin
      perform public.aovivo_gravar_presenca(p_sessao);
    exception when others then null;   -- a presença nunca impede de encerrar a aula
    end;
  else
    update public.aovivo_sessoes set fase = 'lobby', atividade = null, extra = jsonb_build_object('qr', true) where id = p_sessao;
  end if;
  return public.aovivo_painel(p_sessao, p_chave);
end $function$;

-- aovivo_reiniciar: o último update passou a ser
--   fase = 'lobby', atividade = null, extra = null, comecou_em = null
-- aovivo_salvar_roteiro: 'entrada' na lista de tipos e o ramo
--   elsif v_tipo = 'entrada' then v_perg := left(v_perg, 120); v_cfg := '{}'; v_opc := '[]'; v_cor := null; v_tempo := 0;
-- aovivo_ir_para: ramo do 'entrada' antes do slide:
--   update aovivo_sessoes set fase = 'lobby', extra = null, comecou_em = coalesce(comecou_em, now()),
--     atividade = jsonb_build_object('id', a.id, 'tipo', 'entrada', 'ordem', a.ordem, 'pergunta', a.pergunta, 'iniciada_em', now())
--   e "tipo <> 'slide'" virou "tipo not in ('slide', 'entrada')" em a_seguir e na contagem das atividades.
-- aovivo_gestao_lista: 'atividades' conta "a.tipo not in ('slide', 'entrada')".
