// Relatório da mentoria para a empresa (script 68; pedido da Juliana, 06/11/2026). Só a administração.
// A leitura macro de um ou mais programas de mentoria individual de uma empresa, para a diretoria e o RH: maiores dificuldades,
// pontos mais trabalhados, maiores medos e próximos passos, cruzando os registros de todos os mentorados. Nada identifica quem
// disse o quê; os números de cada item a plataforma conta pelos códigos que a IA devolve (a lista de nomes por trás de cada número
// aparece só aqui, para a administração conferir). O PDF (relatorio-empresa.html) tem o mesmo desenho do relatório da jornada.
// "#/relatorio-empresa": escolher a empresa e os programas e gerar; lista dos já feitos. "#/relatorio-empresa/<id>": revisar.
import { sb, esc, avisar, explicarErro, dataBR, autoSalvar } from '../base.js';
import { api, faltaScript } from './agenda-dados.js';

const FALTA = '<div class="aviso erro">Para fazer o relatório para a empresa, falta rodar o script <b>68-relatorio-para-a-empresa.sql</b> no Supabase.</div>';
const STATUS = { gerando: ['A IA está escrevendo…', 'neutro'], rascunho: ['Pronto para revisar', 'alerta'], erro: ['Deu erro', 'erro'] };
const DENTRO = new Set(['ativo', 'concluido', 'pausado']);
const PASSOU_MS = 2 * 3600 * 1000;
const linhas = (t) => String(t || '').split('\n').map((x) => x.replace(/^[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
const num = (x) => String(x).replace('.', ',');
const ehTeste = (nome) => /\b(modelo|teste)\b/i.test(nome || '');
const nomeCurto = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] || ''; };
const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] || '');

// as listas editáveis: [campo, rótulo, tipo]
const CAMPOS = {
  grupos: [['titulo', 'Área ou função', 'texto'], ['n', 'Líderes', 'num']],
  dificuldades: [['titulo', 'Dificuldade', 'texto'], ['n', 'Líderes', 'num'], ['descricao', 'Como aparece no dia a dia', 'area']],
  temas: [['titulo', 'Tema', 'texto'], ['n', 'Sessões', 'num']],
  evolucoes: [['titulo', 'Ponto', 'texto'], ['texto', 'O que já mudou, segundo os registros', 'area']],
  medos: [['titulo', 'Medo', 'texto'], ['n', 'Líderes', 'num'], ['como_aparece', 'Como aparece nas conversas', 'area']],
};
const CODIGOS = { grupos: 'lideres', dificuldades: 'lideres', medos: 'lideres', temas: 'sessoes' };

export async function render(ctx, el, params) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração faz o relatório para a empresa.</div>'; return; }
  if (params[0] && params[0] !== 'empresa') return editor(ctx, el, params[0]);
  return inicio(ctx, el, params[0] === 'empresa' ? params[1] : '');
}

function seloStatus(r) {
  const [rot, cls] = STATUS[r.status] || STATUS.rascunho;
  return `<span class="selo ${cls}">${rot}</span>`;
}

// ---------- escolher a empresa e os programas; relatórios já feitos ----------
async function inicio(ctx, el, empresaInicial) {
  const [emp, prog, ment, rels] = await Promise.all([
    sb.from('empresas').select('id, nome').order('nome'),
    sb.from('programas').select('id, nome, empresa_id, status, inicio, fim_previsto').order('criado_em', { ascending: false }),
    sb.from('mentorados').select('id, nome, status, programa_id, sessoes(situacao, data_hora)'),
    sb.from('relatorios_empresa').select('id, empresa_id, programas, titulo, status, criado_em').order('criado_em', { ascending: false }),
  ]);
  for (const r of [emp, prog, ment]) if (r.error) throw r.error;
  const falta = rels.error && faltaScript(rels.error);
  if (rels.error && !falta) throw rels.error;
  const nomeEmpresa = new Map((emp.data || []).map((e) => [e.id, e.nome]));
  const nomePrograma = new Map((prog.data || []).map((p) => [p.id, p.nome]));
  // por programa: mentorados que entram (sem desligados, suspensos e o "modelo" de teste) e as sessões deles
  const porPrograma = new Map();
  for (const m of ment.data || []) {
    if (ehTeste(m.nome) || !DENTRO.has(m.status || 'ativo')) continue;
    const x = porPrograma.get(m.programa_id) || { lideres: 0, feitas: 0, previstas: 0, semRegistro: 0 };
    const ss = m.sessoes || [];
    x.lideres += 1;
    x.feitas += ss.filter((s) => s.situacao === 'realizada').length;
    x.previstas += ss.filter((s) => s.situacao !== 'cancelada').length;
    x.semRegistro += ss.filter((s) => ['agendada', 'remarcada'].includes(s.situacao) && s.data_hora && Date.parse(s.data_hora) < Date.now() - PASSOU_MS).length;
    porPrograma.set(m.programa_id, x);
  }
  const programas = (prog.data || []).filter((p) => porPrograma.has(p.id));
  const empresas = (emp.data || []).filter((e) => programas.some((p) => p.empresa_id === e.id));

  el.innerHTML = `
    <div class="cab"><div><p class="peq apagado"><a href="#/relatorios">← Relatórios</a></p><h1>Relatório da mentoria para a empresa</h1>
      <p class="sub">A leitura macro da mentoria individual para a diretoria e o RH: a IA cruza os registros de todos os mentorados de um programa e mostra as maiores dificuldades do time, os pontos mais trabalhados, os maiores medos e os próximos passos. Sem nomes: nada identifica quem disse o quê.</p></div></div>
    ${falta ? FALTA : ''}
    <div class="cartao"><h3>Fazer um relatório novo</h3>
      <div class="campo mt"><label for="n-empresa">Empresa</label>
        <select id="n-empresa"><option value="">Escolha a empresa…</option>${empresas.map((e) => `<option value="${e.id}"${e.id === empresaInicial ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
      <div id="n-programas"></div>
      <div class="campo mt"><label for="n-obs">Algum pedido para a IA? (opcional)</label>
        <textarea id="n-obs" maxlength="3000" placeholder="Ex.: é para a reunião com o diretor; destacar o que depende da diretoria e o que depende do RH."></textarea></div>
      <div class="linha mt"><button class="btn pri" type="button" id="n-gerar" disabled>✨ Gerar o relatório com a IA</button>
        <span class="peq apagado" id="n-dica">Leva de 2 a 5 minutos.</span></div>
    </div>
    <h2 class="mt2">Relatórios já feitos</h2>
    <div class="lista mt">${(rels.data || []).map((r) => `<a class="item" href="#/relatorio-empresa/${r.id}" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><div class="nome">${esc(nomeEmpresa.get(r.empresa_id) || 'Empresa')} · ${esc(r.titulo || 'Relatório para a empresa')}</div>
        <div class="info">${esc((r.programas || []).map((p) => nomePrograma.get(p)).filter(Boolean).join(', '))} · feito em ${dataBR(r.criado_em)}</div></div>
      ${seloStatus(r)}</a>`).join('') || '<p class="apagado">Nenhum relatório ainda.</p>'}</div>`;

  const caixa = el.querySelector('#n-programas');
  const botao = el.querySelector('#n-gerar');
  const escolhidos = () => [...caixa.querySelectorAll('input[data-programa]:checked')].map((c) => c.dataset.programa);
  const conferir = () => {
    const ids = escolhidos();
    const feitas = ids.reduce((a, id) => a + porPrograma.get(id).feitas, 0);
    const sem = ids.reduce((a, id) => a + porPrograma.get(id).semRegistro, 0);
    botao.disabled = !!falta || !ids.length || !feitas;
    el.querySelector('#n-aviso').innerHTML = !ids.length ? '' : !feitas ? '<div class="aviso">Nenhuma sessão desses programas está marcada como realizada ainda: não há o que relatar.</div>'
      : sem ? `<div class="aviso"><b>Atenção:</b> ${sem === 1 ? 'uma sessão já passou' : `${sem} sessões já passaram`} mas não ${sem === 1 ? 'está marcada' : 'estão marcadas'} como realizada${sem === 1 ? '' : 's'}: ${sem === 1 ? 'fica' : 'ficam'} fora do relatório.
        Se ${sem === 1 ? 'aconteceu' : 'aconteceram'}, peça aos mentores para registrar antes de gerar (a lista de quem falta aparece no relatório).</div>` : '';
  };
  const desenharProgramas = () => {
    const eid = el.querySelector('#n-empresa').value;
    const ps = programas.filter((p) => p.empresa_id === eid);
    caixa.innerHTML = !eid ? '' : `<p class="mt"><b>Programas de mentoria individual</b> <span class="peq apagado">(marque os que entram no relatório)</span></p>
      ${ps.map((p) => { const x = porPrograma.get(p.id); return `<label class="check mt"><input type="checkbox" data-programa="${p.id}"${x.feitas ? ' checked' : ''}>
        <span><b>${esc(p.nome)}</b> <span class="peq apagado">· ${x.lideres} ${x.lideres === 1 ? 'mentorado' : 'mentorados'} · ${x.feitas} de ${x.previstas} ${x.previstas === 1 ? 'sessão realizada' : 'sessões realizadas'}${p.status === 'concluido' ? ' · concluído' : ''}</span></span></label>`; }).join('')}
      <div id="n-aviso" class="mt"></div>`;
    caixa.querySelectorAll('input').forEach((c) => c.addEventListener('change', conferir));
    if (eid) conferir(); else botao.disabled = true;
  };
  el.querySelector('#n-empresa').addEventListener('change', desenharProgramas);
  desenharProgramas();
  botao.addEventListener('click', async () => {
    const eid = el.querySelector('#n-empresa').value;
    botao.disabled = true; botao.textContent = 'Começando…';
    const { data, error } = await sb.from('relatorios_empresa').insert({ empresa_id: eid, programas: escolhidos(), titulo: `Relatório para a empresa · ${nomeEmpresa.get(eid)}`,
      observacoes: el.querySelector('#n-obs').value.trim() || null, status: 'gerando', opcoes: { tarefas: true, avaliacao: true, mentores: true } }).select('id').single();
    if (error) { avisar(faltaScript(error) ? 'Falta rodar o script 68-relatorio-para-a-empresa.sql no Supabase.' : explicarErro(error), true); botao.disabled = false; botao.textContent = '✨ Gerar o relatório com a IA'; return; }
    const r = await api('/api/relatorio-empresa-gerar', { id: data.id });
    if (!r.ok && r.mensagem) avisar(r.mensagem, true);
    location.hash = `#/relatorio-empresa/${data.id}`;
  });
}

// ---------- revisar e editar ----------
async function editor(ctx, el, id) {
  const { data: rel, error } = await sb.from('relatorios_empresa').select('*, empresa:empresas(id, nome)').eq('id', id).maybeSingle();
  if (error) { el.innerHTML = faltaScript(error) ? FALTA : `<div class="aviso erro">${esc(explicarErro(error))}</div>`; return; }
  if (!rel) { el.innerHTML = '<div class="vazio">Relatório não encontrado.</div>'; return; }
  const empresa = (rel.empresa && rel.empresa.nome) || 'a empresa';
  const recarregar = () => ctx.irPara(`#/relatorio-empresa/${id}`);
  const temTexto = rel.conteudo && rel.conteudo.texto;
  const topo = `<div class="cab"><div><p class="peq apagado"><a href="#/relatorio-empresa">← Relatórios para a empresa</a></p>
    <h1>${esc(rel.titulo || 'Relatório para a empresa')}</h1><p class="sub">${esc(empresa)}</p></div>
    <div class="acoes"><span class="salvo" id="indicador"></span>${rel.status !== 'gerando' && temTexto ? `<a class="btn pri" href="/relatorio-empresa.html?id=${rel.id}" target="_blank" rel="noopener">Ver e baixar o PDF</a>` : ''}</div></div>`;

  if (rel.status === 'gerando') {
    el.innerHTML = `${topo}<div class="cartao"><p><b>A IA está cruzando os registros de todos os mentorados.</b> Leva de 2 a 5 minutos. Esta tela se atualiza sozinha quando ficar pronto.</p><p class="carregando mt">Escrevendo…</p></div>`;
    const inicio = Date.now();
    const timer = setInterval(async () => {
      if (!el.isConnected) { clearInterval(timer); return; }
      const { data } = await sb.from('relatorios_empresa').select('status').eq('id', id).maybeSingle();
      if (data && data.status !== 'gerando') { clearInterval(timer); recarregar(); }
      else if (Date.now() - inicio > 9 * 60000) { clearInterval(timer); el.querySelector('.carregando').textContent = 'Está demorando mais que o normal. Volte daqui a pouco nesta tela.'; }
    }, 4000);
    return { sair: () => clearInterval(timer) };
  }
  if (!temTexto) {
    el.innerHTML = `${topo}<div class="aviso erro"><b>Não deu certo:</b> ${esc(rel.erro || 'o relatório ficou sem texto.')}</div>
      <div class="linha mt"><button class="btn pri" type="button" id="de-novo">Tentar de novo</button><button class="btn perigo" type="button" id="apagar" style="margin-left:auto">Apagar</button></div>`;
    el.querySelector('#de-novo').addEventListener('click', () => gerarDeNovo(id, '', recarregar));
    el.querySelector('#apagar').addEventListener('click', () => apagar(rel));
    return;
  }

  const { dados, texto } = rel.conteudo;
  const opcoes = { tarefas: true, avaliacao: true, mentores: true, ...(rel.opcoes || {}) };
  const n = dados.numeros;
  const lider = new Map(dados.lideres.map((l) => [l.codigo, l]));
  const quem = (lista, cods) => {
    if (!cods || !cods.length) return '<p class="peq apagado">Item incluído à mão: confira o número.</p>';
    const nomes = CODIGOS[lista] === 'sessoes'
      ? cods.map((c) => { const [l, s] = c.split('.S'); return `${nomeCurto((lider.get(l) || {}).nome)} (sessão ${s})`; })
      : cods.map((c) => nomeCurto((lider.get(c) || {}).nome));
    return `<p class="peq apagado re-quem"><b>Nos registros de:</b> ${esc(juntar(nomes))} <span>(só aqui, não vai para o PDF)</span></p>`;
  };
  const linha = (lista, item = {}) => `<div class="re-linha" data-cods="${esc(JSON.stringify(item[CODIGOS[lista]] || []))}">
      <div class="re-campos">${CAMPOS[lista].filter(([, , t]) => t !== 'area').map(([k, rot, t]) => `<div class="campo${t === 'num' ? ' re-num' : ''}"><label>${rot}</label>
        ${t === 'num' ? `<input type="number" min="0" step="1" data-k="${k}" value="${item[k] ?? ''}">` : `<input type="text" maxlength="160" data-k="${k}" value="${esc(item[k] || '')}">`}</div>`).join('')}
        <button class="btn peq" type="button" data-tirar title="Tirar este item">✕</button></div>
      ${CAMPOS[lista].filter(([, , t]) => t === 'area').map(([k, rot]) => `<div class="campo mt"><label>${rot}</label><textarea data-k="${k}" style="min-height:64px">${esc(item[k] || '')}</textarea></div>`).join('')}
      ${CODIGOS[lista] ? quem(lista, item[CODIGOS[lista]]) : ''}</div>`;
  const lista = (chave, itens, incluir) => `<div data-lista="${chave}">${(itens || []).map((x) => linha(chave, x)).join('')}</div>
    <button class="btn peq mt" type="button" data-incluir="${chave}">+ ${incluir}</button>`;
  const area = (k, rot, alt = 80, dica = '') => `<div class="campo mt"><label for="r-${k}">${rot}</label><textarea id="r-${k}" data-r="${k}" style="min-height:${alt}px">${esc(texto[k] || '')}</textarea>${dica ? `<small>${dica}</small>` : ''}</div>`;
  const resp = (k, rot) => `<div class="campo"><label>${rot}</label><textarea data-resp="${k}" style="min-height:70px">${esc((texto.respostas || {})[k] || '')}</textarea></div>`;
  const passos = (k, rot) => `<div class="campo"><label>${rot}</label><textarea data-r="${k}" data-lista-linhas style="min-height:150px">${esc((texto[k] || []).join('\n'))}</textarea></div>`;
  const av = dados.avisos || {};

  el.innerHTML = `${topo}
    ${rel.status === 'erro' ? `<div class="aviso erro"><b>O último pedido à IA não deu certo:</b> ${esc(rel.erro || '')} O texto abaixo continua o anterior.</div>` : ''}
    <div class="aviso"><b>Revise com calma: este relatório vai para a diretoria e o RH de ${esc(empresa)}.</b> A IA cruzou os registros de ${n.lideres} ${n.lideres === 1 ? 'mentorado' : 'mentorados'} sem as informações delicadas e sem os nomes.
      Confira se nada identifica alguém nem ficou de assunto pessoal. Tudo salva sozinho. Os números do programa são da plataforma (dados de ${dataBR(dados.gerado_em)}); o número de cada dificuldade, tema e medo vem da leitura da IA e você pode corrigir.</div>
    ${av.sem_registro && av.sem_registro.length ? `<div class="aviso mt"><b>Ficaram de fora sessões que já passaram e não estavam marcadas como realizadas:</b> ${esc(av.sem_registro.map((x) => `${nomeCurto(x.nome)} (sessão ${juntar(x.numeros.map(String))})`).join('; '))}.
      Se aconteceram, marque "Realizada" e use "Escrever tudo de novo" aqui embaixo.</div>` : ''}
    ${av.fora && av.fora.length ? `<p class="peq apagado mt">Não entram: ${esc(av.fora.map((x) => `${nomeCurto(x.nome)} (${x.motivo})`).join('; '))}.</p>` : ''}
    <div class="cartao mt"><div class="campo"><label for="r-titulo">Título do relatório</label><input type="text" id="r-titulo" maxlength="160" value="${esc(rel.titulo || texto.titulo || '')}"></div>
      <div class="grade g4 mt">
        <div class="cartao numero"><b>${n.lideres}</b><span>${n.lideres === 1 ? 'líder' : 'líderes'} em mentoria</span></div>
        <div class="cartao numero"><b>${n.realizadas}<small style="font-size:14px;color:var(--apagado)"> de ${n.previstas}</small></b><span>sessões realizadas</span></div>
        <div class="cartao numero"><b>${num(n.horas)} h</b><span>de mentoria</span></div>
        <div class="cartao numero"><b>${n.nota_media == null ? '—' : num(n.nota_media)}</b><span>nota média das sessões${n.notas ? ` (${n.notas})` : ''}</span></div></div>
      <h4 class="mt2">O que entra no PDF</h4>
      <label class="check mt"><input type="checkbox" data-opcao="tarefas"${opcoes.tarefas ? ' checked' : ''}${n.tarefas ? '' : ' disabled'}><span>Tarefas entre sessões <span class="peq apagado">(${n.tarefas ? `${n.tarefas_feitas} de ${n.tarefas} cumpridas` : 'nenhuma tarefa registrada'})</span></span></label>
      <label class="check mt"><input type="checkbox" data-opcao="avaliacao"${opcoes.avaliacao ? ' checked' : ''}${n.notas ? '' : ' disabled'}><span>Avaliação das sessões pelos líderes <span class="peq apagado">(${n.notas ? `média ${num(n.nota_media)} de 10 em ${n.notas} ${n.notas === 1 ? 'avaliação' : 'avaliações'}` : 'nenhuma nota ainda'})</span></span></label>
      <label class="check mt"><input type="checkbox" data-opcao="mentores"${opcoes.mentores ? ' checked' : ''}${dados.mentores.length ? '' : ' disabled'}><span>Quem são os mentores <span class="peq apagado">(com foto e o número de sessões de cada um)</span></span></label>
    </div>
    <div class="cartao"><h3>Em uma página</h3>
      ${area('abertura', 'Abertura', 90)}
      <p class="peq apagado mt">As respostas às quatro perguntas (uma frase cada). No PDF, embaixo de cada uma, a plataforma põe os três itens com mais líderes ou sessões.</p>
      <div class="grade mt" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;align-items:start">
        ${resp('dificuldades', 'Maiores dificuldades')}${resp('pontos', 'Pontos mais trabalhados')}${resp('medos', 'Maiores medos')}${resp('proximos', 'Próximos passos')}</div>
      ${area('avancos', 'O que já mudou', 70, 'Vazio = o bloco não aparece no PDF.')}</div>
    <div class="cartao"><h3>O programa em números</h3>
      <p class="peq apagado">Os líderes por área ou função (vazio = não aparece). Um grupo com uma pessoa só pode identificá-la.</p>
      ${lista('grupos', texto.grupos, 'Incluir área')}
      ${area('numeros_leitura', 'Leitura dos números', 70)}</div>
    <div class="cartao"><h3>As maiores dificuldades relatadas pelo time</h3>
      ${area('dificuldades_leitura', 'Frase de abertura', 60)}
      <p class="peq apagado mt">Uma por item, da mais comum para a menos comum (o PDF põe na ordem do número). O número é em quantos líderes ela aparece, de ${n.lideres}.</p>
      ${lista('dificuldades', texto.dificuldades, 'Incluir dificuldade')}</div>
    <div class="cartao"><h3>Os pontos de atenção mais trabalhados</h3>
      ${area('temas_leitura', 'Frase de abertura', 60)}
      <p class="peq apagado mt">O tema principal de cada sessão (as sessões de abertura e diagnóstico não entram). O número é de sessões.</p>
      ${lista('temas', texto.temas, 'Incluir tema')}
      <h4 class="mt2">Como esses pontos já evoluíram</h4>
      ${lista('evolucoes', texto.evolucoes, 'Incluir ponto')}</div>
    <div class="cartao"><h3>Os maiores medos relatados</h3>
      ${area('medos_leitura', 'Frase de abertura', 60)}
      ${lista('medos', texto.medos, 'Incluir medo')}
      ${area('medos_conclusao', 'Frase final', 60)}</div>
    <div class="cartao"><h3>Próximos passos</h3>
      ${area('proximos_abertura', 'Abertura', 60)}
      <p class="peq apagado mt">Um passo por linha.</p>
      <div class="grade g3 mt" style="gap:12px;align-items:start">${passos('proximos_mentoria', 'Na mentoria')}${passos('proximos_diretoria', 'Para a diretoria')}${passos('proximos_rh', 'Para o RH')}</div></div>
    <div class="cartao"><h3>Pedir ajuste à IA</h3>
      <p class="peq apagado">Diga o que mudar (ex.: "deixe os próximos passos para a diretoria mais curtos", "junte as dificuldades 3 e 4"). O resto continua igual, inclusive o que você já editou.</p>
      <textarea class="mt" id="r-ajuste" maxlength="4000" placeholder="O que você quer mudar?"></textarea>
      <div class="linha mt"><button class="btn pri" type="button" id="r-ajustar">Pedir ajuste</button>
        <button class="btn" type="button" id="r-refazer">Escrever tudo de novo (com os dados de hoje)</button>
        <button class="btn perigo" type="button" id="apagar" style="margin-left:auto">Apagar relatório</button></div></div>`;

  const lerLista = (chave) => [...el.querySelectorAll(`[data-lista="${chave}"] .re-linha`)].map((d) => {
    const x = {};
    d.querySelectorAll('[data-k]').forEach((c) => { x[c.dataset.k] = c.type === 'number' ? Math.max(0, Math.round(Number(c.value) || 0)) : c.value.trim(); });
    if (CODIGOS[chave]) { try { x[CODIGOS[chave]] = JSON.parse(d.dataset.cods || '[]'); } catch (_) { x[CODIGOS[chave]] = []; } }
    return x;
  }).filter((x) => x.titulo || x.texto);
  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const novo = { ...texto, respostas: { ...(texto.respostas || {}) } };
      el.querySelectorAll('[data-r]').forEach((c) => { novo[c.dataset.r] = c.hasAttribute('data-lista-linhas') ? linhas(c.value) : c.value.trim(); });
      el.querySelectorAll('[data-resp]').forEach((c) => { novo.respostas[c.dataset.resp] = c.value.trim(); });
      Object.keys(CAMPOS).forEach((k) => { novo[k] = lerLista(k); });
      el.querySelectorAll('[data-opcao]').forEach((c) => { opcoes[c.dataset.opcao] = c.checked; });
      const titulo = el.querySelector('#r-titulo').value.trim() || rel.titulo;
      const { error: e } = await sb.from('relatorios_empresa').update({ titulo, opcoes, conteudo: { ...rel.conteudo, texto: novo } }).eq('id', id);
      if (e) throw e;
      Object.assign(texto, novo); rel.titulo = titulo;
    },
  });
  el.addEventListener('input', (ev) => { if (ev.target.closest('textarea, input:not([type=checkbox])') && ev.target.id !== 'r-ajuste') salvador.mudou(); });
  el.querySelectorAll('[data-opcao]').forEach((c) => c.addEventListener('change', salvador.mudou));
  el.addEventListener('click', (ev) => {
    const tirar = ev.target.closest('[data-tirar]');
    if (tirar) { tirar.closest('.re-linha').remove(); salvador.mudou(); return; }
    const inc = ev.target.closest('[data-incluir]');
    if (inc) {
      const caixa = el.querySelector(`[data-lista="${inc.dataset.incluir}"]`);
      caixa.insertAdjacentHTML('beforeend', linha(inc.dataset.incluir, {}));
      caixa.lastElementChild.querySelector('input, textarea').focus();
    }
  });
  el.querySelector('#r-ajustar').addEventListener('click', async () => {
    const aj = el.querySelector('#r-ajuste').value.trim();
    if (!aj) { avisar('Escreva o que você quer mudar.', true); return; }
    await salvador.agora();
    gerarDeNovo(id, aj, recarregar);
  });
  el.querySelector('#r-refazer').addEventListener('click', () => {
    if (!window.confirm('Escrever tudo de novo com os registros de hoje? O texto atual, com as suas edições, será substituído.')) return;
    gerarDeNovo(id, '', recarregar);
  });
  el.querySelector('#apagar').addEventListener('click', () => apagar(rel));
  return { sair: () => { salvador.agora(); salvador.parar(); } };
}

async function gerarDeNovo(id, ajustes, recarregar) {
  const { error } = await sb.from('relatorios_empresa').update({ status: 'gerando', erro: null }).eq('id', id);
  if (error) { avisar(explicarErro(error), true); return; }
  const r = await api('/api/relatorio-empresa-gerar', { id, ajustes });
  if (!r.ok && r.mensagem) avisar(r.mensagem, true);
  recarregar();
}

async function apagar(rel) {
  if (!window.confirm('Apagar este relatório? As sessões e as anotações continuam na plataforma.')) return;
  const { error } = await sb.from('relatorios_empresa').delete().eq('id', rel.id);
  if (error) { avisar(explicarErro(error), true); return; }
  avisar('Relatório apagado.');
  location.hash = '#/relatorio-empresa';
}
