-- ═══ EL COSTO DE LA HORA SE RESUELVE UNA VEZ POR TRAMO (12/09/2026) ══════════════════════════════
--
-- `20260912T1000` midió la ficha de La Estrella en 39,3 ms de ejecución y la cerró con ese número.
-- La medición era verdadera y el control NO servía: `costo_hora_alicuota` tenía CERO filas, así que
-- el bloque de mano de obra no valorizaba nada y el planner cortocircuitaba la función. SE VALIDÓ
-- CONTRA EL ESTADO QUE LO HACÍA TRIVIAL. Cargadas las cinco alícuotas y las 79 tarifas históricas,
-- la misma ficha pasó a 1.657 ms — cuatro veces el techo de 300 ms de este repo.
--
-- MEDIDO como Dirección (RLS activa), mediana de cinco corridas, La Estrella:
--
--   pantalla_cliente('la-estrella','obras')                        1.657 ms
--   la misma, en una solapa sin `costo_obra`                          400 ms
--   el bloque de mano de obra solo                                    987 ms
--     · sólo las horas                                                 57 ms
--     · + el lateral de `persona_tarifa`                              180 ms
--     · + el lateral de `multiplicador_de_costo`                      838 ms   ← el 85 % del exceso
--
-- ═══ LA CAUSA RAÍZ: UNA FUNCIÓN CON `SET` NO SE INLINEA ═══
--
-- `multiplicador_de_costo` declara `set search_path to 'public'`. Postgres no puede inlinear una
-- función SQL con cláusula `SET`, así que la LLAMA de verdad: una vez por cada uno de los ~1.700
-- registros de horas de la obra. Cada llamada escanea `costo_hora_alicuota`, que tiene RLS por
-- `liquida_sueldos()`, y vuelve a evaluar el portero. Con la tabla vacía eso costaba cero; con cinco
-- filas cuesta 0,5 ms por llamada.
--
-- EL `SET` NO SE SACA. Es la defensa de la función contra un `search_path` hostil, y sacarlo para
-- ganar medio segundo cambiaría una propiedad de seguridad por una de rendimiento. Lo que se cambia
-- es QUIÉN LA LLAMA Y CUÁNTAS VECES.
--
-- ═══ EL ARREGLO ES EXACTO, NO UNA APROXIMACIÓN ═══
--
-- El conjunto de alícuotas vigentes sólo cambia en los `desde` que la tabla TIENE. Para cualquier
-- fecha, el multiplicador es el del mayor `desde` que ya empezó — que es la propia definición de la
-- función (`distinct on (concepto) ... where desde <= fecha order by concepto, desde desc`). Así que
-- llamarla una vez por `desde` distinto y después resolver por rango da el MISMO número, y se mide:
--
--   mano de obra de La Estrella   $97.143.625  antes y después
--   las trece obras              $213.093.749  antes y después
--
-- Y SIGUE SIN HABER UN 1 ESCONDIDO. Una fecha anterior al primer `desde` no encuentra tramo, `m.v`
-- queda null, y esas horas salen en `horas_sin_tarifa` — exactamente lo que pasaba cuando la función
-- devolvía null. El `filter (where ... m.v is not null)` es el mismo.
--
-- ═══ LOS PORTEROS, EN `(select …)` ═══
--
-- Una policy `using (public.liquida_sueldos())` se evalúa UNA VEZ POR FILA. Envuelta en un subselect
-- —`using ((select public.liquida_sueldos()))`— el planner la convierte en InitPlan y la evalúa una
-- sola vez por consulta, porque un subselect sin correlación con la fila no puede depender de ella.
-- Es la misma regla que ya se aplicó en este repo a los porteros de otras tablas, y acá importa
-- porque `persona_tarifa` se lee con un lateral por registro de horas (98 filas hoy, una por tramo
-- de cada persona) y `costo_hora_alicuota` la lee el CTE de tramos.
--
-- NO CAMBIA QUIÉN VE QUÉ. `liquida_sueldos()` es `stable` y no recibe argumentos: su resultado no
-- depende de la fila, y por eso envolverla es legítimo. Un portero que mirara una columna de la fila
-- NO se podría envolver, y ninguno de estos cuatro lo hace.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO ARREGLA, Y ES MEDIBLE ═══
--
-- Con el arreglo, el bloque de mano de obra de La Estrella baja de 1.005 ms a 395 ms y la ficha
-- completa queda cerca de 700 ms. El resto del exceso NO está en esta clave: una solapa de la misma
-- ficha SIN `costo_obra` ya cuesta 400 ms. Eso es otro trabajo y otra medición — acá se arregla el
-- 85 % que esta clave agregó, no la ficha entera.
--
-- `create or replace function` REEMPLAZA EL CUERPO COMPLETO, así que la función se copia ENTERA de
-- `20260912T1000`: las veintiuna claves, una por una. Una copia recortada borraría veinte de ellas
-- en silencio y la ficha quedaría con un solo campo.

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
  ),
  -- ═══ EL MULTIPLICADOR, UNA VEZ POR TRAMO Y NO UNA VEZ POR FILA ═══
  --
  -- `multiplicador_de_costo` es una función SQL con cláusula `SET search_path`, y una función con
  -- `SET` NO SE INLINEA: el planner no puede meter su cuerpo en la consulta, así que la llama de
  -- verdad, una vez por fila, y cada llamada escanea `costo_hora_alicuota` —que tiene RLS— y vuelve
  -- a evaluar el portero. El `SET` no se saca: es una propiedad de seguridad de la función.
  --
  -- Este CTE la llama una vez por cada `desde` DISTINTO de la tabla. Es exacto, no una aproximación:
  -- el conjunto de alícuotas vigentes sólo cambia en esos días, así que para cualquier fecha el
  -- multiplicador es el del mayor `desde` que ya empezó. Los dos totales coinciden al centavo.
  tramos_de_costo as (
    select d.desde, public.multiplicador_de_costo(d.desde, 1) as v
      from (select distinct a.desde from public.costo_hora_alicuota a) d
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
                  -- EL TRAMO QUE REGÍA A LA FECHA DEL REGISTRO. La misma regla de «el de mayor
                  -- desde que ya empezó» que la tarifa de arriba, sobre un CTE de cinco filas en vez
                  -- de una llamada a función por cada uno de los 3.356 registros. Sin tramo que
                  -- empiece antes, `m.v` es null y esas horas salen en `horas_sin_tarifa`: es lo
                  -- mismo que devolvía la función, y sigue sin ser un 1.
                  left join lateral (
                    select x.v from tramos_de_costo x
                     where x.desde <= r.fecha
                     order by x.desde desc limit 1) m on true
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

-- ═══ LOS CUATRO PORTEROS QUE SE EVALUABAN POR FILA ═══════════════════════════════════════════════
--
-- `drop policy` + `create policy` y no un `alter`: Postgres no deja cambiar la expresión de una
-- policy sin recrearla. Las dos tablas quedan con RLS activa todo el tiempo —la policy nueva se crea
-- en la misma transacción que la migración—, así que no hay una ventana en la que la tabla esté
-- abierta. Lo que se toca es la EXPRESIÓN, nunca el `to` ni el `for`: quién puede hacer qué no
-- cambia.
--
-- `persona_tarifa` no tiene policy de INSERT para `authenticated` a propósito (sólo `service_role`
-- escribe tarifas): no se agrega una acá, porque agregar un permiso no es optimizar una consulta.

do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'costo_hora_alicuota'
                and policyname = 'costo_hora_alicuota_lee_admin') then
    drop policy costo_hora_alicuota_lee_admin on public.costo_hora_alicuota;
  end if;
  create policy costo_hora_alicuota_lee_admin on public.costo_hora_alicuota
    for select to authenticated using ((select public.liquida_sueldos()));

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'costo_hora_alicuota'
                and policyname = 'costo_hora_alicuota_escribe_admin') then
    drop policy costo_hora_alicuota_escribe_admin on public.costo_hora_alicuota;
  end if;
  create policy costo_hora_alicuota_escribe_admin on public.costo_hora_alicuota
    for insert to authenticated with check ((select public.liquida_sueldos()));

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'persona_tarifa'
                and policyname = 'persona_tarifa_lee_admin') then
    drop policy persona_tarifa_lee_admin on public.persona_tarifa;
  end if;
  create policy persona_tarifa_lee_admin on public.persona_tarifa
    for select to authenticated using ((select public.liquida_sueldos()));
end $$;

-- ═══ LA DECISIÓN QUE FALTA, Y DE QUIÉN ES ════════════════════════════════════════════════════════
--
-- OFICINA NO SE VALORIZA, Y NO ES UN DATO QUE FALTE: es un hueco de forma.
--
-- Maldonado Batista Emiliano Miguel y Nievas Villegas Juan Pablo cargan horas a obras desde el
-- 05/01/2026 —3.017,5 de las 4.135 horas que siguen sin valorizar, el 73 %— y su fila de
-- `persona_tarifa` tiene `neto_mensual` ($1.800.000 c/u, origen `acuerdo:SUELDO_NETO_OFICINA`) con
-- `valor_hora` NULL, porque el CHECK `persona_tarifa_una_sola_forma` obliga a una de las dos y ellos
-- no cobran por hora. Los dos laterales —el de esta clave y el `getValorHoraVigente` de
-- `costoLecturas.ts`— piden `valor_hora`, así que para ellos devuelven null y sus horas salen en
-- `horas_sin_tarifa`.
--
-- Cargar filas no lo resuelve: inventar un `valor_hora` para Oficina sería fabricar el dato que el
-- acuerdo no tiene. Las dos salidas son decisión del dueño porque cambian cuánto cuesta una obra:
--
--   A · DERIVAR UN $/h IMPLÍCITO del neto mensual. `neto_mensual / horas del mes` y valorizar esas
--       horas como cualquier otra. A favor: la obra paga lo que realmente le cuesta el jefe de obra
--       que estuvo ahí. En contra: el divisor es una convención que alguien tiene que fijar (¿las
--       horas de la jornada UOCRA? ¿las horas que la persona cargó ese mes? los dos dan números
--       distintos) y el sueldo de Oficina NO sube ni baja con las horas trabajadas, así que el costo
--       por hora sería un promedio, no un precio.
--
--   B · DECLARAR QUE OFICINA NO SE CARGA A LA OBRA. Su sueldo es Estructura, no costo directo, y la
--       ficha lo dice con palabras en vez de dibujar un hueco. A favor: es el criterio que ya usa el
--       P&L (`Administración` y `Taller` son Estructura y no se imputan a Civil ni Mantenimiento) y
--       no necesita ninguna convención nueva. En contra: 3.017,5 horas de supervisión real
--       desaparecen del costo de las obras que las recibieron.
--
-- MIENTRAS NO SE DECIDA, LA PANTALLA DICE LA VERDAD: `horas_sin_tarifa` publica esas horas y
-- `personas_sin_tarifa` las cuenta, así que el número que se muestra nunca se lee como completo. Eso
-- es lo único que esta migración garantiza — no elige por el dueño.
--
-- Los otros dos huecos de las 4.135 horas, para que no se confundan con éste:
--   · 1.008,5 h de cuatro personas (Gonzales Abel Valentín, Palacios Rubén, Galván Guadalupe,
--     Nievas Ignacio) que nunca aparecieron en una quincena CERRADA: su $/h no existe en
--     `liquidacion_linea`, que es la fuente. No es una decisión, es un dato que hay que conseguir.
--   · 109 h de Sosa Néstor Raúl y Jofre Ismael del 20 al 30/03, anteriores a su primer tramo
--     sellado (16/04). Estirar el tramo hacia atrás afirmaría una tarifa sin evidencia.

notify pgrst, 'reload schema';
