-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA COLA QUE ESCRIBE EN COBRANZAS — pantallas 28 «Registrar cobro» y 32 «editar un pago»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La app corre en Vercel y NO habla con Google. Nunca. Toda escritura al Sheet pasa por una fila acá
-- y un worker en la VM, igual que `comprobante_entrada` para la pestaña Compras. Este es el mismo
-- patrón para la pestaña Cobranzas.
--
-- ═══ POR QUÉ ESTO ES UNA COLA Y NO UN UPDATE ═══
--
-- Cambiar la fecha de cobro de una fila mueve el Calendario de Cobros, la pestaña CAJA y la
-- proyección de caja de la empresa. La columna Q es la palanca del cobro. Una server action con 10 s
-- de techo escribiendo en un Sheet que además puede estar congelado por el freno de mano, editado en
-- vivo por el dueño, o con la fila corrida de lugar, no es el lugar donde eso se decide.
--
-- ═══ LO QUE LA HUELLA IMPIDE (y por qué no alcanza con el número de fila) ═══
--
-- La columna A de Cobranzas es `=IF(C5="";"";ROW()-4)`: el «ID» es la posición. Insertar una fila
-- corre todos los ids de abajo. Entre que la pantalla encola y el worker aplica pueden pasar minutos
-- y el dueño puede haber insertado una fila. Escribir «cobrado el 12/08» en la fila equivocada le
-- cambia el estado a un cobro ajeno y descuadra la caja sin dejar rastro.
--
-- Por eso viajan `huella_comprobante` y `huella_monto`: lo que la pantalla vio en esa fila cuando
-- encoló. El worker relee la fila, compara, y si no coincide NO escribe — busca la huella en la
-- pestaña y, si la encuentra, corrige la fila; si no, deja el cambio en `rechazado` con el motivo.
-- Fallar cerrado acá vale mucho más que aplicar un cambio dudoso.
--
-- ═══ `leido_de_vuelta` ES LA EVIDENCIA ═══
--
-- Una escritura NO se da por buena porque la API devolvió 200. El worker relee la celda después de
-- escribir y guarda acá LO QUE LA CELDA DICE AHORA. Si el sheet reformateó la fecha, si la fórmula
-- quedó rota, si el valor entró como texto — se ve acá y no en la próxima conciliación.
create table if not exists public.cobranza_cambio (
  id             uuid primary key default gen_random_uuid(),
  -- SET NULL, no CASCADE: si el pago del esquema se borra, el pedido de cambio que ya se aplicó al
  -- Sheet SIGUIÓ existiendo en la realidad. Borrar su rastro sería mentir sobre lo que se escribió.
  esquema_pago_id uuid references public.esquema_pago(id) on delete set null,

  -- La fila FÍSICA de la pestaña Cobranzas (= sheet_id + 4 en public.cobranzas). Los datos
  -- arrancan en la fila 5: cualquier cosa por debajo es encabezado y escribir ahí rompe la tabla.
  cobranza_fila  integer not null check (cobranza_fila >= 5),
  huella_comprobante text,
  huella_monto   numeric,

  -- Los cuatro campos editables, y sólo esos. La lista corta es la cerradura: el worker mapea cada
  -- uno a UNA celda concreta (fecha→Q, monto→J, medio→N, estado_cobrado→O) y no sabe escribir en
  -- ninguna otra. Un campo que no esté acá no tiene celda a la que ir.
  campo          text not null check (campo in ('fecha', 'monto', 'medio', 'estado_cobrado')),
  -- Texto y no un tipo por campo: es lo que se va a escribir, y el worker lo convierte al formato de
  -- la celda (serial de fecha, entero, rótulo). Cuatro columnas tipadas nullables dirían menos.
  valor_nuevo    text,
  valor_anterior text,

  pedido_por     uuid not null default auth.uid() references auth.users(id),
  pedido_at      timestamptz not null default now(),
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'procesando', 'aplicado', 'rechazado', 'error')),
  motivo         text,
  intentos       smallint not null default 0,
  tomado_at      timestamptz,
  aplicado_at    timestamptz,
  -- Lo que se releyó de la celda DESPUÉS de escribir. Ver arriba.
  leido_de_vuelta text
);

-- El worker toma lo más viejo primero: un cobro que espera hace diez minutos importa más que el que
-- se acaba de registrar.
create index if not exists cobranza_cambio_cola_idx
  on public.cobranza_cambio (estado, pedido_at)
  where estado in ('pendiente', 'procesando');

create index if not exists cobranza_cambio_fila_idx on public.cobranza_cambio (cobranza_fila, pedido_at desc);

comment on table public.cobranza_cambio is
  'Cola de escrituras a la pestaña Cobranzas del Flujo de Caja. La app encola; el worker de la VM '
  'aplica con bisturí (fecha→Q, monto→J, medio→N, estado_cobrado→O), verifica la huella de la fila '
  'antes de tocarla y relee la celda después. La app NUNCA habla con Google.';
comment on column public.cobranza_cambio.leido_de_vuelta is
  'Lo que dice la celda DESPUÉS de escribir, releído del Sheet. Una escritura no se da por buena '
  'porque la API devolvió 200.';
comment on column public.cobranza_cambio.huella_comprobante is
  'El N° de comprobante (columna E) que la pantalla vio en esa fila al encolar. El worker lo compara '
  'antes de escribir: la columna A del Sheet es ROW()-4 y se corre al insertar filas.';

alter table public.cobranza_cambio enable row level security;

drop policy if exists cobranza_cambio_select on public.cobranza_cambio;
create policy cobranza_cambio_select on public.cobranza_cambio
  for select to authenticated using ((select public.es_administracion()));

-- El alta es a nombre propio y SIEMPRE nace pendiente con 0 intentos. Poder insertar una fila ya
-- `aplicado` sería poder declarar que se escribió en el Sheet algo que nadie escribió — y la
-- pantalla 28 lee justamente ese estado para decirle al usuario que su cobro quedó registrado.
drop policy if exists cobranza_cambio_insert on public.cobranza_cambio;
create policy cobranza_cambio_insert on public.cobranza_cambio
  for insert to authenticated
  with check (
    (select public.es_administracion())
    and pedido_por = (select auth.uid())
    and estado = 'pendiente'
    and intentos = 0
  );

-- NO hay policy de UPDATE ni de DELETE, y es lo que sostiene todo lo demás: el estado de un cambio
-- lo escribe el worker por DATABASE_URL, que no pasa por RLS. Si `authenticated` pudiera actualizar
-- esta tabla, la pantalla estaría leyendo una afirmación en vez de un hecho.

grant select on public.cobranza_cambio to authenticated;
grant insert (esquema_pago_id, cobranza_fila, huella_comprobante, huella_monto, campo, valor_nuevo,
              valor_anterior, pedido_por, estado, intentos)
  on public.cobranza_cambio to authenticated;
