// DE QUÉ LADO DEL CUADRO CAE CADA COBRO — y quién está del lado equivocado cuando no cierra.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (15/08/2026) ═══
//
// El cuadre reconstruía la línea "· Cobranzas" del cuadro sumando LAS DOS que existen —la que cuelga
// de "Ingresos reales" y la que cuelga de "Ingresos proyectados"— en UN SOLO acumulador por mes, y lo
// comparaba contra el total de Cobranzas del mes (cobrado + pendiente, sin distinguir).
//
// Con esa cuenta, una fila que se mueve de REAL a PROYECTADO no cambia el total: sale de un sumando y
// entra en el otro. El control decía "✓ los 12 meses cierran" con una fila del lado equivocado, y ese
// ✓ es el que sostuvo durante semanas la sensación de que el Cash Flow estaba al día. MEDIDO: la fila
// 44 de Cobranzas ($8.234.758, LA ESTRELLA) tardó media hora de búsqueda a mano en aparecer, con el
// control en verde todo el tiempo.
//
// Un cuadre que suma antes de comparar mide la SUMA, no el REPARTO. Y el reparto es justamente lo que
// distingue el criterio percibido del devengado: de qué lado está la plata es la pregunta entera.
//
// NÚCLEO PURO. No lee Google, no escribe: recibe cobros ya normalizados y devuelve veredictos.

import { CONCEPTOS } from './cash-flow-matriz.mjs'
import { MEDIDAS, esMedidaReal } from './cash-flow-medidas.mjs'

/** Los dos lados, en el orden en que se leen en el cuadro. */
export const LADOS = Object.freeze(['real', 'proyectado'])

/** Un acumulador vacío por lado. */
export const parLados = () => ({ real: 0, proyectado: 0 })
/** La suma de los dos lados — el número que miraba el cuadre viejo. */
export const totalDeLados = (par) => par.real + par.proyectado

const rotuloDe = (clave) => CONCEPTOS.find((c) => c.clave === clave)?.rotulo

/**
 * RÓTULO DEL CONCEPTO → LADO, derivado de las MEDIDAS y no transcripto.
 *
 * `esMedidaReal` ya define qué es "real" a partir de sus estados (`ESTADOS_REALES`). Escribir acá una
 * segunda lista sería tener dos definiciones de lo mismo: el día que VENCIDO se mude de línea, esta
 * copia seguiría diciendo lo de antes y el cuadre mediría su propia desactualización.
 */
export const LADO_POR_ROTULO = Object.freeze(new Map(
  MEDIDAS.filter((m) => m.signo === 1).map((m) => [rotuloDe(m.clave), esMedidaReal(m) ? 'real' : 'proyectado']),
))

/** Los rótulos de las dos líneas de ingreso, en el orden de la matriz. */
export const ROTULOS_INGRESO = Object.freeze([...LADO_POR_ROTULO.keys()])

/**
 * NÚCLEO PURO: de qué lado del cuadro cae un cobro, según Cobranzas.
 *
 * ═══ POR QUÉ EL LADO REAL ES EXACTAMENTE "Cobrado", SIN CORTE DE FECHA ═══
 *
 * El libro (`deCobranzas`) emite `cobrado ? 'REAL' : 'PROYECTADO'` y después pasa el estado por
 * `estadoContraCorte`, que sólo puede degradar PROYECTADO → VENCIDO. Y VENCIDO vive en
 * `ESTADOS_PENDIENTES`, o sea en la MISMA línea que el proyectado. Entonces el lado real del cuadro
 * es, exactamente, el conjunto de filas con estado "Cobrado" — ni una fecha entra en esa decisión.
 *
 * Replicar acá un corte por fecha (como hace `porMes`, que reproduce la fórmula vieja de bloques)
 * mediría una diferencia de criterio inventada en este archivo en vez de medir el dato.
 *
 * Un endosado no cae de ningún lado: no entra por ninguna de las dos líneas.
 */
export function ladoDeCobro(cobro, { esCobrado, esPendiente }) {
  if (cobro.endosado) return null
  if (esCobrado(cobro)) return 'real'
  return esPendiente(cobro) ? 'proyectado' : null
}

/**
 * NÚCLEO PURO: el veredicto de UN lado de UN mes.
 *
 * `cobranzas` es lo comparable: el bruto de ese lado menos lo que el cuadro no tiene por qué mostrar
 * (endosados y devoluciones de ese mismo lado). El criterio del dólar es el mismo que el del total —
 * un mes con dólares se juzga por su tipo de cambio implícito, nunca por un umbral en pesos.
 */
export function veredictoDelLado({ bruto = 0, endosado = 0, devolucion = 0, cashflow = 0, ars = 0, usd = 0, tipoCambio = null }, { tolerancia, deriva }) {
  const cobranzas = bruto - endosado - devolucion
  const dif = cobranzas - cashflow
  const tcImplicito = usd ? (cashflow - ars) / usd : null
  const ok = usd
    ? Boolean(tipoCambio) && Math.abs(tcImplicito - tipoCambio) <= tipoCambio * deriva
    : Math.abs(dif) < tolerancia
  return { bruto, endosado, devolucion, cobranzas, cashflow, dif, ars, usd, tcImplicito, ok }
}

/** El lado del que salió la plata que le falta al otro: el que Cobranzas ve, invertido si sobra. */
const ladoBuscado = (lado, dif) => (dif > 0 ? lado : (lado === 'real' ? 'proyectado' : 'real'))

/**
 * NÚCLEO PURO: QUÉ FILA DE COBRANZAS ESTÁ DEL LADO EQUIVOCADO — el trabajo que hacía una persona.
 *
 * El diagnóstico del 14/08 tardó media hora en llegar a la fila 44. Un control que dice "agosto no
 * cierra por $8.234.758" y deja la búsqueda para después obliga a abrir la pestaña y sumar a mano, y
 * lo que obliga a buscar no se mira. Acá se nombra la fila, el cliente, el importe y hacia dónde se
 * movió.
 *
 * CÓMO SE LEE EL SIGNO. `dif = lo que dice Cobranzas − lo que muestra el cuadro`, por lado:
 *   · dif.real > 0  → Cobranzas tiene una fila "Cobrado" que el cuadro NO está mostrando como real.
 *   · dif.real < 0  → el cuadro muestra como real algo que Cobranzas todavía no da por cobrado.
 * Cuando los dos lados se compensan al peso, es UNA FILA QUE CAMBIÓ DE LADO y no plata que aparece o
 * desaparece: eso se dice, porque son dos problemas distintos.
 *
 * NO SE AFIRMA LO QUE NO SE PUEDE PROBAR. Si ninguna fila sola explica la diferencia, se devuelven las
 * más cercanas marcadas `exacta:false` y con `sola:false`: son pistas, no un veredicto. Inventar una
 * combinación de tres filas que suman el desvío es fabricar una explicación.
 *
 * @param {Array<object>} cobrosDelMes los cobros imputados a ese mes (con `lado` ya resuelto)
 * @param {{real:number, proyectado:number}} dif
 * @param {{tolerancia:number, maximo?:number}} opciones
 */
export function culpables(cobrosDelMes = [], dif = parLados(), { tolerancia = 1, maximo = 3 } = {}) {
  const compensan = Math.abs(dif.real + dif.proyectado) < tolerancia
    && Math.abs(dif.real) >= tolerancia && Math.abs(dif.proyectado) >= tolerancia
  const out = []
  // UNA FILA SE NOMBRA UNA VEZ. En un traspaso los dos lados apuntan a la misma fila desde su vereda
  // —uno porque le sobra, el otro porque le falta— y repetirla convierte el hallazgo en ruido: dos
  // renglones idénticos se leen como dos problemas.
  const yaNombrada = new Set()
  for (const lado of LADOS) {
    const d = dif[lado]
    if (Math.abs(d) < tolerancia) continue
    const buscado = ladoBuscado(lado, d)
    const candidatas = cobrosDelMes
      .filter((c) => c.lado === buscado && !c.endosado)
      .map((c) => ({ ...c, distancia: Math.abs(Math.abs(c.monto) - Math.abs(d)) }))
      .sort((a, b) => a.distancia - b.distancia)
    const exactas = candidatas.filter((c) => c.distancia < tolerancia)
    const elegidas = exactas.length ? exactas : candidatas.slice(0, maximo)
    for (const c of elegidas) {
      if (yaNombrada.has(c.fila)) continue
      yaNombrada.add(c.fila)
      out.push({
        fila: c.fila,
        cliente: c.cliente,
        estado: c.estado,
        monto: c.monto,
        lado: buscado,
        haciaLado: buscado === 'real' ? 'proyectado' : 'real',
        falta: d,
        exacta: c.distancia < tolerancia,
        sola: exactas.length === 1,
        traspaso: compensan,
      })
    }
    if (!candidatas.length) {
      out.push({
        fila: null, cliente: null, estado: null, monto: null, lado: buscado,
        haciaLado: null, falta: d, exacta: false, sola: false, traspaso: compensan,
      })
    }
  }
  return out
}

/** El texto de una candidata, para el informe. Una línea por fila: se lee de un vistazo. */
export function frasePorCulpable(c, ars) {
  const donde = c.fila === null
    ? `no hay ninguna fila ${c.lado} en ese mes que pueda explicarlo`
    : `f${c.fila} ${String(c.cliente).slice(0, 28)} ${ars(c.monto)} (estado "${c.estado}")`
  if (c.fila === null) return `      ${donde}`
  const que = c.traspaso
    ? `el cuadro la cuenta del lado ${c.haciaLado} y Cobranzas la declara ${c.lado}`
    : `${c.falta > 0 ? 'Cobranzas la declara' : 'el cuadro la muestra'} del lado ${c.lado} y el otro lado no la tiene`
  return `      ${c.exacta ? (c.sola ? '⇒' : '·') : '?'} ${donde} — ${que}`
}
