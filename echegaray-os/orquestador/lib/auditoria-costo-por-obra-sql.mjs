// LAS CONSULTAS DE LA AUDITORÍA DE COSTO POR OBRA — todas de SÓLO LECTURA, en un solo lugar.
//
// Separadas del script para que el `.pg.test.mjs` corra EXACTAMENTE la misma cuenta que el informe:
// un control validado contra una consulta distinta de la que produce el número no controla nada.
//
// ═══ LA REGLA DEL SUBCONTRATO ═══
//
// Copiada al pie de `20260915T0815_estructura_fuera_del_costo_de_obra.sql`. Es deliberado que sea
// una copia y no un `select` a una vista: el día que la regla del SQL cambie y ésta no, el test da
// rojo y alguien decide. Una auditoría que importa la definición que audita no puede contradecirla.

/** Proveedor con rubro «Subcontratista», por CUIT, por nombre, por razón social o por alias. */
export const ES_SUBCONTRATO = `exists (
  select 1 from public.proveedores p
   where p.rubro = 'Subcontratista' and coalesce(p.es_prueba, false) = false
     and ((public.normalizar_cuit(p.cuit) is not null
           and public.normalizar_cuit(p.cuit) = public.normalizar_cuit(s.cuit))
       or public.normalizar_nombre_proveedor(p.nombre) = public.normalizar_nombre_proveedor(s.proveedor)
       or public.normalizar_nombre_proveedor(p.razon_social) = public.normalizar_nombre_proveedor(s.proveedor)
       or exists (select 1 from public.proveedor_alias pa
                   where pa.proveedor_id = p.id and pa.estado = 'vinculado'
                     and pa.nombre_norm = public.normalizar_nombre_proveedor(s.proveedor))))`

/** El `concepto` tal como lo arma `sync-compras.mjs` para `costos_obra` (lo que come el trigger de área). */
const CONCEPTO = `nullif(concat_ws(' — ', nullif(btrim(coalesce(s.detalle_obra, '')), ''), nullif(btrim(coalesce(s.concepto, '')), '')), '')`

/** Los filtros que la RPC aplica y que NO dependen de `costos_obra`: se recalculan sobre el espejo. */
export const FILTROS_RPC = `
       coalesce(s.anulada, false) = false
   and upper(btrim(coalesce(s.estado, ''))) <> 'ELIMINADO'
   and upper(btrim(coalesce(s.unidad_negocio, ''))) not in ('ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO')
   and coalesce(s.destino, '') not in ('estructura_admin', 'estructura_taller', 'ES-ADM', 'ES-TAL', 'IMP', 'FIN')
   and public.area_de_egreso(s.proveedor, s.obra_texto, s.unidad_negocio, ${CONCEPTO})
       not in ('personas', 'contabilidad_legales', 'administracion_finanzas')`

/**
 * LA «REGLA A LA FECHA» (dueño, 15/09/2026), calculada sobre `compra_sheet` en vez de sobre
 * `costos_obra`. Es la misma regla que `public.costo_de_obra_filas` corre del otro lado: acá arranca
 * en el espejo de la pestaña, allá en la proyección. Dos caminos distintos al mismo peso.
 */
export const A_LA_FECHA = `case
    when s.total < 0 then s.total
    when upper(btrim(coalesce(s.estado, ''))) = 'PAGADO' then s.total
    when coalesce(s.fecha_prevista, s.fecha_caja) > current_date or s.fecha > current_date
      then least(greatest(coalesce(s.monto_pagado, 0), 0), s.total)
    else s.total
  end`

/**
 * EL RECUENTO INDEPENDIENTE, por obra, calculado sobre `compra_sheet` (el espejo de la pestaña) y
 * NO sobre `costos_obra` (la proyección que la app consume). Es la única forma de que el control no
 * se valide contra la información que produce.
 *
 * `$1 = true` reproduce la regla VIVA (`esCostoDeObra`, que exige total > 0 y descarta las notas de
 * crédito); `$1 = false` cuenta lo que el dueño ve en su pestaña. La diferencia entre las dos
 * corridas ES el hallazgo.
 */
export const RECUENTO_POR_OBRA = `
  select a.obra_id,
         coalesce(sum(x.ahora)  filter (where not x.sub), 0)  as materiales,
         coalesce(sum(x.ahora)  filter (where x.sub), 0)      as subcontratos,
         coalesce(sum(x.luego)  filter (where not x.sub), 0)  as materiales_por_vencer,
         coalesce(sum(x.luego)  filter (where x.sub), 0)      as subcontratos_por_vencer,
         count(*) filter (where not x.sub)::int               as n_materiales,
         count(*) filter (where x.sub)::int                   as n_subcontratos
    from public.compra_sheet s
    join public.compra_obra_asignada a on a.referencia = coalesce(s.sheet_id::text, s.fila::text)
    cross join lateral (select ${ES_SUBCONTRATO} as sub,
                               ${A_LA_FECHA} as ahora,
                               s.total - (${A_LA_FECHA}) as luego) x
   where a.obra_id is not null
     and (not $1::boolean or coalesce(s.total, 0) > 0)
     and ${FILTROS_RPC}
   group by a.obra_id`

/** Cada fila de Compras con todo lo que la auditoría necesita mirar, incluida su clasificación. */
export const FILAS = `
  select s.fila, s.sheet_id, s.proveedor, s.cuit, s.comprobante, s.tipo, s.categoria,
         s.obra_texto, s.detalle_obra, s.concepto, s.unidad_negocio, s.destino,
         s.total, s.importe, s.fecha, s.fecha_prevista, s.fecha_caja, s.estado,
         s.pago_total_o_parcial, s.monto_pagado, s.anulada, s.obra_celda, s.obra_id,
         s.obra_inconsistencia,
         a.obra_id as asignada_obra, a.via, a.cliente as cliente_fila, a.porque,
         (c.id is not null) as en_costos_obra, c.area, c.total as costo_total,
         public.area_de_egreso(s.proveedor, s.obra_texto, s.unidad_negocio, ${CONCEPTO}) as area_calculada,
         ${ES_SUBCONTRATO} as es_subcontrato
    from public.compra_sheet s
    left join public.compra_obra_asignada a on a.referencia = coalesce(s.sheet_id::text, s.fila::text)
    left join public.costos_obra c on c.origen = 'compras_sheet'
                                  and c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
   order by s.fila`

/** Las obras que la app publica: todas las canónicas no fusionadas, sin las de prueba. */
export const OBRAS = `
  select o.id, o.codigo, o.nombre, o.estado, o.tipo, o.cliente_texto, o.cliente_id,
         o.fecha_fin_real, o.fecha_fin_plan, o.fusionada_en,
         (select ca.cliente_canonico from public.cliente_alias ca
           join public.cliente_panel cp on cp.slug = ca.rotulo
          where ca.fuente = 'OS' and cp.cliente_id = o.cliente_id limit 1) as cliente_canonico
    from public.obra_canonica o
   where o.fusionada_en is null and o.codigo not like 'ZZ-%'
   order by o.codigo`

/** HH por obra, de la vista que cuenta y de la tabla cruda: la diferencia es lo que el modelo saca. */
export const HH_POR_OBRA = `
  select r.obra_canonica_id as obra_id,
         sum(r.horas) filter (where r.tipo_hora in ('normal','extra_50','extra_100')
                                 or r.fuente_legacy = 'sheet:jornales')            as horas_crudas,
         sum(r.horas) filter (where public.es_jefe_de_obra(r.persona_id))          as horas_de_jefe,
         count(*) filter (where r.persona_id is null)::int                          as filas_sin_persona,
         max(r.fecha)                                                               as ultima,
         (select coalesce(sum(v.horas), 0) from public.hh_que_cuentan_en_obra v
           where v.obra_canonica_id is not distinct from r.obra_canonica_id)        as horas_que_cuentan
    from public.registros_hh r
   group by r.obra_canonica_id`

/** Horas cargadas en una obra DESPUÉS de su cierre: o la obra no estaba cerrada, o la hora no es de ahí. */
export const HH_DESPUES_DEL_CIERRE = `
  select r.obra_canonica_id as obra_id, o.codigo, o.nombre,
         coalesce(o.fecha_fin_real, o.fecha_fin_plan) as fin,
         count(*)::int as filas, sum(r.horas) as horas, min(r.fecha) as desde, max(r.fecha) as hasta
    from public.registros_hh r
    join public.obra_canonica o on o.id = r.obra_canonica_id
   where o.estado = 'cerrada'
     and coalesce(o.fecha_fin_real, o.fecha_fin_plan) is not null
     and r.fecha > coalesce(o.fecha_fin_real, o.fecha_fin_plan)
   group by 1, 2, 3, 4`

/** Registros de HH que apuntan a una obra fusionada: su costo se cuenta dos veces o en ninguna. */
export const HH_EN_OBRA_FUSIONADA = `
  select r.obra_canonica_id as obra_id, o.codigo, o.fusionada_en,
         count(*)::int as filas, sum(r.horas) as horas
    from public.registros_hh r
    join public.obra_canonica o on o.id = r.obra_canonica_id
   where o.fusionada_en is not null
   group by 1, 2, 3`

/** La tabla de subcontratos contra lo que Compras registra de ESE proveedor en ESA obra. */
export const SUBCONTRATOS = `
  select sc.id, sc.obra_id, sc.nombre, sc.proveedor_texto, sc.precio_contratado, sc.estado,
         p.nombre as proveedor_nombre,
         (select coalesce(sum(s.total), 0) from public.compra_sheet s
            join public.compra_obra_asignada a on a.referencia = coalesce(s.sheet_id::text, s.fila::text)
           where a.obra_id = sc.obra_id and coalesce(s.anulada, false) = false
             and public.normalizar_nombre_proveedor(s.proveedor)
                 = public.normalizar_nombre_proveedor(coalesce(p.nombre, sc.proveedor_texto))) as facturado_en_la_obra,
         (select coalesce(sum(s.total), 0) from public.compra_sheet s
           where coalesce(s.anulada, false) = false
             and public.normalizar_nombre_proveedor(s.proveedor)
                 = public.normalizar_nombre_proveedor(coalesce(p.nombre, sc.proveedor_texto))) as facturado_total
    from public.subcontrato sc
    left join public.proveedores p on p.id = sc.proveedor_id`

/** Los clientes que la app publica, con el nombre canónico que usa la columna L («Sin obra – X»). */
export const CLIENTES = `
  select cp.cliente_id, cp.slug, cp.nombre_comercial, ca.cliente_canonico
    from public.cliente_panel cp
    join public.cliente_alias ca on ca.fuente = 'OS' and ca.rotulo = cp.slug
   order by ca.cliente_canonico`

/**
 * ¿LA REGLA ESTRUCTURA DE LA RPC LLEGA A FILTRAR ALGO? — el control del control.
 *
 * `costo_de_obras_a_la_fecha` filtra `to_jsonb(s) ->> 'destino' not in ('ES-ADM','ES-TAL','IMP','FIN')`,
 * pero `compra_sheet.destino` toma los valores `obra` / `estructura_admin` / `estructura_taller`.
 * La condición NUNCA es falsa: es una cláusula muerta. Hoy no deja pasar nada indebido porque el
 * filtro por `unidad_negocio` hace el trabajo — pero una regla que no puede decir que no no es una
 * regla, y el día que la unidad venga vacía nadie la va a estar cubriendo.
 */
export const DESTINOS_DEL_ESPEJO = `
  select coalesce(destino, '(null)') as destino, count(*)::int as n
    from public.compra_sheet group by 1 order by 2 desc`
