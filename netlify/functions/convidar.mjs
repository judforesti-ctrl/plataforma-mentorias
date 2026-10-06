// Envia o convite de acesso (e-mail com link para criar a senha).
// Só a administração pode chamar. A chave secreta do Supabase fica nas variáveis de ambiente da Netlify.
export const config = { path: '/api/convidar', method: 'POST' };

const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const resposta = (mensagem, status = 200, extra = {}) => new Response(JSON.stringify({ mensagem, ...extra }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function chamar(caminho, { metodo = 'GET', chave, token, corpo, prefer } = {}) {
  const headers = { apikey: chave, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let dados = null; try { dados = texto ? JSON.parse(texto) : null; } catch (_) { dados = texto; }
  return { ok: r.ok, status: r.status, dados };
}

export default async (req) => {
  const secreta = env('SUPABASE_SECRET_KEY').trim();
  if (!secreta) return resposta('A chave secreta do Supabase não está configurada na Netlify.', 500);

  // 1. Quem está pedindo?
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return resposta('Faça login de novo.', 401);
  const eu = await chamar('/auth/v1/user', { chave: secreta, token });
  if (!eu.ok || !eu.dados || !eu.dados.id) return resposta('Sua sessão expirou. Faça login de novo.', 401);
  const perfil = await chamar(`/rest/v1/perfis?id=eq.${eu.dados.id}&select=papel,ativo`, { chave: secreta });
  const meu = perfil.ok && perfil.dados && perfil.dados[0];
  if (!meu || meu.papel !== 'admin' || !meu.ativo) return resposta('Só a administração pode enviar convites.', 403);

  // 2. Dados do convite
  let b; try { b = await req.json(); } catch (_) { return resposta('Pedido inválido.', 400); }
  const email = String(b.email || '').trim().toLowerCase();
  const nome = String(b.nome || '').trim().slice(0, 120);
  const papel = b.papel;
  if (!EMAIL.test(email)) return resposta('E-mail inválido.', 400);
  if (!nome) return resposta('Informe o nome.', 400);
  if (!['admin', 'mentor', 'mentorado'].includes(papel)) return resposta('Tipo de acesso inválido.', 400);
  const mentoradoId = papel === 'mentorado' ? b.mentorado_id : null;
  if (papel === 'mentorado' && !UUID.test(String(mentoradoId || ''))) return resposta('Mentorado inválido.', 400);

  // 3. Grava (ou atualiza) o convite
  const conv = await chamar('/rest/v1/convites', {
    metodo: 'POST', chave: secreta, prefer: 'resolution=merge-duplicates,return=minimal',
    corpo: { email, nome, papel, tambem_mentor: papel === 'admin' && !!b.tambem_mentor, mentorado_id: mentoradoId, criado_por: eu.dados.id, usado_em: null },
  });
  if (!conv.ok) return resposta('Não foi possível gravar o convite.', 500, { detalhe: conv.dados && conv.dados.message });

  // 4a. Só preparar: cria o acesso sem mandar e-mail (a pessoa ainda não consegue entrar).
  if (b.sem_email) {
    const cria = await chamar('/auth/v1/admin/users', {
      metodo: 'POST', chave: secreta, corpo: { email, email_confirm: true, user_metadata: { nome } },
    });
    if (cria.ok) return resposta(`${nome} foi preparado(a). Nenhum e-mail foi enviado.`);
    if (cria.status === 422 || /already|exists|registered/i.test(JSON.stringify(cria.dados || ''))) {
      return resposta(`${nome} já estava preparado(a). Nenhum e-mail foi enviado.`);
    }
    return resposta('Não foi possível preparar o acesso.', 502, { detalhe: JSON.stringify(cria.dados || '').slice(0, 300) });
  }

  // 4b. Envia o e-mail de convite
  const site = (env('URL') || new URL(req.url).origin).replace(/\/$/, '');
  const destino = encodeURIComponent(`${site}/definir-senha.html`);
  const inv = await chamar(`/auth/v1/invite?redirect_to=${destino}`, { metodo: 'POST', chave: secreta, corpo: { email, data: { nome } } });
  if (inv.ok) return resposta(`Convite enviado para ${email}.`);

  const motivo = JSON.stringify(inv.dados || '');
  if (inv.status === 422 || /already|exists|registered/i.test(motivo)) {
    // A pessoa já tem login: manda um link para criar ou trocar a senha.
    const rec = await chamar(`/auth/v1/recover?redirect_to=${destino}`, { metodo: 'POST', chave: secreta, corpo: { email } });
    if (rec.ok) return resposta(`Convite enviado para ${email}, com o link para criar a senha.`);
    return resposta('Esta pessoa já tem login, mas o novo link não pôde ser enviado. Tente de novo em alguns minutos.', 502);
  }
  if (inv.status === 429) return resposta('Muitos e-mails em pouco tempo. Espere alguns minutos e tente de novo.', 429);
  if (/database error/i.test(motivo)) {
    return resposta('O banco não deixou criar o login. Rode no Supabase a correção do arquivo 05-ferramentas-online.sql e tente de novo.', 502, { detalhe: motivo.slice(0, 300) });
  }
  if (/smtp|sender|mail/i.test(motivo)) {
    return resposta('O servidor de e-mail recusou o envio. Confira no Brevo se o remetente está verificado.', 502, { detalhe: motivo.slice(0, 300) });
  }
  return resposta(`O e-mail de convite não pôde ser enviado (erro ${inv.status}). Tente de novo em alguns minutos.`, 502, { detalhe: motivo.slice(0, 300) });
};
