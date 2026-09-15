-- EL COSTO POR OBRA SE IMPUTA POR `obra_id`, NUNCA POR TEXTO.
--
-- ═══ EL DEFECTO (medido 15/09/2026) ═══
--
-- `obra_costo_real` seguía resolviendo la obra de cada compra por la columna J contra `obra_alias`
-- (`norm_obra(c.obra_texto) = a.alias`). La J dice el CLIENTE: las 335 compras de «La Estrella» caían
-- enteras en OB-0003 «LE - OBRA GENERAL» ($156,3 M) y el comedor (OB-0006), el galpón 9 (OB-0007), el
-- galpón 7 (OB-0068) y la mampostería (OB-0071) dibujaban $0, cuando por `costos_obra.obra_id` —la
-- columna Obra de la fila, que nació hoy con `20260915T0700`— son $45,3 M / $31,8 M / $18,3 M / $13,6 M.
-- `obra_economia` y `obra_panel` cuelgan de esa vista: la ficha de la obra y el panel del jefe
-- mentían con el mismo número. El dueño: «imputar bien las compras a cada obra, al centavo».
--
-- ═══ QUÉ CAMBIA ═══
--
--   1. `obra_costo_real`: el puente es `costos_obra.obra_id = obra_canonica.id`. Una fila sin
--      `obra_id` (estructura, «Sin obra – cliente», sin imputar) no se atribuye a NINGUNA obra.
--      Mismas columnas y tipos, así `obra_economia` y `obra_panel` siguen válidas.
--   2. `compra_obra_asignar`: la RPC de la app actualiza en la MISMA transacción `costos_obra`
--      (destino, obra_id) y `compra_obra_asignada` (obra_id, via, cliente, porque). Hasta hoy sólo
--      escribía `compra_sheet`: el costo por obra recién cambiaba cuando el worker escribía el Sheet y
--      corría el sync. Firma, grants, `es_administracion()`, validación y cola: iguales.
--   3. `proveedor_compra` publica además `destino, obra_id, obra_celda, obra_inconsistencia` (y
--      `sheet_id`, que es la mitad de la referencia con `compra_obra_asignada`), para que la ficha del
--      proveedor rotule y edite la obra con el MISMO control que Compras.
--
-- `costo_de_obras_a_la_fecha` NO se toca acá: su filtro de estructura (que comparaba contra 'ES-ADM',
-- 'ES-TAL', 'IMP', 'FIN', valores que el CHECK de destino no guarda) lo corrige `20260915T2320` al
-- reescribirla sobre `costo_de_obra_filas`.
--
-- ═══ RLS Y GRANTS ═══
-- Ninguna policy se toca. Las vistas repiten `security_invoker = true` (un `create or replace` sin
-- la opción la BORRA). La función auxiliar nueva sólo la llama la RPC: se revoca de todos.

set local lock_timeout = '5s';

-- ─── 1 · obra_costo_real: por obra_id ─────────────────────────────────────────────────────────────
create or replace view public.obra_costo_real
with (security_invoker = true) as
select oc.id      as obra_id,
       oc.nombre  as obra_nombre,
       oc.estado,
       oc.tipo,
       count(c.id)::integer                                                   as n_comprobantes,
       coalesce(sum(c.total), 0)::numeric                                     as costo_real,
       coalesce(sum(c.total) filter (where c.area = 'personas'), 0)::numeric  as costo_mano_de_obra
  from public.obra_canonica oc
  -- EL PUENTE ES `obra_id`, NUNCA `obra_texto`: el texto dice el cliente, no la obra.
  left join public.costos_obra c
    on c.obra_id = oc.id
   -- UNA FILA ANULADA O ELIMINADA EN EL SHEET NO ES COSTO. El sync ya no la copia a `costos_obra`;
   -- esto cubre el intervalo entre una anulación y el próximo sync. Mismo cruce que
   -- `costo_de_obras_a_la_fecha`: `referencia_externa = coalesce(sheet_id, fila)`.
   and not exists (
         select 1 from public.compra_sheet s
          where c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
            and (s.anulada or upper(btrim(coalesce(s.estado, ''))) = 'ELIMINADO'))
 group by oc.id, oc.nombre, oc.estado, oc.tipo;

comment on view public.obra_costo_real is
  'Costo real por obra canónica. REGLA (15/09/2026): cada compra pesa en la obra de su `costos_obra.obra_id` '
  '(la columna Obra de la fila); una fila sin obra_id no se atribuye a ninguna obra. Nunca por obra_texto ni '
  'obra_alias. Excluye compras anuladas/eliminadas en el Sheet. costo_mano_de_obra = área personas.';
-- FIN DE LA VISTA obra_costo_real

-- ─── 2 · la app cambia la obra y el costo por obra cambia en el acto ─────────────────────────────
-- «cliente» en `compra_obra_asignada` es el cliente CANÓNICO de `cliente_alias`, igual que en el sync
-- (`normAlias(rotulo_clave)` ↔ `norm_obra`, la misma receta: minúsculas, sin acentos, sin artículos).
create or replace function public.cliente_canonico_de(p_texto text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ca.cliente_canonico
    from public.cliente_alias ca
   where nullif(public.norm_obra(p_texto), '') is not null
     and public.norm_obra(ca.rotulo_clave) = public.norm_obra(p_texto)
   limit 1
$$;
revoke all on function public.cliente_canonico_de(text) from public, anon, authenticated;

-- Lo que la RPC hace ADEMÁS de `compra_sheet`: el espejo de costos y la asignación, con la misma
-- semántica de `via` que `orquestador/lib/compras-obra-asignada.mjs · asignadorConColumnaObra`:
--   · código de obra    → `obra_de_la_fila`, con el cliente de la obra.
--   · ES-ADM / ES-TAL   → `estructura_de_la_fila`: sin obra y sin cliente.
--   · «Sin obra – X»    → `sin_obra` de ese cliente.
--   · celda VACIADA     → la fila vuelve a la inferencia por J/K, que sólo el sync sabe hacer: hasta
--                         que corra, NO se atribuye a ninguna obra (nunca se inventa una).
create or replace function public.compra_costo_por_obra_actualizar(
  p_referencia text, p_valor text, p_destino text, p_obra_id text, p_obra_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente text;
  v_porque  text := format('columna Obra «%s»', p_valor);
begin
  update public.costos_obra
     set destino = p_destino, obra_id = p_obra_id
   where referencia_externa = p_referencia;

  if p_valor is null then
    v_cliente := public.cliente_canonico_de(p_obra_texto);
    update public.compra_obra_asignada
       set obra_id = null, cliente = v_cliente,
           via = case when v_cliente is null then 'no_es_cliente' else 'sin_obra' end,
           porque = 'columna Obra vaciada desde la app: hasta el próximo sync no se atribuye a ninguna obra',
           sincronizado_en = now()
     where referencia = p_referencia;
  elsif p_destino <> 'obra' then
    update public.compra_obra_asignada
       set obra_id = null, cliente = null, via = 'estructura_de_la_fila', porque = v_porque, sincronizado_en = now()
     where referencia = p_referencia;
  elsif p_obra_id is not null then
    select coalesce(public.cliente_canonico_de(o.cliente_texto), nullif(btrim(o.cliente_texto), ''), o.nombre)
      into v_cliente
      from public.obra_canonica o where o.id = p_obra_id;
    update public.compra_obra_asignada a
       set obra_id = p_obra_id, cliente = coalesce(v_cliente, a.cliente, '(sin cliente)'),
           via = 'obra_de_la_fila', porque = v_porque, sincronizado_en = now()
     where a.referencia = p_referencia;
  else
    v_cliente := btrim(substring(p_valor from char_length('Sin obra – ') + 1));
    update public.compra_obra_asignada
       set obra_id = null, cliente = coalesce(public.cliente_canonico_de(v_cliente), v_cliente),
           via = 'sin_obra', porque = v_porque, sincronizado_en = now()
     where referencia = p_referencia;
  end if;
end;
$$;
revoke all on function public.compra_costo_por_obra_actualizar(text, text, text, text, text) from public, anon, authenticated;

-- La RPC VIGENTE (T0700, retocada por T2200 vía obra_celda_resolver) más la llamada de arriba. Firma,
-- grants, portero, bloqueo, control de `esperado`, validación y cola: tal cual estaban.
create or replace function public.compra_obra_asignar(p_fila integer, p_valor text, p_esperado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila    record;
  v_valor   text := nullif(btrim(coalesce(p_valor, '')), '');
  v_res     jsonb;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para imputar compras');
  end if;
  -- FOR UPDATE: sin el bloqueo, dos pantallas que vieron la misma celda pasan las dos el control de
  -- `esperado` y la segunda pisa a la primera sin que nadie lo vea.
  select fila, clave, sheet_id, obra_celda, obra_texto into v_fila
    from public.compra_sheet where fila = p_fila for update;
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

  update public.compra_sheet
     set destino = v_res ->> 'destino', obra_id = v_res ->> 'obra_id', obra_celda = v_valor, obra_inconsistencia = null
   where fila = p_fila;
  -- EL COSTO POR OBRA CAMBIA EN LA MISMA TRANSACCIÓN: `costos_obra` y `compra_obra_asignada` se unen a
  -- la fila por `referencia_externa = coalesce(sheet_id, fila)`, la misma cuenta que el sync.
  perform public.compra_costo_por_obra_actualizar(
    coalesce(v_fila.sheet_id::text, v_fila.fila::text), v_valor,
    v_res ->> 'destino', v_res ->> 'obra_id', v_fila.obra_texto);
  insert into public.compra_obra_cambio (fila, clave, sheet_id, valor_anterior, valor_nuevo, origen, pedido_por)
  values (p_fila, v_fila.clave, v_fila.sheet_id, v_fila.obra_celda, v_valor, 'app', (select auth.uid()));
  return jsonb_build_object('ok', true, 'destino', v_res ->> 'destino', 'obra_id', v_res ->> 'obra_id');
end;
$$;

revoke all on function public.compra_obra_asignar(integer, text, text) from public, anon;
grant execute on function public.compra_obra_asignar(integer, text, text) to authenticated;

comment on function public.compra_obra_asignar(integer, text, text) is
  'La app imputa la obra de una fila de Compras: guarda en compra_sheet, actualiza costos_obra y '
  'compra_obra_asignada (el costo por obra cambia en el acto) y encola la escritura de la columna Obra '
  'del Sheet (compra_obra_cambio). `p_esperado` = lo que la pantalla mostraba; si cambió, no se pisa.';
-- FIN DE compra_obra_asignar

-- ─── 3 · proveedor_compra: la columna Obra de cada compra del proveedor ─────────────────────────
-- Las columnas existentes en el mismo orden; las nuevas al final (`create or replace view` no
-- reordena ni quita). `sheet_id` viaja porque `referencia = coalesce(sheet_id, fila)` es lo que une
-- la fila con `compra_obra_asignada` — sin él la ficha no podría reusar `obrasDeLasCompras`.
create or replace view public.proveedor_compra
with (security_invoker = true) as
select
  coalesce(pc.id, r.proveedor_id) as proveedor_id,
  case when pc.id is not null then 'cuit' else 'nombre' end as via,
  cs.fila,
  cs.clave,
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
  cs.destino,
  cs.obra_id,
  cs.obra_celda,
  cs.obra_inconsistencia,
  cs.sheet_id
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
  and (select public.es_administracion());

comment on view public.proveedor_compra is
  'Cada compra de la pestaña Compras con el proveedor del maestro al que pertenece (por CUIT, o por nombre '
  'resuelto: via) y su columna Obra (destino, obra_id, obra_celda, obra_inconsistencia, sheet_id) para que '
  'la ficha rotule y edite la obra igual que Compras. No une el papel: eso lo hace papelesDeCadaFila.';
-- FIN DE LA VISTA proveedor_compra
