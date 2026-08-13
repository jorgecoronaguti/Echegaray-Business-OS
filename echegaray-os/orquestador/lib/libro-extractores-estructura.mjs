// LA PROYECCIÓN DE GASTOS DE ESTRUCTURA — el cuadro ya la calculaba y ningún cash flow la leía.
//
// ═══ EL AGUJERO, MEDIDO (13/08/2026) ═══
//
// El dueño, textual: *"tenés que proyectarlo, por eso te lo marco, para que todo esté contemplado en
// los cash flows"*. Medido ese día contra el archivo vivo: la línea "Estructura" de los dos cuadros
// tenía plata hasta AGOSTO y nada de septiembre a diciembre. La causa no era falta de dato — la
// pestaña `Estructura` proyecta sub-rubro por sub-rubro desde enero (~$19,3M al año, de los cuales
// ~$3,4M de combustible) y publica esa proyección en las mismas celdas de mes donde iría el real.
// Simplemente **nadie la leía**: el Libro (`_MOVIMIENTOS`) tiene un extractor por fuente y para
// Estructura no había ninguno, así que la única plata de ese rubro que llegaba al cuadro eran las
// filas ya facturadas de Compras. Un cuadro que afirma que la empresa deja de tener gastos de
// estructura en septiembre no es un cuadro incompleto: es un cuadro falso, y sobre él se decidió una
// compra de rodados.
//
// ═══ LA REGLA DE PROYECCIÓN NO SE REESCRIBE ACÁ — SE LEE ═══
//
// `scripts/estructura-pestana.mjs` ya la implementa en fórmula: promedio de los meses CERRADOS con
// gasto, ajustado por la inflación de Parámetros, y sólo para el sub-rubro que apareció en `MIN_MESES`
// meses cerrados o más. Recalcularla en JS daría dos definiciones del mismo número —el defecto que la
// regla de realidad única prohíbe— y encima justo después de que el dueño corrigiera la del archivo.
// Este extractor LEE la celda que la pestaña ya calculó. La pestaña corre antes que el libro en el
// pipeline (`flujo-caja-pasos.mjs`), así que lo que se lee es de esta misma corrida.
//
// ═══ POR QUÉ NO PUEDE CONTAR DOS VECES ═══
//
// La celda visible de un mes es *"el real si lo hay; si no, la proyección"*. La provisión que se emite
// es `MAX(0; visible − real)`, con el real leído de la columna AUXILIAR de la propia pestaña:
//
//   · mes sin factura cargada → visible = proyección, real = 0 → se emite la proyección entera;
//   · mes con factura cargada → visible = real            → se emite $0, y la plata entra al libro
//     por la fila real de Compras, que es su camino propio.
//
// La provisión se consume sola a medida que las facturas llegan, igual que la de recurrentes.
//
// ═══ LO QUE QUEDA AFUERA, DECLARADO ═══
//
// · EL SUB-RUBRO DEL MES EN CURSO QUE YA TIENE UNA FACTURA. Su celda visible muestra el real, así que
//   la provisión da $0 y el RESTO de ese mes queda sin proyectar. Se SUBESTIMA a propósito: la
//   alternativa es recalcular la proyección pura acá, que es la segunda definición que este archivo
//   existe para no crear. Los sub-rubros del mes en curso que todavía NO facturaron sí entran — es
//   plata que va a salir este mes y dejarla afuera fue parte del agujero.
// · "Equipos y rodados (inversión)". Es el único sub-rubro que NO se proyecta, y no por ser chico:
//   comprar una camioneta es una DECISIÓN discrecional, no una necesidad de caja que se repite sola.
//   Proyectarla como promedio mensual inflaría el egreso estructural y —lo que importa hoy— metería
//   una compra de rodados dentro del mismo flujo con el que se decide si comprar rodados. El monto
//   excluido se informa en cada corrida para que la exclusión sea visible, no silenciosa.

import { movimiento, SALE } from './libro-movimientos.mjs'
import { columnasDeCompras } from './libro-extractores-compras.mjs'
import { fechaDeSerial, serialDe, finDeMes } from './libro-extractores-fechas.mjs'
import { SUBRUBROS, OTROS } from './sub-rubro-estructura.mjs'

/** El rubro con el que entra al libro. Es EL MISMO que emite Compras: cae en la línea que ya existe. */
export const RUBRO_ESTRUCTURA = 'Estructura'

/** La pestaña de la que se lee. Es también el `origen.pestana` de los movimientos. */
export const PESTANA_ESTRUCTURA = 'Estructura'

/** El rótulo de la celda A de la fila de encabezado del cuadro. Es el ancla de toda la geometría. */
export const ANCLA_ENCABEZADO = 'Rubro'

/** El rótulo de la primera columna del bloque auxiliar (el real de cada mes). Ancla del segundo eje. */
export const ANCLA_AUXILIAR = 'AUXILIAR — el real de cada mes'

/** El sub-rubro que NO se proyecta. Ver el bloque "lo que queda afuera" de arriba. */
export const SUB_NO_PROYECTABLE = 'Equipos y rodados (inversión)'

/** Los rótulos de fila que este extractor reconoce: los sub-rubros declarados, más "Otros". */
export const RUBROS_DEL_CUADRO = Object.freeze([...SUBRUBROS.map(([n]) => n), OTROS])

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const r2 = (v) => Math.round(v * 100) / 100

/**
 * NÚCLEO PURO: dónde está cada cosa en la pestaña, resuelto POR RÓTULO.
 *
 * Ni una fila ni una columna fija: el layout de `estructura-pestana.mjs` ya se movió una vez (el
 * cuadro arrancaba arriba de todo y hoy tiene título, subtítulo y título de sección encima) y dejó un
 * rango con nombre apuntando a una fila en blanco durante semanas. Un índice guardado acá haría lo
 * mismo, en silencio y con números plausibles.
 *
 * @param {Array<Array>} filas la pestaña leída con UNFORMATTED_VALUE
 * @returns {{filaCab:number, colMes0:number, colAux0:number, filas:Array<{rotulo:string, i:number}>}|null}
 *   índices 0-based; `null` si no se reconoce el cuadro (falla cerrado: no se proyecta nada)
 */
export function ubicarCuadro(filas = []) {
  const filaCab = (filas ?? []).findIndex((f) => txt(f?.[0]) === ANCLA_ENCABEZADO)
  if (filaCab < 0) return null
  const cab = filas[filaCab] ?? []
  // Los doce meses son las doce primeras celdas NUMÉRICAS del encabezado: son los primeros de mes,
  // que la API devuelve como serial. El rótulo de un mes no es un texto que se pueda buscar.
  const colMes0 = cab.findIndex((c, i) => i > 0 && num(c) !== null)
  if (colMes0 < 0) return null
  for (let m = 0; m < 12; m++) if (num(cab[colMes0 + m]) === null) return null
  const colAux0 = cab.findIndex((c) => txt(c).startsWith(ANCLA_AUXILIAR))
  if (colAux0 < 0) return null

  const conocidos = new Set(RUBROS_DEL_CUADRO)
  const filasRubro = []
  for (let i = filaCab + 1; i < filas.length; i++) {
    const rot = txt(filas[i]?.[0])
    if (!rot) continue
    if (!conocidos.has(rot)) break // se terminó el cuadro (TOTAL ESTRUCTURA, controles, etc.)
    filasRubro.push({ rotulo: rot, i })
  }
  return filasRubro.length ? { filaCab, colMes0, colAux0, filas: filasRubro } : null
}

/**
 * NÚCLEO PURO: el día del mes en que suele salir la plata de estructura, medido sobre Compras.
 *
 * No se inventa un "día 15" de convención: se usa la MEDIANA del día de la fecha de caja de las filas
 * reales del rubro. La mediana y no el promedio por la misma razón que en recurrentes: un mes con dos
 * facturas en los extremos no corre la fecha típica. Sin filas del rubro devuelve `null` y el llamador
 * decide (hoy: no proyectar, porque un día inventado ubica plata en una semana donde no está).
 *
 * @param {Array<Array>} compras Compras entera, UNFORMATTED_VALUE
 * @returns {number|null} 1..28
 */
export function diaTipicoDeEstructura(compras = []) {
  const c = columnasDeCompras(compras)
  const dias = []
  for (let i = 3; i < compras.length; i++) {
    const f = compras[i] ?? []
    if (txt(f[c.rubro]) !== RUBRO_ESTRUCTURA) continue
    const fecha = num(f[c.fechaCaja])
    if (fecha === null) continue
    dias.push(fechaDeSerial(fecha).getUTCDate())
  }
  if (!dias.length) return null
  dias.sort((a, b) => a - b)
  const m = Math.floor(dias.length / 2)
  const med = dias.length % 2 ? dias[m] : Math.round((dias[m - 1] + dias[m]) / 2)
  return Math.min(Math.max(med, 1), 28)
}

/**
 * LA PROYECCIÓN DE ESTRUCTURA → movimientos PROYECTADOS, un sub-rubro por mes, desde el mes EN CURSO.
 *
 * El mes en curso entra por la misma razón que en recurrentes: el sub-rubro que todavía no facturó
 * este mes tiene una salida pendiente, y su celda visible ya la muestra (real = 0 ⇒ visible =
 * proyección). El que SÍ facturó da provisión $0 y no emite nada. Una fecha típica que ya pasó se
 * corre a mañana: una provisión con fecha vencida diría VENCIDO de algo que quizá ni facturaron.
 *
 * @param {Array<Array>} filas la pestaña Estructura, UNFORMATTED_VALUE
 * @param {number} hoy serial de Sheets del día de la corrida
 * @param {{diaTipico?:number|null, aviso?:(m:string)=>void}} opciones
 * @returns {{movimientos:Array, resumen:{subrubros:number, meses:number, total:number, excluido:number}}}
 */
export function deEstructura(filas = [], hoy = 0, { diaTipico = null, aviso = () => {} } = {}) {
  const vacio = { movimientos: [], resumen: { subrubros: 0, meses: 0, total: 0, excluido: 0 } }
  const g = ubicarCuadro(filas)
  if (!g) {
    aviso(`estructura: no reconocí el cuadro de la pestaña "${PESTANA_ESTRUCTURA}" (busco "${ANCLA_ENCABEZADO}" `
      + `en la columna A y "${ANCLA_AUXILIAR}…" en el encabezado). NO proyecto: la línea Estructura queda `
      + 'con lo que aporte Compras y el control de cobertura lo va a gritar.')
    return vacio
  }
  if (!Number.isFinite(diaTipico) || diaTipico < 1) {
    aviso('estructura: no pude medir el día típico de pago sobre Compras — sin él, la plata caería en una '
      + 'semana inventada. NO proyecto.')
    return vacio
  }

  const d = fechaDeSerial(hoy)
  const anioHoy = d.getUTCFullYear()
  const mesActual = d.getUTCMonth() + 1
  const cab = filas[g.filaCab] ?? []
  const movimientos = []
  const conAlgo = new Set()
  let total = 0
  let excluido = 0

  for (const { rotulo, i } of g.filas) {
    const fila = filas[i] ?? []
    for (let m = 0; m < 12; m++) {
      const cabSerial = num(cab[g.colMes0 + m])
      if (cabSerial === null) continue
      const fd = fechaDeSerial(cabSerial)
      const anio = fd.getUTCFullYear()
      const mes = fd.getUTCMonth() + 1
      // Del mes en curso para adelante. Un mes de otro año no se toca: el cuadro es del año en curso.
      if (anio !== anioHoy || mes < mesActual) continue

      const visible = num(fila[g.colMes0 + m])
      const real = num(fila[g.colAux0 + m]) ?? 0
      if (visible === null) {
        // Una celda que no es número es un #REF!/#VALUE! de la pestaña: se declara, no se asume $0.
        if (txt(fila[g.colMes0 + m])) {
          aviso(`estructura: "${rotulo}" mes ${mes} rinde ${JSON.stringify(fila[g.colMes0 + m])} y no un número — `
            + 'ese mes queda SIN proyectar (la pestaña tiene un error que hay que mirar).')
        }
        continue
      }
      const provision = r2(Math.max(0, visible - real))
      if (provision <= 0) continue
      if (rotulo === SUB_NO_PROYECTABLE) { excluido = r2(excluido + provision); continue }

      const tope = finDeMes(anio, mes)
      let fecha = Math.min(serialDe(anio, mes, diaTipico), tope)
      // El día típico del mes en curso puede haber pasado: se corre a mañana, nunca más allá del mes.
      if (mes === mesActual && fecha <= hoy) fecha = Math.min(hoy + 1, tope)
      movimientos.push(movimiento({
        fecha,
        importe: provision,
        signo: SALE,
        concepto: `Estructura esperada · ${rotulo}`,
        contraparte: '',
        rubro: RUBRO_ESTRUCTURA,
        estado: 'PROYECTADO',
        instrumento: '',
        obra: '',
        cliente: '',
        // El sub-rubro Y el mes van en la fila: los doce meses de un sub-rubro viven en la MISMA fila
        // física de la pestaña y, sin el mes, la clave de deduplicación los colapsaría en uno solo.
        origen: { pestana: PESTANA_ESTRUCTURA, fila: `${rotulo}·${String(mes).padStart(2, '0')}` },
      }))
      conAlgo.add(rotulo)
      total = r2(total + provision)
    }
  }
  return {
    movimientos,
    resumen: { subrubros: conAlgo.size, meses: movimientos.length, total, excluido },
  }
}
