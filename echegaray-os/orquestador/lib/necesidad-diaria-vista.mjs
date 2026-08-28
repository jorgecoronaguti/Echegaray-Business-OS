// LA NECESIDAD DIARIA, LEÍDA EN FRÍO — el mismo reparto que el gráfico, sobre movimientos de verdad.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// El gráfico «¿Alcanza la caja?» vive de fórmulas: cada barra es un SUMPRODUCT sobre `_MOVIMIENTOS`
// que sólo se puede mirar dentro de Sheets. Cuando el dueño pidió *"que el gráfico muestre la
// información tal cual es"*, la única forma de verificar el cambio sin correr un generador contra el
// archivo real —prohibido, y ya borró trabajo tres veces— era poder aplicar el MISMO reparto a un
// puñado de movimientos y leer el resultado en pesos.
//
// NO ES UN SEGUNDO CÁLCULO DE PRODUCCIÓN. Ningún generador lo llama, no escribe nada y el reparto no
// está escrito acá: sale de `SALIDAS` en caja-anexo-series.mjs, la misma constante que arma las
// fórmulas. Lo que esto NO prueba —y hay que decirlo— es que Sheets evalúe esas fórmulas así; eso
// sólo se prueba mirando la pestaña viva, y el freno de escritura está puesto.

import { SALIDAS, repartirSalidas } from './caja-necesidad-baldes.mjs'
import { isoDeSerial } from './libro-extractores-fechas.mjs'

/** La fecha de un movimiento, en ISO, venga como serial de Sheets o como texto ya ISO. */
const iso = (f) => (typeof f === 'number' ? isoDeSerial(f) : String(f ?? '').slice(0, 10))

/**
 * NÚCLEO PURO: el bloque de necesidad diaria de una ventana, día por día.
 *
 * Cada día trae el reparto por balde, los dos totales que decide el dueño (`yaSalio` / `faltaPagar`)
 * y las dos curvas de saldo, con el MISMO criterio que las fórmulas del anexo:
 *
 *   · «si cobra»    = saldo de hoy + todo lo NO_REAL del tramo (entra y sale)
 *   · «si NO cobra» = saldo de hoy − sólo lo que FALTA PAGAR del tramo
 *
 * Ninguna de las dos toca lo `REAL`: ya está adentro del saldo del que parten. Ver `saldoSinCobrar`.
 *
 * @param {Array<object>} movs movimientos del libro (fecha serial o ISO, signo, importe, estado…)
 * @param {{desde:string, dias:number, saldo:number}} v la ventana y el saldo del que se parte
 */
export function necesidadPorDia(movs = [], { desde, dias = 30, saldo = 0 } = {}) {
  const arranque = new Date(`${desde}T00:00:00Z`)
  const porFecha = new Map()
  for (const m of movs) {
    const f = iso(m.fecha)
    if (!porFecha.has(f)) porFecha.set(f, [])
    porFecha.get(f).push(m)
  }
  const salida = []
  let acumFalta = 0
  let acumNeto = 0
  for (let i = 0; i < dias; i++) {
    const f = new Date(arranque.getTime() + i * 86400000).toISOString().slice(0, 10)
    const delDia = porFecha.get(f) ?? []
    const r = repartirSalidas(delDia)
    // El NO_REAL con signo, para la curva del plan: la cobranza esperada suma y el pago pendiente resta.
    const neto = delDia
      .filter((m) => String(m.estado ?? '').toUpperCase() !== 'REAL')
      .reduce((a, m) => a + Math.abs(Number(m.importe) || 0) * Math.sign(Number(m.signo) || 0), 0)
    acumFalta += r.faltaPagar
    acumNeto += neto
    salida.push({ fecha: f, ...r, siCobra: saldo + acumNeto, siNoCobra: saldo - acumFalta })
  }
  return salida
}

/**
 * NÚCLEO PURO: el diagnóstico de la ventana, con la cuenta VIEJA al lado de la nueva.
 *
 * La cuenta vieja restaba TODOS los egresos —también los `REAL`, que ya están descontados del saldo—,
 * así que hundía el piso por plata que nadie tiene que conseguir. Se calcula a propósito para poder
 * decir si el cambio movió el veredicto de algún día, y de cuánto: un arreglo de aritmética que nadie
 * midió es una afirmación sin evidencia.
 */
export function diagnostico(filas = [], { saldo = 0, movs = [], desde } = {}) {
  const arranque = new Date(`${desde}T00:00:00Z`)
  let acumTodo = 0
  return filas.map((d, i) => {
    const f = new Date(arranque.getTime() + i * 86400000).toISOString().slice(0, 10)
    acumTodo += movs
      .filter((m) => iso(m.fecha) === f && Number(m.signo) === -1)
      .reduce((a, m) => a + Math.abs(Number(m.importe) || 0), 0)
    const antes = saldo - acumTodo
    return { ...d, pisoAntes: antes, cambioDeVeredicto: (antes < 0) !== (d.siNoCobra < 0) }
  })
}

/** Los rótulos de los baldes, en el orden en que los apila el gráfico. Para imprimir la tabla. */
export const COLUMNAS_VISTA = SALIDAS.map((b) => ({ clave: b.clave, rotulo: b.rotulo }))
