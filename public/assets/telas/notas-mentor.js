// Notas fiscais do mentor parceiro (script 58, pedido da Juliana em 30/10/2026). Só para papel 'mentor' (as sócias recebem pela
// distribuição). O mentor completa os dados para pagamento, envia a nota fiscal de serviço do mês (PDF ou foto) e, ao enviar, já vê
// a data prevista de pagamento: a Mentorei paga nos dias 5, 15 e 25 (financeiro-regras.js `pagamentoDaNota`). A coordenação recebe
// e-mail (/api/nota-mentor) e a nota entra na agenda de pagamentos do Financeiro. Decisão dela: o mentor NÃO vê quanto a plataforma
// calcula que ele tem a receber; vê só as notas dele, a data prevista e a situação.
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { faltaScript } from './agenda-dados.js';
import { feriadoDe } from '../agenda-regras.js';
import * as F from '../financeiro-regras.js';

const SITUACAO = { recebida: ['Recebida', 'neutro'], conferida: ['Conferida', 'ok'], paga: ['Paga', 'ok'], devolvida: ['Devolvida', 'erro'] };
const DIA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const comDia = (dia) => `${dataBR(dia)} (${DIA_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]})`;
const real = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const digitos = (s) => String(s || '').replace(/\D/g, '');
const MAX = 10 * 1024 * 1024;

export async function render(ctx, el) {
  if (ctx.perfil.papel !== 'mentor') { el.innerHTML = '<div class="aviso">Esta página é dos mentores parceiros, para enviar a nota fiscal de serviço.</div>'; return; }
  const eu = ctx.perfil.id;
  const [dados, notas] = await Promise.all([
    sb.from('mentor_pagamento_dados').select('*').eq('perfil_id', eu).maybeSingle(),
    sb.from('fin_notas_mentor').select('*').eq('perfil_id', eu).order('enviada_em', { ascending: false }),
  ]);
  if ((dados.error && faltaScript(dados.error)) || (notas.error && faltaScript(notas.error))) { el.innerHTML = '<div class="aviso">O envio de notas fiscais ainda não está disponível. Avise a Cintia.</div>'; return; }
  if (dados.error) throw dados.error;
  if (notas.error) throw notas.error;
  const dd = dados.data || {};
  const hoje = hojeISO();
  const mesPadrao = Number(hoje.slice(8, 10)) <= 20 ? F.somarMeses(hoje.slice(0, 7), -1) : hoje.slice(0, 7);
  const meses = [-3, -2, -1, 0].map((k) => F.somarMeses(hoje.slice(0, 7), k));
  const completo = (x) => x.nome_pagamento && [11, 14].includes(digitos(x.documento).length) && x.pix;
  const proximos = F.proximosPagamentos(hoje, 3, feriadoDe);

  el.innerHTML = `
    <div class="cab"><div><h1>Notas fiscais</h1><p class="sub">Envie aqui a nota fiscal de serviço de cada mês. A Mentorei paga nos dias 5, 15 e 25.</p></div></div>
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

  $('#dp-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const reg = { perfil_id: eu, tipo: $('#dp-tipo').value, documento: $('#dp-doc').value.trim(), nome_pagamento: $('#dp-nome').value.trim(), pix_tipo: $('#dp-pixtipo').value,
      pix: $('#dp-pix').value.trim(), banco: $('#dp-banco').value.trim() || null, agencia: $('#dp-ag').value.trim() || null, conta: $('#dp-conta').value.trim() || null, atualizado_em: new Date().toISOString() };
    const msg = $('#dp-msg');
    if (![11, 14].includes(digitos(reg.documento).length)) { msg.textContent = 'O CPF tem 11 números e o CNPJ, 14.'; return; }
    if (!reg.nome_pagamento || !reg.pix) { msg.textContent = 'Preencha o nome e a chave PIX.'; return; }
    const { error } = await sb.from('mentor_pagamento_dados').upsert(reg);
    if (error) { msg.textContent = explicarErro(error); return; }
    avisar('Dados salvos.'); ctx.irPara('#/notas');
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
      try {
        const { data: { session } } = await sb.auth.getSession();
        fetch('/api/nota-mentor', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ id }) }).catch(() => {});
      } catch (_) { /* sem e-mail: a nota já está na agenda de pagamentos */ }
      avisar(`Nota enviada. Pagamento previsto para ${comDia(pagamento_previsto)}.`);
      ctx.irPara('#/notas');
    } catch (e) { msg.textContent = explicarErro(e); $('#nf-enviar').disabled = false; }
  });

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    try {
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
