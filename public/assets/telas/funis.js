// Funis de e-mail (Vendas → Funis de e-mail, script 34): substitui o RD Station. Pedido da Juliana, 12/10/2026.
// Cada funil tem uma sequência de e-mails com intervalo em dias; empresas marcadas entram e recebem sozinhas (servidor de hora em hora).
// Para cada pessoa: recebeu, abriu, clicou, leu até o fim (página "continuar lendo"), temperatura; regras para passar os engajados
// a outro funil (pode avisar Vendas) e tirar os frios. E-mail errado/devolvido vai para "Contatos para atualizar".
// Clientes = conta principal do Brevo; lista fria = conta separada de marketing (decisão dela).
import { sb, esc, dataBR, dataHoraBR, avisar, explicarErro } from '../base.js';
import { janela, api, faltaScript } from './agenda-dados.js';
import { situacaoDe, SITUACOES, norm } from './vendas.js';
import {
  STATUS_MEMBRO, EM_ANDAMENTO, TEMPERATURAS, temperaturaMembro, montarEmail, montarPagina, MARCADOR_CONTINUAR, DIAS_SEMANA,
  EMAIL_VALIDO, limparEmail, personalizar,
} from '../funis-regras.js';

const AVISO_34 = `<div class="aviso erro">Para os funis de e-mail funcionarem, falta rodar o script <b>34-funis.sql</b> no Supabase (SQL Editor → New query → colar → Run).</div>`;
const PUBLICO = { clientes: ['Clientes e conhecidos', 'selo'], frio: ['Lista fria', 'selo alerta'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const seloTemp = (t) => `<span class="${TEMPERATURAS[t][1]}" title="${esc(TEMPERATURAS[t][2])}">${TEMPERATURAS[t][0]}</span>`;
const seloStatus = (s) => `<span class="${STATUS_MEMBRO[s][1]}">${STATUS_MEMBRO[s][0]}</span>`;
const est = { temp: '', status: 'andamento', texto: '', limite: 200 };   // filtros da lista de pessoas (continuam ao voltar)

async function lerTudo(consulta) {
  const todas = [];
  for (let de = 0; ; de += 1000) {
    const r = await consulta().range(de, de + 999);
    if (r.error) return r;
    todas.push(...(r.data || []));
    if ((r.data || []).length < 1000) return { data: todas, error: null };
  }
}

export async function abaFunis(ctx, el, d, params) {
  const [a, b] = params;
  if (a === 'atualizar') return paginaAtualizar(ctx, el, d);
  if (a && UUID.test(a)) return paginaFunil(ctx, el, d, a, b || 'pessoas');
  return listaFunis(ctx, el, d);
}

// ---------- lista de funis ----------
async function listaFunis(ctx, el, d) {
  const [f, m, at] = await Promise.all([
    sb.from('funis').select('*').eq('arquivado', false).order('criado_em'),
    lerTudo(() => sb.from('funil_membros_resumo').select('id, funil_id, status, recebidos, abertos, automaticos, cliques, leram')),
    sb.from('contatos_atualizar').select('id').is('resolvido_em', null),
  ]);
  if (f.error && faltaScript(f.error)) { el.innerHTML = AVISO_34; return; }
  if (f.error) throw f.error;
  const funis = f.data || [], membros = m.data || [];
  const qtdAtualizar = (at.data || []).length;
  el.innerHTML = `
    <div class="linha" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <p class="peq apagado" style="flex:1;min-width:260px">Marque empresas para entrar num funil: elas recebem a sequência de e-mails sozinhas, no ritmo do funil. Aqui você vê quem abriu, clicou e leu até o fim, limpa a lista e passa os engajados para o próximo funil.</p>
      <a class="btn" href="#/vendas/funis/atualizar">Contatos para atualizar${qtdAtualizar ? ` <span class="selo erro" style="margin-left:6px">${qtdAtualizar}</span>` : ''}</a>
      <button class="btn pri" type="button" id="f-novo">+ Novo funil</button>
    </div>
    <div id="f-situacao" class="mt"></div>
    <div class="grade g3 mt" id="f-lista"></div>`;
  el.querySelector('#f-novo').addEventListener('click', () => formFunil(ctx, null, (novo) => ctx.irPara(`#/vendas/funis/${novo.id}/emails`)));
  el.querySelector('#f-lista').innerHTML = funis.length ? funis.map((fu) => {
    const ms = membros.filter((x) => x.funil_id === fu.id);
    const vivos = ms.filter((x) => EM_ANDAMENTO.includes(x.status));
    const t = (k) => vivos.filter((x) => temperaturaMembro(x) === k).length;
    return `<a class="cartao" href="#/vendas/funis/${fu.id}" style="text-decoration:none;color:inherit;display:grid;gap:10px">
      <div class="linha" style="gap:6px"><h3 style="flex:1">${esc(fu.nome)}</h3><span class="${PUBLICO[fu.publico][1]}">${PUBLICO[fu.publico][0]}</span>${fu.ativo ? '' : '<span class="selo neutro">Pausado</span>'}</div>
      ${fu.descricao ? `<p class="peq apagado" style="margin:0">${esc(fu.descricao)}</p>` : ''}
      <div class="linha" style="gap:18px"><div class="numero"><b>${vivos.length}</b><span>no funil</span></div>
        <div class="numero"><b>${t('quente')}</b><span>🔥 quentes</span></div><div class="numero"><b>${t('morno')}</b><span>mornos</span></div><div class="numero"><b>${t('frio')}</b><span>❄ frios</span></div></div>
      <p class="peq apagado" style="margin:0">${ms.length - vivos.length ? `${ms.length - vivos.length} já saíram (passaram, pediram para sair ou e-mail errado)` : 'Clique para abrir'}</p></a>`;
  }).join('') : `<div class="vazio" style="grid-column:1/-1">Nenhum funil ainda. Comece com <b>+ Novo funil</b>: por exemplo "Clientes inativos – reaproximação" ou "Cooperativas – primeiro contato".</div>`;
  situacaoContas(ctx, el.querySelector('#f-situacao'), funis);
}

const ESTADO_CONTA = {
  sem_chave: 'ainda não ligada', chave_smtp: 'a chave cadastrada é a SMTP (precisa ser a chave de API, que começa com xkeysib-)',
  recusada: 'o Brevo recusou a chave', sem_conexao: 'sem conexão com o Brevo',
};
async function situacaoContas(ctx, el, funis) {
  el.innerHTML = '<p class="peq apagado">Conferindo as contas do Brevo…</p>';
  const r = await api('/api/funis', { acao: 'situacao' });
  if (!r.ok) { el.innerHTML = `<div class="aviso erro">Não consegui conferir as contas do Brevo: ${esc(r.mensagem || '')}</div>`; return; }
  const cfg = (await sb.from('configuracoes').select('valor').eq('chave', 'funis').maybeSingle()).data;
  const lim = (cfg && cfg.valor) || {};
  const temFrio = funis.some((f) => f.publico === 'frio');
  const linhaConta = (nome, s, usada) => {
    if (s.estado === 'ok') return `<li>✅ <b>${nome}</b>: ligada${s.plano ? ` (${esc(s.plano)})` : ''}${s.faltam && s.faltam.length ? ` · <span style="color:var(--erro)">remetente não verificado nesta conta: ${esc(s.faltam.join(', '))}</span>` : ''}</li>`;
    return `<li>${usada ? '⚠️' : '○'} <b>${nome}</b>: ${esc(ESTADO_CONTA[s.estado] || s.estado)}${usada && s.estado === 'sem_chave' ? ' · <button class="btn peq" type="button" data-como>Como ligar</button>' : ''}</li>`;
  };
  const u = r.ultima;
  el.innerHTML = `<details class="cartao" style="padding:12px 16px"${(r.marketing.estado !== 'ok' && temFrio) || (u && u.erros && u.erros.length) ? ' open' : ''}>
    <summary style="cursor:pointer;font-weight:700">Envio dos e-mails${u ? ` · última rodada ${dataHoraBR(u.fim)}: ${u.enviados || 0} enviado(s)` : ' · ainda não rodou'}</summary>
    <ul class="peq mt" style="margin-bottom:6px;padding-left:18px;display:grid;gap:4px">
      ${linhaConta('Conta principal do Brevo (clientes)', r.principal, true)}
      ${linhaConta('Conta de marketing do Brevo (listas frias)', r.marketing, temFrio)}
    </ul>
    ${u && u.erros && u.erros.length ? `<div class="aviso erro peq">${u.erros.map(esc).join('<br>')}</div>` : ''}
    <p class="peq apagado">A plataforma envia de hora em hora, dentro do horário de cada funil, e lê no Brevo quem abriu e clicou.
      Limite por dia: <input type="number" id="lim-p" min="0" max="5000" value="${lim.limite_principal ?? 150}" style="width:80px" aria-label="Limite da conta principal"> na principal
      (ela também manda convites e avisos da plataforma) e <input type="number" id="lim-m" min="0" max="5000" value="${lim.limite_marketing ?? 280}" style="width:80px" aria-label="Limite da conta de marketing"> na de marketing.
      O plano grátis do Brevo manda 300 por dia.</p>
    <div class="linha"><button class="btn peq" type="button" id="lim-salvar">Salvar limites</button><button class="btn peq" type="button" id="rodar">Rodar agora</button></div></details>`;
  el.querySelector('[data-como]')?.addEventListener('click', comoLigarMarketing);
  el.querySelector('#lim-salvar').addEventListener('click', async () => {
    const valor = { limite_principal: Number(el.querySelector('#lim-p').value) || 0, limite_marketing: Number(el.querySelector('#lim-m').value) || 0 };
    const { error } = await sb.from('configuracoes').upsert({ chave: 'funis', valor, atualizado_em: new Date().toISOString() });
    avisar(error ? explicarErro(error) : 'Limites salvos.', !!error);
  });
  el.querySelector('#rodar').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    const x = await api('/api/funis', { acao: 'rodar' });
    avisar(x.ok ? 'Rodada pedida. Em 1 ou 2 minutos, atualize a página para ver o resultado.' : (x.mensagem || 'Não consegui.'), !x.ok);
  });
}

function comoLigarMarketing() {
  janela('Como ligar a conta de marketing do Brevo', `<ol style="display:grid;gap:10px;padding-left:20px;margin:0">
    <li>Abra <b>brevo.com</b> numa janela anônima do navegador e clique em <b>Sign up free</b>. Use um e-mail diferente do que já tem conta no Brevo
      (por exemplo <b>marketing@mentorei.com.br</b> ou um Gmail da empresa).</li>
    <li>Depois de entrar, me avise aqui na conversa: eu digo como verificar o remetente e onde copiar a chave.</li>
    <li>A chave vai na Netlify com o nome <b>BREVO_API_KEY_MARKETING</b>. Eu te guio clique por clique.</li></ol>
    <p class="peq apagado mt">Por que separada? Lista fria (quem nunca pediu nossos e-mails) tem mais reclamação de spam. Se o Brevo bloquear essa conta, os convites da plataforma e o laudo do Radar continuam saindo pela conta principal.</p>`, { largura: 560 });
}

// ---------- criar / editar funil ----------
function formFunil(ctx, f, aoSalvar) {
  const v = f || { publico: 'clientes', dias_semana: [1, 2, 3, 4, 5], hora_inicio: 9, hora_fim: 17, ativo: true };
  const j = janela(f ? 'Editar funil' : 'Novo funil', `<form class="grade" id="ff" style="gap:12px">
    <div class="campo"><label for="ff-nome">Nome do funil</label><input type="text" id="ff-nome" required maxlength="80" value="${esc(v.nome || '')}" placeholder="Ex.: Clientes inativos – reaproximação"></div>
    <div class="campo"><label for="ff-desc">Para que serve (opcional)</label><input type="text" id="ff-desc" maxlength="200" value="${esc(v.descricao || '')}" placeholder="Ex.: reaquecer quem comprou há mais de 1 ano"></div>
    <fieldset class="campo" style="border:0;padding:0;margin:0"><legend class="rotulo">Quem vai receber</legend>
      <label class="check"><input type="radio" name="ff-pub" value="clientes"${v.publico === 'clientes' ? ' checked' : ''}><span><b>Clientes e conhecidos</b> (ativos, inativos, quem já falou com a gente) · sai pela conta principal</span></label>
      <label class="check"><input type="radio" name="ff-pub" value="frio"${v.publico === 'frio' ? ' checked' : ''}><span><b>Lista fria</b> (prospecção, quem nunca pediu nossos e-mails) · sai pela conta de marketing, separada</span></label></fieldset>
    <details${f ? ' open' : ''}><summary style="cursor:pointer" class="rotulo">Remetente e horário de envio</summary>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo"><label for="ff-rn">Nome de quem envia</label><input type="text" id="ff-rn" value="${esc(v.remetente_nome || '')}" placeholder="Mentorei"></div>
        <div class="campo"><label for="ff-re">E-mail de quem envia</label><input id="ff-re" type="email" value="${esc(v.remetente_email || '')}" placeholder="contato@mentorei.com.br"><small>Precisa estar verificado na conta do Brevo.</small></div>
        <div class="campo"><label for="ff-rp">Respostas vão para (opcional)</label><input id="ff-rp" type="email" value="${esc(v.responder_para || '')}" placeholder="o mesmo e-mail de quem envia"></div>
        <div class="campo"><span class="rotulo">Dias da semana</span><div class="chips">${DIAS_SEMANA.map((n, i) => `<label class="check"><input type="checkbox" data-dia="${i}"${(v.dias_semana || []).includes(i) ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
        <div class="campo"><label for="ff-hi">Das (hora de Brasília)</label><input id="ff-hi" type="number" min="0" max="23" value="${v.hora_inicio}"></div>
        <div class="campo"><label for="ff-hf">Até</label><input id="ff-hf" type="number" min="1" max="24" value="${v.hora_fim}"></div>
      </div></details>
    <div class="linha"><button class="btn pri" type="submit">${f ? 'Salvar' : 'Criar funil'}</button></div></form>`, { largura: 640 });
  j.corpo.querySelector('#ff').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = (s) => j.corpo.querySelector(s);
    const dados = {
      nome: q('#ff-nome').value.trim(), descricao: q('#ff-desc').value.trim() || null, publico: j.corpo.querySelector('[name=ff-pub]:checked').value,
      remetente_nome: q('#ff-rn').value.trim() || null, remetente_email: limparEmail(q('#ff-re').value) || null, responder_para: limparEmail(q('#ff-rp').value) || null,
      dias_semana: [...j.corpo.querySelectorAll('[data-dia]')].filter((x) => x.checked).map((x) => Number(x.dataset.dia)),
      hora_inicio: Number(q('#ff-hi').value), hora_fim: Number(q('#ff-hf').value),
    };
    if (!dados.dias_semana.length) { avisar('Marque pelo menos um dia da semana.', true); return; }
    if (dados.hora_fim <= dados.hora_inicio) { avisar('O horário final precisa ser depois do inicial.', true); return; }
    for (const e of [dados.remetente_email, dados.responder_para]) if (e && !EMAIL_VALIDO.test(e)) { avisar(`E-mail inválido: ${e}`, true); return; }
    const r = f ? await sb.from('funis').update(dados).eq('id', f.id).select().single() : await sb.from('funis').insert(dados).select().single();
    if (r.error) { avisar(explicarErro(r.error), true); return; }
    j.fechar(); avisar(f ? 'Funil salvo.' : 'Funil criado. Agora escreva os e-mails da sequência.');
    aoSalvar(r.data);
  });
}

// ---------- página do funil ----------
const ABAS_FUNIL = [['pessoas', 'Pessoas'], ['emails', 'E-mails da sequência'], ['regras', 'Regras automáticas']];
async function paginaFunil(ctx, el, d, id, aba) {
  const [f, todos, em] = await Promise.all([
    sb.from('funis').select('*').eq('id', id).maybeSingle(),
    sb.from('funis').select('id, nome, arquivado').order('criado_em'),
    sb.from('funil_emails').select('*').eq('funil_id', id).order('ordem').order('criado_em'),
  ]);
  if (f.error && faltaScript(f.error)) { el.innerHTML = AVISO_34; return; }
  if (f.error) throw f.error;
  const funil = f.data;
  if (!funil) { el.innerHTML = '<div class="aviso">Funil não encontrado. <a href="#/vendas/funis">Voltar</a></div>'; return; }
  const outros = (todos.data || []).filter((x) => x.id !== id && !x.arquivado);
  const emails = em.data || [];
  if (!ABAS_FUNIL.some(([k]) => k === aba)) aba = 'pessoas';
  const ir = (a) => ctx.irPara(`#/vendas/funis/${id}/${a}`);
  el.innerHTML = `
    <p class="peq"><a href="#/vendas/funis">← Todos os funis</a></p>
    <div class="linha" style="gap:8px;flex-wrap:wrap;margin:6px 0 12px">
      <h2 style="flex:1;min-width:220px">${esc(funil.nome)} <span class="${PUBLICO[funil.publico][1]}" style="vertical-align:4px">${PUBLICO[funil.publico][0]}</span>
        ${funil.ativo ? '' : '<span class="selo neutro" style="vertical-align:4px">Envios pausados</span>'}</h2>
      <button class="btn" type="button" id="fu-pausar">${funil.ativo ? 'Pausar envios' : 'Retomar envios'}</button>
      <button class="btn" type="button" id="fu-editar">Editar funil</button>
      <button class="btn pri" type="button" id="fu-colocar">+ Colocar empresas no funil</button>
    </div>
    ${funil.descricao ? `<p class="peq apagado" style="margin-top:-6px">${esc(funil.descricao)}</p>` : ''}
    ${!emails.length ? '<div class="aviso">Este funil ainda não tem e-mails. Quem entrar fica esperando até você escrever o primeiro, na aba <b>E-mails da sequência</b>.</div>' : ''}
    <nav class="abas" aria-label="Partes do funil">${ABAS_FUNIL.map(([k, t]) => `<button type="button" data-a="${k}" class="${k === aba ? 'atual' : ''}">${t}</button>`).join('')}</nav>
    <div id="fu-conteudo"></div>`;
  el.querySelector('.abas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-a]'); if (b) ir(b.dataset.a); });
  el.querySelector('#fu-editar').addEventListener('click', () => formFunil(ctx, funil, () => ir(aba)));
  el.querySelector('#fu-pausar').addEventListener('click', async () => {
    const { error } = await sb.from('funis').update({ ativo: !funil.ativo }).eq('id', id);
    if (error) { avisar(explicarErro(error), true); return; }
    avisar(funil.ativo ? 'Envios pausados. Ninguém recebe nada até você retomar.' : 'Envios retomados.'); ir(aba);
  });
  el.querySelector('#fu-colocar').addEventListener('click', () => colocarEmpresas(ctx, d, funil, () => ir('pessoas')));
  const alvo = el.querySelector('#fu-conteudo');
  if (aba === 'emails') return abaEmails(ctx, alvo, funil, emails, () => ir('emails'));
  if (aba === 'regras') return abaRegras(ctx, alvo, d, funil, outros, () => ir('regras'));
  return abaPessoas(ctx, alvo, d, funil, outros, emails, () => ir('pessoas'));
}

// ---------- pessoas do funil ----------
async function abaPessoas(ctx, el, d, funil, outros, emails, recarregar) {
  const r = await lerTudo(() => sb.from('funil_membros_resumo').select('*').eq('funil_id', funil.id).order('entrou_em', { ascending: false }));
  if (r.error) throw r.error;
  const membros = r.data || [];
  const empresaDe = (id) => d.empresas.find((e) => e.id === id);
  membros.forEach((m) => { m.temp = temperaturaMembro(m); });
  const vivos = membros.filter((m) => EM_ANDAMENTO.includes(m.status));
  const frios = vivos.filter((m) => m.status === 'ativo' && m.temp === 'frio');
  const marcados = new Set();
  el.innerHTML = `
    <div class="chips" id="pp-temp" style="margin-bottom:8px;align-items:center"></div>
    <div class="linha ag-filtros" style="flex-wrap:wrap">
      <input type="search" id="pp-texto" placeholder="Nome, e-mail ou empresa…" value="${esc(est.texto)}" style="width:auto;min-width:220px" aria-label="Procurar">
      <select id="pp-status" aria-label="Situação">
        <option value="andamento"${est.status === 'andamento' ? ' selected' : ''}>No funil (${vivos.length})</option>
        <option value="saiu"${est.status === 'saiu' ? ' selected' : ''}>Já saíram (${membros.length - vivos.length})</option>
        <option value=""${est.status === '' ? ' selected' : ''}>Todos (${membros.length})</option></select>
      <span style="flex:1"></span>
      ${frios.length ? `<button class="btn" type="button" id="pp-frios">Tirar os frios (${frios.length})</button>` : ''}
      <button class="btn" type="button" id="pp-avulsa">+ Pessoa</button>
    </div>
    <div class="cartao linha" id="pp-barra" style="padding:10px 14px;margin-bottom:10px;gap:8px;flex-wrap:wrap" hidden>
      <b id="pp-qtd"></b><span style="flex:1"></span>
      <button class="btn peq escuro" type="button" data-acao="mover">Mandar para outro funil</button>
      <button class="btn peq" type="button" data-acao="pausar">Pausar</button><button class="btn peq" type="button" data-acao="retomar">Retomar</button>
      <button class="btn peq" type="button" data-acao="tirar">Tirar do funil</button><button class="btn peq" type="button" data-acao="limpar">Desmarcar</button></div>
    <div class="tabela cartao" style="padding:0"><table><thead><tr><th style="width:32px"><input type="checkbox" id="pp-todos" aria-label="Marcar todos os da lista"></th>
      <th>Pessoa</th><th>Recebeu</th><th>Abriu</th><th>Clicou</th><th>Leu até o fim</th><th>Temperatura</th><th>Situação</th></tr></thead><tbody id="pp-corpo"></tbody></table></div>
    <div class="linha mt" id="pp-mais"></div>
    <p class="peq apagado mt">🔥 <b>Quente</b> = clicou ou leu até o fim · <b>Morno</b> = abriu · <b>Sem como saber</b> = só aberturas automáticas (o iPhone e alguns antivírus abrem sozinhos; não dá para saber se a pessoa leu) ·
      ❄ <b>Frio</b> = recebeu 3 ou mais e nenhum sinal. "Abriu" é aproximado; o sinal mais confiável é o clique.</p>`;

  const filtrados = () => {
    const t = norm(est.texto);
    return membros.filter((m) => {
      if (est.status === 'andamento' && !EM_ANDAMENTO.includes(m.status)) return false;
      if (est.status === 'saiu' && EM_ANDAMENTO.includes(m.status)) return false;
      if (est.temp && m.temp !== est.temp) return false;
      if (t && !norm([m.nome, m.email, (empresaDe(m.empresa_id) || {}).nome].join(' ')).includes(t)) return false;
      return true;
    });
  };
  const desenhar = () => {
    const base = membros.filter((m) => (est.status === 'andamento' ? EM_ANDAMENTO.includes(m.status) : est.status === 'saiu' ? !EM_ANDAMENTO.includes(m.status) : true));
    el.querySelector('#pp-temp').innerHTML = `<b class="peq" style="margin-right:4px">Temperatura:</b>${[['', 'Todas', base.length], ...Object.keys(TEMPERATURAS).map((k) => [k, TEMPERATURAS[k][0], base.filter((m) => m.temp === k).length])]
      .map(([k, n, q]) => `<button type="button" class="btn peq${k === est.temp ? ' escuro' : ''}" data-temp="${k}" title="${k ? esc(TEMPERATURAS[k][2]) : ''}">${n}<span class="n">${q}</span></button>`).join('')}`;
    const l = filtrados();
    const nEmails = emails.filter((e) => e.ativo).length;
    el.querySelector('#pp-corpo').innerHTML = l.slice(0, est.limite).map((m) => {
      const emp = empresaDe(m.empresa_id);
      return `<tr><td><input type="checkbox" data-m="${m.id}"${marcados.has(m.id) ? ' checked' : ''} aria-label="Marcar ${esc(m.nome || m.email)}"></td>
        <td><button type="button" class="kb-link" data-ver="${m.id}" style="background:none;border:0;padding:0;text-align:left;cursor:pointer;font:inherit"><b>${esc(m.nome || m.email)}</b></button>
          <div class="peq apagado">${esc(m.email)}${emp ? ` · <a href="#/vendas/empresa/${emp.id}">${esc(emp.nome)}</a>` : ''}</div></td>
        <td>${m.recebidos}${nEmails ? ` de ${nEmails}` : ''}</td>
        <td>${m.abertos || (m.automaticos ? '<span class="apagado" title="Só aberturas automáticas">?</span>' : '—')}</td>
        <td>${m.cliques || '—'}</td><td>${m.leram || '—'}</td>
        <td>${seloTemp(m.temp)}</td><td>${seloStatus(m.status)}${m.motivo && !EM_ANDAMENTO.includes(m.status) ? `<div class="peq apagado">${esc(m.motivo)}</div>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="8" class="apagado">${membros.length ? 'Ninguém com esses filtros.' : 'Ninguém no funil ainda. Clique em <b>+ Colocar empresas no funil</b>.'}</td></tr>`;
    el.querySelector('#pp-mais').innerHTML = l.length > est.limite
      ? `<span class="peq apagado">Mostrando ${est.limite} de ${l.length}.</span><button class="btn peq" type="button" id="pp-mais-btn">Mostrar mais 200</button>`
      : `<span class="peq apagado">${l.length} pessoa(s).</span>`;
    el.querySelector('#pp-todos').checked = l.length > 0 && l.every((m) => marcados.has(m.id));
    barra();
  };
  const barra = () => {
    el.querySelector('#pp-barra').hidden = !marcados.size;
    el.querySelector('#pp-qtd').textContent = `${marcados.size} marcada(s)`;
  };
  el.querySelector('#pp-temp').addEventListener('click', (ev) => { const b = ev.target.closest('[data-temp]'); if (b) { est.temp = b.dataset.temp; est.limite = 200; desenhar(); } });
  el.querySelector('#pp-texto').addEventListener('input', (ev) => { est.texto = ev.target.value; desenhar(); });
  el.querySelector('#pp-status').addEventListener('input', (ev) => { est.status = ev.target.value; est.limite = 200; desenhar(); });
  el.querySelector('#pp-mais').addEventListener('click', (ev) => { if (ev.target.closest('#pp-mais-btn')) { est.limite += 200; desenhar(); } });
  el.querySelector('#pp-todos').addEventListener('change', (ev) => { filtrados().forEach((m) => (ev.target.checked ? marcados.add(m.id) : marcados.delete(m.id))); desenhar(); });
  el.querySelector('#pp-corpo').addEventListener('change', (ev) => { const c = ev.target.closest('[data-m]'); if (c) { if (c.checked) marcados.add(c.dataset.m); else marcados.delete(c.dataset.m); barra(); } });
  el.querySelector('#pp-corpo').addEventListener('click', (ev) => { const b = ev.target.closest('[data-ver]'); if (b) verPessoa(membros.find((m) => m.id === b.dataset.ver), funil, emails, empresaDe); });
  el.querySelector('#pp-avulsa').addEventListener('click', () => pessoaAvulsa(d, funil, recarregar));
  el.querySelector('#pp-frios')?.addEventListener('click', async () => {
    if (!confirm(`Tirar ${frios.length} pessoa(s) fria(s) deste funil? Elas receberam 3 ou mais e-mails e não deram nenhum sinal. Continuam cadastradas na plataforma.`)) return;
    await mudarStatus(frios.map((m) => m.id), { status: 'removido', motivo: 'Tirada por estar fria (nenhum sinal)', saiu_em: new Date().toISOString(), proximo_envio_em: null });
    recarregar();
  });
  el.querySelector('#pp-barra').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-acao]'); if (!b) return;
    const ids = [...marcados];
    if (b.dataset.acao === 'limpar') { marcados.clear(); desenhar(); return; }
    if (b.dataset.acao === 'mover') { janelaMover(ctx, d, funil, outros, ids, recarregar); return; }
    if (b.dataset.acao === 'tirar') {
      if (!confirm(`Tirar ${ids.length} pessoa(s) deste funil? Elas param de receber os e-mails deste funil.`)) return;
      await mudarStatus(ids, { status: 'removido', motivo: `Tirada por ${ctx.perfil.nome}`, saiu_em: new Date().toISOString(), proximo_envio_em: null });
    }
    if (b.dataset.acao === 'pausar') await mudarStatus(ids.filter((x) => (membros.find((m) => m.id === x) || {}).status === 'ativo'), { status: 'pausado' });
    if (b.dataset.acao === 'retomar') await mudarStatus(ids.filter((x) => ['pausado', 'removido'].includes((membros.find((m) => m.id === x) || {}).status)), { status: 'ativo', motivo: null, saiu_em: null, proximo_envio_em: new Date().toISOString() });
    recarregar();
  });
  desenhar();
}

async function mudarStatus(ids, dados) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from('funil_membros').update(dados).in('id', ids.slice(i, i + 200));
    if (error) { avisar(explicarErro(error), true); return false; }
  }
  avisar('Pronto.');
  return true;
}

function janelaMover(ctx, d, funil, outros, ids, recarregar) {
  if (!outros.length) { avisar('Crie primeiro o outro funil (Vendas → Funis de e-mail → + Novo funil).', true); return; }
  const j = janela(`Mandar ${ids.length} pessoa(s) para outro funil`, `<div class="grade" style="gap:12px">
    <div class="campo"><label for="mv-dest">Para qual funil</label><select id="mv-dest">${outros.map((o) => `<option value="${o.id}">${esc(o.nome)}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" id="mv-vendas"><span>Avisar Vendas: cria uma oportunidade (ou anotação na que já existe) com próximo contato para o responsável</span></label>
    <div class="campo" id="mv-resp-c" hidden><label for="mv-resp">Responsável (vazio = o responsável do sistema na Prospecção)</label>
      <select id="mv-resp"><option value="">—</option>${d.equipe.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>
    <p class="peq apagado">Elas saem deste funil (ficam como "Passou para outro funil") e começam a sequência do novo do primeiro e-mail. Quem pediu para sair não entra.</p>
    <div class="linha"><button class="btn pri" type="button" id="mv-ok">Mandar</button></div></div>`, { largura: 560 });
  j.corpo.querySelector('#mv-vendas').addEventListener('change', (ev) => { j.corpo.querySelector('#mv-resp-c').hidden = !ev.target.checked; });
  j.corpo.querySelector('#mv-ok').addEventListener('click', async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Mandando…';
    const r = await api('/api/funis', { acao: 'mover', ids, destino: j.corpo.querySelector('#mv-dest').value, vendas: j.corpo.querySelector('#mv-vendas').checked, responsavel: j.corpo.querySelector('#mv-resp').value || null });
    if (!r.ok) { avisar(r.mensagem || 'Não consegui.', true); ev.target.disabled = false; ev.target.textContent = 'Mandar'; return; }
    j.fechar(); avisar(`${r.movidos} pessoa(s) passaram de funil${r.avisos ? `; ${r.avisos} aviso(s) em Vendas` : ''}.`); recarregar();
  });
}

async function verPessoa(m, funil, emails, empresaDe) {
  const { data: envios } = await sb.from('funil_envios').select('*').eq('membro_id', m.id).order('enviado_em');
  const { data: evs } = await sb.from('funil_eventos').select('envio_id, tipo, link, em').in('envio_id', (envios || []).map((v) => v.id).concat([-1])).order('em');
  const emp = empresaDe(m.empresa_id);
  const NOME_EV = { abriu: 'Abriu', automatico: 'Abertura/clique automático', clicou: 'Clicou', leu: 'Leu até o fim', pagina: 'Abriu a página "continuar lendo"', devolvido: 'Voltou (não existe)', devolvido_temp: 'Voltou (temporário)', invalido: 'Endereço inválido', bloqueado: 'Bloqueado pelo Brevo', spam: 'Marcou como spam', saiu: 'Saiu da lista', erro: 'Erro no envio' };
  const prox = m.status === 'ativo' && m.proximo_envio_em ? `<p class="peq">Próximo envio: <b>${dataHoraBR(m.proximo_envio_em)}</b> (se estiver no horário do funil).</p>` : '';
  janela(m.nome || m.email, `<p class="peq">${esc(m.email)}${emp ? ` · ${esc(emp.nome)}` : ''}<br>Entrou em ${dataBR(m.entrou_em)}${m.origem ? ` · ${esc(m.origem)}` : ''} · ${seloStatus(m.status)} ${seloTemp(m.temp)}</p>
    ${m.motivo ? `<p class="peq apagado">${esc(m.motivo)}</p>` : ''}${prox}
    <div class="grade mt" style="gap:10px">${(envios || []).map((v) => {
      const meus = (evs || []).filter((x) => x.envio_id === v.id);
      return `<div style="border-left:3px solid var(--bege);padding:2px 0 2px 12px"><b>${esc(personalizar(v.assunto || (emails.find((e) => e.id === v.email_id) || {}).assunto || 'E-mail', { nome: m.nome, empresa: emp && emp.nome }))}</b>
        <div class="peq apagado">${v.status === 'enviado' ? `Enviado em ${dataHoraBR(v.enviado_em)}` : v.status === 'erro' ? `Não enviado: ${esc(v.erro || '')}` : 'Enviando…'}
        ${v.leitura_pct != null ? ` · leu ${v.leitura_pct}% da página (${v.leitura_seg || 0}s)` : ''}</div>
        ${meus.length ? `<ul class="peq" style="margin:4px 0 0;padding-left:18px">${meus.map((x) => `<li>${dataHoraBR(x.em)} · ${NOME_EV[x.tipo] || esc(x.tipo)}${x.link && x.tipo !== 'pagina' ? ` · <span class="apagado">${esc(x.link.slice(0, 70))}</span>` : ''}</li>`).join('')}</ul>` : ''}</div>`;
    }).join('') || '<p class="apagado">Ainda não recebeu nenhum e-mail deste funil.</p>'}</div>`, { largura: 620 });
}

function pessoaAvulsa(d, funil, recarregar) {
  const j = janela('Colocar uma pessoa no funil', `<form class="grade" id="pa" style="gap:12px">
    <div class="campo"><label for="pa-nome">Nome</label><input type="text" id="pa-nome" maxlength="120"></div>
    <div class="campo"><label for="pa-email">E-mail</label><input id="pa-email" type="email" required></div>
    <div class="campo"><label for="pa-emp">Empresa (opcional)</label><input type="text" id="pa-emp" list="pa-emps" placeholder="Digite para procurar"><datalist id="pa-emps">${d.empresas.map((e) => `<option value="${esc(e.nome)}">`).join('')}</datalist></div>
    <div class="linha"><button class="btn pri" type="submit">Colocar no funil</button></div></form>`, { largura: 520 });
  j.corpo.querySelector('#pa').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = limparEmail(j.corpo.querySelector('#pa-email').value);
    if (!EMAIL_VALIDO.test(email)) { avisar('E-mail inválido.', true); return; }
    const nomeEmp = j.corpo.querySelector('#pa-emp').value.trim();
    const emp = nomeEmp ? d.empresas.find((e) => e.nome === nomeEmp) : null;
    const { data: desc } = await sb.from('descadastros').select('email').eq('email', email);
    if (desc && desc.length) { avisar('Esta pessoa pediu para sair da lista: não pode receber e-mails de funil.', true); return; }
    const { error } = await sb.from('funil_membros').insert({ funil_id: funil.id, email, nome: j.corpo.querySelector('#pa-nome').value.trim() || null, empresa_id: emp ? emp.id : null, origem: 'Colocada à mão' });
    if (error) { avisar(/duplicate/i.test(error.message) ? 'Este e-mail já está neste funil.' : explicarErro(error), true); return; }
    j.fechar(); avisar('Pessoa colocada no funil.'); recarregar();
  });
}

// ---------- colocar empresas no funil ----------
async function colocarEmpresas(ctx, d, funil, aoTerminar) {
  const [jaR, descR, atR] = await Promise.all([
    lerTudo(() => sb.from('funil_membros').select('email').eq('funil_id', funil.id)),
    lerTudo(() => sb.from('descadastros').select('email')),
    lerTudo(() => sb.from('contatos_atualizar').select('email').is('resolvido_em', null)),
  ]);
  const jaNoFunil = new Set((jaR.data || []).map((x) => x.email));
  const descad = new Set((descR.data || []).map((x) => x.email));
  const paraAtualizar = new Set((atR.data || []).map((x) => x.email));
  const listaDe = (empId) => [...new Set(d.oportunidades.filter((o) => o.empresa_id === empId && o.lista).map((o) => o.lista))];
  const emProspeccao = (empId) => d.oportunidades.some((o) => o.empresa_id === empId && o.etapa === 'prospectar');
  const empresas = d.empresas.map((e) => ({ ...e, sit: situacaoDe(e, d), listas: listaDe(e.id), prosp: emProspeccao(e.id) }));
  const sistemas = [...new Set(empresas.map((e) => e.sistema).filter(Boolean))].sort();
  const ufs = [...new Set(empresas.map((e) => e.uf).filter(Boolean))].sort();
  const listas = [...new Set(empresas.flatMap((e) => e.listas))].sort();
  const f = { texto: '', sit: '', lista: '', sistema: '', uf: '', tipo: '', quem: 'todos', geral: false };
  const marcadas = new Set();

  // e-mails que entram de uma empresa, conforme a escolha "quem recebe"
  const pessoasDe = (e) => {
    const cs = d.contatos.filter((c) => c.empresa_id === e.id && c.ativo !== false && c.email && (f.quem === 'todos' || c.marketing));
    const out = cs.map((c) => ({ email: limparEmail(c.email), nome: c.nome, contato_id: c.id, empresa_id: e.id }));
    if (e.email && (f.geral || (!cs.length && f.quem === 'todos'))) out.push({ email: limparEmail(e.email), nome: null, contato_id: null, empresa_id: e.id });
    const vistos = new Set();
    return out.filter((p) => p.email && !vistos.has(p.email) && vistos.add(p.email));
  };
  const j = janela(`Colocar empresas no funil "${funil.nome}"`, `
    <div class="linha ag-filtros" style="flex-wrap:wrap">
      <input type="search" id="ce-texto" placeholder="Empresa, cidade, CNPJ…" style="width:auto;min-width:200px" aria-label="Procurar">
      <select id="ce-sit" aria-label="Situação"><option value="">Todas as situações</option>${Object.entries(SITUACOES).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('')}</select>
      <select id="ce-lista" aria-label="Lista"><option value="">Todas as listas</option><option value="-">Na Prospecção (nunca compraram)</option>${listas.map((l) => `<option>${esc(l)}</option>`).join('')}</select>
      ${sistemas.length ? `<select id="ce-sistema" aria-label="Sistema"><option value="">Todos os sistemas</option>${sistemas.map((s) => `<option>${esc(s)}</option>`).join('')}</select>` : ''}
      <select id="ce-uf" aria-label="Estado"><option value="">Todos os estados</option>${ufs.map((u) => `<option>${esc(u)}</option>`).join('')}</select>
      <select id="ce-tipo" aria-label="Tipo"><option value="">Cooperativas e empresas</option><option value="cooperativa">Só cooperativas</option><option value="empresa">Só empresas</option></select>
    </div>
    <div class="linha" style="gap:14px;flex-wrap:wrap;margin:6px 0 10px">
      <b class="peq">Quem recebe:</b>
      <label class="check"><input type="radio" name="ce-quem" value="todos" checked><span>Todos os contatos com e-mail (sem contato, o e-mail geral da empresa)</span></label>
      <label class="check"><input type="radio" name="ce-quem" value="marketing"><span>Só contatos marcados para marketing</span></label>
      <label class="check"><input type="checkbox" id="ce-geral"><span>Incluir sempre o e-mail geral da empresa</span></label>
    </div>
    <div class="tabela cartao" style="padding:0;max-height:52vh;overflow:auto"><table><thead><tr><th style="width:32px"><input type="checkbox" id="ce-todas" aria-label="Marcar todas da lista"></th>
      <th>Empresa</th><th>Situação</th><th>Onde</th><th>E-mails</th></tr></thead><tbody id="ce-corpo"></tbody></table></div>
    <div class="linha mt" style="gap:10px;flex-wrap:wrap"><span id="ce-resumo" class="peq" style="flex:1"></span><button class="btn pri" type="button" id="ce-ok" disabled>Colocar no funil</button></div>`, { largura: 1040 });
  const q = (s) => j.corpo.querySelector(s);
  const filtradas = () => {
    const t = norm(f.texto);
    return empresas.filter((e) => {
      if (f.sit && e.sit !== f.sit) return false;
      if (f.lista === '-' ? !(e.prosp && !e.listas.length) : f.lista && !e.listas.includes(f.lista)) return false;
      if (f.sistema && e.sistema !== f.sistema) return false;
      if (f.uf && e.uf !== f.uf) return false;
      if (f.tipo && e.tipo !== f.tipo) return false;
      if (t && !norm([e.nome, e.razao_social, e.cidade, e.cnpj].join(' ')).includes(t)) return false;
      return true;
    });
  };
  const contar = () => {
    let entram = 0, ja = 0, saiu = 0, errados = 0, semEmail = 0;
    for (const e of empresas.filter((x) => marcadas.has(x.id))) {
      const ps = pessoasDe(e);
      if (!ps.length) semEmail += 1;
      for (const p of ps) {
        if (jaNoFunil.has(p.email)) ja += 1; else if (descad.has(p.email)) saiu += 1; else if (!EMAIL_VALIDO.test(p.email) || paraAtualizar.has(p.email)) errados += 1; else entram += 1;
      }
    }
    return { entram, ja, saiu, errados, semEmail };
  };
  const desenhar = () => {
    const l = filtradas();
    q('#ce-corpo').innerHTML = l.slice(0, 600).map((e) => {
      const ps = pessoasDe(e);
      return `<tr><td><input type="checkbox" data-e="${e.id}"${marcadas.has(e.id) ? ' checked' : ''} aria-label="Marcar ${esc(e.nome)}"></td>
        <td><b>${esc(e.nome)}</b>${e.listas.length ? `<div class="peq apagado">Lista: ${esc(e.listas.join(', '))}</div>` : ''}</td>
        <td><span class="${SITUACOES[e.sit][1]}">${SITUACOES[e.sit][0]}</span></td>
        <td class="peq">${esc([e.sistema, e.cidade && `${e.cidade}${e.uf ? `/${e.uf}` : ''}`].filter(Boolean).join(' · ') || '—')}</td>
        <td class="peq">${ps.length ? ps.map((p) => `<span title="${esc(p.nome || 'e-mail geral')}"${jaNoFunil.has(p.email) ? ' class="apagado"' : ''}>${esc(p.email)}${jaNoFunil.has(p.email) ? ' (já está)' : descad.has(p.email) ? ' (saiu da lista)' : ''}</span>`).join('<br>') : '<span class="apagado">sem e-mail</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="apagado">Nenhuma empresa com esses filtros.</td></tr>';
    q('#ce-todas').checked = l.length > 0 && l.every((e) => marcadas.has(e.id));
    const c = contar();
    q('#ce-resumo').innerHTML = marcadas.size
      ? `<b>${marcadas.size} empresa(s)</b> marcada(s) · vão entrar <b>${c.entram} e-mail(s)</b>${c.ja ? ` · ${c.ja} já estão no funil` : ''}${c.saiu ? ` · ${c.saiu} pediram para sair (não entram)` : ''}${c.errados ? ` · ${c.errados} com e-mail errado (vão para "Contatos para atualizar")` : ''}${c.semEmail ? ` · ${c.semEmail} sem nenhum e-mail` : ''}`
      : `${l.length} empresa(s) na lista${l.length > 600 ? ' (mostrando 600: use os filtros)' : ''}. Marque as que vão entrar.`;
    q('#ce-ok').disabled = !c.entram && !c.errados;
  };
  q('#ce-texto').addEventListener('input', (ev) => { f.texto = ev.target.value; desenhar(); });
  for (const [s, k] of [['#ce-sit', 'sit'], ['#ce-lista', 'lista'], ['#ce-sistema', 'sistema'], ['#ce-uf', 'uf'], ['#ce-tipo', 'tipo']]) q(s)?.addEventListener('input', (ev) => { f[k] = ev.target.value; desenhar(); });
  j.corpo.querySelectorAll('[name=ce-quem]').forEach((r) => r.addEventListener('change', () => { f.quem = j.corpo.querySelector('[name=ce-quem]:checked').value; desenhar(); }));
  q('#ce-geral').addEventListener('change', (ev) => { f.geral = ev.target.checked; desenhar(); });
  q('#ce-todas').addEventListener('change', (ev) => { filtradas().forEach((e) => (ev.target.checked ? marcadas.add(e.id) : marcadas.delete(e.id))); desenhar(); });
  q('#ce-corpo').addEventListener('change', (ev) => { const c = ev.target.closest('[data-e]'); if (c) { if (c.checked) marcadas.add(c.dataset.e); else marcadas.delete(c.dataset.e); desenhar(); } });
  q('#ce-ok').addEventListener('click', async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Colocando…';
    const novos = [], errados = [];
    for (const e of empresas.filter((x) => marcadas.has(x.id))) {
      for (const p of pessoasDe(e)) {
        if (jaNoFunil.has(p.email) || descad.has(p.email)) continue;
        if (!EMAIL_VALIDO.test(p.email) || paraAtualizar.has(p.email)) { errados.push({ ...p, empresa: e }); continue; }
        novos.push({ funil_id: funil.id, email: p.email, nome: p.nome, empresa_id: p.empresa_id, contato_id: p.contato_id, origem: `Marcada por ${ctx.perfil.nome}` });
        jaNoFunil.add(p.email);
      }
    }
    for (let i = 0; i < novos.length; i += 500) {
      const { error } = await sb.from('funil_membros').upsert(novos.slice(i, i + 500), { onConflict: 'funil_id,email', ignoreDuplicates: true });
      if (error) { avisar(explicarErro(error), true); ev.target.disabled = false; ev.target.textContent = 'Colocar no funil'; return; }
    }
    // e-mail com formato errado: vai para "Contatos para atualizar" (uma linha aberta por e-mail)
    const novosErrados = errados.filter((p) => !paraAtualizar.has(p.email));
    if (novosErrados.length) {
      await sb.from('contatos_atualizar').insert(novosErrados.map((p) => ({ email: p.email, nome: p.nome, empresa_id: p.empresa_id, contato_id: p.contato_id, motivo: 'Endereço escrito errado', funis: [funil.id] })));
    }
    j.fechar();
    avisar(`${novos.length} e-mail(s) entraram no funil.${errados.length ? ` ${errados.length} com e-mail errado foram para "Contatos para atualizar".` : ''}${funil.ativo ? ' O primeiro e-mail sai na próxima rodada dentro do horário do funil.' : ' Atenção: os envios deste funil estão pausados.'}`);
    aoTerminar();
  });
  desenhar();
}

// ---------- e-mails da sequência ----------
async function abaEmails(ctx, el, funil, emails, recarregar) {
  const env = await lerTudo(() => sb.from('funil_envios').select('email_id, status, aberto_em, automatico_em, clicado_em, leu_em, problema').eq('funil_id', funil.id));
  if (env.error) throw env.error;
  const envios = env.data || [];
  let acumulado = 0;
  el.innerHTML = `
    <div class="linha" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
      <p class="peq apagado" style="flex:1;min-width:260px">Cada pessoa recebe os e-mails nesta ordem. O intervalo conta a partir do e-mail anterior (o primeiro, a partir da entrada no funil).
        Envio: ${funil.dias_semana.map((x) => DIAS_SEMANA[x]).join(', ')}, das ${funil.hora_inicio}h às ${funil.hora_fim}h.</p>
      <button class="btn pri" type="button" id="em-novo">+ Novo e-mail</button></div>
    <div class="grade" style="gap:10px" id="em-lista">${emails.map((e, i) => {
      const meus = envios.filter((v) => v.email_id === e.id && v.status === 'enviado');
      const n = meus.length, ab = meus.filter((v) => v.aberto_em).length, cl = meus.filter((v) => v.clicado_em).length;
      const leu = meus.filter((v) => v.leu_em).length, auto = meus.filter((v) => v.automatico_em && !v.aberto_em && !v.clicado_em).length;
      const prob = meus.filter((v) => v.problema && v.problema !== 'erro').length;
      acumulado += e.ativo ? e.dias_depois : 0;
      return `<div class="cartao linha" style="gap:14px;flex-wrap:wrap;align-items:flex-start${e.ativo ? '' : ';opacity:.6'}">
        <div style="font-family:var(--f-titulo);font-size:26px;font-weight:800;min-width:34px">${i + 1}</div>
        <div style="flex:1;min-width:220px"><b>${esc(e.assunto || '(sem assunto)')}</b>
          <div class="peq apagado">${i === 0 ? (e.dias_depois ? `${e.dias_depois} dia(s) depois de entrar` : 'Assim que entrar no funil') : `${e.dias_depois} dia(s) depois do anterior`} · dia ${acumulado} da sequência${e.ativo ? '' : ' · <b>desligado</b>'}${/\[continuar lendo\]/i.test(e.corpo || '') ? ' · com "continuar lendo"' : ''}</div></div>
        <div class="linha peq" style="gap:16px">
          <div class="numero"><b style="font-size:22px">${n}</b><span>enviados</span></div>
          <div class="numero"><b style="font-size:22px">${pct(ab, n)}</b><span>abriram${auto ? ` (+${auto} ?)` : ''}</span></div>
          <div class="numero"><b style="font-size:22px">${pct(cl, n)}</b><span>clicaram</span></div>
          <div class="numero"><b style="font-size:22px">${leu}</b><span>leram até o fim</span></div>
          ${prob ? `<div class="numero"><b style="font-size:22px;color:var(--erro)">${prob}</b><span>problemas</span></div>` : ''}</div>
        <div class="linha" style="gap:6px"><button class="btn peq" type="button" data-sobe="${e.id}"${i === 0 ? ' disabled' : ''} aria-label="Subir">↑</button>
          <button class="btn peq" type="button" data-desce="${e.id}"${i === emails.length - 1 ? ' disabled' : ''} aria-label="Descer">↓</button>
          <button class="btn peq" type="button" data-editar="${e.id}">Editar</button></div></div>`;
    }).join('') || '<div class="vazio">Nenhum e-mail ainda. Clique em <b>+ Novo e-mail</b>.</div>'}</div>
    <p class="peq apagado mt">"Abriram" é aproximado (o iPhone abre sozinho: esses aparecem como "?"). Para saber quem <b>leu até o fim</b>, use o botão <b>"continuar lendo"</b> no texto: o e-mail mostra o começo e o resto abre numa página nossa, que mede até onde a pessoa leu.</p>`;
  el.querySelector('#em-novo').addEventListener('click', () => editorEmail(ctx, funil, null, emails, recarregar));
  el.querySelector('#em-lista').addEventListener('click', async (ev) => {
    const ed = ev.target.closest('[data-editar]');
    if (ed) { editorEmail(ctx, funil, emails.find((e) => e.id === ed.dataset.editar), emails, recarregar); return; }
    const mv = ev.target.closest('[data-sobe],[data-desce]');
    if (!mv) return;
    const id = mv.dataset.sobe || mv.dataset.desce;
    const i = emails.findIndex((e) => e.id === id), k = mv.dataset.sobe ? i - 1 : i + 1;
    const ordem = emails.map((e) => e.id); [ordem[i], ordem[k]] = [ordem[k], ordem[i]];
    for (const [n, eid] of ordem.entries()) await sb.from('funil_emails').update({ ordem: n + 1 }).eq('id', eid);
    recarregar();
  });
}

const PESSOA_EXEMPLO = { nome: 'Juliana', empresa: 'Cooperativa Exemplo' };
function editorEmail(ctx, funil, e, emails, recarregar) {
  const v = e || { formato: 'texto', dias_depois: emails.length ? 7 : 0, ativo: true, corpo: 'Olá, {nome}!\n\n' };
  const j = janela(e ? 'Editar e-mail' : 'Novo e-mail da sequência', `
    <div class="grade" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px" id="ed-grade">
      <form class="grade" id="ed" style="gap:10px;align-content:start">
        <div class="campo"><label for="ed-assunto">Assunto</label><input type="text" id="ed-assunto" maxlength="150" required value="${esc(v.assunto || '')}" placeholder="Ex.: {nome}, uma pergunta sobre os líderes da {empresa}"></div>
        <div class="campo"><label for="ed-pre">Texto que aparece ao lado do assunto (opcional)</label><input type="text" id="ed-pre" maxlength="150" value="${esc(v.preheader || '')}"></div>
        <div class="grade g2" style="gap:10px">
          <div class="campo"><label for="ed-dias">${emails.length && (!e || emails[0].id !== e.id) ? 'Dias depois do e-mail anterior' : 'Dias depois de entrar no funil'}</label><input id="ed-dias" type="number" min="0" max="365" value="${v.dias_depois}"></div>
          <div class="campo"><label for="ed-formato">Formato</label><select id="ed-formato"><option value="texto"${v.formato === 'texto' ? ' selected' : ''}>Texto com a cara da Mentorei</option><option value="html"${v.formato === 'html' ? ' selected' : ''}>Colar HTML pronto</option></select></div>
        </div>
        <div id="ed-texto" class="grade" style="gap:10px">
          <div class="campo"><label for="ed-titulo">Título dentro do e-mail (opcional)</label><input type="text" id="ed-titulo" maxlength="150" value="${esc(v.titulo || '')}"></div>
          <div class="campo"><span class="rotulo">Imagem no topo (opcional)</span><div class="linha" style="gap:6px"><input type="text" id="ed-img" value="${esc(v.imagem_url || '')}" placeholder="Endereço da imagem" style="flex:1" aria-label="Endereço da imagem">
            <label class="btn peq" style="cursor:pointer">Enviar imagem<input type="file" id="ed-img-arq" accept="image/*" hidden></label></div></div>
          <div class="campo"><label for="ed-corpo">Texto</label>
            <div class="chips" id="ed-ferramentas" style="margin-bottom:4px">
              <button type="button" class="btn peq" data-f="negrito"><b>N</b> negrito</button><button type="button" class="btn peq" data-f="link">🔗 link</button>
              <button type="button" class="btn peq" data-f="sub">Subtítulo</button><button type="button" class="btn peq" data-f="lista">• Lista</button>
              <button type="button" class="btn peq" data-f="nome">{nome}</button><button type="button" class="btn peq" data-f="empresa">{empresa}</button>
              <button type="button" class="btn peq escuro" data-f="continuar">✂ "continuar lendo" aqui</button></div>
            <textarea id="ed-corpo" rows="14">${esc(v.corpo || '')}</textarea>
            <small>Linha em branco separa parágrafos. {nome} vira o primeiro nome da pessoa e {empresa} o nome da empresa. "Continuar lendo": o e-mail mostra só o que vem antes e o resto abre numa página que mede quem leu até o fim.</small></div>
          <div class="grade g2" style="gap:10px">
            <div class="campo"><label for="ed-bt">Texto do botão (opcional)</label><input type="text" id="ed-bt" maxlength="60" value="${esc(v.botao_texto || '')}" placeholder="Ex.: Quero conversar"></div>
            <div class="campo"><label for="ed-bl">Link do botão</label><input type="text" id="ed-bl" value="${esc(v.botao_link || '')}" placeholder="https://..."></div></div>
        </div>
        <div id="ed-html" class="campo"><label for="ed-htmlc">HTML do e-mail (o rodapé com "sair da lista" entra sozinho)</label><textarea id="ed-htmlc" rows="16" style="font-family:monospace;font-size:12px">${esc(v.html || '')}</textarea></div>
        <label class="check"><input type="checkbox" id="ed-ativo"${v.ativo ? ' checked' : ''}><span>E-mail ligado (desligado = ninguém recebe; a sequência pula para o próximo)</span></label>
        <div class="linha" style="gap:8px;flex-wrap:wrap"><button class="btn pri" type="submit">Salvar</button>
          <button class="btn" type="button" id="ed-teste">Salvar e mandar teste para mim</button>
          ${e ? '<span style="flex:1"></span><button class="btn peq" type="button" id="ed-apagar">Apagar</button>' : ''}</div>
      </form>
      <div style="display:grid;gap:6px;align-content:start">
        <div class="linha" style="gap:6px"><b class="peq" style="flex:1">Prévia (com "${PESSOA_EXEMPLO.nome}" da "${PESSOA_EXEMPLO.empresa}")</b>
          <button type="button" class="btn peq escuro" data-ver="email">E-mail</button><button type="button" class="btn peq" data-ver="pagina">Página "continuar lendo"</button></div>
        <div class="peq apagado" id="ed-assunto-previa"></div>
        <iframe id="ed-previa" title="Prévia do e-mail" sandbox="" style="width:100%;height:68vh;border:1px solid var(--linha);border-radius:12px;background:#fff"></iframe></div>
    </div>`, { largura: 1180 });
  const q = (s) => j.corpo.querySelector(s);
  if (window.innerWidth < 900) q('#ed-grade').style.gridTemplateColumns = '1fr';
  let ver = 'email';
  const ler = () => ({
    assunto: q('#ed-assunto').value.trim(), preheader: q('#ed-pre').value.trim() || null, dias_depois: Math.max(0, Number(q('#ed-dias').value) || 0),
    formato: q('#ed-formato').value, titulo: q('#ed-titulo').value.trim() || null, imagem_url: q('#ed-img').value.trim() || null,
    corpo: q('#ed-corpo').value, html: q('#ed-htmlc').value || null, botao_texto: q('#ed-bt').value.trim() || null, botao_link: q('#ed-bl').value.trim() || null, ativo: q('#ed-ativo').checked,
  });
  const previa = () => {
    const m = ler();
    q('#ed-texto').hidden = m.formato !== 'texto'; q('#ed-html').hidden = m.formato !== 'html';
    if (ver === 'pagina' && m.formato === 'texto') {
      const p = montarPagina(m, PESSOA_EXEMPLO);
      q('#ed-previa').srcdoc = `<!doctype html><meta charset="utf-8"><style>img{max-width:100%;height:auto}h1{font-size:24px;color:#091216}</style><body style="margin:0;background:#EFE8DA;font-family:Arial,sans-serif">
        <div style="background:#091216;padding:14px 20px;border-bottom:3px solid #9C7D4C"><img src="${location.origin}/assets/logo-clara.png" alt="Mentorei" style="height:24px;width:auto"></div>
        <div style="max-width:620px;margin:16px auto;background:#fff;border-radius:14px;padding:22px;box-sizing:border-box;overflow-wrap:anywhere">${p.html}</div>`;
      q('#ed-assunto-previa').textContent = /\[continuar lendo\]/i.test(m.corpo) ? 'Esta é a página que abre no "continuar lendo" (texto inteiro).' : 'Sem "continuar lendo" neste e-mail: a página não é usada.';
    } else {
      const r = montarEmail(m, PESSOA_EXEMPLO, {});
      q('#ed-previa').srcdoc = r.html;
      q('#ed-assunto-previa').innerHTML = `Assunto: <b>${esc(r.assunto)}</b>${m.preheader ? ` · <span>${esc(m.preheader)}</span>` : ''}`;
    }
  };
  let timer;
  q('#ed').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(previa, 300); });
  j.corpo.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => {
    ver = b.dataset.ver; j.corpo.querySelectorAll('[data-ver]').forEach((x) => x.classList.toggle('escuro', x === b)); previa();
  }));
  // ferramentas do texto
  q('#ed-ferramentas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-f]'); if (!b) return;
    const ta = q('#ed-corpo'), ini = ta.selectionStart, fim = ta.selectionEnd, sel = ta.value.slice(ini, fim);
    let novo;
    if (b.dataset.f === 'negrito') novo = `**${sel || 'texto em negrito'}**`;
    else if (b.dataset.f === 'link') { const url = prompt('Endereço do link (começando com https://):', 'https://'); if (!url || !/^https?:\/\//.test(url)) return; novo = `[${sel || 'texto do link'}](${url})`; }
    else if (b.dataset.f === 'sub') novo = `\n\n## ${sel || 'Subtítulo'}\n\n`;
    else if (b.dataset.f === 'lista') novo = `\n\n${(sel || 'primeiro item\nsegundo item').split('\n').map((l) => `- ${l}`).join('\n')}\n\n`;
    else if (b.dataset.f === 'continuar') {
      if (/\[continuar lendo\]/i.test(ta.value)) { avisar('Já tem um "continuar lendo" no texto. Apague o outro para mudar de lugar.', true); return; }
      novo = `\n\n${MARCADOR_CONTINUAR}\n\n`;
    } else novo = `{${b.dataset.f}}`;
    ta.setRangeText(novo, ini, fim, 'end'); ta.focus(); previa();
  });
  q('#ed-img-arq').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0]; if (!arq) return;
    avisar('Enviando a imagem…');
    try {
      const blob = await reduzirImagem(arq);
      const tipo = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : 'jpg';
      const caminho = `emails/${funil.id}/${Date.now()}.${tipo}`;
      const { error } = await sb.storage.from('fotos').upload(caminho, blob, { contentType: blob.type });
      if (error) throw error;
      q('#ed-img').value = sb.storage.from('fotos').getPublicUrl(caminho).data.publicUrl;
      avisar('Imagem enviada.'); previa();
    } catch (err) { avisar(explicarErro(err), true); }
  });
  const salvar = async () => {
    const m = ler();
    if (!m.assunto) { avisar('Escreva o assunto.', true); return null; }
    if (m.formato === 'texto' && !m.corpo.trim()) { avisar('Escreva o texto do e-mail.', true); return null; }
    if (m.formato === 'html' && !(m.html || '').trim()) { avisar('Cole o HTML do e-mail.', true); return null; }
    if (m.botao_link && !/^https?:\/\//.test(m.botao_link)) { avisar('O link do botão precisa começar com https://', true); return null; }
    if (m.botao_texto && !m.botao_link) { avisar('Coloque o link do botão (ou apague o texto do botão).', true); return null; }
    const r = e ? await sb.from('funil_emails').update(m).eq('id', e.id).select().single()
      : await sb.from('funil_emails').insert({ ...m, funil_id: funil.id, ordem: emails.length + 1 }).select().single();
    if (r.error) { avisar(explicarErro(r.error), true); return null; }
    // e-mail novo: quem já tinha recebido todos volta a receber (este novo)
    if (!e && m.ativo) {
      const { data: voltam } = await sb.from('funil_membros').update({ status: 'ativo', proximo_envio_em: new Date().toISOString() }).eq('funil_id', funil.id).eq('status', 'concluido').select('id');
      if (voltam && voltam.length) avisar(`${voltam.length} pessoa(s) que já tinham recebido tudo vão receber este novo e-mail.`);
    }
    e = r.data;
    return r.data;
  };
  q('#ed').addEventListener('submit', async (ev) => { ev.preventDefault(); if (await salvar()) { j.fechar(); avisar('E-mail salvo.'); recarregar(); } });
  q('#ed-teste').addEventListener('click', async (ev) => {
    const salvo = await salvar(); if (!salvo) return;
    ev.target.disabled = true;
    const r = await api('/api/funis', { acao: 'teste', email_id: salvo.id, para: ctx.perfil.email, nome: ctx.perfil.nome });
    ev.target.disabled = false;
    avisar(r.ok ? `Teste enviado para ${ctx.perfil.email}. Confira a caixa de entrada (e o spam).` : (r.mensagem || 'Não consegui enviar o teste.'), !r.ok);
  });
  q('#ed-apagar')?.addEventListener('click', async () => {
    if (!confirm('Apagar este e-mail da sequência? Os números de quem já recebeu continuam na página de cada pessoa.')) return;
    const { error } = await sb.from('funil_emails').delete().eq('id', e.id);
    if (error) { avisar(explicarErro(error), true); return; }
    j.fechar(); avisar('E-mail apagado.'); recarregar();
  });
  previa();
}

// imagem grande demais vira JPG de até 1200 px de largura
async function reduzirImagem(arq) {
  if (arq.size < 600 * 1024 || arq.type === 'image/gif') return arq;
  const img = await createImageBitmap(arq);
  const escala = Math.min(1, 1200 / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b || arq), arq.type === 'image/png' && arq.size < 2e6 ? 'image/png' : 'image/jpeg', 0.85));
}

// ---------- regras automáticas ----------
function abaRegras(ctx, el, d, funil, outros, recarregar) {
  const p = { gatilho: 'clique', quantidade: 1, ...funil.regra_passagem }, l = { sem_sinal: 3, ...funil.regra_limpeza };
  el.innerHTML = `<form class="grade" id="rg" style="gap:14px;max-width:760px">
    <div class="cartao grade" style="gap:10px">
      <label class="check"><input type="checkbox" id="rg-p"${p.ligada ? ' checked' : ''}><span><b>Passar sozinho os engajados para outro funil</b></span></label>
      <div class="linha" style="gap:8px;flex-wrap:wrap;align-items:center">Quando a pessoa
        <select id="rg-gat" aria-label="O que a pessoa fez"><option value="clique"${p.gatilho === 'clique' ? ' selected' : ''}>clicar em algum link</option>
          <option value="leitura"${p.gatilho === 'leitura' ? ' selected' : ''}>ler até o fim (página "continuar lendo")</option>
          <option value="abertura"${p.gatilho === 'abertura' ? ' selected' : ''}>abrir os e-mails</option></select>
        <input type="number" id="rg-qtd" min="1" max="20" value="${p.quantidade}" style="width:70px" aria-label="Quantas vezes"> vez(es), mandar para
        <select id="rg-dest" aria-label="Funil de destino"><option value="">escolha o funil…</option>${outros.map((o) => `<option value="${o.id}"${o.id === p.destino ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="rg-op"${p.criar_oportunidade ? ' checked' : ''}><span>Avisar Vendas: cria uma oportunidade (ou anota na que já existe) com próximo contato no dia útil seguinte, 9h</span></label>
      <div class="campo" style="max-width:360px"><label for="rg-resp">Responsável pelo contato</label><select id="rg-resp"><option value="">O responsável do sistema na Prospecção</option>${d.equipe.map((x) => `<option value="${x.id}"${x.id === p.responsavel ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
      <p class="peq apagado">"Abrir" é aproximado (o iPhone abre sozinho e não conta). O clique é o sinal mais confiável. Cliques nos 2 primeiros minutos depois do envio são do antivírus da empresa e não contam.</p>
    </div>
    <div class="cartao grade" style="gap:10px">
      <label class="check"><input type="checkbox" id="rg-l"${l.ligada ? ' checked' : ''}><span><b>Limpar a lista sozinho</b></span></label>
      <div class="linha" style="gap:8px;align-items:center">Tirar do funil quem não der nenhum sinal em <input type="number" id="rg-sem" min="2" max="20" value="${l.sem_sinal}" style="width:70px" aria-label="Quantos e-mails"> e-mails seguidos.</div>
      <p class="peq apagado">Quem só tem abertura automática (iPhone) não é tirado. Quem sai continua cadastrado na plataforma e aparece em "Já saíram".</p>
    </div>
    <div class="linha"><button class="btn pri" type="submit">Salvar regras</button></div></form>`;
  el.querySelector('#rg').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = (s) => el.querySelector(s);
    const regra_passagem = { ligada: q('#rg-p').checked, gatilho: q('#rg-gat').value, quantidade: Math.max(1, Number(q('#rg-qtd').value) || 1), destino: q('#rg-dest').value || null, criar_oportunidade: q('#rg-op').checked, responsavel: q('#rg-resp').value || null };
    if (regra_passagem.ligada && !regra_passagem.destino) { avisar('Escolha para qual funil mandar (crie o outro funil antes, se precisar).', true); return; }
    const regra_limpeza = { ligada: q('#rg-l').checked, sem_sinal: Math.max(2, Number(q('#rg-sem').value) || 3) };
    const { error } = await sb.from('funis').update({ regra_passagem, regra_limpeza }).eq('id', funil.id);
    if (error) { avisar(explicarErro(error), true); return; }
    avisar('Regras salvas. Valem na próxima rodada (de hora em hora).'); recarregar();
  });
}

// ---------- contatos para atualizar ----------
async function paginaAtualizar(ctx, el, d) {
  const [r, fs, desc] = await Promise.all([
    sb.from('contatos_atualizar').select('*').order('detectado_em', { ascending: false }).limit(2000),
    sb.from('funis').select('id, nome'),
    sb.from('descadastros').select('*').order('em', { ascending: false }).limit(1000),
  ]);
  if (r.error && faltaScript(r.error)) { el.innerHTML = AVISO_34; return; }
  if (r.error) throw r.error;
  const nomeFunil = (id) => ((fs.data || []).find((f) => f.id === id) || {}).nome || 'funil apagado';
  const empresaDe = (id) => d.empresas.find((e) => e.id === id);
  const abertos = r.data.filter((x) => !x.resolvido_em), resolvidos = r.data.filter((x) => x.resolvido_em);
  el.innerHTML = `
    <p class="peq"><a href="#/vendas/funis">← Todos os funis</a></p>
    <h2 style="margin:6px 0 4px">Contatos para atualizar</h2>
    <p class="peq apagado">E-mails que voltaram, não existem ou estão escritos errado. Ninguém se perde: procure o e-mail certo (site, LinkedIn, ligação), corrija aqui e a pessoa volta para os funis em que estava.</p>
    <div class="tabela cartao mt" style="padding:0"><table><thead><tr><th>Pessoa</th><th>E-mail errado</th><th>Por quê</th><th>E-mail certo</th><th></th></tr></thead>
      <tbody id="ca-corpo">${abertos.map((x) => {
        const emp = empresaDe(x.empresa_id);
        return `<tr data-id="${x.id}"><td><b>${esc(x.nome || '—')}</b>${emp ? `<div class="peq"><a href="#/vendas/empresa/${emp.id}">${esc(emp.nome)}</a>${emp.telefone ? ` · ${esc(emp.telefone)}` : ''}</div>` : ''}
          ${x.funis.length ? `<div class="peq apagado">Funis: ${x.funis.map((f) => esc(nomeFunil(f))).join(', ')}</div>` : ''}</td>
          <td><s>${esc(x.email)}</s><div class="peq apagado">desde ${dataBR(x.detectado_em)}</div></td>
          <td class="peq">${esc(x.motivo)}${x.detalhe ? `<div class="apagado">${esc(x.detalhe)}</div>` : ''}</td>
          <td><input type="email" data-novo placeholder="novo e-mail" style="min-width:200px" aria-label="E-mail certo de ${esc(x.nome || x.email)}"></td>
          <td style="white-space:nowrap"><button class="btn peq pri" type="button" data-corrigir>Salvar e voltar ao funil</button>
            <button class="btn peq" type="button" data-sem title="Não achamos outro e-mail">Sem e-mail</button></td></tr>`;
      }).join('') || '<tr><td colspan="5" class="apagado">Nenhum contato para atualizar. 🎉</td></tr>'}</tbody></table></div>
    ${resolvidos.length ? `<details class="mt"><summary style="cursor:pointer" class="peq">Já resolvidos (${resolvidos.length})</summary><ul class="peq">${resolvidos.slice(0, 300).map((x) => `<li>${esc(x.email)} → ${x.email_novo ? esc(x.email_novo) : x.solucao === 'sem_email' ? 'sem e-mail' : 'ignorado'} (${dataBR(x.resolvido_em)})</li>`).join('')}</ul></details>` : ''}
    <details class="mt"><summary style="cursor:pointer" class="peq">Pediram para sair da lista (${(desc.data || []).length})</summary>
      <p class="peq apagado">Estes e-mails nunca mais recebem e-mail de funil (lei e boas práticas). Se a pessoa pedir para voltar, tire daqui.</p>
      <ul class="peq" id="ca-desc">${(desc.data || []).map((x) => `<li>${esc(x.email)} · ${dataBR(x.em)} · ${x.origem === 'spam' ? 'marcou como spam' : x.origem === 'manual' ? 'à mão' : 'pelo link'} <button class="btn peq" type="button" data-volta="${esc(x.email)}">Pediu para voltar</button></li>`).join('')}</ul></details>`;
  el.querySelector('#ca-corpo').addEventListener('click', async (ev) => {
    const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
    const x = abertos.find((y) => y.id === tr.dataset.id);
    if (ev.target.closest('[data-sem]')) {
      const { error } = await sb.from('contatos_atualizar').update({ resolvido_em: new Date().toISOString(), resolvido_por: ctx.perfil.id, solucao: 'sem_email' }).eq('id', x.id);
      if (error) { avisar(explicarErro(error), true); return; }
      tr.remove(); avisar('Marcado como sem e-mail.'); return;
    }
    if (!ev.target.closest('[data-corrigir]')) return;
    const novo = limparEmail(tr.querySelector('[data-novo]').value);
    if (!EMAIL_VALIDO.test(novo)) { avisar('Escreva o e-mail certo.', true); return; }
    if (novo === x.email) { avisar('É o mesmo e-mail que voltou.', true); return; }
    // corrige na plataforma: no contato, ou no e-mail geral da empresa
    if (x.contato_id) await sb.from('contatos').update({ email: novo }).eq('id', x.contato_id);
    else if (x.empresa_id) { const emp = empresaDe(x.empresa_id); if (emp && limparEmail(emp.email) === x.email) await sb.from('empresas').update({ email: novo }).eq('id', x.empresa_id); }
    // volta para os funis em que estava, com o e-mail novo
    let voltou = 0;
    for (const fid of x.funis || []) {
      const { data, error } = await sb.from('funil_membros').update({ email: novo, status: 'ativo', motivo: 'E-mail corrigido', saiu_em: null, proximo_envio_em: new Date().toISOString() })
        .eq('funil_id', fid).eq('email', x.email).eq('status', 'email_errado').select('id');
      if (!error && data) voltou += data.length;
    }
    const { error } = await sb.from('contatos_atualizar').update({ resolvido_em: new Date().toISOString(), resolvido_por: ctx.perfil.id, email_novo: novo, solucao: 'corrigido' }).eq('id', x.id);
    if (error) { avisar(explicarErro(error), true); return; }
    tr.remove(); avisar(`E-mail corrigido${voltou ? ` e de volta a ${voltou} funil(is)` : ''}.`);
  });
  el.querySelector('#ca-desc')?.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-volta]'); if (!b) return;
    if (!confirm(`${b.dataset.volta} pediu para voltar a receber? Só confirme se a pessoa pediu.`)) return;
    const { error } = await sb.from('descadastros').delete().eq('email', b.dataset.volta);
    if (error) { avisar(explicarErro(error), true); return; }
    b.closest('li').remove(); avisar('Pronto. Coloque a pessoa de novo no funil, se quiser.');
  });
}
