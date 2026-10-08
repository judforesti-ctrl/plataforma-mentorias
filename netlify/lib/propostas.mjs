// Peças comuns das propostas geradas: montar o PowerPoint a partir do conteúdo e guardar na pasta privada "propostas"
// do Storage; ler o arquivo de volta (para anexar no e-mail). Usa a chave secreta: só depois de conferir quem pede.
import { supa, env, SUPABASE_URL } from './google.mjs';
import { montarProposta, conferirTamanhos } from './proposta-pptx.mjs';

export const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const nomeArquivo = (empresa, versao) => `Proposta-Mentorei-${semAcento(empresa).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Cliente'}-v${versao || 1}.pptx`;

// Lê a proposta com a oportunidade, a empresa e o contato principal.
export async function lerProposta(id) {
  const r = await supa(`/rest/v1/propostas?id=eq.${id}&select=*,oportunidade:oportunidades(*,empresa:empresas(*),contato:contatos(*),responsavel:perfis!oportunidades_responsavel_id_fkey(id,nome,email))`);
  return r.ok && Array.isArray(r.dados) && r.dados[0] ? r.dados[0] : null;
}

// Monta o .pptx do conteúdo salvo e guarda em "propostas/<oportunidade>/<proposta>/<arquivo>". Devolve os avisos de tamanho.
export async function montarEGuardar(p) {
  if (!p || !p.conteudo) throw new Error('A proposta ainda não tem conteúdo.');
  const buf = await montarProposta(p.conteudo);
  const empresa = p.oportunidade && p.oportunidade.empresa ? p.oportunidade.empresa.nome : '';
  const nome = nomeArquivo(empresa, p.versao);
  const caminho = `${p.oportunidade_id}/${p.id}/${nome}`;
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/propostas/${caminho}`, {
    method: 'POST', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': PPTX, 'x-upsert': 'true' }, body: buf,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(/bucket/i.test(t) && /not found/i.test(t) ? 'A pasta "propostas" não existe no Supabase: falta rodar o script 20.' : `O Supabase recusou o arquivo (${r.status}).`);
  }
  const avisos = conferirTamanhos(p.conteudo);
  const g = await supa(`/rest/v1/propostas?id=eq.${p.id}`, { metodo: 'PATCH', corpo: { arquivo_storage: caminho, arquivo: nome, avisos } });
  if (!g.ok) throw new Error('Não consegui registrar o arquivo na proposta.');
  return { caminho, nome, avisos, tamanho: buf.length };
}

// Baixa o arquivo guardado (Buffer) para anexar no e-mail.
export async function baixarArquivo(caminho) {
  const chave = env('SUPABASE_SECRET_KEY');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/propostas/${caminho}`, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}
