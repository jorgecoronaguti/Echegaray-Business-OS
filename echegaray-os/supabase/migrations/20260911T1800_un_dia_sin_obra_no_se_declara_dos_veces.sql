-- UNA AUSENCIA O LICENCIA SIN OBRA NO SE PUEDE CARGAR DOS VECES.
--
-- ═══ EL AGUJERO, MEDIDO EN PRODUCCIÓN EL 11/09/2026 ═══
--
-- `registros_hh_persona_unico` es UNIQUE sobre
--   (obra_canonica_id, persona_id, fecha, coalesce(actividad_id, …), tipo_hora, improductiva,
--    coalesce(causa_desvio, ''))  WHERE persona_id is not null
--
-- Las dos columnas opcionales ya entran con `coalesce`, pero `obra_canonica_id` no. En Postgres un
-- índice único trata dos NULL como distintos, así que la clave NO protege a las filas sin obra — y
-- las ausencias y las licencias son, por definición, las que no la llevan: el CHECK
-- `obra_canonica_id is not null or tipo_hora in ('ausencia','licencia')` lo dice con todas las
-- letras. En la 1ª quincena de septiembre de 2026 hay 7 filas en esa condición.
--
-- Consecuencia: la misma ausencia declarada dos veces (dos caminos que escriben, un reintento, un
-- doble toque en el celular) entra dos veces, y hasta el arreglo de `horasLiquidablesDelDia` del
-- 11/09/2026 la liquidación pagaba la SUMA: dos licencias «accidente» de 9 h eran 18 h de un día.
--
-- ═══ POR QUÉ NO SE USA `NULLS NOT DISTINCT` ═══
--
-- Existe desde Postgres 15 y sería más corto, pero cambiaría el significado de la clave para TODAS
-- sus columnas y no sólo para la que tiene el agujero. El `coalesce` es explícito, deja la intención
-- escrita en el índice y es la forma que este mismo índice ya usa para `actividad_id` y
-- `causa_desvio`: una clave con dos convenciones distintas es una clave que nadie puede leer.
--
-- ═══ ANTES DE APLICARLA: NO HAY NADA QUE COLISIONE, Y HAY QUE VOLVER A COMPROBARLO ═══
--
-- Medido el 11/09/2026 en las 3.544 filas de `registros_hh`: 0 grupos duplicados con la clave nueva.
-- La consulta está abajo y se corre otra vez ANTES de crear el índice: si devuelve filas, el
-- `create unique index` falla y hay que decidir cuál se queda — no lo decide una migración.
--
--   select coalesce(obra_canonica_id,'(sin obra)') obra, persona_id, fecha, tipo_hora,
--          count(*) n, array_agg(id) ids, array_agg(horas) horas
--     from public.registros_hh
--    where persona_id is not null
--    group by 1, 2, 3, 4, coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid),
--             improductiva, coalesce(causa_desvio, '')
--   having count(*) > 1;
--
-- SE CREA CONCURRENTEMENTE Y SE VERIFICA. `create index concurrently` no puede ir dentro de una
-- transacción; si el `supabase db push` la envuelve, hay que correr este archivo a mano.

create unique index concurrently if not exists registros_hh_persona_unico_v2
  on public.registros_hh (
    coalesce(obra_canonica_id, ''),
    persona_id,
    fecha,
    coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid),
    tipo_hora,
    improductiva,
    coalesce(causa_desvio, '')
  )
  where persona_id is not null;

-- EL ÍNDICE VIEJO NO SE BORRA ACÁ. `SQL_UPSERT` de `orquestador/lib/jornales-a-registros-hh.mjs`
-- nombra su especificación exacta en el `on conflict (...)`: borrarlo en la misma migración rompería
-- el importador de JORNALES en la corrida siguiente. El orden es: aplicar esto, cambiar el
-- `on conflict` del importador a la especificación nueva, verificar una corrida con `--dry`, y
-- recién entonces `drop index registros_hh_persona_unico`.
