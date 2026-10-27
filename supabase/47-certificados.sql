-- Emissor de certificados (pedido da Juliana em 27/10/2026; especificação em docs/certificados/ESPECIFICACAO.md).
-- Gestão › Emitir certificados, só a administração (a Cintia e as sócias). Uma "pasta" por cliente e programa guarda os dados
-- que vão no certificado; cada certificado emitido tem um código único e aleatório e um RETRATO dos dados usados no PDF
-- (a verificação pública lê o retrato: editar a pasta depois não muda o que já foi emitido).
-- Assinaturas: enviadas uma vez (foto ou escaneamento), viram duas imagens sem fundo (tinta azul-petróleo e bege) e ficam numa lista.
-- Sem CPF. E-mail do aluno é opcional e só interno.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- 1. Assinaturas salvas (reaproveitadas em qualquer pasta). Exclusão é só marcada: certificado já emitido continua com a imagem.
create table if not exists public.cert_assinaturas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                                   -- de quem assina
  cargo text,
  lado text not null default 'mentorei' check (lado in ('mentorei', 'cliente')),   -- assina pela Mentorei ou pelo cliente
  empresa_id uuid references public.empresas (id) on delete set null,              -- cliente da pessoa, quando assina pelo cliente
  original_caminho text,                                -- foto enviada (pasta privada "certificados")
  clara_caminho text not null,                          -- PNG transparente, tinta #0E3B44 (padrão claro)
  escura_caminho text not null,                         -- PNG transparente, tinta #F2EADF (padrão escuro)
  largura integer,
  altura integer,
  autorizacao_confirmada_por uuid references public.perfis (id),
  autorizacao_em timestamptz,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid references public.perfis (id)
);

-- 2. Pastas: uma por cliente e programa
create table if not exists public.cert_pastas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                                   -- "Cliente · Programa · Ano"
  variacao text not null default 'clara' check (variacao in ('clara', 'escura')),
  tipo text not null default 'programa',                -- programa, curso, mentoria, trilha, workshop, formação, imersão, palestra
  curso text not null,                                  -- nome do programa
  empresa_id uuid references public.empresas (id) on delete set null,
  turma_id uuid references public.turmas (id) on delete set null,
  cliente_nome text,
  cliente_logo jsonb,                                   -- { caminho, largura, altura } na pasta pública fotos/logos (o mesmo logo das propostas)
  inicio date,
  fim date,
  periodo_texto text not null,                          -- como sai no certificado
  periodo_manual boolean not null default false,        -- true = texto escrito à mão (não acompanha as datas)
  carga_horas numeric(7, 2) not null check (carga_horas > 0),
  cidade text not null,
  data_emissao date not null,
  resp1_nome text,                                      -- quem assina pela Mentorei
  resp1_cargo text,
  resp1_assinatura_id uuid references public.cert_assinaturas (id),
  mostrar_resp2 boolean not null default false,         -- segunda assinatura (em geral, pelo cliente)
  resp2_nome text,
  resp2_cargo text,
  resp2_assinatura_id uuid references public.cert_assinaturas (id),
  modulos jsonb not null default '[]'::jsonb,           -- [{ titulo, descricao, horas }] na ordem
  origem jsonb not null default '{}'::jsonb,            -- { tipo: arquivo|trilha|manual, nome_arquivo, turma_id, arquivo_caminho }
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id),
  atualizado_em timestamptz not null default now()
);

-- 3. Lotes: cada vez que se gera um grupo de PDFs (emissão nova, gerar de novo, corrigir um nome)
create table if not exists public.cert_lotes (
  id uuid primary key default gen_random_uuid(),
  pasta_id uuid not null references public.cert_pastas (id) on delete cascade,
  tipo text not null default 'emissao' check (tipo in ('emissao', 'regerar')),
  certificados uuid[] not null default '{}',            -- quais certificados este lote gera
  quantidade integer not null default 0,
  feitos integer not null default 0,
  status text not null default 'fila' check (status in ('fila', 'gerando', 'pronto', 'erro')),
  erro text,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  terminado_em timestamptz
);

-- 4. Certificados emitidos
create table if not exists public.cert_certificados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,                          -- MTR-26-7KQ4-9XPA (aleatório, nunca sequencial)
  pasta_id uuid not null references public.cert_pastas (id),
  lote_id uuid references public.cert_lotes (id) on delete set null,
  numero integer,                                       -- ordem na lista importada (001, 002...)
  participante text not null,
  email text,                                           -- opcional, só interno; nunca aparece na verificação
  status text not null default 'valido' check (status in ('valido', 'cancelado')),
  sem_assinatura boolean not null default false,        -- gerado sem a imagem da assinatura (versão para conferir)
  dados_snapshot jsonb not null,                        -- retrato dos dados usados no PDF; a verificação lê daqui
  pdf_caminho text,                                     -- PDF pronto na pasta privada "certificados" (apagado depois de 45 dias; gera de novo igual)
  pdf_em timestamptz,
  emitido_em timestamptz not null default now(),
  emitido_por uuid references public.perfis (id) default auth.uid(),
  cancelado_em timestamptz,
  cancelado_por uuid references public.perfis (id),
  motivo_cancelamento text,
  anonimizado_em timestamptz,                           -- pedido de remoção (LGPD): nome trocado no retrato
  historico jsonb not null default '[]'::jsonb          -- correções de nome, cancelamentos, reativações, novas versões
);
create index if not exists cert_certificados_pasta on public.cert_certificados (pasta_id);
create index if not exists cert_lotes_pasta on public.cert_lotes (pasta_id);

-- 5. Só a administração lê e muda (a verificação pública passa pela função do servidor, nunca direto)
alter table public.cert_assinaturas enable row level security;
alter table public.cert_pastas enable row level security;
alter table public.cert_lotes enable row level security;
alter table public.cert_certificados enable row level security;
drop policy if exists cert_assinaturas_admin on public.cert_assinaturas;
create policy cert_assinaturas_admin on public.cert_assinaturas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists cert_pastas_admin on public.cert_pastas;
create policy cert_pastas_admin on public.cert_pastas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists cert_lotes_admin on public.cert_lotes;
create policy cert_lotes_admin on public.cert_lotes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists cert_certificados_admin on public.cert_certificados;
create policy cert_certificados_admin on public.cert_certificados for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop trigger if exists cert_pastas_atualizado on public.cert_pastas;
create trigger cert_pastas_atualizado before update on public.cert_pastas for each row execute function public.marcar_atualizacao();
drop trigger if exists hist_cert_pastas on public.cert_pastas;
create trigger hist_cert_pastas after insert or update or delete on public.cert_pastas for each row execute function public.registrar_historico();
drop trigger if exists hist_cert_assinaturas on public.cert_assinaturas;
create trigger hist_cert_assinaturas after insert or update or delete on public.cert_assinaturas for each row execute function public.registrar_historico();

-- 6. Código novo: 8 letras e números sorteados (sem 0, 1, I e O), com o sorteio criptográfico do banco (gen_random_uuid).
--    Dos 16 bytes do uuid, usa os que são sorteio puro (6 e 8 guardam a versão); 256 é múltiplo de 32, então nenhuma letra pesa mais.
create or replace function public.cert_novo_codigo() returns text
language plpgsql volatile set search_path = public as $$
declare
  alfa constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea; s text; i int; c text;
  pos constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10];
begin
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    s := '';
    foreach i in array pos loop s := s || substr(alfa, (get_byte(b, i) % 32) + 1, 1); end loop;
    c := 'MTR-' || to_char(now() at time zone 'America/Sao_Paulo', 'YY') || '-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
    exit when not exists (select 1 from cert_certificados where codigo = c);
  end loop;
  return c;
end $$;

-- 7. Emitir: cria o lote e um certificado por nome, tudo de uma vez (se algo falhar, nada fica pela metade).
--    p_dados = retrato dos dados da pasta (sem nome e sem código); cada certificado recebe o próprio nome e código no retrato.
create or replace function public.cert_emitir(p_pasta uuid, p_nomes text[], p_dados jsonb, p_sem_assinatura boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lote uuid; v_ids uuid[] := '{}'; v_id uuid; v_cod text; v_nome text; v_n int := 0; v_base int;
begin
  if not eh_admin() then raise exception 'Só a administração emite certificados.'; end if;
  if coalesce(array_length(p_nomes, 1), 0) = 0 then raise exception 'A lista de nomes está vazia.'; end if;
  if array_length(p_nomes, 1) > 500 then raise exception 'No máximo 500 nomes por vez.'; end if;
  if not exists (select 1 from cert_pastas where id = p_pasta) then raise exception 'Pasta não encontrada.'; end if;
  select coalesce(max(numero), 0) into v_base from cert_certificados where pasta_id = p_pasta;
  insert into cert_lotes (pasta_id, tipo, quantidade, criado_por) values (p_pasta, 'emissao', array_length(p_nomes, 1), auth.uid()) returning id into v_lote;
  foreach v_nome in array p_nomes loop
    v_nome := btrim(regexp_replace(replace(v_nome, chr(160), ' '), '\s+', ' ', 'g'));
    if v_nome = '' then continue; end if;
    v_n := v_n + 1;
    loop
      v_cod := cert_novo_codigo();
      begin
        insert into cert_certificados (codigo, pasta_id, lote_id, numero, participante, sem_assinatura, dados_snapshot, emitido_por)
        values (v_cod, p_pasta, v_lote, v_base + v_n, v_nome, coalesce(p_sem_assinatura, false),
                p_dados || jsonb_build_object('participante', v_nome, 'codigo', v_cod), auth.uid())
        returning id into v_id;
        exit;
      exception when unique_violation then
        -- sorteio repetido ao mesmo tempo em outra emissão: sorteia de novo
      end;
    end loop;
    v_ids := v_ids || v_id;
  end loop;
  if v_n = 0 then raise exception 'A lista de nomes está vazia.'; end if;
  update cert_lotes set certificados = v_ids, quantidade = v_n where id = v_lote;
  return v_lote;
end $$;
revoke all on function public.cert_emitir(uuid, text[], jsonb, boolean) from public, anon;
grant execute on function public.cert_emitir(uuid, text[], jsonb, boolean) to authenticated;
revoke all on function public.cert_novo_codigo() from public, anon, authenticated;

-- 8. Pasta privada dos arquivos (só a administração): "certificados/assinaturas/...", "certificados/pdf/<pasta>/<código>.pdf",
--    "certificados/propostas/..." (arquivo lido pela IA). Os logos dos clientes ficam na pasta pública fotos/logos (como nas propostas).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados', 'certificados', false, 26214400, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

drop policy if exists certificados_admin_ler on storage.objects;
create policy certificados_admin_ler on storage.objects for select to authenticated using (bucket_id = 'certificados' and public.eh_admin());
drop policy if exists certificados_admin_enviar on storage.objects;
create policy certificados_admin_enviar on storage.objects for insert to authenticated with check (bucket_id = 'certificados' and public.eh_admin());
drop policy if exists certificados_admin_trocar on storage.objects;
create policy certificados_admin_trocar on storage.objects for update to authenticated using (bucket_id = 'certificados' and public.eh_admin());
drop policy if exists certificados_admin_apagar on storage.objects;
create policy certificados_admin_apagar on storage.objects for delete to authenticated using (bucket_id = 'certificados' and public.eh_admin());

notify pgrst, 'reload schema';
