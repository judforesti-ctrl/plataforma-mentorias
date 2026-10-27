// Gravações das aulas (pedido da Juliana, 27/10/2026): as aulas das turmas são gravadas no Zoom e ficam TODAS numa pasta só
// do Google Drive da contato@mentorei.com.br. O servidor lê a pasta (e as subpastas, caso o Zoom crie uma por reunião), descobre
// de qual módulo é cada vídeo pela data e hora (no nome do arquivo ou da pasta) e libera "qualquer pessoa com o link" SÓ nos vídeos
// ligados a um módulo (decisão dela). O link aparece só para quem entrou com senha, na área do aluno.
// Precisa do escopo "drive" completo na conta conectada (o drive.file das cópias de segurança só enxerga o que a plataforma criou).
import { createHmac } from 'node:crypto';
import { supa, acessoGoogle, contaGoogle, env, SITE } from './google.mjs';

// chave dos pedidos para a leitura em segundo plano (só a própria plataforma chama)
export const chaveGravacoes = () => createHmac('sha256', env('SUPABASE_SECRET_KEY')).update('gravacoes-fundo').digest('hex');
export const pedirLeitura = () => fetch(`${SITE}/api/gravacoes-fundo`, { method: 'POST', headers: { 'x-mentorei-gravacoes': chaveGravacoes() } }).catch(() => null);

const DRIVE = 'https://www.googleapis.com/drive/v3';
const FUSO_MS = 3 * 3600000;                         // Brasília (sem horário de verão)
export const DESDE = Date.parse('2026-07-25T00:00:00-03:00');   // módulos na plataforma só desde 01/08
const PASTA = 'application/vnd.google-apps.folder';

export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive';
export const temPermissaoGravacoes = (conta) => String((conta && conta.scope) || '').split(/\s+/).includes(ESCOPO_DRIVE);

// Id da pasta a partir do link que ela cola ("…/folders/<id>", "?id=<id>" ou só o id).
export function idDaPasta(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/\/folders\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/) || t.match(/^([\w-]{20,})$/);
  return m ? m[1] : null;
}

// ---------- regras puras (testadas sem internet) ----------
const sem = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palavras = (x) => sem(x).split(/[^a-z0-9]+/).filter((p) => p.length > 2 && !/^(gmt|recording|zoom|video|audio|mp4|m4a|the|com|para|turma|modulo|aula|reuniao|meeting)$/.test(p) && !/^\d+$/.test(p));

// Quando a gravação começou, pelo nome do arquivo ou de uma das pastas acima dele.
// Zoom na nuvem: "GMT20261015-123012_Recording_1920x1080.mp4" (hora de Greenwich).
// Zoom no computador: pasta "2026-10-15 09.30.12 Nome da reunião" (hora local). Data brasileira "15-10-2026" vale o dia.
// Sem nada disso: a data em que o arquivo chegou ao Drive, aproximada (só serve para achar a aula do mesmo dia).
export function quandoFoiGravada(nomes, criadoEm) {
  for (const nome of nomes) {
    const g = String(nome).match(/GMT(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (g) return { ms: Date.UTC(+g[1], +g[2] - 1, +g[3], +g[4], +g[5], +g[6]), certeza: 'hora' };
    const l = String(nome).match(/(20\d{2})-(\d{2})-(\d{2})[ _T](\d{2})[.:h-](\d{2})(?:[.:-](\d{2}))?/);
    if (l) return { ms: Date.UTC(+l[1], +l[2] - 1, +l[3], +l[4], +l[5], +(l[6] || 0)) + FUSO_MS, certeza: 'hora' };
  }
  for (const nome of nomes) {
    const d = String(nome).match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/) || String(nome).match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
    if (d) {
      const [a, m, dia] = d[1].length === 4 ? [d[1], d[2], d[3]] : [d[3], d[2], d[1]];
      return { ms: Date.UTC(+a, +m - 1, +dia, 12) + FUSO_MS, certeza: 'dia' };
    }
  }
  const c = Date.parse(criadoEm || '');
  return Number.isFinite(c) ? { ms: c, certeza: 'chegada' } : null;
}

const diaBR = (ms) => new Date(ms - FUSO_MS).toISOString().slice(0, 10);

// Escolhe o módulo de uma gravação. modulos: [{ id, data_hora, duracao_min, formato, titulo, turma, empresa }].
// Devolve { modulo_id } quando tem certeza, ou { candidatos: [ids] } para a administração escolher.
export function escolherModulo(gravacao, modulos) {
  const q = quandoFoiGravada(gravacao.nomes, gravacao.criadoEm);
  if (!q) return { candidatos: [] };
  const online = modulos.filter((m) => m.data_hora && m.formato !== 'presencial');
  let cands;
  if (q.certeza === 'hora') {
    cands = online.filter((m) => {
      const ini = Date.parse(m.data_hora), fim = ini + (Number(m.duracao_min) || 180) * 60000;
      return q.ms >= ini - 90 * 60000 && q.ms <= fim + 30 * 60000;
    });
  } else {
    cands = online.filter((m) => diaBR(Date.parse(m.data_hora)) === diaBR(q.ms) && (q.certeza === 'dia' || Date.parse(m.data_hora) <= q.ms + 30 * 60000));
  }
  if (!cands.length) return { candidatos: [] };
  if (cands.length === 1) return { modulo_id: cands[0].id, candidatos: [cands[0].id] };
  // mais de uma aula no mesmo horário: as palavras do nome da reunião (turma, empresa, tema) desempatam; depois, o Zoom
  const texto = new Set(palavras(gravacao.nomes.join(' ')));
  const pontos = (m) => palavras(`${m.empresa || ''} ${m.turma || ''} ${m.titulo || ''}`).filter((p) => texto.has(p)).length * 10
    + (m.formato === 'zoom' ? 1 : 0)
    - (q.certeza === 'hora' ? Math.abs(Date.parse(m.data_hora) - q.ms) / 3600000 : 0);
  const ord = cands.map((m) => ({ m, p: pontos(m) })).sort((a, b) => b.p - a.p);
  const ganha = ord[0].p - ord[1].p >= 5;
  return { ...(ganha ? { modulo_id: ord[0].m.id } : {}), candidatos: ord.map((x) => x.m.id) };
}

// ---------- Google Drive ----------
async function drive(token, caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`${DRIVE}${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text();
  let dados = null; try { dados = t ? JSON.parse(t) : null; } catch (_) { dados = t; }
  return { ok: r.ok, status: r.status, dados };
}
const TODOS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

export async function nomeDaPasta(token, id) {
  const r = await drive(token, `/files/${id}?fields=id,name,mimeType&supportsAllDrives=true`);
  if (!r.ok) return { erro: r.status === 404 ? 'A conta conectada não enxerga essa pasta. Confira se a pasta é da contato@mentorei.com.br ou foi compartilhada com ela.' : 'Não consegui abrir a pasta no Google Drive.' };
  if (r.dados.mimeType !== PASTA) return { erro: 'Esse link é de um arquivo, não de uma pasta. Abra a pasta das gravações e copie o endereço dela.' };
  return { nome: r.dados.name };
}

// Vídeos da pasta e das subpastas (até 3 níveis), com o nome das pastas acima de cada um.
async function listarVideos(token, pastaId, limiteMs) {
  const videos = [];
  const fila = [{ id: pastaId, nomes: [], nivel: 0 }];
  const inicio = Date.now();
  while (fila.length && Date.now() - inicio < limiteMs) {
    const p = fila.shift();
    let pagina = '';
    do {
      const q = encodeURIComponent(`'${p.id}' in parents and trashed = false`);
      const r = await drive(token, `/files?q=${q}&pageSize=200&${TODOS}&fields=nextPageToken,files(id,name,mimeType,createdTime,videoMediaMetadata(durationMillis))${pagina ? `&pageToken=${pagina}` : ''}`);
      if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'sem-permissao' : `drive-${r.status}`);
      for (const f of r.dados.files || []) {
        if (f.mimeType === PASTA) { if (p.nivel < 3) fila.push({ id: f.id, nomes: [f.name, ...p.nomes], nivel: p.nivel + 1 }); }
        else if (/^video\//.test(f.mimeType || '')) videos.push({ ...f, nomes: [f.name, ...p.nomes] });
      }
      pagina = r.dados.nextPageToken || '';
    } while (pagina);
  }
  return videos;
}

// Libera (ou fecha) "qualquer pessoa com o link" num vídeo. Devolve { ok, aviso }.
export async function liberarNoDrive(token, driveId, liberar = true) {
  if (!liberar) {
    const r = await drive(token, `/files/${driveId}/permissions/anyoneWithLink?supportsAllDrives=true`, { metodo: 'DELETE' });
    return { ok: r.ok || r.status === 404 };
  }
  const r = await drive(token, `/files/${driveId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, { metodo: 'POST', corpo: { role: 'reader', type: 'anyone', allowFileDiscovery: false } });
  if (r.ok) return { ok: true };
  const motivo = JSON.stringify(r.dados || '');
  if (/publishOutNotPermitted|cannotShareTeamDriveWithNonGoogleAccounts|shareOutNotPermitted|sharingRateLimit|domainPolicy|outside/i.test(motivo)) {
    return { ok: false, aviso: 'O Google Workspace da Mentorei não deixa abrir o link para fora da empresa. É preciso liberar no painel do Google (veja o passo a passo na plataforma).' };
  }
  return { ok: false, aviso: `O Google não liberou o link (erro ${r.status}).` };
}

// ---------- configuração ----------
export async function lerConfigGravacoes() {
  const r = await supa('/rest/v1/configuracoes?chave=eq.gravacoes&select=valor');
  return (r.ok && r.dados && r.dados[0] && r.dados[0].valor) || {};
}
export async function gravarConfigGravacoes(mudancas) {
  const atual = await lerConfigGravacoes();
  await supa('/rest/v1/configuracoes', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    corpo: { chave: 'gravacoes', valor: { ...atual, ...mudancas }, atualizado_em: new Date().toISOString() } });
}

// ---------- leitura completa: acha vídeos novos, liga ao módulo e libera o link ----------
export async function lerGravacoes({ limiteMs = 20000 } = {}) {
  const cfg = await lerConfigGravacoes();
  if (!cfg.pasta_id) return { desligado: true, mensagem: 'Nenhuma pasta escolhida.' };
  const conta = await contaGoogle();
  if (!temPermissaoGravacoes(conta)) return { erro: 'permissao', mensagem: 'A conta do Google precisa ser conectada de novo para a plataforma ler a pasta das gravações.' };
  const g = await acessoGoogle();
  if (!g || !g.token) return { erro: 'google', mensagem: (g && g.erro) || 'Conecte a conta do Google no Painel.' };

  let videos;
  try { videos = await listarVideos(g.token, cfg.pasta_id, limiteMs); } catch (e) {
    return { erro: 'drive', mensagem: e.message === 'sem-permissao' ? 'O Google não deixou ler a pasta. Conecte a conta do Google de novo no Painel.' : 'Não consegui ler a pasta no Google Drive.' };
  }
  const ja = await supa('/rest/v1/gravacoes?drive_id=not.is.null&select=id,drive_id,modulo_id,ignorada,compartilhada');
  if (!ja.ok) return { erro: 'script', mensagem: 'Falta rodar o script 44-alunos-das-turmas.sql no Supabase.' };
  const conhecidas = new Map((ja.dados || []).map((x) => [x.drive_id, x]));
  const mods = await supa('/rest/v1/modulos?data_hora=not.is.null&select=id,titulo,data_hora,duracao_min,formato,turma:turmas(nome,empresa:empresas(nome))');
  const modulos = (mods.dados || []).map((m) => ({ ...m, turma: m.turma && m.turma.nome, empresa: m.turma && m.turma.empresa && m.turma.empresa.nome }));

  const res = { lidos: videos.length, novas: 0, ligadas: 0, sem_modulo: 0, liberadas: 0, avisos: [] };
  for (const v of videos) {
    if (conhecidas.has(v.id)) continue;
    const q = quandoFoiGravada(v.nomes, v.createdTime);
    if (q && q.ms < DESDE) continue;                     // aulas de antes da plataforma: não entram
    const esc = escolherModulo({ nomes: v.nomes, criadoEm: v.createdTime }, modulos);
    const dur = v.videoMediaMetadata && v.videoMediaMetadata.durationMillis ? Math.round(Number(v.videoMediaMetadata.durationMillis) / 60000) : null;
    const linha = { drive_id: v.id, nome: v.name, link: `https://drive.google.com/file/d/${v.id}/view`, gravada_em: q && q.certeza !== 'chegada' ? new Date(q.ms).toISOString() : v.createdTime || null,
      duracao_min: dur, modulo_id: esc.modulo_id || null, ligada: 'auto' };
    const ins = await supa('/rest/v1/gravacoes', { metodo: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', corpo: linha });
    const nova = ins.ok && ins.dados && ins.dados[0];
    if (!nova) continue;
    res.novas += 1;
    if (nova.modulo_id) { res.ligadas += 1; conhecidas.set(v.id, nova); } else res.sem_modulo += 1;
  }
  // libera o link de tudo o que está ligado a um módulo e ainda não foi liberado
  const pend = await supa('/rest/v1/gravacoes?drive_id=not.is.null&modulo_id=not.is.null&ignorada=eq.false&compartilhada=eq.false&select=id,drive_id');
  for (const x of pend.dados || []) {
    const l = await liberarNoDrive(g.token, x.drive_id, true);
    await supa(`/rest/v1/gravacoes?id=eq.${x.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: l.ok ? { compartilhada: true, aviso: null } : { aviso: l.aviso } });
    if (l.ok) res.liberadas += 1; else if (!res.avisos.includes(l.aviso)) res.avisos.push(l.aviso);
  }
  await gravarConfigGravacoes({ ultima_leitura: new Date().toISOString(), resultado: res });
  return res;
}
