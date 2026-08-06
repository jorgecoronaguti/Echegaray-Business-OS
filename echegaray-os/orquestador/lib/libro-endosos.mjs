// EL VALOR ENDOSADO — el cobro que se registró y que nunca va a pasar por la cuenta.
//
// ═══ QUÉ ES UN ENDOSO, ECONÓMICAMENTE ═══
//
// Un cliente paga con un echeq. El echeq entra: la obligación del cliente se canceló y Cobranzas hace
// bien en registrarlo como cobrado. Después ese mismo echeq se ENDOSA a un proveedor para pagarle.
// Desde ese momento el valor es del proveedor: el día de pago la plata va a acreditar en SU cuenta,
// no en la nuestra. **Nunca va a haber un ingreso en el extracto por ese valor.**
//
// ═══ EL DEFECTO MEDIDO (06/08/2026) ═══
//
// Cobranzas f43 y f48: LA ESTRELLA / ALIMENTOS DEL SUR, $10.000.000 cada una, estado "Cobrado", con
// fecha de cobro 15/08 y 31/08 — FUTURAS. `_CHEQUES_RAW` f11 y f12 dicen la verdad: echeq 90020100 y
// 90020101, mismos importes, mismas fechas de pago, estado **Endosado**.
//
// El filtro que ya existía en `deCobranzas` mira la columna BB de Cobranzas ("Valor banco", prefijo
// "ENDOSADO"), que es donde el dueño marca el endoso a mano. En el archivo vivo esas dos celdas están
// VACÍAS: el dato del endoso está en la nota de la fila ("Endosado a Alumetal 10/7") y, estructurado,
// en `_CHEQUES_RAW`. Con BB vacía el filtro no dispara y el libro emitía $20.000.000 de ingreso REAL
// con fecha de agosto.
//
// ═══ POR QUÉ SE EXCLUYE Y NO SE EMITE UN PAR ESPEJO ═══
//
// La otra representación posible era emitir el endoso como un par REAL (ingreso + egreso "pago con
// echeq endosado") en la fecha de endoso, neto $0. Se descartó por tres razones MEDIDAS, no por
// preferencia:
//
//   1. EL EGRESO YA ESTÁ EN EL LIBRO. Compras f658, f659 y f669 (Alumetal, $19.890.228,54 en total)
//      tienen fecha de caja 46213 = 10/07 — la misma fecha que la nota del endoso— y estado Pagado.
//      Ése es el pago que los dos echeq cancelaron. Un egreso espejo lo contaría dos veces.
//   2. NO EXISTE UNA FECHA DE ENDOSO ESTRUCTURADA. Ni Cobranzas ni `_CHEQUES_RAW` la tienen: sólo
//      está en el texto libre de una nota ("10/7", sin año). Fechar un movimiento parseando eso es
//      fabricar precisión.
//   3. ES EL CRITERIO QUE EL ARCHIVO YA ELIGIÓ. `formulaCobranzas` excluye el endoso de las líneas de
//      ingreso del cash flow con `MARCA_ENDOSADO`. Dos criterios distintos para el mismo hecho es
//      exactamente la duplicación que el Libro Canónico vino a matar.
//
// LA EXCLUSIÓN NO ES SILENCIOSA. `deCobranzas` devuelve las filas excluidas con su importe para que
// el generador del libro y el portón las publiquen: una plata que desaparece del cuadro sin que nadie
// diga cuánta es indistinguible de un error.
//
// ═══ LA CLAVE DEL EMPAREJAMIENTO, Y POR QUÉ NO ES EL NÚMERO ═══
//
// La trampa conocida del repo es que **un cheque se identifica por (instrumento, número)** y el
// número solo no alcanza. Acá no se identifica un cheque: se identifica QUÉ FILA DE COBRANZAS
// corresponde a un valor endosado — y Cobranzas no trae número de valor por ninguna columna. Lo que
// hay es (importe, fecha de pago), y la réplica tampoco distingue especie (su columna "Tipo" dice
// recibido/emitido, no cheque/echeq).
//
// Por eso el emparejamiento exige ser UNO A UNO: si un valor endosado matchea dos filas de Cobranzas,
// o una fila matchea dos valores, no se excluye nada y se declara la ambigüedad. Excluir de más borra
// un cobro real del cuadro; excluir de menos deja el defecto visible. El segundo se puede ver.

// `colIndex` sale de rubro-caja.mjs, que es donde ya vivía: importarlo de `libro-extractores.mjs`
// —que re-exporta el mismo cálculo con otro nombre— cerraría un ciclo, porque el extractor de
// Cobranzas importa este archivo.
import { colIndex } from './rubro-caja.mjs'
import { COL as COL_RAW, FILA0 as FILA0_RAW } from '../scripts/cheques-raw-pestana.mjs'

/** El estado que `importar-cheques.mjs` escribe en `_CHEQUES_RAW` cuando el valor se entregó. */
export const ENDOSADO = 'Endosado'

/** Los instrumentos que pueden endosarse. Una transferencia cobrada no se endosa: ya es plata. */
export const ENDOSABLES = Object.freeze(['cheque', 'echeq'])

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/**
 * NÚCLEO PURO: los valores ENDOSADOS de la réplica de cheques.
 *
 * Sólo los RECIBIDOS: un valor emitido por nosotros no se endosa, se debita. La condición de estado es
 * la misma constante que escribe el importador, comparada sin distinguir mayúsculas porque el rótulo
 * viaja desde la pantalla del banco.
 *
 * @param {Array<Array>} filas `_CHEQUES_RAW` entera, UNFORMATTED_VALUE
 * @returns {Array<{numero:string, importe:number, fecha:number, librador:string, fila:number}>}
 */
export function endososDeCartera(filas = [], { fila0 = FILA0_RAW } = {}) {
  const i = (letra) => colIndex(letra)
  const out = []
  for (let r = fila0 - 1; r < filas.length; r++) {
    const f = filas[r] ?? []
    if (txt(f[i(COL_RAW.tipo)]).toLowerCase() !== 'recibido') continue
    if (txt(f[i(COL_RAW.estado)]).toLowerCase() !== ENDOSADO.toLowerCase()) continue
    const importe = num(f[i(COL_RAW.importe)])
    const fecha = num(f[i(COL_RAW.fechaPago)])
    if (!importe || fecha === null) continue
    out.push({
      numero: txt(f[i(COL_RAW.numero)]),
      importe,
      fecha,
      librador: txt(f[i(COL_RAW.librador)]),
      fila: r + 1,
    })
  }
  return out
}

/**
 * NÚCLEO PURO: qué filas de Cobranzas corresponden a un valor endosado. UNO A UNO O NADA.
 *
 * @param {Array<{fila:number, importe:number, fecha:number, instrumento:string}>} candidatas las
 *        filas de Cobranzas ya normalizadas: cobradas, con importe positivo y con un instrumento
 *        endosable. El extractor decide cuáles llegan hasta acá; este núcleo sólo empareja.
 * @param {Array} endosos de `endososDeCartera`
 * @returns {{excluidas:Map<number,object>, ambiguos:Array<{motivo:string, importe:number}>}}
 */
export function emparejarEndosos(candidatas = [], endosos = []) {
  const excluidas = new Map()
  const ambiguos = []
  for (const e of endosos) {
    const matches = candidatas.filter((c) => c.importe === e.importe && c.fecha === e.fecha)
    if (!matches.length) continue
    if (matches.length > 1) {
      ambiguos.push({
        importe: e.importe,
        motivo: `el valor ${e.numero || '(sin número)'} de $${e.importe} matchea ${matches.length} filas de `
          + `Cobranzas (${matches.map((m) => m.fila).join(', ')}) — no excluyo ninguna`,
      })
      continue
    }
    const c = matches[0]
    // Un valor se consume UNA sola vez, y una fila la reclama UN solo valor: si dos endosos idénticos
    // (mismo importe, misma fecha) apuntaran a la misma fila, la segunda vuelta la encuentra tomada y
    // lo declara en vez de "confirmar" dos veces la misma exclusión.
    if (excluidas.has(c.fila)) {
      ambiguos.push({
        importe: e.importe,
        motivo: `dos valores endosados apuntan a Cobranzas f${c.fila} — hay un cobro sin emparejar`,
      })
      continue
    }
    excluidas.set(c.fila, { ...c, valor: e })
  }
  return { excluidas, ambiguos }
}
