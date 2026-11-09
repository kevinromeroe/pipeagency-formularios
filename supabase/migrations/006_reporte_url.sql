-- Enlace al reporte de cada cliente (vacío = en preparación)
alter table public.form_cuentas add column if not exists reporte_url text;
update public.form_cuentas set reporte_url = 'https://influencermarketing.datalitica.com.co/2026-10/' where slug = 'lci';
