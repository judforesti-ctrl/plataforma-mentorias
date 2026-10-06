-- Plataforma de Mentorias Mentorei · convites da equipe inicial
-- Rodar depois do 01-estrutura.sql: SQL Editor → colar tudo → Run.
-- Quando cada pessoa entrar pela primeira vez com este e-mail, o perfil nasce com o papel abaixo.

insert into public.convites (email, papel, tambem_mentor, nome) values
  ('contato@mentorei.com.br',        'admin',  false, 'Cintia'),
  ('judforesti@gmail.com',           'admin',  true,  'Juliana'),
  ('claudia@mentorei.com.br',        'mentor', false, 'Cláudia'),
  ('isaac.abreu.amaral@hotmail.com', 'mentor', false, 'Isaac'),
  ('lorena.lolara@gmail.com',        'mentor', false, 'Lorena'),
  ('luciane_patricio@hotmail.com',   'mentor', false, 'Luciane'),
  ('vivisotoriva@cappellesso.com',   'mentor', false, 'Viviane')
on conflict (email) do update
  set papel = excluded.papel, tambem_mentor = excluded.tambem_mentor, nome = excluded.nome;
