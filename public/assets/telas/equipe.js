// Equipe (administração): mentores e administradores, convites pendentes e envio de convites.
import { sb, esc, avatar, dataHoraBR, avisar, explicarErro } from '../base.js';

// Quem foi cadastrado sem e-mail tem um endereço provisório: precisa do e-mail de verdade antes do convite.
export const emailPendente = (e) => /@pendente\.mentorei\.com\.br$/i.test(String(e || ''));
const SEM_EMAIL = 'Esta pessoa ainda não tem e-mail. Coloque o e-mail em Mentores → Editar dados e depois mande o convite.';

// Envia o convite pelo servidor (a chave secreta do Supabase fica só lá).
export async function convidar({ email, nome, papel, tambem_mentor = false, mentorado_id = null, sem_email = false }) {
  if (emailPendente(email)) { avisar(SEM_EMAIL, true); return false; }
  const { data } = await sb.auth.getSession();
  try {
    const r = await fetch('/api/convidar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ email, nome, papel, tambem_mentor, mentorado_id, sem_email }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (j.detalhe) console.warn('Detalhe do convite:', j.detalhe); throw new Error(j.mensagem || 'Não foi possível enviar o convite.'); }
    avisar(j.mensagem || 'Convite enviado.');
    return true;
  } catch (e) { avisar(explicarErro(e), true); return false; }
}

// Janela com a mensagem pronta para mandar do seu WhatsApp (você confere, ajusta e envia).
export function janelaWhatsApp({ titulo, nota, whatsapp = '', texto }) {
  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(9,18,22,.55);z-index:40;display:grid;place-items:center;padding:16px';
  fundo.innerHTML = `<div class="cartao" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="width:100%;max-width:560px;max-height:90vh;overflow:auto">
    <div class="linha"><h3 style="flex:1">${esc(titulo)}</h3><button class="btn peq" data-fechar>Fechar</button></div>
    ${nota ? `<p class="peq apagado mt">${esc(nota)}</p>` : ''}
    <div class="campo mt"><label for="w-num">WhatsApp da pessoa (com DDD)</label><input id="w-num" type="tel" placeholder="Em branco: você escolhe o contato no WhatsApp" value="${esc(whatsapp || '')}"></div>
    <div class="campo mt"><label for="w-txt">Mensagem</label><textarea id="w-txt" style="min-height:190px">${esc(texto)}</textarea></div>
    <div class="linha mt"><a class="btn pri" id="w-abrir" target="_blank" rel="noopener">Abrir no WhatsApp</a><button class="btn" id="w-copiar">Copiar mensagem</button></div>
  </div>`;
  document.body.appendChild(fundo);
  const montar = () => {
    const num = fundo.querySelector('#w-num').value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const msg = encodeURIComponent(fundo.querySelector('#w-txt').value);
    fundo.querySelector('#w-abrir').href = num ? `https://wa.me/55${num}?text=${msg}` : `https://wa.me/?text=${msg}`;
  };
  montar();
  fundo.querySelectorAll('#w-num, #w-txt').forEach((x) => x.addEventListener('input', montar));
  fundo.querySelector('#w-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(fundo.querySelector('#w-txt').value); avisar('Mensagem copiada.'); }
    catch (_) { fundo.querySelector('#w-txt').select(); avisar('Selecionei o texto: aperte Ctrl + C para copiar.'); }
  });
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fundo.remove(); });
}

// Convite pelo WhatsApp: a plataforma gera o link de criar senha (nenhum e-mail sai)
// e abre a janela com a mensagem pronta. "contexto" entra no texto (ex.: a trilha que a pessoa vai acompanhar).
export async function conviteWhatsApp({ email, nome, papel, tambem_mentor = false, mentorado_id = null, whatsapp = '', remetente = '', contexto = '' }) {
  if (emailPendente(email)) { avisar(SEM_EMAIL, true); return false; }
  const { data } = await sb.auth.getSession();
  let j;
  try {
    const r = await fetch('/api/convidar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ email, nome, papel, tambem_mentor, mentorado_id, canal: 'link' }),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok || !j.link) { if (j.detalhe) console.warn('Detalhe do convite:', j.detalhe); throw new Error(j.mensagem || 'Não foi possível gerar o link.'); }
  } catch (e) { avisar(explicarErro(e), true); return false; }

  const primeiro = String(nome || '').split(' ')[0];
  const quem = remetente ? `Aqui é ${remetente.split(' ')[0]}, da Mentorei.` : 'Aqui é da Mentorei.';
  const texto = `Olá, ${primeiro}! ${quem} Seu acesso à plataforma de mentorias está pronto.${contexto ? `\n\n${contexto}` : ''}\n\nPara entrar, crie sua senha neste link:\n${j.link}\n\nSeu login é este e-mail: ${email}\n\nO link vale por tempo limitado. Se expirar, me avise que eu mando outro.`;
  janelaWhatsApp({ titulo: `Convite por WhatsApp · ${nome}`, nota: 'O link foi gerado e nenhum e-mail foi enviado. Confira a mensagem e mande pelo seu WhatsApp.', whatsapp, texto });
  return true;
}

const PAPEL = { admin: 'Administração', mentor: 'Mentor', mentorado: 'Mentorado' };

export async function render(ctx, el) {
  const [{ data: pessoas, error }, { data: convites }, { data: acessos }] = await Promise.all([
    sb.from('perfis').select('id, nome, email, papel, tambem_mentor, foto_url, termo_aceito_em, ativo').in('papel', ['admin', 'mentor']).order('nome'),
    sb.from('convites').select('*').is('usado_em', null).order('criado_em', { ascending: false }),
    sb.from('acessos').select('perfil_id, entrou_em, ultimo_sinal_em, aparelho').order('entrou_em', { ascending: false }).limit(300),
  ]);
  if (error) throw error;
  const ultimo = {};
  (acessos || []).forEach((a) => { if (!ultimo[a.perfil_id]) ultimo[a.perfil_id] = a; });
  const nomes = Object.fromEntries((pessoas || []).map((p) => [p.id, p.nome]));

  el.innerHTML = `
    <div class="cab"><div><h1>Equipe</h1><p class="sub">Mentores e administração. O convite pode ir por e-mail ou pelo seu WhatsApp, com um link para criar a senha.</p></div></div>
    <div class="grade g2">
      <div class="cartao"><h3>Convidar pessoa da equipe</h3>
        <form id="f-conv" class="grade mt" style="gap:10px">
          <div class="campo"><label for="c-nome">Nome</label><input id="c-nome" type="text" required></div>
          <div class="campo"><label for="c-email">E-mail (vira o login)</label><input id="c-email" type="email" required></div>
          <div class="campo"><label for="c-papel">Tipo de acesso</label><select id="c-papel"><option value="mentor">Mentor</option><option value="admin">Administração</option></select></div>
          <label class="check"><input type="checkbox" id="c-tambem"> <span>Também atende mentorados (só para administração)</span></label>
          <div class="linha"><button class="btn pri" type="submit" data-modo="preparar">Preparar sem enviar e-mail</button>
            <button class="btn" type="submit" data-modo="enviar">Enviar convite agora</button></div>
          <p class="peq apagado">"Preparar" cadastra a pessoa na plataforma sem avisar ninguém. Ela só consegue entrar depois que você enviar o convite.</p>
        </form></div>
      <div class="cartao"><h3>Ainda não preparados</h3>
        ${(convites || []).length ? `<p class="peq apagado mt">Estas pessoas estão na lista, mas ainda não existem na plataforma. Prepare antes de importar a planilha.</p>
          <div class="linha mt"><button class="btn pri peq" id="preparar-todos">Preparar todos sem enviar e-mail</button></div>
          <div class="tabela mt"><table><tr><th>Pessoa</th><th>Tipo</th><th></th></tr>
          ${convites.map((c) => `<tr><td>${esc(c.nome)}<br><span class="peq apagado">${esc(c.email)}</span></td><td>${PAPEL[c.papel]}</td>
          <td><div class="linha"><button class="btn peq" data-preparar="${esc(c.email)}">Preparar (sem e-mail)</button>
            <button class="btn peq" data-enviar="${esc(c.email)}">Enviar convite</button>
            <button class="btn peq" data-whats="${esc(c.email)}">WhatsApp</button></div></td></tr>`).join('')}</table></div>`
          : '<p class="apagado mt">Todos já foram preparados. Veja a lista "Pessoas na plataforma" abaixo.</p>'}
      </div>
    </div>
    <div class="cartao mt"><h3>Pessoas na plataforma</h3><p class="peq apagado mt">Quem está com "Convite não enviado" já existe na plataforma, mas ainda não recebeu nenhum e-mail.</p>
      <div class="tabela mt"><table><tr><th>Pessoa</th><th>Tipo</th><th>Primeiro acesso</th><th>Último acesso</th><th></th></tr>
      ${(pessoas || []).map((p) => { const a = ultimo[p.id]; return `<tr><td><div class="linha">${avatar(p)}<div><a href="#/pessoa/${p.id}"><b>${esc(p.nome)}</b></a><br><span class="peq apagado">${esc(p.email)}</span></div></div></td>
        <td>${PAPEL[p.papel]}${p.tambem_mentor ? ' e mentora' : ''}</td>
        <td>${p.termo_aceito_em ? `<span class="selo">Feito</span>` : `<span class="selo alerta">Convite não enviado ou não aceito</span>${p.id !== ctx.perfil.id ? ` <button class="btn peq" data-enviar-pessoa="${p.id}">Enviar convite</button> <button class="btn peq" data-whats-pessoa="${p.id}">WhatsApp</button>` : ''}`}</td>
        <td class="peq">${a ? `${dataHoraBR(a.entrou_em)} · ${esc(a.aparelho || '')}` : '—'}</td>
        <td><div class="linha"><a class="btn peq" href="#/pessoa/${p.id}">Editar perfil</a>${p.ativo ? `<button class="btn peq perigo" data-desativar="${p.id}">Desativar</button>` : `<button class="btn peq" data-ativar="${p.id}">Reativar</button>`}</div></td></tr>`; }).join('')}
      </table></div></div>
    <div class="cartao mt"><h3>Acessos recentes</h3>
      <div class="tabela mt"><table><tr><th>Pessoa</th><th>Entrou</th><th>Última atividade</th><th>Aparelho</th></tr>
      ${(acessos || []).slice(0, 40).map((a) => `<tr><td>${esc(nomes[a.perfil_id] || 'Mentorado')}</td><td>${dataHoraBR(a.entrou_em)}</td><td>${dataHoraBR(a.ultimo_sinal_em)}</td><td>${esc(a.aparelho || '')}</td></tr>`).join('')
        || '<tr><td colspan="4" class="apagado">Nenhum acesso ainda.</td></tr>'}</table></div></div>`;

  el.querySelector('#f-conv').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = el.querySelector('#c-nome').value.trim(), email = el.querySelector('#c-email').value.trim().toLowerCase();
    if (!nome || !email) { avisar('Preencha o nome e o e-mail.', true); return; }
    const papel = el.querySelector('#c-papel').value;
    const semEmail = !ev.submitter || ev.submitter.dataset.modo !== 'enviar';
    const ok = await convidar({ email, nome, papel, tambem_mentor: papel === 'admin' && el.querySelector('#c-tambem').checked, sem_email: semEmail });
    if (ok) ctx.irPara('#/equipe');
  });
  el.addEventListener('click', async (ev) => {
    const prep = ev.target.closest('[data-preparar],[data-enviar]');
    if (prep) {
      const c = convites.find((x) => x.email === (prep.dataset.preparar || prep.dataset.enviar));
      prep.disabled = true;
      const ok = await convidar({ email: c.email, nome: c.nome, papel: c.papel, tambem_mentor: c.tambem_mentor, mentorado_id: c.mentorado_id, sem_email: !!prep.dataset.preparar });
      if (ok) ctx.irPara('#/equipe'); else prep.disabled = false;
      return;
    }
    if (ev.target.id === 'preparar-todos') {
      ev.target.disabled = true;
      for (const c of convites.filter((x) => x.papel !== 'mentorado')) {
        await convidar({ email: c.email, nome: c.nome, papel: c.papel, tambem_mentor: c.tambem_mentor, sem_email: true });
      }
      avisar('Equipe preparada. Nenhum e-mail foi enviado.');
      ctx.irPara('#/equipe');
      return;
    }
    const wc = ev.target.closest('[data-whats]');
    if (wc) {
      const c = convites.find((x) => x.email === wc.dataset.whats);
      wc.disabled = true;
      await conviteWhatsApp({ email: c.email, nome: c.nome, papel: c.papel, tambem_mentor: c.tambem_mentor, mentorado_id: c.mentorado_id, remetente: ctx.perfil.nome });
      wc.disabled = false;
      return;
    }
    const wp = ev.target.closest('[data-whats-pessoa]');
    if (wp) {
      const p = pessoas.find((x) => x.id === wp.dataset.whatsPessoa);
      wp.disabled = true;
      await conviteWhatsApp({ email: p.email, nome: p.nome, papel: p.papel, tambem_mentor: p.tambem_mentor, remetente: ctx.perfil.nome });
      wp.disabled = false;
      return;
    }
    const ep = ev.target.closest('[data-enviar-pessoa]');
    if (ep) {
      const p = pessoas.find((x) => x.id === ep.dataset.enviarPessoa);
      ep.disabled = true;
      await convidar({ email: p.email, nome: p.nome, papel: p.papel, tambem_mentor: p.tambem_mentor });
      ep.disabled = false;
      return;
    }
    const d = ev.target.closest('[data-desativar],[data-ativar]');
    if (d) {
      const id = d.dataset.desativar || d.dataset.ativar;
      if (id === ctx.perfil.id) { avisar('Você não pode desativar o seu próprio acesso.', true); return; }
      const { error: e } = await sb.from('perfis').update({ ativo: !!d.dataset.ativar }).eq('id', id);
      if (e) avisar(explicarErro(e), true); else ctx.irPara('#/equipe');
    }
  });
}
