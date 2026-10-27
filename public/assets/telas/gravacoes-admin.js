// Cartão "Gravações das aulas" (administração, na lista de Turmas; script 44): liga a pasta do Zoom no Google Drive,
// mostra a última procura e a lista de gravações que a plataforma não soube de qual aula são, para a administração escolher.
import { sb, esc, avisar, explicarErro, dataHoraBR, diaMes, horaBR } from '../base.js';

async function api(caminho, corpo) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.mensagem || 'Não foi possível.'), j);
  return j;
}

const PASSO_COMPARTILHAR = `<details class="mt peq"><summary style="cursor:pointer"><b>Como liberar no Google</b> (quem cuida do Google da Mentorei faz uma vez)</summary>
  <ol class="mt"><li>Entre em <a href="https://admin.google.com" target="_blank" rel="noopener">admin.google.com</a> com a conta de administração do Google da Mentorei.</li>
  <li>Clique em <b>Apps</b> → <b>Google Workspace</b> → <b>Drive e Documentos</b> → <b>Configurações de compartilhamento</b>.</li>
  <li>Em <b>Opções de compartilhamento</b>, marque <b>Permitir que os usuários compartilhem arquivos fora da organização</b> e salve.</li>
  <li>Volte aqui e clique em <b>Procurar agora</b>.</li></ol></details>`;

export async function cartaoGravacoes(velho) {
  if (!velho) return;
  const box = velho.cloneNode(false);   // nasce de novo a cada recarga (cliques não se acumulam)
  velho.replaceWith(box);
  const recarregar = () => cartaoGravacoes(box);
  let st;
  try { st = await api('/api/gravacoes', { acao: 'status' }); } catch (e) { box.innerHTML = `<h3>Gravações das aulas</h3><p class="peq apagado mt">${esc(explicarErro(e))}</p>`; return; }
  const cfg = st.config || {};
  const res = cfg.resultado || {};

  const { data: soltas, error } = await sb.from('gravacoes').select('id, nome, link, gravada_em, duracao_min').is('modulo_id', null).eq('ignorada', false).not('drive_id', 'is', null).order('gravada_em', { ascending: false });
  const semScript = !!error;
  const { data: avisos } = semScript ? { data: [] } : await sb.from('gravacoes').select('aviso').not('aviso', 'is', null).not('modulo_id', 'is', null).limit(1);

  let corpo;
  if (semScript) corpo = '<div class="aviso mt">Falta rodar o script <b>44-alunos-das-turmas.sql</b> no Supabase.</div>';
  else if (!st.conectado || !st.permissao) {
    corpo = `<div class="aviso mt">Para a plataforma ler a pasta das gravações do Zoom, ${st.conectado ? `a conta do Google (<b>${esc(st.email || '')}</b>) precisa ser conectada de novo, com uma permissão a mais` : 'conecte a conta do Google'}.
      <ol class="peq mt"><li>Clique em <b>Conectar o Google de novo</b>.</li><li>Entre com <b>contato@mentorei.com.br</b>.</li><li>Na tela do Google, deixe tudo marcado e clique em <b>Continuar</b>.</li><li>Você volta para o Painel. Depois, entre de novo em Turmas e cole o link da pasta.</li></ol>
      <button class="btn pri mt" type="button" id="gv-conectar">Conectar o Google de novo</button></div>`;
  } else if (!cfg.pasta_id) {
    corpo = `<p class="peq mt">Abra no Google Drive a pasta onde ficam as gravações do Zoom, copie o endereço lá de cima do navegador e cole aqui.</p>
      <div class="linha mt"><input type="url" id="gv-pasta" placeholder="https://drive.google.com/drive/folders/…" style="flex:1;min-width:240px"><button class="btn pri" type="button" id="gv-ligar">Ligar a pasta</button></div>`;
  } else {
    corpo = `<p class="peq mt">Pasta <b>${esc(cfg.pasta_nome || '')}</b> · procura sozinha de hora em hora${cfg.ultima_leitura ? ` · última vez: ${dataHoraBR(cfg.ultima_leitura)}` : ' · primeira procura em andamento'}
      ${res.lidos != null ? ` · ${res.lidos} vídeo${res.lidos === 1 ? '' : 's'} na pasta` : ''}${res.novas ? ` · ${res.novas} novo${res.novas > 1 ? 's' : ''} na última vez` : ''}</p>
      <div class="linha mt"><button class="btn peq" type="button" id="gv-ler">Procurar agora</button><button class="btn peq" type="button" id="gv-trocar">Trocar a pasta</button></div>
      <div class="linha mt" id="gv-trocar-caixa" hidden><input type="url" id="gv-pasta" placeholder="https://drive.google.com/drive/folders/…" style="flex:1;min-width:240px"><button class="btn pri peq" type="button" id="gv-ligar">Ligar esta pasta</button></div>
      ${(avisos || []).length ? `<div class="aviso mt peq"><b>Atenção:</b> ${esc(avisos[0].aviso)}${PASSO_COMPARTILHAR}</div>` : ''}`;
  }

  let lista = '';
  if (!semScript && (soltas || []).length) {
    const { data: mods } = await sb.from('modulos').select('id, numero, titulo, data_hora, formato, turma:turmas(nome, empresa:empresas(nome))').not('data_hora', 'is', null).order('data_hora', { ascending: false });
    const online = (mods || []).filter((m) => m.formato !== 'presencial');
    // aulas mais perto da data da gravação primeiro (aula que ainda não tinha começado não entra)
    const antesDa = (g) => online.filter((m) => !g.gravada_em || Date.parse(m.data_hora) <= Date.parse(g.gravada_em) + 3 * 3600000);
    const perto = (g) => (antesDa(g).length ? antesDa(g) : online)
      .map((m) => ({ m, d: g.gravada_em ? Math.abs(Date.parse(m.data_hora) - Date.parse(g.gravada_em)) : 0 })).sort((a, b) => a.d - b.d);
    const rotulo = (m) => `${diaMes(m.data_hora)} ${horaBR(m.data_hora)} · ${m.turma ? `${m.turma.empresa ? `${m.turma.empresa.nome} · ` : ''}${m.turma.nome}` : ''} · ${m.numero}. ${m.titulo}`;
    lista = `<h4 class="mt2">Gravações sem aula <span class="selo alerta">${soltas.length}</span></h4>
      <p class="peq apagado">A plataforma não teve certeza de qual aula são (duas aulas no mesmo horário, ou o nome do arquivo sem data). Escolha a aula ou marque "Não é de aula". Elas ainda não aparecem para os alunos.</p>
      <div class="lista mt">${soltas.map((g) => { const op = perto(g); return `<div class="item" style="grid-template-columns:1fr" data-solta="${g.id}">
        <div style="min-width:0"><div class="nome" style="word-break:break-word">${esc(g.nome)}</div>
          <div class="info">${g.gravada_em ? dataHoraBR(g.gravada_em) : 'sem data'}${g.duracao_min ? ` · ${g.duracao_min} min` : ''} · <a href="${esc(g.link)}" target="_blank" rel="noopener">abrir no Drive</a></div></div>
        <div class="linha" style="gap:6px"><select data-escolha="${g.id}" style="flex:1;min-width:220px" aria-label="Aula desta gravação"><option value="">Escolha a aula…</option>
          ${op.slice(0, 40).map(({ m }, i) => `<option value="${m.id}"${i === 0 && g.gravada_em && op[0].d < 6 * 3600000 ? ' selected' : ''}>${esc(rotulo(m))}</option>`).join('')}</select>
          <button class="btn peq pri" type="button" data-ligar="${g.id}">Ligar</button><button class="btn peq" type="button" data-ignorar="${g.id}">Não é de aula</button></div></div>`; }).join('')}</div>`;
  }

  // gravação à mão: qualquer link (Drive, YouTube, Vimeo, Zoom) num módulo escolhido
  let manual = '';
  if (!semScript) {
    const { data: todos } = await sb.from('modulos').select('id, numero, titulo, data_hora, turma:turmas(nome, empresa:empresas(nome))').order('data_hora', { ascending: false });
    const agora = Date.now();
    const ord = (todos || []).slice().sort((a, b) => {
      const pa = a.data_hora && Date.parse(a.data_hora) <= agora, pb = b.data_hora && Date.parse(b.data_hora) <= agora;
      return (pb - pa) || String(b.data_hora || '').localeCompare(String(a.data_hora || ''));   // as que já aconteceram primeiro, da mais recente
    });
    const rot = (m) => `${m.data_hora ? `${diaMes(m.data_hora)} ${horaBR(m.data_hora)}` : 'sem data'} · ${m.turma ? `${m.turma.empresa ? `${m.turma.empresa.nome} · ` : ''}${m.turma.nome}` : ''} · ${m.numero}. ${m.titulo}`;
    manual = `<h4 class="mt2">Colocar gravação à mão</h4>
      <p class="peq apagado">Para uma gravação que não está na pasta do Zoom: escolha a aula e cole o link do vídeo (Google Drive, YouTube, Vimeo ou Zoom).</p>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo" style="grid-column:1/-1"><label for="gv-m-mod">Aula</label><select id="gv-m-mod"><option value="">Escolha a aula…</option>
          ${ord.map((m) => `<option value="${m.id}" data-quando="${esc(m.data_hora || '')}">${esc(rot(m))}</option>`).join('')}</select></div>
        <div class="campo" style="grid-column:1/-1"><label for="gv-m-link">Link da gravação</label><input type="url" id="gv-m-link" placeholder="https://drive.google.com/file/d/…"></div>
        <div class="campo"><label for="gv-m-nome">Nome que os alunos veem (opcional)</label><input type="text" id="gv-m-nome" placeholder="Ex.: Gravação · parte 2"></div>
        <div class="linha" style="align-items:flex-end"><button class="btn peq pri" type="button" id="gv-m-ok">Colocar a gravação</button></div>
      </div>`;
  }

  box.innerHTML = `<div class="linha"><h3 style="flex:1">Gravações das aulas</h3>${cfg.pasta_id && !semScript ? '<span class="selo">Pasta do Zoom ligada</span>' : ''}</div>
    <p class="peq apagado">Os vídeos do Zoom que estão no Google Drive vão sozinhos para o módulo certo (pela data e hora) e aparecem para os alunos da turma.</p>
    ${corpo}${lista}${manual}`;

  box.querySelector('#gv-m-ok')?.addEventListener('click', async (ev) => {
    const sel = box.querySelector('#gv-m-mod');
    const link = box.querySelector('#gv-m-link').value.trim();
    if (!sel.value) { avisar('Escolha a aula da gravação.', true); return; }
    if (!link) { avisar('Cole o link da gravação.', true); return; }
    ev.target.closest('button').disabled = true;
    try {
      const j = await api('/api/gravacoes', { acao: 'colar', modulo_id: sel.value, link, nome: box.querySelector('#gv-m-nome').value.trim(), gravada_em: sel.selectedOptions[0].dataset.quando || null });
      avisar(j.aviso || j.mensagem, !!j.aviso);
      box.querySelector('#gv-m-link').value = ''; box.querySelector('#gv-m-nome').value = ''; sel.value = '';
    } catch (e) { avisar(explicarErro(e), true); }
    ev.target.closest('button').disabled = false;
  });

  box.querySelector('#gv-conectar')?.addEventListener('click', async (ev) => {
    ev.target.closest('button').disabled = true;
    try { const j = await api('/api/google-conectar', {}); location.href = j.url; } catch (e) { avisar(explicarErro(e), true); ev.target.closest('button').disabled = false; }
  });
  box.querySelector('#gv-trocar')?.addEventListener('click', () => { const c = box.querySelector('#gv-trocar-caixa'); c.hidden = !c.hidden; });
  box.querySelector('#gv-ligar')?.addEventListener('click', async (ev) => {
    const link = box.querySelector('#gv-pasta').value.trim();
    if (!link) { avisar('Cole o link da pasta.', true); return; }
    ev.target.closest('button').disabled = true;
    try { const j = await api('/api/gravacoes', { acao: 'pasta', link }); avisar(j.mensagem); recarregar(); }
    catch (e) { avisar(explicarErro(e), true); ev.target.closest('button').disabled = false; }
  });
  box.querySelector('#gv-ler')?.addEventListener('click', async (ev) => {
    ev.target.closest('button').disabled = true;
    try { const j = await api('/api/gravacoes', { acao: 'ler' }); avisar(j.mensagem); } catch (e) { avisar(explicarErro(e), true); }
    setTimeout(recarregar, 20000);
  });
  box.addEventListener('click', async (ev) => {
    const l = ev.target.closest('[data-ligar]');
    const ig = ev.target.closest('[data-ignorar]');
    if (!l && !ig) return;
    const id = (l || ig).dataset.ligar || (l || ig).dataset.ignorar;
    const modulo = l ? box.querySelector(`[data-escolha="${id}"]`).value : null;
    if (l && !modulo) { avisar('Escolha a aula desta gravação.', true); return; }
    (l || ig).disabled = true;
    try {
      const j = await api('/api/gravacoes', l ? { acao: 'ligar', id, modulo_id: modulo } : { acao: 'ignorar', id, ignorada: true });
      avisar(j.aviso || j.mensagem, !!j.aviso);
      box.querySelector(`[data-solta="${id}"]`)?.remove();
    } catch (e) { avisar(explicarErro(e), true); (l || ig).disabled = false; }
  });
}
