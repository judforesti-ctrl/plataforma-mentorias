// Tutoriais em vídeo (script 63, 31/10/2026): séries por público, quem vê qual série e o link público dos vídeos de boas-vindas
// (o convidado assiste antes de criar a senha). Usado pela tela Tutoriais, pelo convite (telas e /api/convidar) e por tutorial.html.

export const SERIES = {
  mentor: { nome: 'Mentor', titulo: 'Comece por aqui · Mentor', convite: 'Vídeos de boas-vindas para o mentor' },
  aluno: { nome: 'Aluno das trilhas', titulo: 'Comece por aqui · Aluno', convite: 'Vídeos de boas-vindas para o aluno' },
  mentorado: { nome: 'Mentorado', titulo: 'Comece por aqui · Mentorado', convite: 'Vídeos de boas-vindas para o mentorado' },
  rh: { nome: 'RH da empresa', titulo: 'Comece por aqui · RH da empresa', convite: 'Vídeos de boas-vindas para o RH' },
  admin: { nome: 'Administração', titulo: 'Administração da plataforma', convite: 'Vídeos para a administração' },
};
export const ORDEM_SERIES = ['mentor', 'aluno', 'mentorado', 'rh', 'admin'];

// a série de boas-vindas de quem recebe o convite (sócia que também é mentora vê a do mentor)
export function serieDoPapel(papel, tambemMentor = false) {
  if (papel === 'admin') return tambemMentor ? 'mentor' : 'admin';
  return SERIES[papel] ? papel : null;
}

// as séries que cada pessoa vê na tela Tutoriais (a administração vê todas)
export function seriesDe({ papel, tambem_mentor: tambemMentor, temTrilha = false, ehAdmin = false }) {
  if (ehAdmin) return ORDEM_SERIES.slice();
  const s = [];
  if (papel === 'mentor' || tambemMentor) s.push('mentor');
  if (papel === 'aluno' || temTrilha) s.push('aluno');
  if (papel === 'mentorado') s.push('mentorado');
  if (papel === 'rh') s.push('rh');
  return s;
}

export const linkPublico = (site, serie) => `${site}/tutorial.html?s=${encodeURIComponent(serie)}`;

// "1min49" / "38 s"
export function duracaoTexto(seg) {
  const s = Math.round(Number(seg) || 0);
  if (!s) return '';
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}`;
}

// arquivo enviado pela administração: "Tutorial do mentor 3 - Mentoria em grupo.mp4" → { serie: 'mentor', numero: 3 }
export function serieDoArquivo(nome) {
  const m = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').match(/tutorial\s+d[oae]s?\s+(mentorado|mentor|aluno|rh|administracao|admin)\D*(\d+)/i);
  if (!m) return null;
  const serie = m[1].toLowerCase().startsWith('admin') ? 'admin' : m[1].toLowerCase();
  return { serie, numero: Number(m[2]) };
}
