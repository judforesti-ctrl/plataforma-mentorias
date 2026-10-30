// Contrato de prestação de serviço do mentor parceiro (script 55; texto em ../contrato-mentor.js). Pedido da Juliana (07/10 e
// 30/10/2026): o mentor assina na plataforma; pode deixar para depois por 7 dias e, passado isso, o contrato volta a aparecer em
// toda entrada até ser assinado. Quem é da administração vê o modelo e a situação de cada mentor (e abre o que foi assinado).
// Só para papel 'mentor' (as sócias são administração e não assinam contrato com a própria empresa).
import { sb, esc, dataBR, dataHoraBR, hojeISO, avisar, explicarErro } from '../base.js';
import { faltaScript, janela } from './agenda-dados.js';
import * as C from '../contrato-mentor.js';

const dataExtenso = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);
const ADIADO = 'mentorei.contratoDepois';

export async function render(ctx, el) {
  if (ctx.perfil.papel === 'mentor') {
    if (!C.LIBERADO) { el.innerHTML = '<div class="aviso">O contrato ainda não foi liberado pela Mentorei.</div>'; return; }
    return assinar(ctx, el);
  }
  if (ctx.ehAdmin) return painel(ctx, el);
  el.innerHTML = '<div class="aviso">O contrato de prestação de serviço é só para os mentores parceiros.</div>';
}

// ---------- mentor ----------
async function assinar(ctx, el) {
  const p = ctx.perfil;
  let { data: reg, error } = await sb.from('contratos_mentor').select('*').eq('perfil_id', p.id).eq('versao', C.VERSAO).maybeSingle();
  if (error && faltaScript(error)) { el.innerHTML = '<div class="aviso">O contrato ainda não está disponível. Avise a Cintia.</div>'; return; }
  if (error) throw error;
  if (!reg) {
    const r = await sb.from('contratos_mentor').insert({ perfil_id: p.id, versao: C.VERSAO, visto_em: new Date().toISOString() }).select('*').single();
    if (r.error) throw r.error;
    reg = r.data;
  }
  if (reg.aceito_em) {
    el.innerHTML = `<div class="cab"><div><h1>Meu contrato</h1><p class="sub">${esc(C.TITULO)} · assinado em ${esc(dataHoraBR(reg.aceito_em))}</p></div>
      <div class="acoes"><button class="btn" type="button" id="imprimir">Imprimir ou salvar em PDF</button></div></div>
      <section class="cartao"><div class="texto-termo">${C.preencher({ nome: reg.nome, documento: reg.documento, email: reg.email, data: dataExtenso(reg.aceito_em.slice(0, 10)) })}</div>
      <p class="peq apagado mt">Assinado eletronicamente na plataforma por ${esc(reg.nome)} (${esc(reg.documento)}) em ${esc(dataHoraBR(reg.aceito_em))}. Versão ${esc(reg.versao)} · código ${esc(String(reg.texto_hash || '').slice(0, 16))}.</p></section>`;
    el.querySelector('#imprimir').addEventListener('click', () => window.print());
    return;
  }
  const dias = diasDesde(reg.visto_em);
  const podeDepois = dias < C.PRAZO_LER_DEPOIS;
  el.innerHTML = `
  <div style="max-width:860px;margin:0 auto">
    <div class="cab"><div><h1>${esc(C.TITULO)}</h1>
      <p class="sub">Para continuar trabalhando com a Mentorei pela plataforma, leia e assine o contrato. Leva poucos minutos.</p></div></div>
    ${podeDepois ? '' : '<div class="aviso">Já se passaram 7 dias desde que o contrato apareceu pela primeira vez. Assine para que ele pare de aparecer a cada entrada.</div>'}
    <section class="cartao"><div class="texto-termo" id="texto">${C.preencher({ nome: p.nome, email: p.email, data: dataExtenso(hojeISO()) })}</div></section>
    <section class="cartao">
      <h3>Assinatura</h3>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo"><label for="ct-nome">Nome completo *</label><input type="text" id="ct-nome" maxlength="160" value="${esc(p.nome)}" autocomplete="name"></div>
        <div class="campo"><label for="ct-doc">CPF ou CNPJ *</label><input type="text" id="ct-doc" maxlength="20" inputmode="numeric" placeholder="Só os números servem"></div>
      </div>
      <label class="check mt"><input type="checkbox" id="ct-ok"><span>Li o contrato inteiro e concordo com ele.</span></label>
      <div class="linha mt"><button class="btn pri" type="button" id="ct-assinar">Assinar o contrato</button>
        <button class="btn" type="button" id="ct-depois">${podeDepois ? `Ler depois (faltam ${C.PRAZO_LER_DEPOIS - dias} dia${C.PRAZO_LER_DEPOIS - dias === 1 ? '' : 's'})` : 'Lembrar na próxima entrada'}</button>
        <span class="peq apagado" id="ct-msg" role="status"></span></div>
      <p class="peq apagado mt">Ao assinar, a plataforma guarda a data e a hora, a versão do contrato e os dados acima. Você pode ver e imprimir o contrato assinado em "Meu contrato".</p>
    </section>
  </div>`;
  const $ = (s) => el.querySelector(s);
  // o texto mostrado acompanha o que é digitado (é esse texto, com os dados, que é assinado)
  const textoFinal = () => C.preencher({ nome: $('#ct-nome').value.trim(), documento: $('#ct-doc').value.trim(), email: p.email, data: dataExtenso(hojeISO()) });
  const atualizar = () => { $('#texto').innerHTML = textoFinal(); };
  $('#ct-nome').addEventListener('input', atualizar);
  $('#ct-doc').addEventListener('input', atualizar);
  $('#ct-depois').addEventListener('click', async () => {
    try { sessionStorage.setItem(ADIADO, C.VERSAO); } catch (_) { /* navegador sem armazenamento */ }
    await sb.from('contratos_mentor').update({ adiado_em: new Date().toISOString() }).eq('perfil_id', p.id).eq('versao', C.VERSAO);
    ctx.irPara(ctx.inicio);
  });
  $('#ct-assinar').addEventListener('click', async () => {
    const msg = $('#ct-msg');
    const nome = $('#ct-nome').value.trim(), documento = $('#ct-doc').value.trim();
    if (nome.split(/\s+/).length < 2) { msg.textContent = 'Escreva o seu nome completo.'; return; }
    if (!C.documentoValido(documento)) { msg.textContent = 'O CPF tem 11 números e o CNPJ, 14.'; return; }
    if (!$('#ct-ok').checked) { msg.textContent = 'Marque a caixa "Li o contrato inteiro e concordo com ele".'; return; }
    msg.textContent = 'Assinando…';
    try {
      const texto_hash = await C.resumo(textoFinal());
      const { error: e } = await sb.from('contratos_mentor').update({ nome, documento, email: p.email, texto_hash, navegador: navigator.userAgent.slice(0, 200), aceito_em: new Date().toISOString() })
        .eq('perfil_id', p.id).eq('versao', C.VERSAO);
      if (e) throw e;
      if (ctx.contratoAssinado) ctx.contratoAssinado();
      avisar('Contrato assinado. Obrigada!');
      ctx.irPara('#/contrato');
    } catch (e) { msg.textContent = explicarErro(e); }
  });
}

// ---------- administração ----------
async function painel(ctx, el) {
  const [mentores, regs] = await Promise.all([
    sb.from('perfis').select('id, nome, email, ativo, termo_aceito_em').eq('papel', 'mentor').order('nome'),
    sb.from('contratos_mentor').select('*').eq('versao', C.VERSAO),
  ]);
  const falta = regs.error && faltaScript(regs.error);
  if (mentores.error) throw mentores.error;
  if (regs.error && !falta) throw regs.error;
  const lista = (mentores.data || []).filter((m) => m.ativo !== false);
  const reg = (id) => (regs.data || []).find((r) => r.perfil_id === id) || null;
  const situacao = (m) => {
    const r = reg(m.id);
    if (r && r.aceito_em) return `<span class="selo ok">Assinado em ${esc(dataBR(r.aceito_em))}</span>`;
    if (r && r.visto_em) return `<span class="selo alerta">Viu em ${esc(dataBR(r.visto_em))}, ainda não assinou</span>`;
    return m.termo_aceito_em ? '<span class="selo neutro">Ainda não abriu</span>' : '<span class="selo neutro">Ainda não entrou na plataforma</span>';
  };
  el.innerHTML = `<div class="cab"><div><h1>Contrato dos mentores</h1><p class="sub">${esc(C.TITULO)} · versão ${esc(C.VERSAO)}. Os mentores parceiros assinam na plataforma.</p></div></div>
    ${falta ? '<div class="aviso">Falta rodar o script <b>55</b> no Supabase. Até lá os mentores não veem o contrato.</div>' : ''}
    <div class="aviso">Este é o <b>modelo padrão</b>, ainda sem revisão jurídica. Para mudar o texto, peça ao Claude: a versão muda e quem já assinou é chamado a assinar a nova.
      ${C.LIBERADO ? '' : '<br><b>Ainda não liberado:</b> os mentores não veem o contrato. Depois de revisar, peça ao Claude para liberar.'}</div>
    <div class="grade g2 mt">
      <div class="cartao"><h3>Situação de cada mentor</h3>
        ${lista.length ? `<div class="tabela mt"><table><tbody>${lista.map((m) => `<tr><td><b>${esc(m.nome)}</b></td><td>${situacao(m)}</td>
          <td>${reg(m.id) && reg(m.id).aceito_em ? `<button class="btn peq" type="button" data-ver="${m.id}">Ver o assinado</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="apagado">Nenhum mentor parceiro.</p>'}
        <p class="peq apagado mt">O mentor pode deixar para depois por ${C.PRAZO_LER_DEPOIS} dias; depois disso, o contrato aparece a cada entrada até ele assinar.</p></div>
      <div class="cartao"><h3>O modelo</h3><div class="texto-termo mt" style="max-height:520px;overflow:auto">${C.preencher()}</div></div>
    </div>`;
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ver]'); if (!b) return;
    const r = reg(b.dataset.ver);
    janela(`Contrato assinado · ${r.nome}`, `<div class="texto-termo">${C.preencher({ nome: r.nome, documento: r.documento, email: r.email, data: dataExtenso(r.aceito_em.slice(0, 10)) })}</div>
      <p class="peq apagado mt">Assinado eletronicamente em ${esc(dataHoraBR(r.aceito_em))} · versão ${esc(r.versao)} · código ${esc(String(r.texto_hash || '').slice(0, 16))}.</p>`, { largura: 820 });
  });
}
