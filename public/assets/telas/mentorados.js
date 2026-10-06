// Lista de mentorados. "#/meus": os do mentor logado. "#/mentorados": todos (administração), com filtro por empresa e programa.
import { pendencias } from './pendencias.js';
import { sb, esc, avatar, diaMes, horaBR, hojeISO, mesmoDia } from '../base.js';

const SELECT = `id, nome, cargo, status, sala_meet,
  programa:programas(id, nome, sessoes_por_mentorado, empresa:empresas(id, nome)),
  perfil:perfis!mentorados_perfil_id_fkey(foto_url, whatsapp),
  vinculos:mentor_mentorado(ordem, mentor_id, mentor:perfis(nome)),
  sessoes(id, numero, data_hora, situacao, concluida_em, tarefa, tarefa_prazo, tarefa_feita_em, mentor_id)`;

export async function render(ctx, el) {
  const meus = ctx.rota === 'meus';
  let consulta = sb.from('mentorados').select(SELECT).order('nome');
  if (meus) {
    const { data: v } = await sb.from('mentor_mentorado').select('mentorado_id').eq('mentor_id', ctx.perfil.id);
    const ids = (v || []).map((x) => x.mentorado_id);
    if (!ids.length) {
      el.innerHTML = `<div class="cab"><div><h1>Meus mentorados</h1></div></div>
        <div class="vazio">Você ainda não tem mentorados. A administração da Mentorei faz essa ligação.</div>`;
      return;
    }
    consulta = consulta.in('id', ids);
  }
  const { data, error } = await consulta;
  if (error) throw error;
  const hoje = hojeISO();
  const agora = Date.now();

  const linhas = (data || []).map((m) => {
    const sess = (m.sessoes || []).slice().sort((a, b) => a.numero - b.numero);
    const feitas = sess.filter((s) => s.situacao === 'realizada').length;
    const proxima = sess.find((s) => !s.concluida_em && s.data_hora && new Date(s.data_hora).getTime() > agora - 3 * 3600 * 1000);
    const deHoje = sess.find((s) => mesmoDia(s.data_hora, hoje) && (!meus || s.mentor_id === ctx.perfil.id));
    const atrasada = sess.some((s) => s.tarefa && s.tarefa_prazo && !s.tarefa_feita_em && s.tarefa_prazo < hoje);
    const mentores = (m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((x) => x.mentor && x.mentor.nome).filter(Boolean);
    return { m, sess, feitas, proxima, deHoje, atrasada, mentores };
  });

  // filtros (só para a administração)
  const empresas = [...new Map((data || []).filter((m) => m.programa).map((m) => [m.programa.empresa.id, m.programa.empresa.nome]))];
  const programas = [...new Map((data || []).filter((m) => m.programa).map((m) => [m.programa.id, `${m.programa.empresa.nome} · ${m.programa.nome}`]))];

  el.innerHTML = `
    <div class="cab"><div><h1>${meus ? 'Meus mentorados' : 'Mentorados'}</h1>
      <p class="sub">${linhas.filter((l) => l.m.status === 'ativo').length} ativos · ${linhas.filter((l) => l.deHoje).length} com sessão hoje</p></div>
      ${ctx.ehAdmin && !meus ? '<div class="acoes"><a class="btn escuro" href="#/painel/novo-mentorado">+ Novo mentorado</a></div>' : ''}</div>
    <div class="linha" style="margin-bottom:14px">
      <input type="text" id="busca" placeholder="Buscar pelo nome…" style="flex:1;min-width:200px">
      ${!meus ? `<select id="f-empresa" style="width:auto"><option value="">Todas as empresas</option>${empresas.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select>
      <select id="f-programa" style="width:auto"><option value="">Todos os programas</option>${programas.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select>` : ''}
      <select id="f-status" style="width:auto"><option value="ativo">Ativos</option><option value="">Todos</option><option value="concluido">Concluídos</option></select>
    </div>
    ${meus ? '<div id="pendencias" style="margin-bottom:18px"></div>' : ''}
    <div class="lista" id="lista"></div>`;

  const desenhar = () => {
    const busca = el.querySelector('#busca').value.trim().toLowerCase();
    const fe = el.querySelector('#f-empresa')?.value || '', fp = el.querySelector('#f-programa')?.value || '', fs = el.querySelector('#f-status').value;
    const filtradas = linhas.filter(({ m }) => (!busca || m.nome.toLowerCase().includes(busca))
      && (!fe || (m.programa && m.programa.empresa.id === fe)) && (!fp || (m.programa && m.programa.id === fp)) && (!fs || m.status === fs))
      .sort((a, b) => (b.deHoje ? 1 : 0) - (a.deHoje ? 1 : 0) || (a.deHoje && b.deHoje ? new Date(a.deHoje.data_hora) - new Date(b.deHoje.data_hora) : 0));
    el.querySelector('#lista').innerHTML = filtradas.length ? filtradas.map(({ m, sess, feitas, proxima, deHoje, atrasada, mentores }) => `
      <a class="item" href="#/mentorado/${m.id}" ${deHoje ? 'style="border-color:var(--verde);background:var(--verde-claro)"' : ''}>
        ${avatar({ nome: m.nome, foto_url: m.perfil && m.perfil.foto_url })}
        <div style="min-width:0"><div class="nome">${esc(m.nome)}
          ${deHoje ? `<span class="selo">Hoje · ${horaBR(deHoje.data_hora)}</span>` : ''}
          ${atrasada ? '<span class="selo alerta">Tarefa atrasada</span>' : ''}
          ${m.status !== 'ativo' ? `<span class="selo neutro">${esc(m.status)}</span>` : ''}</div>
          <div class="info">${esc(m.cargo || 'Cargo a preencher')}${m.programa ? ` · ${esc(m.programa.empresa.nome)} · ${esc(m.programa.nome)}` : ''}</div>
          <div class="info">Sessões feitas: ${feitas} de ${sess.length}${proxima ? ` · próxima ${diaMes(proxima.data_hora)} às ${horaBR(proxima.data_hora)}` : ''}${mentores.length ? ` · ${esc(mentores.join(' e '))}` : ''}</div></div>
        <span class="btn peq">${deHoje ? 'Abrir' : 'Ver ficha'}</span>
      </a>`).join('') : '<div class="vazio">Nenhum mentorado com esses filtros.</div>';
  };
  el.querySelectorAll('#busca, select').forEach((x) => x.addEventListener('input', desenhar));
  desenhar();
  if (meus) pendencias(el.querySelector('#pendencias'), { mentoradoIds: (data || []).map((m) => m.id), mostrarMentor: false });
}
