// LOS CINCO MODOS DE FALLA DEL ALTA AUTOMÁTICA. Cada test nombra el defecto que atrapa: si se
// revierte el arreglo, éste se pone rojo.
//
// Todo lo de acá corre sin Google y sin Postgres: la decisión es pura y por eso se puede probar el
// caso que rompe la pestaña sin arriesgar la pestaña.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMINO, MAX_OPCIONES_DESPLEGABLE, MARCA_AUTOMATICA,
  ampliarDesplegable, aplicarAltas, conflictoDeAlias, identidadOcupadaPor,
  planDeAltas, requestValidacionProveedores, resolverNoMatcheado,
} from './alta-proveedor.mjs'

// CUIT reales en su FORMA (11 dígitos y DV correcto). No identifican a nadie de la empresa: se
// eligieron calculándoles el dígito verificador para que el test pruebe la regla, no el padrón.
const CUIT_A = '30707533656' // válido
const CUIT_B = '20123456786' // válido
const CUIT_MAL_DV = '30707533654' // mismo que A con el DV cambiado: el typo típico del OCR

test('el CUIT que ya está en el maestro NO da de alta nada: se imputa al que estaba', () => {
  const r = resolverNoMatcheado(
    { nombre: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: `30-70753365-6` },
    { proveedores: [{ id: 'p1', nombre: 'DUPEC', cuit: CUIT_A }] },
  )
  assert.equal(r.camino, CAMINO.EXISTENTE)
  assert.equal(r.proveedorId, 'p1')
  // LO QUE VA A LA CELDA ES EL NOMBRE CANÓNICO, NUNCA LA VARIANTE RECIÉN LEÍDA: escribir la razón
  // social partiría en dos la cuenta corriente de un proveedor vivo.
  assert.equal(r.nombreCanonico, 'DUPEC')
  assert.equal(r.aliasNuevo, true, 'la variante queda registrada como alias')
})

test('el CUIT que sólo conoce la pestaña Proveedores del Sheet tampoco inventa un nombre nuevo', () => {
  const r = resolverNoMatcheado(
    { nombre: 'PEREZ GARCIA MARISOL BIBIANA', cuit: CUIT_B },
    { porCuit: new Map([[CUIT_B, 'Corralon Progreso']]), proveedores: [] },
  )
  // Nace en el maestro —app.ecsas todavía no lo tenía— pero CON EL NOMBRE QUE YA USA EL SHEET.
  assert.equal(r.camino, CAMINO.ALTA)
  assert.equal(r.motivo, 'cuit_en_sheet')
  assert.equal(r.nombreCanonico, 'Corralon Progreso')
  assert.equal(r.aliasNuevo, true)
})

test('CUIT nuevo y válido: se da de alta con el nombre del papel', () => {
  const r = resolverNoMatcheado({ nombre: 'Metalúrgica del Oeste', cuit: CUIT_B }, {})
  assert.equal(r.camino, CAMINO.ALTA)
  assert.equal(r.motivo, 'cuit_nuevo')
  assert.equal(r.nombreCanonico, 'Metalúrgica del Oeste')
  assert.equal(r.aliasNuevo, false, 'el alias sería idéntico al nombre: no se escribe basura')
})

// ═══ SIN IDENTIDAD NO HAY ALTA ═══
for (const [caso, cuit, motivo] of [
  ['sin CUIT', null, 'sin_cuit'],
  ['10 dígitos', '3070753365', 'cuit_ilegible'],
  ['12 dígitos', '307075336531', 'cuit_ilegible'],
  ['con letras', '30A0753365B', 'cuit_ilegible'],
  ['DV inválido', CUIT_MAL_DV, 'cuit_dv'],
]) {
  test(`CUIT ${caso}: NO se crea nada`, () => {
    const r = resolverNoMatcheado({ nombre: 'Proveedor Ilegible', cuit }, {})
    assert.equal(r.camino, CAMINO.SIN_IDENTIDAD, `${caso} no puede terminar en un alta`)
    assert.equal(r.motivo, motivo)
    assert.equal(r.nombreCanonico, null)
  })
}

test('un nombre sin texto no es identidad ni con CUIT', () => {
  assert.equal(resolverNoMatcheado({ nombre: '   ', cuit: CUIT_B }, {}).camino, CAMINO.SIN_IDENTIDAD)
})

test('lo que una persona ya resolvió manda sobre el alta', () => {
  const conocidos = {
    proveedores: [{ id: 'p9', nombre: 'Femenia SRL', cuit: null }],
    alias: [{ nombre_norm: 'FEMENIA', proveedor_id: 'p9', estado: 'vinculado' }],
  }
  const r = resolverNoMatcheado({ nombre: 'Femenia', cuit: null }, conocidos)
  assert.equal(r.camino, CAMINO.EXISTENTE)
  assert.equal(r.nombreCanonico, 'Femenia SRL')
})

test('«no es un proveedor» no se revierte con un alta automática', () => {
  const r = resolverNoMatcheado(
    { nombre: 'SUELDOS', cuit: CUIT_B },
    { alias: [{ nombre_norm: 'SUELDOS', proveedor_id: null, estado: 'no_es_proveedor' }] },
  )
  assert.equal(r.camino, CAMINO.SIN_IDENTIDAD)
  assert.equal(r.motivo, 'marcado_no_es_proveedor')
})

test('si el alias firmado por una persona contradice el CUIT del papel, se declara y no se elige', () => {
  const r = resolverNoMatcheado(
    { nombre: 'Femenia', cuit: CUIT_B },
    {
      proveedores: [{ id: 'p9', nombre: 'Femenia SRL', cuit: CUIT_A }],
      alias: [{ nombre_norm: 'FEMENIA', proveedor_id: 'p9', estado: 'vinculado' }],
    },
  )
  assert.equal(r.camino, CAMINO.CONFLICTO)
  assert.equal(r.motivo, 'alias_contradice_cuit')
})

test('el nombre ya ocupado por otro proveedor NO se da de alta: reventaría contra el índice único', () => {
  const r = resolverNoMatcheado(
    { nombre: 'Alumetal', cuit: CUIT_B },
    { proveedores: [{ id: 'p3', nombre: 'ALUMETAL', cuit: CUIT_A }] },
  )
  assert.equal(r.camino, CAMINO.CONFLICTO)
  assert.equal(r.motivo, 'nombre_ocupado')
})

test('un alias no puede pisar a otro que apunta a un proveedor distinto', () => {
  const alias = [{ nombre_norm: 'EL PUENTE', proveedor_id: 'otro', estado: 'vinculado' }]
  assert.equal(conflictoDeAlias('El Puente', 'Canónico', 'p1', alias)?.proveedor_id, 'otro')
  // Al MISMO proveedor no hay conflicto: ya está escrito lo mismo.
  assert.equal(conflictoDeAlias('El Puente', 'Canónico', 'otro', alias), null)
  const r = resolverNoMatcheado(
    { nombre: 'El Puente', cuit: CUIT_B },
    { proveedores: [{ id: 'p1', nombre: 'PUENTE MATERIALES', cuit: CUIT_B }], alias },
  )
  assert.equal(r.camino, CAMINO.EXISTENTE)
  assert.equal(r.aliasNuevo, false, 'no se pisa el alias que ya existe hacia otro proveedor')
})

// ═══ EL LOTE ═══

test('dos comprobantes del mismo proveedor nuevo dan de alta UNA sola vez', () => {
  const uno = resolverNoMatcheado({ nombre: 'Metalúrgica del Oeste', cuit: CUIT_B }, {})
  const dos = resolverNoMatcheado({ nombre: 'Metalúrgica del Oeste', cuit: CUIT_B }, {})
  const plan = planDeAltas([uno, dos])
  assert.equal(plan.altas.length, 1, 'una fila, no dos')
  assert.deepEqual(plan.nombres, ['Metalúrgica del Oeste'])
})

test('el mismo CUIT con dos grafías es un alta con dos alias, no dos proveedores', () => {
  const conocidos = { porCuit: new Map([[CUIT_B, 'Corralon Progreso']]) }
  const plan = planDeAltas([
    resolverNoMatcheado({ nombre: 'PEREZ GARCIA MARISOL BIBIANA', cuit: CUIT_B }, conocidos),
    resolverNoMatcheado({ nombre: 'Perez Garcia M. B.', cuit: CUIT_B }, conocidos),
  ])
  assert.equal(plan.altas.length, 1)
  assert.equal(plan.alias.length, 2)
})

test('un mismo texto que en la misma tanda apunta a dos CUIT no se vincula a ninguno', () => {
  const plan = planDeAltas([
    resolverNoMatcheado({ nombre: 'EL PUENTE', cuit: CUIT_A }, { porCuit: { [CUIT_A]: 'Puente Norte' } }),
    resolverNoMatcheado({ nombre: 'EL PUENTE', cuit: CUIT_B }, { porCuit: { [CUIT_B]: 'Puente Sur' } }),
  ])
  assert.equal(plan.alias.length, 0, 'un nombre no puede ser dos proveedores')
  assert.deepEqual(plan.ambiguos, ['EL PUENTE'])
  assert.equal(plan.altas.length, 2, 'los dos CUIT sí existen y los dos se dan de alta')
})

test('el proveedor que ya existía también entra al desplegable: si no, la celda queda en rojo', () => {
  const plan = planDeAltas([
    resolverNoMatcheado({ nombre: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: CUIT_A },
      { proveedores: [{ id: 'p1', nombre: 'DUPEC', cuit: CUIT_A }] }),
  ])
  assert.equal(plan.altas.length, 0)
  assert.deepEqual(plan.nombres, ['DUPEC'])
})

// ═══ EL DESPLEGABLE: LA OPERACIÓN QUE PUEDE ROMPER LA PESTAÑA ENTERA ═══

const LISTA_138 = Array.from({ length: 138 }, (_, i) => `Proveedor ${i + 1}`)

test('la lista ampliada conserva LOS 138 que ya estaban, en su orden', () => {
  const { lista, agregados } = ampliarDesplegable(LISTA_138, ['Metalúrgica del Oeste'])
  assert.equal(lista.length, 139)
  assert.deepEqual(lista.slice(0, 138), LISTA_138, 'ninguno de los que estaban se movió ni se cayó')
  assert.deepEqual(agregados, ['Metalúrgica del Oeste'])
})

test('no se duplica un valor que ya estaba, aunque venga con otra caja o espacios de más', () => {
  const { lista, agregados } = ampliarDesplegable(['DUPEC', 'Alumetal'], ['  dupec ', 'ALUMETAL', 'Nuevo'])
  assert.deepEqual(lista, ['DUPEC', 'Alumetal', 'Nuevo'])
  assert.deepEqual(agregados, ['Nuevo'])
})

test('sin la lista viva NO se reescribe la validación — sería borrar el desplegable', () => {
  assert.throws(() => ampliarDesplegable([], ['Nuevo']), /no se leyó el desplegable vivo/)
  assert.throws(() => requestValidacionProveedores({ sheetId: 1, lista: [] }), /lista vacía/)
})

test('un valor vacío o con salto de línea no entra: rompería la regla de validación', () => {
  assert.throws(() => ampliarDesplegable(['DUPEC', '  '], ['Nuevo']), /quedó vacío/)
  const { lista } = ampliarDesplegable(['DUPEC'], ['Metal\nOeste'])
  assert.deepEqual(lista, ['DUPEC', 'Metal Oeste'])
})

test('el desplegable no crece más allá del tope que Sheets dibuja', () => {
  const llena = Array.from({ length: MAX_OPCIONES_DESPLEGABLE }, (_, i) => `P${i}`)
  assert.throws(() => ampliarDesplegable(llena, ['Uno más']), /tope 500/)
})

test('el pedido de validación cubre la columna E desde la fila 4 y es estricto', () => {
  const req = requestValidacionProveedores({ sheetId: 1666326819, lista: ['DUPEC', 'Alumetal'], filas: 900 })
  assert.deepEqual(req.setDataValidation.range, {
    sheetId: 1666326819, startRowIndex: 3, endRowIndex: 900, startColumnIndex: 4, endColumnIndex: 5,
  })
  assert.equal(req.setDataValidation.rule.strict, true)
  assert.deepEqual(req.setDataValidation.rule.condition.values, [
    { userEnteredValue: 'DUPEC' }, { userEnteredValue: 'Alumetal' },
  ])
})

// ═══ IDENTIDAD OCUPADA — la definición que comparten el alta automática y el formulario web ═══

test('identidadOcupadaPor distingue el choque por CUIT del choque por nombre', () => {
  const provs = [{ id: 'p1', nombre: 'DUPEC', cuit: CUIT_A }, { id: 'p2', nombre: 'Alumetal', cuit: null }]
  assert.equal(identidadOcupadaPor(provs, { nombre: 'X', cuit: '30-70753365-6' })?.por, 'cuit')
  assert.equal(identidadOcupadaPor(provs, { nombre: 'ALUMETAL' })?.por, 'nombre')
  assert.equal(identidadOcupadaPor(provs, { nombre: 'Nuevo', cuit: CUIT_B }), null)
  assert.equal(identidadOcupadaPor(provs, { nombre: 'DUPEC', cuit: CUIT_A, excluirId: 'p1' }), null)
})

// ═══ LA ESCRITURA, CON UN `query` DE MENTIRA: SÓLO SE PRUEBA LO QUE DECIDE ═══

test('el alta que la base rechaza por carrera se relee y NO se convierte en un segundo proveedor', async () => {
  const llamadas = []
  const query = async (sql, params) => {
    llamadas.push(sql.trim().split(/\s+/).slice(0, 3).join(' '))
    if (sql.includes('insert into public.proveedores')) return { rows: [] } // otro ganó la carrera
    if (sql.includes('select id from public.proveedores')) return { rows: [{ id: 'ya-estaba' }] }
    return { rows: [{ id: 'alias1' }] }
  }
  const plan = { altas: [{ cuit: CUIT_B, nombre: 'Nuevo' }], alias: [{ nombre_norm: 'OTRO', nombre_origen: 'Otro', cuit: CUIT_B }] }
  const r = await aplicarAltas(plan, { query })
  assert.deepEqual(r.creados, [])
  assert.equal(r.yaEstaban[0].id, 'ya-estaba')
  assert.equal(r.alias[0].proveedorId, 'ya-estaba', 'el alias se cuelga del que YA estaba')
})

test('el alias automático queda marcado para poder auditarlo y deshacerlo', async () => {
  let notas = null
  const query = async (sql, params) => {
    if (sql.includes('insert into public.proveedores')) return { rows: [{ id: 'p-nuevo' }] }
    if (sql.includes('proveedor_alias')) { notas = params[3]; return { rows: [{ id: 'a1' }] } }
    return { rows: [] }
  }
  await aplicarAltas(
    { altas: [{ cuit: CUIT_B, nombre: 'Corralon Progreso' }], alias: [{ nombre_norm: 'PEREZ GARCIA', nombre_origen: 'Perez Garcia', cuit: CUIT_B }] },
    { query, comprobante: 'F A 0001-00000123' },
  )
  assert.match(notas, new RegExp(`^${MARCA_AUTOMATICA} ${CUIT_B}`))
  assert.match(notas, /F A 0001-00000123/)
})

test('un alias sin proveedor al que colgarse se rechaza, no se cuelga de cualquiera', async () => {
  const query = async () => ({ rows: [] })
  const r = await aplicarAltas({ altas: [], alias: [{ nombre_norm: 'X', nombre_origen: 'X', cuit: CUIT_B }] }, { query })
  assert.equal(r.alias.length, 0)
  assert.equal(r.rechazos[0].motivo, 'sin_proveedor_al_que_colgarlo')
})
