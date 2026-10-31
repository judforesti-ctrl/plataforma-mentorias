-- Tutoriais em vídeo (31/10/2026, pedido da Juliana): séries por público (mentor, aluno, mentorado, RH, administração),
-- página "Tutoriais" no menu, "assistido" por pessoa, e os vídeos de boas-vindas que podem ir junto com o convite.
-- 1. tutoriais: um vídeo por linha (série + número), título e frase do que a pessoa aprende; o arquivo fica na pasta pública
--    "tutoriais" (vídeos com dados de mentira; o convidado assiste antes de ter senha). Só a administração muda.
-- 2. tutoriais_vistos: quem já assistiu cada vídeo.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- 1. Os tutoriais
create table if not exists public.tutoriais (
  id uuid primary key default gen_random_uuid(),
  serie text not null check (serie in ('mentor', 'aluno', 'mentorado', 'rh', 'admin')),
  numero int not null check (numero > 0),
  titulo text not null check (length(titulo) between 1 and 120),
  descricao text check (descricao is null or length(descricao) <= 300),
  duracao_seg int check (duracao_seg is null or duracao_seg >= 0),
  video text,                          -- caminho na pasta "tutoriais" (vazio = vídeo ainda não enviado)
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (serie, numero)
);

alter table public.tutoriais enable row level security;
drop policy if exists admin_tudo on public.tutoriais;
create policy admin_tudo on public.tutoriais for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists todos_leem on public.tutoriais;
create policy todos_leem on public.tutoriais for select to authenticated using (ativo);

-- os vídeos que já estão prontos (o arquivo de cada um a administração envia na página Tutoriais)
insert into public.tutoriais (serie, numero, titulo, descricao) values
  ('mentor', 1, 'Primeiro acesso', 'Criar a senha, aceitar o termo e assinar o contrato.'),
  ('mentor', 2, 'Seu perfil e sua foto', 'Montar o perfil que o mentorado lê antes da primeira sessão.'),
  ('mentor', 3, 'Mentoria em grupo', 'Preparar a aula (slides, QR code, ferramentas) e fechar a aula (percepções e foto).'),
  ('mentor', 4, 'Mentoria individual', 'Da agenda ao fim da sessão: trilha, anotações, resumo com IA e tarefas.'),
  ('mentor', 5, 'Notas fiscais e pagamento', 'Conferir o extrato do mês, emitir e enviar a nota, e saber quando recebe.'),
  ('aluno', 1, 'Primeiro acesso', 'Abrir o convite, criar a senha e aceitar o termo.'),
  ('aluno', 2, 'Sua trilha e as aulas', 'Ver os módulos, entrar na aula e pôr as aulas na agenda do celular.'),
  ('aluno', 3, 'Materiais, ferramentas e tarefas', 'Baixar os slides, fazer as ferramentas, enviar a tarefa feita e ver a gravação.'),
  ('aluno', 4, 'Avaliar a aula e acompanhar sua participação', 'Avaliar pelo QR code e ver a presença e os combinados cumpridos.')
on conflict (serie, numero) do nothing;

-- 2. Quem já assistiu
create table if not exists public.tutoriais_vistos (
  perfil_id uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  tutorial_id uuid not null references public.tutoriais (id) on delete cascade,
  visto_em timestamptz not null default now(),
  primary key (perfil_id, tutorial_id)
);
alter table public.tutoriais_vistos enable row level security;
drop policy if exists admin_ler on public.tutoriais_vistos;
create policy admin_ler on public.tutoriais_vistos for select to authenticated using (eh_admin());
drop policy if exists proprio_ler on public.tutoriais_vistos;
create policy proprio_ler on public.tutoriais_vistos for select to authenticated using (perfil_id = auth.uid());
drop policy if exists proprio_marcar on public.tutoriais_vistos;
create policy proprio_marcar on public.tutoriais_vistos for insert to authenticated with check (perfil_id = auth.uid());
drop policy if exists proprio_remarcar on public.tutoriais_vistos;
create policy proprio_remarcar on public.tutoriais_vistos for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- 3. Pasta pública dos vídeos (até 50 MB cada, só MP4); só a administração envia, troca e apaga
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutoriais', 'tutoriais', true, 52428800, array['video/mp4'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['video/mp4'];

drop policy if exists tutoriais_admin_enviar on storage.objects;
create policy tutoriais_admin_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'tutoriais' and public.eh_admin());
drop policy if exists tutoriais_admin_trocar on storage.objects;
create policy tutoriais_admin_trocar on storage.objects for update to authenticated
  using (bucket_id = 'tutoriais' and public.eh_admin());
drop policy if exists tutoriais_admin_apagar on storage.objects;
create policy tutoriais_admin_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'tutoriais' and public.eh_admin());
