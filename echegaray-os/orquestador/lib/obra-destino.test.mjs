import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DESTINO, catalogoDeDestinos, leerCeldaObra, opcionesDeObra, resolverCeldaObra, rotuloDeObra,
  rotuloSinObra, unidadIncoherente, validarValorDeObra,
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

import { proyectarObraDeFila, aplicarCambiosPendientes } from './obra-destino.mjs'

test('proyección de la fila: destino y obra, con la inconsistencia nombrada (parser o Unidad) y sin corregir', () => {
  assert.deepEqual(proyectarObraDeFila({ unidad_negocio: 'Civil', obra_celda: 'OB-0021 · x' }, cat),
    { destino: 'obra', obra_id: 'messina-playon-azufre', obra_inconsistencia: null })
  const incoh = proyectarObraDeFila({ unidad_negocio: 'Estructura', obra_celda: 'OB-0021 · x' }, cat)
  assert.equal(incoh.obra_id, 'messina-playon-azufre', 'se guarda lo que la fila dice')
  assert.match(incoh.obra_inconsistencia, /Estructura/)
  const mal = proyectarObraDeFila({ unidad_negocio: 'Civil', obra_celda: 'Galpon 7' }, cat)
  assert.equal(mal.destino, null)
  assert.match(mal.obra_inconsistencia, /no es una obra/)
  assert.deepEqual(proyectarObraDeFila({ unidad_negocio: 'Civil', obra_celda: null }, cat),
    { destino: null, obra_id: null, obra_inconsistencia: null })
})

test('un cambio de la app todavía no escrito en el Sheet no se pierde en el sync de la hora', () => {
  const compras = [
    { fila: 10, clave: 'c:1|A', obra_celda: null },
    { fila: 11, clave: 'c:2|B', obra_celda: 'ES-ADM · Estructura – Administración' },
  ]
  const cambios = [
    { fila: 10, clave: 'c:1|A', valor_nuevo: 'OB-0021 · ME - PLAYÓN DE AZUFRE' },
    // La fila 11 ya no es el mismo comprobante (alguien insertó arriba): el cambio NO se superpone.
    { fila: 11, clave: 'c:9|Z', valor_nuevo: 'ES-TAL · Estructura – Taller' },
  ]
  const r = aplicarCambiosPendientes(compras, cambios)
  assert.equal(r[0].obra_celda, 'OB-0021 · ME - PLAYÓN DE AZUFRE')
  assert.equal(r[1].obra_celda, 'ES-ADM · Estructura – Administración')
  assert.equal(compras[0].obra_celda, null, 'no muta la lectura')
})

import { indiceColumnaObra } from './obra-destino.mjs'

test('Cobranzas: la columna Obra se encuentra por encabezado (AB), no por posición, y «Obra / Cliente» no es ella', () => {
  // Encabezado real de la fila 4 (Cobranzas.json, 14/09/2026), con la Obra agregada en AB.
  const enc = ['ID', 'Categoría', 'Fecha de Venta', 'Factura', 'N° Comprobante', 'Unidad', 'Obra / Cliente',
    'ORDEN DE  COMPRA', 'Concepto', 'Monto neto', 'IVA', 'Retenciones / descuentos',
    'TOTAL a cobrar (neto de retenciones)', 'Forma de Cobro', 'Estado', 'Fecha de Factura', 'Fecha cobro',
    'Mes cobro (auto)', 'Probabilidad %', 'Monto ponderado', 'Días hasta vto.', 'Estado cobro', 'Notas',
    'Retención 16,8%', 'Ret Ganancias', 'Retención 2,5%', 'Moneda', null, 'Asignación']
  assert.equal(indiceColumnaObra(enc, 'Cobranzas'), null)
  const conObra = [...enc]; conObra[27] = ' Obra '
  assert.equal(indiceColumnaObra(conObra, 'Cobranzas'), 27)
  assert.throws(() => indiceColumnaObra([...conObra, 'obra'], 'Cobranzas'), /2 veces/)
})

test('lo que se ESCRIBE tiene que ser letra por letra una opción del desplegable de la app', () => {
  // Las que la app ofrece hoy con este catálogo (obraDeCompra.ts · opcionesDeObra): pasan.
  for (const ok of ['', '  ', 'OB-0021 · ME - PLAYÓN DE AZUFRE', 'ES-ADM · Estructura – Administración',
    'ES-TAL · Estructura – Taller', 'Sin obra – MESSINA', 'Sin obra – La Estrella']) {
    assert.equal(validarValorDeObra(ok, OBRAS), null, ok)
  }
  // El bloqueante del auditor: el código existe pero el texto no es su rótulo, o el cliente no existe.
  for (const [mal, motivo] of [
    ['OB-0021 · X', /no es el rótulo de OB-0021/],
    ['OB-0021', /no es el rótulo/],
    ['ob-0021 · ME - PLAYÓN DE AZUFRE', /no es el rótulo/],
    ['OB-0002 · X', /no es una obra viva/],
    ['OB-0013 · ME - BSA PLANTA', /no es una obra viva/],          // fusionada: la app no la ofrece
    ['ZZ-0001 · [PRUEBA E2E] Obra de pruebas', /no es una obra viva/],
    ['ES-ADM · Otra cosa', /no es «ES-ADM · Estructura – Administración»/],
    ['Sin obra – FULANO INVENTADO', /no es un cliente/],
    ['Sin obra – Quattropani - Melisa García SAS', /no es un cliente con más de una obra/],
    ['la de Arcor', /no es una opción/],
  ]) assert.match(validarValorDeObra(mal, OBRAS) ?? 'PASÓ', motivo, mal)
})

test('sin catálogo no hay obra válida: una lista vacía rechaza toda obra y sólo deja vaciar o estructura', () => {
  assert.match(validarValorDeObra('OB-0021 · ME - PLAYÓN DE AZUFRE', []), /no es una obra viva/)
  assert.equal(validarValorDeObra('', []), null)
})
