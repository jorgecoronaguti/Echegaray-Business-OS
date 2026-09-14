import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DESTINO, catalogoDeDestinos, leerCeldaObra, opcionesDeObra, resolverCeldaObra, rotuloDeObra,
  rotuloSinObra, unidadIncoherente,
} from './obra-destino.mjs'

// Recorte del catálogo vivo del 14/09/2026 (códigos reales).
const OBRAS = [
  { id: 'messina-playon-azufre', codigo: 'OB-0021', nombre: 'ME - PLAYÓN DE AZUFRE', cliente_texto: 'MESSINA' },
  { id: 'messina-bsa', codigo: 'OB-0019', nombre: 'ME - BSA', cliente_texto: 'MESSINA' },
  { id: 'bsa-planta', codigo: 'OB-0013', nombre: 'ME - BSA PLANTA', cliente_texto: 'Messina', fusionada_en: 'messina-bsa' },
  { id: 'le-galpon-9', codigo: 'OB-0007', nombre: 'LE - GALPÓN 9', cliente_texto: 'La Estrella' },
  { id: 'le-comedor', codigo: 'OB-0006', nombre: 'LE - OFICINA Y FÁBRICA DE PALITOS', cliente_texto: 'La Estrella' },
  { id: 'quattropani', codigo: 'OB-0008', nombre: 'QP - SALÓN COMERCIAL', cliente_texto: 'Quattropani - Melisa García SAS' },
  { id: 'prueba-e2e', codigo: 'ZZ-0001', nombre: '[PRUEBA E2E] Obra de pruebas', cliente_texto: null },
]
const CLIENTES = new Map([['messina', 'MESSINA'], ['estrella', 'LA ESTRELLA'], ['quattropani melisa garcia sas', 'QUATTROPANI']])
const cat = catalogoDeDestinos({ obras: OBRAS, clienteAlias: CLIENTES })

test('el rótulo es el MISMO que el de la app: «código · nombre», con el separador de src/shared/utils/obra.ts', () => {
  assert.equal(rotuloDeObra({ codigo: 'OB-0021', nombre: 'ME - PLAYÓN DE AZUFRE' }), 'OB-0021 · ME - PLAYÓN DE AZUFRE')
  const ts = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'shared', 'utils', 'obra.ts'), 'utf8')
  assert.match(ts, /return `\$\{codigo\} · \$\{nombre\}`/, 'si la app cambia el separador, el desplegable del Sheet queda con otro rótulo')
})

test('parser: el código manda, no el nombre — una obra renombrada se sigue leyendo', () => {
  assert.deepEqual(leerCeldaObra('OB-0021 · ME - PLAYÓN DE AZUFRE'), { tipo: 'codigo', codigo: 'OB-0021' })
  assert.deepEqual(leerCeldaObra('  ob-0021 · nombre viejo que ya no existe'), { tipo: 'codigo', codigo: 'OB-0021' })
  const r = resolverCeldaObra('OB-0021 · ME - PLAYON AZUFRE (viejo)', cat)
  assert.equal(r.obra_id, 'messina-playon-azufre')
  assert.equal(r.destino, DESTINO.OBRA)
  assert.equal(r.cliente, 'MESSINA')
})

test('parser: los destinos fijos de estructura se leen por su código', () => {
  assert.deepEqual(resolverCeldaObra('ES-ADM · Estructura – Administración', cat),
    { destino: DESTINO.ADMIN, obra_id: null, cliente: null, celda: 'ES-ADM · Estructura – Administración', error: null })
  assert.equal(resolverCeldaObra('es-tal', cat).destino, DESTINO.TALLER)
})

test('IMP y FIN NO son destinos (dueño 14/09: esos gastos van a su pestaña, no a Compras)', () => {
  assert.equal(resolverCeldaObra('IMP · Impuestos y cargas', cat).destino, null)
  assert.match(resolverCeldaObra('IMP · Impuestos y cargas', cat).error, /no es una obra/)
  assert.equal(resolverCeldaObra('FIN · Financiero', cat).destino, null)
  assert.ok(!opcionesDeObra(cat).some((o) => /^(IMP|FIN)\b/.test(o)))
})

test('parser: «Sin obra – cliente» es obra de ese cliente SIN sub-obra, con guion largo o corto y sin acentos', () => {
  for (const v of ['Sin obra – LA ESTRELLA', 'sin obra - la estrella', 'SIN OBRA-La Estrella']) {
    const r = resolverCeldaObra(v, cat)
    assert.equal(r.destino, DESTINO.OBRA, v)
    assert.equal(r.obra_id, null, v)
    assert.equal(r.cliente, 'LA ESTRELLA', v)
    assert.equal(r.error, null, v)
  }
  assert.match(resolverCeldaObra('Sin obra – Cliente Inventado', cat).error, /cliente/)
})

test('una obra fusionada se lee como la obra en la que se fusionó', () => {
  assert.equal(resolverCeldaObra('OB-0013 · ME - BSA PLANTA', cat).obra_id, 'messina-bsa')
})

test('celda vacía = la fila no trae obra (sigue la inferencia); texto suelto o código inexistente = error, nunca una obra', () => {
  assert.deepEqual(resolverCeldaObra('', cat), { destino: null, obra_id: null, cliente: null, celda: null, error: null })
  assert.match(resolverCeldaObra('Galpon 7', cat).error, /no es una obra/)
  assert.match(resolverCeldaObra('OB-0999 · LE - GALPÓN 7', cat).error, /OB-0999/)
  assert.equal(resolverCeldaObra('OB-0999', cat).obra_id, null)
  // «Estructura» a secas ya no alcanza: hay que decir cuál.
  assert.match(resolverCeldaObra('Estructura', cat).error, /no es una obra/)
})

test('desplegable: estructura primero, obras por código (sin las de prueba ni las fusionadas), «Sin obra» sólo del cliente con varias obras', () => {
  const ops = opcionesDeObra(cat)
  assert.deepEqual(ops.slice(0, 2), ['ES-ADM · Estructura – Administración', 'ES-TAL · Estructura – Taller'])
  assert.ok(ops.includes('OB-0021 · ME - PLAYÓN DE AZUFRE'))
  assert.ok(!ops.some((o) => o.startsWith('ZZ-')))
  assert.ok(!ops.some((o) => o.startsWith('OB-0013')))
  assert.ok(ops.includes(rotuloSinObra('MESSINA')))
  assert.ok(ops.includes(rotuloSinObra('LA ESTRELLA')))
  assert.ok(!ops.includes(rotuloSinObra('QUATTROPANI')), 'con una sola obra no hay nada que dejar sin asignar')
  // Todo lo que se ofrece se vuelve a leer igual: lo que el desplegable escribe lo entiende el sync.
  for (const o of ops) assert.equal(resolverCeldaObra(o, cat).error, null, o)
})

test('coherencia con la Unidad: una obra en una fila Estructura se marca; no se corrige', () => {
  assert.equal(unidadIncoherente('Civil', DESTINO.OBRA), null)
  assert.equal(unidadIncoherente('Mantenimiento', DESTINO.OBRA), null)
  assert.equal(unidadIncoherente('Estructura', DESTINO.TALLER), null)
  assert.match(unidadIncoherente('Estructura', DESTINO.OBRA), /Estructura/)
  assert.match(unidadIncoherente('Civil', DESTINO.ADMIN), /Civil/)
  assert.match(unidadIncoherente('Impuestos', DESTINO.OBRA), /no va en Compras/)
  assert.equal(unidadIncoherente('', DESTINO.OBRA), null)
  assert.equal(unidadIncoherente('Civil', null), null)
})
