// Equipe (administração): mentores e administradores, convites pendentes e envio de convites.
import { sb, esc, avatar, dataHoraBR, avisar, explicarErro } from '../base.js';

// Envia o convite pelo servidor (a chave secreta do Supabase fica só lá).
export async function convidar({ email, nome, papel, tambem_mentor = false, mentorado_id = null, sem_email = false }) {
  const { data } = await sb.auth.getSession();
  try {
    const r = await fetch('/api/convidar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ email, nome, papel, tambem_mentor, mentorado_id, sem_email }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.mensagem || 'Não foi possível enviar o convite.');
    avisar(j.mensagem || 'Convite enviado.');
    return true;
  } catch (e) { avisar(explicarErro(e), true); return false; }
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
    <div class="cab"><div><h1>Equipe</h1><p class="sub">Mentores e administração. Cada convite chega por e-mail com um link para criar a senha.</p></div></div>
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
            <button class="btn peq" data-enviar="${esc(c.email)}">Enviar convite</button></div></td></tr>`).join('')}</table></div>`
          : '<p class="apagado mt">Todos já foram preparados. Veja a lista "Pessoas na plataforma" abaixo.</p>'}
      </div>
    </div>
    <div class="cartao mt"><h3>Pessoas na plataforma</h3><p class="peq apagado mt">Quem está com "Convite não enviado" já existe na plataforma, mas ainda não recebeu nenhum e-mail.</p>
      <div class="tabela mt"><table><tr><th>Pessoa</th><th>Tipo</th><th>Primeiro acesso</th><th>Último acesso</th><th></th></tr>
      ${(pessoas || []).map((p) => { const a = ultimo[p.id]; return `<tr><td><div class="linha">${avatar(p)}<div>${esc(p.nome)}<br><span class="peq apagado">${esc(p.email)}</span></div></div></td>
        <td>${PAPEL[p.papel]}${p.tambem_mentor ? ' e mentora' : ''}</td>
        <td>${p.termo_aceito_em ? `<span class="selo">Feito</span>` : `<span class="selo alerta">Convite não enviado ou não aceito</span>${p.id !== ctx.perfil.id ? ` <button class="btn peq" data-enviar-pessoa="${p.id}">Enviar convite</button>` : ''}`}</td>
        <td class="peq">${a ? `${dataHoraBR(a.entrou_em)} · ${esc(a.aparelho || '')}` : '—'}</td>
        <td>${p.ativo ? `<button class="btn peq perigo" data-desativar="${p.id}">Desativar</button>` : `<button class="btn peq" data-ativar="${p.id}">Reativar</button>`}</td></tr>`; }).join('')}
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
