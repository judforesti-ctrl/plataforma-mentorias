// Relatórios › Ranking de horas dos mentores ("#/horas-mentores", só administração; 17/11/2026, pedido da Juliana: "quero esse
// ranking dentro da plataforma, na parte de relatórios, e poder escolher o filtro do período").
// Soma as horas de cada mentor em sessões individuais, módulos online e módulos presenciais, separando o que já foi feito do
// que ainda está agendado. As contas ficam em horas-regras.js (testáveis no Node); aqui só a tela, os filtros e o Excel.
import { sb, esc, dataBR, horaBR, hojeISO, avatar, avisar, explicarErro } from '../base.js';
import { PERIODOS, O_QUE, NOME_TIPO, intervalo, inicioISO, fimISO, calcularHoras, fmtHoras } from '../horas-regras.js';
import { juntarNomes } from '../agenda-regras.js';

const CHAVE = 'mentorei.horasMentores';
const PADRAO = { periodo: '2m', de: '', ate: '', oQue: 'tudo', comAgendado: true, passadas: true };
const est = (() => { try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch (_) { return { ...PADRAO }; } })();
const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(est)); } catch (_) { /* sem armazenamento */ } };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const ESTILO = `<style id="hm-estilo">
  .hm-filtros { display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: end; }
  .hm-filtros .campo { min-width: 170px; } .hm-filtros select { width: auto; max-width: 100%; }
  .hm-filtros input[type=date] { width: auto; }
  .hm-caixas { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 12px; }
  .hm-periodo { margin-top: 12px; font-size: 13.5px; color: var(--apagado); }
  .hm-periodo b { color: var(--texto); }
  .hm-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 12px; margin-top: 16px; }
  .hm-kpi { background: var(--papel); border: 1px solid var(--linha); border-top: 4px solid var(--bege-escuro); border-radius: 14px; padding: 12px 14px; display: grid; gap: 2px; min-width: 0; }
  .hm-kpi b { font-family: var(--f-titulo); font-size: 30px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .hm-kpi .l { font-size: 13px; font-weight: 600; } .hm-kpi .s { font-size: 12px; color: var(--apagado); }
  .hm-kpi.escuro { background: var(--petroleo); color: #fff; border-color: var(--petroleo); border-top-color: var(--bege); }
  .hm-kpi.escuro b { color: var(--bege); } .hm-kpi.escuro .s { color: #9FB0B6; }
  .hm-tab td, .hm-tab th { vertical-align: middle; }
  .hm-tab td.num, .hm-tab th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .hm-tab td.num b { font-size: 15px; } .hm-tab td.num small { display: block; font-size: 12px; color: var(--apagado); }
  .hm-pos { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-family: var(--f-titulo); font-weight: 800; font-size: 13px; background: var(--faixa); border: 1px solid var(--linha); color: var(--apagado); }
  .hm-pos.top { background: var(--petroleo); border-color: var(--petroleo); color: var(--bege); }
  .hm-quem { display: flex; align-items: center; gap: 10px; min-width: 170px; }
  .hm-quem .nome { font-weight: 700; } .hm-quem .info { font-size: 12px; color: var(--apagado); }
  .hm-total { min-width: 170px; }
  .hm-total .n { display: flex; justify-content: flex-end; align-items: baseline; gap: 6px; font-family: var(--f-titulo); font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .hm-parte { font-size: 12px; color: var(--apagado); text-align: right; margin-top: 4px; white-space: nowrap; }
  .hm-barra { height: 8px; border-radius: 99px; background: var(--faixa); border: 1px solid var(--linha); overflow: hidden; display: flex; margin-top: 6px; }
  .hm-barra i { display: block; height: 100%; background: var(--bege-escuro); }
  .hm-barra i.ag { background: repeating-linear-gradient(45deg, #C8AE7C 0 4px, #E3D3B2 4px 8px); }
  .hm-leg { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--apagado); margin-top: 8px; }
  .hm-leg i { display: inline-block; width: 18px; height: 8px; border-radius: 99px; margin-right: 6px; vertical-align: 1px; background: var(--bege-escuro); }
  .hm-leg i.ag { background: repeating-linear-gradient(45deg, #C8AE7C 0 4px, #E3D3B2 4px 8px); }
  .hm-seta { color: var(--apagado); font-size: 12px; white-space: nowrap; }
  tr.hm-det > td { background: var(--faixa) !important; padding: 6px 12px 14px; }
  .hm-itens { display: grid; gap: 6px; }
  .hm-item { display: grid; grid-template-columns: 160px minmax(0, 1fr) auto auto; gap: 12px; align-items: center; background: var(--papel); border: 1px solid var(--linha); border-radius: 10px; padding: 8px 12px; text-decoration: none; color: inherit; font-size: 13.5px; }
  .hm-item:hover { border-color: var(--bege-escuro); }
  .hm-item .q { font-variant-numeric: tabular-nums; } .hm-item .q small { display: block; color: var(--apagado); font-size: 12px; }
  .hm-item .o small { display: block; color: var(--apagado); font-size: 12px; }
  .hm-item .h { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
  @media (max-width: 700px) { .hm-item { grid-template-columns: minmax(0, 1fr) auto; } .hm-item .q { grid-column: 1 / -1; } }
  .hm-aviso h3 { display: flex; align-items: center; gap: 8px; }
  .hm-aviso ul { margin: 10px 0 0; padding-left: 18px; display: grid; gap: 4px; font-size: 13.5px; }
  .hm-aviso li a { font-weight: 600; }
  .hm-como { font-size: 13px; color: var(--apagado); margin-top: 18px; display: grid; gap: 4px; }
</style>`;

// lê todas as linhas, de 1000 em 1000 (o banco devolve no máximo 1000 por vez)
async function todas(consulta) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta().range(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function carregar({ de, ate }) {
  const ini = inicioISO(de), fim = fimISO(ate);
  const [sessoes, modulos, pes] = await Promise.all([
    todas(() => sb.from('sessoes').select(`id, numero, data_hora, situacao, duracao_min, mentor_id, outros_mentores,
      mentorado:mentorados(id, nome, programa:programas(nome, duracao_min, empresa:empresas(nome)))`)
      .gte('data_hora', ini).lte('data_hora', fim).order('data_hora').order('id')),
    todas(() => sb.from('modulos').select(`id, numero, titulo, data_hora, duracao_min, formato,
      turma:turmas(id, nome, empresa:empresas(nome)), mentores:modulo_mentores(mentor_id)`)
      .gte('data_hora', ini).lte('data_hora', fim).order('data_hora').order('id')),
    sb.from('perfis').select('id, nome, foto_url, ativo'),
  ]);
  if (pes.error) throw pes.error;
  return { sessoes, modulos, pessoas: pes.data || [] };
}

export async function render(ctx, el) {
  if (!ctx.ehAdmin) { el.innerHTML = '<div class="vazio">Só a administração vê os relatórios.</div>'; return; }
  el.innerHTML = `${ESTILO}
    <div class="cab"><div><h1>Ranking de horas dos mentores</h1>
      <p class="sub">Horas de cada mentor em sessões individuais, módulos online e módulos presenciais, no período que você escolher.</p></div>
      <div class="acoes"><a class="btn" href="#/relatorios">‹ Relatórios</a><button class="btn pri" type="button" id="hm-excel">Baixar em Excel</button></div></div>
    <div class="cartao">
      <div class="hm-filtros">
        <div class="campo"><label for="hm-periodo">Período</label>
          <select id="hm-periodo" data-busca="nao">${PERIODOS.map(([k, t]) => `<option value="${k}"${k === est.periodo ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="campo" id="hm-datas-de"><label for="hm-de">De</label><input type="date" id="hm-de"></div>
        <div class="campo" id="hm-datas-ate"><label for="hm-ate">Até</label><input type="date" id="hm-ate"></div>
        <div class="campo"><label for="hm-oque">O que contar</label>
          <select id="hm-oque" data-busca="nao">${O_QUE.map(([k, t]) => `<option value="${k}"${k === est.oQue ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      </div>
      <div class="hm-caixas">
        <label class="check"><input type="checkbox" id="hm-agendado"${est.comAgendado ? ' checked' : ''}><span>Contar também o que ainda está agendado no período</span></label>
        <label class="check"><input type="checkbox" id="hm-passadas"${est.passadas ? ' checked' : ''}><span>Contar como feitas as sessões individuais que já passaram e continuam como "agendada"</span></label>
      </div>
      <p class="hm-periodo" id="hm-texto-periodo"></p>
    </div>
    <div id="hm-corpo"><p class="carregando">Somando as horas…</p></div>`;

  const $ = (s) => el.querySelector(s);
  const fDe = $('#hm-de'), fAte = $('#hm-ate');
  let atual = null;      // { dados, faixa, r }
  let pedido = 0;        // só a última leitura vale (filtros mudados depressa)

  const faixaEscolhida = () => intervalo(est.periodo, hojeISO(), { de: est.de, ate: est.ate });
  const mostrarDatas = () => {
    const outro = est.periodo === 'outro';
    $('#hm-datas-de').hidden = !outro; $('#hm-datas-ate').hidden = !outro;
    if (outro) { const f = faixaEscolhida(); fDe.value = f.de; fAte.value = f.ate; }
  };

  const recalcular = () => {
    if (!atual) return;
    atual.r = calcularHoras(atual.dados, { ...atual.faixa, agora: new Date(), passadasComoFeitas: est.passadas, comAgendado: est.comAgendado, oQue: est.oQue });
    desenhar();
  };
  const textoPeriodo = () => {
    const faixa = faixaEscolhida();
    $('#hm-texto-periodo').innerHTML = `De <b>${dataBR(faixa.de)}</b> a <b>${dataBR(faixa.ate)}</b>${faixa.ate > hojeISO()
      ? ` · o que é de agora em diante aparece como <b>agendado</b>${est.comAgendado ? '' : ' (caixinha desmarcada: não entra na conta)'}` : ''}`;
  };
  const recarregar = async () => {
    const faixa = faixaEscolhida();
    textoPeriodo();
    const meu = ++pedido;
    $('#hm-corpo').innerHTML = '<p class="carregando">Somando as horas…</p>';
    try {
      const dados = await carregar(faixa);
      if (meu !== pedido) return;
      atual = { dados, faixa };
      recalcular();
    } catch (e) {
      if (meu !== pedido) return;
      console.error(e);
      $('#hm-corpo').innerHTML = `<div class="aviso erro">Não consegui ler as sessões e os módulos: ${esc(explicarErro(e))}</div>`;
    }
  };

  function desenhar() {
    const { r } = atual;
    const temAgendado = r.totais.agendado > 0;
    const maior = Math.max(1, ...r.ranking.map((x) => x.total));
    const tipos = est.oQue === 'tudo' ? ['ind', 'online', 'presencial'] : est.oQue === 'modulos' ? ['online', 'presencial'] : [est.oQue];
    const COL = { ind: 'Sessões individuais', online: 'Módulos online', presencial: 'Módulos presenciais' };
    const conta = { ind: ['sessão', 'sessões'], online: ['módulo', 'módulos'], presencial: ['módulo', 'módulos'] };
    const celula = (b, t) => {
      const min = b.feito + b.agendado, n = b.nFeito + b.nAgendado;
      if (!min) return '<td class="num"><span class="apagado">—</span></td>';
      const dica = b.agendado ? ` title="${fmtHoras(b.feito)} já feito, ${fmtHoras(b.agendado)} agendado"` : '';
      return `<td class="num"${dica}><b>${fmtHoras(min)}</b><small>${plural(n, ...conta[t])}${!b.feito ? ' agendado' : ''}</small></td>`;
    };

    const kpis = `<div class="hm-kpis">
      <div class="hm-kpi escuro"><span class="l">${temAgendado ? 'Total no período' : 'Horas no período'}</span><b>${fmtHoras(r.totais.total)}</b>
        <span class="s">${temAgendado ? `${fmtHoras(r.totais.feito)} já feitas + ${fmtHoras(r.totais.agendado)} agendadas` : 'somando todos os mentores'}</span></div>
      <div class="hm-kpi"><span class="l">Mentores com horas</span><b>${r.totais.mentores}</b><span class="s">no período e no filtro</span></div>
      ${tipos.includes('ind') ? `<div class="hm-kpi"><span class="l">Sessões individuais</span><b>${r.totais.sessoes}</b><span class="s">sessão em dupla conta uma vez</span></div>` : ''}
      ${tipos.includes('online') || tipos.includes('presencial') ? `<div class="hm-kpi"><span class="l">Módulos</span><b>${r.totais.online + r.totais.presencial}</b><span class="s">${r.totais.online} online · ${r.totais.presencial} presenciais</span></div>` : ''}
    </div>`;

    const linhas = r.ranking.map((x) => {
      const pf = Math.round((x.feito / maior) * 100), pa = Math.round((x.agendado / maior) * 100);
      return `<tr class="clicavel" data-mentor="${x.id}" aria-expanded="false">
        <td><span class="hm-pos${x.posicao <= 3 ? ' top' : ''}">${x.posicao}º</span></td>
        <td><div class="hm-quem">${avatar(x)}<div><div class="nome">${esc(x.nome)}${x.ativo ? '' : ' <span class="selo neutro">inativo</span>'}</div>
          <div class="info hm-seta">▸ ver o que entrou</div></div></div></td>
        ${tipos.map((t) => celula(x[t], t)).join('')}
        <td class="hm-total"><div class="n">${fmtHoras(x.total)}</div>
          <div class="hm-barra" aria-hidden="true"><i style="width:${pf}%"></i>${pa ? `<i class="ag" style="width:${pa}%"></i>` : ''}</div>
          ${temAgendado ? `<div class="hm-parte">${!x.feito ? 'só agendado' : x.agendado ? `${fmtHoras(x.feito)} feito · ${fmtHoras(x.agendado)} agendado` : 'tudo já feito'}</div>` : ''}</td>
      </tr>`;
    }).join('');
    const tabela = r.ranking.length ? `<div class="tabela"><table class="hm-tab">
      <thead><tr><th></th><th>Mentor</th>${tipos.map((t) => `<th class="num">${COL[t]}</th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
      ${temAgendado ? '<div class="hm-leg"><span><i></i>já feito</span><span><i class="ag"></i>agendado</span></div>' : ''}
      <p class="peq apagado mt">Clique no nome para ver cada sessão e módulo que entrou na conta.</p>`
      : '<div class="vazio">Nenhuma hora de mentor neste período com estes filtros.</div>';

    $('#hm-corpo').innerHTML = `${kpis}
      <div class="cartao mt"><h3>Ranking</h3>${tabela}</div>
      ${avisosHtml(r)}
      <div class="hm-como"><b>Como a conta é feita</b>
        <span>Sessão individual: entra a realizada${est.passadas ? ' e a que já passou e continua como "agendada"' : ''}; falta e cancelada não entram. Duração: a anotada na sessão; sem ela, a do programa.</span>
        <span>Módulo: entra a partir da hora de início, com a duração cadastrada. Módulo ou sessão com dois ou mais mentores conta as horas inteiras para cada um.</span>
        <span>Mentorados de teste ("modelo", "teste") ficam de fora. O tempo de viagem não entra.</span></div>`;
  }

  function avisosHtml(r) {
    const a = r.avisos, blocos = [];
    const quando = (iso) => `${dataBR(iso)} ${horaBR(iso)}`;
    const nomeDe = (id) => ((atual.dados.pessoas.find((p) => p.id === id) || {}).nome || '');
    if (a.semMentor.length) {
      const h = a.semMentor.reduce((t, m) => t + m.min, 0);
      blocos.push(`<div class="cartao mt hm-aviso"><h3>⚠ ${plural(a.semMentor.length, 'módulo sem mentor cadastrado', 'módulos sem mentor cadastrado')}</h3>
        <p class="peq apagado mt">Essas ${fmtHoras(h)} não entram em ninguém. Abra o módulo e marque quem deu a aula: o ranking acerta sozinho.</p>
        <ul>${a.semMentor.map((m) => `<li>${quando(m.data_hora)} · ${esc(m.cliente)}${m.turma ? ` · ${esc(m.turma)}` : ''} · ${esc(m.titulo)} (${fmtHoras(m.min)}) · <a href="${m.link}">Abrir o módulo</a></li>`).join('')}</ul></div>`);
    }
    if (a.passadasAgendadas.length) {
      blocos.push(`<div class="cartao mt hm-aviso"><h3>⚠ ${plural(a.passadasAgendadas.length, 'sessão já passou e continua como "agendada"', 'sessões já passaram e continuam como "agendada"')}</h3>
        <p class="peq apagado mt">${est.passadas ? 'Estão contadas como feitas.' : 'Estão fora da conta (a caixinha lá em cima está desmarcada).'} Para o registro ficar certo, abra cada uma e marque como realizada, falta ou cancelada.</p>
        <ul>${a.passadasAgendadas.map((s) => `<li>${quando(s.data_hora)} · ${esc(s.mentorado)}${s.numero ? `, sessão ${s.numero}` : ''} · ${esc(s.mentores.map(nomeDe).filter(Boolean).join(' e '))} · <a href="#/sessao/${s.id}">Abrir a sessão</a></li>`).join('')}</ul></div>`);
    }
    if (a.semDuracao.length) {
      blocos.push(`<div class="cartao mt hm-aviso"><h3>${plural(a.semDuracao.length, 'módulo sem duração cadastrada', 'módulos sem duração cadastrada')}</h3>
        <p class="peq apagado mt">Contei uma estimativa: presencial que começa de manhã = 8 h (dia inteiro); presencial à tarde ou à noite = 2 h; online = 3 h. Para valer o certo, ponha a duração no módulo.</p>
        <ul>${a.semDuracao.map((m) => `<li>${quando(m.data_hora)} · ${esc(m.cliente)} · ${esc(m.titulo)} · contei <b>${fmtHoras(m.min)}</b> · <a href="${m.link}">Abrir o módulo</a></li>`).join('')}</ul></div>`);
    }
    return blocos.join('');
  }

  function detalhe(x) {
    const nomes = new Map(atual.dados.pessoas.map((p) => [p.id, p.nome]));
    const junto = (it) => { const outros = (it.mentores || []).filter((id) => id !== x.id).map((id) => nomes.get(id)).filter(Boolean); return outros.length ? ` · junto com ${juntarNomes(outros)}` : ''; };
    const itens = x.itens.map((it) => {
      const sit = it.feito ? (it.semBaixa ? '<span class="selo alerta">já passou, sem baixa</span>' : '<span class="selo ok">feito</span>') : '<span class="selo">agendado</span>';
      return `<a class="hm-item" href="${it.link}">
        <span class="q">${dataBR(it.data_hora)}<small>${horaBR(it.data_hora)} · ${NOME_TIPO[it.tipo]}</small></span>
        <span class="o">${esc(it.titulo)}<small>${esc([it.cliente, it.turma].filter(Boolean).join(' · '))}${esc(junto(it))}</small></span>
        ${sit}
        <span class="h">${fmtHoras(it.min)}${it.estimada ? `<small class="apagado" style="display:block;font-weight:500;font-size:11.5px">${it.tipo === 'ind' ? 'duração do programa' : 'estimativa'}</small>` : ''}</span></a>`;
    }).join('');
    return `<tr class="hm-det" data-det="${x.id}"><td colspan="99"><div class="hm-itens">${itens}</div></td></tr>`;
  }

  // abrir e fechar o detalhe de um mentor
  el.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-mentor]');
    if (!tr || ev.target.closest('a')) return;
    const id = tr.dataset.mentor;
    const aberto = el.querySelector(`tr[data-det="${id}"]`);
    if (aberto) { aberto.remove(); tr.setAttribute('aria-expanded', 'false'); tr.querySelector('.hm-seta').textContent = '▸ ver o que entrou'; return; }
    const x = atual && atual.r.ranking.find((m) => m.id === id);
    if (!x) return;
    tr.insertAdjacentHTML('afterend', detalhe(x));
    tr.setAttribute('aria-expanded', 'true');
    tr.querySelector('.hm-seta').textContent = '▾ fechar';
  });

  $('#hm-periodo').addEventListener('change', (ev) => {
    est.periodo = ev.target.value;
    if (est.periodo === 'outro' && !est.de) { const f = intervalo('2m', hojeISO()); est.de = f.de; est.ate = f.ate; }
    guardar(); mostrarDatas(); recarregar();
  });
  const datas = () => { if (!fDe.value || !fAte.value) return; est.de = fDe.value; est.ate = fAte.value; guardar(); recarregar(); };
  fDe.addEventListener('change', datas); fAte.addEventListener('change', datas);
  $('#hm-oque').addEventListener('change', (ev) => { est.oQue = ev.target.value; guardar(); recalcular(); });
  $('#hm-agendado').addEventListener('change', (ev) => { est.comAgendado = ev.target.checked; guardar(); textoPeriodo(); recalcular(); });
  $('#hm-passadas').addEventListener('change', (ev) => { est.passadas = ev.target.checked; guardar(); recalcular(); });
  $('#hm-excel').addEventListener('click', () => baixarExcel(atual));

  mostrarDatas();
  await recarregar();
}

// Excel: aba Ranking (horas no formato [h]:mm, que soma certo no Excel), aba Detalhe (cada sessão e módulo de cada mentor) e
// aba Avisos (módulos sem mentor, sessões sem baixa, durações estimadas).
async function baixarExcel(atual) {
  if (!atual || !atual.r) { avisar('Espere terminar de somar as horas.', true); return; }
  if (!atual.r.ranking.length) { avisar('Nenhuma hora neste período para baixar.', true); return; }
  let XLSX;
  try { XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'); } catch (e) { avisar(explicarErro(e), true); return; }
  const { r, faixa } = atual;
  const hora = (min) => min / 1440;   // horas como fração do dia: o Excel mostra em [h]:mm
  const wb = XLSX.utils.book_new();
  const folha = (nome, linhas, larguras, colunasHora = [], primeiraLinha = 1) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = larguras.map((w) => ({ wch: w }));
    for (let i = primeiraLinha; i < linhas.length; i++) for (const c of colunasHora) {
      const cel = ws[XLSX.utils.encode_cell({ r: i, c })];
      if (cel && typeof cel.v === 'number') cel.z = '[h]:mm';
    }
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };
  const oQue = (O_QUE.find(([k]) => k === est.oQue) || O_QUE[0])[1];
  const cab = [
    ['Ranking de horas dos mentores · Mentorei'],
    [`Período: ${dataBR(faixa.de)} a ${dataBR(faixa.ate)}`],
    [`O que conta: ${oQue}${est.comAgendado ? '; com o que ainda está agendado' : '; só o que já foi feito'}${est.passadas ? '; sessões que já passaram e seguem "agendada" contadas como feitas' : ''}`],
    [`Gerado em ${dataBR(new Date().toISOString())}`], [],
  ];
  const tit = ['Posição', 'Mentor', 'Sessões individuais (horas)', 'Nº de sessões', 'Módulos online (horas)', 'Nº de módulos online',
    'Módulos presenciais (horas)', 'Nº de módulos presenciais', 'Já feito (horas)', 'Agendado (horas)', 'Total (horas)'];
  const linhas = r.ranking.map((x) => [x.posicao, x.nome,
    hora(x.ind.feito + x.ind.agendado), x.ind.nFeito + x.ind.nAgendado, hora(x.online.feito + x.online.agendado), x.online.nFeito + x.online.nAgendado,
    hora(x.presencial.feito + x.presencial.agendado), x.presencial.nFeito + x.presencial.nAgendado, hora(x.feito), hora(x.agendado), hora(x.total)]);
  const total = ['', 'Total', hora(r.ranking.reduce((t, x) => t + x.ind.feito + x.ind.agendado, 0)), '', hora(r.ranking.reduce((t, x) => t + x.online.feito + x.online.agendado, 0)), '',
    hora(r.ranking.reduce((t, x) => t + x.presencial.feito + x.presencial.agendado, 0)), '', hora(r.totais.feito), hora(r.totais.agendado), hora(r.totais.total)];
  folha('Ranking', [...cab, tit, ...linhas, total], [9, 26, 14, 10, 14, 10, 14, 10, 12, 12, 12], [2, 4, 6, 8, 9, 10], cab.length + 1);

  const nomes = new Map(atual.dados.pessoas.map((p) => [p.id, p.nome]));
  const det = [['Mentor', 'Data', 'Hora', 'Tipo', 'O quê', 'Cliente', 'Turma', 'Horas', 'Situação', 'Observação']];
  r.ranking.forEach((x) => x.itens.forEach((it) => det.push([x.nome, dataBR(it.data_hora), horaBR(it.data_hora), NOME_TIPO[it.tipo], it.titulo, it.cliente || '', it.turma || '',
    hora(it.min), it.feito ? (it.semBaixa ? 'Já passou, sem baixa (contada como feita)' : 'Feito') : 'Agendado',
    [it.estimada ? (it.tipo === 'ind' ? 'duração do programa' : 'duração estimada') : '', it.emDupla ? `junto com ${juntarNomes((it.mentores || []).filter((id) => id !== x.id).map((id) => nomes.get(id)).filter(Boolean))}` : ''].filter(Boolean).join('; ')])));
  folha('Detalhe', det, [22, 11, 7, 18, 46, 24, 30, 8, 30, 26], [7]);

  const a = r.avisos;
  if (a.semMentor.length || a.passadasAgendadas.length || a.semDuracao.length) {
    const av = [['Aviso', 'Data', 'Hora', 'O quê', 'Cliente', 'Horas']];
    a.semMentor.forEach((m) => av.push(['Módulo sem mentor (fora do ranking)', dataBR(m.data_hora), horaBR(m.data_hora), m.titulo, m.cliente, hora(m.min)]));
    a.passadasAgendadas.forEach((s) => av.push([`Sessão que já passou e segue "agendada"${est.passadas ? ' (contada como feita)' : ' (fora da conta)'}`, dataBR(s.data_hora), horaBR(s.data_hora), `${s.mentorado}${s.numero ? `, sessão ${s.numero}` : ''}`, '', '']));
    a.semDuracao.forEach((m) => av.push(['Módulo sem duração (estimativa)', dataBR(m.data_hora), horaBR(m.data_hora), m.titulo, m.cliente, hora(m.min)]));
    folha('Avisos', av, [48, 11, 7, 46, 24, 8], [5]);
  }
  XLSX.writeFile(wb, `Mentorei - Horas dos mentores - ${faixa.de} a ${faixa.ate}.xlsx`);
}
