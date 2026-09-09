// LA JERARQUÍA DE LECTURA DE "IMPUESTOS Y FINANCIEROS", probada sin Google.
//
// Todo lo de acá salió de MIRAR la pestaña renderizada (PDF del 06/08), no de leer sus celdas: los
// defectos que se prueban no aparecen en ningún valor. Cada test nombra el que atrapa.

import test from 'node:test'
import assert from 'node:assert/strict'
import { tratamientoDeFilas, requestsDeJerarquia } from './impuestos-piel.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

// EL HERO DE HOY: tres renglones «⇒ rótulo | cifra» y el separador. Sin titular y sin sub-líneas
// (09/09/2026). La grilla de abajo CONSERVA sub-ítems y notas fuera del hero a propósito: son las
// formas de fila que esta piel tiene que seguir sabiendo tratar en el resto del libro.
const HERO = { desde: 4, hasta: 7 }
/** Una fila del generador: rótulo, importe, y el resto del ancho declarado como propio. */
const fila = (rotulo, importe) => {
  const f = [rotulo, importe === undefined ? VACIO : importe]
  while (f.length < 15) f.push(VACIO)
  return f
}
const vacia = () => Array(15).fill(VACIO)

/** La pestaña, en miniatura pero con las mismas formas de fila que la real. */
const GRILLA = [
  fila('Impuestos y financiero'),
  fila('Qué se le debe al fisco'),
  vacia(),
  fila('⇒ A pagar en 30 días', '=$B$26+$B$27'),
  fila('⇒ Deuda fiscal y financiera', '=$B$92+CARGAS_PLANES_SIN_PAGAR'),
  fila('⇒ A favor en el fisco', '=$H$56+$G$66'),
  vacia(),
  fila('   · un sub-ítem de otro bloque del libro', '=$B$92'),
  fila('   · y otro más', '=$B$93'),
  fila('Prendario · cuotas por vencer', '=$B$92'),
  fila('Otra fila normal del detalle', '=$H$56'),
  fila('Y una más', '=$G$66'),
  vacia(),
  fila('1 · RIESGO Y PROYECCIÓN — 30 · 60 · 90 DÍAS'),
  fila('⚠ vencido s/verificar al 06/08 · ver extracto', '=$B$24+$B$25'),
  fila('⚠ sin fecha cierta · 25.413 + Ant. Ganancias (90d)', '=$I$77'),
  vacia(),
  fila('⚠ Impuesto de sellos', 's/d'),
  fila('⚠ Los pagos de IVA e IIBB no están cargados en Compras.'),
]

test('una ALARMA lleva plata adentro; una limitación declarada, no', () => {
  // ═══ EL DEFECTO (06/08, mirando el PDF) ═══
  //
  // La piel compartida clasifica como TOTAL todo lo que empieza con "⚠", así que las seis
  // limitaciones del bloque de cierre salían en NEGRITA ROJA con una regla encima cada una. Seis
  // alarmas al pie de la pestaña no son seis alarmas: son la lección de que las alarmas de esta
  // pestaña se ignoran. La diferencia es si el renglón trae un importe calculado o dice que no hay dato.
  const t = tratamientoDeFilas(GRILLA, HERO)
  assert.deepEqual(t.alarmas, [15, 16], 'las dos del riesgo llevan una suma de celdas: deciden algo')
  assert.deepEqual(t.notas, [18, 19], '"s/d" y la prosa del cierre no son alarmas')
})

test('los TRES renglones del hero reciben el mismo peso: ninguno es el titular', () => {
  // ═══ LO QUE CAMBIÓ (09/09/2026) ═══
  //
  // El hero tenía un titular que la piel agrandaba y tres totales por debajo. Ahora son tres
  // preguntas del mismo rango —cuánto pagar, cuánto se debe, cuánto se tiene a favor— y ninguna
  // manda sobre las otras: las tres se dibujan igual, como en «Cargas Sociales» y «Nómina».
  const t = tratamientoDeFilas(GRILLA, HERO)
  assert.deepEqual(t.totalesHero, [4, 5, 6], 'los tres renglones del hero, sin titular que los opaque')
})

test('los desgloses se apagan: no compiten con el total del que cuelgan', () => {
  const t = tratamientoDeFilas(GRILLA, HERO)
  assert.deepEqual(t.subitems, [8, 9])
  const rq = requestsDeJerarquia(1, { filas: GRILLA, hero: HERO })
  const delSub = rq.find((r) => r.repeatCell?.range?.startRowIndex === 7)
  assert.equal(delSub.repeatCell.cell.userEnteredFormat.textFormat.fontSize, 9)
  assert.equal(delSub.repeatCell.cell.userEnteredFormat.textFormat.bold, false)
})

test('EL CENTINELA NO ES CONTENIDO: una fila de separación se reconoce como vacía', () => {
  // ═══ EL DEFECTO QUE ESTE TEST ATRAPA ═══
  //
  // `VACIO` vale una cadena NO vacía ("es mi celda y va vacía"), y los generadores rellenan con él
  // todo el ancho que poseen. Cualquier lectura ingenua (`String(x).trim()`) ve esas filas como
  // llenas: los separadores no se detectan, no reciben aire, y —en la piel compartida— ningún título
  // de sección se reconoce como tal. Si alguien vuelve a comparar contra cadena vacía, esto se cae.
  const t = tratamientoDeFilas(GRILLA, HERO)
  assert.deepEqual(t.separadores, [3, 7, 13, 17])
  const rq = requestsDeJerarquia(1, { filas: GRILLA, hero: HERO })
  const aire = rq.filter((r) => r.updateDimensionProperties?.properties?.pixelSize > 21)
  assert.equal(aire.length, 4, 'las cuatro filas de separación respiran; ninguna otra')
})

test('sin hero declarado no se inventa jerarquía', () => {
  const t = tratamientoDeFilas(GRILLA, null)
  assert.deepEqual(t.totalesHero, [])
})
