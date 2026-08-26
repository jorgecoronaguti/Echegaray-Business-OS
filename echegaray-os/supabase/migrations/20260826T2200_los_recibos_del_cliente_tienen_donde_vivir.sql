-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS RECIBOS DEL CLIENTE TIENEN DÓNDE VIVIR — el papel que está en Drive y nadie mira
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ESCRITA Y SIN APLICAR. Aplicarla es una decisión del dueño; el script que la puebla
-- (`orquestador/scripts/recibos-drive-sembrar.mjs`) se niega a escribir mientras la tabla no exista
-- y lo dice con el nombre de este archivo.
--
-- ═══ POR QUÉ ═══
--
-- Textual del dueño: «en la carpeta de drive hay todo un listado de recibos, tenes q agregarlos si
-- no podes saber a q obra corresponde dejarlos ahi».
--
-- El portal muestra facturas y recibos leyendo `esquema_pago.factura_numero` / `.recibo_numero`. Al
-- 26/08/2026 esas dos columnas tienen 32 números de factura entre los cinco clientes y CERO recibos:
-- los recibos existen, pero como PDF en Drive. La única forma de que el cliente los vea era que
-- alguien los copiara a mano a una columna de texto — y un número tipeado no es el papel.
--
-- Esta tabla NO es una segunda versión del cronograma de pagos: es el REGISTRO DEL ARCHIVO. Su
-- identidad es el archivo de Drive (`drive_file_id`), no el pago. Cuando su `numero` coincide con el
-- `recibo_numero` de un pago del esquema, el portal entiende que son EL MISMO HECHO y le cuelga la
-- descarga a la fila que ya está, en vez de dibujar dos.
--
-- ═══ `obra_id` NULO ES UNA RESPUESTA, NO UN AGUJERO ═══
--
-- Los 23 recibos que hay hoy en Drive viven en `LA ESTRELLA/RECIBOS` y `JAVIER SANCHEZ/CERTIFICADOS`
-- —carpetas del CLIENTE, no de una obra— y su contenido es el estado de cuenta del cliente entero,
-- que cruza varias obras a la vez. Repartirlos entre las obras inventaría a cuál pertenece cada uno,
-- y el cliente lo ve. El dueño lo pidió textual: «si no podes saber a q obra corresponde dejarlos
-- ahi». Por eso `obra_id` es NULLABLE y el portal dibuja esa fila SIN renglón de obra, no con un
-- rótulo fabricado.

create table if not exists public.recibo_cliente (
  id              uuid primary key default gen_random_uuid(),

  -- El cliente SÍ se sabe siempre: sale de la carpeta de Drive que la ficha del cliente declara.
  -- Un recibo sin cliente no tiene a quién mostrarse, así que no puede existir.
  cliente_id      uuid not null references public.clientes(id) on delete restrict,
  -- NULL = no se pudo afirmar de qué obra es. Ver arriba. `on delete set null` y no `cascade`:
  -- retirar una obra del maestro no puede borrar el comprobante de un cobro.
  obra_id         text references public.obra_canonica(id) on delete set null,

  -- ── LO QUE SE PUDO LEER DEL COMPROBANTE ──
  --
  -- Los tres son NULLABLE a propósito y con evidencia: de los 23 archivos de hoy, 20 traen número en
  -- el nombre, 12 traen fecha completa, y NINGUNO trae un importe único (son estados de cuenta con
  -- muchas filas, no un comprobante de un monto). Un 0 acá diría «el recibo es por cero pesos».
  numero          text,
  fecha           date,
  monto           numeric,
  -- NOT NULL con default: la moneda de una obligación no puede ser desconocida, y sumar monedas
  -- distintas es un error que no da error. Mismo criterio que `esquema_pago.moneda`.
  moneda          text not null default 'ARS' check (moneda in ('ARS', 'USD')),

  -- ── EL ARCHIVO ──
  --
  -- `drive_file_id` es la IDENTIDAD de la fila: es lo que hace la carga idempotente (ver el índice
  -- único de abajo). `drive_url` es el enlace de Drive, y sirve para ADMINISTRACIÓN, que sí tiene
  -- acceso a la carpeta; el cliente NO lo tiene, y por eso el portal no lo publica: descarga por
  -- `/portal/recibo/<id>`, que trae el archivo con la credencial del OS.
  drive_file_id   text not null,
  drive_url       text not null,
  nombre_archivo  text not null,

  -- De dónde salió esta fila. `drive` = la barrió el script desde la carpeta del cliente; `os` = la
  -- cargó alguien desde la app. Sin esto, una recarga no sabe cuáles puede volver a tocar.
  origen          text not null default 'drive' check (origen in ('drive', 'os')),

  -- Propia de la app: el cliente lo ve o no lo ve. Nace en `true` porque el pedido es que los
  -- recibos que YA existen aparezcan; esconderlos por defecto habría dejado la pantalla igual que
  -- antes y sin que nadie se entere.
  visible_portal  boolean not null default true,

  creado_at       timestamptz not null default now(),
  actualizado_at  timestamptz not null default now()
);

-- IDEMPOTENCIA. Un archivo de Drive produce como máximo UNA fila, corra el script una vez o veinte.
-- Sin NULLs en la columna: un único sobre columna nullable no restringe nada (ya vivió sobre 206).
create unique index if not exists recibo_cliente_drive_file_idx
  on public.recibo_cliente (drive_file_id);

create index if not exists recibo_cliente_cliente_idx
  on public.recibo_cliente (cliente_id, fecha desc nulls last, numero);

comment on table public.recibo_cliente is
  'El PDF del recibo que vive en la carpeta del cliente en Drive. Su identidad es el archivo '
  '(drive_file_id), no el pago: cuando `numero` coincide con `esquema_pago.recibo_numero` el portal '
  'los trata como el mismo hecho y no duplica la fila.';
comment on column public.recibo_cliente.obra_id is
  'NULL = no se pudo afirmar de qué obra es (el archivo está en la carpeta del CLIENTE). Es una '
  'respuesta legítima y pedida por el dueño, no un dato faltante: repartirlo entre las obras '
  'inventaría a cuál pertenece.';
comment on column public.recibo_cliente.monto is
  'NULL = el comprobante no declara un importe único. Los de hoy son estados de cuenta con muchas '
  'filas; poner 0 diría que el recibo es por cero pesos.';
comment on column public.recibo_cliente.drive_url is
  'El enlace de Drive, para ADMINISTRACIÓN. El cliente no tiene acceso a la carpeta: el portal le '
  'sirve el archivo por /portal/recibo/<id> con la credencial del OS.';

alter table public.recibo_cliente enable row level security;

-- ═══ QUIÉN VE QUÉ ═══
--
-- Se copia la forma de `esquema_pago_select` porque el recibo es del mismo hecho y esconderlo con
-- otra regla haría que el cliente viera un recibo de un pago que no puede ver. Tres diferencias
-- declaradas:
--
--   · No hay `publicado_at`: un recibo no se «acuerda» con el cliente como una fecha de pago, es el
--     papel de algo que ya pasó. `visible_portal` alcanza para retirarlo.
--   · `puede_ver_montos` NO se pide acá: la fila (número y fecha) no es un importe. El ARCHIVO sí
--     está lleno de importes, y ésa es la puerta que lo comprueba (`/portal/recibo/<id>`).
--   · El portero de obra se pregunta igual, y un recibo SIN obra sólo lo ve quien alcanza todas: no
--     hay forma de afirmar que un papel sin obra le corresponda a un acceso acotado. Falla cerrado.
drop policy if exists recibo_cliente_select on public.recibo_cliente;
create policy recibo_cliente_select on public.recibo_cliente
  for select to authenticated
  using (
    (select public.es_administracion())
    or (
      (select public.es_cliente())
      and cliente_id = (select public.cliente_de_sesion())
      and visible_portal
      and exists (
        select 1 from public.cliente_acceso a
         where a.auth_user_id = (select auth.uid())
           and a.revocado_at is null
           and a.puede_ver_obra
           and (a.obras is null or obra_id = any (a.obras))
      )
    )
  );

drop policy if exists recibo_cliente_escribe on public.recibo_cliente;
create policy recibo_cliente_escribe on public.recibo_cliente
  for all to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

-- ═══ UNA COLUMNA NUEVA NACE SIN PERMISO ═══
--
-- Una policy no es un GRANT: sin GRANT, PostgREST devuelve «permission denied» y Next lo muestra
-- como un 404 — un error de permiso disfrazado de «no existe», la peor pista posible. Y el GRANT de
-- escritura va POR COLUMNA, no por tabla: es lo que hace imposible que una server action distraída
-- escriba `drive_file_id` o `cliente_id` de una fila que sembró el script.
--
-- `select` sí es de tabla entera —igual que en `esquema_pago`—: leer una columna de más no rompe
-- nada, y enumerarlas haría que la columna que se agregue mañana se leyera VACÍA sin dar error.
grant select on public.recibo_cliente to authenticated;
grant insert (cliente_id, obra_id, numero, fecha, monto, moneda, drive_file_id, drive_url,
              nombre_archivo, origen, visible_portal)
  on public.recibo_cliente to authenticated;
grant update (obra_id, numero, fecha, monto, moneda, visible_portal, actualizado_at)
  on public.recibo_cliente to authenticated;
