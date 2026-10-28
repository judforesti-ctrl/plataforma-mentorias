// Regras do emissor de certificados (script 47), usadas pelas telas e pelas funções do servidor.
// O desenho do certificado é o modelo em /certificados/modelo/certificado.html (cópia sem mudança de docs/certificados/template):
// aqui só se monta o pacote de dados que o modelo recebe em CertificadoMentorei.render(dados).

export const URL_VERIFICACAO = 'https://certificados.mentorei.com.br';
export const MODELO = '/certificados/modelo/certificado.html';
export const TIPOS = ['programa', 'curso', 'mentoria', 'trilha', 'workshop', 'formação', 'imersão', 'palestra'];
const FEMININOS = ['mentoria', 'trilha', 'formação', 'formacao', 'jornada', 'palestra', 'imersão', 'imersao', 'oficina', 'especialização', 'especializacao'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const COR_QR = '#0E3B44';
export const NOME_LONGO = 70;

const numero = (v) => Number(String(v == null ? '' : v).replace(',', '.')) || 0;
const comVirgula = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

// "2026-10-30" → "30 de outubro de 2026"
export function dataLonga(iso) {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return `${parseInt(p[2], 10)} de ${MESES[parseInt(p[1], 10) - 1]} de ${p[0]}`;
}

// mesmo mês "8 a 27 de outubro de 2026"; mesmo ano "8 de setembro a 27 de outubro de 2026"; anos diferentes com os dois anos
export function periodoTexto(ini, fim) {
  if (!ini && !fim) return '';
  if (!ini || !fim || ini === fim) return dataLonga(ini || fim);
  if (ini > fim) [ini, fim] = [fim, ini];
  const a = ini.split('-'), b = fim.split('-');
  const d1 = parseInt(a[2], 10), m1 = MESES[parseInt(a[1], 10) - 1], d2 = parseInt(b[2], 10), m2 = MESES[parseInt(b[1], 10) - 1];
  if (a[0] === b[0] && a[1] === b[1]) return `${d1} a ${d2} de ${m1} de ${a[0]}`;
  if (a[0] === b[0]) return `${d1} de ${m1} a ${d2} de ${m2} de ${b[0]}`;
  return `${d1} de ${m1} de ${a[0]} a ${d2} de ${m2} de ${b[0]}`;
}

// carga total: "23 horas", "1 hora", "7,5 horas"; módulo: "3h", "1,5h"
export function horasTexto(h) { const n = numero(h); return n ? `${comVirgula(n)} ${n === 1 ? 'hora' : 'horas'}` : ''; }
export function horasModulo(h) { const n = numero(h); return n ? `${comVirgula(n)}h` : ''; }
export const somaHoras = (modulos) => (modulos || []).reduce((s, m) => s + numero(m.horas), 0);

export const artigo = (tipo) => (FEMININOS.includes(String(tipo || '').toLowerCase().trim()) ? 'a' : 'o');

// espaços duplicados, no começo e no fim, e o espaço que não quebra (vem de planilha e de site)
export const limparNome = (n) => String(n == null ? '' : n).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// ANA PAULA DE SOUZA → Ana Paula de Souza (de, da, do, das, dos, e ficam minúsculos; nomes com hífen mantêm as duas partes)
export function ajustarMaiusculas(n) {
  const minus = ['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von'];
  return limparNome(n).toLocaleLowerCase('pt-BR').split(' ').map((p, i) => {
    if (i > 0 && minus.includes(p)) return p;
    return p.split('-').map((q) => q.charAt(0).toLocaleUpperCase('pt-BR') + q.slice(1)).join('-');
  }).join(' ');
}

// "Cliente · Programa · Ano"
export function nomeSugerido(p) {
  const ano = String(p.fim || p.inicio || p.data_emissao || new Date().toISOString()).slice(0, 4);
  const curso = String(p.curso || '').replace(/^(Programa de|Programa|Mentoria|Trilha|Curso de|Curso)\s+/i, '').trim();
  return [p.cliente_nome || 'Sem cliente', curso || 'Programa', ano].join(' · ');
}

// o que falta para salvar a pasta (os obrigatórios da especificação)
export function faltando(p) {
  const f = [];
  if (!String(p.curso || '').trim()) f.push('nome do programa');
  if (!numero(p.carga_horas)) f.push('carga horária');
  if (!String(p.periodo_texto || '').trim()) f.push('período');
  if (!String(p.cidade || '').trim()) f.push('cidade');
  if (!p.data_emissao) f.push('data de emissão');
  if ((p.modulos || []).some((m) => !String(m.titulo || '').trim())) f.push('título de algum módulo');
  return f;
}

// assinaturas que a pasta usa (a segunda só quando ligada)
export function semAssinatura(p) {
  return !p.resp1_assinatura_id || (p.mostrar_resp2 && !p.resp2_assinatura_id);
}

// Retrato dos dados (o JSON da seção 8 da especificação, sem as imagens): é o que fica guardado em cada certificado.
// As imagens (assinaturas e logo) vão como referência; quem desenha troca pela imagem na hora.
export function retrato(p) {
  return {
    variacao: p.variacao === 'escura' ? 'escura' : 'clara',
    tipo: p.tipo || 'programa',
    curso: limparNome(p.curso),
    cliente: limparNome(p.cliente_nome),
    periodo: limparNome(p.periodo_texto),
    carga: horasTexto(p.carga_horas),
    cidade: limparNome(p.cidade),
    data_emissao: dataLonga(p.data_emissao),
    resp1_nome: limparNome(p.resp1_nome),
    resp1_cargo: limparNome(p.resp1_cargo),
    mostrar_resp2: !!p.mostrar_resp2,
    resp2_nome: p.mostrar_resp2 ? limparNome(p.resp2_nome) : '',
    resp2_cargo: p.mostrar_resp2 ? limparNome(p.resp2_cargo) : '',
    modulos: (p.modulos || []).filter((m) => limparNome(m.titulo)).map((m) => ({ titulo: limparNome(m.titulo), descricao: limparNome(m.descricao), horas: horasModulo(m.horas) })),
    url_verificacao: URL_VERIFICACAO.replace(/^https?:\/\//, ''),
    // referências das imagens (não vão para o modelo)
    ref_resp1_assinatura: p.resp1_assinatura_id || null,
    ref_resp2_assinatura: p.mostrar_resp2 ? (p.resp2_assinatura_id || null) : null,
    ref_cliente_logo: p.cliente_logo && p.cliente_logo.caminho ? p.cliente_logo.caminho : null,
  };
}

// Do retrato para o pacote do modelo: imagens já resolvidas (data URI ou endereço) em { resp1, resp2, logo }.
export function dadosDoModelo(r, { participante, codigo, qr = '', imagens = {} } = {}) {
  const d = { ...r };
  Object.keys(d).filter((k) => k.startsWith('ref_')).forEach((k) => delete d[k]);
  return {
    ...d,
    participante: participante != null ? participante : (r.participante || ''),
    codigo: codigo != null ? codigo : (r.codigo || ''),
    url_verificacao: r.url_verificacao || URL_VERIFICACAO.replace(/^https?:\/\//, ''),
    qr_imagem: qr,
    resp1_assinatura: imagens.resp1 || '',
    resp2_assinatura: r.mostrar_resp2 ? (imagens.resp2 || '') : '',
    cliente_logo: imagens.logo || '',
  };
}

export const linkVerificacao = (codigo) => `${URL_VERIFICACAO}/${codigo}`;

// Código digitado: maiúsculas, sem espaços (aceita também traços diferentes e sem traço)
export function normalizarCodigo(c) {
  const s = String(c || '').toUpperCase().replace(/[\s ]+/g, '').replace(/[‐-―−_.]/g, '-');
  const so = s.replace(/-/g, '');
  const m = so.match(/^MTR(\d{2})([A-Z0-9]{4})([A-Z0-9]{4})$/);
  return m ? `MTR-${m[1]}-${m[2]}-${m[3]}` : s;
}

// QR code em SVG (correção M, módulos #0E3B44, fundo transparente, margem de 1 módulo), como pede a seção 7.
// `qrcode` é a biblioteca qrcode-generator (public/assets/vendor/qrcode.js), carregada por quem chama.
export function qrSvg(qrcode, texto, cor = COR_QR, margem = 1) {
  const q = qrcode(0, 'M'); q.addData(texto); q.make();
  const n = q.getModuleCount(), lado = n + margem * 2;
  let caminho = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) caminho += `M${c + margem} ${r + margem}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><path fill="${cor}" d="${caminho}"/></svg>`;
}
export function svgParaDataUri(svg) {
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(svg))) : Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

// nome do arquivo de cada PDF no ZIP: "001 Ana Paula Souza.pdf"
export function nomeArquivoPdf(i, nome) {
  const base = limparNome(String(nome).normalize('NFC').replace(/[\\/:*?"<>|]+/g, ''));
  return `${String(i).padStart(3, '0')} ${base}.pdf`;
}
export function nomeZip(cliente, curso) {
  const limpo = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, '');
  return `${`Certificados · ${limpo(cliente || 'Cliente')} · ${limpo(curso || 'Programa')}`.slice(0, 120).trim()}.zip`;
}

// planilha de códigos: separador ";" e BOM (abre certo no Excel); o número é a ordem na lista, como os PDFs do ZIP
export function csvCodigos(lista) {
  const q = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = [['Número', 'Participante', 'Código', 'Link de verificação'], ...lista.map((c, i) => [i + 1, c.participante, c.codigo, linkVerificacao(c.codigo)])];
  return `﻿${linhas.map((l) => l.map(q).join(';')).join('\r\n')}\r\n`;
}
