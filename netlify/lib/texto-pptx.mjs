// Texto de um PowerPoint (.pptx) no servidor, slide por slide, na ordem da apresentação (a mesma leitura que a tela faz
// com lerTextoPptx em importar-proposta.js, sem DOMParser): cada parágrafo <a:p> vira uma linha com os <a:t> juntos.
import JSZip from 'jszip';

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desfazer = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTIDADES[e.toLowerCase()] || '';
});

export function linhasDoSlide(xml) {
  const linhas = [];
  for (const p of String(xml || '').match(/<a:p[\s>][\s\S]*?<\/a:p>/g) || []) {
    const t = (p.match(/<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>/g) || []).map((x) => desfazer(x.replace(/^<a:t(?:\s[^>]*)?>|<\/a:t>$/g, ''))).join('');
    if (t.trim()) linhas.push(t);
  }
  return linhas;
}

export async function textoDoPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const ler = async (n) => (zip.file(n) ? zip.file(n).async('string') : '');
  let slides = [];
  const pres = await ler('ppt/presentation.xml'), rels = await ler('ppt/_rels/presentation.xml.rels');
  if (pres && rels) {
    const alvo = {};
    for (const r of rels.match(/<Relationship\s[^>]*>/g) || []) {
      const id = (r.match(/\sId="([^"]+)"/) || [])[1], t = (r.match(/\sTarget="([^"]+)"/) || [])[1];
      if (id && t) alvo[id] = t;
    }
    slides = (pres.match(/<p:sldId\s[^>]*>/g) || []).map((x) => (x.match(/\sr:id="([^"]+)"/) || [])[1])
      .map((id) => `ppt/${String(alvo[id] || '').replace(/^\/?ppt\//, '')}`).filter((n) => zip.file(n));
  }
  if (!slides.length) {
    slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  }
  const partes = [];
  for (const [i, nome] of slides.entries()) partes.push(`--- slide ${i + 1} ---\n${linhasDoSlide(await ler(nome)).join('\n')}`);
  return partes.join('\n\n');
}
