// «PRÓX. COBRO» DE UNA OBRA ÍNTEGRAMENTE COBRADA — EL VACÍO QUE TUMBÓ EL TIMER (24/08/2026).
//
// QUÉ PASÓ. `echegaray-flujo-caja.service` terminó en FAILURE desde la corrida de las 16:50 con:
//   «QUEDÓ PUBLICADO CON COLUMNA(S) DESPAREJA(S): I vacía en 1 de 7 obras (filas 25)».
// La fila 25 es «3.4 · San Francisco — Mampostería y cancha de pádel», cuyos cobros están TODOS
// cobrados (Cobranzas fila 95, $8.758.810, Cobrado el 21/08): no tiene próximo cobro y la fórmula
// devolvía un BLANCO — legítimo, pero indistinguible de una fórmula rota. Los datos quedaban
// publicados y sanos; lo que se caía era el servicio.
//
// POR QUÉ EL CONTROL NO ES EL CULPABLE. `columnasDesparejas` no puede saber si un vacío es legítimo:
// mira lo publicado, no el negocio. Quien sí lo sabe es la fórmula, y por eso el arreglo va ahí —
// una obra sin cobros pendientes publica el GUION, el mismo glifo con el que esta pestaña ya dice
// «no hay dato» en las columnas de contrato. Después de esto, una I vacía significa UNA sola cosa.
//
// SE EVALÚA LA FÓRMULA REAL, NO SU TEXTO. Un test que compara la cadena emitida contra la cadena
// esperada son las dos puntas del mismo lado: ya dejó pasar un #ERROR! a las 7 obras. Acá la fórmula
// que sale de la grilla se EJECUTA contra un Cobranzas modelado a mano.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaObras, columnasDesparejas, serialISO, GUION, ANCHO_OBRAS } from './obras-grilla.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'

const g = grillaObras({ obras: OBRAS_FUTURAS })
const COL_PROX = 8 // la I del cuadro 3
const filaDe = (clave) => g.bloques.find((b) => b.clave === clave).fProt
const proxCobroDe = (clave) => g.filas[filaDe(clave) - 1][COL_PROX]

const COBRADO_21 = serialISO('2026-08-21')
const PENDIENTE_27 = serialISO('2026-08-27')

/** Una fila de Cobranzas como la lee la grilla: G cliente · H OC · I concepto · N forma · O estado · Q fecha. */
const filaCobranzas = (n, { cliente, concepto, forma, estado, fecha }) => ({
  [`G${n}`]: cliente, [`H${n}`]: '', [`I${n}`]: concepto, [`N${n}`]: forma, [`O${n}`]: estado, [`Q${n}`]: fecha,
})

// Mampostería: todo cobrado el 21/08 (el caso real). Pisos Industriales: le queda uno pendiente para
// el 27/08 — está acá A PROPÓSITO, como testigo: si los criterios no engancharan NINGUNA fila, las
// dos obras darían el guion y el test pasaría sin haber probado nada.
const COBRANZAS = {
  ...filaCobranzas(5, { cliente: 'San Francisco', concepto: 'Mampostería y cancha de pádel', forma: 'Transferencia', estado: 'Cobrado', fecha: COBRADO_21 }),
  ...filaCobranzas(6, { cliente: 'San Francisco', concepto: 'Mampostería — certificación 2', forma: 'Efectivo', estado: 'Cobrado', fecha: COBRADO_21 }),
  ...filaCobranzas(7, { cliente: 'San Francisco', concepto: 'Pisos Industriales', forma: 'Transferencia', estado: 'Pendiente', fecha: PENDIENTE_27 }),
  ...filaCobranzas(8, { cliente: 'San Francisco', concepto: 'Instalaciones Eléctricas', forma: 'Transferencia', estado: 'Pendiente', fecha: PENDIENTE_27 }),
  ...filaCobranzas(9, { cliente: 'San Francisco', concepto: 'Entrepiso y escalera', forma: 'Transferencia', estado: 'Pendiente', fecha: PENDIENTE_27 }),
  ...filaCobranzas(10, { cliente: 'MESSINA', concepto: 'Playon Azufre', forma: 'Transferencia', estado: 'Pendiente', fecha: PENDIENTE_27 }),
  ...filaCobranzas(11, { cliente: 'MESSINA', concepto: 'BSA — obra civil', forma: 'Transferencia', estado: 'Pendiente', fecha: PENDIENTE_27 }),
  ...filaCobranzas(12, { cliente: 'Quattropani - Melisa García SAS', concepto: 'Salón Comercial', forma: 'Cheque', estado: 'Pendiente', fecha: PENDIENTE_27 }),
}
const ev = (formula) => evaluarFormula(formula, { hojas: { Cobranzas: COBRANZAS }, hoy: new Date(Date.UTC(2026, 7, 24)) })

test('una obra con TODO cobrado publica el guion, no un blanco: el blanco tumbaba el timer', () => {
  assert.equal(ev(proxCobroDe('sf-mamposteria')), GUION)
  assert.notEqual(ev(proxCobroDe('sf-mamposteria')), '', 'un blanco se lee igual que una fórmula rota')
})

test('la obra que SÍ tiene próximo cobro sigue publicando fecha y forma — el arreglo no la tocó', () => {
  // El testigo. Prueba dos cosas a la vez: que el arreglo no cambió el caso normal, y que los
  // criterios de la fórmula enganchan de verdad contra el Cobranzas modelado.
  assert.equal(ev(proxCobroDe('sf-pisos-industriales')), '27/08 · Transferencia')
})

test('el guion aparece SOLO cuando no queda nada pendiente: si la fila se despendiente, vuelve la fecha', () => {
  // El mismo Cobranzas con la fila 5 de Mampostería sin cobrar: la celda tiene que dejar de decir el
  // guion. Sin esto, un "—" fijo —una fórmula que perdiera sus criterios— pasaría el test de arriba.
  const conPendiente = { ...COBRANZAS, O5: 'Pendiente', Q5: PENDIENTE_27 }
  const v = evaluarFormula(proxCobroDe('sf-mamposteria'), { hojas: { Cobranzas: conPendiente }, hoy: new Date(Date.UTC(2026, 7, 24)) })
  assert.equal(v, '27/08 · Transferencia')
})

// ─────────────────────────────────────────────────────────────────────────────
// EL CONTROL QUE ABORTABA — SIGUE ABORTANDO POR LO QUE DEBE
// ─────────────────────────────────────────────────────────────────────────────

/** LO QUE EL ESCRITOR RELEE DEL SHEET, reproducido en frío: la columna del próximo cobro sale de
 *  EVALUAR la fórmula de cada obra contra el Cobranzas modelado —que es la cadena entera que produjo
 *  el FAILURE—, y las demás fórmulas se dan por resueltas con un número, que es lo que no se prueba
 *  acá. `sobreescribe` permite forzar una celda para ejercer el control en el sentido contrario. */
const publicado = (sobreescribe = {}) => g.filas.map((fila, i) => fila.map((v, c) => {
  if (typeof v !== 'string' || !v.startsWith('=')) return v
  if (c !== COL_PROX) return 1
  return (i + 1) in sobreescribe ? sobreescribe[i + 1] : ev(v)
}))
const FILAS_OBRA = g.bloques.map((b) => b.fProt)

test('LA CORRIDA COMPLETA: con seis obras con fecha y una cobrada, el control ya no tumba el servicio', () => {
  // Éste es el FAILURE del 24/08 reproducido de punta a punta: generador → fórmula evaluada →
  // control del escritor. Antes del arreglo devuelve exactamente el mensaje del journal —
  // «I vacía en 1 de 7 obras (filas 25)»— porque la única obra íntegramente cobrada publicaba blanco.
  assert.deepEqual(columnasDesparejas(g.filas, publicado(), FILAS_OBRA), [])
  assert.equal(publicado()[filaDe('sf-mamposteria') - 1][COL_PROX], GUION)
})

test('y el control NO pierde los dientes: una I vacía de verdad sigue tumbando la corrida', () => {
  // El defecto original de este control (13/08): `Próx. cobro` en blanco en 4 de 7 obras que SÍ
  // tenían plata por cobrar, sin que nada gritara. Si esta aserción se pusiera verde con `[]`, el
  // arreglo de arriba habría desarmado la alarma en vez de darle un dato que no la dispare.
  const fila = filaDe('sf-pisos-industriales')
  const desparejas = columnasDesparejas(g.filas, publicado({ [fila]: '' }), FILAS_OBRA)
  assert.deepEqual(desparejas, [{ columna: 'I', filas: [fila], de: g.bloques.length }])
  assert.ok(ANCHO_OBRAS > COL_PROX, 'la I entra en el ancho que el control recorre')
})
