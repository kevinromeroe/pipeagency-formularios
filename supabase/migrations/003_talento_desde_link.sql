-- El cliente solo envía cliente + link. El talento se deduce del link (o al medir la publicación).
alter table public.form_envios alter column talento_id drop not null;
alter table public.form_envios add column if not exists talento_handle text;   -- @ detectado en el link
