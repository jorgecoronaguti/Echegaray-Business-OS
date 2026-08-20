// EL FORMATO QUE LE QUEDA A CADA CELDA CUANDO SE APLICAN TODAS LAS CAPAS, EN ORDEN.
//
// ═══ POR QUÉ ESTE ARCHIVO (14/08/2026) ═══
//
// `OBRAS!F` publicó `17449303,3143` donde iba `$17.449.303`, y ningún test lo vio venir porque todos
// miraban los requests de a uno. Cada uno era correcto: el contrato de columnas pedía moneda para la
// columna entera y, doscientas líneas más abajo, otro mecanismo pedía TEXTO para esa misma celda.
// Gana el último. **Un formateador que pinta en capas sólo se puede juzgar por el estado final.**
//
// Y el defecto SE ESCONDE DETRÁS DEL GUION: el tercer tramo del patrón de moneda dibuja el cero como
// "—", así que una columna entera puede estar mal formateada y verse impecable hasta el día que
// aparece el primer importe distinto de cero. Por eso el test no mira lo que se ve: mira si la celda
// DEVUELVE UN NÚMERO y con qué formato quedaría dibujada. Un cero mal formateado se pone rojo acá el
// día que se escribe, no el día que crece.
//
// LAS TRES PESTAÑAS SE ARMAN EN FRÍO: sin red, sin Postgres y sin escribir una celda. El `google` que
// reciben sólo junta los requests en el orden en que se mandarían.

import test from 'node:test'
import assert from 'node:assert/strict'
import { pintar, numerosDibujadosComoTexto, a1 } from '../lib/formato-en-capas.mjs'
import { grilla as grillaCaja, formatear as formatearCaja } from './caja-pestana.mjs'
import { ANCHO as ANCHO_CAJA } from '../lib/caja-grilla.mjs'
import { formatear as formatearAnexo } from './caja-anexo-pestana.mjs'
import { grillaAnexo, ANCHO_ANEXO, COL_NOTA } from '../lib/caja-anexo.mjs'
import { grilla as grillaImpuestos } from './impuestos-pestana.mjs'
import { formatear as formatearImpuestos } from '../lib/impuestos-piel.mjs'
import { ANCHO as ANCHO_IMPUESTOS } from '../lib/impuestos-grilla.mjs'

/** El cliente que no escribe nada: junta los requests de todos los lotes, en orden. */
function capturador() {
  const requests = []
  return {
    requests,
    google: {
      async spreadsheetBatchUpdate(_id, rs) { requests.push(...(rs || [])) },
      async getRowGroups() { return [] },
      async getConditionalFormats() { return [] },
      // Los gráficos de CAJA se dibujan con los rótulos del anexo; sin ellos el generador no los
      // dibuja y sigue. No pintan formato de número: no cambian lo que este test mide.
      async readSheetValues() { return null },
    },
  }
}

/** El veredicto legible: qué celda con número adentro quedaría dibujada como texto. */
const veredicto = (malas) => malas.map((m) => `${a1(m.fila, m.col)} → ${m.formato ?? 'sin formato'} · ${m.valor}`).join('\n  ')

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CAJA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const REFS_CAJA = {
  bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito',
  chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 },
}

test('CAJA: ninguna celda que devuelve un número queda dibujada como texto', async () => {
  // Medido sobre el archivo real el 14/08 con `readSheetUserFormats`: CERO celdas numéricas en TEXTO.
  // Este test es el trinquete de esa medición. Lo que la protege es el contrato de columnas —las diez
  // columnas se repintan enteras en cada corrida— y este test se pone rojo el día que alguien agregue
  // una columna sin sumarla a COLS_PLATA/COLS_FECHA, que es exactamente como empezó el defecto de OBRAS.
  const g = grillaCaja(new Map(), REFS_CAJA)
  const { requests, google } = capturador()
  await formatearCaja(google, 1, g, null)
  const lienzo = pintar(requests, { alto: g.filas.length, ancho: ANCHO_CAJA })
  const malas = numerosDibujadosComoTexto(g.filas, lienzo)
  assert.deepEqual(malas, [], `CAJA dibuja como texto:\n  ${veredicto(malas)}`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// _CAJA_ANEXO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const REFS_ANEXO = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', cierre: 60, inicio: 50, cab: 5 }
const CARTERA = {
  origen: 'test',
  enCartera: [{ numero: '00000514', emisor: 'Mineral Del Río' }],
  endosados: [{ numero: '00000313', beneficiario: 'ALUMETAL S.A' }],
}
const anexo = () => grillaAnexo({ refs: REFS_ANEXO, cartera: CARTERA, conceptosCiegos: ['descubierto', 'Comisiones', 'Impuesto al cheque'] })

test('_CAJA_ANEXO: los CONTADORES de "Cuántos" no se dibujan como prosa', async () => {
  // EL DEFECTO QUE ATRAPA, MEDIDO EN EL ARCHIVO REAL EL 14/08. `readSheetGrid` sobre `_CAJA_ANEXO`:
  // G60, G61, G62 y G63 —los cuatro contadores del bloque "A6 · VENCIDO SIN CONCILIAR"— con
  // `numberFormat: TEXT` y una fórmula SUMPRODUCT adentro. Tres valían 0 y el cuarto 3, así que se
  // veían "bien"; el día que el cuarto pase de 999 se va a dibujar "1234" en vez de "1.234", y a la
  // izquierda, pegado a la prosa.
  //
  // LA CAUSA NO ES EL OLFATEADOR —una fórmula nunca le parece un rótulo— sino el contrato de la última
  // columna: "es PROSA: texto, gris, con ajuste. Nunca plata". Es verdad para las 240 celdas de esa
  // columna menos estas cuatro, que llevan un CONTEO. Quien las escribe declara ahora que son números.
  const g = anexo()
  const { requests, google } = capturador()
  await formatearAnexo(google, 1, g)
  const lienzo = pintar(requests, { alto: g.filas.length, ancho: ANCHO_ANEXO })
  const malas = numerosDibujadosComoTexto(g.filas, lienzo)
  assert.deepEqual(malas, [], `_CAJA_ANEXO dibuja como texto:\n  ${veredicto(malas)}`)
})

test('_CAJA_ANEXO: el bloque declara QUÉ FILAS cuentan, y son las que tienen conteo en G', () => {
  // El formato sale de una declaración de quien escribe el valor, no de un rango escrito a mano en el
  // formateador: si mañana entra un quinto control vencido, la fila entra sola. Este test lo ata a la
  // grilla real — si `fCuantos` apuntara a otro lado, apuntaría a celdas sin conteo.
  const g = anexo()
  assert.ok(Array.isArray(g.fCuantos) && g.fCuantos.length === 2, 'el bloque tiene que declarar sus filas de conteo')
  const [f0, f1] = g.fCuantos
  assert.ok(f1 >= f0, `${f0}..${f1} no es un rango`)
  for (let f = f0; f <= f1; f++) {
    const v = String(g.filas[f - 1]?.[COL_NOTA - 1] ?? '')
    assert.match(v, /^=SUMPRODUCT\(/, `G${f} tendría que ser un conteo y dice "${v.slice(0, 40)}"`)
  }
  // Y el encabezado "Cuántos" queda AFUERA: es un rótulo, y con formato de número se dibujaría mal.
  assert.equal(String(g.filas[f0 - 2]?.[COL_NOTA - 1] ?? ''), 'Cuántos')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// IMPUESTOS Y FINANCIEROS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const C_COMPRAS = { total: 'O', concepto: 'L', fecha: 'AD', rubro: 'AB', fechaPrev: 'Q', detalle: 'K' }
const impuestos = () => grillaImpuestos({
  anio: 2026,
  C: C_COMPRAS,
  hoy: '2026-08-06',
  iibb: [1, 2, 3, 4, 5, 6].map((m) => ({ periodo: `2026-0${m}` })),
  ivaOficial: [1, 2, 3, 4, 5, 6].map((m) => ({
    periodo: `2026-0${m}`, debito: 1, credito: 1, a_pagar_efectivo: 0, libre_disp: 1e6,
    fecha_presentacion: '19/02/2026', nro_transaccion: '1',
  })),
  planes: [{
    nombre: 'Plan F931 W303094', patron: 'W303094', campo: 'concepto', cuotas: 3, total: 7484628,
    monto_cuota: 2494876, porMes: [0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0, 0],
  }],
  proy: {
    meses: [8, 9, 10, 11, 12], ultimoMesConDato: 7, libreDisp: 7050036, alicuotaVigente: 0.21,
    brutoDebito: (m) => [`BRUTO_DEB_${m}`], brutoCredito: (m) => [`BRUTO_CRE_${m}`], supuesto: 'el supuesto',
  },
})

test('Impuestos y Financieros: ninguna celda que devuelve un número queda dibujada como texto', async () => {
  // Medido sobre el archivo real el 14/08: CERO celdas numéricas en TEXTO en B..N. Lo que la protege
  // es que la moneda se repone sobre B4:N(n) ENTERA en cada corrida —incluidas las celdas vacías—, así
  // que ninguna capa posterior puede dejar estado. El test lo vuelve verificable: si mañana alguien
  // acota ese repintado a "las filas que tienen dato", la celda que hoy vale cero se queda con el
  // TEXTO de la corrida anterior y este test lo dice antes de que la pestaña lo muestre.
  const g = impuestos()
  const { requests, google } = capturador()
  await formatearImpuestos(google, 'archivo-de-prueba', 1, g, 400)
  const lienzo = pintar(requests, { alto: g.filas.length, ancho: ANCHO_IMPUESTOS })
  const malas = numerosDibujadosComoTexto(g.filas, lienzo)
  assert.deepEqual(malas, [], `Impuestos dibuja como texto:\n  ${veredicto(malas)}`)
})
