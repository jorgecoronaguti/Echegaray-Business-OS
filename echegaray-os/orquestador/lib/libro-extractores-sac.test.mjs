import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deSac, lotesLibresEnLaVentana, mejorMesDelSemestre, RUBRO_SAC, PESTANA_SAC,
} from './libro-extractores-sac.mjs'
import { remuneracionMensualDeLaNomina, RUBRO_JORNALES, RUBRO_ADMINISTRACION } from './libro-extractores-nomina.mjs'
import { mesDeSerial } from './libro-extractores-cargas.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'
import { movimiento, SALE } from './libro-movimientos.mjs'
import { NAT } from './banco-santander.mjs'

const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
const debito = (iso, importe, naturaleza, fila) =>
  ({ fecha: S(iso), concepto: 'Pago haberes', importe, naturaleza, fila })

/** La nómina tal como el libro la emite: quincenas de obra + administración, mes por mes. */
const nom = (iso, importe, rubro = RUBRO_JORNALES) => movimiento({
  fecha: S(iso), signo: SALE, importe, rubro, estado: 'PROYECTADO',
  concepto: 'quincena', origen: { pestana: 'Jornales por Quincena', fila: iso },
})
// Segundo semestre de 2026: octubre es el mes más alto ($16.400.000 + $3.000.000 de administración).
const NOMINA = [
  nom('2026-07-03', 9600000), nom('2026-08-03', 12000000), nom('2026-09-03', 14000000),
  nom('2026-10-03', 16400000), nom('2026-11-03', 15000000), nom('2026-12-03', 15500000),
  nom('2026-10-10', 3000000, RUBRO_ADMINISTRACION),
  nom('2026-06-03', 8000000), nom('2026-05-03', 7000000),
]
const ENC = ['Fecha', 'x', 'Fecha factura', 'y', 'Proveedor', 'CUIT (OS)', 'N° Comprobante', 'z', 'w',
  'Cliente / Asignación', 'Detalles / Obra', 'a', 'b', 'c', 'Total', 'Estado', 'Tipo pago',
  'Monto Pagado', 'Monto Parcial 2', 'Rubro de caja', 'Fecha de caja']
const I = Object.fromEntries(ENC.map((n, i) => [n, i]))
const filaSac = ({ total, estado, fecha }) => {
  const f = Array(ENC.length).fill('')
  f[I.Proveedor] = 'Personal'; f[I.Total] = total; f[I.Estado] = estado
  f[I['Rubro de caja']] = RUBRO_SAC; f[I['Fecha de caja']] = fecha
  return f
}
const COMPRAS_VACIA = [[], [], ENC]
const CORTE = S('2026-09-11')

test('EL SAC DE DICIEMBRE SE PROYECTA: 50% del mejor mes del semestre, con la fecha de la ley', () => {
  const r = deSac({ nomina: NOMINA, compras: COMPRAS_VACIA, corte: CORTE, anio: 2026 })
  const dic = r.movimientos.filter((m) => m.fecha === S('2026-12-18'))
  assert.equal(dic.length, 1)
  assert.equal(dic[0].importe, (16400000 + 3000000) / 2, 'octubre es el mejor mes: $19,4 M ⇒ $9,7 M de SAC')
  assert.equal(dic[0].estado, 'PROYECTADO')
  assert.equal(dic[0].rubro, RUBRO_SAC)
  assert.equal(dic[0].origen.pestana, PESTANA_SAC)
  assert.match(r.avisos.join(' '), /LÍMITE DECLARADO/, 'una proyección sin su límite se lee como un hecho')
})

test('EL SEMESTRE YA VENCIDO SIN RESPALDO NO SE EMITE — inventaría deuda que no existe', () => {
  const r = deSac({ nomina: NOMINA, compras: COMPRAS_VACIA, corte: CORTE, anio: 2026 })
  assert.equal(r.movimientos.some((m) => m.fecha === S('2026-06-30')), false)
  assert.match(r.avisos.join(' '), /venció el 2026-06-30 y no hay ni fila en Compras ni lote/)
})

test('UN LOTE DE HABERES QUE NINGUNA QUINCENA RECLAMA EN LA VENTANA ES EL SAC, y se dice que es inferido', () => {
  const debitos = [
    debito('2026-06-30', 2731687.68, NAT.sueldos, 410),
    debito('2026-06-30', 1500000, NAT.sueldos, 411),
    debito('2026-06-17', 4634623, NAT.sueldos, 400), // la quincena del 15: ya la reclamó la nómina
  ]
  const usados = new Set([400])
  const r = deSac({ debitos, usados, nomina: NOMINA, compras: COMPRAS_VACIA, corte: CORTE, anio: 2026 })
  const jun = r.movimientos.filter((m) => m.rubro === RUBRO_SAC && m.fecha === S('2026-06-30'))
  assert.equal(jun.length, 1, 'el lote llega partido por persona: dos filas del mismo día son UN pago')
  assert.equal(jun[0].importe, 2731687.68 + 1500000)
  assert.equal(jun[0].estado, 'REAL')
  assert.match(jun[0].concepto, /inferido por ventana/)
  assert.equal(usados.has(410) && usados.has(411), true, 'el débito consumido no puede respaldar otra cosa')
})

test('el lote que la nómina ya reclamó no se vuelve a imputar al SAC', () => {
  const debitos = [debito('2026-06-30', 2731687.68, NAT.sueldos, 410)]
  const r = deSac({
    debitos, usados: new Set([410]), nomina: NOMINA, compras: COMPRAS_VACIA, corte: CORTE, anio: 2026,
  })
  assert.equal(r.movimientos.some((m) => m.fecha === S('2026-06-30')), false,
    'un débito respalda a UNA obligación: imputarlo dos veces da por pagada plata que salió una vez')
})

test('un lote de haberes FUERA de la ventana no es SAC', () => {
  const debitos = [debito('2026-06-17', 4634623, NAT.sueldos, 400)]
  const r = deSac({ debitos, nomina: NOMINA, compras: COMPRAS_VACIA, corte: CORTE, anio: 2026 })
  assert.equal(r.movimientos.some((m) => m.estado === 'REAL'), false,
    'el 17/06 es el lote de la quincena del 15, no el aguinaldo')
})

test('SI COMPRAS TODAVÍA TIENE EL SAC DEL SEMESTRE, no se emite nada de ese semestre', () => {
  const compras = [[], [], ENC, filaSac({ total: 8000000, estado: 'Pendiente', fecha: S('2026-12-18') })]
  const r = deSac({ nomina: NOMINA, compras, corte: CORTE, anio: 2026 })
  assert.equal(r.movimientos.length, 0)
  assert.match(r.avisos.join(' '), /ya está en Compras \(f4/)
})

test('una fila de SAC ANULADA en Compras no tapa la proyección', () => {
  const compras = [[], [], ENC, filaSac({ total: 8000000, estado: 'ELIMINADO', fecha: S('2026-12-18') })]
  const r = deSac({ nomina: NOMINA, compras, corte: CORTE, anio: 2026 })
  assert.equal(r.movimientos.length, 1, 'la fila eliminada ya no emite: si el SAC tampoco, la línea queda vacía')
})

test('sin nómina no hay base y no se proyecta: el aguinaldo no se estima de la nada', () => {
  const r = deSac({ nomina: [], compras: COMPRAS_VACIA, corte: CORTE, anio: 2026 })
  assert.equal(r.movimientos.length, 0)
  assert.match(r.avisos.join(' '), /no tiene ningún mes de nómina/)
})

test('remuneracionMensualDeLaNomina suma los dos rubros de nómina y ningún otro', () => {
  const conRuido = [...NOMINA, movimiento({
    fecha: S('2026-10-10'), signo: SALE, importe: 99999999, rubro: 'Nómina · Cargas sociales',
    estado: 'PROYECTADO', concepto: 'F931', origen: { pestana: 'Cargas Sociales', fila: 'x' },
  })]
  const r = remuneracionMensualDeLaNomina(conRuido, mesDeSerial)
  assert.equal(r.get('2026-10'), 19400000, 'las cargas sociales no son remuneración: el SAC no se devenga sobre ellas')
})

test('mejorMesDelSemestre elige el máximo, no el último ni el promedio', () => {
  const r = remuneracionMensualDeLaNomina(NOMINA, mesDeSerial)
  assert.deepEqual(mejorMesDelSemestre(r, 2026, [7, 8, 9, 10, 11, 12]), { mes: '2026-10', importe: 19400000 })
  assert.equal(mejorMesDelSemestre(r, 2026, [1, 2, 3]), null)
})

test('lotesLibresEnLaVentana agrupa por día y respeta la naturaleza', () => {
  const debitos = [
    debito('2026-12-20', 1000, NAT.sueldos, 1),
    debito('2026-12-20', 2000, NAT.sueldos, 2),
    debito('2026-12-20', 5000, NAT.transferencias, 3),
    debito('2026-12-22', 3000, NAT.sueldos, 4),
  ]
  const r = lotesLibresEnLaVentana(debitos, new Set(), S('2026-12-15'), S('2026-12-31'))
  assert.deepEqual(r.map((x) => x.importe), [3000, 3000])
  assert.deepEqual(r[0].filas, [1, 2])
})
