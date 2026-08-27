// PRESUPUESTO → OBRA: EL CONTROL DE QUE NO SE PERDIÓ NADA EN EL CAMINO.
//
// ═══ QUÉ CONTESTA ═══
//
// «Esta partida se cotizó sabiendo el tipo de tarea, el rubro, la unidad, la cantidad, las HH, los
// materiales, los equipos, la cuadrilla y el rendimiento. La obra que salió de ella, ¿sabe todo eso
// todavía, o nació huérfana?»
//
// ═══ POR QUÉ ES UN AUDITOR Y NO UN SEGUNDO CONVERTIDOR ═══
//
// La conversión ya existe y su autoridad es `convertir_partida_a_plan`, en Postgres — está escrito
// en `actionsConversion.ts` con todas las letras y la razón es que la misma llamada entra por la web
// y mañana por el chat. Si este módulo generara las actividades por su cuenta habría dos verdades
// sobre cómo nace una obra, y la que se aplique dependería de por dónde entró el pedido.
//
// Entonces hace lo otro, que es lo que faltaba: **mira el efecto**. Recibe la partida tal como
// quedó, las actividades que de verdad se crearon y lo que de verdad se les copió, y dice concepto
// por concepto si sobrevivió. El CLAUDE.md raíz lo pide así — *la evidencia es del efecto, no del
// intento*— y un control nunca se valida contra la misma información que produce: por eso el
// auditor no toca la función que convierte.
//
// ═══ LA DISTINCIÓN QUE HACE ÚTIL A ESTE ARCHIVO ═══
//
// **«SE PERDIÓ» Y «EL PRESUPUESTO NUNCA LO SUPO» SON DOS PROBLEMAS DISTINTOS Y LOS ARREGLA GENTE
// DISTINTA.** Que la obra no tenga cuadrilla porque la conversión la tiró es un defecto del puente.
// Que no la tenga porque `analisis_cuadrilla` está vacía es una deuda de la Base Maestra, y
// «arreglar el puente» no la mueve ni un milímetro. Confundir las dos manda a alguien a corregir
// código durante un día para descubrir que el dato nunca existió.
//
// Por eso hay tres veredictos y no dos: `CONSERVADO`, `PERDIDO` y `NO_LO_SABIA`.

import { num } from './obra-plan-real.mjs'

export const VEREDICTO = Object.freeze({
  CONSERVADO: 'CONSERVADO',
  PERDIDO: 'PERDIDO',
  NO_LO_SABIA: 'NO_LO_SABIA',
})

/**
 * LOS DOCE CONCEPTOS QUE UN PRESUPUESTO LE TIENE QUE ENTREGAR A SU OBRA.
 *
 * La lista no es una opinión de este archivo: es lo que hace falta para que el ciclo cierre
 * —presupuestar → ejecutar → aprender → presupuestar mejor—. Cada uno dice qué se rompe si falta,
 * y esa columna es la que decide si vale la pena arreglarlo.
 */
export const CONCEPTOS = Object.freeze([
  { clave: 'tarea_tipo', nombre: 'tipo de tarea', rompe: 'sin tipo la actividad no se puede comparar con ninguna otra obra: no aporta ni consume experiencia' },
  { clave: 'rubro', nombre: 'rubro', rompe: 'sin rubro la obra no se agrupa como se cotizó y el control económico compara peras con manzanas' },
  { clave: 'unidad', nombre: 'unidad', rompe: 'sin unidad el rendimiento no tiene denominador: hs/?? no se puede promediar' },
  { clave: 'cantidad', nombre: 'cantidad', rompe: 'sin cantidad no hay avance físico ni rendimiento, sólo horas gastadas' },
  { clave: 'hh_plan', nombre: 'HH plan', rompe: 'sin HH plan no hay desvío que medir: el real no se compara contra nada' },
  { clave: 'materiales', nombre: 'materiales', rompe: 'sin material planificado, lo que se compra no se puede contrastar con lo que se preveía comprar' },
  { clave: 'equipos', nombre: 'equipos', rompe: 'sin equipo planificado, el alquiler o la inmovilización aparecen como sorpresa' },
  { clave: 'cuadrilla', nombre: 'cuadrilla', rompe: 'sin cuadrilla no se puede convertir HH en días, y el plan sale sin fecha de fin' },
  { clave: 'rendimiento', nombre: 'rendimiento', rompe: 'sin rendimiento cotizado no se sabe si la obra rindió mejor o peor de lo prometido' },
  { clave: 'duracion', nombre: 'duración', rompe: 'sin fechas el plan no es un plan: es una lista' },
  { clave: 'dependencias', nombre: 'dependencias', rompe: 'sin precedencias no hay ruta crítica y todo atraso parece igual de grave' },
  { clave: 'fuente', nombre: 'fuente y supuestos', rompe: 'sin saber de qué presupuesto y con qué supuestos salió, la actividad no se puede auditar contra la oferta' },
])

/** Un veredicto, siempre con la evidencia pegada: quien lo lea no tiene que ir a buscarla. */
function veredicto(clave, estado, detalle, evidencia = null) {
  const c = CONCEPTOS.find((x) => x.clave === clave)
  return { concepto: clave, nombre: c?.nombre ?? clave, rompe: c?.rompe ?? null, estado, detalle, evidencia }
}

/**
 * La regla común a casi todos los conceptos: si el presupuesto lo sabía y la obra lo tiene, está
 * conservado; si el presupuesto lo sabía y la obra no, se perdió; si el presupuesto no lo sabía, no
 * es problema del puente.
 */
function comparar(clave, loSabiaElPresupuesto, loTieneLaObra, { detalleOk, detalleMal, detalleNada, evidencia = null }) {
  if (!loSabiaElPresupuesto) return veredicto(clave, VEREDICTO.NO_LO_SABIA, detalleNada, evidencia)
  if (loTieneLaObra) return veredicto(clave, VEREDICTO.CONSERVADO, detalleOk, evidencia)
  return veredicto(clave, VEREDICTO.PERDIDO, detalleMal, evidencia)
}

/** Las actividades que llevan cantidad de verdad — las que el puente tiene que dejar completas. */
function portadoras(actividades) {
  return actividades.filter((a) => a.tipo === 'tarea' || a.rol_estructura === 'frente')
}

/**
 * ¿Todas las actividades de la partida tienen el campo? Una sola sin él ya es una pérdida: el
 * agregado «casi todas» no sirve para nada, porque la que falta es la que va a romper el reporte.
 */
function todasTienen(actividades, campo) {
  return actividades.length > 0 && actividades.every((a) => a[campo] !== null && a[campo] !== undefined)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * EL CONTROL, PARTIDA POR PARTIDA.
 *
 * `partida`   — la fila de `cotizacion_partida` (lo que el presupuesto sabía).
 * `actividades` — las filas de `obra_actividad` con `cotizacion_partida_id = partida.id`.
 * `composicion` — las filas de `cotizacion_partida_composicion` de esa partida (los recursos
 *                 congelados el día de la oferta).
 * `insumosPlan` — las filas de `obra_actividad_insumo_plan` que llegaron a la obra.
 * `dependencias`— las dependencias creadas entre las actividades de esta partida.
 * `cuadrillaTipo` — cuántas personas declara `analisis_cuadrilla` para el análisis de la partida.
 *
 * No consulta nada: recibe todo leído. Es lo que lo hace testeable sin base.
 */
export function auditarPartida({ partida, actividades = [], composicion = [], insumosPlan = [], dependencias = [], cuadrillaTipo = null, pasosDePlantilla = 0 } = {}) {
  const act = portadoras(actividades)
  const tareas = actividades.filter((a) => a.tipo === 'tarea')
  const mat = composicion.filter((l) => l.tipo === 'material')
  const eq = composicion.filter((l) => l.tipo === 'equipo')
  const planMat = insumosPlan.filter((l) => l.tipo === 'material')
  const planEq = insumosPlan.filter((l) => l.tipo === 'equipo')

  const hsUnit = num(partida?.hs_unitarias)
  const controles = [
    comparar('tarea_tipo', partida?.tarea_tipo_id != null, todasTienen(tareas, 'tarea_tipo_id'), {
      detalleOk: `las ${tareas.length} actividades llevan el tarea_tipo de la partida`,
      detalleMal: 'la partida tenía tipo y hay actividades sin él: nacieron huérfanas y hay que reclasificarlas a mano',
      detalleNada: 'la partida se cotizó sin tarea_tipo — el hueco está en el presupuesto, no en la conversión',
      evidencia: { partida_tarea_tipo_id: partida?.tarea_tipo_id ?? null, actividades: tareas.length },
    }),
    comparar('rubro', partida?.rubro != null, actividades.some((a) => a.rol_estructura === 'rubro' || a.nombre === partida?.rubro) || todasTienen(tareas, 'partida_codigo'), {
      detalleOk: 'el rubro de la partida existe como contenedor en la obra',
      detalleMal: 'la partida declaraba rubro y en la obra no quedó ningún contenedor con ese nombre',
      detalleNada: 'la partida no declaraba rubro: las actividades cuelgan de «Sin rubro»',
      evidencia: { rubro: partida?.rubro ?? null },
    }),
    comparar('unidad', partida?.unidad != null, todasTienen(act, 'unidad'), {
      detalleOk: 'todas las actividades llevan la unidad de la partida',
      detalleMal: 'hay actividades sin unidad: su rendimiento no va a tener denominador',
      detalleNada: 'la partida no tiene unidad cargada',
      evidencia: { unidad: partida?.unidad ?? null },
    }),
    comparar('cantidad', num(partida?.cantidad) !== null, todasTienen(act, 'cantidad_objetivo'), {
      detalleOk: 'la cantidad viajó a cada frente y cierra contra la partida',
      detalleMal: 'hay actividades sin cantidad objetivo: no van a poder declarar avance físico',
      detalleNada: 'la partida no tiene cómputo — sin cantidad no hay avance físico posible',
      evidencia: { cantidad: partida?.cantidad ?? null },
    }),
    comparar('hh_plan', hsUnit !== null && !partida?.subcontratada, todasTienen(tareas, 'hh_plan'), {
      detalleOk: 'las HH de la oferta quedaron repartidas en las actividades',
      detalleMal: 'la partida tenía horas unitarias y hay actividades sin HH plan: el desvío no se va a poder medir',
      detalleNada: partida?.subcontratada
        ? 'partida subcontratada: no lleva HH propias y eso es correcto'
        : 'la partida no tiene análisis con mano de obra — no había HH que conservar',
      evidencia: { hs_unitarias: hsUnit, subcontratada: Boolean(partida?.subcontratada) },
    }),
    comparar('materiales', mat.length > 0, planMat.length > 0, {
      detalleOk: `${planMat.length} materiales del presupuesto llegaron al plan de la obra`,
      detalleMal: `la oferta tenía ${mat.length} materiales congelados y a la obra no llegó ninguno: lo que se compre no se va a poder contrastar contra lo previsto`,
      detalleNada: 'el análisis de la partida no tiene materiales',
      evidencia: { congelados: mat.length, en_obra: planMat.length },
    }),
    comparar('equipos', eq.length > 0, planEq.length > 0, {
      detalleOk: `${planEq.length} equipos del presupuesto llegaron al plan de la obra`,
      detalleMal: `la oferta preveía ${eq.length} equipos y a la obra no llegó ninguno`,
      detalleNada: 'el análisis de la partida no prevé equipos',
      evidencia: { congelados: eq.length, en_obra: planEq.length },
    }),
    comparar('cuadrilla', num(cuadrillaTipo) !== null, todasTienen(act, 'dotacion_prevista'), {
      detalleOk: 'la obra sabe con cuánta gente se planificó',
      detalleMal: 'el análisis declaraba una cuadrilla tipo y las actividades salieron sin dotación: el plan no va a tener fecha de fin',
      detalleNada: 'el análisis de la partida no declara cuadrilla tipo (analisis_cuadrilla vacía): la dotación la tiene que poner quien convierte, frente por frente',
      evidencia: { cuadrilla_tipo: cuadrillaTipo, con_dotacion: act.filter((a) => a.dotacion_prevista != null).length },
    }),
    comparar('rendimiento', hsUnit !== null, tareas.length > 0 && tareas.every((a) => num(a.hh_plan) !== null && num(a.cantidad_objetivo) !== null), {
      detalleOk: 'el rendimiento cotizado se puede reconstruir de la obra (HH plan ÷ cantidad) y comparar contra el real',
      detalleMal: 'sin HH o sin cantidad en la actividad, el rendimiento ofertado no se puede recuperar desde la obra',
      detalleNada: 'la partida no tiene horas unitarias: no había rendimiento ofertado',
      evidencia: { hs_unitarias: hsUnit },
    }),
    comparar('duracion', num(cuadrillaTipo) !== null || act.some((a) => a.dotacion_prevista != null), todasTienen(tareas, 'fin_plan'), {
      detalleOk: 'las actividades tienen inicio y fin',
      detalleMal: 'hay actividades sin fecha de fin: el plan es una lista, no un cronograma',
      detalleNada: 'sin dotación no se puede calcular duración — es consecuencia de la cuadrilla, no un defecto propio',
      evidencia: { con_fin: tareas.filter((a) => a.fin_plan != null).length, tareas: tareas.length },
    }),
    comparar('dependencias', pasosDePlantilla > 1, dependencias.length > 0, {
      detalleOk: `${dependencias.length} precedencias creadas entre los pasos`,
      detalleMal: 'la plantilla tenía pasos encadenados y en la obra no quedó ninguna dependencia',
      detalleNada: 'la partida se convirtió sin plantilla de secuencia: no había precedencias que trasladar',
      evidencia: { pasos: pasosDePlantilla, dependencias: dependencias.length },
    }),
    comparar('fuente', true, actividades.length > 0 && actividades.every((a) => a.cotizacion_partida_id != null && a.fuente === 'conversion_presupuesto'), {
      detalleOk: 'cada actividad dice de qué partida salió y por qué camino',
      detalleMal: 'hay actividades sin rastro de la partida que las originó: no se pueden auditar contra la oferta',
      detalleNada: '',
      evidencia: { actividades: actividades.length },
    }),
  ]

  return {
    partida_id: partida?.id ?? null,
    descripcion: partida?.descripcion ?? null,
    actividades: actividades.length,
    controles,
    perdidos: controles.filter((c) => c.estado === VEREDICTO.PERDIDO).map((c) => c.concepto),
    sinDato: controles.filter((c) => c.estado === VEREDICTO.NO_LO_SABIA).map((c) => c.concepto),
  }
}

/**
 * EL RESUMEN DE VARIAS PARTIDAS. Cuenta por concepto, no por partida: lo que hay que arreglar es
 * «los materiales no llegan nunca», no «la partida tal está mal».
 */
export function resumirTraspaso(auditorias = []) {
  const porConcepto = new Map(CONCEPTOS.map((c) => [c.clave, { concepto: c.clave, nombre: c.nombre, rompe: c.rompe, conservado: 0, perdido: 0, sinDato: 0 }]))
  for (const a of auditorias) {
    for (const c of a.controles) {
      const acc = porConcepto.get(c.concepto)
      if (!acc) continue
      if (c.estado === VEREDICTO.CONSERVADO) acc.conservado += 1
      else if (c.estado === VEREDICTO.PERDIDO) acc.perdido += 1
      else acc.sinDato += 1
    }
  }
  const filas = [...porConcepto.values()]
  return {
    partidas: auditorias.length,
    // UN SOLO CONCEPTO PERDIDO ES UN PUENTE ROTO. No se promedia: el 92% de la información no
    // reconstruye el 8% que falta, y el 8% que falta es el que se busca cuando algo no cierra.
    puenteIntacto: filas.every((f) => f.perdido === 0),
    conceptosPerdidos: filas.filter((f) => f.perdido > 0).map((f) => f.concepto),
    conceptosSinDato: filas.filter((f) => f.perdido === 0 && f.sinDato > 0 && f.conservado === 0).map((f) => f.concepto),
    porConcepto: filas,
  }
}
