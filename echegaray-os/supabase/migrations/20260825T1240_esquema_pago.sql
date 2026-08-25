-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ESQUEMA DE PAGO — pantalla 32 «El admin arma las fechas y publica al portal»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Una fila por PAGO del esquema. La pantalla 32 es la que el dueño usa para acordar con el cliente
-- «esto se cobra el 15, esto el 30», y después publicarlo para que el cliente lo vea en el portal.
--
-- ═══ LA MITAD DE ESTA TABLA NO ES SUYA ═══
--
-- Hay dos clases de columnas y confundirlas rompe la realidad única:
--
--   PRESTADAS de Cobranzas  →  fecha, monto, medio, estado
--       Son un ESPEJO de la fila del Sheet (columnas Q, J, N, O). El Sheet manda. Editarlas en la
--       app NO las escribe acá y ya: encola un `cobranza_cambio`, el worker escribe la celda del
--       Sheet, el sync vuelve y las refresca. Si la app las escribiera directo, existirían dos
--       fechas de cobro distintas para el mismo pago y ninguna de las dos sería la verdad.
--
--   PROPIAS de la app       →  visible_portal, aviso_dias, mostrar_reprogramaciones, nota_interna,
--                              orden, publicado_at, cambio_pendiente
--       No existen en el Sheet y no tienen por qué existir: son cómo se le muestra esto al cliente.
--       El sync NUNCA las toca.
--
-- Esa frontera es la razón de que `cobranza_fila` pueda ser NULL: un pago PREVISTO que todavía no
-- tiene fila en Cobranzas es legítimo (el dueño lo acordó pero no lo facturó). Cuando aparezca la
-- fila, el sync la ata.
create table if not exists public.esquema_pago (
  id                       uuid primary key default gen_random_uuid(),
  cliente_id               uuid not null references public.clientes(id) on delete restrict,
  obra_id                  text references public.obra_canonica(id) on delete set null,

  -- NULL = previsto sin fila en Cobranzas todavía. Ver arriba. Sin FK por la misma razón que en
  -- certificado_cliente: el sync borra y reinserta public.cobranzas entera.
  cobranza_fila            integer,
  huella_comprobante       text,
  huella_monto             numeric,

  concepto                 text not null,
  fecha                    date,
  monto                    numeric not null,
  reparo                   numeric,

  -- Los cinco estados son los que la pantalla 32 pinta. `retenido` es el fondo de reparo esperando
  -- la recepción definitiva: no está vencido ni por vencer, está retenido a propósito, y meterlo en
  -- «vencido» haría ver una mora que no existe.
  estado                   text not null default 'previsto'
                           check (estado in ('cobrado', 'a_vencer', 'vencido', 'previsto', 'retenido')),
  medio                    text check (medio is null or medio in ('transferencia', 'cheque', 'efectivo')),

  -- ── PROPIAS DE LA APP ──
  visible_portal           boolean not null default false,
  aviso_dias               integer check (aviso_dias is null or aviso_dias >= 0),
  mostrar_reprogramaciones boolean not null default false,
  nota_interna             text,
  -- Historial de fechas: [{de, a, at, motivo}]. Se guarda SIEMPRE, y `mostrar_reprogramaciones`
  -- decide sólo si el cliente lo ve. Guardar únicamente cuando se muestra sería perder la evidencia
  -- de cuántas veces se movió una fecha, que es justo lo que hay que poder mirar al recotizar.
  reprogramaciones         jsonb not null default '[]'::jsonb,
  publicado_at             timestamptz,
  -- Hay ediciones que el cliente todavía no vio. Lo pone la app al editar y lo baja «Publicar».
  cambio_pendiente         boolean not null default false,
  orden                    integer not null default 0,

  origen                   text not null default 'os' check (origen in ('sync_cobranzas', 'os')),
  sincronizado_en          timestamptz,
  creado_at                timestamptz not null default now(),
  actualizado_at           timestamptz not null default now()
);

-- Idempotencia del sync: una fila de Cobranzas produce como máximo UN pago del esquema. Parcial
-- porque el previsto sin fila tiene NULL y un UNIQUE con NULLs no restringe nada.
create unique index if not exists esquema_pago_cobranza_fila_idx
  on public.esquema_pago (cobranza_fila) where cobranza_fila is not null;

create index if not exists esquema_pago_cliente_idx
  on public.esquema_pago (cliente_id, orden, fecha);

comment on table public.esquema_pago is
  'Pantalla 32. fecha/monto/medio/estado son ESPEJO de las columnas Q/J/N/O de la pestaña Cobranzas: '
  'editarlas encola un cobranza_cambio, no se escriben acá. visible_portal/aviso_dias/nota_interna/'
  'orden/publicado_at son propias de la app y el sync no las toca nunca.';
comment on column public.esquema_pago.reprogramaciones is
  'Historial [{de,a,at,motivo}]. Se guarda siempre; mostrar_reprogramaciones decide sólo si el '
  'cliente lo ve. Es la evidencia de cuántas veces se movió una fecha.';
comment on column public.esquema_pago.estado is
  'retenido = fondo de reparo esperando recepción definitiva. No es mora: contarlo como vencido '
  'inventa una deuda que el cliente no tiene.';

alter table public.esquema_pago enable row level security;

-- El cliente ve SÓLO lo publicado y marcado visible. Un esquema a medio armar no puede filtrarse al
-- portal: la fecha que el dueño está tanteando no es una fecha comprometida con el cliente.
drop policy if exists esquema_pago_select on public.esquema_pago;
create policy esquema_pago_select on public.esquema_pago
  for select to authenticated
  using (
    (select public.es_administracion())
    or (
      (select public.es_cliente())
      and cliente_id = (select public.cliente_de_sesion())
      and visible_portal
      and publicado_at is not null
      and exists (
        select 1 from public.cliente_acceso a
         where a.auth_user_id = (select auth.uid())
           and a.revocado_at is null
           and a.puede_ver_obra
           and (a.obras is null or obra_id = any (a.obras))
      )
    )
  );

drop policy if exists esquema_pago_escribe on public.esquema_pago;
create policy esquema_pago_escribe on public.esquema_pago
  for all to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

grant select on public.esquema_pago to authenticated;
grant insert (cliente_id, obra_id, cobranza_fila, huella_comprobante, huella_monto, concepto, fecha,
              monto, reparo, estado, medio, visible_portal, aviso_dias, mostrar_reprogramaciones,
              nota_interna, reprogramaciones, orden, origen)
  on public.esquema_pago to authenticated;
-- `fecha`, `monto`, `medio` y `estado` NO se pueden UPDATE desde la app: son espejo del Sheet y se
-- cambian encolando. Que estén afuera de este grant es lo que hace imposible el atajo — una server
-- action distraída que intente escribirlas rebota con permission denied en vez de crear una segunda
-- verdad silenciosa.
grant update (visible_portal, aviso_dias, mostrar_reprogramaciones, nota_interna, orden,
              publicado_at, cambio_pendiente, concepto, reparo, actualizado_at)
  on public.esquema_pago to authenticated;
