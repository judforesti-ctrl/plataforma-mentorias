// Financeiro → Conferir: TODAS as pendências do Financeiro numa lista só, para a Cintia (pedido da Juliana, 11/11/2026: "coloque
// toda e qualquer pendência na lista de conferir… coloque pequenas notas felizes… precisamos incentivar ela a olhar e resolver").
// Cada cartão diz o que falta, o que a Cintia faz (um botão) e uma nota feliz da plataforma em primeira pessoa: o que eu faço
// sozinha depois que ela resolve. As perguntas dos planos e as despesas sem dono continuam embaixo (abaConferir em financeiro.js).
import { sb, esc, dataBR, hojeISO, avisar, explicarErro } from '../base.js';
import { janela } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// contas que a Mentorei tem (as que já mandaram extrato entram sozinhas)
const CONTAS = ['Sicoob', 'Sicoob Mentorei', 'Unicred'];
const DIAS_EXTRATO = 15;

// Lê o que falta (tomadores e mentores) e monta os cartões. ajuda = { semPlano, modulosSemLinha, editorPlano, ajustes }
export async function pendencias(d, ajuda) {
  const hoje = hojeISO();
  const [tom, ment] = await Promise.all([sb.from('fin_tomadores').select('*'), sb.from('fin_mentores').select('perfil_id, observacoes')]);
  const tomadores = new Map(((tom.error ? [] : tom.data) || []).map((t) => [t.documento, t]));
  const cad = ment.error ? null : ment.data || [];
  const est = d.receber.map((l) => ({ l, e: F.estado(l, hoje) }));
  const so = (...es) => est.filter((x) => es.includes(x.e)).map((x) => x.l);
  const itens = [];
  const add = (x) => { if (x && x.n) itens.push(x); };
  const nomeLinha = (l) => `${esc(d.empresa(l.empresa_id).nome)} · ${esc(l.descricao || '')}${l.data ? ` <small class="apagado">(${dataBR(l.data)})</small>` : ''}`;

  // 1) notas para emitir que ainda não foram pedidas à contabilidade
  const aEmitir = so('a_emitir');
  const naoPedidas = aEmitir.filter((l) => !l.contabilidade_em);
  add({ k: 'emitir', icone: '🧾', n: naoPedidas.length, titulo: `${plural(naoPedidas.length, 'nota para emitir', 'notas para emitir')} · ${dinheiro(F.soma(naoPedidas, (l) => l.valor))}`,
    texto: 'Os módulos e parcelas já aconteceram e a nota ainda não foi pedida.',
    feliz: 'Você só marca as linhas em Emitir nota e eu monto sozinha a planilha pra você mandar pra Contabilizei. 💌',
    href: '#/financeiro/emitir', botao: 'Ir para Emitir nota' });
  const pedidas = aEmitir.filter((l) => l.contabilidade_em);
  add({ k: 'pedidas', icone: '📨', n: pedidas.length, titulo: `${plural(pedidas.length, 'nota pedida', 'notas pedidas')} à contabilidade, esperando a nota sair`,
    texto: 'A planilha já foi baixada. Falta marcar "Nota emitida" com o número quando a Contabilizei mandar.',
    feliz: 'Com a nota marcada, eu já calculo o vencimento e fico de olho no pagamento por você. 👀', href: '#/financeiro/emitir', botao: 'Ir para Emitir nota' });

  // 2) quem recebe a nota sem CNPJ ou com dados faltando (das notas para emitir e das desta semana)
  const { quemPaga, janelaTomador } = await import('./financeiro-contabilidade.js');
  const porQuem = new Map();
  for (const l of so('a_emitir', 'proximo')) {
    const q = quemPaga(d, l, tomadores);
    const k = q.doc || `sem:${String(q.nome || '').toLowerCase().trim()}`;   // o mesmo pagador em várias turmas = uma linha só
    if (!porQuem.has(k)) porQuem.set(k, { q, l, outros: [] });
    else if (!q.doc) porQuem.get(k).outros.push({ plano_id: l.plano_id, empresa_id: l.empresa_id });
  }
  const semCnpj = [], incompletos = [];
  for (const { q, l, outros } of porQuem.values()) {
    const t = q.doc ? tomadores.get(q.doc) || null : null;
    const n = { documento: q.doc, razao: (t && t.razao_social) || q.nome, tomador: t, plano_id: l.plano_id, empresa_id: l.empresa_id, outros };
    if (!q.doc) semCnpj.push(n);
    else if (!tom.error && F.faltaNoTomador(t).length) incompletos.push({ ...n, falta: F.faltaNoTomador(t) });
  }
  const abrirTomador = (n) => (fim) => janelaTomador(d, n, tomadores, fim);
  add({ k: 'cnpj', icone: '🔢', n: semCnpj.length, titulo: `${plural(semCnpj.length, 'cliente sem CNPJ', 'clientes sem CNPJ')} para a nota`,
    texto: 'Sem o CNPJ de quem recebe a nota, a Contabilizei não consegue emitir.',
    feliz: 'Quando você colocar o CNPJ, eu faço tudo sozinha: a lista pra você enviar pra Contabilizei sai prontinha. ✨',
    linhas: semCnpj.map((n) => ({ texto: esc(n.razao), botao: 'Pôr o CNPJ', acao: abrirTomador(n) })) });
  add({ k: 'tomador', icone: '📇', n: incompletos.length, titulo: `${plural(incompletos.length, 'cliente', 'clientes')} com dados da nota faltando`,
    texto: 'O CNPJ está certo, mas falta alguma coisa do cadastro para a nota.',
    feliz: 'Com endereço e e-mail completos, a nota sai sem a contabilidade precisar te perguntar nada. 😉',
    linhas: incompletos.map((n) => ({ texto: `${esc(n.razao)} <small class="apagado">falta ${esc(n.falta.join(', '))}</small>`, botao: 'Completar', acao: abrirTomador(n) })) });

  // 3) pagamentos atrasados
  const atrasados = so('atrasado');
  add({ k: 'atrasado', icone: '⏰', n: atrasados.length, titulo: `${plural(atrasados.length, 'pagamento atrasado', 'pagamentos atrasados')} · ${dinheiro(F.soma(atrasados, (l) => l.valor))}`,
    texto: 'A nota venceu e o dinheiro ainda não foi marcado como recebido. Se já caiu na conta, clique em Recebido; se não, vale um lembrete ao cliente.',
    feliz: 'Se você importar o extrato, eu acho o depósito e marco como recebido sozinha. 🙌', href: '#/financeiro/receber', botao: 'Ir para A receber',
    linhas: atrasados.slice(0, 6).map((l) => ({ texto: `${nomeLinha(l)} · venceu ${dataBR(l.vencimento)} · ${dinheiro(l.valor)}` })) });

  // 4) notas emitidas sem o número (dos meses do Financeiro e dos 3 anteriores)
  const desde = `${F.somarMeses(d.config.inicio || '2026-11', -3)}-01`;
  const semNumero = d.receber.filter((l) => ['faturado', 'recebido'].includes(l.situacao) && !l.nota_numero && (l.data || '') >= desde);
  add({ k: 'numero', icone: '#️⃣', n: semNumero.length, titulo: `${plural(semNumero.length, 'nota emitida sem o número', 'notas emitidas sem o número')}`,
    texto: 'A nota saiu, mas o número dela não está na plataforma.',
    feliz: 'Com o número, eu ligo sozinha cada depósito do extrato à nota certa e o arquivo da contabilidade fica certinho. 🔗',
    linhas: [{ texto: 'Dá para pôr todos de uma vez, numa lista só.', botao: 'Pôr os números', acao: (fim) => janelaNumeros(d, semNumero, fim) }] });

  // 5) linhas do faturamento sem valor
  const zerados = d.receber.filter((l) => l.situacao !== 'cancelado' && !Number(l.valor));
  const planosZerados = [...new Set(zerados.map((l) => l.plano_id).filter(Boolean))].map((id) => d.plano(id)).filter(Boolean);
  const avulsosZerados = zerados.filter((l) => !l.plano_id);
  add({ k: 'valor', icone: '💰', n: planosZerados.length + avulsosZerados.length, titulo: `${plural(zerados.length, 'linha do faturamento', 'linhas do faturamento')} sem valor`,
    texto: 'Módulo ou parcela com valor zero não entra na nota nem na previsão de caixa.',
    feliz: 'Com o valor, eu ponho a nota no dia certo e a previsão de caixa fica de verdade. 📈',
    linhas: [...planosZerados.map((p) => ({ texto: `${esc(p.titulo)} <small class="apagado">${plural(zerados.filter((l) => l.plano_id === p.id).length, 'linha', 'linhas')}</small>`, botao: 'Pôr o valor', acao: () => ajuda.editorPlano(p) })),
      ...avulsosZerados.map((l) => ({ texto: nomeLinha(l), botao: 'Ver em Emitir nota', href: '#/financeiro/emitir' }))] });

  // 6) turmas e mentorias sem plano de faturamento
  const faltaPlano = ajuda.semPlano(d);
  add({ k: 'plano', icone: '🗓️', n: faltaPlano.length, titulo: `${plural(faltaPlano.length, 'turma ou mentoria sem plano de faturamento', 'turmas e mentorias sem plano de faturamento')}`,
    texto: 'Sem o plano, a plataforma não sabe quando nem quanto cobrar.',
    feliz: 'Monte o plano uma vez e eu crio sozinha a nota de cada módulo, no dia certo. 🪄', href: '#/financeiro/planos', botao: 'Ir para Turmas e mentorias',
    linhas: faltaPlano.slice(0, 8).map((x) => ({ texto: `${esc(d.empresa(x.empresa_id).nome)} · ${esc(x.nome)}` })) });
  const novos = d.planos.map((p) => ({ p, ms: ajuda.modulosSemLinha(d, p) })).filter((x) => x.ms.length);
  add({ k: 'modulos', icone: '➕', n: novos.length, titulo: `${plural(F.soma(novos, (x) => x.ms.length), 'módulo novo', 'módulos novos')} sem linha no faturamento`,
    texto: 'A turma ganhou módulo depois que o plano foi montado.',
    feliz: 'Abriu o plano e salvou, eu ponho os módulos novos na fila das notas. 😊',
    linhas: novos.map((x) => ({ texto: `${esc(x.p.titulo)} <small class="apagado">${plural(x.ms.length, 'módulo', 'módulos')}</small>`, botao: 'Abrir o plano', acao: () => ajuda.editorPlano(x.p) })) });

  // 7) reembolsos que o cliente paga e ainda não foram cobrados
  add({ k: 'reembolso', icone: '↩️', n: d.reembolsosACobrar.length, titulo: `${plural(d.reembolsosACobrar.length, 'reembolso', 'reembolsos')} para cobrar do cliente · ${dinheiro(F.soma(d.reembolsosACobrar, (x) => x.valor))}`,
    texto: 'Despesas que o cliente devolve e ainda não entraram numa nota.',
    feliz: 'Um clique em "Cobrar na nota" e eu já calculo o valor com o imposto, pra Mentorei não sair no prejuízo. 💚', href: '#/financeiro/emitir', botao: 'Ir para Emitir nota' });

  // 8) extratos: movimentos para conferir e contas sem extrato recente
  add({ k: 'movimentos', icone: '🏦', n: d.movimentosAConferir, titulo: `${plural(d.movimentosAConferir, 'movimento do extrato', 'movimentos do extrato')} para conferir`,
    texto: 'Entradas e saídas do banco que eu não consegui ligar sozinha.',
    feliz: 'A cada "Lembrar" que você me ensina, eu confiro sozinha esse tipo de movimento nos próximos extratos. 🧠', href: '#/financeiro/extratos', botao: 'Ir para Extratos' });
  if (d.extratos) {
    const contas = [...new Set([...CONTAS, ...d.extratos.map((x) => x.conta)])];
    const velhas = contas.map((c) => ({ c, ate: d.extratos.filter((x) => x.conta === c).map((x) => x.periodo_ate).sort().pop() || null }))
      .filter((x) => !x.ate || F.diasEntre(x.ate, hoje) > DIAS_EXTRATO);
    add({ k: 'extrato', icone: '📄', n: velhas.length, titulo: `${plural(velhas.length, 'conta com extrato atrasado', 'contas com extrato atrasado')}`,
      texto: `Extrato com mais de ${DIAS_EXTRATO} dias deixa o caixa e os recebimentos desatualizados.`,
      feliz: 'Você baixa o PDF do banco e solta aqui: eu leio, confiro com as notas e as despesas e marco o que entrou. 🏦✨', href: '#/financeiro/extratos', botao: 'Importar extrato',
      linhas: velhas.map((x) => ({ texto: `${esc(x.c)} · ${x.ate ? `último extrato até ${dataBR(x.ate)}` : 'nenhum extrato ainda'}` })) });
  }

  // 9) mentores: notas, recados, cadastro
  add({ k: 'notas-mentores', icone: '🧑‍🏫', n: d.notasAConferir, titulo: `${plural(d.notasAConferir, 'nota fiscal de mentor', 'notas fiscais de mentores')} para conferir`,
    texto: 'O mentor mandou a nota e está esperando a conferência.',
    feliz: 'Conferiu, eu já ponho no dia de pagamento certo (5, 15 ou 25) e aviso quando chegar. 📅', href: '#/financeiro/pagamentos', botao: 'Ir para Agenda de pagamentos' });
  add({ k: 'recados', icone: '💬', n: d.recadosNovos, titulo: `${plural(d.recadosNovos, 'recado de mentor', 'recados de mentores')} sobre pagamento`,
    texto: 'Um mentor escreveu sobre o pagamento dele.',
    feliz: 'Você responde ali mesmo e eu mostro a resposta na tela dele. Mentor feliz, parceria longa! 🤝', href: '#/financeiro/pagamentos', botao: 'Ler os recados' });
  if (cad) {
    const parceiros = d.perfis.filter((p) => p.papel === 'mentor' && p.ativo !== false);
    const sem = parceiros.filter((p) => !cad.some((c) => c.perfil_id === p.id));
    const provisorios = parceiros.filter((p) => cad.some((c) => c.perfil_id === p.id && /provis[oó]rio/i.test(c.observacoes || '')));
    add({ k: 'mentores', icone: '🤝', n: sem.length + provisorios.length, titulo: `${plural(sem.length + provisorios.length, 'mentor parceiro', 'mentores parceiros')} sem o valor combinado`,
      texto: `${sem.length ? `${plural(sem.length, 'sem cadastro financeiro', 'sem cadastro financeiro')}. ` : ''}${provisorios.length ? `${plural(provisorios.length, 'com o valor provisório', 'com o valor provisório')} de R$ 187 por hora, esperando a confirmação.` : ''}`,
      feliz: 'Com o valor de cada um certinho, eu faço sozinha o extrato do mês do mentor e confiro a nota dele com o que ele deu de aula. 🧮', href: '#/financeiro/mentores', botao: 'Ir para Mentores',
      linhas: [...sem, ...provisorios].slice(0, 12).map((p) => ({ texto: `${esc(p.nome)}${sem.includes(p) ? ' <small class="apagado">sem cadastro</small>' : ' <small class="apagado">valor provisório</small>'}` })) });
  }

  // 10) contas fixas que já venceram e não foram marcadas como pagas
  const fixas = d.despesas.filter((x) => x.fixa_id && !x.pago_em && x.data && x.data < hoje).sort((a, b) => a.data.localeCompare(b.data));
  add({ k: 'fixas', icone: '📌', n: fixas.length, titulo: `${plural(fixas.length, 'conta fixa vencida', 'contas fixas vencidas')} sem marcar como paga · ${dinheiro(F.soma(fixas, (x) => x.valor))}`,
    texto: 'Se já foi paga, é só marcar. Se o extrato mostrar o pagamento, ele também marca.',
    feliz: 'Marcou como paga, eu tiro do caixa previsto e o número da sobra fica certo. 👌', href: '#/financeiro/pagamentos', botao: 'Ir para Agenda de pagamentos',
    linhas: fixas.map((x) => ({ texto: `${esc(x.descricao)} · ${dataBR(x.data)} · ${dinheiro(x.valor)}`, botao: 'Já paguei', acao: async (fim) => {
      const { error } = await sb.from('fin_despesas').update({ pago_em: x.data }).eq('id', x.id);
      if (error) { avisar(explicarErro(error), true); return; }
      x.pago_em = x.data; avisar('Marcada como paga.'); fim();
    } })) });

  // 11) Ajustes: onde sai a nota do segundo CNPJ
  const semOnde = F.CHAVES_CNPJ.filter((k) => !(d.cnpjs[k] || {}).emite_por);
  add({ k: 'ajustes', icone: '⚙️', n: semOnde.length, titulo: `Onde sai a nota ${semOnde.length === 1 ? `da ${esc(d.cnpjs[semOnde[0]].apelido || d.cnpjs[semOnde[0]].nome)}` : 'dos CNPJs'}?`,
    texto: 'Falta dizer se a nota desse CNPJ sai pela Contabilizei ou pela prefeitura.',
    feliz: 'Me conta uma vez e eu ponho isso sozinha em cada planilha da contabilidade, separadinho por CNPJ. 🗂️',
    linhas: [{ texto: 'Em Ajustes → "Os CNPJs da Mentorei" → "Onde a nota é emitida".', botao: 'Abrir Ajustes', acao: () => ajuda.ajustes() }] });

  return itens;
}

// Os cartões (antes das perguntas dos planos e das despesas sem dono)
export function desenhar(el, itens, { nome, extras = 0, depois }) {
  const total = itens.length + extras;
  const primeiro = String(nome || '').split(' ')[0];
  el.innerHTML = `
    <div class="cartao destaque fn-pend-topo">${total
    ? `<h2>Oi${primeiro ? `, ${esc(primeiro)}` : ''}! ${total === 1 ? 'Tem 1 coisinha' : `Tem ${total} coisinhas`} esperando você 💛</h2>
       <p>Cada uma que você resolve, eu passo a fazer o resto sozinha. Comece pela de cima: é a que mexe com dinheiro.</p>`
    : '<h2>Tudo em dia! 🎉</h2><p>Nada esperando você no Financeiro. Pode tomar um café com calma. ☕</p>'}</div>
    ${itens.map((x, i) => `<div class="cartao fn-pend" data-i="${i}">
      <div class="fn-pend-cab"><span class="fn-pend-ic" aria-hidden="true">${x.icone}</span><div><h3>${x.titulo}</h3><p class="apagado">${x.texto}</p></div>
        ${x.href ? `<a class="btn peq pri" href="${x.href}">${esc(x.botao)}</a>` : ''}</div>
      ${x.linhas && x.linhas.length ? `<ul class="fn-pend-linhas">${x.linhas.map((l, j) => `<li><span>${l.texto}</span>${l.botao ? (l.href ? `<a class="btn peq" href="${l.href}">${esc(l.botao)}</a>` : `<button class="btn peq" type="button" data-l="${i}:${j}">${esc(l.botao)}</button>`) : ''}</li>`).join('')}</ul>` : ''}
      <p class="fn-feliz">${x.feliz}</p></div>`).join('')}`;
  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-l]');
    if (!b) return;
    const [i, j] = b.dataset.l.split(':').map(Number);
    const l = itens[i].linhas[j];
    b.disabled = true;
    try { await l.acao(depois); } finally { b.disabled = false; }
  });
}

// Números das notas emitidas: um campo por linha, agrupadas pelo cliente
function janelaNumeros(d, linhas, depois) {
  const ord = [...linhas].sort((a, b) => (d.empresa(a.empresa_id).nome || '').localeCompare(d.empresa(b.empresa_id).nome || '') || (a.data || '').localeCompare(b.data || ''));
  const j = janela('Números das notas emitidas', `<form class="grade" style="gap:10px" novalidate>
    <p class="apagado">Escreva o número de cada nota. Linhas da mesma nota levam o mesmo número. O que ficar em branco continua na lista.</p>
    <div class="tabela"><table><thead><tr><th>Cliente e o que foi</th><th style="text-align:right">Valor</th><th>Nº da nota</th></tr></thead><tbody>
    ${ord.map((l) => `<tr><td><b>${esc(d.empresa(l.empresa_id).nome)}</b><br><small>${esc(l.descricao || '')} · ${dataBR(l.data)} · ${esc(d.cnpjs[d.cnpjDe(l)].apelido || '')}</small></td>
      <td class="fn-num" style="text-align:right">${dinheiro(l.valor)}</td><td><input type="text" inputmode="numeric" data-num="${l.id}" maxlength="20" style="max-width:110px" aria-label="Número da nota"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="linha"><button class="btn pri" type="submit">Salvar os números</button><button class="btn" type="button" data-fechar>Depois</button></div></form>`, { largura: 760 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const preenchidos = [...f.querySelectorAll('[data-num]')].filter((i) => i.value.trim());
    if (!preenchidos.length) { avisar('Escreva pelo menos um número.', true); return; }
    try {
      for (const i of preenchidos) {
        const { error } = await sb.from('fin_receber').update({ nota_numero: i.value.trim(), atualizado_em: new Date().toISOString() }).eq('id', i.dataset.num);
        if (error) throw error;
        const l = d.receber.find((x) => x.id === i.dataset.num); if (l) l.nota_numero = i.value.trim();
      }
      j.fechar(); avisar(`${plural(preenchidos.length, 'número guardado', 'números guardados')}. Obrigada! 💛`); depois();
    } catch (e) { avisar(explicarErro(e), true); }
  });
}
