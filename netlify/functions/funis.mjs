// Funis de e-mail (só administração): e-mail de teste, "Rodar agora", passar pessoas para outro funil e situação das contas do Brevo.
import { json, quemPede, supa, SITE } from '../lib/google.mjs';
import { brevoEnviar, chaveDaConta, contaDoFunil, remetenteDe, linksDe, chaveFundoFunis, moverPara, avisarVendas } from '../lib/funis.mjs';
import { montarEmail, EMAIL_VALIDO } from '../../public/assets/funis-regras.js';

export const config = { path: '/api/funis', method: 'POST' };
const lista = (r) => (r.ok && Array.isArray(r.dados) ? r.dados : []);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A conta existe, a chave é a certa e os remetentes dos funis estão verificados nela?
async function situacaoConta(conta, remetentes) {
  const chave = chaveDaConta(conta);
  if (!chave) return { estado: 'sem_chave' };
  if (/^xsmtpsib-/i.test(chave)) return { estado: 'chave_smtp' };
  const h = { 'api-key': chave, Accept: 'application/json' };
  try {
    const r = await fetch('https://api.brevo.com/v3/account', { headers: h });
    if (!r.ok) return { estado: r.status === 401 ? 'recusada' : `erro_${r.status}` };
    const a = await r.json();
    const plano = (a.plan || []).map((p) => `${p.type}${p.credits != null ? ` (${p.credits} créditos)` : ''}`).join(', ');
    const s = await fetch('https://api.brevo.com/v3/senders', { headers: h }).then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
    const ativos = (s.senders || []).filter((x) => x.active).map((x) => String(x.email).toLowerCase());
    const faltam = remetentes.filter((e) => !ativos.includes(String(e).toLowerCase()));
    return { estado: 'ok', conta: a.email, plano, remetentes: ativos, faltam };
  } catch (_) { return { estado: 'sem_conexao' }; }
}

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  if (eu.papel !== 'admin') return json({ mensagem: 'Só a administração.' }, 403);
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }

  if (b.acao === 'situacao') {
    const funis = lista(await supa('/rest/v1/funis?arquivado=eq.false&select=*'));
    const rem = (conta) => [...new Set(funis.filter((f) => contaDoFunil(f) === conta).map((f) => remetenteDe(f).email))];
    const [principal, marketing, estado] = await Promise.all([
      situacaoConta('principal', rem('principal')), situacaoConta('marketing', rem('marketing')),
      supa('/rest/v1/configuracoes?chave=eq.funis_estado&select=valor'),
    ]);
    return json({ ok: true, principal, marketing, ultima: (lista(estado)[0] || {}).valor || null });
  }

  if (b.acao === 'rodar') {
    await fetch(`${SITE}/api/funis-fundo`, { method: 'POST', headers: { 'x-mentorei-sync': chaveFundoFunis() } }).catch(() => null);
    return json({ ok: true });
  }

  if (b.acao === 'teste') {
    const para = String(b.para || '').trim().toLowerCase();
    if (!EMAIL_VALIDO.test(para)) return json({ mensagem: 'E-mail para o teste inválido.' }, 400);
    if (!UUID.test(String(b.email_id || ''))) return json({ mensagem: 'Salve o e-mail antes de mandar o teste.' }, 400);
    const e = lista(await supa(`/rest/v1/funil_emails?id=eq.${b.email_id}&select=*,funil:funis(*)`))[0];
    if (!e) return json({ mensagem: 'Salve o e-mail antes de mandar o teste.' }, 404);
    const links = linksDe('e', e.id);
    const m = montarEmail(e, { nome: b.nome || eu.nome, empresa: b.empresa || 'Empresa Exemplo' }, links);
    const r = await brevoEnviar(contaDoFunil(e.funil), { remetente: remetenteDe(e.funil), para: { email: para }, assunto: `[TESTE] ${m.assunto}`, html: m.html, texto: m.texto, responder: e.funil.responder_para });
    if (!r.ok) return json({ mensagem: `Não consegui enviar: ${r.mensagem}.` }, 502);
    return json({ ok: true });
  }

  // passar pessoas marcadas à mão para outro funil (com aviso opcional em Vendas)
  if (b.acao === 'mover') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => UUID.test(String(x))).slice(0, 3000);
    if (!UUID.test(String(b.destino || '')) || !ids.length) return json({ mensagem: 'Escolha o funil e as pessoas.' }, 400);
    const destino = lista(await supa(`/rest/v1/funis?id=eq.${b.destino}&select=id,nome`))[0];
    if (!destino) return json({ mensagem: 'Funil não encontrado.' }, 404);
    let movidos = 0, avisos = 0;
    for (let i = 0; i < ids.length; i += 80) {
      const membros = lista(await supa(`/rest/v1/funil_membros?id=in.(${ids.slice(i, i + 80).join(',')})&select=*,funil:funis(id,nome)`));
      for (const m of membros) {
        if (await moverPara(m, destino.id, `${eu.nome} passou do funil "${m.funil.nome}"`, eu.id)) {
          movidos += 1;
          if (b.vendas && m.empresa_id) { await avisarVendas(m, m.funil, { responsavel: b.responsavel || null }, `passou para o funil "${destino.nome}"`); avisos += 1; }
        }
      }
    }
    return json({ ok: true, movidos, avisos });
  }

  return json({ mensagem: 'Ação desconhecida.' }, 400);
};
