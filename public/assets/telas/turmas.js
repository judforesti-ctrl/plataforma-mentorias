// Mentoria em grupo: turmas (por empresa), módulos (aulas), slides e percepções dos mentores.
// "#/turmas": lista (administração: todas e "Nova turma"; mentor: as dele e as próximas aulas).
// "#/turma/<id>": dados da turma e módulos. "#/modulo/<id>": tudo o que o mentor precisa para a aula.
import { sb, esc, avatar, dataBR, dataHoraBR, diaMes, horaBR, autoSalvar, avisar, explicarErro, localParaISO, isoParaLocal } from '../base.js';
import { ITENS_VIAGEM, QUEM_VIAGEM } from '../agenda-regras.js';

const FORMATO = { meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams', presencial: 'Presencial', outro: 'Outro', indefinido: 'Local a definir' };
const STATUS = { planejada: ['Planejada', 'neutro'], em_andamento: ['Em andamento', ''], concluida: ['Concluída', 'neutro'], pausada: ['Pausada', 'alerta'] };
const SEL_MODULO = 'id, numero, titulo, tematica, recomendacoes, data_hora, formato, link, local, percepcoes_em, mentores:modulo_mentores(mentor:perfis(id, nome, foto_url))';
const agora = () => Date.now();
const nomesMentores = (m) => (m.mentores || []).map((x) => x.mentor && x.mentor.nome).filter(Boolean).join(' e ');
const ministra = (m, id) => (m.mentores || []).some((x) => x.mentor && x.mentor.id === id);
const passou = (m) => m.data_hora && new Date(m.data_hora).getTime() < agora() - 2 * 3600 * 1000;
// Aulas que aconteceram antes de a mentoria em grupo entrar na plataforma (vieram da planilha) não pedem percepções.
const PERCEPCOES_DESDE = Date.parse('2026-10-08T00:00:00-03:00');
const pedePercepcao = (m) => passou(m) && !m.percepcoes_em && new Date(m.data_hora).getTime() >= PERCEPCOES_DESDE;
// como a turma acontece (a agenda usa: aula presencial reserva a véspera e o dia seguinte para o deslocamento)
export const COMO = { online: 'Online', presencial: 'Presencial', misto: 'Parte online, parte presencial' };

// Grava a turma (nova ou mudança). Sem o script 15 no Supabase, grava sem "online ou presencial" e avisa.
export async function gravarTurma(dados, id = null) {
  const q = (x) => (id ? sb.from('turmas').update(x).eq('id', id).select('id').single() : sb.from('turmas').insert(x).select('id').single());
  let r = await q(dados);
  if (r.error && /formato|local/.test(r.error.message || '') && /column|schema/i.test(r.error.message || '')) {
    const { formato, local, ...resto } = dados;
    r = await q(resto);
    if (!r.error) avisar('Turma salva, mas sem o "online ou presencial": falta rodar o script 15 no Supabase.', true);
  }
  return r;
}

export async function render(ctx, el, [id]) {
  if (ctx.rota === 'turma' && id) return paginaTurma(ctx, el, id);
  if (ctx.rota === 'modulo' && id) return paginaModulo(ctx, el, id);
  return lista(ctx, el);
}

// ---------- lista de turmas ----------
async function lista(ctx, el) {
  const [{ data: turmas, error }, { data: empresas }] = await Promise.all([
    sb.from('turmas').select(`*, empresa:empresas(nome), modulos(${SEL_MODULO})`).order('inicio', { ascending: false }),
    ctx.ehAdmin ? sb.from('empresas').select('id, nome').order('nome') : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;
  const todas = turmas || [];
  const meusModulos = todas.flatMap((t) => (t.modulos || []).filter((m) => ministra(m, ctx.perfil.id)).map((m) => ({ ...m, turma: t })));
  const proximas = meusModulos.filter((m) => m.data_hora && !passou(m)).sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  const semPercepcao = meusModulos.filter(pedePercepcao);
  // quem dá a aula: os mentores do módulo (ou o convidado da planilha, se ainda não tem cadastro)
  const quemDa = (m) => nomesMentores(m) || ((String(m.recomendacoes || '').match(/Quem conduz: ([^(.;]+)/i) || [])[1] || '').trim();
  const linhaAula = (m) => `<a class="pend" href="#/modulo/${m.id}"><b>${diaMes(m.data_hora)}<br>${horaBR(m.data_hora)}</b>
    <span>Módulo ${m.numero} · ${esc(m.titulo)}<br><span class="peq apagado">${esc(m.turma.empresa ? m.turma.empresa.nome : '')} · ${esc(m.turma.nome)} · ${FORMATO[m.formato] || ''}</span>
      <br><span class="peq"><b>Mentor:</b> ${quemDa(m) ? esc(quemDa(m)) : 'a definir'}</span></span></a>`;

  el.innerHTML = `
    <div class="cab"><div><h1>${ctx.ehAdmin ? 'Turmas' : 'Minhas turmas'}</h1><p class="sub">Mentoria em grupo: módulos, slides, recomendações e percepções de cada aula.</p></div>
      ${ctx.ehAdmin ? '<div class="acoes"><a class="btn" href="#/relatorio-turmas">Relatório para a empresa</a><a class="btn" href="#/importar-proposta">Importar proposta (PDF)</a><button class="btn escuro" id="nova">+ Nova turma</button></div>' : ''}</div>
    ${ctx.ehAdmin ? `<div class="cartao" id="form-nova" hidden><h3>Nova turma</h3>
      <form class="grade g2 mt" id="f-turma">
        <div class="campo"><label for="t-empresa">Empresa contratante</label><select id="t-empresa" required><option value="">Escolha…</option>${(empresas || []).map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}<option value="nova">+ Outra empresa…</option></select></div>
        <div class="campo"><label for="t-nome">Nome da turma ou programa</label><input id="t-nome" type="text" placeholder="Ex.: Liderança na Prática · Turma 1" required></div>
        <div class="campo"><label for="t-part">Participantes esperados</label><input id="t-part" type="number" min="0"></div>
        <div class="campo" style="grid-column:1/-1"><span class="rotulo">Como vai ser *</span><div class="linha">
          ${Object.entries(COMO).map(([k, r]) => `<label class="check"><input type="radio" name="t-formato" value="${k}"><span>${r}</span></label>`).join('')}</div>
          <small>A agenda usa essa informação: aula presencial reserva a véspera e o dia seguinte para o deslocamento.</small></div>
        <div class="campo" id="t-local-caixa" hidden><label for="t-local">Cidade das aulas presenciais</label><input id="t-local" type="text" placeholder="Ex.: Curitiba (PR)"></div>
        <div class="grade g2" style="gap:10px"><div class="campo"><label for="t-ini">Início</label><input id="t-ini" type="date"></div><div class="campo"><label for="t-fim">Fim previsto</label><input id="t-fim" type="date"></div></div>
        <div class="campo" style="grid-column:1/-1"><label for="t-perfil">Perfil da turma</label><textarea id="t-perfil" placeholder="Cargos, nível de liderança, principais desafios, o que a empresa espera do programa."></textarea></div>
        <div class="linha"><button class="btn pri" type="submit">Criar turma</button></div>
      </form></div>` : ''}
    ${proximas.length || semPercepcao.length ? `<div class="grade g2">
      ${proximas.length ? `<div class="cartao pend-bloco"><h3>Suas próximas aulas <span class="selo neutro">${proximas.length}</span></h3><div class="lista mt">${proximas.slice(0, 8).map(linhaAula).join('')}</div></div>` : ''}
      ${semPercepcao.length ? `<div class="cartao pend-bloco urgente"><h3>Aulas sem as suas percepções <span class="selo erro">${semPercepcao.length}</span></h3>
        <p class="peq apagado">Conte como foi: engajamento, pontos de atenção e quantas pessoas vieram.</p><div class="lista mt">${semPercepcao.map(linhaAula).join('')}</div></div>` : ''}
    </div>` : ''}
    <h2 class="mt2">${ctx.ehAdmin ? 'Todas as turmas' : 'Turmas em que você dá aula'}</h2>
    <div class="linha mt">
      <input type="search" id="t-busca" placeholder="Buscar por cliente, tema ou mentor…" aria-label="Buscar por cliente, tema ou mentor" style="flex:1;min-width:220px">
      <select id="t-sit" aria-label="Situação" style="width:auto"><option value="">Todas as situações</option>${Object.entries(STATUS).map(([k, [r]]) => `<option value="${k}">${r}</option>`).join('')}</select>
      <span class="linha" style="gap:4px"><button type="button" class="btn peq" data-vista="turmas">Por turma</button><button type="button" class="btn peq" data-vista="aulas">Por aula</button></span>
      <label class="check" id="t-futuras-caixa"><input type="checkbox" id="t-futuras" checked><span>Só as próximas aulas</span></label>
    </div>
    <div id="t-res" class="mt"></div>`;

  // busca por cliente, tema (título ou temática do módulo) ou mentor; vista por turma ou por aula
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const convidado = (m) => ((String(m.recomendacoes || '').match(/Quem conduz: ([^(.;]+)/i) || [])[1] || '').trim();
  const mentorDe = (m) => nomesMentores(m) || (convidado(m) ? `${convidado(m)} (sem cadastro)` : '');
  const textoTurma = (t) => norm(`${t.empresa ? t.empresa.nome : ''} ${t.nome}`);
  const textoModulo = (t, m) => norm(`${t.empresa ? t.empresa.nome : ''} ${t.nome} ${m.titulo} ${m.tematica || ''} ${mentorDe(m)}`);
  let vista = 'turmas';
  try { vista = localStorage.getItem('turmas_vista') || 'turmas'; } catch (_) { /* sem armazenamento */ }
  const mentorHtml = (m) => (nomesMentores(m) ? esc(nomesMentores(m)) : convidado(m) ? `${esc(convidado(m))} <span class="peq apagado">(sem cadastro)</span>` : '<span class="selo alerta">Mentor a definir</span>');

  const desenhar = () => {
    const termos = norm(el.querySelector('#t-busca').value).split(' ').filter(Boolean);
    const sit = el.querySelector('#t-sit').value;
    const casa = (txt) => termos.every((k) => txt.includes(k));
    const res = [];
    for (const t of todas) {
      if (sit && t.status !== sit) continue;
      const mods = (t.modulos || []).slice().sort((a, b) => a.numero - b.numero);
      const pelaTurma = !termos.length || casa(textoTurma(t));
      const achados = termos.length ? mods.filter((m) => casa(textoModulo(t, m))) : mods;
      if (pelaTurma || achados.length) res.push({ t, mods, achados: pelaTurma ? mods : achados, pelaTurma });
    }
    el.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('pri', b.dataset.vista === vista));
    el.querySelector('#t-futuras-caixa').hidden = vista !== 'aulas';
    const caixa = el.querySelector('#t-res');
    if (!todas.length) {
      caixa.innerHTML = `<div class="vazio">${ctx.ehAdmin ? 'Nenhuma turma ainda. Clique em "+ Nova turma".' : 'Você ainda não está em nenhum módulo. A administração da Mentorei faz essa ligação.'}</div>`;
      return;
    }
    if (!res.length) { caixa.innerHTML = '<div class="vazio">Nada encontrado com essa busca.</div>'; return; }

    if (vista === 'aulas') {
      const futuras = el.querySelector('#t-futuras').checked;
      const linhas = res.flatMap(({ t, achados }) => achados.map((m) => ({ t, m })))
        .filter(({ m }) => !futuras || !m.data_hora || !passou(m))
        .sort((a, b) => (a.m.data_hora || '9999').localeCompare(b.m.data_hora || '9999'));
      caixa.innerHTML = linhas.length ? `<div class="tabela cartao" style="padding:0"><table><tr><th>Data</th><th>Cliente</th><th>Turma</th><th>Módulo</th><th>Onde</th><th>Mentor</th></tr>
        ${linhas.map(({ t, m }) => `<tr class="clicavel" data-ir="#/modulo/${m.id}"><td style="white-space:nowrap">${m.data_hora ? `${diaMes(m.data_hora)} · ${horaBR(m.data_hora)}` : '<span class="apagado">sem data</span>'}</td>
          <td>${esc(t.empresa ? t.empresa.nome : '')}</td><td>${esc(t.nome)}</td><td><b>${m.numero}.</b> ${esc(m.titulo)}</td>
          <td class="peq">${FORMATO[m.formato] || ''}${m.formato === 'presencial' && m.local ? ` · ${esc(m.local)}` : ''}</td><td>${mentorHtml(m)}</td></tr>`).join('')}</table></div>
        <p class="peq apagado mt">${linhas.length} aula(s). Clique numa linha para abrir o módulo.</p>`
        : '<div class="vazio">Nenhuma aula daqui para frente com essa busca. Desmarque "Só as próximas aulas" para ver as que já aconteceram.</div>';
      return;
    }

    caixa.innerHTML = `<div class="grade g2">${res.map(({ t, mods, achados, pelaTurma }) => {
      const prox = mods.find((m) => m.data_hora && !passou(m));
      const [st, cls] = STATUS[t.status] || [t.status, 'neutro'];
      const equipe = [...new Set(mods.flatMap((m) => (m.mentores || []).map((x) => x.mentor && x.mentor.nome).filter(Boolean).concat(convidado(m) && !(m.mentores || []).length ? [convidado(m)] : [])))];
      const lista = termos.length && !pelaTurma ? achados : [];
      return `<a class="cartao" href="#/turma/${t.id}" style="margin-top:0;color:inherit;text-decoration:none;display:grid;gap:6px">
        <span class="peq apagado" style="text-transform:uppercase;letter-spacing:.05em;font-weight:600">${esc(t.empresa ? t.empresa.nome : '')}</span>
        <h3>${esc(t.nome)}</h3>
        <div class="linha" style="gap:6px"><span class="selo ${cls}">${st}</span>${t.formato ? `<span class="selo neutro">${COMO[t.formato]}</span>` : ctx.ehAdmin ? '<span class="selo alerta">Online ou presencial?</span>' : ''}<span class="selo neutro">${mods.length} módulo(s)</span>${t.participantes_previstos ? `<span class="selo neutro">${t.participantes_previstos} participantes</span>` : ''}</div>
        <p class="peq apagado">${t.inicio ? `${dataBR(`${t.inicio}T12:00:00-03:00`)} a ${dataBR(`${t.fim_previsto || t.inicio}T12:00:00-03:00`)}` : 'Período a definir'}</p>
        <p class="peq"><b>Mentores:</b> ${equipe.length ? esc(equipe.join(', ')) : '<span class="selo alerta">a definir</span>'}</p>
        ${prox ? `<p class="peq"><b>Próximo módulo:</b> ${diaMes(prox.data_hora)} · ${esc(prox.titulo)} · ${mentorHtml(prox)}</p>` : ''}
        ${lista.length ? `<div class="lista peq" style="gap:4px;border-top:1px solid var(--linha);padding-top:8px"><b>Encontrado nesta turma:</b>${lista.slice(0, 5).map((m) => `<span>${m.data_hora ? diaMes(m.data_hora) : 'sem data'} · ${m.numero}. ${esc(m.titulo)} · ${mentorHtml(m)}</span>`).join('')}${lista.length > 5 ? `<span class="apagado">e mais ${lista.length - 5}</span>` : ''}</div>` : ''}
      </a>`;
    }).join('')}</div>`;
  };
  el.querySelector('#t-busca').addEventListener('input', desenhar);
  el.querySelector('#t-sit').addEventListener('input', desenhar);
  el.querySelector('#t-futuras').addEventListener('change', desenhar);
  el.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    vista = b.dataset.vista;
    try { localStorage.setItem('turmas_vista', vista); } catch (_) { /* sem armazenamento */ }
    desenhar();
  }));
  el.querySelector('#t-res').addEventListener('click', (ev) => { const tr = ev.target.closest('[data-ir]'); if (tr) location.hash = tr.dataset.ir; });
  desenhar();

  if (!ctx.ehAdmin) return;
  el.querySelector('#nova').addEventListener('click', () => { const f = el.querySelector('#form-nova'); f.hidden = !f.hidden; });
  el.querySelector('#t-empresa').addEventListener('change', async (ev) => {
    if (ev.target.value !== 'nova') return;
    const nome = window.prompt('Nome da empresa contratante:');
    if (!nome || !nome.trim()) { ev.target.value = ''; return; }
    const { data, error: e } = await sb.from('empresas').insert({ nome: nome.trim() }).select('id, nome').single();
    if (e) { avisar(explicarErro(e), true); ev.target.value = ''; return; }
    ev.target.insertAdjacentHTML('afterbegin', `<option value="${data.id}">${esc(data.nome)}</option>`);
    ev.target.value = data.id;
  });
  el.querySelectorAll('input[name=t-formato]').forEach((r) => r.addEventListener('change', () => {
    el.querySelector('#t-local-caixa').hidden = r.value === 'online';
  }));
  el.querySelector('#f-turma').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (s) => el.querySelector(s).value.trim();
    if (!v('#t-empresa') || v('#t-empresa') === 'nova' || !v('#t-nome')) { avisar('Escolha a empresa e dê um nome à turma.', true); return; }
    const formato = (el.querySelector('input[name=t-formato]:checked') || {}).value;
    if (!formato) { avisar('Marque se a turma é online, presencial ou parte de cada.', true); return; }
    const { data, error: e } = await gravarTurma({ empresa_id: v('#t-empresa'), nome: v('#t-nome'), perfil_turma: v('#t-perfil') || null,
      participantes_previstos: v('#t-part') === '' ? null : Number(v('#t-part')), inicio: v('#t-ini') || null, fim_previsto: v('#t-fim') || null,
      formato, local: formato === 'online' ? null : (v('#t-local') || null) });
    if (e) { avisar(explicarErro(e), true); return; }
    avisar('Turma criada. Agora cadastre os módulos.');
    ctx.irPara(`#/turma/${data.id}`);
  });
}

// ---------- página da turma ----------
async function paginaTurma(ctx, el, id) {
  const [{ data: t, error }, { data: mentores }] = await Promise.all([
    sb.from('turmas').select(`*, empresa:empresas(nome), modulos(${SEL_MODULO})`).eq('id', id).maybeSingle(),
    ctx.ehAdmin ? sb.from('perfis').select('id, nome, atende_grupo').or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome') : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;
  if (!t) { el.innerHTML = '<div class="vazio">Turma não encontrada, ou você não tem acesso a ela.</div>'; return; }
  const mods = (t.modulos || []).slice().sort((a, b) => a.numero - b.numero);
  const adm = ctx.ehAdmin;
  const dis = adm ? '' : ' disabled';
  const opMentores = (mentores || []).slice().sort((a, b) => (b.atende_grupo ? 1 : 0) - (a.atende_grupo ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));

  el.innerHTML = `
    <div class="cab"><div><p class="peq apagado"><a href="#/turmas">← Turmas</a></p><p class="apagado">${esc(t.empresa ? t.empresa.nome : '')}</p><h1>${esc(t.nome)}</h1></div>
      <div class="acoes"><span class="salvo" id="indicador"></span></div></div>
    <div class="grade g2" style="align-items:start">
      <div class="cartao" style="margin-top:0"><h3>A turma</h3>
        <div class="grade g2 mt" style="gap:10px">
          ${adm ? `<div class="campo" style="grid-column:1/-1"><label>Nome</label><input type="text" data-t="nome" value="${esc(t.nome)}"></div>` : ''}
          <div class="campo"><label>Participantes esperados</label><input type="number" min="0" data-t="participantes_previstos" value="${esc(t.participantes_previstos ?? '')}"${dis}></div>
          <div class="campo"><label>Situação</label><select data-t="status"${dis}>${Object.entries(STATUS).map(([k, [r]]) => `<option value="${k}"${k === t.status ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="campo"><label>Como vai ser</label><select data-t="formato"${dis}><option value="">Escolha…</option>${Object.entries(COMO).map(([k, r]) => `<option value="${k}"${k === t.formato ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="campo"><label>Cidade (aulas presenciais)</label><input type="text" data-t="local" value="${esc(t.local || '')}" placeholder="Ex.: Curitiba (PR)"${dis}></div>
          <div class="campo"><label>Início</label><input type="date" data-t="inicio" value="${esc(t.inicio || '')}"${dis}></div>
          <div class="campo"><label>Fim previsto</label><input type="date" data-t="fim_previsto" value="${esc(t.fim_previsto || '')}"${dis}></div>
        </div>
        ${adm && !t.formato ? '<div class="aviso mt">Escolha se a turma é <b>online, presencial ou parte de cada</b>: a agenda usa essa informação para reservar os dias de deslocamento.</div>' : ''}
        <div class="campo mt"><label>Perfil da turma</label><textarea data-t="perfil_turma" style="min-height:120px" placeholder="Cargos, nível de liderança, principais desafios, o que a empresa espera."${dis}>${esc(t.perfil_turma || '')}</textarea></div>
        ${adm ? `<div class="campo mt"><label>Metodologia e observações (os mentores veem)</label><textarea data-t="observacoes" style="min-height:100px" placeholder="Como a aula é conduzida, personalização, cuidados com a turma. Não coloque valores nem condições comerciais.">${esc(t.observacoes || '')}</textarea></div>` : (t.observacoes ? `<p class="peq mt"><b>Metodologia e observações</b></p><p class="peq" style="white-space:pre-wrap">${esc(t.observacoes)}</p>` : '')}
        ${adm && t.formato !== 'online' ? `<div class="mt2"><h4>Viagens das aulas presenciais</h4>
          <p class="peq apagado">Quem paga e quem compra, para todos os mentores desta turma. Numa viagem específica dá para mudar em <a href="#/agenda/viagens">Agenda → Viagens</a>.</p>
          ${t.viagem_padrao === undefined ? '<div class="aviso mt">Para guardar isso, falta rodar o script <b>25-viagens-relatorio-checklist.sql</b> no Supabase.</div>' : ''}
          <div class="ag-viagem-itens mt">${ITENS_VIAGEM.map((it) => `<div class="ag-viagem-item"><b class="peq">${it.nome}</b>
            ${[['paga', 'Quem paga'], ['compra', it.compra]].map(([q, rotulo]) => `<label class="ag-viagem-quem"><span>${rotulo}</span><select data-vp="${q}_${it.k}">
              <option value="">Não definido</option>${Object.entries(QUEM_VIAGEM).map(([k, r]) => `<option value="${k}"${(t.viagem_padrao || {})[`${q}_${it.k}`] === k ? ' selected' : ''}>${r}</option>`).join('')}</select></label>`).join('')}</div>`).join('')}</div></div>` : ''}
      </div>
      <div class="cartao" style="margin-top:0">
        <div class="linha"><h3 style="flex:1">Módulos (${mods.length})</h3>${adm ? `${mods.length ? '<button class="btn peq" id="descritivo">Descritivo da proposta</button>' : ''}<button class="btn peq escuro" id="novo-mod">+ Novo módulo</button>` : ''}</div>
        ${adm && mods.some((m) => !String(m.tematica || '').trim()) ? `<p class="peq apagado mt">${mods.filter((m) => !String(m.tematica || '').trim()).length} módulo(s) sem o descritivo do que deve ser abordado. Clique em "Descritivo da proposta" para trazer da proposta.</p>` : ''}
        ${adm ? `<form id="f-mod" class="mt" hidden style="background:var(--bg);border-radius:12px;padding:12px">
          <div class="grade g2" style="gap:10px">
            <div class="campo" style="grid-column:1/-1"><label>Título do módulo</label><input type="text" id="m-titulo" placeholder="Ex.: Feedback que desenvolve" required></div>
            <div class="campo"><label>Data e hora (Brasília)</label><input type="datetime-local" id="m-data"></div>
            <div class="campo"><label>Onde acontece *</label><select id="m-formato"><option value="">Escolha…</option>${Object.entries(FORMATO).filter(([k]) => k !== 'indefinido')
              .map(([k, r]) => `<option value="${k}"${k === (t.formato === 'presencial' ? 'presencial' : t.formato === 'online' ? 'meet' : '') ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
            <div class="campo" style="grid-column:1/-1"><label>Link da sala (ou endereço, se presencial)</label><input type="text" id="m-link" placeholder="https://…"></div>
          </div>
          <p class="peq mt"><b>Mentor(es) do módulo</b></p>
          <div class="chips mt">${opMentores.map((x) => `<label class="check" style="margin-right:12px"><input type="checkbox" name="m-ment" value="${x.id}"><span>${esc(x.nome)}${x.atende_grupo ? '' : ' <span class="peq apagado">(individual)</span>'}</span></label>`).join('')}</div>
          <div class="linha mt"><button class="btn pri peq" type="submit">Criar módulo</button></div>
        </form>` : ''}
        <div class="lista mt">${mods.map((m) => `<a class="item" href="#/modulo/${m.id}" style="grid-template-columns:70px 1fr auto">
          <div><b>${m.numero}</b><br><span class="peq apagado">${m.data_hora ? diaMes(m.data_hora) : 'sem data'}</span></div>
          <div style="min-width:0"><div class="nome">${esc(m.titulo)}</div><div class="info">${esc(nomesMentores(m) || 'Mentor a definir')} · ${FORMATO[m.formato] || ''}${m.data_hora ? ` · ${horaBR(m.data_hora)}` : ''}${adm && !String(m.tematica || '').trim() ? ' · <span style="color:#7A4A20">sem descritivo</span>' : ''}</div></div>
          ${m.percepcoes_em ? '<span class="selo">Percepções ✓</span>' : pedePercepcao(m) ? '<span class="selo alerta">Sem percepções</span>' : passou(m) ? '<span class="selo neutro">Realizada</span>' : '<span class="selo neutro">A acontecer</span>'}</a>`).join('')
          || '<p class="apagado">Nenhum módulo ainda.</p>'}</div>
      </div>
    </div>`;

  if (!adm) return;
  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const mud = {};
      el.querySelectorAll('[data-t]').forEach((c) => { const x = c.value.trim(); mud[c.dataset.t] = c.type === 'number' ? (x === '' ? null : Number(x)) : (x || null); });
      if (!mud.nome) delete mud.nome;
      const { error: e } = await gravarTurma(mud, id);
      if (e) throw e;
      import('./agenda-dados.js').then(({ avisarGoogle }) => avisarGoogle());
    },
  });
  el.querySelectorAll('[data-t]').forEach((c) => { c.addEventListener('input', salvador.mudou); c.addEventListener('change', salvador.mudou); });
  // padrão das viagens da turma (quem paga e quem compra)
  el.querySelectorAll('[data-vp]').forEach((c) => c.addEventListener('change', async () => {
    const viagem_padrao = {};
    el.querySelectorAll('[data-vp]').forEach((s) => { if (s.value) viagem_padrao[s.dataset.vp] = s.value; });
    const { error: e } = await sb.from('turmas').update({ viagem_padrao }).eq('id', id);
    if (e) { avisar(/viagem_padrao|schema cache|42703/.test(`${e.code} ${e.message}`) ? 'Falta rodar o script 25 no Supabase para guardar isso.' : explicarErro(e), true); return; }
    avisar('Padrão das viagens salvo.');
  }));
  el.querySelector('#descritivo')?.addEventListener('click', async () => {
    await salvador.agora();
    const { abrirDescritivo } = await import('./descritivo-proposta.js');
    abrirDescritivo(ctx, id, { aoTerminar: () => ctx.irPara(`#/turma/${id}`) });
  });
  el.querySelector('#novo-mod').addEventListener('click', () => { const f = el.querySelector('#f-mod'); f.hidden = !f.hidden; });
  el.querySelector('#f-mod').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const titulo = el.querySelector('#m-titulo').value.trim();
    if (!titulo) { avisar('Dê um título ao módulo.', true); return; }
    const formato = el.querySelector('#m-formato').value;
    if (!formato) { avisar('Escolha onde o módulo acontece: online (Meet, Zoom, Teams) ou presencial.', true); return; }
    const lk = el.querySelector('#m-link').value.trim();
    const numero = mods.reduce((a, m) => Math.max(a, m.numero), 0) + 1;
    const quando = localParaISO(el.querySelector('#m-data').value);
    const escolhidos = [...el.querySelectorAll('input[name=m-ment]:checked')].map((c) => c.value);
    const { data: novo, error: e } = await sb.from('modulos').insert({ turma_id: id, numero, titulo, formato,
      data_hora: localParaISO(el.querySelector('#m-data').value) || null,
      link: formato === 'presencial' ? null : (lk || null), local: formato === 'presencial' ? (lk || t.local || null) : null }).select('id').single();
    if (e) { avisar(explicarErro(e), true); return; }
    const ids = [...el.querySelectorAll('input[name=m-ment]:checked')].map((c) => ({ modulo_id: novo.id, mentor_id: c.value }));
    if (ids.length) { const r = await sb.from('modulo_mentores').insert(ids); if (r.error) avisar(explicarErro(r.error), true); }
    avisar('Módulo criado.');
    import('./agenda-dados.js').then(({ avisarGoogle }) => avisarGoogle());
    const { conferirModulos, mostrarConflitos } = await import('./agenda-dados.js');
    const conflitos = await conferirModulos(ctx, [{ id: novo.id, numero, titulo, data_hora: quando, formato, turma: t, mentorIds: escolhidos }]);
    if (conflitos.length) { mostrarConflitos(conflitos, { intro: 'O módulo foi criado, mas a data bate com algo na agenda:', aoFechar: () => ctx.irPara(`#/modulo/${novo.id}`) }); return; }
    ctx.irPara(`#/modulo/${novo.id}`);
  });
  return { sair: () => { salvador.agora(); salvador.parar(); } };
}

// ---------- página do módulo ----------
const nomeSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-90);
const TIPO_POR_EXT = { pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation', key: 'application/vnd.apple.keynote', zip: 'application/zip' };
// descritivo para quem só lê (mentor): rótulos "Objetivo:" e "Entrega prática:" em negrito
const textoAula = (t) => esc(t).replace(/^(Objetivo|Entrega prática|Período):/gm, '<b>$1:</b>');
const tamanho = (b) => (b ? (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`) : '');

async function paginaModulo(ctx, el, id) {
  const { data: m, error } = await sb.from('modulos').select(`*, turma:turmas(*, empresa:empresas(nome)),
    mentores:modulo_mentores(mentor:perfis(id, nome, foto_url)), arquivos:modulo_arquivos(id, tipo, nome, caminho, tamanho, enviado_por, enviado_em, autor:perfis(nome))`).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!m) { el.innerHTML = '<div class="vazio">Módulo não encontrado, ou você não tem acesso a ele.</div>'; return; }
  const adm = ctx.ehAdmin;
  const souMentor = ministra(m, ctx.perfil.id);
  const podePercepcao = adm || souMentor;
  const { data: equipe } = adm ? await sb.from('perfis').select('id, nome, atende_grupo').or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome') : { data: [] };
  const escolhidos = new Set((m.mentores || []).map((x) => x.mentor && x.mentor.id));
  const arquivos = (m.arquivos || []).slice().sort((a, b) => new Date(b.enviado_em) - new Date(a.enviado_em));
  const oficiais = arquivos.filter((a) => a.tipo === 'oficial');
  const dosMentores = arquivos.filter((a) => a.tipo === 'mentor');
  const fotos = arquivos.filter((a) => a.tipo === 'foto').reverse();   // na ordem em que foram colocadas
  const podeFotos = adm || souMentor;
  const linkSala = m.formato === 'presencial' ? '' : (m.link || '');
  const ehUrl = /^https?:\/\//i.test(linkSala);

  const listaArquivos = (lista, vazio) => (lista.length ? `<div class="lista mt">${lista.map((a) => `<div class="item" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><div class="nome" style="word-break:break-word">${esc(a.nome)}</div><div class="info">${tamanho(a.tamanho)}${a.autor ? ` · ${esc(a.autor.nome)}` : ''} · ${dataBR(a.enviado_em)}</div></div>
      <div class="linha" style="gap:6px"><button class="btn peq pri" data-baixar="${a.id}">Baixar</button>${adm || (a.tipo === 'mentor' && a.enviado_por === ctx.perfil.id) ? `<button class="btn peq" data-apagar="${a.id}" aria-label="Apagar ${esc(a.nome)}">Apagar</button>` : ''}</div></div>`).join('')}</div>`
    : `<p class="apagado mt">${vazio}</p>`);
  const botaoEnvio = (tipo, rotulo) => `<label class="btn peq${tipo === 'oficial' ? ' escuro' : ' pri'} mt" style="cursor:pointer">${rotulo}<input type="file" data-enviar="${tipo}" accept=".pdf,.ppt,.pptx,.odp,.key,.zip" hidden></label>`;

  el.innerHTML = `
    <div class="linha" style="align-items:flex-start;gap:16px">
      <div style="flex:1;min-width:240px">
        <p class="peq apagado"><a href="#/turma/${m.turma.id}">← ${esc(m.turma.empresa ? m.turma.empresa.nome : '')} · ${esc(m.turma.nome)}</a></p>
        <h1>Módulo ${m.numero} · ${esc(m.titulo)}</h1>
        <p class="apagado">${m.data_hora ? dataHoraBR(m.data_hora) : 'Data a definir'}${m.duracao_min ? ` · ${m.duracao_min} min` : ''} · ${FORMATO[m.formato] || ''}${m.formato === 'presencial' && m.local ? ` · ${esc(m.local)}` : ''}</p>
        <div class="linha mt" style="gap:6px">${(m.mentores || []).map((x) => x.mentor ? `<span class="selo neutro com-rosto">${avatar(x.mentor)}${esc(x.mentor.nome)}</span>` : '').join('') || '<span class="selo alerta">Mentor a definir</span>'}</div>
      </div>
      <div class="linha">
        ${ehUrl ? `<a class="btn escuro" href="${esc(linkSala)}" target="_blank" rel="noopener">Entrar na aula (${FORMATO[m.formato] || 'online'})</a>` : ''}
        <button class="btn" id="cintia">Falar com a Cintia</button>
        <span class="salvo" id="indicador"></span>
      </div>
    </div>

    <div class="grade g2 mt2" style="align-items:start">
      <div class="sessao-col">
        <div class="cartao"><h3>A turma</h3>
          <p class="mt"><b>${esc(m.turma.empresa ? m.turma.empresa.nome : '')}</b> · ${esc(m.turma.nome)}${m.turma.participantes_previstos ? ` · <span class="selo neutro">${m.turma.participantes_previstos} participantes esperados</span>` : ''}</p>
          ${m.turma.perfil_turma ? `<p class="peq mt" style="white-space:pre-wrap">${esc(m.turma.perfil_turma)}</p>` : '<p class="peq apagado mt">Perfil da turma ainda não preenchido.</p>'}
          ${m.turma.observacoes ? `<p class="peq mt"><b>Metodologia e observações</b></p><p class="peq" style="white-space:pre-wrap">${esc(m.turma.observacoes)}</p>` : ''}
        </div>
        <div class="cartao"><h3>Temática da aula</h3>
          <p class="peq apagado">O que deve ser abordado, conforme a proposta.</p>
          ${adm ? `<div class="campo mt"><label>Título</label><input type="text" data-mod="titulo" value="${esc(m.titulo)}"></div>
            <textarea class="mt" data-mod="tematica" style="min-height:${m.tematica ? 240 : 120}px" placeholder="Objetivo, entrega prática e tópicos que devem ser abordados na aula.">${esc(m.tematica || '')}</textarea>
            ${String(m.tematica || '').trim() ? '' : '<div class="aviso mt">Este módulo ainda está sem o descritivo. <button class="btn peq pri" type="button" id="descritivo">Trazer da proposta</button></div>'}`
          : m.tematica ? `<div class="mt" style="white-space:pre-wrap;line-height:1.55">${textoAula(m.tematica)}</div>`
            : '<p class="apagado mt">A coordenação ainda não colocou o descritivo deste módulo. Se precisar, clique em "Falar com a Cintia".</p>'}
        </div>
        <div class="cartao"><h3>Recomendações da aula</h3>
          ${adm ? `<textarea class="mt" data-mod="recomendacoes" style="min-height:120px" placeholder="O que enfatizar, cuidados com a turma, combinados com a empresa, dinâmicas sugeridas.">${esc(m.recomendacoes || '')}</textarea>`
            : m.recomendacoes ? `<div class="mt peq" style="white-space:pre-wrap;line-height:1.55">${esc(m.recomendacoes)}</div>` : '<p class="apagado mt">Nenhuma recomendação para esta aula.</p>'}
        </div>
        ${adm ? `<div class="cartao"><h3>Quando e onde</h3>
          <div class="grade g2 mt" style="gap:10px">
            <div class="campo"><label>Data e hora (Brasília)</label><input type="datetime-local" data-mod="data_hora" value="${esc(isoParaLocal(m.data_hora))}"></div>
            <div class="campo"><label>Duração (minutos)</label><input type="number" min="0" data-mod="duracao_min" value="${esc(m.duracao_min ?? '')}"></div>
            <div class="campo"><label>Onde acontece</label><select data-mod="formato">${Object.entries(FORMATO).map(([k, r]) => `<option value="${k}"${k === m.formato ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
            <div class="campo"><label>Link da sala</label><input type="url" data-mod="link" placeholder="https://zoom.us/… ou https://meet.google.com/…" value="${esc(m.link || '')}"></div>
            <div class="campo" style="grid-column:1/-1"><label>Endereço (se presencial)</label><input type="text" data-mod="local" value="${esc(m.local || '')}"></div>
          </div>
          <p class="peq mt"><b>Mentor(es) do módulo</b></p>
          <div class="chips mt" id="mentores">${(equipe || []).map((x) => `<label class="check" style="margin-right:12px"><input type="checkbox" value="${x.id}"${escolhidos.has(x.id) ? ' checked' : ''}><span>${esc(x.nome)}${x.atende_grupo ? '' : ' <span class="peq apagado">(individual)</span>'}</span></label>`).join('')}</div>
          <div id="choques" class="mt"></div>
          ${m.formato === 'presencial' ? '<p class="peq apagado mt">Aula presencial: a véspera e o dia seguinte ficam reservados para o deslocamento. Passagem e hotel ficam em <a href="#/agenda/viagens">Agenda → Viagens</a>.</p>' : ''}
        </div>` : ''}
      </div>

      <div class="sessao-col">
        <div class="cartao"><h3>Slides oficiais da Mentorei</h3>
          <p class="peq apagado">O material base do módulo, para baixar e adaptar.</p>
          ${listaArquivos(oficiais, 'Os slides oficiais ainda não foram enviados.')}
          ${adm ? botaoEnvio('oficial', 'Enviar slides oficiais') : ''}
        </div>
        <div class="cartao"><h3>Slides dos mentores</h3>
          <p class="peq apagado">A versão que ${souMentor ? 'você vai usar' : 'o mentor vai usar'} na aula (PDF ou PowerPoint, até 50 MB).</p>
          ${listaArquivos(dosMentores, 'Nenhum slide enviado pelos mentores ainda.')}
          ${souMentor || adm ? botaoEnvio('mentor', souMentor ? 'Enviar os meus slides' : 'Enviar slides do mentor') : ''}
          <p class="peq apagado mt" id="progresso"></p>
        </div>
        <div class="cartao" style="${podePercepcao ? 'border-color:var(--verde);background:linear-gradient(var(--verde-claro), var(--papel) 90px)' : ''}">
          <h3>Percepções sobre a aula</h3>
          <p class="peq">${podePercepcao ? 'Depois da aula, conte como foi: engajamento, o que funcionou, pontos de atenção e sugestões para os próximos módulos. Só a equipe da Mentorei lê.' : 'Escritas pelo mentor depois da aula.'}</p>
          <div class="campo mt" style="max-width:220px"><label>Participantes presentes</label><input type="number" min="0" data-perc="participantes_presentes" value="${esc(m.participantes_presentes ?? '')}"${podePercepcao ? '' : ' disabled'}></div>
          <textarea class="mt" data-perc="percepcoes" style="min-height:180px" placeholder="Como foi a aula?"${podePercepcao ? '' : ' disabled'}>${esc(m.percepcoes || '')}</textarea>
          ${m.percepcoes_em ? `<p class="peq apagado mt">Registradas em ${dataHoraBR(m.percepcoes_em)}.</p>` : ''}
        </div>
        <div class="cartao" id="fotos-aula">
          <div class="linha"><h3 style="flex:1">Fotos da aula</h3>${fotos.length ? `<span class="selo neutro">${fotos.length} foto${fotos.length > 1 ? 's' : ''}</span>` : ''}</div>
          <p class="peq apagado">${podeFotos ? 'Coloque aqui as fotos do encontro: dá para escolher várias de uma vez. Quem acompanha a turma na Mentorei vê.' : 'Fotos do encontro.'}</p>
          ${fotos.length ? `<div class="fotos-aula mt">${fotos.map((f) => `<button type="button" class="foto-aula" data-foto="${f.id}" aria-label="Ver a foto ${esc(f.nome)}"><img alt="" data-mini="${f.id}"></button>`).join('')}</div>`
            : '<p class="apagado mt">Nenhuma foto ainda.</p>'}
          ${podeFotos ? '<label class="btn peq pri mt" style="cursor:pointer">📷 Colocar fotos<input type="file" id="fotos-enviar" accept="image/*" multiple hidden></label>' : ''}
          <p class="peq apagado mt" id="fotos-progresso" role="status"></p>
        </div>
      </div>
    </div>`;

  // salvamento automático (administração: tudo; mentor do módulo: percepções e presença)
  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const mud = {};
      const ler = (sel, attr) => el.querySelectorAll(sel).forEach((c) => {
        const x = c.value.trim();
        mud[c.dataset[attr]] = c.type === 'number' ? (x === '' ? null : Number(x)) : c.type === 'datetime-local' ? (localParaISO(x) || null) : (x || null);
      });
      if (adm) ler('[data-mod]', 'mod');
      if (podePercepcao) ler('[data-perc]', 'perc');
      if (adm && !mud.titulo) delete mud.titulo;
      if (mud.percepcoes && !m.percepcoes_em) { mud.percepcoes_em = new Date().toISOString(); mud.percepcoes_por = ctx.perfil.id; m.percepcoes_em = mud.percepcoes_em; }
      const { error: e } = await sb.from('modulos').update(mud).eq('id', id);
      if (e) throw e;
      if (adm) import('./agenda-dados.js').then(({ avisarGoogle }) => avisarGoogle());
    },
  });
  el.querySelectorAll(adm ? '[data-mod], [data-perc]' : '[data-perc]').forEach((c) => { if (!c.disabled) { c.addEventListener('input', salvador.mudou); c.addEventListener('change', salvador.mudou); } });

  // descritivo do módulo pela proposta (administração, quando o módulo ainda está sem)
  el.querySelector('#descritivo')?.addEventListener('click', async () => {
    await salvador.agora();
    const { abrirDescritivo } = await import('./descritivo-proposta.js');
    abrirDescritivo(ctx, m.turma.id, { aoTerminar: () => ctx.irPara(`#/modulo/${id}`) });
  });

  // choques com a agenda dos mentores (administração)
  const conferirChoques = async () => {
    const box = el.querySelector('#choques'); if (!box) return;
    const quando = localParaISO(el.querySelector('[data-mod="data_hora"]').value);
    const ids = [...el.querySelectorAll('#mentores input:checked')].map((c) => c.value);
    if (!quando || !ids.length) { box.innerHTML = ''; return; }
    const formato = el.querySelector('[data-mod="formato"]').value;
    const indefinido = formato === 'indefinido' && !(m.turma && m.turma.formato === 'presencial')
      ? '<div class="aviso">Escolha em "Onde acontece" se a aula é online ou presencial: a agenda usa essa informação.</div>' : '';
    if (!quando) { box.innerHTML = indefinido; return; }
    const { conferirModulos } = await import('./agenda-dados.js');
    const lista = await conferirModulos(ctx, [{ id, data_hora: quando, duracao_min: el.querySelector('[data-mod="duracao_min"]').value, formato, turma: m.turma, mentorIds: ids }]);
    box.innerHTML = indefinido + (lista.length ? `<div class="aviso"><b>Atenção na agenda:</b><ul class="peq">${lista[0].avisos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
      : `<p class="peq" style="color:var(--verde-esc)">✓ ${ids.length ? 'Sem choques na agenda dos mentores.' : 'Data livre na agenda. Ainda falta escolher o mentor.'}</p>`);
  };
  if (adm) {
    el.querySelectorAll('[data-mod="data_hora"], [data-mod="formato"], [data-mod="duracao_min"]').forEach((c) => c.addEventListener('change', conferirChoques));
    el.querySelector('#mentores')?.addEventListener('change', () => setTimeout(conferirChoques, 300));
    conferirChoques();
  }

  // mentores do módulo (administração)
  el.querySelector('#mentores')?.addEventListener('change', async (ev) => {
    const c = ev.target.closest('input[type=checkbox]'); if (!c) return;
    const r = c.checked ? await sb.from('modulo_mentores').insert({ modulo_id: id, mentor_id: c.value })
      : await sb.from('modulo_mentores').delete().eq('modulo_id', id).eq('mentor_id', c.value);
    if (r.error) { avisar(explicarErro(r.error), true); c.checked = !c.checked; return; }
    avisar(c.checked ? 'Mentor incluído no módulo.' : 'Mentor retirado do módulo.');
    import('./agenda-dados.js').then(({ avisarGoogle }) => avisarGoogle());
  });

  // envio de slides
  el.querySelectorAll('[data-enviar]').forEach((inp) => inp.addEventListener('change', async () => {
    const arq = inp.files[0]; if (!arq) return;
    const tipo = inp.dataset.enviar;
    const prog = el.querySelector('#progresso');
    if (arq.size > 52428800) { avisar('O arquivo passa de 50 MB. Salve como PDF ou reduza as imagens e tente de novo.', true); return; }
    const ext = (arq.name.split('.').pop() || '').toLowerCase();
    const contentType = TIPO_POR_EXT[ext] || arq.type;
    if (!TIPO_POR_EXT[ext]) { avisar('Envie um PDF ou uma apresentação (PowerPoint, Keynote ou ODP).', true); return; }
    const caminho = `${id}/${tipo}/${Date.now()}-${nomeSeguro(arq.name)}`;
    try {
      if (prog) prog.textContent = `Enviando ${arq.name}…`;
      const up = await sb.storage.from('turmas').upload(caminho, arq, { contentType });
      if (up.error) throw up.error;
      const r = await sb.from('modulo_arquivos').insert({ modulo_id: id, tipo, nome: arq.name, caminho, tamanho: arq.size, enviado_por: ctx.perfil.id });
      if (r.error) { await sb.storage.from('turmas').remove([caminho]); throw r.error; }
      avisar('Slides enviados.');
      ctx.irPara(`#/modulo/${id}`);
    } catch (e) { if (prog) prog.textContent = ''; avisar(explicarErro(e), true); }
  }));

  // ---------- fotos da aula (script 29): foto grande em "<módulo>/foto/" e miniatura em "<módulo>/foto-mini/" ----------
  const miniDe = (c) => c.replace('/foto/', '/foto-mini/');
  const miniaturas = new Map();   // id da foto → endereço temporário da miniatura
  if (fotos.length) {
    sb.storage.from('turmas').createSignedUrls(fotos.map((f) => miniDe(f.caminho)), 3600).then(({ data }) => {
      fotos.forEach((f, i) => {
        const img = el.querySelector(`img[data-mini="${f.id}"]`); if (!img) return;
        const x = (data || [])[i];
        if (x && x.signedUrl) { img.src = x.signedUrl; miniaturas.set(f.id, x.signedUrl); }
        else sb.storage.from('turmas').createSignedUrl(f.caminho, 3600).then(({ data: g }) => { if (g) img.src = g.signedUrl; });   // sem miniatura: a grande
      });
    });
  }
  const explicarFoto = (e) => (/mime|check constraint|row-level security|permission denied|not allowed/i.test(String((e && (e.message || e.error)) || e || ''))
    ? (adm ? 'Para guardar fotos no módulo, falta rodar o script 29-fotos-das-aulas.sql no Supabase.' : 'As fotos das aulas ainda não foram liberadas na plataforma. Avise a Cintia.')
    : explicarErro(e));
  el.querySelector('#fotos-enviar')?.addEventListener('change', async (ev) => {
    const lista = [...ev.target.files].filter((f) => !f.type || f.type.startsWith('image/'));
    ev.target.value = '';
    if (!lista.length) { avisar('Escolha fotos (JPG, PNG ou do celular).', true); return; }
    const prog = el.querySelector('#fotos-progresso');
    const { reduzirImagem } = await import('./perfil-comum.js');
    let feitas = 0;
    for (const [i, arq] of lista.entries()) {
      prog.textContent = lista.length > 1 ? `Enviando a foto ${i + 1} de ${lista.length}…` : 'Enviando a foto…';
      const caminho = `${id}/foto/${Date.now()}-${i}-${nomeSeguro(arq.name.replace(/\.[^.]+$/, '') || 'foto')}.jpg`;
      try {
        const grande = await reduzirImagem(arq, 2000, 0.85);   // leve para guardar e abrir, ainda boa para imprimir
        const mini = await reduzirImagem(arq, 480, 0.8);
        const up = await sb.storage.from('turmas').upload(caminho, grande, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        await sb.storage.from('turmas').upload(miniDe(caminho), mini, { contentType: 'image/jpeg' });   // se falhar, a tela usa a grande
        const r = await sb.from('modulo_arquivos').insert({ modulo_id: id, tipo: 'foto', nome: arq.name, caminho, tamanho: grande.size, enviado_por: ctx.perfil.id });
        if (r.error) { await sb.storage.from('turmas').remove([caminho, miniDe(caminho)]); throw r.error; }
        feitas += 1;
      } catch (e) {
        const msg = explicarFoto(e);
        avisar(`${lista.length > 1 ? `Foto ${i + 1} (${arq.name}): ` : ''}${msg}`, true);
        if (/script 29|liberadas/.test(msg)) break;   // as próximas iam falhar pelo mesmo motivo
      }
    }
    prog.textContent = '';
    if (feitas) { avisar(feitas === 1 ? 'Foto colocada no módulo.' : `${feitas} fotos colocadas no módulo.`); ctx.irPara(`#/modulo/${id}`); }
  });
  // foto grande, com anterior/próxima (botões ou setas do teclado), baixar e apagar
  const verFoto = async (fotoId) => {
    const { janela } = await import('./agenda-dados.js');
    let k = Math.max(0, fotos.findIndex((f) => f.id === fotoId));
    const j = janela('Fotos da aula', '<div class="foto-grande"><img alt=""></div><div class="linha mt" id="fg-barra"></div>', { largura: 980 });
    const img = j.corpo.querySelector('.foto-grande img');
    const mostrar = async () => {
      const f = fotos[k];
      img.src = miniaturas.get(f.id) || '';   // a miniatura aparece na hora; a grande entra quando chegar
      img.alt = `Foto ${k + 1} de ${fotos.length} da aula`;
      const podeApagar = adm || f.enviado_por === ctx.perfil.id;
      j.corpo.querySelector('#fg-barra').innerHTML = `
        ${fotos.length > 1 ? `<button class="btn peq" type="button" data-passo="-1" aria-label="Foto anterior">‹</button><span class="peq">${k + 1} de ${fotos.length}</span><button class="btn peq" type="button" data-passo="1" aria-label="Próxima foto">›</button>` : ''}
        <span class="peq apagado" style="flex:1;min-width:140px">${f.autor ? `Colocada por ${esc(f.autor.nome)} · ` : ''}${dataBR(f.enviado_em)}</span>
        <button class="btn peq pri" type="button" data-baixar-foto>Baixar</button>
        ${podeApagar ? '<button class="btn peq perigo" type="button" data-apagar-foto>Apagar</button>' : ''}`;
      const { data } = await sb.storage.from('turmas').createSignedUrl(f.caminho, 3600);
      if (data && fotos[k] === f) img.src = data.signedUrl;
    };
    const passo = (n) => { k = (k + n + fotos.length) % fotos.length; mostrar(); };
    const teclas = (ev) => {
      if (!j.fundo.isConnected) { document.removeEventListener('keydown', teclas); return; }
      if (fotos.length > 1 && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) passo(ev.key === 'ArrowRight' ? 1 : -1);
    };
    document.addEventListener('keydown', teclas);
    j.corpo.addEventListener('click', async (ev) => {
      const p = ev.target.closest('[data-passo]'); if (p) { passo(Number(p.dataset.passo)); return; }
      const f = fotos[k];
      if (ev.target.closest('[data-baixar-foto]')) {
        const aba = window.open('', '_blank');
        const { data, error: e } = await sb.storage.from('turmas').createSignedUrl(f.caminho, 300, { download: `${f.nome.replace(/\.[^.]+$/, '') || 'foto'}.jpg` });
        if (e) { if (aba) aba.close(); avisar(explicarErro(e), true); return; }
        if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
        return;
      }
      if (ev.target.closest('[data-apagar-foto]')) {
        if (!window.confirm('Apagar esta foto do módulo?')) return;
        const r = await sb.from('modulo_arquivos').delete().eq('id', f.id);
        if (r.error) { avisar(explicarErro(r.error), true); return; }
        await sb.storage.from('turmas').remove([f.caminho, miniDe(f.caminho)]);
        j.fechar(); avisar('Foto apagada.'); ctx.irPara(`#/modulo/${id}`);
      }
    });
    mostrar();
  };

  el.addEventListener('click', async (ev) => {
    const ft = ev.target.closest('[data-foto]');
    if (ft) { verFoto(ft.dataset.foto); return; }
    const b = ev.target.closest('[data-baixar]');
    if (b) {
      const a = arquivos.find((x) => x.id === b.dataset.baixar);
      const aba = window.open('', '_blank'); // abre já no clique, para o navegador não bloquear
      const { data, error: e } = await sb.storage.from('turmas').createSignedUrl(a.caminho, 300, { download: a.nome });
      if (e) { if (aba) aba.close(); avisar(explicarErro(e), true); return; }
      if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
      return;
    }
    const d = ev.target.closest('[data-apagar]');
    if (d) {
      const a = arquivos.find((x) => x.id === d.dataset.apagar);
      if (!window.confirm(`Apagar "${a.nome}"?`)) return;
      const r = await sb.from('modulo_arquivos').delete().eq('id', a.id);
      if (r.error) { avisar(explicarErro(r.error), true); return; }
      await sb.storage.from('turmas').remove([a.caminho]);
      avisar('Arquivo apagado.'); ctx.irPara(`#/modulo/${id}`);
      return;
    }
    if (ev.target.id === 'cintia') {
      const { data } = await sb.rpc('contato_coordenacao');
      const c = (data || [])[0];
      const num = (c && c.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
      if (!num) { avisar('O WhatsApp da Cintia ainda não está no perfil dela. Escreva para contato@mentorei.com.br.', true); return; }
      const texto = `Oi, ${(c.nome || 'Cintia').split(' ')[0]}! Aqui é ${ctx.perfil.nome.split(' ')[0]}. É sobre o módulo ${m.numero} (${m.titulo}) da turma ${m.turma.nome}${m.turma.empresa ? `, ${m.turma.empresa.nome}` : ''}: `;
      window.open(`https://wa.me/55${num}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    }
  });

  return { sair: () => { salvador.agora(); salvador.parar(); } };
}

// ---------- resumo para o Painel da administração ----------
export async function resumoGrupo(el) {
  const { data, error } = await sb.from('modulos').select(`id, numero, titulo, data_hora, percepcoes_em, turma:turmas(nome, empresa:empresas(nome)), mentores:modulo_mentores(mentor:perfis(nome))`);
  if (error) { el.innerHTML = ''; return; }
  const em14 = agora() + 14 * 86400000;
  const proximos = (data || []).filter((m) => m.data_hora && !passou(m) && new Date(m.data_hora).getTime() < em14).sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  const pendentes = (data || []).filter(pedePercepcao);
  const semMentor = (data || []).filter((m) => !passou(m) && !(m.mentores || []).length);
  const item = (m) => `<a class="pend" href="#/modulo/${m.id}"><b>${m.data_hora ? `${diaMes(m.data_hora)}<br>${horaBR(m.data_hora)}` : 'sem data'}</b>
    <span>${esc(m.turma ? m.turma.nome : '')} · módulo ${m.numero}<br><span class="peq apagado">${esc(m.titulo)} · ${esc(nomesMentores(m) || 'sem mentor')}</span></span></a>`;
  if (!proximos.length && !pendentes.length && !semMentor.length) {
    el.innerHTML = (data || []).length ? '<div class="aviso ok">Nenhum módulo nos próximos 14 dias e nenhuma percepção pendente.</div>' : '<p class="apagado">Nenhuma turma cadastrada. <a href="#/turmas">Criar a primeira turma</a>.</p>';
    return;
  }
  const bloco = (titulo, itens, cls = '') => (itens.length ? `<div class="cartao pend-bloco ${cls}"><h3>${titulo} <span class="selo ${cls ? 'erro' : 'neutro'}">${itens.length}</span></h3><div class="lista mt">${itens.slice(0, 8).map(item).join('')}</div></div>` : '');
  el.innerHTML = `<div class="grade g2">${bloco('Módulos nos próximos 14 dias', proximos)}${bloco('Aulas sem percepções do mentor', pendentes, 'urgente')}${bloco('Módulos sem mentor definido', semMentor, 'urgente')}</div>`;
}
