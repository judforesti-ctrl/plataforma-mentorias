// Geração dos PDFs dos certificados (script 47), usada por certificados-fundo (segundo plano, até 15 min).
// Faz o mesmo que docs/certificados/referencia/gerar_lote.py: abre o modelo UMA vez no Chromium e, para cada pessoa,
// CertificadoMentorei.render(dados) → espera data-pronto → page.pdf (A4 paisagem, 2 páginas, sem margem).
// Os dados vêm do RETRATO guardado em cada certificado (dados_snapshot): editar a pasta depois não muda o que já foi emitido.
// Cada PDF vai para a pasta privada "certificados/pdf/<pasta>/<código>.pdf"; o ZIP é montado no navegador de quem baixa.
// Lote grande: para perto dos 12 minutos e chama a si mesmo para continuar de onde parou.
import { createHmac, timingSafeEqual } from 'node:crypto';
import qrcode from 'qrcode-generator';
import { supa, env, SUPABASE_URL, SITE } from './google.mjs';
import * as R from '../../public/assets/certificados-regras.js';

export const BALDE = 'certificados';
const LIMITE_MS = 12 * 60 * 1000;
export const DIAS_GUARDADOS = 45;

export const chaveLote = (id) => createHmac('sha256', env('SUPABASE_SECRET_KEY')).update(`certificados:${id}`).digest('hex');
export function conferirChave(id, veio) {
  const a = Buffer.from(String(veio || '')), b = Buffer.from(chaveLote(id));
  return a.length === b.length && timingSafeEqual(a, b);
}

// pede à função de fundo para gerar (ou continuar) o lote
export async function pedirGeracao(loteId) {
  const r = await fetch(`${SITE}/api/certificados-fundo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mentorei-cert': chaveLote(loteId) }, body: JSON.stringify({ lote: loteId }),
  }).catch(() => null);
  return !!(r && (r.ok || r.status === 202));
}

const caminhoSeguro = (c) => String(c || '').split('/').map(encodeURIComponent).join('/');
async function baixar(balde, caminho) {
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${balde}/${caminhoSeguro(caminho)}`, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } }).catch(() => null);
  return r && r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}
async function guardarPdf(caminho, buffer) {
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BALDE}/${caminhoSeguro(caminho)}`, {
    method: 'POST', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: buffer,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(/bucket/i.test(t) && /not found/i.test(t) ? 'A pasta "certificados" não existe no Supabase: falta rodar o script 47.' : `O Supabase recusou o PDF (${r.status}).`);
  }
}
export async function apagarArquivos(caminhos) {
  if (!caminhos.length) return true;
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BALDE}`, {
    method: 'DELETE', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: caminhos }),
  }).catch(() => null);
  return !!(r && r.ok);
}

const dataUri = (buf, tipo) => `data:${tipo};base64,${buf.toString('base64')}`;
export const qrDataUri = (codigo) => R.svgParaDataUri(R.qrSvg(qrcode, R.linkVerificacao(codigo)));

// Imagens do retrato (assinaturas na cor da variação e logo do cliente) como data URI, com memória dentro da rodada.
export function resolvedorDeImagens({ lerAssinatura = null, baixarArquivo = baixar, baixarLogo = null } = {}) {
  const memoria = new Map();
  const assinatura = lerAssinatura || (async (id) => {
    const r = await supa(`/rest/v1/cert_assinaturas?id=eq.${encodeURIComponent(id)}&select=clara_caminho,escura_caminho`);
    return r.ok && r.dados && r.dados[0] ? r.dados[0] : null;
  });
  const logo = baixarLogo || (async (caminho) => {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/fotos/${caminhoSeguro(caminho)}`).catch(() => null);
    return r && r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  });
  const lembrar = (k, fn) => { if (!memoria.has(k)) memoria.set(k, fn().catch(() => '')); return memoria.get(k); };
  return async (snap) => {
    const v = snap.variacao === 'escura' ? 'escura' : 'clara';
    const ass = (id) => (id ? lembrar(`a:${id}:${v}`, async () => {
      const a = await assinatura(id); if (!a) return '';
      const buf = await baixarArquivo(BALDE, v === 'escura' ? a.escura_caminho : a.clara_caminho);
      return buf ? dataUri(buf, 'image/png') : '';
    }) : '');
    const [resp1, resp2, lg] = await Promise.all([
      ass(snap.ref_resp1_assinatura), ass(snap.ref_resp2_assinatura),
      snap.ref_cliente_logo ? lembrar(`l:${snap.ref_cliente_logo}`, async () => { const b = await logo(snap.ref_cliente_logo); return b ? dataUri(b, 'image/png') : ''; }) : '',
    ]);
    return { resp1, resp2, logo: lg };
  };
}

// Chromium: na Netlify, o @sparticuz/chromium; no teste local, o navegador indicado em CHROME_LOCAL.
export async function abrirNavegador() {
  const puppeteer = (await import('puppeteer-core')).default;
  const local = process.env.CHROME_LOCAL;
  if (local) return puppeteer.launch({ executablePath: local, headless: true, args: ['--no-sandbox'] });
  const chromium = (await import('@sparticuz/chromium')).default;
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}

// Abre o modelo uma vez e devolve uma função que desenha e imprime um certificado (Buffer do PDF).
export async function prepararPagina(navegador, modeloUrl = `${SITE}${R.MODELO}`) {
  const pg = await navegador.newPage();
  await pg.setViewport({ width: 1280, height: 720 });   // o mesmo tamanho de janela da referência
  await pg.goto(modeloUrl, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForSelector("body[data-pronto='1']", { timeout: 60000 });
  return async (dados) => {
    const n = await pg.evaluate((d) => window.CertificadoMentorei.render(d), dados);
    await pg.waitForSelector(`body[data-pronto='1'][data-render='${n}']`, { timeout: 30000 });
    return Buffer.from(await pg.pdf({ printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } }));
  };
}

// Pacote do modelo para um certificado (retrato + nome atual + código + QR + imagens)
export async function dadosDoCertificado(c, imagens) {
  const snap = c.dados_snapshot || {};
  return R.dadosDoModelo(snap, { participante: c.participante, codigo: c.codigo, qr: qrDataUri(c.codigo), imagens: await imagens(snap) });
}

// Gera (ou continua) um lote. Devolve 'pronto', 'continuar' ou lança erro (o lote fica com status 'erro').
export async function processarLote(loteId, { limiteMs = LIMITE_MS, modeloUrl } = {}) {
  const inicio = Date.now();
  const l = await supa(`/rest/v1/cert_lotes?id=eq.${loteId}&select=*`);
  const lote = l.ok && l.dados && l.dados[0];
  if (!lote) throw new Error('Lote não encontrado.');
  if (lote.status === 'pronto') return 'pronto';
  await supa(`/rest/v1/cert_lotes?id=eq.${loteId}`, { metodo: 'PATCH', corpo: { status: 'gerando', erro: null, ...(lote.iniciado_em ? {} : { iniciado_em: new Date().toISOString() }) } });
  let navegador = null;
  try {
    const ids = lote.certificados || [];
    const lidos = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await supa(`/rest/v1/cert_certificados?id=in.(${ids.slice(i, i + 100).join(',')})&select=id,codigo,pasta_id,numero,participante,dados_snapshot,pdf_em,anonimizado_em`);
      if (!r.ok) throw new Error('Não consegui ler os certificados do lote.');
      lidos.push(...r.dados);
    }
    const ordem = new Map(ids.map((id, i) => [id, i]));
    lidos.sort((a, b) => ordem.get(a.id) - ordem.get(b.id));
    // feito neste lote = PDF gravado depois que o lote foi criado
    const feito = (c) => c.pdf_em && c.pdf_em > lote.criado_em;
    const pendentes = lidos.filter((c) => !feito(c) && !c.anonimizado_em);
    let feitos = lidos.length - pendentes.length;
    if (pendentes.length) {
      navegador = await abrirNavegador();
      const imprimir = await prepararPagina(navegador, modeloUrl);
      const imagens = resolvedorDeImagens();
      for (const c of pendentes) {
        if (Date.now() - inicio > limiteMs) break;
        const pdf = await imprimir(await dadosDoCertificado(c, imagens));
        const caminho = `pdf/${c.pasta_id}/${c.codigo}.pdf`;
        await guardarPdf(caminho, pdf);
        await supa(`/rest/v1/cert_certificados?id=eq.${c.id}`, { metodo: 'PATCH', corpo: { pdf_caminho: caminho, pdf_em: new Date().toISOString() } });
        feitos++;
        await supa(`/rest/v1/cert_lotes?id=eq.${loteId}`, { metodo: 'PATCH', corpo: { feitos } });
      }
    }
    if (feitos < lidos.length) return 'continuar';
    await supa(`/rest/v1/cert_lotes?id=eq.${loteId}`, { metodo: 'PATCH', corpo: { status: 'pronto', feitos, quantidade: lidos.length, terminado_em: new Date().toISOString() } });
    return 'pronto';
  } catch (e) {
    await supa(`/rest/v1/cert_lotes?id=eq.${loteId}`, { metodo: 'PATCH', corpo: { status: 'erro', erro: String(e && e.message || e).slice(0, 500) } });
    throw e;
  } finally {
    if (navegador) await navegador.close().catch(() => null);
  }
}
