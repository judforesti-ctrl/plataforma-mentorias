// Mentorei Ao Vivo · transforma a apresentação do mentor (PowerPoint .pptx/.ppt/.ppsx ou OpenOffice .odp) em PDF, para os
// slides aparecerem no telão e no celular sem o mentor precisar salvar como PDF (pedido da Juliana, 15/11/2026: "não quero
// deixar nada para depender do mentor"). Quem chama é o editor do Ao Vivo (mentorei-aovivo.netlify.app/api/converter-slides,
// repassado para cá): o arquivo já está na pasta pública aovivo-slides e a linha em aovivo_conversoes (aovivo_pedir_conversao).
// Como converte: manda o arquivo para o Google Drive da conta Google conectada no Painel (contato@, escopo drive.file: só mexe
// no que a própria plataforma cria), o Google transforma em Apresentações Google, a plataforma baixa em PDF e apaga o arquivo
// temporário do Drive. O PDF vai para a mesma pasta da aula e a tela do Ao Vivo segue com ele (aovivo_ver_conversao).
import { supa, env, SUPABASE_URL, acessoGoogle } from '../lib/google.mjs';

export const config = { path: '/api/converter-slides', background: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPO = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  ppt: 'application/vnd.ms-powerpoint',
  pps: 'application/vnd.ms-powerpoint',
  odp: 'application/vnd.oasis.opendocument.presentation',
};
const DRIVE = 'https://www.googleapis.com/drive/v3/files';

// a frase para o mentor, conforme o motivo que o Google deu (o texto técnico fica em aovivo_conversoes.detalhe)
function motivoGoogle(status, texto) {
  let razao = '';
  try {
    const e = JSON.parse(texto).error || {};
    razao = [e.status, ...(e.errors || []).map((x) => x.reason), ...(e.details || []).map((x) => x.reason)].filter(Boolean).join(' ');
  } catch (_) { /* sem JSON */ }
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(razao)) return 'A ligação da plataforma com o Google Drive ainda não foi liberada (um ajuste único da administração). Por enquanto, envie a apresentação em PDF.';
  if (/storageQuotaExceeded/i.test(razao)) return 'O Google Drive da Mentorei está cheio. Libere espaço ou envie a apresentação em PDF.';
  if (status === 401 || /insufficient|PERMISSION/i.test(razao)) return 'A conta Google da Mentorei precisa ser conectada de novo no Painel. Por enquanto, envie a apresentação em PDF.';
  return `O Google recusou o arquivo (${status}). Tente de novo ou envie a apresentação em PDF.`;
}

export default async (req) => {
  let b; try { b = JSON.parse(await req.text()); } catch (_) { return; }
  const id = String(b.id || ''), sessao = String(b.sessao || ''), chave = String(b.chave || '');
  if (!UUID.test(id) || !UUID.test(sessao) || !/^[0-9a-f]{64}$/i.test(chave) || !env('SUPABASE_SECRET_KEY')) return;

  // a chave da aula prova que quem pede é quem monta a aula
  const [ck, cq] = await Promise.all([
    supa(`/rest/v1/aovivo_chaves?sessao_id=eq.${sessao}&chave=eq.${chave}&select=sessao_id`),
    supa(`/rest/v1/aovivo_conversoes?id=eq.${id}&sessao_id=eq.${sessao}&select=status,origem`),
  ]);
  const conv = cq.ok && cq.dados && cq.dados[0];
  if (!ck.ok || !ck.dados || !ck.dados.length || !conv || conv.status !== 'convertendo') return;
  const marcar = (corpo) => supa(`/rest/v1/aovivo_conversoes?id=eq.${id}`, { metodo: 'PATCH', corpo });
  const falhar = (erro, detalhe) => marcar({ status: 'erro', erro, detalhe: detalhe ? String(detalhe).slice(0, 1000) : null });

  const origem = String(conv.origem || '');
  const ext = (origem.match(/\.([a-z0-9]+)$/i) || [])[1];
  if (!origem.startsWith(`${sessao}/`) || !TIPO[(ext || '').toLowerCase()]) return falhar('Esse tipo de arquivo não dá para transformar em slides.');

  const arq = await fetch(`${SUPABASE_URL}/storage/v1/object/public/aovivo-slides/${origem}`).catch(() => null);
  if (!arq || !arq.ok) return falhar('Não consegui ler o arquivo enviado. Envie de novo.');
  const bytes = Buffer.from(await arq.arrayBuffer());

  const g = await acessoGoogle();
  if (!g || !g.token) return falhar((g && g.erro) || 'A conta Google da Mentorei não está conectada na plataforma (Painel → Google Agenda). Conecte de novo ou envie a apresentação em PDF.');
  const auth = { Authorization: `Bearer ${g.token}` };

  let driveId = null;
  try {
    // 1) envia para o Drive pedindo para virar Apresentações Google (envio "retomável": vale para arquivos grandes)
    const ini = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': TIPO[ext.toLowerCase()], 'X-Upload-Content-Length': String(bytes.length) },
      body: JSON.stringify({ name: `Mentorei Ao Vivo · conversão temporária ${id}`, mimeType: 'application/vnd.google-apps.presentation' }),
    });
    const local = ini.ok && ini.headers.get('location');
    if (!local) {
      const t = await ini.text().catch(() => '');
      return falhar(motivoGoogle(ini.status, t), `${ini.status} ${t}`);
    }
    const up = await fetch(local, { method: 'PUT', headers: { 'Content-Type': TIPO[ext.toLowerCase()] }, body: bytes });
    const ud = await up.json().catch(() => ({}));
    if (!up.ok || !ud.id) return falhar(`O Google não conseguiu abrir a apresentação (${up.status}). Confira se o arquivo abre no PowerPoint e envie de novo.`, `${up.status} ${JSON.stringify(ud).slice(0, 600)}`);
    driveId = ud.id;

    // 2) baixa em PDF (o caminho direto tem limite de 10 MB; acima disso, o link de exportação do próprio Google)
    let pdf = null;
    const ex = await fetch(`${DRIVE}/${driveId}/export?mimeType=application/pdf`, { headers: auth });
    if (ex.ok) pdf = Buffer.from(await ex.arrayBuffer());
    else {
      const meta = await fetch(`${DRIVE}/${driveId}?fields=exportLinks`, { headers: auth }).then((r) => r.json()).catch(() => ({}));
      const link = meta.exportLinks && meta.exportLinks['application/pdf'];
      if (link) {
        const ex2 = await fetch(link, { headers: auth });
        if (ex2.ok) pdf = Buffer.from(await ex2.arrayBuffer());
      }
    }
    if (!pdf || pdf.length < 100 || pdf.slice(0, 4).toString() !== '%PDF') return falhar('O Google não devolveu o PDF da apresentação. Tente de novo ou envie em PDF.');

    // 3) guarda o PDF ao lado do original, na pasta da aula
    const destino = origem.replace(/\/[^/]+$/, '/slides.pdf');
    const chaveSb = env('SUPABASE_SECRET_KEY');
    const sv = await fetch(`${SUPABASE_URL}/storage/v1/object/aovivo-slides/${destino}`, {
      method: 'POST', headers: { apikey: chaveSb, Authorization: `Bearer ${chaveSb}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true', 'cache-control': '31536000' }, body: pdf,
    });
    if (!sv.ok) return falhar(`Não consegui guardar o PDF (${sv.status}). Tente de novo.`);
    await marcar({ status: 'pronto', pdf: destino, erro: null });
  } catch (e) {
    await falhar('Não foi possível converter agora. Tente de novo ou envie a apresentação em PDF.', e && e.message);
  } finally {
    // o arquivo temporário sai do Drive (a plataforma só mexe no que ela mesma criou)
    if (driveId) await fetch(`${DRIVE}/${driveId}`, { method: 'DELETE', headers: auth }).catch(() => null);
  }
};
