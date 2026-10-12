// Convites em lote (administração): mentorados e equipe numa lista só, com a situação de cada um,
// e um botão que manda o convite por e-mail para todos os marcados (o link não expira: vale até a pessoa criar a senha).
// "#/convites/brasdiesel,lorena" já abre mostrando e marcando quem combina com esses nomes (empresa, programa ou pessoa).
import { sb, esc, avisar, explicarErro } from '../base.js';
import { emailPendente } from './equipe.js';

const sem = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PAPEL = { admin: 'Administração', mentor: 'Mentor(a)', mentorado: 'Mentorado(a)' };
const SITUACAO = {
  entrou: ['Já entrou na plataforma', ''],
  preparado: ['Ainda não entrou', 'alerta'],
  novo: ['Ainda não convidado', 'neutro'],
  sem_email: ['Sem e-mail', 'erro'],
};

export async function render(ctx, el, [filtro = '']) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração manda convites.</div>'; return; }
  const [ment, equipe, acessos] = await Promise.all([
    sb.from('mentorados').select('id, nome, email, status, perfil_id, programa:programas(nome, empresa:empresas(nome)), perfil:perfis!mentorados_perfil_id_fkey(termo_aceito_em)').order('nome'),
    sb.from('perfis').select('id, nome, email, papel, tambem_mentor, ativo, termo_aceito_em').in('papel', ['admin', 'mentor']).order('nome'),
    sb.from('acessos').select('perfil_id').limit(5000),
  ]);
  for (const r of [ment, equipe]) if (r.error) throw r.error;
  const entraram = new Set((acessos.data || []).map((a) => a.perfil_id));

  const pessoas = [
    ...(ment.data || []).map((m) => ({
      chave: `m-${m.id}`, nome: m.nome, email: (m.email || '').trim(), papel: 'mentorado', mentorado_id: m.id,
      onde: m.programa ? `${m.programa.empresa ? `${m.programa.empresa.nome} · ` : ''}${m.programa.nome}` : '',
      ativo: m.status === 'ativo', teste: /modelo|teste/i.test(m.nome),
      situacao: !(m.email || '').trim() ? 'sem_email' : (m.perfil && m.perfil.termo_aceito_em) || entraram.has(m.perfil_id) ? 'entrou' : m.perfil_id ? 'preparado' : 'novo',
    })),
    ...(equipe.data || []).map((p) => ({
      chave: `p-${p.id}`, nome: p.nome, email: emailPendente(p.email) ? '' : p.email, papel: p.papel, tambem_mentor: !!p.tambem_mentor,
      onde: 'Equipe Mentorei', ativo: p.ativo, teste: false,
      situacao: emailPendente(p.email) ? 'sem_email' : p.termo_aceito_em || entraram.has(p.id) ? 'entrou' : 'preparado',
    })),
  ];

  // filtro do endereço: cada palavra pode ser empresa, programa ou nome da pessoa
  const termos = decodeURIComponent(filtro).split(',').map(sem).map((t) => t.trim()).filter(Boolean);
  const peloNome = (x) => termos.some((t) => sem(x.nome).split(/\s+/).some((n) => n.startsWith(t)));
  const combina = (x) => !termos.length || peloNome(x) || termos.some((t) => sem(x.onde).includes(t));
  const lista = pessoas.filter(combina);
  // marcados de saída: quem combina, tem e-mail, está ativo e não é cadastro de teste; pela empresa, só quem ainda não entrou
  const marcados = new Set(termos.length ? lista.filter((x) => x.email && x.ativo && !x.teste && (x.situacao !== 'entrou' || peloNome(x))).map((x) => x.chave) : []);

  el.innerHTML = `
    <div class="cab"><div><h1>Convites</h1>
      <p class="sub">Marque quem deve receber o convite por e-mail e clique em enviar. O link não expira: vale até a pessoa criar a senha.</p></div></div>
    ${termos.length ? `<div class="aviso mt">Mostrando só: <b>${esc(termos.join(', '))}</b>. <a href="#/convites">Ver todas as pessoas</a></div>` : ''}
    <div class="cartao mt">
      <div class="linha">
        <input type="search" id="cv-busca" placeholder="Procurar por nome, empresa ou e-mail" style="flex:1;min-width:200px">
        <button type="button" class="btn peq" id="cv-marcar">Marcar quem ainda não entrou</button>
        <button type="button" class="btn peq" id="cv-limpar">Desmarcar todos</button>
      </div>
      <div class="tabela mt"><table>
        <tr><th></th><th>Pessoa</th><th>Tipo</th><th>Empresa ou programa</th><th>E-mail (login)</th><th>Situação</th><th>Envio</th></tr>
        ${lista.map((x) => `<tr data-linha="${x.chave}">
          <td><input type="checkbox" data-marca="${x.chave}"${marcados.has(x.chave) ? ' checked' : ''}${x.email ? '' : ' disabled'} aria-label="Convidar ${esc(x.nome)}"></td>
          <td><b>${esc(x.nome)}</b>${x.teste ? ' <span class="selo neutro">teste</span>' : ''}${x.ativo ? '' : ' <span class="selo neutro">inativo</span>'}</td>
          <td>${PAPEL[x.papel] || x.papel}</td><td>${esc(x.onde || '—')}</td><td>${x.email ? esc(x.email) : '<span class="apagado">—</span>'}</td>
          <td><span class="selo ${SITUACAO[x.situacao][1]}">${SITUACAO[x.situacao][0]}</span></td>
          <td data-envio="${x.chave}" class="peq"></td></tr>`).join('') || '<tr><td colspan="7" class="apagado">Ninguém com esse nome.</td></tr>'}
      </table></div>
      <p class="peq apagado mt">Quem está sem e-mail precisa do e-mail na ficha (mentorado) ou em Mentores → Editar dados (equipe). Quem já entrou e receber de novo ganha um link para criar outra senha.</p>
      <div class="linha mt"><button type="button" class="btn pri" id="cv-enviar"></button><span class="peq apagado" id="cv-progresso"></span></div>
    </div>`;

  const caixas = () => [...el.querySelectorAll('[data-marca]')];
  const escolhidos = () => caixas().filter((c) => c.checked).map((c) => pessoas.find((x) => x.chave === c.dataset.marca));
  const botao = el.querySelector('#cv-enviar');
  const contar = () => { const n = escolhidos().length; botao.textContent = n ? `Enviar convite por e-mail para ${n} pessoa${n > 1 ? 's' : ''}` : 'Marque quem deve receber'; botao.disabled = !n; };
  contar();
  el.addEventListener('change', (ev) => { if (ev.target.closest('[data-marca]')) contar(); });
  el.querySelector('#cv-busca').addEventListener('input', (ev) => {
    const t = sem(ev.target.value);
    el.querySelectorAll('[data-linha]').forEach((tr) => { tr.hidden = !!t && !sem(tr.textContent).includes(t); });
  });
  el.querySelector('#cv-marcar').addEventListener('click', () => {
    caixas().forEach((c) => { const x = pessoas.find((p) => p.chave === c.dataset.marca); if (!c.closest('tr').hidden && x.email && x.ativo && !x.teste && x.situacao !== 'entrou') c.checked = true; });
    contar();
  });
  el.querySelector('#cv-limpar').addEventListener('click', () => { caixas().forEach((c) => { c.checked = false; }); contar(); });

  botao.addEventListener('click', async () => {
    const lote = escolhidos();
    if (!lote.length) return;
    if (!window.confirm(`Mandar agora o convite por e-mail para ${lote.length} pessoa${lote.length > 1 ? 's' : ''}?\n\n${lote.map((x) => `• ${x.nome} (${x.email})`).join('\n')}`)) return;
    botao.disabled = true;
    const progresso = el.querySelector('#cv-progresso');
    const { data: { session } } = await sb.auth.getSession();
    let ok = 0;
    const falhas = [];
    for (const [i, x] of lote.entries()) {
      progresso.textContent = `Enviando ${i + 1} de ${lote.length}…`;
      const celula = el.querySelector(`[data-envio="${x.chave}"]`);
      try {
        const r = await fetch('/api/convidar', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: x.email, nome: x.nome, papel: x.papel, tambem_mentor: !!x.tambem_mentor, mentorado_id: x.mentorado_id || null }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.mensagem || 'não foi possível enviar');
        ok += 1;
        celula.innerHTML = '<span class="selo">✓ Enviado</span>';
        el.querySelector(`[data-marca="${x.chave}"]`).checked = false;
      } catch (e) {
        falhas.push(x.nome);
        celula.innerHTML = `<span class="selo erro">Não enviado</span><br>${esc(explicarErro(e))}`;
      }
    }
    progresso.textContent = `${ok} convite${ok === 1 ? '' : 's'} enviado${ok === 1 ? '' : 's'}${falhas.length ? `; não deu certo: ${falhas.join(', ')}` : ''}.`;
    avisar(progresso.textContent, !!falhas.length);
    contar();
  });
}
