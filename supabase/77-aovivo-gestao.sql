-- Mentorei Ao Vivo · Gestão › Aulas ao vivo e lembrete das percepções (pedido da Juliana, 15/11/2026). RODADO pelo Claude pelo
-- conector no mesmo dia (migrações aovivo_18_gestao e aovivo_19_painel_modulo). O texto completo das funções está no banco.
-- Decisões dela: o Ao Vivo não cria aula sozinho; o mentor entra só pelo módulo dele (aovivo_do_modulo); as sócias e a Cintia
-- (administração) veem todas as aulas em Gestão › Aulas ao vivo, procuram por mentor ou cliente e criam aula avulsa quando quiserem.
-- Ao encerrar a aula de um módulo, o painel lembra o mentor de colocar as percepções na plataforma.

alter table public.aovivo_sessoes
  add column if not exists criado_por uuid,                                                   -- quem criou pela plataforma
  add column if not exists empresa_id uuid references public.empresas(id) on delete set null, -- cliente da aula avulsa
  add column if not exists escondida_em timestamptz;                                          -- "Esconder da lista" (nada é apagado)

-- o site do Ao Vivo deixa de criar e de copiar aula (antes qualquer pessoa com o link criava)
revoke execute on function public.aovivo_criar_sessao(text, boolean, text[]) from public, anon, authenticated;
revoke execute on function public.aovivo_duplicar(uuid, text, text) from public, anon, authenticated;

-- aovivo_do_modulo: igual à do script 73, gravando criado_por = auth.uid() quando cria a aula do módulo.
-- Novas, todas security definer e só administração (eh_admin), grant só para authenticated:
--   aovivo_gestao_lista()                       todas as aulas: módulo, turma, cliente (da turma ou empresa_id), mentores do módulo,
--                                               criado_por, alunos, atividades, slides, respostas, chave (para abrir o painel)
--   aovivo_gestao_nova(p_titulo, p_empresa)     aula avulsa (sem módulo)
--   aovivo_gestao_copiar(p_sessao)              cópia avulsa com os mesmos slides e atividades, placar zerado
--   aovivo_gestao_ligar(p_sessao, p_modulo)     liga ao módulo (a aula que era dele fica avulsa); p_modulo null = desliga
--   aovivo_gestao_esconder(p_sessao, p_esconder)
-- aovivo_painel: devolve também modulo_id e percepcoes_em (lembrete do fim da aula e botão "← Plataforma").
