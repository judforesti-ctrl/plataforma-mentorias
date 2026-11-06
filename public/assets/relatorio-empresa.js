// Página do relatório da mentoria para a empresa (relatorio-empresa.html?id=<relatório>), script 68: monta o documento A4 com o
// mesmo desenho do relatório da jornada (relatorio-a4.css). Só a administração abre (a tabela só ela lê). "Baixar o PDF" =
// impressão do navegador. Os números vêm de dados (calculados pela plataforma) e do número de cada item (contado pelos códigos
// que a IA devolveu e conferido pela equipe); o texto, da IA revisada. Nada aqui mostra nomes de mentorados.
import { sb, esc } from './base.js';

const doc = document.getElementById('doc');
const id = new URLSearchParams(location.search).get('id') || '';
const FUSO = 'America/Sao_Paulo';
const dataLonga = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: 'numeric', month: 'long', year: 'numeric' });
const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const diaCurto = (d) => (d ? d.split('-').reverse().join('/') : '');
const num = (x) => String(x).replace('.', ',');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const paragrafos = (t) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
const iniciais = (n) => (String(n || '?').trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p)).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();
const ordenar = (l) => (l || []).filter((x) => x && x.titulo).map((x, i) => [x, i]).sort((a, b) => (Number(b[0].n) || 0) - (Number(a[0].n) || 0) || a[1] - b[1]).map(([x]) => x);
const ol = (itens) => `<ol>${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] || '');

// barras horizontais; a maior (ou as empatadas no topo) em petróleo
function barras(itens, total, unidade) {
  const max = Math.max(1, ...itens.map((x) => Number(x.n) || 0));
  const escala = total || max;
  return `<div class="barras bloco-grafico" role="list">${itens.map((x) => {
    const v = Number(x.n) || 0;
    return `<div class="barra-l${v === max ? ' maior' : ''}" role="listitem"><span class="barra-nome">${esc(x.titulo)}</span>
      <span class="barra-trilho" aria-hidden="true"><i style="width:${Math.max(1.5, (v / escala) * 100).toFixed(1)}%"></i></span>
      <b class="barra-val">${v}${total ? `<small> de ${total}</small>` : `<small> ${v === 1 ? unidade[0] : unidade[1]}</small>`}</b></div>`;
  }).join('')}</div>`;
}

function montar(r) {
  const d = r.dados, t = r.texto || {};
  const op = { tarefas: true, avaliacao: true, mentores: true, ...(r.opcoes || {}) };
  const n = d.numeros;
  const empresa = d.empresa.nome;
  const titulo = r.titulo || t.titulo || 'Leitura do programa de mentoria';
  const topo = `<div class="topo"><img src="/assets/logo-escura.png" alt="Mentorei"><span>Leitura do programa de mentoria · ${esc(empresa)}</span></div>`;
  const programas = d.programas.map((p) => p.nome).join(' · ');
  const periodo = !d.periodo ? '' : `Sessões de ${dataCurta(d.periodo.de)} a ${dataCurta(d.periodo.ate)}`;
  const ate = dataCurta(d.gerado_em);
  const dif = ordenar(t.dificuldades), temas = ordenar(t.temas), medos = ordenar(t.medos), grupos = ordenar(t.grupos);
  const tematicas = temas.reduce((a, x) => a + (Number(x.n) || 0), 0);
  const L = (v) => `${v} ${v === 1 ? 'líder' : 'líderes'}`;
  const comNota = op.avaliacao && n.notas;
  document.title = `${titulo} · ${empresa}`;

  // capa
  let html = `<section class="capa">
    <img class="logo" src="/assets/logo-clara.png" alt="Mentorei">
    <div><div class="rotulo">Leitura do programa de mentoria</div><h1>${esc(empresa)}</h1><div class="titulo">${esc(titulo)}</div>
      <div class="linha-bege"></div><div class="periodo">${esc(programas)}${programas && periodo ? '<br>' : ''}${esc(periodo)}<br>Para a diretoria e o RH</div></div>
    <div class="rodape">Preparado pela equipe Mentorei · ${esc(dataLonga(d.gerado_em))}</div></section>`;

  // em uma página
  const top3 = (itens, f) => (itens.length ? `<ul class="top">${itens.slice(0, 3).map((x) => `<li><span>${esc(x.titulo)}</span><b>${f(Number(x.n) || 0)}</b></li>`).join('')}</ul>` : '');
  const resp = t.respostas || {};
  const cartoes = [[n.lideres, n.lideres === 1 ? 'líder em mentoria individual' : 'líderes em mentoria individual'],
    [`${n.realizadas}<small> de ${n.previstas}</small>`, 'sessões realizadas'],
    [n.horas ? `${n.horas >= 10 ? Math.round(n.horas) : num(n.horas)} h` : null, 'de mentoria'],
    comNota ? [num(n.nota_media), 'nota média das sessões, de 0 a 10'] : [n.presenca_pct == null ? null : `${n.presenca_pct}%`, 'de presença nas sessões']]
    .filter(([v]) => v != null && v !== '');
  html += `<section class="folha">${topo}<div class="sobre">Visão geral</div><h2>Em uma página</h2>
    <div class="texto lead">${paragrafos(t.abertura)}</div>
    <div class="quadro">
      <div class="bloco claro"><h4>Maiores dificuldades</h4>${paragrafos(resp.dificuldades)}${top3(dif, (v) => `${v} de ${n.lideres}`)}</div>
      <div class="bloco claro"><h4>Pontos mais trabalhados</h4>${paragrafos(resp.pontos)}${top3(temas, (v) => `${v} ${v === 1 ? 'sessão' : 'sessões'}`)}</div>
      <div class="bloco claro"><h4>Maiores medos</h4>${paragrafos(resp.medos)}${top3(medos, L)}</div>
      <div class="bloco escuro"><h4>Próximos passos</h4>${paragrafos(resp.proximos)}</div>
    </div>
    ${t.avancos ? `<div class="bloco verde" style="margin-top:4mm"><h4>O que já mudou</h4>${paragrafos(t.avancos)}</div>` : ''}
  </section>`;

  // o programa em números
  const linhasNum = [
    ['Líderes em mentoria individual', `${n.lideres}${grupos.length ? `<div class="sub-lista">${esc(grupos.map((g) => `${g.titulo}: ${g.n}`).join(' · '))}</div>` : ''}`],
    ...d.programas.map((p) => [d.programas.length > 1 ? esc(p.nome) : 'Formato', esc([
      p.sessoes_por_lider ? `${p.sessoes_por_lider} sessões por líder` : '',
      p.inicio && p.fim_previsto ? `de ${diaCurto(p.inicio)} a ${diaCurto(p.fim_previsto)}` : p.inicio ? `desde ${diaCurto(p.inicio)}` : '',
      d.programas.length > 1 ? `${L(p.lideres)}, ${p.realizadas} de ${p.previstas} sessões realizadas` : '',
    ].filter(Boolean).join(', ') || p.nome)]),
    ['Sessões realizadas', `${n.realizadas} de ${n.previstas} (${pct(n.realizadas, n.previstas)}%)<span class="mini"><i style="width:${pct(n.realizadas, n.previstas)}%"></i></span>`],
    ['Horas de mentoria', `cerca de ${n.horas >= 10 ? Math.round(n.horas) : num(n.horas)} h`],
    ['Faltas', n.faltas ? `${n.faltas} (presença de ${n.presenca_pct}%)` : 'nenhuma'],
    ...(op.tarefas && n.tarefas ? [['Tarefas entre sessões', `${n.tarefas_feitas} de ${n.tarefas} cumpridas (${n.tarefas_pct}%)`]] : []),
    ...(comNota ? [['Avaliação das sessões pelos líderes', `${num(n.nota_media)} de 10 (${n.notas} ${n.notas === 1 ? 'avaliação' : 'avaliações'}${n.notas_10 ? `, ${n.notas_10} com nota 10` : ''})`]] : []),
  ];
  const frase = `${n.realizadas} das ${n.previstas} sessões previstas já aconteceram (${pct(n.realizadas, n.previstas)}%)${n.faltas ? `, com ${n.faltas} ${n.faltas === 1 ? 'falta' : 'faltas'}` : ', sem nenhuma falta'}${comNota ? `, e os líderes deram nota média ${num(n.nota_media)} de 10 às sessões` : ''}.`;
  html += `<section class="folha quebra">${topo}<div class="sobre">Os números</div><h2>O programa em números</h2>
    <p class="lead">${esc(frase)}</p>
    <div class="numeros${cartoes.length === 3 ? ' n3' : cartoes.length === 2 ? ' n2' : ''}">${cartoes.map(([v, rot]) => `<div class="numero"><b>${v}</b><span>${esc(rot)}</span></div>`).join('')}</div>
    <div class="rolar"><table class="tabela-a4 indicadores"><thead><tr><th>Indicador</th><th>Resultado até ${ate}</th></tr></thead>
      <tbody>${linhasNum.map(([a, b]) => `<tr><td class="ind">${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div>
    ${t.numeros_leitura ? `<div class="texto" style="margin-top:5mm">${paragrafos(t.numeros_leitura)}</div>` : ''}
    ${op.mentores && d.mentores.length ? `<h3>Quem conduziu a mentoria</h3>
      <div class="mentores">${d.mentores.map((m) => `<div class="mentor"><span class="rosto">${m.foto_url ? `<img src="${esc(m.foto_url)}" alt="">` : esc(iniciais(m.nome))}</span>
        <div><b>${esc(m.nome)}</b><span>${m.sessoes ? `${m.sessoes} ${m.sessoes === 1 ? 'sessão' : 'sessões'}` : 'acompanha o programa'}</span></div></div>`).join('')}</div>` : ''}
  </section>`;

  // 1. dificuldades
  if (dif.length) {
    html += `<section class="folha quebra">${topo}<div class="sobre">Pergunta 1</div><h2>As maiores dificuldades relatadas pelo time</h2>
      <div class="texto lead">${paragrafos(t.dificuldades_leitura)}</div>
      <h3>Em quantos líderes cada dificuldade aparece</h3><p class="nota-h3">Registros das ${n.realizadas} sessões dos ${n.lideres} líderes, até ${ate}.</p>
      ${barras(dif, n.lideres)}
      <ul class="itens">${dif.filter((x) => x.descricao).map((x) => `<li><b>${esc(x.titulo)}.</b> ${esc(x.descricao)}</li>`).join('')}</ul>
    </section>`;
  }

  // 2. temas mais trabalhados e como evoluíram
  const evol = (t.evolucoes || []).filter((x) => x.titulo || x.texto);
  if (temas.length || evol.length) {
    html += `<section class="folha quebra">${topo}<div class="sobre">Pergunta 2</div><h2>Os pontos de atenção mais trabalhados</h2>
      <div class="texto lead">${paragrafos(t.temas_leitura)}</div>
      ${temas.length ? `<h3>Tema principal de cada sessão</h3><p class="nota-h3">As ${tematicas} sessões temáticas realizadas até ${ate}, sem as sessões de abertura e diagnóstico.</p>${barras(temas, 0, ['sessão', 'sessões'])}` : ''}
      ${evol.length ? `<div class="bloco verde"><h4>Como esses pontos já evoluíram, segundo os registros</h4>
        <ul>${evol.map((x) => `<li>${x.titulo ? `<b>${esc(x.titulo)}.</b> ` : ''}${esc(x.texto)}</li>`).join('')}</ul></div>` : ''}
    </section>`;
  }

  // 3. medos
  if (medos.length) {
    const maxM = Math.max(1, ...medos.map((x) => Number(x.n) || 0));
    html += `<section class="folha quebra">${topo}<div class="sobre">Pergunta 3</div><h2>Os maiores medos relatados</h2>
      <div class="texto lead">${paragrafos(t.medos_leitura)}</div>
      <div class="rolar"><table class="tabela-a4"><thead><tr><th>Medo</th><th>Como aparece nas conversas</th><th>Líderes</th></tr></thead>
        <tbody>${medos.map((x) => `<tr><td class="ind">${esc(x.titulo)}</td><td>${esc(x.como_aparece || '')}</td>
          <td class="qtd"><b>${Number(x.n) || 0}</b> <span class="sub-lista">de ${n.lideres}</span><span class="mini"><i style="width:${pct(Number(x.n) || 0, Math.max(maxM, n.lideres))}%"></i></span></td></tr>`).join('')}</tbody></table></div>
      ${t.medos_conclusao ? `<div class="bloco claro" style="margin-top:6mm">${paragrafos(t.medos_conclusao)}</div>` : ''}
    </section>`;
  }

  // 4. próximos passos e como foi feita
  const pm = t.proximos_mentoria || [], pd = t.proximos_diretoria || [], pr = t.proximos_rh || [];
  const nomesProg = d.programas.map((p) => p.nome);
  html += `<section class="folha quebra">${topo}<div class="sobre">Pergunta 4</div><h2>Próximos passos</h2>
    <div class="texto lead">${paragrafos(t.proximos_abertura)}</div>
    <div class="passos">
      ${pm.length ? `<div class="bloco claro"><h4>Na mentoria</h4>${ol(pm)}</div>` : ''}
      ${pd.length ? `<div class="bloco escuro"><h4>Para a diretoria</h4>${ol(pd)}</div>` : ''}
      ${pr.length ? `<div class="bloco verde"><h4>Para o RH</h4>${ol(pr)}</div>` : ''}
    </div>
    <div class="fim"><div class="metodo"><h4>Como esta leitura foi feita</h4>
      <p>A Mentorei cruzou, em ${ate}, os registros das ${n.realizadas} sessões dos ${n.lideres} líderes${nomesProg.length ? ` ${nomesProg.length > 1 ? 'dos programas' : 'do programa'} ${esc(juntar(nomesProg))}` : ''}: anotações dos mentores, resumos enviados aos líderes, temas e tarefas.
        Nas dificuldades e nos medos, cada número indica em quantos líderes o assunto aparece nos registros; nos temas, em quantas sessões ele foi o tema principal.
        Para preservar o sigilo da mentoria, nada aqui identifica quem disse o quê, e as informações registradas como confidenciais ficaram de fora.</p></div>
    <div class="assinatura"><img src="/assets/logo-clara.png" alt="Mentorei"><div><b>Equipe Mentorei</b><br>contato@mentorei.com.br · mentorei.com.br</div></div></div>
  </section>`;
  doc.innerHTML = html;
}

async function abrir() {
  if (!/^[0-9a-f-]{36}$/i.test(id)) { doc.innerHTML = '<p class="aviso">Link incompleto. Abra o relatório pela plataforma.</p>'; return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { doc.innerHTML = '<p class="aviso">Entre na plataforma primeiro (<a href="/">plataforma.mentorei.com.br</a>) e abra o relatório por <b>Relatórios</b>.</p>'; return; }
  document.getElementById('voltar').href = `/app.html#/relatorio-empresa/${id}`;
  const { data: rel, error } = await sb.from('relatorios_empresa').select('id, titulo, opcoes, conteudo').eq('id', id).maybeSingle();
  if (error && /does not exist|42P01|schema cache/i.test(`${error.code} ${error.message}`)) {
    doc.innerHTML = '<p class="aviso">Falta rodar o script <b>68-relatorio-para-a-empresa.sql</b> no Supabase.</p>'; return;
  }
  if (error) throw error;
  if (!rel) { doc.innerHTML = '<p class="aviso">Relatório não encontrado. Só a administração abre este relatório.</p>'; return; }
  if (!rel.conteudo || !rel.conteudo.texto) { doc.innerHTML = '<p class="aviso">O relatório ainda não tem texto. Volte quando a IA terminar de escrever.</p>'; return; }
  montar({ titulo: rel.titulo, opcoes: rel.opcoes, dados: rel.conteudo.dados, texto: rel.conteudo.texto });
}

document.getElementById('pdf').addEventListener('click', () => window.print());
abrir().catch((e) => { doc.innerHTML = `<p class="aviso">Não consegui abrir o relatório: ${esc(e.message || e)}</p>`; });
