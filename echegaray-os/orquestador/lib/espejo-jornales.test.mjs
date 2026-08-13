import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importe, total, comparar, formatEspejo, refrescarEspejo } from './espejo-jornales.mjs'

test('lee importes escritos a la argentina', () => {
  // El espejo copia el valor FORMATEADO. Sin esto la comparación mide texto contra texto y un
  // espejo desfasado pasa por bueno.
  assert.equal(importe('$ 1.231.963'), 1231963)
  assert.equal(importe('$1.231.963,50'), 1231963.5)
  assert.equal(importe('623.500'), 623500)
  assert.equal(importe(623500), 623500)
})

test('lo que no es un número vale cero, no NaN', () => {
  // Un NaN suelto envenena la suma entera y el control diría "no coincide" siempre, que es tan
  // inútil como no controlar.
  for (const v of ['', null, undefined, 'Total', '#REF!']) assert.equal(importe(v), 0, `falló con ${JSON.stringify(v)}`)
})

test('comparar detecta el desfasaje real del 21/07', () => {
  // El caso que originó todo esto: la quincena en curso con valores viejos en el espejo.
  const origen = [[...Array(26).fill(''), 623500]]
  const espejo = [[...Array(26).fill(''), 529563]]
  const r = comparar(origen, espejo, 26)
  assert.equal(r.ok, false)
  assert.equal(r.diferencia, 93937)
})

test('comparar acepta el espejo cuando coincide', () => {
  const f = [['x', 100], ['y', 250]]
  const r = comparar(f, f, 1)
  assert.equal(r.ok, true)
  assert.equal(r.diferencia, 0)
})

test('total suma sólo la columna de plata', () => {
  assert.equal(total([['999', 100], ['888', 250]], 1), 350)
})

// ═══ UN BLOQUE PERDIDO NO PUEDE SALIR EN VERDE (13/08) ═══
// La guarda de aterrizaje avisaba por `console.warn` y nadie recogía la señal: `refrescarEspejo`
// descartaba el resultado de la escritura, así que el script podía terminar en 0 con un bloque de
// 200 filas sin escribir. La comparación de plata no lo tapa: un bloque de nombres y fechas perdido
// no mueve un peso.

/** Un Google de mentira: el origen tiene filas, el destino contesta lo que se le diga. */
function googleFalso({ noAterrizo = [] } = {}) {
  const filas = [['1', 'Aguero Cristian', ...Array(24).fill(''), 399000]]
  return {
    async readSheetValues(_id, rango) { return /_J_/.test(rango) ? filas : filas },
    async batchUpdateValues() { return noAterrizo.length ? { noAterrizo } : {} },
  }
}

test('un bloque que no aterrizó llega al resultado, no se queda en el log', async () => {
  const r = await refrescarEspejo(googleFalso({ noAterrizo: ['_J_OBREROS!A201'] }))
  assert.equal(r.perdidas, true, 'el espejo tiene que declarar la pérdida para que el script corte')
  assert.match(r.hojas[0].aviso, /no aterrizaron 1 bloque\(s\).*_J_OBREROS!A201/)
  assert.match(formatEspejo(r), /no aterrizó/)
})

test('sin bloques perdidos el espejo no inventa una pérdida', async () => {
  const r = await refrescarEspejo(googleFalso())
  assert.equal(r.perdidas, false)
  assert.equal(r.hojas[0].aviso, undefined)
})

test('el aviso de desfasaje aparece en el texto', () => {
  const txt = formatEspejo({
    hojas: [{ tab: '_J_OBREROS', filas: 463, verificacion: { ok: false, origen: 118499053, espejo: 117267090, diferencia: 1231963 }, aviso: 'x' }],
    desfasado: true,
  })
  assert.match(txt, /NO coincide/)
})
