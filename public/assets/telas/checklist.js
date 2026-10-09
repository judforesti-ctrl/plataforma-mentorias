// Checklist: atividades com responsáveis (equipe e administração) e data de entrega (opcional, muda depois).
// "#/checklist" lista; "#/checklist/<id>" abre a atividade; "#/checklist/nova" abre o formulário de criar.
// Todos criam e atribuem a qualquer pessoa; cada um vê as atividades em que é responsável e as que criou (a administração vê tudo).
// Tipo (operacional, de gestão, estratégica) e como entra na agenda de cada responsável (agenda-regras.js, tipo "atividade"):
// só o prazo (não ocupa), bloqueio do horário ou convite com sala do Meet (o servidor cria o convite na Google Agenda conectada).
// Quem passa a ser responsável recebe um e-mail (/api/atividade); de manhã, quem tem entrega no dia ou no dia seguinte recebe
// um lembrete (atividades-lembrete).
import { sb, esc, avatar, avisar, explicarErro, dataBR } from '../base.js';
import { hoje, somarDias, diaCurto, horaDoTexto, CATEGORIAS_ATIVIDADE, NA_AGENDA } from '../agenda-regras.js';
import { janela, api, primeiroNome, faltaScript, limparCache } from './agenda-dados.js';

const est = { quem: 'minhas', situacao: 'abertas', grupo: '', tipo: '' };
const FALTA = '<div class="aviso erro">Para usar o checklist, falta rodar o script <b>25-viagens-relatorio-checklist.sql</b> no Supabase.</div>';
const FALTA_27 = 'Para guardar o tipo, o jeito de entrar na agenda e os convidados, falta rodar os scripts 27-checklist-agenda-e-tipo.sql e 28-checklist-convidados.sql no Supabase.';
const hora5 = (h) => (h ? String(h).slice(0, 5) : '');
const ocupaHorario = (a) => a.na_agenda === 'bloqueio' || a.na_agenda === 'convite';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function lerAtividades() {
  const r = await sb.from('atividades').select('*').order('criado_em', { ascending: false });
  if (r.error) return { falta: faltaScript(r.error), erro: r.error, lista: [] };
  return { lista: r.data || [] };
}
// equipe (nomes vêm do servidor: o mentor não enxerga todos os perfis)
async function lerEquipe(ctx) {
  const eq = await api('/api/reuniao', { acao: 'equipe' });
  return (eq.ok && eq.equipe) || [{ id: ctx.perfil.id, nome: ctx.perfil.nome, foto_url: ctx.perfil.foto_url, temEmail: true }];
}
// o que pode ser ligado à atividade: turmas (o mentor vê as dele) e, para a administração, empresas
async function lerVinculos(ctx) {
  const [t, e] = await Promise.all([
    sb.from('turmas').select('id, nome, empresa_id, empresa:empresas(nome)').order('nome'),
    ctx.ehAdmin ? sb.from('empresas').select('id, nome').order('nome') : Promise.resolve({ data: [] }),
  ]);
  return [
    ...((t.data || []).map((x) => ({ valor: `t:${x.id}`, nome: `${x.empresa ? `${x.empresa.nome} · ` : ''}${x.nome}`, turma_id: x.id, empresa_id: x.empresa_id }))),
    ...((e.data || []).map((x) => ({ valor: `e:${x.id}`, nome: `${x.nome} (empresa)`, turma_id: null, empresa_id: x.id }))),
  ];
}

const atrasada = (a) => a.situacao !== 'feita' && a.prazo && a.prazo < hoje();
function textoPrazo(a) {
  if (!a.prazo) return 'Sem data';
  const h = hoje();
  const dia = a.prazo === h ? 'Hoje' : a.prazo === somarDias(h, 1) ? 'Amanhã' : diaCurto(a.prazo);
  return `${dia}${a.prazo_hora ? ` · ${hora5(a.prazo_hora)}${ocupaHorario(a) && a.hora_fim ? ` às ${hora5(a.hora_fim)}` : ''}` : ''}`;
}
const pode = (ctx, a) => ({
  mudar: ctx.ehAdmin || a.criado_por === ctx.perfil.id || (a.responsaveis || []).includes(ctx.perfil.id),
  apagar: ctx.ehAdmin || a.criado_por === ctx.perfil.id,
});

// ---------- a tela ----------
export async function render(ctx, el, params) {
  const { lista, falta, erro } = await lerAtividades();
  el.innerHTML = `
    <div class="cab"><div><h1>Checklist</h1><p class="sub">Suas atividades. Na agenda só entram as que bloqueiam o horário ou são reunião com link.${ctx.ehAdmin ? ' As atividades de toda a equipe, por pessoa, ficam no <a href="#/painel">Painel</a>.' : ''}</p></div>
      <div class="acoes"><button class="btn pri" type="button" id="nova">+ Nova atividade</button></div></div>
    ${falta ? FALTA : erro ? `<div class="aviso erro">${esc(explicarErro(erro))}</div>` : ''}
    <div class="linha ck-filtros" style="margin-bottom:14px"></div>
    <div id="lista"></div>`;
  if (falta || erro) { el.querySelector('#nova').disabled = true; return; }
  const equipe = await lerEquipe(ctx);
  const recarregar = async (abrirId = null) => {
    const n = await lerAtividades();
    lista.splice(0, lista.length, ...n.lista);
    desenhar();
    if (abrirId) { const a = lista.find((x) => x.id === abrirId); if (a) abrir(a); }
  };
  const abrir = (a) => abrirAtividade(ctx, a, { equipe, grupos: gruposDe(lista), aoMudar: recarregar });
  const gruposDe = (l) => [...new Set(l.map((a) => a.grupo).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR'));

  const filtros = el.querySelector('.ck-filtros');
  const desenharFiltros = () => {
    const grupos = gruposDe(lista);
    if (est.grupo && !grupos.includes(est.grupo)) est.grupo = '';
    filtros.innerHTML = `
      <div class="ag-vistas" role="group" aria-label="Situação"><button type="button" data-sit="abertas" class="${est.situacao === 'abertas' ? 'atual' : ''}">A fazer</button><button type="button" data-sit="feitas" class="${est.situacao === 'feitas' ? 'atual' : ''}">Feitas</button></div>
      <select id="f-quem" aria-label="De quem" style="width:auto">
        <option value="minhas"${est.quem === 'minhas' ? ' selected' : ''}>Minhas</option>
        <option value="convidado"${est.quem === 'convidado' ? ' selected' : ''}>Em que fui convidado(a)</option>
        <option value="criei"${est.quem === 'criei' ? ' selected' : ''}>Que eu criei para outras pessoas</option>
      </select>
      ${grupos.length ? `<select id="f-grupo" aria-label="Lista" style="width:auto"><option value="">Todas as listas</option>${grupos.map((g) => `<option${g === est.grupo ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
      <select id="f-tipo" aria-label="Tipo" style="width:auto"><option value="">Todos os tipos</option>${Object.entries(CATEGORIAS_ATIVIDADE).map(([k, n]) => `<option value="${k}"${k === est.tipo ? ' selected' : ''}>${n}</option>`).join('')}<option value="sem"${est.tipo === 'sem' ? ' selected' : ''}>Sem tipo</option></select>`;
    filtros.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => { est.situacao = b.dataset.sit; desenhar(); }));
    filtros.querySelector('#f-quem').addEventListener('input', (ev) => { est.quem = ev.target.value; desenhar(); });
    filtros.querySelector('#f-grupo')?.addEventListener('input', (ev) => { est.grupo = ev.target.value; desenhar(); });
    filtros.querySelector('#f-tipo').addEventListener('input', (ev) => { est.tipo = ev.target.value; desenhar(); });
  };

  const linha = (a) => {
    const nomes = (a.responsaveis_nomes || []).map(primeiroNome).join(', ') || 'Sem responsável';
    const passos = Array.isArray(a.passos) ? a.passos : [];
    const feitos = passos.filter((p) => p.feito).length;
    const agenda = a.na_agenda === 'convite' ? 'reunião com link' : a.na_agenda === 'bloqueio' ? 'bloqueado na agenda' : '';
    const info = [nomes, agenda, a.grupo, a.vinculo_nome, passos.length ? `${feitos} de ${passos.length} passos` : ''].filter(Boolean).join(' · ');
    const cls = a.situacao === 'feita' ? 'ok' : atrasada(a) ? 'erro' : a.prazo === hoje() ? 'alerta' : a.prazo ? '' : 'neutro';
    return `<div class="item ck-item${a.situacao === 'feita' ? ' feita' : ''}">
      <label class="ck-marca" title="${a.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}"><input type="checkbox" data-feita="${a.id}"${a.situacao === 'feita' ? ' checked' : ''}${pode(ctx, a).mudar ? '' : ' disabled'} aria-label="${a.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}: ${esc(a.titulo)}"></label>
      <button type="button" class="ck-abrir" data-abrir="${a.id}"><span class="nome">${esc(a.titulo)}${a.categoria ? ` <span class="selo neutro"><i class="ck-ponto ck-cor-${a.categoria}"></i>${CATEGORIAS_ATIVIDADE[a.categoria]}</span>` : ''}</span><span class="info">${esc(info)}</span></button>
      <span class="selo ${cls}">${a.situacao === 'feita' ? `Feita${a.feita_em ? ` em ${dataBR(a.feita_em)}` : ''}` : `${atrasada(a) ? 'Atrasada · ' : ''}${esc(textoPrazo(a))}`}</span></div>`;
  };

  function desenhar() {
    desenharFiltros();
    const eu = ctx.perfil.id, h = hoje();
    const base = lista.filter((a) => {
      if (est.situacao === 'abertas' ? a.situacao === 'feita' : a.situacao !== 'feita') return false;
      if (est.grupo && a.grupo !== est.grupo) return false;
      // aqui cada um vê só o que é seu (a visão de toda a equipe, por pessoa, fica no Painel)
      if (est.quem === 'convidado') return (a.participantes || []).includes(eu) && !(a.responsaveis || []).includes(eu);
      if (est.quem === 'criei') return a.criado_por === eu && !(a.responsaveis || []).every((r) => r === eu);
      return (a.responsaveis || []).includes(eu);
    });
    const visiveis = base.filter((a) => !est.tipo || (est.tipo === 'sem' ? !a.categoria : a.categoria === est.tipo));
    // quantas de cada tipo (para enxergar o equilíbrio entre operacional, gestão e estratégia)
    const porTipo = Object.entries(CATEGORIAS_ATIVIDADE).map(([k, n]) => [k, n, base.filter((a) => a.categoria === k).length]).filter(([, , q]) => q);
    const PLURAL = { operacional: 'operacionais', gestao: 'de gestão', estrategica: 'estratégicas' };
    const resumo = porTipo.length ? `<div class="ck-resumo">${porTipo.map(([k, n, q]) => `<span class="selo neutro"><i class="ck-ponto ck-cor-${k}"></i>${q} ${q > 1 ? PLURAL[k] : n.toLowerCase()}</span>`).join('')}</div>` : '';
    const alvo = el.querySelector('#lista');
    if (est.situacao === 'feitas') {
      const feitas = visiveis.sort((x, y) => String(y.feita_em || '').localeCompare(String(x.feita_em || ''))).slice(0, 200);
      alvo.innerHTML = `${resumo}${feitas.length ? `<div class="lista">${feitas.map(linha).join('')}</div>` : '<div class="vazio">Nenhuma atividade feita aqui ainda.</div>'}`;
      return;
    }
    const porPrazo = (x, y) => String(x.prazo || '9999').localeCompare(String(y.prazo || '9999')) || String(x.prazo_hora || '').localeCompare(String(y.prazo_hora || ''));
    const blocos = [
      ['Atrasadas', visiveis.filter((a) => a.prazo && a.prazo < h), 'erro'],
      ['Para hoje', visiveis.filter((a) => a.prazo === h), 'alerta'],
      ['Próximos 7 dias', visiveis.filter((a) => a.prazo > h && a.prazo <= somarDias(h, 7)), ''],
      ['Mais adiante', visiveis.filter((a) => a.prazo > somarDias(h, 7)), ''],
      ['Sem data de entrega', visiveis.filter((a) => !a.prazo), ''],
    ].filter(([, l]) => l.length);
    alvo.innerHTML = blocos.length ? resumo + blocos.map(([t, l, cls]) => `<h3 class="mt2" style="margin-bottom:8px">${t} <span class="selo ${cls || 'neutro'}">${l.length}</span></h3>
      <div class="lista">${l.sort(porPrazo).map(linha).join('')}</div>`).join('')
      : `<div class="vazio">${est.quem === 'minhas' ? 'Nenhuma atividade para você. 🎉' : 'Nenhuma atividade aqui.'} Clique em <b>+ Nova atividade</b> para criar.</div>`;
  }

  el.querySelector('#lista').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-abrir]'); if (!b) return;
    const a = lista.find((x) => x.id === b.dataset.abrir); if (a) abrir(a);
  });
  el.querySelector('#lista').addEventListener('change', async (ev) => {
    const c = ev.target.closest('[data-feita]'); if (!c) return;
    const a = lista.find((x) => x.id === c.dataset.feita); if (!a) return;
    c.disabled = true;
    const ok = await marcarFeita(ctx, a, c.checked);
    if (!ok) { c.checked = !c.checked; c.disabled = false; return; }
    desenhar();
  });
  el.querySelector('#nova').addEventListener('click', () => abrirAtividade(ctx, null, { equipe, grupos: gruposDe(lista), aoMudar: recarregar, grupoInicial: est.grupo }));

  desenhar();
  if (params[0] === 'nova') el.querySelector('#nova').click();
  else if (params[0]) {
    const a = lista.find((x) => x.id === params[0]);
    if (a) abrir(a); else avisar('Atividade não encontrada, ou você não tem acesso a ela.', true);
  }
}

async function marcarFeita(ctx, a, feita) {
  const mud = feita ? { situacao: 'feita', feita_em: new Date().toISOString(), feita_por: ctx.perfil.id } : { situacao: 'aberta', feita_em: null, feita_por: null };
  const { error } = await sb.from('atividades').update(mud).eq('id', a.id);
  if (error) { avisar(explicarErro(error), true); return false; }
  Object.assign(a, mud);
  limparCache();
  avisar(feita ? 'Feita! ✓' : 'Atividade reaberta.');
  return true;
}

// ---------- criar ou mudar uma atividade ----------
async function abrirAtividade(ctx, a, { equipe, grupos, aoMudar, grupoInicial = '' }) {
  const nova = !a;
  const at = a || { titulo: '', descricao: '', responsaveis: [ctx.perfil.id], prazo: null, prazo_hora: null, hora_fim: null, grupo: grupoInicial || '', passos: [], situacao: 'aberta',
    categoria: null, na_agenda: 'prazo', convidados: [] };
  const modo0 = at.na_agenda || 'prazo';
  const p = nova ? { mudar: true, apagar: false } : pode(ctx, at);
  const dis = p.mudar ? '' : ' disabled';
  const passos = (Array.isArray(at.passos) ? at.passos : []).map((x) => ({ texto: x.texto, feito: !!x.feito }));
  const marcados = new Set(at.responsaveis || []);
  const partIni = new Set(at.participantes || []);
  const externosAntes = new Set((Array.isArray(at.externos) ? at.externos : []).map((x) => `${x.email || ''}|${x.whatsapp || ''}`));
  // participantes de fora: [{ nome, email, whatsapp }] (os e-mails antigos do script 27 entram aqui também)
  const externos = (Array.isArray(at.externos) && at.externos.length ? at.externos : (at.convidados || []).map((email) => ({ email })))
    .map((x) => ({ nome: x.nome || '', email: x.email || '', whatsapp: x.whatsapp || '' }));
  // quem já saiu da equipe continua aparecendo na atividade
  const nomesGuardados = new Map([...(at.responsaveis || []).map((id, i) => [id, (at.responsaveis_nomes || [])[i]]), ...(at.participantes || []).map((id, i) => [id, (at.participantes_nomes || [])[i]])]);
  const pessoas = [...equipe, ...[...nomesGuardados.keys()].filter((id) => !equipe.some((x) => x.id === id))
    .map((id, i) => ({ id, nome: nomesGuardados.get(id) || `Pessoa ${i + 1}`, temEmail: false }))];
  const html = `<form id="f-ativ" class="grade" style="gap:14px" novalidate>
    ${!nova && at.situacao === 'feita' ? `<div class="aviso ok">Feita${at.feita_em ? ` em ${dataBR(at.feita_em)}` : ''}.</div>` : ''}
    <div class="campo"><label for="a-titulo">O que é *</label><input type="text" id="a-titulo" maxlength="200" placeholder="Ex.: Mandar a lista de presença da turma A para o RH" value="${esc(at.titulo)}"${dis}></div>
    <div class="campo"><span class="rotulo">Tipo da atividade</span><div class="ck-opcoes" role="radiogroup" aria-label="Tipo da atividade">
      ${Object.entries(CATEGORIAS_ATIVIDADE).map(([k, n]) => `<label><input type="radio" name="a-tipo" value="${k}"${at.categoria === k ? ' checked' : ''}${dis}><span>${n}</span></label>`).join('')}</div></div>
    <div class="campo"><label for="a-desc">Detalhes</label><textarea id="a-desc" maxlength="4000" placeholder="O que precisa ser feito, links, combinados"${dis}>${esc(at.descricao || '')}</textarea></div>
    <div class="campo"><span class="rotulo">Quem é responsável</span><div class="ag-pessoas" id="a-resp">${pessoas.map((x) => `<label class="check"><input type="checkbox" value="${x.id}"${marcados.has(x.id) ? ' checked' : ''}${dis}>${avatar(x)}<span>${esc(x.nome)}${x.id === ctx.perfil.id ? ' <span class="peq apagado">(você)</span>' : ''}</span></label>`).join('')}</div></div>
    <div class="campo"><span class="rotulo">Na agenda</span><div class="ck-opcoes" role="radiogroup" aria-label="Como entra na agenda">
      ${Object.entries(NA_AGENDA).map(([k, x]) => `<label title="${esc(x.dica)}"><input type="radio" name="a-agenda" value="${k}"${modo0 === k ? ' checked' : ''}${dis}><span>${x.nome}</span></label>`).join('')}</div>
      <small id="a-agenda-dica">${esc(NA_AGENDA[modo0].dica)}</small></div>
    <div class="grade g4" style="gap:10px">
      <div class="campo"><label for="a-prazo" id="a-prazo-rot">Data</label><input type="date" id="a-prazo" value="${esc(at.prazo || '')}"${dis}></div>
      <div class="campo"><label for="a-hora" id="a-hora-rot">Horário (opcional)</label><input type="time" id="a-hora" step="300" value="${esc(hora5(at.prazo_hora))}"${dis}></div>
      <div class="campo" id="a-fim-caixa"><label for="a-fim">Fim *</label><input type="time" id="a-fim" step="300" value="${esc(hora5(at.hora_fim))}"${dis}></div>
      <div class="campo"><label for="a-grupo">Lista ou projeto</label><input type="text" id="a-grupo" list="a-grupos" maxlength="80" placeholder="Ex.: Turma Sicredi" value="${esc(at.grupo || '')}"${dis}>
        <datalist id="a-grupos">${grupos.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></div></div>
    <p class="peq apagado" id="a-data-dica" style="margin-top:-6px">A data pode ficar em branco e ser colocada depois. Com data, a entrega aparece na agenda de cada responsável.</p>
    <div class="campo ck-convidados" id="a-conv-caixa"><span class="rotulo">Convidados (opcional)</span>
      <p class="peq apagado">Os responsáveis já participam. Convide outras pessoas da equipe ou gente de fora (cliente, fornecedor).</p>
      <details class="mt"${partIni.size ? ' open' : ''}><summary class="peq"><b>Da equipe</b>${partIni.size ? ` · ${partIni.size} convidado(s)` : ''}</summary>
        <div class="ag-pessoas mt" id="a-part">${pessoas.map((x) => `<label class="check"><input type="checkbox" value="${x.id}"${partIni.has(x.id) ? ' checked' : ''}${dis}>${avatar(x)}<span>${esc(x.nome)}</span></label>`).join('')}</div></details>
      <p class="peq mt"><b>De fora</b> <span class="apagado">· nome e e-mail e/ou WhatsApp</span></p>
      <div id="a-externos" class="ck-externos"></div>
      <div class="linha mt" style="gap:6px">${p.mudar ? '<button class="btn peq" type="button" id="a-ext-mais">+ Participante de fora</button>' : ''}
        ${!nova && externos.some((x) => x.whatsapp || x.email) ? '<button class="btn peq" type="button" id="a-avisar-fora">Mandar o convite para quem é de fora</button>' : ''}</div>
      <small id="a-ext-dica" class="mt"></small></div>
    ${!nova && at.na_agenda === 'convite' ? (at.meet_link
      ? `<div class="aviso ok"><b>Convite enviado${at.convite_enviado_em ? ` em ${dataBR(at.convite_enviado_em)}` : ''}.</b> <a class="btn peq pri" href="${esc(at.meet_link)}" target="_blank" rel="noopener">Entrar na sala</a> <button class="btn peq" type="button" id="a-copiar">Copiar link</button></div>`
      : '<div class="aviso">O convite ainda não saiu. Confira se a Google Agenda está conectada no Painel e clique em <b>Salvar</b> para tentar de novo.</div>') : ''}
    <div class="campo"><label for="a-vinc">Ligada a (opcional)</label><select id="a-vinc"${dis}><option value="">Nada</option></select></div>
    <div class="campo"><span class="rotulo">Passos</span><div id="a-passos" class="ck-passos"></div>
      ${p.mudar ? '<input type="text" id="a-passo" placeholder="Escreva um passo e aperte Enter" maxlength="200">' : ''}</div>
    ${!nova ? `<p class="peq apagado">Criada por ${esc(at.criado_por_nome || 'alguém da equipe')} em ${dataBR(at.criado_em)}.</p>` : ''}
    <div class="linha">${p.mudar ? `<button class="btn pri" type="submit" id="a-salvar">${nova ? 'Criar atividade' : 'Salvar'}</button>` : ''}
      ${!nova && p.mudar ? `<button class="btn" type="button" id="a-feita">${at.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}</button>` : ''}
      <button class="btn" type="button" data-fechar>${p.mudar ? 'Desistir' : 'Fechar'}</button>
      ${!nova && p.apagar ? '<button class="btn perigo" type="button" id="a-apagar" style="margin-left:auto">Apagar</button>' : ''}</div>
  </form>`;
  const j = janela(nova ? 'Nova atividade' : at.titulo, html, { largura: 720, aoFechar: () => { if (/^#\/checklist\/./.test(location.hash)) history.replaceState(null, '', '#/checklist'); } });
  const f = j.corpo.querySelector('#f-ativ');

  // "Na agenda": só prazo (data e horário opcionais) ou bloqueio/convite (data, início e fim; convite aceita convidados de fora)
  const modo = () => (f.querySelector('input[name="a-agenda"]:checked') || {}).value || 'prazo';
  const ajustarModo = () => {
    const m = modo(), ocupa = m !== 'prazo';
    f.querySelector('#a-agenda-dica').textContent = NA_AGENDA[m].dica;
    f.querySelector('#a-prazo-rot').textContent = ocupa ? 'Data *' : 'Data da entrega';
    f.querySelector('#a-hora-rot').textContent = ocupa ? 'Início *' : 'Horário (opcional)';
    f.querySelector('#a-fim-caixa').hidden = !ocupa;
    f.querySelector('#a-conv-caixa').hidden = !ocupa;
    f.querySelector('#a-data-dica').textContent = ocupa
      ? (m === 'convite' ? 'O convite sai pela Google Agenda da coordenação, com link do Meet, para responsáveis e convidados com e-mail. Mudou a data? O mesmo convite muda junto.'
        : 'O horário fica ocupado na agenda da plataforma dos responsáveis e dos convidados da equipe. Sem convite do Google e sem link.')
      : 'Não aparece na agenda: fica só no seu checklist. A data é opcional e pode ser colocada depois.';
    f.querySelector('#a-ext-dica').textContent = m === 'convite'
      ? 'Quem tem e-mail recebe o convite do Google com o link. Para quem tem WhatsApp, depois de salvar a plataforma abre a mensagem pronta para você enviar.'
      : 'Depois de salvar, a plataforma abre as mensagens prontas (WhatsApp ou e-mail) para você avisar cada pessoa de fora.';
  };
  // participantes de fora, em linhas (nome, e-mail, WhatsApp)
  const caixaExt = f.querySelector('#a-externos');
  const desenharExternos = () => {
    caixaExt.innerHTML = externos.length ? externos.map((x, i) => `<div class="ck-externo">
      <input type="text" data-ext="nome" data-i="${i}" placeholder="Nome" aria-label="Nome" value="${esc(x.nome)}"${dis}>
      <input type="email" data-ext="email" data-i="${i}" placeholder="E-mail" aria-label="E-mail" value="${esc(x.email)}"${dis}>
      <input type="tel" data-ext="whatsapp" data-i="${i}" placeholder="WhatsApp com DDD" aria-label="WhatsApp" value="${esc(x.whatsapp)}"${dis}>
      ${p.mudar ? `<button type="button" class="btn peq" data-ext-tirar="${i}" aria-label="Tirar ${esc(x.nome || 'participante')}">×</button>` : ''}</div>`).join('')
      : '<p class="peq apagado">Ninguém de fora.</p>';
  };
  caixaExt.addEventListener('input', (ev) => { const c = ev.target.closest('[data-ext]'); if (c) externos[Number(c.dataset.i)][c.dataset.ext] = c.value; });
  caixaExt.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ext-tirar]'); if (b) { externos.splice(Number(b.dataset.extTirar), 1); desenharExternos(); } });
  f.querySelector('#a-ext-mais')?.addEventListener('click', () => {
    externos.push({ nome: '', email: '', whatsapp: '' }); desenharExternos();
    caixaExt.querySelector(`[data-ext="nome"][data-i="${externos.length - 1}"]`).focus();
  });
  desenharExternos();
  f.querySelectorAll('input[name="a-agenda"]').forEach((r) => r.addEventListener('change', ajustarModo));
  ajustarModo();
  // fim sugerido: 1 hora depois do início
  f.querySelector('#a-hora').addEventListener('change', () => {
    const a0 = horaDoTexto(f.querySelector('#a-hora').value), b0 = horaDoTexto(f.querySelector('#a-fim').value);
    if (a0 != null && (b0 == null || b0 <= a0)) { const t = Math.min(23.75, a0 + 1); f.querySelector('#a-fim').value = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`; }
  });
  f.querySelector('#a-copiar')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(at.meet_link); avisar('Link da sala copiado.'); } catch (_) { window.prompt('Copie o link:', at.meet_link); }
  });

  // passos: na atividade que já existe, marcar um passo grava na hora
  const caixaPassos = f.querySelector('#a-passos');
  const desenharPassos = () => {
    caixaPassos.innerHTML = passos.length ? passos.map((x, i) => `<div class="ck-passo"><label class="check"><input type="checkbox" data-passo="${i}"${x.feito ? ' checked' : ''}${dis}><span>${esc(x.texto)}</span></label>
      ${p.mudar ? `<button type="button" class="btn peq" data-tirar-passo="${i}" aria-label="Tirar o passo ${esc(x.texto)}">×</button>` : ''}</div>`).join('') : '<p class="peq apagado">Nenhum passo. Use para dividir a atividade em partes.</p>';
  };
  const gravarPassos = async () => {
    if (nova) return;
    const { error } = await sb.from('atividades').update({ passos }).eq('id', at.id);
    if (error) avisar(explicarErro(error), true); else { at.passos = passos.map((x) => ({ ...x })); aoMudar(); }
  };
  desenharPassos();
  caixaPassos.addEventListener('change', (ev) => { const c = ev.target.closest('[data-passo]'); if (!c) return; passos[Number(c.dataset.passo)].feito = c.checked; gravarPassos(); });
  caixaPassos.addEventListener('click', (ev) => { const b = ev.target.closest('[data-tirar-passo]'); if (!b) return; passos.splice(Number(b.dataset.tirarPasso), 1); desenharPassos(); gravarPassos(); });
  f.querySelector('#a-passo')?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const t = ev.target.value.trim(); if (!t) return;
    passos.push({ texto: t, feito: false }); ev.target.value = ''; desenharPassos(); gravarPassos();
  });

  // vínculos (turmas e, para a administração, empresas)
  const vinculos = await lerVinculos(ctx);
  if (!f.isConnected) return;
  const atual = at.turma_id ? `t:${at.turma_id}` : at.empresa_id ? `e:${at.empresa_id}` : '';
  const sel = f.querySelector('#a-vinc');
  sel.innerHTML += vinculos.map((v) => `<option value="${v.valor}"${v.valor === atual ? ' selected' : ''}>${esc(v.nome)}</option>`).join('');
  if (atual && !vinculos.some((v) => v.valor === atual)) sel.innerHTML += `<option value="${atual}" selected>${esc(at.vinculo_nome || 'Turma')}</option>`;

  f.querySelector('#a-feita')?.addEventListener('click', async () => {
    if (await marcarFeita(ctx, at, at.situacao !== 'feita')) { j.fechar(); aoMudar(); }
  });
  f.querySelector('#a-apagar')?.addEventListener('click', async () => {
    if (!window.confirm(`Apagar a atividade "${at.titulo}"?${at.google_evento_id ? ' O convite da Google Agenda é cancelado e os convidados são avisados.' : ''}`)) return;
    const r = await api('/api/atividade', { acao: 'apagar', id: at.id });
    if (!r.ok) { avisar(r.mensagem || 'Não consegui apagar agora.', true); return; }
    avisar(r.google === 'cancelada' ? 'Atividade apagada e convite cancelado.' : 'Atividade apagada.'); limparCache(); j.fechar(); aoMudar();
  });

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const titulo = f.querySelector('#a-titulo').value.trim();
    const responsaveis = [...f.querySelectorAll('#a-resp input:checked')].map((c) => c.value);
    if (!titulo) { avisar('Escreva o que é a atividade.', true); f.querySelector('#a-titulo').focus(); return; }
    if (!responsaveis.length) { avisar('Marque pelo menos uma pessoa responsável.', true); return; }
    const pendente = f.querySelector('#a-passo') && f.querySelector('#a-passo').value.trim();
    if (pendente) { passos.push({ texto: pendente, feito: false }); f.querySelector('#a-passo').value = ''; }
    const v = vinculos.find((x) => x.valor === sel.value);
    const prazo = f.querySelector('#a-prazo').value || null;
    const naAgenda = modo(), ocupa = naAgenda !== 'prazo';
    const inicio = f.querySelector('#a-hora').value || null, fimH = f.querySelector('#a-fim').value || null;
    if (ocupa && (!prazo || !inicio || !fimH)) { avisar(`Para ${naAgenda === 'convite' ? 'mandar o convite' : 'bloquear o horário'}, preencha a data, o início e o fim.`, true); return; }
    if (ocupa && horaDoTexto(fimH) <= horaDoTexto(inicio)) { avisar('O fim precisa ser depois do início.', true); return; }
    // convidados (só para bloqueio e reunião): da equipe e de fora, com e-mail e/ou WhatsApp
    const participantes = ocupa ? [...f.querySelectorAll('#a-part input:checked')].map((c) => c.value).filter((id) => !responsaveis.includes(id)) : [];
    const fora = [];
    for (const x of ocupa ? externos : []) {
      const nome = String(x.nome || '').trim(), email = String(x.email || '').trim().toLowerCase(), whatsapp = String(x.whatsapp || '').replace(/\D/g, '');
      if (!nome && !email && !whatsapp) continue;
      if (email && !EMAIL.test(email)) { avisar(`"${email}" não parece um e-mail.`, true); return; }
      if (whatsapp && whatsapp.length < 10) { avisar(`O WhatsApp de ${nome || 'um participante'} precisa do DDD (ex.: 54 99999-0000).`, true); return; }
      if (!email && !whatsapp) { avisar(`Coloque o e-mail ou o WhatsApp de ${nome}.`, true); return; }
      fora.push({ nome: nome || null, email: email || null, whatsapp: whatsapp || null });
    }
    const categoria = (f.querySelector('input[name="a-tipo"]:checked') || {}).value || null;
    const dados = {
      titulo, descricao: f.querySelector('#a-desc').value.trim() || null, grupo: f.querySelector('#a-grupo').value.trim() || null,
      responsaveis, responsaveis_nomes: responsaveis.map((id) => (pessoas.find((x) => x.id === id) || {}).nome || ''),
      prazo, prazo_hora: prazo ? inicio : null, passos,
      turma_id: v ? v.turma_id : (sel.value === atual ? at.turma_id || null : null),
      empresa_id: v ? v.empresa_id : (sel.value === atual ? at.empresa_id || null : null),
      vinculo_nome: v ? v.nome.replace(/ \(empresa\)$/, '') : (sel.value && sel.value === atual ? at.vinculo_nome : null),
      categoria, na_agenda: naAgenda, hora_fim: ocupa ? fimH : null, convidados: [],
      participantes, participantes_nomes: participantes.map((id) => (pessoas.find((x) => x.id === id) || {}).nome || ''), externos: fora.slice(0, 30),
    };
    const btn = f.querySelector('#a-salvar');
    btn.disabled = true; btn.textContent = naAgenda === 'convite' ? 'Salvando e mandando o convite…' : 'Salvando…';
    const r = nova
      ? await sb.from('atividades').insert({ ...dados, criado_por: ctx.perfil.id, criado_por_nome: ctx.perfil.nome }).select('id').single()
      : await sb.from('atividades').update(dados).eq('id', at.id).select('id').single();
    if (r.error) { avisar(faltaScript(r.error) ? FALTA_27 : explicarErro(r.error), true); btn.disabled = false; btn.textContent = nova ? 'Criar atividade' : 'Salvar'; return; }
    limparCache();
    // convite da Google Agenda (se for "convite com sala") e e-mail para quem passou a ser responsável
    const res = await api('/api/atividade', { acao: 'salvo', id: r.data.id });
    const enviados = (res.ok && res.enviados) || [];
    const sobreConvite = {
      criada: ' Convite com sala do Meet enviado pela Google Agenda.', atualizada: ' Convite atualizado: os convidados foram avisados pelo Google.',
      cancelada: ' O convite da Google Agenda foi cancelado.', desconectada: ' Atenção: o convite não saiu, porque a Google Agenda não está conectada no Painel. O horário ficou bloqueado na plataforma.',
      erro: ` Atenção: o convite não saiu (${res.mensagem || 'a Google Agenda não respondeu'}). O horário ficou bloqueado na plataforma; clique em Salvar de novo para tentar.`,
    }[res.google] || '';
    avisar(`${nova ? 'Atividade criada' : 'Atividade salva'}.${sobreConvite}${enviados.length ? ` ${enviados.map(primeiroNome).join(', ')} ${enviados.length > 1 ? 'receberam' : 'recebeu'} um e-mail.` : ''}`,
      res.google === 'erro' || res.google === 'desconectada');
    j.fechar();
    aoMudar();
    // participantes de fora: mensagem pronta pelo WhatsApp (e e-mail, quando não sai convite do Google)
    avisarExternos({ ...at, ...dados, id: r.data.id, meet_link: res.meet_link || at.meet_link || null }, { soNovos: nova ? null : externosAntes });
  });
  f.querySelector('#a-avisar-fora')?.addEventListener('click', () => avisarExternos(at));
  if (p.mudar && nova) f.querySelector('#a-titulo').focus();
}

// Texto do convite para quem é de fora (WhatsApp ou e-mail).
function textoConvite(a, nome) {
  const quando = a.prazo ? `${diaCurto(a.prazo)}${a.prazo_hora ? `, das ${hora5(a.prazo_hora)}${a.hora_fim ? ` às ${hora5(a.hora_fim)}` : ''}` : ''}` : '';
  return [`Olá${nome ? `, ${primeiroNome(nome)}` : ''}! Tudo bem?`,
    `Você está convidado(a) para "${a.titulo}", com a Mentorei${quando ? `: ${quando}` : ''}.`,
    a.meet_link ? `Link da reunião: ${a.meet_link}` : '',
    a.descricao || ''].filter(Boolean).join('\n\n');
}

// Janela com cada participante de fora e o botão de mandar o convite. Na reunião com link, quem tem e-mail já recebeu o convite do
// Google; aqui ficam o WhatsApp (sempre) e o e-mail (quando é só bloqueio). soNovos: só quem ainda não estava na atividade.
function avisarExternos(a, { soNovos = null } = {}) {
  if (!(a.na_agenda === 'bloqueio' || a.na_agenda === 'convite')) return;
  const reuniao = a.na_agenda === 'convite';
  const chave = (x) => `${x.email || ''}|${x.whatsapp || ''}`;
  const lista = (Array.isArray(a.externos) ? a.externos : []).filter((x) => (x.whatsapp || (x.email && !reuniao)) && (!soNovos || !soNovos.has(chave(x))));
  if (!lista.length) return;
  const assunto = `Convite: ${a.titulo} · Mentorei`;
  const j = janela('Avisar quem é de fora', `<p class="peq">${reuniao ? 'Quem tem e-mail já recebeu o convite do Google com o link. Mande a mensagem pronta para quem tem WhatsApp:' : 'Mande o convite para cada pessoa de fora:'}</p>
    <div class="lista mt">${lista.map((x, i) => `<div class="item" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><div class="nome">${esc(x.nome || x.email || x.whatsapp)}</div>
      <div class="info">${esc([x.email, x.whatsapp].filter(Boolean).join(' · '))}${reuniao && x.email ? ' · convite do Google enviado' : ''}</div></div>
      <div class="linha" style="gap:6px">${x.whatsapp ? `<button class="btn peq pri" type="button" data-whats="${i}">WhatsApp</button>` : ''}
        ${x.email && !reuniao ? `<a class="btn peq" href="mailto:${encodeURIComponent(x.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(textoConvite(a, x.nome))}">E-mail</a>` : ''}</div></div>`).join('')}</div>
    <div class="linha mt2"><button class="btn" type="button" data-fechar>Pronto</button></div>`, { largura: 600 });
  j.corpo.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-whats]'); if (!b) return;
    const x = lista[Number(b.dataset.whats)];
    const { janelaWhatsApp } = await import('./equipe.js');
    janelaWhatsApp({ titulo: `Convite · ${x.nome || 'participante de fora'}`, whatsapp: x.whatsapp, texto: textoConvite(a, x.nome),
      nota: 'Confira a mensagem e clique em "Abrir no WhatsApp" para enviar do seu WhatsApp.' });
  });
}

// ---------- Painel da administração: o checklist de toda a equipe, por pessoa ----------
// A única visão de todas as atividades por pessoa. Conta como da pessoa o que ela é responsável. O equilíbrio entre os tipos
// considera as atividades a fazer e as feitas no período escolhido.
const ORDEM_TIPOS = ['operacional', 'gestao', 'estrategica', 'sem'];
const NOME_TIPO = { ...CATEGORIAS_ATIVIDADE, sem: 'Sem tipo' };
const estPainel = { dias: 30, aberto: null };

function barraTipos(contagem) {
  const total = ORDEM_TIPOS.reduce((s, k) => s + (contagem[k] || 0), 0);
  if (!total) return '<span class="peq apagado">Nenhuma atividade no período.</span>';
  const pct = (k) => Math.round(((contagem[k] || 0) / total) * 100);
  const partes = ORDEM_TIPOS.filter((k) => contagem[k]);
  return `<div class="ck-barra" role="img" aria-label="${esc(partes.map((k) => `${NOME_TIPO[k]}: ${pct(k)}%`).join(', '))}">
      ${partes.map((k) => `<span class="ck-cor-${k}" style="flex:${contagem[k]}" title="${esc(`${NOME_TIPO[k]}: ${contagem[k]} (${pct(k)}%)`)}"></span>`).join('')}</div>
    <div class="ck-barra-rotulos">${partes.map((k) => `<span><i class="ck-ponto ck-cor-${k}"></i>${NOME_TIPO[k]} <b>${pct(k)}%</b></span>`).join('')}</div>`;
}

export async function cartaoChecklistEquipe(ctx, el) {
  if (!ctx.ehAdmin) { el.innerHTML = ''; return; }
  const [{ lista, falta }, equipe] = await Promise.all([lerAtividades(), lerEquipe(ctx)]);
  if (falta) { el.innerHTML = '<p class="peq apagado">O checklist aparece aqui depois que o script 25 for rodado no Supabase.</p>'; return; }
  const desenhar = () => {
    const h = hoje();
    const desde = estPainel.dias ? somarDias(h, -estPainel.dias) : '0000-00-00';
    const noPeriodo = (a) => a.situacao !== 'feita' || (a.feita_em && a.feita_em.slice(0, 10) >= desde);
    const contar = (l) => Object.fromEntries(ORDEM_TIPOS.map((k) => [k, l.filter((a) => (a.categoria || 'sem') === k).length]));
    const daPessoa = (id) => lista.filter((a) => (a.responsaveis || []).includes(id));
    const resumoDe = (l) => ({
      abertas: l.filter((a) => a.situacao !== 'feita'), atrasadas: l.filter(atrasada),
      feitas: l.filter((a) => a.situacao === 'feita' && a.feita_em && a.feita_em.slice(0, 10) >= desde), tipos: contar(l.filter(noPeriodo)),
    });
    const time = resumoDe(lista);
    const pessoas = equipe.map((p) => ({ p, r: resumoDe(daPessoa(p.id)) })).filter(({ r }) => r.abertas.length || r.feitas.length || ORDEM_TIPOS.some((k) => r.tipos[k]))
      .sort((x, y) => y.r.atrasadas.length - x.r.atrasadas.length || y.r.abertas.length - x.r.abertas.length);
    const itemAtividade = (a) => `<a class="ck-painel-item" href="#/checklist/${a.id}"><span>${a.categoria ? `<i class="ck-ponto ck-cor-${a.categoria}"></i>` : '<i class="ck-ponto ck-cor-sem"></i>'}${esc(a.titulo)}</span>
      <span class="selo ${a.situacao === 'feita' ? 'ok' : atrasada(a) ? 'erro' : a.prazo === h ? 'alerta' : 'neutro'}">${a.situacao === 'feita' ? `Feita em ${dataBR(a.feita_em)}` : `${atrasada(a) ? 'Atrasada · ' : ''}${esc(textoPrazo(a))}`}</span></a>`;
    el.innerHTML = `<div class="cartao">
      <div class="linha"><h3 style="flex:1">Atividades de toda a equipe</h3>
        <select id="ck-dias" aria-label="Período das atividades feitas" style="width:auto">${[[30, 'Últimos 30 dias'], [90, 'Últimos 90 dias'], [0, 'Desde o começo']].map(([d, n]) => `<option value="${d}"${estPainel.dias === d ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="grade g3 mt">
        <div class="cartao numero"><b>${time.abertas.length}</b><span>a fazer</span></div>
        <div class="cartao numero"><b>${time.atrasadas.length}</b><span>atrasadas</span></div>
        <div class="cartao numero"><b>${time.feitas.length}</b><span>feitas no período</span></div></div>
      <h4 class="mt2">Equilíbrio da equipe <span class="peq apagado">(a fazer e feitas no período)</span></h4>
      <div class="mt">${barraTipos(time.tipos)}</div>
      <h4 class="mt2">Por pessoa</h4>
      ${pessoas.length ? `<div class="tabela mt"><table class="ck-painel"><tr><th>Pessoa</th><th>A fazer</th><th>Atrasadas</th><th>Feitas</th><th style="min-width:260px">Tipo das atividades</th><th></th></tr>
        ${pessoas.map(({ p, r }) => `<tr><td><span class="linha" style="gap:8px;flex-wrap:nowrap">${avatar(p)}<b>${esc(p.nome)}</b></span></td>
          <td>${r.abertas.length}</td><td>${r.atrasadas.length ? `<span class="selo erro">${r.atrasadas.length}</span>` : '0'}</td><td>${r.feitas.length}</td>
          <td>${barraTipos(r.tipos)}</td>
          <td><button class="btn peq" type="button" data-ver="${p.id}" aria-expanded="${estPainel.aberto === p.id}">${estPainel.aberto === p.id ? 'Fechar' : 'Ver'}</button></td></tr>
          ${estPainel.aberto === p.id ? `<tr class="ck-painel-detalhe"><td colspan="6">
            ${r.abertas.length ? `<p class="peq"><b>A fazer</b></p><div class="ck-painel-lista">${r.abertas.slice().sort((x, y) => String(x.prazo || '9999').localeCompare(String(y.prazo || '9999'))).map(itemAtividade).join('')}</div>` : '<p class="peq apagado">Nada a fazer.</p>'}
            ${r.feitas.length ? `<p class="peq mt"><b>Feitas no período</b></p><div class="ck-painel-lista">${r.feitas.map(itemAtividade).join('')}</div>` : ''}</td></tr>` : ''}`).join('')}</table></div>`
        : '<p class="apagado mt">Nenhuma atividade no checklist ainda.</p>'}
      <p class="peq apagado mt">Cada pessoa vê só as próprias atividades na aba Checklist. Aqui fica a visão de todos. Clique numa atividade para abrir.</p></div>`;
    el.querySelector('#ck-dias').addEventListener('input', (ev) => { estPainel.dias = Number(ev.target.value); desenhar(); });
    el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => { estPainel.aberto = estPainel.aberto === b.dataset.ver ? null : b.dataset.ver; desenhar(); }));
  };
  desenhar();
}

