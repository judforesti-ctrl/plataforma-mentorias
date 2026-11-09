// Regras puras do descritivo dos módulos pela proposta, usadas pelas telas (descritivo-proposta.js, importar-proposta.js)
// e pelo servidor (/api/proposta-modulos): transformar a proposta guardada na plataforma em texto para a IA e,
// no descritivo automático (2026-11-09), escolher qual proposta da empresa vale para a turma.
import { normalizarConteudo } from './proposta-comum.js';

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const vazio = (t) => !String(t == null ? '' : t).trim();

// palavras que não ajudam a reconhecer a empresa (nome do sistema, "cooperativa"...)
const GENERICAS = new Set(['sicoob', 'sicredi', 'unicred', 'cresol', 'ailos', 'cooperativa', 'credito', 'livre', 'admissao', 'associados',
  'ltda', 'grupo', 'central', 'banco', 'coop', 'dos', 'das', 'e', 'de', 'do', 'da']);
const palavras = (s) => norm(s).split(' ').filter((p) => p.length >= 3 && !GENERICAS.has(p));
export function mesmaEmpresa(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = new Set(palavras(a));
  return palavras(b).some((p) => pa.has(p));
}
const tituloTexto = (x) => (x && typeof x === 'object' ? `${x.texto || ''}${x.destaque || ''}` : String(x || ''));

// Proposta importada (resultado da IA na importação) que tem módulos? (fora as leituras de módulos e de certificados)
export const importacaoComModulos = (r) => !!(r && r.tipo !== 'modulos' && r.tipo !== 'certificado' && (r.turmas || []).some((t) => (t.modulos || []).length));
// Proposta gerada pela IA em Vendas que já tem módulos escritos?
export const conteudoComModulos = (c) => !!(c && typeof c === 'object' && (c.modulos || []).length);
// Arquivo da proposta que dá para ler (PDF ou PowerPoint)
export const arquivoLegivel = (caminho) => /\.(pdf|pptx)$/i.test(String(caminho || ''));
export const tipoArquivo = (caminho) => (/\.pptx$/i.test(String(caminho || '')) ? 'pptx' : /\.pdf$/i.test(String(caminho || '')) ? 'pdf' : null);

// Proposta importada (resultado da IA na importação) → texto para a IA ligar aos módulos.
export function textoDaImportacao(r) {
  const L = [`Empresa: ${r.empresa || ''}`];
  for (const t of r.turmas || []) {
    L.push('', `Turma: ${t.nome || ''}`);
    if (t.perfil_turma) L.push('O que entendemos da demanda e quem participa:', t.perfil_turma);
    if (t.metodologia) L.push('Metodologia:', t.metodologia);
    for (const m of t.modulos || []) {
      L.push('', `Módulo ${m.numero} · ${m.titulo || ''}`);
      if (m.tematica) L.push(m.tematica);
      if (m.recomendacoes) L.push(`Orientações para quem conduz: ${m.recomendacoes}`);
    }
  }
  return L.join('\n');
}

// Proposta gerada pela IA em Vendas (conteúdo do PowerPoint) → texto.
export function textoDaPropostaIA(conteudo, empresa) {
  const c = normalizarConteudo(conteudo) || {};
  const cp = c.capa || {};
  const rot = c.rotulo_modulo || 'MÓDULO';
  const L = [`Empresa: ${empresa || ''}`, ...[cp.tipo, cp.nome, cp.subtitulo1, cp.subtitulo2, cp.linha1, cp.linha2].filter(Boolean)];
  if (c.demanda && (c.demanda.itens || []).length) L.push('', 'O que entendemos da sua demanda:', ...c.demanda.itens.map((i) => `• ${i.titulo}: ${i.texto}`), c.demanda.frase || '');
  (c.modulos || []).forEach((m, i) => {
    L.push('', `${rot} ${i + 1} · ${m.titulo || ''}`);
    if (m.subtitulo) L.push(m.subtitulo);
    if (m.objetivo) L.push(`Objetivo: ${m.objetivo}`);
    if (m.entrega) L.push(`Entrega prática: ${m.entrega}`);
    if ((m.topicos || []).length) L.push('Tópicos abordados:', ...m.topicos.map((tp) => `• ${[tp.destaque, tp.texto].filter(Boolean).join(' ')}`));
    for (const d of (c.destaques || []).filter((x) => Number(x.apos_modulo) === i + 1)) {
      L.push(`Aprofundamento de ${rot} ${i + 1}: ${tituloTexto(d.titulo)}${d.subtitulo ? ` · ${d.subtitulo}` : ''}`,
        ...(d.itens || []).map((it) => `• ${[it.destaque, it.texto_destaque, it.texto].filter(Boolean).join(' ')}`));
    }
  });
  if (c.metodologia && (c.metodologia.itens || []).length) L.push('', 'Uma experiência dinâmica e aplicada:', ...c.metodologia.itens.map((i) => `• ${i.titulo}: ${i.texto}`));
  if (c.personalizacao && (c.personalizacao.itens || []).length) L.push('', 'Personalização que faz diferença:', ...c.personalizacao.itens.map((i) => `• ${i.titulo}: ${i.texto}`), c.personalizacao.frase || '');
  return L.join('\n');
}

// De onde sai o texto de uma proposta guardada: a leitura da importação, o conteúdo gerado pela IA ou o arquivo.
// p = linha de "propostas" (com conteudo, importacao_id, arquivo_storage); importacao = resultado da importação (se houver).
export function fonteDaProposta(p, importacao = null) {
  if (importacaoComModulos(importacao)) return 'importacao';
  if (conteudoComModulos(p && p.conteudo)) return 'ia';
  if (p && arquivoLegivel(p.arquivo_storage)) return 'arquivo';
  return null;
}

// Qual proposta vale para a turma, no descritivo automático. Cada candidata:
// { chave, fonte ('importacao' | 'ia' | 'arquivo'), turmaId (da oportunidade), empresaId, empresaNome, status, enviada (bool),
//   etapa (da oportunidade), quando (ISO) }. turma = { id, empresa_id, empresa: { nome } }.
// Ordem: a proposta da oportunidade ligada a esta turma; depois as da mesma empresa (a enviada antes da pronta para enviar,
// a da venda fechada antes da que ainda está aberta, a que ainda não virou outra turma antes da que já virou, a mais nova
// antes da mais antiga); por último a de uma empresa com nome parecido. Proposta sem texto ou ainda sendo gerada não conta.
export function pontosDaProposta(c, turma) {
  if (!c || !c.fonte || c.status === 'gerando' || c.status === 'erro') return null;
  const empresaNome = turma && turma.empresa ? turma.empresa.nome : '';
  let p = 0;
  if (turma && c.turmaId && c.turmaId === turma.id) p += 10000;
  else if (turma && turma.empresa_id && c.empresaId === turma.empresa_id) p += 5000;
  else if (mesmaEmpresa(c.empresaNome, empresaNome)) p += 2000;
  else return null;
  if (c.turmaId && turma && c.turmaId !== turma.id) p -= 300;   // já virou outra turma
  if (c.enviada || c.status === 'enviada') p += 60;
  else if (c.status === 'aprovada') p += 40;
  else if (c.status === 'rascunho') p += 10;
  if (c.etapa === 'fechado') p += 30;
  else if (c.etapa === 'perdido') p -= 500;
  return p;
}

export function escolherProposta(candidatas, turma) {
  const lista = (candidatas || []).map((c) => ({ c, p: pontosDaProposta(c, turma) })).filter((x) => x.p != null);
  lista.sort((a, b) => (b.p - a.p) || String(b.c.quando || '').localeCompare(String(a.c.quando || '')));
  return lista.length ? lista[0].c : null;
}

// Texto curto de onde veio (para os avisos da tela)
export const ORIGEM_FONTE = { importacao: 'proposta importada', ia: 'proposta gerada pela IA', arquivo: 'arquivo da proposta' };
