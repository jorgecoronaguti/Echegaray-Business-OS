// EL COSTO DE PAGAR A PLAZO LA CAMIONETA. Cada test atrapa un defecto que ya habría cambiado la
// decisión de compra: o el número está mal, o está bien pero dejó de derivarse del presupuesto.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compararFormasDePago, presupuestoCotizado, pagosDe, nominalDe, plazoPromedioDias,
  tnaImplicita, teaImplicita, tirEfectivaAnual, ahorroDeDescubierto, ahorroDeDescubiertoBullet,
} from './rodados-financiacion.mjs'
import { PRESUPUESTOS_RODADOS } from './rodados-datos.mjs'
import { ACUERDO } from './banco-santander.mjs'
import { TASAS } from './costo-descubierto.mjs'

const r = () => compararFormasDePago()
const cerca = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (tolerancia ${tol})`)

// ── 1 · EL RECARGO ES LA DIFERENCIA REAL, NO UNA ESTIMACIÓN ──────────────────────────────────────

test('la forma B cuesta 6 × $2.579.717 = $15.478.302 contra $12.482.500 del contado', () => {
  const c = r()
  assert.equal(c.comparable, true)
  assert.equal(c.contado.importe, 12_482_500)
  assert.equal(c.plazo.nominal, 15_478_302)
  assert.equal(c.recargo, 2_995_802)
})

test('el plazo promedio de los seis eCheq es 105 días', () => {
  // (30+60+90+120+150+180)/6. Es el denominador de todas las tasas de abajo: si el promedio se
  // calcula mal, el costo del plazo se lee mal y no lo avisa nada.
  assert.equal(r().plazo.plazoPromedioDias, 105)
})

test('el recargo es un 24% redondo sobre el contado: el vendedor no usó una tasa, usó un multiplicador', () => {
  // HALLAZGO, no supuesto: $12.482.500 × 1,24 ÷ 6 = $2.579.716,67, que redondeado da exactamente el
  // importe de la celda. Que siete dígitos coincidan por casualidad no es plausible. Este test es el
  // que atrapa una transposición de dígitos en el eCheq ($2.579.171, $2.597.717): cualquiera de esas
  // rompe la identidad aunque siga pareciendo un importe razonable.
  const c = r()
  cerca(c.recargoRelativo, 0.24, 1e-6)
  assert.equal(Math.round(c.contado.importe * 1.24 / c.plazo.cantidad), c.plazo.importeCadaUno)
})

// ── 2 · LAS TASAS SE CALCULAN, NO SE ESCRIBEN ────────────────────────────────────────────────────
//
// ÉSTE ES EL PUNTO DEL MÓDULO. Un recargo del 24% "a 105 días" suena chico y es carísimo: anualizado
// da 83% nominal y 111% efectivo. Si mañana alguien reemplaza la fórmula por el número de hoy, el
// valor sigue siendo correcto hasta que cambie el presupuesto — y ahí miente sin avisar.

test('la TNA y la TEA implícitas son las que salen de la fórmula, sobre el plazo promedio', () => {
  const c = r()
  cerca(c.tnaImplicita, c.recargoRelativo * 365 / 105, 1e-12)
  cerca(c.teaImplicita, (1 + c.recargoRelativo) ** (365 / 105) - 1, 1e-12)
  cerca(c.tnaImplicita, 0.8343, 0.0001)   // 83,43% nominal anual
  cerca(c.teaImplicita, 1.1123, 0.0001)   // 111,23% efectivo anual
  assert.ok(c.teaImplicita > c.tnaImplicita, 'a menos de un año la TEA siempre supera a la TNA')
})

test('la TIR del flujo real es mayor que la TEA del plazo promedio, porque el primer cheque vence a 30 días', () => {
  // Colapsar seis vencimientos en uno a 105 días subestima el costo: la plata se va antes. La TIR
  // descuenta cada cheque en su fecha. Si alguien borra la TIR y deja sólo la TEA, el costo declarado
  // baja 4 puntos sin que nadie toque un importe.
  const c = r()
  cerca(c.tirEfectivaAnual, 1.1553, 0.0001) // 115,53% efectivo anual
  assert.ok(c.tirEfectivaAnual > c.teaImplicita)
})

test('si cambia el importe del eCheq, TODAS las tasas se mueven — no hay ningún literal escondido', () => {
  // LA PRUEBA DE QUE ESTÁ DERIVADO. Se clona el presupuesto con un cheque $100.000 más caro y se
  // exige que recargo, TNA, TEA y TIR cambien. Si alguien hubiera dejado una tasa fija, este test es
  // el único que se pone rojo: los de arriba seguirían pasando con los números de hoy.
  const base = r()
  const p = structuredClone(presupuestoCotizado())
  const b = p.formasDePago.find((f) => f.cheques)
  b.cheques.importeCadaUno += 100_000
  const c = compararFormasDePago(p)
  assert.equal(c.recargo, base.recargo + 600_000)
  assert.ok(c.tnaImplicita > base.tnaImplicita)
  assert.ok(c.teaImplicita > base.teaImplicita)
  assert.ok(c.tirEfectivaAnual > base.tirEfectivaAnual)
})

test('si cambian los plazos, el costo cambia aunque el nominal sea idéntico', () => {
  // DEFECTO QUE ATRAPA: leer "6 cheques a 180 días" donde dice "de 30 a 180". Se paga exactamente la
  // misma plata y el costo financiero implícito se parte al medio. Ninguna suma lo detecta.
  const p = structuredClone(presupuestoCotizado())
  const b = p.formasDePago.find((f) => f.cheques)
  b.cheques.plazosDias = [180, 180, 180, 180, 180, 180]
  const c = compararFormasDePago(p)
  assert.equal(c.recargo, r().recargo, 'el nominal no cambió')
  assert.equal(c.plazo.plazoPromedioDias, 180)
  assert.ok(c.teaImplicita < r().teaImplicita / 1.5, 'estirar el plazo abarata muchísimo el mismo recargo')
})

// ── 3 · LA COMPARACIÓN CONTRA EL DESCUBIERTO ─────────────────────────────────────────────────────

test('la vara del descubierto sale de las fuentes únicas, no de una copia local', () => {
  // DEFECTO QUE ATRAPA: alguien escribe 0.6278 acá adentro. El día que el banco cambie el acuerdo,
  // el resto del OS se entera y este módulo no.
  const c = r()
  assert.equal(c.descubierto.cft, ACUERDO.cft)
  assert.equal(c.descubierto.tna, TASAS.tna)
})

test('diferir los pagos ahorra menos descubierto que lo que cuesta el recargo: gana el contado', () => {
  const c = r()
  cerca(c.descubierto.ahorroDiaPorDia, 1_832_773, 1)
  cerca(c.descubierto.ahorroBullet, 1_878_117, 1)
  assert.ok(c.ventajaDelPlazo < 0)
  cerca(c.ventajaDelPlazo, -1_163_029, 1)
  assert.equal(c.veredicto, 'contado')
})

test('los dos métodos de valuar el descubierto coinciden en el veredicto', () => {
  // Si el fino y el grueso dieran distinto, la diferencia sería del orden del error del método y la
  // recomendación no se sostendría. El módulo tiene que decir 'sin_veredicto' en vez de elegir.
  const c = r()
  assert.equal(c.metodosCoinciden, true)
  assert.equal(Math.sign(c.ventajaDelPlazo), Math.sign(c.ventajaDelPlazoBullet))
})

test('el ahorro día por día contempla que después del quinto cheque ya se pagó más que al contado', () => {
  // El sexto tramo tiene saldo retenido NEGATIVO (12.482.500 − 5 × 2.579.717 = −416.085): esos 30
  // días cuestan, no ahorran. Redondearlo a cero inflaría el ahorro un 2% a favor del plazo.
  const contado = 12_482_500
  const pagos = [30, 60, 90, 120, 150, 180].map((dias) => ({ dias, importe: 2_579_717 }))
  const conNegativo = ahorroDeDescubierto(contado, pagos)
  const sinElUltimoTramo = ahorroDeDescubierto(contado, pagos.slice(0, 5))
  assert.ok(conNegativo < sinElUltimoTramo, 'el último tramo tiene que restar')
})

test('con un recargo chico el veredicto se da vuelta: el módulo no está cableado a "contado"', () => {
  // DEFECTO QUE ATRAPA: un veredicto constante. Con eCheq de $2.150.000 el recargo cae a ~$417.500,
  // muy por debajo del interés de descubierto que se ahorra, y ahí conviene el plazo.
  const p = structuredClone(presupuestoCotizado())
  p.formasDePago.find((f) => f.cheques).cheques.importeCadaUno = 2_150_000
  const c = compararFormasDePago(p)
  assert.equal(c.veredicto, 'plazo')
  assert.ok(c.ventajaDelPlazo > 0)
})

// ── 4 · CUANDO NO SE PUEDE COMPARAR, NO SE COMPARA ───────────────────────────────────────────────

test('si las dos formas no financian lo mismo, no hay veredicto', () => {
  // El crédito UVA se cancela de los dos lados SÓLO porque es idéntico. Si dejara de serlo, restar
  // los nominales mediría dos cosas distintas y el número tendría igual cara de resultado.
  const p = structuredClone(presupuestoCotizado())
  p.formasDePago.find((f) => f.cheques).financiado -= 1_000_000
  const c = compararFormasDePago(p)
  assert.equal(c.comparable, false)
  assert.match(c.motivo, /no financian lo mismo/)
})

test('una ficha técnica sin precio no produce una comparación', () => {
  const zanella = PRESUPUESTOS_RODADOS.find((p) => p.clave === 'zanella-z-truck')
  assert.equal(compararFormasDePago(zanella).comparable, false)
  assert.equal(compararFormasDePago(null).comparable, false)
})

test('el resultado viaja con sus límites pegados', () => {
  // Una limitación declarada en otro archivo no la lee nadie. Si el cupo del descubierto no alcanza,
  // el veredicto "pagá al contado" no es ejecutable — y eso tiene que verse al lado del número.
  const c = r()
  assert.ok(c.limites.length >= 3)
  assert.ok(c.limites.some((l) => /cupo libre/.test(l)))
  assert.ok(c.limites.some((l) => /UVA/.test(l)))
})

// ── 5 · NÚCLEO PURO ──────────────────────────────────────────────────────────────────────────────

test('las funciones puras se comportan en los bordes en vez de devolver un cero cómodo', () => {
  assert.equal(plazoPromedioDias({ anticipoEfectivo: 100 }), 0, 'el contado se paga en el día 0')
  assert.deepEqual(pagosDe({ anticipoEfectivo: 100 }), [{ dias: 0, importe: 100 }])
  assert.deepEqual(pagosDe({}), [])
  assert.equal(nominalDe({}), 0)
  assert.equal(tnaImplicita(0.24, 0), null, 'sin plazo no hay tasa: 0 días daría infinito')
  assert.equal(teaImplicita(0.24, 0), null)
  assert.equal(tirEfectivaAnual(0, [{ dias: 30, importe: 10 }]), null)
  assert.equal(tirEfectivaAnual(100, [{ dias: 30, importe: 100 }]), null, 'sin recargo no hay TIR que buscar')
  assert.equal(ahorroDeDescubierto(100, []), null)
})

test('la TIR reconstruye el monto de contado al descontar los pagos con ella', () => {
  // La verificación de la propia TIR: descontar los seis cheques a la tasa que devuelve tiene que
  // dar el contado. Si la bisección converge mal, esto lo muestra.
  const c = r()
  const vp = [30, 60, 90, 120, 150, 180]
    .reduce((s, d) => s + c.plazo.importeCadaUno / (1 + c.tirEfectivaAnual) ** (d / 365), 0)
  cerca(vp, c.contado.importe, 1)
})

test('el bullet al CFT crece con el plazo y con el monto', () => {
  const a = ahorroDeDescubiertoBullet(1_000_000, 105)
  assert.ok(ahorroDeDescubiertoBullet(1_000_000, 210) > a)
  assert.ok(ahorroDeDescubiertoBullet(2_000_000, 105) > a)
  cerca(a, 1_000_000 * ((1 + ACUERDO.cft) ** (105 / 365) - 1), 1e-6)
})
