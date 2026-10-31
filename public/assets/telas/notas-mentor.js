// Notas fiscais do mentor parceiro (script 58, pedido da Juliana em 30/10/2026). Só para papel 'mentor' (as sócias recebem pela
// distribuição). O mentor completa os dados para pagamento, envia a nota fiscal de serviço do mês (PDF ou foto) e, ao enviar, já vê
// a data prevista de pagamento: a Mentorei paga nos dias 5, 15 e 25 (financeiro-regras.js `pagamentoDaNota`). A coordenação recebe
// e-mail (/api/nota-mentor) e a nota entra na agenda de pagamentos do Financeiro.
// EXTRATO (script 60, 31/10, pedido dela: "o mentor vai precisar emitir a nota"): o mentor vê o mês dele (aulas, sessões, horas
// lançadas pela coordenação, valor da hora e total; rpc meu_extrato_mentor, as mesmas contas do Financeiro) e manda recados sobre
// pagamento (fin_mentor_recados); recado e mudança nos dados para pagamento avisam a coordenação por e-mail e entram nas pendências.
// Script 61 (31/10, pedido da Juliana para o tutorial do mentor): "Está certo" = o mentor confere o extrato do mês
// (fin_mentor_conferencias, com o total que ele viu; se o total mudar depois, pede para conferir de novo) e o quadro
// "Para quem emitir a nota" (razão social e CNPJ da contratante, os mesmos do contrato).
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { faltaScript } from './agenda-dados.js';
import { feriadoDe } from '../agenda-regras.js';
import * as F from '../financeiro-regras.js';
import { CONTRATANTE } from '../contrato-mentor.js';

const SITUACAO = { recebida: ['Recebida', 'neutro'], conferida: ['Conferida', 'ok'], paga: ['Paga', 'ok'], devolvida: ['Devolvida', 'erro'] };
const EXTRATO = { previa: ['Prévia: a coordenação ainda vai conferir', 'neutro'], aberto: ['Em conferência pela coordenação', 'neutro'], aprovado: ['Conferido pela coordenação', 'ok'], pago: ['Pago', 'ok'] };
const DIA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const comDia = (dia) => `${dataBR(dia)} (${DIA_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]})`;
const real = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const digitos = (s) => String(s || '').replace(/\D/g, '');
const horasBR = (h) => `${String(F.arred(h)).replace('.', ',')} h`;
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const MAX = 10 * 1024 * 1024;

// avisa a coordenação por e-mail (nota enviada ou recado); sem e-mail, continua nas pendências do Financeiro
async function avisarCoordenacao(corpo) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    fetch('/api/nota-mentor', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(corpo) }).catch(() => {});
  } catch (_) { /* fica nas pendências */ }
}

export async function render(ctx, el) {
  if (ctx.perfil.papel !== 'mentor') { el.innerHTML = '<div class="aviso">Esta página é dos mentores parceiros, para ver o extrato do mês e enviar a nota fiscal de serviço.</div>'; return; }
  const eu = ctx.perfil.id;
  const [dados, notas, recados, conferidos] = await Promise.all([
    sb.from('mentor_pagamento_dados').select('*').eq('perfil_id', eu).maybeSingle(),
    sb.from('fin_notas_mentor').select('*').eq('perfil_id', eu).order('enviada_em', { ascending: false }),
    sb.from('fin_mentor_recados').select('*').eq('perfil_id', eu).order('criado_em', { ascending: false }),
    sb.from('fin_mentor_conferencias').select('*').eq('perfil_id', eu),
  ]);
  const tem61 = !conferidos.error;
  const conferencia = (mes) => (conferidos.data || []).find((c) => c.mes === mes) || null;
  if ((dados.error && faltaScript(dados.error)) || (notas.error && faltaScript(notas.error))) { el.innerHTML = '<div class="aviso">O envio de notas fiscais ainda não está disponível. Avise a Cintia.</div>'; return; }
  if (dados.error) throw dados.error;
  if (notas.error) throw notas.error;
  const tem60 = !(recados.error && faltaScript(recados.error));
  const dd = dados.data || {};
  const hoje = hojeISO();
  const mesPadrao = Number(hoje.slice(8, 10)) <= 20 ? F.somarMeses(hoje.slice(0, 7), -1) : hoje.slice(0, 7);
  const meses = [-3, -2, -1, 0].map((k) => F.somarMeses(hoje.slice(0, 7), k));
  const completo = (x) => x.nome_pagamento && [11, 14].includes(digitos(x.documento).length) && x.pix;
  const proximos = F.proximosPagamentos(hoje, 3, feriadoDe);

  el.innerHTML = `
    <div class="cab"><div><h1>Notas fiscais</h1><p class="sub">Veja o resumo do que você fez no mês, emita a nota fiscal com esse valor e envie aqui. A Mentorei paga nos dias 5, 15 e 25.</p></div></div>
    ${tem60 ? `<section class="cartao" style="margin-bottom:16px" id="ex-area"><p class="carregando">Carregando o extrato…</p></section>` : ''}
    <div class="grade g2">
      <section class="cartao"><h3>Enviar a nota do mês</h3>
        <form id="nf-form" class="grade mt" style="gap:10px" novalidate>
          <div class="grade g2" style="gap:10px">
            <div class="campo"><label for="nf-mes">Mês dos serviços *</label><select id="nf-mes">${meses.map((m) => `<option value="${m}"${m === mesPadrao ? ' selected' : ''}>${F.nomeMes(m)}</option>`).join('')}</select></div>
            <div class="campo"><label for="nf-valor">Valor da nota (R$) *</label><input type="number" id="nf-valor" min="0" step="0.01" inputmode="decimal"></div>
            <div class="campo"><label for="nf-num">Número da nota</label><input type="text" id="nf-num" maxlength="30"></div>
            <div class="campo"><label for="nf-emissao">Data de emissão</label><input type="date" id="nf-emissao" value="${hoje}"></div>
          </div>
          <div class="campo"><label for="nf-arq">Arquivo da nota (PDF ou foto) *</label><input type="file" id="nf-arq" accept=".pdf,image/*"></div>
          <div class="campo"><label for="nf-obs">Recado para a coordenação</label><input type="text" id="nf-obs" maxlength="300"></div>
          <p class="peq apagado" id="nf-previsao"></p>
          <div class="linha"><button class="btn pri" type="submit" id="nf-enviar">Enviar</button><span class="peq apagado" id="nf-msg" role="status"></span></div>
        </form>
      </section>
      <section class="cartao"><h3>Seus dados para pagamento</h3>
        ${completo(dd) ? '' : '<div class="aviso mt">Complete os seus dados para poder enviar a nota.</div>'}
        <form id="dp-form" class="grade mt" style="gap:10px" novalidate>
          <div class="grade g2" style="gap:10px">
            <div class="campo"><label for="dp-tipo">Você emite como</label><select id="dp-tipo"><option value="pj"${dd.tipo !== 'pf' ? ' selected' : ''}>Empresa (CNPJ)</option><option value="pf"${dd.tipo === 'pf' ? ' selected' : ''}>Pessoa física (CPF)</option></select></div>
            <div class="campo"><label for="dp-doc">CNPJ ou CPF *</label><input type="text" id="dp-doc" maxlength="20" inputmode="numeric" value="${esc(dd.documento || '')}"></div>
          </div>
          <div class="campo"><label for="dp-nome">Nome ou razão social (como na nota) *</label><input type="text" id="dp-nome" maxlength="160" value="${esc(dd.nome_pagamento || '')}"></div>
          <div class="grade g2" style="gap:10px">
            <div class="campo"><label for="dp-pixtipo">Tipo da chave PIX</label><select id="dp-pixtipo">${[['cnpj', 'CNPJ'], ['cpf', 'CPF'], ['email', 'E-mail'], ['celular', 'Celular'], ['aleatoria', 'Chave aleatória']].map(([k, t]) => `<option value="${k}"${dd.pix_tipo === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="campo"><label for="dp-pix">Chave PIX *</label><input type="text" id="dp-pix" maxlength="120" value="${esc(dd.pix || '')}"></div>
          </div>
          <details><summary>Conta bancária (opcional)</summary><div class="grade g3 mt" style="gap:10px">
            <div class="campo"><label for="dp-banco">Banco</label><input type="text" id="dp-banco" maxlength="60" value="${esc(dd.banco || '')}"></div>
            <div class="campo"><label for="dp-ag">Agência</label><input type="text" id="dp-ag" maxlength="12" value="${esc(dd.agencia || '')}"></div>
            <div class="campo"><label for="dp-conta">Conta</label><input type="text" id="dp-conta" maxlength="20" value="${esc(dd.conta || '')}"></div>
          </div></details>
          <div class="linha"><button class="btn" type="submit">Salvar os dados</button><span class="peq apagado" id="dp-msg" role="status"></span></div>
        </form>
      </section>
    </div>
    ${tem60 ? `<section class="cartao mt"><h3>Recado sobre pagamento</h3>
      <p class="peq apagado">Algo importante sobre o pagamento? (uma aula que faltou no extrato, horas a mais, mudança de conta, adiantamento…) A Cintia recebe por e-mail.</p>
      <form id="rc-form" class="grade mt" style="gap:10px" novalidate>
        <div class="campo"><label for="rc-mes">Sobre o mês</label><select id="rc-mes"><option value="">Não é de um mês só</option>${meses.map((m) => `<option value="${m}"${m === mesPadrao ? ' selected' : ''}>${F.nomeMes(m)}</option>`).join('')}</select></div>
        <div class="campo"><label for="rc-texto">Recado *</label><textarea id="rc-texto" rows="3" maxlength="2000"></textarea></div>
        <div class="linha"><button class="btn pri" type="submit" id="rc-enviar">Enviar o recado</button><span class="peq apagado" id="rc-msg" role="status"></span></div>
      </form>
      ${(recados.data || []).length ? `<div class="grade mt" style="gap:8px">${recados.data.slice(0, 12).map((r) => `<div class="aviso${r.resposta ? ' ok' : ''}">
        <small class="apagado">${dataBR(r.criado_em)}${r.mes ? ` · ${esc(F.nomeMes(r.mes))}` : ''} · ${r.resposta ? 'respondido' : r.lido_em ? 'visto pela coordenação' : 'enviado'}</small><br>${esc(r.texto)}
        ${r.resposta ? `<br><b>Resposta da coordenação:</b> ${esc(r.resposta)}` : ''}</div>`).join('')}</div>` : ''}
    </section>` : ''}
    <section class="cartao mt"><h3>Notas enviadas</h3>
      ${(notas.data || []).length ? `<div class="tabela mt"><table><thead><tr><th>Mês</th><th>Nota</th><th style="text-align:right">Valor</th><th>Enviada</th><th>Pagamento</th><th>Situação</th><th></th></tr></thead><tbody>
        ${notas.data.map((n) => { const [t, c] = SITUACAO[n.situacao] || [n.situacao, 'neutro']; const dia = n.pagar_em || n.pagamento_previsto; return `<tr>
          <td>${esc(F.nomeMes(n.mes_referencia))}</td><td>${esc(n.numero || '—')}<br><button class="btn peq" type="button" data-ver="${esc(n.arquivo)}">Ver o arquivo</button></td>
          <td class="fn-num" style="text-align:right">${real(n.valor)}</td><td>${dataBR(n.enviada_em)}</td>
          <td>${n.situacao === 'paga' ? `paga em ${dataBR(n.pago_em)}` : n.situacao === 'devolvida' ? '—' : `previsto para ${comDia(dia)}`}</td>
          <td><span class="selo ${c}">${t}</span>${n.situacao === 'devolvida' && n.devolvida_motivo ? `<br><small>${esc(n.devolvida_motivo)}</small>` : ''}</td>
          <td>${['recebida', 'devolvida'].includes(n.situacao) ? `<button class="btn peq" type="button" data-apagar="${n.id}" aria-label="Apagar a nota">✕</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="apagado mt">Nenhuma nota enviada ainda.</p>'}
      <p class="peq apagado mt">Pagamos nos dias 5, 15 e 25 (fim de semana ou feriado: no dia útil seguinte). A nota entra no primeiro desses dias que vier pelo menos 3 dias depois do envio e depois do fim do mês dos serviços. Próximos dias de pagamento: ${proximos.map(dataBR).join(', ')}.</p>
    </section>`;

  const $ = (s) => el.querySelector(s);
  const previsao = () => { const p = F.pagamentoDaNota({ enviadaEm: new Date().toISOString(), mesReferencia: $('#nf-mes').value, feriado: feriadoDe }); $('#nf-previsao').innerHTML = `Enviando hoje, o pagamento fica previsto para <b>${comDia(p)}</b>.`; return p; };
  $('#nf-mes').addEventListener('change', previsao);
  previsao();

  // ---------- extrato do mês ----------
  let atual = null;
  const desenharExtrato = async (mes) => {
    const area = $('#ex-area');
    if (!area) return;
    area.innerHTML = '<p class="carregando">Carregando o extrato…</p>';
    const { data: ext, error } = await sb.rpc('meu_extrato_mentor', { p_mes: mes });
    if (error) { area.innerHTML = faltaScript(error) ? '<p class="apagado">O extrato do mês ainda não está disponível. Avise a Cintia.</p>' : `<div class="aviso">${esc(explicarErro(error))}</div>`; return; }
    const x = F.extratoDoMentor(ext || {}, hoje);
    atual = { mes, ...x };
    const [st, cls] = EXTRATO[x.situacao] || EXTRATO.previa;
    const detalhe = (l) => {
      if (l.extra) return `<small class="apagado">lançado pela coordenação${l.datas && l.datas[0] ? ` · ${dataBR(l.datas[0])}` : ''}</small>`;
      const its = x.itens.filter((i) => i.chave === l.chave).sort((a, b) => a.data.localeCompare(b.data));
      return its.length ? `<small class="apagado">${its.map((i) => (i.tipo === 'modulo' ? `Módulo ${i.numero || ''}${i.titulo ? ` (${esc(i.titulo)})` : ''} · ${dataBR(i.data)}${i.minutos ? ` · ${horasBR(i.minutos / 60)}` : ''}`
        : `Sessão ${i.numero || ''}${i.mentorado ? ` · ${esc(i.mentorado.split(' ')[0])}` : ''} · ${dataBR(i.data)} · ${horasBR(i.minutos / 60)}`)).join('<br>')}</small>` : '';
    };
    const quanto = (l) => (l.forma === 'hora' ? horasBR(l.horas) : l.forma === 'percentual' ? `${l.valor_unit ?? '?'}% do faturado` : l.forma === 'mensal' ? 'valor mensal' : `${l.quantidade} ${(F.FORMAS[l.forma] || F.FORMAS.atendimento)[l.quantidade === 1 ? 1 : 2]}`);
    const cad = x.padrao;
    const mesAtual = mes === hoje.slice(0, 7);
    // conferência do mentor: vale enquanto o total for o mesmo que ele viu
    const cf = conferencia(mes);
    const cfVale = cf && Math.abs(Number(cf.total) - x.total) < 0.01;
    const blocoConferir = !tem61 || !(x.total > 0) || (mesAtual && Number(hoje.slice(8, 10)) < 25) ? ''   // mês corrente: só do dia 25 em diante
      : cfVale ? `<div class="aviso ok mt">✓ Você conferiu este extrato em ${dataBR(cf.conferido_em)}. Agora é emitir a nota com este valor e enviar logo abaixo.</div>`
      : `<div class="aviso mt">${cf ? `Você conferiu ${real(cf.total)} em ${dataBR(cf.conferido_em)}, mas o valor mudou depois (a coordenação ajustou ou entrou algo novo). Confira de novo.` : 'Confira as aulas, as sessões e o valor. Se estiver tudo certo, clique em "Está certo": a coordenação fica sabendo.'}
          <div class="linha mt"><button class="btn pri" type="button" id="ex-certo">✓ Está certo</button><button class="btn" type="button" id="ex-errado">Achei algo errado</button></div></div>`;
    const blocoTomador = x.total > 0 ? `<div class="mt" style="background:var(--bg);border-radius:12px;padding:12px 14px">
        <b>Para quem emitir a nota</b>
        <p class="peq mt">${esc(CONTRATANTE.razao)} · CNPJ ${esc(CONTRATANTE.cnpj)} · ${esc(CONTRATANTE.cidade)}</p>
        <p class="peq apagado">Valor: <b>${real(x.total)}</b>. Na descrição do serviço, use o botão "Copiar a descrição para a nota".</p>
        <button class="btn peq mt" type="button" id="ex-tomador">Copiar razão social e CNPJ</button></div>` : '';
    area.innerHTML = `
      <div class="linha" style="margin-bottom:6px">
        <button class="btn peq" type="button" data-ex-mes="${F.somarMeses(mes, -1)}" aria-label="Mês anterior">‹</button>
        <h3 style="margin:0">Seu extrato de ${esc(F.nomeMes(mes))}</h3>
        <button class="btn peq" type="button" data-ex-mes="${F.somarMeses(mes, 1)}" aria-label="Mês seguinte"${mesAtual ? ' disabled' : ''}>›</button>
        <span style="flex:1"></span><span class="selo ${cls}">${x.situacao === 'pago' && x.pago_em ? `Pago em ${dataBR(x.pago_em)}` : st}</span>
      </div>
      <p class="peq apagado">${cad && cad.valor != null ? `Seu valor: <b>${cad.forma === 'percentual' ? `${cad.valor}%` : real(cad.valor)}</b> ${cad.forma === 'hora' ? 'por hora' : `(${esc(F.nomeForma(cad.forma).toLowerCase())})`}. ` : 'A coordenação ainda está acertando o seu valor. '}Contam as aulas que já aconteceram e as sessões realizadas no mês, mais o que a coordenação lançou.${mesAtual ? ' O mês ainda não terminou.' : ''}</p>
      ${x.linhas.length ? `<div class="tabela mt"><table><thead><tr><th>Turma ou mentoria</th><th>Quanto</th><th style="text-align:right">Valor</th><th style="text-align:right">Total</th></tr></thead><tbody>
        ${x.linhas.map((l) => `<tr><td><b>${esc(l.rotulo)}</b>${l.ajuste ? `<br><small>ajuste da coordenação: ${esc(l.ajuste)}</small>` : ''}<br>${detalhe(l)}</td>
          <td>${esc(quanto(l))}</td><td class="fn-num" style="text-align:right">${l.forma === 'percentual' || l.valor_unit == null ? '' : `${real(l.valor_unit)}${l.forma === 'hora' ? '/h' : ''}`}</td>
          <td class="fn-num" style="text-align:right">${l.coberto_pelo_mensal ? '<small class="apagado">no mensal</small>' : real(l.total)}</td></tr>`).join('')}
        <tr class="fn-forte"><td colspan="3">Total do mês</td><td class="fn-num" style="text-align:right">${real(x.total)}</td></tr>
      </tbody></table></div>
      ${blocoConferir}
      ${blocoTomador}
      <div class="linha mt">${x.total > 0 ? '<button class="btn pri" type="button" id="ex-usar">Usar este valor na nota</button>' : ''}<button class="btn" type="button" id="ex-copiar">Copiar a descrição para a nota</button></div>
      <p class="peq apagado mt">Achou algo errado ou faltando? Mande um recado logo abaixo.</p>`
    : '<p class="apagado mt">Nada neste mês ainda.</p>'}`;
  };
  if (tem60) desenharExtrato(mesPadrao);

  $('#dp-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const reg = { perfil_id: eu, tipo: $('#dp-tipo').value, documento: $('#dp-doc').value.trim(), nome_pagamento: $('#dp-nome').value.trim(), pix_tipo: $('#dp-pixtipo').value,
      pix: $('#dp-pix').value.trim(), banco: $('#dp-banco').value.trim() || null, agencia: $('#dp-ag').value.trim() || null, conta: $('#dp-conta').value.trim() || null, atualizado_em: new Date().toISOString() };
    const msg = $('#dp-msg');
    if (![11, 14].includes(digitos(reg.documento).length)) { msg.textContent = 'O CPF tem 11 números e o CNPJ, 14.'; return; }
    if (!reg.nome_pagamento || !reg.pix) { msg.textContent = 'Preencha o nome e a chave PIX.'; return; }
    const { error } = await sb.from('mentor_pagamento_dados').upsert(reg);
    if (error) { msg.textContent = explicarErro(error); return; }
    // dados mudaram: a coordenação fica sabendo (e-mail + pendência), para não pagar na conta antiga
    const mudou = ['tipo', 'documento', 'nome_pagamento', 'pix_tipo', 'pix', 'banco', 'agencia', 'conta'].filter((k) => String(dd[k] || '') !== String(reg[k] || ''));
    if (tem60 && mudou.length) {
      const texto = `${dd.perfil_id ? 'Mudou' : 'Preencheu'} os dados para pagamento: ${reg.nome_pagamento} · ${reg.tipo === 'pf' ? 'CPF' : 'CNPJ'} ${reg.documento} · PIX (${reg.pix_tipo}) ${reg.pix}${reg.banco ? ` · ${reg.banco} ag. ${reg.agencia || '—'} conta ${reg.conta || '—'}` : ''}`;
      const r = await sb.from('fin_mentor_recados').insert({ perfil_id: eu, tipo: 'dados', texto: texto.slice(0, 2000) }).select('id').single();
      if (!r.error) avisarCoordenacao({ recado: r.data.id });
    }
    avisar('Dados salvos.'); ctx.irPara('#/notas');
  });

  const rc = $('#rc-form');
  if (rc) rc.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const texto = $('#rc-texto').value.trim();
    if (!texto) { $('#rc-msg').textContent = 'Escreva o recado.'; return; }
    $('#rc-enviar').disabled = true;
    const { data, error } = await sb.from('fin_mentor_recados').insert({ perfil_id: eu, tipo: 'recado', mes: $('#rc-mes').value || null, texto }).select('id').single();
    if (error) { $('#rc-msg').textContent = explicarErro(error); $('#rc-enviar').disabled = false; return; }
    avisarCoordenacao({ recado: data.id });
    avisar('Recado enviado para a coordenação.'); ctx.irPara('#/notas');
  });

  $('#nf-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = $('#nf-msg');
    if (!completo(dd)) { msg.textContent = 'Primeiro complete e salve os seus dados para pagamento (ao lado).'; return; }
    const valor = Number($('#nf-valor').value);
    const arq = $('#nf-arq').files[0];
    if (!(valor > 0)) { msg.textContent = 'Escreva o valor da nota.'; return; }
    if (!arq) { msg.textContent = 'Escolha o arquivo da nota.'; return; }
    if (arq.size > MAX) { msg.textContent = 'O arquivo passa de 10 MB.'; return; }
    const mes = $('#nf-mes').value;
    if ((notas.data || []).some((n) => n.mes_referencia === mes && n.situacao !== 'devolvida') && !confirm(`Você já enviou uma nota de ${F.nomeMes(mes)}. Enviar outra?`)) return;
    $('#nf-enviar').disabled = true; msg.textContent = 'Enviando…';
    try {
      const id = crypto.randomUUID();
      const ext = (arq.name.match(/\.[a-z0-9]{2,5}$/i) || ['.pdf'])[0].toLowerCase();
      const caminho = `notas-mentores/${eu}/${mes}/${id}${ext}`;
      const up = await sb.storage.from('financeiro').upload(caminho, arq, { contentType: arq.type || 'application/pdf', upsert: false });
      if (up.error) throw up.error;
      const enviadaEm = new Date().toISOString();
      const pagamento_previsto = F.pagamentoDaNota({ enviadaEm, mesReferencia: mes, feriado: feriadoDe });
      const { error } = await sb.from('fin_notas_mentor').insert({ id, perfil_id: eu, mes_referencia: mes, valor, numero: $('#nf-num').value.trim() || null,
        emitida_em: $('#nf-emissao').value || null, arquivo: caminho, arquivo_nome: arq.name.slice(0, 120), observacao: $('#nf-obs').value.trim() || null, enviada_em: enviadaEm, pagamento_previsto, situacao: 'recebida' });
      if (error) { await sb.storage.from('financeiro').remove([caminho]); throw error; }
      avisarCoordenacao({ id });
      avisar(`Nota enviada. Pagamento previsto para ${comDia(pagamento_previsto)}.`);
      ctx.irPara('#/notas');
    } catch (e) { msg.textContent = explicarErro(e); $('#nf-enviar').disabled = false; }
  });

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.exMes) return desenharExtrato(b.dataset.exMes);
      if (b.id === 'ex-certo' && atual) {
        b.disabled = true;
        const reg = { perfil_id: eu, mes: atual.mes, total: F.arred(atual.total), conferido_em: new Date().toISOString() };
        const { error } = await sb.from('fin_mentor_conferencias').upsert(reg);
        if (error) { b.disabled = false; throw error; }
        conferidos.data = [...(conferidos.data || []).filter((c) => c.mes !== atual.mes), reg];
        avisar('Pronto: a coordenação sabe que você conferiu. Agora emita a nota e envie aqui.');
        return desenharExtrato(atual.mes);
      }
      if (b.id === 'ex-errado') {
        const f = $('#rc-form');
        if (f) { $('#rc-mes').value = atual ? atual.mes : ''; f.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#rc-texto').focus(); }
        return;
      }
      if (b.id === 'ex-tomador') {
        const texto = `${CONTRATANTE.razao} · CNPJ ${CONTRATANTE.cnpj}`;
        try { await navigator.clipboard.writeText(texto); avisar('Razão social e CNPJ copiados.'); } catch (_) { prompt('Copie:', texto); }
        return;
      }
      if (b.id === 'ex-usar' && atual) {
        const sel = $('#nf-mes');
        if (![...sel.options].some((o) => o.value === atual.mes)) sel.insertAdjacentHTML('beforeend', `<option value="${atual.mes}">${F.nomeMes(atual.mes)}</option>`);
        sel.value = atual.mes; previsao();
        $('#nf-valor').value = atual.total.toFixed(2);
        $('#nf-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return avisar(`Valor de ${maiuscula(F.nomeMes(atual.mes))} colocado na nota: ${real(atual.total)}.`);
      }
      if (b.id === 'ex-copiar' && atual) {
        const texto = F.textoParaNota({ mes: atual.mes, linhas: atual.linhas });
        try { await navigator.clipboard.writeText(texto); avisar('Descrição copiada. Cole na nota fiscal.'); } catch (_) { prompt('Copie a descrição:', texto); }
        return;
      }
      if (b.dataset.ver) {
        const { data, error } = await sb.storage.from('financeiro').createSignedUrl(b.dataset.ver, 600);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener');
      }
      if (b.dataset.apagar) {
        if (!confirm('Apagar esta nota? Se precisar, envie de novo.')) return;
        const n = notas.data.find((x) => x.id === b.dataset.apagar);
        const { error } = await sb.from('fin_notas_mentor').delete().eq('id', n.id);
        if (error) throw error;
        await sb.storage.from('financeiro').remove([n.arquivo]);
        avisar('Nota apagada.'); ctx.irPara('#/notas');
      }
    } catch (e) { avisar(explicarErro(e), true); }
  });
}
