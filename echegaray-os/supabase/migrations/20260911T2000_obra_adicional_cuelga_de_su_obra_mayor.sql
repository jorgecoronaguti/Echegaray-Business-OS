-- ═══ UN ADICIONAL CUELGA DE SU OBRA MAYOR (dueño, 11/09/2026) ═══════════════════════════════════
--
-- «Hay obras cuyo nombre indica que es "adicional" y quiero que estén a un subnivel que se vea
-- debajo de la obra mayor, por más que tengan OC distinta en individual.»
--
-- La evidencia de CADA relación —archivo de Drive, celda del Sheet, decisión textual— está en
-- `docs/engineering/OBRAS-ADICIONALES-2026-09-11.md`. Acá se escribe sólo lo que ese documento
-- puede probar.
--
-- ═══ POR QUÉ UNA COLUMNA Y NO UNA FUSIÓN ═══
--
-- `fusionada_en` (20260910T1900) dice «esta obra ES la otra»: la saca de las pantallas y su plata
-- pasa a la viva. Un adicional NO es la misma obra: tiene su propia OC, su propia cotización y su
-- propio precio, y el dueño quiere verlo — abajo de su madre, con sangría, no escondido. Son dos
-- relaciones distintas y por eso son dos columnas distintas.
--
-- ═══ EL TIPO ES `text`, NO `uuid` ═══
--
-- `obra_canonica.id` es el SLUG («messina-playon-azufre»), no un uuid: el pedido decía uuid y la
-- clave de esta tabla nunca lo fue. `fusionada_en` ya es `text` por lo mismo.
--
-- ═══ UN SOLO NIVEL, Y POR QUÉ ALCANZA ═══
--
-- El trigger prohíbe que el padre tenga padre, que una obra con hijos se vuelva hija, que el padre
-- esté fusionado (no se dibuja: el hijo quedaría colgado de algo invisible) y que el padre sea de
-- OTRO cliente. Con eso no hay ciclo posible de ningún largo y la pantalla dibuja DOS niveles
-- fijos. Un árbol de profundidad libre habría que dibujarlo, y nadie lo pidió: el adicional de un
-- adicional, cuando exista, cuelga de la misma madre.

alter table public.obra_canonica
  add column if not exists obra_padre_id text references public.obra_canonica(id);

comment on column public.obra_canonica.obra_padre_id is
  'LA OBRA MAYOR DE LA QUE ESTE TRABAJO ES UN ADICIONAL. No es `fusionada_en`: el adicional existe, '
  'tiene su OC y su precio, y se dibuja con sangría DEBAJO de su madre. NULL = no es adicional de '
  'ninguna. La evidencia de cada relación vive en docs/engineering/OBRAS-ADICIONALES-2026-09-11.md.';

alter table public.obra_canonica drop constraint if exists obra_canonica_obra_padre_id_chk;
alter table public.obra_canonica add constraint obra_canonica_obra_padre_id_chk
  check (obra_padre_id is null or obra_padre_id <> id);

create index if not exists obra_canonica_obra_padre_id_idx
  on public.obra_canonica (obra_padre_id) where obra_padre_id is not null;

-- ═══ LAS CUATRO COSAS QUE UN ADICIONAL NO PUEDE HACER ═══
--
-- Un CHECK no puede mirar otra fila; esto es lo que hace falta para que «no hay ciclos» sea un hecho
-- de la base y no una costumbre. Mismo patrón que `obra_actividad.actividad_padre_id`
-- (20260819T4700), que ya resolvió este problema una vez.
create or replace function public.obra_padre_coherente()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $fn$
begin
  if new.obra_padre_id is null then return new; end if;

  if new.obra_padre_id = new.id then
    raise exception 'una obra no puede ser adicional de sí misma (%)', new.id;
  end if;

  -- UN SOLO NIVEL. Sin esto, a→b→c es un ciclo en potencia y la pantalla tendría que dibujar una
  -- profundidad que nadie decidió.
  if exists (select 1 from public.obra_canonica p
              where p.id = new.obra_padre_id and p.obra_padre_id is not null) then
    raise exception 'el adicional % apunta a %, que ya es adicional de otra obra', new.id, new.obra_padre_id;
  end if;

  -- LA OTRA MITAD DEL CICLO: una obra que ya tiene adicionales no puede volverse adicional.
  if exists (select 1 from public.obra_canonica h where h.obra_padre_id = new.id) then
    raise exception 'la obra % ya tiene adicionales colgados: no puede volverse adicional de %', new.id, new.obra_padre_id;
  end if;

  -- EL PADRE TIENE QUE ESTAR VIVO. `obra_panel` no publica las fusionadas: colgar un adicional de
  -- una obra fusionada lo dejaría debajo de algo que ninguna pantalla dibuja.
  if exists (select 1 from public.obra_canonica p
              where p.id = new.obra_padre_id and p.fusionada_en is not null) then
    raise exception 'la obra mayor % está fusionada en %: el adicional tiene que colgar de la obra viva',
      new.obra_padre_id, (select fusionada_en from public.obra_canonica where id = new.obra_padre_id);
  end if;

  -- Y TIENE QUE SER DEL MISMO CLIENTE: un adicional es más alcance del MISMO encargo.
  if exists (select 1 from public.obra_canonica p
              where p.id = new.obra_padre_id
                and coalesce(p.cliente_id::text, '') <> coalesce(new.cliente_id::text, '')) then
    raise exception 'la obra mayor % es de otro cliente que el adicional %', new.obra_padre_id, new.id;
  end if;

  return new;
end
$fn$;

drop trigger if exists obra_canonica_padre_coherente on public.obra_canonica;
create trigger obra_canonica_padre_coherente
  before insert or update of obra_padre_id, cliente_id on public.obra_canonica
  for each row execute function public.obra_padre_coherente();

-- ═══ UNA COLUMNA NUEVA NACE SIN PERMISO ═══
--
-- Los GRANT de esta tabla son POR COLUMNA (23 para `authenticated`): una columna agregada no hereda
-- nada y `obra_panel` —que es `security_invoker=true`— devolvería «permission denied for table
-- obra_canonica» a la ficha del cliente. Medido ya una vez con `fusionada_en`.
--
-- SELECT sí; UPDATE no. Quién es adicional de quién es una decisión con evidencia documental, no un
-- campo de formulario: hoy se escribe en una migración y nada en la web puede cambiarla. Cuando haya
-- un verbo para eso, el GRANT se agrega con el verbo, no antes.
grant select (obra_padre_id) on public.obra_canonica to authenticated, service_role;
grant update (obra_padre_id), insert (obra_padre_id) on public.obra_canonica to service_role;

-- ═══ LAS DOS RELACIONES, CADA UNA CON SU EVIDENCIA ═══

-- BSA - Adicional → ME - BSA.
--   · Las DOS obras apuntan a la MISMA carpeta de Drive: 1Xj0FBTek5Zy5IlpbLupFqamTzh_zlUD1 =
--     «administracion/PRESUPUESTOS - CLIENTES/MESSINA/BSA - DEMOLICION Y PILETA DE CONTENCION»
--     (obra_canonica.drive_carpeta_id de las dos filas, cruzado con drive_index.path).
--   · Esa carpeta tiene una subcarpeta ADICIONAL/ con «ADICIONAL.pdf» (1eGE-yf32BQOO5wdsNLOwPjzj47vdytai,
--     «ADICIONAL - BASES DE HORMIGON», SUB TOTAL $1.287.841,48, 20/11/2024) y al lado
--     «ADICIONAL SUELO CEMENTO.pdf» (1qpLvO6PibwEOfT7vh14xbwpAr3LlXgps, TOTAL $5.019.987,50), cuyo
--     total es la OC 00002-00000496 ($5.019.988,49) ya cargada contra messina-bsa.
--   · El Sheet lo nombra: Cobranzas fila 43 «PLANTA DE BSA - ADICIONAL», OC 00002-00001985, $7.228.782.
--   NO ES UNA FUSIÓN: la fila no tiene OC, ni contrato, ni egresos, ni horas (medido el 11/09/2026).
--   Colgarla de su madre la hace visible sin moverle un peso a nadie.
update public.obra_canonica set obra_padre_id = 'messina-bsa' where id = 'bsa-adicional';

-- ME - ADICIONAL TERCER MURO → ME - PLAYÓN DE AZUFRE.
--   · El dueño, textual (10/09/2026): «OC 2256: es adicional de azufre».
--   · El Sheet lo escribe entero: Cobranzas fila 94 «Adicional tercer muro (armado 20 m) Playon de
--     Azufre», OC 00002-00002256 · cta. cte. 30 días, $12.100.000.
--   · La cotización vive DENTRO de la carpeta de la madre: «ADICIONAL MURO.pdf»
--     (1muaFF3Po-POSiVmofxOqVNxGKvl6pLJ0) en «…/MESSINA/PLATEA DE HORMIGON - Playon de azufre/
--     Cotizaciones/», y su TÍTULO es el de la madre: «PLATEA DE HORMIGON CON MURO DE CONTENCION -
--     ACOPIO DE AZUFRE» (MURO DE CONTENCION en L · 20 ML · SUB TOTAL $10.940.587,00).
update public.obra_canonica set obra_padre_id = 'messina-playon-azufre'
 where id = 'messina-adicional-tercer-muro';

-- ═══ LO QUE NO SE ESCRIBE, Y POR QUÉ (el documento lo detalla) ═══
--
-- · ME - BASES TANQUE SO2, ME - BSA y ME - PISOS 120 M² Y RAMPA tienen adicionales que entraron como
--   UNA OC MÁS DE LA MISMA OBRA (1923, 0495/0496/1985, 2226). Partirlos en obras nuevas sería
--   inventar obras que nadie abrió.
-- · Cuatro adicionales están COTIZADOS y no son obra (JAVIER SANCHEZ/ADICIONALES.pdf $18.145.458,30;
--   «Adicional - Excavaciones y ampliaciond de platea.pdf» $5.025.105,97 del 11/09/2026; las dos
--   cotizaciones de revoques). Sin obra no hay fila que colgar: quedan listados para el dueño.
-- · `sf-mamposteria` parece el mismo alcance que `san-francisco`, pero eso sería una FUSIÓN —mueve
--   plata— y la decide el dueño.

-- ═══ LAS VISTAS PUBLICAN LA COLUMNA ═══
--
-- Van ANTES de las RPC a propósito: `rpc-de-pantalla-lee-lo-canonico.test.ts` recorta el cuerpo de
-- cada función desde su `create` hasta el primer `$$;`, así que cualquier vista escrita DESPUÉS de
-- una función entraría en el cuerpo auditado de esa función y el control leería relaciones que la
-- RPC no lee.
--
-- Mismo cuerpo que ya tenían; el único agregado es la columna al final del select.

create or replace view public.obra_panel as
SELECT oc.id AS obra_id,
    oc.nombre,
    oc.cliente_id,
    cl.slug AS cliente_slug,
    COALESCE(cl.nombre_comercial, oc.cliente_texto) AS cliente_nombre,
    oc.cliente_texto,
    oc.estado,
    oc.tipo,
    oc.etapa,
    oc.jefe_obra,
    oc.orden,
    contratado_de_obra(oc.id) AS monto_contratado,
    f.inicio_plan AS fecha_inicio_plan,
    f.fin_plan AS fecha_fin_plan,
    f.inicio_real AS fecha_inicio_real,
    f.fin_real AS fecha_fin_real,
    oc.drive_carpeta_id,
    ocr.costo_real,
    ocr.n_comprobantes,
    ocr.costo_mano_de_obra,
    av.avance_pct,
    av.n_medidas::integer AS n_actividades_medidas,
    av.n_actividades::integer AS n_actividades,
    av.n_sin_planificar::integer AS n_actividades_sin_planificar,
    av.sincronizado_en AS avance_sincronizado_en,
    ( SELECT count(*)::integer AS count
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text) AS restricciones_abiertas,
    ( SELECT count(*)::integer AS count
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text AND r.fecha_compromiso IS NOT NULL AND r.fecha_compromiso < CURRENT_DATE) AS restricciones_vencidas,
    f.inicio_plan_declarado AS fecha_inicio_plan_declarado,
    f.fin_plan_declarado AS fecha_fin_plan_declarado,
    f.inicio_real_declarado AS fecha_inicio_real_declarado,
    f.fin_real_declarado AS fecha_fin_real_declarado,
    f.origen_fechas_plan,
    f.origen_inicio_real,
    f.forecast_fin,
    f.n_sin_fecha AS n_actividades_sin_fecha,
    oc.created_at AS creada_en,
    -- LA OBRA MAYOR DE LA QUE ESTE TRABAJO ES ADICIONAL. Va AL FINAL del select para no correr de
    -- posición ninguna columna existente. `obra_panel` es `security_invoker=true`: lo que la hace
    -- legible es el GRANT por columna de arriba, no esta línea.
    oc.obra_padre_id
   FROM obra_canonica oc
     LEFT JOIN clientes cl ON cl.id = oc.cliente_id
     LEFT JOIN obra_costo_real ocr ON ocr.obra_id = oc.id
     LEFT JOIN obra_avance av ON av.obra_id = oc.id
     LEFT JOIN obra_fechas f ON f.obra_id = oc.id
  where oc.fusionada_en is null;

-- `obra_economia_cartera` es la canónica del PRECIO de una obra y es `security_invoker=false`: el
-- `left join` a `obra_canonica` corre como dueña de la vista, así que trae el padre de TODAS las
-- obras con precio. No agrega ni recorta una sola fila —es un left join por la PK— y la columna no
-- es económica: quién es adicional de quién no es un monto.
create or replace view public.obra_economia_cartera as
 WITH valuado AS (
         SELECT c_1.obra_id,
            c_1.mano_obra,
            c_1.mano_obra_moneda,
            c_1.materiales,
            c_1.materiales_moneda,
            c_1.fuente_tipo,
            c_1.fuente_drive_id,
            c_1.fuente_nombre,
            c_1.cita,
            c_1.nota,
            c_1.cargado_en,
            c_1.cargado_por,
                CASE
                    WHEN c_1.mano_obra_moneda = 'USD'::text THEN contratado_valuado(NULL::numeric, c_1.mano_obra)
                    ELSE c_1.mano_obra
                END AS mo_pesos,
                CASE
                    WHEN c_1.materiales_moneda = 'USD'::text THEN contratado_valuado(NULL::numeric, c_1.materiales)
                    ELSE c_1.materiales
                END AS mat_pesos
           FROM obra_contrato c_1
        )
 SELECT e.obra_canonica_id,
    e.obra_clave,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN contratado_valuado(e.contratado, e.contratado_usd)
            ELSE NULL::numeric
        END AS contratado,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN e.contratado_usd
            ELSE NULL::numeric
        END AS contratado_usd,
    e.costo_mo,
    e.costo_materiales,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN e.contratado_usd IS NOT NULL AND tc_vigente() IS NOT NULL AND e.costo_mo IS NOT NULL AND e.costo_materiales IS NOT NULL THEN contratado_valuado(e.contratado, e.contratado_usd) - e.costo_mo - e.costo_materiales
                ELSE e.margen
            END
            ELSE NULL::numeric
        END AS margen,
    e.plazo_desde,
    e.plazo_hasta,
    e.origen,
    e.leido_en,
    e.referencia,
    e.nota,
    e.oc_civa_ventana,
    e.oc_civa_historico,
    e.oc_n_ventana,
    e.oc_n_historico,
    tc_vigente() AS tipo_cambio,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN c.mo_pesos
            ELSE NULL::numeric
        END AS contrato_mano_obra,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN c.mano_obra_moneda = 'USD'::text THEN c.mano_obra
                ELSE NULL::numeric
            END
            ELSE NULL::numeric
        END AS contrato_mano_obra_usd,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN c.mat_pesos
            ELSE NULL::numeric
        END AS contrato_materiales,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN c.materiales_moneda = 'USD'::text THEN c.materiales
                ELSE NULL::numeric
            END
            ELSE NULL::numeric
        END AS contrato_materiales_usd,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN c.obra_id IS NULL THEN NULL::numeric
                WHEN c.mano_obra IS NOT NULL AND c.mo_pesos IS NULL THEN NULL::numeric
                WHEN c.materiales IS NOT NULL AND c.mat_pesos IS NULL THEN NULL::numeric
                WHEN (COALESCE(c.mo_pesos, 0::numeric) + COALESCE(c.mat_pesos, 0::numeric)) <= 0::numeric THEN NULL::numeric
                ELSE COALESCE(c.mo_pesos, 0::numeric) + COALESCE(c.mat_pesos, 0::numeric)
            END
            ELSE NULL::numeric
        END AS contrato_total,
    c.fuente_tipo AS contrato_fuente,
    c.fuente_drive_id AS contrato_fuente_drive_id,
    c.fuente_nombre AS contrato_fuente_nombre,
    c.cita AS contrato_cita,
    c.nota AS contrato_nota,
    pa.obra_padre_id
   FROM obra_economia_sheet e
     LEFT JOIN valuado c ON c.obra_id = e.obra_canonica_id
     LEFT JOIN obra_canonica pa ON pa.id = e.obra_canonica_id;

-- ══ pantalla_clientes ══
CREATE OR REPLACE FUNCTION public.pantalla_clientes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  -- LAS OBRAS, UNA SOLA VEZ (11/09/2026). `obras_activas` y `obras_todas` recorrían
  -- `public.obra_panel` —384 nodos de plan, la vista más cara del viaje— DOS veces en la misma
  -- llamada. Un CTE referenciado dos veces Postgres lo materializa, así que la vista se recorre una
  -- sola vez y las dos claves salen del mismo material. `materialized` va EXPLÍCITO: si mañana una
  -- de las dos claves se fuera, el CTE quedaría con una sola referencia y Postgres lo volvería a
  -- inlinear — o sea, la doble pasada volvería sola sin que nadie la escribiera.
  with obras as materialized (
    select o.obra_id, o.nombre, o.cliente_id, o.estado, o.avance_pct, o.jefe_obra, o.orden,
           o.obra_padre_id
      from public.obra_panel o
  )
  select jsonb_build_object(

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    'clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'cliente_id', c.cliente_id, 'slug', c.slug,
                 'nombre_comercial', c.nombre_comercial, 'razon_social', c.razon_social,
                 'cuit', c.cuit, 'direccion', c.direccion, 'telefono', c.telefono,
                 'email', c.email, 'responsable_id', c.responsable_id,
                 'responsable_nombre', c.responsable_nombre, 'drive_carpeta_id', c.drive_carpeta_id,
                 'activo', c.activo, 'notas', c.notas, 'n_obras', c.n_obras,
                 'n_obras_activas', c.n_obras_activas,
                 'restricciones_abiertas', c.restricciones_abiertas,
                 'avance_sincronizado_en', c.avance_sincronizado_en,
                 'n_contactos', c.n_contactos, 'n_documentos', c.n_documentos)
               order by c.n_obras_activas desc, c.nombre_comercial asc), '[]'::jsonb)
        from public.cliente_panel c
    ),

    'obras_activas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'avance_pct', o.avance_pct,
                                  'jefe_obra', o.jefe_obra,
                                  'obra_padre_id', o.obra_padre_id)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from obras o
       where o.estado = 'activa'
    ),

    'obras_todas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'estado', o.estado,
                                  'avance_pct', o.avance_pct,
                                  'obra_padre_id', o.obra_padre_id)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from obras o
    ),

    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
    ),

    'certificados', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', t.obra_canonica_id, 'numero', t.numero,
                                  'fecha_certificacion', t.fecha_certificacion,
                                  'fecha_facturacion', t.fecha_facturacion,
                                  'fecha_cobranza', t.fecha_cobranza)
               order by t.fecha_certificacion asc), '[]'::jsonb)
        from public.certificados t
    ),

    'papeles', (
      select coalesce(jsonb_agg(
               jsonb_build_object('id', r.id, 'cliente_id', r.cliente_id, 'obra_id', r.obra_id,
                                  'tipo', r.tipo, 'numero', r.numero, 'fecha', r.fecha,
                                  'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
                                  'nombre_archivo', r.nombre_archivo,
                                  'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.eliminado_en is null
    ),

    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'obra_padre_id', e.obra_padre_id,
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  -- el desglose del contrato (11/09/2026)
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

    'contratos', (
      select coalesce(jsonb_agg(distinct d.cliente_id), '[]'::jsonb)
        from public.cliente_documento d
       where d.rol = 'contrato'
    ),

    'economia_clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object('cliente_id', x.cliente_id, 'contratado', x.contratado,
                                  'contratado_en_curso', x.contratado_en_curso,
                                  'n_obras_en_curso', x.n_obras_en_curso,
                                  'n_obras_cerradas', x.n_obras_cerradas,
                                  'n_obras_con_precio', x.n_obras_con_precio,
                                  'n_obras_sin_precio', x.n_obras_sin_precio,
                                  'costo_real', x.costo_real, 'facturado_90d', x.facturado_90d,
                                  'cobrado_90d', x.cobrado_90d, 'cobrado_total', x.cobrado_total,
                                  'cobrado_neto_total', x.cobrado_neto_total, 'saldo', x.saldo,
                                  'vencido', x.vencido, 'por_vencer', x.por_vencer,
                                  'pendiente_contractual', x.pendiente_contractual)), '[]'::jsonb)
        from public.cliente_economia x
    )
  )
$$;

-- ══ pantalla_cliente ══
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
      select count(*) from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
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
    'notas', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en)
               order by n.creado_en desc), '[]'::jsonb)
        from public.cliente_nota n
       where n.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    'autores', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)), '[]'::jsonb)
        from public.perfiles p
       where p.id in (
               select n.autor_id from public.cliente_nota n
                where n.cliente_id = (select cliente_id from elegido) and n.autor_id is not null)
    ) else '[]'::jsonb end,

    -- LAS FECHAS DEL CLIENTE PARA LA ACTIVIDAD salen de `clientes`, no de `cliente_panel`: la vista
    -- no las publica, y agregarlas ahí sería una migración para una solapa que no la necesita.
    'actividad_cliente', case when p_solapa is null or p_solapa = 'actividad' then (
      select jsonb_build_object('nombre_comercial', c.nombre_comercial,
                                'created_at', c.created_at, 'updated_at', c.updated_at)
        from public.clientes c where c.id = (select cliente_id from elegido)
    ) else null::jsonb end,

    -- LOS CERTIFICADOS DE SUS OBRAS — la otra lectura que esperaba a la ola anterior.
    'certificados', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
               'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
               'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
               'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
        from public.certificados t
       where t.obra_canonica_id in (select o.obra_id from sus_obras o)
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

comment on function public.obra_padre_coherente() is
  'Lo que un CHECK no puede mirar: que el padre exista vivo, no tenga padre, no tenga al hijo como '
  'padre, no esté fusionado y sea del MISMO cliente. Con eso «no hay ciclos» es un hecho de la base.';

notify pgrst, 'reload schema';
