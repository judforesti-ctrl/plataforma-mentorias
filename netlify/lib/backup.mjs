// Cópias de segurança da plataforma: lê todas as tabelas (com a chave secreta), monta uma planilha Excel com uma aba por
// tabela, guarda no Google Drive da conta conectada (pasta "Backups da Plataforma Mentorei", cópias de até 6 meses)
// e, uma vez por mês, manda a planilha por e-mail para as sócias. O arquivo de restauração completo NÃO sai daqui:
// ele é feito no computador da Juliana por ferramentas/backup-restauracao.ps1.
import { createHmac } from 'node:crypto';
import * as XLSX from 'xlsx';
import { env, supa, acessoGoogle, SITE } from './google.mjs';
import { enviarEmail, modeloEmail, emailReal } from './email.mjs';

export const PASTA_DRIVE = 'Backups da Plataforma Mentorei';
export const DIAS_GUARDAR = 183;                                   // ~6 meses
export const chaveBackup = () => createHmac('sha256', env('SUPABASE_SECRET_KEY')).update('backup-fundo').digest('hex');

// Tabelas que entram na planilha (tudo o que a equipe usa). Ficam de fora: integracoes (chave do Google), agenda_links e
// google_eventos (chaves técnicas), acessos e historico (registros de uso, grandes e sem valor para ler).
export const TABELAS = [
  ['empresas', 'Empresas'], ['programas', 'Programas'], ['programa_temas', 'Temas dos programas'], ['mentorados', 'Mentorados'],
  ['mentor_mentorado', 'Mentor x mentorado'], ['sessoes', 'Sessões'], ['sessoes_interno', 'Sessões - interno'], ['avaliacoes_sessao', 'Avaliações'],
  ['testes', 'Testes e ferramentas online'], ['turmas', 'Turmas'], ['modulos', 'Aulas das turmas'], ['modulo_mentores', 'Mentores das aulas'],
  ['modulo_arquivos', 'Arquivos das aulas'], ['agenda_bloqueios', 'Agenda - bloqueios'], ['agenda_reservas', 'Agenda - pré-bloqueios'],
  ['agenda_reserva_datas', 'Pré-bloqueios - datas'], ['agenda_reserva_mentores', 'Pré-bloqueios - mentores'], ['agenda_reunioes', 'Agenda - reuniões'],
  ['perfis', 'Equipe e logins'], ['convites', 'Convites'], ['ferramentas', 'Arsenal'], ['arsenal_tags', 'Arsenal - temas'],
  ['ferramentas_enviadas', 'Ferramentas enviadas'], ['importacoes_proposta', 'Propostas importadas'], ['configuracoes', 'Configurações'],
];

// Lê uma tabela inteira, de 1000 em 1000 linhas (limite do Supabase por pedido).
export async function lerTabela(tabela) {
  const out = [];
  for (let offset = 0; offset < 200000; offset += 1000) {
    const r = await supa(`/rest/v1/${tabela}?select=*&limit=1000&offset=${offset}`);
    if (!r.ok) { if (r.status === 404) return null; throw new Error(`Falha ao ler ${tabela} (${r.status}).`); }   // 404 = script ainda não rodado
    out.push(...r.dados);
    if (r.dados.length < 1000) break;
  }
  return out;
}

const celula = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.every((x) => x == null || typeof x !== 'object') ? v.join('; ') : JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
};

// Planilha com uma aba por tabela (cabeçalho = nome das colunas) e uma aba "Leia-me".
export async function montarPlanilha() {
  const wb = XLSX.utils.book_new();
  const resumo = [];
  const quando = new Date();
  const leiaMe = [['Cópia de segurança da Plataforma de Mentorias Mentorei'], [`Gerada em ${quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`], [`Plataforma: ${SITE}`], [],
    ['Cada aba é uma tabela da plataforma, com todas as linhas e colunas. Datas e horários estão no horário universal (UTC, 3 horas à frente de Brasília) quando terminam em Z.'],
    ['Colunas com texto entre chaves { } ou colchetes [ ] guardam listas e detalhes (por exemplo, respostas de testes).'],
    ['Esta planilha é para consulta. A restauração completa da plataforma usa os arquivos feitos pelo computador da Juliana (ferramentas/backup-restauracao.ps1).'], [], ['Aba', 'Linhas']];
  const usados = new Set();
  for (const [tabela, titulo] of TABELAS) {
    const linhas = await lerTabela(tabela);
    if (linhas === null) continue;
    const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
    const aoa = [colunas, ...linhas.map((l) => colunas.map((c) => celula(l[c])))];
    const ws = XLSX.utils.aoa_to_sheet(aoa.length > 1 ? aoa : [[`(sem registros em ${tabela})`]]);
    ws['!cols'] = colunas.map((c) => ({ wch: Math.min(60, Math.max(12, c.length + 2)) }));
    let nome = titulo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    while (usados.has(nome)) nome = `${nome.slice(0, 29)}_2`;
    usados.add(nome);
    XLSX.utils.book_append_sheet(wb, ws, nome);
    resumo.push([titulo, linhas.length]);
  }
  leiaMe.push(...resumo);
  const wsLeia = XLSX.utils.aoa_to_sheet(leiaMe);
  wsLeia['!cols'] = [{ wch: 70 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsLeia, 'Leia-me');
  wb.SheetNames.unshift(wb.SheetNames.pop());                       // Leia-me primeiro
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  const dia = quando.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return { buffer, nome: `Mentorei-plataforma-backup-${dia}.xlsx`, resumo: Object.fromEntries(resumo), linhas: resumo.reduce((a, [, n]) => a + n, 0) };
}

// ---------- configuração e situação ----------
export async function lerConfigBackup() {
  const r = await supa('/rest/v1/configuracoes?chave=eq.backup&select=valor');
  return (r.ok && Array.isArray(r.dados) && r.dados[0] && r.dados[0].valor) || {};
}
export async function gravarConfigBackup(mudancas) {
  const atual = await lerConfigBackup();
  const valor = { ...atual, ...mudancas };
  await supa('/rest/v1/configuracoes', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', corpo: { chave: 'backup', valor, atualizado_em: new Date().toISOString() } });
  return valor;
}
// E-mails que recebem a planilha todo dia 1: os configurados ou, sem configuração, a administração.
export async function emailsBackup(cfg) {
  if (Array.isArray(cfg.emails) && cfg.emails.length) return cfg.emails;
  const r = await supa('/rest/v1/perfis?ativo=eq.true&papel=eq.admin&select=email');
  return ((r.ok && r.dados) || []).map((p) => p.email).filter(emailReal);
}

// ---------- Google Drive ----------
const drive = async (token, caminho, { metodo = 'GET', corpo, headers = {} } = {}) => {
  const r = await fetch(`https://www.googleapis.com${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${token}`, ...headers }, body: corpo });
  const t = await r.text();
  let dados = null; try { dados = t ? JSON.parse(t) : null; } catch (_) { dados = t; }
  return { ok: r.ok, status: r.status, dados };
};
export const temPermissaoDrive = (conta) => /drive\.file|\/auth\/drive\b/.test(String((conta && conta.scope) || ''));

async function pastaDrive(token, cfg) {
  if (cfg.pasta_id) {
    const g = await drive(token, `/drive/v3/files/${cfg.pasta_id}?fields=id,name,trashed,webViewLink`);
    if (g.ok && g.dados && !g.dados.trashed) return { id: g.dados.id, link: g.dados.webViewLink };
  }
  const q = encodeURIComponent(`name='${PASTA_DRIVE}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const l = await drive(token, `/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`);
  if (l.ok && l.dados && l.dados.files && l.dados.files[0]) return { id: l.dados.files[0].id, link: l.dados.files[0].webViewLink };
  const c = await drive(token, '/drive/v3/files?fields=id,webViewLink', { metodo: 'POST', headers: { 'Content-Type': 'application/json' },
    corpo: JSON.stringify({ name: PASTA_DRIVE, mimeType: 'application/vnd.google-apps.folder' }) });
  if (!c.ok) throw new Error(`O Google Drive não deixou criar a pasta (${c.status}).`);
  return { id: c.dados.id, link: c.dados.webViewLink };
}

async function enviarParaDrive(token, pasta, nome, buffer) {
  const limite = `mentorei${Date.now()}`;
  const meta = JSON.stringify({ name: nome, parents: [pasta.id], mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    buffer, Buffer.from(`\r\n--${limite}--`),
  ]);
  const r = await drive(token, '/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { metodo: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${limite}`, 'Content-Length': String(corpo.length) }, corpo });
  if (!r.ok) throw new Error(`O Google Drive recusou o arquivo (${r.status}).`);
  return r.dados;
}

// Apaga da pasta as cópias com mais de 6 meses (só as que a plataforma criou).
async function limparAntigos(token, pasta) {
  const limite = new Date(Date.now() - DIAS_GUARDAR * 86400e3).toISOString();
  const q = encodeURIComponent(`'${pasta.id}' in parents and trashed=false and createdTime < '${limite}'`);
  const l = await drive(token, `/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100`);
  let apagados = 0;
  for (const f of (l.ok && l.dados && l.dados.files) || []) {
    const d = await drive(token, `/drive/v3/files/${f.id}`, { metodo: 'DELETE' });
    if (d.ok) apagados += 1;
  }
  return apagados;
}

// ---------- a cópia em si ----------
// modo: 'semanal' (Drive), 'mensal' (Drive + e-mail para as sócias) ou 'manual' (Drive, pedido pelo botão).
export async function executarBackup(modo = 'semanal') {
  const inicio = Date.now();
  const cfg = await lerConfigBackup();
  const res = { em: new Date().toISOString(), modo, ok: false };
  try {
    const p = await montarPlanilha();
    res.arquivo = p.nome; res.linhas = p.linhas; res.tamanho = p.buffer.length; res.resumo = p.resumo;
    // Drive
    const acesso = await acessoGoogle();
    if (!acesso) res.drive = { erro: 'Google não conectado (Painel → Google Agenda).' };
    else if (acesso.erro) res.drive = { erro: acesso.erro };
    else {
      try {
        const pasta = await pastaDrive(acesso.token, cfg);
        const f = await enviarParaDrive(acesso.token, pasta, p.nome, p.buffer);
        const apagados = await limparAntigos(acesso.token, pasta);
        res.drive = { ok: true, link: f.webViewLink, apagados };
        cfg.pasta_id = pasta.id; cfg.pasta_link = pasta.link;
      } catch (e) {
        res.drive = { erro: /403/.test(String(e.message)) ? 'O Google não deu permissão de Drive: no Painel, clique em "Conectar Google Agenda" de novo e aceite a permissão de Drive.' : String(e.message) };
      }
    }
    // e-mail mensal para as sócias
    if (modo === 'mensal') {
      const para = await emailsBackup(cfg);
      const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
      const e = modeloEmail({ assunto: `Cópia de segurança da plataforma · ${mes}`, titulo: 'Cópia mensal da plataforma de mentorias', blocos: [
        { p: `Segue em anexo a cópia de segurança completa da Plataforma de Mentorias Mentorei (${p.linhas} registros em ${Object.keys(p.resumo).length} abas), gerada hoje.` },
        { p: 'Guarde o arquivo num lugar seguro: ele contém dados de mentorados e das sessões. A cópia semanal fica na pasta "Backups da Plataforma Mentorei" do Google Drive.' },
        ...(res.drive && res.drive.link ? [{ botao: { texto: 'Abrir a pasta no Drive', link: cfg.pasta_link || res.drive.link } }] : []),
        { nota: 'A planilha é para consulta. Em caso de perda, a restauração completa é feita pelos arquivos guardados no computador da Juliana (backup-restauracao).' },
      ] });
      const r = await enviarEmail({ para: para.map((email) => ({ email })), assunto: e.assunto, html: e.html, texto: e.texto, anexos: [{ name: p.nome, content: p.buffer.toString('base64') }] });
      res.email = r.enviado ? { ok: true, para } : { erro: r.mensagem, para };
    }
    res.ok = !!(res.drive && res.drive.ok) && (modo !== 'mensal' || (res.email && res.email.ok));
  } catch (e) {
    res.erro = String(e.message || e);
  }
  res.segundos = Math.round((Date.now() - inicio) / 1000);
  const chaveUltimo = modo === 'mensal' ? 'ultimo_mensal' : 'ultimo';
  await gravarConfigBackup({ pasta_id: cfg.pasta_id, pasta_link: cfg.pasta_link, [chaveUltimo]: res, ...(modo === 'mensal' ? { ultimo: res } : {}) });
  return res;
}
