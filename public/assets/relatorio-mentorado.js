// Página do relatório da jornada do mentorado (relatorio-mentorado.html?id=<relatório>), script 67: monta o documento A4 com a cara
// da Mentorei. A administração vê o rascunho revisado (relatorios_mentorado.conteudo) ou, com &versao=liberada, o que o mentorado vê.
// O mentorado não lê a tabela: lê só o retrato liberado, pela função minha_jornada(). "Baixar o PDF" = impressão do navegador.
// Os números e os gráficos vêm de dados (calculados pela plataforma); o texto, da IA revisada pela equipe.
import { sb, esc } from './base.js';

const doc = document.getElementById('doc');
const qs = new URLSearchParams(location.search);
const id = qs.get('id') || '';
const verLiberada = qs.get('versao') === 'liberada';
const FUSO = 'America/Sao_Paulo';
const NIVEIS = ['Começando', 'Em construção', 'Praticando', 'Consistente', 'Referência'];

const dataLonga = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: 'numeric', month: 'long', year: 'numeric' });
const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const ddmm = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const num = (x) => String(x).replace('.', ',');
const paragrafos = (t) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const iniciais = (n) => (String(n || '?').trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p)).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();
const topo = (nome) => `<div class="topo"><img src="/assets/logo-escura.png" alt="Mentorei"><span>Relatório da jornada · ${esc(nome)}</span></div>`;
const lista = (itens) => `<ul>${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const etiquetas = (itens) => (itens && itens.length ? `<ul class="etiquetas">${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const cartoes = (l) => {
  const v = l.filter(([valor]) => valor != null && valor !== '');
  return v.length ? `<div class="numeros${v.length === 3 ? ' n3' : v.length === 2 ? ' n2' : ''}">${v.map(([valor, rotulo]) => `<div class="numero"><b>${valor}</b><span>${esc(rotulo)}</span></div>`).join('')}</div>` : '';
};

// linha do tempo: uma bolinha por sessão
function linhaDoTempo(sessoes) {
  const estado = (s) => (s.realizada ? 'feita' : /^falta/.test(s.situacao) ? 'falta' : s.situacao === 'cancelada' ? 'cancelada' : 'futura');
  const sub = (s, e) => (e === 'falta' ? 'falta' : e === 'cancelada' ? 'cancelada' : s.data ? ddmm(s.data) : 'a marcar');
  const usados = new Set(sessoes.map(estado));
  const LEG = { feita: 'Sessão realizada', falta: 'Falta', futura: 'Próxima sessão' };
  return `<ol class="tempo" aria-label="Sessões do programa">${sessoes.map((s) => {
    const e = estado(s);
    return `<li class="${e}"><span class="bola" aria-hidden="true">${s.numero}</span><b>Sessão ${s.numero}</b><span>${esc(sub(s, e))}</span></li>`;
  }).join('')}</ol>
    <div class="legenda">${Object.entries(LEG).filter(([k]) => usados.has(k)).map(([k, r]) => `<span><i class="${k}"></i>${r}</span>`).join('')}</div>`;
}

// evolução nos pontos a desenvolver: aro = primeira nota, cheio = nota mais recente (escala de 1 a 5 dos mentores)
function evolucao(itens) {
  const pos = (k) => ((k - 0.5) / 5) * 100;
  const linha = (e) => {
    const de = pos(e.inicio), ate = pos(e.atual);
    const dica = `${e.ponto}: ${e.serie.map((x) => `sessão ${x.numero} = ${x.nota} (${NIVEIS[x.nota - 1]})`).join('; ')}`;
    return `<div class="evol-linha" title="${esc(dica)}"><div class="evol-nome">${esc(e.ponto)}</div>
      <div class="evol-trilho" role="img" aria-label="${esc(`${e.ponto}: começou em ${NIVEIS[e.inicio - 1]} e está em ${NIVEIS[e.atual - 1]}`)}">
        <span></span><span></span><span></span><span></span><span></span>
        ${e.inicio !== e.atual ? `<i class="evol-liga" style="left:${Math.min(de, ate)}%;width:${Math.abs(ate - de)}%"></i><i class="evol-ponto inicio" style="left:${de}%"></i>` : ''}
        <i class="evol-ponto atual" style="left:${ate}%"></i></div>
      <div class="evol-val">${e.inicio !== e.atual ? `${e.inicio} → ${e.atual}` : e.atual}</div></div>`;
  };
  return `<div class="evol bloco-grafico">
    <div class="evol-linha cab"><span></span><div class="evol-escala">${NIVEIS.map((n, i) => `<span>${i + 1}<em><br>${n}</em></span>`).join('')}</div><span></span></div>
    ${itens.map(linha).join('')}</div>
    <div class="legenda"><span><i class="inicio"></i>Primeira nota</span><span><i class="atual"></i>Nota mais recente</span></div>`;
}

// notas que o mentorado deu às sessões: colunas de 0 a 10, valor no alto de cada uma
function graficoNotas(sess) {
  const W = 660, H = 196, cima = 22, base = 166, esq = 28, dir = 6;
  const banda = (W - esq - dir) / sess.length;
  const larg = Math.min(24, banda * 0.6);
  const y = (v) => base - (v / 10) * (base - cima);
  const coluna = (s, i) => {
    const x = esq + banda * i + (banda - larg) / 2, topoY = y(s.nota), alt = base - topoY, r = Math.min(4, alt);
    const forma = alt > 0 ? `<path class="col" d="M${x.toFixed(1)},${base} V${(topoY + r).toFixed(1)} Q${x.toFixed(1)},${topoY.toFixed(1)} ${(x + r).toFixed(1)},${topoY.toFixed(1)} H${(x + larg - r).toFixed(1)} Q${(x + larg).toFixed(1)},${topoY.toFixed(1)} ${(x + larg).toFixed(1)},${(topoY + r).toFixed(1)} V${base} Z"><title>Sessão ${s.numero}: nota ${s.nota}</title></path>` : '';
    const cx = (x + larg / 2).toFixed(1);
    return `${forma}<text class="valor" x="${cx}" y="${(topoY - 6).toFixed(1)}" text-anchor="middle">${s.nota}</text>
      <text x="${cx}" y="${base + 16}" text-anchor="middle">S${s.numero}</text>`;
  };
  return `<div class="notas bloco-grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Notas de 0 a 10 que você deu às sessões: ${sess.map((s) => `sessão ${s.numero}, ${s.nota}`).join('; ')}`)}">
    ${[0, 5, 10].map((v) => `<line class="${v ? 'grade-y' : 'base'}" x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}" /><text x="${esq - 8}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('')}
    ${sess.map(coluna).join('')}</svg></div>`;
}

const rosto = (m) => `<span class="rosto">${m.foto_url ? `<img src="${esc(m.foto_url)}" alt="">` : esc(iniciais(m.nome))}</span>`;

function montar(r) {
  const d = r.dados, t = r.texto || {};
  const op = { evolucao: true, notas: true, ...(r.opcoes || {}) };
  const nome = d.mentorado.nome;
  const pn = d.mentorado.primeiro_nome || primeiro(nome);
  const titulo = r.titulo || t.titulo || 'Relatório da jornada';
  const n = d.numeros;
  const feitas = d.sessoes.filter((s) => s.realizada);
  const periodo = !d.periodo ? '' : dataCurta(d.periodo.de) === dataCurta(d.periodo.ate) ? `Em ${dataCurta(d.periodo.de)}` : `De ${dataCurta(d.periodo.de)} a ${dataCurta(d.periodo.ate)}`;
  const programa = [d.programa.nome, d.programa.empresa].filter(Boolean).join(' · ');
  document.title = `Relatório da jornada · ${nome}`;

  // capa
  let html = `<section class="capa">
    <img class="logo" src="/assets/logo-clara.png" alt="Mentorei">
    <div><div class="rotulo">Relatório da jornada de mentoria</div><h1>${esc(nome)}</h1><div class="titulo">${esc(titulo)}</div>
      <div class="linha-bege"></div><div class="periodo">${esc(programa)}${programa && periodo ? '<br>' : ''}${esc(periodo)}</div></div>
    <div class="rodape">Preparado pela equipe Mentorei · ${esc(dataLonga(d.gerado_em))}</div></section>`;

  // visão geral
  const pontos = d.pontos || [];
  html += `<section class="folha">${topo(nome)}<div class="sobre">Visão geral</div><h2>O caminho até aqui</h2>
    <div class="texto">${paragrafos(t.abertura)}</div>
    ${cartoes([[`${n.realizadas}<small> de ${n.previstas}</small>`, n.realizadas === 1 ? 'sessão realizada' : 'sessões realizadas'],
      [n.horas ? `${num(n.horas)} h` : null, 'de conversa com os mentores'],
      [n.presenca_pct == null ? null : `${n.presenca_pct}%`, 'de presença nas sessões'],
      [n.tarefas ? `${n.tarefas_feitas}<small> de ${n.tarefas}</small>` : null, 'tarefas feitas']])}
    ${d.objetivo || pontos.length ? `<div class="objetivo${d.objetivo && pontos.length ? '' : ' so'}">
      ${d.objetivo ? `<div class="alvo"><h4>Objetivo da mentoria</h4><p>${esc(d.objetivo)}</p></div>` : ''}
      ${pontos.length ? `<div class="pontos"><h4>Pontos a desenvolver</h4>${etiquetas(pontos)}</div>` : ''}</div>` : ''}
    <h3>Linha do tempo</h3>${linhaDoTempo(d.sessoes.filter((s) => s.situacao !== 'cancelada' || s.realizada))}
    ${d.mentores.length ? `<h3>Quem acompanhou você</h3>
      <div class="mentores">${d.mentores.map((m) => `<div class="mentor">${rosto(m)}<div><b>${esc(m.nome)}</b><span>${m.sessoes ? `${m.sessoes} ${m.sessoes === 1 ? 'sessão' : 'sessões'}` : 'acompanha o programa'}</span></div></div>`).join('')}</div>` : ''}
  </section>`;

  // painel: evolução e notas (cada um só se a equipe deixou e se tem dado)
  const comEvol = op.evolucao && (d.evolucao || []).length;
  const comNotas = op.notas && n.notas;
  if (comEvol || comNotas) {
    html += `<section class="folha quebra">${topo(nome)}<div class="sobre">Seus números</div><h2>Como foi a caminhada</h2>
      ${comEvol ? `<h3>Evolução nos pontos a desenvolver</h3><p class="nota-h3">Notas que os mentores deram ao longo das sessões, de 1 (começando) a 5 (referência).</p>${evolucao(d.evolucao)}` : ''}
      ${comNotas ? `<h3>Como você avaliou as sessões</h3><p class="nota-h3">Nota de 0 a 10 que você deu a cada sessão. Média: ${num(n.nota_media)}.</p>${graficoNotas(d.sessoes.filter((s) => s.realizada && s.nota != null))}` : ''}
    </section>`;
  }

  // sessão a sessão
  const proximas = d.sessoes.filter((s) => !s.realizada && !/^falta/.test(s.situacao) && s.situacao !== 'cancelada' && (!s.data || Date.parse(s.data) > Date.parse(d.gerado_em)));
  html += `<section class="folha quebra">${topo(nome)}<div class="sobre">Sessão a sessão</div><h2>O que vocês conversaram</h2>
    ${feitas.map((s) => {
      const x = (t.sessoes || {})[s.id] || {};
      const quando = [s.data ? dataCurta(s.data) : '', s.mentor ? `com ${primeiro(s.mentor)}` : ''].filter(Boolean).join(' · ');
      return `<div class="sessao"><div class="n">${s.numero}</div><div><h4>${esc(s.tema || `Sessão ${s.numero}`)}</h4>
        <div class="quando">Sessão ${s.numero}${quando ? ` · ${esc(quando)}` : ''}</div>
        ${etiquetas(x.temas)}${paragrafos(x.resumo)}</div></div>`;
    }).join('')}
    ${proximas.length ? `<p class="proximas"><b>Próximas sessões:</b> ${esc(proximas.map((s) => `${s.numero}${s.tema ? `. ${s.tema}` : ''}${s.data ? ` (${dataCurta(s.data)})` : ''}`).join(' · '))}</p>` : ''}
  </section>`;

  // síntese
  const altos = t.pontos_altos || [], melhorou = t.melhorias || [], desafios = t.desafios || [];
  html += `<section class="folha quebra">${topo(nome)}<div class="sobre">Síntese da jornada</div><h2>O que fica até aqui</h2>
    ${altos.length || melhorou.length ? `<div class="duas"${altos.length && melhorou.length ? '' : ' style="grid-template-columns:1fr"'}>
      ${altos.length ? `<div class="bloco claro"><h4>Pontos altos das conversas</h4>${lista(altos)}</div>` : ''}
      ${melhorou.length ? `<div class="bloco verde"><h4>O que você já reconhece que melhorou</h4>${lista(melhorou)}</div>` : ''}</div>` : ''}
    ${desafios.length ? `<div class="bloco escuro"><h4>Os desafios que seguem com você</h4>${lista(desafios)}</div>` : ''}
    <div class="texto" style="margin-top:7mm">${paragrafos(t.encerramento)}</div>
    <div class="assinatura"><img src="/assets/logo-clara.png" alt="Mentorei"><div><b>Equipe Mentorei</b><br>contato@mentorei.com.br · mentorei.com.br</div></div>
  </section>`;
  doc.innerHTML = html;
  return pn;
}

async function abrir() {
  if (!/^[0-9a-f-]{36}$/i.test(id)) { doc.innerHTML = '<p class="aviso">Link incompleto. Abra o relatório pela plataforma.</p>'; return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    doc.innerHTML = '<p class="aviso">Entre na plataforma primeiro (<a href="/">plataforma.mentorei.com.br</a>). Depois, abra <b>Minha mentoria</b> e clique em <b>Abrir o relatório</b>.</p>';
    return;
  }
  const voltar = document.getElementById('voltar');
  // administração: lê a linha (rascunho revisado ou a versão liberada); mentorado: só o retrato liberado
  const { data: rel, error } = await sb.from('relatorios_mentorado').select('id, titulo, opcoes, conteudo, liberado, liberado_em').eq('id', id).maybeSingle();
  if (error && /does not exist|42P01|schema cache/i.test(`${error.code} ${error.message}`)) {
    doc.innerHTML = '<p class="aviso">Falta rodar o script <b>67-relatorio-da-jornada.sql</b> no Supabase.</p>'; return;
  }
  if (rel) {
    voltar.href = `/app.html#/relatorio-mentorado/${id}`; voltar.textContent = '← Voltar e editar';
    if (verLiberada) {
      if (!rel.liberado) { doc.innerHTML = '<p class="aviso">Este relatório ainda não foi liberado para o mentorado.</p>'; return; }
      const pn = montar(rel.liberado);
      const v = document.getElementById('versao');
      v.textContent = `Você está vendo o que ${pn} vê (versão de ${dataCurta(rel.liberado_em)})`; v.hidden = false;
      return;
    }
    if (!rel.conteudo || !rel.conteudo.texto) { doc.innerHTML = '<p class="aviso">O relatório ainda não tem texto. Volte quando a IA terminar de escrever.</p>'; return; }
    montar({ titulo: rel.titulo, opcoes: rel.opcoes, dados: rel.conteudo.dados, texto: rel.conteudo.texto });
    return;
  }
  voltar.href = '/app.html#/minha-area'; voltar.textContent = '← Voltar para a minha mentoria';
  const { data: meus } = await sb.rpc('minha_jornada');
  const meu = (Array.isArray(meus) ? meus : []).find((x) => x.id === id);
  if (!meu || !meu.liberado) { doc.innerHTML = '<p class="aviso">Relatório não encontrado. Abra pela sua área da plataforma, em <b>Minha mentoria</b>.</p>'; return; }
  montar(meu.liberado);
}

document.getElementById('pdf').addEventListener('click', () => window.print());
abrir().catch((e) => { doc.innerHTML = `<p class="aviso">Não consegui abrir o relatório: ${esc(e.message || e)}</p>`; });
