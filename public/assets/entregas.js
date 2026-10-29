// Envios do mentorado (script 37, tabela "entregas", pasta privada "entregas"): tarefa feita, ferramenta preenchida ou outro
// documento, com arquivos e um recado. O mentorado envia e vê o que mandou; os mentores dele e a administração recebem
// (ficha, tela da sessão e pendências) e o primeiro mentor que abre um arquivo marca como visto. Os mentores recebem e-mail (/api/entrega).
// Script 49: o aluno da turma também envia (turma_aluno_id; pasta "<id do aluno na turma>/…"), para os mentores da turma,
// e o mentor pode responder (retorno): quem enviou vê a resposta e recebe e-mail, se autorizou.
import { sb, esc, dataHoraBR, diaMes, avisar, explicarErro } from './base.js';

const TAMANHO_MAX = 26214400; // 25 MB por arquivo, o mesmo limite da pasta
const TIPO_POR_EXT = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain', csv: 'text/csv', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};
const ACEITA = Object.keys(TIPO_POR_EXT).map((e) => `.${e}`).join(',');
const ROTULO = { tarefa: 'Tarefa', ferramenta: 'Ferramenta', documento: 'Documento' };
const nomeSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-90);
const tamanhoTexto = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const faltaTabela = (e) => !!e && /entregas|does not exist|Could not find|schema cache|42P01|PGRST20[45]/i.test(`${e.code || ''} ${e.message || ''}`);

// Lê os envios. "filtro" limita a busca (ex.: (q) => q.eq('mentorado_id', id)). Sem o script 37: { existe: false, lista: [] }.
export async function carregarEntregas(filtro = (q) => q) {
  const { data, error } = await filtro(sb.from('entregas').select('*')).order('enviado_em', { ascending: false });
  if (error) {
    if (!faltaTabela(error)) console.warn('Envios do mentorado:', error);
    return { existe: false, lista: [] };
  }
  return { existe: true, lista: data || [] };
}

// Lista para ler. mentor = visão da equipe ("novo" até alguém abrir, e Responder); senão, visão de quem enviou (visto ou não, a
// resposta do mentor e Apagar). e._quem (opcional) = de quem é / de qual módulo, mostrado embaixo do título.
export function htmlEntregas(lista, { mentor = false, responder = mentor } = {}) {
  return `<div class="lista mt">${lista.map((e) => `<div class="cartao entrega" style="background:var(--bg);border:0" data-entrega="${e.id}">
    <div class="linha" style="gap:8px"><b style="flex:1;min-width:180px">${ROTULO[e.tipo] || 'Documento'}${e.titulo ? `: ${esc(e.titulo)}` : ''}${e._quem ? `<br><span class="peq apagado" style="font-weight:400">${esc(e._quem)}</span>` : ''}</b>
      <span class="peq apagado">${dataHoraBR(e.enviado_em)}</span>
      ${mentor ? (e.visto_em ? '' : '<span class="selo">novo</span>')
        : `${e.visto_em ? `<span class="selo">Visto pelo mentor em ${diaMes(e.visto_em)}</span>` : '<span class="selo neutro">Ainda não visto</span>'}
           <button type="button" class="btn peq" data-entrega-apagar="${e.id}" title="Apagar este envio" aria-label="Apagar este envio">✕</button>`}</div>
    ${e.mensagem ? `<p class="peq mt" style="white-space:pre-wrap">${mentor ? '<b>Recado:</b> ' : ''}${esc(e.mensagem)}</p>` : ''}
    ${(e.arquivos || []).length ? `<div class="chips mt">${e.arquivos.map((a, i) => `<button type="button" class="btn peq" data-entrega-baixar="${e.id}" data-arquivo="${i}" title="Baixar">📎 ${esc(a.nome)} <span class="apagado">· ${tamanhoTexto(a.tamanho || 0)}</span></button>`).join('')}</div>` : ''}
    <div data-retorno="${e.id}">${e.retorno ? `<div class="aviso ok mt peq" style="white-space:pre-wrap"><b>Resposta do mentor${e.retorno_em ? ` (${diaMes(e.retorno_em)})` : ''}:</b> ${esc(e.retorno)}</div>` : ''}
      ${responder ? `<button type="button" class="btn peq mt" data-entrega-responder="${e.id}">${e.retorno ? 'Mudar a resposta' : 'Responder'}</button>` : ''}</div>
  </div>`).join('')}</div>`;
}

// Cliques da lista: baixar (o mentor que abre marca como visto) e apagar (mentorado).
export function ligarEntregas(raiz, lista, { marcarVisto = false, perfilId = null, aoMudar = () => {} } = {}) {
  raiz.addEventListener('click', async (ev) => {
    // resposta do mentor: escreve ali mesmo e salva; quem enviou recebe e-mail (se autorizou)
    const rp = ev.target.closest('[data-entrega-responder]');
    if (rp) {
      const e = lista.find((x) => x.id === rp.dataset.entregaResponder); if (!e) return;
      const caixa = raiz.querySelector(`[data-retorno="${e.id}"]`);
      caixa.innerHTML = `<div class="campo mt"><label for="rt-${e.id}">Sua resposta (quem enviou vai ler)</label>
        <textarea id="rt-${e.id}" style="min-height:90px" placeholder="Um retorno curto: o que ficou bom, o que ajustar, o próximo passo.">${esc(e.retorno || '')}</textarea></div>
        <div class="linha mt" style="gap:6px"><button type="button" class="btn peq pri" data-rt-salvar>Enviar a resposta</button><button type="button" class="btn peq" data-rt-desistir>Desistir</button></div>`;
      caixa.querySelector('textarea').focus();
      const desenhar = () => {
        caixa.innerHTML = `${e.retorno ? `<div class="aviso ok mt peq" style="white-space:pre-wrap"><b>Resposta do mentor (${diaMes(e.retorno_em)}):</b> ${esc(e.retorno)}</div>` : ''}
          <button type="button" class="btn peq mt" data-entrega-responder="${e.id}">${e.retorno ? 'Mudar a resposta' : 'Responder'}</button>`;
      };
      caixa.querySelector('[data-rt-desistir]').addEventListener('click', desenhar);
      caixa.querySelector('[data-rt-salvar]').addEventListener('click', async (ev2) => {
        const texto = caixa.querySelector('textarea').value.trim();
        if (!texto) { avisar('Escreva a resposta.', true); return; }
        ev2.target.disabled = true;
        const agora = new Date().toISOString();
        const mud = { retorno: texto, retorno_em: agora, retorno_por: perfilId, ...(e.visto_em ? {} : { visto_em: agora, visto_por: perfilId }) };
        const { error } = await sb.from('entregas').update(mud).eq('id', e.id);
        if (error) { avisar(/retorno|schema cache|42703/.test(`${error.code} ${error.message}`) ? 'Para responder, falta rodar o script 49 no Supabase.' : explicarErro(error), true); ev2.target.disabled = false; return; }
        const primeira = !e.retorno;
        Object.assign(e, mud);
        try {
          const { data: { session } } = await sb.auth.getSession();
          fetch('/api/entrega', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ id: e.id, acao: 'retorno', primeira }) }).catch(() => {});
        } catch (_) { /* sem e-mail */ }
        avisar('Resposta enviada.');
        raiz.querySelector(`[data-entrega="${e.id}"]`)?.querySelector('.selo')?.remove();
        desenhar();
      });
      return;
    }
    const dl = ev.target.closest('[data-entrega-baixar]');
    if (dl) {
      const e = lista.find((x) => x.id === dl.dataset.entregaBaixar); const a = e && e.arquivos[Number(dl.dataset.arquivo)];
      if (!a) return;
      const aba = window.open('', '_blank');
      const { data, error } = await sb.storage.from('entregas').createSignedUrl(a.caminho, 300, { download: a.nome });
      if (error) { if (aba) aba.close(); avisar(explicarErro(error), true); return; }
      if (aba) aba.location = data.signedUrl; else location.href = data.signedUrl;
      if (marcarVisto && !e.visto_em) {
        const agora = new Date().toISOString();
        const { error: e2 } = await sb.from('entregas').update({ visto_em: agora, visto_por: perfilId }).eq('id', e.id);
        if (!e2) { e.visto_em = agora; dl.closest('[data-entrega]')?.querySelector('.selo')?.remove(); }
      }
      return;
    }
    const ap = ev.target.closest('[data-entrega-apagar]');
    if (ap) {
      const e = lista.find((x) => x.id === ap.dataset.entregaApagar); if (!e) return;
      if (!window.confirm(`Apagar este envio${(e.arquivos || []).length ? ` e ${e.arquivos.length > 1 ? `os ${e.arquivos.length} arquivos` : 'o arquivo'}` : ''}? Seu mentor deixa de ver.`)) return;
      ap.disabled = true;
      const caminhos = (e.arquivos || []).map((a) => a.caminho);
      if (caminhos.length) await sb.storage.from('entregas').remove(caminhos);
      const { error } = await sb.from('entregas').delete().eq('id', e.id);
      if (error) { avisar(explicarErro(error), true); ap.disabled = false; return; }
      avisar('Envio apagado.'); aoMudar();
    }
  });
}

// Janela do mentorado para enviar. tipo: 'tarefa' (tarefa = { id, texto, sessao_id, feita_em, legado }), 'ferramenta'
// (ferramenta = { id, nome }, sessaoId opcional) ou 'documento'.
// Aluno da turma (script 49): alunoId (turma_alunos.id) no lugar de mentoradoId, moduloId e, na tarefa do módulo, arquivoId.
export function abrirEnvio(ctx, { mentoradoId = null, alunoId = null, moduloId = null, arquivoId = null, tipo = 'documento', tarefa = null, ferramenta = null, sessaoId = null, aoEnviar = () => {} }) {
  const titulo = tipo === 'tarefa' ? tarefa.texto : tipo === 'ferramenta' ? ferramenta.nome : '';
  const fundo = document.createElement('div');
  fundo.style.cssText = 'position:fixed;inset:0;background:rgba(9,18,22,.55);z-index:40;display:grid;place-items:center;padding:16px';
  fundo.innerHTML = `<div class="cartao" role="dialog" aria-modal="true" aria-label="Enviar para os seus mentores" style="width:100%;max-width:540px;max-height:90vh;overflow:auto">
    <div class="linha"><h3 style="flex:1">${tipo === 'tarefa' ? 'Enviar a tarefa' : tipo === 'ferramenta' ? 'Enviar a ferramenta preenchida' : 'Enviar um documento'}</h3><button class="btn peq" data-fechar>Fechar</button></div>
    <p class="peq apagado mt">Vai para os seus mentores. Só eles e a equipe da Mentorei veem.</p>
    ${tipo === 'documento' ? '<div class="campo mt"><label for="en-titulo">Sobre o que é (opcional)</label><input id="en-titulo" type="text" maxlength="160" placeholder="Ex.: Plano de ação da minha equipe"></div>'
      : `<p class="mt"><b>${ROTULO[tipo]}:</b> <span style="white-space:pre-wrap">${esc(titulo)}</span></p>`}
    <div class="campo mt"><label for="en-arquivos">Arquivos</label>
      <input id="en-arquivos" type="file" multiple accept="${ACEITA}">
      <p class="peq apagado">PDF, Word, Excel, PowerPoint, foto ou texto, até 25 MB cada. No celular, dá para tirar foto da folha preenchida.</p></div>
    <div class="lista mt" id="en-lista"></div>
    <div class="campo mt"><label for="en-msg">Recado para o mentor (opcional)</label><textarea id="en-msg" style="min-height:80px" placeholder="Conte como foi, o que funcionou, onde teve dúvida…"></textarea></div>
    ${tipo === 'tarefa' && !alunoId && !tarefa.feita_em ? '<label class="linha mt" style="gap:8px"><input type="checkbox" id="en-feita" checked> Marcar a tarefa como feita</label>' : ''}
    <div class="linha mt"><button class="btn pri" id="en-enviar">Enviar</button><span class="peq apagado" id="en-prog"></span></div>
  </div>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.addEventListener('click', (ev) => { if (ev.target === fundo || ev.target.closest('[data-fechar]')) fechar(); });

  // arquivos escolhidos (dá para escolher mais de uma vez e tirar com ✕)
  let escolhidos = [];
  const desenhar = () => {
    fundo.querySelector('#en-lista').innerHTML = escolhidos.map((f, i) => `<div class="linha peq" style="gap:8px"><span style="flex:1;min-width:0;overflow-wrap:anywhere">📎 ${esc(f.name)} <span class="apagado">· ${tamanhoTexto(f.size)}</span></span>
      <button type="button" class="btn peq" data-tirar="${i}" aria-label="Tirar ${esc(f.name)}">✕</button></div>`).join('');
  };
  const entrada = fundo.querySelector('#en-arquivos');
  entrada.addEventListener('change', () => {
    for (const f of entrada.files) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!TIPO_POR_EXT[ext]) { avisar(`"${f.name}" não é um tipo aceito. Envie PDF, Word, Excel, PowerPoint, foto ou texto.`, true); continue; }
      if (f.size > TAMANHO_MAX) { avisar(`"${f.name}" passa de 25 MB. Salve como PDF ou reduza e tente de novo.`, true); continue; }
      if (!escolhidos.some((x) => x.name === f.name && x.size === f.size)) escolhidos.push(f);
    }
    entrada.value = ''; desenhar();
  });
  fundo.querySelector('#en-lista').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tirar]'); if (!b) return;
    escolhidos.splice(Number(b.dataset.tirar), 1); desenhar();
  });

  fundo.querySelector('#en-enviar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget, prog = fundo.querySelector('#en-prog');
    const mensagem = fundo.querySelector('#en-msg').value.trim();
    if (!escolhidos.length && !mensagem) { avisar('Escolha um arquivo ou escreva um recado.', true); return; }
    btn.disabled = true;
    const id = crypto.randomUUID();
    const arquivos = [];
    try {
      for (const [i, f] of escolhidos.entries()) {
        prog.textContent = `Enviando ${i + 1} de ${escolhidos.length}…`;
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const caminho = `${alunoId || mentoradoId}/${id}/${i + 1}-${nomeSeguro(f.name)}`;
        const up = await sb.storage.from('entregas').upload(caminho, f, { contentType: TIPO_POR_EXT[ext] || f.type });
        if (up.error) throw up.error;
        arquivos.push({ caminho, nome: f.name, tamanho: f.size, tipo: TIPO_POR_EXT[ext] || f.type });
      }
      prog.textContent = 'Guardando…';
      const { error } = await sb.from('entregas').insert({ id, tipo, enviado_por: ctx.perfil.id,
        ...(alunoId ? { turma_aluno_id: alunoId, modulo_id: moduloId, arquivo_id: arquivoId } : { mentorado_id: mentoradoId }),
        tarefa_id: tipo === 'tarefa' && !alunoId && !tarefa.legado ? tarefa.id : null,
        sessao_id: (tipo === 'tarefa' && !alunoId ? tarefa.sessao_id : sessaoId) || null,
        ferramenta_id: tipo === 'ferramenta' ? ferramenta.id : null,
        titulo: tipo === 'documento' ? (fundo.querySelector('#en-titulo').value.trim() || null) : titulo,
        mensagem: mensagem || null, arquivos });
      if (error) throw error;
    } catch (e) {
      if (arquivos.length) await sb.storage.from('entregas').remove(arquivos.map((a) => a.caminho));
      avisar(faltaTabela(e) || /bucket/i.test(e.message || '') || (alunoId && /turma_aluno|modulo_id|arquivo_id|row-level/i.test(e.message || '')) ? 'O envio de arquivos ainda não foi ligado. Avise a Mentorei.' : explicarErro(e), true);
      btn.disabled = false; prog.textContent = '';
      return;
    }
    // tarefa feita junto com o envio
    if (fundo.querySelector('#en-feita')?.checked) {
      const agora = new Date().toISOString();
      const r = tarefa.legado ? await sb.from('sessoes').update({ tarefa_feita_em: agora }).eq('id', tarefa.sessao_id)
        : await sb.from('tarefas').update({ feita_em: agora }).eq('id', tarefa.id);
      if (r.error) console.warn('Marcar a tarefa como feita:', r.error);
    }
    // e-mail para os mentores (se falhar, o envio continua na plataforma)
    try {
      const { data: { session } } = await sb.auth.getSession();
      fetch('/api/entrega', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }) }).catch(() => {});
    } catch (_) { /* sem e-mail */ }
    avisar('Enviado! Seus mentores vão receber.');
    fechar(); aoEnviar();
  });
}
