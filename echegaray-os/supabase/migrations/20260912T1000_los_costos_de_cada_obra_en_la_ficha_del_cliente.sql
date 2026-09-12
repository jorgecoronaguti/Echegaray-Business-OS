-- ═══ LOS COSTOS DE CADA OBRA EN LA FICHA DEL CLIENTE (dueño, 12/09/2026) ═════════════════════════
--
-- «Necesito que cada obra tenga, así como las HH que lleva, los costos de obra aparejados: en una
-- columna que sume materiales gastados y mano de obra en otra; eso de estado que has puesto como
-- columna no me sirve.» Y 13:10: «incluso la columna de cobrado neto no me es un dato que sirve
-- verlo, porque para eso está la sección especial de cobranzas.»
--
-- Esta migración agrega UNA clave —`costo_obra`— a `pantalla_cliente`. El resto del contrato es
-- LITERALMENTE el de 20260911T2400: se copia entera porque `create or replace function` reemplaza el
-- cuerpo completo y una copia recortada borraría las otras diecinueve claves.
--
-- ═══ DE DÓNDE SALE CADA NÚMERO, Y POR QUÉ DE AHÍ ═══
--
--   MATERIALES  `costos_obra` —el espejo de la pestaña Compras— puenteado por `obra_alias`, que es
--               EXACTAMENTE el par de fuentes que usa `obra_costo_real` para el «costo real» de la
--               ficha de la obra. No se abre una fuente nueva ni se suma `compra_sheet` por su
--               cuenta: el conjunto de filas es el mismo, y lo que esta clave agrega es el DESGLOSE
--               de ese conjunto.
--   MANO DE OBRA las horas de `registros_hh` valorizadas con la MISMA regla que la solapa «Costo a la
--               obra» de Liquidación: valor hora vigente de la persona × horas × multiplicador de
--               cargas. Ni una definición nueva de HH (la suma de horas sigue siendo la de
--               `obra_plan_vs_real`, que viaja en `hh_obra`) ni una de costo.
--
-- ═══ POR QUÉ MATERIALES NO ES `obra_costo_real.costo_real` ═══
--
-- Porque `costo_real` es TODO lo imputado a la obra y la columna que el dueño pidió es MATERIALES.
-- Se excluyen, sobre las mismas filas:
--
--   · `area in ('personas','contabilidad_legales','administracion_finanzas')` — nómina, cargas,
--     ARCA y financiero. Medido el 12/09/2026: las ÚNICAS filas de esas áreas imputadas a una obra
--     son cuatro de «Sueldos» por $8.346.650 que además están ANULADAS en el Sheet.
--   · las anuladas del Sheet (`compra_sheet.anulada`, «ELIMINADO»/«Cancelado»). `costos_obra` no
--     replica el estado, así que la marca se lee de `compra_sheet` por `referencia_externa`: el
--     cruce cierra 893 de 893 filas, medido. Hace falta porque `sync-compras.mjs` escribe
--     `c.total || c.importe` y una fila anulada con total en 0 e importe cargado entra al espejo con
--     el importe puesto — es el camino por el que esos $8,3 M están hoy dentro de `costo_real`.
--   · el rubro «Subcontratos y mano de obra» (`compra_sheet.familia_material`), que es mano de obra
--     facturada por un tercero y no material. Viaja APARTE en `subcontratos` para que no desaparezca
--     en silencio: la celda lo nombra en su `title`. Son $2.062.462 en 6 comprobantes.
--
-- LA COLUMNA AC NO SE PUEDE USAR y eso es un límite conocido, no un olvido: «Rubro de caja» está
-- repetida en AB y AC —capa fósil de un generador retirado— y `compras-fila.mjs` declara que ninguna
-- de las dos se replica. El rubro que SÍ existe en la réplica es `familia_material`, que es el que
-- separa los subcontratos. 318 filas ($107,6 M) no tienen familia cargada: cuentan como materiales,
-- porque dejarlas afuera escondería plata que la obra gastó.
--
-- ═══ EL MULTIPLICADOR VIVE EN UNA FUNCIÓN, Y HOY ES NULL ═══
--
-- `public.multiplicador_de_costo(fecha)` es el espejo EXACTO de `multiplicadorDeCosto()` de
-- `src/features/administracion/services/costoHora.ts` con `proporcionDeclarada = 1`, que es como la
-- llama la solapa «Costo a la obra». Las dos implementaciones se comparan contra la base real en
-- `orquestador/lib/costo-por-obra.pg.test.mjs`; sin esa comparación se separan en el primer cambio.
--
-- NULL NUNCA ES 1. Medido el 12/09/2026: `costo_hora_alicuota` tiene CERO filas y `persona_tarifa`
-- sólo 19, todas desde el 01/09/2026, contra horas cargadas desde el 05/01/2026. O sea que HOY esta
-- clave devuelve `mano_obra = null` para las trece obras y todas sus horas salen en
-- `horas_sin_tarifa`. Es la verdad y la pantalla la dice con palabras («sin valorizar») en vez de
-- dibujar un $ 0 que se leería como «esta obra no tuvo mano de obra». Lo que falta para que se llene
-- es DATO, no código: las cinco alícuotas de costo y las tarifas anteriores a septiembre.
--
-- ═══ LA ACTIVIDAD RECIENTE VIAJA TAMBIÉN EN LA CARA TRABAJOS (dueño, 12/09/2026 13:10) ═══
--
-- «El CRM admin en cada cliente tiene secciones inútiles y repetitivas con datos que pueden
-- unificarse en menos secciones.» «Actividad» dejó de ser una de las nueve solapas y pasó al COSTADO
-- de la ficha, que se dibuja en la cara Trabajos y en las otras tres con costado. Sus cuatro fuentes
-- baratas —`notas`, `autores`, `actividad_cliente` y `certificados`— ahora viajan también con
-- `p_solapa = 'obras'`.
--
-- LOS DOCUMENTOS NO: `documentos` + `drive` son 49 KB de los 90 que pesa la ficha de Messina (medido
-- el 12/09/2026 contra la base real, con y sin ellos) y meterlos en la cara que todos abren es
-- exactamente lo que 20260911T1200 acaba de sacar. La línea de tiempo COMPLETA —la que los incluye—
-- se pide con `p_solapa = 'actividad'`, que sigue existiendo aunque ya no sea una solapa: la página
-- se la pide sólo cuando alguien la abre, y el bloque del costado DECLARA que su resumen no los trae.
--
-- Las cuatro claves que se agregan a la cara Trabajos no le costaron ni un KB: 41 KB con y sin ellas.
--
-- ═══ LA GUARDA DE ROL ES LA DE `hh_obra`, MÁS UNA ═══
--
-- `costo_obra` es `null` para quien no es Administración: publica plata por obra y `costos_obra`
-- deja ver al jefe de obra sólo las suyas —media suma parece una suma—. Y `puede_ver_tarifas`
-- viaja en cada fila porque `persona_tarifa` y `costo_hora_alicuota` tienen RLS por
-- `liquida_sueldos()`, que es MÁS ANGOSTO que `es_administracion()`: sin ese campo, un jefe de obra
-- vería «sin valorizar» —que significa «falta cargar el dato»— cuando lo que pasa es que no tiene
-- permiso para leer las tarifas. Son dos hechos distintos y la celda los dibuja distinto.
--
-- ═══ COSTO MEDIDO (`explain analyze` del cuerpo de la clave, 12/09/2026, como Dirección) ═══
--
--   messina       planning 27,9 ms · execution 40,2 ms
--   la-estrella   planning 28,1 ms · execution 39,3 ms
--   quattropani   planning 26,7 ms · execution 45,7 ms
--
-- Los tres muy por debajo de los 300 ms. No hizo falta ningún índice nuevo: el de
-- `registros_hh (obra_canonica_id, fecha)` lo puso 20260911T2400 y los de `costos_obra` ya estaban.

-- ═══ EL MULTIPLICADOR DE CARGAS, UNA VEZ Y VERSIONADO ════════════════════════════════════════════
--
-- Espejo EXACTO de `multiplicadorDeCosto(alicuotasVigentes(filas, fecha), 1)` de
-- `src/features/administracion/services/costoHora.ts`, que es como lo llama la solapa «Costo a la
-- obra». Se escribe en SQL porque la suma de 3.614 registros de horas tiene que cruzar el cable ya
-- agregada; la comparación entre las dos implementaciones la hace
-- `orquestador/lib/costo-por-obra.pg.test.mjs` contra la base real, y sin ella se separan.
--
-- LA VIGENTE NO ES LA ÚLTIMA FILA: es la de mayor `desde` que ya empezó A LA FECHA QUE SE PREGUNTA
-- (`distinct on (concepto) ... order by concepto, desde desc`). Cargar hoy la ART que rige desde
-- octubre no puede cambiar lo que costó la hora de septiembre.
--
-- SIN UNA SOLA ALÍCUOTA VIGENTE DEVUELVE NULL, NUNCA 1. Un 1 afirmaría «la hora cuesta lo que
-- cobra», que es falso por un 52 % según el handoff §5, y lo afirmaría con la misma cara con la que
-- se dice un número verdadero.
--
-- `base = 'declarado'` pesa `p_proporcion_declarada` y `base = 'total'` pesa 1, igual que en TS. Con
-- `p = 1` —el único valor que usa hoy la solapa— los dos pesos son 1 y el multiplicador es
-- `1 + Σ porcentaje/100`.
create or replace function public.multiplicador_de_costo(
  p_fecha date, p_proporcion_declarada numeric default 1
) returns numeric
 language sql
 stable
 set search_path to 'public'
as $$
  select case when count(*) = 0 then null
              else 1 + sum(v.porcentaje / 100
                           * case when v.base = 'total' then 1
                                  else least(1, greatest(0, coalesce(p_proporcion_declarada, 1))) end)
         end
    from (select distinct on (a.concepto) a.porcentaje, a.base
            from public.costo_hora_alicuota a
           where a.desde <= p_fecha
           order by a.concepto, a.desde desc) v
$$;

comment on function public.multiplicador_de_costo(date, numeric) is
  'Cuántas veces el bolsillo cuesta la hora a la fecha dada. Espejo EXACTO de multiplicadorDeCosto() '
  'en costoHora.ts: si cambia una, cambia la otra (costo-por-obra.pg.test.mjs las compara). NULL sin '
  'ninguna alícuota vigente — nunca 1.';


CREATE OR REPLACE FUNCTION public.pantalla_cliente(p_slug text, p_solapa text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  with elegido as (
    select c.cliente_id from public.cliente_panel c where c.slug = p_slug
  ),
  -- SUS OBRAS, UNA VEZ. Las usan tres claves: la lista de la ficha, la actividad y el recorte de
  -- los certificados. Sin el CTE, la misma vista se recorrería tres veces en el mismo viaje.
  sus_obras as (
    select o.* from public.obra_panel o
     where o.cliente_id = (select cliente_id from elegido)
  )
  select jsonb_build_object(

    -- LA FICHA. `null` = no existe o no la puedo ver; la pantalla ya distingue eso de un error.
    'cliente', (select to_jsonb(c) from public.cliente_panel c where c.slug = p_slug),

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    -- LOS RESPONSABLES POSIBLES, sin las identidades de prueba: nombrar responsable a una cuenta de
    -- QA es una decisión de negocio tomada por accidente. Se filtra por `es_prueba`, no por texto.
    'responsables', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol)
                                order by p.nombre), '[]'::jsonb)
        from public.perfiles p where p.es_prueba = false
    ),

    'contactos', (
      select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
        from public.cliente_contacto k
       where k.cliente_id = (select cliente_id from elegido)
    ),

    'obras', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from sus_obras o),

    -- LO QUE OBRAS PUBLICA POR OBRA. Sin recortar por cliente: la ficha usa el mapa completo, igual
    -- que la cartera, y recortarlo acá sería una regla nueva que nadie pidió.
    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'obra_padre_id', e.obra_padre_id,
                                  -- EL CONTRATO EN SU MONEDA Y EL DÓLAR CON QUE SE VALUÓ: Quattropani
                                  -- se firmó en U$S y el peso equivalente cambia solo de un día para
                                  -- otro. Los dos viajan; la pantalla decide cuál muestra.
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  -- LOS DOS TOTALES DE OC NO SE SUMAN: `ventana` es lo que el cliente
                                  -- emitió dentro del año que acota el contratado e `historico` lo de
                                  -- otros años, que en una obra fusionada son órdenes viejas.
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  'contrato_mano_obra', e.contrato_mano_obra,
                                  'contrato_mano_obra_usd', e.contrato_mano_obra_usd,
                                  'contrato_materiales', e.contrato_materiales,
                                  'contrato_materiales_usd', e.contrato_materiales_usd,
                                  'contrato_total', e.contrato_total,
                                  'contrato_fuente', e.contrato_fuente,
                                  'contrato_fuente_drive_id', e.contrato_fuente_drive_id,
                                  'contrato_fuente_nombre', e.contrato_fuente_nombre,
                                  'contrato_cita', e.contrato_cita,
                                  'contrato_nota', e.contrato_nota)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    -- LO COBRADO POR TRABAJO — la MISMA vista y las MISMAS ocho columnas que `/clientes`. La ficha
    -- del CRM lo necesita para decir si un trabajo cobró; con una lectura propia, las dos pantallas
    -- del módulo volverían a poder decir números distintos sobre la misma obra.
    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
       where u.cliente_id = (select cliente_id from elegido)
    ),

    -- ═══ LAS HORAS DE CADA OBRA (dueño, 11/09/2026) ═══
    --
    -- `hh_real` y `hh_plan` NO se calculan acá: se leen de `obra_plan_vs_real`, la cara canónica de
    -- las HH por obra. Lo que se agrega es lo que ninguna vista publica —desde cuándo, cuántos
    -- registros, cuánta gente, hasta cuándo—, contando LAS MISMAS FILAS que la vista sumó.
    --
    -- Una obra sin horas ni plan NO viaja: la pantalla dibuja «—» por ausencia de fila, y mandar
    -- once filas de nulls sería peso para decir nada.
    'hh_obra', case
      when p_solapa is not null and p_solapa not in ('obras', 'actividad') then '[]'::jsonb
      -- LA GUARDA DE ROL: ver la cabecera. Media suma parece una suma.
      when not (select public.es_administracion()) then null::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'obra_id', v.obra_id, 'hh_real', v.hh_real, 'hh_plan', v.hh_plan,
                 'registros', v.registros, 'personas', v.personas,
                 'inicio_real', v.inicio_real, 'ultima_fecha', v.ultima_fecha)), '[]'::jsonb)
          from (
            select w.obra_id, w.hh_real, w.hh_plan,
                   r.registros, r.personas, r.inicio_real, r.ultima_fecha
              from public.obra_plan_vs_real w
              left join lateral (
                select count(*)::int                        as registros,
                       count(distinct x.persona_id)::int    as personas,
                       min(x.fecha)                         as inicio_real,
                       max(x.fecha)                         as ultima_fecha
                  from public.registros_hh x
                 where x.obra_canonica_id = w.obra_id
                   -- EL MISMO FILTRO DE LA VISTA, porque cuenta las filas que ella sumó.
                   and x.tipo_hora in ('normal', 'extra_50', 'extra_100')) r on true
             where w.obra_id in (select o.obra_id from sus_obras o)
               and (w.hh_real is not null or w.hh_plan is not null)
          ) v
      )
    end,

    -- ═══ LO QUE LLEVA GASTADO CADA OBRA (dueño, 12/09/2026) ═══
    --
    -- Dos columnas: MATERIALES (lo comprado e imputado a la obra) y MANO DE OBRA (sus horas
    -- valorizadas). De dónde sale cada una, qué se excluye y por qué, en la cabecera de esta
    -- migración. Una obra sin comprobantes y sin horas NO viaja: la pantalla dibuja «—» por ausencia
    -- de fila, y mandar trece filas de nulls es peso para no decir nada.
    'costo_obra', case
      when p_solapa is not null and p_solapa <> 'obras' then '[]'::jsonb
      -- LA GUARDA DE ROL: ver la cabecera. `null` = no puedo decirlo; `[]` = nadie gastó nada.
      when not (select public.es_administracion()) then null::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'obra_id', v.obra_id,
                 'materiales', v.materiales, 'subcontratos', v.subcontratos,
                 'n_comprobantes', v.n_comprobantes, 'ultimo_comprobante', v.ultimo_comprobante,
                 'mano_obra', v.mano_obra, 'horas_valorizadas', v.horas_valorizadas,
                 'horas_sin_tarifa', v.horas_sin_tarifa,
                 'personas_sin_tarifa', v.personas_sin_tarifa,
                 'multiplicador', v.multiplicador,
                 'puede_ver_tarifas', v.puede_ver_tarifas)), '[]'::jsonb)
          from (
            select o.obra_id,
                   k.materiales, k.subcontratos, k.n_comprobantes, k.ultimo_comprobante,
                   h.mano_obra, h.horas_valorizadas, h.horas_sin_tarifa, h.personas_sin_tarifa,
                   -- EL MULTIPLICADOR DE HOY, para que la celda pueda decir QUÉ FALTA cuando no
                   -- puede valorizar. No es el que se usa en la cuenta —ahí se usa el vigente a la
                   -- fecha de CADA registro—: es el que explica el hueco.
                   public.multiplicador_de_costo(current_date) as multiplicador,
                   -- `persona_tarifa` y `costo_hora_alicuota` tienen RLS por `liquida_sueldos()`,
                   -- más angosto que `es_administracion()`. Sin este campo, «no tengo permiso» se
                   -- dibujaría igual que «falta cargar la tarifa».
                   public.liquida_sueldos() as puede_ver_tarifas
              from sus_obras o
              -- ── MATERIALES: LAS MISMAS FILAS QUE `obra_costo_real`, DESGLOSADAS ────────────────
              left join (
                select a.obra_id,
                       sum(c.total)   filter (where not x.es_subcontrato)          as materiales,
                       sum(c.total)   filter (where x.es_subcontrato)              as subcontratos,
                       count(*)       filter (where not x.es_subcontrato)::int     as n_comprobantes,
                       max(c.fecha)   filter (where not x.es_subcontrato)          as ultimo_comprobante
                  from public.costos_obra c
                  -- EL MISMO PUENTE QUE `obra_costo_real`: el eje canónico, nunca texto contra texto.
                  join public.obra_alias a
                    on a.alias = public.norm_obra(c.obra_texto)
                   and a.clasificacion in ('obra', 'mantenimiento')
                  -- EL ESTADO Y EL RUBRO NO ESTÁN EN EL ESPEJO: se leen de la fila del Sheet por
                  -- `referencia_externa`. El cruce cierra 893 de 893 (medido 12/09/2026); una fila
                  -- que no cruzara quedaría como material y NO desaparecería del total.
                  left join public.compra_sheet s
                    on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
                  cross join lateral (select coalesce(s.familia_material, '') = 'Subcontratos y mano de obra'
                                        as es_subcontrato) x
                 where c.area is distinct from 'personas'
                   and c.area is distinct from 'contabilidad_legales'
                   and c.area is distinct from 'administracion_finanzas'
                   and coalesce(s.anulada, false) = false
                 group by a.obra_id) k on k.obra_id = o.obra_id
              -- ── MANO DE OBRA: LA REGLA DE «COSTO A LA OBRA», A LA FECHA DE CADA REGISTRO ───────
              left join (
                select r.obra_canonica_id as obra_id,
                       sum(r.horas * t.valor_hora * m.v)
                         filter (where t.valor_hora is not null and m.v is not null) as mano_obra,
                       sum(r.horas)
                         filter (where t.valor_hora is not null and m.v is not null) as horas_valorizadas,
                       -- LO QUE NO SE PUDO VALORIZAR, EN HORAS. Sin esto, «$ 1,2 M» de una obra a la
                       -- que le falta la tarifa de seis personas se leería como el costo completo.
                       sum(r.horas)
                         filter (where t.valor_hora is null or m.v is null) as horas_sin_tarifa,
                       count(distinct r.persona_id)
                         filter (where t.valor_hora is null)::int as personas_sin_tarifa
                  from public.registros_hh r
                  -- LA TARIFA VIGENTE A LA FECHA DEL REGISTRO, no la de hoy: una hora de marzo costó
                  -- lo que costaba en marzo, y valuar el acumulado a la tarifa de hoy lo infla con la
                  -- inflación del año. Es la MISMA regla de «la de mayor desde que ya empezó» que
                  -- aplica `getValorHoraVigente`, evaluada en la fecha que corresponde.
                  left join lateral (
                    select p.valor_hora from public.persona_tarifa p
                     where p.persona_id = r.persona_id and p.desde <= r.fecha
                     order by p.desde desc limit 1) t on true
                  left join lateral (
                    select public.multiplicador_de_costo(r.fecha) as v) m on true
                 where r.obra_canonica_id in (select o2.obra_id from sus_obras o2)
                   -- EL MISMO FILTRO DE TIPO DE HORA QUE `hh_obra` Y QUE LA SOLAPA: una ausencia no
                   -- se trabajó y una licencia la paga la empresa, no la obra.
                   and r.tipo_hora in ('normal', 'extra_50', 'extra_100')
                 group by r.obra_canonica_id) h on h.obra_id = o.obra_id
             where k.n_comprobantes is not null
                or h.horas_valorizadas is not null
                or h.horas_sin_tarifa is not null
          ) v
      )
    end,

    -- LO CONTRATADO Y LO COBRADO DEL CLIENTE, sumado por la base. `null` cuando el rol no ve
    -- economía (`ve_economia()` adentro de la vista) o cuando el cliente no tiene fila.
    'economia_cliente', (
      select jsonb_build_object(
               'cliente_id', x.cliente_id, 'contratado', x.contratado,
               'contratado_en_curso', x.contratado_en_curso, 'n_obras_en_curso', x.n_obras_en_curso,
               'n_obras_cerradas', x.n_obras_cerradas, 'n_obras_con_precio', x.n_obras_con_precio,
               'n_obras_sin_precio', x.n_obras_sin_precio, 'costo_real', x.costo_real,
               'facturado_90d', x.facturado_90d, 'cobrado_90d', x.cobrado_90d,
               'cobrado_total', x.cobrado_total, 'cobrado_neto_total', x.cobrado_neto_total,
               'saldo', x.saldo, 'vencido', x.vencido, 'por_vencer', x.por_vencer,
               'pendiente_contractual', x.pendiente_contractual)
        from public.cliente_economia x
       where x.cliente_id = (select cliente_id from elegido)
    ),

    -- LOS PAPELES DEL CLIENTE, con `atribucion`: la ficha muestra CÓMO se ató cada uno a su obra.
    'papeles', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'obra_id', r.obra_id, 'tipo', r.tipo, 'numero', r.numero,
               'fecha', r.fecha, 'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
               'nombre_archivo', r.nombre_archivo, 'atribucion', r.atribucion,
               'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.cliente_id = (select cliente_id from elegido)
         and r.eliminado_en is null
    ),

    -- CUÁNTOS VÍNCULOS A DRIVE TIENE, SIEMPRE. La barra de solapas escribe «Documentos · N» en
    -- las nueve caras, y sin esta cuenta recortar las filas convertiría ese N en un cero falso —
    -- que es peor que el peso que se ahorra. `count(` no fabrica un número de negocio: es el
    -- `.length` del mismo array, con el mismo `where`, hecho antes del cable.
    'n_documentos', (
      -- ═══ EL N DE LA SOLAPA CUENTA LO QUE LA CARA DIBUJA (dueño, 11/09/2026 17:50) ═══
      --
      -- «El CRM dice documentos de drive (0) y está pésimo eso.» Contaba `cliente_documento` —los
      -- vínculos hechos a mano— y San Francisco tenía CERO con 63 archivos abajo. Ahora cuenta las
      -- tres fuentes que la cara dibuja, SIN CONTAR DOS VECES el mismo archivo: un `union` de ids,
      -- que es exactamente la regla de `armarCaraDocumentos` («la clave es el drive_file_id, y el
      -- papel del OS le gana al de Drive») expresada del otro lado del cable.
      --
      -- LAS DOS IMPLEMENTACIONES SE COMPARAN: `orquestador/lib/cara-documentos.pg.test.mjs` mide
      -- este número contra el que arma TypeScript sobre el MISMO payload, para los clientes reales.
      -- Sin esa comparación, el N de arriba y las filas de abajo se separan en el primer cambio.
      --
      -- Las órdenes SIN PDF se cuentan por su número canónico y no por su fila: dos copias del mismo
      -- mail son UNA orden, que es lo que agrupa `agruparPapeles()` en TypeScript.
      select count(*) from (
        select z.drive_file_id id from public.obra_papel_drive z
         where z.obra_id in (select o.obra_id from sus_obras o)
        union
        select d.drive_file_id from public.cliente_documento d
         where d.cliente_id = (select cliente_id from elegido)
        union
        select coalesce(r.drive_file_id, 'os:' || upper(btrim(coalesce(r.numero, r.id::text))) || ':' || r.tipo)
          from public.cliente_orden r
         where r.cliente_id = (select cliente_id from elegido)
           and r.eliminado_en is null and r.tipo in ('orden_compra', 'orden_pago')
        union
        -- LA CUARTA FUENTE: lo que está en la carpeta del CLIENTE y ninguna obra reclama. La cara lo
        -- dibuja al final («Carpeta del cliente · sin obra asignada») y sin esta rama el número de
        -- arriba sería MENOR que las filas de abajo — el defecto original dado vuelta. Messina tiene
        -- 37 archivos así.
        select a.drive_file_id from public.drive_index a
         where not a.is_folder and coalesce(a.trashed, false) = false
           and coalesce(a.ausente_en_drive, false) = false
           and a.path like (
             select p.path || '/%' from public.drive_index p
              where p.drive_file_id = (select c.drive_carpeta_id from public.cliente_panel c
                                        where c.slug = p_slug))
      ) t
    ),

    -- LOS VÍNCULOS A DRIVE, y APARTE los archivos. No se cruzan acá: ver la cabecera.
    'documentos', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', d.drive_file_id, 'rol', d.rol, 'origen', d.origen,
               'creado_en', d.creado_en)), '[]'::jsonb)
        from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    -- LA TERCERA OLA QUE DEJA DE SER UNA OLA: esto esperaba a que volvieran los ids de arriba.
    'drive', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', a.drive_file_id, 'name', a.name, 'path', a.path,
               'mime_type', a.mime_type, 'modified_time', a.modified_time)), '[]'::jsonb)
        from public.drive_index a
       where a.drive_file_id in (
               select d.drive_file_id from public.cliente_documento d
                where d.cliente_id = (select cliente_id from elegido))
    ) else '[]'::jsonb end,

    -- LAS NOTAS Y SUS AUTORES, por separado: una nota cuyo perfil ya no está queda SIN FIRMA, que
    -- es la verdad, en lugar de perderse. Ese cruce lo hace TypeScript y sigue siendo uno solo.
    'notas', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en)
               order by n.creado_en desc), '[]'::jsonb)
        from public.cliente_nota n
       where n.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    'autores', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)), '[]'::jsonb)
        from public.perfiles p
       where p.id in (
               select n.autor_id from public.cliente_nota n
                where n.cliente_id = (select cliente_id from elegido) and n.autor_id is not null)
    ) else '[]'::jsonb end,

    -- LAS FECHAS DEL CLIENTE PARA LA ACTIVIDAD salen de `clientes`, no de `cliente_panel`: la vista
    -- no las publica, y agregarlas ahí sería una migración para una solapa que no la necesita.
    'actividad_cliente', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select jsonb_build_object('nombre_comercial', c.nombre_comercial,
                                'created_at', c.created_at, 'updated_at', c.updated_at)
        from public.clientes c where c.id = (select cliente_id from elegido)
    ) else null::jsonb end,

    -- LOS CERTIFICADOS DE SUS OBRAS — la otra lectura que esperaba a la ola anterior.
    'certificados', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
               'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
               'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
               'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
        from public.certificados t
       where t.obra_canonica_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- ═══ LOS PAPELES QUE CONFORMARON CADA OBRA (dueño, 11/09/2026) ═══
    --
    -- «No encuentro las cotizaciones, los documentos, archivos y demás cuestiones que han conformado
    -- todas las obras.» Viajan SÓLO en la cara Documentos, que es la única que los dibuja: son 106
    -- filas en Messina y arrastrarlas por las otras ocho caras es el peso que 20260911T1200 acaba de
    -- sacar.
    'papeles_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', z.drive_file_id, 'obra_id', z.obra_id, 'nombre', z.nombre,
               'ruta', z.ruta, 'mime_type', z.mime_type, 'size_bytes', z.size_bytes,
               'modified_time', z.modified_time, 'web_view_link', z.web_view_link,
               'via', z.via)), '[]'::jsonb)
        from public.obra_papel_drive z
       where z.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LAS CARPETAS VINCULADAS. Sin esto, «esta obra no tiene papeles» y «esta obra no tiene carpeta
    -- vinculada en Drive» se dibujan igual —una lista vacía— y son dos hechos opuestos: el primero
    -- es una obra sin documentar y el segundo, trabajo del OS que falta hacer.
    'carpetas_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', y.obra_id, 'drive_folder_id', y.drive_folder_id, 'ruta', y.ruta,
               'fuente', y.fuente)), '[]'::jsonb)
        from public.obra_carpeta_drive y
       where y.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LOS PRESUPUESTOS DE ESTE CLIENTE. La aplicación traía TODA la cartera vigente y descartaba en
    -- memoria; el filtro es el mismo predicado (`cliente_id`), sólo que antes del cable.
    'presupuestos', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.fecha_cotizacion desc), '[]'::jsonb)
        from public.cotizacion_cascada z
       where z.vigente = true and z.cliente_id = (select cliente_id from elegido)
    )
  )
$$;

comment on function public.pantalla_cliente(text, text) is
  'LAS VEINTE LECTURAS DE LA FICHA EN UN VIAJE. `papeles_obra` y `carpetas_obra` sólo en la cara '
  'Documentos; `n_documentos` cuenta LO QUE LA CARA DIBUJA (20260911T2200); `hh_obra` publica las HH '
  'de cada trabajo leídas de obra_plan_vs_real (20260911T2400). Desde 20260912T1000 `costo_obra` '
  'publica lo GASTADO por trabajo —materiales de Compras (las mismas filas de obra_costo_real, sin '
  'nómina, sin anuladas y sin subcontratos) y mano de obra propia valorizada con la regla de la '
  'solapa Costo a la obra— sólo en la cara Obras. Las dos claves son `null` cuando quien pregunta no '
  'es Administración: la RLS le daría media suma, y media suma parece una suma.';

-- ═══ EL ÍNDICE QUE ESTA CLAVE NECESITA ═══
--
-- `registros_hh` no tenía índice por obra: cada una de las trece obras de un cliente hacía un
-- recorrido secuencial de las 3.544 filas. Son pocas hoy —el timer de JORNALES agrega ~100 por día—
-- y el plan seguiría siendo secuencial por un rato, pero la forma de la consulta es «todas las filas
-- de ESTA obra en ESTE rango», que es exactamente lo que este índice contesta, y el desglose por
-- quincena (20260911T2410) lo usa con las dos columnas.
create index if not exists registros_hh_obra_fecha_idx
  on public.registros_hh (obra_canonica_id, fecha);

notify pgrst, 'reload schema';
