-- Roda do Comunicador Influente (MNT-COM-06) refeita e aberta ao público pelo link/QR code (pedido da Juliana, 21/10/2026).
-- 1) Vendas › Pessoa física passa a guardar se a pessoa marcou "Quero receber ferramentas práticas e conteúdos da Mentorei"
--    (quer_conteudos: sim, não ou vazio quando a ferramenta não pergunta). Quem disse "não" não entra nos funis de e-mail.
-- 2) Atualiza a ficha da Roda no arsenal: 8 habilidades com 3 frases cada (24 perguntas).
-- Precisa do script 39. Rodar no SQL Editor do Supabase (New query → colar tudo → Run); pode rodar de novo sem problema.

alter table public.pessoas_fisicas add column if not exists quer_conteudos boolean;

-- Igual à do script 39, mais a resposta "quer conteúdos" (a última resposta da pessoa é a que vale).
create or replace function public.registrar_pessoa_fisica(p_nome text, p_email text, p_whatsapp text, p_cargo text, p_ferramenta text, p_conteudos boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into pessoas_fisicas (nome, email, whatsapp, cargo, origem, ferramentas, quer_conteudos)
  values (p_nome, lower(trim(p_email)), nullif(p_whatsapp, ''), nullif(p_cargo, ''), p_ferramenta, array[p_ferramenta], p_conteudos)
  on conflict ((lower(email))) do update set
    nome = excluded.nome,
    whatsapp = coalesce(excluded.whatsapp, pessoas_fisicas.whatsapp),
    cargo = coalesce(excluded.cargo, pessoas_fisicas.cargo),
    ferramentas = case when p_ferramenta = any(pessoas_fisicas.ferramentas) then pessoas_fisicas.ferramentas
                       else pessoas_fisicas.ferramentas || p_ferramenta end,
    quer_conteudos = coalesce(excluded.quer_conteudos, pessoas_fisicas.quer_conteudos),
    vezes = pessoas_fisicas.vezes + 1,
    ultimo_em = now()
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.registrar_pessoa_fisica(text, text, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.registrar_pessoa_fisica(text, text, text, text, text, boolean) to service_role;

-- Ficha da Roda no arsenal (só os campos que mudaram; o resto continua como está)
update public.ferramentas set atualizado_em = now(), dados = dados || $ficha$
{
  "resumo": "Autoavaliação online de 8 habilidades de comunicação, com 3 frases cada (24 no total), notas de 1 a 10. A nota de cada habilidade é a média das 3 frases e forma a roda. Mostra a média geral com a faixa de nível, os 3 pontos fortes e as 3 habilidades que mais pedem atenção, e já monta um plano de ação para elas. A maioria das frases fala do trabalho, e cerca de 1 em cada 3 traz situações da vida pessoal.",
  "formato": "Ferramenta online já automatizada. Na mentoria: enviada pela plataforma, o resultado fica guardado na ficha do mentorado (com a nota de cada frase). Aberta ao público por link ou QR code: a pessoa deixa nome, WhatsApp e e-mail e diz se quer receber conteúdos da Mentorei; as respostas e o resultado ficam só na tela dela (pode baixar em PDF) e só o contato chega em Vendas › Pessoa física",
  "tempo": "5 a 7 min online + 30 min de conversa na sessão",
  "observacao": "Ficha sem PDF: a ferramenta já é aplicada na versão online. As 8 habilidades: clareza e objetividade; escuta ativa; linguagem corporal e voz; segurança para falar em grupo; influência e persuasão; conversas difíceis e feedback; comunicação escrita e digital; autopercepção e responsabilidade. Antes das perguntas, a tela \"Como responder\" explica a régua (1 a 3 quase nunca, 4 a 6 às vezes, 7 a 8 na maioria das vezes, 9 a 10 quase sempre) e pede sinceridade. Faixas pela média: Em desenvolvimento (abaixo de 5), Em evolução (5 a 6,9), Consistente (7 a 8,9) e Referência (9 a 10). Pelo link público, a promessa feita na tela é que as respostas e o resultado não são guardados.",
  "entregavel": "Roda das 8 habilidades com a média geral e a faixa, os 3 pontos fortes e as 3 habilidades de foco com exemplos, e o plano de 3 ações com prazo. Na plataforma, guardado na ficha do mentorado; no link público, só o contato vai para Vendas › Pessoa física.",
  "palavras_chave": ["comunicação", "influência", "persuasão", "escuta ativa", "clareza", "objetividade", "ir direto ao ponto",
    "comunicação não verbal", "linguagem corporal", "tom de voz", "postura", "presença", "falar em público", "oratória",
    "apresentações", "conversas difíceis", "feedback", "dizer não", "comunicação escrita", "e-mail", "WhatsApp",
    "videochamada", "autopercepção", "responsabilidade pela comunicação", "roda de competências", "autoavaliação", "QR code"]
}
$ficha$::jsonb
where id = 'MNT-COM-06';
