// Checklist: atividades com responsáveis (equipe e administração) e data de entrega (opcional, muda depois).
// "#/checklist" lista; "#/checklist/<id>" abre a atividade; "#/checklist/nova" abre o formulário de criar.
// Todos criam e atribuem a qualquer pessoa; cada um vê as atividades em que é responsável e as que criou (a administração vê tudo).
// A entrega entra na agenda de cada responsável (agenda-regras.js, tipo "atividade"). Quem passa a ser responsável recebe
// um e-mail (/api/atividade); de manhã, quem tem entrega no dia ou no dia seguinte recebe um lembrete (atividades-lembrete).
import { sb, esc, avatar, avisar, explicarErro, dataBR } from '../base.js';
import { hoje, somarDias, diaCurto } from '../agenda-regras.js';
import { janela, api, primeiroNome, faltaScript, limparCache } from './agenda-dados.js';

const est = { quem: 'minhas', situacao: 'abertas', grupo: '' };
const FALTA = '<div class="aviso erro">Para usar o checklist, falta rodar o script <b>25-viagens-relatorio-checklist.sql</b> no Supabase.</div>';
const hora5 = (h) => (h ? String(h).slice(0, 5) : '');

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
  return `${dia}${a.prazo_hora ? ` · ${hora5(a.prazo_hora)}` : ''}`;
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
      ${grupos.length ? `<select id="f-grupo" aria-label="Lista" style="width:auto"><option value="">Todas as listas</option>${grupos.map((g) => `<option${g === est.grupo ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}`;
    filtros.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => { est.situacao = b.dataset.sit; desenhar(); }));
    filtros.querySelector('#f-quem').addEventListener('input', (ev) => { est.quem = ev.target.value; desenhar(); });
    filtros.querySelector('#f-grupo')?.addEventListener('input', (ev) => { est.grupo = ev.target.value; desenhar(); });
  };

  const linha = (a) => {
    const nomes = (a.responsaveis_nomes || []).map(primeiroNome).join(', ') || 'Sem responsável';
    const passos = Array.isArray(a.passos) ? a.passos : [];
    const feitos = passos.filter((p) => p.feito).length;
    const info = [nomes, a.grupo, a.vinculo_nome, passos.length ? `${feitos} de ${passos.length} passos` : ''].filter(Boolean).join(' · ');
    const cls = a.situacao === 'feita' ? 'ok' : atrasada(a) ? 'erro' : a.prazo === hoje() ? 'alerta' : a.prazo ? '' : 'neutro';
    return `<div class="item ck-item${a.situacao === 'feita' ? ' feita' : ''}">
      <label class="ck-marca" title="${a.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}"><input type="checkbox" data-feita="${a.id}"${a.situacao === 'feita' ? ' checked' : ''}${pode(ctx, a).mudar ? '' : ' disabled'} aria-label="${a.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}: ${esc(a.titulo)}"></label>
      <button type="button" class="ck-abrir" data-abrir="${a.id}"><span class="nome">${esc(a.titulo)}</span><span class="info">${esc(info)}</span></button>
      <span class="selo ${cls}">${a.situacao === 'feita' ? `Feita${a.feita_em ? ` em ${dataBR(a.feita_em)}` : ''}` : `${atrasada(a) ? 'Atrasada · ' : ''}${esc(textoPrazo(a))}`}</span></div>`;
  };

  function desenhar() {
    desenharFiltros();
    const eu = ctx.perfil.id, h = hoje();
    const visiveis = lista.filter((a) => {
      if (est.situacao === 'abertas' ? a.situacao === 'feita' : a.situacao !== 'feita') return false;
      if (est.grupo && a.grupo !== est.grupo) return false;
      if (est.quem === 'minhas') return (a.responsaveis || []).includes(eu);
      if (est.quem === 'criei') return a.criado_por === eu && !(a.responsaveis || []).every((r) => r === eu);
      if (est.quem === 'todas') return true;
      return (a.responsaveis || []).includes(est.quem);
    });
    const alvo = el.querySelector('#lista');
    if (est.situacao === 'feitas') {
      const feitas = visiveis.sort((x, y) => String(y.feita_em || '').localeCompare(String(x.feita_em || ''))).slice(0, 200);
      alvo.innerHTML = feitas.length ? `<div class="lista">${feitas.map(linha).join('')}</div>` : '<div class="vazio">Nenhuma atividade feita aqui ainda.</div>';
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
    alvo.innerHTML = blocos.length ? blocos.map(([t, l, cls]) => `<h3 class="mt2" style="margin-bottom:8px">${t} <span class="selo ${cls || 'neutro'}">${l.length}</span></h3>
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
  const at = a || { titulo: '', descricao: '', responsaveis: [ctx.perfil.id], prazo: null, prazo_hora: null, grupo: grupoInicial || '', passos: [], situacao: 'aberta' };
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
    <div class="campo"><label for="a-desc">Detalhes</label><textarea id="a-desc" maxlength="4000" placeholder="O que precisa ser feito, links, combinados"${dis}>${esc(at.descricao || '')}</textarea></div>
    <div class="campo"><span class="rotulo">Quem é responsável</span><div class="ag-pessoas" id="a-resp">${pessoas.map((x) => `<label class="check"><input type="checkbox" value="${x.id}"${marcados.has(x.id) ? ' checked' : ''}${dis}>${avatar(x)}<span>${esc(x.nome)}${x.id === ctx.perfil.id ? ' <span class="peq apagado">(você)</span>' : ''}</span></label>`).join('')}</div></div>
    <div class="grade g3" style="gap:10px">
      <div class="campo"><label for="a-prazo">Data da entrega</label><input type="date" id="a-prazo" value="${esc(at.prazo || '')}"${dis}></div>
      <div class="campo"><label for="a-hora">Horário (opcional)</label><input type="time" id="a-hora" step="300" value="${esc(hora5(at.prazo_hora))}"${dis}></div>
      <div class="campo"><label for="a-grupo">Lista ou projeto</label><input type="text" id="a-grupo" list="a-grupos" maxlength="80" placeholder="Ex.: Turma Sicredi" value="${esc(at.grupo || '')}"${dis}>
        <datalist id="a-grupos">${grupos.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></div></div>
    <p class="peq apagado" style="margin-top:-6px">A data pode ficar em branco e ser colocada depois. Com data, a entrega aparece na agenda de cada responsável.</p>
    <div class="campo"><label for="a-vinc">Ligada a (opcional)</label><select id="a-vinc"${dis}><option value="">Nada</option></select></div>
    <div class="campo"><span class="rotulo">Passos</span><div id="a-passos" class="ck-passos"></div>
      ${p.mudar ? '<input type="text" id="a-passo" placeholder="Escreva um passo e aperte Enter" maxlength="200">' : ''}</div>
    ${!nova ? `<p class="peq apagado">Criada por ${esc(at.criado_por_nome || 'alguém da equipe')} em ${dataBR(at.criado_em)}.</p>` : ''}
    <div class="linha">${p.mudar ? `<button class="btn pri" type="submit" id="a-salvar">${nova ? 'Criar atividade' : 'Salvar'}</button>` : ''}
      ${!nova && p.mudar ? `<button class="btn" type="button" id="a-feita">${at.situacao === 'feita' ? 'Reabrir' : 'Marcar como feita'}</button>` : ''}
      <button class="btn" type="button" data-fechar>${p.mudar ? 'Desistir' : 'Fechar'}</button>
      ${!nova && p.apagar ? '<button class="btn perigo" type="button" id="a-apagar" style="margin-left:auto">Apagar</button>' : ''}</div>
  </form>`;
  const j = janela(nova ? 'Nova atividade' : at.titulo, html, { largura: 680, aoFechar: () => { if (/^#\/checklist\/./.test(location.hash)) history.replaceState(null, '', '#/checklist'); } });
  const f = j.corpo.querySelector('#f-ativ');

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
    if (!window.confirm(`Apagar a atividade "${at.titulo}"?`)) return;
    const { error } = await sb.from('atividades').delete().eq('id', at.id);
    if (error) { avisar(explicarErro(error), true); return; }
    avisar('Atividade apagada.'); limparCache(); j.fechar(); aoMudar();
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
    const dados = {
      titulo, descricao: f.querySelector('#a-desc').value.trim() || null, grupo: f.querySelector('#a-grupo').value.trim() || null,
      responsaveis, responsaveis_nomes: responsaveis.map((id) => (pessoas.find((x) => x.id === id) || {}).nome || ''),
      prazo, prazo_hora: prazo ? (f.querySelector('#a-hora').value || null) : null, passos,
      turma_id: v ? v.turma_id : (sel.value === atual ? at.turma_id || null : null),
      empresa_id: v ? v.empresa_id : (sel.value === atual ? at.empresa_id || null : null),
      vinculo_nome: v ? v.nome.replace(/ \(empresa\)$/, '') : (sel.value && sel.value === atual ? at.vinculo_nome : null),
    };
    const btn = f.querySelector('#a-salvar');
    btn.disabled = true;
    const r = nova
      ? await sb.from('atividades').insert({ ...dados, criado_por: ctx.perfil.id, criado_por_nome: ctx.perfil.nome }).select('id').single()
      : await sb.from('atividades').update(dados).eq('id', at.id).select('id').single();
    if (r.error) { avisar(explicarErro(r.error), true); btn.disabled = false; return; }
    limparCache();
    // e-mail para quem passou a ser responsável (só quem já usa a plataforma)
    const aviso = await api('/api/atividade', { acao: 'avisar', id: r.data.id });
    const enviados = (aviso.ok && aviso.enviados) || [];
    avisar(`${nova ? 'Atividade criada' : 'Atividade salva'}.${enviados.length ? ` ${enviados.map(primeiroNome).join(', ')} ${enviados.length > 1 ? 'receberam' : 'recebeu'} um e-mail.` : ''}`);
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

