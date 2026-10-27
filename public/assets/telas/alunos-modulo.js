// "Para os alunos" no módulo da turma (script 44): o que aparece na área do aluno, separado do material de trabalho da equipe.
// Slides da aula em PDF (tipo 'aluno'), tarefas e ferramentas para baixar (tipo 'tarefa') e a gravação da aula
// (achada sozinha na pasta do Zoom no Drive, ou colada à mão). Colocam: administração e mentor do módulo.
// Baixar e apagar arquivos usam os botões de sempre da página do módulo (data-baixar / data-apagar em turmas.js).
import { sb, esc, avisar, explicarErro, dataBR, dataHoraBR } from '../base.js';

const TIPOS = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};
const nomeSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-90);
const tamanho = (b) => (b ? (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`) : '');
const faltaScript = (e) => /turma_alunos|gravacoes|check constraint|tipo_check|schema cache|42P01|PGRST20|mime/i.test(`${e && e.code} ${e && (e.message || e.error)}`);

export function cartaoParaAlunos(ctx, m, pode) {
  const arqs = (m.arquivos || []).slice().sort((a, b) => new Date(a.enviado_em) - new Date(b.enviado_em));
  const lista = (tipo, vazio) => {
    const xs = arqs.filter((a) => a.tipo === tipo);
    return xs.length ? `<div class="lista mt">${xs.map((a) => `<div class="item" style="grid-template-columns:1fr auto">
        <div style="min-width:0"><div class="nome" style="word-break:break-word">${esc(a.nome)}</div><div class="info">${tamanho(a.tamanho)}${a.autor ? ` · ${esc(a.autor.nome)}` : ''} · ${dataBR(a.enviado_em)}</div></div>
        <div class="linha" style="gap:6px"><button class="btn peq pri" data-baixar="${a.id}">Baixar</button>${ctx.ehAdmin || a.enviado_por === ctx.perfil.id ? `<button class="btn peq" data-apagar="${a.id}" aria-label="Apagar ${esc(a.nome)}">Apagar</button>` : ''}</div></div>`).join('')}</div>`
      : `<p class="apagado mt peq">${vazio}</p>`;
  };
  return `<div class="cartao" id="para-alunos" style="border-color:var(--lima, #C8AE7C)">
    <div class="linha"><h3 style="flex:1">Para os alunos</h3><span class="selo neutro" id="pa-quantos"></span></div>
    <p class="peq apagado">O que os alunos da turma veem na área deles, neste módulo. Os slides de trabalho e as percepções continuam só para a equipe.</p>
    <h4 class="mt2">Slides da aula (PDF)</h4>
    ${lista('aluno', 'Nenhum PDF para os alunos ainda.')}
    ${pode ? '<label class="btn peq pri mt" style="cursor:pointer">Enviar PDF dos slides<input type="file" data-pa-enviar="aluno" accept=".pdf" hidden></label>' : ''}
    <h4 class="mt2">Tarefas e ferramentas</h4>
    ${lista('tarefa', 'Nenhuma tarefa ou ferramenta para os alunos.')}
    ${pode ? '<label class="btn peq pri mt" style="cursor:pointer">Enviar tarefa ou ferramenta<input type="file" data-pa-enviar="tarefa" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png" multiple hidden></label>' : ''}
    <h4 class="mt2">Gravação da aula</h4>
    <div id="pa-gravacoes"><p class="peq apagado mt">Carregando…</p></div>
    ${pode ? `<button class="btn peq pri mt" type="button" id="pa-abrir">+ Colocar gravação à mão</button>
      <div class="mt" id="pa-form" hidden style="background:var(--bg);border-radius:12px;padding:12px">
        <p class="peq">Cole o link do vídeo: o link de compartilhamento do Zoom (e a senha, se tiver), Google Drive, YouTube ou Vimeo. Se o vídeo estiver no Google Drive,
          a plataforma libera o link para os alunos sozinha. Vídeo que está só no seu computador: suba primeiro para o Google Drive
          (na pasta das gravações ele também é achado sozinho) e cole o link aqui.</p>
        <div class="grade g2 mt" style="gap:10px">
          <div class="campo" style="grid-column:1/-1"><label for="pa-link">Link da gravação</label><input type="url" id="pa-link" placeholder="https://drive.google.com/file/d/…"></div>
          <div class="campo"><label for="pa-senha">Senha da gravação (se tiver)</label><input type="text" id="pa-senha" autocomplete="off" placeholder="A senha que o Zoom mostra"></div>
          <div class="campo"><label for="pa-nome">Nome que os alunos veem (opcional)</label><input type="text" id="pa-nome" placeholder="Ex.: Gravação · parte 2"></div>
          <div class="linha" style="align-items:flex-end"><button class="btn peq pri" type="button" id="pa-colar">Colocar a gravação</button><button class="btn peq" type="button" id="pa-fechar">Desistir</button></div>
        </div></div>` : ''}
    <p class="peq apagado mt" id="pa-progresso" role="status"></p>
  </div>`;
}

async function api(corpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/api/gravacoes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.mensagem || 'Não foi possível.');
  return j;
}

export async function ligarParaAlunos(ctx, el, m, pode) {
  const box = el.querySelector('#para-alunos');
  if (!box) return;
  const recarregar = () => ctx.irPara(`#/modulo/${m.id}`);

  // quantos alunos veem
  sb.from('turma_alunos').select('id', { count: 'exact', head: true }).eq('turma_id', m.turma.id).eq('ativo', true).then(({ count, error }) => {
    const s = box.querySelector('#pa-quantos');
    if (error) { s.textContent = 'falta o script 44'; s.className = 'selo alerta'; return; }
    s.textContent = count ? `${count} aluno${count > 1 ? 's' : ''} veem` : 'nenhum aluno na turma ainda';
  });

  // gravações
  const desenharGravacoes = async () => {
    const caixa = box.querySelector('#pa-gravacoes');
    // "select *": funciona antes e depois do script 46 (zoom_id e senha)
    const { data, error } = await sb.from('gravacoes').select('*').eq('modulo_id', m.id).eq('ignorada', false).order('gravada_em', { ascending: true, nullsFirst: false });
    if (error) {
      caixa.innerHTML = faltaScript(error) ? `<div class="aviso mt peq">${ctx.ehAdmin ? 'Para as gravações, falta rodar o script <b>44-alunos-das-turmas.sql</b> no Supabase.' : 'As gravações ainda não foram liberadas na plataforma.'}</div>` : `<p class="peq">${esc(explicarErro(error))}</p>`;
      return;
    }
    const gs = data || [];
    caixa.innerHTML = gs.length ? `<div class="lista mt">${gs.map((g, i) => `<div class="item" style="grid-template-columns:1fr auto">
        <div style="min-width:0"><div class="nome" style="word-break:break-word">${gs.length > 1 && !/parte/i.test(g.nome) ? `Parte ${i + 1} · ` : ''}${esc(g.nome)}</div>
          <div class="info">${[g.gravada_em && dataHoraBR(g.gravada_em), g.duracao_min && `${g.duracao_min} min`, g.ligada === 'auto' ? (g.zoom_id ? 'achada no Zoom' : 'achada na pasta do Drive') : 'colocada à mão',
            g.senha && `senha <b>${esc(g.senha)}</b>`,
            g.drive_id && (g.compartilhada ? '<span style="color:var(--verde-esc)">link liberado para os alunos ✓</span>' : g.aviso ? `<span style="color:var(--erro)">${esc(g.aviso)}</span>` : 'liberando o link…')].filter(Boolean).join(' · ')}</div></div>
        <div class="linha" style="gap:6px"><a class="btn peq pri" href="${esc(g.link)}" target="_blank" rel="noopener">Assistir</a>
          ${!g.drive_id && !g.zoom_id && (ctx.ehAdmin || g.criado_por === ctx.perfil.id) ? `<button class="btn peq" type="button" data-pa-apagar="${g.id}" aria-label="Apagar ${esc(g.nome)}">Apagar</button>`
            : ctx.ehAdmin ? `<button class="btn peq" type="button" data-pa-tirar="${g.id}" title="Não é deste módulo">Tirar daqui</button>` : ''}</div></div>`).join('')}</div>`
      : `<p class="apagado mt peq">Ainda sem gravação. ${m.formato === 'presencial' ? 'Aula presencial: se tiver gravação, coloque o link à mão.' : 'Depois da aula, a plataforma procura a gravação no Zoom de hora em hora e coloca aqui, com a senha. Se preferir, coloque à mão.'}</p>`;
  };
  desenharGravacoes();

  box.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-pa-tirar]');
    if (t) {
      if (!window.confirm('Tirar esta gravação do módulo? Ela vai para a lista "Gravações sem aula", em Turmas, e o link do Drive deixa de abrir para quem não é da Mentorei.')) return;
      try { const j = await api({ acao: 'ligar', id: t.dataset.paTirar, modulo_id: null }); avisar(j.mensagem); desenharGravacoes(); } catch (e) { avisar(explicarErro(e), true); }
      return;
    }
    // gravação colocada à mão: some de vez (os alunos deixam de ver)
    const ap = ev.target.closest('[data-pa-apagar]');
    if (ap) {
      if (!window.confirm('Apagar esta gravação do módulo? Os alunos deixam de ver o link. O vídeo em si continua onde está (Drive, YouTube…).')) return;
      const { error } = await sb.from('gravacoes').delete().eq('id', ap.dataset.paApagar);
      if (error) { avisar(explicarErro(error), true); return; }
      avisar('Gravação apagada do módulo.'); desenharGravacoes();
      return;
    }
    const form = box.querySelector('#pa-form');
    if (ev.target.id === 'pa-abrir') { form.hidden = false; ev.target.hidden = true; box.querySelector('#pa-link').focus(); return; }
    if (ev.target.id === 'pa-fechar') { form.hidden = true; box.querySelector('#pa-abrir').hidden = false; return; }
    if (ev.target.id === 'pa-colar') {
      const link = box.querySelector('#pa-link').value.trim();
      if (!link) { avisar('Cole o link da gravação.', true); return; }
      if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(link)) { avisar('Isso não parece um link. Copie o endereço do vídeo e cole aqui.', true); return; }
      ev.target.disabled = true;
      try {
        const j = await api({ acao: 'colar', modulo_id: m.id, link, nome: box.querySelector('#pa-nome').value.trim(), senha: box.querySelector('#pa-senha').value.trim(), gravada_em: m.data_hora || null });
        avisar(j.aviso || j.mensagem, !!j.aviso);
        box.querySelector('#pa-link').value = ''; box.querySelector('#pa-nome').value = ''; box.querySelector('#pa-senha').value = '';
        form.hidden = true; box.querySelector('#pa-abrir').hidden = false;
        desenharGravacoes();
      } catch (e) { avisar(explicarErro(e), true); }
      ev.target.disabled = false;
    }
  });

  // envio de arquivos para os alunos
  box.querySelectorAll('[data-pa-enviar]').forEach((inp) => inp.addEventListener('change', async () => {
    const tipo = inp.dataset.paEnviar;
    const arquivos = [...inp.files];
    inp.value = '';
    if (!arquivos.length) return;
    const prog = box.querySelector('#pa-progresso');
    let feitos = 0;
    for (const [i, arq] of arquivos.entries()) {
      const ext = (arq.name.split('.').pop() || '').toLowerCase();
      if (tipo === 'aluno' && ext !== 'pdf') { avisar('Os slides para os alunos vão em PDF. No PowerPoint: Arquivo → Salvar como → PDF.', true); continue; }
      if (!TIPOS[ext]) { avisar(`${arq.name}: envie PDF, Word, Excel, PowerPoint, ZIP ou imagem.`, true); continue; }
      if (arq.size > 52428800) { avisar(`${arq.name} passa de 50 MB.`, true); continue; }
      prog.textContent = arquivos.length > 1 ? `Enviando ${i + 1} de ${arquivos.length}…` : `Enviando ${arq.name}…`;
      const caminho = `${m.id}/${tipo}/${Date.now()}-${i}-${nomeSeguro(arq.name)}`;
      try {
        const up = await sb.storage.from('turmas').upload(caminho, arq, { contentType: TIPOS[ext] });
        if (up.error) throw up.error;
        const r = await sb.from('modulo_arquivos').insert({ modulo_id: m.id, tipo, nome: arq.name, caminho, tamanho: arq.size, enviado_por: ctx.perfil.id });
        if (r.error) { await sb.storage.from('turmas').remove([caminho]); throw r.error; }
        feitos += 1;
      } catch (e) {
        avisar(faltaScript(e) ? (ctx.ehAdmin ? 'Falta rodar o script 44-alunos-das-turmas.sql no Supabase.' : 'Os arquivos para os alunos ainda não foram liberados. Avise a Cintia.') : `${arq.name}: ${explicarErro(e)}`, true);
        if (faltaScript(e)) break;
      }
    }
    prog.textContent = '';
    if (feitos) { avisar(tipo === 'aluno' ? 'PDF enviado. Os alunos já podem baixar.' : `${feitos} arquivo${feitos > 1 ? 's enviados' : ' enviado'}. Os alunos já podem baixar.`); recarregar(); }
  }));
}
