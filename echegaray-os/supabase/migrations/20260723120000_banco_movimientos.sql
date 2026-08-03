-- EL EXTRACTO DEL BANCO, EN LA BASE — LA PUERTA DE ENTRADA QUE FALTABA.
--
-- POR QUÉ (23/07). El dueño: "a diario y quizás dos veces por día te tengo que cargar los
-- movimientos bancarios vía archivo csv o capturas de pantalla, y esto debe impactar en todo el
-- sheet conforme corresponde, no sólo en la pestaña CAJA".
--
-- El IMPACTO ya estaba cableado: la réplica _BANCO_RAW vive adentro del archivo y CAJA, Impuestos y
-- Cheques la leen por fórmula. Lo que no existía era la PUERTA: los 127 movimientos estaban
-- ESCRITOS A MANO adentro de un archivo de código (lib/banco-santander.mjs). Cargar el extracto del
-- día significaba editar JavaScript. Un dato operativo que sólo se puede actualizar tocando el
-- código no se actualiza: envejece.
--
-- LA DEDUPLICACIÓN ES EL PROBLEMA REAL, no el parseo. El extracto se baja con ventanas que se
-- superponen (22/06→22/07, después 15/07→23/07) y el mismo movimiento entra dos veces. Duplicar un
-- débito de $200.000 no da error: da un saldo equivocado y una caja que no cierra.
--
-- ⚠ EL RAZONAMIENTO DE ABAJO SOBRE EL SALDO QUEDÓ SUPERADO. Ver 20260730160000_banco_movimientos_
-- referencia.sql y 20260731130000_banco_referencia_mas_importe.sql: dos descargas del MISMO movimiento
-- reportan saldos distintos, así que el saldo en la clave hacía entrar de nuevo cada tramo superpuesto.
-- La clave del movimiento es (cuenta, referencia, importe); esta de acá abajo quedó sólo para las filas
-- sin referencia. Se conserva el texto original porque explica por qué se creyó lo contrario.
--
-- La clave natural del movimiento es (fecha, concepto, importe, saldo_despues). El SALDO forma parte
-- de la clave a propósito: dos transferencias iguales el mismo día a la misma persona son dos
-- movimientos reales y distintos, y lo único que los distingue es el saldo corrido. Sacarlo del
-- índice haría que el segundo se descarte como "duplicado" y la cadena de saldos se rompería — que
-- es exactamente el control que después detecta el error.

create table if not exists public.banco_movimientos (
  id            bigserial primary key,
  cuenta        text        not null default '179-091383/6',
  fecha         date        not null,
  concepto      text        not null,
  importe       numeric(16,2) not null,
  -- El saldo que el banco muestra DESPUÉS de este movimiento. Puede faltar: los "Movimientos del
  -- Día" todavía no traen saldo corrido, y es correcto guardarlos igual con saldo nulo.
  saldo_despues numeric(16,2),
  -- De dónde salió esta fila, declarado. La regla de oro pide fórmula o celda con ORIGEN TRAZABLE;
  -- un extracto pegado es lo segundo, y sin esto no se puede saber si un número es de hoy o de hace
  -- tres semanas.
  origen        text        not null,
  -- Cuándo se importó. Distinto de `fecha`: un movimiento del 22/06 se puede haber cargado el 23/07.
  importado_en  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- LA DEDUPLICACIÓN, EN LA BASE Y NO EN EL SCRIPT. Un chequeo en código se saltea la primera vez que
-- alguien corre el importador dos veces en paralelo, o desde otra máquina. Acá no se puede saltear.
-- `coalesce` porque el saldo puede ser nulo y en un índice único NULL nunca es igual a NULL: sin
-- esto, los movimientos del día se duplicarían en cada corrida.
create unique index if not exists banco_movimientos_unico
  on public.banco_movimientos (cuenta, fecha, concepto, importe, coalesce(saldo_despues, 0));

create index if not exists banco_movimientos_fecha on public.banco_movimientos (fecha);

alter table public.banco_movimientos enable row level security;

drop policy if exists banco_movimientos_lectura on public.banco_movimientos;
create policy banco_movimientos_lectura on public.banco_movimientos
  for select using (auth.role() = 'authenticated');

-- La escritura es del service role (el importador del OS). Nadie carga el extracto desde la web.
drop policy if exists banco_movimientos_escritura on public.banco_movimientos;
create policy banco_movimientos_escritura on public.banco_movimientos
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.banco_movimientos is
  'Extracto del Santander, movimiento por movimiento. Réplica con origen y fecha de importación: no hay API de banca empresa, el dato entra por CSV o captura. Lo consume _BANCO_RAW, y de ahí CAJA, Impuestos y Cheques.';
