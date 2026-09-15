// Las reglas de «completalas como corresponde» (15/09/2026), cada una con su mutación: si se afloja
// una, un test de acá se pone rojo. Sin base ni Sheet: el contexto es el que el script arma.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCION, REGLA, clienteDeJ, decidirRelleno, filaDeCobranza, muestraRepartida, parsearCsv, planDeRelleno, resumenDeRelleno,
} from './obra-relleno-aplicar.mjs'
import { normAlias } from './jornales-a-registros-hh.mjs'

const ALIAS = new Map([
  ['san francisco', 'SAN FRANCISCO'], ['estrella', 'LA ESTRELLA'], ['messina', 'MESSINA'], ['messinas', 'MESSINA'],
  ['arcor', 'ARCOR'], ['quattropani', 'QUATTROPANI'], ['quattropani melisa garcia sas', 'QUATTROPANI'],
])
const OPCIONES = new Set([
  'ES-ADM · Estructura – Administración', 'ES-TAL · Estructura – Taller',
  'OB-0001 · AR - MANTENIMIENTO', 'OB-0008 · QP - SALÓN COMERCIAL', 'OB-0011 · SF - PISOS INDUSTRIALES',
  'OB-0021 · ME - PLAYÓN DE AZUFRE', 'Sin obra – SAN FRANCISCO', 'Sin obra – LA ESTRELLA', 'Sin obra – MESSINA',
])
const ctx = ({ ocupada = new Map() } = {}) => ({
  opciones: OPCIONES,
  obrasVivas: new Map([
    ['SAN FRANCISCO', ['OB-0011 · SF - PISOS INDUSTRIALES', 'OB-0010 · SF - ENTREPISO Y ESCALERA']],
    ['LA ESTRELLA', ['OB-0007 · LE - GALPÓN 9', 'OB-0006 · LE - OFICINA']],
    ['MESSINA', ['OB-0021 · ME - PLAYÓN DE AZUFRE', 'OB-0019 · ME - BSA']],
    ['ARCOR', ['OB-0001 · AR - MANTENIMIENTO']], ['QUATTROPANI', ['OB-0008 · QP - SALÓN COMERCIAL']],
  ]),
  clienteDe: (t) => (normAlias(t) ? ALIAS.get(normAlias(t)) ?? null : null),
  ocupada,
})
const compra = (x) => ({ pestana: 'Compras', fila: '57', id: '53', fecha: '2026-03-01', quien: 'PROV', unidad: 'Civil', j: 'San Francisco', k: 'combustible', total: '1000', valor: '', obra_id: '', confianza: 'ambigua', via: 'sin_obra', porque: 'columna K «combustible» no nombra una obra de SAN FRANCISCO', candidatos: '', guardada: '', ...x })
const cobranza = (x) => ({ ...compra({ pestana: 'Cobranzas', fila: '', id: '10', j: 'ARCOR', via: 'cliente', ...x }) })

test('alta y media se escriben con el valor propuesto; baja NO', () => {
  const alta = decidirRelleno(compra({ confianza: 'alta', valor: 'OB-0021 · ME - PLAYÓN DE AZUFRE', j: 'MESSINA' }), ctx())
  assert.equal(alta.accion, ACCION.ESCRIBIR); assert.equal(alta.valor, 'OB-0021 · ME - PLAYÓN DE AZUFRE'); assert.equal(alta.regla, REGLA.ALTA_MEDIA)
  // La media es de un cliente con VARIAS obras: si «media» dejara de escribirse, la regla de ambiguas
  // daría «Sin obra – MESSINA» y no la obra propuesta.
  const media = decidirRelleno(compra({ confianza: 'media', valor: 'OB-0021 · ME - PLAYÓN DE AZUFRE', j: 'MESSINA' }), ctx())
  assert.equal(media.accion, ACCION.ESCRIBIR); assert.equal(media.valor, 'OB-0021 · ME - PLAYÓN DE AZUFRE'); assert.equal(media.regla, REGLA.ALTA_MEDIA)
  const baja = decidirRelleno(compra({ confianza: 'baja', valor: 'OB-0021 · ME - PLAYÓN DE AZUFRE', j: 'MESSINA' }), ctx())
  assert.equal(baja.accion, ACCION.LISTAR); assert.equal(baja.regla, REGLA.BAJA); assert.equal(baja.valor, null)
})

test('ambigua de un cliente con VARIAS obras vivas → «Sin obra – CLIENTE», rótulo exacto del desplegable', () => {
  for (const [j, esperado] of [['San Francisco', 'Sin obra – SAN FRANCISCO'], ['LA ESTRELLA', 'Sin obra – LA ESTRELLA'], ['MESSINA', 'Sin obra – MESSINA']]) {
    const d = decidirRelleno(compra({ j }), ctx())
    assert.equal(d.accion, ACCION.ESCRIBIR, j); assert.equal(d.valor, esperado); assert.equal(d.regla, REGLA.SIN_OBRA)
  }
})

test('ambigua de un cliente con UNA obra → esa obra (ARCOR → OB-0001)', () => {
  const d = decidirRelleno(cobranza({ j: 'ARCOR' }), ctx())
  assert.equal(d.accion, ACCION.ESCRIBIR); assert.equal(d.valor, 'OB-0001 · AR - MANTENIMIENTO'); assert.equal(d.regla, REGLA.UNICA)
  assert.equal(d.fila, 14, 'la fila física de la cobranza es ID + 4')
})

test('la J de Cobranzas con tramos «/» resuelve por el tramo que es cliente', () => {
  assert.equal(clienteDeJ('IMOTOR/San Francisco/JAVI SANCHEZ', ctx().clienteDe), 'SAN FRANCISCO')
  assert.equal(clienteDeJ('LA ESTRELLA /ALIMENTOS DEL SUR SAS', ctx().clienteDe), 'LA ESTRELLA')
  assert.equal(clienteDeJ('San Francisco/MESSINA', ctx().clienteDe), null, 'dos clientes distintos no dicen de quién es')
  assert.equal(clienteDeJ('MACRO CONSTRUCCIONES SRL', ctx().clienteDe), null)
  const d = decidirRelleno(cobranza({ j: 'IMOTOR/San Francisco/JAVI SANCHEZ', via: 'sin_imputacion' }), ctx())
  assert.equal(d.valor, 'Sin obra – SAN FRANCISCO')
})

test('proveedores que no son clientes de obra (MACRO, ADDATO, LIRIO…) se listan, no se escriben', () => {
  for (const j of ['MACRO CONSTRUCCIONES SRL', 'ADDATO', 'LIRIO DANIEL RAMIRO', 'SAINT GOBAIN', 'Papa']) {
    const d = decidirRelleno(compra({ j, via: 'no_es_cliente' }), ctx())
    assert.equal(d.accion, ACCION.LISTAR, j); assert.equal(d.regla, REGLA.NO_CLIENTE); assert.equal(d.valor, null)
  }
})

test('J = Taller / Administracion → ES-TAL / ES-ADM; J = Almacen se lista porque no tiene destino definido', () => {
  const tal = decidirRelleno(compra({ j: 'Taller', via: 'no_es_cliente' }), ctx())
  assert.equal(tal.valor, 'ES-TAL · Estructura – Taller'); assert.equal(tal.regla, REGLA.ESTRUCTURA)
  const adm = decidirRelleno(compra({ j: 'Administracion', via: 'no_es_cliente' }), ctx())
  assert.equal(adm.valor, 'ES-ADM · Estructura – Administración')
  const alm = decidirRelleno(compra({ j: 'Almacen', via: 'no_es_cliente' }), ctx())
  assert.equal(alm.accion, ACCION.LISTAR); assert.equal(alm.regla, REGLA.ALMACEN)
})

test('la Unidad que contradice la J deja la fila para el dueño aunque la J diga Taller', () => {
  const d = decidirRelleno(compra({ j: 'Taller', unidad: 'Civil', via: 'unidad', porque: 'Unidad «Civil» lleva una obra y la columna Obra dice estructura' }), ctx())
  assert.equal(d.accion, ACCION.LISTAR); assert.equal(d.regla, REGLA.UNIDAD); assert.equal(d.valor, null)
})

test('una celda que ya tiene valor NUNCA se pisa, ni con propuesta alta', () => {
  const ocupada = new Map([['Compras:57', 'OB-0011 · SF - PISOS INDUSTRIALES'], ['Cobranzas:14', 'Sin obra – ARCOR']])
  const c = decidirRelleno(compra({ confianza: 'alta', valor: 'OB-0021 · ME - PLAYÓN DE AZUFRE' }), ctx({ ocupada }))
  assert.equal(c.accion, ACCION.OMITIR); assert.equal(c.regla, REGLA.YA_TIENE_VALOR); assert.match(c.detalle, /PISOS INDUSTRIALES/)
  const b = decidirRelleno(cobranza({ j: 'ARCOR' }), ctx({ ocupada }))
  assert.equal(b.accion, ACCION.OMITIR)
  // Otra fila de la misma pestaña no está ocupada.
  assert.equal(decidirRelleno(compra({ fila: '58', confianza: 'alta', valor: 'OB-0021 · ME - PLAYÓN DE AZUFRE' }), ctx({ ocupada })).accion, ACCION.ESCRIBIR)
})

test('fuera_de_compras no se toca, y un valor que no es opción del desplegable vivo se lista', () => {
  assert.equal(decidirRelleno(compra({ confianza: 'fuera_de_compras', via: 'rubro' }), ctx()).accion, ACCION.OMITIR)
  const d = decidirRelleno(compra({ confianza: 'alta', valor: 'OB-0099 · OBRA QUE NO EXISTE' }), ctx())
  assert.equal(d.accion, ACCION.LISTAR); assert.equal(d.regla, REGLA.NO_ES_OPCION)
})

test('el resumen cuenta por rótulo lo que se escribe y lista sólo lo que no', () => {
  const plan = planDeRelleno([
    compra({ confianza: 'alta', valor: 'OB-0021 · ME - PLAYÓN DE AZUFRE', j: 'MESSINA' }), compra({ fila: '58' }), compra({ fila: '59' }),
    compra({ fila: '60', j: 'ADDATO', via: 'no_es_cliente' }), compra({ fila: '61', confianza: 'fuera_de_compras' }),
    cobranza({ j: 'ARCOR' }),
  ], ctx())
  const r = resumenDeRelleno(plan)
  assert.equal(r.filas, 6); assert.equal(r.escribir, 4)
  assert.deepEqual(r.porRotulo, { 'Sin obra – SAN FRANCISCO': 2, 'OB-0021 · ME - PLAYÓN DE AZUFRE': 1, 'OB-0001 · AR - MANTENIMIENTO': 1 })
  assert.equal(r.noEscritas.length, 1); assert.equal(r.noEscritas[0].j, 'ADDATO')
  assert.deepEqual(r.porPestana.Cobranzas, { escribir: 1 })
})

test('parsearCsv entiende comillas, comas y saltos de línea adentro de una celda (como escribe el dry)', () => {
  const csv = 'a,b,c\n1,"x, y","con ""comillas"""\n2,"dos\nlíneas",\n'
  assert.deepEqual(parsearCsv(csv), [{ a: '1', b: 'x, y', c: 'con "comillas"' }, { a: '2', b: 'dos\nlíneas', c: '' }])
  assert.deepEqual(parsearCsv(''), [])
})

test('la muestra de relectura se reparte a lo largo, no son las primeras 20', () => {
  const xs = Array.from({ length: 100 }, (_, i) => i)
  const m = muestraRepartida(xs, 20)
  assert.equal(m.length, 20); assert.equal(m[0], 0); assert.equal(m.at(-1), 95)
  assert.deepEqual(muestraRepartida([1, 2, 3], 20), [1, 2, 3])
  assert.equal(filaDeCobranza('10'), 14)
})
