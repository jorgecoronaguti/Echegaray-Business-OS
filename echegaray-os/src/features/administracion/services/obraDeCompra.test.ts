import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FIJOS, FORMA_VALOR_OBRA, obraDeLaCompra, opcionesDeObra, referenciaDeCompra,
  type CeldaObraDeCompra,
} from './obraDeCompra.ts'
import * as sync from '../../../../orquestador/lib/obra-destino.mjs'
import { referenciaDeCompra as referenciaDelSync } from '../../../../orquestador/lib/compras-obra-asignada.mjs'
import { normAlias } from '../../../../orquestador/lib/jornales-a-registros-hh.mjs'

// ═══ LA APP Y EL SYNC TIENEN QUE ENTENDER LA MISMA COLUMNA ═══
//
// El desplegable de la app ofrece valores que después lee `obra-destino.mjs`. Si una de las dos
// listas cambia sola, la app deja elegir algo que el sync marca «no es una obra del desplegable», o
// al revés. Estos tests comparan contra el `.mjs` real, no contra una copia.

const OBRAS = [
  { id: 'me-bsa', codigo: 'OB-0007', nombre: 'ME - PLANTA DE BSA', cliente_texto: 'MESSINA', fusionada_en: null },
  { id: 'me-tanque', codigo: 'OB-0008', nombre: 'ME - BASES DE TANQUE', cliente_texto: 'MESSINA', fusionada_en: null },
  { id: 'me-vieja', codigo: 'OB-0003', nombre: 'ME - VIEJA', cliente_texto: 'MESSINA', fusionada_en: 'me-bsa' },
  { id: 'qp', codigo: 'OB-0030', nombre: 'QP - SALONES COMERCIALES', cliente_texto: 'QUATTROPANI', fusionada_en: null },
  { id: 'e2e', codigo: 'ZZ-0001', nombre: '[PRUEBA E2E]', cliente_texto: 'PRUEBA', fusionada_en: null },
  { id: 'sin', codigo: null, nombre: 'SIN CÓDIGO', cliente_texto: 'QUATTROPANI', fusionada_en: null },
]

test('las opciones de la app son EXACTAMENTE las del sync', () => {
  const codigos = new Map(OBRAS.filter((o) => o.codigo).map((o) => [o.id, o.codigo as string]))
  const clienteAlias = new Map(OBRAS.map((o) => [normAlias(o.cliente_texto), o.cliente_texto]))
  // El `.mjs` declara `obras = []` sin JSDoc y TS lo infiere `never[]`: el cast es del tipado, no del dato.
  const delSync = sync.opcionesDeObra(sync.catalogoDeDestinos({ obras: OBRAS as unknown as never[], clienteAlias }))
  assert.deepEqual(opcionesDeObra(OBRAS, codigos), delSync)
  assert.ok(delSync.includes('Sin obra – QUATTROPANI'), 'el caso interesante está en el fixture: una obra sin código también cuenta como viva')
})

test('los fijos y la clave de referencia son los del sync', () => {
  assert.deepEqual(FIJOS.map((f) => ({ ...f })), sync.FIJOS.map((f: object) => ({ ...f })))
  for (const f of [{ fila: 900, sheet_id: 897 }, { fila: 12, sheet_id: null }]) {
    assert.equal(referenciaDeCompra(f), referenciaDelSync(f))
  }
})

test('toda opción tiene la forma que la acción acepta y el sync entiende; un texto libre no', () => {
  const opciones = ['OB-0007 · ME - PLANTA DE BSA', 'ES-ADM · Estructura – Administración', 'ES-TAL · Estructura – Taller', 'Sin obra – MESSINA']
  for (const o of opciones) {
    assert.match(o, FORMA_VALOR_OBRA)
    assert.notEqual(sync.leerCeldaObra(o).tipo, 'invalida')
  }
  for (const o of ['la de Messina', 'MESSINA', 'Sin obra', 'ES-ADMINISTRACION']) {
    assert.doesNotMatch(o, FORMA_VALOR_OBRA, o)
  }
})

const celda = (p: Partial<CeldaObraDeCompra>): CeldaObraDeCompra => ({
  fila: 900, clave: 'k', destino: null, obra_id: null, obra_celda: null, obra_inconsistencia: null, ...p,
})
const ROTULOS = new Map([['me-bsa', 'OB-0007 · ME - PLANTA DE BSA']])
const asig = { referencia: '900', obra_id: 'me-bsa', via: 'obra_por_alias', cliente: 'MESSINA', porque: 'columna K «Planta de BSA»' }

test('la celda elegida manda sobre la inferencia, y el rótulo sale del obra_id (el nombre pudo cambiar)', () => {
  const o = obraDeLaCompra(celda({ destino: 'obra', obra_id: 'me-bsa', obra_celda: 'OB-0007 · NOMBRE VIEJO' }), { ...asig, obra_id: 'otra' }, ROTULOS)
  assert.deepEqual([o.rotulo, o.origen, o.celda], ['OB-0007 · ME - PLANTA DE BSA', 'columna', 'OB-0007 · NOMBRE VIEJO'])
})

test('estructura y «Sin obra – X» se nombran con lo elegido', () => {
  const adm = obraDeLaCompra(celda({ destino: 'estructura_admin', obra_celda: 'ES-ADM · Estructura – Administración' }), null, ROTULOS)
  assert.equal(adm.rotulo, 'ES-ADM · Estructura – Administración')
})

test('una celda que no se entendió no tiene rótulo pero sí su motivo; la inferencia no la tapa', () => {
  const o = obraDeLaCompra(celda({ obra_celda: 'la de Messina', obra_inconsistencia: 'no es una obra del desplegable' }), asig, ROTULOS)
  assert.deepEqual([o.rotulo, o.origen, o.inconsistencia], [null, 'columna', 'no es una obra del desplegable'])
})

test('sin celda: la inferencia se muestra COMO inferida; sin rótulo resoluble, null y no un relleno', () => {
  assert.deepEqual([obraDeLaCompra(null, asig, ROTULOS).rotulo, obraDeLaCompra(null, asig, ROTULOS).origen], ['OB-0007 · ME - PLANTA DE BSA', 'inferida'])
  assert.equal(obraDeLaCompra(null, { ...asig, obra_id: 'no-nombrada' }, ROTULOS).rotulo, null)
  assert.equal(obraDeLaCompra(null, { ...asig, obra_id: null, via: 'sin_obra' }, ROTULOS).origen, 'sin_obra')
  assert.equal(obraDeLaCompra(null, null, ROTULOS).origen, 'ninguna')
})
