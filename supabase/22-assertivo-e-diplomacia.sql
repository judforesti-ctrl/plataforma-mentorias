-- Fichas revisadas de "Você é Assertivo?" (MNT-COM-07) e "Roda da Diplomacia" (MNT-COM-08), agora com o conteúdo
-- real das ferramentas online (antes tinham sido escritas só pelo nome). A Roda da Diplomacia é sobre marca pessoal e
-- postura profissional, e não sobre relacionamento entre áreas. Rodar no SQL Editor do Supabase; pode rodar de novo.

insert into public.ferramentas (id, numero, nome, lote, arquivo, dados, atualizado_em)
values ('MNT-COM-07', '56', 'Você é Assertivo?', '10 (ferramentas online)', null, $ficha$
{
  "id": "MNT-COM-07",
  "numero": "56",
  "nome": "Você é Assertivo?",
  "arquivo_pdf": "",
  "lote": "10 (ferramentas online)",
  "tambem_conhecida_como": [
    "Teste de assertividade",
    "Quiz de assertividade",
    "Estilos de comportamento",
    "Passivo, agressivo, passivo-agressivo ou assertivo",
    "Autoavaliação de assertividade"
  ],
  "resumo": "Autoavaliação online com 20 afirmações do dia a dia de trabalho (escala de Nunca a Sempre). Mostra quanto o líder pontua em cada um dos 4 estilos (Passivo, Agressivo, Passivo/agressivo e Assertivo, de 0 a 25 pontos), qual predomina, sugestões práticas para o estilo dele e monta 2 compromissos com prazo e quem vai dar retorno.",
  "categoria": "Comunicação",
  "nivel": "Liderar a si",
  "formato": "Ferramenta online já automatizada: o mentorado responde, recebe o estilo predominante, a pontuação dos 4 estilos e monta os compromissos; o resultado fica guardado na ficha dele na plataforma",
  "tempo": "5 a 8 min online + 30 min de conversa na sessão",
  "momento_trilha": "Início ou meio, quando posicionamento, dizer não, explosões ou recados indiretos aparecem nos pontos de desenvolvimento",
  "combina_com": {
    "antes": [],
    "mesma_sessao": [
      "Mapa dos Estilos de Comunicação"
    ],
    "depois": [
      "Roteiro de Conversas Difíceis",
      "CNV na Prática",
      "Feedback SCI"
    ]
  },
  "observacao": "Ficha sem PDF: a ferramenta é aplicada na versão online. Os 4 estilos: Passivo (evita o confronto, cede e se justifica demais), Agressivo (defende o ponto à custa do outro, interrompe, eleva o tom), Passivo/agressivo (diz que está tudo bem, mas a insatisfação sai em ironia, silêncio, atraso ou resposta seca) e Assertivo (diz o que pensa e precisa com clareza e respeito). 5 afirmações por estilo, até 25 pontos cada. É uma autoavaliação: compare com o retorno de quem convive com o mentorado.",
  "tags": [
    "comunicacao-assertiva",
    "firmeza-e-limites",
    "autoconhecimento",
    "conversas-dificeis",
    "reatividade"
  ],
  "palavras_chave": [
    "assertividade",
    "assertivo",
    "teste de assertividade",
    "posicionamento",
    "se posicionar",
    "comunicação passiva",
    "passivo",
    "comunicação agressiva",
    "agressivo",
    "passivo-agressivo",
    "passivo agressivo",
    "estilo de comportamento",
    "estilo de comunicação",
    "firmeza",
    "limites",
    "dizer não",
    "autoconfiança",
    "ironia",
    "receber críticas",
    "pedir o que precisa",
    "tom de voz",
    "explosão",
    "confronto"
  ],
  "linguagem_dia_a_dia": [
    "não se posiciona",
    "é bonzinho demais",
    "engole sapo",
    "explode depois de acumular",
    "fala de um jeito que ofende",
    "não sabe dizer não",
    "manda indireta",
    "concorda na reunião e reclama depois",
    "fica em cima do muro",
    "aceita tudo e depois reclama",
    "pede desculpa por tudo",
    "levanta a voz",
    "atropela as pessoas",
    "responde seco",
    "faz cara feia mas não fala",
    "deixa para a última hora o que não queria fazer",
    "não aguenta crítica"
  ],
  "sinais": [
    "aceita prazos e demandas que sabe que não consegue cumprir",
    "evita discordar em público",
    "reage de forma desproporcional depois de acumular",
    "dá recados indiretos ou por terceiros",
    "a equipe testa os limites dele",
    "interrompe e eleva o tom em discussões",
    "usa ironia ou piadas para criticar",
    "se defende na hora diante de qualquer crítica",
    "justifica demais antes de fazer um pedido simples"
  ],
  "nao_usar_quando": "O problema é uma conversa difícil específica e próxima (usar Roteiro de Conversas Difíceis direto). Quando a dificuldade é emocional e forte, como travar ou explodir sob pressão (usar Gatilho–Reação–Escolha antes). Quando o foco é a imagem e a postura profissional como um todo (usar Roda da Diplomacia).",
  "como_aplicar": [
    "Envie a ferramenta pela plataforma antes da sessão e peça que o mentorado responda pensando em situações reais das últimas semanas, e não em como gostaria de ser.",
    "Abram o resultado juntos: peça que ele comente primeiro o estilo predominante e a pontuação dos outros três.",
    "Olhem o segundo estilo mais alto: é ele que costuma aparecer sob pressão. Peça um exemplo recente de cada um dos dois.",
    "Escolham uma situação real que vem aí (reunião, cobrança, pedido, crítica) e ensaiem a frase assertiva na sessão.",
    "Revisem os 2 compromissos que ele montou: situação concreta, o que vai fazer, prazo e quem vai dar retorno.",
    "Combinem refazer o teste no fim da trilha e pedir a percepção de alguém próximo para comparar."
  ],
  "perguntas_poderosas": [
    "Em que situação você mais se reconhece no estilo que apareceu mais alto?",
    "Com quem você é mais assertivo? E com quem você menos consegue ser?",
    "O que você ganha hoje ao ceder, explodir ou ironizar? E o que perde?",
    "Que conversa você está adiando por não saber como dizer?",
    "Como seria dizer não, nessa situação, oferecendo uma alternativa?",
    "Quem pode te avisar quando o seu tom não combinar com as suas palavras?"
  ],
  "entregavel": "Estilo predominante, pontuação dos 4 estilos e 2 compromissos com situação, ação, prazo e quem vai dar retorno, guardados na plataforma.",
  "dica_mentora": "Ninguém é um estilo só: o valor está em perceber em que situações e com quem cada estilo aparece. Ensaiar a frase na sessão vale mais do que discutir a nota.",
  "candidata_a_automacao": true
}
$ficha$::jsonb, now())
on conflict (id) do update set numero = excluded.numero, nome = excluded.nome, lote = excluded.lote,
  arquivo = excluded.arquivo, dados = excluded.dados, atualizado_em = now();

insert into public.ferramentas (id, numero, nome, lote, arquivo, dados, atualizado_em)
values ('MNT-COM-08', '57', 'Roda da Diplomacia', '10 (ferramentas online)', null, $ficha$
{
  "id": "MNT-COM-08",
  "numero": "57",
  "nome": "Roda da Diplomacia",
  "arquivo_pdf": "",
  "lote": "10 (ferramentas online)",
  "tambem_conhecida_como": [
    "Roda da Marca Pessoal",
    "Roda da Postura Profissional",
    "Roda da Imagem Profissional",
    "Roda de Etiqueta Profissional",
    "Roda das relações"
  ],
  "resumo": "Autoavaliação online da marca pessoal e da postura profissional em 9 dimensões (Vestimenta, Intencionalidade, Apresentação pessoal, Comunicação escrita, Comunicação não verbal, Comunicação oral, Marketing pessoal, Assertividade e Etiqueta profissional), 4 afirmações cada, de Nunca a Sempre. Mostra a roda de 0 a 10, a média com a faixa de nível e monta um plano para as 3 dimensões que mais pedem atenção.",
  "categoria": "Marca Pessoal",
  "nivel": "Liderar a si",
  "formato": "Ferramenta online já automatizada: o mentorado responde, recebe a roda, a faixa e o plano das 3 dimensões; o resultado fica guardado na ficha dele na plataforma",
  "tempo": "8 a 10 min online + 30 a 40 min de conversa na sessão",
  "momento_trilha": "Início ou meio, quando imagem, presença, postura ou a forma como o líder é percebido aparecem nos pontos de desenvolvimento, ou antes de uma promoção ou exposição maior",
  "combina_com": {
    "antes": [],
    "mesma_sessao": [
      "Como Quero Ser Lembrado"
    ],
    "depois": [
      "Pitch de 60 Segundos",
      "Auditoria de Presença Digital",
      "Você é Assertivo?",
      "Plano de Networking"
    ]
  },
  "observacao": "Ficha sem PDF: a ferramenta é aplicada na versão online. Apesar do nome, o foco é a marca pessoal e a postura profissional (como o líder se veste, se apresenta, se comunica e se comporta em reuniões, eventos e redes sociais), e não o relacionamento entre áreas. Faixas pela média: Em construção (abaixo de 5), Em evolução (5 a 6,9), Consistente (7 a 8,9) e Referência (9 a 10). É uma autoavaliação: compare com o retorno de colegas e da liderança.",
  "tags": [
    "marca-pessoal",
    "presenca-executiva",
    "comunicacao-assertiva",
    "autoconhecimento"
  ],
  "palavras_chave": [
    "diplomacia",
    "marca pessoal",
    "imagem profissional",
    "postura profissional",
    "presença executiva",
    "primeira impressão",
    "vestimenta",
    "roupa",
    "como se vestir",
    "dress code",
    "apresentação pessoal",
    "aparência",
    "etiqueta profissional",
    "etiqueta corporativa",
    "comportamento em eventos",
    "redes sociais",
    "LinkedIn",
    "comunicação escrita",
    "e-mail",
    "comunicação não verbal",
    "postura",
    "tom de voz",
    "comunicação oral",
    "falar em público",
    "marketing pessoal",
    "assertividade",
    "câmera nas reuniões online",
    "roda de competências",
    "autoavaliação"
  ],
  "linguagem_dia_a_dia": [
    "não se veste de acordo com o cargo",
    "não passa credibilidade",
    "a imagem não combina com o cargo",
    "é visto como informal demais",
    "ninguém lembra dele nas oportunidades",
    "manda mensagem de qualquer jeito",
    "escreve e-mail confuso",
    "posta coisa que não devia",
    "não sabe se portar em evento",
    "chega atrasado nas reuniões",
    "fica de câmera desligada",
    "não sabe se apresentar",
    "trava para falar em público",
    "foi promovido e ainda não tem postura de líder",
    "precisa ser mais visto pela diretoria"
  ],
  "sinais": [
    "recebe retorno sobre a forma de se vestir ou de se apresentar",
    "não é lembrado quando surgem oportunidades",
    "mensagens e e-mails com erros, tom inadequado ou no canal errado",
    "postura ou comportamento inadequado em eventos e confraternizações",
    "perfil do LinkedIn desatualizado ou que não mostra quem ele é hoje",
    "atrasos e falta de atenção em reuniões, inclusive online",
    "acabou de ser promovido ou vai se expor mais para a diretoria ou clientes"
  ],
  "nao_usar_quando": "O problema é conflito ou relacionamento difícil com outras áreas (usar Mapa de Conflitos, Mapa de Stakeholders ou Escuta em 3 Níveis). Quando o foco é só a comunicação e a influência (usar Roda do Comunicador Influente). Quando o foco é só o jeito de se posicionar (usar Você é Assertivo?).",
  "como_aplicar": [
    "Envie a ferramenta pela plataforma antes da sessão e peça que o mentorado responda com sinceridade, pensando no dia a dia, e não nos dias de evento.",
    "Abram a roda juntos e peça que ele comente primeiro o que chamou a atenção: a faixa, a dimensão mais alta e as três mais baixas.",
    "Peça um exemplo real para cada uma das 3 dimensões de foco: onde isso apareceu e qual impressão deixou.",
    "Conectem com a imagem que ele quer ter: como quer ser lembrado e o que hoje atrapalha essa percepção.",
    "Revisem o plano das 3 dimensões: ação concreta, como vai saber que melhorou e prazo de até 30 dias.",
    "Combinem pedir a percepção de alguém de confiança e refazer a roda no meio ou no fim da trilha."
  ],
  "perguntas_poderosas": [
    "Como você quer ser lembrado profissionalmente? A sua roda mostra isso?",
    "Que impressão você acha que deixa na primeira conversa com alguém da diretoria?",
    "Qual dimensão, se melhorasse, mudaria mais rápido a forma como você é visto?",
    "Que pessoa você admira pela postura profissional? O que ela faz que você ainda não faz?",
    "O que as suas mensagens e o seu LinkedIn dizem de você para quem não te conhece?"
  ],
  "entregavel": "Roda das 9 dimensões, faixa de nível e plano para as 3 dimensões de foco com ação, sinal de melhora e prazo, guardados na plataforma.",
  "dica_mentora": "Fale de imagem sem julgamento de gosto: o critério é a coerência com o ambiente, o cargo e a imagem que o próprio mentorado quer ter.",
  "candidata_a_automacao": true
}
$ficha$::jsonb, now())
on conflict (id) do update set numero = excluded.numero, nome = excluded.nome, lote = excluded.lote,
  arquivo = excluded.arquivo, dados = excluded.dados, atualizado_em = now();
