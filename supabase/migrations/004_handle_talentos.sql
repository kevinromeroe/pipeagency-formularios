-- @ de cada talento para enlazar automáticamente los envíos
alter table public.form_talentos add column if not exists handle text;
update public.form_talentos set handle = v.h from (values
  ('Una Reina del Drama','unareinadeldrama'), ('Esteban Go','estebango__'), ('Juliana Jurado','zambo.design')
) as v(n,h) where form_talentos.nombre = v.n;
update public.form_envios e set talento_handle = t.handle from public.form_talentos t
  where e.talento_id = t.id and e.talento_handle is null;
