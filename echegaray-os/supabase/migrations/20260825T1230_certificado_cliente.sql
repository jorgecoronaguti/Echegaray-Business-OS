-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL CERTIFICADO QUE VE EL CLIENTE — pantallas 28 / 29 / 32
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ ESTA TABLA NO ES UNA SEGUNDA VERDAD DEL COBRO ═══
--
-- La verdad del cobro sigue siendo la fila de la pestaña Cobranzas del Sheet «Flujo de Caja - Cash
-- Flow», y su réplica viva en `public.cobranzas` (la singular `public.cobranza` está fósil desde el 20/07). Acá vive la CARA DEL CLIENTE de ese mismo hecho: el
-- número de certificado, el período, el avance, el fondo de reparo y —lo único genuinamente nuevo—
-- el estado de aprobación del cliente, que en el Sheet no existe porque el Sheet no tiene portal.
--
-- `cobranza_fila` es el puente al hecho económico. Es la FILA FÍSICA de la pestaña, la misma que
-- `sheet_id + 4` de `public.cobranzas`. NO es una FK: `cobranzas` se borra y se reinserta entera en cada
-- sync (`delete … where origen='cobranzas_sheet'`), así que una FK haría fallar el sync o borraría
-- en cascada los certificados. El puente se valida al usarlo, no con una restricción.
--
-- ═══ POR QUÉ EL NÚMERO DE FILA NO ALCANZA COMO IDENTIDAD ═══
--
-- La columna A de Cobranzas es `=IF(C5="";"";ROW()-4)`: el «ID» de una fila es su POSICIÓN. Si
-- alguien inserta una fila arriba, todos los ids de abajo se corren y `cobranza_fila` apunta a otro
-- cobro sin que nada avise. Por eso se guarda además la HUELLA (`huella_comprobante`, `huella_monto`):
-- el worker que escribe en el Sheet la verifica antes de tocar la celda y se niega si no coincide.
-- Un puente que no se puede verificar no es un puente, es una suposición.
create table if not exists public.certificado_cliente (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id) on delete restrict,
  obra_id           text references public.obra_canonica(id) on delete set null,
  numero            text not null,
  factura           text,
  periodo_desde     date,
  periodo_hasta     date,
  check (periodo_desde is null or periodo_hasta is null or periodo_hasta >= periodo_desde),
  avance_periodo    numeric check (avance_periodo is null or (avance_periodo >= 0 and avance_periodo <= 100)),
  monto             numeric not null,
  -- Fondo de reparo RETENIDO. Es margen ya ganado y todavía no cobrado: si no está acá, el cliente
  -- ve un certificado por el bruto y la empresa proyecta caja que no va a entrar en esa fecha.
  reparo            numeric,
  emitido_at        date,
  vence             date,
  estado            text not null default 'emitido' check (estado in (
                      'emitido', 'en_revision', 'aprobado', 'observado',
                      'vencido', 'cobrado', 'en_disputa')),
  observacion       text,

  cobranza_fila     integer,
  -- La huella de la fila del Sheet al momento del sync. Ver el bloque de arriba.
  huella_comprobante text,
  huella_monto      numeric,

  -- El detalle de rubros que dibuja la tabla del 29 (rubro, contratado, avance acumulado, este
  -- certificado, falta). jsonb porque su forma la define el certificado real de cada obra, no esta
  -- tabla: obligar a un esquema fijo acá sería inventar una estructura que la evidencia no sostiene.
  detalle_rubros    jsonb,

  -- De dónde salió esta fila. 'sync_cobranzas' = la materializó el sync desde el Sheet y el sync la
  -- puede volver a tocar; 'os' = la creó alguien en la app y el sync NO la pisa. Es el mismo criterio
  -- que ya usan los módulos nativos del OS contra los sincronizados.
  origen            text not null default 'sync_cobranzas' check (origen in ('sync_cobranzas', 'os')),
  sincronizado_en   timestamptz,
  creado_at         timestamptz not null default now(),
  actualizado_at    timestamptz not null default now()
);

-- IDEMPOTENCIA DEL SYNC. Una fila de Cobranzas produce como máximo UN certificado. Sin esto, cada
-- corrida del sync agregaría un duplicado y la cuenta corriente del cliente se multiplicaría por la
-- cantidad de veces que corrió el timer. El índice es parcial porque `cobranza_fila` es NULL para
-- los certificados nacidos en la app, y un UNIQUE sobre columnas que aceptan NULL no restringe nada
-- (ya vivió sobre 206 NULLs sin quejarse en esta base).
create unique index if not exists certificado_cliente_cobranza_fila_idx
  on public.certificado_cliente (cobranza_fila)
  where cobranza_fila is not null;

create index if not exists certificado_cliente_cliente_idx
  on public.certificado_cliente (cliente_id, emitido_at desc);

comment on table public.certificado_cliente is
  'La cara del cliente de un cobro. NO es la verdad del cobro (esa es la pestaña Cobranzas y su '
  'réplica viva public.cobranzas): acá vive el número de certificado, el período, el fondo de reparo y el '
  'estado de aprobación del cliente, que en el Sheet no existe. cobranza_fila es el puente, '
  'verificado por huella porque la columna A del Sheet es ROW()-4 y se corre al insertar filas.';
comment on column public.certificado_cliente.reparo is
  'Fondo de reparo retenido de ESTE certificado, en $. Margen ya ganado y no cobrado: se descuenta '
  'del monto para saber qué entra realmente en caja, y se libera a la recepción definitiva.';
comment on column public.certificado_cliente.origen is
  'sync_cobranzas = lo materializó el sync y el sync lo puede volver a tocar. os = lo creó la app y '
  'el sync NO lo pisa.';

alter table public.certificado_cliente enable row level security;

-- El cliente ve los certificados de SU cliente_id, y sólo si su acceso lo habilita a ver la obra.
-- La restricción de OBRA vive acá adentro (no en el service) porque es una restricción de FILA y es
-- exactamente lo que RLS sabe hacer bien: un acceso con `obras = {arcor}` no puede leer el
-- certificado de otra obra ni consultando PostgREST directo.
drop policy if exists certificado_cliente_select on public.certificado_cliente;
create policy certificado_cliente_select on public.certificado_cliente
  for select to authenticated
  using (
    (select public.es_administracion())
    or (
      (select public.es_cliente())
      and cliente_id = (select public.cliente_de_sesion())
      and exists (
        select 1 from public.cliente_acceso a
         where a.auth_user_id = (select auth.uid())
           and a.revocado_at is null
           and a.puede_ver_obra
           -- obras NULL = todas. Ver el comentario de la columna en T1210.
           and (a.obras is null or obra_id = any (a.obras))
      )
    )
  );

drop policy if exists certificado_cliente_escribe on public.certificado_cliente;
create policy certificado_cliente_escribe on public.certificado_cliente
  for all to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

-- El cliente NO tiene policy de UPDATE: aprobar/observar un certificado NO lo escribe él contra la
-- tabla. Lo hace una server action que además deja el renglón en cliente_actividad_portal y verifica
-- `puede_aprobar`. Si el cliente pudiera actualizar la fila, podría marcar `cobrado` un certificado
-- que nadie cobró, o borrar la observación que él mismo puso.

grant select on public.certificado_cliente to authenticated;
grant insert (cliente_id, obra_id, numero, factura, periodo_desde, periodo_hasta, avance_periodo,
              monto, reparo, emitido_at, vence, estado, observacion, cobranza_fila,
              huella_comprobante, huella_monto, detalle_rubros, origen)
  on public.certificado_cliente to authenticated;
grant update (numero, factura, periodo_desde, periodo_hasta, avance_periodo, monto, reparo,
              emitido_at, vence, estado, observacion, detalle_rubros, actualizado_at)
  on public.certificado_cliente to authenticated;
