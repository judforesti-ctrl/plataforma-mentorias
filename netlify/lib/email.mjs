// E-mails da plataforma pelo Brevo (e-mail transacional). A chave BREVO_API_KEY fica nas variáveis da Netlify.
// Sem a chave, nada quebra: a função devolve "não enviado" e os avisos continuam aparecendo dentro da plataforma.
import { env } from './google.mjs';

export const REMETENTE = { name: 'Mentorei', email: 'contato@mentorei.com.br' };
export const COORDENACAO = 'contato@mentorei.com.br';
export const temChaveEmail = () => !!env('BREVO_API_KEY');
// Quem foi cadastrado sem e-mail tem um endereço provisório (…@pendente.mentorei.com.br): nunca recebe nada.
export const emailReal = (e) => !!e && !/@pendente\.mentorei\.com\.br$/i.test(String(e));

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// anexos (opcional): [{ name, content }] com o conteúdo em base64.
export async function enviarEmail({ para, assunto, html, texto, anexos }) {
  const chave = env('BREVO_API_KEY');
  if (!chave) return { enviado: false, mensagem: 'falta a chave do Brevo na Netlify' };
  if (!para || !para.length) return { enviado: false, mensagem: 'ninguém para receber' };
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': chave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: REMETENTE, to: para, subject: assunto, htmlContent: html, textContent: texto, ...(anexos && anexos.length ? { attachment: anexos } : {}) }),
    });
    if (r.ok) return { enviado: true };
    const j = await r.json().catch(() => ({}));
    return { enviado: false, mensagem: r.status === 401 ? explicar401(chave, j) : `o Brevo recusou o envio (${j.message || r.status})` };
  } catch (_) {
    return { enviado: false, mensagem: 'sem conexão com o Brevo' };
  }
}

// O Brevo recusou: diz em português qual é o problema (sem nunca mostrar a chave).
function explicar401(chave, j) {
  if (/^xsmtpsib-/i.test(chave)) return 'a chave cadastrada na Netlify é a chave SMTP do Brevo; para enviar pela plataforma é preciso a chave de API (começa com xkeysib-)';
  if (/ip/i.test(String(j && j.message))) return 'o Brevo bloqueou o servidor da plataforma (proteção de IPs autorizados ligada)';
  return 'a chave do Brevo foi recusada (pode ter sido apagada, desativada ou copiada pela metade)';
}

// Diagnóstico para a tela: a chave existe, é do tipo certo e o Brevo aceita?
export async function diagnosticarEmail() {
  const chave = env('BREVO_API_KEY');
  if (!chave) return { estado: 'sem_chave' };
  if (/^xsmtpsib-/i.test(chave)) return { estado: 'chave_smtp' };
  try {
    const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': chave, Accept: 'application/json' } });
    if (r.ok) return { estado: 'ok' };
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { estado: /ip/i.test(String(j.message)) ? 'ip_bloqueado' : 'recusada', tipo: /^xkeysib-/i.test(chave) ? 'api' : 'desconhecido' };
    return { estado: `erro_${r.status}` };
  } catch (_) { return { estado: 'sem_conexao' }; }
}

// Modelo com a identidade da Mentorei. Blocos (texto puro, a função protege):
// { p }, { titulo }, { lista: [...] }, { botao: { texto, link } }, { nota }
export function modeloEmail({ assunto, titulo, blocos = [], rodape = 'Mensagem automática da plataforma de mentorias da Mentorei.' }) {
  const P = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2B3538">${esc(t).replace(/\n/g, '<br>')}</p>`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#F3F5F4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border-radius:16px;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#091216;border-radius:16px 16px 0 0;padding:20px 28px;color:#C8F04A;font-size:18px;font-weight:bold;letter-spacing:1px">MENTOREI</td></tr>
<tr><td style="padding:26px 28px 10px">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#091216">${esc(titulo || assunto)}</h1>
${blocos.map((b) => {
    if (b.p) return P(b.p);
    if (b.titulo) return `<h2 style="margin:18px 0 8px;font-size:16px;color:#091216">${esc(b.titulo)}</h2>`;
    if (b.lista) return `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#2B3538">${b.lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (b.botao) return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="background:#C8F04A;border-radius:999px">
<a href="${esc(b.botao.link)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:bold;color:#091216;text-decoration:none">${esc(b.botao.texto)}</a></td></tr></table>`;
    if (b.nota) return `<p style="margin:0 0 14px;padding:12px 14px;background:#F3F5F4;border-radius:10px;font-size:13px;line-height:1.55;color:#2B3538">${esc(b.nota)}</p>`;
    return '';
  }).join('\n')}
</td></tr>
<tr><td style="padding:0 28px 22px;font-size:12px;line-height:1.5;color:#7A8487">${esc(rodape)}</td></tr>
</table></td></tr></table></body></html>`;
  const texto = [titulo || assunto, '', ...blocos.map((b) => {
    if (b.p) return `${b.p}\n`;
    if (b.titulo) return `${b.titulo}`;
    if (b.lista) return `${b.lista.map((x) => `• ${x}`).join('\n')}\n`;
    if (b.botao) return `${b.botao.texto}: ${b.botao.link}\n`;
    if (b.nota) return `${b.nota}\n`;
    return '';
  }), rodape].join('\n');
  return { assunto, html, texto };
}
