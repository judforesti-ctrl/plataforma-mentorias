-- Roda da Vida: ferramenta online (lote 13) dentro da plataforma, com a ficha para o arsenal (não existia ficha).
-- 40 afirmativas (5 por área) com régua de 1 a 5; a média de cada área forma a roda. Médias, respostas e próximo cuidado ficam em "testes"
-- (como as outras ferramentas online). As reflexões só vão para a plataforma se ele marcar.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema (atualiza a ficha).

insert into public.arsenal_tags (tag, quando_aplicar)
values ('equilibrio-e-bem-estar', 'Cansaço, vida pessoal apertada pelo trabalho, falta de energia ou de tempo para si')
on conflict (tag) do update set quando_aplicar = excluded.quando_aplicar;

insert into public.ferramentas (id, numero, nome, lote, arquivo, dados, atualizado_em)
values ('MNT-AUT-10', '70', 'Roda da Vida', '13 (ferramentas online)', null, $ficha$
{
  "id": "MNT-AUT-10",
  "numero": "70",
  "nome": "Roda da Vida",
  "arquivo_pdf": "",
  "lote": "13 (ferramentas online)",
  "tambem_conhecida_como": [
    "Roda da Vida Mentorei",
    "Mapa de vida",
    "Roda do equilíbrio",
    "Equilíbrio entre vida pessoal e trabalho"
  ],
  "resumo": "Autoavaliação online com 40 afirmativas, 5 para cada uma das 8 áreas da vida (Corpo e saúde física, Emoções e descanso mental, Sentido e espiritualidade, Relações e rede de apoio, Trabalho e realização, Finanças e segurança, Lazer e prazer, Aprendizado e projetos). O mentorado arrasta uma régua de 1 (quase nunca) a 5 (quase sempre) em cada frase; a média das 5 frases de cada área desenha a roda. Mostra o ranking das áreas, a que sustenta e a que pede cuidado, traz 4 perguntas de reflexão e monta um pequeno próximo cuidado (área, passo, quando, apoio e o que pode dificultar). Gera um mapa em PDF.",
  "categoria": "Autoconhecimento e Autodesenvolvimento",
  "nivel": "Liderar a si",
  "formato": "Ferramenta online já automatizada: o mentorado responde as 40 afirmativas na régua de 1 a 5, vê a roda e o ranking e monta o próximo cuidado; as médias, as respostas de cada afirmativa e o plano ficam guardados na ficha dele na plataforma (as reflexões só se ele marcar). Ele também pode baixar o mapa em PDF",
  "tempo": "10 a 12 min online + 30 a 40 min de conversa na sessão",
  "momento_trilha": "Início da trilha, para conhecer a pessoa além do cargo, ou em qualquer momento em que cansaço, falta de tempo para si ou vida pessoal apertada pelo trabalho aparecerem. Vale refazer no fim da trilha para comparar",
  "combina_com": {
    "antes": [],
    "mesma_sessao": [
      "Mapa de Valores"
    ],
    "depois": [
      "Agenda Ideal do Gestor",
      "Termômetro da Inteligência Emocional",
      "PDI do Líder"
    ]
  },
  "observacao": "Ficha sem PDF: a ferramenta é aplicada na versão online. Escala de cada afirmativa: 1 Quase nunca, 2 Poucas vezes, 3 Às vezes, 4 Muitas vezes, 5 Quase sempre (só números inteiros; a régua começa sem resposta). A média de cada área tem uma casa decimal (ex.: 3,2). Não existe nota final: cada área fala por si. Faixas pela média da área: abaixo de 2,5 pede cuidado, de 2,5 a 3,9 em construção, de 4 a 5 te sustenta. A roda é um retrato de agora, não um julgamento de quem a pessoa é. O mapa é do mentorado: não vai para o RH nem para relatórios da empresa.",
  "tags": [
    "autoconhecimento",
    "equilibrio-e-bem-estar",
    "autogestao-emocional",
    "diagnostico-inicial",
    "plano-de-desenvolvimento"
  ],
  "palavras_chave": [
    "roda da vida",
    "equilíbrio",
    "qualidade de vida",
    "bem-estar",
    "vida pessoal",
    "vida e trabalho",
    "saúde",
    "sono",
    "cansaço",
    "energia",
    "descanso",
    "esgotamento",
    "estresse",
    "família",
    "amizades",
    "rede de apoio",
    "propósito",
    "espiritualidade",
    "finanças",
    "dinheiro",
    "lazer",
    "hobby",
    "aprendizado",
    "projetos pessoais",
    "satisfação",
    "prioridades da vida",
    "autoavaliação",
    "afirmativas",
    "escala de 1 a 5"
  ],
  "linguagem_dia_a_dia": [
    "vive para o trabalho",
    "não tem tempo para nada",
    "está sempre cansado",
    "não desliga nem nas férias",
    "deixou a saúde de lado",
    "não vê a família",
    "não faz nada que goste há muito tempo",
    "está no automático",
    "anda sem energia",
    "parou de cuidar de si",
    "a cabeça não para",
    "trabalha muito mas não se sente realizado",
    "está preocupado com dinheiro",
    "quer mudar algo mas não sabe por onde começar"
  ],
  "sinais": [
    "fala de cansaço, sono ruim ou falta de energia",
    "responde mensagens de trabalho à noite, nos fins de semana e nas férias",
    "deixou de lado atividade física, lazer ou pessoas importantes",
    "irritação ou impaciência fora do comum com o time",
    "conta que a vida pessoal está apertada pelo trabalho",
    "não consegue dizer o que quer para si além do cargo",
    "acabou de passar por uma mudança grande (promoção, mudança de cidade, filho, perda)"
  ],
  "nao_usar_quando": "Há sinais de sofrimento forte (crise de ansiedade, depressão, luto recente difícil): acolher e sugerir apoio de um profissional de saúde antes de qualquer plano. Quando o foco é só a rotina de trabalho e o tempo na agenda (usar Agenda Ideal do Gestor ou Mapa Estratégico x Operacional). Nunca usar como avaliação pedida pela empresa: o mapa é do mentorado.",
  "como_aplicar": [
    "Envie a ferramenta pela plataforma antes da sessão e diga que não existe resposta certa: em cada frase, ele marca o quanto aquilo acontece na vida dele hoje, e não o quanto deveria acontecer.",
    "Abram a roda juntos e peça que ele descreva o desenho com as próprias palavras antes de você comentar qualquer área.",
    "Comecem pela área que sustenta: o que ele já faz ali que funciona e pode servir de apoio para as outras.",
    "Vão para a área que pede cuidado, olhem juntos as afirmativas com nota mais baixa e perguntem o que um ponto a mais mudaria no dia a dia. Pergunte se ele quer comentar as reflexões da etapa 03 (ele escolhe o que mostrar).",
    "Revisem o próximo cuidado: um passo pequeno, com quando, onde e de quem pedir apoio. Se parecer grande demais, diminuam o passo.",
    "Combinem olhar o passo na sessão seguinte e refazer a roda no fim da trilha para comparar."
  ],
  "perguntas_poderosas": [
    "Olhando para a sua roda, o que chama mais a sua atenção?",
    "Que área, se melhorasse um pouco, puxaria as outras junto?",
    "O que a área que mais te sustenta tem que você pode levar para as outras?",
    "O que você tem adiado para depois que ainda não chegou?",
    "Como o jeito que você está hoje aparece na forma como você lidera?",
    "Qual é o menor passo possível que você topa dar ainda esta semana?"
  ],
  "entregavel": "Roda das 8 áreas com a média de cada uma (1 a 5), ranking das áreas, as respostas das 40 afirmativas e o próximo cuidado (área, passo, quando e onde, apoio e o que pode dificultar), guardados na plataforma; mapa em PDF com o mentorado.",
  "dica_mentora": "Não transforme a roda em meta de desempenho: o objetivo é cuidado, não nota alta. Respeite o que ele não quiser comentar e lembre que cuidar também é preservar o que já está bem.",
  "candidata_a_automacao": true
}
$ficha$::jsonb, now())
on conflict (id) do update set numero = excluded.numero, nome = excluded.nome, lote = excluded.lote,
  arquivo = excluded.arquivo, dados = excluded.dados, atualizado_em = now();
