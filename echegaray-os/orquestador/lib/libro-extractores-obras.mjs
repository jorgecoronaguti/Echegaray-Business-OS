// LOS EGRESOS PROYECTADOS DE LAS OBRAS FUTURAS — plata que va a salir, con neteo vivo contra Compras.
//
// ═══ QUÉ ENTRA Y QUÉ NO — LA REGLA DEL DOBLE CONTEO ═══
//
// De cada obra entran SÓLO los egresos de caja reales (materiales, alquileres, combustible: el array
// `egresos`). Lo que NO entra, y es deliberado:
//
//   · `moCargasPesos` — la mano de obra y sus cargas ya viajan al libro por la puerta de Jornales
//     (rangos con nombre + cadena de cargas sociales). Emitirla acá la contaría DOS veces.
//   · `noCaja`       — la máquina propia no mueve caja: es costo de obra, no egreso de tesorería.
//   · una obra sin `inicio` o sin `fin` se saltea ENTERA: sin fechas no hay proyección de caja que
//     no sea inventada, y la regla de oro es no fabricar datos.
//
// ═══ EL IMPORTE ES VIVO: LA FÓRMULA SE DESCUENTA SOLA CUANDO LA FACTURA REAL ENTRA A COMPRAS ═══
//
// Un número pegado cuenta dos veces en el instante en que la factura real se carga en Compras: la
// fila real entra al libro por su propio camino (pagada O pendiente, igual que la provisión de
// recurrentes) y la proyección seguiría entera hasta la regeneración siguiente. Por eso la celda C
// va como fórmula: `MAX(0; planificado − real)`, donde `real` es un SUMPRODUCT sobre Compras filtrado
// por proveedor + cliente + fecha ≥ inicio de la obra. Se netea contra la columna TOTAL de Compras
// —no contra "Monto Pagado"—: lo que descuenta la proyección es que la factura ENTRÓ, no que se pagó
// (la impaga ya proyecta sola su salida por su fila real).
//
// La fecha de Compras (col "Fecha") viene en formato mixto serie/texto; se coacciona con el patrón
// `IFERROR(DATEVALUE(rango&"");N(rango))` que ya paga esa deuda en caja-posterior-al-corte.mjs.
//
// ═══ VARIAS CUOTAS DEL MISMO PROVEEDOR: EL NETEO ES SECUENCIAL, NUNCA SE RESTA DOS VECES ═══
//
// Si Grúas San Blas tiene 3 cuotas y el mismo SUMPRODUCT se restara de cada una, una factura real
// de $1M se descontaría TRES veces. El neteo secuencial hace que el real absorba las cuotas EN ORDEN
// (primero la 1ª, después la 2ª…):
//
//   cuota k = MAX(0; acum_k − MAX(acum_{k−1}; real))
//
// con `acum_k` la suma acumulada PLANIFICADA hasta la cuota k (constantes en la fórmula) y `real` el
// mismo SUMPRODUCT. Un real que cubre 1,5 cuotas deja la 1ª en $0, media 2ª y la 3ª entera — y la
// suma de las tres es siempre MAX(0; planificado − real): imposible restar dos veces. La spec traía
// la forma `MAX(0;MIN(acum_k;total−real)−acum_{k−1})`, que absorbe DESDE LA ÚLTIMA cuota (la factura
// real ya pagada seguiría proyectada mañana); se implementó la semántica declarada — "el real absorbe
// las cuotas en orden" — con la forma equivalente de arriba. Está fijado por test.
//
// Los DISTINTOS egresos de un mismo proveedor dentro de la obra se encadenan en la MISMA secuencia:
// comparten el SUMPRODUCT (mismo proveedor, mismo cliente, misma ventana) y dejarlos como fórmulas
// independientes reabriría el doble descuento que las cuotas cierran.
//
// ═══ PURO A PROPÓSITO ═══
//
// Sin red. Las obras llegan por parámetro con el shape de lib/obras-datos.mjs (ese módulo NO se
// importa acá: el extractor se prueba en frío con fixtures) y las LETRAS de Compras llegan resueltas
// por rótulo desde el script (`columnasNeteoDeCompras`). Sin letras resueltas, FALLA CERRADO: el
// importe va pegado, sin fórmula — nunca una referencia adivinada.

import { movimiento, SALE } from './libro-movimientos.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

/** El único rubro nuevo que esta fuente introduce en el libro. */
export const RUBRO_OBRAS = 'Materiales de obra proyectados'

/** El `origen.pestana` de estos movimientos. No es una pestaña del archivo: es el plan de obras. */
export const PESTANA_OBRAS = 'Obras'

const txt = (v) => String(v ?? '').trim()
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const r2 = (v) => Math.round(v * 100) / 100

/** Un número para una fórmula es-AR: el decimal es COMA (el `.` de JS no parsea en el archivo). */
const nAR = (v) => String(r2(v)).replace('.', ',')

/** Un literal de texto para una fórmula: las comillas internas se duplican. */
const litAR = (s) => `"${txt(s).replace(/"/g, '""')}"`

/** 'YYYY-MM-DD' (o un serial ya numérico) → serial de Sheets. `null` si no hay fecha. */
export function serialDeFecha(v) {
  if (Number.isFinite(v)) return Math.round(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(v))
  return m ? serialDe(+m[1], +m[2], +m[3]) : null
}

/** ¿Las letras de Compras están completas? Sin las cuatro no hay fórmula viva. */
const colsValidas = (c) => (c && c.proveedor && c.cliente && c.fecha && c.total ? c : null)

/**
 * NÚCLEO PURO: lo ya facturado en Compras para (proveedor, cliente) desde el inicio de la obra.
 * Es EL MISMO SUMPRODUCT para todas las cuotas del proveedor — por eso el neteo secuencial funciona.
 * La col "Fecha" se coacciona (serie/texto mixto, ver caja-posterior-al-corte.mjs); el Total se
 * envuelve en N() porque SUMPRODUCT no tolera texto en la columna que suma.
 */
export function formulaRealDeCompras(cols, proveedor, cliente, inicioSerial) {
  const col = (l) => `Compras!$${l}$4:$${l}`
  const fecha = `IFERROR(DATEVALUE(${col(cols.fecha)}&"");N(${col(cols.fecha)}))`
  return `SUMPRODUCT((${col(cols.proveedor)}=${litAR(proveedor)})*(${col(cols.cliente)}=${litAR(cliente)})`
    + `*(${fecha}>=${inicioSerial})*N(${col(cols.total)}))`
}

/**
 * NÚCLEO PURO: las celdas de importe VIVO de una secuencia de cuotas del mismo (obra, proveedor).
 *
 * Está extraída a propósito: desde el 24/08 hay DOS productores de egresos de obra —éste, desde las
 * constantes, y `lib/materiales-previstos.mjs`, desde el cuadro 5 que el dueño edita— y el neteo
 * secuencial tiene que ser EL MISMO. Dos copias de esta cuenta se desincronizan sin dar error: una
 * restaría el real de cada cuota y la factura de $1M se descontaría tres veces.
 *
 * `cuota k = MAX(0; acum_k − MAX(acum_{k−1}; real))` — el real absorbe las cuotas EN ORDEN.
 *
 * @param {number[]} montos los importes planificados, YA ORDENADOS POR FECHA
 * @param {string|null} real el SUMPRODUCT contra Compras; `null` ⇒ importes pegados (falla cerrado)
 * @returns {Array<string|null>} una celda por monto, en el mismo orden
 */
export function celdasNeteoSecuencial(montos = [], real = null) {
  if (!real) return montos.map(() => null)
  if (montos.length === 1) return [`=MAX(0;${nAR(montos[0])}-${real})`]
  let acum = 0
  return montos.map((m) => {
    const prev = acum
    acum = r2(acum + m)
    return `=MAX(0;${nAR(acum)}-MAX(${nAR(prev)};${real}))`
  })
}

/**
 * LOS EGRESOS DE OBRAS FUTURAS → movimientos PROYECTADOS de signo −1, con importe vivo.
 *
 * @param {Array<{clave:string, cliente:string, obra:string, inicio:string|null, fin:string|null,
 *   egresos:Array<{concepto:string, proveedor:string, familia?:string, monto?:number,
 *   fechaEstimada?:string, cuotas?:Array<{fecha:string, monto:number}>}>}>} obras
 *   el shape de lib/obras-datos.mjs, recibido por parámetro (nunca importado acá)
 * @param {{proveedor:string, cliente:string, fecha:string, total:string}|null} colsCompras
 *   letras A1 de Compras resueltas por rótulo; `null` ⇒ importes pegados (falla cerrado)
 * @param {number} corte serial de HOY: una fecha planificada que ya pasó se corre a corte+1 — una
 *   compra proyectada vencida no es historia, es plata que va a salir ya
 * @param {(m:string)=>void} aviso
 * @returns {{movimientos:Array, resumen:{obras:number, movimientos:number, totalProyectado:number}}}
 */
export function deObras(obras = [], colsCompras = null, corte = 0, aviso = () => {}) {
  const cols = colsValidas(colsCompras)
  const movimientos = []
  let obrasConMovimientos = 0
  let totalProyectado = 0

  for (const o of obras ?? []) {
    const inicio = serialDeFecha(o?.inicio)
    const fin = serialDeFecha(o?.fin)
    if (inicio === null || fin === null) {
      aviso(`obra ${txt(o?.clave) || '(sin clave)'} sin inicio o sin fin: se saltea entera — sin fechas la proyección sería inventada.`)
      continue
    }
    const antes = movimientos.length

    // ── Un solo plan por (obra, proveedor): cuotas y egresos sueltos entran a la misma secuencia ──
    const porProveedor = new Map()
    for (const e of o?.egresos ?? []) {
      const prov = txt(e?.proveedor) || '(sin proveedor)'
      const puntos = porProveedor.get(prov) ?? []
      const crudos = Array.isArray(e?.cuotas) && e.cuotas.length
        ? e.cuotas.map((c) => ({ fecha: serialDeFecha(c?.fecha), monto: num(c?.monto), concepto: txt(e?.concepto) }))
        : [{ fecha: serialDeFecha(e?.fechaEstimada), monto: num(e?.monto), concepto: txt(e?.concepto) }]
      for (const p of crudos) {
        if (p.monto === null || p.monto <= 0) {
          aviso(`obra ${txt(o?.clave)} · ${prov}: un egreso sin monto positivo no genera movimiento (${p.concepto || 'sin concepto'}).`)
          continue
        }
        // Sin fecha propia, la del inicio de la obra: es el dato más temprano que sí existe.
        puntos.push({ ...p, fecha: p.fecha ?? inicio })
      }
      porProveedor.set(prov, puntos)
    }

    for (const [prov, puntos] of porProveedor) {
      if (!puntos.length) continue
      puntos.sort((a, b) => a.fecha - b.fecha) // el acumulado planificado es por FECHA, no por orden de carga
      const real = cols ? formulaRealDeCompras(cols, prov, o?.cliente, inicio) : null
      const celdas = celdasNeteoSecuencial(puntos.map((p) => p.monto), real)
      puntos.forEach((p, k) => {
        const vivo = celdas[k]
        const cuota = puntos.length > 1 ? ` · cuota ${k + 1}/${puntos.length}` : ''
        const base = movimiento({
          // Una fecha planificada que ya pasó no dice VENCIDO: se corre a mañana, va a salir ya.
          fecha: p.fecha <= corte ? corte + 1 : p.fecha,
          importe: p.monto,
          signo: SALE,
          concepto: `${txt(o?.obra) || txt(o?.clave)} · ${p.concepto || 'egreso de obra'}${cuota}`,
          contraparte: prov,
          rubro: RUBRO_OBRAS,
          estado: 'PROYECTADO',
          instrumento: '',
          obra: txt(o?.obra),
          cliente: o?.cliente,
          // La cuota entra a la fila: sin ella, las tres cuotas comparten clave de deduplicación
          // (`origen:obras:clave·prov`) y `deduplicar` colapsaría dos de las tres.
          origen: { pestana: PESTANA_OBRAS, fila: `${txt(o?.clave)}·${prov}${puntos.length > 1 ? `·cuota ${k + 1}` : ''}` },
        })
        // `importeVivo` viaja FUERA de movimiento() (que congela su shape), igual que `saldoVivo` en
        // deCompras: el script lo escribe en la celda C en lugar del número pegado.
        movimientos.push(vivo ? { ...base, importeVivo: vivo } : base)
        totalProyectado = r2(totalProyectado + p.monto)
      })
    }
    if (movimientos.length > antes) obrasConMovimientos++
  }

  return {
    movimientos,
    resumen: { obras: obrasConMovimientos, movimientos: movimientos.length, totalProyectado },
  }
}

/**
 * ═══ LA CONCILIACIÓN OBRAS ↔ LIBRO, PARA QUE LA DESCONEXIÓN NO PUEDA VOLVER EN SILENCIO ═══
 *
 * El dueño, 13/08/2026: *"hay desconexión con la pestaña obras que marca costos estipulados, cobros y
 * demás… no pueden no ser fiables"*. La causa medida fue que el generador del libro no estaba en el
 * pipeline, así que los $18.880.836 de egresos proyectados que publica OBRAS no llegaban a ningún cash
 * flow. Eso ya está arreglado — pero el arreglo no se ve: si mañana un egreso se cae por cualquier otro
 * motivo (una obra sin fechas, un monto en cero, un cambio de shape), el cuadro vuelve a quedar corto y
 * TAMPOCO da error. Un cuadro corto y coherente consigo mismo es el modo de falla más caro que tiene
 * este archivo.
 *
 * Esta función contesta la única pregunta que importa, y la contesta en las dos direcciones:
 * **de lo que OBRAS dice que va a salir, ¿cuánto está en el libro y cuánto se cayó?**
 *
 * LAS TRES PLATAS DE UNA OBRA NO SON LA MISMA, y por eso se devuelven separadas — sumarlas sería el
 * doble conteo que todo este módulo evita:
 *   · `caja`     — materiales, alquileres, combustible. Es lo que TIENE que estar en el libro.
 *   · `porJornales` — MO + cargas. Entra al libro por la puerta de Jornales; acá se cuenta para poder
 *                     explicar la diferencia contra el "Pendiente pago" de la pestaña, no para sumarla.
 *   · `noCaja`   — máquina propia. No es plata que sale: no está en ningún flujo y no tiene que estar.
 *
 * PURA. No lee el archivo: recibe las obras y los movimientos que el extractor emitió.
 *
 * @param {Array} obras el shape de lib/obras-datos.mjs
 * @param {Array} movimientos lo que devolvió `deObras`
 * @returns {{caja:number, porJornales:number, noCaja:number, enElLibro:number, faltan:Array<{obra:string, proveedor:string, concepto:string, monto:number}>}}
 */
export function conciliarConObras(obras = [], movimientos = []) {
  // La clave es (obra, proveedor, monto): es lo que identifica un punto de egreso planificado. El
  // concepto no entra —el extractor lo reescribe con el prefijo de la obra y el sufijo de cuota— y la
  // fecha tampoco, porque una fecha vencida se corre a corte+1 a propósito.
  const emitidos = new Map()
  for (const m of movimientos) {
    const k = `${txt(m?.obra)} ${txt(m?.contraparte)} ${r2(Number(m?.importe) || 0)}`
    emitidos.set(k, (emitidos.get(k) ?? 0) + 1)
  }
  let caja = 0; let porJornales = 0; let noCaja = 0
  const faltan = []
  for (const o of obras ?? []) {
    porJornales = r2(porJornales + (Number(o?.moCargasPesos) || 0))
    noCaja = r2(noCaja + (Number(o?.noCaja?.maquinaPropia) || 0))
    for (const e of o?.egresos ?? []) {
      const puntos = Array.isArray(e?.cuotas) && e.cuotas.length
        ? e.cuotas.map((c) => Number(c?.monto) || 0)
        : [Number(e?.monto) || 0]
      for (const monto of puntos) {
        if (monto <= 0) continue
        caja = r2(caja + monto)
        const k = `${txt(o?.obra)} ${txt(e?.proveedor) || '(sin proveedor)'} ${r2(monto)}`
        const quedan = emitidos.get(k) ?? 0
        if (quedan > 0) emitidos.set(k, quedan - 1)
        else faltan.push({ obra: txt(o?.obra), proveedor: txt(e?.proveedor) || '(sin proveedor)', concepto: txt(e?.concepto), monto })
      }
    }
  }
  const enElLibro = r2(caja - faltan.reduce((s, x) => r2(s + x.monto), 0))
  return { caja, porJornales, noCaja, enElLibro, faltan }
}
