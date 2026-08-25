-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA COMPRA CON OBRA CONOCIDA NO ESTÁ «SIN IMPUTAR»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL DEFECTO ═══
--
-- La pantalla 24 tenía UN solo estado de imputación —`obra_texto is null` ⇒ «Sin imputar»— y con él
-- metía en la misma bolsa cuatro situaciones que piden cuatro cosas distintas de una persona:
--
--   1 · nadie dijo nada                          → hay que averiguar a qué obra fue
--   2 · dice «Sueldos», «UOCRA», «Administración» → YA está imputado, a Estructura. No hay trabajo.
--   3 · dice «Quattropani»                        → imputado a una obra concreta. No hay trabajo.
--   4 · dice algo que el diccionario no conoce    → hay que declarar el alias, no buscar la obra
--
-- El 2 y el 3 salían del binario como «imputados» sólo por tener texto, sin que la pantalla pudiera
-- distinguir un gasto de obra de un gasto de estructura; y el 4 se leía como imputado cuando en
-- realidad no llega a ninguna obra — es la fuga silenciosa por la que el costo de una obra queda
-- corto sin que ningún número dé error.
--
-- ═══ EL ESTADO FINO SALE DEL MISMO DICCIONARIO QUE EL COSTO ═══
--
-- `norm_obra(obra_texto) = obra_alias.alias`, el criterio de `obra_costo_real` (20260719160000) y de
-- `obra_cobranza` (20260822T6200). `alias` es PRIMARY KEY, así que el join no puede duplicar una
-- fila. La clasificación del alias es la que decide:
--
--     obra | mantenimiento   → OBRA IDENTIFICADA, y la vista publica `obra_id`
--     indirecto | excluido   → ESTRUCTURA: imputado, pero no a una obra
--     (sin alias)            → SIN RESOLVER: alguien escribió algo que el diccionario no conoce
--     (sin texto)            → SIN IDENTIFICAR: nadie dijo nada
--
-- Se calcula EN LA VISTA y no en TypeScript: `comprasEstado.ts` ya deriva el estado de CONTROL y
-- podría derivar también éste, pero el diccionario de alias vive en Postgres y copiarlo al front
-- sería la segunda definición de «a qué obra pertenece este gasto» — exactamente lo que
-- `norm_obra()` existe para impedir.
--
-- ═══ LO QUE NO ESTÁ EN EL MODELO Y NO SE INVENTA ═══
--
-- · PARTIDA / ACTIVIDAD IMPUTADA. No existe. `comprobantes_arca` tiene 27 columnas y ninguna apunta a
--   `cotizacion_partida` ni a `obra_actividad`; `costos_obra` tampoco. Un comprobante llega como
--   mucho hasta la obra. NO se publica una columna que sería NULL para siempre: se declara acá, y
--   `compra-imputacion.pg.test.mjs` afirma la ausencia para que el día que alguien agregue la
--   columna el test se ponga rojo y obligue a cablear el estado en vez de dejarlo suelto.
--
-- · CONCILIADA contra banco o ARCA. Tampoco. `estado_control = 'confirmado'` es una PERSONA que miró
--   el papel, no una conciliación: un control nunca se valida contra la misma información que
--   produce. El puente que faltaría —`comprobantes_arca` ↔ `costos_obra` ↔ `banco_movimientos`— no
--   existe hoy, y fabricarlo por parecido de importe y fecha adentro de esta vista sería afirmar
--   «esto ya se pagó» sin evidencia. Queda declarado como gap, no como columna.

create or replace view public.comprobante_compra with (security_invoker = true) as
select
  c.id,
  c.fecha_emision,
  c.tipo_comprobante,
  public.comprobante_nombre_tipo(c.tipo_comprobante) as tipo_nombre,
  public.comprobante_letra(c.tipo_comprobante)       as letra,
  public.comprobante_signo(c.tipo_comprobante)       as signo,
  c.punto_venta,
  c.numero,
  nullif(btrim(coalesce(c.punto_venta, '') || '-' || coalesce(c.numero, ''), '-'), '') as comprobante,
  c.cae,
  c.emisor_cuit,
  c.emisor_nombre,
  c.moneda,
  c.imp_total,
  c.neto_gravado,
  c.neto_no_gravado,
  c.exento,
  c.total_iva,
  c.otros_tributos,
  c.iva_por_alicuota,
  c.periodo,
  c.origen,
  c.created_at,
  c.obra_texto,
  c.obra_asignada_por,
  c.obra_asignada_en,
  c.estado_control,
  c.estado_control_por,
  c.estado_control_en,
  exists (
    select 1 from public.comprobante_posible_duplicado d where d.comprobante_id = c.id
  ) as tiene_posible_duplicado,
  -- La obra CANÓNICA, no el texto. `obra_alias.obra_id` ya está en NULL para los alias `indirecto`,
  -- así que un gasto de Estructura no puede salir de acá con una obra colgada.
  al.obra_id,
  case
    when nullif(btrim(coalesce(c.obra_texto, '')), '') is null then 'sin_identificar'
    when al.alias is null                                     then 'sin_resolver'
    when al.clasificacion in ('obra', 'mantenimiento')        then 'obra'
    else 'estructura'
  end as imputacion
from public.comprobantes_arca c
left join public.obra_alias al on al.alias = public.norm_obra(c.obra_texto)
where c.tipo_libro = 'R';

comment on view public.comprobante_compra is
  'El libro de COMPRAS de ARCA como lo lee la pantalla 24: tipo_libro=R, el código traducido, el '
  'signo, y si el comprobante tiene un parecido sin resolver. `imputacion` es el estado FINO —obra / '
  'estructura / sin_resolver / sin_identificar— resuelto con el mismo diccionario de `obra_alias` que '
  'usa el costo por obra: una compra con obra conocida NO está sin imputar, y un gasto de Estructura '
  'tampoco. NO hay imputación a partida ni conciliación bancaria en el modelo: no se publican columnas '
  'que serían NULL para siempre. No agrega ni una fila que comprobantes_arca no publique ya.';

grant select on public.comprobante_compra to authenticated;
grant select on public.comprobante_compra to service_role;
