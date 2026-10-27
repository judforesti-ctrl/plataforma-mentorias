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

  // "select *" para funcionar antes e depois do script 46 (zoom_id e senha); só as achadas sozinhas (Drive ou Zoom) entram na lista
  const { data: semAula, error } = await sb.from('gravacoes').select('*').is('modulo_id', null).eq('ignorada', false).order('gravada_em', { ascending: false });
  const soltas = (semAula || []).filter((g) => g.drive_id || g.zoom_id);
  const semScript = !!error;
  const contasZoom = st.zoom || [];
  const zres = cfg.zoom_resultado || {};
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
      <div class="linha mt"><button class="btn peq" type="button" data-ler>Procurar agora</button><button class="btn peq" type="button" id="gv-trocar">Trocar a pasta</button></div>
      <div class="linha mt" id="gv-trocar-caixa" hidden><input type="url" id="gv-pasta" placeholder="https://drive.google.com/drive/folders/…" style="flex:1;min-width:240px"><button class="btn pri peq" type="button" id="gv-ligar">Ligar esta pasta</button></div>
      ${(avisos || []).length ? `<div class="aviso mt peq"><b>Atenção:</b> ${esc(avisos[0].aviso)}${PASSO_COMPARTILHAR}</div>` : ''}`;
  }

  const zoomHtml = semScript ? '' : `<h4 class="mt2">Contas do Zoom</h4>
    <p class="peq apagado">A plataforma lê as gravações na nuvem do Zoom de hora em hora, acha a aula pela data e hora e coloca no módulo o link com a senha.
      Gravação sem aula de turma no horário (como uma mentoria individual) não entra.</p>
    ${contasZoom.length ? `<div class="lista mt">${contasZoom.map((c) => `<div class="item" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><div class="nome">${esc(c.nome)}${c.email ? ` <span class="peq apagado">· ${esc(c.email)}</span>` : ''}</div>
        <div class="info">${c.erro ? `<span style="color:var(--erro)">${esc(c.erro)}</span>` : c.ultima_leitura ? `Última procura: ${dataHoraBR(c.ultima_leitura)}${c.resultado ? ` · ${c.resultado.novas || 0} nova${c.resultado.novas === 1 ? '' : 's'}` : ''}` : 'Primeira procura em andamento (pode levar alguns minutos)'}${c.usuarios ? ` · ${c.usuarios} usuário${c.usuarios > 1 ? 's' : ''}` : ''}</div></div>
      <button class="btn peq" type="button" data-zoom-tirar="${esc(c.id)}">Desligar</button></div>`).join('')}</div>
      <div class="linha mt"><button class="btn peq" type="button" data-ler>Procurar agora</button>${zres.erro ? `<span class="peq" style="color:var(--erro)">${esc(zres.mensagem || '')}</span>` : ''}</div>` : '<div class="aviso mt peq">Nenhuma conta do Zoom ligada ainda.</div>'}
    <button class="btn peq ${contasZoom.length ? '' : 'pri '}mt" type="button" id="gv-z-abrir">+ Ligar ${contasZoom.length ? 'outra' : 'uma'} conta do Zoom</button>
    <div class="mt" id="gv-z-form" hidden style="background:var(--bg);border-radius:12px;padding:14px">
      <p class="peq"><b>Passo a passo no Zoom</b> (você, como administradora, faz uma vez em cada conta do Zoom):</p>
      <ol class="peq mt" style="line-height:1.6">
        <li>Entre em <a href="https://marketplace.zoom.us" target="_blank" rel="noopener">marketplace.zoom.us</a> com o login de administradora do Zoom.</li>
        <li>No alto, clique em <b>Develop</b> e depois em <b>Build App</b>.</li>
        <li>Escolha <b>Server-to-Server OAuth App</b> e clique em <b>Create</b>. Nome do app: <b>Plataforma Mentorei</b>.</li>
        <li>Na página <b>App Credentials</b> aparecem <b>Account ID</b>, <b>Client ID</b> e <b>Client Secret</b>: copie cada um para os campos abaixo.</li>
        <li>Em <b>Information</b>, preencha o nome da empresa (Mentorei), o seu nome e o seu e-mail e clique em <b>Continue</b>.</li>
        <li>Em <b>Scopes</b>, clique em <b>+ Add Scopes</b>, procure <b>recording</b> e marque <b>View all user recordings</b>; procure <b>user</b> e marque
          <b>View all user information</b>. Clique em <b>Done</b> e em <b>Continue</b>.</li>
        <li>Em <b>Activation</b>, clique em <b>Activate your app</b>.</li>
        <li>Volte aqui e clique em <b>Ligar a conta</b>.</li></ol>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo" style="grid-column:1/-1"><label for="gv-z-nome">Nome para reconhecer esta conta</label><input type="text" id="gv-z-nome" placeholder="Ex.: Zoom das turmas" autocomplete="off"></div>
        <div class="campo"><label for="gv-z-acc">Account ID</label><input type="text" id="gv-z-acc" autocomplete="off" spellcheck="false"></div>
        <div class="campo"><label for="gv-z-cli">Client ID</label><input type="text" id="gv-z-cli" autocomplete="off" spellcheck="false"></div>
        <div class="campo" style="grid-column:1/-1"><label for="gv-z-sec">Client Secret</label><input type="password" id="gv-z-sec" autocomplete="new-password" spellcheck="false"></div>
      </div>
      <div class="linha mt"><button class="btn pri" type="button" id="gv-z-ligar">Ligar a conta</button><button class="btn" type="button" id="gv-z-fechar">Desistir</button></div>
      <p class="peq apagado mt">As chaves ficam guardadas só no servidor da plataforma: ninguém consegue ver depois, nem a administração.</p>
      <details class="mt peq"><summary style="cursor:pointer"><b>Dois ajustes no Zoom para os alunos conseguirem assistir</b></summary>
        <ol class="mt" style="line-height:1.6"><li>Em <a href="https://zoom.us/profile/setting?tab=recording" target="_blank" rel="noopener">zoom.us, Configurações, Gravação</a>, deixe <b>desligada</b>
          a opção "Exigir que os usuários se autentiquem antes de ver as gravações na nuvem". Assim o aluno assiste sem ter conta no Zoom.</li>
          <li>Na mesma tela, veja se está ligada a opção de <b>apagar as gravações na nuvem depois de alguns dias</b>. Se estiver, as gravações somem do Zoom
          (e do link do aluno) depois desse prazo.</li></ol></details>
    </div>`;
  const driveHtml = semScript ? corpo : `<details class="mt2"${cfg.pasta_id ? ' open' : ''}><summary style="cursor:pointer"><b>Gravações numa pasta do Google Drive</b> <span class="peq apagado">(opcional)</span></summary>
    <p class="peq apagado mt">Só se alguma aula for gravada fora do Zoom e o vídeo for para o Google Drive.</p>${corpo}</details>`;

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
          <div class="info">${g.gravada_em ? dataHoraBR(g.gravada_em) : 'sem data'}${g.duracao_min ? ` · ${g.duracao_min} min` : ''} · <a href="${esc(g.link)}" target="_blank" rel="noopener">abrir ${g.zoom_id ? 'no Zoom' : 'no Drive'}</a>${g.senha ? ` · senha ${esc(g.senha)}` : ''}</div></div>
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
      <p class="peq apagado">Para uma gravação que a plataforma não achou sozinha: escolha a aula e cole o link do vídeo (Zoom, Google Drive, YouTube ou Vimeo).</p>
      <div class="grade g2 mt" style="gap:10px">
        <div class="campo" style="grid-column:1/-1"><label for="gv-m-mod">Aula</label><select id="gv-m-mod"><option value="">Escolha a aula…</option>
          ${ord.map((m) => `<option value="${m.id}" data-quando="${esc(m.data_hora || '')}">${esc(rot(m))}</option>`).join('')}</select></div>
        <div class="campo" style="grid-column:1/-1"><label for="gv-m-link">Link da gravação</label><input type="url" id="gv-m-link" placeholder="https://drive.google.com/file/d/…"></div>
        <div class="campo"><label for="gv-m-senha">Senha da gravação (se tiver)</label><input type="text" id="gv-m-senha" autocomplete="off" placeholder="A senha que o Zoom mostra"></div>
        <div class="campo"><label for="gv-m-nome">Nome que os alunos veem (opcional)</label><input type="text" id="gv-m-nome" placeholder="Ex.: Gravação · parte 2"></div>
        <div class="linha" style="align-items:flex-end"><button class="btn peq pri" type="button" id="gv-m-ok">Colocar a gravação</button></div>
      </div>`;
  }

  box.innerHTML = `<div class="linha"><h3 style="flex:1">Gravações das aulas</h3>${contasZoom.length && !semScript ? `<span class="selo">${contasZoom.length} conta${contasZoom.length > 1 ? 's' : ''} do Zoom ligada${contasZoom.length > 1 ? 's' : ''}</span>` : ''}</div>
    <p class="peq apagado">As gravações vão sozinhas para o módulo certo (pela data e hora da aula) e aparecem para os alunos da turma, com a senha.</p>
    ${zoomHtml}${lista}${manual}${driveHtml}`;

  box.querySelector('#gv-z-abrir')?.addEventListener('click', (ev) => { box.querySelector('#gv-z-form').hidden = false; ev.target.closest('button').hidden = true; });
  box.querySelector('#gv-z-fechar')?.addEventListener('click', () => { box.querySelector('#gv-z-form').hidden = true; box.querySelector('#gv-z-abrir').hidden = false; });
  box.querySelector('#gv-z-ligar')?.addEventListener('click', async (ev) => {
    const v = (id) => box.querySelector(id).value.trim();
    if (!v('#gv-z-acc') || !v('#gv-z-cli') || !v('#gv-z-sec')) { avisar('Cole os três: Account ID, Client ID e Client Secret.', true); return; }
    const b = ev.target.closest('button'); b.disabled = true; b.textContent = 'Conferindo com o Zoom…';
    try {
      const j = await api('/api/gravacoes', { acao: 'zoom_ligar', nome: v('#gv-z-nome'), account_id: v('#gv-z-acc'), client_id: v('#gv-z-cli'), client_secret: v('#gv-z-sec') });
      avisar(j.mensagem);
      recarregar();
    } catch (e) { avisar(explicarErro(e), true); b.disabled = false; b.textContent = 'Ligar a conta'; }
  });
  box.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-zoom-tirar]'); if (!t) return;
    if (!window.confirm('Desligar esta conta do Zoom da plataforma? As gravações que já entraram continuam nos módulos; as novas desta conta deixam de entrar.')) return;
    try { const j = await api('/api/gravacoes', { acao: 'zoom_tirar', id: t.dataset.zoomTirar }); avisar(j.mensagem); recarregar(); } catch (e) { avisar(explicarErro(e), true); }
  });

  box.querySelector('#gv-m-ok')?.addEventListener('click', async (ev) => {
    const sel = box.querySelector('#gv-m-mod');
    const link = box.querySelector('#gv-m-link').value.trim();
    if (!sel.value) { avisar('Escolha a aula da gravação.', true); return; }
    if (!link) { avisar('Cole o link da gravação.', true); return; }
    ev.target.closest('button').disabled = true;
    try {
      const j = await api('/api/gravacoes', { acao: 'colar', modulo_id: sel.value, link, nome: box.querySelector('#gv-m-nome').value.trim(), senha: box.querySelector('#gv-m-senha').value.trim(), gravada_em: sel.selectedOptions[0].dataset.quando || null });
      avisar(j.aviso || j.mensagem, !!j.aviso);
      box.querySelector('#gv-m-link').value = ''; box.querySelector('#gv-m-nome').value = ''; box.querySelector('#gv-m-senha').value = ''; sel.value = '';
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
  box.querySelectorAll('[data-ler]').forEach((bt) => bt.addEventListener('click', async (ev) => {
    ev.target.closest('button').disabled = true;
    try { const j = await api('/api/gravacoes', { acao: 'ler' }); avisar(j.mensagem); } catch (e) { avisar(explicarErro(e), true); }
    setTimeout(recarregar, 20000);
  }));
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
