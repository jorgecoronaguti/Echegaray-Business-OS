// LA ASIMETRÍA DE LA PROYECCIÓN — el cuadro proyecta la cuadrilla y no proyecta la obra.
//
// ═══ EL DEFECTO, MEDIDO SOBRE EL ARCHIVO REAL (28/08/2026) ═══
//
// El Cash Flow Mensual proyecta noviembre con $48.386.493 de nómina (jornales 22.049.666 + sueldos
// 13.339.127 + cargas 10.510.564 + gremiales 2.487.136) y **materiales $0**. Diciembre, con
// $57.734.312 de nómina y **materiales $0**. En el mismo cuadro, la referencia real de enero a agosto
// es $248.173.492 de materiales contra $113.561.006 de jornales de obra: **2,19 pesos de material por
// peso de jornal**. Un mes con veintidós millones de jornales y cero de materiales no es un mes malo:
// es un mes que no existe. Prueba que no hay obra cargada y que lo único que corre es la nómina por
// calendario.
//
// ═══ POR QUÉ PASA, Y POR QUÉ NO ES UN BUG DE COBRANZAS ═══
//
// Los ingresos proyectados del cuadro salen ÚNICAMENTE de la pestaña Cobranzas, que es un libro de
// cuentas por cobrar: sólo tiene lo ya vendido y facturado. No hay una fila de venta futura no
// contratada, y NO DEBE HABERLA — Cobranzas no es un pipeline comercial y meterle una venta hipotética
// contaminaría la cobranza real. Los egresos, en cambio, se proyectan por calendario (la nómina corre
// aunque no haya obra) y están completos. El resultado no es un error de carga: es una asimetría
// estructural entre las dos puntas, y el cuadro la publica sin decir que la tiene.
//
// ═══ QUÉ DECIDE ESTE CONTROL, Y POR QUÉ ESOS DOS CRITERIOS ═══
//
// (1) OBRA SIN MATERIAL — un mes enteramente proyectado con jornales de obra > 0 y materiales de obra
//     = 0. Es materialmente imposible: no existe una cuadrilla que trabaje un mes entero sin consumir
//     un peso de material. El criterio no mide "poco material": mide CERO, que es la firma de un rubro
//     que nadie proyectó, no de un mes flaco. Un umbral difuso ("menos del 30% de lo habitual")
//     dependería de la mezcla de obras del mes y sería discutible; el cero no lo es.
//
// (2) EL COBRO NO CUBRE LA NÓMINA — un mes enteramente proyectado cuyos ingresos proyectados son menores
//     que su nómina proyectada. La nómina es el compromiso más rígido de una constructora: se paga
//     quincena a quincena, no se posterga y no depende de que el cliente firme. Un mes donde lo YA
//     CONTRATADO por cobrar no alcanza ni para la nómina está diciendo una de dos cosas —o la empresa
//     va a consumir caja, o falta venta por cargar—, y en los dos casos el número publicado es un PISO,
//     no un pronóstico. El umbral por defecto es 1,0 (cobertura exacta de la nómina) porque es el único
//     que no hay que justificar con una opinión; queda parametrizable para quien quiera ser más severo.
//
// LO QUE ESTE CONTROL NO PUEDE DECIR. No sabe si falta venta o si de verdad no hay obra vendida para
// noviembre: las dos cosas se dibujan igual. Reporta la asimetría y su magnitud; la lectura la hace
// quien conoce el pipeline comercial, que no está en este archivo ni en ningún Sheet del OS.
//
// EL RATIO MATERIAL/JORNAL NO ESTÁ ESCRITO ACÁ. Se calcula de los meses REALES del propio cuadro que
// se está auditando. Pegar el 2,19 medido en agosto lo dejaría congelado: dentro de seis meses el
// control estaría estimando con la mezcla de obras del año pasado y nadie se enteraría.
//
// NÚCLEO PURO: no lee el Sheet, no toca la red. Quien lee es scripts/asimetria-cash-flow.mjs.

import { RUBROS_EGRESO } from './cash-flow-rubros.mjs'

/** El prefijo con el que el libro nombra a todo lo que es nómina. Un rubro nuevo entra solo. */
const PREFIJO_NOMINA = 'Nómina · '

/** Los rubros de nómina, derivados de la lista del libro y no tipeados otra vez. */
export const RUBROS_NOMINA = Object.freeze(RUBROS_EGRESO.filter((r) => r.startsWith(PREFIJO_NOMINA)))

/** El rubro de la mano de obra que va a la obra. Sueldos de administración NO son jornales. */
export const RUBRO_JORNALES = 'Nómina · Jornales de obra'

/**
 * LOS RUBROS QUE CUENTAN COMO "MATERIAL DE OBRA".
 *
 * `Materiales Civil` es la factura ya cargada; `Materiales de obra proyectados` es la explosión de
 * costos de las obras en curso, que es justamente lo que un mes proyectado debería tener. Los dos
 * cuentan porque los dos son plata que sale para construir. "Materiales Mantenimiento" NO cuenta: es
 * el mantenimiento de la estructura, corre con o sin obra, y contarlo taparía el cero que se busca.
 */
export const RUBROS_MATERIAL_OBRA = Object.freeze(['Materiales Civil', 'Materiales de obra proyectados'])

const suma = (por = {}, rubros) => rubros.reduce((s, r) => s + Number(por[r] || 0), 0)
const total = (por = {}) => Object.values(por).reduce((s, v) => s + Number(v || 0), 0)

/**
 * NÚCLEO PURO: el ratio material/jornal observado en los meses REALES del cuadro.
 *
 * Es una relación medida, no un supuesto — y se declara con sus dos términos y cuántos meses la
 * sostienen, para que quien la lea pueda decidir si le cree. Sin jornales reales no hay ratio:
 * devuelve null antes que dividir por cero y publicar un infinito con cara de dato.
 *
 * @param {Array<object>} meses
 * @returns {{valor:number, materiales:number, jornales:number, meses:number}|null}
 */
export function ratioMaterialPorJornal(meses = []) {
  let materiales = 0, jornales = 0, n = 0
  for (const m of meses) {
    const j = suma(m.egresoRealPorRubro, [RUBRO_JORNALES])
    if (j <= 0) continue
    jornales += j
    materiales += suma(m.egresoRealPorRubro, RUBROS_MATERIAL_OBRA)
    n += 1
  }
  if (jornales <= 0) return null
  return { valor: materiales / jornales, materiales, jornales, meses: n }
}

/**
 * ¿ES UN MES ENTERAMENTE PROYECTADO? PURA.
 *
 * Se decide con las cifras del propio cuadro y no con la fecha de hoy: un mes con egresos proyectados
 * y NADA real es un mes que todavía no ocurrió. Usar `hoy` obligaría a que el control y el cuadro
 * compartan reloj, y el mes EN CURSO —que tiene las dos cosas— quedaría del lado equivocado: su
 * material del mes ya está cargado en la parte real y el cero de la proyección no significa nada.
 */
export const esMesProyectado = (m = {}) =>
  total(m.egresoProyectadoPorRubro) > 0 && total(m.egresoRealPorRubro) === 0

/**
 * NÚCLEO PURO: los meses donde el cuadro proyecta la cuadrilla y no proyecta ni la obra ni el cobro.
 *
 * Devuelve los meses afectados CON SU MAGNITUD, no un booleano: "hay asimetría" no le sirve a nadie
 * para decidir; "en noviembre faltan $48,3M de material estimado y el cobro cubre el 51% de la
 * nómina" sí.
 *
 * @param {Array<{mes:string, egresoRealPorRubro?:object, egresoProyectadoPorRubro?:object,
 *                ingresoProyectado?:number}>} meses el cuadro entero, en orden
 * @param {{coberturaMinima?:number}} [opciones] fracción de la nómina que el cobro proyectado tiene
 *   que cubrir para no ser reportado. 1 = "el cobro contratado alcanza justo para pagar los sueldos".
 * @returns {{ok:boolean, ratio:object|null, hallazgos:Array<object>, meses:Array<object>,
 *            total:{materialFaltante:number|null, cobroFaltante:number}}}
 */
export function asimetriaDeLaProyeccion(meses = [], { coberturaMinima = 1 } = {}) {
  const ratio = ratioMaterialPorJornal(meses)
  const hallazgos = []
  const detalle = []

  for (const m of meses) {
    const proyectado = esMesProyectado(m)
    const jornales = suma(m.egresoProyectadoPorRubro, [RUBRO_JORNALES])
    const materiales = suma(m.egresoProyectadoPorRubro, RUBROS_MATERIAL_OBRA)
    const nomina = suma(m.egresoProyectadoPorRubro, RUBROS_NOMINA)
    const ingreso = Number(m.ingresoProyectado || 0)
    // Una nómina de cero no tiene cobertura: dividir daría Infinity y el mes entraría al informe por
    // una división, no por un problema.
    const cobertura = nomina > 0 ? ingreso / nomina : null
    const fila = { mes: m.mes, proyectado, jornales, materiales, nomina, ingreso, cobertura, hallazgos: [] }

    if (proyectado && jornales > 0 && materiales === 0) {
      const h = {
        tipo: 'obra-sin-material',
        mes: m.mes,
        jornales,
        // ESTIMACIÓN declarada, no un hecho: es el ratio observado aplicado a los jornales del mes.
        // Sin ratio no se estima nada — un faltante inventado sería peor que no informarlo.
        materialEstimado: ratio ? Math.round(jornales * ratio.valor) : null,
        ratio: ratio ? ratio.valor : null,
      }
      hallazgos.push(h)
      fila.hallazgos.push(h.tipo)
    }
    if (proyectado && nomina > 0 && ingreso < nomina * coberturaMinima) {
      const h = {
        tipo: 'cobro-no-cubre-nomina',
        mes: m.mes,
        nomina,
        ingreso,
        cobertura,
        faltante: Math.round(nomina * coberturaMinima - ingreso),
      }
      hallazgos.push(h)
      fila.hallazgos.push(h.tipo)
    }
    detalle.push(fila)
  }

  const deTipo = (t) => hallazgos.filter((h) => h.tipo === t)
  const conMaterial = deTipo('obra-sin-material').filter((h) => h.materialEstimado !== null)
  return {
    ok: hallazgos.length === 0,
    ratio,
    hallazgos,
    meses: detalle,
    total: {
      // null y 0 no son lo mismo: null es "no se pudo estimar", 0 es "no falta nada".
      materialFaltante: conMaterial.length ? conMaterial.reduce((s, h) => s + h.materialEstimado, 0) : null,
      cobroFaltante: deTipo('cobro-no-cubre-nomina').reduce((s, h) => s + h.faltante, 0),
    },
  }
}

/**
 * NÚCLEO PURO: la entrada del control, armada desde el rectángulo YA LEÍDO de la pestaña.
 *
 * LA FILA SE CALCULA Y EL RÓTULO SE VERIFICA — el mismo criterio que `cash-flow-cuadre.mjs`, y por la
 * misma razón: anclar sólo en la posición ya rompió controles de este archivo en silencio (la cabecera
 * pasó de la fila 3 a la 7 y un auditor siguió leyendo A3:N9 sin dar un error). Si un rótulo no
 * coincide, el rubro NO se toma como cero: se devuelve como problema. Un cero silencioso en el rubro
 * de materiales es exactamente el hallazgo que este control busca — leerlo por error sería fabricarlo.
 *
 * @param {any[][]} valores rectángulo A1:<total> leído con UNFORMATTED_VALUE
 * @param {object} meta el `meta` de `grillaMeses` — el mismo código que escribió la pestaña
 * @returns {{meses:Array<object>, problemas:string[]}}
 */
export function mesesDesdeLaPestana(valores = [], meta) {
  const problemas = []
  const bloque = (clave) => meta.bloques.find((b) => b.clave === clave)
  const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const leer = (fila, col) => numero((valores[fila - 1] || [])[col])

  // EL RÓTULO SE VERIFICA UNA VEZ POR FILA, NO UNA POR COLUMNA. Un rótulo corrido es un problema de
  // la fila entera: reportarlo doce veces convierte un aviso en un muro y esconde el resto.
  const filasBuenas = (b) => b.rubros.filter((r) => {
    const rotulo = String((valores[r.fila - 1] || [])[0] ?? '').trim()
    if (rotulo === `· ${r.rubro}`) return true
    problemas.push(`fila ${r.fila}: dice "${rotulo || '(vacío)'}" y el generador escribió "· ${r.rubro}"`)
    return false
  })

  const rubros = {
    egresoReal: filasBuenas(bloque('egresoReal')),
    egresoProyectado: filasBuenas(bloque('egresoProyectado')),
  }
  const porRubro = (clave, col) => {
    const out = {}
    for (const r of rubros[clave]) {
      const v = leer(r.fila, col)
      if (v === null) { problemas.push(`fila ${r.fila} col ${col + 1} (${r.rubro}): no es un número`); continue }
      out[r.rubro] = v
    }
    return out
  }

  const meses = []
  for (let j = 0; j < meta.cab.n; j++) {
    const col = meta.cab.col0 + j
    meses.push({
      mes: meta.rotulos[j],
      egresoRealPorRubro: porRubro('egresoReal', col),
      egresoProyectadoPorRubro: porRubro('egresoProyectado', col),
      ingresoProyectado: leer(bloque('ingresoProyectado').subtotal, col) ?? 0,
    })
  }
  return { meses, problemas }
}
