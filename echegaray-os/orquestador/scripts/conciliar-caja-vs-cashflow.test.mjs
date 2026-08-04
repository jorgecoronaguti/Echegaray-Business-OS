import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bordesDeTramos, tramoDe, repartir, dateASerial, serialADate } from './conciliar-caja-vs-cashflow.mjs'

/** 04/08/2026, el día en que se midió la diferencia de $41.704.351. */
const HOY = dateASerial(new Date(Date.UTC(2026, 7, 4)))

test('el serial de Sheets y la fecha son la misma cosa en las dos direcciones', () => {
  assert.equal(serialADate(HOY).toISOString().slice(0, 10), '2026-08-04')
  assert.equal(HOY, 46238)
})

test('los bordes son ESTRICTAMENTE crecientes — es lo que evita contar un vencimiento dos veces', () => {
  // EL DEFECTO QUE ESTO ATRAPA: con bordes sueltos, un cheque del 1° de agosto cumplía a la vez
  // "semana que viene" y "el mes que viene" cuando los catorce días cruzaban el fin de mes. El
  // calendario sumaba $11.733.832 contra $11.076.832 reales.
  for (const dia of [1, 4, 15, 20, 25, 28, 31]) {
    const hoy = dateASerial(new Date(Date.UTC(2026, 7, dia)))
    const bordes = bordesDeTramos(hoy)
    const finitos = bordes.map((b) => b.hasta).filter((h) => h !== null)
    finitos.forEach((h, i) => {
      if (i === 0) return
      assert.ok(h >= finitos[i - 1], `día ${dia}: el borde ${i} (${h}) queda antes que el anterior (${finitos[i - 1]})`)
    })
  }
})

test('cuando los 14 días cruzan el fin de mes, "Resto de este mes" queda VACÍO, no solapado', () => {
  // El 25/08 los catorce días llegan al 08/09, más allá del fin de mes. El tramo del mes tiene que
  // colapsar (mismo borde que el anterior), no absorber fechas que ya cuenta "semana que viene".
  const hoy = dateASerial(new Date(Date.UTC(2026, 7, 25)))
  const b = bordesDeTramos(hoy)
  assert.equal(b[3].hasta, b[2].hasta, '"Resto de este mes" tiene que colapsar, no extenderse hacia atrás')
  // Y ninguna fecha puede caer en el tramo colapsado.
  for (let f = hoy - 40; f < hoy + 90; f++) assert.notEqual(tramoDe(f, b), 3)
})

test('NINGUNA fecha cae en dos tramos, y NINGUNA se pierde: los tramos son una partición', () => {
  const b = bordesDeTramos(HOY)
  for (let f = HOY - 400; f < HOY + 400; f++) {
    const caben = b.map((_, k) => k).filter((k) => {
      const desde = k === 0 ? -Infinity : b[k - 1].hasta
      const hasta = b[k].hasta
      return f >= desde && (hasta === null || f < hasta)
    })
    assert.equal(caben.length >= 1, true, `la fecha ${f} no cae en ningún tramo`)
    assert.equal(tramoDe(f, b), caben[0])
  }
})

test('una fecha que NO es número se aísla, no se reparte — el bug de los $657.000', () => {
  // Una fecha guardada como TEXTO compara como mayor que cualquier número: satisfacía a la vez
  // "después de esta semana" y "después del mes que viene", y el mismo cheque se contaba en varios
  // tramos. Lo que no se puede ubicar en el tiempo tiene que verse aparte, no repartirse.
  const b = bordesDeTramos(HOY)
  for (const malo of ['15/08/2026', '', null, undefined, NaN, Infinity, {}]) {
    assert.equal(tramoDe(malo, b), -1, `"${String(malo)}" no debería caer en ningún tramo`)
  }
})

test('repartir NO crea ni pierde plata, y deja afuera lo que no tiene fecha', () => {
  const b = bordesDeTramos(HOY)
  const filas = [
    { fecha: HOY - 3, monto: 317000 },        // vencido
    { fecha: HOY + 6, monto: 9000000 },       // esta semana: los retiros de Dirección del 10/08
    { fecha: HOY + 13, monto: 6189317 },      // semana que viene: la quincena proyectada
    { fecha: HOY + 25, monto: 5716410 },      // resto del mes
    { fecha: '30/09/2026', monto: 999999 },   // sin fecha usable: NO se reparte
  ]
  const tramos = repartir(filas, b)
  assert.equal(tramos.reduce((a, x) => a + x, 0), 317000 + 9000000 + 6189317 + 5716410)
  assert.equal(tramos[1], 9000000)
  assert.equal(tramos[2], 6189317)
})

test('el borde del mes es EXCLUYENTE: lo del 31/08 no es "resto de este mes"', () => {
  // No es una sutileza de programador: el tramo se rotula "hasta 31/08" y una obligación fechada
  // justo el 31/08 cae en "el mes que viene". Quien lee el piso de agosto no la ve.
  const b = bordesDeTramos(HOY)
  const finDeAgosto = dateASerial(new Date(Date.UTC(2026, 7, 31)))
  assert.equal(b[3].hasta, finDeAgosto)
  assert.equal(tramoDe(finDeAgosto, b), 4, 'el 31/08 cae en "el mes que viene", no en agosto')
  assert.equal(tramoDe(finDeAgosto - 1, b), 3)
})
