// Importação da planilha de mentorias (formato atual da Mentorei):
// aba "Cronograma Geral" (mentorado, sessão, data, horário, mentor, título, condução) + uma aba por mentorado
// (nome, objetivo, forças e fraquezas nas duas visões, cargo e link da sala do Meet).
import { sb, esc, dataBR, avisar, explicarErro } from '../base.js';

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const tokens = (s) => sem(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
function distancia(a, b) { // distância de edição pequena, para erros de digitação ("Predrotti" x "Pedrotti")
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const parecido = (t, lista) => lista.some((x) => x === t || (t.length > 4 && distancia(t, x) <= 1));

// Data do Excel (número de dias) + "09h" / "9h30" → ISO com fuso de Brasília
function dataHora(serial, hora) {
  if (typeof serial !== 'number') return null;
  const base = new Date(Math.round((serial - 25569) * 86400000));
  const dia = base.toISOString().slice(0, 10);
  const m = String(hora || '').match(/(\d{1,2})\s*h?\s*(\d{2})?/i);
  const hh = m ? m[1].padStart(2, '0') : '09', mm = m && m[2] ? m[2] : '00';
  return new Date(`${dia}T${hh}:${mm}:00-03:00`).toISOString();
}

export function lerPlanilha(XLSX, wb) {
  const nomeCrono = wb.SheetNames.find((n) => sem(n).includes('cronograma'));
  if (!nomeCrono) throw new Error('Não encontrei a aba "Cronograma Geral".');
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeCrono], { header: 1, raw: true, defval: null }).slice(1)
    .filter((r) => r[0] && r[1] != null);
  // agrupa as sessões por mentorado (ignorando acentos)
  const grupos = new Map();
  for (const r of linhas) {
    const chave = sem(r[0]);
    if (!grupos.has(chave)) grupos.set(chave, { nomes: {}, sessoes: [] });
    const g = grupos.get(chave);
    g.nomes[r[0]] = (g.nomes[r[0]] || 0) + 1;
    g.sessoes.push({ numero: Number(r[1]), data_hora: dataHora(r[2], r[3]), mentor: String(r[4] || '').trim(), tema: r[5] ? String(r[5]).trim() : null, roteiro: r[6] ? String(r[6]).trim() : null });
  }
  // fichas: uma aba por mentorado
  const fichas = wb.SheetNames.filter((n) => n !== nomeCrono).map((n) => {
    const a = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const linha2 = a[1] || [];
    const meet = a.map((r) => r && r.find((c) => typeof c === 'string' && /meet\.google\.com/i.test(c))).find(Boolean) || null;
    return { aba: n, nome: String(linha2[0] || n).trim(), objetivo: linha2[1] || null, forcas_m: linha2[2] || null, fraquezas_m: linha2[3] || null,
      forcas_g: linha2[4] || null, fraquezas_g: linha2[5] || null, cargo: a[2] && a[2][0] ? String(a[2][0]).trim() : null,
      meet: meet ? (meet.startsWith('http') ? meet : `https://${meet}`) : null };
  });
  const mentorados = [...grupos.values()].map((g) => {
    const nome = Object.entries(g.nomes).sort((a, b) => b[1] - a[1])[0][0].trim();
    const tk = tokens(nome);
    let melhor = null, nota = 0;
    for (const f of fichas) {
      const ft = tokens(f.nome); if (!ft.length || !parecido(ft[0], [tk[0]])) continue;
      const pts = ft.filter((t) => parecido(t, tk)).length / ft.length;
      if (pts > nota) { nota = pts; melhor = f; }
    }
    const sessoes = g.sessoes.sort((a, b) => a.numero - b.numero);
    const mentores = []; sessoes.forEach((s) => { if (s.mentor && !mentores.includes(s.mentor)) mentores.push(s.mentor); });
    return { nome, ficha: nota >= 0.5 ? melhor : null, sessoes, mentores };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  return mentorados;
}

export async function render(ctx, el) {
  const { data: equipe } = await sb.from('perfis').select('id, nome').or('papel.eq.mentor,tambem_mentor.eq.true').eq('ativo', true).order('nome');
  const { data: empresas } = await sb.from('empresas').select('id, nome').order('nome');
  el.innerHTML = `
    <div class="cab"><div><h1>Importar planilha</h1><p class="sub">Traz para a plataforma a planilha de mentorias no formato atual: aba "Cronograma Geral" e uma aba por mentorado.</p></div></div>
    ${(equipe || []).length ? '' : '<div class="aviso">Antes de importar, convide os mentores em "Equipe". A importação liga cada sessão ao mentor pelo nome.</div>'}
    <div class="cartao"><h3>1. Escolha o arquivo</h3>
      <p class="apagado peq mt">No Google Planilhas: Arquivo → Fazer download → Microsoft Excel (.xlsx).</p>
      <input class="mt" type="file" id="arquivo" accept=".xlsx,.xls"></div>
    <div id="previa"></div>`;

  el.querySelector('#arquivo').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0]; if (!arq) return;
    const previa = el.querySelector('#previa');
    previa.innerHTML = '<p class="carregando">Lendo a planilha…</p>';
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
      const lista = lerPlanilha(XLSX, wb);
      mostrarPrevia(ctx, previa, lista, equipe || [], empresas || []);
    } catch (e) { previa.innerHTML = `<div class="aviso erro mt">${esc(explicarErro(e))}</div>`; }
  });
}

function mostrarPrevia(ctx, el, lista, equipe, empresas) {
  const nomesMentor = [...new Set(lista.flatMap((m) => m.mentores))].sort();
  const sugerir = (n) => { const t = sem(n); const p = equipe.find((x) => sem(x.nome).startsWith(t) || t.startsWith(sem(x.nome).split(' ')[0])); return p ? p.id : ''; };
  const datas = lista.flatMap((m) => m.sessoes.map((s) => s.data_hora)).filter(Boolean).sort();
  const maxSessoes = Math.max(...lista.map((m) => m.sessoes.length));

  el.innerHTML = `
    <div class="cartao"><h3>2. Empresa e programa</h3>
      <div class="grade g3 mt">
        <div class="campo"><label>Empresa</label><input type="text" id="i-empresa" list="empresas-lista" value="${esc(empresas[0] ? empresas[0].nome : 'Brasdiesel')}">
          <datalist id="empresas-lista">${empresas.map((e) => `<option value="${esc(e.nome)}">`).join('')}</datalist></div>
        <div class="campo"><label>Nome do programa</label><input type="text" id="i-programa" value="Trilha de Liderança 2026"></div>
        <div class="campo"><label>Sessões por mentorado</label><input type="number" id="i-sessoes" min="1" value="${maxSessoes}"></div>
      </div>
      <p class="peq apagado mt">Período encontrado: ${dataBR(datas[0])} a ${dataBR(datas[datas.length - 1])}. ${lista.length} mentorados, ${lista.reduce((a, m) => a + m.sessoes.length, 0)} sessões.</p></div>

    <div class="cartao"><h3>3. Quem é cada mentor da planilha</h3>
      <div class="grade g3 mt">${nomesMentor.map((n) => `<div class="campo"><label>"${esc(n)}" na planilha é</label>
        <select data-mentor="${esc(n)}"><option value="">(não ligar)</option>${equipe.map((p) => `<option value="${p.id}"${p.id === sugerir(n) ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>`).join('')}</div></div>

    <div class="cartao"><h3>4. Confira os mentorados</h3>
      <div class="tabela mt"><table><tr><th><input type="checkbox" id="todos" checked aria-label="Marcar todos"></th><th>Mentorado</th><th>Aba da ficha</th><th>Cargo</th><th>Mentores</th><th>Sessões</th><th>Sala do Meet</th></tr>
      ${lista.map((m, i) => `<tr><td><input type="checkbox" data-i="${i}" checked></td><td><b>${esc(m.nome)}</b></td>
        <td>${m.ficha ? esc(m.ficha.aba) : '<span class="selo alerta">não achei</span>'}</td><td>${esc(m.ficha && m.ficha.cargo || '—')}</td>
        <td>${esc(m.mentores.join(' e '))}</td><td>${m.sessoes.length}</td><td>${m.ficha && m.ficha.meet ? '<span class="selo">ok</span>' : '—'}</td></tr>`).join('')}
      </table></div>
      <div class="linha mt"><button class="btn pri" id="importar">Importar</button><span class="peq apagado" id="progresso"></span></div></div>`;

  el.querySelector('#todos').addEventListener('change', (ev) => el.querySelectorAll('[data-i]').forEach((c) => { c.checked = ev.target.checked; }));

  el.querySelector('#importar').addEventListener('click', async (ev) => {
    const prog = el.querySelector('#progresso');
    const nomeEmpresa = el.querySelector('#i-empresa').value.trim(), nomePrograma = el.querySelector('#i-programa').value.trim();
    const nSessoes = Number(el.querySelector('#i-sessoes').value) || maxSessoes;
    if (!nomeEmpresa || !nomePrograma) { avisar('Preencha a empresa e o programa.', true); return; }
    const mapa = {}; el.querySelectorAll('[data-mentor]').forEach((s) => { mapa[s.dataset.mentor] = s.value || null; });
    const escolhidos = [...el.querySelectorAll('[data-i]:checked')].map((c) => lista[Number(c.dataset.i)]);
    if (!escolhidos.length) { avisar('Marque pelo menos um mentorado.', true); return; }
    ev.target.disabled = true;
    try {
      // empresa e programa (reaproveita se já existirem com o mesmo nome)
      let { data: emp } = await sb.from('empresas').select('id').ilike('nome', nomeEmpresa).maybeSingle();
      if (!emp) { const r = await sb.from('empresas').insert({ nome: nomeEmpresa }).select('id').single(); if (r.error) throw r.error; emp = r.data; }
      let { data: pr } = await sb.from('programas').select('id').eq('empresa_id', emp.id).ilike('nome', nomePrograma).maybeSingle();
      if (!pr) {
        const r = await sb.from('programas').insert({ empresa_id: emp.id, nome: nomePrograma, sessoes_por_mentorado: nSessoes, frequencia: 'semanal',
          inicio: datas[0] ? datas[0].slice(0, 10) : null, fim_previsto: datas.length ? datas[datas.length - 1].slice(0, 10) : null, status: 'em_andamento' }).select('id').single();
        if (r.error) throw r.error; pr = r.data;
      }
      const { data: existentes } = await sb.from('mentorados').select('nome').eq('programa_id', pr.id);
      const jaTem = new Set((existentes || []).map((x) => sem(x.nome)));
      let feitos = 0, pulados = 0;
      for (const m of escolhidos) {
        prog.textContent = `Importando ${m.nome}… (${feitos + pulados + 1} de ${escolhidos.length})`;
        if (jaTem.has(sem(m.nome))) { pulados++; continue; }
        const f = m.ficha || {};
        const r = await sb.from('mentorados').insert({ programa_id: pr.id, nome: m.nome, cargo: f.cargo || null, sala_meet: f.meet || null,
          objetivo_principal: f.objetivo || null, forcas_visao_mentorado: f.forcas_m || null, fraquezas_visao_mentorado: f.fraquezas_m || null,
          forcas_visao_gestor: f.forcas_g || null, fraquezas_visao_gestor: f.fraquezas_g || null }).select('id').single();
        if (r.error) throw r.error;
        const mid = r.data.id;
        const vinc = m.mentores.map((n) => mapa[n]).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map((mentor_id, i) => ({ mentorado_id: mid, mentor_id, ordem: i + 1 }));
        if (vinc.length) { const e2 = (await sb.from('mentor_mentorado').insert(vinc)).error; if (e2) throw e2; }
        const linhas = m.sessoes.map((s) => ({ mentorado_id: mid, numero: s.numero, mentor_id: mapa[s.mentor] || null, data_hora: s.data_hora, tema: s.tema, roteiro: s.roteiro }));
        const r3 = await sb.from('sessoes').insert(linhas).select('id'); if (r3.error) throw r3.error;
        const e4 = (await sb.from('sessoes_interno').insert(r3.data.map((s) => ({ sessao_id: s.id })))).error; if (e4) throw e4;
        feitos++;
      }
      prog.textContent = '';
      avisar(`Importação concluída: ${feitos} mentorado(s) importado(s)${pulados ? `, ${pulados} já existia(m) e foi(ram) mantido(s)` : ''}.`);
      location.hash = `#/painel/programa/${pr.id}`;
    } catch (e) { prog.textContent = ''; avisar(explicarErro(e), true); ev.target.disabled = false; }
  });
}
