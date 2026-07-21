-- EL DATO PUBLICADO LE GANA A LA EXPECTATIVA — y un mes se cuenta UNA sola vez.
--
-- QUÉ ESTABA MAL (21/07). La vista acumulaba con
--   exp(sum(ln(1 + variacion)) over (partition by indice order by periodo))
-- particionando por ÍNDICE, no por mes. Mientras la única fuente que escribía fue la búsqueda web
-- —que sólo guarda tipo='proyeccion'— nunca hubo dos filas del mismo mes y el defecto durmió.
--
-- El día que se cargara el IPC real del INDEC, cada mes cerrado habría quedado con DOS filas (el
-- dato y la expectativa vieja) y entonces, en silencio:
--   · el factor acumulado habría multiplicado ese mes dos veces (marzo 3,4% contaría como 6,9%);
--   · peor todavía, los dos consumidores hacen `left join factor_ajuste on periodo = X`
--     (generar-migracion-caja.mjs) y `Object.fromEntries` (impuestos-pestana.mjs): los dos asumen
--     UNA fila por mes, así que la vista proyeccion_egreso habría emitido cada mes DUPLICADO.
-- Ningún control lo habría visto: los cuadros siguen cerrando en $0 porque el error entra parejo
-- por los dos lados.
--
-- LA REGLA, que es la del CLAUDE.md raíz: HECHO le gana a PROYECCIÓN. Un mes ya publicado por el
-- INDEC no se ajusta con una expectativa del REM — sería reemplazar un hecho por un pronóstico. La
-- expectativa NO se borra (sirve para medir después qué tan bien pronostica el mercado y para saber
-- con qué se proyectó antes de que el dato existiera): se guarda, y la vista la ignora.

create or replace view public.factor_ajuste as
with elegido as (
  -- Un mes, una variación. 'dato' primero; la proyección sólo se usa si el mes todavía no cerró.
  select distinct on (indice, periodo)
         indice, periodo, tipo, variacion, fuente, url
    from public.indice_economico
   order by indice, periodo, (tipo = 'dato') desc, leido_en desc
)
select indice,
       periodo,
       tipo,
       variacion,
       exp(sum(ln(1 + variacion)) over (partition by indice order by periodo))::numeric(12, 6) as factor_acumulado,
       fuente
  from elegido
 order by indice, periodo;

comment on view public.factor_ajuste is
  'Factor acumulado por índice y mes, UNA fila por mes: el dato publicado le gana a la expectativa. Multiplicar una proyección a valores de hoy por este factor la lleva a pesos de ese mes.';

-- CANARIO: que no vuelva a existir un mes con dos filas en la vista. Si alguien reescribe la vista
-- y pierde el distinct on, esto lo dice en la primera corrida en vez de esperar a que un cuadro
-- cierre mal.
create or replace view public.factor_ajuste_canario as
  select indice, periodo, count(*)::int as filas
    from public.factor_ajuste
   group by 1, 2
  having count(*) > 1;

comment on view public.factor_ajuste_canario is
  'Debe estar SIEMPRE vacía. Una fila acá significa que un mes se está acumulando dos veces y que toda proyección del OS está inflada.';
