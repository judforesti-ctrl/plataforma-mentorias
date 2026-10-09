// Página do relatório das turmas (relatorio.html?id=<relatório>): monta o documento A4 com a cara da Mentorei a partir do que
// foi revisado na plataforma (relatorios_turmas.conteudo). "Baixar o PDF" abre a impressão do navegador (Salvar como PDF).
// Só a administração abre (regra de acesso da tabela). O texto original dos mentores nunca entra aqui.
import { sb, esc } from './base.js';

const COMO = { online: 'Online', presencial: 'Presencial', misto: 'Online e presencial' };
const doc = document.getElementById('doc');
const id = new URLSearchParams(location.search).get('id') || '';

const dataLonga = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' });
const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const numero = (x) => String(x).replace('.', ',');
const paragrafos = (t) => String(t || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
const primeiro = (n) => String(n || '').split(' ')[0];
const juntar = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] || '');
const topo = (empresa) => `<div class="topo"><img src="/assets/logo-escura.png" alt="Mentorei"><span>Relatório das turmas · ${esc(empresa)}</span></div>`;
const cartoes = (lista) => {
  const l = lista.filter(([v]) => v != null && v !== '');
  return l.length ? `<div class="numeros${l.length === 3 ? ' n3' : l.length === 2 ? ' n2' : ''}">${l.map(([v, r]) => `<div class="numero"><b>${esc(v)}</b><span>${esc(r)}</span></div>`).join('')}</div>` : '';
};

async function abrir() {
  if (!/^[0-9a-f-]{36}$/i.test(id)) { doc.innerHTML = '<p class="aviso">Link incompleto. Abra o relatório pela plataforma.</p>'; return; }
  document.getElementById('voltar').href = `/app.html#/relatorio-turmas/${id}`;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { doc.innerHTML = '<p class="aviso">Entre na plataforma primeiro (<a href="/">plataforma.mentorei.com.br</a>) e abra o relatório de novo.</p>'; return; }
  const { data: rel, error } = await sb.from('relatorios_turmas').select('titulo, conteudo').eq('id', id).maybeSingle();
  if (error || !rel || !rel.conteudo || !rel.conteudo.texto) { doc.innerHTML = '<p class="aviso">Relatório não encontrado (ou ainda sem texto). Só a administração abre os relatórios.</p>'; return; }
  const { dados, texto } = rel.conteudo;
  const empresa = dados.empresa.nome;
  const titulo = rel.titulo || texto.titulo || 'Relatório das turmas';
  document.title = `${titulo}`;
  const n = dados.numeros;
  const periodo = !dados.periodo ? '' : dataCurta(dados.periodo.de) === dataCurta(dados.periodo.ate) ? `Em ${dataCurta(dados.periodo.de)}` : `De ${dataCurta(dados.periodo.de)} a ${dataCurta(dados.periodo.ate)}`;

  // capa
  let html = `<section class="capa">
    <img class="logo" src="/assets/logo-clara.png" alt="Mentorei">
    <div><div class="rotulo">Relatório das turmas</div><h1>${esc(empresa)}</h1><div class="titulo">${esc(titulo)}</div>
      <div class="linha-bege"></div><div class="periodo">${esc(periodo)}</div></div>
    <div class="rodape">Preparado pela equipe Mentorei · ${esc(dataLonga(dados.gerado_em))}</div></section>`;

  // visão geral
  html += `<section class="folha">${topo(empresa)}<div class="sobre">Visão geral</div><h2>O caminho até aqui</h2>
    <div class="texto">${paragrafos(texto.apresentacao)}</div>
    ${cartoes([[n.turmas, n.turmas === 1 ? 'turma acompanhada' : 'turmas acompanhadas'], [n.realizados, n.realizados === 1 ? 'módulo realizado' : 'módulos realizados'],
      [n.media_presentes == null ? null : numero(n.media_presentes), 'participantes por aula, em média'], [n.presenca_pct == null ? null : `${n.presenca_pct}%`, 'de presença média']])}
    <h3>As turmas</h3>
    <table><tr><th>Turma</th><th>Formato</th><th>Módulos</th><th>Mentores</th></tr>
      ${dados.turmas.map((t) => `<tr><td><b>${esc(t.nome)}</b></td><td>${esc(COMO[t.formato] || '—')}</td><td>${t.numeros.realizados} de ${t.numeros.modulos}</td><td>${esc(juntar(t.mentores.map(primeiro)))}</td></tr>`).join('')}</table></section>`;

  // uma parte por turma
  for (const t of dados.turmas) {
    const x = (texto.turmas || {})[t.id] || {};
    const feitos = t.modulos.filter((m) => m.realizado);
    const proximos = t.modulos.filter((m) => !m.realizado);
    const meta = [COMO[t.formato], t.local && t.formato !== 'online' ? t.local : '', t.participantes_previstos ? `${t.participantes_previstos} participantes` : '',
      t.mentores.length ? `Mentoria: ${juntar(t.mentores.map(primeiro))}` : ''].filter(Boolean);
    html += `<section class="folha quebra">${topo(empresa)}<div class="sobre">Turma</div><h2>${esc(t.nome)}</h2>
      ${meta.length ? `<div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
      <div class="texto">${paragrafos(x.resumo)}</div>
      ${cartoes([[`${t.numeros.realizados} de ${t.numeros.modulos}`, 'módulos realizados'], [t.numeros.media_presentes == null ? null : numero(t.numeros.media_presentes), 'participantes por aula, em média'],
        [t.numeros.presenca_pct == null ? null : `${t.numeros.presenca_pct}%`, 'de presença média']])}
      <h3>Como foi cada módulo</h3>
      ${feitos.map((m) => `<div class="modulo"><div class="n">${m.numero}</div><div><h4>${esc(m.titulo)}</h4>
        <div class="quando">${m.data ? esc(dataCurta(m.data)) : ''}${m.presentes != null ? ` · ${m.presentes} ${m.presentes === 1 ? 'participante' : 'participantes'}` : ''}</div>
        ${paragrafos((x.modulos || {})[m.id])}</div></div>`).join('')}
      ${(x.destaques || []).length || (x.atencao || []).length ? `<div class="duas">
        ${(x.destaques || []).length ? `<div class="bloco claro"><h4>Destaques da turma</h4><ul>${x.destaques.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
        ${(x.atencao || []).length ? `<div class="bloco escuro"><h4>Pontos de atenção e próximos passos</h4><ul>${x.atencao.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
      ${proximos.length ? `<p class="proximos"><b>Próximos módulos:</b> ${esc(proximos.map((m) => `${m.numero}. ${m.titulo}${m.data ? ` (${dataCurta(m.data)})` : ''}`).join(' · '))}</p>` : ''}
    </section>`;
  }

  // recomendações e encerramento
  html += `<section class="folha quebra">${topo(empresa)}<div class="sobre">Para seguir</div><h2>Recomendações para a ${esc(empresa)}</h2>
    ${(texto.recomendacoes || []).length ? `<ol class="recs">${texto.recomendacoes.map((r) => `<li><span>${esc(r)}</span></li>`).join('')}</ol>` : ''}
    <div class="texto" style="margin-top:6mm">${paragrafos(texto.encerramento)}</div>
    <div class="assinatura"><img src="/assets/logo-clara.png" alt="Mentorei"><div><b>Equipe Mentorei</b><br>contato@mentorei.com.br · mentorei.com.br</div></div>
  </section>`;
  doc.innerHTML = html;
}

document.getElementById('pdf').addEventListener('click', () => window.print());
abrir().catch((e) => { doc.innerHTML = `<p class="aviso">Não consegui abrir o relatório: ${esc(e.message || e)}</p>`; });
