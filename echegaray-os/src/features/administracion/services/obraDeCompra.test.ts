import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FIJOS, FORMA_VALOR_OBRA, obraDeLaCompra, opcionesDeObra, referenciaDeCompra, rotuloSinObra,
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

// ═══ EL FIXTURE TIENE EL DEFECTO ADENTRO ═══
//
// «MESSINA» y «Messina» conviven en `obra_canonica.cliente_texto` (medido el 15/09/2026 sobre la
// base viva: 6 obras vivas con una grafía y 4 con la otra). El desplegable de la app las ofrecía
// como DOS opciones «Sin obra – …» distintas para el MISMO cliente.
const OBRAS = [
  { id: 'me-bsa', codigo: 'OB-0007', nombre: 'ME - PLANTA DE BSA', cliente_texto: 'MESSINA', fusionada_en: null },
  { id: 'me-tanque', codigo: 'OB-0008', nombre: 'ME - BASES DE TANQUE', cliente_texto: 'Messina', fusionada_en: null },
  { id: 'me-vieja', codigo: 'OB-0003', nombre: 'ME - VIEJA', cliente_texto: 'MESSINA', fusionada_en: 'me-bsa' },
  { id: 'qp', codigo: 'OB-0030', nombre: 'QP - SALONES COMERCIALES', cliente_texto: 'QUATTROPANI', fusionada_en: null },
  { id: 'e2e', codigo: 'ZZ-0001', nombre: '[PRUEBA E2E]', cliente_texto: 'PRUEBA', fusionada_en: null },
  { id: 'sin', codigo: null, nombre: 'SIN CÓDIGO', cliente_texto: 'Quattropani', fusionada_en: null },
]

const codigosDe = (obras: typeof OBRAS) =>
  new Map(obras.filter((o) => o.codigo).map((o) => [o.id, o.codigo as string]))
// El sync canoniza el cliente con `cliente_alias`, que SIEMPRE guarda el canónico en mayúsculas.
const aliasDe = (obras: typeof OBRAS) =>
  new Map(obras.map((o) => [normAlias(o.cliente_texto), o.cliente_texto.toUpperCase()]))

test('las opciones de la app son EXACTAMENTE las del sync', () => {
  const clienteAlias = aliasDe(OBRAS)
  // El `.mjs` declara `obras = []` sin JSDoc y TS lo infiere `never[]`: el cast es del tipado, no del dato.
  const delSync = sync.opcionesDeObra(sync.catalogoDeDestinos({ obras: OBRAS as unknown as never[], clienteAlias }))
  assert.deepEqual(opcionesDeObra(OBRAS, codigosDe(OBRAS)), delSync)
  assert.ok(delSync.includes('Sin obra – QUATTROPANI'), 'el caso interesante está en el fixture: una obra sin código también cuenta como viva')
})

test('dos grafías del mismo cliente son UNA opción, y en mayúsculas', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Agrupando por `cliente_texto` crudo, «MESSINA» y «Messina» daban dos opciones «Sin obra – …»
  // para el mismo cliente: quien imputaba elegía una de las dos sin saber que estaba decidiendo
  // algo, y la ficha del cliente terminaba con la misma plata repartida en dos rótulos.
  const opciones = opcionesDeObra(OBRAS, codigosDe(OBRAS))
  const sinObra = opciones.filter((o) => o.startsWith('Sin obra – '))
  assert.deepEqual(sinObra, ['Sin obra – MESSINA', 'Sin obra – QUATTROPANI'], `hay una opción por grafía: ${sinObra.join(' · ')}`)
  assert.equal(new Set(sinObra.map((o) => o.toUpperCase())).size, sinObra.length, 'dos opciones distintas nombran al mismo cliente')
})

test('el rótulo «Sin obra – X» es el mismo literal que el del sync', () => {
  assert.equal(rotuloSinObra('MESSINA'), sync.rotuloSinObra('MESSINA'))
})

test('toda opción que la app ofrece la acepta el validador del sync', () => {
  // La paridad literal con `opcionesDeObra` del sync no alcanza como única garantía: el sync canoniza
  // con `cliente_alias` —que la app no puede leer— y podría agrupar dos grafías que la app deja
  // separadas. Lo que NO puede pasar nunca es ofrecer algo que después el worker rechace al escribir
  // la celda. Esto se prueba contra `validarValorDeObra`, que es la guarda real de esa escritura.
  const clienteAlias = aliasDe(OBRAS)
  for (const o of opcionesDeObra(OBRAS, codigosDe(OBRAS))) {
    assert.equal(sync.validarValorDeObra(o, OBRAS, clienteAlias), null, `el sync rechaza una opción del desplegable: «${o}»`)
  }
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
