-- ============================================================================
-- CAPACIDADES de GMAIL y CALENDAR (escritura) — decisión del dueño: leer/borrador/archivar
-- son AUTOMÁTICOS (reversibles, internos); enviar/papelera/eventos que invitan a terceros
-- pasan por APROBACIÓN (Nivel E, caen en Pendientes). mail.send ya existía (requires_approval).
-- La policy (decide) lee estas filas; sin ellas, la capacidad quedaría sin gobierno.
-- ============================================================================

insert into orq.capabilities (slug, domain, description, required_clearance, blast_radius, idempotency, disposition_override, secret_scope)
values
  ('mail.draft',      'operator', 'Crear un borrador de mail (no envía; reversible).',            'C', 'low',  'idempotent',     'auto',              'google'),
  ('mail.modify',     'operator', 'Archivar/etiquetar un mail (reversible, interno).',            'C', 'low',  'idempotent',     'auto',              'google'),
  ('mail.trash',      'operator', 'Mandar un mail a la papelera (reversible 30 días).',           'D', 'medium','side_effecting', 'requires_approval', 'google'),
  ('calendar.write',  'operator', 'Crear o editar un evento de calendario (puede invitar a terceros).', 'E', 'high', 'side_effecting', 'requires_approval', 'google'),
  ('calendar.delete', 'operator', 'Borrar un evento de calendario (avisa a los invitados).',      'E', 'high', 'side_effecting', 'requires_approval', 'google')
on conflict (slug) do update
  set disposition_override = excluded.disposition_override,
      required_clearance   = excluded.required_clearance,
      blast_radius         = excluded.blast_radius,
      idempotency          = excluded.idempotency,
      description          = excluded.description,
      enabled              = true,
      updated_at           = now();
