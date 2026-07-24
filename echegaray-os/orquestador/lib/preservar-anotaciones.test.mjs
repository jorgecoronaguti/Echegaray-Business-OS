import test from 'node:test'
import assert from 'node:assert/strict'
import { fusionar, sobrantes, tiene, letraCol, escribirPreservando, limpiarCentinela, VACIO } from './preservar-anotaciones.mjs'

test('lo que anota el dueño NUNCA se borra, esté en la columna que esté', () => {
  const generado = [['Proveedor', 'Importe'], ['Alumetal', 100]]
  // El dueño anotó en la columna E (índice 4), muy a la derecha de la tabla.
  const existente = [['Proveedor', 'Importe', '', '', 'REVISAR CON RODRIGO'], ['Alumetal', 90, '', '', 'llamar el lunes']]
  const out = fusionar(generado, existente)
  assert.equal(out[0][4], 'REVISAR CON RODRIGO')
  assert.equal(out[1][4], 'llamar el lunes')
  // Y el dato del generador manda donde él sí tiene contenido.
  assert.equal(out[1][1], 100)
})

test('una anotación DENTRO de las columnas generadas también sobrevive', () => {
  // El generador deja vacía la col C; el dueño escribió ahí.
  const generado = [['Corralon', 1963541, '']]
  const existente = [['Corralon', 1900000, 'ojo: falta la NC']]
  assert.equal(fusionar(generado, existente)[0][2], 'ojo: falta la NC')
})

test('el generador puede achicar su bloque sin destruir filas del dueño', () => {
  const generado = [['a']]
  const existente = [['a'], ['nota vieja del dueño']]
  const out = fusionar(generado, existente)
  assert.equal(out.length, 2, 'la fila de más no se pierde')
  assert.equal(out[1][0], 'nota vieja del dueño')
})

test('una fórmula preservada sigue siendo fórmula (no se degrada a número pegado)', () => {
  const generado = [['', '']]
  const existente = [['=SUMA(A1:A9)', '']]
  assert.equal(fusionar(generado, existente)[0][0], '=SUMA(A1:A9)')
})

test('el cero es contenido, no vacío', () => {
  assert.equal(tiene(0), true)
  assert.equal(tiene(''), false)
  assert.equal(tiene(null), false)
  assert.equal(tiene(undefined), false)
  assert.equal(fusionar([[0]], [['viejo']])[0][0], 0, 'un 0 del generador pisa el valor viejo')
})

test('sobrantes nombra lo que quedó y el generador ya no produce', () => {
  const generado = [['a', '']]
  const existente = [['a', 'nota'], ['fila vieja']]
  const s = sobrantes(generado, existente)
  assert.deepEqual(s, [
    { fila: 1, col: 2, valor: 'nota' },
    { fila: 2, col: 1, valor: 'fila vieja' },
  ])
})

test('letraCol traduce índice a columna', () => {
  assert.equal(letraCol(0), 'A')
  assert.equal(letraCol(7), 'H')
  assert.equal(letraCol(25), 'Z')
  assert.equal(letraCol(26), 'AA')
})

test('escribirPreservando NO borra: lee, fusiona y escribe sin clearValues', async () => {
  const leidos = []; const escritos = []
  const google = {
    async readSheetValues(_id, rango, opts) {
      leidos.push({ rango, opts })
      // La persona anotó en la columna D (índice 3), fuera de la tabla del generador.
      return [['viejo', '', '', 'MI NOTA']]
    },
    async batchUpdateValues(_id, payload) { escritos.push(payload[0]) },
  }
  const { conservadas } = await escribirPreservando(google, 'ID', 'CAJA', [['nuevo', 'x', '']], { anchoHoja: 4 })
  // La firma agrega una lectura de la pestaña entera (A1:BZ) antes de fusionar; la lectura que importa
  // para la fusión sigue siendo el ancho real de la hoja (A1:D1) con fórmulas, para no degradarlas.
  const lecturaTabla = leidos.find((l) => l.rango === 'CAJA!A1:D1' && l.opts?.render === 'FORMULA')
  assert.ok(lecturaTabla, 'lee el ancho real de la hoja con fórmulas (para fusionar sin degradar)')
  assert.deepEqual(escritos[0].values, [['nuevo', 'x', '', 'MI NOTA']], 'la nota de la persona sobrevive')
  assert.equal(conservadas.length, 1)
  assert.equal(conservadas[0].valor, 'MI NOTA')
})

// ═══ EL FLAG `espejo` SEPARA candado+firma DE la Regla 0 (24/07) ═══
// El defecto general que el dueño sufrió: CAJA/Impuestos/Cargas Sociales/Jornales pasan respetar:false
// para aplicar la Regla 0 a mano, y ANTES eso también apagaba candado y firma → sus ediciones se
// perdían. Ahora candado+firma valen SIEMPRE salvo espejos _RAW reales (espejo:true).

test('contenido con respetar:false SÍ consulta la firma (A1:BZ) — el arreglo del defecto', async () => {
  const leidos = []
  const google = {
    async readSheetValues(_id, rango) { leidos.push(rango); return [['viejo']] },
    async batchUpdateValues() {},
  }
  await escribirPreservando(google, 'ID', 'CAJA', [['nuevo']], { respetar: false })
  assert.ok(leidos.some((r) => /A1:BZ/.test(r)), 'una pestaña de contenido consulta la firma aunque respetar:false')
})

test('espejo:true salta candado y firma (no lee A1:BZ): un espejo _RAW se escribe directo', async () => {
  const leidos = []; const escritos = []
  const google = {
    async readSheetValues(_id, rango) { leidos.push(rango); return [['viejo']] },
    async batchUpdateValues(_id, p) { escritos.push(p[0]) },
  }
  await escribirPreservando(google, 'ID', '_ARCA_RAW', [['nuevo']], { respetar: false, espejo: true })
  assert.ok(!leidos.some((r) => /A1:BZ/.test(r)), 'un espejo NO consulta la firma (A1:BZ)')
  assert.equal(escritos.length, 1, 'el espejo se escribe directo')
})

test('escribirPreservando respeta fila y columna de arranque', async () => {
  const escritos = []
  const google = {
    async readSheetValues() { return [['a']] },
    async batchUpdateValues(_id, p) { escritos.push(p[0].range) },
  }
  await escribirPreservando(google, 'ID', "'Cheques Emitidos'", [['x']], { fila0: 10, col0: 2 })
  assert.equal(escritos[0], "'Cheques Emitidos'!C10")
})

test('una grilla vacía no escribe nada', async () => {
  let toco = false
  const google = { async readSheetValues() { toco = true; return [] }, async batchUpdateValues() { toco = true } }
  const { conservadas } = await escribirPreservando(google, 'ID', 'X', [])
  assert.equal(toco, false)
  assert.deepEqual(conservadas, [])
})

test('limpiarCentinela deja la grilla lista para una escritura que no pasa por la fusión', () => {
  const g = [['Cuenta', VACIO, 'ARS'], [VACIO, 0, '']]
  assert.deepEqual(limpiarCentinela(g), [['Cuenta', '', 'ARS'], ['', 0, '']])
  // No toca el original: el generador puede seguir usándolo para fusionar.
  assert.equal(g[0][1], VACIO)
})
