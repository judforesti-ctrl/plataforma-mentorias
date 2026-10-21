// "Qual é o seu canal?" (MNT-COM-12): perguntas, textos do laudo e contas. Arquivo puro (sem tela), usado pela página da
// ferramenta (public/ferramentas/qual-e-o-seu-canal/) e pelo servidor (/api/canal-laudo, que manda o laudo por e-mail).
// Cada resposta vale 1 ponto para um canal: V = visual, A = auditivo, S = sinestésico. 15 perguntas, cerca de 3 minutos.

export const CANAIS = ['V', 'A', 'S'];

// tipo: rapida (primeira impressão, cartões com figura), situacao (o que você faria?), frase (qual frase é a sua cara?)
export const PERGUNTAS = [
  { tipo: 'rapida', t: 'Pense na última viagem boa que você fez. O que vem primeiro à cabeça?', o: {
    V: ['🏞️', 'A paisagem, as cores, os lugares'], A: ['🎶', 'Os sons, a música, as conversas'], S: ['🌤️', 'A sensação: o clima, o descanso, o abraço'] } },
  { tipo: 'situacao', t: 'Você precisa aprender a usar um sistema novo no trabalho. O que você prefere?', o: {
    V: 'Um passo a passo com imagens ou um vídeo', A: 'Que alguém me explique, conversando', S: 'Ir mexendo e aprendendo na prática' } },
  { tipo: 'frase', t: 'Quando uma ideia faz sentido para você, o que você costuma dizer?', o: {
    V: 'Agora eu vi onde você quer chegar.', A: 'Isso me soa muito bem.', S: 'Isso me pegou. Sinto que dá certo.' } },
  { tipo: 'situacao', t: 'Alguém vai te dar um retorno importante sobre o seu trabalho. Como você prefere receber?', o: {
    V: 'Por escrito, para ler e reler com calma', A: 'Numa conversa, ouvindo o tom da pessoa', S: 'Pessoalmente, num clima de confiança, sem pressa' } },
  { tipo: 'situacao', t: 'Numa reunião longa, o que mais ajuda você a manter a atenção?', o: {
    V: 'Slides, gráficos ou um quadro com as ideias', A: 'Uma boa discussão, com perguntas e troca de ideias', S: 'Poder me mexer, anotar à mão e fazer pausas' } },
  { tipo: 'rapida', t: 'Você vai trocar de carro. O que pesa mais na decisão?', o: {
    V: ['🚗', 'A aparência: cor, desenho, acabamento'], A: ['💬', 'O que contam o vendedor e quem já tem o carro'], S: ['💺', 'O conforto ao sentar e dirigir no test-drive'] } },
  { tipo: 'situacao', t: 'Para lembrar o nome de alguém que você acabou de conhecer, o que funciona melhor?', o: {
    V: 'Lembrar do rosto ou do nome escrito no crachá', A: 'Repetir o nome em voz alta durante a conversa', S: 'Lembrar do aperto de mão e de como foi a conversa' } },
  { tipo: 'frase', t: 'Quando você não entendeu uma explicação, o que costuma dizer?', o: {
    V: 'Ainda não estou enxergando isso com clareza.', A: 'Explica de novo? Não me soou claro.', S: 'Ainda não consegui pegar a ideia.' } },
  { tipo: 'situacao', t: 'Você precisa apresentar uma ideia nova para a equipe ou para um sócio. O que você faz primeiro?', o: {
    V: 'Faço um esquema, um desenho ou mostro um exemplo', A: 'Conto a ideia, explico com calma e respondo as dúvidas', S: 'Coloco todo mundo para testar junto, na prática' } },
  { tipo: 'situacao', t: 'Um cliente ou alguém da equipe está insatisfeito. O que você percebe primeiro?', o: {
    V: 'A expressão do rosto e a postura', A: 'O tom de voz e as palavras que a pessoa escolhe', S: 'O clima pesado: sinto antes mesmo de a pessoa falar' } },
  { tipo: 'rapida', t: 'Num restaurante novo, o que faz você querer voltar?', o: {
    V: ['🍽️', 'O ambiente bonito e a apresentação dos pratos'], A: ['🎵', 'A música, a conversa boa, o atendimento simpático'], S: ['🛋️', 'O conforto e a sensação de ser bem acolhido'] } },
  { tipo: 'situacao', t: 'Você precisa escolher entre duas propostas de fornecedores. O que mais te convence?', o: {
    V: 'Uma comparação lado a lado, em tabela ou gráfico', A: 'Conversar com eles e ouvir quem já contratou', S: 'Visitar, experimentar e sentir qual me dá mais segurança' } },
  { tipo: 'frase', t: 'Como você descreveria um dia de trabalho muito bom?', o: {
    V: 'Foi um dia brilhante. Tudo clareou.', A: 'Foi um dia em sintonia. Todo mundo falou a mesma língua.', S: 'Foi um dia leve. Saí com a sensação de missão cumprida.' } },
  { tipo: 'situacao', t: 'Quando o dia aperta e o estresse bate, o que mais ajuda você a se recompor?', o: {
    V: 'Arrumar a mesa e ver as coisas no lugar', A: 'Conversar com alguém ou ouvir uma música', S: 'Caminhar, me mexer ou respirar fundo' } },
  { tipo: 'situacao', t: 'Depois de uma palestra ou de um evento, o que fica na sua memória?', o: {
    V: 'As imagens, os slides e o visual do lugar', A: 'As frases marcantes e o jeito de falar de quem apresentou', S: 'A energia do lugar e o que eu senti' } },
];

export const TOTAL = PERGUNTAS.length;
export const TIPOS = { rapida: 'Primeira impressão', situacao: 'O que você faria?', frase: 'Qual frase é mais a sua cara?' };
// recados que aparecem no caminho (índice da pergunta → texto)
export const MARCOS = { 5: 'Ótimo ritmo! Já foi um terço.', 8: 'Metade do caminho!', 12: 'Falta pouco: só mais três.' };

export const TEXTOS = {
  V: {
    nome: 'Visual', cor: '#C8F04A',
    resumo: 'Você entende e lembra melhor o que consegue ver. Imagens, esquemas, cores e organização ajudam você a pensar com clareza.',
    desc: 'Quem tem o canal visual mais forte pensa em imagens. Gosta de ver o todo antes dos detalhes, presta atenção na aparência das coisas e entende mais rápido quando a informação está organizada: um gráfico, um esquema no quadro, uma lista bem arrumada. Costuma falar mais rápido, porque as imagens chegam à cabeça antes das palavras.',
    aprende: ['Com algo para ver: esquema, gráfico, vídeo ou um exemplo pronto.', 'Anotando e organizando a informação, com tópicos, setas ou cores.', 'Vendo o todo primeiro e só depois os detalhes.', 'Explicações só faladas, longas e sem apoio visual tendem a cansar você.'],
    fortes: ['Enxerga o quadro geral e organiza bem as ideias.', 'Percebe detalhes de apresentação, de expressão e de ambiente.', 'Explica com exemplos e imagens que as pessoas lembram.'],
    atencao: ['Pode perder a paciência com quem explica devagar ou dá muitas voltas.', 'Pode julgar pela aparência (de um material, de um lugar, de uma pessoa) antes de ouvir.', 'Pode esquecer o que foi só falado, sem nada por escrito.'],
    falarComigo: ['Mostre: traga um esquema, um exemplo ou um rascunho.', 'Mande por escrito o que foi combinado.', 'Vá direto ao ponto e mostre o todo antes dos detalhes.', 'Olhe nos olhos: para você, o contato visual mostra atenção.'],
    palavras: ['ver', 'olhar', 'mostrar', 'clareza', 'enxergar', 'perspectiva', 'imagem', 'foco', 'brilhante', 'panorama'],
    atitudes: ['Antes da próxima reunião importante, leve a sua ideia em uma página só, com um esquema simples.', 'Quando ouvir uma explicação longa, anote em tópicos e confira com a pessoa: "foi isso que você quis dizer?"', 'Numa conversa difícil desta semana, ouça até o fim antes de responder: o que você vê nem sempre conta a história toda.'],
    exercitar: 'Exercite o seu lado visual: na próxima explicação, desenhe um esquema simples em vez de só falar.',
    sinais: 'Fala rápido, gesticula bastante e usa palavras como "veja", "olha", "está claro".',
    comoFalar: ['Mostre: um esquema, um exemplo, uma página só.', 'Mande por escrito o que foi combinado.', 'Vá direto ao ponto.'],
  },
  A: {
    nome: 'Auditivo', cor: '#7CC6F2',
    resumo: 'Você entende e lembra melhor o que ouve e conversa. O tom de voz, as palavras certas e uma boa troca de ideias fazem diferença para você.',
    desc: 'Quem tem o canal auditivo mais forte pensa em palavras e sons. Gosta de conversar sobre o assunto, de ouvir a explicação e de pensar em voz alta. Dá muito valor ao tom de voz, à escolha das palavras e a uma conversa bem conduzida. Costuma lembrar frases inteiras do que alguém disse e percebe logo quando o tom não combina com o que está sendo dito.',
    aprende: ['Ouvindo e conversando: explicação falada, debate, perguntas e respostas.', 'Repetindo em voz alta ou explicando para alguém o que aprendeu.', 'Com áudios, podcasts, palestras e reuniões com troca de ideias.', 'Textos longos, lidos em silêncio e sem ninguém para conversar, tendem a render menos.'],
    fortes: ['Ouve com atenção e lembra do que foi dito.', 'Escolhe bem as palavras e sabe explicar com calma.', 'Percebe o tom de voz e o que está por trás dele.'],
    atencao: ['Pode se distrair com barulho ou com conversas paralelas.', 'Pode se prender a uma palavra mal escolhida ou se magoar com o tom.', 'Pode preferir conversar quando o assunto pedia um registro por escrito.'],
    falarComigo: ['Converse: explique em voz alta e abra espaço para perguntas.', 'Cuide do tom de voz: para você, o jeito de dizer pesa tanto quanto o que se diz.', 'Prefira uma ligação ou um áudio a uma mensagem curta e seca.', 'Escolha um lugar sem barulho para as conversas importantes.'],
    palavras: ['ouvir', 'dizer', 'conversar', 'soar', 'sintonia', 'tom', 'explicar', 'escutar', 'harmonia', 'falar a mesma língua'],
    atitudes: ['Depois da próxima reunião, mande um resumo por escrito do que ficou combinado: nem todo mundo guarda o que ouviu tão bem quanto você.', 'Na próxima conversa importante, faça mais perguntas e fale menos: o seu ouvido é o seu ponto forte.', 'Esta semana, quando um tom te incomodar, pergunte o que a pessoa quis dizer antes de reagir.'],
    exercitar: 'Exercite o seu lado auditivo: na próxima reunião, repita em voz alta o que você entendeu antes de dar a sua opinião.',
    sinais: 'Fala com ritmo, gosta de conversar, pensa em voz alta e usa palavras como "ouvi dizer", "me soa", "me conta".',
    comoFalar: ['Converse e deixe espaço para perguntas.', 'Cuide do tom de voz.', 'Prefira ligação ou áudio a uma mensagem seca.'],
  },
  S: {
    nome: 'Sinestésico', cor: '#F2B85B',
    resumo: 'Você entende e lembra melhor o que faz, experimenta e sente. A prática, o clima da conversa e a confiança entre as pessoas fazem diferença para você.',
    desc: 'Quem tem o canal sinestésico mais forte pensa pelo que sente e pelo que faz. Aprende colocando a mão na massa, presta atenção no clima entre as pessoas e decide muito pela sensação de segurança. Costuma falar com mais calma, fazer pausas para sentir o que vai dizer e valorizar a proximidade, o conforto e a confiança.',
    aprende: ['Fazendo: testando, praticando, errando e ajustando.', 'Com exemplos reais, simulações e atividades em que pode se mexer.', 'Em partes pequenas, com tempo para absorver e pausas.', 'Aulas longas, paradas e só teóricas tendem a cansar você.'],
    fortes: ['Cria confiança e um clima bom nas relações.', 'Percebe como as pessoas estão se sentindo, às vezes antes delas mesmas.', 'Aprende rápido na prática e resolve com as próprias mãos.'],
    atencao: ['Pode demorar para decidir quando não se sente seguro.', 'Pode levar críticas para o lado pessoal quando o clima fica pesado.', 'Pode ter pouca paciência com teoria, planilhas e explicações longas.'],
    falarComigo: ['Dê tempo: deixe que eu experimente e sinta antes de decidir.', 'Mostre na prática, com um exemplo real ou fazendo junto.', 'Cuide do clima: uma conversa calma e de confiança me abre mais do que uma conversa apressada.', 'Pergunte como eu estou me sentindo com aquilo, e não só o que eu acho.'],
    palavras: ['sentir', 'pegar', 'tocar', 'firme', 'leve', 'pesado', 'confortável', 'conexão', 'seguro', 'ter firmeza'],
    atitudes: ['Antes de uma decisão importante, faça um teste pequeno na prática em vez de só pensar nela.', 'Na próxima conversa difícil, anote o que foi dito, além do que você sentiu: separe o clima do conteúdo.', 'Esta semana, quando for ensinar algo a alguém, faça junto uma vez antes de pedir que a pessoa faça sozinha.'],
    exercitar: 'Exercite o seu lado sinestésico: na próxima conversa, pergunte como a pessoa está antes de entrar no assunto.',
    sinais: 'Fala mais devagar, com pausas, gosta de proximidade e usa palavras como "sinto", "pegar", "firme".',
    comoFalar: ['Dê tempo para a pessoa absorver.', 'Faça junto, na prática.', 'Cuide do clima e da confiança.'],
  },
};

export const AVISO = 'Este resultado mostra o seu canal preferido, não um rótulo. Todo mundo usa os três canais: o que muda é por onde a informação entra com mais facilidade. Use o laudo para se conhecer e para se comunicar melhor com quem é diferente de você.';

// contagem das respostas ({ V, A, S }); respostas = lista com 'V' | 'A' | 'S' | null
export function contar(respostas) {
  const c = { V: 0, A: 0, S: 0 };
  (respostas || []).forEach((r) => { if (c[r] != null) c[r] += 1; });
  return c;
}

// "8-4-3" (o link do laudo no e-mail; sem nome nem respostas) ↔ { V, A, S }
export const codigo = (c) => `${c.V}-${c.A}-${c.S}`;
export function lerCodigo(txt) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{1,2})$/.exec(String(txt || '').trim());
  if (!m) return null;
  const c = { V: +m[1], A: +m[2], S: +m[3] };
  return c.V + c.A + c.S === TOTAL ? c : null;
}

// porcentagens inteiras; canais empatados mostram o mesmo número (por isso a soma pode dar 99 ou 101)
export function porcentagens(c) {
  const tot = CANAIS.reduce((s, k) => s + c[k], 0) || 1;
  return Object.fromEntries(CANAIS.map((k) => [k, Math.round((c[k] / tot) * 100)]));
}

const juntarNomes = (ks) => (ks.length === 1 ? TEXTOS[ks[0]].nome : `${ks.slice(0, -1).map((k) => TEXTOS[k].nome).join(', ')} e ${TEXTOS[ks[ks.length - 1]].nome}`);
// intercala as listas dos canais predominantes (V1, A1, V2, A2…) e corta no tamanho pedido
function intercalar(ks, campo, n) {
  const out = [];
  for (let i = 0; out.length < n && i < 10; i += 1) ks.forEach((k) => { const x = TEXTOS[k][campo][i]; if (x && out.length < n && !out.includes(x)) out.push(x); });
  return out;
}

// O laudo inteiro a partir da contagem: o que a tela, o PDF e o e-mail mostram.
export function laudo(c) {
  const p = porcentagens(c);
  const ordem = [...CANAIS].sort((a, b) => c[b] - c[a] || CANAIS.indexOf(a) - CANAIS.indexOf(b));
  const max = c[ordem[0]];
  const dom = ordem.filter((k) => c[k] === max);
  const fora = ordem.filter((k) => !dom.includes(k));
  const segundo = fora[0] || null;
  const menor = dom.length === 3 ? null : ordem[ordem.length - 1];
  const tipo = dom.length === 3 ? 'equilibrado' : dom.length === 2 ? 'combinado' : 'unico';

  let leitura;
  if (tipo === 'equilibrado') leitura = 'Você usa os três canais por igual. Isso é pouco comum e ajuda muito a se adaptar a pessoas diferentes: você consegue mostrar, conversar e fazer junto, conforme quem está do outro lado.';
  else if (tipo === 'combinado') leitura = `Você tem dois canais fortes, empatados: ${juntarNomes(dom)} (${p[dom[0]]}% cada). Você transita bem entre os dois, e por isso o laudo mostra as duas formas.`;
  else {
    const dif = max - c[segundo];
    leitura = `O canal ${TEXTOS[dom[0]].nome.toLowerCase()} aparece em ${p[dom[0]]}% das suas escolhas. É por ele que a informação entra mais fácil para você.`
      + (dif <= 2 ? ` O seu segundo canal, ${TEXTOS[segundo].nome.toLowerCase()} (${p[segundo]}%), está bem perto: no dia a dia você combina os dois.` : '');
  }
  if (tipo === 'unico' && c[segundo] === c[menor]) leitura += ` Os canais ${TEXTOS[segundo].nome.toLowerCase()} e ${TEXTOS[menor].nome.toLowerCase()} aparecem menos (${p[menor]}% cada): exercitar esses caminhos ajuda você a se conectar com quem é assim.`;
  else if (menor) leitura += ` O canal que você menos usa é o ${TEXTOS[menor].nome.toLowerCase()} (${p[menor]}%): exercitar esse caminho ajuda você a se conectar com quem é assim.`;

  const n = dom.length;
  const atitudes = tipo === 'unico' ? [TEXTOS[dom[0]].atitudes[0], TEXTOS[dom[0]].atitudes[1], TEXTOS[menor].exercitar]
    : tipo === 'combinado' ? [TEXTOS[dom[0]].atitudes[0], TEXTOS[dom[1]].atitudes[0], TEXTOS[menor].exercitar]
      : CANAIS.map((k) => TEXTOS[k].atitudes[0]);
  return {
    contagem: c, pct: p, ordem, dom, segundo, menor, tipo,
    titulo: tipo === 'equilibrado' ? 'Equilibrado' : juntarNomes(dom),
    chapeu: tipo === 'unico' ? 'Seu canal preferencial' : tipo === 'combinado' ? 'Seus canais preferenciais' : 'Seu perfil',
    resumo: tipo === 'equilibrado' ? 'Você entende e lembra bem por qualquer caminho: vendo, ouvindo ou fazendo. A sua força é a flexibilidade.' : dom.map((k) => TEXTOS[k].resumo).join(' '),
    desc: dom.map((k) => TEXTOS[k].desc),
    aprende: intercalar(dom, 'aprende', n === 1 ? 4 : n === 2 ? 4 : 3),
    fortes: intercalar(dom, 'fortes', n === 1 ? 3 : 4),
    atencao: intercalar(dom, 'atencao', n === 1 ? 3 : 4),
    falarComigo: intercalar(dom, 'falarComigo', n === 1 ? 4 : n === 2 ? 4 : 3),
    palavras: intercalar(dom, 'palavras', n === 1 ? 10 : 12),
    atitudes,
    leitura,
  };
}
