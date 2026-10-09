// Relatório das turmas para a empresa cliente (PDF com a cara da Mentorei).
// "#/relatorio-turmas": relatórios já feitos e "Novo relatório" (empresa → turmas → a IA escreve).
// "#/relatorio-turmas/<id>": revisar e editar o texto (salva sozinho), pedir ajuste à IA e abrir o PDF (relatorio.html).
// A IA reescreve as percepções dos mentores para o cliente; o texto original só aparece aqui, para conferir, e nunca no PDF.
import { sb, esc, avisar, explicarErro, dataBR, autoSalvar } from '../base.js';
import { api, faltaScript } from './agenda-dados.js';

const FALTA = '<div class="aviso erro">Para fazer relatórios das turmas, falta rodar o script <b>25-viagens-relatorio-checklist.sql</b> no Supabase.</div>';
const STATUS = { gerando: ['A IA está escrevendo…', 'neutro'], rascunho: ['Pronto para revisar', 'alerta'], erro: ['Deu erro', 'erro'] };
const PASSOU_MS = 2 * 3600 * 1000;
const linhas = (t) => String(t || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

export async function render(ctx, el, params) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração faz os relatórios das turmas.</div>'; return; }
  if (params[0]) return editor(ctx, el, params[0]);
  return lista(ctx, el);
}

// ---------- lista e novo relatório ----------
async function lista(ctx, el) {
  const [rel, emp, tur] = await Promise.all([
    sb.from('relatorios_turmas').select('id, titulo, status, criado_em, atualizado_em, empresa:empresas(nome), turmas').order('criado_em', { ascending: false }),
    sb.from('empresas').select('id, nome').order('nome'),
    sb.from('turmas').select('id, nome, empresa_id, status, inicio, modulos(id, data_hora, percepcoes_em)').order('nome'),
  ]);
  const falta = rel.error && faltaScript(rel.error);
  if (rel.error && !falta) throw rel.error;
  const turmas = tur.data || [];
  const comTurma = (emp.data || []).filter((e) => turmas.some((t) => t.empresa_id === e.id));
  el.innerHTML = `
    <div class="cab"><div><p class="peq apagado"><a href="#/relatorios">← Relatórios</a></p><h1>Relatório das turmas</h1>
      <p class="sub">Um PDF com a cara da Mentorei para a empresa cliente, com todas as turmas dela. A IA escreve a partir das percepções dos mentores e você revisa antes de baixar.</p></div></div>
    ${falta ? FALTA : ''}
    <div class="cartao"><h3>Novo relatório</h3>
      ${comTurma.length ? `<div class="grade g2 mt" style="gap:12px;align-items:start">
        <div class="campo"><label for="n-empresa">Empresa</label><select id="n-empresa"><option value="">Escolha…</option>${comTurma.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select></div>
        <div class="campo"><span class="rotulo">Turmas que entram</span><div id="n-turmas" class="ag-pessoas"><span class="peq apagado">Escolha a empresa.</span></div></div></div>
        <div class="campo mt"><label for="n-obs">Algum pedido para a IA? (opcional)</label><textarea id="n-obs" maxlength="3000" placeholder="Ex.: destacar a evolução na comunicação entre as áreas; relatório para a reunião de meio do programa."></textarea></div>
        <p class="peq apagado mt">Entram os módulos que já aconteceram. As percepções dos mentores são reescritas para o cliente: o texto original não vai para o PDF.</p>
        <div class="linha mt"><button class="btn pri" type="button" id="n-gerar"${falta ? ' disabled' : ''}>Gerar o relatório com a IA</button></div>`
        : '<p class="apagado mt">Nenhuma turma cadastrada ainda.</p>'}
    </div>
    <h2 class="mt2">Relatórios feitos</h2>
    <div class="lista mt">${(rel.data || []).map((r) => `<a class="item" href="#/relatorio-turmas/${r.id}" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><div class="nome">${esc(r.titulo || 'Relatório das turmas')}</div><div class="info">${esc(r.empresa ? r.empresa.nome : '')} · ${(r.turmas || []).length} turma(s) · feito em ${dataBR(r.criado_em)}</div></div>
      <span class="selo ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></a>`).join('') || '<p class="apagado">Nenhum relatório ainda.</p>'}</div>`;
  if (!comTurma.length) return;

  const selEmp = el.querySelector('#n-empresa'), caixa = el.querySelector('#n-turmas');
  selEmp.addEventListener('input', () => {
    const ts = turmas.filter((t) => t.empresa_id === selEmp.value);
    caixa.innerHTML = ts.length ? ts.map((t) => {
      const feitos = (t.modulos || []).filter((m) => m.data_hora && Date.parse(m.data_hora) < Date.now() - PASSOU_MS).length;
      const comPerc = (t.modulos || []).filter((m) => m.percepcoes_em).length;
      return `<label class="check"><input type="checkbox" value="${t.id}"${feitos ? ' checked' : ' disabled'}><span>${esc(t.nome)}<br><span class="peq apagado">${feitos ? `${feitos} módulo(s) realizado(s) · ${comPerc} com percepções` : 'nenhum módulo realizado ainda'}</span></span></label>`;
    }).join('') : '<span class="peq apagado">Esta empresa não tem turmas.</span>';
  });
  el.querySelector('#n-gerar').addEventListener('click', async (ev) => {
    const ids = [...caixa.querySelectorAll('input:checked')].map((c) => c.value);
    if (!selEmp.value) { avisar('Escolha a empresa.', true); return; }
    if (!ids.length) { avisar('Marque pelo menos uma turma com módulo realizado.', true); return; }
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = 'Começando…';
    const nome = selEmp.options[selEmp.selectedIndex].textContent;
    const { data, error } = await sb.from('relatorios_turmas').insert({ empresa_id: selEmp.value, turmas: ids, titulo: `Relatório das turmas · ${nome}`,
      observacoes: el.querySelector('#n-obs').value.trim() || null, status: 'gerando' }).select('id').single();
    if (error) { avisar(explicarErro(error), true); b.disabled = false; b.textContent = 'Gerar o relatório com a IA'; return; }
    const r = await api('/api/relatorio-turmas-gerar', { id: data.id });
    if (!r.ok && r.mensagem) avisar(r.mensagem, true);
    location.hash = `#/relatorio-turmas/${data.id}`;
  });
}

// ---------- revisar e editar ----------
async function editor(ctx, el, id) {
  const { data: rel, error } = await sb.from('relatorios_turmas').select('*, empresa:empresas(nome)').eq('id', id).maybeSingle();
  if (error) { el.innerHTML = faltaScript(error) ? FALTA : `<div class="aviso erro">${esc(explicarErro(error))}</div>`; return; }
  if (!rel) { el.innerHTML = '<div class="vazio">Relatório não encontrado.</div>'; return; }
  const recarregar = () => ctx.irPara(`#/relatorio-turmas/${id}`);
  const topo = `<div class="cab"><div><p class="peq apagado"><a href="#/relatorio-turmas">← Relatórios das turmas</a></p><p class="apagado">${esc(rel.empresa ? rel.empresa.nome : '')}</p>
    <h1>${esc(rel.titulo || 'Relatório das turmas')}</h1></div>
    <div class="acoes"><span class="salvo" id="indicador"></span>${rel.status !== 'gerando' && rel.conteudo && rel.conteudo.texto ? `<a class="btn pri" href="/relatorio.html?id=${rel.id}" target="_blank" rel="noopener">Ver e baixar o PDF</a>` : ''}</div></div>`;

  if (rel.status === 'gerando') {
    el.innerHTML = `${topo}<div class="cartao"><p><b>A IA está escrevendo o relatório.</b> Leva de 1 a 3 minutos. Esta tela se atualiza sozinha quando ficar pronto.</p><p class="carregando mt">Escrevendo…</p></div>`;
    const inicio = Date.now();
    const timer = setInterval(async () => {
      if (!el.isConnected) { clearInterval(timer); return; }
      const { data } = await sb.from('relatorios_turmas').select('status').eq('id', id).maybeSingle();
      if (data && data.status !== 'gerando') { clearInterval(timer); recarregar(); }
      else if (Date.now() - inicio > 6 * 60000) { clearInterval(timer); el.querySelector('.carregando').textContent = 'Está demorando mais que o normal. Volte daqui a pouco nesta tela.'; }
    }, 4000);
    return { sair: () => clearInterval(timer) };
  }
  if (!rel.conteudo || !rel.conteudo.texto) {
    el.innerHTML = `${topo}<div class="aviso erro"><b>Não deu certo:</b> ${esc(rel.erro || 'o relatório ficou sem texto.')}</div>
      <div class="linha mt"><button class="btn pri" type="button" id="de-novo">Tentar de novo</button><button class="btn perigo" type="button" id="apagar" style="margin-left:auto">Apagar</button></div>`;
    el.querySelector('#de-novo').addEventListener('click', () => gerarDeNovo(id, '', recarregar));
    el.querySelector('#apagar').addEventListener('click', () => apagar(id));
    return;
  }

  const { dados, texto } = rel.conteudo;
  // percepções originais dos mentores (só aqui, para conferir; não vão para o PDF)
  const ids = dados.turmas.flatMap((t) => t.modulos.map((m) => m.id));
  const { data: orig } = ids.length ? await sb.from('modulos').select('id, percepcoes').in('id', ids) : { data: [] };
  const original = new Map((orig || []).map((m) => [m.id, m.percepcoes || '']));
  const n = dados.numeros;
  const quando = (iso) => (iso ? dataBR(iso) : 'sem data');

  el.innerHTML = `${topo}
    ${rel.status === 'erro' ? `<div class="aviso erro"><b>O último pedido à IA não deu certo:</b> ${esc(rel.erro || '')} O texto abaixo continua o anterior.</div>` : ''}
    <div class="aviso"><b>Revise com calma: este texto vai para a empresa.</b> A IA reescreveu as percepções dos mentores para o cliente. Confira se nada interno ou delicado ficou e ajuste o que quiser: tudo salva sozinho.
      Os números são calculados pela plataforma.</div>
    <div class="cartao"><div class="campo"><label for="r-titulo">Título do relatório</label><input type="text" id="r-titulo" maxlength="160" value="${esc(rel.titulo || texto.titulo || '')}"></div>
      <div class="grade g4 mt">
        <div class="cartao numero"><b>${n.turmas}</b><span>${n.turmas === 1 ? 'turma' : 'turmas'}</span></div>
        <div class="cartao numero"><b>${n.realizados}<small style="font-size:14px;color:var(--apagado)"> de ${n.modulos}</small></b><span>módulos realizados</span></div>
        <div class="cartao numero"><b>${n.media_presentes == null ? '—' : String(n.media_presentes).replace('.', ',')}</b><span>participantes por aula (média)</span></div>
        <div class="cartao numero"><b>${n.presenca_pct == null ? '—' : `${n.presenca_pct}%`}</b><span>presença média</span></div></div>
      ${n.media_presentes == null ? '<p class="peq apagado mt">Sem "participantes presentes" preenchido nos módulos: esses números ficam fora do PDF.</p>' : ''}</div>
    <div class="cartao"><h3>Abertura</h3><textarea class="mt" data-r="apresentacao" style="min-height:140px">${esc(texto.apresentacao || '')}</textarea></div>
    ${dados.turmas.map((t) => {
      const x = (texto.turmas || {})[t.id] || {};
      return `<div class="cartao"><h3>${esc(t.nome)}</h3>
        <p class="peq apagado">${t.numeros.realizados} de ${t.numeros.modulos} módulos realizados${t.mentores.length ? ` · ${esc(t.mentores.join(', '))}` : ''}</p>
        <div class="campo mt"><label>Resumo da turma</label><textarea data-t="${t.id}" data-c="resumo" style="min-height:110px">${esc(x.resumo || '')}</textarea></div>
        <div class="grade g2 mt" style="gap:12px">
          <div class="campo"><label>Destaques (um por linha)</label><textarea data-t="${t.id}" data-c="destaques" style="min-height:110px">${esc((x.destaques || []).join('\n'))}</textarea></div>
          <div class="campo"><label>Pontos de atenção e próximos passos (um por linha)</label><textarea data-t="${t.id}" data-c="atencao" style="min-height:110px">${esc((x.atencao || []).join('\n'))}</textarea></div></div>
        <h4 class="mt2">Como foi cada módulo</h4>
        ${t.modulos.filter((m) => m.realizado).map((m) => `<div class="rt-modulo mt">
          <p class="peq"><b>Módulo ${m.numero} · ${esc(m.titulo)}</b> · ${quando(m.data)}${m.presentes != null ? ` · ${m.presentes} presentes` : ''}</p>
          <textarea data-t="${t.id}" data-m="${m.id}" style="min-height:90px">${esc((x.modulos || {})[m.id] || '')}</textarea>
          <details class="mt"><summary class="peq">O que o mentor escreveu (interno, não vai para o PDF)</summary>
            <p class="peq mt" style="white-space:pre-wrap">${esc(original.get(m.id) || 'Sem percepção registrada.')}</p></details></div>`).join('')}
        ${t.modulos.some((m) => !m.realizado) ? `<p class="peq apagado mt">Próximos módulos (entram no PDF só como lista): ${esc(t.modulos.filter((m) => !m.realizado).map((m) => `${m.numero}. ${m.titulo}`).join('; '))}</p>` : ''}
      </div>`;
    }).join('')}
    <div class="cartao"><h3>Recomendações para a empresa (uma por linha)</h3><textarea class="mt" data-r="recomendacoes" style="min-height:120px">${esc((texto.recomendacoes || []).join('\n'))}</textarea></div>
    <div class="cartao"><h3>Encerramento</h3><textarea class="mt" data-r="encerramento" style="min-height:90px">${esc(texto.encerramento || '')}</textarea></div>
    <div class="cartao"><h3>Pedir ajuste à IA</h3>
      <p class="peq apagado">Diga o que mudar (ex.: "deixe a abertura mais curta", "fale mais da evolução na turma A"). O resto continua igual, inclusive o que você já editou.</p>
      <textarea class="mt" id="r-ajuste" maxlength="4000" placeholder="O que você quer mudar?"></textarea>
      <div class="linha mt"><button class="btn pri" type="button" id="r-ajustar">Pedir ajuste</button>
        <button class="btn" type="button" id="r-refazer">Escrever tudo de novo (com os dados de hoje)</button>
        <button class="btn perigo" type="button" id="apagar" style="margin-left:auto">Apagar relatório</button></div></div>`;

  const salvador = autoSalvar({
    indicador: el.querySelector('#indicador'),
    salvar: async () => {
      const novo = { ...texto, turmas: { ...(texto.turmas || {}) } };
      el.querySelectorAll('[data-r]').forEach((c) => { novo[c.dataset.r] = c.dataset.r === 'recomendacoes' ? linhas(c.value) : c.value.trim(); });
      el.querySelectorAll('[data-t]').forEach((c) => {
        const t = { ...(novo.turmas[c.dataset.t] || {}) };
        t.modulos = { ...(t.modulos || {}) };
        if (c.dataset.m) t.modulos[c.dataset.m] = c.value.trim();
        else t[c.dataset.c] = c.dataset.c === 'resumo' ? c.value.trim() : linhas(c.value);
        novo.turmas[c.dataset.t] = t;
      });
      const titulo = el.querySelector('#r-titulo').value.trim() || rel.titulo;
      const { error: e } = await sb.from('relatorios_turmas').update({ titulo, conteudo: { ...rel.conteudo, texto: novo } }).eq('id', id);
      if (e) throw e;
      Object.assign(texto, novo); rel.titulo = titulo;
    },
  });
  el.querySelectorAll('textarea[data-r], textarea[data-t], #r-titulo').forEach((c) => c.addEventListener('input', salvador.mudou));
  el.querySelector('#r-ajustar').addEventListener('click', async () => {
    const aj = el.querySelector('#r-ajuste').value.trim();
    if (!aj) { avisar('Escreva o que você quer mudar.', true); return; }
    await salvador.agora();
    gerarDeNovo(id, aj, recarregar);
  });
  el.querySelector('#r-refazer').addEventListener('click', async () => {
    if (!window.confirm('Escrever tudo de novo? O texto atual, com as suas edições, será substituído.')) return;
    gerarDeNovo(id, '', recarregar);
  });
  el.querySelector('#apagar').addEventListener('click', () => apagar(id));
  return { sair: () => { salvador.agora(); salvador.parar(); } };
}

async function gerarDeNovo(id, ajustes, recarregar) {
  const { error } = await sb.from('relatorios_turmas').update({ status: 'gerando', erro: null }).eq('id', id);
  if (error) { avisar(explicarErro(error), true); return; }
  const r = await api('/api/relatorio-turmas-gerar', { id, ajustes });
  if (!r.ok && r.mensagem) avisar(r.mensagem, true);
  recarregar();
}

async function apagar(id) {
  if (!window.confirm('Apagar este relatório? Os módulos e as percepções dos mentores continuam na plataforma.')) return;
  const { error } = await sb.from('relatorios_turmas').delete().eq('id', id);
  if (error) { avisar(explicarErro(error), true); return; }
  avisar('Relatório apagado.');
  location.hash = '#/relatorio-turmas';
}
