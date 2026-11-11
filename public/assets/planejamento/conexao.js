// Planejamento 2027 dentro da plataforma (script 72, pedido da Juliana em 11/11/2026: cada pessoa com o próprio login e
// cada comentário no nome de quem escreveu, sem precisar de conta no Claude).
// 1) confere o login e o acesso (rpc planejamento_nivel: editora = administração; colaboradora; leitora; null = sem acesso);
// 2) lê o conteúdo do plano (planejamento_docs conteudo/base) e põe no escopo global (VERT, CONT, DEC...);
// 3) liga a lógica do artifact (claude.use('db') e claude.use('user')) ao Supabase e importa app.js.
// Os dados não ficam em arquivo público do site: só quem tem acesso lê, pela RLS.
import { sb, sessaoAtual, meuPerfil, esc, explicarErro } from '../base.js';

const parar = () => new Promise(() => {});
function aviso(titulo, texto) {
  document.getElementById('menu').innerHTML = '<a class="voltar-plat" href="/app.html">← Voltar para a plataforma</a><div class="marca"><span>Mentorei</span><b>Planejamento 2027</b></div>';
  document.getElementById('view').innerHTML = `<div class="cartao" style="max-width:620px;margin:40px auto;display:grid;gap:12px">
    <h1 style="font-size:26px">${esc(titulo)}</h1><p>${texto}</p>
    <div class="btns"><a class="btn" href="/app.html">Voltar para a plataforma</a></div></div>`;
}

const sessao = await sessaoAtual();
if (!sessao) { location.replace(`/?volta=${encodeURIComponent('/planejamento.html' + location.hash)}`); await parar(); }

let perfil = null;
try { perfil = await meuPerfil(); } catch (e) { aviso('Não consegui abrir', esc(explicarErro(e))); await parar(); }
if (!perfil || !perfil.ativo) { aviso('Seu acesso não está ativo', 'Fale com a administração da Mentorei.'); await parar(); }

const { data: nivel, error: erroNivel } = await sb.rpc('planejamento_nivel');
if (erroNivel) {
  const falta = /planejamento_nivel|PGRST202|function/i.test(`${erroNivel.code} ${erroNivel.message}`);
  aviso(falta ? 'O planejamento está sendo preparado' : 'Não consegui abrir',
    falta ? 'Falta preparar o banco da plataforma (script 72). Volte daqui a pouco.' : esc(explicarErro(erroNivel)));
  await parar();
}
if (!nivel) {
  aviso('Você ainda não participa do planejamento', 'O planejamento estratégico 2027 é aberto a quem a administração da Mentorei incluir. Se você deveria estar aqui, peça para liberarem o seu acesso.');
  await parar();
}

const { data: base, error: erroBase } = await sb.from('planejamento_docs').select('dados').eq('colecao', 'conteudo').eq('id', 'base').maybeSingle();
if (erroBase || !base || !base.dados || !Array.isArray(base.dados.VERT)) {
  aviso('O planejamento está sendo preparado', erroBase ? esc(explicarErro(erroBase)) : 'O conteúdo do plano ainda não foi carregado. Volte daqui a pouco.');
  await parar();
}
for (const [chave, valor] of Object.entries(base.dados)) globalThis[chave] = valor;

const uid = sessao.user.id;

// ---------- banco: o mesmo jeito do artifact (coleção/documento), em cima de planejamento_docs ----------
const ouvintes = new Map();   // coleção → funções que leem de novo
const erroDb = (e) => {
  const txt = `${(e && e.code) || ''} ${(e && e.message) || e || ''}`;
  return { code: /42501|row-level security|permission denied/i.test(txt) ? 'invalid_argument' : 'unavailable', message: String((e && e.message) || e || '') };
};
const releia = (colecao) => (ouvintes.get(colecao) || new Set()).forEach((f) => f());
const relerTudo = () => ouvintes.forEach((fs) => fs.forEach((f) => f()));
setInterval(relerTudo, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) relerTudo(); });

const db = {
  collection(colecao) {
    return {
      onSnapshot(proximo, falha) {
        let vivo = true, avisouErro = false;
        const ler = async () => {
          const { data, error } = await sb.from('planejamento_docs').select('id, dados').eq('colecao', colecao);
          if (!vivo) return;
          if (error) {
            // sem permissão é definitivo; falha de rede passa (a próxima leitura tenta de novo)
            if (!avisouErro && falha && erroDb(error).code === 'invalid_argument') { avisouErro = true; falha(erroDb(error)); }
            return;
          }
          const docs = (data || []).map((l) => ({ id: l.id, exists: true, data: () => l.dados, metadata: { fromCache: false, hasPendingWrites: false } }));
          proximo({ docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] });
        };
        if (!ouvintes.has(colecao)) ouvintes.set(colecao, new Set());
        ouvintes.get(colecao).add(ler);
        ler();
        return () => { vivo = false; ouvintes.get(colecao).delete(ler); };
      },
    };
  },
  doc(caminho) {
    const [colecao, id] = String(caminho).split('/');
    return {
      async set(dados) {
        const linha = { colecao, id, dados, por: uid, em: new Date().toISOString() };
        const tabela = sb.from('planejamento_docs');
        // comentário é sempre novo (quem só comenta não pode mudar nada); o resto troca o documento inteiro
        const { error } = colecao === 'comentarios' ? await tabela.insert(linha) : await tabela.upsert(linha, { onConflict: 'colecao,id' });
        if (error) throw erroDb(error);
        releia(colecao);
      },
      async delete() {
        const { error } = await sb.from('planejamento_docs').delete().eq('colecao', colecao).eq('id', id);
        if (error) throw erroDb(error);
        releia(colecao);
      },
    };
  },
};

// ---------- quem está usando ----------
let pessoas = null;
async function lerPessoas() {
  const { data } = await sb.rpc('planejamento_pessoas');
  pessoas = Object.fromEntries((data || []).map((p) => [p.id, p]));
  return pessoas;
}
const user = {
  isOwner: () => false,
  canEdit: () => nivel === 'editora',
  can: (nome) => (nome === 'data.write' ? nivel === 'editora' || nivel === 'colaboradora' : null),
  id: async () => uid,
  me: async () => ({ id: uid, name: perfil.nome || '' }),
  async profiles(ids) {
    let ps = pessoas || (await lerPessoas());
    if (ids.some((i) => !ps[i])) ps = await lerPessoas();
    return Object.fromEntries(ids.map((i) => [i, { name: (ps[i] && ps[i].nome) || '' }]));
  },
};

window.claude = { use: async (nome) => (nome === 'db' ? db : nome === 'user' ? user : null) };
window.PLANEJAMENTO = { sb, perfil, nivel, uid };
await import('./app.js');
