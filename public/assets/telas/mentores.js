// Mentores (administração): lista de todos os mentores com nome completo, contatos, tipo de atendimento,
// trilhas individuais (mentorados por empresa e programa) e turmas de mentoria em grupo. Baixa a lista em Excel.
import { sb, esc, avatar, diaMes, horaBR, hojeISO, avisar, explicarErro } from '../base.js';
import { redes, linkRede } from './perfil-comum.js';

const temSobrenome = (nome) => String(nome || '').trim().split(/\s+/).filter((x) => x && !x.startsWith('(')).length >= 2;
const quando = (iso) => `${diaMes(iso)} às ${horaBR(iso)}`;
const SITUACAO_MTD = { pausado: 'pausado', concluido: 'concluído', desligado: 'desligado' };

export async function render(ctx, el) {
  const [rp, rv, rs, rm] = await Promise.all([
    sb.from('perfis').select('*').or('papel.eq.mentor,tambem_mentor.eq.true').order('nome'),
    sb.from('mentor_mentorado').select('mentor_id, mentorado:mentorados(id, nome, status, programa:programas(id, nome, status, empresa:empresas(nome)))'),
    sb.from('sessoes').select('mentor_id, data_hora, situacao, concluida_em, mentorado:mentorados(nome)').not('mentor_id', 'is', null),
    sb.from('modulo_mentores').select('mentor_id, modulo:modulos(id, numero, titulo, data_hora, turma:turmas(id, nome, status, empresa:empresas(nome)))'),
  ]);
  for (const r of [rp, rv, rs]) if (r.error) throw r.error;
  const grupoNoBanco = !rm.error; // a mentoria em grupo precisa do 11-mentoria-em-grupo.sql
  const agora = Date.now();

  const mentores = (rp.data || []).map((p) => {
    // trilhas individuais: mentorados agrupados por empresa e programa
    const trilhas = new Map();
    (rv.data || []).filter((v) => v.mentor_id === p.id && v.mentorado).forEach(({ mentorado: mt }) => {
      const pr = mt.programa || { id: 'sem', nome: 'Sem programa', empresa: { nome: '' } };
      if (!trilhas.has(pr.id)) trilhas.set(pr.id, { empresa: pr.empresa ? pr.empresa.nome : '', nome: pr.nome, status: pr.status, mentorados: [] });
      trilhas.get(pr.id).mentorados.push(mt);
    });
    const sess = (rs.data || []).filter((s) => s.mentor_id === p.id);
    const feitas = sess.filter((s) => s.situacao === 'realizada').length;
    const proxima = sess.filter((s) => !s.concluida_em && s.situacao === 'agendada' && s.data_hora && new Date(s.data_hora).getTime() > agora)
      .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];
    // turmas em grupo: módulos que a pessoa ministra, agrupados por turma
    const turmas = new Map();
    (grupoNoBanco ? rm.data || [] : []).filter((x) => x.mentor_id === p.id && x.modulo && x.modulo.turma).forEach(({ modulo: md }) => {
      const t = md.turma;
      if (!turmas.has(t.id)) turmas.set(t.id, { id: t.id, empresa: t.empresa ? t.empresa.nome : '', nome: t.nome, status: t.status, modulos: [] });
      turmas.get(t.id).modulos.push(md);
    });
    const aulas = [...turmas.values()].flatMap((t) => t.modulos.map((md) => ({ ...md, turma: t.nome })));
    const proximaAula = aulas.filter((md) => md.data_hora && new Date(md.data_hora).getTime() > agora).sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];
    return { p, trilhas: [...trilhas.values()], turmas: [...turmas.values()], feitas, proxima, proximaAula,
      nMentorados: [...trilhas.values()].reduce((n, t) => n + t.mentorados.length, 0) };
  });

  const ativos = mentores.filter((x) => x.p.ativo);
  el.innerHTML = `
    <div class="cab"><div><h1>Mentores</h1>
      <p class="sub">${ativos.length} ativos · ${ativos.filter((x) => x.trilhas.length).length} em trilhas individuais · ${ativos.filter((x) => x.turmas.length).length} em turmas em grupo</p></div>
      <div class="acoes"><button class="btn" id="baixar">Baixar lista (Excel)</button><a class="btn escuro" href="#/equipe">+ Convidar mentor</a></div></div>
    <div class="linha" style="margin-bottom:14px">
      <input type="text" id="busca" placeholder="Buscar pelo nome…" style="flex:1;min-width:200px">
      <select id="f-onde" style="width:auto"><option value="">Individual e em grupo</option><option value="ind">Só quem está em trilha individual</option>
        <option value="grp">Só quem está em turma em grupo</option><option value="dois">Quem está nos dois</option><option value="nada">Sem trilha nem turma</option></select>
      <select id="f-sit" style="width:auto"><option value="ativo">Ativos</option><option value="">Todos</option><option value="inativo">Desativados</option></select>
    </div>
    ${grupoNoBanco ? '' : '<div class="aviso" style="margin-bottom:14px">A mentoria em grupo ainda não está ligada no banco. Por enquanto, a lista mostra só as trilhas individuais.</div>'}
    <div class="lista" id="lista"></div>`;

  const filtrados = () => {
    const busca = el.querySelector('#busca').value.trim().toLowerCase();
    const onde = el.querySelector('#f-onde').value, sit = el.querySelector('#f-sit').value;
    return mentores.filter((x) => (!busca || x.p.nome.toLowerCase().includes(busca))
      && (!sit || (sit === 'ativo' ? x.p.ativo : !x.p.ativo))
      && (!onde || (onde === 'ind' ? x.trilhas.length : onde === 'grp' ? x.turmas.length
        : onde === 'dois' ? x.trilhas.length && x.turmas.length : !x.trilhas.length && !x.turmas.length)));
  };

  const cartao = ({ p, trilhas, turmas, feitas, proxima, proximaAula, nMentorados }) => {
    const whats = String(p.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const individual = p.atende_individual !== false, grupo = p.atende_grupo === true;
    const avisos = [
      !temSobrenome(p.nome) && '<span class="selo alerta">Falta o sobrenome</span>',
      trilhas.some((t) => t.mentorados.some((mt) => mt.status === 'ativo')) && !individual && '<span class="selo alerta" title="Ligue em Editar dados → Tipo de atendimento">Tem mentorados, mas o atendimento individual está desligado</span>',
      turmas.length && !grupo && '<span class="selo alerta" title="Ligue em Editar dados → Tipo de atendimento">Está em turma, mas a mentoria em grupo está desligada</span>',
    ].filter(Boolean).join(' ');
    return `<div class="cartao">
      <div class="linha" style="align-items:flex-start;gap:14px">
        ${avatar(p, true)}
        <div style="flex:1;min-width:200px">
          <h3>${esc(p.nome)}</h3>
          ${p.cargo || (p.trajetoria && p.trajetoria.cargo_atual) ? `<p class="peq apagado" style="margin-top:2px">${esc(p.cargo || p.trajetoria.cargo_atual)}</p>` : ''}
          <div class="linha mt" style="gap:6px">
            ${individual ? '<span class="selo">Mentoria individual</span>' : ''}${grupo ? '<span class="selo escuro">Mentoria em grupo</span>' : ''}
            ${p.papel === 'admin' ? '<span class="selo neutro">Também administração</span>' : ''}
            ${!p.ativo ? '<span class="selo erro">Desativado</span>' : !p.termo_aceito_em ? '<span class="selo neutro">Ainda não entrou na plataforma</span>' : ''}
            ${avisos}</div>
        </div>
        <a class="btn peq" href="#/pessoa/${p.id}/mentores">Editar dados</a>
      </div>
      <div class="grade g3 mt">
        <div><h4>Contato</h4>
          <div class="lista peq" style="gap:4px;margin-top:8px">
            <span><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></span>
            <span>${whats ? `<a href="https://wa.me/55${whats}" target="_blank" rel="noopener">WhatsApp ${esc(p.whatsapp)}</a>` : '<span class="apagado">WhatsApp não informado</span>'}</span>
            ${[['linkedin', 'LinkedIn'], ['instagram', 'Instagram']].map(([k, rot]) => { const x = redes(p)[k];
              return `<span>${x ? `<a href="${esc(linkRede(k, x))}" target="_blank" rel="noopener">${rot}: ${esc(x)}</a>` : `<span class="apagado">${rot} não informado</span>`}</span>`; }).join('')}
          </div></div>
        <div><h4>Trilhas individuais${nMentorados ? ` · ${nMentorados} mentorado${nMentorados > 1 ? 's' : ''}` : ''}</h4>
          ${trilhas.length ? `<div class="lista peq" style="gap:6px;margin-top:8px">${trilhas.map((t) => `<div><b>${esc(t.empresa)}</b>${t.empresa ? ' · ' : ''}${esc(t.nome)}${t.status === 'concluido' ? ' <span class="selo neutro">concluído</span>' : ''}
              <br><span class="apagado">${t.mentorados.map((mt) => `<a href="#/mentorado/${mt.id}" style="color:inherit">${esc(mt.nome)}</a>${mt.status !== 'ativo' ? ` (${esc(SITUACAO_MTD[mt.status] || mt.status)})` : ''}`).join(', ')}</span></div>`).join('')}
            <span class="apagado">Sessões feitas: ${feitas}${proxima ? ` · próxima ${quando(proxima.data_hora)}${proxima.mentorado ? ` com ${esc(proxima.mentorado.nome.split(' ')[0])}` : ''}` : ''}</span></div>`
            : '<p class="peq apagado" style="margin-top:8px">Não está em nenhuma trilha individual.</p>'}</div>
        <div><h4>Mentoria em grupo</h4>
          ${turmas.length ? `<div class="lista peq" style="gap:6px;margin-top:8px">${turmas.map((t) => `<div><b>${esc(t.empresa)}</b>${t.empresa ? ' · ' : ''}<a href="#/turma/${t.id}" style="color:inherit">${esc(t.nome)}</a>${t.status === 'concluida' ? ' <span class="selo neutro">concluída</span>' : ''}
              <br><span class="apagado">Módulo${t.modulos.length > 1 ? 's' : ''} ${t.modulos.map((md) => md.numero).sort((a, b) => a - b).join(', ')}</span></div>`).join('')}
            ${proximaAula ? `<span class="apagado">Próxima aula: ${quando(proximaAula.data_hora)} · ${esc(proximaAula.turma)}</span>` : ''}</div>`
            : `<p class="peq apagado" style="margin-top:8px">${grupoNoBanco ? 'Não está em nenhuma turma.' : '—'}</p>`}</div>
      </div>
    </div>`;
  };

  const desenhar = () => {
    const lista = filtrados();
    el.querySelector('#lista').innerHTML = lista.length ? lista.map(cartao).join('') : '<div class="vazio">Nenhum mentor com esses filtros.</div>';
  };
  el.querySelectorAll('#busca, select').forEach((x) => x.addEventListener('input', desenhar));
  desenhar();

  el.querySelector('#baixar').addEventListener('click', async () => {
    const lista = filtrados();
    if (!lista.length) { avisar('Nenhum mentor neste filtro.', true); return; }
    let XLSX;
    try { XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'); } catch (e) { avisar(explicarErro(e), true); return; }
    const linhas = [['Nome', 'E-mail', 'WhatsApp', 'LinkedIn', 'Instagram', 'Mentoria individual', 'Mentoria em grupo',
      'Trilhas individuais', 'Mentorados', 'Sessões individuais feitas', 'Turmas em grupo', 'Situação'],
    ...lista.map(({ p, trilhas, turmas, feitas, nMentorados }) => [p.nome, p.email, p.whatsapp || '', redes(p).linkedin, redes(p).instagram,
      p.atende_individual !== false ? 'Sim' : 'Não', p.atende_grupo ? 'Sim' : 'Não',
      trilhas.map((t) => `${t.empresa ? `${t.empresa} · ` : ''}${t.nome} (${t.mentorados.length})`).join('; '), nMentorados, feitas,
      turmas.map((t) => `${t.empresa ? `${t.empresa} · ` : ''}${t.nome} (módulos ${t.modulos.map((md) => md.numero).sort((a, b) => a - b).join(', ')})`).join('; '),
      p.ativo ? 'Ativo' : 'Desativado'])];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = [28, 32, 18, 30, 24, 12, 12, 50, 11, 12, 50, 11].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'Mentores');
    XLSX.writeFile(wb, `Mentorei - Mentores - ${hojeISO()}.xlsx`);
  });
}
