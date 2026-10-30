// Certificados (script 47), abas da pasta: "Emitir certificados" (importar a lista de nomes e gerar) e "Emitidos"
// (ver, baixar, copiar o link de verificação, corrigir o nome, cancelar ou reativar, gerar de novo).
// Os PDFs são feitos no servidor (/api/certificados → certificados-fundo, Chromium) e ficam 45 dias na pasta privada
// "certificados"; depois disso a plataforma gera de novo, igual, quando alguém pedir. O ZIP é montado aqui no navegador
// (o Supabase grátis não guarda arquivo maior que 50 MB): PDFs "001 Nome.pdf", todos-para-imprimir.pdf e codigos.csv.
import { sb, esc, dataBR, dataHoraBR, avisar, explicarErro } from '../base.js';
import { janela, api } from './agenda-dados.js';
import { linkLogo } from './proposta.js';
import { carregarAssinaturas } from './certificados-assinaturas.js';
import { montarPrevia, qrDataUri } from './certificados.js';
import * as R from '../certificados-regras.js';

const BALDE = 'certificados';
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
const MAX_IMPRIMIR = 150;   // acima disso, o PDF único para imprimir fica pesado demais para montar no navegador
const FILA = new Map();     // nomes importados por pasta (ainda não gerados)
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const norm = (t) => R.limparNome(t).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ---------- ler a lista de nomes ----------
function csvLinhas(texto, sep) {
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) { if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; continue; }
    if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
// coluna "Nome" ou "Nome completo" (na primeira linha; na planilha do Excel, nas 5 primeiras); sem cabeçalho, a primeira coluna
function nomesDasLinhas(linhas, ondeProcurar = 1) {
  for (let i = 0; i < Math.min(ondeProcurar, linhas.length); i++) {
    const cab = linhas[i].map((c) => norm(c));
    let col = cab.findIndex((c) => c === 'nome completo');
    if (col < 0) col = cab.findIndex((c) => c === 'nome' || c === 'participante' || c === 'nome do participante' || c === 'aluno');
    if (col >= 0) return linhas.slice(i + 1).map((l) => R.limparNome(l[col])).filter(Boolean);
  }
  return linhas.map((l) => R.limparNome(l[0])).filter(Boolean);
}
async function lerArquivo(arq) {
  const nome = String(arq.name || '').toLowerCase();
  if (/\.(xlsx|xlsm|xls|ods)$/.test(nome)) {
    const XLSX = await import(XLSX_URL);
    const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return nomesDasLinhas(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }), 5);
  }
  const texto = (await arq.text()).replace(/^﻿/, '');
  if (/\.csv$/.test(nome)) {
    const amostra = texto.slice(0, 2000);
    return nomesDasLinhas(csvLinhas(texto, (amostra.match(/;/g) || []).length > (amostra.match(/,/g) || []).length ? ';' : ','));
  }
  if (/\t/.test(texto)) return nomesDasLinhas(csvLinhas(texto, '\t'));
  return texto.split(/\r?\n/).map(R.limparNome).filter(Boolean);
}
const colados = (texto) => (/\t/.test(texto) ? nomesDasLinhas(csvLinhas(texto, '\t')) : nomesDasLinhas(texto.split(/\r?\n/).map((l) => [l])));

// ---------- servidor e arquivos ----------
async function pedirGeracao(loteId) {
  const r = await api('/api/certificados', { acao: 'gerar', lote: loteId });
  if (!r.ok) throw new Error(r.mensagem || 'Não consegui começar a gerar os PDFs.');
}
// novo lote para gerar de novo os PDFs destes certificados (mesmos códigos)
export async function regerar(pasta, ids) {
  const { data, error } = await sb.from('cert_lotes').insert({ pasta_id: pasta.id, tipo: 'regerar', certificados: ids, quantidade: ids.length }).select('id').single();
  if (error) throw error;
  await pedirGeracao(data.id);
  return data.id;
}

// Acompanha um lote até ficar pronto (barra de andamento). Devolve uma promessa com o lote no fim (ou null se a tela saiu).
export function acompanhar(loteId, el, { titulo = 'Gerando os certificados' } = {}) {
  return new Promise((pronto) => {
    const comeco = Date.now();
    const desenhar = (l) => {
      const q = l.quantidade || (l.certificados || []).length || 0, f = Math.min(l.feitos || 0, q);
      const pct = q ? Math.round((100 * f) / q) : 0;
      const parado = l.status === 'fila' && Date.now() - comeco > 120000;
      el.innerHTML = l.status === 'erro'
        ? `<div class="aviso erro"><b>Não consegui terminar de gerar os PDFs.</b> ${esc(l.erro || '')}<div class="linha mt"><button class="btn peq pri" type="button" data-de-novo>Tentar de novo</button></div></div>`
        : `<div class="cartao ct-andamento"><div class="linha"><b>${esc(titulo)}</b><span class="peq apagado">${f} de ${q}</span></div>
            <div class="ct-barra mt" role="progressbar" aria-valuemin="0" aria-valuemax="${q}" aria-valuenow="${f}"><span style="width:${pct}%"></span></div>
            <p class="peq apagado mt">${l.status === 'fila' ? 'Na fila para começar…' : 'Cerca de 1 segundo por certificado. Pode continuar usando a plataforma.'}
            ${parado ? ' <button class="btn peq" type="button" data-de-novo>Está demorando: tentar de novo</button>' : ''}</p></div>`;
    };
    el.addEventListener('click', async (ev) => {
      if (!ev.target.closest('[data-de-novo]')) return;
      try { await pedirGeracao(loteId); avisar('Pedi de novo para gerar.'); } catch (e) { avisar(explicarErro(e), true); }
    });
    const passo = async () => {
      if (!el.isConnected) { pronto(null); return; }
      const { data: l } = await sb.from('cert_lotes').select('*').eq('id', loteId).maybeSingle();
      if (!l) { pronto(null); return; }
      desenhar(l);
      if (l.status === 'pronto') { pronto(l); return; }
      setTimeout(passo, 2000);
    };
    passo();
  });
}

const baixarBlob = (blob, nome) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 5000);
};
export function baixarCodigos(pasta, certs) {
  const lista = certs.filter((c) => c.status === 'valido').sort((a, b) => (a.numero || 0) - (b.numero || 0));
  baixarBlob(new Blob([R.csvCodigos(lista)], { type: 'text/csv;charset=utf-8' }), `Códigos · ${R.nomeZip(pasta.cliente_nome, pasta.curso).replace(/^Certificados · /, '').replace(/\.zip$/, '')}.csv`);
}

async function linksAssinados(caminhos) {
  const mapa = new Map();
  for (let i = 0; i < caminhos.length; i += 100) {
    const { data, error } = await sb.storage.from(BALDE).createSignedUrls(caminhos.slice(i, i + 100), 3600);
    if (error) throw error;
    (data || []).forEach((d) => { if (d.signedUrl) mapa.set(d.path, d.signedUrl); });
  }
  return mapa;
}

// Garante que todos têm PDF guardado (os que passaram dos 45 dias, ou que acabaram de mudar, são gerados de novo).
async function garantirPdfs(pasta, certs, andamento) {
  const faltam = certs.filter((c) => !c.pdf_caminho);
  if (!faltam.length) return certs;
  const lote = await regerar(pasta, faltam.map((c) => c.id));
  if (!(await acompanhar(lote, andamento, { titulo: 'Preparando os PDFs' }))) throw new Error('A geração foi interrompida.');
  andamento.innerHTML = '';
  const { data } = await sb.from('cert_certificados').select('id, pdf_caminho').in('id', faltam.map((c) => c.id));
  (data || []).forEach((d) => { const c = certs.find((x) => x.id === d.id); if (c) c.pdf_caminho = d.pdf_caminho; });
  return certs;
}

// ZIP com todos os PDFs válidos, o PDF único para imprimir (até 150) e a planilha de códigos
export async function baixarZip(pasta, todos, andamento, botao) {
  const certs = todos.filter((c) => c.status === 'valido').sort((a, b) => (a.numero || 0) - (b.numero || 0));
  if (!certs.length) { avisar('Não há certificados válidos para baixar.', true); return; }
  const texto = botao ? botao.textContent : '';
  const mostrar = (t) => { if (botao) { botao.disabled = true; botao.textContent = t; } };
  try {
    await garantirPdfs(pasta, certs, andamento);
    mostrar('Preparando o ZIP…');
    const [{ default: JSZip }, links] = await Promise.all([import(JSZIP_URL), linksAssinados(certs.map((c) => c.pdf_caminho))]);
    const zip = new JSZip(), arquivos = new Array(certs.length);
    let feitos = 0, prox = 0;
    const trabalhador = async () => {
      while (prox < certs.length) {
        const i = prox++, c = certs[i];
        const r = await fetch(links.get(c.pdf_caminho));
        if (!r.ok) throw new Error(`Não consegui baixar o PDF de ${c.participante}.`);
        arquivos[i] = await r.arrayBuffer();
        zip.file(R.nomeArquivoPdf(i + 1, c.participante), arquivos[i]);
        mostrar(`Baixando ${++feitos} de ${certs.length}…`);
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
    if (certs.length <= MAX_IMPRIMIR) {
      mostrar('Juntando o PDF para imprimir…');
      const { PDFDocument } = await import(PDFLIB_URL);
      const unico = await PDFDocument.create();
      for (const buf of arquivos) {
        const doc = await PDFDocument.load(buf);
        (await unico.copyPages(doc, doc.getPageIndices())).forEach((pg) => unico.addPage(pg));
      }
      zip.file('todos-para-imprimir.pdf', await unico.save());
    }
    zip.file('codigos.csv', R.csvCodigos(certs));
    mostrar('Fechando o ZIP…');
    baixarBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), R.nomeZip(pasta.cliente_nome, pasta.curso));
    avisar(certs.length > MAX_IMPRIMIR ? `ZIP pronto. Com mais de ${MAX_IMPRIMIR} certificados, o PDF único para imprimir não entra (cada PDF continua lá).` : 'ZIP pronto.');
  } catch (e) { avisar(explicarErro(e), true); }
  if (botao) { botao.disabled = false; botao.textContent = texto; }
}

export async function baixarPdf(pasta, c, andamento) {
  try {
    if (!c.pdf_caminho) {
      avisar('Preparando o PDF…');
      await garantirPdfs(pasta, [c], andamento);
    }
    const { data, error } = await sb.storage.from(BALDE).createSignedUrl(c.pdf_caminho, 600, { download: R.nomeArquivoPdf(c.numero || 1, c.participante) });
    if (error) throw error;
    const a = document.createElement('a'); a.href = data.signedUrl; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { avisar(explicarErro(e), true); }
}

// imagens do retrato para as prévias na tela (assinaturas com link temporário e logo público)
async function imagensDoRetrato(snap) {
  const ids = [snap.ref_resp1_assinatura, snap.ref_resp2_assinatura].filter(Boolean);
  const ass = ids.length ? await carregarAssinaturas(ids).catch(() => []) : [];
  const v = snap.variacao === 'escura' ? 'escura' : 'clara';
  const img = (id) => { const a = ass.find((x) => x.id === id); return a && a.url ? a.url[v] : ''; };
  return { resp1: img(snap.ref_resp1_assinatura), resp2: img(snap.ref_resp2_assinatura), logo: snap.ref_cliente_logo ? linkLogo({ caminho: snap.ref_cliente_logo }) : '' };
}

// janela com o certificado (frente e verso)
async function janelaVer(titulo, dados, aviso = '') {
  const j = janela(titulo, `${aviso}<div class="linha"><div class="ct-seg" data-face><button type="button" class="on" data-f="frente">Frente</button><button type="button" data-f="verso">Verso</button></div></div>
    <div class="ct-moldura mt"></div>`, { largura: 900 });
  const previa = montarPrevia(j.corpo.querySelector('.ct-moldura'));
  j.corpo.querySelectorAll('[data-face] button').forEach((b) => b.addEventListener('click', () => {
    j.corpo.querySelectorAll('[data-face] button').forEach((x) => x.classList.toggle('on', x === b)); previa.face(b.dataset.f);
  }));
  previa.enviar(dados);
}

const registro = (ctx, acao, extra = {}) => ({ em: new Date().toISOString(), por: ctx.perfil.id, por_nome: ctx.perfil.nome, acao, ...extra });

// ---------- aba "Emitir certificados" ----------
export async function abaEmitir(ctx, el, pasta, certs, recarregar) {
  const existentes = new Set(certs.map((c) => norm(c.participante)));
  const fila = FILA.get(pasta.id) || [];
  FILA.set(pasta.id, fila);
  el.innerHTML = `<div id="ct-lotes"></div>
    ${R.semAssinatura(pasta) ? `<div class="aviso" style="margin-bottom:12px"><b>Esta pasta está sem a imagem da assinatura${pasta.mostrar_resp2 && pasta.resp1_assinatura_id ? ' de quem assina pelo cliente' : ''}.</b>
      Os certificados saem com a linha para assinar à mão. As assinaturas salvas na lista só entram depois de escolhidas na pasta.
      <div class="linha mt"><a class="btn peq pri" href="#/certificados/${pasta.id}/editar">Escolher as assinaturas</a></div></div>` : ''}
    <div class="cartao"><h3>Lista de nomes</h3>
      <p class="peq apagado">Planilha do Excel (.xlsx) ou CSV com a coluna "Nome" (ou "Nome completo"; sem cabeçalho, vale a primeira coluna), arquivo de texto com um nome por linha, ou cole aqui embaixo.</p>
      <div class="linha mt"><label class="btn pri" style="cursor:pointer">📄 Importar planilha ou arquivo<input type="file" id="cn-arq" accept=".xlsx,.xlsm,.xls,.ods,.csv,.txt" hidden></label></div>
      <div class="campo mt"><label for="cn-colar">Ou cole os nomes (um por linha)</label><textarea id="cn-colar" rows="4" placeholder="Ana Paula Souza&#10;João Pedro Ramos"></textarea></div>
      <div class="linha mt"><button class="btn" type="button" id="cn-add">Adicionar à lista</button></div></div>
    <div id="cn-lista" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);

  // lotes em andamento (alguém gerou e saiu da tela, ou está gerando agora)
  const { data: abertos } = await sb.from('cert_lotes').select('id, tipo').eq('pasta_id', pasta.id).in('status', ['fila', 'gerando', 'erro']).order('criado_em', { ascending: false }).limit(3);
  (abertos || []).forEach((l) => {
    const box = document.createElement('div'); box.style.marginBottom = '12px'; $('#ct-lotes').appendChild(box);
    acompanhar(l.id, box, { titulo: l.tipo === 'regerar' ? 'Gerando de novo' : 'Gerando os certificados' }).then((fim) => { if (fim) recarregar('emitidos'); });
  });

  const avisos = (lista) => {
    const conta = new Map(); lista.forEach((n) => conta.set(norm(n), (conta.get(norm(n)) || 0) + 1));
    return lista.map((n) => [conta.get(norm(n)) > 1 && 'Repetido', existentes.has(norm(n)) && 'Já tem certificado nesta pasta', R.limparNome(n).length > R.NOME_LONGO && 'Nome muito longo'].filter(Boolean));
  };
  const desenhar = () => {
    const caixa = $('#cn-lista');
    if (!fila.length) { caixa.innerHTML = ''; return; }
    const av = avisos(fila), comAviso = av.filter((a) => a.length).length;
    caixa.innerHTML = `<div class="cartao">
      <div class="linha"><h3 style="flex:1">${plural(fila.length, 'nome na lista', 'nomes na lista')}</h3>
        <button class="btn peq" type="button" id="cn-caixa">Ajustar maiúsculas</button><button class="btn peq" type="button" id="cn-limpar">Limpar lista</button></div>
      ${comAviso ? `<p class="peq mt" style="color:var(--bege-texto)">${plural(comAviso, 'nome tem aviso', 'nomes têm aviso')}. Os avisos não impedem de gerar: confira e corrija se for o caso.</p>` : ''}
      <div class="tabela mt"><table class="ct-nomes"><thead><tr><th style="width:44px">Nº</th><th>Nome no certificado</th><th>Avisos</th><th></th></tr></thead><tbody>
        ${fila.map((n, i) => `<tr data-i="${i}"><td class="apagado">${String(i + 1).padStart(3, '0')}</td>
          <td><input type="text" value="${esc(n)}" aria-label="Nome ${i + 1}" data-nome></td>
          <td data-avisos>${av[i].map((a) => `<span class="chip ct-alerta">${a}</span>`).join(' ')}</td>
          <td><button class="btn peq" type="button" data-tirar aria-label="Remover ${esc(n)}">✕</button></td></tr>`).join('')}</tbody></table></div>
      <div class="ct-rodape"><span class="peq">${R.semAssinatura(pasta) ? 'Esta pasta está sem a imagem da assinatura.' : ''}</span>
        <button class="btn" type="button" id="cn-primeiro">Ver o primeiro antes</button>
        <button class="btn pri" type="button" id="cn-gerar">Gerar ${plural(fila.length, 'certificado', 'certificados')}</button></div></div>`;
  };
  const atualizarAvisos = () => {
    const av = avisos(fila);
    el.querySelectorAll('#cn-lista tr[data-i]').forEach((tr) => { tr.querySelector('[data-avisos]').innerHTML = av[+tr.dataset.i].map((a) => `<span class="chip ct-alerta">${a}</span>`).join(' '); });
  };
  const adicionar = (nomes) => {
    const novos = nomes.map(R.limparNome).filter(Boolean);
    if (!novos.length) { avisar('Não encontrei nomes nesse arquivo ou texto.', true); return; }
    fila.push(...novos); desenhar();
    avisar(`${plural(novos.length, 'nome adicionado', 'nomes adicionados')} à lista.`);
  };

  $('#cn-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!arq) return;
    try { adicionar(await lerArquivo(arq)); } catch (_) { avisar('Não consegui abrir esse arquivo. Salve como Excel (.xlsx) ou CSV e tente de novo, ou copie e cole os nomes.', true); }
  });
  $('#cn-add').addEventListener('click', () => { const t = $('#cn-colar').value; if (!t.trim()) return; adicionar(colados(t)); $('#cn-colar').value = ''; });
  el.addEventListener('input', (ev) => {
    const inp = ev.target.closest('[data-nome]'); if (!inp) return;
    fila[+inp.closest('[data-i]').dataset.i] = inp.value; atualizarAvisos();
  });
  el.addEventListener('change', (ev) => {
    const inp = ev.target.closest('[data-nome]'); if (!inp) return;
    inp.value = R.limparNome(inp.value); fila[+inp.closest('[data-i]').dataset.i] = inp.value; atualizarAvisos();
  });
  el.addEventListener('click', async (ev) => {
    const t = ev.target;
    if (t.closest('[data-tirar]')) { fila.splice(+t.closest('[data-i]').dataset.i, 1); desenhar(); return; }
    if (t.closest('#cn-caixa')) { fila.forEach((n, i) => { fila[i] = R.ajustarMaiusculas(n); }); desenhar(); return; }
    if (t.closest('#cn-limpar')) { fila.length = 0; desenhar(); return; }
    if (t.closest('#cn-primeiro')) {
      const primeiro = fila.map(R.limparNome).find(Boolean); if (!primeiro) return;
      const snap = R.retrato(pasta);
      janelaVer(`Prévia: ${primeiro}`, R.dadosDoModelo(snap, { participante: primeiro, codigo: 'MTR-26-XXXX-XXXX', qr: await qrDataUri(R.linkVerificacao('MTR-26-XXXX-XXXX')).catch(() => ''), imagens: await imagensDoRetrato(snap) }),
        '<p class="peq apagado" style="margin-bottom:10px">O código e o QR code são de exemplo: cada pessoa recebe o próprio ao gerar.</p>');
      return;
    }
    if (t.closest('#cn-gerar')) gerar(t.closest('#cn-gerar'));
  });

  async function gerar(botao) {
    const nomes = fila.map(R.limparNome).filter(Boolean);
    if (!nomes.length) return;
    if (nomes.length > 500) { avisar('No máximo 500 nomes por vez. Divida a lista em partes.', true); return; }
    const sem = R.semAssinatura(pasta);
    if (sem && !(await confirmarSemAssinatura(nomes.length))) return;
    botao.disabled = true; botao.textContent = 'Criando os códigos…';
    try {
      const { data: lote, error } = await sb.rpc('cert_emitir', { p_pasta: pasta.id, p_nomes: nomes, p_dados: R.retrato(pasta), p_sem_assinatura: sem });
      if (error) throw error;
      fila.length = 0; desenhar();
      try { await pedirGeracao(lote); } catch (e) { avisar(`${explicarErro(e)} Os códigos já foram criados: use "Tentar de novo".`, true); }
      const box = document.createElement('div'); $('#ct-lotes').prepend(box);
      const fim = await acompanhar(lote, box);
      if (!fim) return;
      const { data: novos } = await sb.from('cert_certificados').select('*').eq('lote_id', lote).order('numero');
      box.innerHTML = `<div class="aviso ok"><b>Pronto: ${plural((novos || []).length, 'certificado gerado', 'certificados gerados')}.</b>${sem ? ' Versão sem assinatura: depois de colocar a assinatura, use "Gerar de novo todos" na aba Emitidos.' : ''}
        <div class="linha mt"><button class="btn pri" type="button" data-zip>Baixar todos (ZIP)</button><button class="btn" type="button" data-csv>Baixar só a planilha de códigos</button>
          <a class="btn" href="#/certificados/${pasta.id}/emitidos">Ver na aba Emitidos</a></div><div data-and class="mt"></div></div>`;
      box.querySelector('[data-zip]').addEventListener('click', (ev) => baixarZip(pasta, novos || [], box.querySelector('[data-and]'), ev.currentTarget));
      box.querySelector('[data-csv]').addEventListener('click', () => baixarCodigos(pasta, novos || []));
      certs.push(...(novos || [])); (novos || []).forEach((c) => existentes.add(norm(c.participante)));
      const aba = document.querySelector('.abas [data-aba="emitidos"]');
      if (aba) aba.textContent = `Emitidos (${certs.filter((c) => c.status === 'valido').length})`;
    } catch (e) { avisar(explicarErro(e), true); botao.disabled = false; botao.textContent = `Gerar ${plural(nomes.length, 'certificado', 'certificados')}`; }
  }
  desenhar();
}

function confirmarSemAssinatura(n) {
  return new Promise((ok) => {
    let resposta = false;
    const j = janela('Gerar sem assinatura?', `<p>Esta pasta ainda está <b>sem a imagem da assinatura</b>. ${n === 1 ? 'O certificado vai' : `Os ${n} certificados vão`} sair com a linha para assinar à mão.</p>
      <p class="mt">Serve para conferir. Depois de colocar a assinatura em "Editar informações", use <b>Gerar de novo todos</b> na aba Emitidos: a versão final sai com os mesmos códigos e QR codes.</p>
      <div class="linha mt" style="justify-content:flex-end"><button class="btn" type="button" data-fechar>Voltar</button><button class="btn pri" type="button" data-sim>Gerar sem assinatura</button></div>`,
    { largura: 560, aoFechar: () => ok(resposta) });
    j.corpo.querySelector('[data-sim]').addEventListener('click', () => { resposta = true; j.fechar(); });
  });
}

// ---------- aba "Emitidos" ----------
export async function abaEmitidos(ctx, el, pasta, certs, recarregar) {
  if (!certs.length) { el.innerHTML = '<div class="vazio">Nenhum certificado emitido nesta pasta ainda. Importe a lista de nomes na aba "Emitir certificados".</div>'; return; }
  const validos = certs.filter((c) => c.status === 'valido');
  const semAss = validos.filter((c) => c.sem_assinatura).length;
  const est = { q: '' };
  el.innerHTML = `<div id="ce-and"></div>
    ${semAss && !R.semAssinatura(pasta) ? `<div class="aviso" style="margin-bottom:12px">${plural(semAss, 'certificado válido foi gerado', 'certificados válidos foram gerados')} sem assinatura, e a pasta já tem a assinatura. Use <b>Gerar de novo todos</b> para fazer a versão final (mesmos códigos).</div>` : ''}
    <div class="linha ag-filtros"><input type="search" id="ce-q" placeholder="Buscar por nome ou código" style="width:auto;min-width:240px" aria-label="Buscar por nome ou código">
      <span class="peq apagado" id="ce-conta"></span>
      <span class="ag-atalhos"><button class="btn peq" type="button" id="ce-csv">Baixar planilha de códigos</button><button class="btn peq pri" type="button" id="ce-zip">Baixar todos (ZIP)</button>
        <button class="btn peq" type="button" id="ce-todos"${validos.length ? '' : ' disabled'}>Gerar de novo todos</button></span></div>
    <div class="tabela cartao" style="padding:0"><table><thead><tr><th>Participante</th><th>Código</th><th>Emitido em</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="ce-corpo"></tbody></table></div>`;
  const $ = (s) => el.querySelector(s);
  const andamento = $('#ce-and');
  const desenhar = () => {
    const q = norm(est.q), qc = est.q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const vistos = certs.filter((c) => !q || norm(c.participante).includes(q) || (qc && c.codigo.replace(/-/g, '').includes(qc)));
    $('#ce-conta').textContent = `${vistos.length} de ${certs.length}`;
    $('#ce-corpo').innerHTML = vistos.map((c) => `<tr data-id="${c.id}">
      <td>${esc(c.participante)}</td><td><code>${esc(c.codigo)}</code></td><td>${esc(dataBR(c.emitido_em))}</td>
      <td>${c.status === 'valido' ? '<span class="chip ct-ok">Válido</span>' : `<span class="chip ct-cancelado">Cancelado</span>${c.cancelado_em ? `<div class="peq apagado">em ${esc(dataBR(c.cancelado_em))}</div>` : ''}`}
        ${c.sem_assinatura && c.status === 'valido' ? '<div class="peq apagado">sem assinatura</div>' : ''}</td>
      <td><div class="ct-acoes"><button class="btn peq" type="button" data-a="ver">Ver</button>
        ${c.status === 'valido' ? '<button class="btn peq" type="button" data-a="baixar">Baixar PDF</button>' : ''}
        <button class="btn peq" type="button" data-a="link">Copiar link</button>
        ${c.anonimizado_em ? '' : '<button class="btn peq" type="button" data-a="nome">Corrigir o nome</button>'}
        ${c.status === 'valido' ? '<button class="btn peq perigo" type="button" data-a="cancelar">Cancelar</button>' : (c.anonimizado_em ? '' : '<button class="btn peq" type="button" data-a="reativar">Reativar</button>')}</div></td></tr>`).join('')
      || '<tr><td colspan="5" class="apagado">Nada encontrado.</td></tr>';
  };
  $('#ce-q').addEventListener('input', (ev) => { est.q = ev.target.value; desenhar(); });
  $('#ce-csv').addEventListener('click', () => baixarCodigos(pasta, certs));
  $('#ce-zip').addEventListener('click', (ev) => baixarZip(pasta, certs, andamento, ev.currentTarget));
  $('#ce-todos').addEventListener('click', () => gerarTodos(ctx, pasta, validos, andamento, recarregar));
  $('#ce-corpo').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const c = certs.find((x) => x.id === b.closest('[data-id]').dataset.id); if (!c) return;
    const a = b.dataset.a;
    if (a === 'baixar') { b.disabled = true; await baixarPdf(pasta, c, andamento); b.disabled = false; }
    if (a === 'link') {
      const link = R.linkVerificacao(c.codigo);
      try { await navigator.clipboard.writeText(link); avisar('Link de verificação copiado.'); } catch (_) { window.prompt('Copie o link:', link); }
    }
    if (a === 'ver') {
      const snap = c.dados_snapshot || {};
      const aviso = c.status === 'cancelado' ? `<div class="aviso erro" style="margin-bottom:10px">Cancelado${c.cancelado_em ? ` em ${esc(dataHoraBR(c.cancelado_em))}` : ''}${c.motivo_cancelamento ? `: ${esc(c.motivo_cancelamento)}` : ''}. A verificação mostra que ele não é mais válido.</div>` : '';
      janelaVer(`${c.participante} · ${c.codigo}`, R.dadosDoModelo(snap, { participante: c.participante, codigo: c.codigo, qr: await qrDataUri(R.linkVerificacao(c.codigo)).catch(() => ''), imagens: await imagensDoRetrato(snap) }),
        `${aviso}<p class="peq apagado" style="margin-bottom:10px">Como foi emitido (os dados guardados neste certificado), com o QR code de verdade. Link: ${esc(R.linkVerificacao(c.codigo))}</p>`);
    }
    if (a === 'nome') janelaNome(ctx, pasta, c, andamento, recarregar);
    if (a === 'cancelar') janelaCancelar(ctx, c, recarregar);
    if (a === 'reativar') {
      if (!window.confirm(`Reativar o certificado de ${c.participante}? Ele volta a aparecer como válido na verificação.`)) return;
      const { error } = await sb.from('cert_certificados').update({ status: 'valido', cancelado_em: null, cancelado_por: null, motivo_cancelamento: null,
        historico: [...(c.historico || []), registro(ctx, 'reativado')] }).eq('id', c.id);
      if (error) { avisar(explicarErro(error), true); return; }
      avisar('Certificado reativado.'); recarregar('emitidos');
    }
  });
  desenhar();
}

function janelaNome(ctx, pasta, c, andamento, recarregar) {
  const j = janela('Corrigir o nome', `<p class="peq apagado">O código e o QR code continuam os mesmos. O PDF é gerado de novo com o nome corrigido, e a verificação passa a mostrar o nome novo.</p>
    <div class="campo mt"><label for="cn-novo">Nome no certificado</label><input id="cn-novo" type="text"></div>
    <div class="linha mt"><button class="btn peq" type="button" data-caixa>Ajustar maiúsculas</button></div>
    <div class="linha mt" style="justify-content:flex-end"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn pri" type="button" data-salvar>Salvar e gerar o PDF de novo</button></div>`, { largura: 560 });
  const inp = j.corpo.querySelector('#cn-novo'); inp.value = c.participante; inp.focus();
  j.corpo.querySelector('[data-caixa]').addEventListener('click', () => { inp.value = R.ajustarMaiusculas(inp.value); });
  j.corpo.querySelector('[data-salvar]').addEventListener('click', async (ev) => {
    const novo = R.limparNome(inp.value);
    if (!novo) { avisar('Escreva o nome.', true); return; }
    if (novo === c.participante) { j.fechar(); return; }
    ev.currentTarget.disabled = true;
    const { error } = await sb.from('cert_certificados').update({
      participante: novo, dados_snapshot: { ...(c.dados_snapshot || {}), participante: novo }, pdf_caminho: null, pdf_em: null,
      historico: [...(c.historico || []), registro(ctx, 'nome', { antes: c.participante, depois: novo })],
    }).eq('id', c.id);
    if (error) { avisar(explicarErro(error), true); ev.currentTarget.disabled = false; return; }
    if (c.pdf_caminho) sb.storage.from(BALDE).remove([c.pdf_caminho]);   // o PDF antigo sai; o novo ganha outro nome
    j.fechar();
    try {
      const lote = await regerar(pasta, [c.id]);
      avisar('Nome corrigido. O PDF novo fica pronto em instantes.');
      await acompanhar(lote, andamento, { titulo: `Gerando de novo: ${novo}` });
    } catch (e) { avisar(explicarErro(e), true); }
    recarregar('emitidos');
  });
}

function janelaCancelar(ctx, c, recarregar) {
  const j = janela('Cancelar o certificado', `<p>O certificado de <b>${esc(c.participante)}</b> (${esc(c.codigo)}) deixa de valer: quem ler o QR code vê "Certificado cancelado". Dá para reativar depois.</p>
    <div class="campo mt"><label for="cc-motivo">Motivo (opcional, só a administração vê)</label><textarea id="cc-motivo" rows="2"></textarea></div>
    <label class="check mt"><input type="checkbox" id="cc-lgpd"><span>A pessoa pediu para apagar os dados dela: o nome some do certificado e da verificação (não dá para desfazer)</span></label>
    <div class="linha mt" style="justify-content:flex-end"><button class="btn" type="button" data-fechar>Voltar</button><button class="btn perigo" type="button" data-sim>Cancelar o certificado</button></div>`, { largura: 560 });
  j.corpo.querySelector('[data-sim]').addEventListener('click', async (ev) => {
    const lgpd = j.corpo.querySelector('#cc-lgpd').checked;
    ev.currentTarget.disabled = true;
    const agora = new Date().toISOString();
    const mud = { status: 'cancelado', cancelado_em: agora, cancelado_por: ctx.perfil.id, motivo_cancelamento: j.corpo.querySelector('#cc-motivo').value.trim() || null,
      historico: [...(c.historico || []), registro(ctx, lgpd ? 'cancelado_e_nome_apagado' : 'cancelado')] };
    if (lgpd) {
      const removido = 'Nome removido a pedido da pessoa';
      Object.assign(mud, { participante: removido, dados_snapshot: { ...(c.dados_snapshot || {}), participante: removido }, anonimizado_em: agora, pdf_caminho: null, pdf_em: null });
      if (c.pdf_caminho) await sb.storage.from(BALDE).remove([c.pdf_caminho]);
    }
    const { error } = await sb.from('cert_certificados').update(mud).eq('id', c.id);
    if (error) { avisar(explicarErro(error), true); ev.currentTarget.disabled = false; return; }
    j.fechar(); avisar(lgpd ? 'Certificado cancelado e nome apagado.' : 'Certificado cancelado.'); recarregar('emitidos');
  });
}

// Gerar de novo todos: os válidos ganham os dados atuais da pasta (e a assinatura), com os mesmos códigos
function gerarTodos(ctx, pasta, validos, andamento, recarregar) {
  const sem = R.semAssinatura(pasta);
  const j = janela('Gerar de novo todos', `<p>Os <b>${plural(validos.length, 'certificado válido', 'certificados válidos')}</b> desta pasta vão ser gerados de novo com as informações atuais da pasta${sem ? '' : ' (já com a assinatura)'}.</p>
    <p class="mt">Os códigos e os QR codes continuam os mesmos. A verificação passa a mostrar os dados novos. Os cancelados ficam como estão.</p>
    ${sem ? '<div class="aviso mt">A pasta ainda está sem a imagem da assinatura: eles continuam sem assinatura.</div>' : ''}
    <div class="linha mt" style="justify-content:flex-end"><button class="btn" type="button" data-fechar>Voltar</button><button class="btn pri" type="button" data-sim>Gerar de novo ${plural(validos.length, 'certificado', 'certificados')}</button></div>`, { largura: 560 });
  j.corpo.querySelector('[data-sim]').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Atualizando…';
    const base = R.retrato(pasta);
    try {
      for (let i = 0; i < validos.length; i += 8) {
        const parte = validos.slice(i, i + 8);
        const res = await Promise.all(parte.map((c) => sb.from('cert_certificados').update({
          dados_snapshot: { ...base, participante: c.participante, codigo: c.codigo }, sem_assinatura: sem, pdf_caminho: null, pdf_em: null,
          historico: [...(c.historico || []), registro(ctx, 'gerado_de_novo', { sem_assinatura: sem })],
        }).eq('id', c.id)));
        const erro = res.find((r) => r.error); if (erro) throw erro.error;
        b.textContent = `Atualizando ${Math.min(i + 8, validos.length)} de ${validos.length}…`;
      }
      const antigos = validos.map((c) => c.pdf_caminho).filter(Boolean);   // os PDFs antigos saem; os novos ganham outro nome
      for (let i = 0; i < antigos.length; i += 100) await sb.storage.from(BALDE).remove(antigos.slice(i, i + 100));
      j.fechar();
      const lote = await regerar(pasta, validos.map((c) => c.id));
      const fim = await acompanhar(lote, andamento, { titulo: 'Gerando de novo' });
      if (fim) { avisar('Pronto: certificados gerados de novo.'); recarregar('emitidos'); }
    } catch (e) { avisar(explicarErro(e), true); b.disabled = false; b.textContent = 'Tentar de novo'; }
  });
}
