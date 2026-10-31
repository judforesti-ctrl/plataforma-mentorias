// Financeiro → Emitir nota → "Gerar arquivo para a contabilidade" (script 59, 31/10/2026, pedido da Juliana: "fácil e simples, como
// flegar os clientes e pedir para gerar o arquivo"). A Cintia marca as linhas e baixa uma planilha Excel com uma linha por nota e as
// mesmas colunas da planilha de notas fiscais dela (F.COLUNAS_CONTABILIDADE): tomador (quem paga: o pagador do plano, senão o
// cliente) com razão social, CNPJ/CPF, endereço, código do município, e-mail e as retenções de costume, vindos de fin_tomadores
// (carregados da planilha; o que faltar ela completa ali mesmo). Depois de baixar, as linhas ficam "Pedida à contabilidade".
import { sb, esc, hojeISO, avisar, explicarErro } from '../base.js';
import { janela, faltaScript } from './agenda-dados.js';
import { dinheiro } from './vendas.js';
import * as F from '../financeiro-regras.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9/]+/g, ' ').trim();
const GENERICAS = new Set(['cooperativa', 'credito', 'ltda', 'programa', 'turma', 'mentoria', 'grupo', 'servico', 'servicos', 'nacional', 'comercio', 'empresa', 'sociedade', 'investimento', 'poupanca', 'livre', 'admissao']);
// Quem paga sem CNPJ na plataforma: acha o tomador pelo nome, só se for um só ("Sescoop/PR" = o Sescoop daquela UF;
// senão todas as palavras do nome na razão social)
function acharPeloNome(nome, tomadores) {
  const n = normal(nome);
  if (!n) return null;
  const lista = [...tomadores.values()];
  const sescoop = n.match(/sescoop\s*\/?\s*([a-z]{2})\b/);
  let achados;
  if (sescoop) achados = lista.filter((t) => (t.uf || '').toLowerCase() === sescoop[1] && /aprendizagem do cooperativismo/.test(normal(t.razao_social)));
  else {
    const palavras = n.split(/[\s/]+/).filter((w) => w.length >= 4 && !GENERICAS.has(w));
    if (!palavras.length) return null;
    achados = lista.filter((t) => { const r = normal(t.razao_social); return palavras.every((w) => r.includes(w)); });
  }
  return achados.length === 1 ? achados[0] : null;
}

export async function janelaContabilidade(d, linhas, recarregar) {
  const r = await sb.from('fin_tomadores').select('*');
  const semScript = r.error && faltaScript(r.error);
  if (r.error && !semScript) { avisar(explicarErro(r.error), true); return; }
  const tomadores = new Map((r.data || []).map((t) => [t.documento, t]));
  const hoje = hojeISO();
  const estado = { juntar: true, emissao: hoje };
  const quem = (l) => {
    const p = d.plano(l.plano_id), e = d.empresa(l.empresa_id);
    const nome = (p && p.pagador_nome) || e.razao_social || e.nome;
    const doc = F.soNumeros((p && p.pagador_cnpj) || ((p && p.pagador_nome) ? '' : e.cnpj));
    if (doc) return { doc, nome };
    const t = acharPeloNome(nome, tomadores);
    return t ? { doc: t.documento, nome, peloNome: true } : { doc: '', nome };
  };
  const montar = () => {
    const grupos = new Map();
    for (const l of linhas) {
      const q = quem(l);
      const k = estado.juntar ? `${q.doc || l.empresa_id}|${l.plano_id || 'avulso'}` : l.id;
      if (!grupos.has(k)) grupos.set(k, { linhas: [], q });
      grupos.get(k).linhas.push(l);
    }
    return [...grupos.values()].map((g) => {
      const p = d.plano(g.linhas[0].plano_id);
      return { empresa_id: g.linhas[0].empresa_id, plano_id: g.linhas[0].plano_id, peloNome: !!g.q.peloNome, ...F.notaContabilidade({ linhas: g.linhas, plano: p, empresaNome: g.q.nome, documento: g.q.doc, tomador: tomadores.get(g.q.doc) || null,
        emissao: estado.emissao, vencimento: F.vencimentoPadrao(estado.emissao, p ? p.prazo_dias : 30), emissor: d.config.emissores[p ? p.emissor : 'principal'] || '',
        observacao: p && p.pagador_nome ? `Serviço para ${d.empresa(g.linhas[0].empresa_id).nome}` : '' }) };
    });
  };
  const j = janela('Arquivo para a contabilidade', '<div id="ct-corpo"></div>', { largura: 900 });
  const corpo = j.corpo.querySelector('#ct-corpo');
  const desenhar = () => {
    const notas = montar();
    const faltam = notas.filter((n) => n.falta.length);
    corpo.innerHTML = `
      ${semScript ? '<div class="aviso">Falta rodar o script <b>59</b> no Supabase: sem ele a planilha sai sem os endereços e as retenções dos clientes.</div>' : ''}
      <div class="grade g3" style="gap:10px">
        <div class="campo"><label for="ct-emissao">Data de emissão das notas</label><input type="date" id="ct-emissao" value="${estado.emissao}"></div>
        <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="ct-juntar"${estado.juntar ? ' checked' : ''}><span>Juntar as linhas da mesma turma ou mentoria numa nota só</span></label>
      </div>
      <div class="tabela mt"><table><thead><tr><th>Tomador</th><th>O que</th><th style="text-align:right">Valor</th><th style="text-align:right">Retenções</th><th style="text-align:right">Líquido</th><th>Dados</th></tr></thead><tbody>
        ${notas.map((n, i) => { const ret = F.soma(Object.values(n.ret)); return `<tr><td><b>${esc(n.razao)}</b><br><small class="apagado">${esc(F.documentoFormatado(n.documento) || 'sem CNPJ')}</small></td>
          <td><small>${esc(n.descricao).replace(/\n/g, '<br>')}</small></td>
          <td class="fn-num" style="text-align:right">${dinheiro(n.valor)}</td><td class="fn-num" style="text-align:right">${ret ? dinheiro(ret) : '—'}</td>
          <td class="fn-num" style="text-align:right">${dinheiro(n.liquido)}</td>
          <td>${n.falta.length ? `<span class="selo alerta">falta ${esc(n.falta.join(', '))}</span><br>` : '<span class="selo ok">completos</span><br>'}${n.peloNome ? '<span class="selo neutro">achado pelo nome: conferir</span><br>' : ''}
            ${!semScript ? `<button class="btn peq" type="button" data-tomador="${i}">${n.tomador ? 'Ver ou mudar' : 'Completar'}</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="peq mt">${notas.length} nota${notas.length === 1 ? '' : 's'} · ${dinheiro(F.soma(notas, (n) => n.valor))}${faltam.length ? ` · <b>${faltam.length} com dados faltando</b> (a planilha sai assim mesmo, com o campo em branco)` : ''}</p>
      <div class="linha mt"><button class="btn pri" type="button" id="ct-baixar">Baixar a planilha para a contabilidade</button><button class="btn" type="button" data-fechar>Desistir</button></div>
      <p class="peq apagado mt">Mesmas colunas da planilha de notas fiscais. Número da nota e código de verificação ficam em branco para a contabilidade. Quando a nota sair, registre o número em "Nota emitida".</p>`;
    corpo.querySelector('#ct-emissao').addEventListener('change', (ev) => { estado.emissao = ev.target.value || hoje; desenhar(); });
    corpo.querySelector('#ct-juntar').addEventListener('change', (ev) => { estado.juntar = ev.target.checked; desenhar(); });
    corpo.querySelectorAll('[data-tomador]').forEach((b) => b.addEventListener('click', () => janelaTomador(d, notas[Number(b.dataset.tomador)], tomadores, desenhar)));
    corpo.querySelector('#ct-baixar').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        const XLSX = await import(XLSX_URL);
        const ws = XLSX.utils.aoa_to_sheet([F.COLUNAS_CONTABILIDADE, ...notas.map(F.linhaContabilidade)]);
        ws['!cols'] = F.COLUNAS_CONTABILIDADE.map((c) => ({ wch: c === 'Descrição serviço' ? 60 : c === 'Cliente / razão social' ? 40 : 14 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Notas para emitir');
        XLSX.writeFile(wb, `Mentorei - notas para emitir - ${estado.emissao}.xlsx`);
        if (!semScript) {
          const { error } = await sb.from('fin_receber').update({ contabilidade_em: new Date().toISOString() }).in('id', linhas.map((l) => l.id));
          if (error) throw error;
        }
        j.fechar(); avisar('Planilha baixada. Mande para a contabilidade.'); recarregar();
      } catch (e) { ev.target.disabled = false; avisar(explicarErro(e), true); }
    });
  };
  desenhar();
}

// Completar ou mudar os dados do tomador (fica guardado para as próximas notas)
function janelaTomador(d, n, tomadores, depois) {
  const t = n.tomador || { documento: n.documento, razao_social: n.razao, retencoes: {} };
  const campo = (id, rotulo, v, extra = '') => `<div class="campo"><label for="tm-${id}">${rotulo}</label><input type="text" id="tm-${id}" value="${esc(v || '')}" ${extra}></div>`;
  const j = janela(`Dados para a nota · ${n.documento ? F.documentoFormatado(n.documento) : n.razao}`, `<form class="grade" style="gap:10px" novalidate>
    ${n.documento ? '' : campo('doc', 'CNPJ ou CPF de quem recebe a nota *', '', 'inputmode="numeric" maxlength="20"')}
    ${campo('razao', 'Razão social *', t.razao_social, 'maxlength="200"')}
    <div class="grade g3" style="gap:10px">${campo('logradouro', 'Logradouro *', t.logradouro)}${campo('numero', 'Número', t.numero)}${campo('complemento', 'Complemento', t.complemento)}</div>
    <div class="grade g3" style="gap:10px">${campo('bairro', 'Bairro', t.bairro)}${campo('cidade', 'Cidade', t.cidade)}${campo('uf', 'UF *', t.uf, 'maxlength="2"')}</div>
    <div class="grade g3" style="gap:10px">${campo('cep', 'CEP *', t.cep, 'inputmode="numeric"')}${campo('municipio', 'Código do município (IBGE) *', t.codigo_municipio, 'inputmode="numeric"')}${campo('email', 'E-mail para a nota *', t.email)}</div>
    ${campo('telefone', 'Telefone', t.telefone)}
    <details><summary>Retenções de costume (% sobre o valor)</summary><div class="grade g3 mt" style="gap:10px">
      ${F.RETENCOES.map((k) => `<div class="campo"><label for="tm-r-${k}">${k.toUpperCase()} (%)</label><input type="number" id="tm-r-${k}" min="0" max="30" step="0.01" value="${(t.retencoes || {})[k] || ''}"></div>`).join('')}
    </div></details>
    <p class="peq apagado">O código do município (7 números) está no site do IBGE ou numa nota anterior desse cliente.</p>
    <div class="linha"><button class="btn pri" type="submit">Salvar</button><button class="btn" type="button" data-fechar>Desistir</button></div></form>`, { largura: 720 });
  const f = j.corpo.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (id) => f.querySelector(`#tm-${id}`).value.trim();
    const doc = n.documento || F.soNumeros(v('doc'));
    if (![11, 14].includes(doc.length)) { avisar('O CPF tem 11 números e o CNPJ, 14.', true); return; }
    const reg = { documento: doc, razao_social: v('razao'), logradouro: v('logradouro') || null, numero: v('numero') || null, complemento: v('complemento') || null,
      bairro: v('bairro') || null, cidade: v('cidade') || null, uf: v('uf').toUpperCase() || null, cep: F.soNumeros(v('cep')) || null, codigo_municipio: F.soNumeros(v('municipio')) || null,
      email: v('email') || null, telefone: v('telefone') || null, atualizado_em: new Date().toISOString(),
      retencoes: Object.fromEntries(F.RETENCOES.map((k) => [k, Number(f.querySelector(`#tm-r-${k}`).value) || 0])) };
    if (!reg.razao_social) { avisar('Escreva a razão social.', true); return; }
    const { data, error } = await sb.from('fin_tomadores').upsert(reg).select('*').single();
    if (error) { avisar(explicarErro(error), true); return; }
    tomadores.set(doc, data || reg);
    // sem CNPJ na plataforma: fica no plano (quando quem paga é outro, como o Sescoop) ou no cadastro do cliente
    if (!n.documento) {
      const p = d.plano(n.plano_id), e = d.empresa(n.empresa_id);
      const u = p && p.pagador_nome ? await sb.from('fin_planos').update({ pagador_cnpj: F.documentoFormatado(doc) }).eq('id', p.id)
        : await sb.from('empresas').update({ cnpj: F.documentoFormatado(doc) }).eq('id', n.empresa_id);
      if (u.error) avisar(`Dados guardados, mas o CNPJ não ficou gravado em ${p && p.pagador_nome ? p.titulo : e.nome}: ${explicarErro(u.error)}`, true);
      else if (p && p.pagador_nome) p.pagador_cnpj = F.documentoFormatado(doc);
      else e.cnpj = F.documentoFormatado(doc);
    }
    j.fechar(); avisar('Dados guardados para as próximas notas.'); depois();
  });
}
