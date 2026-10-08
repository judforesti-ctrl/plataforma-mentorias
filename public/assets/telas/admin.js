// Painel da administração: visão geral, empresas e programas, novo programa, novo mentorado e página do programa.
import { normalizarMeet } from './meet.js';
import { pendencias } from './pendencias.js';
import { sb, esc, dataBR, dataHoraBR, avisar, explicarErro, localParaISO, hojeISO } from '../base.js';

const FREQ = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
const STATUS_PROG = { planejado: ['Planejado', 'neutro'], em_andamento: ['Em andamento', ''], concluido: ['Concluído', 'neutro'], pausado: ['Pausado', 'alerta'] };

export async function render(ctx, el, params) {
  const [sub, id] = params;
  if (sub === 'novo-programa') return novoPrograma(ctx, el);
  if (sub === 'novo-mentorado') return novoMentorado(ctx, el);
  if (sub === 'programa' && id) return paginaPrograma(ctx, el, id);
  if (sub === 'agenda') {
    const MSG = { ok: ['Google Agenda conectada.', false], cancelado: ['A conexão com o Google foi cancelada.', true], expirou: ['O pedido expirou. Clique em Conectar de novo.', true],
      negado: ['Só a administração conecta a Google Agenda.', true], 'sem-permissao': ['O Google não liberou o acesso. Clique em Conectar de novo e aceite as permissões.', true], erro: ['Não foi possível conectar a Google Agenda.', true] };
    const [txt, erro] = MSG[id] || MSG.erro;
    avisar(txt, erro);
    history.replaceState(null, '', '#/painel');
  }
  return visaoGeral(ctx, el);
}

async function carregarTudo() {
  const [emp, prog, ment, sess, mentores] = await Promise.all([
    sb.from('empresas').select('*').order('nome'),
    sb.from('programas').select('*').order('criado_em', { ascending: false }),
    sb.from('mentorados').select('id, nome, programa_id, status'),
    sb.from('sessoes').select('id, mentorado_id, data_hora, situacao, concluida_em, tarefa, tarefa_prazo, tarefa_feita_em'),
    sb.from('perfis').select('id, nome, papel, tambem_mentor, ativo').or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome'),
  ]);
  for (const r of [emp, prog, ment, sess, mentores]) if (r.error) throw r.error;
  return { empresas: emp.data, programas: prog.data, mentorados: ment.data, sessoes: sess.data, mentores: mentores.data };
}

function numeros(sessoes) {
  const agora = Date.now(), hoje = hojeISO();
  const passadas = sessoes.filter((s) => s.data_hora && new Date(s.data_hora).getTime() < agora);
  const feitas = sessoes.filter((s) => s.situacao === 'realizada').length;
  const faltas = sessoes.filter((s) => s.situacao.startsWith('falta')).length;
  const semRegistro = passadas.filter((s) => s.situacao === 'agendada' && new Date(s.data_hora).getTime() < agora - 48 * 3600 * 1000).length;
  const atrasadas = sessoes.filter((s) => s.tarefa && s.tarefa_prazo && !s.tarefa_feita_em && s.tarefa_prazo < hoje).length;
  const presenca = feitas + faltas ? Math.round((feitas / (feitas + faltas)) * 100) : null;
  return { total: sessoes.length, feitas, faltas, semRegistro, atrasadas, presenca };
}

async function visaoGeral(ctx, el) {
  const d = await carregarTudo();
  const progPorId = Object.fromEntries(d.programas.map((p) => [p.id, p]));
  el.innerHTML = `
    <div class="cab"><div><h1>Painel</h1><p class="sub">Visão de toda a operação de mentorias.</p></div>
      <div class="acoes"><a class="btn" href="#/painel/novo-programa">+ Novo programa</a><a class="btn escuro" href="#/painel/novo-mentorado">+ Novo mentorado</a></div></div>
    <div class="linha" style="margin-bottom:14px">
      <select id="f-empresa" style="width:auto"><option value="">Todas as empresas</option>${d.empresas.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select>
      <select id="f-programa" style="width:auto"><option value="">Todos os programas</option>${d.programas.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
    </div>
    <div id="numeros"></div>
    <div id="agenda-avisos"></div>
    <div class="cartao mt" id="google"><p class="peq apagado">Verificando a Google Agenda…</p></div>
    <h2 class="mt2">Para hoje e pendências</h2>
    <div id="pendencias" class="mt"><p class="carregando">Carregando…</p></div>
    <h2 class="mt2">Mentoria em grupo</h2>
    <div id="grupo" class="mt"><p class="carregando">Carregando…</p></div>
    <h2 class="mt2">Mentores</h2>
    <div class="chips mt">${d.mentores.map((x) => `<a class="btn peq" href="#/pessoa/${x.id}">${esc(x.nome)}</a>`).join('') || '<span class="apagado">Nenhum mentor ativo.</span>'}
      <a class="btn peq escuro" href="#/equipe">+ Convidar mentor</a></div>
    <p class="peq apagado mt">Clique no nome para editar foto, contato, trajetória, sala do Meet e texto de apresentação.</p>
    <h2 class="mt2">Empresas e programas</h2>
    <div class="linha mt"><button class="btn peq" id="nova-empresa">+ Nova empresa</button></div>
    <div id="empresas" class="mt"></div>`;

  const desenhar = () => {
    const fe = el.querySelector('#f-empresa').value, fp = el.querySelector('#f-programa').value;
    const progs = d.programas.filter((p) => (!fe || p.empresa_id === fe) && (!fp || p.id === fp));
    const progIds = new Set(progs.map((p) => p.id));
    const ments = d.mentorados.filter((m) => progIds.has(m.programa_id));
    const mentIds = new Set(ments.map((m) => m.id));
    const n = numeros(d.sessoes.filter((s) => mentIds.has(s.mentorado_id)));
    el.querySelector('#numeros').innerHTML = `<div class="grade g4">
      <div class="cartao numero"><b>${ments.filter((m) => m.status === 'ativo').length}</b><span>mentorados ativos</span></div>
      <div class="cartao numero"><b>${n.feitas}<small style="font-size:14px;color:var(--apagado)"> de ${n.total}</small></b><span>sessões feitas</span></div>
      <div class="cartao numero"><b>${n.presenca == null ? '—' : `${n.presenca}%`}</b><span>presença (${n.faltas} faltas)</span></div>
      <div class="cartao numero"><b>${d.mentores.length}</b><span>mentores ativos</span></div></div>
      ${n.semRegistro || n.atrasadas ? `<div class="aviso mt">${n.semRegistro ? `<b>${n.semRegistro}</b> sessão(ões) já passaram há mais de 48 horas sem registro. ` : ''}${n.atrasadas ? `<b>${n.atrasadas}</b> tarefa(s) atrasada(s).` : ''}</div>` : ''}`;
    const emps = d.empresas.filter((e) => !fe || e.id === fe);
    el.querySelector('#empresas').innerHTML = emps.length ? emps.map((e) => {
      const ps = progs.filter((p) => p.empresa_id === e.id);
      return `<div class="cartao"><div class="linha"><h3>${esc(e.nome)}</h3><span class="selo neutro">${ps.length} programa(s)</span>
        <a class="btn peq" style="margin-left:auto" href="#/painel/novo-programa/${e.id}">+ Programa</a></div>
        ${ps.length ? `<div class="tabela mt"><table><tr><th>Programa</th><th>Mentorados</th><th>Sessões por pessoa</th><th>Feitas / previstas</th><th>Presença</th><th>Período</th><th>Situação</th></tr>
        ${ps.map((p) => {
          const ms = d.mentorados.filter((m) => m.programa_id === p.id); const ids = new Set(ms.map((m) => m.id));
          const k = numeros(d.sessoes.filter((s) => ids.has(s.mentorado_id))); const [st, cls] = STATUS_PROG[p.status];
          return `<tr class="clicavel" data-ir="#/painel/programa/${p.id}"><td><b>${esc(p.nome)}</b></td><td>${ms.length}</td><td>${p.sessoes_por_mentorado}</td>
            <td>${k.feitas} / ${k.total}</td><td>${k.presenca == null ? '—' : `${k.presenca}%`}</td><td class="peq">${dataBR(p.inicio)} a ${dataBR(p.fim_previsto)}</td>
            <td><span class="selo ${cls}">${st}</span></td></tr>`;
        }).join('')}</table></div>` : '<p class="apagado mt">Nenhum programa nesta empresa.</p>'}</div>`;
    }).join('') : '<div class="vazio">Nenhuma empresa cadastrada. Comece por "+ Nova empresa" ou pela importação da planilha.</div>';
  };
  el.querySelectorAll('select').forEach((s) => s.addEventListener('input', desenhar));
  desenhar();
  pendencias(el.querySelector('#pendencias'), { mostrarMentor: true });
  import('./turmas.js').then(({ resumoGrupo }) => resumoGrupo(el.querySelector('#grupo')));
  import('./agenda.js').then(({ avisosAgenda }) => avisosAgenda(ctx, el.querySelector('#agenda-avisos')));
  cartaoGoogle(el.querySelector('#google'));
  el.addEventListener('click', async (ev) => {
    const tr = ev.target.closest('[data-ir]'); if (tr) { location.hash = tr.dataset.ir; return; }
    if (ev.target.id === 'nova-empresa') {
      const nome = window.prompt('Nome da empresa:'); if (!nome || !nome.trim()) return;
      const { error } = await sb.from('empresas').insert({ nome: nome.trim() });
      if (error) avisar(explicarErro(error), true); else { avisar('Empresa criada.'); ctx.irPara('#/painel'); }
    }
  });
}

// Cartão da Google Agenda: mostra a conta conectada e o botão de conectar (usado ao remarcar sessões).
async function cartaoGoogle(box) {
  const { data: { session } } = await sb.auth.getSession();
  const chamar = (corpo) => fetch('/api/google-conectar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(corpo) })
    .then((r) => r.json().then((j) => ({ ok: r.ok, ...j }))).catch(() => ({ ok: false, mensagem: 'Sem conexão.' }));
  const st = await chamar({ acao: 'status' });
  box.innerHTML = `<div class="linha"><div style="flex:1"><h3>Google Agenda</h3>
      <p class="peq apagado">${st.conectado ? `Conectada com <b>${esc(st.email || 'a conta do Google')}</b>. Ao remarcar uma sessão, o mesmo convite é atualizado (sem duplicar) e o Google avisa os convidados.
        Convites automáticos para todos e a procura de convites duplicados ficam em <a href="#/agenda/celular">Agenda → Google, celular e e-mail</a>.`
        : st.configurado === false ? 'Falta configurar as chaves do Google na Netlify (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).'
        : 'Conecte a conta Google que cria os convites das mentorias. Assim, ao remarcar uma sessão, o convite é atualizado sozinho.'}</p></div>
    ${st.configurado === false ? '' : `<button class="btn ${st.conectado ? '' : 'pri'}" id="g-conectar">${st.conectado ? 'Trocar conta' : 'Conectar Google Agenda'}</button>`}</div>`;
  box.querySelector('#g-conectar')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const r = await chamar({});
    if (r.url) location.href = r.url; else { avisar(r.mensagem || 'Não foi possível conectar.', true); ev.currentTarget.disabled = false; }
  });
}

async function novoPrograma(ctx, el) {
  const empresaInicial = location.hash.split('/')[3] || '';
  const { data: empresas } = await sb.from('empresas').select('id, nome').order('nome');
  const { data: anteriores } = await sb.from('programas').select('id, nome, sessoes_por_mentorado, empresa:empresas(nome)').order('criado_em', { ascending: false });
  el.innerHTML = `
    <div class="cab"><div><h1>Novo programa</h1><p class="sub">Cada programa tem a quantidade de sessões que você definir. Depois, dá para acrescentar sessões extras a um mentorado.</p></div></div>
    <div class="cartao" style="max-width:900px">
      <div class="grade g2">
        <div class="campo"><label>Empresa *</label><select id="p-empresa"><option value="">Escolha…</option>${(empresas || []).map((e) => `<option value="${e.id}"${e.id === empresaInicial ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label>Nome do programa *</label><input id="p-nome" type="text" placeholder="Ex.: Trilha de Liderança 2026"></div>
        <div class="campo"><label>Sessões por mentorado *</label><input id="p-sessoes" type="number" min="1" max="200" value="7"></div>
        <div class="campo"><label>Frequência</label><select id="p-freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="campo"><label>Duração de cada sessão (minutos)</label><input id="p-duracao" type="number" min="15" value="50"></div>
        <div class="campo"><label>Como os mentores se dividem</label><select id="p-divisao"><option value="dupla_alternando">Dupla alternando as sessões</option><option value="um_mentor">Um mentor só</option></select></div>
        <div class="campo"><label>Início</label><input id="p-inicio" type="date"></div>
        <div class="campo"><label>Fim previsto</label><input id="p-fim" type="date"></div>
      </div>
      ${(anteriores || []).length ? `<div class="campo mt"><label>Copiar o plano de temas de um programa anterior (opcional)</label>
        <select id="p-copiar"><option value="">Não copiar</option>${anteriores.map((a) => `<option value="${a.id}">${esc(a.empresa.nome)} · ${esc(a.nome)} (${a.sessoes_por_mentorado} sessões)</option>`).join('')}</select></div>` : ''}
      <h3 class="mt2">Plano de temas por sessão <span class="selo neutro">opcional</span></h3>
      <p class="peq apagado">O tema e o roteiro de cada sessão aparecem para o mentor na hora da sessão. Pode deixar em branco e preencher depois.</p>
      <div class="tabela mt"><table id="temas"></table></div>
      <div class="linha mt"><button class="btn pri" id="salvar">Criar programa</button><a class="btn" href="#/painel">Cancelar</a></div>
    </div>`;
  const temas = el.querySelector('#temas');
  const desenharTemas = (dados = {}) => {
    const n = Math.max(1, Math.min(200, Number(el.querySelector('#p-sessoes').value) || 1));
    const atual = {}; temas.querySelectorAll('tr[data-n]').forEach((tr) => { atual[tr.dataset.n] = { tema: tr.querySelector('.t').value, roteiro: tr.querySelector('.r').value }; });
    temas.innerHTML = `<tr><th style="width:60px">Sessão</th><th>Tema</th><th>Roteiro e ferramenta</th></tr>${Array.from({ length: n }, (_, i) => {
      const x = dados[i + 1] || atual[i + 1] || {};
      return `<tr data-n="${i + 1}"><td>${i + 1}</td><td><input class="t" type="text" value="${esc(x.tema || '')}"></td><td><input class="r" type="text" value="${esc(x.roteiro || '')}"></td></tr>`;
    }).join('')}`;
  };
  desenharTemas();
  el.querySelector('#p-sessoes').addEventListener('input', () => desenharTemas());
  el.querySelector('#p-copiar')?.addEventListener('input', async (ev) => {
    if (!ev.target.value) return;
    const { data } = await sb.from('programa_temas').select('numero, tema, roteiro').eq('programa_id', ev.target.value);
    const ant = anteriores.find((a) => a.id === ev.target.value);
    el.querySelector('#p-sessoes').value = ant.sessoes_por_mentorado;
    desenharTemas(Object.fromEntries((data || []).map((t) => [t.numero, t])));
  });
  el.querySelector('#salvar').addEventListener('click', async () => {
    const empresa_id = el.querySelector('#p-empresa').value, nome = el.querySelector('#p-nome').value.trim();
    const n = Number(el.querySelector('#p-sessoes').value);
    if (!empresa_id || !nome || !(n >= 1)) { avisar('Preencha empresa, nome e quantidade de sessões.', true); return; }
    const { data: prog, error } = await sb.from('programas').insert({
      empresa_id, nome, sessoes_por_mentorado: n, frequencia: el.querySelector('#p-freq').value,
      duracao_min: Number(el.querySelector('#p-duracao').value) || 50, divisao_mentores: el.querySelector('#p-divisao').value,
      inicio: el.querySelector('#p-inicio').value || null, fim_previsto: el.querySelector('#p-fim').value || null,
      status: el.querySelector('#p-inicio').value && el.querySelector('#p-inicio').value <= hojeISO() ? 'em_andamento' : 'planejado',
    }).select('id').single();
    if (error) { avisar(explicarErro(error), true); return; }
    const linhas = [...temas.querySelectorAll('tr[data-n]')].map((tr) => ({ programa_id: prog.id, numero: Number(tr.dataset.n), tema: tr.querySelector('.t').value.trim(), roteiro: tr.querySelector('.r').value.trim() || null }))
      .filter((t) => t.tema);
    if (linhas.length) { const { error: e2 } = await sb.from('programa_temas').insert(linhas); if (e2) avisar(explicarErro(e2), true); }
    avisar('Programa criado.'); location.hash = `#/painel/programa/${prog.id}`;
  });
}

async function novoMentorado(ctx, el) {
  const d = await carregarTudo();
  const progOpts = d.programas.map((p) => { const e = d.empresas.find((x) => x.id === p.empresa_id); return `<option value="${p.id}">${esc(e ? e.nome : '')} · ${esc(p.nome)} (${p.sessoes_por_mentorado} sessões)</option>`; }).join('');
  const mentOpts = d.mentores.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  el.innerHTML = `
    <div class="cab"><div><h1>Novo mentorado</h1><p class="sub">O mentorado completa os próprios dados no primeiro acesso. Aqui vão só o essencial e o programa.</p></div></div>
    ${d.programas.length ? '' : '<div class="aviso">Crie primeiro um programa em "+ Novo programa".</div>'}
    <div class="cartao" style="max-width:820px">
      <div class="grade g2">
        <div class="campo"><label>Nome *</label><input id="n-nome" type="text"></div>
        <div class="campo"><label>E-mail</label><input id="n-email" type="email"><small>Necessário para enviar o convite de acesso.</small></div>
        <div class="campo"><label>Cargo</label><input id="n-cargo" type="text"></div>
        <div class="campo"><label>Programa *</label><select id="n-prog"><option value="">Escolha…</option>${progOpts}</select></div>
        <div class="campo"><label>Mentor 1 *</label><select id="n-m1"><option value="">Escolha…</option>${mentOpts}</select></div>
        <div class="campo"><label>Mentor 2</label><select id="n-m2"><option value="">Nenhum</option>${mentOpts}</select></div>
        <div class="campo"><label>Primeira sessão</label><input id="n-data" type="datetime-local"><small>As outras são calculadas pela frequência do programa. Dá para ajustar depois.</small></div>
        <div class="campo"><label>Sala do Meet</label><input id="n-meet" type="url" placeholder="https://meet.google.com/…"></div>
      </div>
      <label class="check mt"><input type="checkbox" id="n-convite"> <span>Enviar o convite de acesso agora (se tiver e-mail). Deixe desmarcado para enviar só quando tudo estiver pronto.</span></label>
      <div class="linha mt"><button class="btn pri" id="salvar">Cadastrar e criar as sessões</button><a class="btn" href="#/painel">Cancelar</a></div>
    </div>`;
  el.querySelector('#salvar').addEventListener('click', async (ev) => {
    const nome = el.querySelector('#n-nome').value.trim(), programa_id = el.querySelector('#n-prog').value;
    const m1 = el.querySelector('#n-m1').value, m2 = el.querySelector('#n-m2').value;
    const email = el.querySelector('#n-email').value.trim().toLowerCase() || null;
    if (!nome || !programa_id || !m1) { avisar('Preencha nome, programa e mentor 1.', true); return; }
    if (m2 && m2 === m1) { avisar('Escolha mentores diferentes.', true); return; }
    ev.target.disabled = true;
    try {
      const { data: novo, error } = await sb.from('mentorados').insert({ nome, email, programa_id, cargo: el.querySelector('#n-cargo').value.trim() || null, sala_meet: normalizarMeet(el.querySelector('#n-meet').value) }).select('id').single();
      if (error) throw error;
      const vinc = [{ mentorado_id: novo.id, mentor_id: m1, ordem: 1 }]; if (m2) vinc.push({ mentorado_id: novo.id, mentor_id: m2, ordem: 2 });
      const { error: e2 } = await sb.from('mentor_mentorado').insert(vinc); if (e2) throw e2;
      const { error: e3 } = await sb.rpc('criar_sessoes_do_programa', { p_mentorado: novo.id, p_primeira: localParaISO(el.querySelector('#n-data').value) }); if (e3) throw e3;
      import('./agenda-dados.js').then(({ avisarGoogle }) => avisarGoogle());
      if (email && el.querySelector('#n-convite').checked) {
        const { convidar } = await import('./equipe.js');
        await convidar({ email, nome, papel: 'mentorado', mentorado_id: novo.id });
      }
      avisar('Mentorado cadastrado.'); location.hash = `#/mentorado/${novo.id}`;
    } catch (e) { avisar(explicarErro(e), true); ev.target.disabled = false; }
  });
}

async function paginaPrograma(ctx, el, id) {
  const [{ data: p, error }, { data: temas }, { data: ments }] = await Promise.all([
    sb.from('programas').select('*, empresa:empresas(nome)').eq('id', id).maybeSingle(),
    sb.from('programa_temas').select('*').eq('programa_id', id).order('numero'),
    sb.from('mentorados').select('id, nome, cargo, status, vinculos:mentor_mentorado(ordem, mentor:perfis(id, nome, email, whatsapp, papel, tambem_mentor, termo_aceito_em)), sessoes(situacao)').eq('programa_id', id).order('nome'),
  ]);
  if (error) throw error;
  if (!p) { el.innerHTML = '<div class="vazio">Programa não encontrado.</div>'; return; }
  const [st, cls] = STATUS_PROG[p.status];
  // mentores ligados aos mentorados deste programa, com os nomes dos mentorados de cada um
  const porMentor = new Map();
  (ments || []).forEach((m) => (m.vinculos || []).forEach((v) => {
    if (!v.mentor) return;
    if (!porMentor.has(v.mentor.id)) porMentor.set(v.mentor.id, { ...v.mentor, mentorados: [] });
    porMentor.get(v.mentor.id).mentorados.push(m.nome);
  }));
  const mentores = [...porMentor.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  el.innerHTML = `
    <div class="cab"><div><p class="apagado">${esc(p.empresa.nome)}</p><h1>${esc(p.nome)}</h1>
      <p class="sub">${p.sessoes_por_mentorado} sessões por mentorado · ${FREQ[p.frequencia] || p.frequencia} · ${p.duracao_min} min · ${dataBR(p.inicio)} a ${dataBR(p.fim_previsto)} · <span class="selo ${cls}">${st}</span></p></div>
      <div class="acoes"><select id="status" style="width:auto">${Object.entries(STATUS_PROG).map(([k, [t]]) => `<option value="${k}"${k === p.status ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <a class="btn escuro" href="#/painel/novo-mentorado">+ Novo mentorado</a></div></div>
    <div class="cartao"><h3>Mentorados (${(ments || []).length})</h3>
      <div class="tabela mt"><table><tr><th>Nome</th><th>Cargo</th><th>Mentores</th><th>Sessões feitas</th><th>Situação</th></tr>
      ${(ments || []).map((m) => `<tr class="clicavel" data-ir="#/mentorado/${m.id}"><td><b>${esc(m.nome)}</b></td><td>${esc(m.cargo || '—')}</td>
        <td>${esc((m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((v) => v.mentor && v.mentor.nome).join(' e '))}</td>
        <td>${(m.sessoes || []).filter((s) => s.situacao === 'realizada').length} de ${(m.sessoes || []).length}</td><td>${esc(m.status)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="apagado">Nenhum mentorado ainda.</td></tr>'}</table></div></div>
    <div class="cartao"><h3>Mentores desta trilha</h3>
      <p class="peq apagado mt">Quando um mentor entra numa trilha nova, avise pelo WhatsApp. Quem ainda não usa a plataforma recebe junto o link para criar a senha.</p>
      ${mentores.length ? `<div class="tabela mt"><table><tr><th>Mentor</th><th>Mentorados nesta trilha</th><th>Plataforma</th><th></th></tr>
        ${mentores.map((x) => `<tr><td><a href="#/pessoa/${x.id}"><b>${esc(x.nome)}</b></a></td><td class="peq">${x.mentorados.length}: ${esc(x.mentorados.join(', '))}</td>
          <td>${x.termo_aceito_em ? '<span class="selo">Já usa</span>' : '<span class="selo alerta">Ainda não entrou</span>'}</td>
          <td><button class="btn peq pri" data-avisar-mentor="${x.id}">Avisar pelo WhatsApp</button></td></tr>`).join('')}</table></div>`
        : '<p class="apagado mt">Nenhum mentor ligado aos mentorados desta trilha ainda.</p>'}</div>
    <div class="cartao"><h3>Plano de temas</h3>
      ${(temas || []).length ? `<div class="tabela mt"><table><tr><th>Sessão</th><th>Tema</th><th>Roteiro e ferramenta</th></tr>
        ${temas.map((t) => `<tr><td>${t.numero}</td><td>${esc(t.tema)}</td><td class="peq">${esc(t.roteiro || '')}</td></tr>`).join('')}</table></div>`
        : '<p class="apagado mt">Sem plano de temas. Os temas podem ficar em cada sessão de cada mentorado.</p>'}</div>`;
  el.addEventListener('click', async (ev) => {
    const tr = ev.target.closest('[data-ir]'); if (tr) { location.hash = tr.dataset.ir; return; }
    const b = ev.target.closest('[data-avisar-mentor]'); if (!b) return;
    const x = porMentor.get(b.dataset.avisarMentor);
    const lista = x.mentorados.length === 1 ? `com 1 mentorado: ${x.mentorados[0]}` : `com ${x.mentorados.length} mentorados: ${x.mentorados.join(', ')}`;
    const contexto = `Você vai acompanhar a trilha "${p.nome}", da ${p.empresa.nome}, ${lista}.`;
    const { conviteWhatsApp, janelaWhatsApp } = await import('./equipe.js');
    if (!x.termo_aceito_em) {
      b.disabled = true;
      await conviteWhatsApp({ email: x.email, nome: x.nome, papel: x.papel, tambem_mentor: x.tambem_mentor, whatsapp: x.whatsapp || '', remetente: ctx.perfil.nome, contexto });
      b.disabled = false;
      return;
    }
    const quem = `Aqui é ${ctx.perfil.nome.split(' ')[0]}, da Mentorei.`;
    janelaWhatsApp({ titulo: `Aviso de trilha · ${x.nome}`, whatsapp: x.whatsapp || '',
      nota: 'Esta pessoa já usa a plataforma: a mensagem só avisa da trilha nova, sem link de senha.',
      texto: `Olá, ${x.nome.split(' ')[0]}! ${quem} ${contexto}\n\nOs mentorados já estão na sua área da plataforma, em "Meus mentorados":\n${location.origin}/app.html#/meus` });
  });
  el.querySelector('#status').addEventListener('input', async (ev) => {
    const { error: e } = await sb.from('programas').update({ status: ev.target.value }).eq('id', id);
    if (e) avisar(explicarErro(e), true); else avisar('Situação do programa atualizada.');
  });
}
