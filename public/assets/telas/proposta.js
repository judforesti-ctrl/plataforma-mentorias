// Proposta gerada pela IA (Vendas): cola o pedido → a IA escreve nos moldes do PowerPoint da Mentorei (em segundo plano)
// → revisão e edição → aprovação (Cintia) → envio do arquivo por e-mail (anexo) ou WhatsApp → marcada como enviada,
// o retorno entra sozinho na agenda para 4 dias depois. Só a administração (script 20).
import { sb, esc, dataBR, dataHoraBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, api, primeiroNome, faltaScript, limparCache, avisarGoogle } from './agenda-dados.js';
import { dinheiro, SERVICOS, retornoEm4Dias, linkWhats, limparFone, preencher, ANTES_DA_PROPOSTA } from './vendas.js';

const STATUS = { gerando: ['Gerando com a IA…', 'selo neutro'], rascunho: ['Rascunho · revisar e aprovar', 'selo alerta'], aprovada: ['Aprovada · pronta para enviar', 'selo'], enviada: ['Enviada', 'selo escuro'], erro: ['Deu erro', 'selo erro'] };
export const seloStatus = (p) => (p && p.status && STATUS[p.status] ? `<span class="${STATUS[p.status][1]}">${STATUS[p.status][0]}</span>` : '');
const CANAL = { email: 'por e-mail', whatsapp: 'pelo WhatsApp', outro: 'por outro meio' };
const AVISO_SCRIPT = 'Para gerar propostas com a IA, falta rodar o script 20-propostas-ia.sql no Supabase (SQL Editor → New query → colar → Run).';
const SEL = '*, enviada_para_contato:contatos!propostas_enviada_para_fkey(nome), oportunidade:oportunidades(*, empresa:empresas(id, nome, tipo, cidade, uf), responsavel:perfis!oportunidades_responsavel_id_fkey(id, nome))';

// ---------- 1. pedir a geração ----------
export function janelaGerar(ctx, o, quantas, aoCriar) {
  const html = `<form id="f-g" class="grade" style="gap:12px" novalidate>
    <p class="peq apagado">Cole o pedido pronto (briefing). A IA escreve a proposta nos moldes do PowerPoint da Mentorei: capa, o que entendemos da demanda, módulos, metodologia, organização, investimento e próximos passos. Depois você revisa, aprova e envia daqui mesmo.</p>
    <div class="campo"><label for="g-pedido">Pedido / briefing *</label><textarea id="g-pedido" style="min-height:260px" placeholder="Ex.: Proposta de workshop para a Cooperativa X, público: gerentes de carteira (20 pessoas). Objetivo: ... Dores: ... Formato: 1 dia presencial, 8 horas, 4 pilares: ... Valor: R$ ... Condições: ... Conduz: ... Datas: a definir."></textarea>
      <small>Quanto mais detalhes (público, objetivo, dores, formato, carga horária, valor, condições, quem conduz), mais pronta a proposta sai. O que faltar fica como "a definir".</small></div>
    <div class="linha"><button class="btn pri" type="submit">Gerar proposta (versão ${quantas + 1})</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela('Gerar proposta com a IA', html, { largura: 720 });
  j.corpo.querySelector('#f-g').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pedido = j.corpo.querySelector('#g-pedido').value.trim();
    if (pedido.length < 20) { avisar('Cole o pedido da proposta (pelo menos algumas linhas).', true); return; }
    const b = ev.currentTarget.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Enviando para a IA…';
    const { data, error } = await sb.from('propostas').insert({ oportunidade_id: o.id, versao: quantas + 1, status: 'gerando', pedido, valor: o.valor }).select('id').single();
    if (error) { avisar(faltaScript(error) ? AVISO_SCRIPT : explicarErro(error), true); b.disabled = false; b.textContent = 'Gerar proposta'; return; }
    const r = await api('/api/proposta-gerar', { proposta_id: data.id });
    if (!r.ok) { await sb.from('propostas').update({ status: 'erro', erro: r.mensagem || 'O servidor não aceitou o pedido.' }).eq('id', data.id); }
    await sb.from('interacoes').insert({ oportunidade_id: o.id, tipo: 'sistema', texto: `Proposta (versão ${quantas + 1}) pedida à IA.` });
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

  el.innerHTML = `
    <div class="cab"><div><a class="peq" href="#/vendas/oportunidade/${o.id}">← ${esc(o.titulo || 'Oportunidade')}</a><h1>Proposta · versão ${p.versao}</h1>
      <p class="sub"><a href="#/vendas/empresa/${o.empresa_id}"><b>${esc(empresa)}</b></a> · ${SERVICOS[o.servico] || o.servico || ''} · <b>${dinheiro(p.valor != null ? p.valor : o.valor)}</b>${p.validade ? ` · vale até ${dataBR(p.validade)}` : ''}</p></div>
      <div class="acoes">${seloStatus(p)}${p.arquivo_storage ? '<button class="btn" type="button" id="baixar">⬇ Baixar PowerPoint</button>' : ''}</div></div>
    <div id="corpo"></div>`;
  el.querySelector('#baixar')?.addEventListener('click', () => baixar(p));
  const corpo = el.querySelector('#corpo');

  if (status === 'gerando') {
    corpo.innerHTML = `<div class="cartao destaque"><h3>A IA está escrevendo a proposta…</h3><p class="mt">Costuma levar de 1 a 2 minutos. Esta página atualiza sozinha; pode continuar navegando e voltar depois.</p>
      <p class="peq mt" style="opacity:.8">Pedida em ${dataHoraBR(p.criado_em)}.</p></div>
      <div class="cartao mt"><h3>Pedido enviado</h3><p class="peq mt" style="white-space:pre-wrap">${esc(p.pedido || '')}</p></div>`;
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
    ${avisos.length && !bloqueada ? `<div class="aviso" style="margin-bottom:14px"><b>Alguns textos ficaram longos e podem não caber na página.</b> Encurte e clique em "Salvar e montar o arquivo de novo":<ul class="peq" style="margin:6px 0 0 18px">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    <div class="linha" style="margin-bottom:18px;gap:8px">
      ${status === 'rascunho' ? '<button class="btn pri" type="button" id="aprovar">✔ Aprovar proposta</button>' : ''}
      ${status === 'aprovada' ? '<button class="btn pri" type="button" id="enviar">✉ Enviar proposta</button>' : ''}
      ${status === 'rascunho' || status === 'aprovada' ? '<button class="btn" type="button" id="enviada-fora">Marcar como enviada (mandei por fora)</button>' : ''}
      ${p.arquivo_storage ? '<button class="btn escuro" type="button" id="baixar2">⬇ Baixar PowerPoint</button>' : ''}
      ${status === 'enviada' ? `<a class="btn" href="#/vendas/oportunidade/${o.id}">Voltar à oportunidade</a>` : ''}</div>
    <div class="grade g2" style="align-items:start;grid-template-columns:3fr 2fr">
      <div class="grade" style="gap:14px" id="editor"></div>
      <div class="grade" style="gap:14px">
        ${!bloqueada && c ? `<div class="cartao"><h3>Pedir ajustes à IA</h3><p class="peq apagado mt">Ela reescreve a proposta mantendo o que não foi pedido para mudar.</p>
          <div class="campo mt"><textarea id="ajustes" placeholder="Ex.: troque o módulo 3 por negociação; deixe o investimento em 2 parcelas; tom mais direto na capa"></textarea></div>
          <button class="btn mt" type="button" id="ajustar">Reescrever com a IA</button></div>` : ''}
        <div class="cartao"><h3>Pedido original</h3><details class="mt"><summary class="peq">Ver o pedido</summary><p class="peq mt" style="white-space:pre-wrap">${esc(p.pedido || '—')}</p></details>${p.ajustes ? `<p class="peq mt"><b>Último ajuste:</b> ${esc(p.ajustes)}</p>` : ''}</div>
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
  if (!c) { editor.innerHTML = '<div class="cartao"><p class="apagado">Sem conteúdo ainda.</p></div>'; return; }
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
const itens = (sec, lista) => (lista || []).map((it, i) => `<div class="grade g2" style="gap:8px">${campo(`Item ${i + 1} · título`, `${sec}.itens.${i}.titulo`, it.titulo)}${campo(`Item ${i + 1} · texto`, `${sec}.itens.${i}.texto`, it.texto, { area: true })}</div>`).join('');
const secaoHtml = (titulo, html) => `<div class="cartao"><details open><summary><b>${esc(titulo)}</b></summary><div class="grade mt" style="gap:8px">${html}</div></details></div>`;

function desenharEditor(ctx, editor, p, o, bloqueada, recarregar) {
  const c = JSON.parse(JSON.stringify(p.conteudo));
  const desenhar = () => {
    editor.innerHTML = `
      ${!bloqueada ? '<div class="aviso" style="margin:0">Revise o texto abaixo (ou peça ajustes à IA ao lado). Depois clique em <b>Salvar e montar o arquivo de novo</b>.</div>' : ''}
      ${secaoHtml('Capa', `${campo('Tipo (em maiúsculas)', 'capa.tipo', c.capa?.tipo)}${campo('Nome do programa', 'capa.nome', c.capa?.nome)}${campo('Subtítulo (até 2 linhas)', 'capa.subtitulo', c.capa?.subtitulo, { area: true })}${campo('Rodapé (empresa • público / carga)', 'capa.rodape', c.capa?.rodape, { area: true })}`)}
      ${secaoHtml('O que entendemos da sua demanda', `${campo('Título', 'demanda.titulo', c.demanda?.titulo)}${itens('demanda', c.demanda?.itens)}${campo('Frase de fechamento', 'demanda.frase', c.demanda?.frase)}`)}
      ${secaoHtml('Quem desenvolve · sócias', `${campo('Título da página institucional', 'quem_titulo', c.quem_titulo)}${campo('Linha abaixo das sócias', 'socias_rodape', c.socias_rodape)}`)}
      ${secaoHtml('Expertise', `${campo('Título', 'expertise.titulo', c.expertise?.titulo)}${itens('expertise', c.expertise?.itens)}`)}
      ${secaoHtml('Visão geral dos módulos', `${campo('Título', 'visao.titulo', c.visao?.titulo)}${campo('Rodapé', 'visao.rodape', c.visao?.rodape)}`)}
      ${(c.modulos || []).map((m, i) => secaoHtml(`Módulo ${String(i + 1).padStart(2, '0')} · ${m.titulo || ''}`, `
        <div class="grade g2" style="gap:8px">${campo('Título', `modulos.${i}.titulo`, m.titulo)}${campo('Título curto (página-resumo)', `modulos.${i}.titulo_curto`, m.titulo_curto)}</div>
        <div class="grade g2" style="gap:8px">${campo('Subtítulo', `modulos.${i}.subtitulo`, m.subtitulo)}${campo('Período / duração / condução', `modulos.${i}.quando`, m.quando, { dica: 'Ex.: Manhã  •  2 horas' })}</div>
        ${campo('Objetivo', `modulos.${i}.objetivo`, m.objetivo, { area: true })}${campo('Entrega prática', `modulos.${i}.entrega`, m.entrega, { area: true })}
        ${campo('Tópicos (um por linha, de 3 a 5)', `modulos.${i}.topicos`, (m.topicos || []).join('\n'), { area: true })}
        ${!bloqueada ? `<div class="linha"><button class="btn peq" type="button" data-mod="remover" data-i="${i}">Remover módulo</button>${i > 0 ? `<button class="btn peq" type="button" data-mod="subir" data-i="${i}">↑ Subir</button>` : ''}</div>` : ''}`)).join('')}
      ${!bloqueada ? '<div><button class="btn" type="button" id="mais-modulo">+ Módulo</button></div>' : ''}
      ${(c.destaques || []).map((d, i) => secaoHtml(`Página extra · ${d.titulo || ''}`, `
        <div class="grade g2" style="gap:8px">${campo('Título', `destaques.${i}.titulo`, d.titulo)}${campo('Entra depois do módulo nº', `destaques.${i}.apos_modulo`, d.apos_modulo)}</div>${itens(`destaques.${i}`, d.itens)}
        ${!bloqueada ? `<div><button class="btn peq" type="button" data-dest="remover" data-i="${i}">Remover página extra</button></div>` : ''}`)).join('')}
      ${secaoHtml('Metodologia', `${campo('Título', 'metodologia.titulo', c.metodologia?.titulo)}${itens('metodologia', c.metodologia?.itens)}`)}
      ${secaoHtml('Personalização', `${campo('Título', 'personalizacao.titulo', c.personalizacao?.titulo)}${itens('personalizacao', c.personalizacao?.itens)}${campo('Frase de fechamento', 'personalizacao.frase', c.personalizacao?.frase)}`)}
      ${secaoHtml('Organização da jornada', `${campo('Título', 'organizacao.titulo', c.organizacao?.titulo)}${campo('Subtítulo', 'organizacao.subtitulo', c.organizacao?.subtitulo)}
        <div class="grade" style="grid-template-columns:1fr 1fr 1fr 2fr;gap:6px">${[0, 1, 2, 3].map((k) => campo(`Coluna ${k + 1}`, `organizacao.colunas.${k}`, (c.organizacao?.colunas || [])[k])).join('')}</div>
        ${(c.organizacao?.linhas || []).map((l, i) => `<div class="grade" style="grid-template-columns:1fr 1fr 1fr 2fr;gap:6px">${['c1', 'c2', 'c3', 'c4'].map((k) => campo(`Linha ${i + 1}`, `organizacao.linhas.${i}.${k}`, l[k])).join('')}</div>`).join('')}
        ${!bloqueada ? '<div class="linha"><button class="btn peq" type="button" id="mais-linha">+ Linha</button><button class="btn peq" type="button" id="menos-linha">− Última linha</button></div>' : ''}
        ${campo('Rodapé', 'organizacao.rodape', c.organizacao?.rodape)}`)}
      ${secaoHtml('Investimento', `${campo('Título', 'investimento.titulo', c.investimento?.titulo)}
        ${(c.investimento?.opcoes || []).map((op, i) => `<div class="grade" style="grid-template-columns:1fr 1fr 2fr;gap:6px">${campo(`Caixa ${i + 1} · nome`, `investimento.opcoes.${i}.nome`, op.nome)}${campo('Valor', `investimento.opcoes.${i}.valor`, op.valor)}${campo('Descrição', `investimento.opcoes.${i}.descricao`, op.descricao)}</div>`).join('')}
        ${campo('Incluso', 'investimento.incluso', c.investimento?.incluso, { area: true })}${campo('Não incluso e condições', 'investimento.nao_incluso', c.investimento?.nao_incluso, { area: true })}`)}
      ${secaoHtml('Próximos passos', `${campo('Título', 'proximos.titulo', c.proximos?.titulo)}${itens('proximos', c.proximos?.itens)}${campo('Rodapé', 'proximos.rodape', c.proximos?.rodape)}`)}
      ${secaoHtml('Frase final e mensagens', `${campo('Frase final', 'frase_final', c.frase_final)}${campo('E-mail · assunto', 'mensagem_email.assunto', c.mensagem_email?.assunto)}${campo('E-mail · texto', 'mensagem_email.texto', c.mensagem_email?.texto, { area: true })}${campo('WhatsApp', 'mensagem_whatsapp', c.mensagem_whatsapp, { area: true })}${campo('Resumo para o histórico', 'resumo', c.resumo, { area: true })}`)}
      ${!bloqueada ? '<div class="linha"><button class="btn pri" type="button" id="salvar">💾 Salvar e montar o arquivo de novo</button><span class="peq apagado">Leva alguns segundos.</span></div>' : ''}`;
    editor.querySelectorAll('textarea').forEach((t) => { t.style.minHeight = '0'; t.rows = Math.max(2, Math.min(8, String(t.value).split('\n').length + 1)); });
    if (bloqueada) editor.querySelectorAll('input, textarea').forEach((x) => { x.disabled = true; });
  };
  // lê os campos da tela para dentro de c (caminhos "a.b.0.c"; tópicos viram lista)
  const ler = () => {
    editor.querySelectorAll('[data-c]').forEach((x) => {
      const partes = x.dataset.c.split('.'); let alvo = c;
      for (let i = 0; i < partes.length - 1; i += 1) { const k = partes[i]; if (alvo[k] == null) alvo[k] = /^\d+$/.test(partes[i + 1]) ? [] : {}; alvo = alvo[k]; }
      const ult = partes[partes.length - 1];
      let v = x.value;
      if (ult === 'topicos') v = v.split('\n').map((t) => t.trim()).filter(Boolean);
      else if (ult === 'apos_modulo') v = Number(v) || 1;
      alvo[ult] = v;
    });
  };
  editor.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'salvar') {
      ler(); b.disabled = true; b.textContent = 'Salvando e montando…';
      const r = await api('/api/proposta-arquivo', { proposta_id: p.id, conteudo: c });
      if (!r.ok) { avisar(r.mensagem || 'Não consegui salvar.', true); b.disabled = false; b.textContent = '💾 Salvar e montar o arquivo de novo'; return; }
      avisar(r.avisos && r.avisos.length ? `Salvo. ${r.avisos.length} texto(s) ainda longo(s).` : 'Salvo e arquivo montado.'); recarregar(); return;
    }
    ler();
    if (b.id === 'mais-modulo') c.modulos = [...(c.modulos || []), { titulo: 'Novo módulo', titulo_curto: 'Novo módulo', subtitulo: '', quando: 'Manhã  •  2 horas', objetivo: '', entrega: '', topicos: [] }];
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
