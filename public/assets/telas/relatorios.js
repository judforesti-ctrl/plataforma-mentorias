// Relatórios por empresa e programa: presença, faltas, tarefas, avaliação e evolução de cada mentorado.
// Exporta para Excel: versão para o RH (só indicadores) e versão completa de uso interno.
// Nenhuma versão leva anotações do mentor nem informações delicadas.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';

const SIT = { agendada: 'Agendada', realizada: 'Realizada', falta_avisada: 'Falta avisada', falta_sem_aviso: 'Falta sem aviso', remarcada: 'Remarcada', cancelada: 'Cancelada' };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const fmtPct = (x) => (x == null ? '—' : `${x}%`);
const fmtNum = (x) => (x == null ? '—' : String(x).replace('.', ','));

function indicadores(m) {
  const hoje = hojeISO();
  const sess = (m.sessoes || []).slice().sort((a, b) => a.numero - b.numero);
  const feitas = sess.filter((s) => s.situacao === 'realizada').length;
  const faltasAv = sess.filter((s) => s.situacao === 'falta_avisada').length;
  const faltasSem = sess.filter((s) => s.situacao === 'falta_sem_aviso').length;
  const tarefas = sess.filter((s) => s.tarefa && s.concluida_em);
  const entregues = tarefas.filter((s) => s.tarefa_feita_em).length;
  const atrasadas = tarefas.filter((s) => !s.tarefa_feita_em && s.tarefa_prazo && s.tarefa_prazo < hoje).length;
  const notas = sess.map((s) => s.avaliacao && s.avaliacao.nota).filter(Boolean);
  const pontos = (Array.isArray(m.pontos_desenvolver) ? m.pontos_desenvolver : []).map((x) => (typeof x === 'string' ? x : x.ponto)).filter(Boolean);
  const evolucao = pontos.map((pt) => {
    const serie = sess.map((s) => s.interno && s.interno.notas_evolucao && s.interno.notas_evolucao[pt]).filter(Boolean);
    return serie.length ? { pt, inicio: serie[0], fim: serie[serie.length - 1] } : null;
  }).filter(Boolean);
  const realizadas = sess.filter((s) => s.situacao === 'realizada' && s.data_hora);
  return {
    sess, previstas: sess.length, feitas, faltasAv, faltasSem, presenca: pct(feitas, feitas + faltasAv + faltasSem),
    tarefas: tarefas.length, entregues, atrasadas, entregaPct: pct(entregues, tarefas.length), avaliacao: media(notas),
    evolucao, ultima: realizadas.length ? realizadas[realizadas.length - 1].data_hora : null,
    mentores: (m.vinculos || []).sort((a, b) => a.ordem - b.ordem).map((v) => v.mentor && v.mentor.nome).filter(Boolean).join(' e '),
  };
}

export async function render(ctx, el) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração vê os relatórios.</div>'; return; }
  const [emp, prog, ment] = await Promise.all([
    sb.from('empresas').select('id, nome').order('nome'),
    sb.from('programas').select('id, nome, empresa_id, sessoes_por_mentorado, inicio, fim_previsto').order('criado_em', { ascending: false }),
    sb.from('mentorados').select(`id, nome, cargo, status, programa_id, pontos_desenvolver,
      vinculos:mentor_mentorado(ordem, mentor:perfis(nome)),
      sessoes(numero, data_hora, tema, situacao, concluida_em, tarefa, tarefa_prazo, tarefa_feita_em, resumo_mentorado,
        mentor:perfis!sessoes_mentor_id_fkey(nome), interno:sessoes_interno(notas_evolucao), avaliacao:avaliacoes_sessao(nota))`).order('nome'),
  ]);
  for (const r of [emp, prog, ment]) if (r.error) throw r.error;
  const empresas = emp.data || [], programas = prog.data || [], mentorados = ment.data || [];
  if (!empresas.length) { el.innerHTML = '<div class="cab"><div><h1>Relatórios</h1></div></div><div class="vazio">Nenhuma empresa cadastrada ainda.</div>'; return; }

  el.innerHTML = `
    <div class="cab"><div><h1>Relatórios</h1><p class="sub">Presença, tarefas, avaliação e evolução de cada mentorado, por empresa e programa.</p></div></div>
    <div class="linha" style="margin-bottom:14px">
      <select id="f-empresa" style="width:auto">${empresas.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select>
      <select id="f-programa" style="width:auto"></select>
      <select id="f-status" style="width:auto"><option value="">Todos os mentorados</option><option value="ativo">Só ativos</option></select>
    </div>
    <div id="kpis"></div>
    <div class="cartao mt"><h3>Mentorados</h3><div class="tabela mt" id="tabela"></div></div>
    <div class="cartao mt"><h3>Baixar em Excel</h3>
      <div class="grade g2 mt">
        <div><h4>Para o RH da empresa</h4>
          <p class="peq apagado mt">Só números: sessões, presença, faltas, tarefas entregues e avaliação. Sem nenhum conteúdo das conversas.</p>
          <label class="check mt"><input type="checkbox" id="com-evolucao"><span>Incluir as notas de evolução nos pontos a desenvolver</span></label>
          <button class="btn pri mt" id="xls-rh">Baixar Excel para o RH</button></div>
        <div><h4>Completo, para uso interno da Mentorei</h4>
          <p class="peq apagado mt">Tudo do arquivo do RH, mais uma aba com cada sessão: tema, situação, tarefa e o resumo que o mentorado recebeu. Nunca leva as anotações do mentor nem as informações delicadas.</p>
          <button class="btn mt" id="xls-interno">Baixar Excel completo</button></div>
      </div></div>`;

  const fe = el.querySelector('#f-empresa'), fp = el.querySelector('#f-programa'), fs = el.querySelector('#f-status');
  const opcoesPrograma = () => {
    const ps = programas.filter((p) => p.empresa_id === fe.value);
    fp.innerHTML = `<option value="">${ps.length ? 'Todos os programas da empresa' : 'Nenhum programa'}</option>${ps.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}`;
  };
  const selecionados = () => {
    const ids = new Set(programas.filter((p) => p.empresa_id === fe.value && (!fp.value || p.id === fp.value)).map((p) => p.id));
    return mentorados.filter((m) => ids.has(m.programa_id) && (!fs.value || m.status === fs.value)).map((m) => ({ m, k: indicadores(m) }));
  };
  const totais = (linhas) => {
    const soma = (f) => linhas.reduce((a, { k }) => a + k[f], 0);
    const notas = linhas.flatMap(({ k }) => k.sess.map((s) => s.avaliacao && s.avaliacao.nota).filter(Boolean));
    const faltas = soma('faltasAv') + soma('faltasSem');
    return { n: linhas.length, previstas: soma('previstas'), feitas: soma('feitas'), faltas, presenca: pct(soma('feitas'), soma('feitas') + faltas),
      tarefas: soma('tarefas'), entregues: soma('entregues'), entregaPct: pct(soma('entregues'), soma('tarefas')), avaliacao: media(notas) };
  };

  const desenhar = () => {
    const linhas = selecionados(); const t = totais(linhas);
    el.querySelector('#kpis').innerHTML = `<div class="grade g4">
      <div class="cartao numero"><b>${t.feitas}<small style="font-size:14px;color:var(--apagado)"> de ${t.previstas}</small></b><span>sessões feitas · ${t.n} mentorados</span></div>
      <div class="cartao numero"><b>${fmtPct(t.presenca)}</b><span>presença (${t.faltas} faltas)</span></div>
      <div class="cartao numero"><b>${fmtPct(t.entregaPct)}</b><span>tarefas entregues (${t.entregues} de ${t.tarefas})</span></div>
      <div class="cartao numero"><b>${fmtNum(t.avaliacao)}${t.avaliacao ? '<small style="font-size:14px;color:var(--apagado)"> / 5</small>' : ''}</b><span>avaliação média das sessões</span></div></div>`;
    el.querySelector('#tabela').innerHTML = linhas.length ? `<table>
      <tr><th>Mentorado</th><th>Mentor</th><th>Sessões</th><th>Presença</th><th>Faltas</th><th>Tarefas entregues</th><th>Avaliação</th><th>Evolução</th></tr>
      ${linhas.map(({ m, k }) => `<tr class="clicavel" data-ir="#/mentorado/${m.id}">
        <td><b>${esc(m.nome)}</b>${m.status !== 'ativo' ? ` <span class="selo neutro">${esc(m.status)}</span>` : ''}<br><span class="peq apagado">${esc(m.cargo || '')}</span></td>
        <td class="peq">${esc(k.mentores || '—')}</td>
        <td>${k.feitas} de ${k.previstas}</td>
        <td>${fmtPct(k.presenca)}</td>
        <td class="peq">${k.faltasAv + k.faltasSem ? `${k.faltasAv} avisada(s), ${k.faltasSem} sem aviso` : '—'}</td>
        <td>${k.tarefas ? `${k.entregues} de ${k.tarefas}` : '—'}${k.atrasadas ? ` <span class="selo alerta">${k.atrasadas} atrasada(s)</span>` : ''}</td>
        <td>${fmtNum(k.avaliacao)}</td>
        <td class="peq">${k.evolucao.length ? k.evolucao.map((e) => `${esc(e.pt)}: ${e.inicio} → ${e.fim}`).join('<br>') : '—'}</td></tr>`).join('')}</table>`
      : '<p class="apagado">Nenhum mentorado neste filtro.</p>';
  };

  const baixar = async (interno) => {
    const linhas = selecionados();
    if (!linhas.length) { avisar('Nenhum mentorado neste filtro.', true); return; }
    let XLSX;
    try { XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'); } catch (e) { avisar(explicarErro(e), true); return; }
    const empresa = empresas.find((e) => e.id === fe.value);
    const programa = programas.find((p) => p.id === fp.value);
    const comEvol = interno || el.querySelector('#com-evolucao').checked;
    const t = totais(linhas);
    const wb = XLSX.utils.book_new();
    const folha = (nome, linhasTab, larguras) => {
      const ws = XLSX.utils.aoa_to_sheet(linhasTab);
      ws['!cols'] = larguras.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    folha('Resumo', [
      ['Relatório de mentoria · Mentorei'], [],
      ['Empresa', empresa ? empresa.nome : ''], ['Programa', programa ? programa.nome : 'Todos os programas'], ['Gerado em', dataBR(new Date().toISOString())], [],
      ['Mentorados', t.n], ['Sessões previstas', t.previstas], ['Sessões realizadas', t.feitas], ['Faltas', t.faltas],
      ['Presença', t.presenca == null ? '' : t.presenca / 100], ['Tarefas combinadas', t.tarefas], ['Tarefas entregues', t.entregues],
      ['Entrega de tarefas', t.entregaPct == null ? '' : t.entregaPct / 100], ['Avaliação média das sessões (1 a 5)', t.avaliacao ?? ''],
    ], [36, 40]);
    const wsR = wb.Sheets.Resumo;
    ['B11', 'B14'].forEach((c) => { if (wsR[c] && typeof wsR[c].v === 'number') wsR[c].z = '0%'; });

    const cab = ['Mentorado', 'Cargo', 'Programa', 'Mentor(es)', 'Situação', 'Sessões previstas', 'Sessões realizadas', 'Faltas avisadas', 'Faltas sem aviso',
      'Presença', 'Tarefas combinadas', 'Tarefas entregues', 'Tarefas atrasadas', 'Avaliação média (1 a 5)', 'Última sessão'];
    if (comEvol) cab.push('Evolução nos pontos a desenvolver (1 a 5: início → atual)');
    const nomeProg = (id) => (programas.find((p) => p.id === id) || {}).nome || '';
    folha('Mentorados', [cab, ...linhas.map(({ m, k }) => {
      const l = [m.nome, m.cargo || '', nomeProg(m.programa_id), k.mentores, m.status, k.previstas, k.feitas, k.faltasAv, k.faltasSem,
        k.presenca == null ? '' : k.presenca / 100, k.tarefas, k.entregues, k.atrasadas, k.avaliacao ?? '', k.ultima ? dataBR(k.ultima) : ''];
      if (comEvol) l.push(k.evolucao.map((e) => `${e.pt}: ${e.inicio} → ${e.fim}`).join('; '));
      return l;
    })], [28, 24, 24, 24, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12, 12, 50]);
    const wsM = wb.Sheets.Mentorados;
    linhas.forEach((_, i) => { const c = wsM[`J${i + 2}`]; if (c && typeof c.v === 'number') c.z = '0%'; });

    if (interno) {
      const linhasSess = [['Mentorado', 'Nº', 'Data', 'Mentor', 'Tema', 'Situação', 'Tarefa', 'Prazo', 'Tarefa entregue em', 'Nota do mentorado', 'Resumo enviado ao mentorado']];
      linhas.forEach(({ m, k }) => k.sess.forEach((s) => linhasSess.push([m.nome, s.numero, s.data_hora ? dataBR(s.data_hora) : '', s.mentor ? s.mentor.nome : '',
        s.tema || '', SIT[s.situacao] || s.situacao, s.tarefa || '', s.tarefa_prazo ? dataBR(`${s.tarefa_prazo}T12:00:00-03:00`) : '',
        s.tarefa_feita_em ? dataBR(s.tarefa_feita_em) : '', s.avaliacao ? s.avaliacao.nota : '', s.concluida_em ? (s.resumo_mentorado || '') : ''])));
      folha('Sessões', linhasSess, [28, 5, 11, 20, 30, 16, 40, 11, 12, 10, 80]);
    }
    const limpo = (x) => String(x || '').replace(/[\\/:*?"<>|]/g, '').trim();
    XLSX.writeFile(wb, `Mentorei - ${limpo(empresa && empresa.nome)}${programa ? ` - ${limpo(programa.nome)}` : ''}${interno ? ' - completo' : ''} - ${hojeISO()}.xlsx`);
  };

  opcoesPrograma(); desenhar();
  fe.addEventListener('input', () => { opcoesPrograma(); desenhar(); });
  fp.addEventListener('input', desenhar); fs.addEventListener('input', desenhar);
  el.querySelector('#xls-rh').addEventListener('click', () => baixar(false));
  el.querySelector('#xls-interno').addEventListener('click', () => baixar(true));
  el.addEventListener('click', (ev) => { const tr = ev.target.closest('[data-ir]'); if (tr) location.hash = tr.dataset.ir; });
}
