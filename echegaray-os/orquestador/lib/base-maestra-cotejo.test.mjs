// UN COTEJO SIN MOTIVO ESCRITO NO ES UN COTEJO.
//
// El defecto que estas pruebas atrapan: que «difieren y no lo miré» y «difieren y está explicado»
// devuelvan lo mismo. Si `cotejar` vuelve a aceptar una diferencia sin explicación, la tercera
// prueba se pone roja; si acepta cualquier clase que le pasen, la quinta también.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COTEJO, cierra, cotejar, resumirCotejo } from './base-maestra-cotejo.mjs'

test('mismo número = MATCH', () => {
  const r = cotejar({ excel: 92087947.11, xsas: 92087947.11, que: 'costo directo' })
  assert.equal(r.cotejo, COTEJO.MATCH)
  assert.equal(r.diferencia, 0)
})

test('el redondeo de Excel no es una diferencia', () => {
  assert.equal(cotejar({ excel: 1219.74, xsas: 1219.7449 }).cotejo, COTEJO.MATCH)
})

test('EL DEFECTO: difieren y nadie explicó ⇒ CONFLICTO', () => {
  const r = cotejar({ excel: 1775728, xsas: 38.27, que: 'T1126.1 subtotal' })
  assert.equal(r.cotejo, COTEJO.CONFLICTO)
  assert.equal(cierra(r), false)
})

test('difieren con explicación y clase válida ⇒ cierra con esa clase', () => {
  const r = cotejar({
    excel: 183792202.39,
    xsas: 187415653.4,
    que: 'Presupuesto!H87 control',
    explicacion: 'L52 suma desde la fila 13 y H52 desde la 10: el control del libro excluye tres partidas',
    clase: COTEJO.CORRECCION_DE_ERROR,
  })
  assert.equal(r.cotejo, COTEJO.CORRECCION_DE_ERROR)
  assert.equal(cierra(r), true)
})

test('EL DEFECTO: una clase que no cierra nada NO cierra aunque venga con explicación', () => {
  // `MATCH` no es una explicación de por qué difieren: es la negación de que difieran.
  const r = cotejar({ excel: 100, xsas: 200, explicacion: 'porque sí', clase: COTEJO.MATCH })
  assert.equal(r.cotejo, COTEJO.CONFLICTO)
  const sinClase = cotejar({ excel: 100, xsas: 200, explicacion: 'porque sí' })
  assert.equal(sinClase.cotejo, COTEJO.CONFLICTO)
})

test('sin número de un lado es PENDIENTE, nunca MATCH ni CONFLICTO', () => {
  assert.equal(cotejar({ excel: null, xsas: 100 }).cotejo, COTEJO.PENDIENTE)
  assert.equal(cotejar({ excel: 100, xsas: null }).cotejo, COTEJO.PENDIENTE)
  assert.equal(cotejar({ excel: null, xsas: null }).diferencia, null)
})

test('el resumen no pasa mientras quede un CONFLICTO', () => {
  const verde = [cotejar({ excel: 1, xsas: 1 }), cotejar({ excel: 2, xsas: 3, explicacion: 'x', clase: COTEJO.CAMBIO_DE_MODELO })]
  assert.equal(resumirCotejo(verde).pasa, true)
  assert.equal(resumirCotejo(verde).porClase[COTEJO.CAMBIO_DE_MODELO], 1)

  const rojo = [...verde, cotejar({ excel: 5, xsas: 9, que: 'algo' })]
  const r = resumirCotejo(rojo)
  assert.equal(r.pasa, false)
  assert.equal(r.conflictos.length, 1)
  assert.equal(r.conflictos[0].que, 'algo')
})

test('un resumen vacío pasa, y eso también hay que poder verlo', () => {
  // Un cotejo que no cotejó nada devuelve verde. Se declara para que quien lo lea sepa que
  // `total: 0` y `pasa: true` es la misma señal que «no se miró nada».
  const r = resumirCotejo([])
  assert.equal(r.pasa, true)
  assert.equal(r.total, 0)
})

test('el redondeo línea por línea de Excel no es un cambio de modelo', () => {
  // `Análisis!F` redondea a 2 decimales antes de multiplicar. T1126.1 da 38,27 en el libro y
  // 38,2556 con precisión completa: 1,4 centavos que la tolerancia absoluta habría marcado.
  assert.equal(cotejar({ excel: 38.27, xsas: 38.2556 }).cotejo, COTEJO.MATCH)
  assert.equal(cotejar({ excel: 1775728, xsas: 1775059.38 }).cotejo, COTEJO.MATCH)
})

test('EL DEFECTO: la tolerancia relativa NO puede tapar un ajuste sin aplicar', () => {
  // T1058: el Excel multiplica por 2 y el sistema no. Duplicar una partida es mil veces más
  // grande que el milésimo de tolerancia, y tiene que seguir apareciendo.
  assert.equal(cotejar({ excel: 2616960, xsas: 1308480 }).cotejo, COTEJO.CONFLICTO)
})
