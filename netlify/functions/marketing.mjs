// Páginas públicas dos funis de e-mail (sem login, pelo link assinado de cada e-mail):
// "continuar lendo" (mostra o texto e mede até onde a pessoa leu) e "sair da lista" (inclusive o botão de 1 clique do Gmail).
import { json, supa } from '../lib/google.mjs';
import { lerToken, descadastrar } from '../lib/funis.mjs';
import { montarPagina } from '../../public/assets/funis-regras.js';

export const config = { path: ['/api/m', '/api/m/sair'], method: 'POST' };
const lista = (r) => (r.ok && Array.isArray(r.dados) ? r.dados : []);

async function dadosDoToken(t) {
  const k = lerToken(t);
  if (!k) return null;
  if (k.tipo === 'e') {   // prévia (e-mail de teste): mostra, mas não conta nada
    const e = lista(await supa(`/rest/v1/funil_emails?id=eq.${k.id}&select=*`))[0];
    return e ? { previa: true, email: e, pessoa: { nome: 'Juliana', empresa: 'Empresa Exemplo' } } : null;
  }
  const v = lista(await supa(`/rest/v1/funil_envios?id=eq.${k.id}&select=id,email,email_id,membro:funil_membros(nome,empresa:empresas(nome)),modelo:funil_emails(*)`))[0];
  if (!v) return null;
  return { envio: v, email: v.modelo, pessoa: { nome: v.membro && v.membro.nome, empresa: v.membro && v.membro.empresa && v.membro.empresa.nome } };
}

export default async (req) => {
  const url = new URL(req.url);
  // botão "Cancelar inscrição" do Gmail/Yahoo (List-Unsubscribe-Post): POST direto, sem página
  if (url.pathname.endsWith('/sair')) {
    const d = await dadosDoToken(url.searchParams.get('t'));
    if (d && d.envio) await descadastrar(d.envio.email, 'link', d.envio.id);
    return new Response('ok', { status: 200 });
  }
  let b; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const d = await dadosDoToken(b.t);
  if (!d) return json({ mensagem: 'Link inválido.' }, 404);

  if (b.acao === 'ler') {
    if (!d.email) return json({ mensagem: 'Este conteúdo não está mais disponível.' }, 404);
    const p = montarPagina(d.email, d.pessoa);
    // abriu a página: fica no histórico (o clique em "continuar lendo" já vem do Brevo; aqui não conta de novo)
    if (d.envio) await supa('/rest/v1/funil_eventos?on_conflict=chave', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
      corpo: { envio_id: d.envio.id, tipo: 'pagina', link: 'continuar lendo', chave: `pagina:${d.envio.id}` } });
    return json({ ok: true, titulo: p.titulo, html: p.html, previa: !!d.previa });
  }
  if (b.acao === 'progresso') {
    if (d.envio) await supa('/rest/v1/rpc/marcar_leitura', { metodo: 'POST', corpo: { p_envio: d.envio.id, p_pct: Math.round(Number(b.pct) || 0), p_seg: Math.round(Number(b.seg) || 0) } });
    return json({ ok: true });
  }
  if (b.acao === 'info') {
    const em = d.envio ? d.envio.email : 'seu e-mail';
    const ja = d.envio ? lista(await supa(`/rest/v1/descadastros?email=eq.${encodeURIComponent(d.envio.email)}&select=email`)).length > 0 : false;
    return json({ ok: true, email: em.replace(/^(.{2})[^@]*/, '$1•••'), saiu: ja, previa: !!d.previa });
  }
  if (b.acao === 'sair') {
    if (d.envio) await descadastrar(d.envio.email, 'link', d.envio.id);
    return json({ ok: true });
  }
  return json({ mensagem: 'Ação desconhecida.' }, 400);
};
