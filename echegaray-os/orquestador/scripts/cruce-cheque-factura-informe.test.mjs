// EL VERIFICADOR DEL CRUCE, EN FRÍO — lo que puede fallar sin tocar la red.
import test from 'node:test'
import assert from 'node:assert/strict'
import { renglones, mesEnCurso } from './cruce-cheque-factura-informe.mjs'
import { serialDe } from '../lib/libro-extractores-fechas.mjs'

const clase = (clase, cheques, monto) => ({ clase, cheques, monto })

test('EL CONTROL DEL INFORME: si las clases no suman el registro vivo, se cayó un cheque', () => {
  const bien = renglones({
    vivos: clase('cheques vivos', 23, 16000311),
    porComprobante: clase('comprobante', 6, 4262032),
    porImporte: clase('proveedor+importe', 2, 1064069),
    porConjunto: clase('conjunto de facturas', 1, 1700000),
    ambiguos: clase('ambiguos', 9, 5503000),
    sinCruce: clase('sin cruce', 5, 3471210),
  })
  assert.equal(bien.at(-1).cierra, true)
  // Le saco un peso a una clase: el total ya no cuadra y el informe tiene que decirlo. Un veredicto
  // que no cierra es indistinguible de uno que cierra si nadie compara los dos lados.
  const mal = renglones({
    vivos: clase('cheques vivos', 23, 16000311),
    porComprobante: clase('comprobante', 6, 4262032),
    porImporte: clase('proveedor+importe', 2, 1064069),
    porConjunto: clase('conjunto de facturas', 1, 1700000),
    ambiguos: clase('ambiguos', 9, 5503000),
    sinCruce: clase('sin cruce', 4, 2471210),
  })
  assert.equal(mal.at(-1).cierra, false)
})

test('LA VENTANA DEL MES es [1° del mes, 1° del siguiente): nadie cae en dos meses', () => {
  const { desde, hasta } = mesEnCurso(new Date(2026, 7, 6)) // 06/08/2026
  assert.equal(desde, serialDe(2026, 8, 1))
  assert.equal(hasta, serialDe(2026, 9, 1))
  // El 31/08 está adentro y el 01/09 afuera — el límite superior es excluyente.
  assert.ok(serialDe(2026, 8, 31) >= desde && serialDe(2026, 8, 31) < hasta)
  assert.ok(!(serialDe(2026, 9, 1) < hasta))
  // Diciembre no rompe: el mes siguiente es enero del año que viene, no el mes 13.
  const dic = mesEnCurso(new Date(2026, 11, 20))
  assert.equal(dic.hasta, serialDe(2027, 1, 1))
})
