// EL BLOQUE 6 DE «JORNALES POR QUINCENA»: QUÉ CUESTA DESVINCULAR A CADA UNO.
//
// Dos cuadros y una sola idea: en la construcción **el costo del despido ya se fue pagando mes a
// mes**. Lo que sale de la caja el día del cese son cuatro líneas chicas —jornales devengados,
// vacaciones y SAC proporcionales, y el aporte al Fondo de Cese que todavía no se depositó—; el
// fondo acumulado es plata del trabajador que se le entrega con la libreta y NO es un desembolso
// nuevo. Por eso las dos columnas están separadas y nunca se suman.
//
// El detalle de cada artículo vive en `desvinculacion-22250.mjs`, con la cita del texto legal. Acá
// sólo se decide qué se dibuja y en qué columna.
//
// ═══ POR QUÉ VALORES Y NO FÓRMULAS ═══
//
// El resto de la pestaña cita al espejo por referencia y se corrige solo. Acá no se puede: los tramos
// de vacaciones por antigüedad (art. 150 LCT), la proporción del semestre del SAC y el corte del 12%
// al 8% del art. 15 son ramas, no aritmética, y en es-AR salen ilegibles y frágiles. El bloque se
// recalcula entero en cada corrida del generador —que es lo mismo que estar vivo— y su fecha de corte
// se declara en la fila de total.

import { seccion, sub, total as rotuloTotal } from './patron-pestana.mjs'
import { ALERTA } from './glifos.mjs'
// El centinela: «es mi celda y va vacía». Una cadena vacía significa lo contrario —«preservá lo que
// haya»— y en una fila de total dejaría vivo el residuo del layout anterior.
import { VACIO } from './preservar-anotaciones.mjs'
import {
  liquidacionFinal, totalizar, alicuotaFcl, FCL_PRIMER_ANIO, FCL_DESDE_UN_ANIO,
} from './desvinculacion-22250.mjs'
import {
  mejorMesDelSemestre, remuneracionDelMes, fclDevengadoDelAnio, periodoDe,
} from './desvinculacion-plantel.mjs'

const SIN_DATO = '—'
/** La columna «Concepto» de la pestaña Compras. El contrato A→AN vive en comprobantes/contrato-columnas. */
export const COL_CONCEPTO_COMPRAS = 'L'

const fecha = (d) => (d instanceof Date
  ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  : SIN_DATO)

const antigTexto = (a) => (a ? `${a.anios}a ${a.meses}m` : SIN_DATO)

/**
 * NÚCLEO PURO: el token con el que se busca a la persona en Compras.
 * El más largo del nombre y, a igualdad, el último — que en esta planilla es casi siempre el apellido.
 */
export function tokenDeBusqueda(nombre = '') {
  const ts = String(nombre).split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/).filter((t) => t.length > 1)
  if (!ts.length) return ''
  return ts.reduce((mejor, t) => (t.length >= mejor.length ? t : mejor), ts[0])
}

/**
 * NÚCLEO PURO: ¿hay en Compras algún pago que nombre a esta persona?
 *
 * Fórmula VIVA y no una foto: el día que se cargue la liquidación, la celda cambia sola. Dice "lo
 * nombra", no "está pagada" — un COUNTIF no puede afirmar lo segundo, y afirmarlo sería exactamente
 * el control que se valida contra sí mismo.
 */
export function formulaRastroDePago(nombre, { hoja = 'Compras', col = COL_CONCEPTO_COMPRAS } = {}) {
  const t = tokenDeBusqueda(nombre)
  if (!t) return SIN_DATO
  return `=IF(COUNTIF(${hoja}!$${col}:$${col};"*${t}*")>0;"✓ Compras lo nombra";"${ALERTA} sin rastro en Compras")`
}

/**
 * NÚCLEO PURO: la liquidación de una persona del plantel, con la escala del convenio ya resuelta.
 *
 * @param {object} p una entrada de `plantelDelEspejo`
 * @param {Date} cese
 * @param {(codigo:string)=>{categoria:string, basico:number}|null} basicoDe
 */
export function liquidarPersona(p, cese, basicoDe) {
  const conv = basicoDe(p.categoria)
  const basico = conv?.basico ?? 0
  const mes = periodoDe(cese)
  const horasMes = p.horasPorMes.get(mes) ?? 0
  const mejor = mejorMesDelSemestre(p.horasPorMes, basico, cese)
  const l = liquidacionFinal({
    nombre: p.nombre,
    ingreso: p.ingreso,
    cese,
    categoria: conv?.categoria ?? null,
    basicoHora: basico,
    horasDevengadasPendientes: horasMes,
    // Art. 17: el aporte del lapso cuyo plazo de depósito no venció. Con el plazo del art. 16 —los
    // primeros 15 días del mes siguiente— eso es el mes del cese.
    remuneracionNoDepositada: remuneracionDelMes(horasMes, basico),
    mejorRemuneracionMensual: mejor.importe,
    fclDevengadoAcumulado: basico
      ? fclDevengadoDelAnio({ horasPorMes: p.horasPorMes, basicoHora: basico, ingreso: p.ingreso, alicuotaDe: alicuotaFcl })
      : null,
  })
  return {
    ...l,
    codigo: p.categoria,
    horasMes,
    valuable: basico > 0 && !!p.ingreso,
    reingreso: p.reingreso,
    // El costo de ECHAR es lo que se paga POR echar. Los jornales devengados se deben igual: van
    // aparte, y el total de desembolso los suma. Mezclarlos hace que el despido parezca más caro de
    // lo que es y esconde la pregunta que el dueño está haciendo.
    costoDesvincular: l.vacaciones + l.sac + l.sacSobreVacaciones + l.fclPagoDirecto,
  }
}

const num = (l, v) => (l.valuable ? v : SIN_DATO)

/** NÚCLEO PURO: la fila de una persona en 6.1 (activos). Trece celdas, A→M. */
export function filaActivo(l) {
  return [
    l.nombre,
    fecha(l.ingreso),
    antigTexto(l.antiguedad),
    l.codigo || SIN_DATO,
    num(l, l.basicoHora),
    num(l, `${l.horasMes} h`),
    num(l, l.haberes),
    num(l, l.vacaciones),
    num(l, l.sac + l.sacSobreVacaciones),
    num(l, l.fclPagoDirecto),
    num(l, l.costoDesvincular),
    num(l, l.desembolso),
    num(l, l.fclDevengadoAcumulado ?? 0),
  ]
}

/** NÚCLEO PURO: la fila de una persona en 6.2 (desafectados). Doce celdas, A→L. */
export function filaDesafectado(l, opciones) {
  return [
    l.nombre,
    fecha(l.ingreso),
    fecha(l.cese),
    antigTexto(l.antiguedad),
    l.codigo || SIN_DATO,
    num(l, l.basicoHora),
    num(l, l.vacaciones),
    num(l, l.sac + l.sacSobreVacaciones),
    num(l, l.fclPagoDirecto),
    num(l, l.costoDesvincular),
    num(l, l.fclDevengadoAcumulado ?? 0),
    formulaRastroDePago(l.nombre, opciones),
  ]
}

const ordenar = (ls) => [...ls].sort((a, b) => (b.desembolso || 0) - (a.desembolso || 0))

/**
 * NÚCLEO PURO: EL BLOQUE ENTERO.
 *
 * @param {{activos:Array, desafectados:Array, hoy:Date,
 *          basicoDe:(c:string)=>{categoria:string, basico:number}|null,
 *          compras?:{hoja:string, col:string}}} d
 * @returns {{filas:any[][], activos:Array, desafectados:Array, sinValuar:number}}
 */
export function bloqueDesvinculacion({ activos = [], desafectados = [], hoy = new Date(), basicoDe, compras }) {
  const la = ordenar(activos.map((p) => liquidarPersona(p, hoy, basicoDe)))
  // El cese de quien ya no está es el último día que la planilla le cargó horas: es el único hecho
  // que la planilla registra. La fecha de baja formal vive en el legajo, no acá.
  const ld = desafectados
    .filter((p) => p.ultimoDia)
    .map((p) => liquidarPersona(p, p.ultimoDia, basicoDe))
    .sort((a, b) => a.cese - b.cese)
  const ta = totalizar(la.filter((l) => l.valuable))
  const td = totalizar(ld.filter((l) => l.valuable))
  const costoA = la.filter((l) => l.valuable).reduce((s, l) => s + l.costoDesvincular, 0)
  const costoD = ld.filter((l) => l.valuable).reduce((s, l) => s + l.costoDesvincular, 0)
  const sinValuar = [...la, ...ld].filter((l) => !l.valuable)

  const filas = []
  filas.push([seccion(6, 'Costo de desvincular — Ley 22.250')])
  // Las tres líneas que cambian la lectura del cuadro entero. Sin la primera, alguien va a buscar la
  // indemnización del art. 245 y va a creer que falta.
  filas.push([sub('Sin indemnización por antigüedad ni preaviso — art. 15')])
  filas.push([sub('El Fondo de Cese ya depositado NO sale de la caja')])
  filas.push([sub(`Valuado al convenio · aporte ${FCL_PRIMER_ANIO * 100}% / ${FCL_DESDE_UN_ANIO * 100}%`)])

  filas.push([seccion('6.1', 'Plantel activo — qué sale de la caja')])
  filas.push(['Persona', 'Ingreso', 'Antigüedad', 'Cat.', 'Jornal conv.', 'Hs del mes',
    'Jornales del mes', 'Vacaciones prop.', 'SAC prop.', 'FCL directo', 'Costo de desvincular',
    'Total a desembolsar', 'FCL devengado 2026'])
  for (const l of la) filas.push(filaActivo(l))
  filas.push([rotuloTotal(`Si se fueran los ${la.length} — al ${fecha(hoy)}`), ...Array(5).fill(VACIO),
    ta.haberes, ta.vacaciones, ta.sac + ta.sacSobreVacaciones, ta.fclPagoDirecto, costoA,
    ta.desembolso, ta.fclDevengadoAcumulado])

  filas.push([seccion('6.2', 'Desafectados del año — la liquidación final')])
  filas.push(['Persona', 'Ingreso', 'Egreso', 'Antigüedad', 'Cat.', 'Jornal conv.',
    'Vacaciones prop.', 'SAC prop.', 'FCL directo', 'Costo de desvincular', 'FCL devengado 2026',
    'Rastro del pago'])
  for (const l of ld) filas.push(filaDesafectado(l, compras))
  filas.push([rotuloTotal(`Los ${ld.length} que ya se fueron`), ...Array(5).fill(VACIO),
    td.vacaciones, td.sac + td.sacSobreVacaciones, td.fclPagoDirecto, costoD, td.fclDevengadoAcumulado])

  filas.push([sub('Lo depositado por persona: ninguna fuente lo declara')])
  if (sinValuar.length) {
    filas.push([sub(`${ALERTA} ${sinValuar.length} sin categoría del convenio — no se valúan`)])
  }
  return { filas, activos: la, desafectados: ld, sinValuar: sinValuar.length, totales: { ta, td, costoA, costoD } }
}
