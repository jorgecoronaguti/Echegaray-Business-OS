// EL BORDE DE LOS TRES ACTOS — lo único de este frente que escribe observaciones y aplicaciones.
//
// Mismo contrato que `precio-fuentes.pg.mjs`: acá no se calcula, no se decide y no se corrige nada.
// Se traduce entre las estructuras congeladas de `precio-observacion.mjs` y las filas de Postgres.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ ESTE MÓDULO **NO ES PARA LA WEB**. LA RLS NO APLICA ACÁ.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Recibe un `query` que en la práctica es el pool del servidor, con un rol que NO pasa por
// row-level security. Uso legítimo: scripts, informes, tests, el worker. Uso prohibido: cualquier
// cosa que atienda a un usuario.
//
// ═══ POR QUÉ EL INSERT DE OBSERVACIONES ES IDEMPOTENTE Y EL DE APLICACIONES NO ═══
//
// Dos corridas que leen la misma página el mismo día observan EL MISMO HECHO: el hash coincide y la
// segunda no agrega nada (`on conflict do nothing`). Eso es lo que hace que la campaña se pueda
// volver a correr sin inflar la serie con ecos de sí misma.
//
// Una aplicación, en cambio, es un acto: aplicar dos veces son dos actos, y los dos quedan. Lo que
// NO puede pasar dos veces es que el catálogo termine con dos filas vigentes — de eso se ocupa el
// `update ... set vigente = false` de abajo, que corre en la misma transacción que el insert.

const iso = (v) => {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

/**
 * GUARDAR OBSERVACIONES. Idempotente por hash. Devuelve las que ENTRARON, no las que se mandaron.
 *
 * La diferencia importa: «guardé 8 observaciones» y «mandé 8 y 5 ya estaban» son dos informes
 * distintos, y el segundo es el que dice que la campaña se está repitiendo sin traer nada nuevo.
 */
export async function guardarObservaciones({ query }, { observaciones = [], cotizacionId = null } = {}) {
  const entraron = []
  for (const o of observaciones) {
    const { rows } = await query(
      `insert into public.precio_observacion
         (hash, recurso_id, recurso_codigo, descripcion, spec, valor, moneda, unidad, base_de_cantidad,
          tipo_fuente, fuente_id, proveedor, fabricante, url, documento, observado_en, valido_desde,
          valido_hasta, valido_hasta_lo_dice_la_fuente, jurisdiccion, iva, flete, confianza,
          evidencia, procedencia, cotizacion_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16::date,$17::date,
               $18::date,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb,$26::uuid)
       on conflict (hash) do nothing
       returning id, hash, recurso_codigo, valor`,
      [o.hash, o.recursoId, o.recursoCodigo, o.descripcion, o.spec, o.valor, o.moneda, o.unidad,
        JSON.stringify(o.baseDeCantidad ?? null), o.tipoFuente, o.fuenteId, o.proveedor, o.fabricante,
        o.url, o.documento, iso(o.observadoEn), iso(o.validoDesde), iso(o.validoHasta),
        Boolean(o.validoHasta), o.jurisdiccion, o.iva, o.flete, o.confianza,
        JSON.stringify(o.evidencia ?? null), JSON.stringify(o.procedencia ?? null), cotizacionId])
    if (rows[0]) entraron.push(rows[0])
  }
  return entraron
}

/**
 * APLICAR UNA OBSERVACIÓN AL CATÁLOGO. Los dos escritos van juntos o no va ninguno.
 *
 * `acto` es lo que devuelve `aplicar()` de `precio-observacion.mjs`: ya validó que hay autorización,
 * que es de esta observación y que una firma humana tiene firmante. Acá NO se revalida nada de eso
 * —duplicar la regla es garantizar que un día las dos versiones se separen— pero la BASE sí la
 * vuelve a exigir con sus CHECK, que es un control independiente del código que lo produce.
 *
 * ═══ POR QUÉ SE AGREGA UNA FILA Y NO SE PISA LA VIEJA ═══
 *
 * Es la misma razón por la que existe `precio_observacion`: pisar garantiza que la serie nunca
 * crezca y que la volatilidad real nunca se pueda medir. Se baja `vigente` de la anterior y se
 * inserta la nueva.
 */
export async function aplicarObservacion({ query }, { recursoId = null, acto = null } = {}) {
  if (!acto?.observacion) throw new Error('no hay acto de aplicación que escribir')
  const o = acto.observacion
  const { rows: reg } = await query(
    `insert into public.precio_aplicacion
       (observacion_hash, recurso_id, recurso_codigo, valor, moneda, unidad, destino,
        autorizado_por_tipo, autorizado_por, firmada_por, politica, seleccion, procedencia)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)
     returning id, observacion_hash, autorizado_por_tipo, autorizado_por, firmada_por`,
    [o.hash, recursoId, o.recursoCodigo, acto.valor, acto.moneda, acto.unidad, acto.destino,
      acto.autorizacion.autorizadoPorTipo, acto.autorizacion.autorizadoPor, acto.autorizacion.firmadaPor,
      JSON.stringify(acto.autorizacion.politica ?? null),
      JSON.stringify(acto.procedencia.acto2_seleccion), JSON.stringify(acto.procedencia)])

  if (!recursoId) return { aplicacion: reg[0], catalogo: null, porQue: 'sin recurso_id: quedó registrada la aplicación y NO se tocó el catálogo' }
  await query('update public.recurso_precio set vigente = false where recurso_id = $1 and vigente is true', [recursoId])
  const { rows: cat } = await query(
    `insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, proveedor, moneda, vigente)
     values ($1,$2,$3::date,$4,$5,$6,true)
     returning id, costo, fecha_precio, fuente`,
    [recursoId, acto.valor, iso(o.observadoEn),
      `${o.tipoFuente} · ${o.url ?? o.documento ?? o.fuenteId} · autorizado por ${acto.autorizacion.autorizadoPorTipo}:${acto.autorizacion.autorizadoPor}`.slice(0, 500),
      o.proveedor, acto.moneda])
  return { aplicacion: reg[0], catalogo: cat[0], porQue: acto.procedencia.acto3_aplicacion }
}

/** LAS OBSERVACIONES YA REGISTRADAS DE UN RECURSO. Es la serie que `vigencia.mjs` necesita para
 *  dejar de prestarle el IPC a todo el catálogo. */
export async function observacionesDeRecurso({ query }, { recursoCodigo, desde = null } = {}) {
  const { rows } = await query(
    `select hash, valor, moneda, unidad, tipo_fuente, url, observado_en, iva, jurisdiccion, confianza
       from public.precio_observacion
      where recurso_codigo = $1 and ($2::date is null or observado_en >= $2::date)
      order by observado_en desc`, [recursoCodigo, desde])
  return rows.map((r) => ({
    hash: r.hash, precio: Number(r.valor), moneda: r.moneda, unidad: r.unidad,
    fuente: r.tipo_fuente, url: r.url, observadoEn: iso(r.observado_en),
    iva: r.iva, jurisdiccion: r.jurisdiccion, confianza: r.confianza,
  }))
}
