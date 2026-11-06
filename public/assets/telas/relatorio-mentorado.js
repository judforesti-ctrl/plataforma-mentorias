// Relatório da jornada do mentorado (mentoria individual, script 67; pedido da Juliana, 06/11/2026). Só a administração.
// "#/relatorio-mentorado": todos os mentorados, com o relatório de cada um e "Gerar" (um clique).
// "#/relatorio-mentorado/m/<mentorado>": os relatórios dele e "Gerar o relatório com a IA" (com um pedido opcional). Botão na ficha.
// "#/relatorio-mentorado/<id>": revisar e editar o texto (salva sozinho), pedir ajuste à IA, abrir o PDF (relatorio-mentorado.html)
// e entregar ao mentorado: "Liberar" grava um RETRATO (relatorios_mentorado.liberado), que é o que ele lê em Minha mentoria;
// mudar o texto depois não muda o que ele vê até "Atualizar a versão". As anotações originais dos mentores aparecem só aqui, para
// conferir; as informações delicadas nem são lidas.
import { sb, esc, avisar, explicarErro, dataBR, autoSalvar } from '../base.js';
import { api, faltaScript } from './agenda-dados.js';

const FALTA = '<div class="aviso erro">Para fazer o relatório da jornada, falta rodar o script <b>67-relatorio-da-jornada.sql</b> no Supabase.</div>';
const STATUS = { gerando: ['A IA está escrevendo…', 'neutro'], rascunho: ['Pronto para revisar', 'alerta'], erro: ['Deu erro', 'erro'] };
const SIT = { agendada: 'Agendada', realizada: 'Realizada', falta_avisada: 'Falta avisada', falta_sem_aviso: 'Falta sem aviso', remarcada: 'Remarcada', cancelada: 'Cancelada' };
const PASSOU_MS = 2 * 3600 * 1000;
const linhas = (t) => String(t || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const num = (x) => String(x).replace('.', ',');
const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] || '');
// JSON com as chaves em ordem (o banco reordena as chaves do jsonb): serve para saber se o texto mudou depois de liberado
const estavel = (v) => (Array.isArray(v) ? `[${v.map(estavel).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`
    : JSON.stringify(v ?? null));

export async function render(ctx, el, params) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração faz o relatório da jornada.</div>'; return; }
  if (params[0] === 'm' && params[1]) return doMentorado(ctx, el, params[1]);
  if (params[0]) return editor(ctx, el, params[0]);
  return todos(ctx, el);
}

// cria o relatório e chama a IA (a tela do editor acompanha)
async function gerar(mentorado, observacoes = null) {
  const { data, error } = await sb.from('relatorios_mentorado').insert({ mentorado_id: mentorado.id, titulo: `Relatório da jornada · ${mentorado.nome}`,
    observacoes, status: 'gerando', opcoes: { evolucao: true, notas: true } }).select('id').single();
  if (error) { avisar(faltaScript(error) ? 'Falta rodar o script 67-relatorio-da-jornada.sql no Supabase.' : explicarErro(error), true); return false; }
  const r = await api('/api/relatorio-mentorado-gerar', { id: data.id });
  if (!r.ok && r.mensagem) avisar(r.mensagem, true);
  location.hash = `#/relatorio-mentorado/${data.id}`;
  return true;
}

function seloRelatorio(r) {
  if (!r) return '<span class="selo neutro">Sem relatório</span>';
  if (r.liberado_em) return `<span class="selo ok">Na área do mentorado desde ${dataBR(r.liberado_em)}</span>`;
  const [rot, cls] = STATUS[r.status] || STATUS.rascunho;
  return `<span class="selo ${cls}">${rot}</span>`;
}

// ---------- todos os mentorados ----------
async function todos(ctx, el) {
  const [ment, rels] = await Promise.all([
    sb.from('mentorados').select('id, nome, cargo, status, programa:programas(nome, empresa:empresas(id, nome)), sessoes(situacao)').order('nome'),
    sb.from('relatorios_mentorado').select('id, mentorado_id, status, criado_em, liberado_em').order('criado_em', { ascending: false }),
  ]);
  if (ment.error) throw ment.error;
  const falta = rels.error && faltaScript(rels.error);
  if (rels.error && !falta) throw rels.error;
  const ultimo = new Map(), quantos = new Map();
  (rels.data || []).forEach((r) => { if (!ultimo.has(r.mentorado_id)) ultimo.set(r.mentorado_id, r); quantos.set(r.mentorado_id, (quantos.get(r.mentorado_id) || 0) + 1); });
  const lista = (ment.data || []).filter((m) => !/\b(modelo|teste)\b/i.test(m.nome)).map((m) => ({ m, feitas: (m.sessoes || []).filter((s) => s.situacao === 'realizada').length, total: (m.sessoes || []).filter((s) => s.situacao !== 'cancelada').length, rel: ultimo.get(m.id) }));
  const empresas = [...new Map(lista.filter((x) => x.m.programa && x.m.programa.empresa).map((x) => [x.m.programa.empresa.id, x.m.programa.empresa.nome]))].sort((a, b) => a[1].localeCompare(b[1]));

  el.innerHTML = `
    <div class="cab"><div><p class="peq apagado"><a href="#/relatorios">← Relatórios</a></p><h1>Relatório da jornada</h1>
      <p class="sub">Para cada mentorado da mentoria individual: todas as sessões, com quem foram, os temas e um resumo de cada uma, e no fim a síntese da IA (pontos altos, o que ele já reconhece que melhorou e os desafios). Você revisa e, no fim do processo, libera para o mentorado.</p></div></div>
    ${falta ? FALTA : ''}
    <div class="linha" style="margin-bottom:14px">
      <input type="text" id="busca" placeholder="Buscar pelo nome…" style="flex:1;min-width:200px">
      <select id="f-empresa" style="width:auto"><option value="">Todas as empresas</option>${empresas.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select>
      <select id="f-status" style="width:auto"><option value="">Todos</option><option value="ativo">Ativos</option><option value="concluido">Concluídos</option></select>
      <select id="f-rel" style="width:auto"><option value="">Com e sem relatório</option><option value="sem">Sem relatório</option><option value="revisar">Para revisar</option><option value="liberado">Já liberados</option></select>
    </div>
    <div class="lista" id="lista"></div>`;

  const desenhar = () => {
    const busca = el.querySelector('#busca').value.trim().toLowerCase();
    const fe = el.querySelector('#f-empresa').value, fs = el.querySelector('#f-status').value, fr = el.querySelector('#f-rel').value;
    const filtradas = lista.filter(({ m, rel }) => (!busca || m.nome.toLowerCase().includes(busca))
      && (!fe || (m.programa && m.programa.empresa && m.programa.empresa.id === fe)) && (!fs || m.status === fs)
      && (!fr || (fr === 'sem' ? !rel : fr === 'liberado' ? rel && rel.liberado_em : rel && !rel.liberado_em)));
    el.querySelector('#lista').innerHTML = filtradas.length ? filtradas.map(({ m, feitas, total, rel }) => `
      <div class="item" style="grid-template-columns:1fr auto">
        <div style="min-width:0"><div class="nome"><a href="#/relatorio-mentorado/m/${m.id}" style="color:inherit">${esc(m.nome)}</a> ${seloRelatorio(rel)}
          ${m.status && m.status !== 'ativo' ? `<span class="selo neutro">${esc(m.status)}</span>` : ''}</div>
          <div class="info">${esc(m.cargo || 'Cargo a preencher')}${m.programa ? ` · ${esc(m.programa.empresa ? m.programa.empresa.nome : '')} · ${esc(m.programa.nome)}` : ''}</div>
          <div class="info">Sessões realizadas: ${feitas} de ${total}${quantos.get(m.id) > 1 ? ` · ${quantos.get(m.id)} relatórios` : ''}</div></div>
        <div class="linha" style="gap:6px">
          ${rel ? `<a class="btn peq pri" href="#/relatorio-mentorado/${rel.id}">Abrir</a><a class="btn peq" href="#/relatorio-mentorado/m/${m.id}">Ver todos</a>`
            : `<button class="btn peq pri" type="button" data-gerar="${m.id}"${feitas && !falta ? '' : ' disabled'} title="${feitas ? 'A IA escreve o relatório a partir das sessões realizadas' : 'Nenhuma sessão realizada ainda'}">✨ Gerar</button>`}</div>
      </div>`).join('') : '<div class="vazio">Nenhum mentorado com esses filtros.</div>';
  };
  el.querySelectorAll('#busca, select').forEach((x) => x.addEventListener('input', desenhar));
  el.querySelector('#lista').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-gerar]'); if (!b) return;
    const item = lista.find((x) => x.m.id === b.dataset.gerar); if (!item) return;
    b.disabled = true; b.textContent = 'Começando…';
    if (!(await gerar(item.m))) { b.disabled = false; b.textContent = '✨ Gerar'; }
  });
  desenhar();
}

// ---------- os relatórios de um mentorado ----------
async function doMentorado(ctx, el, mid) {
  const [mq, rels] = await Promise.all([
    sb.from('mentorados').select('id, nome, cargo, status, programa:programas(nome, empresa:empresas(nome)), sessoes(id, numero, situacao, data_hora, concluida_em)').eq('id', mid).maybeSingle(),
    sb.from('relatorios_mentorado').select('id, titulo, status, criado_em, liberado_em').eq('mentorado_id', mid).order('criado_em', { ascending: false }),
  ]);
  if (mq.error) throw mq.error;
  const m = mq.data;
  if (!m) { el.innerHTML = '<div class="vazio">Mentorado não encontrado.</div>'; return; }
  const falta = rels.error && faltaScript(rels.error);
  if (rels.error && !falta) throw rels.error;
  const sess = (m.sessoes || []).slice().sort((a, b) => a.numero - b.numero);
  const feitas = sess.filter((s) => s.situacao === 'realizada');
  const semRegistro = sess.filter((s) => ['agendada', 'remarcada'].includes(s.situacao) && s.data_hora && Date.parse(s.data_hora) < Date.now() - PASSOU_MS);
  const nome = primeiro(m.nome);

  el.innerHTML = `
    <div class="cab"><div><p class="peq apagado"><a href="#/mentorado/${m.id}">← Ficha de ${esc(m.nome)}</a> · <a href="#/relatorio-mentorado">Todos os relatórios da jornada</a></p>
      <h1>Relatório da jornada</h1>
      <p class="sub">${esc(m.nome)}${m.programa ? ` · ${esc(m.programa.empresa ? m.programa.empresa.nome : '')} · ${esc(m.programa.nome)}` : ''}</p></div></div>
    ${falta ? FALTA : ''}
    <div class="cartao"><h3>${(rels.data || []).length ? 'Fazer um relatório novo' : `Gerar o relatório de ${esc(nome)}`}</h3>
      <p class="mt">A IA lê as <b>${feitas.length} ${feitas.length === 1 ? 'sessão realizada' : 'sessões realizadas'}</b> de ${esc(nome)} (anotações dos mentores, resumos, temas e tarefas) e escreve:
        cada sessão com data, mentor, temas e um resumo curto e, no fim, a síntese da jornada: <b>pontos altos</b>, <b>o que ${esc(nome)} já reconhece que melhorou</b> e <b>os desafios que ainda existem</b>.
        Os números e os gráficos são calculados pela plataforma. As informações delicadas nunca entram.</p>
      ${semRegistro.length ? `<div class="aviso mt"><b>Atenção:</b> ${semRegistro.length === 1 ? 'a sessão' : 'as sessões'} ${juntar(semRegistro.map((s) => String(s.numero)))} já ${semRegistro.length === 1 ? 'passou' : 'passaram'} mas não ${semRegistro.length === 1 ? 'está marcada' : 'estão marcadas'} como realizada${semRegistro.length === 1 ? '' : 's'}: fica${semRegistro.length === 1 ? '' : 'm'} fora do relatório.
        Se aconteceu, abra a sessão na <a href="#/mentorado/${m.id}">ficha</a>, marque "Realizada" e volte aqui.</div>` : ''}
      <div class="campo mt"><label for="n-obs">Algum pedido para a IA? (opcional)</label>
        <textarea id="n-obs" maxlength="3000" placeholder="Ex.: é o relatório final, para entregar a ${esc(nome)} no encerramento; destacar a evolução na delegação."></textarea></div>
      <div class="linha mt"><button class="btn pri" type="button" id="n-gerar"${feitas.length && !falta ? '' : ' disabled'}>✨ Gerar o relatório com a IA</button>
        ${feitas.length ? '<span class="peq apagado">Leva de 1 a 3 minutos.</span>' : `<span class="peq apagado">Nenhuma sessão de ${esc(nome)} está marcada como realizada ainda.</span>`}</div>
    </div>
    <h2 class="mt2">Relatórios de ${esc(nome)}</h2>
    <div class="lista mt">${(rels.data || []).map((r) => `<a class="item" href="#/relatorio-mentorado/${r.id}" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><div class="nome">${esc(r.titulo || 'Relatório da jornada')}</div><div class="info">Feito em ${dataBR(r.criado_em)}</div></div>
      ${seloRelatorio(r)}</a>`).join('') || '<p class="apagado">Nenhum relatório ainda.</p>'}</div>`;

  el.querySelector('#n-gerar').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = 'Começando…';
    if (!(await gerar(m, el.querySelector('#n-obs').value.trim() || null))) { b.disabled = false; b.textContent = '✨ Gerar o relatório com a IA'; }
  });
}

// ---------- revisar, editar e entregar ----------
async function editor(ctx, el, id) {
  const { data: rel, error } = await sb.from('relatorios_mentorado')
    .select('*, mentorado:mentorados(id, nome, perfil:perfis!mentorados_perfil_id_fkey(nome, whatsapp, autorizacoes, termo_aceito_em))').eq('id', id).maybeSingle();
  if (error) { el.innerHTML = faltaScript(error) ? FALTA : `<div class="aviso erro">${esc(explicarErro(error))}</div>`; return; }
  if (!rel) { el.innerHTML = '<div class="vazio">Relatório não encontrado.</div>'; return; }
  const m = rel.mentorado || { id: rel.mentorado_id, nome: '' };
  const nome = primeiro(m.nome) || 'o mentorado';
  const recarregar = () => ctx.irPara(`#/relatorio-mentorado/${id}`);
  const temTexto = rel.conteudo && rel.conteudo.texto;
  const topo = `<div class="cab"><div><p class="peq apagado"><a href="#/relatorio-mentorado/m/${m.id}">← Relatórios da jornada de ${esc(m.nome)}</a> · <a href="#/mentorado/${m.id}">Ficha</a></p>
    <h1>${esc(rel.titulo || 'Relatório da jornada')}</h1></div>
    <div class="acoes"><span class="salvo" id="indicador"></span>${rel.status !== 'gerando' && temTexto ? `<a class="btn pri" href="/relatorio-mentorado.html?id=${rel.id}" target="_blank" rel="noopener">Ver e baixar o PDF</a>` : ''}</div></div>`;

  if (rel.status === 'gerando') {
    el.innerHTML = `${topo}<div class="cartao"><p><b>A IA está escrevendo o relatório da jornada de ${esc(nome)}.</b> Leva de 1 a 3 minutos. Esta tela se atualiza sozinha quando ficar pronto.</p><p class="carregando mt">Escrevendo…</p></div>`;
    const inicio = Date.now();
    const timer = setInterval(async () => {
      if (!el.isConnected) { clearInterval(timer); return; }
      const { data } = await sb.from('relatorios_mentorado').select('status').eq('id', id).maybeSingle();
      if (data && data.status !== 'gerando') { clearInterval(timer); recarregar(); }
      else if (Date.now() - inicio > 6 * 60000) { clearInterval(timer); el.querySelector('.carregando').textContent = 'Está demorando mais que o normal. Volte daqui a pouco nesta tela.'; }
    }, 4000);
    return { sair: () => clearInterval(timer) };
  }
  if (!temTexto) {
    el.innerHTML = `${topo}<div class="aviso erro"><b>Não deu certo:</b> ${esc(rel.erro || 'o relatório ficou sem texto.')}</div>
      <div class="linha mt"><button class="btn pri" type="button" id="de-novo">Tentar de novo</button><button class="btn perigo" type="button" id="apagar" style="margin-left:auto">Apagar</button></div>`;
    el.querySelector('#de-novo').addEventListener('click', () => gerarDeNovo(id, '', recarregar));
    el.querySelector('#apagar').addEventListener('click', () => apagar(rel, m));
    return;
  }

  const { dados, texto } = rel.conteudo;
  const opcoes = { evolucao: true, notas: true, ...(rel.opcoes || {}) };
  const n = dados.numeros;
  const feitas = dados.sessoes.filter((s) => s.realizada);
  const faltas = dados.sessoes.filter((s) => /^falta/.test(s.situacao));
  // anotações e resumos originais (só aqui, para conferir; as informações delicadas não são lidas)
  const ids = feitas.map((s) => s.id);
  const { data: orig } = ids.length ? await sb.from('sessoes').select('id, resumo_mentorado, interno:sessoes_interno(resumo_mentor)').in('id', ids) : { data: [] };
  const original = new Map((orig || []).map((s) => [s.id, s]));
  const semRegistro = (dados.avisos && dados.avisos.sem_registro) || [];

  el.innerHTML = `${topo}
    ${rel.status === 'erro' ? `<div class="aviso erro"><b>O último pedido à IA não deu certo:</b> ${esc(rel.erro || '')} O texto abaixo continua o anterior.</div>` : ''}
    <div class="aviso"><b>Revise com calma: este relatório pode ir para ${esc(nome)}.</b> A IA escreveu a partir das anotações dos mentores e dos resumos das sessões, sem as informações delicadas.
      Confira se nada interno ficou e ajuste o que quiser: tudo salva sozinho. Os números e os gráficos são calculados pela plataforma (dados de ${dataBR(dados.gerado_em)}).</div>
    ${semRegistro.length ? `<div class="aviso mt"><b>Ficou de fora:</b> ${semRegistro.length === 1 ? 'a sessão' : 'as sessões'} ${juntar(semRegistro.map(String))} já ${semRegistro.length === 1 ? 'passou' : 'passaram'} mas não ${semRegistro.length === 1 ? 'estava marcada' : 'estavam marcadas'} como realizada${semRegistro.length === 1 ? '' : 's'}.
      Se aconteceu, marque "Realizada" na sessão e use "Escrever tudo de novo" aqui embaixo.</div>` : ''}
    <div class="cartao mt"><div class="campo"><label for="r-titulo">Título do relatório</label><input type="text" id="r-titulo" maxlength="160" value="${esc(rel.titulo || texto.titulo || '')}"></div>
      <div class="grade g4 mt">
        <div class="cartao numero"><b>${n.realizadas}<small style="font-size:14px;color:var(--apagado)"> de ${n.previstas}</small></b><span>sessões realizadas</span></div>
        <div class="cartao numero"><b>${num(n.horas)} h</b><span>de conversa</span></div>
        <div class="cartao numero"><b>${n.presenca_pct == null ? '—' : `${n.presenca_pct}%`}</b><span>presença${n.faltas ? ` (${n.faltas} ${n.faltas === 1 ? 'falta' : 'faltas'})` : ''}</span></div>
        <div class="cartao numero"><b>${n.tarefas ? `${n.tarefas_feitas}<small style="font-size:14px;color:var(--apagado)"> de ${n.tarefas}</small>` : '—'}</b><span>tarefas feitas</span></div></div>
      <h4 class="mt2">O que entra no relatório</h4>
      <label class="check mt"><input type="checkbox" data-opcao="evolucao"${opcoes.evolucao ? ' checked' : ''}${dados.evolucao.length ? '' : ' disabled'}>
        <span>Gráfico da evolução nos pontos a desenvolver <span class="peq apagado">(as notas de 1 a 5 que os mentores deram nas sessões${dados.evolucao.length ? '' : '; nenhuma nota registrada ainda'})</span></span></label>
      <label class="check mt"><input type="checkbox" data-opcao="notas"${opcoes.notas ? ' checked' : ''}${n.notas ? '' : ' disabled'}>
        <span>Gráfico das notas que ${esc(nome)} deu às sessões <span class="peq apagado">(${n.notas ? `média ${num(n.nota_media)} de 10 em ${n.notas} ${n.notas === 1 ? 'sessão' : 'sessões'}` : 'nenhuma nota ainda'})</span></span></label>
    </div>
    <div class="cartao"><h3>Abertura</h3><textarea class="mt" data-r="abertura" style="min-height:120px">${esc(texto.abertura || '')}</textarea></div>
    <div class="cartao"><h3>Sessão a sessão</h3>
      <p class="peq apagado">Uma parte para cada sessão realizada: temas (um por linha, viram etiquetas no relatório) e um resumo curto.</p>
      ${feitas.map((s) => {
        const x = (texto.sessoes || {})[s.id] || {};
        const o = original.get(s.id) || {};
        const notas = o.interno && o.interno.resumo_mentor;
        return `<div class="rt-modulo mt">
          <p class="peq"><b>Sessão ${s.numero}${s.tema ? ` · ${esc(s.tema)}` : ''}</b> · ${s.data ? dataBR(s.data) : 'sem data'}${s.mentor ? ` · ${esc(s.mentor)}` : ''}</p>
          <div class="grade mt" style="grid-template-columns:minmax(160px,1fr) 3fr;gap:10px">
            <div class="campo"><label>Temas</label><textarea data-s="${s.id}" data-c="temas" style="min-height:90px">${esc((x.temas || []).join('\n'))}</textarea></div>
            <div class="campo"><label>Resumo da sessão</label><textarea data-s="${s.id}" data-c="resumo" style="min-height:90px">${esc(x.resumo || '')}</textarea></div></div>
          <details class="mt"><summary class="peq">O que o mentor anotou e o resumo que ${esc(nome)} recebeu (não vão para o relatório)</summary>
            <p class="peq mt"><b>Anotações do mentor (internas)</b></p><p class="peq" style="white-space:pre-wrap">${esc(notas || 'Sem anotações.')}</p>
            <p class="peq mt"><b>Resumo enviado a ${esc(nome)}</b></p><p class="peq" style="white-space:pre-wrap">${esc(o.resumo_mentorado || 'Sem resumo.')}</p></details></div>`;
      }).join('')}
      ${faltas.length ? `<p class="peq apagado mt">Faltas (aparecem só na linha do tempo, sem motivo): ${esc(faltas.map((s) => `sessão ${s.numero} (${SIT[s.situacao].toLowerCase()})`).join(', '))}.</p>` : ''}
    </div>
    <div class="cartao"><h3>Síntese da jornada</h3>
      <p class="peq apagado">O fechamento do relatório, escrito pela IA olhando o processo inteiro. Um item por linha.</p>
      <div class="grade g3 mt" style="gap:12px;align-items:start">
        <div class="campo"><label>Pontos altos até aqui</label><textarea data-r="pontos_altos" style="min-height:150px">${esc((texto.pontos_altos || []).join('\n'))}</textarea></div>
        <div class="campo"><label>O que ${esc(nome)} já reconhece que melhorou</label><textarea data-r="melhorias" style="min-height:150px">${esc((texto.melhorias || []).join('\n'))}</textarea>
          <small>Vazio = as anotações não registram melhoria reconhecida por ${esc(nome)}; o bloco não aparece no relatório.</small></div>
        <div class="campo"><label>Desafios que ainda existem</label><textarea data-r="desafios" style="min-height:150px">${esc((texto.desafios || []).join('\n'))}</textarea></div></div>
      <div class="campo mt"><label>Palavra final</label><textarea data-r="encerramento" style="min-height:80px">${esc(texto.encerramento || '')}</textarea></div></div>
    <div class="cartao" id="entrega"></div>
    <div class="cartao"><h3>Pedir ajuste à IA</h3>
      <p class="peq apagado">Diga o que mudar (ex.: "deixe a abertura mais curta", "fale mais da evolução na comunicação com a equipe"). O resto continua igual, inclusive o que você já editou.</p>
      <textarea class="mt" id="r-ajuste" maxlength="4000" placeholder="O que você quer mudar?"></textarea>
      <div class="linha mt"><button class="btn pri" type="button" id="r-ajustar">Pedir ajuste</button>
        <button class="btn" type="button" id="r-refazer">Escrever tudo de novo (com os dados de hoje)</button>
        <button class="btn perigo" type="button" id="apagar" style="margin-left:auto">Apagar relatório</button></div></div>`;

  // o retrato que o mentorado lê (sem os avisos internos da revisão)
  const { avisos: _avisos, ...dadosPublicos } = dados;
  const retrato = () => ({ titulo: rel.titulo || texto.titulo || '', opcoes: { ...opcoes }, dados: dadosPublicos, texto });
  const caixa = el.querySelector('#entrega');
  const p = m.perfil || null;
  const whats = String((p && p.whatsapp) || '').replace(/\D/g, '');
  const podeWhats = !!(p && p.autorizacoes && p.autorizacoes.whatsapp && whats);
  const podeEmail = !!(p && p.termo_aceito_em && p.autorizacoes && p.autorizacoes.email);
  const linkRel = `${location.origin}/relatorio-mentorado.html?id=${id}`;
  function desenharEntrega() {
    const liberado = !!(rel.liberado && rel.liberado_em);
    const mudou = liberado && estavel(rel.liberado) !== estavel(retrato());
    const zap = `https://wa.me/55${whats.replace(/^55/, '')}?text=${encodeURIComponent(`Olá, ${nome}! A equipe da Mentorei preparou o relatório da sua jornada de mentoria: cada sessão, os temas que trabalhamos e uma síntese do seu caminho. Ele está na sua área da plataforma, em "Minha mentoria", e dá para baixar em PDF: ${linkRel}`)}`;
    caixa.innerHTML = `<h3>Entregar a ${esc(nome)}</h3>
      ${!liberado ? `<p class="mt">Quando o relatório estiver revisado (normalmente no fim do processo), libere na área de ${esc(nome)}: o relatório aparece em "Minha mentoria", com o botão para baixar em PDF. Antes disso, nada aparece para ${esc(nome)}.</p>
        <div class="linha mt"><button class="btn pri" type="button" id="liberar">Liberar na área de ${esc(nome)}</button></div>`
        : `<p class="mt"><span class="selo ok">Na área de ${esc(nome)} desde ${dataBR(rel.liberado_em)}</span>${rel.avisado_em ? ` <span class="peq apagado">· avisado por e-mail em ${dataBR(rel.avisado_em)}</span>` : ''}</p>
        ${mudou ? `<div class="aviso mt"><b>Você mudou o relatório depois de liberar.</b> ${esc(nome)} ainda vê a versão de ${dataBR(rel.liberado_em)}.
          <div class="linha mt"><button class="btn pri peq" type="button" id="atualizar">Atualizar a versão de ${esc(nome)}</button></div></div>` : ''}
        <div class="linha mt">
          <a class="btn peq" href="/relatorio-mentorado.html?id=${id}&versao=liberada" target="_blank" rel="noopener">Ver o que ${esc(nome)} vê</a>
          ${podeEmail ? `<button class="btn peq" type="button" id="avisar-email">${rel.avisado_em ? 'Avisar por e-mail de novo' : 'Avisar por e-mail'}</button>` : ''}
          ${podeWhats ? `<a class="btn peq" href="${esc(zap)}" target="_blank" rel="noopener">Avisar pelo WhatsApp</a>` : ''}
          <button class="btn peq perigo" type="button" id="tirar" style="margin-left:auto">Tirar da área de ${esc(nome)}</button></div>
        ${!p || !p.termo_aceito_em ? `<p class="peq apagado mt">${esc(nome)} ainda não entrou na plataforma: vai encontrar o relatório quando entrar. Se precisar antes, baixe o PDF e mande por outro caminho.</p>`
          : !podeEmail || !podeWhats ? `<p class="peq apagado mt">${esc(nome)} não autorizou ${!podeEmail && !podeWhats ? 'e-mails nem WhatsApp' : !podeEmail ? 'e-mails' : 'mensagens por WhatsApp'}: o relatório já está na área dele(a). Se quiser, baixe o PDF e entregue em mãos ou na última sessão.</p>` : ''}`}`;
  }
  desenharEntrega();
  caixa.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'liberar' || b.id === 'atualizar') {
      const novo = b.id === 'liberar';
      if (!window.confirm(novo ? `Liberar o relatório na área de ${nome}? A partir de agora ${nome} lê esta versão em "Minha mentoria".`
        : `Trocar a versão que ${nome} vê por esta, com as suas mudanças?`)) return;
      b.disabled = true;
      await salvador.agora();
      const agora = new Date().toISOString();
      // cópia: o texto da tela continua mudando, o retrato não
      const mud = { liberado: JSON.parse(JSON.stringify(retrato())), liberado_em: agora, liberado_por: ctx.perfil.id };
      const { error: e } = await sb.from('relatorios_mentorado').update(mud).eq('id', id);
      if (e) { avisar(explicarErro(e), true); b.disabled = false; return; }
      Object.assign(rel, mud);
      avisar(novo ? `Liberado. ${nome} já vê o relatório em "Minha mentoria".` : `Pronto: ${nome} vê a versão nova.`);
      desenharEntrega();
      return;
    }
    if (b.id === 'tirar') {
      if (!window.confirm(`Tirar o relatório da área de ${nome}? Ele deixa de aparecer para ${nome}; aqui nada muda.`)) return;
      b.disabled = true;
      const { error: e } = await sb.from('relatorios_mentorado').update({ liberado: null, liberado_em: null, liberado_por: null }).eq('id', id);
      if (e) { avisar(explicarErro(e), true); b.disabled = false; return; }
      Object.assign(rel, { liberado: null, liberado_em: null, liberado_por: null });
      avisar(`O relatório saiu da área de ${nome}.`);
      desenharEntrega();
      return;
    }
    if (b.id === 'avisar-email') {
      b.disabled = true; b.textContent = 'Enviando…';
      const r = await api('/api/relatorio-mentorado', { acao: 'avisar', id });
      if (r.ok) { rel.avisado_em = new Date().toISOString(); avisar(`E-mail enviado para ${r.para}.`); desenharEntrega(); return; }
      avisar(r.mensagem || 'O e-mail não saiu. Tente de novo.', true);
      b.disabled = false; b.textContent = 'Avisar por e-mail';
    }
  });

  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const novo = { ...texto, sessoes: { ...(texto.sessoes || {}) } };
      el.querySelectorAll('[data-r]').forEach((c) => { novo[c.dataset.r] = ['abertura', 'encerramento'].includes(c.dataset.r) ? c.value.trim() : linhas(c.value); });
      el.querySelectorAll('[data-s]').forEach((c) => {
        const x = { ...(novo.sessoes[c.dataset.s] || {}) };
        x[c.dataset.c] = c.dataset.c === 'temas' ? linhas(c.value).slice(0, 6) : c.value.trim();
        novo.sessoes[c.dataset.s] = x;
      });
      el.querySelectorAll('[data-opcao]').forEach((c) => { opcoes[c.dataset.opcao] = c.checked; });
      const titulo = el.querySelector('#r-titulo').value.trim() || rel.titulo;
      const { error: e } = await sb.from('relatorios_mentorado').update({ titulo, opcoes, conteudo: { ...rel.conteudo, texto: novo } }).eq('id', id);
      if (e) throw e;
      Object.assign(texto, novo); rel.titulo = titulo;
      desenharEntrega();
    },
  });
  el.querySelectorAll('textarea[data-r], textarea[data-s], #r-titulo').forEach((c) => c.addEventListener('input', salvador.mudou));
  el.querySelectorAll('[data-opcao]').forEach((c) => c.addEventListener('change', salvador.mudou));
  el.querySelector('#r-ajustar').addEventListener('click', async () => {
    const aj = el.querySelector('#r-ajuste').value.trim();
    if (!aj) { avisar('Escreva o que você quer mudar.', true); return; }
    await salvador.agora();
    gerarDeNovo(id, aj, recarregar);
  });
  el.querySelector('#r-refazer').addEventListener('click', async () => {
    if (!window.confirm(`Escrever tudo de novo com as sessões de hoje? O texto atual, com as suas edições, será substituído.${rel.liberado_em ? ` ${nome} continua vendo a versão liberada até você atualizar.` : ''}`)) return;
    gerarDeNovo(id, '', recarregar);
  });
  el.querySelector('#apagar').addEventListener('click', () => apagar(rel, m));
  return { sair: () => { salvador.agora(); salvador.parar(); } };
}

async function gerarDeNovo(id, ajustes, recarregar) {
  const { error } = await sb.from('relatorios_mentorado').update({ status: 'gerando', erro: null }).eq('id', id);
  if (error) { avisar(explicarErro(error), true); return; }
  const r = await api('/api/relatorio-mentorado-gerar', { id, ajustes });
  if (!r.ok && r.mensagem) avisar(r.mensagem, true);
  recarregar();
}

async function apagar(rel, m) {
  const nome = primeiro(m.nome);
  if (!window.confirm(`Apagar este relatório?${rel.liberado_em ? ` Ele também sai da área de ${nome}.` : ''} As sessões e as anotações continuam na plataforma.`)) return;
  const { error } = await sb.from('relatorios_mentorado').delete().eq('id', rel.id);
  if (error) { avisar(explicarErro(error), true); return; }
  avisar('Relatório apagado.');
  location.hash = `#/relatorio-mentorado/m/${m.id}`;
}
