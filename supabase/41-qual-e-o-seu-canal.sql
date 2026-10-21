-- Ficha de "Qual é o seu canal?" (MNT-COM-12) no arsenal: ferramenta online (visual, auditivo ou cinestésico), também aberta
-- ao público pelo link/QR code. Os contatos de quem responde de fora chegam em Vendas › Pessoa física (precisa do script 39).
-- Não cria tabela nova. Rodar no SQL Editor do Supabase (New query → colar tudo → Run); pode rodar de novo.

insert into public.ferramentas (id, numero, nome, lote, arquivo, dados, atualizado_em)
values ('MNT-COM-12', '72', 'Qual é o seu canal?', '15 (ferramentas online)', null, $ficha$
{
  "id": "MNT-COM-12",
  "numero": "72",
  "nome": "Qual é o seu canal?",
  "arquivo_pdf": "",
  "lote": "15 (ferramentas online)",
  "tambem_conhecida_como": [
    "Canal preferencial de comunicação",
    "Visual, auditivo e cinestésico",
    "VAC",
    "Teste dos canais de comunicação",
    "Sistemas representacionais"
  ],
  "resumo": "Autoavaliação online com 15 perguntas rápidas do dia a dia (3 formatos: primeira impressão, o que você faria e qual frase é a sua cara), cerca de 3 minutos. Mostra o canal preferencial da pessoa (visual, auditivo ou cinestésico, ou dois empatados) com a porcentagem de cada um e um laudo: como aprende melhor, como as pessoas podem falar com ela, pontos fortes e de atenção, palavras que conectam, como falar com cada canal e 3 atitudes para a semana. Também é aberta ao público pelo link ou QR code: a pessoa deixa nome, e-mail, WhatsApp e cargo (chegam em Vendas › Pessoa física) e recebe o laudo no e-mail; as respostas não são guardadas.",
  "categoria": "Comunicação",
  "nivel": "Liderar a si",
  "formato": "Ferramenta online já automatizada. Na mentoria: enviada pela plataforma, o resultado fica guardado na ficha do mentorado. Em treinamentos e eventos: QR code nos slides; cada participante vê o laudo no celular, baixa em PDF e recebe no e-mail",
  "tempo": "3 min online + 20 a 30 min de conversa na sessão",
  "momento_trilha": "Início da trilha, para o mentor ajustar o próprio jeito de explicar ao mentorado, ou quando a dificuldade é de comunicação com a equipe, com os sócios ou com clientes (\"eu falo e ninguém entende\", \"a equipe não lê o que eu mando\")",
  "combina_com": {
    "antes": [],
    "mesma_sessao": [
      "Você é Assertivo?",
      "Roda do Comunicador"
    ],
    "depois": [
      "Mapa dos Estilos de Comunicação",
      "Feedback SCI"
    ]
  },
  "observacao": "Ficha sem PDF: a ferramenta é aplicada na versão online. Cada resposta vale um ponto para um canal (5 perguntas de cada formato misturadas; a ordem das opções muda em cada pergunta). O laudo trata o resultado como preferência, não como rótulo: todo mundo usa os três canais. Empate de dois canais vira perfil combinado; empate dos três, perfil equilibrado. É uma ferramenta de autoconhecimento e de conversa, não um instrumento científico de avaliação.",
  "tags": [
    "autoconhecimento",
    "comunicacao-assertiva",
    "escuta",
    "influencia",
    "desenvolvimento-da-equipe"
  ],
  "palavras_chave": [
    "canal de comunicação",
    "canal preferencial",
    "visual",
    "auditivo",
    "cinestésico",
    "sinestésico",
    "VAC",
    "estilo de aprendizagem",
    "como aprendo",
    "como me comunico",
    "PNL",
    "sistemas representacionais",
    "rapport",
    "comunicação com a equipe",
    "explicar melhor",
    "treinamento",
    "onboarding"
  ],
  "linguagem_dia_a_dia": [
    "eu falo e ninguém entende",
    "a equipe não lê o que eu mando",
    "explico mil vezes",
    "a gente não fala a mesma língua",
    "ele só entende se eu desenhar",
    "ela precisa conversar sobre tudo",
    "ele só aprende fazendo",
    "não sei como passar a informação",
    "reunião que ninguém presta atenção",
    "mensagem que é mal interpretada"
  ],
  "sinais": [
    "a mesma orientação precisa ser repetida várias vezes",
    "conflitos por mensagens escritas mal interpretadas",
    "o líder explica sempre do mesmo jeito para todo mundo",
    "treinamentos e integrações que não fixam",
    "reuniões longas em que as pessoas se desligam",
    "dificuldade de criar conexão com uma pessoa específica da equipe ou com um sócio"
  ],
  "nao_usar_quando": "O problema é de postura diante da tensão, como não se posicionar ou explodir (usar Você é Assertivo?). Quando a dificuldade é uma conversa difícil específica e próxima (usar Roteiro de Conversas Difíceis). Não usar o resultado para rotular pessoas da equipe nem para decidir contratação ou promoção.",
  "como_aplicar": [
    "Envie a ferramenta pela plataforma antes da sessão e peça que o mentorado responda com a primeira resposta que vier à cabeça.",
    "Abram o laudo juntos: peça que ele diga em que situações se reconhece no canal que apareceu mais alto e em quais não.",
    "Olhem o canal menos usado: com quem da equipe, da família ou dos clientes a comunicação costuma travar? Essa pessoa provavelmente usa esse canal.",
    "Use a parte \"Como falar com cada canal\" para mapear 2 ou 3 pessoas-chave da equipe ou do negócio e combinar como adaptar a próxima conversa com cada uma.",
    "Escolham uma das 3 atitudes do laudo para praticar até a próxima sessão.",
    "Para o mentor: ajuste o seu jeito de conduzir as sessões ao canal do mentorado (mais esquema, mais conversa ou mais prática)."
  ],
  "perguntas_poderosas": [
    "Em que momento da sua semana você mais sente que o seu canal está funcionando a seu favor?",
    "Com quem você sente que não fala a mesma língua? Que canal essa pessoa parece usar?",
    "Como você costuma passar uma orientação importante para a equipe? E se fosse para alguém de outro canal?",
    "O que você poderia mostrar, dizer ou fazer junto na próxima conversa que ainda não fez?",
    "Que palavra do laudo descreve bem o seu jeito? E qual não tem nada a ver com você?"
  ],
  "entregavel": "Canal preferencial com a porcentagem dos três canais e laudo com 3 atitudes para a semana; na plataforma, guardado na ficha do mentorado; para o público, na tela, em PDF e no e-mail.",
  "dica_mentora": "O ganho está menos no rótulo e mais na troca de lente: o líder descobre que explica do jeito que ele gosta de entender, e não do jeito que o outro entende. Feche a sessão com um nome concreto da equipe e uma forma nova de falar com ele.",
  "candidata_a_automacao": true
}
$ficha$::jsonb, now())
on conflict (id) do update set numero = excluded.numero, nome = excluded.nome, lote = excluded.lote,
  arquivo = excluded.arquivo, dados = excluded.dados, atualizado_em = now();
