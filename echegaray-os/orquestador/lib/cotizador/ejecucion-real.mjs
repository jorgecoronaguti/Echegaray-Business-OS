// §17 · LA EJECUCIÓN REAL, CONSOLIDADA CONTRA LA PARTIDA QUE LA ORIGINÓ.
//
// ═══ QUÉ HACE Y QUÉ NO ═══
//
// Toma las filas crudas de las puertas que YA existen —`obra_ejecucion`, `registros_hh`,
// `obra_ejecucion_equipo`, `obra_partida_costo_real`— y las agrupa por partida cotizada. No inventa
// una captura nueva y no corrige nada: si `obra_ejecucion.cantidad` viene en NULL (247 de 251 filas
// hoy), sale NULL con su motivo declarado.
//
// ═══ HH NO ES DURACIÓN, Y NO ES PERSONAS ═══
//
// Las tres son magnitudes distintas y el error de mezclarlas no avisa: 160 HH pueden ser 4 personas
// × 5 días de 8 h o 1 persona × 20 días. Una obra que reporta «160 días de atraso» porque alguien
// leyó las HH como días toma decisiones de contratación sobre un número inventado.
//
// Por eso cada magnitud sale ETIQUETADA con su unidad (`magnitud()`), y la comparación se niega a
// comparar dos unidades distintas. No es un adorno de tipado: es lo único que hace que el error
// aparezca como una excepción en vez de como un número plausible.
//
// ═══ LO QUE NO SE PUDO IMPUTAR NO DESAPARECE ═══
//
// Una jornada, un comprobante o un avance que no engancha con ninguna partida del plan NO se
// descarta y NO se reparte entre las partidas parecidas. Vuelve en `sinImputar`, con su monto y sus
// horas, y el resumen lo cuenta. Un costo real que no suma a ninguna partida y tampoco figura en
// ningún lado hace que la obra parezca más barata de lo que fue.

/** Un número o `null`. Nunca cero por accidente. */
export const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Unidades reconocidas. La comparación NO cruza dos de éstas. */
export const UNIDAD = Object.freeze({
  HH: 'HH',            // horas-hombre
  DIA: 'día',          // días de calendario
  PERSONA: 'persona',  // dotación
  MONEDA: '$',
  FISICA: 'física',    // m², m³, ml, un… la unidad de la partida
  RATIO: 'HH/u',       // rendimiento
})

/** Una magnitud etiquetada. `valor` puede ser `null` — y entonces la unidad igual viaja, porque
 *  «no sé cuántas HH» y «no sé cuántos días» son huecos distintos. */
export function magnitud(valor, unidad, { detalle = null } = {}) {
  if (!Object.values(UNIDAD).includes(unidad)) throw new Error(`unidad desconocida: ${unidad}`)
  return Object.freeze({ valor: num(valor), unidad, detalle })
}

const TIPOS_HORA_PRODUCTIVA = Object.freeze(['normal', 'extra_50', 'extra_100'])
const DIA_MS = 24 * 60 * 60 * 1000

const dia = (v) => {
  if (!v) return null
  const s = v instanceof Date
    ? `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
    : String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/**
 * DURACIÓN REAL, EN DÍAS DE CALENDARIO. PURA.
 *
 * Del primer día trabajado al último, ambos inclusive. Un solo día trabajado dura 1 día, no 0 —
 * dividir por una duración cero produce un ritmo infinito, que es cómo este error se propaga.
 *
 * NO cuenta las horas y NO descuenta los días sin trabajo intermedios: un frente parado tres
 * semanas duró tres semanas más, y ese es exactamente el dato que el cronograma necesita. Los días
 * efectivamente trabajados salen aparte, en `diasTrabajados`.
 */
export function duracionDeCalendario(fechas = []) {
  const dias = [...new Set(fechas.map(dia).filter(Boolean))].sort()
  if (!dias.length) return magnitud(null, UNIDAD.DIA, { detalle: 'sin ninguna fecha registrada' })
  const desde = Date.parse(`${dias[0]}T00:00:00Z`)
  const hasta = Date.parse(`${dias[dias.length - 1]}T00:00:00Z`)
  return magnitud(Math.round((hasta - desde) / DIA_MS) + 1, UNIDAD.DIA)
}

/** Días con trabajo registrado. Distinto de la duración: 3 jornadas en 3 semanas son 3 días
 *  trabajados y 21 de duración, y las dos cosas se necesitan para leer un atraso. PURA. */
export function diasTrabajados(fechas = []) {
  const dias = new Set(fechas.map(dia).filter(Boolean))
  return magnitud(dias.size || null, UNIDAD.DIA)
}

/** HORAS-HOMBRE. PURA. `null` cuando no hay ni una imputación: cero horas imputadas y cero horas
 *  trabajadas son cosas distintas, y sólo la segunda es un dato. */
export function horasHombre(registros = [], { soloProductivas = true } = {}) {
  const filas = registros.filter((r) => !soloProductivas || TIPOS_HORA_PRODUCTIVA.includes(r.tipo_hora ?? 'normal'))
  if (!filas.length) return magnitud(null, UNIDAD.HH, { detalle: 'sin imputaciones de horas' })
  return magnitud(filas.reduce((a, r) => a + (num(r.horas) ?? 0), 0), UNIDAD.HH)
}

/** Cuántas personas distintas tocaron la tarea. `null` si las imputaciones no dicen quién —
 *  contarlas como 1 haría que la productividad por persona saliera multiplicada por la cuadrilla. */
export function personasDistintas(registros = []) {
  const ids = new Set(registros.map((r) => r.persona_id ?? r.trabajador_o_cuadrilla).filter(Boolean))
  return magnitud(ids.size || null, UNIDAD.PERSONA, { detalle: ids.size ? null : 'las imputaciones no identifican a la persona' })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CANTIDAD EJECUTADA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * CANTIDAD EJECUTADA. PURA. Devuelve `{cantidad, avancePct, cerrada, motivo}`.
 *
 * ═══ EL PORCENTAJE NO SE CONVIERTE EN CANTIDAD ═══
 *
 * Medido: 247 de 251 filas de `obra_ejecucion` traen sólo `avance_pct`. Multiplicar ese porcentaje
 * por la cantidad del plan daría un número para todas las partidas — y sería el plan otra vez,
 * disfrazado de real: el desvío de cantidad daría cero SIEMPRE. Un control que no puede dar rojo no
 * es un control. Por eso el pct viaja aparte y la cantidad queda en `null` con motivo
 * `SOLO_PORCENTAJE`.
 */
export function cantidadEjecutada(ejecuciones = [], { unidad = null } = {}) {
  if (!ejecuciones.length) {
    return Object.freeze({ cantidad: magnitud(null, UNIDAD.FISICA, { detalle: unidad }), avancePct: null, cerrada: false, motivo: 'SIN_REGISTRO' })
  }
  const conCantidad = ejecuciones.filter((e) => num(e.cantidad) !== null)
  // El último porcentaje declarado manda sobre los anteriores: el avance es acumulado, no aditivo.
  const porFecha = [...ejecuciones].sort((a, b) => String(dia(a.fecha) ?? '').localeCompare(String(dia(b.fecha) ?? '')))
  const ultimoPct = [...porFecha].reverse().find((e) => num(e.avance_pct) !== null)
  const avancePct = ultimoPct ? num(ultimoPct.avance_pct) : null

  const cantidad = conCantidad.length
    ? magnitud(conCantidad.reduce((a, e) => a + num(e.cantidad), 0), UNIDAD.FISICA, { detalle: unidad })
    : magnitud(null, UNIDAD.FISICA, { detalle: unidad })

  return Object.freeze({
    cantidad,
    avancePct,
    // «Cerrada» sólo con el 100% declarado. Sin eso, una partida a medio hacer se compararía contra
    // la cantidad total y saldría con un desvío del −57% que no existe: no está desviada, está
    // empezada. Es el caso real de EXCAVACIONES en Quattropani (20 de 46,74 m³).
    cerrada: avancePct !== null && avancePct >= 100,
    motivo: conCantidad.length ? null : (avancePct !== null ? 'SOLO_PORCENTAJE' : 'SIN_REGISTRO'),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONSOLIDACIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════

const porClave = (filas, clave) => {
  const m = new Map()
  for (const f of filas) {
    const k = clave(f)
    if (k === null || k === undefined) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(f)
  }
  return m
}

/**
 * LA EJECUCIÓN REAL DE UNA OBRA, PARTIDA POR PARTIDA. PURA.
 *
 * Devuelve `{partidas, sinImputar, resumen}`. Todas las entradas son filas crudas de la base; nada
 * se corrige acá.
 */
export function consolidarEjecucion({
  plan = [], ejecuciones = [], horas = [], costos = [], equipos = [], composicion = [],
} = {}) {
  // Una partida del plan se alcanza por su actividad (obra_ejecucion, registros_hh, equipos) o
  // directamente por su id (obra_partida_costo_real). Los dos caminos, sin inventar un tercero.
  const actividadDePartida = new Map()
  for (const p of plan) if (p.actividadId) actividadDePartida.set(String(p.actividadId), String(p.cotizacionPartidaId))

  const ejePorAct = porClave(ejecuciones, (e) => (e.actividad_id ? String(e.actividad_id) : null))
  const hhPorAct = porClave(horas, (h) => (h.actividad_id ? String(h.actividad_id) : null))
  const eqPorAct = porClave(equipos, (q) => (q.actividad_id ? String(q.actividad_id) : null))
  const costoPorPartida = porClave(costos, (c) => (c.cotizacion_partida_id ? String(c.cotizacion_partida_id) : null))
  const compPorPartida = porClave(composicion, (c) => (c.partida_id ? String(c.partida_id) : null))

  const partidas = plan.map((p) => {
    const pid = String(p.cotizacionPartidaId)
    const aid = p.actividadId ? String(p.actividadId) : null
    const eje = aid ? (ejePorAct.get(aid) ?? []) : []
    const hh = aid ? (hhPorAct.get(aid) ?? []) : []
    const eq = aid ? (eqPorAct.get(aid) ?? []) : []
    const co = costoPorPartida.get(pid) ?? []
    const fechas = [...eje.map((e) => e.fecha), ...hh.map((h) => h.fecha ?? h.fecha_inicio_semana)]

    const ejec = cantidadEjecutada(eje, { unidad: p.unidad })
    const materiales = co.filter((c) => c.tipo === 'MATERIAL')
    const subcontratos = co.filter((c) => c.tipo === 'SUBCONTRATO')

    return Object.freeze({
      cotizacionPartidaId: pid,
      actividadId: aid,
      codigo: p.codigo ?? null,
      descripcion: p.descripcion ?? null,
      unidad: p.unidad ?? null,
      // — cantidad y avance
      cantidad: ejec.cantidad,
      avancePct: ejec.avancePct,
      cerrada: ejec.cerrada,
      motivoCantidad: ejec.motivo,
      // — HH, personas, duración: TRES magnitudes distintas, cada una con su unidad
      hhReales: horasHombre(hh),
      hhImproductivas: hh.some((h) => h.improductiva)
        ? magnitud(hh.filter((h) => h.improductiva).reduce((a, h) => a + (num(h.horas) ?? 0), 0), UNIDAD.HH)
        : magnitud(null, UNIDAD.HH, { detalle: 'ninguna imputación marcada improductiva' }),
      personas: personasDistintas(hh),
      // ═══ LA CUADRILLA (§E1) — UN HUECO DECLARADO, NO UN CAMPO QUE NO EXISTE ═══
      //
      // `leerEjecucionReal` YA trae `cuadrilla_id` y esta consolidación lo tiraba, así que el hueco
      // era invisible: nadie podía ver que falta porque el dato ni siquiera llegaba a la salida.
      // Medido el 31/08/2026 sobre las 6 obras: `obra_ejecucion.cuadrilla_id` está en NULL en las
      // 251 filas y `registros_hh.trabajador_o_cuadrilla` en las 25. O sea, el rendimiento nunca se
      // va a poder atribuir a una cuadrilla, y esa es exactamente la variable que explica por qué
      // la misma tarea rinde distinto en dos frentes.
      //
      // Sale como hueco DECLARADO y no como lista vacía: `[]` se lee como «no hubo cuadrillas».
      cuadrillas: Object.freeze([...new Set([
        ...eje.map((e) => e.cuadrilla_id).filter(Boolean),
        ...hh.map((h) => h.trabajador_o_cuadrilla).filter(Boolean),
      ])].map(String)),
      motivoCuadrilla: (eje.some((e) => e.cuadrilla_id) || hh.some((h) => h.trabajador_o_cuadrilla))
        ? null : 'ningún parte ni imputación declara la cuadrilla',
      duracion: duracionDeCalendario(fechas),
      diasTrabajados: diasTrabajados(fechas),
      // — material, equipo, costo
      materialConsumido: Object.freeze(materiales.map((c) => Object.freeze({
        recurso: c.recurso_codigo ?? c.recurso_nombre, nombre: c.recurso_nombre, unidad: c.unidad ?? null,
        cantidad: num(c.cantidad), precioUnitario: num(c.precio_unitario), monto: num(c.monto), fecha: dia(c.fecha),
      }))),
      equipoUtilizado: Object.freeze(eq.map((q) => Object.freeze({ equipo: q.equipo, horas: num(q.horas) }))),
      costoReal: co.length ? magnitud(co.reduce((a, c) => a + (num(c.monto) ?? 0), 0), UNIDAD.MONEDA) : magnitud(null, UNIDAD.MONEDA, { detalle: 'sin costo real imputado a esta partida' }),
      subcontratoReal: subcontratos.length ? magnitud(subcontratos.reduce((a, c) => a + (num(c.monto) ?? 0), 0), UNIDAD.MONEDA) : magnitud(null, UNIDAD.MONEDA),
      // — composición cotizada, para poder comparar recurso contra recurso
      composicionPlan: Object.freeze((compPorPartida.get(pid) ?? []).map((c) => Object.freeze({
        recurso: c.recurso_codigo ?? c.recurso_nombre, nombre: c.recurso_nombre, tipo: c.tipo ?? null, unidad: c.unidad ?? null,
        cantidadUnitaria: num(c.cantidad), desperdicio: num(c.desperdicio), costoUnitario: num(c.costo_unitario),
      }))),
      // — incidencias: SÓLO las que alguien escribió. No se deduce ninguna del signo del desvío.
      incidencias: Object.freeze([
        ...eje.filter((e) => e.causa_desvio).map((e) => Object.freeze({ fuente: 'obra_ejecucion', fecha: dia(e.fecha), causa: e.causa_desvio, texto: e.comentario ?? null })),
        ...hh.filter((h) => h.causa_desvio).map((h) => Object.freeze({ fuente: 'registros_hh', fecha: dia(h.fecha), causa: h.causa_desvio, texto: h.notas ?? null })),
      ]),
    })
  })

  // ═══ LO QUE NO ENGANCHÓ ═══
  const actividadesDelPlan = new Set(actividadDePartida.keys())
  const partidasDelPlan = new Set(plan.map((p) => String(p.cotizacionPartidaId)))
  const sinImputar = Object.freeze({
    ejecuciones: Object.freeze(ejecuciones.filter((e) => !e.actividad_id || !actividadesDelPlan.has(String(e.actividad_id)))),
    horas: Object.freeze(horas.filter((h) => !h.actividad_id || !actividadesDelPlan.has(String(h.actividad_id)))),
    costos: Object.freeze(costos.filter((c) => !c.cotizacion_partida_id || !partidasDelPlan.has(String(c.cotizacion_partida_id)))),
    equipos: Object.freeze(equipos.filter((q) => !q.actividad_id || !actividadesDelPlan.has(String(q.actividad_id)))),
  })

  return Object.freeze({
    partidas: Object.freeze(partidas),
    sinImputar,
    resumen: Object.freeze({
      partidas: partidas.length,
      conCantidadReal: partidas.filter((p) => p.cantidad.valor !== null).length,
      soloPorcentaje: partidas.filter((p) => p.motivoCantidad === 'SOLO_PORCENTAJE').length,
      sinNingunRegistro: partidas.filter((p) => p.motivoCantidad === 'SIN_REGISTRO').length,
      conHHReales: partidas.filter((p) => p.hhReales.valor !== null).length,
      conCostoReal: partidas.filter((p) => p.costoReal.valor !== null).length,
      // Si esto es 0 con partidas ejecutadas, el rendimiento no se puede atribuir a ninguna
      // cuadrilla y la comparación entre frentes queda sin la variable que la explica.
      conCuadrilla: partidas.filter((p) => p.cuadrillas.length > 0).length,
      cerradas: partidas.filter((p) => p.cerrada).length,
      // El contador que impide que «no hay desvíos» signifique «no miré». Si esto no es cero, hay
      // ejecución real que no está sumando a ninguna partida.
      sinImputar: Object.freeze({
        ejecuciones: sinImputar.ejecuciones.length,
        horas: sinImputar.horas.length,
        hhSinImputar: horasHombre(sinImputar.horas).valor,
        costos: sinImputar.costos.length,
        montoSinImputar: sinImputar.costos.length ? sinImputar.costos.reduce((a, c) => a + (num(c.monto) ?? 0), 0) : null,
        equipos: sinImputar.equipos.length,
      }),
    }),
  })
}
