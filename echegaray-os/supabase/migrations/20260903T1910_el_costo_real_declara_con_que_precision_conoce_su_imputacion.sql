-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL COSTO REAL DECLARA CON QUÉ PRECISIÓN CONOCE SU IMPUTACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Toca UNA sola tabla —`public.obra_partida_costo_real`, que hoy tiene 0 filas— y le agrega tres
-- columnas. No altera ninguna otra tabla, ninguna vista y ningún trigger ajeno.
--
-- ═══ POR QUÉ HACE FALTA ═══
--
-- `cotizacion_partida_id` es NULLABLE a propósito desde el día uno, y su comentario dice que NULL
-- significa «no se pudo imputar a ninguna partida». Al ir a llenar la tabla apareció que ese NULL
-- tapa DOS estados que no son lo mismo:
--
--   · «este comprobante existe y todavía no sé de qué partida es» — un pendiente de imputación.
--   · «esta plata se conoce a nivel de OBRA y no existe ninguna fuente que la ate a una partida» —
--     que no es un pendiente de nadie: es el límite de la evidencia disponible hoy.
--
-- Con los dos en NULL, una carga completa a nivel obra se lee como una montaña de trabajo pendiente,
-- y —peor— el día que alguien impute de verdad una partida no hay forma de distinguir lo medido de
-- lo heredado. `granularidad` lo dice en la fila.
--
-- ═══ EL INVARIANTE, HECHO CUMPLIR POR LA BASE ═══
--
-- Granularidad PARTIDA ⇔ hay partida. Sin el CHECK, una fila podría decir PARTIDA con la partida en
-- NULL (precisión falsa) o traer partida declarándose OBRA (precisión escondida). Las dos hacen que
-- «desvío por partida» signifique cosas distintas en filas distintas de la misma consulta, que es la
-- clase de error que no avisa.

alter table public.obra_partida_costo_real
  add column if not exists granularidad text not null default 'OBRA',
  add column if not exists frente_texto text,
  add column if not exists nota         text;

alter table public.obra_partida_costo_real
  drop constraint if exists obra_partida_costo_real_granularidad_conocida;
alter table public.obra_partida_costo_real
  add constraint obra_partida_costo_real_granularidad_conocida
  check (granularidad in ('OBRA', 'FRENTE', 'PARTIDA'));

alter table public.obra_partida_costo_real
  drop constraint if exists obra_partida_costo_real_granularidad_coherente;
alter table public.obra_partida_costo_real
  add constraint obra_partida_costo_real_granularidad_coherente
  check ((granularidad = 'PARTIDA') = (cotizacion_partida_id is not null));

comment on column public.obra_partida_costo_real.granularidad is
  'Con qué precisión se conoce a qué se imputó el gasto. OBRA: la fuente sólo dice la obra (es el '
  'caso de TODA la carga inicial — ninguna fuente del OS ata hoy un peso a una partida). FRENTE: '
  'además hay un frente escrito por una persona (la columna OBRA de JORNALES: «Galpon 9», '
  '«Mamposteria»), que NO es una partida cotizada y no se puede comparar contra una. PARTIDA: la '
  'imputación es a la partida y el desvío por partida es medible. El CHECK impide que una fila diga '
  'PARTIDA sin partida: sin él, la precisión se declara sola.';
comment on column public.obra_partida_costo_real.frente_texto is
  'El rótulo del frente TAL COMO lo escribió la persona, sin normalizar ni traducir a una partida. '
  'Se guarda para que el día que exista la tabla de equivalencias se pueda reimputar contra la '
  'evidencia original en vez de contra una interpretación ya hecha.';
comment on column public.obra_partida_costo_real.nota is
  'Por qué esta fila quedó así: la regla de imputación que la resolvió, la familia de material que '
  'decidió el tipo, y las advertencias que viajan con el número (el jornal es BRUTO, sin cargas '
  'sociales). Es texto para una persona, no una clave para consultar.';

-- El GRANT es de TABLA, así que las columnas nuevas nacen alcanzadas. Se reafirma igual porque el
-- costo de reafirmarlo es cero y el de descubrir un «permission denied» leído como «no hay datos»
-- ya se pagó una vez.
grant select, insert, update, delete on public.obra_partida_costo_real to authenticated;
grant all on public.obra_partida_costo_real to service_role;
