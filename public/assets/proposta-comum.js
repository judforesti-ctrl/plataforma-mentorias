// Regras puras das propostas geradas pela IA, usadas pela tela (telas/proposta.js) e pelo montador do PowerPoint
// (netlify/lib/proposta-pptx.mjs): modelos de apresentação, formas de cobrança do investimento, ícones que a IA pode
// escolher e a conversão das propostas antigas (modelo provisório) para o formato atual.

export const MODELOS = { clara: 'Claro', escura: 'Escuro' };
export const MODELO_PADRAO = 'clara';

// Forma de cobrança: [texto ao lado do valor, singular, plural da quantidade]
export const COBRANCA = {
  modulo: ['por módulo', 'módulo', 'módulos'],
  individual: ['por mentoria individual', 'mentorado', 'mentorados'],
  turma: ['por turma', 'turma', 'turmas'],
  grupo: ['por mentoria em grupo', 'grupo', 'grupos'],
  pessoa: ['por pessoa', 'pessoa', 'pessoas'],
  fechado: ['valor total do projeto', '', ''],
  outro: ['', 'unidade', 'unidades'],
};
export const COBRANCA_ROTULO = {
  modulo: 'Por módulo', individual: 'Por mentoria individual', turma: 'Por turma', grupo: 'Por mentoria em grupo',
  pessoa: 'Por pessoa', fechado: 'Valor fechado (total)', outro: 'Outro',
};

export const numero = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/[^\d,.-]/g, '');
  if (!t) return null;
  // "1.234,56" ou "1234,56" (Brasil) e "1234.56"
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/\.(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) ? n : null;
};
export const reais = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Uma opção de preço: { nome, cobranca, outro, valor, quantidade, detalhe }
export function totalDe(op) {
  const v = numero(op && op.valor);
  if (v == null) return null;
  if (!op.cobranca || op.cobranca === 'fechado') return v;
  const q = numero(op.quantidade);
  return q ? Math.round(v * q * 100) / 100 : null;
}
const porUnidade = (op) => {
  if (op.cobranca === 'outro') { const t = String(op.outro || '').trim(); return !t ? '' : /^por\s/i.test(t) ? t : `por ${t}`; }
  return (COBRANCA[op.cobranca] || COBRANCA.fechado)[0];
};
// Como a opção aparece na página de investimento: valor grande, linhas abaixo e total.
export function descreverPreco(op) {
  const v = numero(op && op.valor);
  if (v == null) return { valor: 'A definir', linhas: [], total: null };
  const cob = op.cobranca || 'fechado';
  const linhas = [];
  const total = totalDe(op);
  if (cob === 'fechado') {
    if (op.detalhe) linhas.push(String(op.detalhe).trim());
    return { valor: reais(v), linhas, total };
  }
  const q = numero(op.quantidade);
  const unid = porUnidade(op);
  if (q) {
    const [, um, varios] = COBRANCA[cob] || COBRANCA.outro;
    const qt = cob === 'outro' ? `${q.toLocaleString('pt-BR')} × ${reais(v)}` : `${q.toLocaleString('pt-BR')} ${q === 1 ? um : varios}`;
    linhas.push([unid, qt].filter(Boolean).join('  •  '));
    if (q !== 1) linhas.push(`Total: ${reais(total)}`);
  } else if (unid) linhas.push(unid);
  if (op.detalhe) linhas.push(String(op.detalhe).trim());
  return { valor: reais(v), linhas, total };
}
// Uma linha curta para listas e histórico: "R$ 1.200,00 por pessoa × 20 = R$ 24.000,00"
export function resumoPreco(op) {
  const v = numero(op && op.valor);
  if (v == null) return `${op && op.nome ? `${op.nome}: ` : ''}a definir`;
  const t = totalDe(op);
  const q = numero(op.quantidade);
  const base = op.cobranca && op.cobranca !== 'fechado' ? `${reais(v)} ${porUnidade(op)}${q ? ` × ${q.toLocaleString('pt-BR')} = ${reais(t)}` : ''}` : reais(v);
  return `${op.nome ? `${op.nome}: ` : ''}${base}`;
}
export const precosValidos = (lista) => (Array.isArray(lista) ? lista : []).filter((op) => op && (numero(op.valor) != null || String(op.nome || '').trim())).slice(0, 3);
// Valor da proposta para o funil de vendas: o total da primeira opção (quando dá para calcular).
export const valorDaProposta = (lista) => { const p = precosValidos(lista); return p.length ? totalDe(p[0]) : null; };

// Ícones dos modelos que a IA pode escolher (o desenho vem do próprio modelo, nas cores de cada um).
export const ICONES = {
  banco: 'banco / instituição', conversa: 'conversa / comunicação', crescimento: 'gráfico subindo / resultado',
  quebra_cabeca: 'quebra-cabeça / encaixe', pessoa_lupa: 'pessoa com lupa / conhecer o cliente', aperto_de_maos: 'aperto de mãos / negociação',
  check: 'certo / entrega', cofrinho: 'cofrinho / investimento, finanças', escudo: 'escudo / proteção, segurança',
  estetoscopio: 'estetoscópio / saúde', ampulheta: 'ampulheta / tempo, prazo', pasta: 'pasta / casos, documentos',
  pessoas: 'pessoas / grupo, equipe', lupa: 'lupa / análise, diagnóstico', ferramenta: 'ferramenta / prática, aplicação',
};

// ---------- propostas do modelo provisório (antes de 09/10/2026) → formato atual ----------
const tituloDe = (v, padrao) => {
  if (v && typeof v === 'object') return { texto: v.texto || '', destaque: v.destaque || '' };
  const t = String(v || padrao || '').trim();
  const i = t.lastIndexOf(' ');
  return i > 0 ? { texto: t.slice(0, i + 1), destaque: t.slice(i + 1) } : { texto: '', destaque: t };
};
// "Conversas difíceis: preparo e escuta" → começo em negrito + resto (tópicos dos módulos)
export const topicoDe = (v) => {
  if (v && typeof v === 'object') return { destaque: v.destaque || '', texto: v.texto || '' };
  const t = String(v || '');
  const i = t.indexOf(':');
  return i > 0 && i < 60 ? { destaque: t.slice(0, i + 1), texto: t.slice(i + 1).trim() } : { destaque: '', texto: t };
};
export function normalizarConteudo(c) {
  if (!c || typeof c !== 'object' || c.versao === 2) return c;
  if (!c.capa && !c.modulos) return c;                       // só as opções (ainda gerando)
  const capa = c.capa || {};
  const [sub1 = '', sub2 = ''] = String(capa.subtitulo || '').split('\n');
  const [l1 = '', l2 = ''] = String(capa.rodape || '').split('\n');
  const itens = (s) => ((c[s] || {}).itens || []).map((it) => ({ ...it }));
  const inv = c.investimento || {};
  const novo = {
    ...c,
    versao: 2,
    secao: c.secao || 'O PROGRAMA',
    rotulo_modulo: c.rotulo_modulo || 'MÓDULO',
    capa: { tipo: capa.tipo || '', nome: capa.nome || '', subtitulo1: sub1, subtitulo2: sub2, linha1: l1, linha2: l2 },
    demanda: { itens: itens('demanda'), frase: (c.demanda || {}).frase || '' },
    quem_titulo: tituloDe(c.quem_titulo, 'Quem desenvolve o programa'),
    expertise: { titulo: tituloDe((c.expertise || {}).titulo, 'Expertise que faz diferença'), itens: itens('expertise') },
    visao: { titulo: tituloDe((c.visao || {}).titulo, 'O programa em módulos'), rodape: (c.visao || {}).rodape || '' },
    modulos: (c.modulos || []).map((m) => ({
      ...m, chamada: m.chamada || m.subtitulo || '', quando_curto: m.quando_curto || String(m.quando || '').replace(/\s*•\s*/g, ' / ').slice(0, 14),
      topicos: (m.topicos || []).map(topicoDe),
    })),
    destaques: (c.destaques || []).map((d) => ({ ...d, titulo: tituloDe(d.titulo), subtitulo: d.subtitulo || '', itens: (d.itens || []).map((it) => ({ ...it, destaque: it.destaque || it.titulo || '', texto_destaque: it.texto_destaque || '' })) })),
    metodologia: { itens: itens('metodologia') },
    personalizacao: { itens: itens('personalizacao'), frase: (c.personalizacao || {}).frase || '' },
    organizacao: { ...(c.organizacao || {}), titulo: tituloDe((c.organizacao || {}).titulo, 'Organização da jornada') },
    investimento: {
      nome_oferta: (inv.opcoes && inv.opcoes[0] && inv.opcoes[0].nome) || '', descricao_oferta: (inv.opcoes && inv.opcoes[0] && inv.opcoes[0].descricao) || '',
      escopo: inv.opcoes && inv.opcoes[1] ? { rotulo: inv.opcoes[1].nome, destaque: inv.opcoes[1].valor, texto: inv.opcoes[1].descricao } : { rotulo: 'Escopo contemplado', destaque: 'Conteúdo + prática', texto: '' },
      incluso: String(inv.incluso || '').replace(/^Incluso:\s*/i, ''), nao_incluso: inv.nao_incluso || '',
    },
    proximos: { itens: itens('proximos') },
    frase_final: c.frase_final && typeof c.frase_final === 'object' ? c.frase_final : { antes: String(c.frase_final || '').replace(/[“”"]/g, ''), destaque: '', depois: '' },
  };
  if (!Array.isArray(novo.precos)) {
    const op = inv.opcoes && inv.opcoes[0];
    novo.precos = op ? [{ nome: op.nome || '', cobranca: 'fechado', valor: numero(op.valor), quantidade: null, detalhe: '' }] : [];
  }
  return novo;
}
