// LA GREMIAL PAGADA ES UN HECHO DEL BANCO, NO UNA MARCA EN COMPRAS.
//
// ═══ EL DEFECTO (10/09/2026, decisión del dueño) ═══
//
// Hasta hoy la cadena de «Cargas Sociales» sólo sabía que una obligación gremial estaba PAGADA si
// alguien había cargado la fila en Compras con rubro «Nómina · Gremiales» y Estado «Pagado». El
// dueño prohibió esa carga —*«tienen pestañas especiales donde esto tiene que quedar registrado»*—
// y el mismo día pagó por DEBIN la boleta de UOCRA de agosto: $994.941,26, el 10/09, ya visible en
// `public.banco_movimientos` y en su réplica `_BANCO_RAW`. Sin fila en Compras, la cadena seguía
// proyectando esa plata como egreso futuro **mientras ya había salido de la cuenta**: el cash flow
// la contaba dos veces (una en el saldo del banco, otra en la escalera de vencimientos).
//
// ═══ LA FUENTE CANÓNICA, Y POR QUÉ ESTA Y NO OTRA ═══
//
// Un pago es un débito en la cuenta. La marca de Compras es la declaración de una persona SOBRE ese
// hecho; el extracto es el hecho. Por eso la precedencia queda:
//
//     BANCO  >  Compras «Pagado»  >  declarado (la boleta)  >  proyección de la cadena
//
// Compras NO se apagó: es la única fuente que cubre enero–agosto, cuando los gremiales sí se
// cargaban ahí. Se degradó a secundaria.
//
// ═══ CÓMO SE APAREA, CON LOS DOS CASOS REALES MEDIDOS ═══
//
//   · FONDO DE CESE — el banco escribe el período en el concepto: «Acreditacion fondo desempleo
//     082026». Es la evidencia más fuerte que hay: no hay que adivinar a qué mes pertenece el lote.
//     Se suman las acreditaciones individuales de ese período (15 líneas, $1.160.400 el 10/09) y se
//     comparan contra el «Total Aportes Devengados al Fondo de Cese Laboral» de la DDJJ.
//   · UOCRA — el DEBIN no dice el período, dice el CUIT del organismo. Se aparea por IMPORTE contra
//     el «Total determinado» de la boleta de ese período, que es un número exacto y no una
//     proyección. Dos formas, en este orden:
//       1. UN débito que coincide dentro de $1. Es el caso normal: agosto, $994.941,26 el 10/09.
//       2. El ÚNICO subconjunto de débitos libres que suma EXACTO. Es el caso de julio, cuya
//          rectificativa ($1.261.611,38) se pagó en DOS: $649.940,06 el 19/08 (lo que decía la
//          boleta original) + $611.671,32 el 27/08 (la diferencia). Se reusa `combinacionUnica`,
//          que ya es la definición de «subconjunto único» de este repositorio — con dos formas
//          posibles no se aparea nada, que es el lado seguro del error.
//
// ═══ LO QUE ESTE MÓDULO NO PUEDE SABER, Y NO INVENTA ═══
//
//   · EL LOTE SIN PERÍODO. El del 18/08 ($2.481.098,40, 35 acreditaciones) llegó con «desempleo
//     000000»: el banco no dice de qué mes es y ninguna suma de devengados lo reproduce. NO se le
//     atribuye período — se avisa. Adivinarlo taparía un mes que quizá siga impago.
//   · IERIC Y FODECO. No están en la boleta de UOCRA (la DDJJ no los declara) y en el extracto
//     aparecen como «Merpago*ieric» o «Pago de servicios - Ieric», por $13.191 a $47.670, sin
//     período ni importe declarado contra el cual compararlos. Sin las dos puntas no hay apareo
//     posible: siguen dependiendo de Compras. Está declarado en `SIN_APAREO`.
//   · EL SEGUNDO CUIT. El DEBIN del 19/08 fue al CUIT 30-70774398-7, no al de UOCRA, y pagó al
//     centavo el Total determinado de la boleta ORIGINAL de julio. Que sea un cobrador de la
//     obligación gremial es INFERENCIA con evidencia (coincidencia exacta, mismo canal, misma
//     semana), no un hecho verificado: viaja marcado `porVerificar` y cada vez que se usa se avisa.
//
// NÚCLEO PURO. No lee Google, no escribe, no toca la base: recibe filas ya leídas y devuelve
// decisiones, que es lo que se puede probar en frío.

import { combinacionUnica } from './jornales-testigos.mjs'
import { isoDeSerial } from './libro-extractores-fechas.mjs'
import { COL as COL_UOCRA, FILA0 as FILA0_UOCRA, PESTAÑA as RAW_UOCRA } from '../scripts/uocra-raw-pestana.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const centavos = (v) => Math.round(v * 100)
const dosDecimales = (v) => Math.round(v * 100) / 100
const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
/** La letra de columna de la réplica → índice 0-based de la fila leída. */
const col = (letra) => letra.charCodeAt(0) - 65

/**
 * CUÁNTO PUEDE SEPARARSE UN DÉBITO DE LA OBLIGACIÓN DECLARADA Y SEGUIR SIENDO EL MISMO PAGO.
 *
 * UN PESO. No es holgura de criterio: la boleta es un importe determinado al centavo y el débito lo
 * copia (los dos casos medidos coinciden exacto). El peso está para el redondeo de la aritmética de
 * punto flotante, no para tolerar diferencias reales — una diferencia de verdad significa que ese
 * débito NO es el pago de esta boleta, y taparla sería declarar pagada una obligación viva.
 */
export const TOLERANCIA_APAREO = 1

/**
 * LOS CUIT QUE COBRAN LA BOLETA DE UOCRA, con la confianza de cada uno declarada al lado.
 *
 * El apareo por importe sólo mira débitos de esta lista: sin el filtro, cualquier transferencia que
 * coincidiera con el Total determinado «pagaría» la boleta.
 */
export const COBRADORES_UOCRA = Object.freeze([
  Object.freeze({
    cuit: '30503049097',
    porVerificar: false,
    nota: 'UOCRA. El dueño pagó por DEBIN a este CUIT la boleta de agosto ($994.941,26 el 10/09/2026) '
      + 'y la diferencia de la rectificativa de julio ($611.671,32 el 27/08).',
  }),
  Object.freeze({
    cuit: '30707743987',
    porVerificar: true,
    nota: 'A VERIFICAR POR EL DUEÑO: este CUIT no es el de UOCRA. Se lo incluye porque el DEBIN del '
      + '19/08/2026 le pagó $649.940,06, que es EXACTAMENTE el Total determinado de la boleta ORIGINAL '
      + 'de julio, y ocho días después el resto de la rectificativa fue al CUIT de UOCRA. Es inferencia '
      + 'con evidencia, no un hecho: si resulta ser otro acreedor, se borra esta entrada y julio vuelve '
      + 'a quedar apareado sólo por $611.671,32.',
  }),
])

/** El débito de UOCRA es un DEBIN y lleva el CUIT en el concepto. Los dos datos importan: un pago a
 *  ese CUIT por otra vía no es esta boleta, y un DEBIN a otro CUIT tampoco. */
export const RE_DEBIN = /debin/i
/** «Acreditacion fondo desempleo 082026» — el período viene en el concepto, MMAAAA. */
export const RE_FONDO_CESE = /fondo\s+desempleo\s+(\d{6})/i

/** Los organismos gremiales que este módulo NO puede aparear, y por qué. Se declara para que el que
 *  lea el resultado sepa que la cobertura es parcial a propósito. */
export const SIN_APAREO = Object.freeze({
  IERIC: 'no se declara en la boleta de UOCRA y en el extracto llega sin período («Merpago*ieric», '
    + '«Pago de servicios - Ieric»): no hay importe declarado contra el cual aparearlo. Sigue por Compras.',
  FODECO: 'ídem IERIC, y además no se le encontró un solo débito propio en el extracto.',
})

/** «082026» → «2026-08». Devuelve null si el banco no escribió un período real (el lote del 18/08
 *  llegó con «000000», que es el banco diciendo que no sabe). */
export function periodoDeMMAAAA(s) {
  const t = txt(s)
  if (!/^\d{6}$/.test(t)) return null
  const mes = Number(t.slice(0, 2))
  const anio = Number(t.slice(2))
  if (mes < 1 || mes > 12 || anio < 2000 || anio > 2100) return null
  return `${anio}-${String(mes).padStart(2, '0')}`
}

/**
 * NÚCLEO PURO: la boleta VIGENTE de cada período de la réplica `_UOCRA_DDJJ_RAW`.
 *
 * LA RECTIFICATIVA LE GANA A LA ORIGINAL, igual que en `celdaUocra` — y por el mismo motivo: julio
 * está DOS veces (Original $649.940,06, Rectificativa $1.261.611,38) y quedarse con la primera que
 * aparece deja el apareo colgando del orden en que Drive devolvió los archivos. La regla se escribe
 * acá en JavaScript porque la de allá es una fórmula: son dos lenguajes, un solo criterio, y este
 * comentario es el que ata los dos.
 *
 * @param {Array<Array>} filas `_UOCRA_DDJJ_RAW` leída con UNFORMATTED_VALUE
 * @returns {Map<string, {periodo:string, boleta:string, totalDeterminado:number|null,
 *                        fondoCese:number|null, fila:number}>}
 */
export function boletasVigentes(filas = []) {
  const out = new Map()
  const esRect = (b) => /rectificativa/i.test(b)
  for (let i = FILA0_UOCRA - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const periodo = txt(f[col(COL_UOCRA.periodo)])
    if (!/^\d{4}-\d{2}$/.test(periodo)) continue
    const b = {
      periodo,
      boleta: txt(f[col(COL_UOCRA.boleta)]),
      totalDeterminado: num(f[col(COL_UOCRA.totalDeterminado)]),
      fondoCese: num(f[col(COL_UOCRA.fondoCese)]),
      fila: i + 1,
    }
    const ya = out.get(periodo)
    if (!ya || (esRect(b.boleta) && !esRect(ya.boleta))) out.set(periodo, b)
  }
  return out
}

/**
 * NÚCLEO PURO: los lotes de Fondo de Cese del extracto, agrupados por el período que dice el banco.
 *
 * Cada trabajador cobra en SU cuenta, así que un mes son quince o treinta y cinco líneas: el lote es
 * la suma, y la fecha del pago es la de la última línea. Los que llegan sin período (`000000`) no se
 * atribuyen a nadie y salen aparte, para que se puedan nombrar.
 *
 * @param {Array<{fecha:number, concepto:string, importe:number, fila:number}>} debitos magnitudes positivas
 */
export function lotesDeFondoDeCese(debitos = []) {
  const lotes = new Map()
  const sinPeriodo = []
  for (const d of debitos) {
    const m = RE_FONDO_CESE.exec(txt(d.concepto))
    if (!m) continue
    const periodo = periodoDeMMAAAA(m[1])
    if (!periodo) { sinPeriodo.push(d); continue }
    const ya = lotes.get(periodo) ?? { periodo, importe: 0, fecha: d.fecha, filas: [] }
    ya.importe = dosDecimales(ya.importe + d.importe)
    ya.fecha = Math.max(ya.fecha, d.fecha)
    ya.filas.push(d.fila)
    lotes.set(periodo, ya)
  }
  return { lotes, sinPeriodo }
}

/** Los débitos que pueden ser el pago de una boleta de UOCRA: DEBIN a uno de los CUIT declarados. */
export function debitosDeUocra(debitos = []) {
  return debitos
    .filter((d) => RE_DEBIN.test(txt(d.concepto))
      && COBRADORES_UOCRA.some((c) => txt(d.concepto).includes(c.cuit)))
    .sort((a, b) => a.fecha - b.fecha)
}

/** ¿Alguno de los débitos apareados fue a un CUIT que todavía nadie confirmó? Devuelve el CUIT. */
const cuitPorVerificar = (elegidos) => COBRADORES_UOCRA
  .filter((c) => c.porVerificar && elegidos.some((d) => txt(d.concepto).includes(c.cuit)))
  .map((c) => c.cuit)

/**
 * NÚCLEO PURO: qué débitos pagan una obligación de importe `objetivo`.
 *
 * Dos formas y en este orden, las dos medidas contra casos reales (ver la cabecera). Ninguna de las
 * dos elige «el más parecido»: o coincide dentro del peso de redondeo, o la combinación es única.
 *
 * @returns {{elegidos:Array, motivo:string}|null}
 */
function aparearImporte(candidatos, objetivo, usados) {
  const libres = candidatos.filter((d) => !usados.has(d.fila))
  if (!libres.length || !(objetivo > 0)) return null
  const uno = libres.find((d) => Math.abs(d.importe - objetivo) <= TOLERANCIA_APAREO)
  if (uno) return { elegidos: [uno], motivo: `débito único de ${pesos(uno.importe)} el ${isoDeSerial(uno.fecha)}` }
  const c = combinacionUnica(libres.map((d) => d.importe), objetivo)
  if (!c.unica) return null
  const elegidos = c.indices.map((i) => libres[i])
  return {
    elegidos,
    motivo: `${elegidos.length} débitos que suman exacto (${elegidos.map((d) => isoDeSerial(d.fecha)).join(' + ')})`,
  }
}

/**
 * NÚCLEO PURO: cuánto de cada período gremial pagó el banco, y con qué evidencia.
 *
 * La clave es el período DEVENGADO (`YYYY-MM`), que es como se nombra la obligación en la cadena —
 * no el mes en que salió la plata. Un mes queda apareado sólo si su boleta existe: sin el declarado
 * no hay contra qué comparar el débito, y un débito suelto no prueba de qué mes es.
 *
 * EL DÉBITO SE CONSUME. `usados` es el mismo Set que comparten el respaldo de nómina, el de cheques
 * y `libro-cruce-banco`: un débito respalda a UNA obligación. Sin eso, los $994.941,26 podrían pagar
 * a la vez la boleta de UOCRA y una factura de proveedor del mismo importe.
 *
 * @param {{debitos:Array, boletas:Array<Array>, usados:Set<number>}} entrada
 * @returns {{porPeriodo:Map<string,object>, avisos:string[]}}
 */
export function pagosGremialesDelBanco({ debitos = [], boletas = [], usados = new Set() } = {}) {
  const avisos = []
  const vigentes = boletasVigentes(boletas)
  const { lotes, sinPeriodo } = lotesDeFondoDeCese(debitos)
  const candidatos = debitosDeUocra(debitos)
  const porPeriodo = new Map()

  for (const periodo of [...vigentes.keys()].sort()) {
    const b = vigentes.get(periodo)
    const detalle = []
    let cubierto = 0
    let fecha = null

    const uocra = aparearUocra(b, candidatos, usados, avisos)
    if (uocra) { detalle.push(uocra); cubierto += uocra.cubierto; fecha = Math.max(fecha ?? 0, uocra.fecha) }

    const fcl = aparearFondoDeCese(b, lotes.get(periodo), usados, avisos)
    if (fcl) { detalle.push(fcl); cubierto += fcl.cubierto; fecha = Math.max(fecha ?? 0, fcl.fecha) }

    if (!detalle.length) continue
    const declarado = dosDecimales((b.totalDeterminado ?? 0) + (b.fondoCese ?? 0))
    porPeriodo.set(periodo, {
      periodo,
      declarado,
      cubierto: dosDecimales(cubierto),
      resto: dosDecimales(declarado - cubierto),
      fecha,
      filas: detalle.flatMap((d) => d.filas),
      detalle,
    })
  }

  for (const d of sinPeriodo) {
    avisos.push(`cargas-pagos-banco: el débito de Fondo de Cese de ${pesos(d.importe)} del `
      + `${isoDeSerial(d.fecha)} (_BANCO_RAW f${d.fila}) llegó con período «000000»: el banco no dice de `
      + 'qué mes es y no se lo atribuyo a ninguno — ese mes sigue dependiendo de Compras.')
  }
  return { porPeriodo, avisos }
}

/** La parte UOCRA de un período: el «Total determinado» de su boleta contra los DEBIN libres. */
function aparearUocra(b, candidatos, usados, avisos) {
  const objetivo = num(b.totalDeterminado)
  if (!objetivo) return null
  const r = aparearImporte(candidatos, objetivo, usados)
  if (!r) return null
  for (const d of r.elegidos) usados.add(d.fila)
  const dudoso = cuitPorVerificar(r.elegidos)
  if (dudoso.length) {
    avisos.push(`cargas-pagos-banco: el pago de UOCRA de ${b.periodo} se aparea con un DEBIN al CUIT `
      + `${dudoso.join(', ')}, que NO es el de UOCRA — coincide al centavo con el Total determinado, `
      + 'pero el organismo está sin confirmar. Verificalo y corregí COBRADORES_UOCRA.')
  }
  return {
    organismo: 'UOCRA',
    declarado: objetivo,
    // El banco puede pagar de más (redondeo del organismo): lo que cubre nunca supera lo declarado,
    // porque el excedente no cancela nada de ESTA obligación.
    cubierto: Math.min(objetivo, dosDecimales(r.elegidos.reduce((a, d) => a + d.importe, 0))),
    fecha: Math.max(...r.elegidos.map((d) => d.fecha)),
    filas: r.elegidos.map((d) => d.fila),
    motivo: r.motivo,
  }
}

/** La parte de Fondo de Cese: el lote que el banco rotuló con ESE período contra lo devengado. */
function aparearFondoDeCese(b, lote, usados, avisos) {
  if (!lote) return null
  const declarado = num(b.fondoCese)
  if (!declarado) return null
  for (const f of lote.filas) usados.add(f)
  if (centavos(lote.importe) > centavos(declarado) + centavos(TOLERANCIA_APAREO)) {
    avisos.push(`cargas-pagos-banco: el Fondo de Cese de ${b.periodo} se depositó por ${pesos(lote.importe)} `
      + `y la DDJJ declara ${pesos(declarado)} — el excedente no cancela nada de esta obligación.`)
  }
  return {
    organismo: 'Fondo de Cese',
    declarado,
    cubierto: Math.min(declarado, lote.importe),
    fecha: lote.fecha,
    filas: lote.filas,
    motivo: `${lote.filas.length} acreditación(es) rotuladas «desempleo ${b.periodo.slice(5)}${b.periodo.slice(0, 4)}»`,
  }
}

/**
 * El texto de una línea de log: qué cubrió el banco de un período y qué quedó sin cubrir.
 * Vive acá y no en el script porque es la explicación del apareo, y la explicación va con la regla.
 */
export function explicarPago(p) {
  const partes = p.detalle.map((d) => `${d.organismo} ${pesos(d.cubierto)} (${d.motivo})`).join(' · ')
  const resto = p.resto > TOLERANCIA_APAREO ? ` — quedan ${pesos(p.resto)} sin respaldo bancario` : ' — cubierto entero'
  return `${p.periodo}: ${partes}${resto}`
}
