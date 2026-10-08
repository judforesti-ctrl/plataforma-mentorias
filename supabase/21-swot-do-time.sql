-- SWOT do Time: ferramenta online (lote 12) dentro da plataforma, com a ficha para o arsenal.
-- O líder faz o SWOT de 3 a 5 pessoas do time; o relatório fica guardado em "testes" (como as outras ferramentas online).
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema (atualiza a ficha).

insert into public.ferramentas (id, numero, nome, lote, arquivo, dados, atualizado_em)
values ('MNT-PES-08', '69', 'SWOT do Time', '12 (ferramentas online)', null, $ficha$
{
  "id": "MNT-PES-08",
  "numero": "69",
  "nome": "SWOT do Time",
  "arquivo_pdf": "",
  "lote": "12 (ferramentas online)",
  "tambem_conhecida_como": [
    "SWOT da Equipe",
    "FOFA do Time",
    "SWOT individual dos colaboradores",
    "Mapa de forças e fraquezas do time",
    "Análise SWOT das pessoas da equipe"
  ],
  "resumo": "Ferramenta online em que o líder faz um SWOT rápido de cada pessoa do time (3 a 5 colaboradores): forças, fraquezas, oportunidades e ameaças. O relatório mostra as forças e fraquezas mais frequentes no grupo, pontos de atenção, o que há ao redor do time e sugere duplas de aprendizado (quem pode ensinar o quê a quem), além do SWOT de cada pessoa.",
  "categoria": "Gestão de Pessoas",
  "nivel": "Liderar o time",
  "formato": "Ferramenta online já automatizada: o mentorado preenche antes da sessão, recebe o relatório na hora e ele fica guardado na ficha dele na plataforma; a sessão usa o relatório",
  "tempo": "15 a 25 min online + 40 min de conversa na sessão",
  "momento_trilha": "Meio, quando o líder precisa enxergar o time com clareza para desenvolver, delegar ou montar planos individuais",
  "combina_com": {
    "antes": [
      "Termômetro do Time",
      "Mapa de Engajamento"
    ],
    "mesma_sessao": [
      "Matriz de Competências do Time"
    ],
    "depois": [
      "Roteiro de One-on-One",
      "Escada da Delegação",
      "Plano de Ação 5W2H",
      "Matriz 9 Box"
    ]
  },
  "observacao": "Ficha sem PDF: a ferramenta é aplicada na versão online. O retrato é das PESSOAS do time, uma a uma, e do conjunto; para o retrato da área (processos, números, mercado) usar SWOT da Área. A ferramenta agrupa o que o líder escreve com palavras diferentes em temas (comunicação, organização, iniciativa, etc.) e, a partir deles, monta as duplas de aprendizado.",
  "tags": [
    "desenvolvimento-da-equipe",
    "avaliacao-de-desempenho",
    "sucessao-e-talentos",
    "delegacao"
  ],
  "palavras_chave": [
    "SWOT do time",
    "SWOT",
    "FOFA",
    "SWOT da equipe",
    "análise SWOT",
    "forças e fraquezas do time",
    "forças e fraquezas dos colaboradores",
    "oportunidades e ameaças",
    "pontos fortes e pontos fracos da equipe",
    "mapa do time",
    "conhecer o time",
    "perfil dos colaboradores",
    "avaliação do time",
    "avaliação da equipe",
    "desenvolvimento da equipe",
    "desenvolvimento individual",
    "duplas de aprendizado",
    "quem ensina quem",
    "talentos do time",
    "potencial da equipe",
    "diagnóstico da equipe",
    "raio-x do time",
    "retrato do time"
  ],
  "linguagem_dia_a_dia": [
    "não conheço direito o meu time",
    "não sei em quem apostar",
    "cada um tem um problema diferente",
    "não sei o que fazer com fulano",
    "tenho gente boa mas mal aproveitada",
    "o time é desigual",
    "sempre sobra para os mesmos",
    "não sei quem pode me substituir",
    "preciso desenvolver a equipe mas não sei por onde começar",
    "o diretor pediu um diagnóstico do time",
    "tem gente que vai embora se eu não fizer nada"
  ],
  "sinais": [
    "fala do time só de forma genérica, sem conseguir descrever cada pessoa",
    "delega sempre para as mesmas duas ou três pessoas",
    "não tem plano de desenvolvimento individual para ninguém",
    "é surpreendido por pedidos de demissão ou queda de desempenho",
    "não sabe apontar quem poderia assumir o lugar dele",
    "as fraquezas de várias pessoas são a mesma, mas ele trata caso a caso",
    "acabou de assumir um time que não conhece"
  ],
  "nao_usar_quando": "O líder precisa olhar para a área como um todo (processos, números, mercado): usar SWOT da Área. Quando o foco é avaliar desempenho e potencial para sucessão com critérios formais: usar Matriz 9 Box. Quando a dificuldade é um conflito ou uma conversa específica com uma pessoa: usar Mapa de Conflitos ou Roteiro de Conversas Difíceis. Com times grandes, escolher as 3 a 5 pessoas que mais pedem atenção agora.",
  "como_aplicar": [
    "Envie a ferramenta pela plataforma antes da sessão e peça que o mentorado responda com calma, pensando em fatos das últimas semanas, com 3 a 5 pessoas do time.",
    "Na sessão, abram o relatório guardado na ficha dele e peça que comente primeiro o que chamou a atenção: a força mais frequente, a fraqueza mais frequente e os pontos de atenção.",
    "Separem o que é da pessoa do que é do jeito como o trabalho está organizado: uma fraqueza que aparece em quase todos costuma ser processo, rotina ou falta de clareza do líder.",
    "Olhem as duplas de aprendizado sugeridas e escolham uma ou duas para começar já: quem ensina, quem aprende, em que situação real e até quando.",
    "Peçam um exemplo concreto de cada força mais citada e combinem como usá-la de propósito (delegar, dar visibilidade, colocar a pessoa no projeto certo).",
    "Fechem com um combinado por pessoa, curto e com prazo, e marquem refazer o SWOT em 90 dias para comparar."
  ],
  "perguntas_poderosas": [
    "Que força deste time você ainda não usa de propósito?",
    "Qual fraqueza do grupo nasce do jeito como o trabalho está organizado, e não das pessoas?",
    "Se você saísse de férias por um mês, quem seguraria o quê?",
    "Quem do time está crescendo mais rápido do que a função dele permite?",
    "Qual dupla de aprendizado pode começar nesta semana?",
    "O que cada pessoa diria se fizesse o próprio SWOT? Em que você acha que ela discordaria de você?"
  ],
  "entregavel": "Relatório do SWOT do Time guardado na plataforma (forças e fraquezas mais frequentes, pontos de atenção, duplas de aprendizado e SWOT de cada pessoa) e um combinado por pessoa, com prazo.",
  "dica_mentora": "O relatório é ponto de partida, não rótulo. O ganho está em o líder sair da sessão enxergando cada pessoa com um verbo de ação ao lado do nome, e não com um adjetivo.",
  "candidata_a_automacao": true
}
$ficha$::jsonb, now())
on conflict (id) do update set numero = excluded.numero, nome = excluded.nome, lote = excluded.lote,
  arquivo = excluded.arquivo, dados = excluded.dados, atualizado_em = now();
