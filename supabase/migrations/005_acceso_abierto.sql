-- La agencia entra con el enlace limpio (pipeagency.datalitica.com.co), sin código en la URL.
-- La protección queda en Turnstile, el límite de envíos y la validación de links.
alter table public.form_agencias add column if not exists acceso_abierto boolean not null default false;
update public.form_agencias set acceso_abierto = true where slug = 'felipe';
