// Proposta gerada pela IA (Vendas): escreve o conteúdo, digita os preços numa caixa
// separada (por módulo, mentoria individual, turma, grupo, pessoa, valor fechado ou outro) e, se quiser, envia o logo do
// cliente → a IA escreve nos moldes do PowerPoint da Mentorei (em segundo plano; números da Mentorei, sócias e contatos
// são fixos no modelo) → revisão e edição → aprovação (Cintia) → envio do arquivo por e-mail (anexo) ou WhatsApp →
// marcada como enviada, o retorno entra sozinho na agenda para 4 dias depois. Só a administração (script 20).
import { sb, esc, dataBR, dataHoraBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, api, primeiroNome, faltaScript, limparCache, avisarGoogle } from './agenda-dados.js';
import { dinheiro, SERVICOS, retornoEm4Dias, linkWhats, limparFone, preencher, ANTES_DA_PROPOSTA } from './vendas.js';
import {
  COBRANCA_ROTULO, descreverPreco, resumoPreco, precosValidos, valorDaProposta, numero, ICONES,
  normalizarConteudo, topicoDe,
} from '../proposta-comum.js';

const STATUS = { gerando: ['Gerando com a IA…', 'selo neutro'], rascunho: ['Rascunho · revisar e enviar', 'selo alerta'], aprovada: ['Pronta para enviar', 'selo'], enviada: ['Enviada', 'selo escuro'], erro: ['Deu erro', 'selo erro'] };
export const seloStatus = (p) => (p && p.status && STATUS[p.status] ? `<span class="${STATUS[p.status][1]}">${STATUS[p.status][0]}</span>` : '');
const CANAL = { email: 'por e-mail', whatsapp: 'pelo WhatsApp', outro: 'por outro meio' };
const AVISO_SCRIPT = 'Para gerar propostas com a IA, falta rodar o script 20-propostas-ia.sql no Supabase (SQL Editor → New query → colar → Run).';
const SEL = '*, enviada_para_contato:contatos!propostas_enviada_para_fkey(nome), oportunidade:oportunidades(*, empresa:empresas(id, nome, tipo, cidade, uf), responsavel:perfis!oportunidades_responsavel_id_fkey(id, nome))';
const temTexto = (c) => !!(c && c.capa && (c.modulos || c.demanda));
const validadeDe = (dias, base) => { const n = Number(dias) || 0; if (!n) return null; const d = new Date(base || Date.now()); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- peças da tela: preços e logo ----------

const PRECO_VAZIO = () => ({ nome: '', cobranca: 'pessoa', outro: '', valor: '', quantidade: '', detalhe: '' });
const EXEMPLO_QTD = { modulo: 'Ex.: 4', individual: 'Ex.: 6 mentorados', turma: 'Ex.: 2', grupo: 'Ex.: 3', pessoa: 'Ex.: 20', outro: 'Ex.: 3' };
const valorNaCaixa = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v == null ? '' : v));
// Caixa de preços: 1 a 3 opções + condições de pagamento + validade. Mostra como cada opção vai aparecer na página.
function blocoPrecos(el, inicial, { bloqueado = false } = {}) {
  const est = {
    precos: (Array.isArray(inicial.precos) && inicial.precos.length ? inicial.precos : [PRECO_VAZIO()]).map((op) => ({ ...PRECO_VAZIO(), ...op })),
    pagamento: inicial.pagamento || '',
    validade_dias: inicial.validade_dias == null ? 30 : inicial.validade_dias,
  };
  const comoFica = (op) => {
    const d = descreverPreco({ ...op, valor: numero(op.valor), quantidade: numero(op.quantidade) });
    if (d.valor === 'A definir') return 'Sem valor: na proposta aparece "A definir".';
    return `Na proposta: ${[d.valor, ...d.linhas].join('  ·  ')}`;
  };
  const desenhar = () => {
    el.innerHTML = `<div class="grade" style="gap:10px">
      ${est.precos.map((op, i) => `<div class="preco-prop" data-i="${i}">
        <div class="linha" style="justify-content:space-between"><b>${est.precos.length > 1 ? `Opção de preço ${i + 1}` : 'Preço'}</b>${est.precos.length > 1 && !bloqueado ? `<button class="btn peq" type="button" data-tirar="${i}">Tirar esta opção</button>` : ''}</div>
        <div class="campos">
          <div class="campo"><label>Cobrado</label><select data-p="cobranca">${Object.entries(COBRANCA_ROTULO).map(([k, r]) => `<option value="${k}"${op.cobranca === k ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="campo"${op.cobranca === 'outro' ? '' : ' hidden'}><label>Por… (escreva)</label><input type="text" data-p="outro" value="${esc(op.outro || '')}" placeholder="Ex.: palestra, hora, diagnóstico"></div>
          <div class="campo"><label>${op.cobranca === 'fechado' ? 'Valor total (R$)' : 'Valor de cada (R$)'}</label><input type="text" inputmode="decimal" data-p="valor" value="${esc(valorNaCaixa(op.valor))}" placeholder="Ex.: 1.200,00"></div>
          <div class="campo"${op.cobranca === 'fechado' ? ' hidden' : ''}><label>Quantidade (se souber)</label><input type="text" inputmode="numeric" data-p="quantidade" value="${esc(op.quantidade == null ? '' : op.quantidade)}" placeholder="${EXEMPLO_QTD[op.cobranca] || 'Ex.: 3'}"></div>
        </div>
        <div class="campos">
          <div class="campo"><label>Nome desta opção (opcional)</label><input type="text" data-p="nome" value="${esc(op.nome || '')}" maxlength="40" placeholder="Ex.: Mentoria em grupo, Turma fechada"></div>
          <div class="campo"><label>Detalhe (opcional)</label><input type="text" data-p="detalhe" value="${esc(op.detalhe || '')}" maxlength="70" placeholder="Ex.: 7 sessões de 1h30 por mentorado"></div>
        </div>
        <p class="total" data-total>${esc(comoFica(op))}</p></div>`).join('')}
      ${est.precos.length < 3 && !bloqueado ? '<div><button class="btn peq" type="button" data-mais>+ Outra opção de preço</button> <span class="peq apagado">até 3 (ex.: turma fechada e por pessoa)</span></div>' : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
        <div class="campo"><label>Condições de pagamento</label><input type="text" data-g="pagamento" value="${esc(est.pagamento)}" maxlength="90" placeholder="Ex.: 50% na assinatura e 50% após a entrega"></div>
        <div class="campo"><label>Validade da proposta (dias)</label><input type="number" min="0" max="365" data-g="validade_dias" value="${esc(est.validade_dias)}"><small>Aparece no fim da proposta. Deixe vazio para não mostrar.</small></div>
      </div></div>`;
    if (bloqueado) el.querySelectorAll('input, select').forEach((x) => { x.disabled = true; });
  };
  el.addEventListener('input', (ev) => {
    const x = ev.target;
    if (x.dataset.g) { est[x.dataset.g] = x.dataset.g === 'validade_dias' ? (x.value === '' ? '' : Number(x.value)) : x.value; return; }
    const caixa = x.closest('[data-i]'); if (!caixa || !x.dataset.p) return;
    const op = est.precos[+caixa.dataset.i];
    op[x.dataset.p] = x.value;
    if (x.dataset.p === 'cobranca') { desenhar(); return; }
    caixa.querySelector('[data-total]').textContent = comoFica(op);
  });
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-mais') && est.precos.length < 3) { est.precos.push(PRECO_VAZIO()); desenhar(); }
    if (b.dataset.tirar != null) { est.precos.splice(+b.dataset.tirar, 1); desenhar(); }
  });
  desenhar();
  return {
    ler: () => ({
      precos: est.precos.map((op) => ({ nome: String(op.nome || '').trim(), cobranca: op.cobranca, outro: String(op.outro || '').trim(), valor: numero(op.valor), quantidade: numero(op.quantidade), detalhe: String(op.detalhe || '').trim() }))
        .filter((op) => op.valor != null || op.nome),
      pagamento: String(est.pagamento || '').trim(),
      validade_dias: est.validade_dias === '' ? null : Number(est.validade_dias) || null,
    }),
  };
}

// Logo do cliente: vira PNG no navegador (sem bordas sobrando, no máximo 900 × 450) e vai para a pasta pública "fotos".
function paraPng(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || 600, h = img.naturalHeight || 300;
        const tela = document.createElement('canvas'); tela.width = w; tela.height = h;
        const c = tela.getContext('2d'); c.drawImage(img, 0, 0, w, h);
        // corta a margem da mesma cor do canto (fundo branco ou transparente)
        const d = c.getImageData(0, 0, w, h).data;
        const f = [d[0], d[1], d[2], d[3]];
        const fundo = (i) => (f[3] < 10 ? d[i + 3] < 10 : Math.abs(d[i] - f[0]) + Math.abs(d[i + 1] - f[1]) + Math.abs(d[i + 2] - f[2]) < 40 && d[i + 3] > 245);
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (!fundo((y * w + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        let sx = 0, sy = 0, sw = w, sh = h;
        if (x1 >= x0 && y1 >= y0) { const m = 2; sx = Math.max(0, x0 - m); sy = Math.max(0, y0 - m); sw = Math.min(w, x1 + m + 1) - sx; sh = Math.min(h, y1 + m + 1) - sy; }
        const k = Math.min(1, 900 / sw, 450 / sh);
        w = Math.max(1, Math.round(sw * k)); h = Math.max(1, Math.round(sh * k));
        const saida = document.createElement('canvas'); saida.width = w; saida.height = h;
        saida.getContext('2d').drawImage(tela, sx, sy, sw, sh, 0, 0, w, h);
        saida.toBlob((blob) => { URL.revokeObjectURL(url); if (blob) resolve({ blob, largura: w, altura: h }); else reject(new Error('Não consegui ler a imagem.')); }, 'image/png');
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Esse arquivo não é uma imagem que o navegador consiga abrir. Use PNG ou JPG.')); };
    img.src = url;
  });
}
const linkLogo = (logo) => (logo && logo.caminho ? sb.storage.from('fotos').getPublicUrl(logo.caminho).data.publicUrl : '');
async function logoAnterior(empresaId) {
  try {
    const { data } = await sb.from('propostas').select('logo:conteudo->logo, criado_em, oportunidade:oportunidades!inner(empresa_id)')
      .eq('oportunidade.empresa_id', empresaId).not('conteudo->logo', 'is', null).order('criado_em', { ascending: false }).limit(1);
    const l = data && data[0] && data[0].logo;
    return l && l.caminho ? l : null;
  } catch (_) { return null; }
}
function blocoLogo(el, empresaId, inicial, { bloqueado = false, anterior = null } = {}) {
  let logo = inicial && inicial.caminho ? inicial : null;
  const desenhar = (enviando) => {
    el.innerHTML = `<div class="logo-prop">
      ${logo ? `<img src="${esc(linkLogo(logo))}" alt="Logo do cliente">` : '<span class="peq apagado">Sem logo: a capa sai só com a marca da Mentorei.</span>'}
      ${bloqueado ? '' : `<label class="btn peq" style="cursor:pointer">${logo ? 'Trocar logo' : '⬆ Enviar logo (PNG ou JPG)'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
        ${logo ? '<button class="btn peq" type="button" data-tirar>Tirar o logo</button>' : ''}
        ${!logo && anterior ? '<button class="btn peq" type="button" data-anterior>Usar o logo da proposta anterior</button>' : ''}`}
      ${enviando ? '<span class="peq apagado">Enviando…</span>' : ''}</div>`;
  };
  el.addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0]; if (!arq) return;
    if (arq.size > 8 * 1024 * 1024) { avisar('A imagem é grande demais (máximo 8 MB).', true); return; }
    desenhar(true);
    try {
      const png = await paraPng(arq);
      const caminho = `logos/${empresaId}/${Date.now()}.png`;
      const { error } = await sb.storage.from('fotos').upload(caminho, png.blob, { contentType: 'image/png', upsert: false });
      if (error) throw error;
      logo = { caminho, largura: png.largura, altura: png.altura };
    } catch (e) { avisar(explicarErro(e), true); }
    desenhar();
  });
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-tirar]')) { logo = null; desenhar(); }
    if (ev.target.closest('[data-anterior]')) { logo = anterior; desenhar(); }
  });
  desenhar();
  return { ler: () => logo };
}

// ---------- 1. pedir a geração ----------
export async function janelaGerar(ctx, o, quantas, aoCriar) {
  const anterior = await logoAnterior(o.empresa_id);
  const html = `<form id="f-g" class="grade" style="gap:16px" novalidate>
    <p class="peq apagado">Escreva só o conteúdo. Os números da Mentorei, as sócias e os contatos já entram sozinhos, e o valor vai na caixa de preços. Depois você revisa, aprova e envia daqui mesmo.</p>
    <div class="campo"><label for="g-pedido">1. Conteúdo da proposta *</label><textarea id="g-pedido" style="min-height:220px" placeholder="Ex.: Mentoria em grupo para a Cooperativa X. Público: coordenadores de agência (25 pessoas). Objetivo: ... Dores: ... Formato: 4 encontros online de 4 horas, quinzenais. Temas: ... Conduz: Claudia. Datas: a definir."></textarea>
      <small>Quanto mais detalhes (público, objetivo, dores, formato, carga horária, temas, quem conduz, datas), mais pronta a proposta sai. O que faltar fica como "a definir".</small></div>
    <div class="campo"><label>2. Investimento</label><div id="g-precos"></div></div>
    <div class="campo"><label>3. Logo do cliente (opcional)</label><div id="g-logo"></div></div>
    <div class="linha"><button class="btn pri" type="submit">✨ Gerar proposta (versão ${quantas + 1})</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela('Gerar proposta com a IA', html, { largura: 820 });
  const precos = blocoPrecos(j.corpo.querySelector('#g-precos'), { precos: [], validade_dias: 30 });
  const logo = blocoLogo(j.corpo.querySelector('#g-logo'), o.empresa_id, null, { anterior });
  j.corpo.querySelector('#f-g').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pedido = j.corpo.querySelector('#g-pedido').value.trim();
    if (pedido.length < 20) { avisar('Escreva o conteúdo da proposta (pelo menos algumas linhas).', true); return; }
    const inv = precos.ler();
    const conteudo = { precos: inv.precos, pagamento: inv.pagamento, validade_dias: inv.validade_dias, logo: logo.ler() };
    const valor = valorDaProposta(inv.precos);
    const b = ev.currentTarget.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Enviando para a IA…';
    const { data, error } = await sb.from('propostas').insert({ oportunidade_id: o.id, versao: quantas + 1, status: 'gerando', pedido, conteudo, valor: valor != null ? valor : o.valor, validade: validadeDe(inv.validade_dias) }).select('id').single();
    if (error) { avisar(faltaScript(error) ? AVISO_SCRIPT : explicarErro(error), true); b.disabled = false; b.textContent = '✨ Gerar proposta'; return; }
    const r = await api('/api/proposta-gerar', { proposta_id: data.id });
    if (!r.ok) { await sb.from('propostas').update({ status: 'erro', erro: r.mensagem || 'O servidor não aceitou o pedido.' }).eq('id', data.id); }
    await sb.from('interacoes').insert({ oportunidade_id: o.id, tipo: 'sistema', texto: `Proposta (versão ${quantas + 1}) pedida à IA${inv.precos.length ? ` · ${inv.precos.map(resumoPreco).join(' | ')}` : ''}.` });
    j.fechar(); if (aoCriar) aoCriar(data.id);
  });
}

// ---------- 2. página da proposta ----------
export async function paginaProposta(ctx, el, id) {
  const { data: p, error } = await sb.from('propostas').select(SEL).eq('id', id).single();
  if (error) { el.innerHTML = `<div class="aviso erro">${esc(faltaScript(error) ? AVISO_SCRIPT : explicarErro(error))}</div>`; return; }
  const o = p.oportunidade || {};
  const empresa = (o.empresa && o.empresa.nome) || '';
  const recarregar = () => ctx.irPara(`#/vendas/proposta/${id}`);
  const status = p.status || 'enviada';
  const bloqueada = status === 'enviada';
  const c = p.conteudo || null;
  const rotuloBaixar = /\.pdf$/i.test(p.arquivo || '') ? '⬇ Baixar o PDF' : '⬇ Baixar o arquivo';
  const precosTexto = c && precosValidos(c.precos).length ? precosValidos(c.precos).map(resumoPreco).join(' · ') : '';

  el.innerHTML = `
    <div class="cab"><div><a class="peq" href="#/vendas/oportunidade/${o.id}">← ${esc(o.titulo || 'Oportunidade')}</a><h1>Proposta · versão ${p.versao}</h1>
      <p class="sub"><a href="#/vendas/empresa/${o.empresa_id}"><b>${esc(empresa)}</b></a> · ${SERVICOS[o.servico] || o.servico || ''} · <b>${dinheiro(p.valor != null ? p.valor : o.valor)}</b>${p.validade ? ` · vale até ${dataBR(p.validade)}` : ''}</p></div>
      <div class="acoes">${seloStatus(p)}${p.arquivo_storage ? '<button class="btn" type="button" id="baixar">' + rotuloBaixar + '</button>' : ''}</div></div>
    <div id="corpo"></div>`;
  el.querySelector('#baixar')?.addEventListener('click', () => baixar(p));
  const corpo = el.querySelector('#corpo');

  if (status === 'gerando') {
    corpo.innerHTML = `<div class="cartao destaque"><h3>A IA está escrevendo a proposta…</h3><p class="mt">Costuma levar de 1 a 2 minutos. Esta página atualiza sozinha; pode continuar navegando e voltar depois.</p>
      <p class="peq mt" style="opacity:.8">Pedida em ${dataHoraBR(p.criado_em)}.</p></div>
      <div class="cartao mt"><h3>Conteúdo enviado</h3><p class="peq mt" style="white-space:pre-wrap">${esc(p.pedido || '')}</p>${precosTexto ? `<p class="peq mt"><b>Investimento:</b> ${esc(precosTexto)}</p>` : ''}</div>`;
    const timer = setInterval(async () => {
      if (!el.isConnected || !location.hash.includes(id)) { clearInterval(timer); return; }
      const { data } = await sb.from('propostas').select('status').eq('id', id).single();
      if (data && data.status !== 'gerando') { clearInterval(timer); recarregar(); }
    }, 4000);
    // passou de 6 minutos sem resposta: deixa tentar de novo
    if (Date.now() - new Date(p.atualizado_em || p.criado_em).getTime() > 6 * 60000) {
      corpo.insertAdjacentHTML('afterbegin', '<div class="aviso erro" style="margin-bottom:14px">Está demorando mais que o normal. <button class="btn peq" type="button" id="de-novo">Pedir de novo</button></div>');
      corpo.querySelector('#de-novo').addEventListener('click', () => gerarDeNovo(ctx, p, '', recarregar));
    }
    return;
  }

  const avisos = Array.isArray(p.avisos) ? p.avisos : [];
  // cada envio feito pela plataforma (script 38); sem o script, só o resumo da proposta
  const { data: envios } = await sb.from('proposta_envios').select('*, por:perfis!proposta_envios_enviado_por_fkey(nome)').eq('proposta_id', id).order('enviado_em', { ascending: false });
  const quemRecebeu = (e) => (e.para || []).map((x) => [x.nome, x.email || x.whatsapp].filter(Boolean).join(' · ')).join('; ');
  const blocoEnvios = `<div class="cartao"><h3>Envios desta proposta</h3>
    ${(envios || []).length ? `<div class="hist mt">${envios.map((e) => `<div class="hist-item"><span class="hist-icone">${e.canal === 'whatsapp' ? '💬' : e.canal === 'outro' ? '📝' : '✉'}</span>
      <div><div class="peq apagado">${dataHoraBR(e.enviado_em)} · ${CANAL[e.canal] || ''}${e.por ? ` · por ${esc(primeiroNome(e.por.nome))}` : ''}${e.como === 'link' ? ' · arquivo grande: foi um link para baixar' : ''}</div>
        <div>${esc(quemRecebeu(e) || '—')}</div>${e.copia_para ? `<div class="peq apagado">Cópia para ${esc(e.copia_para)}</div>` : ''}
        ${e.assunto || e.mensagem ? `<details class="mt"><summary class="peq">Ver a mensagem</summary>${e.assunto ? `<p class="peq mt"><b>${esc(e.assunto)}</b></p>` : ''}<p class="peq mt" style="white-space:pre-wrap">${esc(e.mensagem || '')}</p></details>` : ''}</div></div>`).join('')}</div>`
      : `<p class="peq apagado mt">${status === 'enviada' ? `Enviada em ${dataBR(p.enviada_em)} ${CANAL[p.canal] || ''} (antes do registro de envios).` : 'Ainda não foi enviada.'}</p>`}</div>`;
  corpo.innerHTML = `
    ${status === 'erro' ? `<div class="aviso erro" style="margin-bottom:14px"><b>Não deu certo:</b> ${esc(p.erro || 'erro desconhecido')} <button class="btn peq" type="button" id="de-novo">Tentar de novo</button></div>` : ''}
    ${status !== 'erro' && p.erro ? `<div class="aviso erro" style="margin-bottom:14px">${esc(p.erro)} <button class="btn peq" type="button" id="montar-de-novo">Montar o arquivo</button></div>` : ''}
    ${status === 'enviada' ? `<div class="aviso ok" style="margin-bottom:14px">Enviada em ${dataBR(p.enviada_em)} ${CANAL[p.canal] || ''}${p.enviada_para_contato && p.enviada_para_contato.nome ? ` para ${esc(p.enviada_para_contato.nome)}` : ''}. ${o.proximo_contato_em ? `Retorno marcado para <b>${dataHoraBR(o.proximo_contato_em)}</b>.` : ''}</div>` : ''}
    ${status === 'aprovada' ? `<div class="aviso ok" style="margin-bottom:14px">${p.importacao_id ? 'Proposta importada' : 'Aprovada'}${p.aprovada_em ? ` em ${dataHoraBR(p.aprovada_em)}` : ''}. Agora é só clicar em <b>Enviar proposta</b>.</div>` : ''}
    ${avisos.length && !bloqueada ? `<div class="aviso" style="margin-bottom:14px"><b>Alguns textos ficaram grandes para o espaço da página</b> (a letra já foi diminuída um pouco). Encurte e clique em "Salvar e montar o arquivo de novo":<ul class="peq" style="margin:6px 0 0 18px">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    <div class="linha" style="margin-bottom:18px;gap:8px">
      ${status === 'rascunho' || status === 'aprovada' || status === 'enviada' ? `<button class="btn pri" type="button" id="enviar">✉ ${status === 'enviada' ? 'Enviar de novo' : 'Enviar proposta'}</button>` : ''}
      ${status === 'rascunho' ? '<button class="btn" type="button" id="aprovar">✔ Aprovar proposta</button>' : ''}
      ${status === 'rascunho' || status === 'aprovada' ? '<button class="btn" type="button" id="enviada-fora">Marcar como enviada (mandei por fora)</button>' : ''}
      ${p.arquivo_storage ? '<button class="btn escuro" type="button" id="baixar2">' + rotuloBaixar + '</button>' : ''}
      ${status === 'enviada' ? `<a class="btn" href="#/vendas/oportunidade/${o.id}">Voltar à oportunidade</a>` : ''}</div>
    <div class="grade g2" style="align-items:start;grid-template-columns:3fr 2fr">
      <div class="grade" style="gap:14px" id="editor"></div>
      <div class="grade" style="gap:14px">
        ${!bloqueada && temTexto(c) ? `<div class="cartao"><h3>Pedir ajustes à IA</h3><p class="peq apagado mt">Ela reescreve o texto mantendo o que não foi pedido para mudar. Preço e logo você muda na caixa "Investimento e logo".</p>
          <div class="campo mt"><textarea id="ajustes" placeholder="Ex.: troque o módulo 3 por negociação; tom mais direto na capa; acrescente uma página sobre os produtos da cooperativa"></textarea></div>
          <button class="btn mt" type="button" id="ajustar">Reescrever com a IA</button></div>` : ''}
        ${blocoEnvios}
        ${p.pedido ? `<div class="cartao"><h3>Conteúdo enviado</h3><details class="mt"><summary class="peq">Ver o conteúdo</summary><p class="peq mt" style="white-space:pre-wrap">${esc(p.pedido)}</p></details>${p.ajustes ? `<p class="peq mt"><b>Último ajuste:</b> ${esc(p.ajustes)}</p>` : ''}</div>` : ''}
        ${c && c.mensagem_email ? `<div class="cartao"><h3>Mensagem sugerida para o envio</h3><p class="peq mt"><b>${esc(c.mensagem_email.assunto)}</b></p><p class="peq mt" style="white-space:pre-wrap">${esc(c.mensagem_email.texto)}</p><p class="peq apagado mt">Dá para mudar na hora de enviar.</p></div>` : ''}
      </div>
    </div>`;
  corpo.querySelector('#baixar2')?.addEventListener('click', () => baixar(p));
  corpo.querySelector('#de-novo')?.addEventListener('click', () => gerarDeNovo(ctx, p, '', recarregar));
  corpo.querySelector('#montar-de-novo')?.addEventListener('click', async () => { const r = await api('/api/proposta-arquivo', { proposta_id: id }); if (!r.ok) { avisar(r.mensagem, true); return; } avisar('Arquivo montado.'); recarregar(); });
  corpo.querySelector('#ajustar')?.addEventListener('click', () => { const t = corpo.querySelector('#ajustes').value.trim(); if (!t) { avisar('Escreva o que quer mudar.', true); return; } gerarDeNovo(ctx, p, t, recarregar); });
  corpo.querySelector('#aprovar')?.addEventListener('click', async () => {
    if (!window.confirm('Aprovar esta proposta? Depois é só escolher para quem enviar.')) return;
    const { error: e } = await sb.from('propostas').update({ status: 'aprovada', aprovada_em: new Date().toISOString(), aprovada_por: ctx.perfil.id }).eq('id', id);
    if (e) { avisar(explicarErro(e), true); return; }
    await sb.from('interacoes').insert({ oportunidade_id: o.id, tipo: 'nota', texto: `Proposta (versão ${p.versao}) aprovada por ${primeiroNome(ctx.perfil.nome)}.` });
    avisar('Proposta aprovada.');
    janelaEnviar(ctx, { ...p, status: 'aprovada' }, o, recarregar, () => recarregar());
  });
  // proposta sem o texto da IA (importada ou registrada): mostra o arquivo e o resumo no lugar do editor
  if (!temTexto(c)) {
    const editor = corpo.querySelector('#editor');
    editor.innerHTML = `<div class="cartao"><h3>${p.importacao_id ? 'Proposta importada' : 'Proposta registrada'}</h3>
      ${p.arquivo ? `<p class="mt">📎 <b>${esc(p.arquivo)}</b></p>` : ''}
      ${p.arquivo_storage ? '<p class="peq apagado">O arquivo está guardado na plataforma e vai junto no envio.</p>'
        : '<p class="peq mt"><span class="selo alerta">Sem arquivo guardado</span> Na hora de enviar, a plataforma pede o arquivo (PDF ou PowerPoint).</p>'}
      ${p.resumo ? `<p class="peq mt" style="white-space:pre-wrap">${esc(p.resumo)}</p>` : ''}</div>`;
  }
  corpo.querySelector('#enviar')?.addEventListener('click', () => janelaEnviar(ctx, p, o, recarregar));
  corpo.querySelector('#enviada-fora')?.addEventListener('click', () => janelaEnviadaFora(ctx, p, o, recarregar));

  // editor do conteúdo
  const editor = corpo.querySelector('#editor');
  if (!temTexto(c)) return;   // importada ou registrada: o cartão do arquivo já está no lugar do editor
  desenharEditor(ctx, editor, p, o, bloqueada, recarregar);
}

async function gerarDeNovo(ctx, p, ajustes, recarregar) {
  const { error } = await sb.from('propostas').update({ status: 'gerando', erro: null, ajustes: ajustes || null }).eq('id', p.id);
  if (error) { avisar(explicarErro(error), true); return; }
  const r = await api('/api/proposta-gerar', { proposta_id: p.id, ajustes });
  if (!r.ok) { await sb.from('propostas').update({ status: 'erro', erro: r.mensagem || 'O servidor não aceitou o pedido.' }).eq('id', p.id); }
  avisar(ajustes ? 'Pedido de ajuste enviado à IA.' : 'Pedido enviado à IA de novo.'); recarregar();
}

async function baixar(p) {
  const { data, error } = await sb.storage.from('propostas').createSignedUrl(p.arquivo_storage, 120, { download: p.arquivo || 'Proposta-Mentorei.pptx' });
  if (error) { avisar(explicarErro(error), true); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

// ---------- 3. editor ----------
const campo = (rotulo, caminho, valor, { area = false, dica = '' } = {}) => `<div class="campo"><label>${esc(rotulo)}</label>${area
  ? `<textarea data-c="${esc(caminho)}" rows="2">${esc(valor == null ? '' : valor)}</textarea>` : `<input type="text" data-c="${esc(caminho)}" value="${esc(valor == null ? '' : valor)}">`}${dica ? `<small>${esc(dica)}</small>` : ''}</div>`;
const escolhaIcone = (caminho, valor) => `<div class="campo"><label>Ícone</label><select data-c="${esc(caminho)}"><option value="">(o do modelo)</option>${Object.entries(ICONES).map(([k, r]) => `<option value="${k}"${valor === k ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></div>`;
const tituloDuplo = (rotulo, caminho, t) => `<div class="grade g2" style="gap:8px">${campo(`${rotulo} · começo`, `${caminho}.texto`, t && t.texto)}${campo(`${rotulo} · parte destacada`, `${caminho}.destaque`, t && t.destaque, { dica: 'Aparece com fundo colorido.' })}</div>`;
const quatro = (lista) => [0, 1, 2, 3].map((i) => (Array.isArray(lista) && lista[i]) || {});
const itens = (sec, lista, { icone = false } = {}) => quatro(lista).map((it, i) => `<div class="grade" style="grid-template-columns:${icone ? '1fr 1.3fr 2fr' : '1fr 2fr'};gap:8px">${icone ? escolhaIcone(`${sec}.itens.${i}.icone`, it.icone) : ''}${campo(`Item ${i + 1} · título`, `${sec}.itens.${i}.titulo`, it.titulo)}${campo(`Item ${i + 1} · texto`, `${sec}.itens.${i}.texto`, it.texto, { area: true })}</div>`).join('');
const secaoHtml = (titulo, html, aberta = true) => `<div class="cartao"><details${aberta ? ' open' : ''}><summary><b>${esc(titulo)}</b></summary><div class="grade mt" style="gap:8px">${html}</div></details></div>`;
const topicosEmLinhas = (lista) => (lista || []).map((t) => (t && typeof t === 'object' ? [t.destaque, t.texto].filter(Boolean).join(' ') : t)).join('\n');

function desenharEditor(ctx, editor, p, o, bloqueada, recarregar) {
  const c = normalizarConteudo(JSON.parse(JSON.stringify(p.conteudo)));
  c.versao = 2;
  delete c.modelo;                               // havia modelo claro/escuro até 11/10/2026; agora é um só
  let precos = null, logo = null;
  const desenhar = () => {
    editor.innerHTML = `
      ${!bloqueada ? '<div class="aviso" style="margin:0">Revise o texto abaixo (ou peça ajustes à IA ao lado). Depois clique em <b>Salvar e montar o arquivo de novo</b>.</div>' : ''}
      ${secaoHtml('Investimento e logo', `<div class="campo"><label>Investimento</label><div id="ed-precos"></div></div>
        <div class="campo"><label>Logo do cliente</label><div id="ed-logo"></div></div>`)}
      ${secaoHtml('Capa', `${campo('Tipo', 'capa.tipo', c.capa?.tipo, { dica: 'Ex.: Proposta de mentoria em grupo (sai em maiúsculas)' })}${campo('Nome do programa', 'capa.nome', c.capa?.nome)}
        ${campo('Frase principal', 'capa.subtitulo1', c.capa?.subtitulo1)}${campo('Segunda linha', 'capa.subtitulo2', c.capa?.subtitulo2)}
        ${campo('Cliente  •  público', 'capa.linha1', c.capa?.linha1)}${campo('Carga horária  •  formato', 'capa.linha2', c.capa?.linha2)}`)}
      ${secaoHtml('Nomes usados nas páginas', `<div class="grade g2" style="gap:8px">${campo('Etiqueta das páginas', 'secao', c.secao, { dica: 'Ex.: O WORKSHOP, A MENTORIA' })}${campo('Cada parte se chama', 'rotulo_modulo', c.rotulo_modulo, { dica: 'Ex.: PILAR, MÓDULO, ENCONTRO' })}</div>`, false)}
      ${secaoHtml('O que entendemos da sua demanda', `${itens('demanda', c.demanda?.itens)}${campo('Frase de fechamento', 'demanda.frase', c.demanda?.frase)}`)}
      ${secaoHtml('Visão geral dos módulos', `${tituloDuplo('Título', 'visao.titulo', c.visao?.titulo)}${campo('Rodapé', 'visao.rodape', c.visao?.rodape)}`)}
      ${(c.modulos || []).map((m, i) => secaoHtml(`Módulo ${String(i + 1).padStart(2, '0')} · ${m.titulo || ''}`, `
        <div class="grade g2" style="gap:8px">${campo('Título', `modulos.${i}.titulo`, m.titulo)}${campo('Título curto (página-resumo)', `modulos.${i}.titulo_curto`, m.titulo_curto)}</div>
        <div class="grade g2" style="gap:8px">${campo('Frase do cartão (página-resumo)', `modulos.${i}.chamada`, m.chamada)}${campo('Subtítulo', `modulos.${i}.subtitulo`, m.subtitulo)}</div>
        <div class="grade" style="grid-template-columns:1.4fr 1fr 1.3fr;gap:8px">${campo('Período e duração', `modulos.${i}.quando`, m.quando, { dica: 'Ex.: Manhã  •  2 horas' })}${campo('Versão curta', `modulos.${i}.quando_curto`, m.quando_curto, { dica: 'Ex.: Manhã / 2h' })}${escolhaIcone(`modulos.${i}.icone`, m.icone)}</div>
        ${campo('Objetivo', `modulos.${i}.objetivo`, m.objetivo, { area: true })}${campo('Entrega prática', `modulos.${i}.entrega`, m.entrega, { area: true })}
        ${campo('Tópicos (um por linha, de 3 a 5)', `modulos.${i}.topicos`, topicosEmLinhas(m.topicos), { area: true, dica: 'O começo até os dois-pontos sai em negrito. Ex.: Conversas difíceis: preparo e escuta' })}
        ${!bloqueada ? `<div class="linha"><button class="btn peq" type="button" data-mod="remover" data-i="${i}">Remover módulo</button>${i > 0 ? `<button class="btn peq" type="button" data-mod="subir" data-i="${i}">↑ Subir</button>` : ''}</div>` : ''}`, false)).join('')}
      ${!bloqueada && (c.modulos || []).length < 6 ? '<div><button class="btn" type="button" id="mais-modulo">+ Módulo</button> <span class="peq apagado">até 6</span></div>' : ''}
      ${(c.destaques || []).map((d, i) => secaoHtml(`Página extra · ${[d.titulo?.texto, d.titulo?.destaque].map((t) => String(t || '').trim()).filter(Boolean).join(' ')}`, `
        ${tituloDuplo('Título', `destaques.${i}.titulo`, d.titulo)}
        <div class="grade g2" style="gap:8px">${campo('Subtítulo (opcional)', `destaques.${i}.subtitulo`, d.subtitulo)}${campo('Entra depois do módulo nº', `destaques.${i}.apos_modulo`, d.apos_modulo)}</div>
        ${quatro(d.itens).map((it, k) => `<div class="grade" style="grid-template-columns:1fr 1fr 1.4fr 2fr;gap:6px">${escolhaIcone(`destaques.${i}.itens.${k}.icone`, it.icone)}${campo(`Item ${k + 1} · negrito`, `destaques.${i}.itens.${k}.destaque`, it.destaque)}${campo('continuação', `destaques.${i}.itens.${k}.texto_destaque`, it.texto_destaque)}${campo('texto', `destaques.${i}.itens.${k}.texto`, it.texto, { area: true })}</div>`).join('')}
        ${!bloqueada ? `<div><button class="btn peq" type="button" data-dest="remover" data-i="${i}">Remover página extra</button></div>` : ''}`, false)).join('')}
      ${secaoHtml('Metodologia', itens('metodologia', c.metodologia?.itens, { icone: true }), false)}
      ${secaoHtml('Personalização', `${itens('personalizacao', c.personalizacao?.itens)}${campo('Frase de fechamento', 'personalizacao.frase', c.personalizacao?.frase)}`, false)}
      ${secaoHtml('Organização da jornada', `${tituloDuplo('Título', 'organizacao.titulo', c.organizacao?.titulo)}${campo('Subtítulo', 'organizacao.subtitulo', c.organizacao?.subtitulo)}
        <div class="grade" style="grid-template-columns:1fr 1fr 1fr 2fr;gap:6px">${[0, 1, 2, 3].map((k) => campo(`Coluna ${k + 1}`, `organizacao.colunas.${k}`, (c.organizacao?.colunas || [])[k])).join('')}</div>
        ${(c.organizacao?.linhas || []).map((l, i) => `<div class="grade" style="grid-template-columns:1fr 1fr 1fr 2fr;gap:6px">${['c1', 'c2', 'c3', 'c4'].map((k) => campo(`Linha ${i + 1}`, `organizacao.linhas.${i}.${k}`, l[k])).join('')}</div>`).join('')}
        ${!bloqueada ? '<div class="linha"><button class="btn peq" type="button" id="mais-linha">+ Linha</button><button class="btn peq" type="button" id="menos-linha">− Última linha</button></div>' : ''}
        ${campo('Rodapé', 'organizacao.rodape', c.organizacao?.rodape)}`, false)}
      ${secaoHtml('Investimento · textos', `<p class="peq apagado">Os valores vêm da caixa "Investimento e logo" lá em cima.</p>
        <div class="grade g2" style="gap:8px">${campo('Nome do que está sendo vendido', 'investimento.nome_oferta', c.investimento?.nome_oferta, { dica: 'Usado quando a opção de preço não tem nome' })}${campo('Descrição (quando não há valor)', 'investimento.descricao_oferta', c.investimento?.descricao_oferta)}</div>
        <div class="grade" style="grid-template-columns:1fr 1fr 2fr;gap:6px">${campo('Caixa da direita · título', 'investimento.escopo.rotulo', c.investimento?.escopo?.rotulo)}${campo('destaque', 'investimento.escopo.destaque', c.investimento?.escopo?.destaque)}${campo('texto', 'investimento.escopo.texto', c.investimento?.escopo?.texto, { area: true })}</div>
        <p class="peq apagado">A caixa da direita só aparece quando há um preço só.</p>
        ${campo('Incluso', 'investimento.incluso', c.investimento?.incluso, { area: true })}${campo('Não incluso', 'investimento.nao_incluso', c.investimento?.nao_incluso)}`, false)}
      ${secaoHtml('Próximos passos', itens('proximos', c.proximos?.itens), false)}
      ${secaoHtml('Quem desenvolve · sócias', `${tituloDuplo('Título', 'quem_titulo', c.quem_titulo)}${campo('Linha abaixo das sócias', 'socias_rodape', c.socias_rodape)}
        <p class="peq apagado">Os números da Mentorei e os textos das sócias são fixos no modelo.</p>`, false)}
      ${secaoHtml('Expertise', `${tituloDuplo('Título', 'expertise.titulo', c.expertise?.titulo)}${itens('expertise', c.expertise?.itens, { icone: true })}`, false)}
      ${secaoHtml('Frase final e mensagens', `<div class="grade" style="grid-template-columns:1fr 1fr 1fr;gap:6px">${campo('Frase final · 1ª linha', 'frase_final.antes', c.frase_final?.antes)}${campo('2ª linha (destacada)', 'frase_final.destaque', c.frase_final?.destaque)}${campo('3ª linha', 'frase_final.depois', c.frase_final?.depois)}</div>
        ${campo('E-mail · assunto', 'mensagem_email.assunto', c.mensagem_email?.assunto)}${campo('E-mail · texto', 'mensagem_email.texto', c.mensagem_email?.texto, { area: true })}${campo('WhatsApp', 'mensagem_whatsapp', c.mensagem_whatsapp, { area: true })}${campo('Resumo para o histórico', 'resumo', c.resumo, { area: true })}`, false)}
      ${!bloqueada ? '<div class="linha"><button class="btn pri" type="button" id="salvar">💾 Salvar e montar o arquivo de novo</button><span class="peq apagado">Leva alguns segundos.</span></div>' : ''}`;
    editor.querySelectorAll('textarea').forEach((t) => { t.style.minHeight = '0'; t.rows = Math.max(2, Math.min(8, String(t.value).split('\n').length + 1)); });
    if (bloqueada) editor.querySelectorAll('input, textarea, select').forEach((x) => { x.disabled = true; });
    precos = blocoPrecos(editor.querySelector('#ed-precos'), c, { bloqueado: bloqueada });
    logo = blocoLogo(editor.querySelector('#ed-logo'), o.empresa_id, c.logo, { bloqueado: bloqueada });
  };
  // lê os campos da tela para dentro de c (caminhos "a.b.0.c"; tópicos viram lista)
  const ler = () => {
    editor.querySelectorAll('[data-c]').forEach((x) => {
      const partes = x.dataset.c.split('.'); let alvo = c;
      for (let i = 0; i < partes.length - 1; i += 1) { const k = partes[i]; if (alvo[k] == null || typeof alvo[k] !== 'object') alvo[k] = /^\d+$/.test(partes[i + 1]) ? [] : {}; alvo = alvo[k]; }
      const ult = partes[partes.length - 1];
      let v = x.value;
      if (ult === 'topicos') v = v.split('\n').map((t) => t.trim()).filter(Boolean).map(topicoDe);
      else if (ult === 'apos_modulo') v = Number(v) || 1;
      alvo[ult] = v;
    });
    if (precos) Object.assign(c, precos.ler());
    if (logo) c.logo = logo.ler();
  };
  editor.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b || b.closest('#ed-precos, #ed-logo')) return;
    if (b.id === 'salvar') {
      ler(); b.disabled = true; b.textContent = 'Salvando e montando…';
      const r = await api('/api/proposta-arquivo', { proposta_id: p.id, conteudo: c });
      if (!r.ok) { avisar(r.mensagem || 'Não consegui salvar.', true); b.disabled = false; b.textContent = '💾 Salvar e montar o arquivo de novo'; return; }
      avisar(r.avisos && r.avisos.length ? `Salvo. ${r.avisos.length} texto(s) ainda grande(s).` : 'Salvo e arquivo montado.'); recarregar(); return;
    }
    if (!b.id && !b.dataset.mod && !b.dataset.dest) return;
    ler();
    if (b.id === 'mais-modulo') c.modulos = [...(c.modulos || []), { titulo: 'Novo módulo', titulo_curto: 'Novo módulo', chamada: '', subtitulo: '', quando: 'Manhã  •  2 horas', quando_curto: 'Manhã / 2h', icone: '', objetivo: '', entrega: '', topicos: [] }];
    if (b.dataset.mod === 'remover') c.modulos.splice(+b.dataset.i, 1);
    if (b.dataset.mod === 'subir') { const i = +b.dataset.i; [c.modulos[i - 1], c.modulos[i]] = [c.modulos[i], c.modulos[i - 1]]; }
    if (b.dataset.dest === 'remover') c.destaques.splice(+b.dataset.i, 1);
    if (b.id === 'mais-linha') { c.organizacao = c.organizacao || {}; c.organizacao.linhas = [...(c.organizacao.linhas || []), { c1: '', c2: '', c3: '', c4: '' }]; }
    if (b.id === 'menos-linha') (c.organizacao?.linhas || []).pop();
    desenhar();
  });
  desenhar();
}

// ---------- 4. envio ----------
// Pedido da Juliana (2026-10-15): gerar ou importar a proposta e clicar em "Enviar proposta"; puxa o e-mail dos contatos do
// cliente (já marca o principal), aceita outros e-mails (que podem virar contatos da empresa), manda cópia para quem envia e
// registra cada envio (proposta_envios, script 38) e o histórico da oportunidade. Sem arquivo guardado, pede o arquivo aqui.
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIPO_ARQ = { pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const nomeSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-90);
// "maria.souza@x.com" → "Maria Souza" (nome provisório do contato novo)
const nomeDoEmail = (e) => e.split('@')[0].split(/[._-]+/).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ') || e;
const juntarNomes = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);

async function janelaEnviar(ctx, p, o, recarregar, aoFechar) {
  const empresaId = o.empresa_id;
  const empresaNome = (o.empresa && o.empresa.nome) || 'empresa';
  const [cs, ms] = await Promise.all([
    sb.from('contatos').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    sb.from('modelos_mensagem').select('*').eq('canal', 'email').order('ordem'),
  ]);
  const contatos = cs.data || [];
  const comEmail = contatos.filter((x) => x.email);
  const comWhats = contatos.filter((x) => limparFone(x.whatsapp).length >= 10);
  const c = p.conteudo || {};
  const modelo = (ms.data || []).find((m) => /arquivo/i.test(m.nome)) || (ms.data || []).find((m) => m.etapa === 'proposta');
  const principal = comEmail.find((x) => x.id === o.contato_id) || comEmail.find((x) => x.decisor) || comEmail[0] || null;
  const reenvio = p.status === 'enviada';

  const html = `<div class="grade" style="gap:12px">
    ${p.arquivo_storage ? `<p class="peq">📎 Vai junto: <b>${esc(p.arquivo || 'arquivo da proposta')}</b></p>`
      : `<div class="cartao" style="padding:12px"><b>Arquivo da proposta</b><p class="peq apagado">Esta proposta ainda não tem o arquivo guardado na plataforma. Escolha o PDF ou o PowerPoint que vai para o cliente.</p>
        <input type="file" id="e-arq" class="mt" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"></div>`}
    <div class="linha" style="gap:14px"><label class="check"><input type="radio" name="canal" value="email" checked><span>✉ E-mail (a proposta vai junto)</span></label><label class="check"><input type="radio" name="canal" value="whatsapp"><span>💬 WhatsApp (abre com a mensagem; você anexa o arquivo)</span></label></div>
    <div id="bloco-email" class="grade" style="gap:10px">
      <div class="cartao" style="padding:12px"><b>Para quem</b>
        ${comEmail.length ? `<div class="grade mt" style="gap:6px">${comEmail.map((x) => `<label class="check"><input type="checkbox" data-ct="${x.id}"${principal && x.id === principal.id ? ' checked' : ''}><span><b>${esc(x.nome)}</b>${x.cargo ? ` · ${esc(x.cargo)}` : ''}${x.decisor ? ' <span class="selo neutro">decide</span>' : ''}<br><span class="peq apagado">${esc(x.email)}</span></span></label>`).join('')}</div>`
          : `<p class="peq apagado mt">Nenhum contato da ${esc(empresaNome)} tem e-mail cadastrado. Escreva o e-mail abaixo.</p>`}
        ${contatos.length > comEmail.length ? `<p class="peq apagado mt">Sem e-mail cadastrado: ${contatos.filter((x) => !x.email).map((x) => esc(x.nome)).join(', ')}.</p>` : ''}
        <div class="campo mt"><label for="e-outros">Outros e-mails</label><input type="text" id="e-outros" placeholder="fulana@empresa.com.br, ciclano@empresa.com.br" autocomplete="off"><small>Separe por vírgula. Pode ser gente de outra empresa também.</small></div>
        <label class="check mt"><input type="checkbox" id="e-guardar" checked><span>Guardar os outros e-mails como contatos da ${esc(empresaNome)}</span></label>
        <label class="check mt"><input type="checkbox" id="e-copia" checked><span>Mandar uma cópia para mim</span></label>
        <p class="peq mt" id="e-quem"></p></div>
      <div class="campo"><label for="e-assunto">Assunto</label><input type="text" id="e-assunto" maxlength="200"></div>
      <div class="campo"><label for="e-texto">Mensagem</label><textarea id="e-texto" style="min-height:190px"></textarea><small>Sai de contato@mentorei.com.br com a proposta junto (arquivo grande vai como link para baixar). As respostas chegam no contato@.</small></div>
      <div class="linha"><button class="btn pri" type="button" id="e-enviar">✉ Enviar a proposta</button><button class="btn" type="button" data-fechar>Depois</button></div></div>
    <div id="bloco-whats" class="grade" style="gap:8px" hidden>
      <div class="grade g2" style="gap:8px"><div class="campo"><label for="w-cont">Para quem</label><select id="w-cont">${comWhats.map((x) => `<option value="${x.id}"${principal && x.id === principal.id ? ' selected' : ''}>${esc(x.nome)} · ${esc(x.whatsapp)}</option>`).join('')}<option value="">Outro número…</option></select></div>
        <div class="campo" id="w-outro-campo"${comWhats.length ? ' hidden' : ''}><label for="w-outro">WhatsApp com DDD</label><input type="tel" id="w-outro" placeholder="(54) 99999-0000"></div></div>
      <div class="campo"><label for="w-texto">Mensagem</label><textarea id="w-texto" style="min-height:140px"></textarea></div>
      <div class="linha"><button class="btn" type="button" id="w-baixar">1. Baixar o arquivo</button><button class="btn pri" type="button" id="w-abrir">2. Abrir o WhatsApp e registrar o envio</button><button class="btn" type="button" data-fechar>Depois</button></div>
      <small>No WhatsApp, anexe o arquivo baixado junto com a mensagem.</small></div>
    <p class="peq apagado">${reenvio ? 'É um novo envio da mesma proposta: fica registrado no histórico, sem mudar a etapa nem o retorno.' : 'Ao enviar, a proposta fica marcada como enviada, a oportunidade passa para "Proposta enviada" e o retorno entra na agenda para daqui a 4 dias (dia útil).'}</p></div>`;
  const j = janela(`${reenvio ? 'Enviar de novo' : 'Enviar a proposta'} · versão ${p.versao}`, html, { largura: 760, aoFechar });
  const q = (s) => j.corpo.querySelector(s);

  // quem foi marcado + outros e-mails
  const outros = () => q('#e-outros').value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const marcados = () => [...j.corpo.querySelectorAll('[data-ct]:checked')].map((b) => comEmail.find((x) => x.id === b.dataset.ct)).filter(Boolean);
  let mexeuNaMensagem = false;
  const preencherMsg = () => {
    const primeiro = marcados()[0] || null;
    const ct = primeiro ? { ...primeiro, nome: juntarNomes(marcados().map((x) => primeiroNome(x.nome))) } : null;
    if (!mexeuNaMensagem) {
      if (c.mensagem_email) { q('#e-assunto').value = c.mensagem_email.assunto || ''; q('#e-texto').value = String(c.mensagem_email.texto || '').replace(/\{contato\}/g, ct ? ct.nome : ''); }
      else if (modelo) { q('#e-assunto').value = preencher(modelo.assunto, o, primeiro, ctx); q('#e-texto').value = preencher(modelo.texto, o, primeiro, ctx); }
      else {
        q('#e-assunto').value = `Proposta Mentorei · ${empresaNome}`;
        q('#e-texto').value = `Olá${ct ? `, ${ct.nome}` : ''}!\n\nConforme conversamos, segue a proposta da Mentorei para a ${empresaNome}.\n\nFico à disposição para tirar dúvidas e ajustar o que for preciso.\n\nUm abraço,\n${primeiroNome(ctx.perfil.nome)}\nMentorei`;
      }
    }
    const wc = comWhats.find((x) => x.id === q('#w-cont').value) || null;
    if (!q('#w-texto').dataset.mexeu) {
      q('#w-texto').value = c.mensagem_whatsapp ? String(c.mensagem_whatsapp).replace(/\{contato\}/g, wc ? primeiroNome(wc.nome) : '')
        : modelo ? preencher(modelo.texto, o, wc, ctx)
        : `Olá${wc ? `, ${primeiroNome(wc.nome)}` : ''}! Segue a proposta da Mentorei para a ${empresaNome}. Qualquer dúvida, estou à disposição.
${primeiroNome(ctx.perfil.nome)} · Mentorei`;
    }
    const errados = outros().filter((e) => !EMAIL_OK.test(e));
    const total = marcados().length + outros().filter((e) => EMAIL_OK.test(e)).length;
    q('#e-quem').innerHTML = `${total ? `Vai para <b>${total} pessoa${total > 1 ? 's' : ''}</b>.` : '<span class="selo alerta">Marque alguém ou escreva um e-mail</span>'}${errados.length ? ` <span class="selo erro">E-mail com erro: ${errados.map(esc).join(', ')}</span>` : ''}`;
  };
  j.corpo.querySelectorAll('[data-ct]').forEach((b) => b.addEventListener('change', preencherMsg));
  q('#e-outros').addEventListener('input', preencherMsg);
  ['#e-assunto', '#e-texto'].forEach((s) => q(s).addEventListener('input', () => { mexeuNaMensagem = true; }));
  q('#w-texto').addEventListener('input', () => { q('#w-texto').dataset.mexeu = '1'; });
  q('#w-cont').addEventListener('input', () => { q('#w-outro-campo').hidden = !!q('#w-cont').value; preencherMsg(); });
  j.corpo.querySelectorAll('[name=canal]').forEach((r) => r.addEventListener('change', () => { const w = q('[name=canal]:checked').value === 'whatsapp'; q('#bloco-email').hidden = w; q('#bloco-whats').hidden = !w; }));
  preencherMsg();

  // arquivo escolhido aqui (proposta sem arquivo guardado): vai para "propostas/<oportunidade>/<proposta>/<arquivo>"
  const garantirArquivo = async () => {
    if (p.arquivo_storage) return;
    const arq = q('#e-arq') && q('#e-arq').files[0];
    if (!arq) throw new Error('Escolha o arquivo da proposta (PDF ou PowerPoint).');
    const ext = (arq.name.split('.').pop() || '').toLowerCase();
    if (!TIPO_ARQ[ext]) throw new Error('O arquivo precisa ser PDF ou PowerPoint (.pptx).');
    if (arq.size > 26214400) throw new Error('O arquivo passa de 25 MB. Salve uma versão menor (PDF) e tente de novo.');
    const caminho = `${o.id}/${p.id}/${Date.now()}-${nomeSeguro(arq.name)}`;
    const up = await sb.storage.from('propostas').upload(caminho, arq, { contentType: TIPO_ARQ[ext] });
    if (up.error) throw up.error;
    const { error } = await sb.from('propostas').update({ arquivo_storage: caminho, arquivo: arq.name }).eq('id', p.id);
    if (error) throw error;
    p.arquivo_storage = caminho; p.arquivo = arq.name;
  };

  q('#e-enviar').addEventListener('click', async () => {
    const b = q('#e-enviar');
    try {
      const errados = outros().filter((e) => !EMAIL_OK.test(e));
      if (errados.length) throw new Error(`Confira este e-mail: ${errados.join(', ')}`);
      const escolhidos = marcados();
      const ja = new Set(escolhidos.map((x) => x.email.toLowerCase()));
      const novos = outros().filter((e) => !ja.has(e) && ja.add(e));
      if (!escolhidos.length && !novos.length) throw new Error('Marque um contato ou escreva um e-mail.');
      const assunto = q('#e-assunto').value.trim(), texto = q('#e-texto').value.trim();
      if (!assunto || !texto) throw new Error('Preencha assunto e mensagem.');
      b.disabled = true; b.textContent = 'Enviando…';
      await garantirArquivo();
      // outros e-mails viram contatos da empresa (se marcado), com nome provisório
      const conhecidos = new Map(contatos.filter((x) => x.email).map((x) => [x.email.toLowerCase(), x]));
      const extras = [];
      for (const e of novos) {
        let ct = conhecidos.get(e) || null;
        if (!ct && q('#e-guardar').checked) {
          const r = await sb.from('contatos').insert({ empresa_id: empresaId, nome: nomeDoEmail(e), email: e, observacoes: `Adicionado no envio da proposta (versão ${p.versao}). Confirmar nome e cargo.` }).select('*').single();
          if (!r.error) ct = r.data;
        }
        extras.push(ct ? { email: e, nome: ct.nome, contato_id: ct.id, contato: ct } : { email: e, nome: '' });
      }
      const para = [...escolhidos.map((x) => ({ email: x.email.toLowerCase(), nome: x.nome, contato_id: x.id })), ...extras.map(({ contato, ...x }) => x)];
      const r = await api('/api/proposta-email', { proposta_id: p.id, para, assunto, texto, copia: q('#e-copia').checked });
      if (!r.ok) throw new Error(r.mensagem || 'Não consegui enviar.');
      const primeiro = escolhidos[0] || (extras.find((x) => x.contato) || {}).contato || null;
      await marcarEnviada(ctx, p, o, { canal: 'email', contato: primeiro, para, mensagem: `${assunto}\n\n${texto}`, registrado: r.registrado });
      avisar(`Proposta enviada para ${para.length} pessoa${para.length > 1 ? 's' : ''}${r.copia ? ' (com cópia para você)' : ''}.${reenvio ? '' : ' Retorno marcado para daqui a 4 dias.'}`);
      j.fechar(); recarregar();
    } catch (e) { avisar(explicarErro(e), true); b.disabled = false; b.textContent = '✉ Enviar a proposta'; }
  });
  q('#w-baixar').addEventListener('click', async () => {
    try { await garantirArquivo(); baixar(p); } catch (e) { avisar(explicarErro(e), true); }
  });
  q('#w-abrir').addEventListener('click', async () => {
    try {
      const wc = comWhats.find((x) => x.id === q('#w-cont').value) || null;
      const numero = wc ? wc.whatsapp : q('#w-outro').value.trim();
      if (limparFone(numero).length < 10) throw new Error('Escreva o WhatsApp com DDD.');
      const texto = q('#w-texto').value.trim(); if (!texto) throw new Error('Escreva a mensagem.');
      window.open(linkWhats(numero, texto), '_blank', 'noopener');
      await marcarEnviada(ctx, p, o, { canal: 'whatsapp', contato: wc, para: [{ nome: wc ? wc.nome : '', whatsapp: numero, contato_id: wc ? wc.id : null }], mensagem: texto });
      avisar(reenvio ? 'Envio registrado.' : 'Marcada como enviada. Retorno marcado para daqui a 4 dias.'); j.fechar(); recarregar();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}

function janelaEnviadaFora(ctx, p, o, recarregar) {
  sb.from('contatos').select('*').eq('empresa_id', o.empresa_id).eq('ativo', true).order('nome').then(({ data }) => {
    const contatos = data || [];
    const j = janela('Marcar como enviada', `<div class="grade" style="gap:10px"><p class="peq apagado">Para quando a proposta foi mandada por fora da plataforma (outro e-mail, pessoalmente…). O retorno entra na agenda para daqui a 4 dias.</p>
      <div class="campo"><label for="f-cont">Para quem</label><select id="f-cont"><option value="">—</option>${contatos.map((x) => `<option value="${x.id}"${x.id === o.contato_id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="f-obs">Como foi (opcional)</label><input type="text" id="f-obs" placeholder="Ex.: entregue na reunião de quinta"></div>
      <div class="linha"><button class="btn pri" type="button" id="f-ok">Marcar como enviada</button><button class="btn" type="button" data-fechar>Desistir</button></div></div>`, { largura: 520 });
    j.corpo.querySelector('#f-ok').addEventListener('click', async () => {
      const ct = contatos.find((x) => x.id === j.corpo.querySelector('#f-cont').value) || null;
      try {
        await marcarEnviada(ctx, p, o, { canal: 'outro', contato: ct, para: ct ? [{ nome: ct.nome, email: ct.email || null, contato_id: ct.id }] : [], mensagem: j.corpo.querySelector('#f-obs').value.trim() || null });
        avisar('Marcada como enviada.'); j.fechar(); recarregar();
      } catch (e) { avisar(explicarErro(e), true); }
    });
  });
}

// Registra o envio. Primeiro envio: marca a proposta como enviada, põe a oportunidade em "Proposta enviada" e agenda o retorno
// (4 dias, dia útil, 9h). Envio de novo: só o histórico. O e-mail pela plataforma já fica em proposta_envios pelo servidor;
// WhatsApp e "por fora" a tela grava (sem o script 38, fica só o histórico da oportunidade).
export async function marcarEnviada(ctx, p, o, { canal, contato, para = [], mensagem, registrado = false }) {
  const reenvio = p.status === 'enviada';
  const quem = para.map((x) => (x.nome && x.email ? `${x.nome} <${x.email}>` : x.nome || x.email || x.whatsapp)).filter(Boolean);
  const paraTexto = quem.length ? ` para ${quem.join(', ')}` : contato ? ` para ${contato.nome}` : '';
  if (!registrado && canal !== 'email') {
    const r = await sb.from('proposta_envios').insert({ proposta_id: p.id, oportunidade_id: o.id, canal, para, mensagem: mensagem || null, arquivo: p.arquivo || null });
    if (r.error && !faltaScript(r.error)) console.warn('Registro do envio:', r.error);
  }
  if (reenvio) {
    await sb.from('interacoes').insert({ oportunidade_id: o.id, contato_id: contato ? contato.id : null, tipo: 'proposta', texto: `Proposta enviada de novo (versão ${p.versao}) ${CANAL[canal] || ''}${paraTexto}` });
    return;
  }
  const prox = retornoEm4Dias();
  const { error } = await sb.from('propostas').update({ status: 'enviada', enviada_em: hojeISO(), enviada_por: ctx.perfil.id, enviada_para: contato ? contato.id : null, canal, mensagem }).eq('id', p.id);
  if (error) throw error;
  const etapaNova = ANTES_DA_PROPOSTA.includes(o.etapa) ? 'proposta' : o.etapa;
  const mud = { etapa: etapaNova, proximo_contato_em: prox, proximo_contato_por: o.responsavel_id || ctx.perfil.id, proximo_contato_obs: `Confirmar se recebeu a proposta (versão ${p.versao}) e tirar dúvidas` };
  if (etapaNova !== o.etapa) mud.chance = null;
  if (p.valor != null) mud.valor = p.valor;
  if (!o.contato_id && contato && contato.empresa_id === o.empresa_id) mud.contato_id = contato.id;
  const r = await sb.from('oportunidades').update(mud).eq('id', o.id);
  if (r.error) throw r.error;
  const linhas = [{ oportunidade_id: o.id, contato_id: contato ? contato.id : null, tipo: 'proposta', texto: `Proposta enviada (versão ${p.versao}) ${CANAL[canal] || ''}${paraTexto}${p.valor != null ? ` · ${dinheiro(p.valor)}` : ''}${p.arquivo ? `\nArquivo: ${p.arquivo}` : ''}` }];
  if (etapaNova !== o.etapa) linhas.push({ oportunidade_id: o.id, tipo: 'etapa', texto: `${o.etapa} → proposta · proposta enviada` });
  linhas.push({ oportunidade_id: o.id, tipo: 'sistema', texto: `Retorno marcado para ${dataHoraBR(prox)}: confirmar se recebeu a proposta.` });
  await sb.from('interacoes').insert(linhas);
  limparCache(); avisarGoogle();
}
