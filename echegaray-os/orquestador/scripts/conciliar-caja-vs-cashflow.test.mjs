import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bordesDeTramos, tramoDe, repartir, dateASerial, serialADate, descomponerPorTramo, vencimientosFiscales } from './conciliar-caja-vs-cashflow.mjs'

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

test('la diferencia se ATRIBUYE a un lado y a un tramo, no queda en un número final', () => {
  // POR QUÉ IMPORTA: el 05/08 el script decía "no cierra por $12.188.441" y ahí terminaba. Con un solo
  // número no se puede saber si la pestaña ve egresos de más o ingresos de menos, y los dos se
  // arreglan al revés. Abierto por tramo y por lado, el residuo cayó entero en "Vencido / lo que SALE"
  // y eso apuntó directo a la causa: cheques ya debitados restados otra vez.
  const bordes = bordesDeTramos(HOY)
  const pestaña = new Map(bordes.map((b, k) => [b.rotulo, { entra: 100 * k, sale: 10 * k }]))
  // La pestaña ve 500 de egreso donde el modelo ve 12.188.441: la diferencia va del lado que SALE.
  pestaña.set('Vencido — ya pasó la fecha', { entra: 0, sale: 12188441 })
  const abierta = descomponerPorTramo(bordes, bordes.map((_, k) => 100 * k), bordes.map((_, k) => 10 * k), pestaña)
  assert.equal(abierta[0].difEntra, 0)
  assert.equal(abierta[0].difSale, -12188441, 'la pestaña resta de más: el signo tiene que ser NEGATIVO')
  assert.equal(abierta[0].acum, -12188441)
  // Y el acumulado es el que explica el piso: los tramos limpios no lo mueven.
  for (const t of abierta.slice(1)) assert.equal(t.dif, 0)
  assert.equal(abierta.at(-1).acum, -12188441)
})

test('un tramo que NO está en la pestaña se ve, no se descuenta como cero', () => {
  // Un rótulo que cambia de un lado y no del otro dejaría la resta contra una fila inexistente. Eso
  // tiene que verse como falta, no confundirse con "la pestaña no tiene nada en ese tramo".
  const bordes = bordesDeTramos(HOY)
  const abierta = descomponerPorTramo(bordes, bordes.map(() => 0), bordes.map(() => 7000), new Map())
  assert.equal(abierta.every((t) => t.falta), true)
  assert.equal(abierta[0].difSale, 7000)
})

test('el IVA/IIBB vence a los 20 días del cierre del mes, y sólo si hay monto', () => {
  // Es la MISMA regla que escribe formulaCalendarioImpuestosSemana en la pestaña (EOMONTH+20). Si acá
  // se usara otra, el conciliador estaría midiendo su propia opinión y la diferencia no diría nada.
  const iva = Array(12).fill(0); iva[7] = 12000000       // agosto
  const iibb = Array(12).fill(0); iibb[7] = 884541
  const v = vencimientosFiscales(2026, iva, iibb)
  assert.equal(v.length, 1, 'un mes sin IVA ni IIBB no genera vencimiento')
  assert.equal(v[0].monto, 12884541)
  // 31/08/2026 + 20 = 20/09/2026.
  assert.equal(serialADate(v[0].fecha).toISOString().slice(0, 10), '2026-09-20')
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
