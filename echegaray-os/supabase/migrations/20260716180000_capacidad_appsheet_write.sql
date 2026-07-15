-- CAPACIDAD appsheet.write — el OS puede MODIFICAR datos de la app AppSheet "Pedidos de
-- Materiales" (cambiar estado, agregar pedido) escribiendo en el Sheet de respaldo. Efecto
-- externo: la gente de campo lo ve en vivo → requires_approval (cae en Pendientes, Nivel E).
-- La policy (decide) lee esta fila; sin ella la capacidad no tendría gobierno.
insert into orq.capabilities (slug, domain, description, required_clearance, blast_radius, idempotency, disposition_override, secret_scope)
values
  ('appsheet.write', 'operator', 'Modificar datos de una app AppSheet (estado/alta de pedido) vía su Sheet de respaldo.', 'E', 'high', 'side_effecting', 'requires_approval', 'google')
on conflict (slug) do update
  set disposition_override = excluded.disposition_override,
      required_clearance   = excluded.required_clearance,
      blast_radius         = excluded.blast_radius,
      idempotency          = excluded.idempotency,
      description          = excluded.description,
      enabled              = true,
      updated_at           = now();
