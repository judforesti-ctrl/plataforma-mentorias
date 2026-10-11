// Avaliação da turma dentro do módulo (script 31): o QR code e o link são feitos pela plataforma a partir do endereço
// do módulo (nada para colar); o mentor baixa a imagem para o ÚLTIMO SLIDE ou copia o link para o chat da aula online.
// Embaixo, o resultado do encontro: o mentor vê as notas do módulo e só a PRÓPRIA nota de mentor (regra do banco);
// a administração vê a de cada mentor. Tudo anônimo.
import { sb, esc, avisar } from '../base.js';
import { linkAvaliacao, janelaAvaliacao, resumir, num1, APRENDEU, TEMPO, HORAS_ATE_EMAIL, DIAS_ABERTA } from '../avaliacao-regras.js';

const nomeArquivo = (t) => t.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// a biblioteca do QR code (qrcode-generator, MIT) fica em /assets/vendor e só carrega quando precisa
let carregando = null;
export function bibliotecaQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!carregando) carregando = new Promise((ok, falha) => {
    const sc = document.createElement('script');
    sc.src = '/assets/vendor/qrcode.js';
    sc.onload = () => ok(window.qrcode);
    sc.onerror = () => { carregando = null; falha(new Error('Não consegui carregar o desenho do QR code. Confira a internet e recarregue a página.')); };
    document.head.appendChild(sc);
  });
  return carregando;
}

// desenha o QR code num canvas: lado = tamanho em pixels; margem = quadradinhos brancos em volta
export async function desenharQr(canvas, texto, lado, x = 0, y = 0) {
  const qrcode = await bibliotecaQr();
  const q = qrcode(0, 'M'); q.addData(texto); q.make();
  const n = q.getModuleCount(), margem = 2, cel = lado / (n + margem * 2);
  const g = canvas.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(x, y, lado, lado);
  g.fillStyle = '#091216';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (q.isDark(r, c)) g.fillRect(Math.floor(x + (c + margem) * cel), Math.floor(y + (r + margem) * cel), Math.ceil(cel), Math.ceil(cel));
  }
}

// a imagem para o slide: título, QR code grande e o nome do encontro embaixo (PNG 1200 x 1500, fundo branco)
async function imagemSlide(m) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 1500;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#091216'; g.textAlign = 'center';
  g.font = '800 76px Manrope, Poppins, Arial, sans-serif'; g.fillText('Avalie este encontro', 600, 130);
  g.fillStyle = '#5F686D'; g.font = '500 40px Inter, Arial, sans-serif'; g.fillText('Aponte a câmera do celular · menos de 1 minuto · anônimo', 600, 200);
  await desenharQr(c, linkAvaliacao(m.id), 1000, 100, 250);
  g.fillStyle = '#091216'; g.font = '700 42px Inter, Arial, sans-serif';
  const linha = `Módulo ${m.numero} · ${m.titulo}`;
  g.fillText(linha.length > 52 ? `${linha.slice(0, 50)}…` : linha, 600, 1330);
  g.fillStyle = '#6B5330'; g.font = '600 36px Inter, Arial, sans-serif';
  g.fillText([m.turma.empresa && m.turma.empresa.nome, m.turma.nome].filter(Boolean).join(' · ').slice(0, 60), 600, 1395);
  g.fillStyle = '#9C7D4C'; g.font = '800 34px Manrope, Arial, sans-serif'; g.fillText('MENTOREI', 600, 1460);
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui montar a imagem.'))), 'image/png'));
}

export function cartaoAvaliacao(ctx, m, souMentor) {
  const link = linkAvaliacao(m.id);
  return `<div class="cartao" id="avaliacao-turma">
    <h3>Avaliação da turma</h3>
    <div class="aviso mt"><b>Inclua o QR code de avaliação no último slide.</b> ${souMentor || !ctx.ehAdmin ? 'Baixe a imagem abaixo e coloque no último slide da sua apresentação deste módulo.' : 'Os mentores baixam esta imagem e colocam no último slide.'} Cada módulo tem o seu QR code.</div>
    <div class="qr-aval mt">
      <canvas width="440" height="440" data-qr-tela style="width:160px;height:160px;border-radius:10px;border:1px solid var(--linha)" aria-label="QR code da avaliação deste módulo"></canvas>
      <div class="qr-aval-info">
        <div class="linha" style="gap:6px"><button class="btn peq pri" type="button" data-av-baixar>Baixar o QR code</button><button class="btn peq" type="button" data-av-copiar>Copiar o link</button></div>
        <span class="peq apagado">Aula online: mande o link no chat também.</span>
        <a class="peq" href="${esc(link)}" target="_blank" rel="noopener">Ver como o aluno vê</a>
        <span class="peq apagado">Aberta do início da aula até ${DIAS_ABERTA} dias depois. ${HORAS_ATE_EMAIL} horas depois do fim, ${ctx.ehAdmin ? 'cada mentor recebe' : 'você recebe'} o resumo por e-mail.</span>
      </div>
    </div>
    <div class="mt2" data-av-resultado><p class="peq apagado">Carregando as respostas…</p></div>
  </div>`;
}

export function ligarAvaliacao(ctx, el, m, souMentor) {
  const card = el.querySelector('#avaliacao-turma'); if (!card) return;
  const tela = card.querySelector('[data-qr-tela]');
  desenharQr(tela, linkAvaliacao(m.id), tela.width).catch((e) => avisar(e.message, true));
  card.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-av-baixar]')) {
      try {
        const blob = await imagemSlide(m);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${nomeArquivo(`QR code de avaliação - ${m.turma.nome} - Módulo ${m.numero}`)}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { avisar(e.message, true); }
      return;
    }
    if (ev.target.closest('[data-av-copiar]')) {
      try { await navigator.clipboard.writeText(linkAvaliacao(m.id)); avisar('Link da avaliação copiado.'); } catch (_) { window.prompt('Copie o link da avaliação:', linkAvaliacao(m.id)); }
    }
  });
  mostrarResultado(ctx, card.querySelector('[data-av-resultado]'), m, souMentor);
}

async function mostrarResultado(ctx, alvo, m, souMentor) {
  const { data, error } = await sb.from('avaliacoes').select('id, geral, aula, conteudo, ferramentas, aprendeu, tempo, nps, marcas, comentario, temas, criado_em, notas:avaliacao_mentores(mentor_id, nota)')
    .eq('modulo_id', m.id).order('criado_em', { ascending: false });
  if (error) {
    alvo.innerHTML = /avaliacoes|42P01|PGRST20|schema cache/i.test(`${error.code} ${error.message}`)
      ? (ctx.ehAdmin ? '<div class="aviso">Para receber as respostas, falta rodar o script <b>31-avaliacoes.sql</b> no Supabase.</div>' : '<p class="peq apagado">As respostas aparecem aqui assim que a turma avaliar.</p>')
      : `<p class="peq apagado">Não consegui ler as respostas agora.</p>`;
    return;
  }
  const lista = data || [];
  const j = janelaAvaliacao(m);
  if (!lista.length) {
    alvo.innerHTML = `<p class="peq apagado">${j.estado === 'fechada' ? 'Este encontro não recebeu avaliações.' : 'Ainda sem respostas. Elas aparecem aqui assim que a turma avaliar.'}</p>`;
    return;
  }
  const r = resumir(lista);
  const nomes = new Map((m.mentores || []).map((x) => x.mentor).filter(Boolean).map((p) => [p.id, p.nome]));
  const meus = r.mentores.filter((x) => ctx.ehAdmin || x.id === ctx.perfil.id);
  const pres = m.participantes_presentes;
  const caixa = (v, rot) => `<div class="numero" style="background:var(--faixa);border-radius:12px;padding:10px 12px"><b style="font-size:24px">${v}</b><span>${rot}</span></div>`;
  const lista2 = (pares, rot) => pares.filter(([, n]) => n).map(([k, n]) => `${esc(rot ? rot[k] : k)} (${n})`).join(' · ');
  alvo.innerHTML = `
    <div class="linha" style="align-items:baseline"><h4 style="flex:1">Como a turma avaliou</h4><span class="selo neutro">${r.total} ${r.total === 1 ? 'resposta' : 'respostas'}${pres ? ` de ${pres} presentes` : ''}</span></div>
    <div class="mt" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">
      ${caixa(num1(r.geral), 'nota geral (0 a 10)')}
      ${meus.map((x) => caixa(num1(x.media), ctx.ehAdmin ? `${esc(String(nomes.get(x.id) || 'mentor').split(' ')[0])} (1 a 5)` : 'sua nota (1 a 5)')).join('')}
      ${caixa(num1(r.aula), 'aula (1 a 5)')}${caixa(num1(r.conteudo), 'conteúdo (1 a 5)')}${caixa(num1(r.ferramentas), 'ferramentas (1 a 5)')}
      ${r.nps ? caixa(r.nps.valor, 'NPS (−100 a 100)') : ''}
    </div>
    ${lista2(r.aprendeu, APRENDEU) ? `<p class="peq mt"><b>Aprenderam:</b> ${lista2(r.aprendeu, APRENDEU)}</p>` : ''}
    ${lista2(r.tempo, TEMPO) ? `<p class="peq"><b>Tempo:</b> ${lista2(r.tempo, TEMPO)}</p>` : ''}
    ${r.marcas.length ? `<p class="peq"><b>Marcaram:</b> ${lista2(r.marcas)}</p>` : ''}
    ${r.comentarios.length ? `<p class="peq mt"><b>Comentários</b> <span class="apagado">(anônimos)</span></p>
      <div style="display:grid;gap:8px;margin-top:6px">${r.comentarios.map((c) => `<div class="peq" style="border-left:3px solid ${c.geral != null && c.geral <= 6 ? 'var(--erro)' : c.geral >= 9 ? 'var(--ok)' : 'var(--linha)'};padding:2px 0 2px 10px;white-space:pre-wrap">${esc(c.comentario)}${c.geral != null ? ` <span class="apagado">· nota ${c.geral}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${ctx.ehAdmin ? '<p class="peq mt"><a href="#/avaliacoes">Ver todas as avaliações em Gestão › Avaliações</a></p>' : ''}`;
}
