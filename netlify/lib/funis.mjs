// Funis de e-mail (script 34): envio da sequência, leitura dos eventos do Brevo e regras automáticas.
// Duas contas do Brevo: a "principal" (BREVO_API_KEY, a mesma dos convites) para clientes e a "marketing"
// (BREVO_API_KEY_MARKETING, conta separada) para listas frias — se alguém reclamar de spam, os e-mails da plataforma ficam protegidos.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supa, env, SITE } from './google.mjs';
import { montarEmail, proximoHorario, depoisDeDias, atingiuPassagem, atingiuLimpeza, EMAIL_VALIDO, SEGUNDOS_CLIQUE_AUTOMATICO, EM_ANDAMENTO } from '../../public/assets/funis-regras.js';

export const contaDoFunil = (f) => (f && f.publico === 'frio' ? 'marketing' : 'principal');
export const chaveDaConta = (conta) => env(conta === 'marketing' ? 'BREVO_API_KEY_MARKETING' : 'BREVO_API_KEY');
const REMETENTE_PADRAO = 'contato@mentorei.com.br';
export const remetenteDe = (f) => ({
  name: (f && f.remetente_nome) || 'Mentorei',
  email: (f && f.remetente_email) || (contaDoFunil(f) === 'marketing' && env('BREVO_REMETENTE_MARKETING')) || REMETENTE_PADRAO,
});

// ---------- links assinados (página de leitura e sair da lista) ----------
const segredo = () => `mentorei-funis:${env('SUPABASE_SECRET_KEY')}`;
const assinar = (s) => createHmac('sha256', segredo()).update(s).digest('base64url').slice(0, 22);
// v = envio de verdade (id numérico); e = prévia de um e-mail (id do e-mail, sem contar nada)
export function token(tipo, id) { const d = tipo === 'v' ? `v${Number(id).toString(36)}` : `e${String(id).replace(/-/g, '')}`; return `${d}.${assinar(d)}`; }
export function lerToken(t) {
  const [d, s] = String(t || '').split('.');
  if (!d || !s || !/^[ve][0-9a-z]+$/.test(d)) return null;
  const a = Buffer.from(assinar(d)), b = Buffer.from(s);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (d[0] === 'v') return { tipo: 'v', id: parseInt(d.slice(1), 36) };
  const h = d.slice(1);
  if (h.length !== 32) return null;
  return { tipo: 'e', id: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` };
}
export const linksDe = (tipo, id) => {
  const t = token(tipo, id);
  return { ler: `${SITE}/ler.html?t=${t}`, sair: `${SITE}/sair.html?t=${t}`, umClique: `${SITE}/api/m/sair?t=${t}` };
};
export const chaveFundoFunis = () => createHmac('sha256', env('SUPABASE_SECRET_KEY')).update('funis-fundo').digest('hex');
const semColchetes = (id) => String(id || '').trim().replace(/^<|>$/g, '');

// ---------- Brevo ----------
export async function brevoEnviar(conta, { remetente, para, assunto, html, texto, responder, links }) {
  const chave = chaveDaConta(conta);
  if (!chave) return { ok: false, semChave: true, mensagem: conta === 'marketing' ? 'falta a chave da conta de marketing do Brevo (BREVO_API_KEY_MARKETING)' : 'falta a chave do Brevo (BREVO_API_KEY)' };
  const corpo = {
    sender: remetente, to: [para], subject: assunto, htmlContent: html, textContent: texto, tags: ['funil'],
    ...(responder ? { replyTo: { email: responder } } : {}),
    ...(links ? { headers: { 'List-Unsubscribe': `<${links.umClique}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
  };
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': chave, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, messageId: semColchetes(j.messageId) };
    const msg = String(j.message || r.status);
    return { ok: false, status: r.status, mensagem: msg, chaveRuim: r.status === 401, invalido: r.status === 400 && /email|recipient|to\b/i.test(msg) && !/sender/i.test(msg) };
  } catch (_) { return { ok: false, mensagem: 'sem conexão com o Brevo' }; }
}

// tipo do Brevo → tipo nosso
const EVENTOS = { opened: 'abriu', loadedByProxy: 'automatico', clicks: 'clicou', hardBounces: 'devolvido', softBounces: 'devolvido_temp',
  invalid: 'invalido', blocked: 'bloqueado', spam: 'spam', unsubscribed: 'saiu', error: 'erro' };
async function lerEventosBrevo(conta) {
  const chave = chaveDaConta(conta);
  if (!chave) return [];
  const todos = [];
  for (const tipo of Object.keys(EVENTOS)) {
    for (let offset = 0; offset < 20000; offset += 1000) {
      const r = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?days=3&limit=1000&offset=${offset}&event=${tipo}&sort=asc`, { headers: { 'api-key': chave, Accept: 'application/json' } }).catch(() => null);
      if (!r || !r.ok) break;
      const j = await r.json().catch(() => ({}));
      const evs = j.events || [];
      for (const e of evs) todos.push({ tipo, messageId: semColchetes(e.messageId), data: e.date, link: e.link || null, email: e.email });
      if (evs.length < 1000) break;
    }
  }
  return todos;
}

// ---------- dados ----------
const lista = (r) => (r.ok && Array.isArray(r.dados) ? r.dados : []);
const emLista = (vals) => `(${vals.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`;
async function emPedacos(vals, n, fn) { const out = []; for (let i = 0; i < vals.length; i += n) out.push(...(await fn(vals.slice(i, i + n)))); return out; }

export async function configFunis() {
  const r = await supa('/rest/v1/configuracoes?chave=eq.funis&select=valor');
  const v = (lista(r)[0] || {}).valor || {};
  return { limite_principal: Number(v.limite_principal) || 150, limite_marketing: Number(v.limite_marketing) || 280 };
}
async function guardarEstado(estado) {
  await supa('/rest/v1/configuracoes?on_conflict=chave', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', corpo: { chave: 'funis_estado', valor: estado, atualizado_em: new Date().toISOString() } });
}

// Pessoa pediu para sair (ou marcou como spam): nunca mais recebe e-mail de funil.
export async function descadastrar(email, origem, envioId = null) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return;
  await supa('/rest/v1/descadastros?on_conflict=email', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', corpo: { email: e, origem, envio_id: envioId } });
  await supa(`/rest/v1/funil_membros?email=eq.${encodeURIComponent(e)}&status=in.(ativo,pausado,concluido)`, { metodo: 'PATCH', prefer: 'return=minimal',
    corpo: { status: 'descadastrado', motivo: origem === 'spam' ? 'Marcou o e-mail como spam' : 'Pediu para sair da lista', saiu_em: new Date().toISOString(), proximo_envio_em: null } });
  await supa(`/rest/v1/contatos?email=ilike.${encodeURIComponent(e)}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { marketing: false } });
}

// E-mail que não existe / voltou: tira dos funis e põe em "Contatos para atualizar" (uma linha aberta por e-mail).
export async function emailErrado(email, motivo, detalhe = null) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return;
  const membros = lista(await supa(`/rest/v1/funil_membros?email=eq.${encodeURIComponent(e)}&select=id,funil_id,nome,empresa_id,contato_id,status`));
  const vivos = membros.filter((m) => EM_ANDAMENTO.includes(m.status));
  if (vivos.length) {
    await supa(`/rest/v1/funil_membros?email=eq.${encodeURIComponent(e)}&status=in.(ativo,pausado,concluido)`, { metodo: 'PATCH', prefer: 'return=minimal',
      corpo: { status: 'email_errado', motivo, saiu_em: new Date().toISOString(), proximo_envio_em: null } });
  }
  const aberto = lista(await supa(`/rest/v1/contatos_atualizar?email=eq.${encodeURIComponent(e)}&resolvido_em=is.null&select=id,funis`));
  const funis = [...new Set([...(aberto[0] ? aberto[0].funis || [] : []), ...vivos.map((m) => m.funil_id)])];
  if (aberto[0]) {
    await supa(`/rest/v1/contatos_atualizar?id=eq.${aberto[0].id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { funis } });
    return;
  }
  const base = membros[0] || {};
  await supa('/rest/v1/contatos_atualizar', { metodo: 'POST', prefer: 'return=minimal', corpo: {
    email: e, nome: base.nome || null, empresa_id: base.empresa_id || null, contato_id: base.contato_id || null, motivo, detalhe, funis } });
}

const MOTIVO = { devolvido: 'O e-mail voltou: endereço não existe', invalido: 'Endereço escrito errado', bloqueado: 'O Brevo bloqueou este endereço (já devolveu antes)', devolvido_temp: 'Voltou 3 vezes seguidas (caixa cheia ou servidor fora)' };

// 1. eventos do Brevo → funil_eventos → contas refeitas → problemas tratados
async function processarEventos() {
  const evs = [...(await lerEventosBrevo('principal')), ...(await lerEventosBrevo('marketing'))];
  if (!evs.length) return 0;
  const ids = [...new Set(evs.map((e) => e.messageId).filter(Boolean))];
  const envios = await emPedacos(ids, 60, async (p) => lista(await supa(`/rest/v1/funil_envios?message_id=in.${encodeURIComponent(emLista(p))}&select=id,message_id,email,enviado_em,membro_id`)));
  const porMsg = new Map(envios.map((v) => [v.message_id, v]));
  const linhas = [];
  for (const e of evs) {
    const v = porMsg.get(e.messageId);
    if (!v) continue;   // e-mail que não é de funil (convites, avisos da plataforma)
    let tipo = EVENTOS[e.tipo];
    if (tipo === 'clicou' && (new Date(e.data) - new Date(v.enviado_em)) / 1000 < SEGUNDOS_CLIQUE_AUTOMATICO) tipo = 'automatico';
    linhas.push({ envio_id: v.id, tipo, link: e.link, em: e.data, chave: `${e.messageId}|${e.tipo}|${e.data}|${e.link || ''}` });
  }
  if (!linhas.length) return 0;
  for (let i = 0; i < linhas.length; i += 500) {
    await supa('/rest/v1/funil_eventos?on_conflict=chave', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', corpo: linhas.slice(i, i + 500) });
  }
  const tocados = [...new Set(linhas.map((l) => l.envio_id))];
  for (let i = 0; i < tocados.length; i += 300) await supa('/rest/v1/rpc/recontar_envios', { metodo: 'POST', corpo: { ids: tocados.slice(i, i + 300) } });

  // problemas: spam/sair = descadastro; devolvido, inválido, bloqueado = e-mail errado; 3 devoluções temporárias seguidas = e-mail errado
  const porEnvio = new Map(envios.map((v) => [v.id, v]));
  const feitos = new Set();
  for (const l of linhas) {
    const v = porEnvio.get(l.envio_id);
    const chave = `${v.email}|${l.tipo}`;
    if (feitos.has(chave)) continue;
    if (l.tipo === 'spam' || l.tipo === 'saiu') { feitos.add(chave); await descadastrar(v.email, l.tipo === 'spam' ? 'spam' : 'link', v.id); }
    else if (MOTIVO[l.tipo] && l.tipo !== 'devolvido_temp') { feitos.add(chave); await emailErrado(v.email, MOTIVO[l.tipo]); }
    else if (l.tipo === 'devolvido_temp') {
      feitos.add(chave);
      const ult = lista(await supa(`/rest/v1/funil_envios?membro_id=eq.${v.membro_id}&status=eq.enviado&select=problema&order=enviado_em.desc&limit=3`));
      if (ult.length === 3 && ult.every((u) => u.problema === 'devolvido_temp')) await emailErrado(v.email, MOTIVO.devolvido_temp);
    }
  }
  return linhas.length;
}

// próximo dia útil às 9h de Brasília
const proximoDiaUtil9h = () => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(12, 0, 0, 0);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
};

// Engajou: oportunidade em Vendas (ou anotação na que já existe) com próximo contato para o responsável.
export async function avisarVendas(membro, funil, regra, motivo) {
  if (!membro.empresa_id) return;
  const ops = lista(await supa(`/rest/v1/oportunidades?empresa_id=eq.${membro.empresa_id}&etapa=not.in.(fechado,perdido)&select=id,etapa,responsavel_id,proximo_contato_em&order=atualizado_em.desc&limit=1`));
  let resp = regra && regra.responsavel ? regra.responsavel : null;
  if (!resp) {
    const emp = lista(await supa(`/rest/v1/empresas?id=eq.${membro.empresa_id}&select=sistema`))[0] || {};
    const cfg = (lista(await supa('/rest/v1/configuracoes?chave=eq.prospeccao&select=valor'))[0] || {}).valor || {};
    resp = (cfg.responsaveis && emp.sistema && cfg.responsaveis[emp.sistema]) || null;
  }
  const texto = `Engajou no funil de e-mail "${funil.nome}": ${motivo}.${membro.nome ? ` Contato: ${membro.nome} (${membro.email}).` : ` E-mail: ${membro.email}.`}`;
  const obs = `Ligar: engajou no funil "${funil.nome}" (${motivo})`;
  if (ops[0]) {
    const o = ops[0];
    // tipo e-mail: conta como contato com o cliente (quem estava em "A prospectar" vai para "Primeiro contato feito")
    await supa('/rest/v1/interacoes', { metodo: 'POST', prefer: 'return=minimal', corpo: { oportunidade_id: o.id, contato_id: membro.contato_id || null, tipo: 'email', texto, por: null } });
    const muda = { proximo_contato_obs: obs };
    if (!o.proximo_contato_em || new Date(o.proximo_contato_em) < new Date()) { muda.proximo_contato_em = proximoDiaUtil9h(); muda.proximo_contato_por = o.responsavel_id || resp; }
    if (!o.responsavel_id && resp) muda.responsavel_id = resp;
    await supa(`/rest/v1/oportunidades?id=eq.${o.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: muda });
    return;
  }
  const nova = await supa('/rest/v1/oportunidades', { metodo: 'POST', prefer: 'return=representation', corpo: {
    empresa_id: membro.empresa_id, titulo: `Engajou no funil · ${funil.nome}`, servico: 'outro', etapa: 'contato', origem: 'Funil de e-mail',
    contato_id: membro.contato_id || null, responsavel_id: resp, proximo_contato_em: proximoDiaUtil9h(), proximo_contato_por: resp, proximo_contato_obs: obs, criado_por: null } });
  const o = lista(nova)[0];
  if (o) await supa('/rest/v1/interacoes', { metodo: 'POST', prefer: 'return=minimal', corpo: { oportunidade_id: o.id, contato_id: membro.contato_id || null, tipo: 'sistema', texto, por: null } });
}

// Passa uma pessoa para outro funil (fica registrado de onde veio). Devolve true se entrou.
export async function moverPara(membro, destinoId, origemTexto, porId = null) {
  if (!destinoId || destinoId === membro.funil_id) return false;
  const desc = lista(await supa(`/rest/v1/descadastros?email=eq.${encodeURIComponent(membro.email)}&select=email`));
  if (desc.length) return false;
  const r = await supa('/rest/v1/funil_membros?on_conflict=funil_id,email', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', corpo: {
    funil_id: destinoId, email: membro.email, nome: membro.nome, empresa_id: membro.empresa_id, contato_id: membro.contato_id, origem: origemTexto, entrou_por: porId } });
  if (!r.ok) return false;
  await supa(`/rest/v1/funil_membros?id=eq.${membro.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: {
    status: 'passou', passou_para: destinoId, saiu_em: new Date().toISOString(), proximo_envio_em: null, motivo: origemTexto } });
  return true;
}

const descreverGatilho = (r, regra) => (regra.gatilho === 'leitura' ? `leu até o fim ${r.leram} e-mail(s)` : regra.gatilho === 'abertura' ? `abriu ${r.abertos} e-mail(s)` : `clicou ${r.cliques} vez(es)`);

// 2. regras automáticas de cada funil
async function aplicarRegras(funis) {
  let passaram = 0, tirados = 0;
  for (const f of funis) {
    const p = f.regra_passagem || {}, l = f.regra_limpeza || {};
    if (!(p.ligada && p.destino) && !l.ligada) continue;
    const membros = lista(await supa(`/rest/v1/funil_membros_resumo?funil_id=eq.${f.id}&status=in.(ativo,concluido)&select=*`));
    const destino = p.destino ? funis.find((x) => x.id === p.destino) : null;
    for (const m of membros) {
      if (p.ligada && destino && atingiuPassagem(m, p)) {
        const motivo = descreverGatilho(m, p);
        if (await moverPara(m, destino.id, `Regra automática do funil "${f.nome}": ${motivo}`)) {
          passaram += 1;
          if (p.criar_oportunidade) await avisarVendas(m, f, p, motivo);
        }
        continue;
      }
      if (l.ligada && m.status === 'ativo' && atingiuLimpeza(m, l)) {
        await supa(`/rest/v1/funil_membros?id=eq.${m.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: {
          status: 'removido', motivo: `Regra de limpeza: nenhum sinal nos últimos ${m.sem_sinal_seguidos} e-mails`, saiu_em: new Date().toISOString(), proximo_envio_em: null } });
        tirados += 1;
      }
    }
  }
  return { passaram, tirados };
}

const inicioDoDiaBR = () => new Date(`${new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })}T00:00:00-03:00`).toISOString();

// Envia um e-mail da sequência a uma pessoa (cria a linha do envio antes: nunca manda o mesmo e-mail duas vezes).
async function enviarPara(funil, m, emailSeq) {
  const conta = contaDoFunil(funil);
  const pessoa = { nome: m.nome, empresa: m.empresa && m.empresa.nome };
  const novo = await supa('/rest/v1/funil_envios', { metodo: 'POST', prefer: 'return=representation', corpo: {
    membro_id: m.id, funil_id: funil.id, email_id: emailSeq.id, email: m.email, assunto: montarEmail(emailSeq, pessoa, {}).assunto, conta, status: 'enviando' } });
  const envio = lista(novo)[0];
  if (!envio) return { pulou: true };
  const links = linksDe('v', envio.id);
  const e = montarEmail(emailSeq, pessoa, links);
  const r = await brevoEnviar(conta, { remetente: remetenteDe(funil), para: { email: m.email, ...(m.nome ? { name: m.nome } : {}) }, assunto: e.assunto, html: e.html, texto: e.texto, responder: funil.responder_para, links });
  if (r.ok) {
    await supa(`/rest/v1/funil_envios?id=eq.${envio.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { status: 'enviado', message_id: r.messageId, enviado_em: new Date().toISOString() } });
    return { ok: true };
  }
  if (r.invalido) {
    await supa(`/rest/v1/funil_envios?id=eq.${envio.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { status: 'erro', erro: r.mensagem, problema: 'invalido', problema_em: new Date().toISOString() } });
    await emailErrado(m.email, MOTIVO.invalido, r.mensagem);
    return { ok: false };
  }
  // falha passageira ou chave: apaga a linha para tentar de novo na próxima hora
  await supa(`/rest/v1/funil_envios?id=eq.${envio.id}`, { metodo: 'DELETE', prefer: 'return=minimal' });
  return { ok: false, parar: !!(r.semChave || r.chaveRuim), mensagem: r.mensagem };
}

// 3. envios do momento (dentro da janela de dias e horas de cada funil, respeitando o limite por dia de cada conta)
async function enviarDevidos(funis, cfg) {
  const agora = new Date();
  const restante = {};
  for (const conta of ['principal', 'marketing']) {
    const hoje = lista(await supa(`/rest/v1/funil_envios?conta=eq.${conta}&enviado_em=gte.${encodeURIComponent(inicioDoDiaBR())}&select=id`)).length;
    restante[conta] = Math.max(0, (conta === 'marketing' ? cfg.limite_marketing : cfg.limite_principal) - hoje);
  }
  const parada = {};
  let enviados = 0;
  const erros = [];
  for (const f of funis) {
    if (!f.ativo || f.arquivado) continue;
    const conta = contaDoFunil(f);
    if (parada[conta] || restante[conta] <= 0) continue;
    if (!chaveDaConta(conta)) { erros.push(`${f.nome}: ${conta === 'marketing' ? 'falta a conta de marketing do Brevo' : 'falta a chave do Brevo'}`); continue; }
    if (proximoHorario(agora, f).getTime() > agora.getTime() + 1000) continue;   // fora do horário deste funil
    const emails = lista(await supa(`/rest/v1/funil_emails?funil_id=eq.${f.id}&ativo=eq.true&select=*&order=ordem,criado_em`)).filter((e) => (e.formato === 'html' ? e.html : e.corpo) && e.assunto);
    if (!emails.length) continue;
    const devidos = lista(await supa(`/rest/v1/funil_membros?funil_id=eq.${f.id}&status=eq.ativo&proximo_envio_em=lte.${encodeURIComponent(agora.toISOString())}&select=*,empresa:empresas(nome)&order=proximo_envio_em&limit=${Math.min(500, restante[conta] * 3)}`));
    if (!devidos.length) continue;
    const emailsDevidos = [...new Set(devidos.map((m) => m.email))];
    const desc = new Set((await emPedacos(emailsDevidos, 80, async (p) => lista(await supa(`/rest/v1/descadastros?email=in.${encodeURIComponent(emLista(p))}&select=email`)))).map((d) => d.email));
    const ja = await emPedacos(devidos.map((m) => m.id), 80, async (p) => lista(await supa(`/rest/v1/funil_envios?membro_id=in.${encodeURIComponent(emLista(p))}&select=membro_id,email_id,enviado_em`)));
    for (const m of devidos) {
      if (restante[conta] <= 0 || parada[conta]) break;
      if (desc.has(m.email)) { await supa(`/rest/v1/funil_membros?id=eq.${m.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { status: 'descadastrado', motivo: 'Já tinha pedido para sair da lista', proximo_envio_em: null } }); continue; }
      if (!EMAIL_VALIDO.test(m.email)) { await emailErrado(m.email, MOTIVO.invalido); continue; }
      const meus = ja.filter((v) => v.membro_id === m.id);
      const recebidos = new Set(meus.map((v) => v.email_id));
      const prox = emails.find((e) => !recebidos.has(e.id));
      if (!prox) { await supa(`/rest/v1/funil_membros?id=eq.${m.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { status: 'concluido', proximo_envio_em: null } }); continue; }
      // o intervalo conta a partir do último e-mail (ou da entrada no funil)
      const base = meus.length ? meus.map((v) => v.enviado_em).sort().pop() : m.entrou_em;
      const devido = depoisDeDias(base, prox.dias_depois);
      if (devido.getTime() > agora.getTime() + 60e3) {
        await supa(`/rest/v1/funil_membros?id=eq.${m.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: { proximo_envio_em: proximoHorario(devido, f).toISOString() } });
        continue;
      }
      const r = await enviarPara(f, m, prox);
      if (r.parar) { parada[conta] = true; erros.push(`${f.nome}: ${r.mensagem}`); break; }
      if (r.ok) { enviados += 1; restante[conta] -= 1; }
      const depois = emails[emails.indexOf(prox) + 1];
      const corpo = depois ? { proximo_envio_em: proximoHorario(depoisDeDias(agora, depois.dias_depois), f).toISOString() } : { status: 'concluido', proximo_envio_em: null };
      if (r.ok || r.pulou) await supa(`/rest/v1/funil_membros?id=eq.${m.id}&status=eq.ativo`, { metodo: 'PATCH', prefer: 'return=minimal', corpo });
    }
  }
  return { enviados, erros, restante };
}

// Rodada completa (de hora em hora e pelo botão "Rodar agora").
export async function rodarFunis() {
  const inicio = new Date().toISOString();
  const funisR = await supa('/rest/v1/funis?arquivado=eq.false&select=*&order=criado_em');
  if (!funisR.ok) return { erro: 'Script 34 ainda não rodado.' };
  const funis = lista(funisR);
  const cfg = await configFunis();
  let eventos = 0, regras = { passaram: 0, tirados: 0 }, envio = { enviados: 0, erros: [] };
  const erros = [];
  try { eventos = await processarEventos(); } catch (e) { erros.push(`eventos: ${e.message}`); }
  try { regras = await aplicarRegras(funis); } catch (e) { erros.push(`regras: ${e.message}`); }
  try { envio = await enviarDevidos(funis, cfg); } catch (e) { erros.push(`envio: ${e.message}`); }
  const estado = { inicio, fim: new Date().toISOString(), eventos, ...regras, enviados: envio.enviados, restante: envio.restante, erros: [...erros, ...(envio.erros || [])].slice(0, 20) };
  await guardarEstado(estado);
  return estado;
}
