// Funis de e-mail: regras puras usadas pela tela (prévia, temperatura) e pelo servidor (envio, regras automáticas).
// Sem DOM e sem banco: só texto e contas.

export const SITE = 'https://plataforma.mentorei.com.br';
export const MARCADOR_CONTINUAR = '[continuar lendo]';
// clique até 2 minutos depois do envio = antivírus da empresa abrindo os links sozinho (não conta como interesse)
export const SEGUNDOS_CLIQUE_AUTOMATICO = 120;
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const STATUS_MEMBRO = {
  ativo: ['Recebendo', 'selo ok'],
  pausado: ['Pausado', 'selo neutro'],
  concluido: ['Recebeu todos', 'selo'],
  removido: ['Tirado do funil', 'selo neutro'],
  passou: ['Passou para outro funil', 'selo escuro'],
  descadastrado: ['Pediu para sair', 'selo erro'],
  email_errado: ['E-mail errado', 'selo erro'],
};
export const EM_ANDAMENTO = ['ativo', 'pausado', 'concluido'];

// Temperatura pelo resumo da pessoa (view funil_membros_resumo).
// quente = clicou ou leu até o fim; morno = abriu; iphone = só abertura automática (não dá para saber se leu);
// frio = recebeu 3 ou mais e nenhum sinal; novo = ainda cedo para saber.
export const TEMPERATURAS = {
  quente: ['🔥 Quente', 'selo ok', 'Clicou ou leu até o fim'],
  morno: ['Morno', 'selo', 'Abriu, mas ainda não clicou'],
  iphone: ['Sem como saber', 'selo neutro', 'Só aberturas automáticas (iPhone ou antivírus abrem sozinhos): pode ter lido ou não'],
  frio: ['❄ Frio', 'selo alerta', 'Recebeu 3 ou mais e nenhum sinal'],
  novo: ['Aguardando', 'selo neutro', 'Recebeu menos de 3: ainda cedo para saber'],
};
export function temperaturaMembro(r) {
  if ((r.cliques || 0) > 0 || (r.leram || 0) > 0) return 'quente';
  if ((r.abertos || 0) > 0) return 'morno';
  if ((r.automaticos || 0) > 0) return 'iphone';
  if ((r.recebidos || 0) >= 3) return 'frio';
  return 'novo';
}
// A regra de passagem foi atingida?
export function atingiuPassagem(r, regra) {
  if (!regra || !regra.ligada || !regra.destino) return false;
  const n = Math.max(1, Number(regra.quantidade) || 1);
  if (regra.gatilho === 'leitura') return (r.leram || 0) >= n;
  if (regra.gatilho === 'abertura') return (r.abertos || 0) >= n || (r.cliques || 0) > 0 || (r.leram || 0) > 0;
  return (r.cliques || 0) >= n;
}
// A regra de limpeza pede para tirar?
export function atingiuLimpeza(r, regra) {
  if (!regra || !regra.ligada) return false;
  const n = Math.max(2, Number(regra.sem_sinal) || 3);
  return (r.sem_sinal_seguidos || 0) >= n;
}

export const EMAIL_VALIDO = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[a-z]{2,}$/i;
export const limparEmail = (e) => String(e || '').trim().toLowerCase().replace(/^mailto:/, '');

// ---------- montagem do e-mail ----------
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const primeiroNome = (n) => {
  const p = String(n || '').trim().split(/\s+/)[0] || '';
  return /^[\p{L}'-]+$/u.test(p) && p.length > 1 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};
// {nome} e {empresa}; sem nome, "Olá, {nome}!" vira "Olá!"
export function personalizar(texto, pessoa = {}) {
  const nome = primeiroNome(pessoa.nome);
  let t = String(texto || '');
  if (!nome) t = t.replace(/,\s*\{nome\}/g, '').replace(/\{nome\},?\s*/g, '');
  return t.replace(/\{nome\}/g, nome).replace(/\{empresa\}/g, pessoa.empresa || 'sua empresa');
}

const COR = { petroleo: '#091216', bege: '#C8AE7C', begeEscuro: '#9C7D4C', texto: '#2B3538', apagado: '#7A8487', fundo: '#EFE8DA' };
const P_ESTILO = `margin:0 0 16px;font-size:16px;line-height:1.65;color:${COR.texto}`;

// texto com **negrito**, [texto](link) e endereços soltos viram links (o texto já protegido)
function enfeitar(linha) {
  let t = esc(linha);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, txt, url) => `<a href="${url}" style="color:${COR.begeEscuro};font-weight:bold">${txt}</a>`);
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, a, url) => `${a}<a href="${url}" style="color:${COR.begeEscuro}">${url}</a>`);
  return t;
}
const semEnfeite = (linha) => String(linha).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');

// Corpo em blocos: parágrafos separados por linha em branco; "## " = subtítulo; linhas com "- " = lista.
export function blocosDoCorpo(corpo) {
  return String(corpo || '').replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (b.toLowerCase() === MARCADOR_CONTINUAR) return { continuar: true };
    if (/^##\s+/.test(b)) return { subtitulo: b.replace(/^##\s+/, '') };
    const linhas = b.split('\n');
    if (linhas.every((l) => /^\s*[-•]\s+/.test(l))) return { lista: linhas.map((l) => l.replace(/^\s*[-•]\s+/, '')) };
    return { p: b };
  });
}
function blocoHTML(b) {
  if (b.subtitulo) return `<h2 style="margin:22px 0 10px;font-size:19px;line-height:1.3;color:${COR.petroleo};font-family:Arial,Helvetica,sans-serif">${enfeitar(b.subtitulo)}</h2>`;
  if (b.lista) return `<ul style="margin:0 0 16px;padding-left:22px;font-size:16px;line-height:1.65;color:${COR.texto}">${b.lista.map((x) => `<li style="margin-bottom:6px">${enfeitar(x)}</li>`).join('')}</ul>`;
  if (b.p) return `<p style="${P_ESTILO}">${b.p.split('\n').map(enfeitar).join('<br>')}</p>`;
  return '';
}
const botaoHTML = (texto, link) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="background:${COR.petroleo};border-radius:999px">
<a href="${esc(link)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;font-family:Arial,Helvetica,sans-serif">${esc(texto)}</a></td></tr></table>`;

// Divide o corpo no marcador "continuar lendo": { antes, depois, temContinuar }
export function dividirCorpo(m, pessoa) {
  const blocos = blocosDoCorpo(personalizar(m.corpo, pessoa));
  const i = blocos.findIndex((b) => b.continuar);
  return i < 0 ? { antes: blocos, depois: [], temContinuar: false } : { antes: blocos.slice(0, i), depois: blocos.slice(i + 1), temContinuar: true };
}

// E-mail pronto para enviar. links: { ler, sair } (na prévia podem ser "#").
export function montarEmail(m, pessoa = {}, links = {}) {
  const ler = links.ler || '#', sair = links.sair || '#';
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);   // "{nome}, ..." sem nome vira frase com maiúscula
  const assunto = maiuscula(personalizar(m.assunto, pessoa).trim()) || '(sem assunto)';
  const preheader = personalizar(m.preheader || '', pessoa).trim();
  const rodape = `Você recebe este e-mail da Mentorei porque tem ou já teve contato com a gente sobre desenvolvimento de líderes.<br>
Não quer mais receber? <a href="${esc(sair)}" style="color:${COR.apagado}">Clique aqui para sair da lista</a>.<br>Mentorei · mentorei.com.br`;
  let miolo, texto;
  if (m.formato === 'html') {
    miolo = personalizar(m.html || '', pessoa);
    texto = `${assunto}\n\n${miolo.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`;
  } else {
    const { antes, temContinuar } = dividirCorpo(m, pessoa);
    const titulo = personalizar(m.titulo || '', pessoa).trim();
    const botao = temContinuar ? botaoHTML('Continuar lendo →', ler) : (m.botao_texto && m.botao_link ? botaoHTML(personalizar(m.botao_texto, pessoa), m.botao_link) : '');
    miolo = `${m.imagem_url ? `<tr><td style="padding:0"><img src="${esc(m.imagem_url)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>` : ''}
<tr><td style="padding:30px 32px 8px;font-family:Arial,Helvetica,sans-serif">
${titulo ? `<h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:${COR.petroleo}">${enfeitar(titulo)}</h1>` : ''}
${antes.map(blocoHTML).join('\n')}
${botao}
</td></tr>`;
    const linhasTexto = antes.map((b) => (b.subtitulo ? `\n${semEnfeite(b.subtitulo).toUpperCase()}` : b.lista ? b.lista.map((x) => `• ${semEnfeite(x)}`).join('\n') : b.p ? semEnfeite(b.p) : ''));
    texto = [titulo, ...linhasTexto, temContinuar ? `Continuar lendo: ${ler}` : (m.botao_texto && m.botao_link ? `${m.botao_texto}: ${m.botao_link}` : '')].filter(Boolean).join('\n\n');
  }
  const corpoHTML = m.formato === 'html'
    ? `<tr><td style="padding:0">${miolo}</td></tr>`
    : miolo;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${'&#847; &zwnj; &nbsp; '.repeat(30)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};padding:24px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:${COR.petroleo};padding:18px 32px;border-bottom:3px solid ${COR.begeEscuro}"><img src="${SITE}/assets/logo-clara.png" height="30" alt="Mentorei" style="display:block;height:30px;width:auto;border:0;color:#FFFFFF;font-family:Arial,sans-serif;font-weight:bold"></td></tr>
${corpoHTML}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td style="padding:18px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${COR.apagado};text-align:center">${rodape}</td></tr></table>
</td></tr></table></body></html>`;
  texto = `${texto}\n\n---\nNão quer mais receber? ${sair}\nMentorei · mentorei.com.br`;
  return { assunto, html, texto };
}

// Página "continuar lendo": o texto inteiro (miolo HTML, sem a moldura do e-mail).
export function montarPagina(m, pessoa = {}) {
  const { antes, depois } = dividirCorpo(m, pessoa);
  const titulo = personalizar(m.titulo || m.assunto || '', pessoa).trim();
  const botao = m.botao_texto && m.botao_link ? botaoHTML(personalizar(m.botao_texto, pessoa), m.botao_link) : '';
  return { titulo, html: `${m.imagem_url ? `<img class="topo-img" src="${esc(m.imagem_url)}" alt="">` : ''}
${titulo ? `<h1>${enfeitar(titulo)}</h1>` : ''}
${[...antes, ...depois].map(blocoHTML).join('\n')}
${botao}` };
}

// Próximo horário permitido de envio a partir de "quando" (dias da semana e janela de horas de Brasília).
export function proximoHorario(quando, funil) {
  const dias = (funil.dias_semana && funil.dias_semana.length) ? funil.dias_semana : [1, 2, 3, 4, 5];
  const ini = funil.hora_inicio == null ? 9 : funil.hora_inicio, fim = funil.hora_fim == null ? 17 : funil.hora_fim;
  let t = new Date(quando);
  for (let i = 0; i < 15 * 24; i += 1) {
    const br = new Date(t.getTime() - 3 * 3600e3);   // Brasília (sem horário de verão)
    const h = br.getUTCHours(), d = br.getUTCDay();
    if (dias.includes(d) && h >= ini && h < fim) return t;
    // vai para a próxima hora cheia
    t = new Date(Math.floor(t.getTime() / 3600e3) * 3600e3 + 3600e3);
  }
  return t;
}
// Somar dias de intervalo
export const depoisDeDias = (quando, dias) => new Date(new Date(quando).getTime() + Math.max(0, Number(dias) || 0) * 86400e3);
