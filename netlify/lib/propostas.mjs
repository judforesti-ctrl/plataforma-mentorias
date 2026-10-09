// Peças comuns das propostas geradas: montar o PowerPoint a partir do conteúdo e guardar na pasta privada "propostas"
// do Storage; ler o arquivo de volta (para anexar no e-mail). Usa a chave secreta: só depois de conferir quem pede.
import { supa, env, SUPABASE_URL } from './google.mjs';
import { montarProposta } from './proposta-pptx.mjs';

export const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const nomeArquivo = (empresa, versao) => `Proposta-Mentorei-${semAcento(empresa).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Cliente'}-v${versao || 1}.pptx`;

// O que a tela escolhe e a IA não escreve (fica dentro de propostas.conteudo junto com o texto da IA).
export const OPCOES_DA_TELA = ['modelo', 'precos', 'pagamento', 'validade_dias', 'logo'];
export function separarOpcoes(c) {
  const opcoes = {}, texto = {};
  for (const [k, v] of Object.entries(c && typeof c === 'object' ? c : {})) (OPCOES_DA_TELA.includes(k) ? opcoes : texto)[k] = v;
  return { opcoes, texto };
}
// Já tem o texto escrito pela IA (e não só as escolhas da tela)?
export const temTexto = (c) => !!(c && c.capa && (c.modulos || c.demanda));

// Lê a proposta com a oportunidade, a empresa e o contato principal.
export async function lerProposta(id) {
  const r = await supa(`/rest/v1/propostas?id=eq.${id}&select=*,oportunidade:oportunidades(*,empresa:empresas(*),contato:contatos(*),responsavel:perfis!oportunidades_responsavel_id_fkey(id,nome,email))`);
  return r.ok && Array.isArray(r.dados) && r.dados[0] ? r.dados[0] : null;
}

// Logo do cliente: a tela guarda um PNG na pasta pública "fotos" (logos/<empresa>/...) e o caminho em conteudo.logo.
async function baixarLogo(logo) {
  const caminho = logo && typeof logo === 'object' ? logo.caminho : null;
  if (!caminho || !/^logos\/[\w-]+\/[\w.-]+\.png$/.test(caminho)) return null;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/fotos/${caminho}`).catch(() => null);
  if (!r || !r.ok) return null;
  return { dados: Buffer.from(await r.arrayBuffer()) };
}

// Monta o .pptx do conteúdo salvo e guarda em "propostas/<oportunidade>/<proposta>/<arquivo>". Devolve os avisos de tamanho.
export async function montarEGuardar(p) {
  if (!p || !temTexto(p.conteudo)) throw new Error('A proposta ainda não tem conteúdo.');
  const logo = await baixarLogo(p.conteudo.logo);
  const { buffer, avisos } = await montarProposta(p.conteudo, { logo });
  if (p.conteudo.logo && !logo) avisos.unshift('Não consegui baixar o logo do cliente: a capa saiu sem ele. Envie o logo de novo.');
  const empresa = p.oportunidade && p.oportunidade.empresa ? p.oportunidade.empresa.nome : '';
  const nome = nomeArquivo(empresa, p.versao);
  const caminho = `${p.oportunidade_id}/${p.id}/${nome}`;
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/propostas/${caminho}`, {
    method: 'POST', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': PPTX, 'x-upsert': 'true' }, body: buffer,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(/bucket/i.test(t) && /not found/i.test(t) ? 'A pasta "propostas" não existe no Supabase: falta rodar o script 20.' : `O Supabase recusou o arquivo (${r.status}).`);
  }
  const g = await supa(`/rest/v1/propostas?id=eq.${p.id}`, { metodo: 'PATCH', corpo: { arquivo_storage: caminho, arquivo: nome, avisos } });
  if (!g.ok) throw new Error('Não consegui registrar o arquivo na proposta.');
  return { caminho, nome, avisos, tamanho: buffer.length };
}

// Baixa o arquivo guardado (Buffer) para anexar no e-mail.
export async function baixarArquivo(caminho) {
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/propostas/${caminho}`, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}
