-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ HICIERON EN EL PORTAL — pantalla 31, bloque «Actividad»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Es un LIBRO DE HECHOS, append-only. No tiene UPDATE ni DELETE por policy y eso es deliberado: la
-- pregunta que responde («¿el cliente aprobó este certificado, y cuándo?») tiene valor contractual.
-- Un registro de aprobación que se puede editar después no prueba nada.
--
-- ═══ POR QUÉ `referencia` ES TEXTO Y NO UNA FK ═══
--
-- Un mismo renglón de actividad puede apuntar a un certificado, a una factura, a una obra o a una
-- consulta. Una FK obligaría a cuatro columnas nullables (y a un CHECK para que sólo una esté
-- llena), o a borrar el renglón cuando se borre lo apuntado — que es exactamente lo que un libro de
-- hechos no puede hacer. El precio es que `referencia` no valida sola; se paga porque el registro
-- tiene que sobrevivir a lo que describe.
create table if not exists public.cliente_actividad_portal (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete restrict,
  -- El acceso puede ser NULL para hechos que no los produjo una persona del cliente: `habilitado`
  -- lo produce Administración desde adentro. Sin el NULL habría que inventar un acceso falso para
  -- poder registrar la habilitación, que es el hecho más importante de todos.
  acceso_id   uuid references public.cliente_acceso(id) on delete set null,
  tipo        text not null check (tipo in (
                'aprobo_certificado', 'observo_certificado', 'descargo_factura',
                'habilitado', 'ingreso', 'consulta', 'informo_transferencia')),
  referencia  text,
  detalle     text,
  monto       numeric,
  at          timestamptz not null default now()
);

create index if not exists cliente_actividad_portal_cliente_idx
  on public.cliente_actividad_portal (cliente_id, at desc);

comment on table public.cliente_actividad_portal is
  'Libro append-only de lo que pasó en el portal (pantalla 31). Sin UPDATE ni DELETE por policy: una '
  'aprobación de certificado que se puede editar después no prueba nada.';

alter table public.cliente_actividad_portal enable row level security;

-- Administración lo ve entero. El cliente ve SÓLO lo de su propio cliente_id — sirve para que el
-- portal le muestre «aprobaste el Certificado 4 el 12/08» sin exponerle la actividad de otro cliente.
drop policy if exists cliente_actividad_portal_select on public.cliente_actividad_portal;
create policy cliente_actividad_portal_select on public.cliente_actividad_portal
  for select to authenticated
  using ((select public.es_administracion())
         or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())));

-- El cliente PUEDE insertar, pero sólo hechos suyos y sólo de los tipos que él produce. Sin la lista
-- acotada podría escribir un renglón `habilitado` y ensuciar el rastro de quién le abrió la puerta.
drop policy if exists cliente_actividad_portal_insert on public.cliente_actividad_portal;
create policy cliente_actividad_portal_insert on public.cliente_actividad_portal
  for insert to authenticated
  with check (
    (select public.es_administracion())
    or ((select public.es_cliente())
        and cliente_id = (select public.cliente_de_sesion())
        and tipo in ('aprobo_certificado', 'observo_certificado', 'descargo_factura',
                     'consulta', 'informo_transferencia'))
  );

grant select on public.cliente_actividad_portal to authenticated;
grant insert (cliente_id, acceso_id, tipo, referencia, detalle, monto)
  on public.cliente_actividad_portal to authenticated;
