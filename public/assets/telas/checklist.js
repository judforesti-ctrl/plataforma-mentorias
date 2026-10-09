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
const FALTA_27 = 'Para guardar o tipo e o jeito de entrar na agenda, falta rodar o script 27-checklist-agenda-e-tipo.sql no Supabase.';
const hora5 = (h) => (h ? String(h).slice(0, 5) : '');
const SELO_TIPO = { operacional: 'neutro', gestao: '', estrategica: 'escuro' };
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
    <div class="cab"><div><h1>Checklist</h1><p class="sub">Atividades da equipe, com responsável e data de entrega. A entrega aparece na agenda de quem é responsável.</p></div>
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
        <option value="criei"${est.quem === 'criei' ? ' selected' : ''}>Que eu criei para outras pessoas</option>
        ${ctx.ehAdmin ? `<option value="todas"${est.quem === 'todas' ? ' selected' : ''}>De toda a equipe</option>
          ${equipe.filter((p) => p.id !== ctx.perfil.id).map((p) => `<option value="${p.id}"${est.quem === p.id ? ' selected' : ''}>De ${esc(p.nome)}</option>`).join('')}` : ''}
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
    const agenda = a.na_agenda === 'convite' ? 'convite com sala' : a.na_agenda === 'bloqueio' ? 'horário bloqueado' : '';
    const info = [nomes, agenda, a.grupo, a.vinculo_nome, passos.length ? `${feitos} de ${passos.length} passos` : ''].filter(Boolean).join(' · ');
    const cls = a.situacao === 'feita' ? 'ok' : atrasada(a) ? 'erro' : a.prazo === hoje() ? 'alerta' : a.prazo ? '' : 'neutro';
    return `<div class="item ck-item${a.situacao === 'feita' ? ' feita' : ''}">
      <label class="ck-marca" title="${a.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}"><input type="checkbox" data-feita="${a.id}"${a.situacao === 'feita' ? ' checked' : ''}${pode(ctx, a).mudar ? '' : ' disabled'} aria-label="${a.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}: ${esc(a.titulo)}"></label>
      <button type="button" class="ck-abrir" data-abrir="${a.id}"><span class="nome">${esc(a.titulo)}${a.categoria ? ` <span class="selo ${SELO_TIPO[a.categoria]}">${CATEGORIAS_ATIVIDADE[a.categoria]}</span>` : ''}</span><span class="info">${esc(info)}</span></button>
      <span class="selo ${cls}">${a.situacao === 'feita' ? `Feita${a.feita_em ? ` em ${dataBR(a.feita_em)}` : ''}` : `${atrasada(a) ? 'Atrasada · ' : ''}${esc(textoPrazo(a))}`}</span></div>`;
  };

  function desenhar() {
    desenharFiltros();
    const eu = ctx.perfil.id, h = hoje();
    const base = lista.filter((a) => {
      if (est.situacao === 'abertas' ? a.situacao === 'feita' : a.situacao !== 'feita') return false;
      if (est.grupo && a.grupo !== est.grupo) return false;
      if (est.quem === 'minhas') return (a.responsaveis || []).includes(eu);
      if (est.quem === 'criei') return a.criado_por === eu && !(a.responsaveis || []).every((r) => r === eu);
      if (est.quem === 'todas') return true;
      return (a.responsaveis || []).includes(est.quem);
    });
    const visiveis = base.filter((a) => !est.tipo || (est.tipo === 'sem' ? !a.categoria : a.categoria === est.tipo));
    // quantas de cada tipo (para enxergar o equilíbrio entre operacional, gestão e estratégia)
    const porTipo = Object.entries(CATEGORIAS_ATIVIDADE).map(([k, n]) => [k, n, base.filter((a) => a.categoria === k).length]).filter(([, , q]) => q);
    const PLURAL = { operacional: 'operacionais', gestao: 'de gestão', estrategica: 'estratégicas' };
    const resumo = porTipo.length ? `<div class="ck-resumo">${porTipo.map(([k, n, q]) => `<span class="selo ${SELO_TIPO[k]}">${q} ${q > 1 ? PLURAL[k] : n.toLowerCase()}</span>`).join('')}</div>` : '';
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
  // quem já saiu da equipe continua aparecendo na atividade
  const pessoas = [...equipe, ...(at.responsaveis || []).filter((id) => !equipe.some((x) => x.id === id))
    .map((id, i) => ({ id, nome: (at.responsaveis_nomes || [])[at.responsaveis.indexOf(id)] || `Pessoa ${i + 1}`, temEmail: false }))];
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
    <div class="campo" id="a-conv-caixa"><label for="a-conv">Convidados de fora (opcional)</label>
      <input type="text" id="a-conv" placeholder="E-mails separados por vírgula" value="${esc((at.convidados || []).join(', '))}"${dis}>
      <small>Os responsáveis já recebem o convite. Aqui entram clientes ou fornecedores, sem cadastro na plataforma.</small></div>
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
    f.querySelector('#a-conv-caixa').hidden = m !== 'convite';
    f.querySelector('#a-data-dica').textContent = ocupa
      ? (m === 'convite' ? 'O convite sai pela Google Agenda da coordenação, com sala do Meet, para cada responsável (e convidados de fora). Mudou a data? O mesmo convite muda junto.'
        : 'O horário fica ocupado na agenda da plataforma de cada responsável, sem convite.')
      : 'A data pode ficar em branco e ser colocada depois. Com data, a entrega aparece na agenda de cada responsável.';
  };
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
    const convidados = naAgenda === 'convite' ? f.querySelector('#a-conv').value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
    const ruim = convidados.find((x) => !EMAIL.test(x));
    if (ruim) { avisar(`"${ruim}" não parece um e-mail.`, true); return; }
    const categoria = (f.querySelector('input[name="a-tipo"]:checked') || {}).value || null;
    const dados = {
      titulo, descricao: f.querySelector('#a-desc').value.trim() || null, grupo: f.querySelector('#a-grupo').value.trim() || null,
      responsaveis, responsaveis_nomes: responsaveis.map((id) => (pessoas.find((x) => x.id === id) || {}).nome || ''),
      prazo, prazo_hora: prazo ? inicio : null, passos,
      turma_id: v ? v.turma_id : (sel.value === atual ? at.turma_id || null : null),
      empresa_id: v ? v.empresa_id : (sel.value === atual ? at.empresa_id || null : null),
      vinculo_nome: v ? v.nome.replace(/ \(empresa\)$/, '') : (sel.value && sel.value === atual ? at.vinculo_nome : null),
      categoria, na_agenda: naAgenda, hora_fim: ocupa ? fimH : null, convidados: [...new Set(convidados)].slice(0, 30),
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
  });
  if (p.mudar && nova) f.querySelector('#a-titulo').focus();
}

// ---------- resumo (Painel da administração e Minha agenda) ----------
export async function cartaoChecklist(ctx, el) {
  const { lista, falta } = await lerAtividades();
  if (falta) { el.innerHTML = ''; return; }
  const h = hoje(), eu = ctx.perfil.id;
  const abertas = lista.filter((a) => a.situacao !== 'feita');
  const minhas = abertas.filter((a) => (a.responsaveis || []).includes(eu));
  const conta = (l) => ({ atrasadas: l.filter((a) => a.prazo && a.prazo < h).length, hoje: l.filter((a) => a.prazo === h).length });
  const m = conta(minhas), t = conta(abertas);
  const frase = (c) => [c.atrasadas ? `<b>${c.atrasadas}</b> atrasada${c.atrasadas > 1 ? 's' : ''}` : '', c.hoje ? `<b>${c.hoje}</b> para hoje` : ''].filter(Boolean).join(' e ');
  const linhas = [];
  if (m.atrasadas || m.hoje) linhas.push(`Suas atividades do checklist: ${frase(m)}.`);
  if (ctx.ehAdmin && (t.atrasadas > m.atrasadas || t.hoje > m.hoje)) linhas.push(`Na equipe toda: ${frase(t)}.`);
  el.innerHTML = linhas.length ? `<div class="aviso ag-aviso"><span>${linhas.join(' ')}</span><a class="btn peq" href="#/checklist">Ver checklist</a></div>` : '';
}

