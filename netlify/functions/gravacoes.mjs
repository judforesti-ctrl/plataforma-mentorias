// Gravações das aulas (script 44): escolher a pasta do Drive, ler agora, ligar uma gravação a outro módulo, marcar "não é de aula"
// e colar o link de uma gravação à mão. Pasta, leitura e ligar/ignorar: só a administração. Colar link: administração ou mentor do módulo.
import { json, quemPede, supa, acessoGoogle, contaGoogle } from '../lib/google.mjs';
import { idDaPasta, nomeDaPasta, liberarNoDrive, lerConfigGravacoes, gravarConfigGravacoes, temPermissaoGravacoes, pedirLeitura } from '../lib/gravacoes.mjs';

export const config = { path: '/api/gravacoes', method: 'POST' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idDoArquivo = (link) => (String(link).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]{10,})/) || [])[1] || null;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  let b = {}; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  const adm = eu.papel === 'admin';

  // colar o link de uma gravação (Drive, YouTube, Zoom…) num módulo
  if (b.acao === 'colar') {
    if (!UUID.test(String(b.modulo_id || ''))) return json({ mensagem: 'Módulo inválido.' }, 400);
    let link = String(b.link || '').trim();
    if (!link) return json({ mensagem: 'Cole o link da gravação.' }, 400);
    if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
    if (!adm) {
      const m = await supa(`/rest/v1/modulo_mentores?modulo_id=eq.${b.modulo_id}&mentor_id=eq.${eu.id}&select=mentor_id`);
      if (!(m.ok && m.dados && m.dados[0])) return json({ mensagem: 'Só a administração e o mentor do módulo colocam a gravação.' }, 403);
    }
    const driveId = idDoArquivo(link);
    const quando = Date.parse(String(b.gravada_em || ''));
    const linha = { modulo_id: b.modulo_id, nome: String(b.nome || '').trim().slice(0, 160) || 'Gravação da aula', link, ligada: 'manual', criado_por: eu.id,
      ...(Number.isFinite(quando) ? { gravada_em: new Date(quando).toISOString() } : {}),
      ...(driveId ? { drive_id: driveId, link: `https://drive.google.com/file/d/${driveId}/view` } : {}) };
    // mesmo vídeo do Drive que a leitura da pasta já tinha achado: só muda o módulo
    const r = driveId
      ? await supa('/rest/v1/gravacoes?on_conflict=drive_id', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=representation', corpo: { ...linha, ignorada: false } })
      : await supa('/rest/v1/gravacoes', { metodo: 'POST', prefer: 'return=representation', corpo: linha });
    if (!r.ok) return json({ mensagem: /gravacoes/.test(JSON.stringify(r.dados || '')) ? 'Falta rodar o script 44 no Supabase.' : 'Não consegui guardar a gravação.' }, 502);
    let aviso = null;
    if (driveId) {
      const g = await acessoGoogle();
      if (g && g.token && temPermissaoGravacoes(await contaGoogle())) {
        const l = await liberarNoDrive(g.token, driveId, true);
        await supa(`/rest/v1/gravacoes?drive_id=eq.${driveId}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: l.ok ? { compartilhada: true, aviso: null } : { aviso: l.aviso } });
        aviso = l.ok ? null : l.aviso;
      } else aviso = 'Confira no Drive se o vídeo está com "qualquer pessoa com o link pode ver": a plataforma ainda não tem permissão para liberar sozinha.';
    }
    return json({ mensagem: 'Gravação colocada no módulo. Os alunos já veem.', aviso });
  }

  if (!adm) return json({ mensagem: 'Só a administração mexe nas gravações.' }, 403);

  if (b.acao === 'status') {
    const conta = await contaGoogle();
    return json({ config: await lerConfigGravacoes(), conectado: !!(conta && conta.refresh_token), email: conta && conta.email, permissao: temPermissaoGravacoes(conta) });
  }

  if (b.acao === 'pasta') {
    const id = idDaPasta(b.link);
    if (!id) return json({ mensagem: 'Não reconheci o link. Abra a pasta no Google Drive e copie o endereço lá de cima do navegador.' }, 400);
    if (!temPermissaoGravacoes(await contaGoogle())) return json({ mensagem: 'Antes, conecte a conta do Google de novo (botão nesta mesma tela).', reconectar: true }, 409);
    const g = await acessoGoogle();
    if (!g || !g.token) return json({ mensagem: (g && g.erro) || 'Conecte a conta do Google no Painel.' }, 409);
    const p = await nomeDaPasta(g.token, id);
    if (p.erro) return json({ mensagem: p.erro }, 400);
    await gravarConfigGravacoes({ pasta_id: id, pasta_nome: p.nome, escolhida_por: eu.nome, escolhida_em: new Date().toISOString() });
    await pedirLeitura();
    return json({ mensagem: `Pasta "${p.nome}" ligada. A plataforma já está procurando as gravações: em alguns minutos elas aparecem nos módulos.` });
  }

  if (b.acao === 'ler') {
    await pedirLeitura();
    return json({ mensagem: 'Procurando gravações novas na pasta. Em alguns minutos elas aparecem nos módulos.' });
  }

  // ligar a outro módulo (ou a nenhum) e "não é de aula": o link do Drive acompanha (aberto só quando está num módulo)
  if (b.acao === 'ligar' || b.acao === 'ignorar') {
    if (!UUID.test(String(b.id || ''))) return json({ mensagem: 'Gravação inválida.' }, 400);
    if (b.acao === 'ligar' && b.modulo_id && !UUID.test(String(b.modulo_id))) return json({ mensagem: 'Módulo inválido.' }, 400);
    const atual = await supa(`/rest/v1/gravacoes?id=eq.${b.id}&select=id,drive_id,modulo_id,ignorada`);
    const x = atual.ok && atual.dados && atual.dados[0];
    if (!x) return json({ mensagem: 'Gravação não encontrada.' }, 404);
    const mud = b.acao === 'ligar' ? { modulo_id: b.modulo_id || null, ligada: 'manual', ignorada: false } : { ignorada: !!b.ignorada };
    const visivel = !(mud.ignorada ?? x.ignorada) && !!(('modulo_id' in mud) ? mud.modulo_id : x.modulo_id);
    let aviso = null;
    if (x.drive_id) {
      const g = await acessoGoogle();
      if (g && g.token && temPermissaoGravacoes(await contaGoogle())) {
        const l = await liberarNoDrive(g.token, x.drive_id, visivel);
        mud.compartilhada = visivel && l.ok;
        mud.aviso = l.ok ? null : l.aviso || null;
        aviso = mud.aviso;
      }
    }
    const r = await supa(`/rest/v1/gravacoes?id=eq.${b.id}`, { metodo: 'PATCH', prefer: 'return=minimal', corpo: mud });
    if (!r.ok) return json({ mensagem: 'Não consegui salvar.' }, 502);
    return json({ mensagem: b.acao === 'ignorar' ? (mud.ignorada ? 'Pronto: essa gravação não aparece para ninguém.' : 'A gravação voltou.') : (mud.modulo_id ? 'Gravação ligada ao módulo. Os alunos já veem.' : 'Gravação tirada do módulo.'), aviso });
  }

  return json({ mensagem: 'Pedido desconhecido.' }, 400);
};
