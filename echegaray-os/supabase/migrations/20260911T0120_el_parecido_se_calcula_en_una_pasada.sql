-- ═══ EL PARECIDO SE CALCULA EN UNA PASADA — LA MISMA REGLA, SIN EL BARRIDO POR FILA ═══════════
--
-- `comprobante_posible_duplicado` no cambia de criterio: cambia de forma. El filtro del abono
-- mensual —«si el mismo emisor facturó ESE MISMO importe tres o más veces, es un cargo fijo y no se
-- señala», 20260821T5500— estaba escrito como una subconsulta CORRELACIONADA, o sea una consulta
-- por fila. Con 767 comprobantes eso es 767 barridos del libro entero.
--
-- ═══ CUÁNTO COSTABA, MEDIDO ═══
--
-- Contar los duplicados sin resolver —lo que hace la campanita en TODAS las pantallas del OS y el
-- KPI de la pantalla 24— tocaba 247.765 bloques del buffer pool y tardaba 330 ms con caché caliente
-- (`explain (analyze, buffers)` como `authenticated`, 10/09/2026). En la ventana medida de
-- pg_stat_statements era el mayor consumidor de la base: 58 llamadas, 976 ms de media, 10 s de
-- máximo, 57 s de tiempo total. Con la ventana: 320 bloques. Es 770 veces menos trabajo por la
-- MISMA respuesta.
--
-- ═══ POR QUÉ NO SE ARREGLA CON UN ÍNDICE — PROBADO, NO SUPUESTO ═══
--
-- 20260821T5500 ya dejó `comprobantes_arca_emisor_importe` sobre (cuit normalizado, importe)
-- pensando en esto. No alcanza, y el motivo no es el índice: es la FORMA de la consulta. Medido el
-- 10/09/2026 creando además un índice sobre (tipo_libro, cuit normalizado, importe) dentro de una
-- transacción:
--
--   · la subconsulta guardiana AISLADA (barrido de la tabla + el count por fila) usa las tres
--     columnas del índice y baja a 3.478 bloques / 9 ms;
--   · la MISMA subconsulta dentro del `exists` de `comprobante_compra.tiene_posible_duplicado`
--     —donde `nuevo` llega por su pkey, una fila a la vez— usa sólo `tipo_libro` como Index Cond y
--     SUBE a 498.395 bloques. El planificador no convierte en condición de índice una expresión que
--     depende de la fila de arriba en ese anidamiento.
--
-- O sea: agregar índices lo empeoraba. Lo que sobra es la correlación, no el índice.
--
-- ═══ QUÉ NO CAMBIA, Y CÓMO SE PRUEBA ═══
--
-- `count(*) over (partition by tipo_libro, cuit normalizado, importe redondeado)` cuenta EXACTAMENTE
-- lo que contaba la subconsulta: las mismas tres igualdades, sobre el mismo universo, incluyéndose a
-- sí misma. Y sobre las mismas filas que la RLS deja ver, porque la política se aplica al barrido de
-- la tabla antes de la ventana — igual que antes.
--
-- LA ÚNICA DIFERENCIA POSIBLE ES EL CUIT VACÍO, y está tapada. `PARTITION BY` agrupa los NULL entre
-- sí; la subconsulta los comparaba con `=`, que da NULL y por lo tanto no contaba ninguno. Un
-- comprobante sin CUIT pasaba el filtro por contar 0 y ahora podría contar 3 y quedar afuera. Por eso
-- el `where` dice `nuevo.cuit is null or …`: sin CUIT el filtro no aplica, como antes. En los datos
-- reales no cambia nada —sin CUIT no hay con quién emparejar— pero la vista no puede depender de eso.
--
-- Lo verifica `orquestador/lib/comprobante-parecido.pg.test.mjs`, que compara PAR POR PAR contra la
-- implementación correlacionada escrita a mano en el propio test, sobre los 767 comprobantes reales,
-- y exige que el plan use `WindowAgg` y toque menos de 50.000 bloques. Si alguien vuelve a la
-- subconsulta por fila, el test de bloques se pone rojo aunque la respuesta sea la correcta.

create or replace view public.comprobante_posible_duplicado as
with libro as (
  -- LAS EXPRESIONES DEL EMPAREJAMIENTO, CALCULADAS UNA VEZ. Antes el `regexp_replace` del CUIT y el
  -- `round` del importe se evaluaban en los dos lados del join y otra vez adentro del guardián: tres
  -- veces por comparación. Acá salen una vez por fila y las usan el join, la ventana y el filtro.
  select
    c.id, c.tipo_libro, c.tipo_comprobante, c.punto_venta, c.numero,
    c.fecha_emision, c.created_at, c.imp_total, c.obra_texto, c.estado_control,
    nullif(regexp_replace(coalesce(c.emisor_cuit, ''), '\D', '', 'g'), '') as cuit,
    round(coalesce(c.imp_total, 0), 2)                                    as importe,
    public.comprobante_signo(c.tipo_comprobante)                          as signo,
    public.comprobante_letra(c.tipo_comprobante)                          as letra,
    -- EL UMBRAL DEL ABONO SIGUE VIVIENDO EN UNA SOLA LÍNEA: es el `< 3` del `where`, abajo. Acá sólo
    -- se cuenta cuántas veces aparece ese importe de ese emisor en el libro.
    count(*) over (partition by
      c.tipo_libro,
      nullif(regexp_replace(coalesce(c.emisor_cuit, ''), '\D', '', 'g'), ''),
      round(coalesce(c.imp_total, 0), 2))                                 as veces_ese_importe
  from public.comprobantes_arca c
)
select
  nuevo.id                                       as comprobante_id,
  nuevo.estado_control                           as estado_control,
  viejo.id                                       as parecido_a_id,
  viejo.tipo_comprobante                         as parecido_tipo,
  viejo.punto_venta                              as parecido_punto_venta,
  viejo.numero                                   as parecido_numero,
  viejo.fecha_emision                            as parecido_fecha,
  viejo.imp_total                                as parecido_imp_total,
  viejo.obra_texto                               as parecido_obra_texto,
  abs(nuevo.fecha_emision - viejo.fecha_emision) as dias_de_distancia
from libro nuevo
join libro viejo
  on  viejo.tipo_libro = nuevo.tipo_libro
  -- `=` Y NO `is not distinct from`: dos comprobantes SIN CUIT no se emparejan, que es lo que hacía
  -- la comparación de las expresiones crudas. Sin CUIT no se puede afirmar que sea el mismo emisor.
  and viejo.cuit = nuevo.cuit
  and viejo.importe = nuevo.importe
  and nuevo.importe <> 0
  and nuevo.signo is not null
  and viejo.signo = nuevo.signo
  and nuevo.letra is not null
  and viejo.letra = nuevo.letra
  and viejo.fecha_emision is not null
  and abs(nuevo.fecha_emision - viejo.fecha_emision) <= 35
  and (coalesce(viejo.punto_venta, ''), coalesce(viejo.numero, ''))
   is distinct from (coalesce(nuevo.punto_venta, ''), coalesce(nuevo.numero, ''))
  -- el más viejo primero; empate de fecha lo desempata el orden de llegada y después el id, para
  -- que el par siempre se cuelgue del mismo lado aunque los dos hayan entrado el mismo día
  and (viejo.fecha_emision, viejo.created_at, viejo.id) < (nuevo.fecha_emision, nuevo.created_at, nuevo.id)
where nuevo.fecha_emision is not null
  -- EL ABONO MENSUAL NO SE SEÑALA. Tres o más veces el mismo importe del mismo emisor es un cargo
  -- fijo (alquiler, internet, seguro), no una compra repetida. `cuit is null` primero: sin CUIT el
  -- filtro no aplica y la fila pasa, exactamente como cuando el guardián contaba 0.
  and (nuevo.cuit is null or nuevo.veces_ese_importe < 3);

comment on view public.comprobante_posible_duplicado is
  'Pares de comprobantes que PUEDEN ser el mismo gasto: mismo emisor, mismo importe, mismo signo y '
  'misma letra, a 35 días o menos, con número distinto. La fila se cuelga del más nuevo. No decide '
  'nada: dos compras iguales de verdad existen. La resolución es humana y queda en estado_control. '
  'El filtro del abono mensual (tres o más veces el mismo importe = cargo fijo) se calcula con una '
  'ventana y no con una subconsulta por fila: misma respuesta, 320 bloques en vez de 247.765.';

-- `create or replace view` conserva las opciones, pero se re-declaran porque son la diferencia entre
-- una vista con portero y una que publica el libro entero: una policy sin grant no es un permiso, y
-- una vista sin `security_invoker` corre con los permisos de quien la creó.
alter view public.comprobante_posible_duplicado set (security_invoker = on);
grant select on public.comprobante_posible_duplicado to authenticated;

notify pgrst, 'reload schema';
