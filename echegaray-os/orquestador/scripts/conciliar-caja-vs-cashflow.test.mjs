import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bordesDeTramos, tramoDe, repartir, dateASerial, serialADate, descomponerPorTramo, vencimientosFiscales,
  buscarCelda, leerEscaleraDeCaja,
} from './conciliar-caja-vs-cashflow.mjs'

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

test('la diferencia se ATRIBUYE a un tramo, no queda en un número final — ahora NETO, no por lado', () => {
  // POR QUÉ IMPORTA: el 05/08 el script decía "no cierra por $12.188.441" y ahí terminaba. Abierto por
  // tramo, el residuo cae en el tramo que lo explica en vez de perderse en un total.
  //
  // YA NO ES "POR LADO" (15/08): desde el rediseño de CAJA la pestaña sólo publica el NETO de cada
  // tramo (ver `leerEscaleraDeCaja`), así que la comparación se hace neto contra neto.
  const bordes = bordesDeTramos(HOY)
  const pestaña = new Map(bordes.map((b, k) => [b.rotulo, 90 * k]))   // (entra=100k) - (sale=10k)
  // La pestaña ve -12.188.441 de neto donde el modelo ve 0: toda la diferencia cae acá.
  pestaña.set('Vencido — ya pasó la fecha', -12188441)
  const abierta = descomponerPorTramo(bordes, bordes.map((_, k) => 100 * k), bordes.map((_, k) => 10 * k), pestaña)
  assert.equal(abierta[0].dif, -12188441, 'la pestaña ve menos plata que el modelo: el signo tiene que ser NEGATIVO')
  assert.equal(abierta[0].acum, -12188441)
  // Y el acumulado es el que explica el piso: los tramos limpios no lo mueven.
  for (const t of abierta.slice(1)) assert.equal(t.dif, 0)
  assert.equal(abierta.at(-1).acum, -12188441)
})

test('un tramo que NO está en el mapa de la pestaña se lee como 0, no como error silencioso', () => {
  // `descomponerPorTramo` ya NO decide si falta un tramo — eso lo decide `leerEscaleraDeCaja` ANTES,
  // fallando fuerte. Acá, si igual llega un mapa incompleto, el faltante pesa 0 del lado pestaña (todo
  // el neto modelado queda de diferencia), no explota ni lo esconde.
  const bordes = bordesDeTramos(HOY)
  const abierta = descomponerPorTramo(bordes, bordes.map(() => 0), bordes.map(() => 7000), new Map())
  assert.equal(abierta[0].dif, 7000, 'sin dato de la pestaña, la diferencia es "0 − netoModelo"')
})

test('buscarCelda encuentra por TEXTO en cualquier columna — no está anclado a una posición', () => {
  // EL DEFECTO QUE ESTO ATRAPA: el conciliador leía `caja[i]?.[0]` (columna A) y el rediseño del
  // 05/08 movió el panel de vencimientos a la F. Si `buscarCelda` sólo mirara la columna 0, este test
  // fallaría igual que falló el script durante diez días.
  const grilla = [
    ['Cuenta', 'Importe', 'Saldo', '', '', 'Tramo', 'Hasta', 'Neto', 'Saldo después'],
    ['Efectivo en pesos', 12000000, 7359430, '', '', 'Vencido — ya pasó la fecha', 46248, -57040295, -38770225],
  ]
  const c = buscarCelda(grilla, (v) => v === 'Neto')
  assert.deepEqual(c, { fila: 0, col: 7 })
  const c2 = buscarCelda(grilla, (v) => v === 'columna que no existe')
  assert.equal(c2, null)
})

test('leerEscaleraDeCaja lee el NETO y el piso sin importar en qué columna estén', () => {
  const bordes = bordesDeTramos(HOY)
  // Una grilla CON UN CORRIMIENTO DE COLUMNAS DISTINTO AL REAL, a propósito: si el código estuviera
  // anclado a F/H/I esto fallaría; si busca por texto, da igual dónde estén. El piso es una fila
  // APARTE de los seis tramos —igual que en CAJA real, donde "Total disponibilidades" es su propia
  // fila con el rótulo "⇒ Peor caso · piso" en la columna del Tramo—, nunca empieza con "·".
  const cab = ['x', 'x', 'x', 'Tramo', 'Hasta', 'Neto', 'Saldo después']
  const filas = bordes.map((b, k) => ['', '', '', b.rotulo, '', 100 * (k + 1), 1000 * (k + 1)])
  const filaPiso = ['', '', '', '⇒ Peor caso · piso', '', '', 999999]
  const grilla = [cab, ...filas, filaPiso]
  const r = leerEscaleraDeCaja(grilla, bordes)
  assert.equal(r.porRotulo.get(bordes[0].rotulo), 100)
  assert.equal(r.porRotulo.get(bordes.at(-1).rotulo), 100 * bordes.length)
  assert.equal(r.pisoEscrito, 999999)
  assert.equal(r.filaPiso, filas.length + 1)   // la fila del piso, después del encabezado y los tramos
})

test('leerEscaleraDeCaja FALLA nombrando el rótulo exacto que no encontró — no sigue adelante', () => {
  const bordes = bordesDeTramos(HOY)
  const cab = ['Tramo', 'Neto', 'Saldo después']
  // Falta a propósito el tramo "Esta semana".
  const filas = bordes.filter((b) => b.rotulo !== 'Esta semana').map((b, k) => [b.rotulo, k, k])
  const grilla = [cab, ...filas]
  assert.throws(() => leerEscaleraDeCaja(grilla, bordes), /Esta semana/,
    'el error tiene que nombrar el rótulo que buscó y no encontró')
})

test('leerEscaleraDeCaja FALLA si no hay ninguna línea que hable del "piso"', () => {
  const bordes = bordesDeTramos(HOY)
  const cab = ['Tramo', 'Neto', 'Saldo después']
  const filas = bordes.map((b, k) => [b.rotulo, k, k])   // ningún rótulo menciona "piso"
  const grilla = [cab, ...filas]
  assert.throws(() => leerEscaleraDeCaja(grilla, bordes), /piso/)
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
