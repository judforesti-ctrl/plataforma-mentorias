-- Propostas geradas pela IA (Vendas): a proposta ganha um ciclo de vida (gerando → rascunho → aprovada → enviada),
-- guarda o pedido (briefing), o conteúdo organizado pela IA (editável na tela) e o PowerPoint montado no modelo da Mentorei,
-- que fica na pasta privada "propostas" do Storage. Ao marcar como enviada, a tela agenda o retorno para 4 dias depois.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. Novas colunas da proposta
alter table public.propostas add column if not exists status text not null default 'enviada'
  check (status in ('gerando', 'rascunho', 'aprovada', 'enviada', 'erro'));                 -- as já registradas contam como enviadas
alter table public.propostas add column if not exists pedido text;                          -- o briefing / prompt colado
alter table public.propostas add column if not exists ajustes text;                         -- último pedido de ajuste feito à IA
alter table public.propostas add column if not exists conteudo jsonb;                       -- conteúdo da proposta (IA + edições)
alter table public.propostas add column if not exists avisos jsonb;                         -- textos que passaram do tamanho da página
alter table public.propostas add column if not exists arquivo_storage text;                 -- caminho do .pptx na pasta "propostas"
alter table public.propostas add column if not exists erro text;
alter table public.propostas add column if not exists aprovada_em timestamptz;
alter table public.propostas add column if not exists aprovada_por uuid references public.perfis (id) on delete set null;
alter table public.propostas add column if not exists enviada_por uuid references public.perfis (id) on delete set null;
alter table public.propostas add column if not exists enviada_para uuid references public.contatos (id) on delete set null;
alter table public.propostas add column if not exists canal text check (canal in ('email', 'whatsapp', 'outro'));
alter table public.propostas add column if not exists mensagem text;                        -- a mensagem que foi junto com o arquivo
alter table public.propostas add column if not exists atualizado_em timestamptz not null default now();

drop trigger if exists propostas_atualizado on public.propostas;
create trigger propostas_atualizado before update on public.propostas for each row execute function public.marcar_atualizacao();
drop trigger if exists hist_propostas on public.propostas;
create trigger hist_propostas after insert or update or delete on public.propostas for each row execute function public.registrar_historico();

-- 2. Pasta privada dos arquivos: "propostas/<id da oportunidade>/<arquivo>.pptx" (só a administração)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('propostas', 'propostas', false, 26214400, array[
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/pdf'])
on conflict (id) do nothing;

drop policy if exists propostas_admin_ler on storage.objects;
create policy propostas_admin_ler on storage.objects for select to authenticated using (bucket_id = 'propostas' and public.eh_admin());
drop policy if exists propostas_admin_enviar on storage.objects;
create policy propostas_admin_enviar on storage.objects for insert to authenticated with check (bucket_id = 'propostas' and public.eh_admin());
drop policy if exists propostas_admin_trocar on storage.objects;
create policy propostas_admin_trocar on storage.objects for update to authenticated using (bucket_id = 'propostas' and public.eh_admin());
drop policy if exists propostas_admin_apagar on storage.objects;
create policy propostas_admin_apagar on storage.objects for delete to authenticated using (bucket_id = 'propostas' and public.eh_admin());

-- 3. Modelo de mensagem para o envio do arquivo (a IA também sugere uma mensagem própria para cada proposta)
insert into public.modelos_mensagem (nome, canal, etapa, assunto, texto, ordem)
select 'Envio da proposta (arquivo)', 'email', 'proposta', 'Proposta Mentorei · {empresa}',
  E'Olá, {contato}!\n\nConforme conversamos, segue em anexo a proposta de {servico} da Mentorei para a {empresa}.\n\nNela você encontra o que entendemos da demanda, a jornada proposta, a metodologia e o investimento. Fico à disposição para ajustar o que for preciso.\n\nUm abraço,\n{responsavel}', 7
where not exists (select 1 from public.modelos_mensagem where nome = 'Envio da proposta (arquivo)');

notify pgrst, 'reload schema';
commit;
