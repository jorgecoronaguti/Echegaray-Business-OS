// COBRANZAS → movimientos de ingreso. Vive aparte desde el 06/08.
//
// POR QUÉ SE MUDÓ: `libro-extractores.mjs` llegó a 521 líneas y el tope del repo es 500. Se movió el
// extractor que ESTABA CRECIENDO —el de Cobranzas, que ahora cruza contra `_CHEQUES_RAW`— y no un
// pedazo cualquiera: el que se toca es el que conviene tener solo. `libro-extractores.mjs` lo
// re-exporta, así que ningún llamador cambia.

import { movimiento, ENTRA, SALE, estadoContraCorte } from './libro-movimientos.mjs'
import { columnasObligatorias, resolverColumnas } from './compras-columnas.mjs'
import { MARCA_ENDOSADO, COL_VALOR_BANCO } from './cash-flow-lineas.mjs'
import { colIndex } from './rubro-caja.mjs'
import { emparejarEndosos, ENDOSABLES } from './libro-endosos.mjs'
import { valuarEnPesos, COL_MONEDA_COBRANZAS } from './cobranzas-contrato.mjs'
import { RANGO_TC } from './tipo-cambio.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/** La forma de cobro, traducida al instrumento del libro. "eCheq" contiene "cheque": el orden manda. */
function instrumentoDeCobro(forma) {
  const f = txt(forma).toLowerCase()
  if (/echeq/.test(f)) return 'echeq'
  if (/cheque/.test(f)) return 'cheque'
  if (/efectivo/.test(f)) return 'efectivo'
  if (/transfer/.test(f)) return 'transferencia'
  return 'desconocido'
}

/**
 * COBRANZAS → movimientos de ingreso.
 *
 * LA FECHA QUE MANDA: la real si está cobrado, la esperada si no. Los CINCO estados de la pestaña se
 * reducen a dos del libro — Cobrado = REAL, Pendiente/Proyectado/Facturado = PROYECTADO — y CANCELAR
 * no es un movimiento: es una fila que el dueño anuló. Mezclar los cinco en un solo filtro ya produjo
 * un reporte equivocado una vez (los $20,1M "cobrados con fecha futura" que eran echeqs).
 *
 * ═══ UN VALOR ENDOSADO NO VA A ENTRAR NUNCA — Y SE MIRA POR DOS PUERTAS ═══
 *
 * Dos echeq de LA ESTRELLA por $10.000.000 cada uno se entregaron a Alumetal para pagarle. Cobranzas
 * los registra con fecha de cobro 15/08 y 31/08 —y hace bien, el echeq entró— pero esa plata no va a
 * pasar por la cuenta corriente jamás.
 *
 *   · PUERTA 1 · la columna BB ("Valor banco") con el prefijo `MARCA_ENDOSADO`. Es donde el dueño lo
 *     marca a mano y es el MISMO criterio de `formulaCobranzas`, importado y no copiado.
 *   · PUERTA 2 · `_CHEQUES_RAW` con estado "Endosado" (06/08). La puerta 1 sola no alcanzaba: medido
 *     sobre el archivo vivo, BB43 y BB48 están VACÍAS —el endoso quedó escrito en la nota de la fila,
 *     "Endosado a Alumetal 10/7"— y el filtro no disparaba. La réplica de cheques SÍ lo tiene
 *     estructurado, y es la fuente que se actualiza sola desde el banco.
 *
 * El porqué de excluir en vez de emitir un par espejo, y por qué el emparejamiento es uno-a-uno,
 * están en `libro-endosos.mjs` — con las tres filas de Compras que ya cuentan el egreso.
 *
 * ═══ UN COBRO EN DÓLARES NO ES UN COBRO EN PESOS (13/08/2026) ═══
 *
 * Cobranzas tiene una columna "Moneda" y este extractor no la miraba: `movimiento()` grababa `ARS` por
 * defecto y el monto nativo entraba al Libro como si fueran pesos. MEDIDO: Cobranzas f62 (ID 58),
 * Quattropani · Melisa García SAS, anticipo del 50%, U$S 15.400. `Obras!D14` lo valúa en $22.984.870 y
 * el Cash Flow lo contaba $15.400 — $22.969.470 de menos en los dos cuadros, a 1.492× de distancia.
 *
 * La valuación NO se escribe acá: es `valuarEnPesos`, la misma columna y el mismo `TIPO_CAMBIO_USD`
 * que usa la fórmula de la pestaña. Y se hace en la PRIMERA pasada, antes del cruce de endosos, porque
 * `_CHEQUES_RAW` está en pesos: emparejar un importe nativo contra esa réplica no encontraría nunca su
 * valor. Todo lo que sigue —el libro, los excluidos— habla en pesos.
 *
 * SIN VALUACIÓN NO SE GRABA LA FILA: SE ABORTA. Una moneda que no se entiende ("EUR" tipeado mañana) o
 * un tipo de cambio que no se pudo leer dejan la corrida caída nombrando la fila. Grabar el monto
 * nativo "por las dudas" no es degradar, es repetir el defecto con otro código de moneda.
 *
 * @param {Array<Array>} filas de Cobranzas, leída HASTA BB (si se lee menos, el endoso no se ve)
 * @param {number|null} corte
 * @param {object} opciones
 * @param {number|null} opciones.colValorBanco el índice de "Valor banco"; por defecto se resuelve por
 *        encabezado y, si no está, cae en la BB que declara `COL_VALOR_BANCO`.
 * @param {number|null} opciones.tipoCambio el `TIPO_CAMBIO_USD` del archivo. Se exige SÓLO si hay
 *        filas en dólares: pedirlo siempre haría fallar una corrida que no tiene nada que valuar.
 * @param {number|null} opciones.colMoneda el índice de "Moneda"; por defecto, por encabezado y si no
 *        está, la AA que declara `COL_MONEDA_COBRANZAS`.
 * @param {Array} opciones.endosos los valores endosados de `_CHEQUES_RAW` (`endososDeCartera`).
 * @param {Array|null} opciones.excluidos si se pasa un array, recibe una entrada por fila excluida
 *        con su importe y su motivo. Una plata que desaparece del cuadro sin que nadie diga cuánta
 *        es indistinguible de un error.
 */
export function deCobranzas(filas = [], corte = null, {
  colValorBanco = null, colMoneda = null, tipoCambio = null, endosos = [], excluidos = null,
} = {}) {
  const enc = filas[3] ?? [] // fila 4: encabezado; los datos arrancan en la 5
  // Encabezado real de la fila 4, verificado el 05/08. El importe que mueve la caja es el TOTAL a
  // cobrar NETO de retenciones: el bruto incluye plata que nunca va a llegar a la cuenta (las
  // retenciones se sufren en el cobro — son los $7,38M que ninguna pestaña miraba).
  const c = columnasObligatorias(enc, {
    cliente: 'Obra / Cliente', estado: 'Estado', importe: 'TOTAL a cobrar (neto de retenciones)',
    fechaEsperada: 'Fecha cobro', fechaReal: 'Fecha cobro', forma: 'Forma de Cobro',
  }, 'Cobranzas')
  // Por encabezado primero: una columna fija ya rompió en silencio. La BB de `COL_VALOR_BANCO` es el
  // respaldo declarado, porque el rótulo puede no estar escrito en la fila del encabezado.
  const iBB = colValorBanco ?? (resolverColumnas(enc, { vb: 'Valor banco' }).idx.vb
    ?? colIndex(/([A-Z]+)/.exec(COL_VALOR_BANCO)[1]))
  // La moneda, con el mismo criterio: rótulo primero, letra declarada como respaldo. El rótulo lo
  // custodia además `scripts/obras-pestana.mjs`, que ABORTA la publicación si no está en el encabezado
  // de esta misma pestaña — o sea que su desaparición no puede pasar callada por el pipeline.
  const iMon = colMoneda ?? (resolverColumnas(enc, { mon: 'Moneda' }).idx.mon ?? colIndex(COL_MONEDA_COBRANZAS))

  // ── PRIMERA PASADA: normalizar las filas vivas ──────────────────────────────────────────────────
  const vivas = []
  for (let i = 4; i < filas.length; i++) {
    const f = filas[i] ?? []
    const estadoTxt = txt(f[c.estado]).toLowerCase()
    if (!estadoTxt || /cancelar/.test(estadoTxt)) continue
    const importe = num(f[c.importe])
    if (importe === null || importe === 0) continue
    const cobrado = /^cobrado$/.test(estadoTxt)
    const fecha = cobrado ? (num(f[c.fechaReal]) ?? num(f[c.fechaEsperada])) : num(f[c.fechaEsperada])
    if (fecha === null) continue
    // O SE VALÚA O SE ABORTA — nunca el monto nativo. El mensaje lleva la fila adentro porque una
    // corrida caída que no dice DÓNDE mirar se arregla apagando el control, que es peor que el defecto.
    const val = valuarEnPesos(importe, f[iMon], tipoCambio)
    if (val.motivo) {
      throw new Error(`libro-extractores(Cobranzas): la fila ${i + 1} (${txt(f[c.cliente])}) ${val.motivo}. `
        + `El importe entraría al libro como PESOS y el cuadro lo contaría mal —es el defecto de los `
        + `U$S 15.400 de Quattropani, $22.969.470 de menos—. Corregí la columna "Moneda" o publicá `
        + `${RANGO_TC}: no extraigo.`)
    }
    vivas.push({
      fila: i + 1,
      importe: val.pesos,
      moneda: val.moneda,
      importeOrigen: importe,
      tipoCambio: val.tipoCambio,
      fecha,
      cobrado,
      cliente: txt(f[c.cliente]),
      instrumento: instrumentoDeCobro(f[c.forma]),
      // Se compara con LEFT, igual que la fórmula: la celda dice "ENDOSADO A ALUMETAL", no "ENDOSADO".
      marcadoBB: txt(f[iBB]).toUpperCase().startsWith(MARCA_ENDOSADO),
    })
  }

  // ── LA SEGUNDA PUERTA: el emparejamiento contra `_CHEQUES_RAW` ─────────────────────────────────
  // Sólo se ofrecen como candidatas las que la puerta 1 no marcó ya, las cobradas, y las que se
  // cobraron con un valor endosable: una transferencia acreditada no se endosa, ya es plata.
  const candidatas = vivas.filter((v) => !v.marcadoBB && v.cobrado && v.importe > 0
    && ENDOSABLES.includes(v.instrumento))
  const { excluidas, ambiguos } = emparejarEndosos(candidatas, endosos)
  if (excluidos) {
    for (const a of ambiguos) excluidos.push({ fila: null, importe: a.importe, motivo: a.motivo })
  }

  const out = []
  for (const v of vivas) {
    if (v.marcadoBB) {
      excluidos?.push({ fila: v.fila, importe: v.importe, motivo: `marcado "${MARCA_ENDOSADO}" en Valor banco` })
      continue
    }
    const endosada = excluidas.get(v.fila)
    if (endosada) {
      excluidos?.push({
        fila: v.fila,
        importe: v.importe,
        motivo: `_CHEQUES_RAW f${endosada.valor.fila} declara el valor ${endosada.valor.numero} como Endosado`,
      })
      continue
    }
    out.push(movimiento({
      fecha: v.fecha,
      signo: ENTRA,
      // ═══ UN COBRO NEGATIVO ES PLATA QUE VUELVE, NO PLATA QUE ENTRA (06/08) ═══
      //
      // `movimiento()` guarda el importe SIEMPRE en magnitud y el signo aparte, así que un −$96.800
      // con `signo: ENTRA` fijo se convertía en +$96.800: el ajuste sumaba en vez de restar y el
      // error valía el DOBLE del monto. `deCompras` ya invertía el signo para la nota de crédito;
      // acá faltaba el espejo, y el espejo no es simetría decorativa — es la misma aritmética.
      //
      // MEDIDO EN VIVO: Cobranzas f58, MACRO CONSTRUCCIONES, −$96.800 con fecha 7/08. El Libro lo
      // emitía como ingreso REAL de +$96.800 y la semana del 3/08 mostraba "· Cobranzas $329.120"
      // donde la fuente dice $135.520. La línea "Movimientos posteriores al corte" de CAJA —que usa
      // SUMIFS sobre la misma columna— lo sumaba bien: dos productores del mismo hecho, uno mal.
      ...(v.importe < 0 ? { signo: SALE } : {}),
      // El importe del libro está SIEMPRE en pesos —es lo que suman las vistas—; `moneda`,
      // `importeOrigen` y `tipoCambio` guardan de dónde salió, para poder desmentir el número.
      importe: Math.abs(v.importe),
      moneda: v.moneda,
      importeOrigen: Math.abs(v.importeOrigen),
      tipoCambio: v.tipoCambio,
      concepto: v.cliente,
      contraparte: v.cliente,
      // La misma celda es la contraparte Y el cliente: en un cobro son la misma persona. Se manda a
      // las dos porque `contraparte` guarda el texto crudo (el que se lee en el detalle) y `cliente`
      // guarda el canónico (el que agrupa) — y el crudo no se pierde al canonizar.
      cliente: v.cliente,
      rubro: 'Cobranzas',
      estado: estadoContraCorte(v.cobrado ? 'REAL' : 'PROYECTADO', v.fecha, corte),
      instrumento: v.instrumento,
      origen: { pestana: 'Cobranzas', fila: v.fila },
    }))
  }
  return out
}
