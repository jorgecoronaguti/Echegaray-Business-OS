// DE DÓNDE SALIÓ CADA NÚMERO, Y CÓMO SIGUE VIVIENDO CUANDO LA COTIZACIÓN SE VUELVE OBRA. Puro.
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// Una cotización aprobada se convierte en obra, y ahí pasa lo de siempre: alguien copia las
// cantidades a una planilla nueva y el origen se pierde. Tres meses después, cuando el real no da
// contra el plan, nadie puede contestar de dónde salieron los 191,92 m² — y sin eso no hay
// aprendizaje posible, porque no se sabe si falló la medición, el rendimiento o la ejecución.
//
// Este archivo NO crea obras y NO escribe nada. Define el CONTRATO: qué tiene que viajar con cada
// cantidad para que «crear obra desde cotización» no sea una copia sino una continuación.
//
// ═══ LA CADENA, ENTERA ═══
//
//   PROYECTO → DOCUMENTO → LÁMINA/LAYOUT → ELEMENTO → CÓMPUTO → PROCESO → PARTIDA → RECURSO →
//   PRECIO → COTIZACIÓN → ACTIVIDAD_OBRA → CANTIDAD_PLAN → HH_PLAN → CUADRILLA → DURACIÓN →
//   EJECUCIÓN → REAL → APRENDIZAJE
//
// Los primeros diez eslabones los produce este circuito. Los siguientes todavía no existen, y por
// eso lo que hay acá es la FORMA que tienen que tener: si la obra se crea con estos campos, el día
// que se cargue el real la comparación sale sola y nadie tiene que reconstruir nada.

import { genealogia } from './fuente.mjs'

/** Los eslabones, en orden. Están enumerados para que un hueco se vea como hueco: si la cadena de
 *  un número salta de ELEMENTO a PARTIDA, es que nadie computó nada en el medio. */
export const ESLABONES = Object.freeze([
  'PROYECTO', 'DOCUMENTO', 'LAMINA', 'ELEMENTO', 'COMPUTO', 'PROCESO', 'PARTIDA', 'RECURSO', 'PRECIO', 'COTIZACION',
])

/** Los eslabones que todavía no produce este circuito, y que el contrato deja preparados. */
export const ESLABONES_DE_OBRA = Object.freeze([
  'ACTIVIDAD_OBRA', 'CANTIDAD_PLAN', 'HH_PLAN', 'MATERIAL_PLAN', 'EQUIPO_PLAN', 'CUADRILLA', 'DURACION',
  'DEPENDENCIAS', 'EJECUCION', 'CANTIDAD_REAL', 'HH_REAL', 'COSTO_REAL', 'PLAN_VS_REAL', 'APRENDIZAJE',
])

/**
 * LA CADENA DE UN ELEMENTO, armada desde el resultado del pipeline. PURA.
 *
 * Devuelve un paso por eslabón, y los que faltan salen DECLARADOS como faltantes en vez de
 * omitidos. Un eslabón ausente es información: dice exactamente en qué punto se cortó la
 * trazabilidad de ese número.
 */
export function cadenaDe(resultado, elementoId) {
  const mapeo = (resultado?.mapeo?.mapeos ?? []).find((m) => m.elemento === elementoId)
  const computo = mapeo?.computo ?? (resultado?.computo?.items ?? []).find((i) => i.id === elementoId)
  const ev = computo?.evidencia ?? null
  const composicion = mapeo?.tarea ? (resultado?.composiciones?.get?.(mapeo.tarea.id) ?? null) : null
  const procesos = (resultado?.procesos?.procesos ?? []).filter((p) => p.elemento === elementoId)

  const pasos = [
    { etapa: 'PROYECTO', que: resultado?.termino ?? null, fuente: 'BASE_MAESTRA', valor: null },
    { etapa: 'DOCUMENTO', que: ev?.archivo ?? null, fuente: ev ? 'EXTRAIDO_PLANO' : 'FALTA_DATO', evidencia: ev },
    { etapa: 'LAMINA', que: ev?.vista ?? ev?.lamina ?? null, fuente: ev?.vista ? 'EXTRAIDO_PLANO' : 'FALTA_DATO', evidencia: ev },
    { etapa: 'ELEMENTO', que: computo?.nombre ?? elementoId, fuente: computo ? 'EXTRAIDO_PLANO' : 'FALTA_DATO', evidencia: ev },
    { etapa: 'COMPUTO', que: computo?.nombre ?? null, valor: computo?.cantidad?.valor ?? null, unidad: computo?.unidad ?? null, fuente: computo?.cantidad?.fuente ?? 'FALTA_DATO', formula: computo?.cantidad?.formula ?? null, entradas: computo?.cantidad?.entradas ?? null },
    { etapa: 'PROCESO', que: procesos.length ? `${procesos.length} proceso(s) derivado(s)` : null, fuente: procesos.length ? 'CALCULADO' : 'FALTA_DATO' },
    { etapa: 'PARTIDA', que: mapeo?.tarea ? `${mapeo.tarea.codigo} ${mapeo.tarea.nombre}` : null, fuente: mapeo?.tarea ? 'BASE_MAESTRA' : (mapeo?.estado ?? 'FALTA_DATO') },
    { etapa: 'RECURSO', que: composicion ? `${composicion.length} línea(s) de análisis` : null, fuente: composicion ? 'BASE_MAESTRA' : 'FALTA_DATO' },
    { etapa: 'PRECIO', que: composicion?.some?.((l) => l.costoUnitario !== null) ? 'precio vigente' : null, fuente: composicion?.some?.((l) => l.costoUnitario !== null) ? 'BASE_MAESTRA' : 'FALTA_DATO' },
  ]
  return {
    elemento: elementoId,
    pasos,
    faltantes: pasos.filter((p) => !p.que).map((p) => p.etapa),
    completa: pasos.every((p) => p.que),
    legible: genealogia(pasos.filter((p) => p.que)),
  }
}

/**
 * EL CONTRATO DE «CREAR OBRA DESDE COTIZACIÓN». PURA.
 *
 * Devuelve la actividad de obra tal como tendría que nacer: con la cantidad, la partida, el
 * rendimiento y —lo único que importa de verdad— el ORIGEN completo. Sin `origen`, la actividad es
 * una fila nueva; con `origen`, es el mismo número que salió del plano y se puede volver a él.
 *
 * NO escribe: quien cree la obra decide cuándo y con qué permisos. Acá está la forma.
 */
export function actividadDesde({ resultado, elementoId, obraId = null } = {}) {
  const c = cadenaDe(resultado, elementoId)
  const mapeo = (resultado?.mapeo?.mapeos ?? []).find((m) => m.elemento === elementoId)
  const computo = mapeo?.computo ?? null
  if (!mapeo?.tarea || computo?.cantidad?.valor === null || computo?.cantidad?.valor === undefined) {
    return {
      ok: false,
      elemento: elementoId,
      porQue: !mapeo?.tarea
        ? `«${elementoId}» no tiene partida asignada (${mapeo?.estado ?? 'sin mapeo'}): una actividad de obra sin partida no tiene con qué costear`
        : `«${elementoId}» no tiene cantidad computada: una actividad de obra sin cantidad no se puede planificar`,
      faltantes: c.faltantes,
    }
  }
  return {
    ok: true,
    obra_id: obraId,
    tarea_tipo_id: mapeo.tarea.id,
    codigo: mapeo.tarea.codigo,
    descripcion: mapeo.tarea.nombre,
    unidad: mapeo.tarea.unidad,
    cantidad_plan: computo.cantidad.valor,
    // El origen es TODO el punto de este archivo. Es lo que permite que, cuando el real no dé
    // contra el plan, se pueda contestar de dónde salió el plan sin reconstruir nada.
    origen: {
      proyecto: resultado?.termino ?? null,
      elemento: elementoId,
      documento: computo?.evidencia?.archivo ?? null,
      lamina: computo?.evidencia?.vista ?? null,
      textoLiteral: computo?.evidencia?.textoLiteral ?? null,
      fuente: computo.cantidad.fuente,
      formula: computo.cantidad.formula ?? null,
      entradas: computo.cantidad.entradas ?? null,
      criterio: mapeo.porQue ?? null,
      cadena: c.legible,
    },
    // Los eslabones que todavía no existen, nombrados para que quien los implemente sepa qué falta
    // y no invente un modelo nuevo.
    pendientesDeObra: ESLABONES_DE_OBRA,
  }
}

/** Todas las actividades que una cotización puede convertir en obra, y las que no con su motivo.
 *  El orden es total por código y elemento: dos corridas producen la misma obra. PURA. */
export function obraDesdeCotizacion(resultado, { obraId = null } = {}) {
  const ids = (resultado?.mapeo?.mapeos ?? []).map((m) => m.elemento)
  const todas = ids.map((id) => actividadDesde({ resultado, elementoId: id, obraId }))
  const listas = todas.filter((a) => a.ok).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)) || String(a.origen.elemento).localeCompare(String(b.origen.elemento)))
  const bloqueadas = todas.filter((a) => !a.ok).sort((a, b) => String(a.elemento).localeCompare(String(b.elemento)))
  return {
    actividades: listas,
    bloqueadas,
    porQue: `${listas.length} actividad(es) pueden nacer con su origen completo; ${bloqueadas.length} no pueden porque les falta partida o cantidad`,
    // ═══ `conservaOrigen` ERA UNA CONSTANTE ═══
    // Exigía `elemento` y `fuente`, que están SIEMPRE porque los pone esta misma función: la
    // afirmación no podía dar `false`. Lo que hace que una actividad se pueda volver a rastrear es
    // poder ABRIR el documento y releer la frase: sin `documento`, `lamina` y `textoLiteral`, el
    // origen es un rótulo. Ahora se exigen los tres, y las que no los tienen salen listadas.
    conservaOrigen: listas.length > 0 && listas.every((a) => a.origen?.documento && a.origen?.lamina && a.origen?.textoLiteral),
    sinOrigenCitable: listas
      .filter((a) => !(a.origen?.documento && a.origen?.lamina && a.origen?.textoLiteral))
      .map((a) => ({
        elemento: a.origen?.elemento ?? null,
        codigo: a.codigo,
        faltantes: ['documento', 'lamina', 'textoLiteral'].filter((k) => !a.origen?.[k]),
        porQue: 'la actividad puede nacer pero su cantidad no se va a poder rastrear: falta con qué volver al documento',
      }))
      .sort((a, b) => String(a.elemento).localeCompare(String(b.elemento))),
  }
}
