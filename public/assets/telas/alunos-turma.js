// Alunos da turma (script 44, pedido da Juliana em 27/10/2026): na página da turma, a lista de quem faz a trilha.
// A administração cola a lista da planilha (nome, e-mail, WhatsApp, cargo), manda os convites (e-mail ou WhatsApp, quando ela quiser:
// nada sai sozinho) e vê quem já entrou. O mentor da turma só vê os nomes. "Ver como o aluno vê" abre a área do aluno em prévia.
import { sb, esc, avisar, explicarErro, dataBR } from '../base.js';
import { frequencia, FREQUENCIA_MINIMA } from '../presenca-regras.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEL = 'id, nome, email, whatsapp, cargo, ativo, convidado_em, perfil_id, perfil:perfis!turma_alunos_perfil_id_fkey(termo_aceito_em)';
const SITUACAO = {
  entrou: ['Já entrou', ''],
  convidado: ['Convidado, ainda não entrou', 'alerta'],
  novo: ['Ainda não convidado', 'neutro'],
  sem_email: ['Sem e-mail', 'erro'],
  fora: ['Saiu da turma', 'neutro'],
};
const situacao = (a) => (!a.ativo ? 'fora' : !a.email ? 'sem_email' : a.perfil && a.perfil.termo_aceito_em ? 'entrou' : a.convidado_em ? 'convidado' : 'novo');
const faltaScript = (e) => /turma_alunos|schema cache|42P01|PGRST20/.test(`${e && e.code} ${e && e.message}`);

export const cartaoAlunos = () => '<div class="cartao" id="alunos-turma"><p class="peq apagado">Carregando os alunos…</p></div>';

// Lê a lista colada da planilha: uma pessoa por linha; colunas separadas por tabulação (Excel), ponto e vírgula ou vírgula.
export function lerListaColada(texto) {
  const pessoas = [];
  for (const linha of String(texto || '').split(/\r?\n/)) {
    // vindo do Excel (com tab), a vírgula é parte do texto ("Supervisora, atendimento"); digitado, ; e , separam
    const partes = (linha.includes('\t') ? linha.split('\t') : linha.split(/;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((x) => x.replace(/^"|"$/g, '').trim()).filter(Boolean);
    if (!partes.length) continue;
    const email = (partes.find((x) => EMAIL.test(x)) || '').toLowerCase();
    const whatsapp = partes.find((x) => !x.includes('@') && x.replace(/\D/g, '').length >= 10 && !/[a-z]{3}/i.test(x)) || '';
    const textos = partes.filter((x) => x !== email && x.toLowerCase() !== email && x !== whatsapp && /\p{L}/u.test(x));
    const nome = textos[0] || '';
    if (!nome || (/^nome$/i.test(nome) && !email)) continue;                  // cabeçalho da planilha
    pessoas.push({ nome: nome.replace(/\s+/g, ' ').slice(0, 120), email, whatsapp, cargo: (textos[1] || '').slice(0, 120) });
  }
  return pessoas;
}

// Linhas da planilha (cada uma uma lista de células) → texto no formato do "colar" (nome, e-mail, WhatsApp, cargo, separados por tab).
// Com cabeçalho reconhecido (Nome, E-mail, WhatsApp/Celular/Telefone, Cargo/Função), usa as colunas certas e ignora as outras;
// sem cabeçalho, manda a linha inteira e o leitor do "colar" acha o e-mail e o telefone sozinho.
export function linhasDaPlanilha(linhas) {
  const sem = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const achar = (cab, re, fora) => cab.findIndex((c) => re.test(sem(c)) && !(fora && fora.test(sem(c))));
  let col = null, inicio = 0;
  for (let i = 0; i < Math.min(linhas.length, 10); i += 1) {
    const cab = linhas[i] || [];
    const nome = achar(cab, /^(nome|participante|aluno|colaborador)/, /empresa|gestor|lider|cooperativa|agencia|unidade|setor/);
    const email = achar(cab, /e-?mail/);
    if (nome >= 0 && email >= 0) {
      col = { nome, email, whats: achar(cab, /whats|celular|telefone|fone|contato/), cargo: achar(cab, /cargo|funcao|posicao/) };
      inicio = i + 1;
      break;
    }
  }
  const celula = (l, k) => (k >= 0 ? String(l[k] == null ? '' : l[k]).replace(/[\t\r\n]+/g, ' ').trim() : '');
  return linhas.slice(inicio).map((l) => (col
    ? [celula(l, col.nome), celula(l, col.email), celula(l, col.whats), celula(l, col.cargo)]
    : (l || []).map((c) => String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' ').trim()))
    .join('\t').replace(/\t+$/, ''))
    .filter((t) => t.replace(/\t/g, '').trim()).join('\n');
}

async function chamarConvite(corpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/api/convidar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.mensagem || 'Não foi possível.');
  return j;
}

export async function ligarAlunos(ctx, el, turma) {
  const velho = el.querySelector('#alunos-turma');
  if (!velho) return;
  // a cada recarga o cartão nasce de novo, para os cliques não se acumularem
  const box = velho.cloneNode(true);
  velho.replaceWith(box);
  const adm = ctx.ehAdmin;
  const { data, error } = await sb.from('turma_alunos').select(SEL).eq('turma_id', turma.id).order('nome');
  if (error) {
    box.innerHTML = `<h3>Alunos da trilha</h3>${faltaScript(error)
      ? `<div class="aviso mt">${adm ? 'Para cadastrar os alunos e dar a eles o acesso à trilha, falta rodar o script <b>44-alunos-das-turmas.sql</b> no Supabase.' : 'A lista de alunos ainda não foi liberada na plataforma.'}</div>`
      : `<div class="aviso erro mt">${esc(explicarErro(error))}</div>`}`;
    return;
  }
  const alunos = data || [];
  const ativos = alunos.filter((a) => a.ativo);
  const conta = (s) => ativos.filter((a) => situacao(a) === s).length;
  // presença de cada aluno nos encontros com chamada feita (script 49; sem o script a coluna não aparece)
  const idsModulos = (turma.modulos || []).map((m) => m.id);
  const pres = idsModulos.length && alunos.length ? await sb.from('presencas').select('turma_aluno_id, presente').in('modulo_id', idsModulos) : { data: [] };
  const freq = pres.error ? null : frequencia(pres.data);
  const comChamada = freq ? ativos.filter((a) => freq[a.id]) : [];
  const freqMedia = comChamada.length ? Math.round(comChamada.reduce((n, a) => n + freq[a.id].pct, 0) / comChamada.length) : null;
  const celulaFreq = (a) => { const f = freq && freq[a.id]; return f ? `<span class="${f.pct < FREQUENCIA_MINIMA ? 'selo alerta' : 'peq'}">${f.presencas} de ${f.presencas + f.faltas} (${f.pct}%)</span>` : '<span class="peq apagado">—</span>'; };

  box.innerHTML = `
    <div class="linha"><h3 style="flex:1">Alunos da trilha <span class="selo neutro">${ativos.length}</span></h3>
      <a class="btn peq" href="#/trilha/${turma.id}">Ver como o aluno vê</a>
      ${adm ? '<button class="btn peq escuro" type="button" id="al-add">+ Adicionar alunos</button>' : ''}</div>
    <p class="peq apagado">${adm ? 'Cada aluno recebe o convite, cria a senha e entra na área da trilha: módulos, link da aula, slides para alunos, tarefas e gravações. Os convites só saem quando você clicar.'
      : 'Quem faz esta trilha. Eles veem, na área deles, os slides para alunos, as tarefas e as gravações que você colocar em cada módulo.'}</p>
    ${ativos.length ? `<p class="peq mt">${[['entrou', 'já entrou', 'já entraram'], ['convidado', 'convidado que ainda não entrou', 'convidados que ainda não entraram'],
      ['novo', 'ainda não convidado', 'ainda não convidados'], ['sem_email', 'sem e-mail', 'sem e-mail']]
      .filter(([k]) => conta(k)).map(([k, um, varios]) => `<b>${conta(k)}</b> ${conta(k) === 1 ? um : varios}`).join(' · ')}${freqMedia != null ? ` · frequência média <b>${freqMedia}%</b>` : ''}</p>` : ''}
    ${alunos.length ? `<div class="tabela mt"><table>
      <tr>${adm ? '<th><input type="checkbox" id="al-todos" aria-label="Marcar todos"></th>' : ''}<th>Aluno</th>${adm ? '<th>E-mail (login)</th><th>WhatsApp</th>' : ''}<th>Situação</th>${freq ? '<th>Presença</th>' : ''}${adm ? '<th></th>' : ''}</tr>
      ${alunos.map((a) => { const s = situacao(a); return `<tr data-aluno="${a.id}"${a.ativo ? '' : ' class="apagado"'}>
        ${adm ? `<td><input type="checkbox" data-marca="${a.id}"${a.email && a.ativo ? '' : ' disabled'} aria-label="Marcar ${esc(a.nome)}"></td>` : ''}
        <td><b>${esc(a.nome)}</b>${a.cargo ? `<br><span class="peq apagado">${esc(a.cargo)}</span>` : ''}</td>
        ${adm ? `<td><input type="email" data-email="${a.id}" value="${esc(a.email || '')}" placeholder="e-mail" aria-label="E-mail de ${esc(a.nome)}" style="min-width:200px"></td>
          <td><input type="tel" data-whats="${a.id}" value="${esc(a.whatsapp || '')}" placeholder="(DDD) número" aria-label="WhatsApp de ${esc(a.nome)}" style="min-width:130px"></td>` : ''}
        <td><span class="selo ${SITUACAO[s][1]}">${SITUACAO[s][0]}</span>${a.convidado_em && s === 'convidado' ? `<br><span class="peq apagado">convite em ${dataBR(a.convidado_em)}</span>` : ''}<div class="peq" data-envio="${a.id}"></div></td>
        ${freq ? `<td style="white-space:nowrap">${celulaFreq(a)}</td>` : ''}
        ${adm ? `<td style="white-space:nowrap">${a.ativo ? `<button class="btn peq${s === 'novo' ? ' pri' : ''}" type="button" data-um="${a.id}"${a.email ? ' title="Mandar o convite por e-mail"' : ' disabled title="Coloque o e-mail primeiro"'}>${s === 'novo' || s === 'sem_email' ? 'Enviar convite' : 'Reenviar'}</button>
          <button class="btn peq" type="button" data-whatsapp="${a.id}"${a.email ? '' : ' disabled'}>WhatsApp</button>
          <button class="btn peq" type="button" data-sair="${a.id}" aria-label="Tirar ${esc(a.nome)} da turma">Tirar</button>` : `<button class="btn peq" type="button" data-voltar="${a.id}">Voltar para a turma</button>`}</td>` : ''}
      </tr>`; }).join('')}</table></div>` : `<p class="apagado mt">${adm ? 'Nenhum aluno ainda. Clique em "+ Adicionar alunos" e cole a lista da planilha.' : 'A coordenação ainda não cadastrou os alunos.'}</p>`}
    ${adm && ativos.length ? `<div class="linha mt">${conta('novo') ? `<button class="btn pri" type="button" id="al-todos-novos">Convidar todos de uma vez (${conta('novo')} aluno${conta('novo') > 1 ? 's' : ''} ainda sem convite)</button>` : ''}
      <button class="btn" type="button" id="al-enviar"></button><span class="peq apagado" id="al-progresso" role="status"></span></div>
      ${freq ? `<p class="peq apagado mt">Presença: encontros com a chamada feita no módulo. Abaixo de ${FREQUENCIA_MINIMA}% aparece em destaque.</p>` : ''}
      <p class="peq apagado mt">O link do convite não expira: vale até a pessoa criar a senha. Quem já entra na plataforma (por exemplo, um mentorado individual) não recebe e-mail: a trilha só aparece na área dele.</p>` : ''}`;
  if (!adm) return;

  const recarregar = () => ligarAlunos(ctx, el, turma);
  const porId = (id) => alunos.find((a) => a.id === id);
  box.querySelector('#al-add').addEventListener('click', () => janelaAdicionar(turma, alunos, recarregar));

  // e-mail e WhatsApp corrigidos direto na tabela (salva ao sair do campo)
  box.addEventListener('change', async (ev) => {
    const c = ev.target.closest('[data-email], [data-whats]');
    if (c) {
      const id = c.dataset.email || c.dataset.whats;
      const campo = c.dataset.email ? 'email' : 'whatsapp';
      const valor = c.value.trim() || null;
      if (campo === 'email' && valor && !EMAIL.test(valor)) { avisar('Esse e-mail está com o formato errado.', true); return; }
      const { error: e } = await sb.from('turma_alunos').update({ [campo]: valor }).eq('id', id);
      if (e) { avisar(/duplicate/.test(e.message || '') ? 'Esse e-mail já está em outro aluno desta turma.' : explicarErro(e), true); return; }
      porId(id)[campo] = campo === 'email' && valor ? valor.toLowerCase() : valor;
      avisar('Salvo.');
      if (campo === 'email') recarregar();
      return;
    }
    if (ev.target.id === 'al-todos') box.querySelectorAll('[data-marca]:not(:disabled)').forEach((x) => { x.checked = ev.target.checked; });
    contar();
  });

  const marcados = () => [...box.querySelectorAll('[data-marca]:checked')].map((x) => porId(x.dataset.marca));
  const botao = box.querySelector('#al-enviar');
  const contar = () => {
    if (!botao) return;
    const n = marcados().length;
    botao.textContent = n ? `Enviar para os ${n} marcado${n > 1 ? 's' : ''}` : 'Ou marque na lista quem deve receber';
    botao.disabled = !n;
  };
  contar();
  // envia o convite por e-mail, um por vez, com o resultado em cada linha (usado por "todos", pelos marcados e por um só)
  const enviar = async (lote, perguntar = true) => {
    if (!lote.length) return;
    const jaEntraram = lote.filter((a) => situacao(a) === 'entrou').length;
    if (perguntar && !window.confirm(`Mandar agora o convite por e-mail para ${lote.length} aluno${lote.length > 1 ? 's' : ''} da trilha ${turma.nome}?\n\n${lote.map((a) => `• ${a.nome} (${a.email})`).join('\n')}${jaEntraram ? `\n\n${jaEntraram} já entrou: recebe um link para criar outra senha.` : ''}`)) return;
    box.querySelectorAll('#al-enviar, #al-todos-novos').forEach((b) => { b.disabled = true; });
    const prog = box.querySelector('#al-progresso');
    let ok = 0;
    const falhas = [];
    for (const [i, a] of lote.entries()) {
      prog.textContent = `Enviando ${i + 1} de ${lote.length}…`;
      const celula = box.querySelector(`[data-envio="${a.id}"]`);
      try {
        const j = await chamarConvite({ email: a.email, nome: a.nome, papel: 'aluno', turma_aluno_id: a.id, reenviar: situacao(a) === 'entrou' });
        ok += 1;
        celula.innerHTML = `<span class="selo">✓ ${j.ja_tem_login ? 'Trilha liberada' : 'Enviado'}</span>`;
      } catch (e) {
        falhas.push(a.nome);
        celula.innerHTML = `<span class="selo erro">Não enviado</span> ${esc(explicarErro(e))}`;
      }
    }
    prog.textContent = `${ok} convite${ok === 1 ? '' : 's'} enviado${ok === 1 ? '' : 's'}${falhas.length ? `; não deu certo: ${falhas.join(', ')}` : ''}.`;
    avisar(prog.textContent, !!falhas.length);
    setTimeout(recarregar, 2500);
  };
  botao?.addEventListener('click', () => enviar(marcados()));
  box.querySelector('#al-todos-novos')?.addEventListener('click', () => enviar(ativos.filter((a) => situacao(a) === 'novo')));

  box.addEventListener('click', async (ev) => {
    // convite de um aluno só (primeiro envio ou reenviar)
    const um = ev.target.closest('[data-um]');
    if (um) {
      const a = porId(um.dataset.um);
      const s = situacao(a);
      const msg = s === 'novo' ? `Mandar agora o convite por e-mail para ${a.nome} (${a.email})?`
        : s === 'entrou' ? `${a.nome} já entrou na plataforma. Mandar um link novo para criar outra senha (${a.email})?`
          : `Mandar o convite de novo para ${a.nome} (${a.email})? O link anterior continua valendo.`;
      if (!window.confirm(msg)) return;
      um.disabled = true;
      await enviar([a], false);
      return;
    }
    const w = ev.target.closest('[data-whatsapp]');
    if (w) {
      const a = porId(w.dataset.whatsapp);
      w.disabled = true;
      try {
        const j = await chamarConvite({ email: a.email, nome: a.nome, papel: 'aluno', turma_aluno_id: a.id, canal: 'link' });
        const { janelaWhatsApp } = await import('./equipe.js');
        const primeiro = a.nome.split(' ')[0];
        const empresa = turma.empresa ? ` (${turma.empresa.nome})` : '';
        janelaWhatsApp({
          titulo: `Convite de ${a.nome} por WhatsApp`, whatsapp: a.whatsapp || '',
          nota: j.ja_tem_login ? 'Esta pessoa já entra na plataforma: a mensagem só avisa que a trilha está lá.' : 'O link não expira: vale até a pessoa criar a senha. Nenhum e-mail foi enviado.',
          texto: j.ja_tem_login
            ? `Oi, ${primeiro}! Aqui é da Mentorei. A trilha ${turma.nome}${empresa} já está na sua área da plataforma, com a mesma senha: módulos, link das aulas, slides, tarefas e gravações.\n\nhttps://plataforma.mentorei.com.br`
            : `Oi, ${primeiro}! Aqui é da Mentorei. A sua área da trilha ${turma.nome}${empresa} já está pronta: lá ficam os módulos com as datas, o link para entrar nas aulas, os slides, as tarefas e as gravações.\n\nCrie a sua senha neste link (ele não expira):\n${j.link}\n\nDepois é só entrar em plataforma.mentorei.com.br com o e-mail ${a.email}.`,
        });
      } catch (e) { avisar(explicarErro(e), true); }
      w.disabled = false;
      return;
    }
    const s = ev.target.closest('[data-sair], [data-voltar]');
    if (s) {
      const a = porId(s.dataset.sair || s.dataset.voltar);
      const sai = !!s.dataset.sair;
      if (sai && !window.confirm(`Tirar ${a.nome} desta turma? A pessoa deixa de ver a trilha (o login continua, sem nada dentro). Dá para voltar depois.`)) return;
      const { error: e } = await sb.from('turma_alunos').update({ ativo: !sai }).eq('id', a.id);
      if (e) { avisar(explicarErro(e), true); return; }
      avisar(sai ? `${a.nome} saiu da turma.` : `${a.nome} voltou para a turma.`);
      recarregar();
    }
  });
}

async function janelaAdicionar(turma, existentes, aoTerminar) {
  const { janela } = await import('./agenda-dados.js');
  const j = janela('Adicionar alunos', `<div class="grade" style="gap:12px">
    <div class="linha" style="gap:10px"><label class="btn pri" style="cursor:pointer">📄 Importar planilha (Excel ou CSV)<input type="file" id="ad-arquivo" accept=".xlsx,.xls,.csv,.ods" hidden></label>
      <span class="peq apagado" id="ad-arquivo-msg">A planilha precisa ter uma coluna com o nome e outra com o e-mail. WhatsApp e cargo, se tiver.</span></div>
    <p class="peq">Ou copie da planilha as colunas <b>nome</b>, <b>e-mail</b> e, se tiver, <b>WhatsApp</b> e <b>cargo</b>, e cole aqui (uma pessoa por linha).
      Também dá para digitar: <i>Maria Souza; maria@empresa.com.br; 41 99999-0000</i>.</p>
    <textarea id="ad-lista" style="min-height:180px" placeholder="Maria Souza	maria@empresa.com.br	41 99999-0000	Coordenadora"></textarea>
    <div id="ad-previa"></div>
    <div class="linha"><button class="btn pri" type="button" id="ad-ok" disabled>Adicionar</button><button class="btn" type="button" data-fechar>Desistir</button></div>
    <p class="peq apagado">Ninguém recebe nada agora: o convite sai só quando você clicar em enviar.</p></div>`, { largura: 720 });
  const emails = new Set(existentes.map((a) => a.email).filter(Boolean));
  let lista = [];
  const previa = () => {
    const lidas = lerListaColada(j.corpo.querySelector('#ad-lista').value);
    const vistos = new Set();
    lista = lidas.map((p) => {
      const repetido = p.email && (emails.has(p.email) || vistos.has(p.email));
      if (p.email) vistos.add(p.email);
      return { ...p, repetido };
    });
    const entram = lista.filter((p) => !p.repetido);
    j.corpo.querySelector('#ad-previa').innerHTML = lista.length ? `<div class="tabela"><table><tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Cargo</th></tr>
      ${lista.map((p) => `<tr${p.repetido ? ' class="apagado"' : ''}><td>${esc(p.nome)}</td><td>${p.email ? esc(p.email) : '<span class="selo alerta">sem e-mail</span>'}</td><td>${esc(p.whatsapp)}</td>
        <td>${esc(p.cargo)}${p.repetido ? ' <span class="selo neutro">já está na turma</span>' : ''}</td></tr>`).join('')}</table></div>
      <p class="peq mt">${entram.length} aluno${entram.length === 1 ? '' : 's'} para adicionar${lista.some((p) => !p.email && !p.repetido) ? '. Quem está sem e-mail entra na lista, mas só recebe o convite depois que você colocar o e-mail.' : '.'}</p>` : '';
    const b = j.corpo.querySelector('#ad-ok');
    b.disabled = !entram.length;
    b.textContent = entram.length ? `Adicionar ${entram.length} aluno${entram.length > 1 ? 's' : ''}` : 'Adicionar';
  };
  j.corpo.querySelector('#ad-lista').addEventListener('input', previa);
  // planilha: vira a mesma lista do "colar" (dá para conferir e corrigir na caixa antes de adicionar)
  j.corpo.querySelector('#ad-arquivo').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!arq) return;
    const msg = j.corpo.querySelector('#ad-arquivo-msg');
    msg.textContent = `Lendo ${arq.name}…`;
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const livro = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
      const aba = livro.SheetNames.map((n) => livro.Sheets[n]).find((s) => XLSX.utils.sheet_to_json(s, { header: 1, blankrows: false }).length) || livro.Sheets[livro.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, blankrows: false, defval: '', raw: false });
      const texto = linhasDaPlanilha(linhas);
      if (!texto) { msg.textContent = 'Não achei nomes nem e-mails nessa planilha. Confira se é a planilha certa ou copie e cole as colunas aqui embaixo.'; return; }
      const caixa = j.corpo.querySelector('#ad-lista');
      caixa.value = caixa.value.trim() ? `${caixa.value.trim()}\n${texto}` : texto;
      previa();
      const n = lerListaColada(texto).length;
      msg.textContent = `${n} pessoa${n === 1 ? '' : 's'} lida${n === 1 ? '' : 's'} de ${arq.name}. Confira a lista abaixo e clique em Adicionar.`;
    } catch (_) { msg.textContent = 'Não consegui abrir essa planilha. Salve como Excel (.xlsx) ou CSV e tente de novo, ou copie e cole as colunas aqui embaixo.'; }
  });
  j.corpo.querySelector('#ad-ok').addEventListener('click', async (ev) => {
    const entram = lista.filter((p) => !p.repetido);
    ev.target.closest('button').disabled = true;
    const { error } = await sb.from('turma_alunos').insert(entram.map((p) => ({ turma_id: turma.id, nome: p.nome, email: p.email || null, whatsapp: p.whatsapp || null, cargo: p.cargo || null, ativo: true })));
    if (error) { avisar(faltaScript(error) ? 'Falta rodar o script 44-alunos-das-turmas.sql no Supabase.' : explicarErro(error), true); ev.target.closest('button').disabled = false; return; }
    avisar(`${entram.length} aluno${entram.length > 1 ? 's adicionados' : ' adicionado'} à turma.`);
    j.fechar();
    aoTerminar();
  });
}
