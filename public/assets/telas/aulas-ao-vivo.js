// Gestão › Aulas ao vivo (pedido da Juliana, 15/11/2026; script 77). Só a administração (sócias e Cintia).
// Todas as aulas do Mentorei Ao Vivo num lugar só, com pesquisa por mentor, cliente, turma ou nome da aula. Daqui dá para abrir
// qualquer aula, criar uma aula avulsa a qualquer momento (sem módulo), fazer uma cópia, ligar a aula a um módulo (ou trocar,
// ou desligar) e esconder da lista. O mentor não vê esta tela: ele entra só pelo módulo dele ("▶ Deixar a aula mais dinâmica"), e o
// próprio Ao Vivo não cria mais aula sozinho. Tudo vem das rpc aovivo_gestao_* (security definer, só administração).
import { sb, esc, avisar, explicarErro, dataHoraBR, dataBR } from '../base.js';
import { janela } from './agenda-dados.js';
import { AOVIVO, linkDoPainel } from './aovivo-modulo.js';

const sem = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ESTADO = 'mentorei.aulasAoVivo';
const est = (() => { try { return JSON.parse(localStorage.getItem(ESTADO)) || {}; } catch (_) { return {}; } })();
const guardar = () => { try { localStorage.setItem(ESTADO, JSON.stringify(est)); } catch (_) { /* sem armazenamento */ } };
const SITUACOES = [['', 'Todas'], ['aconteceu', 'Já aconteceram'], ['andamento', 'Começaram e não foram encerradas'], ['montando', 'Ainda não começaram']];
const SEIS_HORAS = 6 * 3600 * 1000;

// aconteceu (encerrada, com alunos ou começada), andamento (começou e não foi encerrada) ou montando (ainda não começou)
export function situacao(a) {
  if (a.fase === 'encerrada') return a.comecou_em || a.participantes ? 'aconteceu' : 'montando';
  return a.comecou_em ? 'andamento' : 'montando';
}
function seloSituacao(a) {
  const s = situacao(a);
  if (s === 'aconteceu') return '<span class="selo neutro">Encerrada</span>';
  if (s === 'andamento') {
    const agora = Date.now() - new Date(a.atualizado_em || a.comecou_em).getTime() < SEIS_HORAS;
    return agora ? '<span class="selo ok">Acontecendo agora</span>' : '<span class="selo alerta">Não foi encerrada</span>';
  }
  return a.slides || a.atividades ? '<span class="selo">Montada, não começou</span>' : '<span class="selo neutro">Vazia</span>';
}
const nomesMentores = (a) => (a.mentores && a.mentores.length ? a.mentores.map((m) => m.nome) : []);
const quem = (a) => {
  const ns = nomesMentores(a);
  if (ns.length) return ns.join(', ');
  return a.criado_por ? `${a.criado_por.nome} <span class="peq apagado">(aula avulsa)</span>` : '<span class="apagado">Aula avulsa</span>';
};
const idsDePessoas = (a) => [...(a.mentores || []).map((m) => m.id), ...(a.mentores && a.mentores.length ? [] : a.criado_por ? [a.criado_por.id] : [])];

// filtro: texto (título, cliente, turma, mentor, código), mentor, cliente, situação, escondidas
export function filtrar(lista, f) {
  const palavras = sem(f.busca).split(/\s+/).filter(Boolean);
  return lista.filter((a) => {
    if (a.escondida && !f.escondidas) return false;
    if (f.mentor && !idsDePessoas(a).includes(f.mentor)) return false;
    if (f.empresa && !(a.empresa && a.empresa.id === f.empresa)) return false;
    if (f.situacao && situacao(a) !== f.situacao) return false;
    if (!palavras.length) return true;
    const texto = sem([a.titulo, a.codigo, a.empresa && a.empresa.nome, a.turma && a.turma.nome, a.modulo && a.modulo.titulo,
      ...nomesMentores(a), a.criado_por && a.criado_por.nome].join(' '));
    return palavras.every((p) => texto.includes(p));
  });
}

export async function render(ctx, el) {
  if (!ctx.ehAdmin) {
    el.innerHTML = '<div class="vazio">Esta lista é só da coordenação. Para dar a sua aula ao vivo, abra o módulo da sua turma e clique em <b>▶ Deixar a aula mais dinâmica</b>.</div>';
    return;
  }
  el.innerHTML = `
    <div class="cab"><div><h1>Aulas ao vivo</h1><p class="sub">Todas as aulas do Dinamiquei: as dos módulos das turmas e as avulsas. Os mentores entram só pelo módulo deles; esta lista é só das sócias e da coordenação.</p></div>
      <div class="acoes"><button class="btn pri" type="button" id="aav-nova">+ Nova aula avulsa</button></div></div>
    <p class="carregando">Carregando as aulas…</p>`;
  el.querySelector('#aav-nova').addEventListener('click', () => novaAvulsa(ctx, () => render(ctx, el)));

  const { data, error } = await sb.rpc('aovivo_gestao_lista');
  if (error) {
    el.querySelector('.carregando').outerHTML = /aovivo_gestao_lista|schema cache|PGRST20/.test(`${error.message}`)
      ? '<div class="aviso erro">Falta um passo no banco (script 77). Avise o Claude.</div>'
      : `<div class="aviso erro">${esc(explicarErro(error))}</div>`;
    return;
  }
  const todas = Array.isArray(data) ? data : [];

  // opções dos filtros: só quem e o que aparece nas aulas
  const mentores = new Map(), empresas = new Map();
  todas.forEach((a) => {
    (a.mentores || []).forEach((m) => mentores.set(m.id, m.nome));
    if (a.criado_por && !(a.mentores || []).length) mentores.set(a.criado_por.id, a.criado_por.nome);
    if (a.empresa) empresas.set(a.empresa.id, a.empresa.nome);
  });
  const opcoes = (mapa, atual, todos) => `<option value="">${todos}</option>${[...mapa.entries()].sort((x, y) => String(x[1]).localeCompare(String(y[1]), 'pt-BR'))
    .map(([k, v]) => `<option value="${esc(k)}"${k === atual ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;
  if (est.mentor && !mentores.has(est.mentor)) est.mentor = '';
  if (est.empresa && !empresas.has(est.empresa)) est.empresa = '';
  const escondidas = todas.filter((a) => a.escondida).length;

  el.querySelector('.carregando').outerHTML = `
    <div class="aav-filtros">
      <div class="campo" style="flex:2;min-width:220px"><label for="aav-busca">Procurar</label><input id="aav-busca" type="search" placeholder="Nome da aula, cliente, turma, mentor ou código" value="${esc(est.busca || '')}"></div>
      <div class="campo"><label for="aav-mentor">Mentor</label><select id="aav-mentor">${opcoes(mentores, est.mentor, 'Todos')}</select></div>
      <div class="campo"><label for="aav-empresa">Cliente</label><select id="aav-empresa">${opcoes(empresas, est.empresa, 'Todos')}</select></div>
      <div class="campo"><label for="aav-situacao">Situação</label><select id="aav-situacao">${SITUACOES.map(([k, t]) => `<option value="${k}"${k === (est.situacao || '') ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <button class="btn peq" type="button" id="aav-limpar"${est.busca || est.mentor || est.empresa || est.situacao ? '' : ' hidden'}>Limpar filtros</button>
    </div>
    ${escondidas ? `<label class="check peq"><input type="checkbox" id="aav-escondidas"${est.escondidas ? ' checked' : ''}> ${escondidas > 1 ? `Mostrar também as ${escondidas} aulas escondidas` : 'Mostrar também a aula escondida'}</label>` : ''}
    <div id="aav-numeros" class="mt"></div>
    <div id="aav-lista" class="mt"></div>`;

  const desenhar = () => {
    const lista = filtrar(todas, est);
    const feitas = lista.filter((a) => situacao(a) === 'aconteceu');
    const semPerc = feitas.filter((a) => a.modulo && !a.modulo.percepcoes_em).length;
    el.querySelector('#aav-numeros').innerHTML = `<div class="grade g4">
      <div class="cartao numero"><b>${lista.length}</b><span>aula${lista.length === 1 ? '' : 's'} na lista</span></div>
      <div class="cartao numero"><b>${feitas.length}</b><span>já aconteceram</span></div>
      <div class="cartao numero"><b>${lista.reduce((s, a) => s + (a.participantes || 0), 0)}</b><span>pessoas participaram</span></div>
      <div class="cartao numero"><b>${semPerc}</b><span>aula${semPerc === 1 ? '' : 's'} de turma sem percepções</span></div></div>`;
    const alvo = el.querySelector('#aav-lista');
    if (!lista.length) {
      alvo.innerHTML = `<div class="vazio">${todas.length ? 'Nenhuma aula com estes filtros.' : 'Nenhuma aula ao vivo ainda. Elas aparecem aqui quando um mentor abre a aula pelo módulo, ou quando você cria uma aula avulsa.'}</div>`;
      return;
    }
    alvo.innerHTML = `<div class="cartao tabela" style="padding:0"><table class="aav-tabela">
      <thead><tr><th>Quando</th><th>Aula</th><th>Cliente e turma</th><th>Mentor</th><th>Alunos</th><th>Atividades</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map((a) => linha(a)).join('')}</tbody></table></div>`;
  };
  const linha = (a) => {
    const quando = a.comecou_em || (a.modulo && a.modulo.data_hora) || a.criado_em;
    const perc = a.modulo && situacao(a) === 'aconteceu'
      ? (a.modulo.percepcoes_em ? '<br><span class="selo ok mt" style="margin-top:4px">Percepções ✓</span>' : '<br><span class="selo alerta" style="margin-top:4px">Sem percepções</span>') : '';
    return `<tr data-id="${a.id}"${a.escondida ? ' class="aav-escondida"' : ''}>
      <td data-rotulo="Quando">${a.comecou_em ? dataHoraBR(quando) : `<span class="apagado">${dataBR(quando)}</span>`}</td>
      <td data-rotulo="Aula"><b>${esc(a.titulo)}</b><br><span class="peq apagado">Código ${esc(String(a.codigo).replace(/^(\d{3})/, '$1 '))}${a.slides ? ` · ${a.slides} slide${a.slides > 1 ? 's' : ''}` : ''}${a.escondida ? ' · escondida' : ''}</span></td>
      <td data-rotulo="Cliente e turma">${a.empresa ? esc(a.empresa.nome) : '<span class="apagado">Sem cliente</span>'}${a.turma ? `<br><span class="peq">${esc(a.turma.nome)}${a.modulo ? ` · Módulo ${esc(a.modulo.numero)}` : ''}</span>` : '<br><span class="peq apagado">Sem módulo</span>'}</td>
      <td data-rotulo="Mentor">${quem(a)}</td>
      <td data-rotulo="Alunos">${a.participantes || 0}</td>
      <td data-rotulo="Atividades">${a.atividades || 0}${a.respostas ? `<br><span class="peq apagado">${a.respostas} resposta${a.respostas > 1 ? 's' : ''}</span>` : ''}</td>
      <td data-rotulo="Situação">${seloSituacao(a)}${perc}</td>
      <td class="aav-botoes"><button class="btn pri peq" type="button" data-abrir>▶ Abrir</button>
        ${a.modulo ? `<a class="btn peq" href="#/modulo/${a.modulo.id}">Ver o módulo</a>` : ''}
        <button class="btn peq" type="button" data-mais aria-label="Mais opções">Mais…</button></td></tr>`;
  };
  desenhar();

  let espera = null;
  el.querySelector('#aav-busca').addEventListener('input', (ev) => {
    clearTimeout(espera);
    espera = setTimeout(() => { est.busca = ev.target.value; guardar(); desenhar(); limparVisivel(); }, 200);
  });
  const limparVisivel = () => { el.querySelector('#aav-limpar').hidden = !(est.busca || est.mentor || est.empresa || est.situacao); };
  [['aav-mentor', 'mentor'], ['aav-empresa', 'empresa'], ['aav-situacao', 'situacao']].forEach(([id, k]) => el.querySelector(`#${id}`).addEventListener('change', (ev) => {
    est[k] = ev.target.value; guardar(); desenhar(); limparVisivel();
  }));
  el.querySelector('#aav-limpar').addEventListener('click', () => { Object.assign(est, { busca: '', mentor: '', empresa: '', situacao: '' }); guardar(); render(ctx, el); });
  el.querySelector('#aav-escondidas')?.addEventListener('change', (ev) => { est.escondidas = ev.target.checked; guardar(); desenhar(); });
  el.querySelector('#aav-lista').addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-id]');
    if (!tr) return;
    const a = todas.find((x) => x.id === tr.dataset.id);
    if (ev.target.closest('[data-abrir]')) abrir(ctx, a);
    else if (ev.target.closest('[data-mais]')) mais(ctx, a, todas, () => render(ctx, el));
  });
}

// abre o painel do Ao Vivo numa aba nova (a aba nasce no clique, para o navegador não bloquear)
async function abrir(ctx, a) {
  const aba = window.open('', '_blank');
  if (aba) aba.document.write('<p style="font:16px sans-serif;padding:24px">Abrindo a aula ao vivo…</p>');
  try {
    let m = null;
    // aula de módulo ainda sem slides: leva os slides do módulo, como o botão do módulo faz
    if (a.modulo && !a.slides) {
      const { data } = await sb.from('modulos').select('id, arquivos:modulo_arquivos(id, tipo, nome, caminho, enviado_por, enviado_em)').eq('id', a.modulo.id).maybeSingle();
      m = data || null;
    }
    const url = await linkDoPainel(ctx, m, a);
    if (aba) aba.location.href = url; else window.location.href = url;
  } catch (e) {
    if (aba) aba.close();
    avisar(explicarErro(e), true);
  }
}

function novaAvulsa(ctx, depois) {
  const j = janela('Nova aula avulsa', `
    <p class="peq">Para usar o Ao Vivo a qualquer momento, sem turma: uma palestra, uma reunião, uma demonstração para um cliente.
      Para uma aula de turma, o melhor caminho é o módulo (lá a presença e a avaliação voltam sozinhas para a plataforma);
      se precisar, dá para ligar esta aula a um módulo depois, em <b>Mais…</b>.</p>
    <div class="campo mt"><label for="aav-nova-titulo">Nome da aula</label><input id="aav-nova-titulo" maxlength="80" placeholder="Ex.: Palestra Comunicação que expande possibilidades"></div>
    <div class="campo mt"><label for="aav-nova-empresa">Cliente (opcional)</label><select id="aav-nova-empresa"><option value="">Sem cliente</option></select></div>
    <div class="linha mt" style="justify-content:flex-end;gap:8px"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn pri" type="button" id="aav-criar">Criar e abrir no Dinamiquei</button></div>`, { largura: 560 });
  sb.from('empresas').select('id, nome').order('nome').then(({ data }) => {
    const sel = j.corpo.querySelector('#aav-nova-empresa');
    (data || []).forEach((e) => sel.insertAdjacentHTML('beforeend', `<option value="${e.id}">${esc(e.nome)}</option>`));
  });
  setTimeout(() => j.corpo.querySelector('#aav-nova-titulo').focus(), 50);
  j.corpo.querySelector('#aav-criar').addEventListener('click', async (ev) => {
    const titulo = j.corpo.querySelector('#aav-nova-titulo').value.trim();
    if (!titulo) { avisar('Dê um nome para a aula.', true); return; }
    const aba = window.open('', '_blank');
    if (aba) aba.document.write('<p style="font:16px sans-serif;padding:24px">Criando a aula ao vivo…</p>');
    ev.currentTarget.disabled = true;
    const { data, error } = await sb.rpc('aovivo_gestao_nova', { p_titulo: titulo, p_empresa: j.corpo.querySelector('#aav-nova-empresa').value || null });
    if (error) { if (aba) aba.close(); ev.currentTarget.disabled = false; avisar(explicarErro(error), true); return; }
    const url = await linkDoPainel(ctx, null, data);
    if (aba) aba.location.href = url; else window.open(url, '_blank');
    j.fechar(); avisar('Aula criada. Ela abriu numa aba nova.'); depois();
  });
}

// Mais…: ligar/trocar/desligar o módulo, fazer uma cópia, esconder da lista
function mais(ctx, a, todas, depois) {
  const j = janela(a.titulo, `
    <div class="aav-mais">
      <div class="cartao" style="margin:0">
        <h4>${a.modulo ? 'Módulo da turma' : 'Ligar a um módulo'}</h4>
        <p class="peq">${a.modulo
          ? `Esta aula é do <b>Módulo ${esc(a.modulo.numero)}</b>${a.turma ? ` da turma ${esc(a.turma.nome)}` : ''}${a.empresa ? ` (${esc(a.empresa.nome)})` : ''}. A presença e a avaliação voltam para esse módulo.`
          : 'Ligada a um módulo, a presença de quem entrou e a avaliação no fim da aula voltam para a turma, e o mentor do módulo passa a ver esta aula.'}</p>
        <div class="campo mt"><label for="aav-modulo">${a.modulo ? 'Trocar para outro módulo' : 'Escolha o módulo'}</label><select id="aav-modulo"><option value="">Carregando os módulos…</option></select></div>
        <p class="peq mt" id="aav-modulo-aviso" role="status"></p>
        <div class="linha mt" style="gap:8px"><button class="btn pri peq" type="button" id="aav-ligar" disabled>${a.modulo ? 'Trocar o módulo' : 'Ligar a este módulo'}</button>
          ${a.modulo ? '<button class="btn peq" type="button" id="aav-desligar">Desligar do módulo</button>' : ''}</div>
      </div>
      <div class="cartao" style="margin:0">
        <h4>Fazer uma cópia</h4>
        <p class="peq">Cria uma aula nova com os mesmos slides e atividades, sem alunos e com o placar zerado. Serve para usar o mesmo roteiro com outra turma: depois é só ligar a cópia ao módulo dessa turma.</p>
        <button class="btn peq mt" type="button" id="aav-copiar">Fazer uma cópia</button>
      </div>
      <div class="cartao" style="margin:0">
        <h4>${a.escondida ? 'Mostrar de novo na lista' : 'Esconder da lista'}</h4>
        <p class="peq">${a.escondida ? 'A aula volta para a lista.' : 'Para testes e aulas que não contam. Nada é apagado: dá para mostrar de novo marcando "Mostrar também as escondidas".'}</p>
        <button class="btn peq mt" type="button" id="aav-esconder">${a.escondida ? 'Mostrar de novo' : 'Esconder da lista'}</button>
      </div>
    </div>`, { largura: 620 });

  const sel = j.corpo.querySelector('#aav-modulo'), aviso = j.corpo.querySelector('#aav-modulo-aviso'), ligar = j.corpo.querySelector('#aav-ligar');
  const dono = new Map(todas.filter((x) => x.modulo && x.id !== a.id).map((x) => [x.modulo.id, x]));
  sb.from('modulos').select('id, numero, titulo, data_hora, turma:turmas(nome, empresa:empresas(nome))').order('data_hora', { ascending: false, nullsFirst: false }).then(({ data, error }) => {
    if (error) { sel.innerHTML = '<option value="">Não consegui carregar os módulos</option>'; return; }
    const ms = (data || []).filter((m) => !a.modulo || m.id !== a.modulo.id);
    sel.innerHTML = `<option value="">Escolha…</option>${ms.map((m) => `<option value="${m.id}">${esc([m.turma && m.turma.empresa && m.turma.empresa.nome, m.turma && m.turma.nome,
      `Módulo ${m.numero}${m.titulo ? ` · ${m.titulo}` : ''}`, m.data_hora ? dataBR(m.data_hora) : 'data a definir'].filter(Boolean).join(' · '))}</option>`).join('')}`;
  });
  sel.addEventListener('change', () => {
    ligar.disabled = !sel.value;
    const outra = dono.get(sel.value);
    aviso.innerHTML = outra ? `⚠ Este módulo já tem uma aula ao vivo (<b>${esc(outra.titulo)}</b>, código ${esc(outra.codigo)}). Ela fica avulsa (nada se perde) e esta passa a ser a aula do módulo.` : '';
  });
  const fazer = async (botao, rpc, args, msg) => {
    botao.disabled = true;
    const { data, error } = await sb.rpc(rpc, args);
    if (error) { botao.disabled = false; avisar(explicarErro(error), true); return null; }
    avisar(msg); j.fechar(); depois();
    return data;
  };
  ligar.addEventListener('click', () => fazer(ligar, 'aovivo_gestao_ligar', { p_sessao: a.id, p_modulo: sel.value }, 'Pronto: a aula agora é deste módulo.'));
  j.corpo.querySelector('#aav-desligar')?.addEventListener('click', (ev) => fazer(ev.currentTarget, 'aovivo_gestao_ligar', { p_sessao: a.id, p_modulo: null }, 'A aula ficou avulsa (sem módulo).'));
  j.corpo.querySelector('#aav-copiar').addEventListener('click', (ev) => fazer(ev.currentTarget, 'aovivo_gestao_copiar', { p_sessao: a.id }, 'Cópia criada: ela está no alto da lista.'));
  j.corpo.querySelector('#aav-esconder').addEventListener('click', (ev) => fazer(ev.currentTarget, 'aovivo_gestao_esconder', { p_sessao: a.id, p_esconder: !a.escondida }, a.escondida ? 'A aula voltou para a lista.' : 'A aula saiu da lista.'));
}

if (!document.getElementById('aav-estilo')) document.head.insertAdjacentHTML('beforeend', `<style id="aav-estilo">
  .aav-filtros { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
  .aav-filtros .campo { min-width: 170px; } .aav-filtros select { width: auto; max-width: 100%; }
  .aav-tabela td { font-size: 13.5px; } .aav-tabela tr.aav-escondida td { opacity: .55; }
  .aav-botoes { white-space: nowrap; text-align: right; } .aav-botoes .btn { margin: 2px 0 2px 4px; }
  .aav-mais { display: grid; gap: 12px; } .aav-mais h4 { margin: 0 0 4px; font-size: 15px; }
  @media (max-width: 860px) {
    .aav-tabela thead { display: none; } .aav-tabela, .aav-tabela tbody, .aav-tabela tr, .aav-tabela td { display: block; width: 100%; }
    .aav-tabela tr { border-bottom: 1px solid var(--linha); padding: 8px 4px; } .aav-tabela td { border: 0; padding: 4px 10px; }
    .aav-tabela td[data-rotulo]::before { content: attr(data-rotulo); display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--apagado); font-weight: 700; }
    .aav-botoes { text-align: left; white-space: normal; }
  }
</style>`);
