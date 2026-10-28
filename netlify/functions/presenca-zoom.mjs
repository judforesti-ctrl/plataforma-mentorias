// Presença dos alunos (script 49): lista de quem entrou na reunião do Zoom do módulo, lida das contas do Zoom ligadas.
// Só devolve a lista (nome, e-mail, minutos): a tela liga cada pessoa a um aluno, mostra para conferir e só então grava.
// Pode pedir: a administração e o mentor do módulo.
import { json, quemPede, supa } from '../lib/google.mjs';
import { participantesDaReuniao } from '../lib/zoom.mjs';

export const config = { path: '/api/presenca-zoom', method: 'POST' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  const eu = await quemPede(req);
  if (!eu) return json({ mensagem: 'Faça login de novo.' }, 401);
  let b = {}; try { b = await req.json(); } catch (_) { return json({ mensagem: 'Pedido inválido.' }, 400); }
  if (!UUID.test(String(b.modulo_id || ''))) return json({ mensagem: 'Módulo inválido.' }, 400);
  if (eu.papel !== 'admin') {
    const m = await supa(`/rest/v1/modulo_mentores?modulo_id=eq.${b.modulo_id}&mentor_id=eq.${eu.id}&select=mentor_id`);
    if (!(m.ok && m.dados && m.dados[0])) return json({ mensagem: 'Só a administração e o mentor do módulo fazem a chamada.' }, 403);
  }
  const r = await supa(`/rest/v1/modulos?id=eq.${b.modulo_id}&select=link,data_hora,formato`);
  const mod = r.ok && r.dados && r.dados[0];
  if (!mod) return json({ mensagem: 'Módulo não encontrado.' }, 404);
  if (mod.data_hora && Date.parse(mod.data_hora) > Date.now()) return json({ mensagem: 'A aula ainda não aconteceu: a lista do Zoom fica pronta depois que a reunião termina.' }, 400);
  try {
    const p = await participantesDaReuniao({ link: mod.link, dataHora: mod.data_hora });
    if (!p.ok) return json({ mensagem: p.mensagem }, 400);
    return json({ conta: p.conta, inicio: p.inicio, participantes: p.linhas });
  } catch (e) {
    console.error('presenca-zoom', e);
    return json({ mensagem: 'Não consegui falar com o Zoom agora. Tente de novo daqui a pouco ou importe a lista por arquivo.' }, 502);
  }
};
