// Números da agenda: meses mais cheios, clientes que mais ocupam, ocupação de cada mentor, espaço livre,
// dias de viagem, online x presencial, pré-bloqueios em aberto e clientes que mais remarcam ou cancelam.
// Horas contadas por mentor: um módulo de 4 h com 2 mentores ocupa 8 h da agenda da equipe.
import { sb, esc } from '../base.js';
import { PERIODOS, hoje, somarDias, listaDias, nomeMes, estadoPeriodo, dispDe } from '../agenda-regras.js';
import { faltaScript, amostra } from './agenda-dados.js';

const TRAB = ['individual', 'turma', 'presencial'];
const NOME_TRAB = { individual: 'Mentoria individual', turma: 'Turma online', presencial: 'Turma presencial' };
const OCUPA = ['individual', 'turma', 'presencial', 'reservado', 'pre', 'deslocamento'];
const INDISPONIVEL = ['fora', 'bloqueio', 'ferias', 'recesso', 'feriado'];
const fmtH = (h) => `${Math.round(h).toLocaleString('pt-BR')} h`;
const mesCurto = (mes) => nomeMes(Number(mes.slice(5, 7))).slice(0, 3);
const mesLongo = (mes) => `${nomeMes(Number(mes.slice(5, 7)))} de ${mes.slice(0, 4)}`;

function somarMeses(mes, k) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function escala(max) {
  if (max <= 0) return { topo: 4, passo: 1 };
  const bruto = max / 4, ordem = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((x) => x * ordem).find((x) => x >= bruto);
  return { topo: Math.ceil(max / passo) * passo, passo };
}
const k0 = (mes, h) => (h.startsWith(mes) ? h : `${mes}-01`); // o mês atual conta de hoje em diante
const legendaTrab = (tipos = TRAB, nomes = NOME_TRAB) => `<div class="ag-legenda">${tipos.map((t) => `<span>${amostra(t)}${esc(nomes[t])}</span>`).join('')}</div>`;

export async function abaNumeros(ctx, el, d) {
  const h = hoje(), mesAtual = h.slice(0, 7);
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mesAtual, i - 5));
  const de = `${meses[0]}-01`, ate = somarDias(`${somarMeses(meses[11], 1)}-01`, -1);
  const dentro = (e) => e.dia >= de && e.dia <= ate;
  const trab = d.eventos.filter((e) => TRAB.includes(e.tipo) && dentro(e));
  const hm = (e) => e.horas * Math.max(1, e.mentores.length);

  // 1. meses mais cheios
  const porMes = Object.fromEntries(meses.map((m) => [m, { individual: 0, turma: 0, presencial: 0 }]));
  trab.forEach((e) => { const k = e.dia.slice(0, 7); if (porMes[k]) porMes[k][e.tipo] += hm(e); });
  const totMes = (m) => TRAB.reduce((a, t) => a + porMes[m][t], 0);
  const maxMes = Math.max(...meses.map(totMes));
  const mesTopo = meses.find((m) => totMes(m) === maxMes && maxMes > 0);

  // viagem: dias presenciais e de deslocamento (sem contar pré-bloqueios), por mentor
  const viagem = new Map();
  d.eventos.filter((e) => (e.tipo === 'presencial' || (e.tipo === 'deslocamento' && !e.provisorio)) && dentro(e)).forEach((e) => {
    e.mentores.forEach((m) => {
      if (!viagem.has(m)) viagem.set(m, new Map());
      const dias = viagem.get(m);
      if (e.tipo === 'presencial' || !dias.has(e.dia)) dias.set(e.dia, e.tipo);
    });
  });

  // 2. clientes que mais ocupam
  const porCliente = new Map();
  trab.forEach((e) => {
    const k = e.empresa || 'Sem empresa';
    if (!porCliente.has(k)) porCliente.set(k, { nome: k, individual: 0, turma: 0, presencial: 0 });
    porCliente.get(k)[e.tipo] += hm(e);
  });
  const tot = (x) => TRAB.reduce((a, t) => a + x[t], 0);
  let clientes = [...porCliente.values()].sort((a, b) => tot(b) - tot(a));
  if (clientes.length > 8) {
    const resto = clientes.slice(7).reduce((a, x) => { TRAB.forEach((t) => { a[t] += x[t]; }); return a; }, { nome: `Outros (${clientes.length - 7})`, individual: 0, turma: 0, presencial: 0 });
    clientes = [...clientes.slice(0, 7), resto];
  }
  const maxCli = Math.max(1, ...clientes.map(tot));

  // 3. ocupação nos próximos 30 dias e 4. espaço livre nos próximos 3 meses
  const contarPeriodos = (m, dias) => {
    const disp = dispDe(m);
    let livres = 0, ocupados = 0, diasLivres = 0;
    for (const dia of dias) {
      const evs = d.idx.doDia(m.id, dia);
      const st = PERIODOS.map((p) => estadoPeriodo(evs, p, disp, dia).tipo);
      st.forEach((t) => { if (t === 'livre') livres += 1; else if (OCUPA.includes(t)) ocupados += 1; });
      if (st.some((t) => t === 'livre') && st.every((t) => t === 'livre' || t === 'fora')) diasLivres += 1;
    }
    return { livres, ocupados, disponiveis: livres + ocupados, diasLivres };
  };
  const prox30 = listaDias(h, somarDias(h, 29));
  const ocupacao = d.mentores.map((m) => ({ m, ...contarPeriodos(m, prox30) })).map((x) => ({ ...x, pct: x.disponiveis ? Math.round((x.ocupados / x.disponiveis) * 100) : null }))
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const mesesLivres = [0, 1, 2].map((k) => somarMeses(mesAtual, k));
  const espaco = mesesLivres.map((mes) => {
    const dias = listaDias(k0(mes, h), somarDias(`${somarMeses(mes, 1)}-01`, -1));
    const porMentor = d.mentores.map((m) => ({ m, ...contarPeriodos(m, dias) }));
    return { mes, porMentor, livres: porMentor.reduce((a, x) => a + x.livres, 0), diasLivres: porMentor.reduce((a, x) => a + x.diasLivres, 0) };
  });

  // 6. online x presencial
  const online = trab.filter((e) => e.tipo !== 'presencial'), pres = trab.filter((e) => e.tipo === 'presencial');
  const hOnline = online.reduce((a, e) => a + hm(e), 0), hPres = pres.reduce((a, e) => a + hm(e), 0);
  const pctOnline = hOnline + hPres ? Math.round((hOnline / (hOnline + hPres)) * 100) : null;

  // 7. pré-bloqueios
  const abertos = d.reservas.filter((r) => r.situacao === 'pre');
  const vencidos = abertos.filter((r) => r.lembrar_em <= h);
  const reservados = d.reservas.filter((r) => r.situacao === 'confirmada');
  const diasPre = [...abertos, ...reservados].reduce((a, r) => a + (r.datas || []).length * Math.max(1, (r.mentores || []).filter((x) => x.resposta !== 'recusado').length), 0);

  const maxViagem = Math.max(1, ...d.mentores.map((m) => (viagem.get(m.id) || new Map()).size));
  const { topo, passo } = escala(maxMes);
  const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);

  el.innerHTML = `
    <p class="peq apagado" style="margin-bottom:12px">Período: de ${mesLongo(meses[0])} a ${mesLongo(meses[11])}. Os meses que ainda não chegaram mostram só o que já está marcado.
      Pré-bloqueios não entram nas horas. Horas somadas por mentor (uma aula de 4 h com 2 mentores conta 8 h).</p>
    <div class="grade g4">
      <div class="cartao numero"><b>${abertos.length}</b><span>pré-bloqueios em aberto${vencidos.length ? ` · <a href="#/agenda/pre">${vencidos.length} ${vencidos.length === 1 ? 'pede' : 'pedem'} atenção</a>` : ''}</span></div>
      <div class="cartao numero"><b>${reservados.length}</b><span>reservados (cliente confirmou)</span></div>
      <div class="cartao numero"><b>${diasPre}</b><span>dias de mentor pré-bloqueados ou reservados</span></div>
      <div class="cartao numero"><b>${pctOnline == null ? '—' : `${pctOnline}%`}</b><span>das horas são online (${fmtH(hOnline)} online · ${fmtH(hPres)} presencial)</span></div>
    </div>

    <div class="cartao mt"><h3>Meses mais cheios</h3><p class="peq apagado">Horas de mentor marcadas em cada mês${mesTopo ? `. O mais cheio: <b>${mesLongo(mesTopo)}</b> (${fmtH(maxMes)})` : ''}.</p>
      ${legendaTrab()}
      ${maxMes > 0 ? `<div class="ng-col-caixa mt"><div class="ng-grade">${ticks.slice().reverse().map((t) => `<div class="ng-linha"><span>${t.toLocaleString('pt-BR')}</span></div>`).join('')}</div>
        <div class="ng-cols">${meses.map((m) => {
          const x = porMes[m]; const v = viagem.size ? [...viagem.values()].reduce((a, dias) => a + [...dias.keys()].filter((dia) => dia.startsWith(m)).length, 0) : 0;
          const dica = `${mesLongo(m)}: ${fmtH(totMes(m))}\n${TRAB.map((t) => `${NOME_TRAB[t]}: ${fmtH(x[t])}`).join('\n')}${v ? `\nDias de viagem da equipe: ${v}` : ''}`;
          return `<div class="ng-col${m === mesAtual ? ' atual' : ''}" data-dica="${esc(dica)}" tabindex="0" aria-label="${esc(dica)}">
            <div class="ng-pilha" style="height:${(totMes(m) / topo) * 100}%">${TRAB.filter((t) => x[t] > 0).map((t) => `<i class="ag-${t}" style="flex:${x[t]}"></i>`).join('')}</div>
            ${m === mesTopo ? `<b class="ng-topo" style="bottom:${(totMes(m) / topo) * 100}%">${fmtH(totMes(m))}</b>` : ''}
            <span class="ng-x">${mesCurto(m)}${m === mesAtual ? '<br>hoje' : ''}</span></div>`;
        }).join('')}</div></div>
        <details class="mt"><summary class="peq">Ver em tabela</summary><div class="tabela"><table><tr><th>Mês</th>${TRAB.map((t) => `<th>${NOME_TRAB[t]}</th>`).join('')}<th>Total</th></tr>
          ${meses.map((m) => `<tr><td>${mesLongo(m)}</td>${TRAB.map((t) => `<td>${fmtH(porMes[m][t])}</td>`).join('')}<td><b>${fmtH(totMes(m))}</b></td></tr>`).join('')}</table></div></details>`
        : '<div class="vazio mt">Nenhuma sessão ou aula com data neste período.</div>'}</div>

    <div class="grade g2 mt" style="align-items:start">
      <div class="cartao" style="margin-top:0"><h3>Clientes que mais ocupam a agenda</h3><p class="peq apagado">Horas de mentor no período, por empresa.</p>
        ${legendaTrab()}
        ${clientes.length ? `<div class="ng-barras mt">${clientes.map((c) => {
          const dica = `${c.nome}: ${fmtH(tot(c))}\n${TRAB.map((t) => `${NOME_TRAB[t]}: ${fmtH(c[t])}`).join('\n')}`;
          return `<div class="ng-barra" data-dica="${esc(dica)}" tabindex="0" aria-label="${esc(dica)}"><span class="ng-rot">${esc(c.nome)}</span>
            <span class="ng-trilho"><span class="ng-pilha-h" style="width:${(tot(c) / maxCli) * 100}%">${TRAB.filter((t) => c[t] > 0).map((t) => `<i class="ag-${t}" style="flex:${c[t]}"></i>`).join('')}</span></span>
            <span class="ng-val">${fmtH(tot(c))}</span></div>`;
        }).join('')}</div>` : '<div class="vazio mt">Sem horas marcadas no período.</div>'}</div>

      <div class="cartao" style="margin-top:0"><h3>Ocupação de cada mentor</h3><p class="peq apagado">Próximos 30 dias: períodos (manhã, tarde, noite) já ocupados entre os que a pessoa atende. Conta sessões, aulas, deslocamentos e pré-bloqueios.</p>
        <div class="ng-barras medidores mt">${ocupacao.map((x) => {
          const nivel = x.pct == null ? 'neutro' : x.pct > 85 ? 'cheio' : x.pct >= 60 ? 'atencao' : 'ok';
          const txt = x.pct == null ? 'sem dias de atendimento' : x.pct > 85 ? 'agenda cheia' : x.pct >= 60 ? 'quase cheia' : 'com espaço';
          const dica = `${x.m.nome}: ${x.pct == null ? '—' : `${x.pct}%`} (${x.ocupados} de ${x.disponiveis} períodos) · ${txt}`;
          return `<div class="ng-barra" data-dica="${esc(dica)}" tabindex="0" aria-label="${esc(dica)}"><span class="ng-rot">${esc(x.m.nome)}</span>
            <span class="ng-trilho ng-medidor ${nivel}"><span style="width:${x.pct || 0}%"></span></span>
            <span class="ng-val">${x.pct == null ? '—' : `${x.pct}%`} <span class="peq apagado">${txt}</span></span></div>`;
        }).join('') || '<div class="vazio">Nenhum mentor ativo.</div>'}</div></div>
    </div>

    <div class="cartao mt"><h3>Espaço livre nos próximos 3 meses</h3><p class="peq apagado">Dias em que a pessoa atende e está totalmente livre (sem feriados, bloqueios, deslocamentos nem pré-bloqueios). ${espaco[0] ? `O mês atual conta de hoje em diante.` : ''}</p>
      <div class="grade g3 mt">${espaco.map((x) => `<div class="cartao numero" style="margin-top:0;background:var(--bg);border:0"><b>${x.diasLivres}</b><span>dias livres de mentor em ${nomeMes(Number(x.mes.slice(5, 7)))} · ${x.livres} períodos livres</span></div>`).join('')}</div>
      <div class="tabela mt"><table><tr><th>Mentor</th>${espaco.map((x) => `<th>${mesCurto(x.mes)}</th>`).join('')}</tr>
        ${d.mentores.map((m) => `<tr><td>${esc(m.nome)}</td>${espaco.map((x) => { const y = x.porMentor.find((z) => z.m.id === m.id); return `<td>${y.diasLivres} dia${y.diasLivres === 1 ? '' : 's'} <span class="peq apagado">(${y.livres} períodos)</span></td>`; }).join('')}</tr>`).join('')}</table></div></div>

    <div class="grade g2 mt" style="align-items:start">
      <div class="cartao" style="margin-top:0"><h3>Dias de viagem</h3><p class="peq apagado">Dias de aula presencial e de deslocamento de cada mentor no período.</p>
        ${legendaTrab(['presencial', 'deslocamento'], { presencial: 'Aula presencial', deslocamento: 'Deslocamento' })}
        <div class="ng-barras mt">${d.mentores.map((m) => {
          const dias = viagem.get(m.id) || new Map();
          const p = [...dias.values()].filter((t) => t === 'presencial').length, ds = dias.size - p;
          const dica = `${m.nome}: ${dias.size} dias (${p} de aula presencial, ${ds} de deslocamento)`;
          return `<div class="ng-barra" data-dica="${esc(dica)}" tabindex="0" aria-label="${esc(dica)}"><span class="ng-rot">${esc(m.nome)}</span>
            <span class="ng-trilho"><span class="ng-pilha-h" style="width:${(dias.size / maxViagem) * 100}%">${p ? `<i class="ag-presencial" style="flex:${p}"></i>` : ''}${ds ? `<i class="ag-deslocamento" style="flex:${ds}"></i>` : ''}</span></span>
            <span class="ng-val">${dias.size} dia${dias.size === 1 ? '' : 's'}</span></div>`;
        }).join('')}</div></div>
      <div class="cartao" style="margin-top:0"><h3>Clientes que mais remarcam ou faltam</h3><div id="ng-remarca"><p class="peq apagado mt">Carregando…</p></div></div>
    </div>`;

  ligarDicas(el);
  tabelaRemarcacoes(el.querySelector('#ng-remarca'), d);
}

// Sessões remarcadas, faltas e cancelamentos por empresa (mentoria individual).
async function tabelaRemarcacoes(box, d) {
  const { data, error } = await sb.from('sessoes').select('id, remarcacoes');
  const contagem = new Map((data || []).map((s) => [s.id, s.remarcacoes || 0]));
  const porEmpresa = new Map();
  for (const s of d.sessoes) {
    const emp = (s.mentorado && s.mentorado.programa && s.mentorado.programa.empresa && s.mentorado.programa.empresa.nome) || 'Sem empresa';
    if (!porEmpresa.has(emp)) porEmpresa.set(emp, { emp, rem: 0, fa: 0, fs: 0, can: 0, total: 0 });
    const x = porEmpresa.get(emp);
    x.total += 1;
    x.rem += contagem.get(s.id) || 0;
    if (s.situacao === 'falta_avisada') x.fa += 1;
    if (s.situacao === 'falta_sem_aviso') x.fs += 1;
    if (s.situacao === 'cancelada') x.can += 1;
  }
  const linhas = [...porEmpresa.values()].map((x) => ({ ...x, soma: x.rem + x.fa + x.fs + x.can })).filter((x) => x.soma).sort((a, b) => b.soma - a.soma);
  box.innerHTML = `<p class="peq apagado">Sessões individuais de cada empresa.${error && faltaScript(error) ? ' As remarcações começam a ser contadas depois do script 14.' : ' As remarcações contam a partir de outubro de 2026.'}</p>
    ${linhas.length ? `<div class="tabela mt"><table><tr><th>Empresa</th><th>Remarcações</th><th>Faltas avisadas</th><th>Faltas sem aviso</th><th>Canceladas</th></tr>
      ${linhas.map((x) => `<tr><td><b>${esc(x.emp)}</b> <span class="peq apagado">${x.total} sessões</span></td><td>${x.rem}</td><td>${x.fa}</td><td>${x.fs}</td><td>${x.can}</td></tr>`).join('')}</table></div>`
      : '<div class="vazio mt">Nenhuma remarcação, falta ou cancelamento registrado.</div>'}`;
}

// Dica que acompanha o mouse (e aparece ao focar com o teclado).
function ligarDicas(el) {
  let dica = document.querySelector('.ng-dica');
  if (!dica) { dica = document.createElement('div'); dica.className = 'ng-dica'; dica.setAttribute('role', 'tooltip'); dica.hidden = true; document.body.appendChild(dica); }
  const mostrar = (alvo, x, y) => {
    dica.innerHTML = esc(alvo.dataset.dica).replace(/\n/g, '<br>');
    dica.hidden = false;
    const r = dica.getBoundingClientRect();
    dica.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14))}px`;
    dica.style.top = `${Math.max(8, y - r.height - 12)}px`;
  };
  el.addEventListener('mousemove', (ev) => { const a = ev.target.closest('[data-dica]'); if (a) mostrar(a, ev.clientX, ev.clientY); else dica.hidden = true; });
  el.addEventListener('mouseleave', () => { dica.hidden = true; });
  el.addEventListener('focusin', (ev) => { const a = ev.target.closest('[data-dica]'); if (a) { const r = a.getBoundingClientRect(); mostrar(a, r.left + r.width / 2, r.top); } });
  el.addEventListener('focusout', () => { dica.hidden = true; });
  window.addEventListener('hashchange', () => { dica.hidden = true; }, { once: true });
}

