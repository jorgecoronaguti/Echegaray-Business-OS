// LA CLASE DE DEFECTO, NO EL CASO: un generador que ACHICA su grilla tiene que dejar el sobrante
// limpiable. Da igual si se achicó de ancho (una columna que se sacó del código) o de alto (una fila
// que ya no se emite): las dos veces que pasó el mismo día, en OBRAS, el archivo quedó con la corrida
// anterior publicada al lado y abajo del cuadro nuevo.
//
// Cada test de acá abajo se pone rojo si se revierte la parte del mecanismo que lo cubre.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VACIO } from './preservar-anotaciones.mjs'
import { MIA_PROBADA } from './no-borrar.mjs'
import {
  conColaLimpiable, conColaMedida, conColaMedidaLeida, ultimaFilaConDato, avisoDeCola,
} from './cola-de-rango.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// MODO A — DIMENSIONES DECLARADAS (layout fijo)
// ─────────────────────────────────────────────────────────────────────────────

test('achicar el ANCHO deja la columna vieja marcada para limpiar, no huérfana', () => {
  // El generador pasó de 4 a 3 columnas. La cuarta existe en el archivo con la glosa de ayer.
  const filas = [['a', 'b', 'c'], ['d', 'e', 'f']]
  const r = conColaLimpiable(filas, { ancho: 4, alto: 2, quien: 'test' })
  assert.deepEqual(r[0], ['a', 'b', 'c', VACIO])
  assert.deepEqual(r[1], ['d', 'e', 'f', VACIO])
})

test('achicar el ALTO deja la fila vieja marcada para limpiar: si no, el cuadro se muestra dos veces', () => {
  const r = conColaLimpiable([['a', 'b']], { ancho: 2, alto: 3, quien: 'test' })
  assert.equal(r.length, 3)
  assert.ok(r.slice(1).every((f) => f.every((c) => c === VACIO)), 'las filas que sobran van enteras con centinela')
})

test('nunca se limpia más allá de lo declarado: la columna 5 no es mía aunque la hoja la tenga', () => {
  const r = conColaLimpiable([['a']], { ancho: 3, alto: 1, quien: 'test' })
  assert.equal(r[0].length, 3, 'llega hasta el ancho histórico y ni una celda más')
})

test('si la grilla supera el alto declarado, ROMPE: una cola silenciosa es peor que un aborto', () => {
  assert.throws(() => conColaLimpiable([['a'], ['b'], ['c']], { ancho: 1, alto: 2, quien: 'obras-grilla' }),
    /obras-grilla: la grilla creció a 3 filas.*Subí ALTO_HISTORICO a 3/s)
})

test('sin dimensiones declaradas no se limpia nada: falla, no adivina', () => {
  assert.throws(() => conColaLimpiable([['a']], { ancho: 0, alto: 5 }), /ancho y alto históricos/)
})

// ─────────────────────────────────────────────────────────────────────────────
// MODO B — LA COLA MEDIDA (grilla que es una lista)
// ─────────────────────────────────────────────────────────────────────────────

test('la lista se acortó: las filas que sobran de la corrida anterior se marcan para limpiar', () => {
  const filas = [['h1', 'h2'], ['x', '1']]
  const previo = [['h1', 'h2'], ['x', '1'], ['y', '2'], ['z', '3']]
  const r = conColaMedida(filas, previo, { ancho: 2 })
  assert.equal(r.limpiadas, 2)
  assert.deepEqual(r.filas.slice(2), [[VACIO, VACIO], [VACIO, VACIO]])
  assert.equal(r.desde, 3); assert.equal(r.hasta, 4)
})

test('la lista creció o quedó igual: no se toca una sola celda', () => {
  const filas = [['a'], ['b'], ['c']]
  const r = conColaMedida(filas, [['a'], ['b']], { ancho: 1 })
  assert.equal(r.limpiadas, 0)
  assert.equal(r.filas, filas, 'devuelve la MISMA grilla: no hay nada que extender')
})

test('la cola se mide por CONTENIDO, no por el alto de la hoja: 900 filas vacías no son cola', () => {
  const previo = [['a'], ['b'], ...Array.from({ length: 900 }, () => [''])]
  assert.equal(ultimaFilaConDato(previo), 2)
  assert.equal(conColaMedida([['a'], ['b']], previo, { ancho: 1 }).limpiadas, 0)
})

test('en una pestaña de contenido, la fila con texto del dueño se CONSERVA y la mía se limpia', () => {
  // La prueba de propiedad tiene dos patas: la FORMA (un importe, una fecha, un CUIT) y el REGISTRO de
  // rótulos que este generador escribió antes. "ojo: falta la factura de Pérez" no pasa ninguna de las
  // dos, así que esa fila no se pisa aunque esté en el medio de la cola.
  const previo = [['Concepto', 'Monto'], ['IVA', '$1.000'], ['ojo: falta la factura de Pérez', ''], ['IIBB', '$2.000']]
  const mios = new Set(['IVA', 'IIBB'])
  const r = conColaMedida([['Concepto', 'Monto']], previo, { ancho: 2, conPrueba: true, mios })
  assert.equal(r.limpiadas, 2, 'las dos filas de rótulos propios se limpian')
  assert.deepEqual(r.preservadas, [3], 'la fila 3 es del dueño')
  assert.deepEqual(r.filas[2], ['', ''], 'y va con cadena vacía = "no es mía", que la fusión conserva')
  assert.deepEqual(r.filas[1], [VACIO, VACIO])
})

test('sin registro de rótulos la prueba se vuelve estricta: la cola se conserva, no se adivina', () => {
  // Si la base no contesta, `mios` viene vacío. Un rótulo de texto deja de ser probablemente propio y
  // la fila NO se limpia. Es el lado correcto para equivocarse: la cola se ve, un borrado no.
  const previo = [['Concepto'], ['IVA'], ['IIBB']]
  const r = conColaMedida([['Concepto']], previo, { ancho: 1, conPrueba: true, mios: new Set() })
  assert.equal(r.limpiadas, 0)
  assert.deepEqual(r.preservadas, [2, 3])
})

test('en un espejo NO se pide prueba: el texto libre de la fuente también es cola', () => {
  // Un espejo es una copia byte a byte y no tiene nada del dueño adentro. Si se le pidiera "forma de
  // generador", una razón social ("PEREZ HNOS SA") quedaría inmortal y el espejo mentiría.
  const previo = [['CUIT', 'Razón social'], ['20-1-3', 'PEREZ HNOS SA']]
  const r = conColaMedida([['CUIT', 'Razón social']], previo, { ancho: 2 })
  assert.equal(r.limpiadas, 1)
  assert.deepEqual(r.filas[1], [VACIO, VACIO])
})

test('una columna declarada ajena no se toca ni en la cola', () => {
  const r = conColaMedida([['a', 'b', 'c']], [['a', 'b', 'c'], ['x', 'y', 'z']], { ancho: 3, columnasAjenas: [2] })
  assert.deepEqual(r.filas[1], [VACIO, VACIO, ''], 'la columna del dueño va con cadena vacía')
})

// ─────────────────────────────────────────────────────────────────────────────
// LA LECTURA: falla cerrado, y no inventa la letra de la columna
// ─────────────────────────────────────────────────────────────────────────────

test('si no se puede releer la pestaña, NO se extiende: la cola espera a la corrida siguiente', async () => {
  const google = { readSheetValues: async () => { throw new Error('429') } }
  const filas = [['a']]
  const r = await conColaMedidaLeida(google, 'ID', "'X'", filas, { ancho: 1 })
  assert.equal(r.noVerificable, true)
  assert.equal(r.filas, filas)
  assert.match(avisoDeCola(r, 'X'), /no pude releer/)
})

test('el rango de lectura usa la letra REAL de la columna: pasada la Z, 64+n no es una letra', async () => {
  // `String.fromCharCode(64 + 27)` da '[', y el rango "A1:[400" no lee nada. El defecto estaba latente
  // en dos generadores; acá el ancho es 30 (columna AD).
  let rango = ''
  const google = { readSheetValues: async (_id, r) => { rango = r; return [] } }
  await conColaMedidaLeida(google, 'ID', "'X'", [['a']], { ancho: 30, tope: 400 })
  assert.equal(rango, "'X'!A1:AD400")
})

test('LA COLA SE PUEDE BORRAR AUNQUE NO TENGA HUELLA: se prueba por la FORMA de lo que hay', () => {
  // ═══ EL DEFECTO MEDIDO (04/09/2026) ═══
  //
  // `VACIO` dice "es mía y va vacía", y aguas abajo `huella-celda` sólo lo obedece si tiene huella
  // propia de esa celda. Las que escribió una versión del generador ANTERIOR al sistema de huellas
  // no tienen ninguna: la guarda responde "nunca fue mía" y la cola queda publicada para siempre.
  // En «Impuestos y Financieros», al bajar de 105 filas a 68, las filas 77, 101, 103 y 105
  // sobrevivieron a cuatro corridas seguidas — un renglón de 592 caracteres y dos alícuotas sueltas.
  const filas = [['⇒ Total', 1], ['fin', 2]]
  const previo = [
    ['⇒ Total', 1], ['fin', 2],
    ['', '=MAX(SUMPRODUCT(1))'],        // fórmula fósil: forma de generador
    ['', '$1.234'],                     // importe fósil
    ['▲ IVA de ago a diciembre: PROYECCIÓN — débito = …', ''], // marca del OS
    ['ojo: preguntar al contador', ''], // TEXTO LIBRE del dueño: no se toca
  ]
  const r = conColaMedida(filas, previo, { ancho: 2, probarPorForma: true })
  const cola = r.filas.slice(filas.length)
  assert.equal(cola[0][1], MIA_PROBADA, 'una fórmula fósil se prueba propia y se borra')
  assert.equal(cola[1][1], MIA_PROBADA, 'un importe fósil también')
  assert.equal(cola[2][0], MIA_PROBADA, 'una marca tipográfica del OS también')
  // UN TEXTO LIBRE NO SE PRUEBA: sigue yendo con el centinela de siempre y quien decide si se borra
  // sigue siendo la guarda que relee el destino. Este mecanismo AGREGA una prueba, no saca una
  // protección — si bajara de VACIO a "conservar", cambiaría el comportamiento de las otras trece
  // pestañas que ya limpian su cola.
  assert.equal(cola[3][0], VACIO, 'un texto libre no se prueba propio: lo sigue decidiendo la guarda')
  // Y una celda que ya está vacía tampoco necesita probar nada.
  assert.equal(cola[0][0], VACIO)
  // Y APAGADA POR DEFECTO: saltear la guarda de borrado es la forma que tomaron las pérdidas de
  // trabajo del dueño, y catorce pestañas llaman a esta función. Sin la bandera, todo sigue en VACIO.
  const sinBandera = conColaMedida(filas, previo, { ancho: 2 }).filas.slice(filas.length)
  assert.ok(sinBandera.every((f) => f.every((c) => c === VACIO || c === '')), 'sin bandera no cambia nada')
})
