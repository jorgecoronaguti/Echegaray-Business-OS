// LOS SIETE MODOS DE FALLA DEL MOTOR, CADA UNO EN ROJO ANTES QUE EN VERDE.
//
// ═══ QUÉ PRUEBA ESTE ARCHIVO Y QUÉ NO ═══
//
// `nucleo.test.mjs` prueba funciones puras. Éste prueba que el MOTOR ENTERO reaccione bien cuando
// algo sale mal, corriendo contra el doble puesto en `fetchImpl`: `google.mjs` completo, con su
// guarda de escritura, su freno y su localización de fórmulas. Un error que sólo se sabe lanzar en
// una función pura no prueba que el camino real llegue hasta ahí.
//
// ═══ LA MUTACIÓN NO ES UN COMENTARIO: ES CÓDIGO QUE CORRE ═══
//
// Cada caso se ejecuta DOS veces. Primero contra un clon del motor con la guarda desactivada de
// verdad —parcheando el texto del archivo, ver `mutante.mjs`—, donde la operación TIENE que pasar:
// eso demuestra que la guarda es lo único que la impide. Después contra el motor intacto, donde
// tiene que fallar con su código.
//
// Si mañana una guarda se convierte en una constante que siempre pasa, la mitad MUTADA deja de
// pasar y el test se pone rojo por eso. Es la defensa contra las dos cicatrices de este repo: el
// control que era una constante y escondía $4,1 M, y la mutación declarada que nadie corrió.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// El doble no manda un byte a Google; el freno se consulta igual, así que se apunta la marca a una
// ruta inexistente. La marca REAL no se lee, no se toca y no se borra.
process.env.ORQ_SHEETS_MARCA = '/dev/null/marca-inexistente-del-doble'

const { makeGoogleClient } = await import('../../google.mjs')
const { crearDrive, fetchFalso } = await import('./dobles/api-google-falsa.mjs')
const { CODIGOS, esError } = await import('./errores.mjs')
const { conMutacion } = await import('./mutante.mjs')
const MOTOR = await import('./motor.mjs')

/** Un cliente contra un Drive nuevo. Un doble compartido acumularía el estado de los tests
 *  anteriores y el orden de ejecución pasaría a importar. */
function cliente() {
  const drive = crearDrive()
  return { drive, google: makeGoogleClient({ auth: { getAccessToken: async () => 'token-del-doble' }, fetchImpl: fetchFalso(drive) }) }
}

/** El escenario base: una planilla con una hoja `Datos` de tres filas. */
async function mundo(motor = MOTOR) {
  const { drive, google } = cliente()
  const planilla = await motor.crearPlanilla(google, 'NEGATIVOS')
  await planilla.crearHoja('Datos')
  await planilla.escribirRango('Datos!A1:C3', [
    ['Proveedor', 'Neto', 'Obra'],
    ['ACME', 1000, 'Quattropani'],
    ['Sur', 2000, 'San Francisco'],
  ], { esquema: [null, 'numero', null], filasEncabezado: 1 })
  return { drive, google, planilla }
}

/**
 * ROJO Y DESPUÉS VERDE. `intentar(motor)` se corre contra el motor mutado —donde tiene que salir
 * bien— y contra el intacto —donde tiene que fallar con `codigo`.
 *
 * En la mitad mutada el código de error se compara como TEXTO y no por `instanceof`: el clon tiene
 * su propia clase `ErrorPlanilla` y un `instanceof` contra la del original siempre daría falso,
 * escondiendo justamente el caso en que la mutación no mutó nada.
 */
async function rojoYVerde({ codigo, mutacion, intentar }) {
  const resultado = await conMutacion(mutacion, async (motorMutado) => {
    try { await intentar(motorMutado); return { paso: true } } catch (e) { return { paso: false, codigo: e?.codigo, msg: e?.message } }
  })
  assert.equal(resultado.paso, true,
    `con la guarda desactivada la operación tenía que pasar y falló con ${resultado.codigo ?? '?'}: ${resultado.msg}`
    + ' — o la mutación no desactivó la guarda, o la guarda no es la que se cree.')

  await assert.rejects(() => intentar(MOTOR), (e) => {
    assert.ok(esError(e, codigo), `esperaba ${codigo} y vino ${e?.codigo ?? e?.name}: ${e?.message}`)
    return true
  })
}

// ══════════════════════════════════════════ 1 · RANGO INCORRECTO ══════════════════════════════

test('NEGATIVO · un rango ABIERTO se rechaza (mutado: se lee como si fuera cerrado)', async () => {
  await rojoYVerde({
    codigo: CODIGOS.RANGO_ABIERTO,
    // La mutación es lo que hace cualquiera que no haya pagado la trampa: resolver `A:C` a "lo que
    // hoy tiene contenido". Anda perfecto hasta que alguien agrega una fila y el total cambia solo.
    mutacion: {
      archivo: 'direcciones.mjs',
      de: "    return { hoja, desde: { fila: null, col: indiceCol(a.replace('$', '')) }, hasta: { fila: null, col: indiceCol(b.replace('$', '')) }, abierto: true, hojaEntera: false }",
      a: "    return { hoja, desde: { fila: 0, col: indiceCol(a.replace('$', '')) }, hasta: { fila: 2, col: indiceCol(b.replace('$', '')) }, abierto: false, hojaEntera: false }",
    },
    intentar: async (motor) => (await mundo(motor)).planilla.leerRango('Datos!A:C'),
  })
})

test('NEGATIVO · una grilla más chica que el rango declarado se rechaza: dejaría viva la capa anterior', async () => {
  const { planilla } = await mundo()
  await assert.rejects(
    () => planilla.escribirRango('Datos!A1:C5', [['a', 1, 'b']]),
    (e) => esError(e, CODIGOS.RANGO_INVALIDO) && /TODO su alto/.test(e.message),
  )
  // Y el rango que SÍ coincide pasa: la guarda no es un "siempre no".
  assert.equal((await planilla.escribirRango('Datos!A5:C5', [['a', 1, 'b']])).verificado, true)
})

test('NEGATIVO · un rango sintácticamente roto no gasta una llamada a la API', async () => {
  const { planilla, drive } = await mundo()
  const antes = drive.trafico.length
  await assert.rejects(() => planilla.leerRango('Datos!ZZ'), (e) => esError(e, CODIGOS.RANGO_INVALIDO))
  assert.equal(drive.trafico.length, antes)
})

// ══════════════════════════════════════════ 2 · HOJA INEXISTENTE ══════════════════════════════

test('NEGATIVO · copiar una hoja que no existe falla (mutado: copia la primera, en silencio)', async () => {
  await rojoYVerde({
    codigo: CODIGOS.HOJA_INEXISTENTE,
    // "Si no la encuentro, uso la primera" es un atajo que se escribe solo y no da ningún error:
    // simplemente se copia la hoja equivocada y nadie se entera.
    mutacion: {
      archivo: 'motor.mjs',
      de: '    const h = todas.find((s) => s.title === nombre)\n    if (!h) {',
      a: '    const h = todas.find((s) => s.title === nombre) ?? todas[0]\n    if (!h) {',
    },
    intentar: async (motor) => (await mundo(motor)).planilla.copiarHoja('Fantasma', 'Copia'),
  })
})

test('NEGATIVO · la hoja inexistente trae la LISTA de las que sí están, para que un `if` decida solo', async () => {
  const { planilla } = await mundo()
  await assert.rejects(() => planilla.hoja('Compras'), (e) => {
    assert.ok(esError(e, CODIGOS.HOJA_INEXISTENTE))
    assert.deepEqual(e.detalle.existentes, ['Hoja 1', 'Datos'])
    return true
  })
})

test('NEGATIVO · copiar SOBRE una hoja que ya existe se rechaza en vez de duplicar el nombre', async () => {
  const { planilla } = await mundo()
  await assert.rejects(() => planilla.copiarHoja('Datos', 'Hoja 1'), (e) => esError(e, CODIGOS.RANGO_INVALIDO))
})

// ══════════════════════════════════════════ 3 · FÓRMULA ROTA ══════════════════════════════════

test('NEGATIVO · una fórmula que aterriza PERFECTA y devuelve #REF! no cuenta como escrita', async () => {
  await rojoYVerde({
    codigo: CODIGOS.ESCRITURA_NO_PERSISTIO,
    // La verificación INGENUA: comparar el texto de la fórmula y no mirar si calcula. El texto
    // coincide carácter por carácter, así que esto da verde — y la celda dice #REF!.
    mutacion: {
      archivo: 'verificacion.mjs',
      de: '        if (esErrorSheet(valor)) {\n          diferencias.push({ fila: f, col: c, motivo: \'formula_en_error\', esperado: q, leido: valor })\n        }',
      a: '        if (false) { void valor }',
    },
    intentar: async (motor) => (await mundo(motor)).planilla.escribirFormula('Datos!E1', '=SUM(HojaQueNoExiste!A1:A3)'),
  })
})

test('NEGATIVO · algo que no empieza con "=" no es una fórmula', async () => {
  const { planilla } = await mundo()
  await assert.rejects(() => planilla.escribirFormula('Datos!E1', 'SUM(B2:B3)'), (e) => esError(e, CODIGOS.FORMULA_ROTA))
})

test('NEGATIVO · una función que no existe da #NAME?, y la misma fórmula bien escrita pasa', async () => {
  const { planilla } = await mundo()
  await assert.rejects(() => planilla.escribirFormula('Datos!E2', '=FUNCIONINVENTADA(B2)'), (e) => {
    assert.ok(esError(e, CODIGOS.ESCRITURA_NO_PERSISTIO))
    assert.equal(e.detalle.diferencias[0].motivo, 'formula_en_error')
    assert.equal(e.detalle.diferencias[0].leido, '#NAME?')
    return true
  })
  assert.equal((await planilla.escribirFormula('Datos!E3', '=ROUND(SUM(B2:B3),2)')).verificado, true)
})

// ══════════════════════════════════════ 4 · TIPO DE DATO EQUIVOCADO ═══════════════════════════

test('NEGATIVO · un texto en la columna de importes no llega al Sheet (mutado: llega)', async () => {
  await rojoYVerde({
    codigo: CODIGOS.TIPO_INVALIDO,
    // El validador convertido en constante. Nunca puede decir que no — y un texto en una columna
    // de importes no da error: rompe el SUMIFS que la suma, en silencio.
    mutacion: {
      archivo: 'tipos.mjs',
      de: 'export function validarTipos(grid, esquema = []) {\n  const malas = []',
      a: 'export function validarTipos(grid, esquema = []) {\n  if (grid) return []\n  const malas = []',
    },
    intentar: async (motor) => (await mundo(motor)).planilla.escribirRango('Datos!A4:C4',
      [['Nuevo', 'mil quinientos', 'Obra']], { esquema: [null, 'numero', null] }),
  })
})

test('NEGATIVO · la validación de tipos corre ANTES de mandar nada, y el dato malo no queda', async () => {
  const { planilla, drive } = await mundo()
  const antes = drive.trafico.length
  await assert.rejects(
    () => planilla.escribirRango('Datos!A4:C4', [['x', 'no es número', 'y']], { esquema: [null, 'numero', null] }),
    (e) => esError(e, CODIGOS.TIPO_INVALIDO),
  )
  assert.equal(drive.trafico.length, antes, 'una grilla con tipos malos no gasta una llamada')
  assert.equal((await planilla.leerCelda('Datos!B4')).valor, null)
})

// ═══════════════════════════════════════ 5 · FORMATO NO SOPORTADO ═════════════════════════════

/** Un archivo de Drive con el MIME que se quiera, sin pasar por `crearPlanilla`. */
function archivoDe(mimeType, name) {
  const { drive, google } = cliente()
  const arch = drive.nuevoArchivo({ name, mimeType })
  return { drive, google, id: arch.id }
}

test('NEGATIVO · un .xlsm se lee y NO se escribe (mutado: se escribe y le borra las macros)', async () => {
  await rojoYVerde({
    codigo: CODIGOS.FORMATO_NO_SOPORTADO,
    // La compuerta de capacidades apagada: el motor deja de mirar el formato y trata todo como si
    // fuera un Sheet nativo. El .xlsm se abre, se escribe, y vuelve sin macros.
    mutacion: {
      archivo: 'formatos.mjs',
      de: '  const cap = capacidades(formato)\n  return cap[operacion] ? null : cap',
      a: '  const cap = capacidades(formato)\n  return cap.leer ? null : cap',
    },
    intentar: async (motor) => {
      const { google, id } = archivoDe('application/vnd.ms-excel.sheet.macroEnabled.12', 'Presupuesto con macros.xlsm')
      return (await motor.abrirPlanilla(google, id)).escribirCelda('Hoja 1!A1', 'x')
    },
  })
})

test('NEGATIVO · el .xlsm se ABRE para leer, y cada forma de escribirlo se niega diciendo qué se perdería', async () => {
  const { google, id } = archivoDe('application/vnd.ms-excel.sheet.macroEnabled.12', 'Con macros.xlsm')
  const p = await MOTOR.abrirPlanilla(google, id)
  assert.equal(p.formato, 'xlsm', 'leer sí: el motor no se hace el que no lo conoce')
  assert.deepEqual((await p.hojas()).map((h) => h.title), ['Hoja 1'])

  for (const op of [
    () => p.escribirCelda('Hoja 1!A1', 'x'),
    () => p.escribirFormula('Hoja 1!A2', '=SUM(A1:A1)'),
    () => p.agregarFilas('Hoja 1!A1:B1', [['a', 'b']]),
    () => p.crearHoja('Nueva'),
    () => p.copiarHoja('Hoja 1', 'Copia'),
    () => p.borrarHoja('Hoja 1'),
    () => p.definirRangoConNombre('X', 'Hoja 1!A1:A2'),
    () => p.escribirPreservando('Hoja 1!A1:B2', [['a', 'b']]),
  ]) {
    await assert.rejects(op, (e) => {
      assert.ok(esError(e, CODIGOS.FORMATO_NO_SOPORTADO), `vino ${e?.codigo}: ${e?.message}`)
      assert.match(e.message, /macros|VBA/i, 'el NO tiene que decir QUÉ se perdería')
      assert.ok(e.detalle.alternativa, 'un NO sin alternativa deja al llamador sin salida')
      return true
    })
  }
})

test('NEGATIVO · duplicar un template .xlsm se niega ANTES de dejar una copia inservible en el Drive', async () => {
  const { drive, google, id } = archivoDe('application/vnd.ms-excel.sheet.macroEnabled.12', 'Template.xlsm')
  const antes = drive.archivos.size
  await assert.rejects(() => MOTOR.duplicarTemplate(google, id, 'Copia'), (e) => esError(e, CODIGOS.FORMATO_NO_SOPORTADO))
  assert.equal(drive.archivos.size, antes, 'no quedó una copia huérfana en el Drive del dueño')
})

test('NEGATIVO · un PDF no se abre como planilla', async () => {
  const { google, id } = archivoDe('application/pdf', 'Factura.pdf')
  await assert.rejects(() => MOTOR.abrirPlanilla(google, id), (e) => esError(e, CODIGOS.FORMATO_NO_SOPORTADO))
})

// ═════════════════════════════════════ 6 · ESCRITURA QUE NO PERSISTIÓ ═════════════════════════

/** Un cliente cuyo servidor acepta el PUT con 200 y NO guarda nada. Es el 200 vacío: pasa de
 *  verdad —una guarda que descarta el lote, una cuota que parte la escritura al medio— y sin
 *  relectura se reporta como éxito. */
function clienteMentiroso() {
  const drive = crearDrive()
  const honesto = fetchFalso(drive)
  const estado = { mintiendo: false }
  const google = makeGoogleClient({
    auth: { getAccessToken: async () => 't' },
    fetchImpl: async (url, o) => (estado.mintiendo && (o?.method || 'GET') === 'PUT'
      ? { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ updatedCells: 3 }), text: async () => '{}' }
      : honesto(url, o)),
  })
  return { drive, google, estado }
}

test('NEGATIVO · la API contesta 200 y el dato no aterrizó (mutado: se da por escrito)', async () => {
  await rojoYVerde({
    codigo: CODIGOS.ESCRITURA_NO_PERSISTIO,
    // La implementación ingenua entera: "la API devolvió 200, listo". Es la que este motor viene a
    // reemplazar, y con el servidor mentiroso da verde sin haber escrito una sola celda.
    mutacion: {
      archivo: 'motor.mjs',
      de: '    const { ok, diferencias } = compararEscritura(esperado, leido, leidoF)',
      a: '    const { ok, diferencias } = { ok: true, diferencias: [] }; void compararEscritura; void leido; void leidoF',
    },
    intentar: async (motor) => {
      const { google, estado } = clienteMentiroso()
      const p = await motor.crearPlanilla(google, 'MENTIROSO')
      await p.crearHoja('Datos')
      estado.mintiendo = true
      return p.escribirRango('Datos!A2:C2', [['x', 9, 'z']])
    },
  })
})

test('NEGATIVO · el diff nombra la celda con su dirección real, y con el servidor honesto pasa', async () => {
  const { google, estado } = clienteMentiroso()
  const p = await MOTOR.crearPlanilla(google, 'MENTIROSO')
  await p.crearHoja('Datos')
  assert.equal((await p.escribirRango('Datos!A1:C1', [['a', 1, 'b']])).verificado, true)

  estado.mintiendo = true
  await assert.rejects(() => p.escribirRango('Datos!A2:C2', [['x', 9, 'z']]), (e) => {
    assert.ok(esError(e, CODIGOS.ESCRITURA_NO_PERSISTIO))
    assert.equal(e.detalle.diferencias.length, 3)
    assert.match(e.message, /A2: esperaba "x" y hay ""/)
    return true
  })
})

test('NEGATIVO · una guarda que descarta el lote NO se confunde con una escritura hecha', async () => {
  const { planilla, google } = await mundo()
  // `{protegido:true}` es lo que devuelven el freno de mano, el candado y no-borrar: viene con
  // forma de éxito y no lo es.
  const real = google.updateSheetValues
  google.updateSheetValues = async () => ({ protegido: true, congelado: true, motivo: 'freno puesto' })
  try {
    await assert.rejects(() => planilla.escribirCelda('Datos!A1', 'x'), (e) => esError(e, CODIGOS.ESCRITURA_CONGELADA))
  } finally { google.updateSheetValues = real }
})

test('NEGATIVO · borrar una hoja que no se borró se detecta releyendo', async () => {
  const { planilla, google } = await mundo()
  const real = google.spreadsheetBatchUpdate
  google.spreadsheetBatchUpdate = async () => ({ replies: [{}] }) // dice que sí y no hace nada
  try {
    await assert.rejects(() => planilla.borrarHoja('Datos'), (e) => esError(e, CODIGOS.ESCRITURA_NO_PERSISTIO))
  } finally { google.spreadsheetBatchUpdate = real }
  assert.ok((await planilla.hojas()).some((h) => h.title === 'Datos'), 'y la hoja sigue ahí, como corresponde')
})

test('NEGATIVO · un rango con nombre que quedó apuntando a otro lado se detecta', async () => {
  const { planilla, google } = await mundo()
  const real = google.getNamedRanges
  let vueltas = 0
  google.getNamedRanges = async () => (++vueltas <= 1 ? [] : [{ namedRangeId: 'x', name: 'IMPORTES', range: { sheetId: 1001, startRowIndex: 50, endRowIndex: 51, startColumnIndex: 0, endColumnIndex: 1 } }])
  try {
    // Existe, pero apunta a A51 en vez de B2:B3. Un nombre que apunta a celdas vacías no da error:
    // da cero, que es peor que un error.
    await assert.rejects(() => planilla.definirRangoConNombre('IMPORTES', 'Datos!B2:B3'), (e) => {
      assert.ok(esError(e, CODIGOS.ESCRITURA_NO_PERSISTIO))
      assert.match(e.message, /quedó apuntando a/)
      return true
    })
  } finally { google.getNamedRanges = real }
})

// ══════════════════════════════════════════ 7 · REVISIÓN VIEJA ════════════════════════════════

test('NEGATIVO · si el destino cambió desde que lo leíste, no se pisa (mutado: se pisa)', async () => {
  await rojoYVerde({
    codigo: CODIGOS.REVISION_VIEJA,
    // La huella como CONSTANTE: el control que no puede decir que no. Es el defecto exacto que en
    // este repo escondió $4,1 M — un control que se compara contra sí mismo siempre da verde.
    mutacion: {
      archivo: 'verificacion.mjs',
      de: 'export function huella(grid) {\n  const filas =',
      a: 'export function huella(grid) {\n  if (grid) return \'constante\'\n  const filas =',
    },
    intentar: async (motor) => {
      const { planilla } = await mundo(motor)
      const revision = await planilla.revisionDe('Datos!B2:B3')
      await planilla.escribirRango('Datos!B2:B3', [[999], [888]]) // otro escribe en el medio
      return planilla.escribirRango('Datos!B2:B3', [[1], [2]], { revision })
    },
  })
})

test('NEGATIVO · con la revisión al día la escritura pasa, y el error trae las dos huellas', async () => {
  const { planilla } = await mundo()
  const revision = await planilla.revisionDe('Datos!B2:B3')
  assert.equal((await planilla.escribirRango('Datos!B2:B3', [[1111], [2222]], { revision })).verificado, true)

  await assert.rejects(() => planilla.escribirRango('Datos!B2:B3', [[3], [4]], { revision }), (e) => {
    assert.ok(esError(e, CODIGOS.REVISION_VIEJA))
    assert.equal(e.detalle.revisionEsperada, revision)
    assert.notEqual(e.detalle.revisionActual, revision)
    return true
  })
})

// ══════════════════════════════ EL CINTURÓN: el destino prohibido ═════════════════════════════

test('NEGATIVO · el Flujo de Caja se LEE y no se escribe, en ninguna de sus formas', async () => {
  const CASH_FLOW = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  assert.ok(MOTOR.PROHIBIDOS_ESCRIBIR.has(CASH_FLOW), 'si esto sale de la lista, sale con una decisión del dueño')

  const { drive, google } = cliente()
  // Se fabrica un archivo con EXACTAMENTE ese id para recorrer el camino completo y no la constante.
  const arch = drive.nuevoArchivo({ name: 'Flujo de Caja - Cash Flow' })
  drive.archivos.delete(arch.id)
  arch.id = CASH_FLOW
  drive.archivos.set(CASH_FLOW, arch)

  const p = await MOTOR.abrirPlanilla(google, CASH_FLOW)
  assert.deepEqual((await p.hojas()).map((h) => h.title), ['Hoja 1'], 'leer sí: es fuente, y una fuente se lee')

  for (const op of [
    () => p.escribirCelda('Hoja 1!A1', 'x'),
    () => p.escribirRango('Hoja 1!A1:B1', [['a', 'b']]),
    () => p.agregarFilas('Hoja 1!A1:B1', [['a', 'b']]),
    () => p.crearHoja('Nueva'),
    () => p.escribirPreservando('Hoja 1!A1:B2', [['a', 'b']]),
  ]) {
    await assert.rejects(op, (e) => esError(e, CODIGOS.DESTINO_PROHIBIDO))
  }
  // Y ni una sola escritura salió al cable.
  assert.equal(drive.trafico.filter((t) => t.metodo !== 'GET').length, 0)
})
