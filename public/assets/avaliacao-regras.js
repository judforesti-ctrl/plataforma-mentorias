// Avaliação das turmas: textos e contas usados pela página do aluno (avaliar.html), pelo módulo, por Gestão › Avaliações
// e pelo e-mail que o mentor recebe 24 horas depois (netlify/functions/avaliacoes-email.mjs). Sem dependências.

export const SITE_AVALIACAO = 'https://plataforma.mentorei.com.br';
export const linkAvaliacao = (moduloId) => `${SITE_AVALIACAO}/avaliar.html?m=${moduloId}`;

export const CARAS = ['😞', '🙁', '😐', '🙂', '😍'];
export const POSITIVOS = ['Exemplos práticos', 'Dinâmicas', 'Mentor(a) perto da turma', 'Ferramentas prontas para usar', 'Troca com os colegas'];
export const MELHORAR = ['Mais tempo para praticar', 'Menos teoria', 'Exemplos do meu dia a dia', 'Material antes da aula'];
export const TEMAS = ['Gestão do tempo', 'Feedback', 'Conversas difíceis', 'Delegação', 'Comunicação', 'Inteligência emocional',
  'Gestão de conflitos', 'Liderar a antiga equipe', 'Tomada de decisão', 'Gestão de mudanças'];
export const APRENDEU = { quase_nada: 'Quase nada', um_pouco: 'Um pouco', bastante: 'Bastante', muito: 'Muito' };
export const TEMPO = { curto: 'Curto', na_medida: 'Na medida', longo: 'Longo' };
export const PARTES = { aula: 'Aula', conteudo: 'Conteúdo', ferramentas: 'Ferramentas e materiais' };

// Quando a avaliação aceita respostas (decisão da Juliana, 12/10): abre 24 horas antes do início do módulo e fica aberta
// até o fim do 10º dia depois da data do treinamento (23h59, horário de Brasília). Módulo sem data fica sempre aberto.
export const DURACAO_PADRAO_MIN = 180;
export const HORAS_ANTES = 24;
export const DIAS_ABERTA = 10;
export const HORAS_ATE_EMAIL = 24;
export function janelaAvaliacao(m, agora = Date.now()) {
  if (!m || !m.data_hora) return { estado: 'aberta', fim: null };
  const inicio = Date.parse(m.data_hora);
  const fim = inicio + (Number(m.duracao_min) || DURACAO_PADRAO_MIN) * 60000;
  const abre = inicio - HORAS_ANTES * 3600000;
  const diaFim = new Date(fim).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const fecha = Date.parse(`${diaFim}T23:59:59-03:00`) + DIAS_ABERTA * 86400000;
  if (agora < abre) return { estado: 'cedo', inicio, fim, abre, fecha };
  if (agora > fecha) return { estado: 'fechada', inicio, fim, abre, fecha };
  return { estado: 'aberta', inicio, fim, abre, fecha };
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const contar = (listas) => {
  const c = new Map();
  listas.forEach((l) => (l || []).forEach((x) => c.set(x, (c.get(x) || 0) + 1)));
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
};

// NPS oficial: % de quem deu 9 ou 10 menos % de quem deu 0 a 6 (vai de -100 a +100).
export function nps(notas) {
  const v = notas.filter((x) => x != null);
  if (!v.length) return null;
  const pro = v.filter((x) => x >= 9).length, det = v.filter((x) => x <= 6).length;
  return { valor: Math.round(((pro - det) / v.length) * 100), promotores: pro, neutros: v.length - pro - det, detratores: det, total: v.length,
    media: media(v) };
}

// Resumo de um conjunto de respostas. notasMentor: [{mentor_id, nota}] já juntas (a tela e o e-mail filtram quem pode ver).
export function resumir(respostas) {
  const num = (k) => respostas.map((r) => r[k]).filter((x) => x != null);
  const satisfeitos = (k) => { const v = num(k); return v.length ? Math.round((v.filter((x) => x >= 4).length / v.length) * 100) : null; };
  const porMentor = new Map();
  respostas.forEach((r) => (r.notas || []).forEach((n) => {
    if (!porMentor.has(n.mentor_id)) porMentor.set(n.mentor_id, []);
    porMentor.get(n.mentor_id).push(n.nota);
  }));
  const contagem = (k, rotulos) => Object.keys(rotulos).map((x) => [x, respostas.filter((r) => r[k] === x).length]);
  return {
    total: respostas.length,
    geral: media(num('geral')),
    aula: media(num('aula')), conteudo: media(num('conteudo')), ferramentas: media(num('ferramentas')),
    satisfeitos: { aula: satisfeitos('aula'), conteudo: satisfeitos('conteudo'), ferramentas: satisfeitos('ferramentas') },
    mentores: [...porMentor.entries()].map(([id, v]) => ({ id, media: media(v), total: v.length,
      satisfeitos: Math.round((v.filter((x) => x >= 4).length / v.length) * 100) })),
    nps: nps(num('nps')),
    aprendeu: contagem('aprendeu', APRENDEU),
    tempo: contagem('tempo', TEMPO),
    marcas: contar(respostas.map((r) => r.marcas)),
    temas: contar(respostas.map((r) => r.temas)),
    comentarios: respostas.filter((r) => String(r.comentario || '').trim()),
  };
}

// 4,7 / 9,4 (vírgula, uma casa)
export const num1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ','));
