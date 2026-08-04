// DE UNA PLANILLA A FILAS, Y DE FILAS A UN EXTRACTO — sin escribir un solo parser nuevo.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO ═══
//
// El motor que entiende un extracto bancario YA EXISTE: `lib/banco-importar.mjs`, con 30 tests, y
// cubre las trampas es-AR que cuestan plata (coma decimal, DD/MM, paréntesis = débito, la referencia
// como clave, la cadena de saldos). Escribir acá un segundo lector de extractos sería crear una
// segunda verdad del mismo dato, y la segunda verdad siempre termina distinta de la primera.
//
// Entonces este módulo hace UNA cosa: convertir lo que llegó (un .xlsx, un .xls, un .csv) en el
// TEXTO que ese motor ya sabe leer, y preguntarle a él. No decide nada sobre el contenido.
//
// ═══ LA TRAMPA DEL NÚMERO DE EXCEL ═══
//
// Una celda de Excel con el número 1234.56 se convierte, si uno la vuelca cruda, en la cadena
// "1234.56". El parser del extracto lee a la argentina: para él el punto es separador de MILES, así
// que "1234.56" son ciento veintitrés mil cuatrocientos cincuenta y seis. No da error. Da un importe
// mil veces más grande y un saldo que no cierra. Por eso cada número se escribe en es-AR ANTES de
// entregárselo, y cada fecha en DD/MM/AAAA: el texto que sale de acá tiene que ser indistinguible
// del CSV que baja el homebanking.
//
// NÚCLEO CASI PURO: la única dependencia externa es `xlsx`, y entra por import dinámico para que
// leer un CSV no cargue una librería de 1 MB.

import { parsearExtracto, verificarCadena } from '../banco-importar.mjs'

/** Cuántas filas se miran de una planilla. Un Excel de 50.000 filas no se convierte entero para
 *  decidir si es un extracto: con las primeras alcanza y sobra. */
export const MAX_FILAS = Number(process.env.ORQ_ARCHIVOS_MAX_FILAS || 5000)

/** Palabras que sólo aparecen alrededor de plata en una cuenta. Ver `pareceExtractoBancario`. */
const MARCAS_BANCO = /\b(saldo|santander|banco|cbu|extracto|cuenta corriente|d[eé]bito|cr[eé]dito|acreditaci[oó]n|transferencia|cheque|movimientos)\b/i

/** Un número a la argentina: "1.234,56". Es lo que el parser del extracto espera. */
export function numeroEsAr(n) {
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })
}

/** Una fecha a la argentina: "22/07/2026". Nunca MM/DD — leerla al revés da el día equivocado sin avisar. */
export function fechaEsAr(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  // UTC: `cellDates` de xlsx construye la fecha en UTC. Usar getDate() local corre un día para
  // cualquiera al oeste de Greenwich — que es toda la Argentina.
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

/** Una celda cualquiera → el texto que iría en un CSV es-AR. */
export function celdaATexto(v) {
  if (v == null) return ''
  if (v instanceof Date) return fechaEsAr(v)
  if (typeof v === 'number') return numeroEsAr(v)
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  // Un `;` adentro de una celda partiría la fila en dos columnas: se neutraliza, no se propaga.
  return String(v).replace(/[;\r\n]+/g, ' ').trim()
}

/** Filas (arrays de celdas) → el texto delimitado por `;` que `parsearExtracto` sabe leer. */
export function filasATexto(filas = []) {
  return filas
    .map((f) => (Array.isArray(f) ? f : [f]).map(celdaATexto).join(';'))
    .filter((l) => l.replace(/;/g, '').trim() !== '')
    .join('\n')
}

/**
 * Lee una planilla binaria (.xlsx/.xlsm/.xls/.ods) y devuelve sus filas.
 *
 * DEVUELVE `{ok:false, error}` en vez de lanzar: un archivo corrupto no puede tumbar la atención del
 * mensaje entero — el dueño mandó cuatro cosas y tres andaban.
 *
 * @param {Buffer} bytes
 * @returns {Promise<{ok:true, hojas:string[], hoja:string, filas:any[][], total:number}|{ok:false, error:string}>}
 */
export async function leerPlanilla(bytes, { hoja = null, maxFilas = MAX_FILAS } = {}) {
  let XLSX
  try {
    XLSX = await import('xlsx')
  } catch (e) {
    return { ok: false, error: `no pude cargar el lector de planillas: ${String(e?.message ?? e).slice(0, 120)}` }
  }
  try {
    const wb = XLSX.read(bytes, { type: 'buffer', cellDates: true })
    const hojas = wb.SheetNames ?? []
    if (!hojas.length) return { ok: false, error: 'la planilla no tiene ninguna hoja' }
    const elegida = hoja && hojas.includes(hoja) ? hoja : hojas[0]
    const ws = wb.Sheets[elegida]
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
    return { ok: true, hojas, hoja: elegida, filas: filas.slice(0, maxFilas), total: filas.length }
  } catch (e) {
    return { ok: false, error: `no pude abrir la planilla: ${String(e?.message ?? e).slice(0, 160)}` }
  }
}

/** Un CSV/TSV en texto → filas, para poder describirlo igual que a un Excel. */
export function filasDeTexto(texto, { maxFilas = MAX_FILAS } = {}) {
  const lineas = String(texto ?? '').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '')
  const sep = lineas.some((l) => l.includes(';')) ? ';' : (lineas.some((l) => l.includes('\t')) ? '\t' : ',')
  return lineas.slice(0, maxFilas).map((l) => l.split(sep).map((c) => c.trim()))
}

/**
 * ¿ESTO ES UN EXTRACTO BANCARIO? Se contesta con el motor real, no con una corazonada.
 *
 * NO ALCANZA CON "SE PARSEARON MOVIMIENTOS", Y TAMPOCO CON QUE HAYA UNA COLUMNA DE SALDO.
 *
 * MEDIDO, con una lista de pedidos de materiales de cuatro columnas
 * (`Fecha;Material;Cantidad;Precio`): el parser —tolerante a propósito, porque tiene que sobrevivir a
 * un pegado de pantalla— toma las dos últimas columnas como importe y saldo y devuelve dos
 * movimientos perfectamente formados. Anunciar "leí 2 movimientos bancarios" sobre esa lista sería
 * exactamente inventar, y encima con un botón al lado para escribirlo en la caja de la empresa.
 *
 * Por eso se exige, ADEMÁS de movimientos, que el papel NOMBRE una cuenta: saldo, banco, extracto,
 * transferencia, cheque, débito, crédito, acreditación, CBU. Un extracto bancario sin una sola de
 * esas palabras no existe; una planilla de obra con todas ellas, tampoco.
 *
 * @returns {{esExtracto:boolean, movimientos:Array, rechazos:Array, cadena:{ok:boolean,cortes:Array}, motivo:string}}
 */
export function pareceExtractoBancario(texto) {
  const { movimientos, rechazos } = parsearExtracto(String(texto ?? ''))
  const cadena = verificarCadena(movimientos, null)
  if (!movimientos.length) {
    return { esExtracto: false, movimientos, rechazos, cadena, motivo: 'no reconocí ningún movimiento con fecha e importe' }
  }
  if (!MARCAS_BANCO.test(String(texto ?? '').slice(0, 4000))) {
    return {
      esExtracto: false, movimientos, rechazos, cadena,
      motivo: 'tiene fechas e importes, pero en ningún lado nombra un saldo, un banco ni un movimiento de cuenta: no lo doy por extracto bancario',
    }
  }
  const conSaldo = movimientos.filter((m) => m.saldo != null).length
  return {
    esExtracto: true, movimientos, rechazos, cadena,
    motivo: conSaldo ? 'nombra la cuenta y trae saldo corrido' : 'el texto nombra la cuenta/banco',
  }
}
