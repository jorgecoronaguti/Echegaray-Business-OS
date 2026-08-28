// LA VISTA EN FRÍO DE «¿ALCANZA LA CAJA?», VERIFICADA EN PESOS.
//
// POR QUÉ EXISTE (28/08/2026). Los tests del anexo comparan TEXTO de fórmulas: prueban que el
// generador no cambió, no que el reparto sea correcto. Acá se aplican los mismos baldes a
// movimientos con importe, así que el test puede afirmar cuánto YA SALIÓ y cuánto FALTA PAGAR un
// día concreto — que es lo que el dueño reclamó que el gráfico no distinguía.
import test from 'node:test'
import assert from 'node:assert/strict'
import { necesidadPorDia, diagnostico } from './necesidad-diaria-vista.mjs'

// EL CASO QUE ORIGINÓ EL CAMBIO. La fila 834 de Compras (PEDRO TELLO, efectivo, Estado = Pagado) sale
// del libro como REAL por el total, y la deuda comercial del 04/09 sale como COMPROMETIDA.
const HOY = '2026-08-28'
const CASO = [
  { fecha: HOY, signo: -1, importe: 4200000, estado: 'REAL', rubro: 'Materiales', instrumento: 'efectivo' },
  { fecha: '2026-09-04', signo: -1, importe: 6462880.16, estado: 'COMPROMETIDO', rubro: 'Materiales', instrumento: 'transferencia' },
]

test('EL DÍA DE HOY MUESTRA LO QUE SALIÓ Y NO LO PIDE DE NUEVO', () => {
  const [hoy] = necesidadPorDia(CASO, { desde: HOY, dias: 8, saldo: 20000000 })
  assert.equal(hoy.yaSalio, 4200000, 'la barra de lo ejecutado')
  assert.equal(hoy.faltaPagar, 0, 'hoy no hay nada pendiente: la pestaña Proveedores decía $0 y tenía razón')
  // Y NINGUNA DE LAS DOS CURVAS SE MUEVE POR ESA PLATA: el saldo del que parten ya la tiene descontada.
  assert.equal(hoy.siCobra, 20000000)
  assert.equal(hoy.siNoCobra, 20000000)
})

test('EL DÍA CON DEUDA VIVA SÍ BAJA EL PISO, y sólo por lo que falta pagar', () => {
  const filas = necesidadPorDia(CASO, { desde: HOY, dias: 8, saldo: 20000000 })
  const d = filas.find((f) => f.fecha === '2026-09-04')
  assert.equal(d.faltaPagar, 6462880.16)
  assert.equal(d.por.proveedores, 6462880.16)
  assert.equal(d.yaSalio, 0)
  assert.equal(Math.round(d.siNoCobra), 20000000 - 6462880, 'el piso baja 6,46M, no 10,66M')
})

test('EL CONTROL PUEDE DAR ROJO: hay un saldo con el que el veredicto cambia', () => {
  // Un control que no puede cambiar de veredicto no es un control. Con $4.000.000 de caja, la cuenta
  // vieja —que restaba también los $4.200.000 ya pagados— daba el piso en −$200.000 y el gráfico
  // decía "NO alcanza" un día en que la plata ya había salido y el saldo estaba intacto.
  const filas = necesidadPorDia(CASO, { desde: HOY, dias: 3, saldo: 4000000 })
  const [hoy] = diagnostico(filas, { saldo: 4000000, movs: CASO, desde: HOY })
  assert.equal(hoy.pisoAntes, -200000, 'la cuenta vieja: saldo menos TODOS los egresos del día')
  assert.equal(hoy.siNoCobra, 4000000, 'la nueva: sólo lo que falta pagar')
  assert.equal(hoy.cambioDeVeredicto, true, 'de "no alcanza" a "alcanza" — el día cambia de color')
})

test('EL MISMO DÍA CON LAS DOS COSAS: se ven las dos, y ninguna en cero', () => {
  // EL TEST NEGATIVO. Si alguien vuelve a sumar todo en la misma barra, `yaSalio` cae a 0 y
  // `faltaPagar` se lleva los $4,2M ya pagados: el gráfico pediría $10,66M el día en que hacen falta
  // $6,46M. Las dos mitades tienen que poder ser distintas de cero a la vez.
  const mismoDia = CASO.map((m) => ({ ...m, fecha: HOY }))
  const [hoy] = necesidadPorDia(mismoDia, { desde: HOY, dias: 1, saldo: 0 })
  assert.equal(hoy.yaSalio, 4200000)
  assert.equal(hoy.faltaPagar, 6462880.16)
  assert.ok(hoy.yaSalio > 0 && hoy.faltaPagar > 0)
  assert.notEqual(hoy.faltaPagar, 10662880.16, 'lo ya pagado NO puede engordar lo que falta pagar')
  // Nada se perdió por separarlo: los dos sumados son todo lo que salió ese día.
  assert.equal(Math.round((hoy.yaSalio + hoy.faltaPagar) * 100) / 100, 10662880.16)
})

test('UN DÍA SIN MOVIMIENTOS ES UN DÍA SIN NECESIDAD, no un agujero en la serie', () => {
  // La serie tiene que traer los treinta días completos: un día que falta corre el eje y la curva
  // dibuja el pozo en la fecha equivocada.
  const filas = necesidadPorDia(CASO, { desde: HOY, dias: 30, saldo: 0 })
  assert.equal(filas.length, 30)
  assert.equal(filas[1].fecha, '2026-08-29')
  assert.equal(filas[1].yaSalio + filas[1].faltaPagar, 0)
})
