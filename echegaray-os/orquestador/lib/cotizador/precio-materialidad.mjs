// A QUÉ PRECIO IR PRIMERO — el orden lo decide la plata en riesgo, no la antigüedad.
//
// ═══ EL DEFECTO QUE ESTE MÓDULO EXISTE PARA CERRAR ═══
//
// Medido el 31/08/2026 sobre la cotización real del Salón Comercial ($84,9 M): 58 de 107 recursos
// tienen el precio vencido o no lo tienen. Salir a buscar los 58 es caro, lento y —lo peor— trata al
// CLAVO PUNTA PARIS igual que al PANEL DE CHAPA. Ordenarlos por antigüedad tampoco sirve: el
// PINO ALAMO TABLA lleva 30 meses vencido y mueve $188 mil; el Panel lleva 25 y mueve $8 millones.
//
// ═══ LA CUENTA: RIESGO = PLATA × ERROR ESPERADO ═══
//
// Un precio viejo no está «mal»: está mal EN ALGUNA MEDIDA, y esa medida se puede estimar. Si el
// recurso mueve $I en la oferta y su precio se desvió una fracción `e`, el número que la oferta
// afirma y no tiene es $I × e. Eso —y no la edad— es lo que hay que ir a resolver primero.
//
//     error esperado = (1 + deriva mensual) ^ (meses desde la observación) − 1
//
// La deriva mensual NO se decreta acá: viene de `vigencia.mjs`, que la mide en la serie propia del
// recurso cuando existe y cae al IPC del INDEC cuando no. Este módulo sólo la compone en el tiempo.
//
// ═══ EL RESULTADO, MEDIDO, ANTES DE ESCRIBIR UNA LÍNEA DE ESTE ARCHIVO ═══
//
// Corriendo la cuenta sobre los 58 bloqueados del Salón Comercial, el orden que sale es:
//
//     367  Panel Chapa Trape        $7.999.310 × 90%  =  $7.223.280   acumulado  67,7%
//     333  VIAJE DE TATU con RSU    $2.520.000 × 86%  =  $2.174.368   acumulado  88,1%
//     154  PLACA DE YESO            $  296.100 × 91%  =  $  268.818   acumulado  90,7%
//     243  HIERRO LISO ø 16         $  379.770 × 57%  =  $  215.221   acumulado  92,7%
//
// Son EXACTAMENTE los cuatro que el dueño señaló, y explican el 92,7% del riesgo — el «92%» que él
// dijo. Ninguno está nombrado en este archivo ni en ningún otro: salen del cociente. Que sigan
// saliendo es el test de `precio-materialidad.test.mjs`.
//
// ═══ EL BUCKET QUE NO SE PUEDE PONER EN CERO ═══
//
// Un recurso SIN_PRECIO no tiene impacto calculable: sin precio no hay $I. Su riesgo NO es cero —es
// DESCONOCIDO— y por eso sale en una lista aparte, `noMedidos`, que se atiende ANTES que la
// ordenada y NO entra al denominador de la cobertura. Meterlos con riesgo 0 los mandaría al fondo
// de la cola, que es exactamente donde no tienen que estar. NO_MEDIDO nunca es 0%.

import { derivaDelIPC, derivaDeSerie } from './vigencia.mjs'

const MS_DIA = 86_400_000
const DIAS_POR_MES = 30.436_875   // año trópico / 12 — no 30, que acumula 5 días de error por año
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

/** Techo del error esperado. Un precio de cuatro años no está «400% mal»: está mal y punto, y
 *  seguir componiendo exponencialmente inventa una precisión que nadie puede defender. Al 100% el
 *  ranking ya no distingue —todos los muy viejos empatan— y quien decide es el impacto, que es la
 *  señal fuerte. Es un TOPE DECLARADO, no una medición. */
export const ERROR_MAXIMO = 1

/** Cuánto del riesgo total se quiere resolver antes de parar de consultar. 90% es el punto donde,
 *  medido sobre la cotización real, la cola pasa a valer menos que la consulta que la resolvería. */
export const COBERTURA_OBJETIVO = 0.9

/**
 * CUÁNTO SE DESVIÓ ESTE PRECIO DESDE QUE SE OBSERVÓ. PURA.
 *
 * Devuelve `{ fraccion, medido, porQue }`. `medido:false` significa que la deriva no se pudo medir
 * en la serie del recurso y se usó el piso del IPC — se dice, no se esconde.
 *
 * Un precio con `caducaEl` (un básico de convenio) NO se degrada: mientras el tramo rige el error es
 * 0 exacto, y el día que caduca el error deja de ser estimable porque lo que cambió es la escala,
 * no el mercado. Ahí devuelve `fraccion: null` y cae al bucket de no medidos.
 */
export function errorEsperado({ observadoEn = null, derivaMensual = null, caducaEl = null, hoy = new Date() } = {}) {
  if (caducaEl) {
    if (iso(hoy) <= iso(caducaEl)) {
      return { fraccion: 0, medido: true, porQue: `rige el tramo firmado hasta el ${iso(caducaEl)}: el error no es «poco», es cero exacto` }
    }
    return { fraccion: null, medido: false, porQue: `el tramo caducó el ${iso(caducaEl)}: lo que cambió es la escala, no el mercado — el error no se estima con una deriva, se trae la escala nueva` }
  }
  if (!observadoEn) return { fraccion: null, medido: false, porQue: 'sin fecha de observación no hay desde cuándo medir la deriva' }
  const d = Number(derivaMensual)
  if (!Number.isFinite(d) || d <= 0) return { fraccion: null, medido: false, porQue: 'no hay deriva mensual con la que componer el error' }
  const meses = (Date.parse(`${iso(hoy)}T00:00:00Z`) - Date.parse(`${iso(observadoEn)}T00:00:00Z`)) / MS_DIA / DIAS_POR_MES
  if (!(meses > 0)) return { fraccion: 0, medido: true, porQue: `observado el ${iso(observadoEn)}, hoy o después: todavía no tuvo tiempo de desviarse` }
  const crudo = (1 + d) ** meses - 1
  const fraccion = Math.min(ERROR_MAXIMO, crudo)
  return {
    fraccion,
    medido: true,
    porQue: `${(fraccion * 100).toFixed(0)}% = (1 + ${(d * 100).toFixed(2)}%/mes) ^ ${meses.toFixed(1)} meses − 1`
      + (fraccion < crudo ? '' : `${crudo > ERROR_MAXIMO ? ` (topeado en ${ERROR_MAXIMO * 100}%)` : ''}`),
  }
}

/**
 * LA DERIVA QUE LE CORRESPONDE A ESTE RECURSO. PURA salvo la tabla de IPC que importa.
 *
 * Se prefiere SIEMPRE la serie propia: es la deriva de este recurso, no la del promedio de la
 * economía. El IPC es el piso declarado de quien no tiene serie — hoy, medido, son todos.
 */
export function derivaDeRecurso({ serie = [], hoy = new Date() } = {}) {
  const propia = derivaDeSerie(serie)
  if (propia.derivaMensual !== null) return propia
  return derivaDelIPC({ hoy })
}

/**
 * EL RIESGO ECONÓMICO DE UN RECURSO CON EL PRECIO EN DUDA. PURA.
 *
 * `impacto` es la plata que el recurso mueve en la oferta (cantidad × precio). `null` cuando no se
 * puede calcular —no hay precio— y entonces el riesgo sale `null`, NUNCA 0.
 */
export function riesgoDeRecurso({ recurso = {}, resolucion = {}, impacto = null, hoy = new Date() } = {}) {
  const base = { codigo: recurso.codigo ?? resolucion.recurso ?? null, nombre: recurso.nombre ?? resolucion.nombre ?? null, resultado: resolucion.resultado ?? null, impacto: null, error: null, riesgo: null }
  const deriva = derivaDeRecurso({ serie: recurso.serie ?? [], hoy })
  const err = errorEsperado({
    observadoEn: resolucion.fecha ?? null,
    caducaEl: resolucion.vigencia?.caducaEl ?? null,
    derivaMensual: deriva.derivaMensual, hoy,
  })
  const imp = Number(impacto)
  if (!Number.isFinite(imp) || imp <= 0) {
    return Object.freeze({ ...base, error: err.fraccion, medido: false, origenDeriva: deriva.origen, porQue: `no se sabe cuánta plata mueve este recurso (${resolucion.resultado === 'SIN_PRECIO' ? 'no tiene precio con qué valorizarlo' : 'no se pasó el impacto'}): el riesgo queda NO MEDIDO, que no es cero` })
  }
  if (err.fraccion === null) {
    return Object.freeze({ ...base, impacto: imp, error: null, medido: false, origenDeriva: deriva.origen, porQue: `mueve $${imp.toLocaleString('es-AR')} y el error no se pudo estimar: ${err.porQue}` })
  }
  return Object.freeze({
    ...base, impacto: imp, error: err.fraccion, riesgo: imp * err.fraccion,
    medido: err.medido, origenDeriva: deriva.origen,
    porQue: `$${Math.round(imp * err.fraccion).toLocaleString('es-AR')} en riesgo = $${imp.toLocaleString('es-AR')} que mueve × ${err.porQue}${deriva.origen === 'SERIE_OBSERVADA' ? '' : ` · deriva PRESTADA del ${deriva.origen}, no medida en este recurso`}`,
  })
}

/**
 * A CUÁLES IR, EN QUÉ ORDEN Y DÓNDE PARAR. PURA.
 *
 * Devuelve la lista mínima que cubre `objetivo` del riesgo total medido, más la lista aparte de los
 * que NO se pudieron medir. Las dos se atienden; sólo una se puede ordenar.
 *
 * El desempate final es por código para que dos corridas con los mismos datos elijan el mismo
 * conjunto: un priorizador que devuelve conjuntos distintos con la misma entrada no se puede
 * auditar.
 */
export function priorizar(riesgos = [], { objetivo = COBERTURA_OBJETIVO, tope = null } = {}) {
  const medidos = riesgos.filter((r) => Number.isFinite(Number(r.riesgo)) && Number(r.riesgo) > 0)
    .sort((a, b) => b.riesgo - a.riesgo || String(a.codigo).localeCompare(String(b.codigo)))
  const noMedidos = riesgos.filter((r) => !Number.isFinite(Number(r.riesgo)) || Number(r.riesgo) <= 0)
  const total = medidos.reduce((a, r) => a + r.riesgo, 0)

  const elegidos = []
  let acumulado = 0
  for (const r of medidos) {
    if (total > 0 && acumulado / total >= objetivo) break
    if (tope !== null && elegidos.length >= tope) break
    elegidos.push(Object.freeze({ ...r, acumulado: total > 0 ? (acumulado + r.riesgo) / total : null }))
    acumulado += r.riesgo
  }
  const cobertura = total > 0 ? acumulado / total : null
  return Object.freeze({
    elegidos: Object.freeze(elegidos),
    // EL RANKING COMPLETO, aparte de los elegidos. `elegidos` contesta «¿a cuáles voy?» y depende
    // del objetivo; `ordenados` contesta «¿cuáles son los que más plata mueven?» y no depende de
    // nada. Son dos preguntas distintas y confundirlas hace que mover el objetivo parezca cambiar
    // el diagnóstico: sobre la oferta real, cubrir el 90% cuesta 3 consultas y cubrir el 92,7%
    // cuesta 4 — el cuarto recurso no aparece ni desaparece, cambia de lado la línea de corte.
    ordenados: Object.freeze(medidos),
    noMedidos: Object.freeze(noMedidos),
    riesgoTotal: total,
    riesgoCubierto: acumulado,
    cobertura,
    // La cola NO se dice «resuelta»: se dice cuánto vale dejarla, que es una decisión económica.
    riesgoQueQuedaAfuera: total - acumulado,
    porQue: total > 0
      ? `${elegidos.length} de ${medidos.length} recursos cubren el ${(cobertura * 100).toFixed(1)}% del riesgo medido ($${Math.round(acumulado).toLocaleString('es-AR')} de $${Math.round(total).toLocaleString('es-AR')}); los ${medidos.length - elegidos.length} restantes valen $${Math.round(total - acumulado).toLocaleString('es-AR')} juntos`
      : 'no hay riesgo medible: ningún recurso tiene a la vez impacto y error estimables',
    noMedidosPorQue: noMedidos.length
      ? `${noMedidos.length} recurso(s) con riesgo NO MEDIDO — no entran al porcentaje y se atienden igual: un riesgo que no se pudo medir no es un riesgo de cero`
      : null,
  })
}
