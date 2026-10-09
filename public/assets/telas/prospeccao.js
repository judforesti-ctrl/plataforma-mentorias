// Prospecção (Vendas → aba Prospecção, script 23): listas de cooperativas por sistema (ex.: lista do Banco Central) que ainda
// não viraram conversa. Importar a lista (.xlsx) conferindo as que já estão cadastradas, responsável por sistema, funil por
// sistema e o dia a dia: "Liguei", e-mail e ficha. O funil anda sozinho pelo histórico (trigger do script 23).
import { sb, esc, dataBR, dataHoraBR, avisar, explicarErro, localParaISO, isoParaLocal } from '../base.js';
import { janela, primeiroNome, faltaScript } from './agenda-dados.js';
import { ETAPAS, NOME_ETAPA, aberta, atrasado, norm, limparFone, situacaoDe, seloSituacao, janelaEmail } from './vendas.js';

// filtros (continuam ao voltar para a aba)
const est = { sistema: '', etapa: 'prospectar', texto: '', central: '', uf: '', porte: '', responsavel: '', limite: 100 };
const SEM_SISTEMA = 'Sem sistema';
const sistemaDe = (o) => (o.empresa && o.empresa.sistema) || SEM_SISTEMA;
const AVISO_23 = `<div class="aviso erro">Para a Prospecção funcionar, falta rodar o script <b>23-prospeccao.sql</b> no Supabase (SQL Editor → New query → colar → Run).</div>`;

export async function abaProspeccao(ctx, el, d, recarregar, sistemaInicial = null) {
  if (d.falta23) { el.innerHTML = AVISO_23; return; }
  if (sistemaInicial) { est.sistema = sistemaInicial; est.etapa = ''; }
  // entra aqui: tudo que está "A prospectar" e tudo das empresas que vieram de uma lista com sistema (cooperativas)
  const base = d.oportunidades.filter((o) => o.etapa === 'prospectar' || (o.empresa && o.empresa.sistema));
  if (!base.length) {
    el.innerHTML = `<div class="cartao" style="text-align:center;padding:32px 20px"><h3>Nenhuma lista de prospecção ainda</h3>
      <p class="apagado mt">Importe a planilha das cooperativas: cada uma entra em <b>A prospectar</b> e vai andando no funil conforme vocês ligam, mandam e-mail e marcam reunião.</p>
      <button class="btn pri mt2" type="button" id="p-importar">Importar lista</button></div>`;
    el.querySelector('#p-importar').addEventListener('click', () => janelaImportar(ctx, d, recarregar));
    return;
  }
  const sistemas = [...new Set(base.map(sistemaDe))].sort((a, b) => base.filter((o) => sistemaDe(o) === b).length - base.filter((o) => sistemaDe(o) === a).length);
  if (est.sistema && !sistemas.includes(est.sistema)) est.sistema = '';
  const contatosDe = (empId) => d.contatos.filter((c) => c.empresa_id === empId && c.ativo !== false);

  el.innerHTML = `
    <div class="linha" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
      <p class="peq apagado" style="flex:1;min-width:260px">Cooperativas e empresas que ainda não viraram conversa. Ligou, mandou e-mail ou WhatsApp: vai para <b>Primeiro contato feito</b> e aparece no Pipeline.</p>
      <button class="btn" type="button" id="p-resp">Responsáveis por sistema</button><button class="btn pri" type="button" id="p-importar">Importar lista</button></div>
    <div class="chips" id="p-sistemas" style="margin-bottom:10px"></div>
    <div class="cartao" style="padding:12px;margin-bottom:10px"><div class="chips" id="p-funil" style="align-items:center"></div></div>
    <div class="linha ag-filtros">
      <input type="search" id="p-texto" placeholder="Cooperativa, cidade, CNPJ…" value="${esc(est.texto)}" style="width:auto;min-width:220px" aria-label="Procurar">
      <select id="p-central" aria-label="Central"></select>
      <select id="p-uf" aria-label="Estado"></select>
      <select id="p-porte" aria-label="Porte"></select>
      <select id="p-resp-f" aria-label="Responsável"><option value="">Qualquer responsável</option><option value="-"${est.responsavel === '-' ? ' selected' : ''}>Sem responsável</option>${d.equipe.map((p) => `<option value="${p.id}"${p.id === est.responsavel ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
    </div>
    <div class="tabela cartao" style="padding:0"><table id="p-tab"><thead><tr><th>Cooperativa</th><th>Cidade</th><th>Telefone · e-mail</th><th>Responsável</th><th>Etapa</th><th></th></tr></thead><tbody></tbody></table></div>
    <div class="linha mt" id="p-mais"></div>
    <p class="peq apagado mt">📞 <b>Liguei</b> registra a ligação (e a pessoa com quem falou). ✉ manda e-mail pela plataforma. Clique no nome para abrir a ficha com o histórico.</p>`;

  const doSistema = () => base.filter((o) => !est.sistema || sistemaDe(o) === est.sistema);
  const opcoes = (id, valor, todos, lista) => {
    const s = el.querySelector(id);
    s.innerHTML = `<option value="">${todos}</option>${lista.map((v) => `<option${v === valor ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;
  };
  const filtrosDoSistema = () => {
    const l = doSistema();
    const unicos = (f) => [...new Set(l.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    opcoes('#p-central', est.central, 'Todas as centrais', unicos((o) => o.empresa && o.empresa.central));
    opcoes('#p-uf', est.uf, 'Todos os estados', unicos((o) => o.empresa && o.empresa.uf));
    opcoes('#p-porte', est.porte, 'Todos os portes', unicos((o) => o.empresa && o.empresa.porte));
  };
  const desenhar = () => {
    el.querySelector('#p-sistemas').innerHTML = [['', 'Todos', base.length], ...sistemas.map((s) => [s, s, base.filter((o) => sistemaDe(o) === s).length])]
      .map(([k, n, q]) => `<button type="button" class="btn peq${k === est.sistema ? ' escuro' : ''}" data-sistema="${esc(k)}">${esc(n)}<span class="n">${q}</span></button>`).join('');
    const l = doSistema();
    const etapas = ETAPAS.map(([k, n]) => `<button type="button" class="btn peq${k === est.etapa ? ' escuro' : ''}" data-etapa="${k}">${n}<span class="n">${l.filter((o) => o.etapa === k).length}</span></button>`);
    el.querySelector('#p-funil').innerHTML = `<b class="peq" style="margin-right:4px">Funil${est.sistema ? ` ${esc(est.sistema)}` : ''}:</b>${etapas.join('<span class="apagado" aria-hidden="true">→</span>')}
      <button type="button" class="btn peq${est.etapa === '' ? ' escuro' : ''}" data-etapa="">Todas<span class="n">${l.length}</span></button>`;
    const t = norm(est.texto);
    const filtradas = l.filter((o) => {
      const e = o.empresa || {};
      if (est.etapa && o.etapa !== est.etapa) return false;
      if (est.central && e.central !== est.central) return false;
      if (est.uf && e.uf !== est.uf) return false;
      if (est.porte && e.porte !== est.porte) return false;
      if (est.responsavel === '-' ? o.responsavel_id : est.responsavel && o.responsavel_id !== est.responsavel) return false;
      if (t && !norm([e.nome, e.razao_social, e.cidade, e.uf, e.central, e.cnpj, e.cnpj && e.cnpj.replace(/\D/g, ''), ...contatosDe(o.empresa_id).map((c) => c.nome)].join(' ')).includes(t)) return false;
      return true;
    }).sort((a, b) => (a.proximo_contato_em || '9').localeCompare(b.proximo_contato_em || '9') || norm(a.empresa && a.empresa.nome).localeCompare(norm(b.empresa && b.empresa.nome)));
    el.querySelector('#p-tab tbody').innerHTML = filtradas.slice(0, est.limite).map((o) => linha(o, d)).join('')
      || `<tr><td colspan="6" class="apagado">Nenhuma ${est.etapa ? `em <b>${NOME_ETAPA[est.etapa]}</b>` : 'cooperativa'} com esses filtros.</td></tr>`;
    el.querySelector('#p-mais').innerHTML = filtradas.length > est.limite
      ? `<span class="peq apagado">Mostrando ${est.limite} de ${filtradas.length}.</span><button class="btn peq" type="button" id="p-mais-btn">Mostrar mais 100</button>`
      : `<span class="peq apagado">${filtradas.length} na lista.</span>`;
  };

  el.querySelector('#p-sistemas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sistema]'); if (!b) return;
    est.sistema = b.dataset.sistema; est.central = ''; est.uf = ''; est.porte = ''; est.limite = 100;
    filtrosDoSistema(); desenhar();
  });
  el.querySelector('#p-funil').addEventListener('click', (ev) => { const b = ev.target.closest('[data-etapa]'); if (b) { est.etapa = b.dataset.etapa; est.limite = 100; desenhar(); } });
  el.querySelector('#p-texto').addEventListener('input', (ev) => { est.texto = ev.target.value; desenhar(); });
  for (const [id, campo] of [['#p-central', 'central'], ['#p-uf', 'uf'], ['#p-porte', 'porte'], ['#p-resp-f', 'responsavel']]) {
    el.querySelector(id).addEventListener('input', (ev) => { est[campo] = ev.target.value; desenhar(); });
  }
  el.querySelector('#p-mais').addEventListener('click', (ev) => { if (ev.target.closest('#p-mais-btn')) { est.limite += 100; desenhar(); } });
  el.querySelector('#p-importar').addEventListener('click', () => janelaImportar(ctx, d, recarregar));
  el.querySelector('#p-resp').addEventListener('click', () => janelaResponsaveis(ctx, d, base, recarregar));
  el.querySelector('#p-tab').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]'); if (!b) return;
    const o = base.find((x) => x.id === b.dataset.op); if (!o) return;
    if (b.dataset.acao === 'liguei') janelaLiguei(ctx, o, d, recarregar);
    if (b.dataset.acao === 'email') {
      if (!(o.empresa && o.empresa.email) && !contatosDe(o.empresa_id).some((c) => c.email)) {
        avisar('Esta cooperativa não tem e-mail cadastrado. Ligue, peça o e-mail da pessoa certa (RH ou diretoria) e registre no 📞 Liguei.', true); return;
      }
      janelaEmail(ctx, o, contatosDe(o.empresa_id), null, recarregar);
    }
  });
  filtrosDoSistema();
  desenhar();
}

function linha(o, d) {
  const e = o.empresa || {};
  const sit = situacaoDe(e, d);
  const fone = e.telefone ? `<a href="tel:${esc(limparFone(e.telefone))}">${esc(e.telefone)}</a>` : '<span class="apagado">sem telefone</span>';
  const resp = d.equipe.find((p) => p.id === o.responsavel_id);
  return `<tr>
    <td><a href="#/vendas/oportunidade/${o.id}"><b>${esc(e.nome || 'Empresa')}</b></a> ${sit !== 'nunca' ? seloSituacao(sit) : ''}
      <div class="peq apagado">${[e.sistema, e.central && `central ${e.central}`, e.porte].filter(Boolean).map(esc).join(' · ')}</div></td>
    <td class="peq">${esc([e.cidade, e.uf].filter(Boolean).join('/')) || '—'}</td>
    <td class="peq">${fone}${e.email ? `<div class="apagado" style="max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.email)}">${esc(e.email)}</div>` : ''}</td>
    <td class="peq">${resp ? esc(primeiroNome(resp.nome)) : '<span class="apagado">—</span>'}</td>
    <td><span class="selo ${o.etapa === 'fechado' ? 'ok' : o.etapa === 'perdido' ? 'erro' : o.etapa === 'prospectar' ? 'neutro' : 'escuro'}">${NOME_ETAPA[o.etapa]}</span>
      ${aberta(o) && o.proximo_contato_em ? `<div class="peq${atrasado(o) ? ' kb-atraso' : ' apagado'}">${atrasado(o) ? '⚠ ' : '📅 '}${dataBR(o.proximo_contato_em)}</div>` : ''}</td>
    <td style="white-space:nowrap"><button class="btn peq" type="button" data-acao="liguei" data-op="${o.id}">📞 Liguei</button> <button class="btn peq" type="button" data-acao="email" data-op="${o.id}" title="Mandar e-mail">✉</button></td></tr>`;
}

// ---------- "Liguei": registra a ligação, a pessoa com quem falou e o próximo passo ----------
function janelaLiguei(ctx, o, d, aoSalvar) {
  const e = o.empresa || {};
  const naProspeccao = o.etapa === 'prospectar';
  const html = `<form id="f-l" class="grade" style="gap:12px" novalidate>
    ${e.telefone ? `<p>📞 <a href="tel:${esc(limparFone(e.telefone))}"><b>${esc(e.telefone)}</b></a>${e.cidade ? ` <span class="peq apagado">· ${esc(e.cidade)}/${esc(e.uf || '')}</span>` : ''}</p>` : ''}
    <fieldset class="grade" style="gap:6px;border:0;padding:0;margin:0"><legend class="peq" style="margin-bottom:6px"><b>Como foi?</b></legend>
      <label class="check"><input type="radio" name="l-res" value="falei" checked><span>Conversei com alguém${naProspeccao ? ' <span class="apagado">→ vai para <b>Primeiro contato feito</b></span>' : ''}</span></label>
      <label class="check"><input type="radio" name="l-res" value="nao"><span>Não consegui falar (não atendeu, ocupado, a pessoa certa não estava)${naProspeccao ? ' <span class="apagado">→ continua em A prospectar</span>' : ''}</span></label></fieldset>
    <div class="cartao" style="padding:12px"><b class="peq">Com quem falou (opcional)</b>
      <div class="grade g2 mt" style="gap:10px"><div class="campo"><label for="l-nome">Nome</label><input type="text" id="l-nome" maxlength="120"></div>
        <div class="campo"><label for="l-cargo">Cargo</label><input type="text" id="l-cargo" placeholder="Ex.: Gerente de Gestão de Pessoas"></div>
        <div class="campo"><label for="l-email">E-mail</label><input type="email" id="l-email"></div>
        <div class="campo"><label for="l-whats">WhatsApp</label><input type="tel" id="l-whats" placeholder="(54) 99999-0000"></div></div>
      <label class="check mt"><input type="checkbox" id="l-decisor"><span>É quem decide a contratação</span></label></div>
    <div class="campo"><label for="l-texto">O que conversaram</label><textarea id="l-texto" placeholder="Ex.: pediram para mandar a apresentação por e-mail; o RH volta das férias dia 20"></textarea></div>
    <div class="grade g2" style="gap:10px"><div class="campo"><label for="l-prox">Próximo passo: quando (opcional)</label><input type="datetime-local" id="l-prox" value="${isoParaLocal(o.proximo_contato_em)}"></div>
      <div class="campo"><label for="l-prox-obs">O que fazer</label><input type="text" id="l-prox-obs" placeholder="Ex.: ligar de novo e pedir o RH" value="${esc(o.proximo_contato_obs || '')}"></div></div>
    <div class="linha"><button class="btn pri" type="submit">Registrar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`;
  const j = janela(`Ligação · ${e.nome || ''}`, html, { largura: 640 });
  const f = j.corpo.querySelector('#f-l');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (id) => f.querySelector(id).value.trim();
    const falei = f.querySelector('input[name=l-res]:checked').value === 'falei';
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      let contatoId = null;
      if (v('#l-nome')) {
        const r = await sb.from('contatos').insert({ empresa_id: o.empresa_id, nome: v('#l-nome'), cargo: v('#l-cargo') || null, email: v('#l-email').toLowerCase() || null,
          whatsapp: v('#l-whats') || null, decisor: f.querySelector('#l-decisor').checked }).select('id').single();
        if (r.error) throw r.error;
        contatoId = r.data.id;
      }
      const quem = v('#l-nome') ? ` com ${v('#l-nome')}${v('#l-cargo') ? ` (${v('#l-cargo')})` : ''}` : '';
      const texto = falei ? `Ligação${quem}.${v('#l-texto') ? `\n${v('#l-texto')}` : ''}` : `📞 Tentei ligar e não consegui falar${quem}.${v('#l-texto') ? `\n${v('#l-texto')}` : ''}`;
      // conversa de verdade = "ligação" (o funil anda sozinho); tentativa sem conversa = anotação (fica na etapa)
      const ri = await sb.from('interacoes').insert({ oportunidade_id: o.id, contato_id: contatoId, tipo: falei ? 'ligacao' : 'nota', texto });
      if (ri.error) throw ri.error;
      const mud = {};
      if (contatoId && !o.contato_id) mud.contato_id = contatoId;
      if (v('#l-prox')) { mud.proximo_contato_em = localParaISO(v('#l-prox')); mud.proximo_contato_obs = v('#l-prox-obs') || null; mud.proximo_contato_por = o.responsavel_id || ctx.perfil.id; }
      if (!o.responsavel_id) mud.responsavel_id = ctx.perfil.id;
      if (Object.keys(mud).length) { const ru = await sb.from('oportunidades').update(mud).eq('id', o.id); if (ru.error) throw ru.error; }
      if (mud.proximo_contato_em) import('./agenda-dados.js').then(({ limparCache, avisarGoogle }) => { limparCache(); avisarGoogle(); });
      avisar(falei && naProspeccao ? `Registrado. ${e.nome} foi para Primeiro contato feito.` : `Registrado${mud.proximo_contato_em ? `; próximo contato em ${dataHoraBR(mud.proximo_contato_em)}` : ''}.`);
      j.fechar(); if (aoSalvar) aoSalvar();
    } catch (err) { avisar(explicarErro(err), true); btn.disabled = false; }
  });
}

// ---------- responsável de cada sistema ----------
async function lerResponsaveis() {
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'prospeccao').maybeSingle();
  return (data && data.valor && data.valor.responsaveis) || {};
}
async function gravarResponsaveis(mapa) {
  await sb.from('configuracoes').upsert({ chave: 'prospeccao', valor: { responsaveis: mapa }, atualizado_em: new Date().toISOString() });
}
const selectEquipe = (d, id, valor) => `<select id="${id}"><option value="">Sem responsável por enquanto</option>${d.equipe.map((p) => `<option value="${p.id}"${p.id === valor ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>`;

async function janelaResponsaveis(ctx, d, base, aoSalvar) {
  const mapa = await lerResponsaveis();
  const sistemas = [...new Set(base.map(sistemaDe))].filter((s) => s !== SEM_SISTEMA).sort();
  if (!sistemas.length) { avisar('Nenhuma cooperativa com sistema ainda.', true); return; }
  const nome = (id) => (d.equipe.find((p) => p.id === id) || {}).nome;
  const linhaS = (s, i) => {
    const l = base.filter((o) => sistemaDe(o) === s && o.etapa === 'prospectar');
    const atuais = [...new Set(l.map((o) => o.responsavel_id || ''))];
    const atual = atuais.length === 1 ? atuais[0] : (mapa[s] || '');
    const resumo = atuais.length > 1 ? 'responsáveis misturados' : atuais[0] ? `hoje com ${esc(primeiroNome(nome(atuais[0])))}` : 'hoje sem responsável';
    return `<div class="grade g2" style="gap:10px;align-items:center"><div><b>${esc(s)}</b><div class="peq apagado">${l.length} em A prospectar · ${resumo}</div></div>${selectEquipe(d, `r-${i}`, atual)}</div>`;
  };
  const j = janela('Responsáveis por sistema', `<div class="grade" style="gap:12px">
    <p class="peq apagado">A responsável cuida das cooperativas do sistema que ainda estão em <b>A prospectar</b>. As que já estão em conversa continuam com quem está.</p>
    ${sistemas.map(linhaS).join('')}
    <div class="linha"><button class="btn pri" type="button" id="r-ok">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></div>`, { largura: 620 });
  j.corpo.querySelector('#r-ok').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    const novo = { ...mapa };
    try {
      for (const [i, s] of sistemas.entries()) {
        const valor = j.corpo.querySelector(`#r-${i}`).value || null;
        const l = base.filter((o) => sistemaDe(o) === s && o.etapa === 'prospectar');
        if (l.some((o) => (o.responsavel_id || null) !== valor)) {
          const { error } = await sb.rpc('definir_responsavel_sistema', { p_sistema: s, p_responsavel: valor });
          if (error) throw error;
        }
        novo[s] = valor;
      }
      await gravarResponsaveis(novo);
      avisar('Responsáveis salvos.'); j.fechar(); if (aoSalvar) aoSalvar();
    } catch (err) { avisar(explicarErro(err), true); ev.target.disabled = false; }
  });
}

// ---------- importar lista (.xlsx) ----------
// Colunas aceitas (a primeira linha com "Empresa" é o cabeçalho). Mesmo modelo das planilhas "importar no RD" por sistema.
const COLUNAS = {
  nome: ['empresa', 'nome da empresa', 'cooperativa', 'nome instituicao'], titulo: ['nome da negociacao'], cnpj: ['cnpj'],
  telefone: ['telefone da empresa', 'telefone'], email: ['e-mail da empresa', 'email da empresa', 'e-mail', 'email'], site: ['site da empresa', 'site', 'sitio na internet'],
  cidade: ['cidade', 'municipio'], uf: ['uf', 'estado'], sistema: ['sistema'], central: ['central', 'filiacao'], porte: ['porte'],
  observacoes: ['anotacoes', 'observacoes'], fonte: ['fonte'],
};
const limpa = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const paraRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const formataCnpj = (v) => { const n = String(v || '').replace(/\D/g, ''); return n.length === 14 ? `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}` : limpa(v); };

export function lerLista(XLSX, wb, nomeArquivo) {
  const itens = [];
  for (const aba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false, defval: '' });
    const h = linhas.findIndex((l) => l.some((c) => COLUNAS.nome.includes(norm(limpa(c)))));
    if (h < 0) continue;
    const cab = linhas[h].map((c) => norm(limpa(c)));
    const col = Object.fromEntries(Object.entries(COLUNAS).map(([k, nomes]) => [k, cab.findIndex((c) => nomes.includes(c))]));
    for (const l of linhas.slice(h + 1)) {
      const v = (k) => (col[k] >= 0 ? limpa(l[col[k]]) : '');
      const nome = v('nome'); if (!nome) continue;
      const obs = v('observacoes');
      const central = v('central');
      const titulo = v('titulo').replace(new RegExp(`\\s*-\\s*${paraRegex(nome)}$`), '');
      itens.push({
        nome, cnpj: formataCnpj(v('cnpj')) || null, telefone: v('telefone') || null, email: v('email').toLowerCase() || null, site: v('site') || null,
        cidade: v('cidade') || null, uf: v('uf').toUpperCase().slice(0, 2) || null, sistema: v('sistema') || null,
        central: central && !/própria central|propria central/i.test(central) ? central : null, porte: v('porte') || null,
        observacoes: obs || null, razao_social: (obs.match(/Raz[aã]o social:\s*(.+?)\.?\s*$/i) || [])[1] || null,
        titulo: titulo && titulo !== nome ? titulo : 'Treinamento', fonte: v('fonte') || nomeArquivo,
      });
    }
  }
  return itens;
}

// Nomes parecidos entre a lista e as empresas já cadastradas (para não criar a mesma empresa duas vezes).
const PALAVRAS_VAZIAS = new Set(['cooperativa', 'cooperativas', 'coop', 'de', 'do', 'da', 'dos', 'das', 'e', 'credito', 'ltda', 'economia', 'mutuo', 'livre', 'admissao',
  'investimento', 'investimentos', 'poupanca', 'servicos', 'financeiros', 'sa', 'em', 'no', 'na']);
const MARCAS = new Set(['sicoob', 'sicredi', 'cresol', 'unicred', 'ailos', 'credisis', 'uniprime', 'central']);
// sigla de estado no nome não diferencia ("Sicredi Nossa Terra PR/SP" = "Sicredi Nossa Terra")
const UFS = new Set('ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to'.split(' '));
const palavras = (t) => norm(t).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((p) => p && !PALAVRAS_VAZIAS.has(p) && !UFS.has(p));
const chave = (t) => [...palavras(t)].sort().join(' ');
function comparar(a, b) {
  const pa = palavras(a), pb = palavras(b);
  if (!pa.length || !pb.length) return null;
  if (chave(a) === chave(b)) return 'igual';
  const marcaA = pa.filter((p) => MARCAS.has(p) && p !== 'central'), marcaB = pb.filter((p) => MARCAS.has(p) && p !== 'central');
  if (marcaA.length && marcaB.length && !marcaA.some((m) => marcaB.includes(m))) return null;   // Sicoob x Sicredi: nunca
  const da = pa.filter((p) => !MARCAS.has(p)), db = pb.filter((p) => !MARCAS.has(p));
  if (!da.length || !db.length) return null;
  const [menor, maior] = da.length <= db.length ? [da, db] : [db, da];
  if (menor.length === 1 && menor[0].length < 4) return null;
  const casa = (p) => maior.some((q) => q === p || (p.length >= 4 && q.startsWith(p)) || (q.length >= 4 && p.startsWith(q)));
  return menor.every(casa) ? 'parecida' : null;
}
export function conferirCadastradas(itens, empresas) {
  const usadas = new Set(), pares = [];
  // empresa com CNPJ já foi conferida numa importação anterior; empresa que não é cooperativa não entra na comparação
  const candidatas = empresas.filter((e) => !e.cnpj && e.tipo !== 'empresa');
  const exato = (a, b) => norm(a).replace(/\s+/g, ' ').trim() === norm(b).replace(/\s+/g, ' ').trim();
  for (const nivel of ['exato', 'igual', 'parecida']) {
    for (const [i, it] of itens.entries()) {
      if (it.repetida || pares.some((p) => p.i === i)) continue;
      const e = nivel === 'exato' ? candidatas.find((x) => !usadas.has(x.id) && exato(x.nome, it.nome))
        : candidatas.find((x) => !usadas.has(x.id) && (comparar(x.nome, it.nome) === nivel || (it.razao_social && comparar(x.nome, it.razao_social) === nivel)));
      if (e && nivel === 'exato') { usadas.add(e.id); pares.push({ i, empresa: e, nivel: 'igual' }); continue; }
      // nome que se repete na lista só com a sigla do estado diferente (ex.: Sicredi Integração PR/SC e RS/MG): a pessoa confere pela cidade
      const unico = norm(e && e.nome) === norm(it.nome) || itens.filter((x) => chave(x.nome) === chave(it.nome)).length === 1;
      if (e) { usadas.add(e.id); pares.push({ i, empresa: e, nivel: nivel === 'igual' && !unico ? 'parecida' : nivel }); }
    }
  }
  return pares;
}

async function janelaImportar(ctx, d, aoTerminar) {
  let importou = false;   // ao fechar depois de importar, a aba recarrega para mostrar o que entrou
  const j = janela('Importar lista de prospecção', `<div class="grade" style="gap:14px" id="imp">
    <div class="campo"><label for="imp-arq">Planilha (.xlsx)</label><input type="file" id="imp-arq" accept=".xlsx,.xls" multiple>
      <small>Pode escolher vários arquivos de uma vez. Precisa ter a coluna <b>Empresa</b>; as outras (CNPJ, telefone, e-mail, site, cidade, UF, sistema, central, porte, anotações) entram se existirem.</small></div>
    <div id="imp-passos"></div></div>`, { largura: 760, aoFechar: () => { if (importou && aoTerminar) aoTerminar(); } });
  const passos = j.corpo.querySelector('#imp-passos');
  j.corpo.querySelector('#imp-arq').addEventListener('change', async (ev) => {
    const arquivos = [...ev.target.files]; if (!arquivos.length) return;
    passos.innerHTML = '<p class="apagado">Lendo a planilha…</p>';
    let itens = [];
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      for (const a of arquivos) itens.push(...lerLista(XLSX, XLSX.read(await a.arrayBuffer(), { type: 'array' }), a.name.replace(/\.xlsx?$/i, '')));
    } catch (err) { passos.innerHTML = `<div class="aviso erro">Não consegui ler a planilha: ${esc(err.message || err)}</div>`; return; }
    // a mesma cooperativa duas vezes na planilha: fica uma
    const vistos = new Set();
    itens = itens.filter((it) => { const k = it.cnpj ? it.cnpj.replace(/\D/g, '') : norm(it.nome); if (vistos.has(k)) return false; vistos.add(k); return true; });
    if (!itens.length) { passos.innerHTML = '<div class="aviso erro">Não achei nenhuma linha com a coluna <b>Empresa</b> preenchida.</div>'; return; }
    const cnpjs = new Set(d.empresas.map((e) => e.cnpj).filter(Boolean));
    for (const it of itens) it.repetida = !!(it.cnpj && cnpjs.has(it.cnpj));
    const novos = itens.filter((it) => !it.repetida);
    const pares = conferirCadastradas(novos, d.empresas);
    const sistemas = [...new Set(novos.map((it) => it.sistema || SEM_SISTEMA))].sort((a, b) => novos.filter((x) => (x.sistema || SEM_SISTEMA) === b).length - novos.filter((x) => (x.sistema || SEM_SISTEMA) === a).length);
    const mapa = await lerResponsaveis();
    const repetidas = itens.length - novos.length;
    passos.innerHTML = `
      <div class="aviso ok"><b>${itens.length}</b> na planilha${repetidas ? ` · <b>${repetidas}</b> já foram importadas antes (vou pular)` : ''} · ${sistemas.map((s) => `${esc(s)} ${novos.filter((x) => (x.sistema || SEM_SISTEMA) === s).length}`).join(' · ')}</div>
      ${novos.length ? `<div class="cartao" style="padding:12px"><h3>1. Já estão cadastradas na plataforma?</h3>
        ${pares.length ? `<p class="peq apagado mt">Achei estes nomes iguais ou parecidos com empresas que vocês já têm. <b>Marcado = é a mesma</b>: a plataforma completa os dados dela (CNPJ, telefone, sistema) em vez de criar outra, e cliente não entra em "A prospectar".</p>
          <div class="grade mt" style="gap:8px">${pares.map((p, k) => `<label class="check" style="align-items:flex-start"><input type="checkbox" data-par="${k}"${p.nivel === 'igual' ? ' checked' : ''}>
            <span><b>${esc(p.empresa.nome)}</b> <span class="peq apagado">(na plataforma)</span> ${seloSituacao(situacaoDe(p.empresa, d))} = <b>${esc(novos[p.i].nome)}</b> <span class="peq apagado">(da lista · ${esc([novos[p.i].cidade, novos[p.i].uf].filter(Boolean).join('/'))})</span>
            ${p.nivel === 'parecida' ? ' <span class="selo alerta">nome parecido: confira</span>' : ''}</span></label>`).join('')}</div>`
          : '<p class="peq apagado mt">Nenhum nome da lista bate com as empresas que já estão na plataforma: todas entram como novas.</p>'}</div>
      <div class="cartao" style="padding:12px"><h3>2. Quem cuida de cada sistema?</h3>
        <p class="peq apagado mt">A responsável recebe as cooperativas do sistema em "A prospectar". Dá para trocar depois em <b>Responsáveis por sistema</b>.</p>
        <div class="grade mt" style="gap:8px">${sistemas.map((s, k) => `<div class="grade g2" style="gap:10px;align-items:center"><b>${esc(s)} <span class="peq apagado">(${novos.filter((x) => (x.sistema || SEM_SISTEMA) === s).length})</span></b>${selectEquipe(d, `imp-r-${k}`, mapa[s] || '')}</div>`).join('')}</div></div>
      <div class="linha"><button class="btn pri" type="button" id="imp-ok">Importar ${novos.length} ${novos.length === 1 ? 'empresa' : 'empresas'}</button><button class="btn" type="button" data-fechar>Desistir</button></div>
      <div id="imp-prog"></div>` : '<p>Nada novo para importar.</p>'}`;
    passos.querySelector('#imp-ok')?.addEventListener('click', async (ev) => {
      const btn = ev.target; btn.disabled = true;
      const prog = passos.querySelector('#imp-prog');
      const ligar = new Map(pares.filter((p, k) => passos.querySelector(`[data-par="${k}"]`).checked).map((p) => [p.i, p.empresa.id]));
      const resp = Object.fromEntries(sistemas.map((s, k) => [s, passos.querySelector(`#imp-r-${k}`).value || null]));
      const fonte = novos[0].fonte;
      const enviar = novos.map((it, i) => ({ ...it, empresa_id: ligar.get(i) || '', responsavel_id: resp[it.sistema || SEM_SISTEMA] || '', repetida: undefined, fonte: undefined }));
      const total = { novas: 0, ligadas: 0, repetidas: 0, no_funil: 0 };
      try {
        for (let k = 0; k < enviar.length; k += 100) {
          prog.innerHTML = `<p class="apagado">Importando… ${k} de ${enviar.length}</p>`;
          const { data, error } = await sb.rpc('importar_prospeccao', { itens: enviar.slice(k, k + 100), fonte });
          if (error) throw error;
          importou = true;
          for (const c of Object.keys(total)) total[c] += Number((data || {})[c] || 0);
        }
        const mapaNovo = { ...mapa }; for (const s of sistemas) if (s !== SEM_SISTEMA) mapaNovo[s] = resp[s];
        await gravarResponsaveis(mapaNovo);
        passos.innerHTML = `<div class="aviso ok"><b>Pronto!</b> ${total.novas} novas em <b>A prospectar</b>${total.ligadas ? ` · ${total.ligadas} já estavam cadastradas (dados completados${total.ligadas > total.no_funil - total.novas ? '; clientes ficam fora de A prospectar' : ''})` : ''}${total.repetidas + repetidas ? ` · ${total.repetidas + repetidas} já tinham sido importadas` : ''}.</div>
          <div class="linha mt"><button class="btn pri" type="button" data-fechar>Ver a Prospecção</button></div>`;
      } catch (err) {
        const msg = faltaScript(err) ? 'Falta rodar o script 23-prospeccao.sql no Supabase.' : explicarErro(err);
        prog.innerHTML = `<div class="aviso erro">Parou no meio: ${esc(msg)} As que já entraram ficam; pode importar o mesmo arquivo de novo que elas são puladas.</div>`;
        btn.disabled = false;
      }
    });
  });
}
