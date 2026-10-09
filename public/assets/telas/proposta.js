// Proposta gerada pela IA (Vendas): escolhe o modelo (claro ou escuro), escreve o conteúdo, digita os preços numa caixa
// separada (por módulo, mentoria individual, turma, grupo, pessoa, valor fechado ou outro) e, se quiser, envia o logo do
// cliente → a IA escreve nos moldes do PowerPoint da Mentorei (em segundo plano; números da Mentorei, sócias e contatos
// são fixos no modelo) → revisão e edição → aprovação (Cintia) → envio do arquivo por e-mail (anexo) ou WhatsApp →
// marcada como enviada, o retorno entra sozinho na agenda para 4 dias depois. Só a administração (script 20).
import { sb, esc, dataBR, dataHoraBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, api, primeiroNome, faltaScript, limparCache, avisarGoogle } from './agenda-dados.js';
import { dinheiro, SERVICOS, retornoEm4Dias, linkWhats, limparFone, preencher, ANTES_DA_PROPOSTA } from './vendas.js';
import {
  MODELOS, MODELO_PADRAO, COBRANCA_ROTULO, descreverPreco, resumoPreco, precosValidos, valorDaProposta, numero, ICONES,
  normalizarConteudo, topicoDe,
} from '../proposta-comum.js';

const STATUS = { gerando: ['Gerando com a IA…', 'selo neutro'], rascunho: ['Rascunho · revisar e aprovar', 'selo alerta'], aprovada: ['Aprovada · pronta para enviar', 'selo'], enviada: ['Enviada', 'selo escuro'], erro: ['Deu erro', 'selo erro'] };
export const seloStatus = (p) => (p && p.status && STATUS[p.status] ? `<span class="${STATUS[p.status][1]}">${STATUS[p.status][0]}</span>` : '');
const CANAL = { email: 'por e-mail', whatsapp: 'pelo WhatsApp', outro: 'por outro meio' };
const AVISO_SCRIPT = 'Para gerar propostas com a IA, falta rodar o script 20-propostas-ia.sql no Supabase (SQL Editor → New query → colar → Run).';
const SEL = '*, enviada_para_contato:contatos!propostas_enviada_para_fkey(nome), oportunidade:oportunidades(*, empresa:empresas(id, nome, tipo, cidade, uf), responsavel:perfis!oportunidades_responsavel_id_fkey(id, nome))';
const temTexto = (c) => !!(c && c.capa && (c.modulos || c.demanda));
const validadeDe = (dias, base) => { const n = Number(dias) || 0; if (!n) return null; const d = new Date(base || Date.now()); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- peças da tela: modelo, preços e logo ----------
const escolhaModelo = (atual, bloqueado) => `<div class="modelos-prop">${Object.entries(MODELOS).map(([k, nome]) => `
  <label class="modelo-prop"><input type="radio" name="modelo" value="${k}"${k === atual ? ' checked' : ''}${bloqueado ? ' disabled' : ''}>
    <img src="/assets/propostas/capa-${k}.jpg" alt="Capa no modelo ${nome.toLowerCase()}"><span>Modelo ${nome.toLowerCase()}</span></label>`).join('')}</div>`;
const modeloEscolhido = (raiz) => (raiz.querySelector('input[name=modelo]:checked') || {}).value || MODELO_PADRAO;

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
    <div class="campo"><label>1. Modelo da apresentação</label>${escolhaModelo(MODELO_PADRAO)}</div>
    <div class="campo"><label for="g-pedido">2. Conteúdo da proposta *</label><textarea id="g-pedido" style="min-height:220px" placeholder="Ex.: Mentoria em grupo para a Cooperativa X. Público: coordenadores de agência (25 pessoas). Objetivo: ... Dores: ... Formato: 4 encontros online de 4 horas, quinzenais. Temas: ... Conduz: Claudia. Datas: a definir."></textarea>
      <small>Quanto mais detalhes (público, objetivo, dores, formato, carga horária, temas, quem conduz, datas), mais pronta a proposta sai. O que faltar fica como "a definir".</small></div>
    <div class="campo"><label>3. Investimento</label><div id="g-precos"></div></div>
    <div class="campo"><label>4. Logo do cliente (opcional)</label><div id="g-logo"></div></div>
    <div class="linha"><button class="btn pri" type="submit">✨ Gerar proposta (versão ${quantas + 1})</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela('Gerar proposta com a IA', html, { largura: 820 });
  const precos = blocoPrecos(j.corpo.querySelector('#g-precos'), { precos: [], validade_dias: 30 });
  const logo = blocoLogo(j.corpo.querySelector('#g-logo'), o.empresa_id, null, { anterior });
  j.corpo.querySelector('#f-g').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pedido = j.corpo.querySelector('#g-pedido').value.trim();
    if (pedido.length < 20) { avisar('Escreva o conteúdo da proposta (pelo menos algumas linhas).', true); return; }
    const inv = precos.ler();
    const conteudo = { modelo: modeloEscolhido(j.corpo), precos: inv.precos, pagamento: inv.pagamento, validade_dias: inv.validade_dias, logo: logo.ler() };
    const valor = valorDaProposta(inv.precos);
    const b = ev.currentTarget.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Enviando para a IA…';
    const { data, error } = await sb.from('propostas').insert({ oportunidade_id: o.id, versao: quantas + 1, status: 'gerando', pedido, conteudo, valor: valor != null ? valor : o.valor, validade: validadeDe(inv.validade_dias) }).select('id').single();
    if (error) { avisar(faltaScript(error) ? AVISO_SCRIPT : explicarErro(error), true); b.disabled = false; b.textContent = '✨ Gerar proposta'; return; }
    const r = await api('/api/proposta-gerar', { proposta_id: data.id });
    if (!r.ok) { await sb.from('propostas').update({ status: 'erro', erro: r.mensagem || 'O servidor não aceitou o pedido.' }).eq('id', data.id); }
    await sb.from('interacoes').insert({ oportunidade_id: o.id, tipo: 'sistema', texto: `Proposta (versão ${quantas + 1}) pedida à IA · modelo ${MODELOS[conteudo.modelo].toLowerCase()}${inv.precos.length ? ` · ${inv.precos.map(resumoPreco).join(' | ')}` : ''}.` });
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
  const precosTexto = c && precosValidos(c.precos).length ? precosValidos(c.precos).map(resumoPreco).join(' · ') : '';

  el.innerHTML = `
    <div class="cab"><div><a class="peq" href="#/vendas/oportunidade/${o.id}">← ${esc(o.titulo || 'Oportunidade')}</a><h1>Proposta · versão ${p.versao}</h1>
      <p class="sub"><a href="#/vendas/empresa/${o.empresa_id}"><b>${esc(empresa)}</b></a> · ${SERVICOS[o.servico] || o.servico || ''} · <b>${dinheiro(p.valor != null ? p.valor : o.valor)}</b>${p.validade ? ` · vale até ${dataBR(p.validade)}` : ''}${c && MODELOS[c.modelo] ? ` · modelo ${MODELOS[c.modelo].toLowerCase()}` : ''}</p></div>
      <div class="acoes">${seloStatus(p)}${p.arquivo_storage ? '<button class="btn" type="button" id="baixar">⬇ Baixar PowerPoint</button>' : ''}</div></div>
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
  corpo.innerHTML = `
    ${status === 'erro' ? `<div class="aviso erro" style="margin-bottom:14px"><b>Não deu certo:</b> ${esc(p.erro || 'erro desconhecido')} <button class="btn peq" type="button" id="de-novo">Tentar de novo</button></div>` : ''}
    ${status !== 'erro' && p.erro ? `<div class="aviso erro" style="margin-bottom:14px">${esc(p.erro)} <button class="btn peq" type="button" id="montar-de-novo">Montar o arquivo</button></div>` : ''}
    ${status === 'enviada' ? `<div class="aviso ok" style="margin-bottom:14px">Enviada em ${dataBR(p.enviada_em)} ${CANAL[p.canal] || ''}${p.enviada_para_contato && p.enviada_para_contato.nome ? ` para ${esc(p.enviada_para_contato.nome)}` : ''}. ${o.proximo_contato_em ? `Retorno marcado para <b>${dataHoraBR(o.proximo_contato_em)}</b>.` : ''}</div>` : ''}
    ${status === 'aprovada' ? `<div class="aviso ok" style="margin-bottom:14px">Aprovada em ${dataHoraBR(p.aprovada_em)}. Agora é só enviar.</div>` : ''}
    ${avisos.length && !bloqueada ? `<div class="aviso" style="margin-bottom:14px"><b>Alguns textos ficaram grandes para o espaço da página</b> (a letra já foi diminuída um pouco). Encurte e clique em "Salvar e montar o arquivo de novo":<ul class="peq" style="margin:6px 0 0 18px">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    <div class="linha" style="margin-bottom:18px;gap:8px">
      ${status === 'rascunho' ? '<button class="btn pri" type="button" id="aprovar">✔ Aprovar proposta</button>' : ''}
      ${status === 'aprovada' ? '<button class="btn pri" type="button" id="enviar">✉ Enviar proposta</button>' : ''}
      ${status === 'rascunho' || status === 'aprovada' ? '<button class="btn" type="button" id="enviada-fora">Marcar como enviada (mandei por fora)</button>' : ''}
      ${p.arquivo_storage ? '<button class="btn escuro" type="button" id="baixar2">⬇ Baixar PowerPoint</button>' : ''}
      ${status === 'enviada' ? `<a class="btn" href="#/vendas/oportunidade/${o.id}">Voltar à oportunidade</a>` : ''}</div>
    <div class="grade g2" style="align-items:start;grid-template-columns:3fr 2fr">
      <div class="grade" style="gap:14px" id="editor"></div>
      <div class="grade" style="gap:14px">
        ${!bloqueada && temTexto(c) ? `<div class="cartao"><h3>Pedir ajustes à IA</h3><p class="peq apagado mt">Ela reescreve o texto mantendo o que não foi pedido para mudar. Preço, modelo e logo você muda na caixa "Modelo, investimento e logo".</p>
          <div class="campo mt"><textarea id="ajustes" placeholder="Ex.: troque o módulo 3 por negociação; tom mais direto na capa; acrescente uma página sobre os produtos da cooperativa"></textarea></div>
          <button class="btn mt" type="button" id="ajustar">Reescrever com a IA</button></div>` : ''}
        <div class="cartao"><h3>Conteúdo enviado</h3><details class="mt"><summary class="peq">Ver o conteúdo</summary><p class="peq mt" style="white-space:pre-wrap">${esc(p.pedido || '—')}</p></details>${p.ajustes ? `<p class="peq mt"><b>Último ajuste:</b> ${esc(p.ajustes)}</p>` : ''}</div>
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
  corpo.querySelector('#enviar')?.addEventListener('click', () => janelaEnviar(ctx, p, o, recarregar));
  corpo.querySelector('#enviada-fora')?.addEventListener('click', () => janelaEnviadaFora(ctx, p, o, recarregar));

  // editor do conteúdo
  const editor = corpo.querySelector('#editor');
  if (!temTexto(c)) { editor.innerHTML = '<div class="cartao"><p class="apagado">Sem conteúdo ainda.</p></div>'; return; }
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
  if (!MODELOS[c.modelo]) c.modelo = MODELO_PADRAO;
  let precos = null, logo = null;
  const desenhar = () => {
    editor.innerHTML = `
      ${!bloqueada ? '<div class="aviso" style="margin:0">Revise o texto abaixo (ou peça ajustes à IA ao lado). Depois clique em <b>Salvar e montar o arquivo de novo</b>.</div>' : ''}
      ${secaoHtml('Modelo, investimento e logo', `<div class="campo"><label>Modelo da apresentação</label>${escolhaModelo(c.modelo, bloqueada)}</div>
        <div class="campo"><label>Investimento</label><div id="ed-precos"></div></div>
        <div class="campo"><label>Logo do cliente</label><div id="ed-logo"></div></div>`)}
      ${secaoHtml('Capa', `${campo('Tipo', 'capa.tipo', c.capa?.tipo, { dica: 'Ex.: Proposta de mentoria em grupo (sai em maiúsculas)' })}${campo('Nome do programa', 'capa.nome', c.capa?.nome)}
        ${campo('Frase principal', 'capa.subtitulo1', c.capa?.subtitulo1)}${campo('Segunda linha', 'capa.subtitulo2', c.capa?.subtitulo2)}
        ${campo('Cliente  •  público', 'capa.linha1', c.capa?.linha1)}${campo('Carga horária  •  formato', 'capa.linha2', c.capa?.linha2)}`)}
      ${secaoHtml('Nomes usados nas páginas', `<div class="grade g2" style="gap:8px">${campo('Etiqueta das páginas', 'secao', c.secao, { dica: 'Ex.: O WORKSHOP, A MENTORIA' })}${campo('Cada parte se chama', 'rotulo_modulo', c.rotulo_modulo, { dica: 'Ex.: PILAR, MÓDULO, ENCONTRO' })}</div>`, false)}
      ${secaoHtml('O que entendemos da sua demanda', `${itens('demanda', c.demanda?.itens)}${campo('Frase de fechamento', 'demanda.frase', c.demanda?.frase)}`)}
      ${secaoHtml('Quem desenvolve · sócias', `${tituloDuplo('Título', 'quem_titulo', c.quem_titulo)}${campo('Linha abaixo das sócias', 'socias_rodape', c.socias_rodape)}
        <p class="peq apagado">Os números da Mentorei e os textos das sócias são fixos no modelo.</p>`)}
      ${secaoHtml('Expertise', `${tituloDuplo('Título', 'expertise.titulo', c.expertise?.titulo)}${itens('expertise', c.expertise?.itens, { icone: true })}`)}
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
      ${secaoHtml('Investimento · textos', `<p class="peq apagado">Os valores vêm da caixa "Modelo, investimento e logo" lá em cima.</p>
        <div class="grade g2" style="gap:8px">${campo('Nome do que está sendo vendido', 'investimento.nome_oferta', c.investimento?.nome_oferta, { dica: 'Usado quando a opção de preço não tem nome' })}${campo('Descrição (quando não há valor)', 'investimento.descricao_oferta', c.investimento?.descricao_oferta)}</div>
        <div class="grade" style="grid-template-columns:1fr 1fr 2fr;gap:6px">${campo('Caixa da direita · título', 'investimento.escopo.rotulo', c.investimento?.escopo?.rotulo)}${campo('destaque', 'investimento.escopo.destaque', c.investimento?.escopo?.destaque)}${campo('texto', 'investimento.escopo.texto', c.investimento?.escopo?.texto, { area: true })}</div>
        <p class="peq apagado">A caixa da direita só aparece quando há um preço só.</p>
        ${campo('Incluso', 'investimento.incluso', c.investimento?.incluso, { area: true })}${campo('Não incluso', 'investimento.nao_incluso', c.investimento?.nao_incluso)}`, false)}
      ${secaoHtml('Próximos passos', itens('proximos', c.proximos?.itens), false)}
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
    c.modelo = modeloEscolhido(editor);
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
async function janelaEnviar(ctx, p, o, recarregar, aoFechar) {
  const empresaId = o.empresa_id;
  const [cs, todos, ms] = await Promise.all([
    sb.from('contatos').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    sb.from('contatos').select('id, nome, cargo, email, whatsapp, empresa_id, empresa:empresas(nome)').eq('ativo', true).order('nome'),
    sb.from('modelos_mensagem').select('*').eq('canal', 'email').order('ordem'),
  ]);
  const contatos = cs.data || [];
  const lista = todos.data || [];
  const c = p.conteudo || {};
  const modelo = (ms.data || []).find((m) => /arquivo/i.test(m.nome)) || (ms.data || []).find((m) => m.etapa === 'proposta');
  const oComEmpresa = { ...o, empresa: o.empresa, responsavel: o.responsavel };
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let escolhido = contatos.find((x) => x.id === o.contato_id) || contatos[0] || null;

  const html = `<div class="grade" style="gap:12px">
    <div class="cartao" style="padding:12px"><b>Para quem</b>
      <div class="grade g2 mt" style="gap:8px">
        <div class="campo"><label for="e-cont">Contato da ${esc((o.empresa && o.empresa.nome) || 'empresa')}</label><select id="e-cont">${contatos.map((x) => `<option value="${x.id}"${escolhido && x.id === escolhido.id ? ' selected' : ''}>${esc(x.nome)}${x.cargo ? ` · ${esc(x.cargo)}` : ''}</option>`).join('')}<option value="">Outra pessoa…</option></select></div>
        <div class="campo"><label for="e-busca">Procurar na lista de clientes</label><input type="search" id="e-busca" placeholder="Nome ou empresa" autocomplete="off"><div id="e-res" class="lista" style="max-height:160px;overflow:auto"></div></div></div>
      <div id="e-novo" class="grade" style="grid-template-columns:2fr 2fr 1.5fr;gap:8px" hidden>
        <div class="campo"><label>Nome</label><input type="text" id="n-nome"></div><div class="campo"><label>E-mail</label><input type="email" id="n-email"></div><div class="campo"><label>WhatsApp</label><input type="tel" id="n-whats"></div></div>
      <p class="peq mt" id="e-quem"></p></div>
    <div class="linha" style="gap:14px"><label class="check"><input type="radio" name="canal" value="email" checked><span>✉ E-mail (o PowerPoint vai em anexo)</span></label><label class="check"><input type="radio" name="canal" value="whatsapp"><span>💬 WhatsApp (abre com a mensagem; você anexa o arquivo)</span></label></div>
    <div id="bloco-email" class="grade" style="gap:8px">
      <div class="campo"><label for="e-assunto">Assunto</label><input type="text" id="e-assunto" maxlength="200"></div>
      <div class="campo"><label for="e-texto">Mensagem</label><textarea id="e-texto" style="min-height:190px"></textarea><small>Sai de contato@mentorei.com.br com o arquivo ${esc(p.arquivo || '.pptx')} em anexo.</small></div>
      <div class="linha"><button class="btn pri" type="button" id="e-enviar">Enviar e-mail com a proposta</button><button class="btn" type="button" data-fechar>Depois</button></div></div>
    <div id="bloco-whats" class="grade" style="gap:8px" hidden>
      <div class="campo"><label for="w-texto">Mensagem</label><textarea id="w-texto" style="min-height:140px"></textarea></div>
      <div class="linha"><button class="btn" type="button" id="w-baixar">1. Baixar o arquivo</button><button class="btn pri" type="button" id="w-abrir">2. Abrir o WhatsApp e marcar como enviada</button><button class="btn" type="button" data-fechar>Depois</button></div>
      <small>No WhatsApp, anexe o arquivo baixado junto com a mensagem.</small></div>
    <p class="peq apagado">Ao enviar, a proposta fica marcada como enviada e o retorno entra na agenda para daqui a 4 dias (dia útil).</p></div>`;
  const j = janela(`Enviar a proposta · versão ${p.versao}`, html, { largura: 760, aoFechar });
  const q = (s) => j.corpo.querySelector(s);
  const preencherMsg = () => {
    const ct = escolhido || { nome: q('#n-nome').value };
    if (c.mensagem_email) { q('#e-assunto').value = c.mensagem_email.assunto || ''; q('#e-texto').value = String(c.mensagem_email.texto || '').replace(/\{contato\}/g, primeiroNome(ct.nome)); }
    else if (modelo) { q('#e-assunto').value = preencher(modelo.assunto, oComEmpresa, ct, ctx); q('#e-texto').value = preencher(modelo.texto, oComEmpresa, ct, ctx); }
    q('#w-texto').value = c.mensagem_whatsapp ? String(c.mensagem_whatsapp).replace(/\{contato\}/g, primeiroNome(ct.nome)) : (modelo ? preencher(modelo.texto, oComEmpresa, ct, ctx) : '');
    q('#e-quem').innerHTML = escolhido ? `Vai para <b>${esc(escolhido.nome)}</b>${escolhido.empresa && escolhido.empresa.nome ? ` (${esc(escolhido.empresa.nome)})` : ''} · ${[escolhido.email, escolhido.whatsapp].filter(Boolean).map(esc).join(' · ') || '<span class="selo erro">sem e-mail nem WhatsApp</span>'}` : 'Preencha os dados da pessoa.';
  };
  q('#e-cont').addEventListener('input', () => { const v = q('#e-cont').value; escolhido = contatos.find((x) => x.id === v) || null; q('#e-novo').hidden = !!escolhido; preencherMsg(); });
  q('#e-busca').addEventListener('input', () => {
    const t = norm(q('#e-busca').value.trim());
    const r = t.length < 2 ? [] : lista.filter((x) => norm(`${x.nome} ${x.cargo || ''} ${x.empresa ? x.empresa.nome : ''}`).includes(t)).slice(0, 12);
    q('#e-res').innerHTML = r.map((x) => `<button type="button" class="btn peq" style="display:block;width:100%;text-align:left;margin:3px 0" data-id="${x.id}"><b>${esc(x.nome)}</b>${x.cargo ? ` · ${esc(x.cargo)}` : ''} · ${esc(x.empresa ? x.empresa.nome : '')}<br><span class="peq apagado">${[x.email, x.whatsapp].filter(Boolean).map(esc).join(' · ') || 'sem e-mail nem WhatsApp'}</span></button>`).join('') || (t.length >= 2 ? '<p class="peq apagado">Ninguém com esse nome.</p>' : '');
  });
  q('#e-res').addEventListener('click', (ev) => { const b = ev.target.closest('[data-id]'); if (!b) return; escolhido = lista.find((x) => x.id === b.dataset.id) || null; q('#e-novo').hidden = true; q('#e-cont').value = contatos.some((x) => x.id === escolhido.id) ? escolhido.id : ''; q('#e-res').innerHTML = ''; q('#e-busca').value = ''; preencherMsg(); });
  j.corpo.querySelectorAll('[name=canal]').forEach((r) => r.addEventListener('change', () => { const w = q('[name=canal]:checked').value === 'whatsapp'; q('#bloco-email').hidden = w; q('#bloco-whats').hidden = !w; }));
  if (!escolhido) { q('#e-novo').hidden = false; }
  preencherMsg();

  // cria o contato novo na empresa, se for o caso
  const garantirContato = async (precisa) => {
    if (escolhido) return escolhido;
    const nome = q('#n-nome').value.trim(), email = q('#n-email').value.trim().toLowerCase(), whats = q('#n-whats').value.trim();
    if (!nome) throw new Error('Escreva o nome da pessoa.');
    if (precisa === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Escreva um e-mail válido.');
    if (precisa === 'whatsapp' && limparFone(whats).length < 10) throw new Error('Escreva o WhatsApp com DDD.');
    const { data, error } = await sb.from('contatos').insert({ empresa_id: empresaId, nome, email: email || null, whatsapp: whats || null }).select('*').single();
    if (error) throw error;
    escolhido = data; return data;
  };
  q('#e-enviar').addEventListener('click', async () => {
    const b = q('#e-enviar');
    try {
      const ct = await garantirContato('email');
      if (!ct.email) throw new Error(`${ct.nome} não tem e-mail cadastrado. Edite o contato ou escolha WhatsApp.`);
      const assunto = q('#e-assunto').value.trim(), texto = q('#e-texto').value.trim();
      if (!assunto || !texto) throw new Error('Preencha assunto e mensagem.');
      b.disabled = true; b.textContent = 'Enviando…';
      const r = await api('/api/proposta-email', { proposta_id: p.id, para: ct.email, nome: ct.nome, assunto, texto });
      if (!r.ok) throw new Error(r.mensagem || 'Não consegui enviar.');
      await marcarEnviada(ctx, p, o, { canal: 'email', contato: ct, mensagem: `${assunto}\n\n${texto}` });
      avisar(`Proposta enviada para ${ct.nome}. Retorno marcado para daqui a 4 dias.`); j.fechar(); recarregar();
    } catch (e) { avisar(explicarErro(e), true); b.disabled = false; b.textContent = 'Enviar e-mail com a proposta'; }
  });
  q('#w-baixar').addEventListener('click', () => baixar(p));
  q('#w-abrir').addEventListener('click', async () => {
    try {
      const ct = await garantirContato('whatsapp');
      if (limparFone(ct.whatsapp).length < 10) throw new Error(`${ct.nome} não tem WhatsApp cadastrado.`);
      const texto = q('#w-texto').value.trim(); if (!texto) throw new Error('Escreva a mensagem.');
      window.open(linkWhats(ct.whatsapp, texto), '_blank', 'noopener');
      await marcarEnviada(ctx, p, o, { canal: 'whatsapp', contato: ct, mensagem: texto });
      avisar('Marcada como enviada. Retorno marcado para daqui a 4 dias.'); j.fechar(); recarregar();
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
      try { await marcarEnviada(ctx, p, o, { canal: 'outro', contato: ct, mensagem: j.corpo.querySelector('#f-obs').value.trim() || null }); avisar('Marcada como enviada.'); j.fechar(); recarregar(); }
      catch (e) { avisar(explicarErro(e), true); }
    });
  });
}

// Marca a proposta como enviada, põe a oportunidade em "Proposta enviada" e agenda o retorno (4 dias, dia útil, 9h).
export async function marcarEnviada(ctx, p, o, { canal, contato, mensagem }) {
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
  const linhas = [{ oportunidade_id: o.id, contato_id: contato ? contato.id : null, tipo: 'proposta', texto: `Proposta enviada (versão ${p.versao}) ${CANAL[canal] || ''}${contato ? ` para ${contato.nome}` : ''}${p.valor != null ? ` · ${dinheiro(p.valor)}` : ''}${p.arquivo ? `\nArquivo: ${p.arquivo}` : ''}` }];
  if (etapaNova !== o.etapa) linhas.push({ oportunidade_id: o.id, tipo: 'etapa', texto: `${o.etapa} → proposta · proposta enviada` });
  linhas.push({ oportunidade_id: o.id, tipo: 'sistema', texto: `Retorno marcado para ${dataHoraBR(prox)}: confirmar se recebeu a proposta.` });
  await sb.from('interacoes').insert(linhas);
  limparCache(); avisarGoogle();
}
