-- Ficha de "Plano de Ação: Meu Próximo Passo" (MNT-LID-10) no arsenal: ferramenta online (as 6 perguntas da folha impressa),
-- também aberta ao público pelo link/QR code. Os contatos de quem preenche de fora chegam em Vendas › Pessoa física (precisa do script 39);
-- as respostas do plano ficam só no celular da pessoa.
-- Não cria tabela nova. Rodar no SQL Editor do Supabase (New query → colar tudo → Run); pode rodar de novo.

insert into public.ferramentas (id, numero, nome, lote, arquivo, dados, atualizado_em)
values ('MNT-LID-10', '73', 'Plano de Ação: Meu Próximo Passo', '15 (ferramentas online)', null, $ficha$
{
  "id": "MNT-LID-10",
  "numero": "73",
  "nome": "Plano de Ação: Meu Próximo Passo",
  "arquivo_pdf": "",
  "lote": "15 (ferramentas online)",
  "tambem_conhecida_como": [
    "Meu próximo passo",
    "Plano de ação do encontro",
    "Plano de ação individual",
    "Compromisso de prática"
  ],
  "resumo": "Plano de ação online em 6 perguntas, cerca de 5 minutos: o comportamento que a pessoa quer fortalecer (protagonismo, iniciativa, colaboração ou foco no valor para o cooperado), a situação real em que vai praticar, a ação observável que depende dela, com quem vai colaborar, quando dá o primeiro passo (data ou ocasião) e como vai perceber que gerou valor. No fim mostra o plano pronto, com a ação em destaque, para baixar em PDF, mandar pelo WhatsApp e pôr na agenda. Também é aberta ao público pelo link ou QR code: a pessoa deixa nome, e-mail, WhatsApp e cargo (chegam em Vendas › Pessoa física); o plano não sai do celular dela.",
  "categoria": "Liderança",
  "nivel": "Liderar a si e o time",
  "formato": "Ferramenta online já automatizada (substitui a folha impressa \"Plano de Ação: Meu Próximo Passo\"). Na mentoria: enviada pela plataforma, o plano fica guardado na ficha do mentorado. Em treinamentos e trilhas: QR code no último slide; cada participante monta o plano no celular, baixa em PDF ou manda para o próprio WhatsApp",
  "tempo": "5 min online + 10 a 15 min de troca em duplas ou na sessão",
  "momento_trilha": "Fechamento de um encontro, módulo ou sessão, para transformar o que foi visto em uma ação concreta até o próximo encontro",
  "combina_com": {
    "antes": [],
    "mesma_sessao": [],
    "depois": []
  },
  "observacao": "Ficha sem PDF: a ferramenta é aplicada na versão online. As 6 perguntas são as mesmas da folha impressa. Para o público, nada do plano é guardado pela Mentorei (só o contato); dentro da plataforma, o plano vai para a ficha do mentorado ou, na trilha, para os mentores da trilha.",
  "tags": [
    "plano-de-desenvolvimento",
    "disciplina-de-execucao",
    "relacionamento-entre-areas",
    "visao-de-cliente"
  ],
  "palavras_chave": [
    "plano de ação",
    "próximo passo",
    "meu próximo passo",
    "compromisso",
    "protagonismo",
    "iniciativa",
    "colaboração",
    "foco no cooperado",
    "valor para o cooperado",
    "cooperativismo",
    "colocar em prática",
    "fechamento do módulo",
    "treinamento"
  ],
  "linguagem_dia_a_dia": [
    "a gente aprende e não aplica",
    "sai do treinamento animado e na segunda volta tudo igual",
    "não sei por onde começar",
    "fica só na teoria",
    "quero ver mudança na prática"
  ],
  "sinais": [
    "o conteúdo dos encontros não aparece na rotina",
    "compromissos vagos (\"vou melhorar a comunicação\") sem data nem pessoa",
    "a equipe espera alguém pedir para agir",
    "pouca troca entre agências, áreas e colegas gerentes"
  ],
  "nao_usar_quando": "A pessoa ainda não sabe qual comportamento quer desenvolver (comece por uma autoavaliação, como a Roda do Profissional do Futuro). Não usar como meta cobrada pela empresa: o plano é da pessoa.",
  "como_aplicar": [
    "No fim do encontro, mostre o QR code e dê 5 minutos para cada um montar o plano no celular.",
    "Peça que a ação seja algo que outra pessoa conseguiria ver acontecer e que dependa só de quem escreve.",
    "Em duplas, cada um lê o plano para o outro; o colega pergunta \"quando exatamente?\" e \"como você vai saber que deu certo?\".",
    "Peça que cada um baixe em PDF ou mande o plano para o próprio WhatsApp e ponha o primeiro passo na agenda.",
    "No encontro seguinte, abra com 2 ou 3 pessoas contando o que fizeram e o sinal de valor que perceberam."
  ],
  "perguntas_poderosas": [
    "O que alguém de fora veria você fazendo diferente nesta semana?",
    "O que pode atrapalhar esse primeiro passo, e o que você faz se acontecer?",
    "Quem precisa saber do seu plano para ele dar certo?",
    "Como o cooperado vai sentir essa mudança?",
    "Se der certo, qual é o passo seguinte?"
  ],
  "entregavel": "Plano de ação com a ação em destaque, a data do primeiro passo, com quem e o sinal de valor; em PDF, no WhatsApp e na agenda. Na plataforma, guardado na ficha do mentorado.",
  "dica_mentora": "O ganho está na terceira pergunta: \"ação observável e que dependa de você\". Se a resposta for uma intenção (\"ser mais proativo\"), pergunte o que exatamente a pessoa vai fazer, com quem e quando, até virar uma cena.",
  "candidata_a_automacao": true
}
$ficha$::jsonb, now())
on conflict (id) do update set numero = excluded.numero, nome = excluded.nome, lote = excluded.lote,
  arquivo = excluded.arquivo, dados = excluded.dados, atualizado_em = now();
