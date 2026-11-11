// Contato do formulário do site institucional (mentorei.com.br, "20 minutos. Seu desafio no centro."), script 70.
// POST /api/contato-site {nome, empresa, email, desafio?, temas?, bot?} → {ok: true}
// Cria (ou reaproveita) empresa e contato, põe a oportunidade em Vendas na etapa "Contato novo" (origem Site)
// e avisa por e-mail quem está em configuracoes.contatos_site.avisar (Cintia e Viviane). Sem API de WhatsApp (decisão
// dela em 11/11: e-mail agora, WhatsApp automático só se contratarem um serviço).
// O site chama de outro endereço: por isso responde ao CORS só para os endereços do site.
import { json, supa, SITE } from '../lib/google.mjs';
import { enviarEmail, modeloEmail, emailReal, COORDENACAO } from '../lib/email.mjs';

export const config = { path: '/api/contato-site', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } };

const ORIGENS = [/^https:\/\/(www\.)?mentorei\.com\.br$/, /^https:\/\/([a-z0-9-]+--)?mentoreitreinamentos\.netlify\.app$/, /^https:\/\/([a-z0-9-]+--)?mentorei2027\.netlify\.app$/];
const texto = (v, max) => String(v == null ? '' : v).replace(/[ \t]+/g, ' ').trim().slice(0, max);
const enc = encodeURIComponent;
// PostgREST: ilike exato (sem curingas que a pessoa digitou)
const exato = (t) => enc(t.replace(/[%_*\\]/g, (c) => `\\${c}`));

function cors(req) {
  const o = req.headers.get('origin') || '';
  return ORIGENS.some((r) => r.test(o)) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
}
const resp = (req, corpo, status = 200) => { const r = json(corpo, status); Object.entries(cors(req)).forEach(([k, v]) => r.headers.set(k, v)); return r; };

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  let c = {};
  try { c = await req.json(); } catch (_) { return resp(req, { mensagem: 'Pedido inválido.' }, 400); }
  if (c.bot) return resp(req, { ok: true }); // campo invisível preenchido = robô: finge que gravou
  const nome = texto(c.nome, 100), empresaNome = texto(c.empresa, 150), email = texto(c.email, 180).toLowerCase();
  const desafio = String(c.desafio == null ? '' : c.desafio).trim().slice(0, 1500), temas = texto(c.temas, 500);
  if (nome.length < 2) return resp(req, { mensagem: 'Escreva o seu nome.' }, 400);
  if (empresaNome.length < 2) return resp(req, { mensagem: 'Escreva a empresa.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return resp(req, { mensagem: 'Confira o e-mail.' }, 400);

  try {
    const r = await registrar({ nome, empresaNome, email, desafio, temas });
    return resp(req, { ok: true, repetido: r.repetido || undefined });
  } catch (e) {
    console.error('contato-site', e && e.message);
    return resp(req, { mensagem: 'Não conseguimos registrar agora.' }, 500);
  }
};

async function precisa(r, oQue) { if (!r.ok) throw new Error(`${oQue}: ${r.status} ${JSON.stringify(r.dados).slice(0, 300)}`); return r.dados; }

async function registrar({ nome, empresaNome, email, desafio, temas }) {
  // o mesmo envio repetido (o site tenta de novo; clique duplo) nos últimos 15 min não cria outra oportunidade
  const desde = new Date(Date.now() - 15 * 60000).toISOString();
  const rep = await precisa(await supa(`/rest/v1/interacoes?select=id&tipo=eq.nota&texto=ilike.${exato('Contato pelo site')}*${exato(email)}*&criado_em=gte.${enc(desde)}&limit=1`), 'repetido');
  if (rep.length) return { repetido: true };

  // empresa: a cadastrada com o mesmo nome (sem diferença de maiúsculas), senão uma nova com origem Site
  const achadas = await precisa(await supa(`/rest/v1/empresas?select=id,nome&nome=ilike.${exato(empresaNome)}&limit=2`), 'empresa');
  let empresa = achadas.length === 1 ? achadas[0] : null;
  if (!empresa) empresa = (await precisa(await supa('/rest/v1/empresas', { metodo: 'POST', corpo: { nome: empresaNome, origem: 'Site' }, prefer: 'return=representation' }), 'nova empresa'))[0];

  // contato: o mesmo e-mail na empresa, senão um novo
  const cs = await precisa(await supa(`/rest/v1/contatos?select=id&empresa_id=eq.${empresa.id}&email=ilike.${exato(email)}&limit=1`), 'contato');
  const contato = cs[0] || (await precisa(await supa('/rest/v1/contatos', { metodo: 'POST', corpo: { empresa_id: empresa.id, nome, email, ativo: true, observacoes: 'Veio pelo formulário do site.' }, prefer: 'return=representation' }), 'novo contato'))[0];

  const detalhe = [`Contato pelo site · ${nome} <${email}> · ${empresaNome}`, temas && `Temas: ${temas}`, desafio && `Desafio: ${desafio}`].filter(Boolean).join('\n');
  const agora = new Date().toISOString();

  // oportunidade: a aberta da empresa (a que está em "A prospectar" passa para "Contato novo"), senão uma nova
  const abertas = await precisa(await supa(`/rest/v1/oportunidades?select=id,etapa,titulo&empresa_id=eq.${empresa.id}&etapa=not.in.(fechado,perdido)&order=criado_em.desc&limit=1`), 'oportunidade aberta');
  let op = abertas[0], nova = false;
  const proximo = { proximo_contato_em: agora, proximo_contato_obs: 'Responder o contato do site e marcar os 20 minutos' };
  if (op) {
    const mud = { ...proximo, contato_id: contato.id };
    if (op.etapa === 'prospectar') { mud.etapa = 'novo'; mud.origem = 'Site'; mud.lista = null; }
    let r = await supa(`/rest/v1/oportunidades?id=eq.${op.id}`, { metodo: 'PATCH', corpo: mud });
    if (!r.ok && mud.etapa) { mud.etapa = 'contato'; r = await supa(`/rest/v1/oportunidades?id=eq.${op.id}`, { metodo: 'PATCH', corpo: mud }); } // antes do script 70
    await precisa(r, 'atualizar oportunidade');
  } else {
    const corpo = { empresa_id: empresa.id, contato_id: contato.id, titulo: `Site · ${temas ? temas.slice(0, 80) : 'Conversa de 20 minutos'}`, etapa: 'novo', origem: 'Site', observacoes: detalhe, ultima_interacao_em: agora, ...proximo };
    let r = await supa('/rest/v1/oportunidades', { metodo: 'POST', corpo, prefer: 'return=representation' });
    if (!r.ok) r = await supa('/rest/v1/oportunidades', { metodo: 'POST', corpo: { ...corpo, etapa: 'contato' }, prefer: 'return=representation' }); // antes do script 70
    op = (await precisa(r, 'nova oportunidade'))[0]; nova = true;
  }
  await precisa(await supa('/rest/v1/interacoes', { metodo: 'POST', corpo: { oportunidade_id: op.id, contato_id: contato.id, tipo: 'nota', texto: detalhe, quando: agora } }), 'histórico');

  await avisar({ nome, empresaNome, email, desafio, temas, op, nova, empresaNova: !achadas.length });
  return { ok: true };
}

async function avisar({ nome, empresaNome, email, desafio, temas, op, nova, empresaNova }) {
  const cfg = await supa('/rest/v1/configuracoes?select=valor&chave=eq.contatos_site');
  const ids = (cfg.ok && cfg.dados[0] && cfg.dados[0].valor && cfg.dados[0].valor.avisar) || [];
  let para = [];
  if (ids.length) {
    const p = await supa(`/rest/v1/perfis?select=nome,email&ativo=eq.true&id=in.(${ids.join(',')})`);
    if (p.ok) para = p.dados.filter((x) => emailReal(x.email)).map((x) => ({ email: x.email, name: x.nome }));
  }
  if (!para.length) para = [{ email: COORDENACAO, name: 'Mentorei' }];
  const link = `${SITE}/app.html#/vendas/oportunidade/${op.id}`;
  const m = modeloEmail({
    assunto: `Contato novo pelo site: ${nome} · ${empresaNome}`,
    titulo: 'Chegou um contato novo pelo site',
    blocos: [
      { p: `${nome} (${empresaNome}) quer conversar 20 minutos com a Mentorei.` },
      { lista: [`E-mail: ${email}`, temas && `Temas: ${temas}`, desafio && `Desafio: ${desafio}`, empresaNova ? 'Empresa nova: foi cadastrada agora em Vendas.' : 'Empresa já cadastrada em Vendas.'].filter(Boolean) },
      { botao: { texto: 'Abrir em Vendas', link } },
      { nota: nova ? 'Está em Vendas na etapa "Contato novo". Quando você registrar a ligação, o e-mail ou o WhatsApp, ela passa sozinha para "Primeiro contato feito".' : 'A empresa já tinha uma oportunidade aberta: o pedido entrou no histórico dela.' },
      { p: 'A pessoa também pode ter seguido para o WhatsApp da Mentorei com a mensagem pronta.' },
    ],
  });
  const r = await enviarEmail({ para, assunto: m.assunto, html: m.html, texto: m.texto });
  if (!r.enviado) console.error('contato-site aviso', r.mensagem);
}
