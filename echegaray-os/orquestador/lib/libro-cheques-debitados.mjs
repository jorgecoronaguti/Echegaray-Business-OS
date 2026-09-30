// CHEQUES YA DEBITADOS DEL REGISTRO — los testigos que el libro no emite pero el extracto sí ve.
//
// ═══ POR QUÉ EXISTE (30/09/2026) ═══
//
// `deChequesEmitidos` no emite el cheque con DEBITADO = SI: su plata ya está en el saldo del banco.
// Correcto para el libro, pero el DÉBITO de ese cheque sigue en el extracto, y `chequesCubiertosPorBanco`
// lo veía como un débito sin dueño. Medido: FISICO 328 (Corralón, $1.000.000, DEBITADO = SI) salió el
// 09/09 como «Canje interno recibido 24 hs» ref 328; el ECHEQ 390 (SURI, $1.000.000, emitido el 30/09,
// vivo) era el único pendiente del mismo importe, se "cubrió" con el débito del 328 y desapareció del
// COMPROMETIDO del Cash Flow. Un débito que un cheque ya debitado explica no puede explicar otro.
//
// Acá se extraen esos cheques para que consuman su débito ANTES que los pendientes. La réplica del
// extracto (`_BANCO_RAW`) no trae la referencia del banco —el contrato de columnas lo fija CAJA—,
// así que el testigo es importe + fecha plausible; cuando la referencia llegue al libro, este módulo
// es el lugar donde se la compara.
import { resolverColumnas } from './compras-columnas.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/**
 * La columna «fecha de emisión» del registro, o null si el encabezado no la trae: es un dato de
 * refinamiento (excluye candidatos imposibles), no una condición para extraer — sin ella el
 * extractor se comporta como antes.
 */
export function columnaFechaEmision(encabezado = []) {
  return resolverColumnas(encabezado, { e: 'fecha de emisión' }).idx.e ?? null
}

/**
 * NÚCLEO PURO: las filas del registro marcadas DEBITADO = SI, con lo que hace falta para reconocer
 * su débito en el extracto. Importe en magnitud.
 * @returns {Array<{instrumento:string, numero:string, importe:number, fechaEmision:number|null, fechaPago:number|null, fila:number}>}
 */
export function chequesYaDebitadosDelRegistro(filas = [], { fila0 } = {}) {
  const enc = filas[fila0 - 2] ?? []
  const { idx, faltan } = resolverColumnas(enc, {
    tipo: 'Tipo', numero: 'Nro', importe: 'Monto', fechaPago: 'fecha de pago', debitado: 'DEBITADO',
  })
  if (faltan.length) return []
  const cEmision = columnaFechaEmision(enc)
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[idx.importe])
    if (!importe || !/^si$/i.test(txt(f[idx.debitado]))) continue
    out.push({
      instrumento: /echeq/i.test(txt(f[idx.tipo])) ? 'echeq' : 'cheque',
      numero: txt(f[idx.numero]),
      importe: Math.abs(importe),
      fechaEmision: cEmision === null ? null : num(f[cEmision]),
      fechaPago: num(f[idx.fechaPago]),
      fila: i + 1,
    })
  }
  return out
}
