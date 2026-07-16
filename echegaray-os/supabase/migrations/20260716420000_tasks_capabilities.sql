-- Google Tasks para el OS: capacidades de leer/escribir las tareas (pendientes) del dueño.
-- Crear/completar una tarea es INTERNO y reversible (no notifica a nadie, no sale de su cuenta)
-- → disposición 'auto', igual que crear un borrador o etiquetar un mail. Sin registrar, la
-- policy las trata como 'forbidden' (default seguro). Idempotente.
insert into orq.capabilities (slug, domain, description, required_clearance, blast_radius, idempotency, disposition_override, enabled)
values
  ('tasks.read',  'operator', 'Leer las listas y tareas (pendientes) de Google Tasks del dueño.',           'A', 'none', 'idempotent',     null,   true),
  ('tasks.write', 'operator', 'Crear, completar o borrar tareas de Google Tasks. Interno y reversible.',     'C', 'low',  'idempotent',     'auto', true)
on conflict (slug) do nothing;
