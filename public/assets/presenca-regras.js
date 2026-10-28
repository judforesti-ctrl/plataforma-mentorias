// Presença dos alunos (script 49): regras puras, usadas pela tela do módulo (e testadas no Node).
// A lista de quem entrou na sala vem do Zoom (pela plataforma) ou de um arquivo (relatório de participantes do Zoom, lista de
// presença do Teams ou do Meet). Cada linha vira { nome, email, minutos }; quem entrou e saiu várias vezes é somado.
// Depois cada participante é ligado a um aluno da turma: primeiro pelo e-mail, depois pelo nome.

// presença mínima: metade do encontro (sem duração cadastrada, conta 1 h de 2 h)
export const FREQUENCIA_MINIMA = 75;   // % de presença para concluir a trilha (painel do RH e Painel)
export const minimoMinutos = (duracaoMin) => Math.max(10, Math.round((Number(duracaoMin) || 120) / 2));

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
// "Maria Souza (ela/dela) - Sicredi" → "maria souza"
export function normalizarNome(nome) {
  return semAcento(nome).toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s[-|–·]\s.*$/, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const PEQUENAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const partes = (nome) => normalizarNome(nome).split(' ').filter((p) => p && !PEQUENAS.has(p));

// "1h 5m 30s", "1 h 05 min", "01:05:30", "65", "65,5" → minutos
export function lerMinutos(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  const t = String(v).trim().toLowerCase();
  const hms = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]) + Math.round(Number(hms[3] || 0) / 60);
  if (/[hms]/.test(t)) {
    const h = Number((t.match(/(\d+)\s*h/) || [])[1] || 0), m = Number((t.match(/(\d+)\s*m/) || [])[1] || 0), s = Number((t.match(/(\d+)\s*s/) || [])[1] || 0);
    return h * 60 + m + Math.round(s / 60);
  }
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Junta as entradas da mesma pessoa (pelo e-mail ou, sem e-mail, pelo nome).
export function juntarParticipantes(linhas) {
  const mapa = new Map();
  for (const l of linhas || []) {
    const email = String(l.email || '').trim().toLowerCase();
    const nome = String(l.nome || '').trim();
    if (!nome && !email) continue;
    const chave = email || `n:${normalizarNome(nome)}`;
    const atual = mapa.get(chave) || { nome, email, minutos: null };
    if (l.minutos != null && l.minutos !== '') atual.minutos = (atual.minutos || 0) + (Number(l.minutos) || 0);
    if (!atual.nome && nome) atual.nome = nome;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].map((p) => ({ ...p, minutos: p.minutos == null ? null : Math.round(p.minutos) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Lê a planilha do arquivo (linhas = matriz de células). Acha o cabeçalho nas 20 primeiras linhas.
// Relatório do Zoom: "Nome (nome original)", "E-mail do usuário", "Duração (minutos)"; em inglês "Name (Original Name)", "User Email",
// "Duration (Minutes)". Teams: "Nome completo", "Email", "Duração" ("1h 2m 3s"). Meet: "Nome", "E-mail", "Duração".
export function lerArquivoPresenca(linhas) {
  const sem = (x) => semAcento(x).toLowerCase().trim();
  for (let i = 0; i < Math.min((linhas || []).length, 20); i += 1) {
    const cab = (linhas[i] || []).map(sem);
    const nome = cab.findIndex((c) => /^(nome|name|participante|full name|nome completo)/.test(c) && !/sobrenome|last/.test(c));
    if (nome < 0) continue;
    const email = cab.findIndex((c) => /e-?mail/.test(c));
    const duracao = cab.findIndex((c) => /dura/.test(c) || /tempo na reuniao|time in meeting|minutos|minutes/.test(c));
    if (email < 0 && duracao < 0) continue;
    const out = [];
    for (const l of linhas.slice(i + 1)) {
      const n = String((l || [])[nome] == null ? '' : l[nome]).trim();
      if (!n || sem(n) === cab[nome]) continue;   // linha vazia ou cabeçalho repetido (o Teams repete blocos)
      out.push({ nome: n, email: email >= 0 ? String(l[email] || '').trim() : '', minutos: duracao >= 0 ? lerMinutos(l[duracao]) : null });
    }
    return juntarParticipantes(out);
  }
  return [];
}

// Liga participantes a alunos. Devolve { porAluno: Map(alunoId → participante), soltos: [participantes sem aluno] }.
export function casarParticipantes(participantes, alunos) {
  const porAluno = new Map();
  const livres = new Set(alunos.map((a) => a.id));
  const soltos = [];
  const porEmail = new Map(alunos.filter((a) => a.email).map((a) => [String(a.email).toLowerCase(), a]));
  const restam = [];
  // 1) e-mail igual
  for (const p of participantes) {
    const a = p.email && porEmail.get(p.email.toLowerCase());
    if (a && livres.has(a.id)) { porAluno.set(a.id, p); livres.delete(a.id); } else restam.push(p);
  }
  // 2) nome: igual; senão primeiro + último nome; senão primeiro nome + outra parte (só se for um aluno só)
  const tentar = (p, teste) => {
    const achados = alunos.filter((a) => livres.has(a.id) && teste(partes(a.nome), partes(p.nome)));
    return achados.length === 1 ? achados[0] : null;
  };
  for (const p of restam) {
    const pp = partes(p.nome);
    if (!pp.length) { soltos.push(p); continue; }
    // "p" vale como inicial de um sobrenome ("Carlos P." = Carlos Pereira)
    const bate = (x, y) => x === y || (x.length === 1 && y.startsWith(x));
    const a = tentar(p, (an) => an.join(' ') === pp.join(' '))
      || tentar(p, (an) => an.length > 1 && pp.length > 1 && an[0] === pp[0] && an[an.length - 1] === pp[pp.length - 1])
      || tentar(p, (an) => an[0] === pp[0] && pp.length > 1 && pp.slice(1).some((x) => an.slice(1).some((y) => bate(x, y))))
      || (pp.length === 1 ? tentar(p, (an) => an[0] === pp[0]) : null)
      // apelido curto, só com o começo do primeiro nome ("Fer" = Fernanda), se for um aluno só
      || (pp.length === 1 && pp[0].length >= 3 ? tentar(p, (an) => an[0].startsWith(pp[0])) : null);
    if (a) { porAluno.set(a.id, p); livres.delete(a.id); } else soltos.push(p);
  }
  return { porAluno, soltos };
}

// Frequência de cada aluno: { [alunoId]: { presencas, faltas, pct } } (conta só os encontros com chamada feita).
export function frequencia(presencas) {
  const out = {};
  for (const p of presencas || []) {
    const f = out[p.turma_aluno_id] || (out[p.turma_aluno_id] = { presencas: 0, faltas: 0, pct: null });
    if (p.presente) f.presencas += 1; else f.faltas += 1;
  }
  for (const f of Object.values(out)) f.pct = f.presencas + f.faltas ? Math.round((f.presencas / (f.presencas + f.faltas)) * 100) : null;
  return out;
}
