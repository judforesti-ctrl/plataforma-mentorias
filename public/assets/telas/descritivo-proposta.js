// Descritivo dos módulos pela proposta (administração): para uma turma que já existe (por exemplo, vinda da planilha),
// a IA lê a proposta e escreve em cada módulo o que deve ser abordado (objetivo, entrega prática e tópicos), além do
// perfil da turma e da metodologia. A proposta pode ser um arquivo (PDF ou PowerPoint) ou uma que já está na plataforma
// (importada ou gerada pela IA em Vendas). Nada é gravado antes de a administração conferir e clicar em "Colocar".
// O servidor (/api/proposta-modulos) devolve o resultado pela tabela importacoes_proposta, como na importação.
import { sb, esc, avisar, explicarErro, dataBR } from '../base.js';
import { textoDaImportacao, textoDaPropostaIA, mesmaEmpresa, importacaoComModulos, conteudoComModulos, arquivoLegivel, tipoArquivo } from '../descritivo-regras.js';

// As propostas que já estão na plataforma (importadas, geradas pela IA e as enviadas como arquivo PDF ou PowerPoint),
// com as desta empresa primeiro. "texto" lê a proposta na hora (o arquivo é baixado da pasta privada e lido no navegador).
async function propostasGuardadas(turma) {
  const empresa = turma.empresa ? turma.empresa.nome : '';
  const lista = [];
  const { data: imps } = await sb.from('importacoes_proposta').select('id, arquivo, criado_em, resultado').eq('status', 'pronto').order('criado_em', { ascending: false }).limit(300);
  for (const i of imps || []) {
    const r = i.resultado || {};
    if (!importacaoComModulos(r)) continue;
    const nMod = (r.turmas || []).reduce((s, t) => s + (t.modulos || []).length, 0);
    lista.push({ chave: `i${i.id}`, nome: i.arquivo || 'Proposta importada', empresa: r.empresa || '', quando: i.criado_em, nMod,
      daEmpresa: mesmaEmpresa(r.empresa, empresa), origem: 'Importada', texto: async () => textoDaImportacao(r) });
  }
  // propostas de Vendas: geradas pela IA (conteúdo) e enviadas como arquivo (as importadas já estão acima)
  let { data: props, error } = await sb.from('propostas').select('id, versao, status, enviada_em, criado_em, conteudo, importacao_id, arquivo, arquivo_storage, oportunidade:oportunidades(titulo, empresa_id, empresa:empresas(nome))')
    .order('criado_em', { ascending: false }).limit(300);
  if (error) props = [];   // sem o script 20 (sem conteudo/arquivo_storage): a lista fica só com as importadas
  for (const p of props || []) {
    const op = p.oportunidade || {};
    const emp = op.empresa ? op.empresa.nome : '';
    const daEmpresa = Boolean(turma.empresa_id && op.empresa_id === turma.empresa_id) || mesmaEmpresa(emp, empresa);
    if (conteudoComModulos(p.conteudo)) {
      const c = p.conteudo;
      const nome = (c.capa && c.capa.nome) || op.titulo || 'Proposta';
      lista.push({ chave: `p${p.id}`, nome: `${nome} · versão ${p.versao || 1}`, empresa: emp, quando: p.criado_em, nMod: c.modulos.length,
        daEmpresa, origem: 'Gerada pela IA', texto: async () => textoDaPropostaIA(c, emp) });
    } else if (!p.importacao_id && arquivoLegivel(p.arquivo_storage)) {
      const { textoDoArquivoGuardado } = await import('./importar-proposta.js');
      lista.push({ chave: `a${p.id}`, nome: `${p.arquivo || op.titulo || 'Proposta'} · versão ${p.versao || 1}`, empresa: emp, quando: p.enviada_em || p.criado_em,
        formato: tipoArquivo(p.arquivo_storage) === 'pptx' ? 'PowerPoint' : 'PDF', daEmpresa,
        origem: p.status === 'enviada' || p.enviada_em ? 'Enviada ao cliente' : 'Arquivo guardado',
        texto: (aoAvancar) => textoDoArquivoGuardado(p.arquivo_storage, aoAvancar) });
    }
  }
  return lista.sort((a, b) => (b.daEmpresa - a.daEmpresa) || String(b.quando).localeCompare(String(a.quando)));
}

export async function abrirDescritivo(ctx, turmaId, { aoTerminar } = {}) {
  if (!ctx.ehAdmin) return;
  const { janela, api } = await import('./agenda-dados.js');
  const { data: turma, error } = await sb.from('turmas').select('id, nome, empresa_id, perfil_turma, observacoes, empresa:empresas(nome), modulos(id, numero, titulo, tematica)').eq('id', turmaId).maybeSingle();
  if (error || !turma) { avisar(error ? explicarErro(error) : 'Turma não encontrada.', true); return; }
  const mods = (turma.modulos || []).slice().sort((a, b) => a.numero - b.numero);
  const nomeTurma = `${turma.empresa ? `${turma.empresa.nome} · ` : ''}${turma.nome}`;
  let parar = false;
  const j = janela('Descritivo dos módulos pela proposta', '<p class="apagado">Procurando as propostas…</p>', { largura: 880, aoFechar: () => { parar = true; } });
  if (!mods.length) {
    j.corpo.innerHTML = '<p>Esta turma ainda não tem módulos. Cadastre os módulos primeiro e depois traga o descritivo da proposta.</p>';
    return;
  }

  let guardadas = [];
  try { guardadas = await propostasGuardadas(turma); } catch (_) { guardadas = []; }
  const semDescritivo = mods.filter((m) => !String(m.tematica || '').trim()).length;

  const escolher = () => {
    const daEmpresa = guardadas.filter((p) => p.daEmpresa);
    const outras = guardadas.filter((p) => !p.daEmpresa);
    const linha = (p) => `<div class="item" style="grid-template-columns:1fr auto">
      <div style="min-width:0"><div class="nome" style="word-break:break-word">${esc(p.nome)}</div>
        <div class="info">${esc(p.empresa || 'Empresa não informada')} · ${p.origem} em ${dataBR(p.quando)} · ${p.nMod ? `${p.nMod} módulo(s)` : p.formato || ''}</div></div>
      <button class="btn peq pri" type="button" data-usar="${esc(p.chave)}">Usar esta</button></div>`;
    j.corpo.innerHTML = `
      <p>A plataforma lê a proposta e escreve em cada módulo de <b>${esc(nomeTurma)}</b> o que deve ser abordado: objetivo, entrega prática e tópicos.
        Você confere tudo antes de gravar. ${semDescritivo ? `Hoje, <b>${semDescritivo} de ${mods.length}</b> módulo(s) estão sem descritivo.` : 'Todos os módulos já têm descritivo: você escolhe quais trocar.'}</p>
      ${daEmpresa.length ? `<h4 class="mt2">Propostas desta empresa que já estão na plataforma</h4><div class="lista mt">${daEmpresa.map(linha).join('')}</div>` : ''}
      <h4 class="mt2">${daEmpresa.length ? 'Ou envie o arquivo da proposta' : 'Envie o arquivo da proposta'}</h4>
      <p class="peq apagado">PDF ou PowerPoint (.pptx). Leva de 1 a 3 minutos. Preços e condições comerciais não são copiados.</p>
      <label class="btn ${daEmpresa.length ? '' : 'pri '}mt" style="cursor:pointer">Escolher o arquivo<input type="file" id="d-arq" accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.ppt" hidden></label>
      ${outras.length ? `<details class="mt2"><summary class="peq" style="cursor:pointer">Propostas de outras empresas na plataforma (${outras.length})</summary><div class="lista mt">${outras.slice(0, 40).map(linha).join('')}</div></details>` : ''}
      <p class="mt" id="d-estado" role="status"></p>`;
    const estado = j.corpo.querySelector('#d-estado');
    const travar = (sim) => j.corpo.querySelectorAll('button[data-usar], #d-arq').forEach((b) => { b.disabled = sim; });
    j.corpo.querySelectorAll('[data-usar]').forEach((b) => b.addEventListener('click', async () => {
      const p = guardadas.find((x) => x.chave === b.dataset.usar);
      if (!p) return;
      travar(true);
      try {
        const texto = await p.texto((t) => { estado.textContent = t; });
        if (String(texto || '').replace(/--- (página|slide) \d+ ---/g, '').trim().length < 200) {
          estado.innerHTML = '<span class="selo erro">Não consegui ler o texto desta proposta</span> Se o arquivo for uma imagem escaneada, exporte de novo como PDF a partir do Canva ou do PowerPoint e envie aqui.';
          travar(false);
          return;
        }
        await processar(texto, p.nome, estado, travar);
      } catch (e) { estado.textContent = ''; avisar(explicarErro(e), true); travar(false); }
    }));
    j.corpo.querySelector('#d-arq').addEventListener('change', async (ev) => {
      const arq = ev.target.files[0]; if (!arq) return;
      const ext = (arq.name.split('.').pop() || '').toLowerCase();
      if (ext === 'ppt') { estado.innerHTML = '<span class="selo erro">Formato antigo do PowerPoint</span> Abra no PowerPoint, salve como .pptx (ou exporte como PDF) e envie de novo.'; return; }
      travar(true);
      try {
        const { lerTextoPdf, lerTextoPptx } = await import('./importar-proposta.js');
        const texto = ext === 'pptx' ? await lerTextoPptx(arq, (t) => { estado.textContent = t; }) : await lerTextoPdf(arq, (t) => { estado.textContent = t; });
        if (texto.replace(/--- (página|slide) \d+ ---/g, '').trim().length < 200) {
          estado.innerHTML = ext === 'pptx' ? '<span class="selo erro">Este PowerPoint quase não tem texto</span> Se os slides forem imagens, exporte a proposta como PDF a partir do Canva e envie o PDF.'
            : '<span class="selo erro">Este PDF não tem texto legível</span> Parece ser uma imagem escaneada. Exporte a proposta de novo como PDF a partir do Canva ou do PowerPoint.';
          travar(false); ev.target.value = '';
          return;
        }
        await processar(texto, arq.name, estado, travar);
      } catch (e) { estado.textContent = ''; avisar(explicarErro(e), true); travar(false); }
      ev.target.value = '';
    });
  };

  // manda para a IA e acompanha (ela trabalha em segundo plano no servidor)
  const processar = async (texto, arquivo, estado, travar) => {
    travar(true);
    try {
      estado.textContent = 'Lendo a proposta com a IA… (de 1 a 3 minutos)';
      const { data: imp, error: e } = await sb.from('importacoes_proposta').insert({ arquivo: `Descritivo dos módulos · ${arquivo}`.slice(0, 250) }).select('id').single();
      if (e) throw e;
      const r = await api('/api/proposta-modulos', { importacao_id: imp.id, turma_id: turma.id, texto, arquivo });
      if (!r.ok) throw new Error(r.mensagem || 'Não foi possível começar a leitura da proposta.');
      const inicio = Date.now();
      let res = null;
      while (!parar && Date.now() - inicio < 5 * 60 * 1000) {
        await new Promise((ok) => setTimeout(ok, 4000));
        const { data } = await sb.from('importacoes_proposta').select('status, resultado, erro').eq('id', imp.id).single();
        if (data && data.status !== 'processando') { res = data; break; }
        estado.textContent = `Lendo a proposta com a IA… ${Math.round((Date.now() - inicio) / 1000)} s`;
      }
      if (parar) return;
      if (!res) { estado.textContent = 'Demorou mais que o esperado. Tente de novo em alguns minutos.'; travar(false); return; }
      if (res.status === 'erro') { estado.innerHTML = `<span class="selo erro">Não deu certo</span> ${esc(res.erro || '')}`; travar(false); return; }
      revisar(res.resultado || {});
    } catch (e) { estado.textContent = ''; avisar(explicarErro(e), true); travar(false); }
  };

  // a administração confere o que a IA achou e escolhe o que colocar
  const revisar = (r) => {
    const atual = new Map(mods.map((m) => [m.id, m]));
    const itens = (r.modulos || []).filter((x) => atual.has(x.modulo_id));
    const achados = itens.filter((x) => x.achado).length;
    const bloco = (chave, titulo, sugestao, hoje, dica) => `<div class="cartao" style="background:var(--bg);border:0;margin-top:10px" data-bloco="${chave}">
      <label class="check"><input type="checkbox" data-usar${hoje ? '' : ' checked'}><span><b>${titulo}</b></span></label>
      ${dica ? `<p class="peq apagado">${dica}</p>` : ''}
      ${hoje ? `<p class="peq mt"><span class="selo alerta">Já tem texto</span> Marque para trocar pelo da proposta.</p>
        <details class="peq"><summary style="cursor:pointer">Ver o que está hoje</summary><p class="mt" style="white-space:pre-wrap">${esc(hoje)}</p></details>` : ''}
      <textarea class="mt" data-texto style="min-height:150px">${esc(sugestao)}</textarea></div>`;
    j.corpo.innerHTML = `
      ${r.aviso ? `<div class="aviso"><b>Atenção:</b> ${esc(r.aviso)}</div>` : ''}
      <p class="mt">Achei o descritivo de <b>${achados} de ${itens.length}</b> módulo(s). Confira, ajuste o texto se quiser e clique em <b>"Colocar nos módulos"</b>.
        Só vai o que estiver marcado.</p>
      ${itens.map((x) => {
        const m = atual.get(x.modulo_id);
        const titulo = `Módulo ${m.numero} · ${esc(m.titulo)}`;
        if (!x.achado) return `<div class="cartao" style="background:var(--bg);border:0;margin-top:10px"><b>${titulo}</b>
          <p class="peq apagado">Não achei este tema na proposta. O módulo fica como está.</p></div>`;
        return bloco(`m:${m.id}`, titulo, x.tematica, String(m.tematica || '').trim(), x.parte_da_proposta ? `Na proposta: ${esc(x.parte_da_proposta)}` : '');
      }).join('')}
      ${r.perfil_turma ? `<h4 class="mt2">Da turma</h4>${bloco('perfil', 'Perfil da turma', r.perfil_turma, String(turma.perfil_turma || '').trim(), 'Aparece para o mentor no alto de cada módulo.')}` : ''}
      ${r.metodologia ? `${r.perfil_turma ? '' : '<h4 class="mt2">Da turma</h4>'}${bloco('metodologia', 'Metodologia e personalização', r.metodologia, String(turma.observacoes || '').trim(), 'Vai para "Metodologia e observações" da turma (os mentores veem).')}` : ''}
      <div class="linha mt2"><button class="btn pri" type="button" id="d-colocar">Colocar nos módulos</button><button class="btn" type="button" id="d-voltar">Escolher outra proposta</button></div>`;
    j.corpo.querySelector('#d-voltar').addEventListener('click', escolher);
    j.corpo.querySelector('#d-colocar').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true;
      try {
        let nMods = 0;
        const mudTurma = {};
        for (const cx of j.corpo.querySelectorAll('[data-bloco]')) {
          if (!cx.querySelector('[data-usar]').checked) continue;
          const txt = cx.querySelector('[data-texto]').value.trim();
          if (!txt) continue;
          const chave = cx.dataset.bloco;
          if (chave.startsWith('m:')) {
            const { error: e } = await sb.from('modulos').update({ tematica: txt }).eq('id', chave.slice(2));
            if (e) throw e;
            nMods++;
          } else if (chave === 'perfil') mudTurma.perfil_turma = txt;
          else if (chave === 'metodologia') mudTurma.observacoes = txt;
        }
        if (Object.keys(mudTurma).length) { const { error: e } = await sb.from('turmas').update(mudTurma).eq('id', turma.id); if (e) throw e; }
        if (!nMods && !Object.keys(mudTurma).length) { avisar('Nada marcado: nenhum módulo foi mudado.', true); btn.disabled = false; return; }
        avisar(nMods ? `Descritivo colocado em ${nMods} módulo(s).` : 'Dados da turma atualizados.');
        j.fechar();
        if (aoTerminar) aoTerminar();
      } catch (e) { avisar(explicarErro(e), true); btn.disabled = false; }
    });
  };

  escolher();
}

// ---------- descritivo automático (2026-11-09, pedido da Juliana) ----------
// Toda vez que a turma ganha módulos (+ Novo módulo, pré-bloqueio que vira turma), o servidor procura sozinho a proposta
// enviada a esta empresa e escreve a temática dos módulos que estão VAZIOS (e o perfil e a metodologia da turma, se vazios).
// Nada que alguém escreveu é trocado. A linha em importacoes_proposta (resultado.automatico) é o que as telas acompanham.
export async function descritivoAutomatico(turmaId) {
  try {
    const { data: imp, error } = await sb.from('importacoes_proposta')
      .insert({ arquivo: 'Descritivo automático dos módulos', resultado: { tipo: 'modulos', automatico: true, turma_id: turmaId } }).select('id').single();
    if (error || !imp) return null;
    const { api } = await import('./agenda-dados.js');
    const r = await api('/api/proposta-modulos', { importacao_id: imp.id, turma_id: turmaId, automatico: true });
    if (!r.ok) {
      await sb.from('importacoes_proposta').update({ status: 'erro', erro: r.mensagem || 'Não foi possível começar a leitura da proposta.' }).eq('id', imp.id);
      return null;
    }
    return imp.id;
  } catch (_) { return null; }
}

// Acompanha o descritivo automático mais recente desta turma (dos últimos 10 minutos): aoProcessar(linha) enquanto a IA lê,
// aoTerminar(linha, jaEstavaPronto) quando acaba (pronto ou erro). Devolve a função que para de acompanhar.
export function acompanharAutomatico(turmaId, { aoProcessar, aoTerminar } = {}) {
  let parar = false, timer = null;
  const olhar = async (primeira) => {
    if (parar) return;
    const desde = new Date(Date.now() - 10 * 60000).toISOString();
    const { data, error } = await sb.from('importacoes_proposta').select('id, status, resultado, erro, criado_em')
      .eq('resultado->>turma_id', turmaId).eq('resultado->>automatico', 'true').gte('criado_em', desde)
      .order('criado_em', { ascending: false }).limit(1);
    if (parar || error) return;
    const x = (data || [])[0];
    if (!x) return;
    if (x.status === 'processando') {
      if (Date.now() - new Date(x.criado_em).getTime() > 8 * 60000) return;   // parou no meio: a tela fica como está
      if (aoProcessar) aoProcessar(x);
      timer = setTimeout(() => olhar(false), 4000);
      return;
    }
    if (aoTerminar) aoTerminar(x, primeira);
  };
  olhar(true);
  return () => { parar = true; clearTimeout(timer); };
}

// Frase para a tela do módulo quando o automático acabou e o módulo continua sem descritivo.
export function motivoSemDescritivo(x, moduloId) {
  if (!x) return '';
  const r = x.resultado || {};
  const nome = r.proposta && r.proposta.nome ? `"${r.proposta.nome}"` : 'da empresa';
  if (x.status === 'erro') return `Tentei trazer da proposta sozinha, mas não deu certo: ${x.erro || 'erro desconhecido'}.`;
  if (r.nada) return r.nada;
  if (r.proposta_da_turma === false) return `A proposta ${nome} parece ser de outro programa, então não coloquei nada.${r.aviso ? ` ${r.aviso}` : ''}`;
  const item = (r.modulos || []).find((m) => m.modulo_id === moduloId);
  if (item && !item.achado) return `Procurei na proposta ${nome} e não achei o tema deste módulo.`;
  return '';
}
