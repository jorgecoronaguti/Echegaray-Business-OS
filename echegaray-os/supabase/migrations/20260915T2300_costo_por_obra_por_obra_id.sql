-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL COSTO POR OBRA SALE DEL `obra_id` DE LA FILA, NUNCA DEL TEXTO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño, 15/09/2026: «compras imputadas al centavo a cada obra en app.ecsas.com.ar y también en
-- Proveedores».
--
-- ═══ EL DEFECTO, MEDIDO SOBRE LA BASE VIVA (15/09/2026) ═══
--
-- `obra_costo_real` unía `costos_obra` con la obra POR TEXTO: `norm_obra(c.obra_texto) = a.alias`.
-- La columna J del Sheet dice el CLIENTE («LA ESTRELLA»), no la obra, así que el alias del cliente
-- barría con todo lo suyo y lo apilaba en la obra madre:
--
--   OB-0003 «LE - OBRA GENERAL»                $ 156.396.267   ← 336 comprobantes que no son de ella
--   OB-0006 «LE - OFICINA Y FÁBRICA…»          $ 0             ← por `obra_id` son $ 45.358.573
--   OB-0007 «LE - GALPÓN 9»                    $ 0             ←                  $ 31.845.767
--   OB-0068 «LE - GALPÓN 7»                    $ 0             ←                  $ 18.289.159
--   OB-0071 «LE - MAMPOSTERÍA»                 $ 0             ←                  $ 13.616.888
--
-- Desde el 14/09 cada fila de Compras trae su propia columna «Obra» (`compra_sheet.obra_id`, que
-- `sync-compras.mjs` copia a `costos_obra.obra_id`): la obra viaja PEGADA A LA FILA y es lo único
-- que identifica una obra sin adivinar. El texto queda para leerlo, no para imputar.
--
-- ═══ QUÉ CAMBIA Y QUÉ NO ═══
--
--   1 · `obra_costo_real` imputa por `costos_obra.obra_id`. Mismas columnas, mismo orden.
--   2 · `compra_obra_asignar` escribe, en la MISMA transacción, las tres caras de la imputación.
--   3 · `proveedor_compra` publica la columna Obra de la fila (la ficha del proveedor la necesita).
--
-- Nada de esto toca RLS ni grants: las tres son `security_invoker` y la función mantiene su firma,
-- su `es_administracion()`, su control optimista y su cola.

-- ── 1 · EL COSTO REAL POR OBRA ─────────────────────────────────────────────────────────────────
--
-- `create or replace`: las SIETE columnas de siempre, en el mismo orden y con el mismo tipo, porque
-- `obra_economia` y `obra_panel` cuelgan de ésta y un `drop` se las llevaría en cascada. 
--
-- `with (security_invoker = true)` SE REPITE, y no es decorativo: medido en el ensayo del 15/09, un
-- `create or replace view` SIN la cláusula deja `pg_class.reloptions` en NULL — la vista pasa a
-- correr con los permisos de su dueño y le muestra a cualquiera lo que la RLS de `costos_obra` le
-- niega. Es la misma puerta que el 19/08 le abrió `cliente_panel` a un jefe de obra, por otro
-- camino. Se verifica leyendo `reloptions` después de aplicar.
--
-- `obra_id is null` NO SE ATRIBUYE. Una compra del cliente que nadie imputó a una sub-obra no es
-- costo de la obra madre: es plata sin obra, y repartirla o colgarla de la primera obra es
-- exactamente el defecto que esta migración saca. Se ve en Compras como «sin imputar».
--
-- LAS ANULADAS NO SON COSTO. `sync-compras.mjs` ya no las proyecta (`esCostoDeObra`), así que hoy el
-- filtro no descuenta ni un peso — es una guarda, no una corrección: si mañana la proyección cambia,
-- una compra anulada no puede volver a pesarle a una obra. La fila de Compras se encuentra por
-- `referencia_externa`, que es `coalesce(sheet_id::text, fila::text)` — la MISMA cuenta que hacen
-- `referenciaDeCompra` (JS y TS) y `compra_obra_asignada.referencia`.
create or replace view public.obra_costo_real
with (security_invoker = true) as
select oc.id            as obra_id,
       oc.nombre        as obra_nombre,
       oc.estado,
       oc.tipo,
       count(c.*)::int  as n_comprobantes,
       coalesce(sum(c.total), 0)::numeric as costo_real,
       -- SIN FILAS DE MANO DE OBRA, 0 — y el 0 acá es el dato que importa: dice que el costo real de
       -- esta obra no tiene una hora adentro, que es lo que vuelve indefendible cualquier margen.
       coalesce(sum(c.total) filter (where c.area = 'personas'), 0)::numeric as costo_mano_de_obra
  from public.obra_canonica oc
  left join public.costos_obra c
         on c.obra_id = oc.id
        and not exists (
              select 1
                from public.compra_sheet cs
               where coalesce(cs.sheet_id::text, cs.fila::text) = c.referencia_externa
                 and cs.anulada
            )
 group by oc.id, oc.nombre, oc.estado, oc.tipo;

comment on view public.obra_costo_real is
  'FUENTE ÚNICA del costo real por obra canónica. La imputación sale de costos_obra.obra_id —la '
  'columna «Obra» de la fila de Compras—, NUNCA del texto de la columna J: ese texto dice el cliente '
  'y apilaba las sub-obras en la obra madre (OB-0003 con $156 M y OB-0006/7/68/71 en $0, 15/09/2026). '
  'obra_id null no se atribuye a ninguna obra, y una compra anulada no es costo. No recalcular este '
  'concepto en ninguna cara: ver orquestador/scripts/canario-fuente-unica.mjs.';

-- ── 2 · ELEGIR LA OBRA DESDE LA APP ESCRIBE LAS TRES CARAS, O NINGUNA ──────────────────────────
--
-- Hasta hoy la RPC guardaba sólo `compra_sheet`. El costo por obra (`costos_obra`) y la asignación
-- (`compra_obra_asignada`) se enteraban recién cuando el worker escribía el Sheet y `sync-compras`
-- lo volvía a leer: minutos —a veces horas— en los que la pantalla de Compras decía una obra y la
-- ficha de la obra seguía diciendo otra. Dos verdades del mismo hecho.
--
-- Se escriben en la MISMA transacción que `compra_sheet` porque salen del MISMO hecho. El sync
-- sigue siendo el dueño de las tres tablas y las reescribe enteras; esto sólo adelanta el efecto.
--
-- LO QUE NO PUEDE HACER, y por eso queda declarado: cuando la celda se VACÍA, la obra vuelve a ser
-- la que infiere el sync de las columnas J y K, y esa inferencia vive en JS (`obra-destino.mjs`),
-- no en SQL. Acá no se adivina: `obra_id` queda en null —la plata deja de pesarle a una obra que ya
-- nadie eligió— y `porque` dice que la inferencia vuelve en el próximo sync.
--
-- Si la fila no es costo de obra (`esCostoDeObra`: anulada, ELIMINADO, total ≤ 0, sin texto de
-- obra), no está en `costos_obra` ni en `compra_obra_asignada` y los dos `update` no tocan ninguna
-- fila. Es correcto: elegirle una obra a una fila que no mueve plata no la convierte en costo.
create or replace function public.compra_obra_asignar(p_fila integer, p_valor text, p_esperado text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fila    record;
  v_valor   text := nullif(btrim(coalesce(p_valor, '')), '');
  v_res     jsonb;
  v_ref     text;
  v_destino text;
  v_obra    text;
  v_via     text;
  v_porque  text;
  v_cliente text;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para imputar compras');
  end if;
  -- FOR UPDATE: sin el bloqueo, dos pantallas que vieron la misma celda pasan las dos el control de
  -- `esperado` y la segunda pisa a la primera sin que nadie lo vea.
  select fila, clave, sheet_id, obra_celda, obra_texto into v_fila from public.compra_sheet where fila = p_fila for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'esa fila ya no está en Compras');
  end if;
  -- Otro (o el Sheet) la cambió mientras la pantalla la mostraba: no se pisa a ciegas.
  if coalesce(v_fila.obra_celda, '') is distinct from coalesce(nullif(btrim(p_esperado), ''), '') then
    return jsonb_build_object('ok', false, 'error',
      format('la obra de la fila %s cambió mientras la mirabas: ahora dice «%s»', p_fila, coalesce(v_fila.obra_celda, 'vacía')));
  end if;
  v_res := public.obra_celda_resolver(v_valor);
  if v_res ? 'error' then
    return jsonb_build_object('ok', false, 'error', v_res ->> 'error');
  end if;
  v_destino := v_res ->> 'destino';
  v_obra    := v_res ->> 'obra_id';

  update public.compra_sheet
     set destino = v_destino, obra_id = v_obra, obra_celda = v_valor, obra_inconsistencia = null
   where fila = p_fila;

  -- La misma cuenta que `referenciaDeCompra` en JS y en TS: el id del Sheet cuando la fila lo trae.
  v_ref := coalesce(v_fila.sheet_id::text, v_fila.fila::text);

  -- EL COSTO POR OBRA, que es lo que lee `obra_costo_real`.
  update public.costos_obra
     set destino = v_destino, obra_id = v_obra
   where referencia_externa = v_ref
     and origen = 'compras_sheet';

  -- LA ASIGNACIÓN, con la MISMA semántica de `via` que `orquestador/lib/compras-obra-asignada.mjs`:
  -- la columna de la fila es una DECISIÓN, no la inferencia de la K, y `via` tiene que poder
  -- distinguirlas.
  v_via := case
             when v_valor is null then 'sin_obra'
             when v_destino is distinct from 'obra' then 'estructura_de_la_fila'
             when v_obra is not null then 'obra_de_la_fila'
             else 'sin_obra'
           end;
  v_porque := case
                when v_valor is null
                  then 'la columna Obra se vació desde la app · la inferencia de J y K vuelve en el próximo sync'
                else format('columna Obra «%s»', v_valor)
              end;
  -- EL CLIENTE NO ES DECORACIÓN: `compra_obra_asignada_cliente_coherente` exige que sea null EXACTAMENTE
  -- cuando la vía es estructura, y que NO lo sea en las demás. Dejarlo como estaba hacía fallar la
  -- transacción entera al mandar una fila de una obra a ES-ADM (medido en el ensayo del 15/09).
  -- El orden de preferencia es el MISMO de `asignadorConColumnaObra`: el cliente que nombra la celda
  -- «Sin obra – X», si no el que ya tenía la asignación, si no el texto de la columna J.
  select cliente into v_cliente from public.compra_obra_asignada where referencia = v_ref;
  v_cliente := case
                 when v_valor is not null and v_destino is distinct from 'obra' then null
                 when v_valor like 'Sin obra – %'
                   then btrim(substring(v_valor from char_length('Sin obra – ') + 1))
                 else coalesce(v_cliente, nullif(btrim(v_fila.obra_texto), ''), '(sin cliente)')
               end;
  update public.compra_obra_asignada
     set obra_id = v_obra, via = v_via, porque = v_porque, cliente = v_cliente
   where referencia = v_ref;

  insert into public.compra_obra_cambio (fila, clave, sheet_id, valor_anterior, valor_nuevo, origen, pedido_por)
  values (p_fila, v_fila.clave, v_fila.sheet_id, v_fila.obra_celda, v_valor, 'app', (select auth.uid()));
  return jsonb_build_object('ok', true, 'destino', v_destino, 'obra_id', v_obra);
end;
$function$;

comment on function public.compra_obra_asignar(integer, text, text) is
  'ÚNICA puerta para elegir la obra de una fila de Compras desde la app. Valida rol y control '
  'optimista, escribe compra_sheet + costos_obra + compra_obra_asignada en la misma transacción y '
  'encola la escritura de la celda del Sheet. Vaciar la celda deja obra_id en null: la inferencia de '
  'J y K vive en orquestador/lib/obra-destino.mjs y vuelve en el próximo sync-compras.';

-- ── 3 · LA COLUMNA OBRA VIAJA A LA FICHA DEL PROVEEDOR ─────────────────────────────────────────
--
-- La ficha del proveedor mostraba la obra que INFIRIÓ el sync (`compra_obra_asignada`) mientras
-- Compras mostraba la que alguien ELIGIÓ: 40 de las 226 filas de Corralón Progreso decían obras
-- distintas en dos pantallas del mismo sistema. Con estas cuatro columnas la ficha lee la misma
-- celda que Compras y, además, puede ofrecer el MISMO desplegable.
--
-- Las catorce columnas de antes quedan en su orden exacto y las nuevas van al final: `create or
-- replace` no acepta otra cosa, y la pantalla lee por nombre.
create or replace view public.proveedor_compra
with (security_invoker = true) as
select
  coalesce(pc.id, r.proveedor_id) as proveedor_id,
  case when pc.id is not null then 'cuit' else 'nombre' end as via,
  cs.fila,
  cs.clave,
  -- NULL es «esta compra no tiene fecha», no «hoy».
  cs.fecha,
  cs.tipo,
  cs.comprobante,
  cs.concepto,
  cs.obra_texto,
  cs.total,
  cs.estado,
  cs.estado_pago,
  cs.saldo_pendiente,
  cs.anulada,
  -- La columna «Obra» de la fila, tal cual la guarda `compra_sheet` (migración 20260915T0700).
  cs.destino,
  cs.obra_id,
  cs.obra_celda,
  cs.obra_inconsistencia
from public.compra_sheet cs
left join public.proveedores pc
  on cs.cuit is not null
 and pc.cuit = regexp_replace(cs.cuit, '\D', '', 'g')
left join public.proveedor_nombre_resuelto r
  on cs.cuit is null
 and r.nombre_norm = public.normalizar_nombre_proveedor(cs.proveedor)
 and r.estado = 'vinculado'
 and r.proveedor_id is not null
where coalesce(pc.id, r.proveedor_id) is not null
  -- El portero va en `(select …)`: una vez por consulta, no una por fila. La cerradura real sigue
  -- siendo la policy de `compra_sheet`, que `security_invoker` hace valer con el rol de quien mira.
  and (select public.es_administracion());
