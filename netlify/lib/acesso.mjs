// Link de acesso que NÃO expira com o tempo (pedido da Juliana, 12/10/2026: quem não entrava na hora recebia "link expirado").
// O código do Supabase vence em poucas horas; por isso o link do convite leva um código NOSSO, assinado com a chave secreta.
// Quando a pessoa abre, o servidor gera na hora um código do Supabase e a página já usa (vale segundos, nunca vence na mão dela).
// Convite ('c'): vale até a pessoa criar a senha. Esqueci a senha ('s'): vale 7 dias ou até criar a senha.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { enviarEmail, modeloEmail } from './email.mjs';

const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || '';
const segredo = () => `mentorei-acesso:${(env('CONVITE_SEGREDO') || env('SUPABASE_SECRET_KEY')).trim()}`;
const b64 = (x) => Buffer.from(x).toString('base64url');
const assinatura = (dados) => createHmac('sha256', segredo()).update(dados).digest('base64url').slice(0, 32);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE = { c: null, s: 7 * 24 * 3600 };

export function codigoDeAcesso(uid, tipo = 'c') {
  const dados = b64(`${uid}.${tipo}.${Math.floor(Date.now() / 1000)}`);
  return `${dados}.${assinatura(dados)}`;
}

export const linkDeAcesso = (origem, uid, tipo = 'c') => `${String(origem).replace(/\/$/, '')}/definir-senha.html?c=${codigoDeAcesso(uid, tipo)}`;

// Devolve { uid, tipo, emitido } (segundos) ou null se o código foi mexido, é desconhecido ou passou da validade.
export function lerCodigo(codigo) {
  const [dados, sig] = String(codigo || '').split('.');
  if (!dados || !sig) return null;
  const a = Buffer.from(assinatura(dados)), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [uid, tipo, emitido] = Buffer.from(dados, 'base64url').toString().split('.');
  if (!UUID.test(uid || '') || !(tipo in VALIDADE) || !/^\d+$/.test(emitido || '')) return null;
  const limite = VALIDADE[tipo];
  if (limite && Date.now() / 1000 - Number(emitido) > limite) return { uid, tipo, emitido: Number(emitido), vencido: true };
  return { uid, tipo, emitido: Number(emitido) };
}

// E-mail com o link (pelo Brevo, com a identidade da Mentorei). Devolve { enviado, mensagem }.
// trilha = { nome, empresa, logo }: convite de aluno de turma (o texto fala da trilha, não de sessões individuais).
// rh = { empresa, logo }: convite do RH da empresa cliente (script 49: painel com os números da empresa).
export function enviarLinkPorEmail({ email, nome, link, tipo = 'c', trilha = null, rh = null }) {
  const primeiro = String(nome || '').trim().split(' ')[0];
  const copiar = { p: `Se o botão não abrir, copie este endereço no navegador:\n${link}` };
  const m = tipo === 'c'
    ? modeloEmail({
      assunto: 'Seu acesso à plataforma de mentorias da Mentorei',
      titulo: `Olá${primeiro ? `, ${primeiro}` : ''}! Seu acesso está pronto`,
      blocos: [
        { p: rh
          ? `Você foi convidado(a) para acompanhar, na plataforma da Mentorei, os programas${rh.empresa ? ` da ${rh.empresa}` : ''}: trilhas e mentorias, presença, conclusão e a avaliação dos encontros.`
          : trilha
          ? `Você foi convidado(a) para a área dos alunos da trilha ${trilha.nome}${trilha.empresa ? ` (${trilha.empresa})` : ''} na plataforma da Mentorei. Lá ficam os módulos com as datas, o link para entrar nas aulas online, os slides, as tarefas e as gravações das aulas.`
          : 'Você foi convidado(a) para a plataforma de mentorias da Mentorei. Lá ficam o seu programa, as datas das sessões, os resumos, as tarefas e as ferramentas.' },
        { p: 'Para entrar, crie a sua senha:' },
        { botao: { texto: 'Criar minha senha', link } },
        { nota: `Este link não expira: pode usar quando puder. Ele vale até você criar a sua senha. Depois, é só entrar em plataforma.mentorei.com.br com este e-mail (${email}) e a sua senha.` },
        copiar,
        { p: 'Qualquer dúvida, é só responder este e-mail.\nEquipe Mentorei' },
      ],
      rodape: 'Mentorei · mentorei.com.br · Você recebeu este e-mail porque a Mentorei cadastrou você em um programa de mentoria. Se não esperava este convite, pode ignorar.',
      ...(trilha && trilha.logo ? { logo: { url: trilha.logo, alt: trilha.empresa || '' } } : rh && rh.logo ? { logo: { url: rh.logo, alt: rh.empresa || '' } } : {}),
    })
    : modeloEmail({
      assunto: 'Crie uma nova senha · Mentorei',
      titulo: 'Crie uma nova senha',
      blocos: [
        { p: `${primeiro ? `Olá, ${primeiro}! ` : ''}Recebemos um pedido para criar uma nova senha na plataforma de mentorias da Mentorei.` },
        { botao: { texto: 'Criar nova senha', link } },
        { nota: 'O link vale por 7 dias (até você criar a senha). Se você não pediu, pode ignorar este e-mail: nada muda.' },
        copiar,
      ],
    });
  return enviarEmail({ para: [{ email, ...(nome ? { name: nome } : {}) }], assunto: m.assunto, html: m.html, texto: m.texto });
}

// A pessoa já criou a senha depois que este link foi gerado? (marcado pelo servidor ao salvar a senha)
export function senhaCriadaDepois(usuario, emitido) {
  const quando = (usuario.app_metadata && usuario.app_metadata.senha_criada_em) || (usuario.user_metadata && usuario.user_metadata.senha_criada_em);
  return !!quando && Date.parse(quando) / 1000 >= emitido;
}
