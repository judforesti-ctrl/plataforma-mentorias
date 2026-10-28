// Envia o convite de acesso (e-mail com link para criar a senha).
// Só a administração pode chamar. A chave secreta do Supabase fica nas variáveis de ambiente da Netlify.
// O link do convite NÃO expira (netlify/lib/acesso.mjs): vale até a pessoa criar a senha.
import { linkDeAcesso, enviarLinkPorEmail } from '../lib/acesso.mjs';

export const config = { path: '/api/convidar', method: 'POST' };

const SUPABASE_URL = 'https://mixnubenhaleohkcanma.supabase.co';
const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const resposta = (mensagem, status = 200, extra = {}) => new Response(JSON.stringify({ mensagem, ...extra }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Cadastro simples (sem e-mail ainda): a pessoa ganha um endereço provisório que nunca recebe nada.
const PENDENTE = '@pendente.mentorei.com.br';
const slug = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 30) || 'mentor';
const CONDUZ = /Quem conduz: ([^(.;]+?) \(convidad.*?plataforma\)/i;
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

// Garante o login (sem mandar e-mail) e devolve o id dele.
async function garantirLogin(secreta, email, nome) {
  const cria = await chamar('/auth/v1/admin/users', { metodo: 'POST', chave: secreta, corpo: { email, email_confirm: true, user_metadata: { nome } } });
  if (cria.ok && cria.dados && cria.dados.id) return { id: cria.dados.id };
  if (!(cria.status === 422 || /already|exists|registered/i.test(JSON.stringify(cria.dados || '')))) {
    return { erro: JSON.stringify(cria.dados || '').slice(0, 300) };
  }
  // já existia: o perfil tem o mesmo id do login
  const p = await chamar(`/rest/v1/perfis?email=eq.${encodeURIComponent(email)}&select=id`, { chave: secreta });
  if (p.ok && p.dados && p.dados[0]) return { id: p.dados[0].id };
  // sem perfil (raro): o gerador de link do Supabase devolve o login junto
  const gl = await chamar('/auth/v1/admin/generate_link', { metodo: 'POST', chave: secreta, corpo: { type: 'recovery', email } });
  const id = gl.dados && (gl.dados.id || (gl.dados.user && gl.dados.user.id));
  return id ? { id } : { erro: JSON.stringify(gl.dados || '').slice(0, 300) };
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

  // Cadastro simples dos convidados das trilhas: mentor sem e-mail, ligado às aulas que a planilha dizia que conduz.
  if (b.acao === 'cadastro_simples') {
    const pessoas = (Array.isArray(b.pessoas) ? b.pessoas : []).slice(0, 30)
      .map((x) => ({ nome: String(x.nome || '').trim().slice(0, 120), chave: String(x.chave || x.nome || '').trim().toLowerCase() })).filter((x) => x.nome);
    if (!pessoas.length) return resposta('Nenhuma pessoa para cadastrar.', 400);
    const mods = await chamar(`/rest/v1/modulos?recomendacoes=ilike.*${encodeURIComponent('Quem conduz')}*&select=id,recomendacoes`, { chave: secreta });
    const resultados = [];
    for (const x of pessoas) {
      let perfilId = null;
      const ja = await chamar(`/rest/v1/perfis?nome=ilike.${encodeURIComponent(x.nome)}&select=id`, { chave: secreta });
      if (ja.ok && ja.dados && ja.dados[0]) perfilId = ja.dados[0].id;
      else {
        const email = `${slug(x.nome)}.${Math.random().toString(16).slice(2, 6)}${PENDENTE}`;
        const conv = await chamar('/rest/v1/convites', { metodo: 'POST', chave: secreta, prefer: 'resolution=merge-duplicates,return=minimal',
          corpo: { email, nome: x.nome, papel: 'mentor', tambem_mentor: false, criado_por: eu.dados.id, usado_em: null } });
        if (!conv.ok) { resultados.push({ nome: x.nome, ok: false, mensagem: 'não consegui gravar o cadastro' }); continue; }
        const cria = await chamar('/auth/v1/admin/users', { metodo: 'POST', chave: secreta, corpo: { email, email_confirm: true, user_metadata: { nome: x.nome, cadastro_simples: true } } });
        if (!cria.ok || !cria.dados || !cria.dados.id) { resultados.push({ nome: x.nome, ok: false, mensagem: 'não consegui criar o acesso' }); continue; }
        perfilId = cria.dados.id;
        // mentoria em grupo ligada (com o login de quem pediu: só a administração muda o tipo de atendimento)
        await chamar(`/rest/v1/perfis?id=eq.${perfilId}`, { metodo: 'PATCH', chave: secreta, token, corpo: { atende_grupo: true, atende_individual: false } });
      }
      // aulas em que a planilha dizia "Quem conduz: <nome>"
      let aulas = 0;
      for (const md of (mods.ok && mods.dados) || []) {
        const m = String(md.recomendacoes || '').match(CONDUZ);
        if (!m || !m[1].split(',').map((n) => n.trim().toLowerCase()).includes(x.chave)) continue;
        await chamar('/rest/v1/modulo_mentores', { metodo: 'POST', chave: secreta, prefer: 'resolution=ignore-duplicates,return=minimal', corpo: { modulo_id: md.id, mentor_id: perfilId } });
        await chamar(`/rest/v1/modulos?id=eq.${md.id}`, { metodo: 'PATCH', chave: secreta, prefer: 'return=minimal',
          corpo: { recomendacoes: String(md.recomendacoes).replace(m[0], `Quem conduz: ${m[1].trim()}`) } });
        aulas += 1;
      }
      resultados.push({ nome: x.nome, ok: true, aulas, ja: !!(ja.ok && ja.dados && ja.dados[0]) });
    }
    return resposta('Cadastro simples feito. Nenhum e-mail foi enviado.', 200, { resultados });
  }

  // Coloca o e-mail de verdade em quem foi cadastrado sem e-mail (depois disso dá para mandar o convite).
  if (b.acao === 'trocar_email') {
    const novo = String(b.email || '').trim().toLowerCase();
    if (!UUID.test(String(b.perfil_id || ''))) return resposta('Pessoa inválida.', 400);
    if (!EMAIL.test(novo) || novo.endsWith(PENDENTE)) return resposta('E-mail inválido.', 400);
    const p = await chamar(`/rest/v1/perfis?id=eq.${b.perfil_id}&select=email,nome,papel,tambem_mentor`, { chave: secreta });
    const pessoa = p.ok && p.dados && p.dados[0];
    if (!pessoa) return resposta('Pessoa não encontrada.', 404);
    const outro = await chamar(`/rest/v1/perfis?email=eq.${encodeURIComponent(novo)}&select=id,nome`, { chave: secreta });
    if (outro.ok && outro.dados && outro.dados[0] && outro.dados[0].id !== b.perfil_id) return resposta(`Este e-mail já é o login de ${outro.dados[0].nome}.`, 409);
    const u = await chamar(`/auth/v1/admin/users/${b.perfil_id}`, { metodo: 'PUT', chave: secreta, corpo: { email: novo, email_confirm: true } });
    if (!u.ok) return resposta('Não consegui trocar o e-mail do acesso. Talvez ele já seja usado por outra pessoa.', 502, { detalhe: JSON.stringify(u.dados || '').slice(0, 300) });
    const pp = await chamar(`/rest/v1/perfis?id=eq.${b.perfil_id}`, { metodo: 'PATCH', chave: secreta, token, corpo: { email: novo } });
    if (!pp.ok) return resposta('O acesso mudou, mas o perfil não. Tente de novo.', 502);
    await chamar(`/rest/v1/convites?email=eq.${encodeURIComponent(pessoa.email)}`, { metodo: 'DELETE', chave: secreta });
    await chamar('/rest/v1/convites', { metodo: 'POST', chave: secreta, prefer: 'resolution=merge-duplicates,return=minimal',
      corpo: { email: novo, nome: pessoa.nome, papel: pessoa.papel, tambem_mentor: !!pessoa.tambem_mentor, criado_por: eu.dados.id, usado_em: new Date().toISOString() } });
    return resposta(`E-mail de ${pessoa.nome} salvo. Agora dá para mandar o convite.`);
  }
  const email = String(b.email || '').trim().toLowerCase();
  const nome = String(b.nome || '').trim().slice(0, 120);
  const papel = b.papel;
  if (!EMAIL.test(email)) return resposta('E-mail inválido.', 400);
  if (!nome) return resposta('Informe o nome.', 400);
  if (!['admin', 'mentor', 'mentorado', 'aluno', 'rh'].includes(papel)) return resposta('Tipo de acesso inválido.', 400);
  const mentoradoId = papel === 'mentorado' ? b.mentorado_id : null;
  if (papel === 'mentorado' && !UUID.test(String(mentoradoId || ''))) return resposta('Mentorado inválido.', 400);
  const PAPEIS = { admin: 'administração', mentor: 'mentor', mentorado: 'mentorado', aluno: 'aluno', rh: 'RH da empresa' };

  // Aluno de turma (script 44): o convite é de uma linha da lista de alunos da turma.
  let aluno = null;
  if (papel === 'aluno') {
    if (!UUID.test(String(b.turma_aluno_id || ''))) return resposta('Aluno inválido.', 400);
    const a = await chamar(`/rest/v1/turma_alunos?id=eq.${b.turma_aluno_id}&select=id,email,turma:turmas(nome,empresa:empresas(nome,marca))`, { chave: secreta });
    aluno = a.ok && a.dados && a.dados[0];
    if (!aluno) return resposta(a.ok ? 'Aluno não encontrado na turma.' : 'Falta rodar o script 44-alunos-das-turmas.sql no Supabase.', a.ok ? 404 : 500);
    if (aluno.email !== email) await chamar(`/rest/v1/turma_alunos?id=eq.${aluno.id}`, { metodo: 'PATCH', chave: secreta, corpo: { email } });
  }
  // RH da empresa cliente (script 49): o convite é de uma linha de empresa_rh (painel só com números da empresa)
  let rh = null;
  if (papel === 'rh') {
    if (!UUID.test(String(b.empresa_rh_id || ''))) return resposta('Pessoa do RH inválida.', 400);
    const a = await chamar(`/rest/v1/empresa_rh?id=eq.${b.empresa_rh_id}&select=id,email,empresa:empresas(nome,marca)`, { chave: secreta });
    rh = a.ok && a.dados && a.dados[0];
    if (!rh) return resposta(a.ok ? 'Pessoa do RH não encontrada.' : 'Falta rodar o script 49-presenca-rh-envios-lembretes.sql no Supabase.', a.ok ? 404 : 500);
    if (rh.email !== email) await chamar(`/rest/v1/empresa_rh?id=eq.${rh.id}`, { metodo: 'PATCH', chave: secreta, corpo: { email } });
  }
  const marcarAluno = (mud) => (aluno ? chamar(`/rest/v1/turma_alunos?id=eq.${aluno.id}`, { metodo: 'PATCH', chave: secreta, prefer: 'return=minimal', corpo: mud })
    : rh ? chamar(`/rest/v1/empresa_rh?id=eq.${rh.id}`, { metodo: 'PATCH', chave: secreta, prefer: 'return=minimal', corpo: mud }) : null);
  const emp = (aluno && aluno.turma && aluno.turma.empresa) || (rh && rh.empresa);
  const logoCaminho = emp && emp.marca && emp.marca.logo && emp.marca.logo.caminho;
  const logoUrl = logoCaminho ? `${SUPABASE_URL}/storage/v1/object/public/fotos/${logoCaminho.split('/').map(encodeURIComponent).join('/')}` : null;
  const trilha = aluno && aluno.turma ? { nome: aluno.turma.nome, empresa: emp && emp.nome, logo: logoUrl } : null;
  const empresaRh = rh ? { empresa: emp && emp.nome, logo: logoUrl } : null;

  // 2b. O e-mail já é de alguém da plataforma com outro papel? Então não gera convite nem link.
  const existente = await chamar(`/rest/v1/perfis?email=eq.${encodeURIComponent(email)}&select=id,nome,papel,termo_aceito_em`, { chave: secreta });
  const dono = existente.ok && existente.dados && existente.dados[0];
  if (dono && (dono.papel !== papel || ((aluno || rh) && dono.termo_aceito_em && !b.reenviar))) {
    // RH que já entra (cuida de outra empresa também): a empresa nova passa a aparecer no painel dele
    if (rh && dono.papel === 'rh') {
      await marcarAluno({ perfil_id: dono.id, convidado_em: new Date().toISOString() });
      return resposta(`${dono.nome} já entra na plataforma com este e-mail. A empresa passou a aparecer no painel do RH, com a mesma senha. Nenhum e-mail foi enviado.`, 200, { ja_tem_login: true });
    }
    // aluno que já entra na plataforma (mentorado individual, ou aluno de outra trilha): a trilha só passa a aparecer na área dele
    if (aluno) {
      await marcarAluno({ perfil_id: dono.id, convidado_em: new Date().toISOString() });
      return resposta(`${dono.nome} já entra na plataforma com este e-mail (${PAPEIS[dono.papel] || dono.papel}). A trilha passou a aparecer em "Minha trilha", com a mesma senha. Nenhum e-mail foi enviado.`, 200, { ja_tem_login: true });
    }
    return resposta(`Este e-mail já é o login de ${dono.nome} (${PAPEIS[dono.papel] || dono.papel}). Use outro e-mail para ${nome}.`, 409);
  }

  // 3. Grava (ou atualiza) o convite
  const conv = await chamar('/rest/v1/convites', {
    metodo: 'POST', chave: secreta, prefer: 'resolution=merge-duplicates,return=minimal',
    corpo: { email, nome, papel, tambem_mentor: papel === 'admin' && !!b.tambem_mentor, mentorado_id: mentoradoId, criado_por: eu.dados.id, usado_em: null },
  });
  if (!conv.ok) return resposta('Não foi possível gravar o convite.', 500, { detalhe: conv.dados && conv.dados.message });

  const site = (env('URL') || new URL(req.url).origin).replace(/\/$/, '');

  // 4a. Link para mandar por WhatsApp: garante o login (sem e-mail) e gera o link de criar senha (não expira).
  if (b.canal === 'link') {
    const login = await garantirLogin(secreta, email, nome);
    if (!login.id) return resposta('Não foi possível preparar o acesso.', 502, { detalhe: login.erro });
    await marcarAluno({ perfil_id: login.id, convidado_em: new Date().toISOString() });
    return resposta('Link de acesso gerado. Nenhum e-mail foi enviado.', 200, { link: linkDeAcesso(site, login.id) });
  }

  // 4b. Só preparar: cria o acesso sem mandar e-mail (a pessoa ainda não consegue entrar).
  if (b.sem_email) {
    const cria = await chamar('/auth/v1/admin/users', {
      metodo: 'POST', chave: secreta, corpo: { email, email_confirm: true, user_metadata: { nome } },
    });
    if (cria.ok) { if (cria.dados && cria.dados.id) await marcarAluno({ perfil_id: cria.dados.id }); return resposta(`${nome} foi preparado(a). Nenhum e-mail foi enviado.`); }
    if (cria.status === 422 || /already|exists|registered/i.test(JSON.stringify(cria.dados || ''))) {
      return resposta(`${nome} já estava preparado(a). Nenhum e-mail foi enviado.`);
    }
    return resposta('Não foi possível preparar o acesso.', 502, { detalhe: JSON.stringify(cria.dados || '').slice(0, 300) });
  }

  // 4c. Envia o e-mail de convite pelo Brevo, com o link que não expira.
  const login = await garantirLogin(secreta, email, nome);
  if (login.id) {
    await marcarAluno({ perfil_id: login.id });
    const envio = await enviarLinkPorEmail({ email, nome, link: linkDeAcesso(site, login.id), trilha, rh: empresaRh });
    if (envio.enviado) {
      await marcarAluno({ convidado_em: new Date().toISOString() });
      return resposta(`Convite enviado para ${email}. O link não expira: vale até a pessoa criar a senha.`);
    }
    console.warn('Convite pelo Brevo não saiu:', envio.mensagem);
  }

  // Sem o Brevo: o e-mail do próprio Supabase (esse link vence em algumas horas).
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
