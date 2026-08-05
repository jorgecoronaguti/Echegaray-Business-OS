import test from 'node:test'
import assert from 'node:assert/strict'
import { fusionar, sobrantes, tiene, letraCol, escribirPreservando, limpiarCentinela, VACIO, colaLimpiable, rellenoDeCola, formaDeGenerador } from './preservar-anotaciones.mjs'

// ═══ POR QUÉ ESTOS DOBLES (test hermético) ═══
// `escribirPreservando`, para toda pestaña de contenido, consulta el candado (sheet_pestanas_bloqueadas)
// y la firma (sheet_tab_firma) en Postgres. Con el entorno sourceado esas consultas son REALES: CAJA y
// "Cheques Emitidos" están candadas de verdad en producción, así que la función —correctamente— NO
// escribe, y las aserciones del mock fallaban. No es una regresión del código de preservación: es que el
// test dependía del estado real de la base. Inyectando `guardas` (el punto de inyección retrocompatible
// de escribirPreservando) el test ejercita la fusión/preservación sin tocar la base ni depender de qué
// pestañas estén candadas hoy. Cada doble es no-op salvo que el test necesite observar una llamada.
const guardasStub = (overrides = {}) => ({
  estaBloqueada: async () => false,
  firmaGuardia: async () => ({ editada: false }),
  sellarFirma: async () => {},
  ...overrides,
})

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
  // guardas: candado/firma mockeados (no tocan Postgres). respetar:false: la Regla 0 escribe en
  // sheet_rotulos con el entorno sourceado; este test es sobre la FUSIÓN, que corre igual sin ella.
  const { conservadas } = await escribirPreservando(google, 'ID', 'CAJA', [['nuevo', 'x', '']], { anchoHoja: 4, respetar: false, guardas: guardasStub() })
  // La lectura que importa para la fusión es el ancho real de la hoja (A1:D1) con fórmulas, para no
  // degradarlas a número pegado.
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
  let firmaConsultada = false
  const google = {
    async readSheetValues(_id, rango) { leidos.push(rango); return [['viejo']] },
    async batchUpdateValues() {},
  }
  // El doble de firma modela lo que hace la firma real: leer la pestaña entera (A1:BZ) antes de decidir.
  // Así se prueba el invariante que importa —que escribirPreservando SÍ enruta por la firma aun con
  // respetar:false, por ser pestaña de contenido— sin depender de la firma real (Postgres).
  const guardas = guardasStub({
    firmaGuardia: async (g, id, _tab, ref) => {
      firmaConsultada = true
      await g.readSheetValues(id, `${ref}!A1:BZ`, { render: 'FORMULA' })
      return { editada: false }
    },
  })
  await escribirPreservando(google, 'ID', 'CAJA', [['nuevo']], { respetar: false, guardas })
  assert.ok(firmaConsultada, 'una pestaña de contenido consulta la firma aunque respetar:false')
  assert.ok(leidos.some((r) => /A1:BZ/.test(r)), 'la firma lee la pestaña entera (A1:BZ)')
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

// ═══ LA HUELLA POR CELDA EN EL PORTÓN (05/08) ═══
// "no podés volver a escribir algo si yo ya lo borré, pasó en los dos cash flows". La huella decide
// celda por celda ANTES de fusionar, y vale para toda pestaña de contenido —incluidas las que pasan
// respetar:false—, porque colgarla de esa bandera es la trampa que ya costó una pérdida.

test('lo que el dueño vació no se reescribe: la huella suprime aunque respetar:false', async () => {
  const escritos = []
  const google = {
    async readSheetValues() { return [['', 'sigue esto']] },   // la primera celda: él la vació
    async batchUpdateValues(_id, p) { escritos.push(p[0].values) },
  }
  let guardado = null
  const guardas = guardasStub({
    conHuella: async (_f, _p, grid) => ({
      grid: grid.map((f) => ['', ...f.slice(1)]),               // veredicto: la celda A1 la vaciaste vos
      suprimidas: [{ fila: 1, col: 0, forma: 'total', mio: 'TOTAL' }],
      ajenas: [],
      alineacion: { alineada: true, motivo: 'alineada' },
      guardar: async (g) => { guardado = g },
    }),
  })
  await escribirPreservando(google, 'ID', 'CAJA', [['TOTAL', 'sigue esto']], { respetar: false, guardas })
  assert.equal(escritos[0][0][0], '', 'la celda que él vació queda vacía: NO se resucita')
  assert.equal(escritos[0][0][1], 'sigue esto', 'el resto de la pestaña se sigue manteniendo')
  assert.ok(guardado, 'la huella se sella DESPUÉS de escribir: evidencia del efecto, no del intento')
})

test('la huella no se consulta en un espejo _RAW (no hay nada del dueño que proteger)', async () => {
  let consultada = false
  const google = { async readSheetValues() { return [['viejo']] }, async batchUpdateValues() {} }
  await escribirPreservando(google, 'ID', '_ARCA_RAW', [['nuevo']], {
    respetar: false, espejo: true, guardas: guardasStub({ conHuella: async () => { consultada = true } }),
  })
  assert.equal(consultada, false)
})

test('firma NO VERIFICABLE = no se escribe (el fail-closed que estaba escrito y no aplicado)', async () => {
  let escribio = false
  const google = { async readSheetValues() { return [['viejo']] }, async batchUpdateValues() { escribio = true } }
  const r = await escribirPreservando(google, 'ID', 'CAJA', [['nuevo']], {
    respetar: false,
    // Es lo que devuelve firmaGuardia real cuando no pudo releer la pestaña o consultar la base.
    guardas: guardasStub({ firmaGuardia: async () => ({ editada: false, noVerificable: true }) }),
  })
  assert.equal(escribio, false, 'sin poder verificar la firma no se escribe: un regen postergado no destruye nada')
  assert.equal(r.noVerificable, true)
})

test('escribirPreservando respeta fila y columna de arranque', async () => {
  const escritos = []
  const google = {
    async readSheetValues() { return [['a']] },
    async batchUpdateValues(_id, p) { escritos.push(p[0].range) },
  }
  // guardas mockeados + respetar:false: sin depender del candado real de "Cheques Emitidos" ni escribir
  // en Postgres; este test es sólo sobre el cálculo del rango de arranque (fila/columna).
  await escribirPreservando(google, 'ID', "'Cheques Emitidos'", [['x']], { fila0: 10, col0: 2, respetar: false, guardas: guardasStub() })
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


// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA COLA DE UN DISEÑO ANTERIOR — EL DESASTRE DEL 31/07
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El dueño: "dejaste un desastre en proveedores". Un rediseño escribió 241 filas; se volvió al diseño
// de 199; y las filas 200 a 242 quedaron ahí para siempre, porque la regla del generador es "lo que
// esté MÁS abajo no se toca" — correcta para proteger sus anotaciones, ciega ante su propia cola.
// Estas son las filas REALES que quedaron.

const COLA_REAL = [
  ['6 · LO QUE ARCA REGISTRÓ Y EL OS TIENE', '', ''],
  ['Cualquier pestaña que necesite el dato fiscal', '', ''],
  ['Concepto', 'Cantidad', 'Monto'],
  ['Comprobantes de compra (neto de notas de crédito)', '430', '$155.489.182'],
  ['  · notas de crédito (restan)', '13', '-$20.976.638'],
  ['7 · FACTURAS EMITIDAS — LO QUE SE FACTURÓ', '', ''],
  ['ARCOR', '30-50279317-5', '0001-00000216'],
  ['TOTAL FACTURADO', '', '$208.159.105'],
  ['8 · LIBRETA DE PROVEEDORES', '', ''],
  ['Proveedor', 'Comentarios', ''],
  ['Hormiserv', 'Esperar a q escriba el cobrador para confirmar fecha de pago 16/8', ''],
  ['FEMENIA', 'pagar con echeq a 30 días', ''],
]

test('la cola del generador se puede limpiar; la nota del dueño NO', () => {
  const mios = new Set(['Concepto', 'Cantidad', 'Monto', 'Proveedor', 'Comentarios', 'TOTAL FACTURADO',
    'Comprobantes de compra (neto de notas de crédito)', '  · notas de crédito (restan)',
    '8 · LIBRETA DE PROVEEDORES', 'Cualquier pestaña que necesite el dato fiscal', 'ARCOR', 'Hormiserv', 'FEMENIA'])
  const { limpiar, preservar } = colaLimpiable(COLA_REAL, mios)
  // Las dos filas de notas se PRESERVAN: el texto del comentario no es de ningún generador.
  assert.equal(preservar.length, 2, 'las dos notas del dueño quedan')
  assert.deepEqual(preservar.map((p) => p.i), [10, 11])
  assert.match(preservar[0].celdas[0], /Esperar a q escriba el cobrador/)
  assert.match(preservar[1].celdas[0], /pagar con echeq a 30 días/)
  // Todo lo demás es del generador y se puede borrar.
  assert.equal(limpiar.length, 10)
  assert.ok(!limpiar.includes(10) && !limpiar.includes(11))
})

test('formaDeGenerador reconoce lo que sólo produce un generador, y NADA MÁS', () => {
  for (const propio of ['$155.489.182', '-$20.976.638', '430', '31/07/2026', '30-50279317-5', '20280401707',
    '00003-00000210', '24 d', '1 fac.', '6 · LO QUE ARCA REGISTRÓ', '⚠ Faltan 4 facturas', '✓ está en Cobranzas',
    '—', '', VACIO, '=SUMIFS(Compras!$O$4:$O;1;2)']) {
    assert.equal(formaDeGenerador(propio), true, `"${propio}" lo escribe el generador`)
  }
  // Y lo que NO: cualquier frase del dueño. Si esto se rompe, se le borra el trabajo.
  for (const suyo of ['Esperar a q escriba el cobrador', 'pagar con echeq a 30 días', 'viernes 31',
    'no es prioridad', 'Confirmar trueque con chatarra propia', 'Pedir Factura y tratar de pagar con cheque a 15/8']) {
    assert.equal(formaDeGenerador(suyo), false, `"${suyo}" es del dueño y NO se puede borrar`)
  }
})

test('rellenoDeCola devuelve null en la fila que hay que preservar (para no escribirla)', () => {
  const mios = new Set(['Proveedor', 'Comentarios'])
  const { filas } = rellenoDeCola([['Proveedor', 'Comentarios'], ['Hormiserv', 'llamarlo el lunes']], mios, 4)
  // VACÍO REAL, no el centinela: el centinela se resuelve dentro de `fusionar` y acá no hay fusión.
  // Escribirlo dejó "::VACIO::" literal en treinta celdas del archivo del dueño la primera vez.
  assert.deepEqual(filas[0], ['', '', '', ''], 'la fila del encabezado se limpia entera, con vacío real')
  assert.ok(!filas[0].includes(VACIO), 'el centinela NUNCA llega al Sheet')
  assert.equal(filas[1], null, 'la fila con su nota no se escribe: se saltea')
})

test('una cola VACÍA no genera trabajo (el caso normal, todas las corridas)', () => {
  const { limpiar, preservar } = colaLimpiable([], new Set())
  assert.equal(limpiar.length, 0)
  assert.equal(preservar.length, 0)
})

test('una fila de la cola con SÓLO números y fechas se limpia aunque no esté en el registro', () => {
  // La cola de un diseño viejo trae filas de datos que nunca fueron rótulos. Exigir que estén en el
  // registro las dejaría ahí para siempre — que es el defecto que se está arreglando.
  const { limpiar } = colaLimpiable([['', '$1.000', '31/07/2026', '1 fac.']], new Set())
  assert.deepEqual(limpiar, [0])
})
