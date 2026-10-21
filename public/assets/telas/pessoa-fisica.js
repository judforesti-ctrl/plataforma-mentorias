// Vendas › Pessoa física (script 39): contatos de quem preencheu uma ferramenta aberta ao público (QR code, sem login).
// Chegam sozinhos pela função /api/contato-ferramenta: nome, e-mail, WhatsApp e cargo (as respostas ficam no celular da pessoa).
// No alto, o QR code e o link de cada ferramenta pública, para baixar e colocar nos slides.
// "Colocar no funil" (pedido dela, 21/10/2026): marca as pessoas (ou todas da busca) e coloca num funil de e-mail (script 34).
import { sb, esc, dataBR, dataHoraBR, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { norm, linkWhats } from './vendas.js';
import { ONLINE } from '../ferramentas-online.js';
import { desenharQr } from './avaliacao-modulo.js';
import { EMAIL_VALIDO, limparEmail } from '../funis-regras.js';

const SITE = 'https://plataforma.mentorei.com.br';
const PUBLICAS = Object.values(ONLINE).filter((o) => o.publica).map((o) => ({ nome: o.publica, link: `${SITE}${o.url}` }));
const nomeArquivo = (t) => t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
const est = { texto: '', ferramenta: '', conteudos: '' };

// PNG para o slide: título, QR code grande e o link embaixo (1200 x 1500, fundo branco)
async function imagemQr(f) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 1500;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#091216'; g.textAlign = 'center';
  g.font = '800 70px Manrope, Poppins, Arial, sans-serif'; g.fillText(f.nome, 600, 130, 1100);
  g.fillStyle = '#5F686D'; g.font = '500 40px Inter, Arial, sans-serif'; g.fillText('Aponte a câmera do celular para começar', 600, 200);
  await desenharQr(c, f.link, 1000, 100, 250);
  g.fillStyle = '#091216'; g.font = '600 34px Inter, Arial, sans-serif'; g.fillText(f.link.replace('https://', ''), 600, 1330, 1100);
  g.fillStyle = '#9C7D4C'; g.font = '800 34px Manrope, Arial, sans-serif'; g.fillText('MENTOREI', 600, 1440);
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui montar a imagem.'))), 'image/png'));
}

export async function abaPessoaFisica(ctx, el, recarregar) {
  const { data, error } = await sb.from('pessoas_fisicas').select('*').order('ultimo_em', { ascending: false }).limit(5000);
  if (error && !faltaScript(error)) throw error;
  const falta = !!error;
  const pessoas = data || [];
  const ferramentas = [...new Set(pessoas.flatMap((p) => p.ferramentas || []))].sort();

  el.innerHTML = `
    ${falta ? '<div class="aviso erro">Para os contatos chegarem aqui, falta rodar o script <b>39-pessoa-fisica.sql</b> no Supabase (SQL Editor → New query → colar → Run).</div>' : ''}
    <div class="cartao" style="margin-bottom:12px"><h3>Ferramentas abertas ao público</h3>
      <p class="peq apagado">Qualquer pessoa lê o QR code e preenche, sem login. O nome, o e-mail, o WhatsApp, o cargo (quando a ferramenta pede) e se a pessoa quer receber conteúdos chegam nesta aba sozinhos; as respostas ficam só no celular da pessoa.</p>
      ${PUBLICAS.map((f, i) => `<div class="linha mt" style="gap:14px;align-items:center;flex-wrap:wrap">
        <canvas width="440" height="440" data-qr="${i}" style="width:120px;height:120px;border-radius:10px;border:1px solid var(--linha)" aria-label="QR code da ${esc(f.nome)}"></canvas>
        <div style="flex:1;min-width:220px"><b>${esc(f.nome)}</b><div class="peq apagado" style="word-break:break-all">${esc(f.link)}</div>
          <div class="linha mt" style="gap:6px;flex-wrap:wrap"><button class="btn peq pri" type="button" data-baixar="${i}">Baixar o QR code</button>
            <button class="btn peq" type="button" data-copiar="${i}">Copiar o link</button><a class="btn peq" href="${esc(f.link)}" target="_blank" rel="noopener">Abrir</a></div></div></div>`).join('')}
    </div>
    <div class="linha ag-filtros"><input type="search" id="pf-texto" placeholder="Nome, e-mail, WhatsApp ou cargo…" value="${esc(est.texto)}" style="width:auto;min-width:240px" aria-label="Procurar">
      ${ferramentas.length > 1 ? `<select id="pf-ferr" aria-label="Ferramenta"><option value="">Todas as ferramentas</option>${ferramentas.map((f) => `<option${f === est.ferramenta ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>` : ''}
      ${pessoas.some((p) => p.quer_conteudos != null) ? `<select id="pf-cont" aria-label="Quer receber conteúdos">${[['', 'Quer conteúdos? Todos'], ['sim', 'Quer receber conteúdos'], ['nao', 'Não quer receber']].map(([v, t]) => `<option value="${v}"${v === est.conteudos ? ' selected' : ''}>${t}</option>`).join('')}</select>` : ''}
      <button class="btn peq" type="button" id="pf-excel"${pessoas.length ? '' : ' disabled'}>Baixar em Excel</button>
      <button class="btn peq pri" type="button" id="pf-funil" disabled>Colocar no funil</button>
      <span class="peq apagado" id="pf-conta"></span></div>
    <div class="tabela cartao" style="padding:0"><table id="pf-tab"><thead><tr><th style="width:32px"><input type="checkbox" id="pf-todas" aria-label="Marcar todas da lista"></th><th>Nome</th><th>Cargo</th><th>E-mail</th><th>WhatsApp</th><th>Ferramenta</th><th>Chegou em</th><th></th></tr></thead><tbody></tbody></table></div>`;

  el.querySelectorAll('[data-qr]').forEach((cv) => desenharQr(cv, PUBLICAS[+cv.dataset.qr].link, cv.width).catch((e) => avisar(e.message, true)));
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-baixar],[data-copiar]'); if (!b) return;
    if (b.dataset.copiar !== undefined) {
      const f = PUBLICAS[+b.dataset.copiar];
      try { await navigator.clipboard.writeText(f.link); avisar('Link copiado.'); } catch (_) { window.prompt('Copie o link:', f.link); }
      return;
    }
    const f = PUBLICAS[+b.dataset.baixar];
    try {
      const url = URL.createObjectURL(await imagemQr(f));
      const a = document.createElement('a'); a.href = url; a.download = `${nomeArquivo(`QR code - ${f.nome}`)}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { avisar(explicarErro(e), true); }
  });

  const filtradas = () => {
    const t = norm(est.texto);
    return pessoas.filter((p) => (!est.ferramenta || (p.ferramentas || []).includes(est.ferramenta))
      && (!est.conteudos || (est.conteudos === 'sim' ? p.quer_conteudos === true : p.quer_conteudos === false))
      && (!t ||norm([p.nome, p.email, p.whatsapp, p.cargo, p.observacao].join(' ')).includes(t)));
  };
  const marcadas = new Set();
  const desenhar = () => {
    const l = filtradas();
    el.querySelector('#pf-conta').textContent = `${l.length} de ${pessoas.length} contato(s)${marcadas.size ? ` · ${marcadas.size} marcado(s)` : ''}`;
    el.querySelector('#pf-todas').checked = l.length > 0 && l.every((p) => marcadas.has(p.id));
    const bf = el.querySelector('#pf-funil');
    bf.disabled = !marcadas.size;
    bf.textContent = marcadas.size ? `Colocar ${marcadas.size} no funil` : 'Colocar no funil';
    el.querySelector('tbody').innerHTML = l.map((p) => `<tr>
      <td><input type="checkbox" data-marcar="${p.id}"${marcadas.has(p.id) ? ' checked' : ''} aria-label="Marcar ${esc(p.nome)}"></td>
      <td><b>${esc(p.nome)}</b>${p.quer_conteudos === true ? '<div class="peq">📩 Quer receber conteúdos</div>' : p.quer_conteudos === false ? '<div class="peq apagado">Não quer receber conteúdos</div>' : ''}${p.observacao ? `<div class="peq apagado" style="white-space:pre-wrap">📝 ${esc(p.observacao)}</div>` : ''}</td>
      <td class="peq">${esc(p.cargo || '—')}</td>
      <td class="peq"><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>
      <td class="peq">${p.whatsapp ? `<a href="${esc(linkWhats(p.whatsapp, `Olá, ${String(p.nome).split(' ')[0]}! Aqui é da Mentorei.`))}" target="_blank" rel="noopener">💬 ${esc(p.whatsapp)}</a>` : '—'}</td>
      <td class="peq">${(p.ferramentas || []).map(esc).join(', ') || esc(p.origem || '—')}${p.vezes > 1 ? `<div class="apagado">${p.vezes} vezes</div>` : ''}</td>
      <td class="peq" title="Última vez: ${esc(dataHoraBR(p.ultimo_em))}">${dataBR(p.criado_em)}</td>
      <td style="white-space:nowrap"><button class="btn peq" type="button" data-nota="${p.id}">Anotação</button> <button class="btn peq" type="button" data-apagar="${p.id}" title="Apagar este contato">Apagar</button></td></tr>`).join('')
      || `<tr><td colspan="8" class="apagado">${pessoas.length ? 'Ninguém com essa busca.' : 'Ainda não chegou nenhum contato. Assim que alguém preencher pelo QR code, ele aparece aqui.'}</td></tr>`;
  };
  el.querySelector('#pf-texto').addEventListener('input', (ev) => { est.texto = ev.target.value; desenhar(); });
  el.querySelector('#pf-ferr')?.addEventListener('input', (ev) => { est.ferramenta = ev.target.value; desenhar(); });
  el.querySelector('#pf-cont')?.addEventListener('input', (ev) => { est.conteudos = ev.target.value; desenhar(); });
  el.querySelector('#pf-todas').addEventListener('change', (ev) => { filtradas().forEach((p) => (ev.target.checked ? marcadas.add(p.id) : marcadas.delete(p.id))); desenhar(); });
  el.querySelector('#pf-tab').addEventListener('change', (ev) => {
    const c = ev.target.closest('[data-marcar]'); if (!c) return;
    if (c.checked) marcadas.add(c.dataset.marcar); else marcadas.delete(c.dataset.marcar);
    desenhar();
  });
  el.querySelector('#pf-funil').addEventListener('click', () => colocarNoFunil(pessoas.filter((p) => marcadas.has(p.id)), () => { marcadas.clear(); desenhar(); }));
  el.querySelector('#pf-tab').addEventListener('click', async (ev) => {
    const nota = ev.target.closest('[data-nota]'), apagar = ev.target.closest('[data-apagar]');
    if (nota) {
      const p = pessoas.find((x) => x.id === nota.dataset.nota);
      const j = janela(`Anotação · ${p.nome}`, `<div class="campo"><label for="pf-obs">Anotação (só a administração vê)</label><textarea id="pf-obs" rows="4">${esc(p.observacao || '')}</textarea></div>
        <div class="linha mt"><button class="btn pri" type="button" id="pf-salvar">Salvar</button></div>`);
      j.corpo.querySelector('#pf-salvar').addEventListener('click', async () => {
        const observacao = j.corpo.querySelector('#pf-obs').value.trim() || null;
        const { error: e } = await sb.from('pessoas_fisicas').update({ observacao }).eq('id', p.id);
        if (e) { avisar(explicarErro(e), true); return; }
        p.observacao = observacao; j.fechar(); desenhar(); avisar('Anotação salva.');
      });
    }
    if (apagar) {
      const p = pessoas.find((x) => x.id === apagar.dataset.apagar);
      if (!window.confirm(`Apagar o contato de ${p.nome}? Não dá para desfazer.`)) return;
      const { error: e } = await sb.from('pessoas_fisicas').delete().eq('id', p.id);
      if (e) { avisar(explicarErro(e), true); return; }
      pessoas.splice(pessoas.indexOf(p), 1); marcadas.delete(p.id); desenhar(); avisar('Contato apagado.');
    }
  });
  el.querySelector('#pf-excel').addEventListener('click', async () => {
    let XLSX;
    try { XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'); } catch (e) { avisar(explicarErro(e), true); return; }
    const dados = [['Nome', 'E-mail', 'WhatsApp', 'Cargo', 'Ferramentas', 'Quer receber conteúdos', 'Vezes', 'Chegou em', 'Última vez', 'Anotação'],
      ...filtradas().map((p) => [p.nome, p.email, p.whatsapp || '', p.cargo || '', (p.ferramentas || []).join(', '),
        p.quer_conteudos === true ? 'Sim' : p.quer_conteudos === false ? 'Não' : '', p.vezes, dataHoraBR(p.criado_em), dataHoraBR(p.ultimo_em), p.observacao || ''])];
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dados.length - 1, c: dados[0].length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, 'Pessoa física');
    XLSX.writeFile(wb, `Mentorei - Pessoa física - ${new Date().toLocaleDateString('sv-SE')}.xlsx`);
  });
  desenhar();
}

// Coloca as pessoas marcadas num funil de e-mail. Quem já está no funil ou pediu para sair da lista não entra.
async function colocarNoFunil(lista, aoTerminar) {
  const [fr, dr] = await Promise.all([
    sb.from('funis').select('id, nome, ativo, publico').eq('arquivado', false).order('nome'),
    sb.from('descadastros').select('email').in('email', lista.map((p) => limparEmail(p.email))),
  ]);
  if (fr.error) {
    if (faltaScript(fr.error)) { avisar('Para usar os funis de e-mail, falta rodar o script 34-funis.sql no Supabase.', true); return; }
    avisar(explicarErro(fr.error), true); return;
  }
  const funis = fr.data || [];
  if (!funis.length) { avisar('Ainda não existe nenhum funil. Crie um em Vendas → Funis de e-mail.', true); return; }
  const saiu = new Set((dr.data || []).map((x) => x.email));
  const j = janela(`Colocar ${lista.length} pessoa(s) num funil`, `
    <div class="campo"><label for="pf-fu">Funil</label><select id="pf-fu">${funis.map((f) => `<option value="${f.id}">${esc(f.nome)}${f.publico === 'frio' ? ' (lista fria)' : ''}${f.ativo ? '' : ' · pausado'}</option>`).join('')}</select></div>
    <p class="peq mt" id="pf-fu-resumo">Conferindo…</p>
    <div class="linha mt"><button class="btn pri" type="button" id="pf-fu-ok" disabled>Colocar no funil</button></div>`, { largura: 520 });
  const q = (s) => j.corpo.querySelector(s);
  let conta = null;
  const conferir = async () => {
    q('#pf-fu-ok').disabled = true; q('#pf-fu-resumo').textContent = 'Conferindo…';
    const { data: ja, error } = await sb.from('funil_membros').select('email').eq('funil_id', q('#pf-fu').value).in('email', lista.map((p) => limparEmail(p.email)));
    if (error) { q('#pf-fu-resumo').textContent = explicarErro(error); return; }
    const jaNoFunil = new Set((ja || []).map((x) => x.email));
    conta = { entram: [], ja: 0, saiu: 0, naoQuer: 0, errados: 0 };
    for (const p of lista) {
      const email = limparEmail(p.email);
      if (jaNoFunil.has(email)) conta.ja += 1;
      else if (saiu.has(email)) conta.saiu += 1;
      else if (p.quer_conteudos === false) conta.naoQuer += 1; // desmarcou "quero receber conteúdos" na ferramenta
      else if (!EMAIL_VALIDO.test(email)) conta.errados += 1;
      else if (!conta.entram.some((x) => x.email === email)) conta.entram.push({ email, nome: p.nome, origem: `Pessoa física · ${(p.ferramentas || []).join(', ') || p.origem || 'ferramenta aberta'}` });
    }
    const f = funis.find((x) => x.id === q('#pf-fu').value);
    q('#pf-fu-resumo').innerHTML = `Vão entrar <b>${conta.entram.length} pessoa(s)</b>.${conta.ja ? ` ${conta.ja} já estão neste funil.` : ''}${conta.saiu ? ` ${conta.saiu} pediram para sair da lista (não entram).` : ''}${conta.naoQuer ? ` ${conta.naoQuer} disseram que não querem receber conteúdos (não entram).` : ''}${conta.errados ? ` ${conta.errados} com e-mail escrito errado (não entram).` : ''}${f && !f.ativo ? '<br><b>Atenção:</b> os envios deste funil estão pausados.' : ''}`;
    q('#pf-fu-ok').disabled = !conta.entram.length;
  };
  q('#pf-fu').addEventListener('input', conferir);
  q('#pf-fu-ok').addEventListener('click', async (ev) => {
    const funilId = q('#pf-fu').value;
    ev.target.disabled = true; ev.target.textContent = 'Colocando…';
    const { error } = await sb.from('funil_membros').upsert(conta.entram.map((p) => ({ funil_id: funilId, ...p })), { onConflict: 'funil_id,email', ignoreDuplicates: true });
    if (error) { avisar(explicarErro(error), true); ev.target.disabled = false; ev.target.textContent = 'Colocar no funil'; return; }
    j.fechar();
    avisar(`${conta.entram.length} pessoa(s) entraram no funil. O primeiro e-mail sai na próxima rodada, dentro do horário do funil.`);
    aoTerminar();
  });
  conferir();
}
