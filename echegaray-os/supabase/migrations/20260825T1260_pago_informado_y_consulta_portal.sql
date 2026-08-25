-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE EL CLIENTE NOS DICE — pantalla 29 «Informar transferencia» y «Consultas»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Las dos tablas de acá tienen algo en común que las separa de todas las demás del portal: las
-- escribe EL CLIENTE. Son la única superficie de entrada de un tercero al sistema, y por eso las dos
-- reglas que las gobiernan son las mismas.
--
-- ═══ REGLA 1 · UN PAGO INFORMADO NO ES UN PAGO ═══
--
-- Que el cliente diga «te transferí» no es que el dinero entró. El cobro se da por real cuando
-- aparece en el extracto del banco y alguien lo concilia. Por eso `estado` arranca en `informado` y
-- el único camino a `conciliado` es que Administración lo cruce contra el banco. Si esto escribiera
-- directo en Cobranzas, el cliente estaría moviendo la caja de la empresa desde su teléfono.
--
-- ═══ REGLA 2 · EL CLIENTE ESCRIBE, PERO NO DECIDE ═══
--
-- El cliente puede insertar (informar, consultar) y no puede actualizar nada: ni su propio estado,
-- ni la respuesta, ni el monto una vez informado. Un informe que se puede editar después de que
-- Administración lo miró no sirve como evidencia de nada.

create table if not exists public.pago_informado (
  id                       uuid primary key default gen_random_uuid(),
  cliente_id               uuid not null references public.clientes(id) on delete restrict,
  esquema_pago_id          uuid references public.esquema_pago(id) on delete set null,
  monto                    numeric not null check (monto > 0),
  fecha                    date not null,
  referencia               text,
  comprobante_storage_path text,
  informado_por            uuid references public.cliente_acceso(id) on delete set null,
  at                       timestamptz not null default now(),
  estado                   text not null default 'informado'
                           check (estado in ('informado', 'conciliado', 'rechazado')),
  -- Por qué se rechazó o contra qué se concilió. En castellano, porque lo lee una persona.
  nota_admin               text,
  resuelto_por             uuid references auth.users(id),
  resuelto_at              timestamptz
);

create index if not exists pago_informado_cliente_idx on public.pago_informado (cliente_id, at desc);
create index if not exists pago_informado_pendiente_idx
  on public.pago_informado (at) where estado = 'informado';

comment on table public.pago_informado is
  'Pantalla 29: el cliente avisa que transfirió. NO es un cobro. El cobro se da por real cuando '
  'aparece en el extracto y Administración lo concilia; recién ahí se encola el cobranza_cambio.';

alter table public.pago_informado enable row level security;

drop policy if exists pago_informado_select on public.pago_informado;
create policy pago_informado_select on public.pago_informado
  for select to authenticated
  using ((select public.es_administracion())
         or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())));

drop policy if exists pago_informado_insert on public.pago_informado;
create policy pago_informado_insert on public.pago_informado
  for insert to authenticated
  with check (
    (select public.es_administracion())
    or ((select public.es_cliente())
        and cliente_id = (select public.cliente_de_sesion())
        and estado = 'informado'          -- nadie informa algo ya conciliado
        and resuelto_por is null)
  );

-- Conciliar es de Administración y de nadie más.
drop policy if exists pago_informado_update on public.pago_informado;
create policy pago_informado_update on public.pago_informado
  for update to authenticated
  using ((select public.es_administracion())) with check ((select public.es_administracion()));

grant select on public.pago_informado to authenticated;
grant insert (cliente_id, esquema_pago_id, monto, fecha, referencia, comprobante_storage_path,
              informado_por, estado)
  on public.pago_informado to authenticated;
grant update (estado, nota_admin, resuelto_por, resuelto_at) on public.pago_informado to authenticated;


create table if not exists public.consulta_portal (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete restrict,
  obra_id        text references public.obra_canonica(id) on delete set null,
  acceso_id      uuid references public.cliente_acceso(id) on delete set null,
  titulo         text not null check (btrim(titulo) <> ''),
  cuerpo         text not null check (btrim(cuerpo) <> ''),
  estado         text not null default 'abierta' check (estado in ('abierta', 'respondida', 'cerrada')),
  respuesta      text,
  respondido_por uuid references auth.users(id),
  at             timestamptz not null default now(),
  respondido_at  timestamptz
);

create index if not exists consulta_portal_cliente_idx on public.consulta_portal (cliente_id, at desc);
create index if not exists consulta_portal_abierta_idx on public.consulta_portal (at) where estado = 'abierta';

comment on table public.consulta_portal is
  'Pantalla 29: la consulta que el cliente deja por escrito. El cliente inserta y lee; responder y '
  'cerrar es de Administración.';

alter table public.consulta_portal enable row level security;

drop policy if exists consulta_portal_select on public.consulta_portal;
create policy consulta_portal_select on public.consulta_portal
  for select to authenticated
  using ((select public.es_administracion())
         or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())));

drop policy if exists consulta_portal_insert on public.consulta_portal;
create policy consulta_portal_insert on public.consulta_portal
  for insert to authenticated
  with check (
    (select public.es_administracion())
    or ((select public.es_cliente())
        and cliente_id = (select public.cliente_de_sesion())
        and estado = 'abierta'
        -- Sin esto el cliente podría insertar su consulta YA respondida y dejar dicho por escrito
        -- que la empresa contestó algo que nunca contestó.
        and respuesta is null and respondido_por is null)
  );

drop policy if exists consulta_portal_update on public.consulta_portal;
create policy consulta_portal_update on public.consulta_portal
  for update to authenticated
  using ((select public.es_administracion())) with check ((select public.es_administracion()));

grant select on public.consulta_portal to authenticated;
grant insert (cliente_id, obra_id, acceso_id, titulo, cuerpo, estado) on public.consulta_portal to authenticated;
grant update (estado, respuesta, respondido_por, respondido_at) on public.consulta_portal to authenticated;
