-- Vendas › Pessoa física: contatos de quem preenche as ferramentas abertas ao público (por QR code, sem login).
-- A primeira é a Roda do Profissional do Futuro (TraçãoCoop): a pessoa deixa nome, e-mail, WhatsApp e cargo antes de começar.
-- Só os CONTATOS chegam aqui: as respostas e as notas ficam no celular da pessoa (promessa feita na tela da ferramenta).
-- Quem grava é o servidor (/api/contato-ferramenta); só a administração lê. O mesmo e-mail não vira duas linhas.
-- Também coloca a ficha da Roda do Profissional do Futuro (MNT-AUT-11) no arsenal.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

create table if not exists public.pessoas_fisicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  whatsapp text,
  cargo text,
  origem text,                                   -- a primeira ferramenta que a pessoa preencheu
  ferramentas text[] not null default '{}',      -- todas as ferramentas que ela já preencheu
  vezes integer not null default 1,              -- quantas vezes começou uma ferramenta
  observacao text,                               -- anotação da administração
  criado_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now()
);

create unique index if not exists pessoas_fisicas_email on public.pessoas_fisicas ((lower(email)));
create index if not exists pessoas_fisicas_ultimo on public.pessoas_fisicas (ultimo_em desc);

alter table public.pessoas_fisicas enable row level security;

drop policy if exists admin_tudo on public.pessoas_fisicas;

create policy admin_tudo on public.pessoas_fisicas for all to authenticated using (eh_admin()) with check (eh_admin());

-- Grava ou atualiza pelo e-mail (só o servidor chama; ninguém de fora consegue usar).
create or replace function public.registrar_pessoa_fisica(p_nome text, p_email text, p_whatsapp text, p_cargo text, p_ferramenta text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into pessoas_fisicas (nome, email, whatsapp, cargo, origem, ferramentas)
  values (p_nome, lower(trim(p_email)), nullif(p_whatsapp, ''), nullif(p_cargo, ''), p_ferramenta, array[p_ferramenta])
  on conflict ((lower(email))) do update set
    nome = excluded.nome,
    whatsapp = coalesce(excluded.whatsapp, pessoas_fisicas.whatsapp),
    cargo = coalesce(excluded.cargo, pessoas_fisicas.cargo),
    ferramentas = case when p_ferramenta = any(pessoas_fisicas.ferramentas) then pessoas_fisicas.ferramentas
                       else pessoas_fisicas.ferramentas || p_ferramenta end,
    vezes = pessoas_fisicas.vezes + 1,
    ultimo_em = now()
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.registrar_pessoa_fisica(text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.registrar_pessoa_fisica(text, text, text, text, text) to service_role;

-- Ficha da ferramenta no arsenal
insert into public.ferramentas (id, numero, nome, lote, arquivo, dados, atualizado_em)
values ('MNT-AUT-11', '71', 'Roda do Profissional do Futuro', '14 (ferramentas online)', null, $ficha$
{
  "id": "MNT-AUT-11",
  "numero": "71",
  "nome": "Roda do Profissional do Futuro",
  "arquivo_pdf": "",
  "lote": "14 (ferramentas online)",
  "tambem_conhecida_como": [
    "Roda TraçãoCoop",
    "Roda de Habilidades do Profissional do Futuro",
    "Autoavaliação TraçãoCoop",
    "Somos todos negócios"
  ],
  "resumo": "Autoavaliação online em 4 partes (Inovação e Criatividade; Autorresponsabilidade; Diplomacia e Protagonismo; Comunicação e Assertividade), 5 afirmações cada, notas de 1 a 10. No fim mostra a roda das 12 habilidades, a média geral e de cada parte, a maior e a menor nota e um plano de ação pronto para a habilidade mais baixa, com um compromisso com prazo. Também funciona aberta ao público por QR code: a pessoa deixa nome, e-mail, WhatsApp e cargo, que chegam em Vendas › Pessoa física.",
  "categoria": "Autoconhecimento e Autodesenvolvimento",
  "nivel": "Liderar a si",
  "formato": "Ferramenta online já automatizada. Em treinamento: QR code nos slides, uma parte por vez, quando a facilitadora indicar; as respostas ficam só no celular do participante e só os contatos chegam à Mentorei. Na mentoria: enviada pela plataforma, o resultado fica guardado na ficha do mentorado",
  "tempo": "3 a 5 min por parte (15 a 20 min no total) + 30 min de conversa na sessão",
  "momento_trilha": "Treinamentos de equipes e cooperativas (TraçãoCoop · Somos todos negócios), ou na mentoria de profissionais sem cargo de liderança e de líderes recém-promovidos, para escolher a habilidade a desenvolver primeiro",
  "combina_com": {
    "antes": [],
    "mesma_sessao": [
      "Matriz Controle x Influência"
    ],
    "depois": [
      "Você é Assertivo?",
      "Roda da Diplomacia",
      "Plano de Ação 5W2H",
      "PDI do Líder"
    ]
  },
  "observacao": "Ficha sem PDF: a ferramenta é aplicada na versão online. As 12 habilidades: olhar de melhoria, experimentar e aprender com o erro, quebra de paradigmas, compromisso com a palavra, foco no que posso influenciar, atitude de solução, diplomacia nas relações, imagem e marca pessoal, linguagem de protagonista, responsabilidade pela mensagem, coerência verbal e não verbal, assertividade. Faixas: 8 a 10 ponto forte, 5 a 7,9 em desenvolvimento, 1 a 4,9 precisa de atenção. Pelo QR code público, a promessa feita na tela é que as respostas ficam só no celular e a cooperativa não recebe nada: só nome, e-mail, WhatsApp e cargo chegam à Mentorei.",
  "tags": [
    "competencias-do-futuro",
    "autoconhecimento",
    "plano-de-desenvolvimento",
    "comunicacao-assertiva",
    "foco-no-controlavel"
  ],
  "palavras_chave": [
    "profissional do futuro",
    "TraçãoCoop",
    "somos todos negócios",
    "Sicoob",
    "cooperativa",
    "inovação",
    "criatividade",
    "melhoria contínua",
    "experimentar",
    "erro",
    "paradigmas",
    "autorresponsabilidade",
    "compromisso",
    "cumprir prazos",
    "solução de problemas",
    "círculo de influência",
    "diplomacia",
    "protagonismo",
    "marca pessoal",
    "comunicação",
    "assertividade",
    "habilidades comportamentais",
    "roda de habilidades",
    "autoavaliação",
    "QR code"
  ],
  "linguagem_dia_a_dia": [
    "sempre foi feito assim",
    "isso não é comigo",
    "fala com o meu chefe",
    "promete e não entrega",
    "reclama mas não propõe nada",
    "joga a culpa nos outros",
    "não avisa quando vai atrasar",
    "explica e ninguém entende",
    "não sabe dizer não",
    "tem medo de errar",
    "espera tudo pronto para começar"
  ],
  "sinais": [
    "retrabalho por mensagens mal entendidas",
    "prazos combinados que não são cumpridos e sem aviso",
    "problemas levados ao gestor sem nenhuma sugestão",
    "resistência a mudanças e a novas formas de fazer",
    "demandas encaminhadas com “isso não é comigo”",
    "conflitos e respostas ríspidas entre colegas"
  ],
  "nao_usar_quando": "O foco é só um tema específico e já conhecido (usar direto Você é Assertivo?, Roda da Diplomacia ou Matriz Controle x Influência). Quando a pessoa lidera e o foco é o papel de líder (usar Radar da Liderança ou Autoavaliação do Líder do Futuro). Nunca usar o resultado como avaliação de desempenho para a empresa.",
  "como_aplicar": [
    "Em treinamento: mostre o QR code no slide da Parte 1; cada pessoa preenche o cadastro e responde a parte quando a facilitadora indicar. O progresso fica no celular, então o mesmo QR serve para todas as partes.",
    "Na mentoria: envie a ferramenta pela plataforma e peça que o mentorado responda pensando nas últimas semanas, e não em como gostaria de ser.",
    "Abram a roda juntos e comecem pela maior nota: como ela pode ajudar a desenvolver as outras.",
    "Vão para a menor nota e leiam o plano de ação pronto: escolham uma ação para começar esta semana.",
    "Revisem o compromisso (primeiro passo e prazo) e combinem como ele vai mostrar o que fez na próxima sessão.",
    "Refaçam a roda em 60 a 90 dias para comparar."
  ],
  "perguntas_poderosas": [
    "Qual nota mais te surpreendeu? Por quê?",
    "Em que situação do dia a dia a sua menor nota aparece?",
    "Quem do seu time é exemplo nessa habilidade? O que essa pessoa faz diferente?",
    "Qual promessa você fez recentemente e não cumpriu? O que aconteceu?",
    "O que, do problema que mais te incomoda hoje, depende de você?",
    "Qual pequena ação desta semana mostraria que você começou?"
  ],
  "entregavel": "Roda das 12 habilidades com a média geral e de cada parte, a maior e a menor nota e o plano de ação com compromisso e prazo. Na plataforma, guardado na ficha do mentorado; no QR code público, os contatos da pessoa vão para Vendas › Pessoa física.",
  "dica_mentora": "A nota é um retrato de como a pessoa se vê hoje: o valor está nos exemplos reais que ela traz para cada nota e no primeiro passo pequeno, não na média.",
  "candidata_a_automacao": true
}
$ficha$::jsonb, now())
on conflict (id) do update set numero = excluded.numero, nome = excluded.nome, lote = excluded.lote,
  arquivo = excluded.arquivo, dados = excluded.dados, atualizado_em = now();
