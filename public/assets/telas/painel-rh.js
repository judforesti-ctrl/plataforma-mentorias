// Painel do RH da empresa cliente (script 49, pedido da Juliana em 28/10/2026 a partir do escopo da Cláudia): "#/rh[/<empresa>]".
// Só números da empresa dele: trilhas (alunos, presença em cada encontro, conclusão, nota média das avaliações, certificados) e
// mentorias individuais (sessões feitas, faltas, tarefas cumpridas). Nada de conteúdo: percepções, anotações, envios e respostas
// das avaliações nunca chegam aqui (tudo vem da função painel_rh(), que só devolve números; notas só com 3 avaliações ou mais).
// A administração abre a mesma tela em prévia ("Ver como o RH vê", em Painel → Empresas → Acesso do RH).
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';
import { tema, temMarca } from '../marca.js';
import { aplicarMarca } from './area-aluno.js';
import { FREQUENCIA_MINIMA } from '../presenca-regras.js';

const ST_TURMA = { planejada: ['Planejada', 'neutro'], em_andamento: ['Em andamento', ''], concluida: ['Concluída', 'neutro'], pausada: ['Pausada', 'alerta'] };
const ST_PROG = { planejado: ['Planejado', 'neutro'], em_andamento: ['Em andamento', ''], concluido: ['Concluído', 'neutro'], pausado: ['Pausado', 'alerta'] };
const ST_MENTORADO = { ativo: 'Ativo', pausado: 'Pausado', concluido: 'Concluído', desligado: 'Desligado', suspenso: 'Suspenso' };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const num1 = (x) => (x == null ? '—' : String(Math.round(Number(x) * 10) / 10).replace('.', ','));
const realizado = (m) => m.data_hora && Date.parse(m.data_hora) + (Number(m.duracao_min) || 180) * 60000 <= Date.now();
const nps = (a) => (a && a.nps_n ? Math.round(((a.promotores - a.detratores) / a.nps_n) * 100) : null);

// situação de cada aluno: concluiu (turma concluída e frequência mínima), abaixo da frequência ou em andamento
function situacaoAluno(a, t) {
  const total = a.presencas + a.faltas;
  const f = pct(a.presencas, total);
  if (!a.ativo) return { f, texto: 'Saiu da turma', cls: 'neutro' };
  if (f == null) return { f, texto: t.status === 'concluida' ? 'Sem chamada registrada' : 'Ainda sem chamada', cls: 'neutro' };
  if (t.status === 'concluida') return f >= FREQUENCIA_MINIMA ? { f, texto: 'Concluiu', cls: '' } : { f, texto: `Abaixo de ${FREQUENCIA_MINIMA}%`, cls: 'alerta' };
  return { f, texto: f >= FREQUENCIA_MINIMA ? 'Em dia' : `Abaixo de ${FREQUENCIA_MINIMA}%`, cls: f >= FREQUENCIA_MINIMA ? 'neutro' : 'alerta' };
}

export async function render(ctx, el, [empresaId]) {
  const previa = ctx.ehAdmin;
  if (previa && !empresaId) { el.innerHTML = '<div class="vazio">Escolha a empresa em Painel → Empresas e programas → "Acesso do RH" → "Ver como o RH vê".</div>'; return; }
  const { data: d, error } = await sb.rpc('painel_rh', { p_empresa: empresaId || null });
  if (error) {
    el.innerHTML = `<div class="vazio">${/painel_rh|PGRST202|schema cache/.test(`${error.code} ${error.message}`) ? (previa ? 'Falta rodar o script 49-presenca-rh-envios-lembretes.sql no Supabase.' : 'O painel da empresa ainda está sendo preparado pela Mentorei. Volte daqui a pouco.') : esc(explicarErro(error))}</div>`;
    return;
  }
  if (!d || !d.empresa) {
    el.innerHTML = `<div class="cartao" style="max-width:620px;margin:30px auto"><h2>Olá, ${esc(ctx.perfil.nome.split(' ')[0])}!</h2>
      <p class="mt apagado">Seu acesso ainda não está ligado a nenhuma empresa. Fale com a Mentorei: <a href="mailto:contato@mentorei.com.br">contato@mentorei.com.br</a>.</p></div>`;
    return;
  }

  // cores do cliente: na página toda e no menu para o RH; só nesta tela na prévia da administração
  const marca = d.empresa.marca || {};
  if (!previa) aplicarMarca(marca);
  else if (temMarca(marca)) { el.classList.add('tr-marca'); el.setAttribute('style', tema(marca).estilo); }
  const logoUrl = marca.logo && marca.logo.caminho ? sb.storage.from('fotos').getPublicUrl(marca.logo.caminho).data.publicUrl : '';

  const trilhas = d.trilhas || [];
  const programas = d.programas || [];
  // números gerais
  const alunosAtivos = trilhas.flatMap((t) => t.alunos.filter((a) => a.ativo).map((a) => ({ ...a, turma: t })));
  const comChamada = alunosAtivos.filter((a) => a.presencas + a.faltas);
  const freqMedia = comChamada.length ? Math.round(comChamada.reduce((n, a) => n + pct(a.presencas, a.presencas + a.faltas), 0) / comChamada.length) : null;
  const deConcluidas = comChamada.filter((a) => a.turma.status === 'concluida');
  const concluiram = deConcluidas.filter((a) => pct(a.presencas, a.presencas + a.faltas) >= FREQUENCIA_MINIMA).length;
  const comNota = trilhas.filter((t) => t.avaliacao && t.avaliacao.geral != null);
  const nAval = trilhas.reduce((n, t) => n + ((t.avaliacao && t.avaliacao.n) || 0), 0);
  const notaGeral = comNota.length ? comNota.reduce((n, t) => n + t.avaliacao.geral * t.avaliacao.n, 0) / comNota.reduce((n, t) => n + t.avaliacao.n, 0) : null;
  const npsJunto = comNota.reduce((o, t) => ({ nps_n: o.nps_n + (t.avaliacao.nps_n || 0), promotores: o.promotores + (t.avaliacao.promotores || 0), detratores: o.detratores + (t.avaliacao.detratores || 0) }), { nps_n: 0, promotores: 0, detratores: 0 });
  const certificados = trilhas.reduce((n, t) => n + (t.certificados || 0), 0);
  const mentorados = programas.flatMap((p) => p.mentorados.map((m) => ({ ...m, programa: p })));
  const feitas = mentorados.reduce((n, m) => n + m.feitas, 0), faltas = mentorados.reduce((n, m) => n + m.faltas, 0);
  const tarefas = mentorados.reduce((n, m) => n + m.tarefas, 0), tarefasFeitas = mentorados.reduce((n, m) => n + m.tarefas_feitas, 0);

  const numero = (valor, texto, extra = '') => `<div class="cartao numero"><b>${valor}${extra ? `<small style="font-size:14px;color:var(--apagado)"> ${extra}</small>` : ''}</b><span>${texto}</span></div>`;

  el.innerHTML = `
    ${previa ? `<div class="aviso"><b>Prévia:</b> é assim que o RH da ${esc(d.empresa.nome)} vê o painel. <a href="#/painel">← Voltar para o Painel</a></div>` : ''}
    <div class="cab"><div><p class="apagado">Painel da empresa</p><h1>${esc(d.empresa.nome)}</h1>
      <p class="sub">Acompanhamento dos programas contratados com a Mentorei: presença, conclusão e avaliação. Só números, nada do conteúdo das conversas.</p></div>
      <div class="acoes">${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo de ${esc(d.empresa.nome)}" style="max-height:48px;max-width:160px">` : ''}
        ${(d.empresas || []).length > 1 ? `<select id="rh-empresa" aria-label="Empresa" style="width:auto">${d.empresas.map((e) => `<option value="${e.id}"${e.id === d.empresa.id ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>` : ''}
        <button class="btn" type="button" id="rh-excel">Baixar em Excel</button></div></div>

    ${trilhas.length ? `<h2>Trilhas em grupo</h2>
    <div class="grade g4 mt">
      ${numero(trilhas.filter((t) => t.status === 'em_andamento').length, 'trilhas em andamento', `de ${trilhas.length}`)}
      ${numero(alunosAtivos.length, 'alunos inscritos', `${alunosAtivos.filter((a) => a.entrou).length} já acessaram`)}
      ${numero(freqMedia == null ? '—' : `${freqMedia}%`, 'frequência média nos encontros')}
      ${numero(deConcluidas.length ? `${pct(concluiram, deConcluidas.length)}%` : '—', `concluíram (presença de ${FREQUENCIA_MINIMA}% ou mais)`, deConcluidas.length ? `${concluiram} de ${deConcluidas.length}` : '')}
    </div>
    <div class="grade g4 mt">
      ${numero(notaGeral == null ? '—' : num1(notaGeral), 'nota média dos encontros (0 a 10)', nAval ? `${nAval} avaliações` : '')}
      ${numero(nps(npsJunto) == null ? '—' : nps(npsJunto), 'NPS: recomendariam a Mentorei (−100 a +100)')}
      ${numero(certificados, 'certificados emitidos')}
      ${numero(trilhas.reduce((n, t) => n + t.modulos.filter(realizado).length, 0), 'encontros realizados', `de ${trilhas.reduce((n, t) => n + t.modulos.length, 0)}`)}
    </div>
    ${trilhas.map((t) => trilhaHtml(t)).join('')}` : ''}

    ${programas.length ? `<h2 class="mt2">Mentorias individuais</h2>
    <div class="grade g4 mt">
      ${numero(mentorados.filter((m) => m.status === 'ativo').length, 'mentorados ativos', `de ${mentorados.length}`)}
      ${numero(feitas, 'sessões realizadas')}
      ${numero(feitas + faltas ? `${pct(feitas, feitas + faltas)}%` : '—', 'presença nas sessões', `${faltas} falta${faltas === 1 ? '' : 's'}`)}
      ${numero(tarefas ? `${pct(tarefasFeitas, tarefas)}%` : '—', 'tarefas cumpridas', tarefas ? `${tarefasFeitas} de ${tarefas}` : '')}
    </div>
    ${programas.map((p) => programaHtml(p)).join('')}` : ''}

    ${!trilhas.length && !programas.length ? '<div class="vazio">Ainda não há trilhas nem mentorias cadastradas para esta empresa.</div>' : ''}
    <p class="peq apagado mt2">Presença: encontros com a chamada registrada. Conclusão: presença de ${FREQUENCIA_MINIMA}% ou mais nos encontros da trilha concluída.
      As avaliações dos encontros são anônimas: as notas aparecem quando há pelo menos 3 respostas. Dúvidas: <a href="mailto:contato@mentorei.com.br">contato@mentorei.com.br</a>.</p>`;

  el.querySelector('#rh-empresa')?.addEventListener('change', (ev) => ctx.irPara(`#/rh/${ev.target.value}`));
  el.querySelector('#rh-excel').addEventListener('click', () => baixarExcel(d).catch((e) => avisar(explicarErro(e), true)));
}

function trilhaHtml(t) {
  const [st, cls] = ST_TURMA[t.status] || ['', 'neutro'];
  const ativos = t.alunos.filter((a) => a.ativo);
  const a = t.avaliacao || { n: 0 };
  const realizados = t.modulos.filter(realizado).length;
  return `<div class="cartao mt">
    <div class="linha"><h3 style="flex:1">${esc(t.nome)}</h3><span class="selo ${cls}">${st}</span></div>
    <p class="peq apagado">${t.inicio ? `${dataBR(t.inicio)}${t.fim ? ` a ${dataBR(t.fim)}` : ''} · ` : ''}${ativos.length} aluno${ativos.length === 1 ? '' : 's'} · ${realizados} de ${t.modulos.length} encontros realizados
      · ${a.geral != null ? `nota média <b>${num1(a.geral)}</b> de 10 (${a.n} avaliações)${nps(a) != null ? ` · NPS ${nps(a)}` : ''}` : a.n ? `${a.n} avaliação${a.n > 1 ? 'ões' : ''} (a nota aparece a partir de 3)` : 'sem avaliações ainda'}
      ${t.certificados ? ` · ${t.certificados} certificado${t.certificados > 1 ? 's' : ''} emitido${t.certificados > 1 ? 's' : ''}` : ''}</p>
    ${t.alunos.length ? `<h4 class="mt2">Alunos</h4><div class="tabela mt"><table><tr><th>Aluno</th><th>Acessou a plataforma</th><th>Presença</th><th>Situação</th></tr>
      ${t.alunos.map((x) => { const s = situacaoAluno(x, t); return `<tr${x.ativo ? '' : ' class="apagado"'}><td><b>${esc(x.nome)}</b>${x.cargo ? `<br><span class="peq apagado">${esc(x.cargo)}</span>` : ''}</td>
        <td>${x.entrou ? 'Sim' : '<span class="apagado">Ainda não</span>'}</td>
        <td>${x.presencas + x.faltas ? `${x.presencas} de ${x.presencas + x.faltas} (${s.f}%)` : '—'}</td>
        <td><span class="selo ${s.cls}">${s.texto}</span></td></tr>`; }).join('')}</table></div>`
      : '<p class="peq apagado mt">A lista de alunos ainda não foi cadastrada.</p>'}
    ${t.modulos.length ? `<h4 class="mt2">Encontros</h4><div class="tabela mt"><table><tr><th>Módulo</th><th>Data</th><th>Presentes</th><th>Avaliações</th><th>Nota</th></tr>
      ${t.modulos.map((m) => `<tr><td><b>${m.numero}</b> · ${esc(m.titulo)}</td><td class="peq">${m.data_hora ? dataBR(m.data_hora) : 'a definir'}</td>
        <td>${m.chamada ? `${m.presentes} de ${ativos.length}` : m.presentes_informados != null ? `${m.presentes_informados}` : realizado(m) ? '<span class="apagado">—</span>' : ''}</td>
        <td>${realizado(m) || m.avaliacoes ? m.avaliacoes : ''}</td><td>${m.nota != null ? num1(m.nota) : ''}</td></tr>`).join('')}</table></div>` : ''}
  </div>`;
}

function programaHtml(p) {
  const [st, cls] = ST_PROG[p.status] || ['', 'neutro'];
  return `<div class="cartao mt">
    <div class="linha"><h3 style="flex:1">${esc(p.nome)}</h3><span class="selo ${cls}">${st}</span></div>
    <p class="peq apagado">${p.inicio ? `${dataBR(p.inicio)}${p.fim ? ` a ${dataBR(p.fim)}` : ''} · ` : ''}${p.sessoes_por_mentorado} sessões por pessoa</p>
    ${p.mentorados.length ? `<div class="tabela mt"><table><tr><th>Mentorado</th><th>Sessões feitas</th><th>Faltas</th><th>Presença</th><th>Tarefas cumpridas</th></tr>
      ${p.mentorados.map((m) => `<tr${m.status === 'ativo' ? '' : ' class="apagado"'}><td><b>${esc(m.nome)}</b>${m.status !== 'ativo' ? `<br><span class="peq">${esc(ST_MENTORADO[m.status] || m.status)}</span>` : ''}</td>
        <td>${m.feitas} de ${p.sessoes_por_mentorado}</td><td>${m.faltas}</td><td>${m.feitas + m.faltas ? `${pct(m.feitas, m.feitas + m.faltas)}%` : '—'}</td>
        <td>${m.tarefas ? `${m.tarefas_feitas} de ${m.tarefas}` : '—'}</td></tr>`).join('')}</table></div>` : '<p class="peq apagado mt">Nenhum mentorado cadastrado.</p>'}
  </div>`;
}

async function baixarExcel(d) {
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const livro = XLSX.utils.book_new();
  const aba = (nome, linhas) => { if (linhas.length > 1) XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), nome); };
  aba('Alunos das trilhas', [['Trilha', 'Aluno', 'Cargo', 'Acessou a plataforma', 'Encontros com chamada', 'Presenças', 'Faltas', 'Frequência (%)', 'Situação'],
    ...(d.trilhas || []).flatMap((t) => t.alunos.map((a) => { const s = situacaoAluno(a, t); return [t.nome, a.nome, a.cargo || '', a.entrou ? 'Sim' : 'Não', a.presencas + a.faltas, a.presencas, a.faltas, s.f ?? '', s.texto]; }))]);
  aba('Encontros', [['Trilha', 'Módulo', 'Título', 'Data', 'Presentes', 'Avaliações', 'Nota média (0 a 10)'],
    ...(d.trilhas || []).flatMap((t) => t.modulos.map((m) => [t.nome, m.numero, m.titulo, m.data_hora ? dataBR(m.data_hora) : '', m.chamada ? m.presentes : (m.presentes_informados ?? ''), m.avaliacoes, m.nota ?? '']))]);
  aba('Mentorias individuais', [['Programa', 'Mentorado', 'Situação', 'Sessões previstas', 'Sessões feitas', 'Faltas', 'Presença (%)', 'Tarefas', 'Tarefas cumpridas'],
    ...(d.programas || []).flatMap((p) => p.mentorados.map((m) => [p.nome, m.nome, ST_MENTORADO[m.status] || m.status, p.sessoes_por_mentorado, m.feitas, m.faltas, pct(m.feitas, m.feitas + m.faltas) ?? '', m.tarefas, m.tarefas_feitas]))]);
  if (!livro.SheetNames.length) { avisar('Ainda não há números para baixar.', true); return; }
  XLSX.writeFile(livro, `Mentorei - ${d.empresa.nome} - acompanhamento.xlsx`);
}
