// LO QUE DECIDE EL ✓/✗ DEL INFORME, PROBADO EN FRÍO.
//
// La auditoría de cierre del 11/09/2026: «`diferencias`, `comoCelda` y `netoPorSemana` son lo que
// decide ✓/✗ y no tienen un solo test». Son funciones puras y el informe que el dueño lee sale de
// ellas; un error acá no se ve como un error, se ve como un veredicto.
//
// IMPORTAR ESTE SCRIPT NO CORRE LA SIMULACIÓN: tiene guarda `esCLI`. Si alguien la saca, este archivo
// empieza a hacer dos corridas completas contra el Sheet vivo en cada `node --test`.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  diferencias, comoCelda, netoPorSemana, netoPorRubroMes, comprasComoQuedaria, sumarDif, SALIDA_ERROR,
} from './libro-simular-sin-compras.mjs'
import { serialDe, isoDeSerial } from '../lib/libro-extractores-fechas.mjs'

const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
/** Un movimiento con lo que estas funciones miran. Egreso = signo −1, como en el libro. */
const mov = (o) => ({
  signo: -1, importe: 1000, estado: 'PROYECTADO', rubro: 'Financiero', contraparte: '', ...o,
})

test('netoPorRubroMes separa REAL de lo que todavía no salió, y netea con el signo', () => {
  const libro = [
    mov({ fecha: S('2026-06-07'), importe: 1000, estado: 'REAL' }),
    mov({ fecha: S('2026-06-20'), importe: 400, estado: 'PROYECTADO' }),
    mov({ fecha: S('2026-06-25'), importe: 300, estado: 'REAL', signo: 1 }),
  ]
  const r = netoPorRubroMes(libro)
  assert.equal(r.get('Financiero|2026-06|REAL'), -700, 'el ingreso resta del neto del egreso')
  assert.equal(r.get('Financiero|2026-06|FUTURO'), -400)
})

test('un VENCIDO cuenta como FUTURO: es plata que todavía no salió', () => {
  const r = netoPorRubroMes([mov({ fecha: S('2026-06-07'), estado: 'VENCIDO' })])
  assert.equal(r.get('Financiero|2026-06|FUTURO'), -1000)
  assert.equal(r.get('Financiero|2026-06|REAL'), undefined)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// `diferencias` — EL SIGNO Y LA VENTANA DEL EXTRACTO, QUE SON LAS DOS COSAS QUE SE LEEN MAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EN UN EGRESO, UN DELTA POSITIVO ES PLATA QUE EL CUADRO PIERDE', () => {
  // El libro guarda los egresos con signo −1: si el vaciado deja de verlos, el neto SUBE. Leerlo al
  // revés hacía fracasar una simulación exitosa (y al revés: aprobar una que pierde plata).
  const antes = new Map([['Financiero|2026-07|REAL', -1000]])
  const despues = new Map([['Financiero|2026-07|REAL', 0]])
  const [d] = diferencias(antes, despues, S('2026-06-01'))
  assert.equal(d.delta, 1000)
  assert.equal(d.pierde, 1000, 'dejó de ver $1.000 de egreso: eso es perder')
})

test('un delta NEGATIVO es cobertura nueva y NO cuenta como pérdida', () => {
  const antes = new Map([['Nómina · SAC|2026-12|FUTURO', 0]])
  const despues = new Map([['Nómina · SAC|2026-12|FUTURO', -7978905]])
  const [d] = diferencias(antes, despues, S('2026-06-01'))
  assert.equal(d.pierde, 0)
  assert.equal(d.delta, -7978905)
})

test('EL MES DEL CORTE DEL EXTRACTO NO ES REPARABLE: se cuenta como «antes»', () => {
  // El extracto empieza el 28/05/2026, así que de mayo cubre cuatro días: un pago del 10/05 cae en un
  // mes que el extracto «toca» y no puede probar. Contarlo como reparable promete un arreglo imposible.
  const antes = new Map([['Nómina · Cargas sociales|2026-05|REAL', -7110198]])
  const despues = new Map()
  const [d] = diferencias(antes, despues, S('2026-05-28'))
  assert.equal(d.conExtracto, false)
  const [e] = diferencias(new Map([['X|2026-06|REAL', -100]]), new Map(), S('2026-05-28'))
  assert.equal(e.conExtracto, true, 'junio sí está cubierto entero')
})

test('una diferencia de un peso o menos no se reporta: es redondeo, no plata', () => {
  assert.deepEqual(diferencias(new Map([['A|2026-06|REAL', -1000]]),
    new Map([['A|2026-06|REAL', -999.5]]), S('2026-01-01')), [])
})

test('sumarDif suma el campo que se le pide sobre el filtro que se le pide', () => {
  const difs = diferencias(
    new Map([['A|2026-04|REAL', -100], ['A|2026-07|REAL', -200]]),
    new Map(), S('2026-05-28'),
  )
  assert.equal(sumarDif(difs, (d) => !d.conExtracto, 'pierde'), 100)
  assert.equal(sumarDif(difs, (d) => d.conExtracto, 'pierde'), 200)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// `comoCelda` — LO QUE VA A MOSTRAR UNA CELDA QUE LEE EL LIBRO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('comoCelda filtra por rubro, contraparte y estado, igual que la fórmula', () => {
  const libro = [
    mov({ fecha: S('2026-06-07'), importe: 100, estado: 'REAL', contraparte: 'Banco' }),
    mov({ fecha: S('2026-07-07'), importe: 200, estado: 'PROYECTADO', contraparte: 'Banco' }),
    mov({ fecha: S('2026-07-07'), importe: 900, estado: 'REAL', contraparte: 'Banco Santander' }),
    mov({ fecha: S('2026-07-07'), importe: 300, estado: 'REAL', rubro: 'Impuestos', contraparte: 'Banco' }),
  ]
  assert.equal(comoCelda(libro, { rubros: ['Financiero'], contrapartes: ['Banco'], real: true }), 100)
  assert.equal(comoCelda(libro, { rubros: ['Financiero'], contrapartes: ['Banco'], real: false }), 200)
  assert.equal(comoCelda(libro, { rubros: ['Financiero'], contrapartes: ['Banco'] }), 300, 'sin `real`, las dos')
  assert.equal(comoCelda(libro, { rubros: ['Financiero'] }), 1200, 'sin contraparte entra el cargo del banco')
})

test('comoCelda: `desde` recorta por fecha y `menosOrganismos` es el control del desglose', () => {
  const libro = [
    mov({ fecha: S('2026-06-10'), importe: 100, estado: 'REAL', rubro: 'Nómina · Gremiales', contraparte: 'UOCRA' }),
    mov({ fecha: S('2026-09-10'), importe: 200, estado: 'REAL', rubro: 'Nómina · Gremiales', contraparte: 'SINDICATOS' }),
  ]
  assert.equal(comoCelda(libro, { rubros: ['Nómina · Gremiales'], desde: S('2026-08-01') }), 200)
  // El control resta lo que las cuatro filas por organismo se llevan: queda lo que nadie clasificó.
  assert.equal(comoCelda(libro, { rubros: ['Nómina · Gremiales'], real: true, menosOrganismos: true }), 200)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// `netoPorSemana` — LA COLUMNA DEL CASH FLOW SEMANAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA SEMANA ARRANCA EL LUNES, y el serial 2 (01/01/1900) fue lunes', () => {
  // Con el `+1` que parecía equivalente, la semana arrancaba en sábado y los vencimientos del lunes
  // caían en la columna anterior — el mismo modo de falla que ya movió plata entre columnas en CAJA.
  const r = netoPorSemana([mov({ fecha: S('2026-09-14'), importe: 500 })], S('2026-09-11'))
  const claves = [...r.keys()]
  assert.equal(isoDeSerial(claves[0]), '2026-09-14', 'el lunes 14 abre su propia semana')
  for (const k of claves) assert.ok(((k - 2) % 7) === 0, `${isoDeSerial(k)} no es lunes`)
})

test('netoPorSemana ignora lo anterior al lunes de la semana del corte y corta a las 8 semanas', () => {
  const libro = [
    mov({ fecha: S('2026-09-01'), importe: 999 }), // antes del lunes de la semana del corte
    mov({ fecha: S('2026-09-11'), importe: 100 }),
    mov({ fecha: S('2026-11-30'), importe: 777 }), // más allá de la octava semana
  ]
  const r = netoPorSemana(libro, S('2026-09-11'))
  assert.equal([...r.values()].reduce((a, v) => a + v, 0), -100)
  assert.ok(r.size <= 8)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CÓDIGO DE SALIDA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('falta de tipo de cambio sale 2 («no pude medir»), el resto 1 («medí y da mal»)', () => {
  assert.equal(SALIDA_ERROR(new Error('Cobranzas fila 62 está en USD y no tengo tipo de cambio')), 2)
  assert.equal(SALIDA_ERROR(new Error('no pude leer Compras!A1:AN')), 1)
})

test('comprasComoQuedaria aborta si falta la columna de unidad: no simula a ciegas', () => {
  // Con el encabezado completo MENOS «Unidad de Negocio»: sin esa columna no se sabe qué filas se
  // vacían, y adivinar la I produciría una simulación plausible y equivocada.
  const enc = ['Fecha', 'Proveedor', 'CUIT (OS)', 'N° Comprobante', 'Total', 'Estado', 'Tipo pago',
    'Monto Pagado', 'Monto Parcial 2', 'Rubro de caja', 'Fecha de caja', 'Detalles / Obra',
    'Cliente / Asignación']
  assert.throws(() => comprasComoQuedaria([[], [], enc]), /Unidad de Negocio/)
  // Y con ella, no explota y no anula nada si no hay filas.
  assert.equal(comprasComoQuedaria([[], [], [...enc, 'Unidad de Negocio']]).anuladas, 0)
})
