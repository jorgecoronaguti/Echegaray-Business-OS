import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VENTANA, obligacionesDelCalendario, altoDeLaPosicion, filasDeLaPosicion,
  formulaOtrosSinFecha, diasAlProximo,
} from './impuestos-posicion.mjs'
import { ACUERDO, TARJETA } from './banco-santander.mjs'

const HOY = '2026-08-06'
// Las filas del detalle tal como quedan en la pestaña reconstruida.
const FILAS = { iva: 55, iibb: 65, plan: 85, prendario: 89 }
const MESES = { iva: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], iibb: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], plan: [2, 3, 4, 5, 6, 7, 8, 9, 10], prendario: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
const cal = () => obligacionesDelCalendario({ hoy: HOY, anio: 2026, meses: MESES, filas: FILAS })

test('el calendario sale ordenado por fecha, con la celda viva de cada importe', () => {
  const c = cal()
  const fechas = c.map((o) => o.fecha)
  assert.deepEqual(fechas, [...fechas].sort(), 'ordenado por fecha')
  for (const o of c) {
    assert.match(o.celda, /^\$[A-N]\$\d+$/, `${o.concepto}: el importe sale de una celda, no de un número`)
    assert.equal(typeof o.importe, 'undefined', 'el calendario no transporta importes')
  }
  // El primero que viene: el prendario del 07/08.
  assert.equal(c.find((o) => !o.vencido).fecha, '2026-08-07')
  assert.equal(diasAlProximo(c, HOY), 1)
})

test('EL PRENDARIO Y LOS PLANES NO ENTRAN COMO VENCIDOS — son débito automático', () => {
  // EL DEFECTO QUE ESTE TEST ATRAPA. La primera versión miraba 60 días hacia atrás con las cuatro
  // obligaciones: ocho filas "⚠ VENCIDO" por ~$9M que en realidad estaban PAGADAS, y todas sumadas
  // al renglón de riesgo. Una alarma falsa en el número que decide si hay que salir a cubrir un bache
  // es peor que no tener alarma: la próxima vez que se prenda de verdad nadie la va a mirar.
  const vencidos = cal().filter((o) => o.vencido)
  assert.ok(vencidos.length > 0, 'algo vencido tiene que haber, o el test no prueba nada')
  for (const o of vencidos) {
    assert.ok(VENTANA.conPasado.includes(o.tipo),
      `${o.concepto} venció el ${o.fecha} y se debita solo: mostrarlo como impago es una alarma falsa`)
  }
  assert.deepEqual([...new Set(vencidos.map((o) => o.tipo))].sort(), ['iibb', 'iva'])
})

test('la ventana hacia adelante corta donde dice, y hacia atrás también', () => {
  for (const o of cal()) {
    assert.ok(o.dias <= VENTANA.adelante, `${o.fecha} está a ${o.dias} días: fuera de la ventana`)
    assert.ok(o.dias >= -VENTANA.atras, `${o.fecha} está a ${o.dias} días: demasiado viejo`)
  }
})

test('el espacio reservado alcanza EXACTAMENTE para lo que se escribe', () => {
  // Reservar de menos pisa el bloque de abajo sin dar un solo error; de más deja un hueco.
  const c = cal()
  const filas = filasDeLaPosicion({
    cal: c, base: 4, hoy: HOY, acuerdo: ACUERDO, tarjeta: TARJETA,
    refs: { saldoIva: '$H$56', saldoIibb: '$G$66', prendPend: '$B$92', planesPend: '$B$93', otrosSinFecha: '=0' },
  })
  assert.equal(filas.length, altoDeLaPosicion(c))
})

const posicion = () => filasDeLaPosicion({
  cal: cal(), base: 4, hoy: HOY, acuerdo: ACUERDO, tarjeta: TARJETA,
  refs: { saldoIva: '$H$56', saldoIibb: '$G$66', prendPend: '$B$92', planesPend: '$B$93', otrosSinFecha: '=$I$77+$J$77' },
})

test('el HERO referencia el detalle: no recalcula nada por su cuenta', () => {
  const hero = posicion().slice(0, 9)
  const formulas = hero.map((f) => String(f[1] ?? '')).filter((x) => x.startsWith('='))
  assert.ok(formulas.length >= 6, 'el hero es todo fórmula')
  for (const f of formulas) {
    assert.ok(!/SUMIFS?\(/.test(f), `el hero no vuelve a sumar Compras: ${f}`)
    assert.ok(!/Compras!|_BANCO_RAW|_MOVIMIENTOS/.test(f), `el hero no toca una fuente: ${f}`)
    assert.ok(/^=(\$?[A-N]\$?\d+)([+]\$?[A-N]\$?\d+)*$/.test(f), `el hero sólo suma celdas: ${f}`)
  }
  assert.equal(hero[1][1], '=$H$56+$G$66', 'a favor = libre disponibilidad de IVA + saldo de IIBB')
  assert.equal(hero[4][1], '=$B$92+$B$93', 'deuda pendiente = prendario pendiente + planes pendientes')
})

test('el hero dice DEUDA PENDIENTE, y sólo lo que falta pagar', () => {
  // El defecto B: decía $31.895.983 (las doce cuotas del año, siete ya pagadas) donde lo pendiente
  // son $14.372.450. El rótulo tiene que decir de qué habla, o el número se lee como el total.
  const hero = posicion().slice(0, 9)
  assert.match(String(hero[4][0]), /PENDIENTE/)
  assert.match(String(hero[4][0]), /sólo lo que falta pagar/)
  assert.match(String(hero[5][0]), /cuotas que no vencieron/)
  assert.match(String(hero[6][0]), /cuotas que no vencieron/)
})

test('el próximo vencimiento lleva su fecha y su concepto EN el rótulo', () => {
  const hero = posicion().slice(0, 9)
  assert.match(String(hero[7][0]), /PRÓXIMO VENCIMIENTO · 07\/08 · Prendario Ford XLS/)
})

test('una fecha SUPUESTA se marca en la columna A, no en una nota que nadie ve', () => {
  // Las notas de esta pestaña se borran y la columna de procedencia se vacía: una advertencia que
  // sólo viviera ahí sería una advertencia invisible.
  const filas = posicion()
  const iibb = filas.filter((f) => /Ingresos Brutos San Juan/.test(String(f[0] ?? '')))
  assert.ok(iibb.length >= 2)
  for (const f of iibb) assert.match(String(f[0]), /⚠ (fecha supuesta|VENCIDO)/)
  // El IVA está verificado contra ARCA: no lleva la marca.
  const ivaFuturo = filas.filter((f) => /IVA · DDJJ F\.2051/.test(String(f[0] ?? '')) && !/VENCIDO/.test(String(f[0])))
  assert.ok(ivaFuturo.length >= 1)
  for (const f of ivaFuturo) assert.ok(!/fecha supuesta/.test(String(f[0])), `${f[0]}: el IVA está verificado`)
})

test('el riesgo se declara como PREGUNTA: la pestaña no sabe si algo se pagó', () => {
  const f = posicion().find((x) => /RIESGO · IVA\/IIBB/.test(String(x[0] ?? '')))
  assert.ok(f, 'tiene que existir el renglón de riesgo')
  assert.match(String(f[0]), /verificar contra el extracto/)
})

test('las tres ventanas son acumuladas y ninguna incluye lo vencido', () => {
  const filas = posicion()
  const total = filas.find((x) => /A PAGAR EN LA VENTANA/.test(String(x[0] ?? '')))
  const [v30, v60, v90] = [1, 2, 3].map((i) => String(total[i]))
  const celdas = (s) => (s === '=0' ? [] : s.slice(1).split('+'))
  assert.ok(celdas(v30).length <= celdas(v60).length)
  assert.ok(celdas(v60).length <= celdas(v90).length)
  for (const c of celdas(v30)) assert.ok(celdas(v90).includes(c), 'lo de 30 días está adentro de lo de 90')
  // El renglón de vencidos NO comparte ni una celda con las ventanas.
  const riesgo = filas.find((x) => /RIESGO · IVA\/IIBB/.test(String(x[0] ?? '')))
  for (const c of celdas(String(riesgo[1]))) assert.ok(!celdas(v90).includes(c), 'lo vencido no es proyección')
})

test('el financiamiento declara que NO mide el descubierto tomado', () => {
  // Un "disponible" que se lee como plata que está, y puede no estar, es la línea con la que se
  // decide no salir a pedir un adelanto.
  const filas = posicion()
  const desc = filas.find((x) => /descubierto Santander/.test(String(x[0] ?? '')))
  assert.match(String(desc[0]), /⚠ uso actual s\/d/)
  const techo = filas.find((x) => /Capacidad de financiamiento SIN USAR/.test(String(x[0] ?? '')))
  assert.match(String(techo[0]), /TECHO/)
})

test('las referencias de "sin fecha cierta" son ABSOLUTAS y del mes en adelante', () => {
  assert.equal(formulaOtrosSinFecha([77, 78], HOY, 2026, 3), '=$I$77+$J$77+$K$77+$I$78+$J$78+$K$78')
  // Agosto es el mes 8 → columna I. Diciembre no tiene tres meses por delante: no inventa columnas.
  assert.equal(formulaOtrosSinFecha([77], '2026-12-01', 2026, 3), '=$M$77')
  assert.equal(formulaOtrosSinFecha([], HOY, 2026, 3), '=0')
})
