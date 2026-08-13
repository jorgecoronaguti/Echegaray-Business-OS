// LOS HITOS DEL CALENDARIO: qué fila de Cobranzas cae en qué mes, y qué hace que la corrida se
// detenga antes de publicar.
//
// POR QUÉ ESTÁ SEPARADO DE `calendario-cobros.mjs`: aquél arma FÓRMULAS (texto que Sheets evalúa) y
// éste toma DECISIONES sobre datos leídos. Mezclarlos obligaría a construir una grilla entera para
// probar que un cobro sin fecha detiene la corrida, y ese es justo el control que más barato tiene
// que ser de probar.
//
// ═══ LAS DOS FORMAS EN QUE UN CALENDARIO PIERDE PLATA SIN DAR ERROR ═══
//
//  1 · UN COBRO SIN FECHA. No tiene columna donde caer. La fila del cliente lo sumaría igual (su
//      SUMIFS filtra por rango de fechas y lo dejaría afuera), así que el cuadre fallaría por un
//      importe sin decir de quién. Se ABORTA nombrando la fila.
//  2 · UN COBRO MÁS ALLÁ DE DICIEMBRE. Tampoco tiene columna: la ventana termina en el año declarado.
//      Se ABORTA. La alternativa —una columna "más adelante"— sería inventar un período que el rótulo
//      de la pestaña no declara, y el año es lo que la pestaña afirma medir.
//
// Lo VENCIDO no aborta: tiene columna propia. Ver `columnaVencido` en calendario-cobros.mjs.

import { filasDeObra } from './cobranzas-contrato.mjs'
import { variantesDe, ALIAS_CLIENTE, ANO } from './obras-grilla.mjs'

/** El canónico de un cliente tal como lo escribe Cobranzas. Misma decisión declarada que en OBRAS:
 *  las variantes colapsan en su canónico, y lo que no está en el mapa se llama como se llama. */
export function canonicoDeCliente(texto, alias = ALIAS_CLIENTE) {
  const t = String(texto ?? '').trim()
  for (const [canon, variantes] of Object.entries(alias)) if (variantes.includes(t)) return canon
  return t
}

/** Estados que no son un cobro por venir. */
const FUERA = new Set(['Cobrado', 'CANCELAR'])

/** El mes (1-based) y el año de un serial de Sheets, sin depender de la zona horaria del proceso. */
export function mesDeSerial(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000)
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
}

/**
 * A QUÉ OBRA DECLARADA PERTENECE CADA FILA DE COBRANZAS.
 *
 * NO SE REIMPLEMENTA LA REGLA: se llama a `filasDeObra`, que es la MISMA que usan la venta de OBRAS y
 * la lectura del contrato. Si acá se escribiera otra versión, el ⚠ de "el cobro cae después del fin
 * de obra" se calcularía sobre un universo distinto que la venta de esa misma obra, y las dos
 * pestañas dirían cosas incompatibles sin dar un solo error.
 *
 * Una fila que no pertenece a ninguna obra declarada queda con `finObra: null` y no se marca — es lo
 * correcto: son los trabajos sueltos ($54,6M pendientes hoy), que no tienen fecha de fin porque no
 * son una obra. Inventarles una sería fabricar un dato.
 *
 * @returns {Map<number, string>} índice 0-based dentro de `filas` → fecha de fin ISO de su obra.
 */
export function finDeObraPorFila(filas = [], cols = {}, obras = []) {
  const porCliente = obras.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  const fin = new Map()
  for (const o of obras) {
    if (!o.fin) continue
    const idxs = filasDeObra(filas, cols, {
      variantes: variantesDe(o.cliente), needle: o.ventaTexto, unica: porCliente.get(o.cliente) === 1,
    })
    // LA PRIMERA OBRA QUE RECLAMA LA FILA SE LA QUEDA. Con `unica`, un cliente de una sola obra se
    // lleva TODAS sus filas —incluidas las que no son de esa obra—; que no la pise otra después
    // mantiene la marca del lado conservador: se marca de menos, nunca de más.
    for (const i of idxs) if (!fin.has(i)) fin.set(i, o.fin)
  }
  return fin
}

/**
 * LOS HITOS PENDIENTES, UBICADOS EN SU MES.
 *
 * @param {Array<Array>} filas las filas de datos de Cobranzas (sin encabezado)
 * @param {object} cols índices 0-based: cliente, concepto, estado, fechaCobro, total
 * @param {{desde:number, meses:Array, inicioVentana:number, finPorFila:Map, ano:number}} ctx
 *   `desde` es la primera fila 1-based de datos en el Sheet — el hito la cita para anclar su fórmula.
 * @returns {{hitos:Array, problemas:string[]}} `problemas` vacío significa que se puede publicar.
 */
export function hitosPendientes(filas = [], cols = {}, ctx = {}) {
  const { desde = 5, meses = [], inicioVentana = 0, finPorFila = new Map(), ano = ANO } = ctx
  const hitos = []
  const problemas = []
  const dentro = new Set(meses.map((m) => `${m.ano}-${m.mes}`))
  filas.forEach((f, i) => {
    const estado = String(f?.[cols.estado] ?? '').trim()
    if (!estado || FUERA.has(estado)) return
    const cliente = canonicoDeCliente(f?.[cols.cliente])
    const concepto = String(f?.[cols.concepto] ?? '').trim()
    const fila = desde + i
    const cru = f?.[cols.fechaCobro]
    const serial = typeof cru === 'number' ? cru : Number(cru)
    if (!Number.isFinite(serial) || serial <= 0) {
      problemas.push(`fila ${fila} (${cliente} · ${concepto || 'sin concepto'}, ${estado}): sin fecha de cobro`
        + ' — no tiene columna donde caer y desaparecería del calendario')
      return
    }
    const m = mesDeSerial(serial)
    const vencido = serial < inicioVentana
    if (!vencido && !dentro.has(`${m.ano}-${m.mes}`)) {
      problemas.push(`fila ${fila} (${cliente} · ${concepto || 'sin concepto'}): cobro el ${String(m.mes).padStart(2, '0')}/${m.ano}`
        + `, fuera del año ${ano} que la pestaña declara — no hay columna donde ponerlo`)
      return
    }
    hitos.push({
      fila, cliente, concepto, estado, mes: m, vencido, serial,
      finObra: finPorFila.get(i) ?? null,
      // Lo que la celda MUESTRA, para dimensionar la columna A. La fórmula del rótulo es larga y
      // medirla daría una columna de 1.500px por un texto de 60 caracteres.
      textoVisible: textoDeHito({ serial, concepto, forma: String(f?.[cols.forma] ?? '').trim(), estado, finObra: finPorFila.get(i) ?? null }),
    })
  })
  // ORDENADOS POR FECHA DENTRO DE CADA CLIENTE. Cobranzas está ordenada por ID de carga; el orden
  // cronológico es justo lo que convierte una lista de hitos en un calendario, y es lo que la
  // pestaña aporta y la fuente no tiene.
  hitos.sort((a, b) => a.serial - b.serial || a.fila - b.fila)
  return { hitos, problemas }
}

/** El texto que se VE en el rótulo de un hito. Espeja `rotuloDeHito`, que arma la misma frase como
 *  fórmula viva; acá se arma en frío sólo para medir píxeles y para poder leer el ensayo en seco. */
export function textoDeHito({ serial, concepto, forma, estado, finObra }) {
  const d = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000)
  const dd = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  let t = `      ${dd} · ${concepto}${forma ? ` · ${forma}` : ''}`
  if (estado && estado !== 'Pendiente') t += ` · ${estado}`
  if (finObra) {
    const [, mm, ddf] = String(finObra).split('-')
    const finSerial = Math.round((Date.UTC(...String(finObra).split('-').map((x, k) => (k === 1 ? Number(x) - 1 : Number(x)))) - Date.UTC(1899, 11, 30)) / 86400000)
    if (Number(serial) > finSerial) t += ` ⚠ fin ${ddf}/${mm}`
  }
  return t
}
