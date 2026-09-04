// LA CAPA DE IDENTIDAD DENTRO DEL CRUCE REAL COMPRAS × CHEQUES.
//
// No son tests del resolver —ésos están en `entity-resolution.test.mjs`—: son los del CIRCUITO.
// Cada uno afirma algo que, si se rompiera, movería plata al proveedor equivocado sin avisar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveConsulta, vincula, anotarIdentidad, metodoDeSenales } from './identidad-lote.mjs'
import { resolverIdentidad, ESTADO } from './entity-resolution.mjs'
import { umbralesDe } from './umbrales.mjs'
import { mismaEntidad, candidatasPorImporte } from '../cobertura-arca.mjs'
import { inferirRespaldo } from '../cheques-cobertura.mjs'
import { escriturasDeCorreccion, DECISION } from './correccion.mjs'
import { aliasesASembrar } from './sembrar-alias.mjs'

const U = umbralesDe('proveedor')
const SIN_MODELO = { umbrales: U, entidad: 'proveedor', usarEmbeddings: false }

// El padrón real recortado: los tres casos que costaron trabajo en producción.
const PADRON = [
  { id: 'p-dupec', nombre: 'DUPEC', cuit: '20287737824' },
  { id: 'p-castel', nombre: 'Industrias Castel', cuit: '20111183415' },
  { id: 'p-lliteras', nombre: 'Lliteras', cuit: '30708390557' },
  { id: 'p-robles-p', nombre: 'Robles Pintureria', cuit: '30715011830' },
  { id: 'p-robles-j', nombre: 'Robles Jose Maria', cuit: '20174374849' },
]

// ── COMPRA → PROVEEDOR CANÓNICO ─────────────────────────────────────────────────────────────────

test('una compra con CUIT resuelve al proveedor canónico aunque el nombre no se parezca', async () => {
  const r = await resolverIdentidad({ nombre: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20-28773782-4' }, PADRON, SIN_MODELO)
  assert.equal(r.estado, ESTADO.AUTO_RESUELTO)
  assert.equal(r.match.id, 'p-dupec')
  assert.equal(metodoDeSenales(r.señales), 'strong_id')
})

test('un cheque cuyo beneficiario está escrito al revés resuelve igual', async () => {
  const r = await resolverIdentidad({ nombre: 'JORGE ROBERTO MARTINEZ', cuit: '20111183415' }, PADRON, SIN_MODELO)
  assert.equal(r.match.id, 'p-castel')
})

// ── EL CUIT MANDA SIEMPRE ────────────────────────────────────────────────────────────────────────

test('CUIT distinto con nombre idéntico NO se vincula, por más parecido que haya', async () => {
  const r = await resolverIdentidad({ nombre: 'DUPEC', cuit: '30999999997' }, PADRON, SIN_MODELO)
  assert.notEqual(r.estado, ESTADO.AUTO_RESUELTO)
  assert.equal(r.match, null)
})

test('mismaEntidad: dos CUIT distintos nunca son la misma entidad, ni con la misma identidad puesta', () => {
  // Aunque alguien hubiera escrito mal `idEntidad` en las dos filas, el CUIT gana y dice que no.
  const f = { prov: 'DUPEC', cuit: '20287737824', idEntidad: 'p-dupec' }
  const i = { prov: 'DUPEC', cuit: '30999999997', idEntidad: 'p-dupec' }
  assert.equal(mismaEntidad(f, i), false)
})

test('mismaEntidad: con el mismo CUIT son la misma entidad aunque los nombres no se parezcan', () => {
  assert.equal(mismaEntidad(
    { prov: 'DUPEC', cuit: '20287737824' },
    { prov: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20-28773782-4' }), true)
})

// ── COMPRA + CHEQUE POR IDENTIDAD CANÓNICA ───────────────────────────────────────────────────────

test('la identidad canónica cruza una compra con CUIT contra un cheque sin CUIT', () => {
  const compra = { fila: 10, prov: 'DUPEC', cuit: '20287737824', idEntidad: 'p-dupec', total: 500000 }
  const cheque = { prov: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: null, idEntidad: 'p-dupec', total: 500000 }
  assert.equal(mismaEntidad(compra, cheque), true)
  assert.deepEqual(candidatasPorImporte(cheque, [compra]).map((c) => c.fila), [10])
})

test('una identidad sola no empareja: si un lado no está resuelto, no se inventa el cruce', () => {
  const compra = { fila: 10, prov: 'DUPEC', cuit: null, idEntidad: 'p-dupec', total: 500000 }
  const cheque = { prov: 'OTRA COSA', cuit: null, idEntidad: null, total: 500000 }
  assert.equal(mismaEntidad(compra, cheque), false)
})

test('dos filas SIN identidad no se emparejan entre sí por tener las dos null', () => {
  const a = { fila: 1, prov: 'UNO', cuit: null, idEntidad: null, total: 100 }
  const b = { prov: 'DOS', cuit: null, idEntidad: null, total: 100 }
  assert.equal(mismaEntidad(a, b), false)
})

test('inferirRespaldo agrupa por identidad: el mismo proveedor escrito de dos formas es UN grupo', () => {
  // Dos cheques del mismo proveedor —uno con el nombre de fantasía, otro con el titular fiscal— y
  // dos facturas suyas. Sin identidad serían dos grupos de uno compitiendo por las mismas facturas.
  const compras = [
    { fila: 10, prov: 'DUPEC', cuit: '20287737824', idEntidad: 'p-dupec', total: 500000, fecha: 46000 },
    { fila: 11, prov: 'DUPEC', cuit: '20287737824', idEntidad: 'p-dupec', total: 500000, fecha: 46001 },
  ]
  const cheques = [
    { fila: 30, proveedor: 'DUPEC', cuit: null, idEntidad: 'p-dupec', monto: 500000, fecha: 46010, comprobante: '' },
    { fila: 31, proveedor: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: null, idEntidad: 'p-dupec', monto: 500000, fecha: 46011, comprobante: '' },
  ]
  const r = inferirRespaldo(cheques, compras)
  assert.equal(r.inferidos.size, 2, 'los dos cheques encuentran su factura')
  assert.equal(r.ambiguos.length, 0)
})

test('la guarda de ambigüedad sigue viva: más cheques que facturas no infiere ninguno', () => {
  const compras = [{ fila: 10, prov: 'DUPEC', cuit: null, idEntidad: 'p-dupec', total: 500000, fecha: 46000 }]
  const cheques = [
    { fila: 30, proveedor: 'DUPEC', cuit: null, idEntidad: 'p-dupec', monto: 500000, fecha: 46010, comprobante: '' },
    { fila: 31, proveedor: 'DUPEC', cuit: null, idEntidad: 'p-dupec', monto: 500000, fecha: 46011, comprobante: '' },
  ]
  const r = inferirRespaldo(cheques, compras)
  assert.equal(r.inferidos.size, 0)
  assert.equal(r.ambiguos.length, 2)
})

// ── ALIAS VERIFICADO ─────────────────────────────────────────────────────────────────────────────

test('un alias verificado resuelve lo que ningún parecido puede', async () => {
  // «Corralon Progreso» no se parece a «DUPEC» en nada y no comparte CUIT en esta consulta: sin el
  // alias, este texto no tiene ningún camino al proveedor correcto.
  const aliases = new Map([['CORRALON PROGRESO', 'p-dupec']])
  const r = await resolverIdentidad({ nombre: 'Corralon Progreso', cuit: null }, PADRON, { ...SIN_MODELO, aliases })
  assert.equal(r.estado, ESTADO.AUTO_RESUELTO)
  assert.equal(r.match.id, 'p-dupec')
  assert.equal(metodoDeSenales(r.señales), 'alias')
})

test('el sembrado de aliases sale del CUIT y NUNCA del parecido', () => {
  const obs = [
    { nombre: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20287737824', fuente: 'cheques' },
    { nombre: 'ROBLES PINT', cuit: null, fuente: 'compras' },          // sin CUIT: no se siembra
    { nombre: 'MADERAS LITERAS SRL', cuit: '30708390557', fuente: 'cheques' },
  ]
  const p = aliasesASembrar(obs, PADRON, new Map())
  assert.deepEqual(p.sembrar.map((a) => a.entidadId).sort(), ['p-dupec', 'p-lliteras'])
  assert.equal(p.sembrar.some((a) => a.alias === 'ROBLES PINT'), false)
})

test('el mismo texto con dos CUIT distintos NO se siembra: es un choque, no un alias', () => {
  const obs = [
    { nombre: 'EL MISMO NOMBRE', cuit: '20287737824', fuente: 'compras' },
    { nombre: 'EL MISMO NOMBRE', cuit: '30708390557', fuente: 'cheques' },
  ]
  const p = aliasesASembrar(obs, PADRON, new Map())
  assert.equal(p.sembrar.length, 0)
  assert.equal(p.conflictos.length, 1)
})

// ── SIN MATCH Y AMBIGUO NO VINCULAN ──────────────────────────────────────────────────────────────

test('sólo auto_resuelto y verificado_humano autorizan a vincular', () => {
  assert.equal(vincula(ESTADO.AUTO_RESUELTO), true)
  assert.equal(vincula(ESTADO.VERIFICADO_HUMANO), true)
  assert.equal(vincula(ESTADO.SUGERIDO), false)
  assert.equal(vincula(ESTADO.AMBIGUO), false)
  assert.equal(vincula(ESTADO.SIN_MATCH), false)
})

test('anotarIdentidad NO pone idEntidad cuando la decisión no autoriza a vincular', () => {
  const porClave = new Map([
    [claveConsulta({ nombre: 'A', cuit: null }), { estado: ESTADO.SUGERIDO, match: { id: 'p-dupec' } }],
    [claveConsulta({ nombre: 'B', cuit: null }), { estado: ESTADO.AUTO_RESUELTO, match: { id: 'p-castel' } }],
  ])
  const filas = anotarIdentidad([{ proveedor: 'A' }, { proveedor: 'B' }], porClave)
  assert.equal(filas[0].idEntidad, null)
  assert.equal(filas[1].idEntidad, 'p-castel')
})

// ── EL DATO ORIGINAL NO SE TOCA ──────────────────────────────────────────────────────────────────

test('anotarIdentidad AGREGA una columna: el nombre y el CUIT originales quedan intactos', () => {
  const original = { proveedor: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20-28773782-4', total: 123 }
  const porClave = new Map([[claveConsulta({ nombre: original.proveedor, cuit: original.cuit }),
    { estado: ESTADO.AUTO_RESUELTO, match: { id: 'p-dupec', nombre: 'DUPEC' } }]])
  const [f] = anotarIdentidad([original], porClave)
  assert.equal(f.proveedor, 'DUBOS UGARTE PEDRO LUIS RAUL')
  assert.equal(f.cuit, '20-28773782-4')
  assert.equal(f.total, 123)
  assert.equal(f.idEntidad, 'p-dupec')
})

test('la clave conserva el texto tal como se escribió: la pantalla busca lo que ve', () => {
  // Si la clave normalizara, «Robles Pinturerías S.R.L.» y «ROBLES PINTURERIAS» compartirían fila y
  // la pantalla que muestra el primero no encontraría su identidad.
  assert.notEqual(
    claveConsulta({ nombre: 'Robles Pinturerías S.R.L.', cuit: null }),
    claveConsulta({ nombre: 'ROBLES PINTURERIAS', cuit: null }))
  // Pero el mismo texto con distinta capitalización sí es la misma pregunta.
  assert.equal(
    claveConsulta({ nombre: 'dupec', cuit: null }),
    claveConsulta({ nombre: ' DUPEC ', cuit: null }))
})

test('el mismo texto con dos CUIT distintos son dos preguntas distintas', () => {
  assert.notEqual(
    claveConsulta({ nombre: 'DUPEC', cuit: '20287737824' }),
    claveConsulta({ nombre: 'DUPEC', cuit: '30708390557' }))
})

// ── LA CORRECCIÓN HUMANA ─────────────────────────────────────────────────────────────────────────

test('confirmar crea el alias verificado y marca la resolución', () => {
  const p = escriturasDeCorreccion(
    { id: 7, entidad: 'proveedor', valor_original: 'DUPEC', entidad_id: 'p-dupec' },
    { decision: DECISION.CONFIRMAR, por: 'jorge' })
  assert.equal(p.ok, true)
  assert.equal(p.resolucion.estado, 'verificado_humano')
  assert.equal(p.resolucion.entidad_id_correcta, 'p-dupec')
  assert.equal(p.alias.alias, 'DUPEC')
  assert.equal(p.alias.verificado, true)
})

test('elegir otro proveedor manda el alias al elegido, no al sugerido', () => {
  const p = escriturasDeCorreccion(
    { id: 7, entidad: 'proveedor', valor_original: 'FERNANDEZ', entidad_id: 'p-dupec' },
    { decision: DECISION.OTRO, entidadId: 'p-castel', por: 'jorge' })
  assert.equal(p.resolucion.entidad_id_correcta, 'p-castel')
  assert.equal(p.alias.entidad_id, 'p-castel')
})

test('«dejar sin resolver» NO crea alias — no hay nada confirmado que recordar', () => {
  const p = escriturasDeCorreccion(
    { id: 7, entidad: 'proveedor', valor_original: 'RSV', entidad_id: null },
    { decision: DECISION.SIN_RESOLVER, por: 'jorge' })
  assert.equal(p.ok, true)
  assert.equal(p.alias, null)
  assert.equal(p.resolucion.estado, 'sin_match')
})

test('una corrección sin autor se rechaza: sin autor no se puede auditar', () => {
  const p = escriturasDeCorreccion(
    { id: 7, entidad: 'proveedor', valor_original: 'X', entidad_id: 'p-dupec' },
    { decision: DECISION.CONFIRMAR, por: '' })
  assert.equal(p.ok, false)
})

test('confirmar sin proveedor sugerido ni elegido se rechaza', () => {
  const p = escriturasDeCorreccion(
    { id: 7, entidad: 'proveedor', valor_original: 'X', entidad_id: null },
    { decision: DECISION.CONFIRMAR, por: 'jorge' })
  assert.equal(p.ok, false)
})
