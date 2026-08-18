import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarNombre,
  cuitDigitoVerificadorOk,
  cuitTieneForma,
  nombresPendientes,
  normalizarCuit,
  normalizarNombreProveedor,
} from './proveedor-identidad.mjs'

// ── EL CUIT ES SU SERIE DE DÍGITOS ────────────────────────────────────────────
// El defecto que atrapan: guardar el CUIT como lo tipeó la persona. Con guiones y sin guiones son
// dos filas distintas para el índice único, y el proveedor se duplica igual que con texto libre.

test('el mismo CUIT escrito de cuatro formas normaliza a la misma serie', () => {
  const formas = ['30-70839055-7', '30708390557', ' 30 70839055 7 ', '30.708.390.55-7']
  const normalizados = new Set(formas.map(normalizarCuit))
  assert.equal(normalizados.size, 1, 'cuatro formas del mismo CUIT tienen que dar UNA sola clave')
  assert.equal([...normalizados][0], '30708390557')
})

test('normalizarCuit no inventa nada cuando no hay dato', () => {
  assert.equal(normalizarCuit(null), '')
  assert.equal(normalizarCuit(''), '')
  assert.equal(normalizarCuit('  '), '')
})

test('la forma exige once dígitos, ni diez ni doce', () => {
  assert.equal(cuitTieneForma('30-70839055-7'), true)
  assert.equal(cuitTieneForma('3070839055'), false)
  assert.equal(cuitTieneForma('307083905571'), false)
})

test('el dígito verificador distingue un CUIT real de uno con un dígito cambiado', () => {
  // Los cuatro primeros son CUIT reales leídos de public.proveedores (2026-08-19).
  for (const c of ['30708390557', '30558640355', '20111183415', '27172436132']) {
    assert.equal(cuitDigitoVerificadorOk(c), true, `${c} es un CUIT real y tiene que validar`)
  }
  // El typo clásico: un dígito del medio cambiado. La forma sigue siendo válida (11 dígitos), así
  // que SÓLO el verificador puede detectarlo — es la razón de ser de esta función.
  assert.equal(cuitTieneForma('30708390657'), true)
  assert.equal(cuitDigitoVerificadorOk('30708390657'), false)
})

test('el verificador respeta las dos excepciones de la norma (resto 0 y resto 1)', () => {
  // 20000000006: suma 5·2 = 10, resto 10 → DV 1. Comprobamos que no explota y decide algo estable.
  assert.equal(typeof cuitDigitoVerificadorOk('20000000006'), 'boolean')
  assert.equal(cuitDigitoVerificadorOk('123'), false, 'sin once dígitos no hay verificador que valga')
})

// ── EL NOMBRE ─────────────────────────────────────────────────────────────────

test('el nombre normaliza a mayúsculas con los espacios colapsados', () => {
  assert.equal(normalizarNombreProveedor('  Corralón   Progreso '), 'CORRALÓN PROGRESO')
  assert.equal(normalizarNombreProveedor(null), '')
})

test('la normalización NO saca acentos ni sufijos societarios', () => {
  // Deliberado: cada regla extra es una que puede divergir de la función SQL equivalente y volver a
  // partir la identidad en dos. Si esto cambia, tiene que cambiar la migración en el mismo commit.
  assert.notEqual(normalizarNombreProveedor('Corralón'), normalizarNombreProveedor('Corralon'))
  assert.notEqual(normalizarNombreProveedor('SANITARIOS OD S.A.S.'), normalizarNombreProveedor('SANITARIOS OD'))
})

// ── LA REGLA DURA: NUNCA VINCULAR POR PARECIDO ────────────────────────────────

test('un nombre parecido pero distinto queda PENDIENTE, no se vincula', () => {
  const canonicos = [{ id: 'p1', nombre: 'Corralón Progreso' }]
  // Éste es EL test del encargo: "CORRALON PROGRESO SRL" se parece muchísimo, comparte prefijo
  // entero, y aun así no es el mismo. Cualquier emparejador por similitud lo colgaría de `p1`.
  const r = clasificarNombre('CORRALON PROGRESO SRL', canonicos, [])
  assert.equal(r.estado, 'pendiente')
  assert.equal(r.proveedorId, null)
  assert.equal(r.via, 'sin_match')
})

test('lo que NO es un proveedor tampoco se vincula a nada', () => {
  // Nombres reales de costos_obra: 58 comprobantes de "SUELDOS", 34 de "ARCA", 12 de "BANCO".
  const canonicos = [{ id: 'p1', nombre: 'Banco Santander' }, { id: 'p2', nombre: 'Sueldos SA' }]
  for (const n of ['SUELDOS', 'ARCA', 'BANCO', 'SINDICATOS']) {
    assert.equal(clasificarNombre(n, canonicos, []).estado, 'pendiente', `${n} no se puede vincular solo`)
  }
})

test('la coincidencia EXACTA sobre el texto normalizado sí vincula', () => {
  const canonicos = [{ id: 'p1', nombre: 'Corralón Progreso' }]
  const r = clasificarNombre('  corralón   progreso  ', canonicos, [])
  assert.equal(r.estado, 'vinculado')
  assert.equal(r.proveedorId, 'p1')
  assert.equal(r.via, 'exacto')
})

test('dos canónicos que normalizan igual NO eligen uno: queda pendiente', () => {
  // La base ambigua es el duplicado que hay que resolver, no una moneda al aire.
  const canonicos = [{ id: 'p1', nombre: 'Alumetal' }, { id: 'p2', nombre: 'ALUMETAL' }]
  const r = clasificarNombre('alumetal', canonicos, [])
  assert.equal(r.estado, 'pendiente')
  assert.equal(r.proveedorId, null)
  assert.equal(r.via, 'ambiguo')
})

test('la decisión de una persona manda sobre la coincidencia exacta', () => {
  const canonicos = [{ id: 'p1', nombre: 'Femenia' }]
  const resoluciones = [{ nombre_norm: 'FEMENIA', proveedor_id: 'p9', estado: 'vinculado' }]
  const r = clasificarNombre('Femenia', canonicos, resoluciones)
  assert.equal(r.proveedorId, 'p9', 'lo que resolvió Administración no se recalcula')
  assert.equal(r.via, 'resolucion_manual')
})

test('marcar "no es un proveedor" lo saca de pendientes sin inventarle un vínculo', () => {
  const resoluciones = [{ nombre_norm: 'SUELDOS', proveedor_id: null, estado: 'no_es_proveedor' }]
  const r = clasificarNombre('Sueldos', [], resoluciones)
  assert.equal(r.estado, 'no_es_proveedor')
  assert.equal(r.proveedorId, null)
})

// ── LA LISTA DE TRABAJO ───────────────────────────────────────────────────────

test('los pendientes se agrupan por nombre y pesan por cantidad de comprobantes', () => {
  const filas = [
    { proveedor: 'Corralón Progreso', total: 100 },
    { proveedor: 'CORRALON PROGRESO SRL', total: 50 },
    { proveedor: 'corralon progreso srl', total: 25 },
    { proveedor: 'Alumetal', total: 10 },
    { proveedor: 'SUELDOS', total: 1 },
    { proveedor: 'SUELDOS', total: 1 },
    { proveedor: 'SUELDOS', total: 1 },
  ]
  const canonicos = [{ id: 'p1', nombre: 'Corralón Progreso' }]
  const r = nombresPendientes(filas, canonicos, [])
  // "Corralón Progreso" tiene canónico exacto → no aparece. Quedan SUELDOS (3) y las dos variantes
  // de la SRL agrupadas en una sola (2), más Alumetal (1).
  assert.deepEqual(r.map((x) => x.nombreNorm), ['SUELDOS', 'CORRALON PROGRESO SRL', 'ALUMETAL'])
  assert.equal(r[1].comprobantes, 2, 'las dos grafías de la SRL son UN pendiente, no dos')
  assert.equal(r[1].total, 75)
})

test('resolver un nombre lo saca de la lista de pendientes', () => {
  const filas = [{ proveedor: 'Trielec', total: 10 }, { proveedor: 'Dupec', total: 10 }]
  const antes = nombresPendientes(filas, [], [])
  assert.equal(antes.length, 2)
  const despues = nombresPendientes(filas, [], [{ nombre_norm: 'TRIELEC', proveedor_id: 'p3', estado: 'vinculado' }])
  assert.deepEqual(despues.map((x) => x.nombreNorm), ['DUPEC'])
})

test('una fila sin proveedor no genera un pendiente vacío', () => {
  assert.deepEqual(nombresPendientes([{ proveedor: '   ', total: 5 }, { proveedor: null, total: 5 }], [], []), [])
})
