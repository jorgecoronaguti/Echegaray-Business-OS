// LOS CINCO INVARIANTES DEL CÓMPUTO CON GENEALOGÍA, cada uno con la corrida que lo pone rojo.
//
// No prueban que el circuito funcione: prueban que NO PUEDE hacer las cinco cosas que ya salieron
// caras acá —fabricar un cero, publicar un número sin de dónde salió, elegir un valor en silencio
// cuando dos documentos discuten, dejar que una revisión vieja pise a la nueva, y saltarse un
// eslabón de la cadena en vez de romperla—.

import test from 'node:test'
import assert from 'node:assert/strict'
import { computarElemento, computarElementos, origenCitable } from './computo.mjs'
import { FORMA, MODO } from './interpretar.mjs'
import { cadenaDe, obraDesdeCotizacion } from './genealogia.mjs'
import { FUENTE, tieneNumero } from './fuente.mjs'
import { CLASE_FUENTE, ESTADO_HECHO, consolidar, hecho } from './proyecto.mjs'
import { relacionar } from './relacion.mjs'

const ev = { archivo: 'E1.pdf', lamina: 'E1', vista: 'planta', textoLiteral: '0.30 x 0.50 x 3.50 — 8 columnas' }

const columna = (extra = {}) => ({
  id: 'C1', nombre: 'columna C1', computable: true, forma: FORMA.PRISMA,
  dimensiones: { ancho: 0.3, alto: 0.5, largo: 3.5 },
  repeticion: { modo: MODO.CONTEO, cantidad: 8 },
  evidencia: ev, ...extra,
})

// ═══ 1 · NULL ≠ 0 ═══════════════════════════════════════════════════════════════════════════════

test('I1 · un elemento sin arista medible NO computa 0: computa null y dice qué le falta', () => {
  const c = computarElemento(columna({ dimensiones: { ancho: 0.3, alto: null, largo: 3.5 } }))
  assert.equal(c.cantidad, null)
  assert.notEqual(c.cantidad, 0)
  assert.ok(c.faltan.includes('alto'))
  assert.equal(c.hueco.fuente, FUENTE.FALTA_DATO)
})

test('I1 · un elemento sin CUÁNTOS HAY tampoco computa 0, y el motivo viaja', () => {
  const c = computarElemento(columna({ repeticion: { modo: MODO.INDETERMINABLE, textoLiteral: 'no se ve la grilla' } }))
  assert.equal(c.cantidad, null)
  assert.match(c.faltan.join(' '), /cantidad de elementos/)
})

test('I1 · MUTACIÓN · el «0 medido» se cuela por `Number.isFinite`, y `tieneNumero` lo ataja', () => {
  assert.equal(Number.isFinite(Number(null)), true, 'ésta es la trampa: Number(null) es 0 y es finito')
  assert.equal(Number.isFinite(Number('')), true)
  assert.equal(tieneNumero(null), false)
  assert.equal(tieneNumero(''), false)
  assert.equal(tieneNumero(0), true, 'un cero MEDIDO sí es un número: la distinción es con el ausente')
})

test('I1 · el recuento no puede inflarse: un elemento sin cantidad no cuenta como computado', () => {
  const r = computarElementos([columna(), columna({ id: 'C2', dimensiones: { ancho: null, alto: 0.5, largo: 3.5 } })])
  assert.equal(r.detectados, 2)
  assert.equal(r.computados, 1)
  assert.equal(r.conHueco, 1)
})

// ═══ 2 · UNA CANTIDAD SIN DOCUMENTO DE ORIGEN NO ENTRA ═══════════════════════════════════════════

test('I2 · la cantidad que no se puede citar queda fuera de las admitidas, con lo que le falta', () => {
  const r = computarElementos([columna(), columna({ id: 'C2', evidencia: null })])
  assert.equal(r.computados, 2, 'las dos multiplicaron bien')
  assert.equal(r.admitidas, 1, 'sólo una se puede volver a abrir')
  assert.deepEqual(r.sinOrigen.map((x) => x.id), ['C2'])
  assert.deepEqual(r.sinOrigen[0].faltan, ['archivo', 'textoLiteral', 'lámina o vista'])
})

test('I2 · citar el archivo SIN decir qué dice ahí es una referencia, no una prueba', () => {
  assert.equal(origenCitable({ evidencia: { archivo: 'E1.pdf', lamina: 'E1' } }).ok, false)
  assert.deepEqual(origenCitable({ evidencia: { archivo: 'E1.pdf', lamina: 'E1' } }).faltan, ['textoLiteral'])
  assert.equal(origenCitable({ evidencia: ev }).ok, true)
})

test('I2 · un hecho del proyecto sin documento o sin cita NO se construye — falla cerrado', () => {
  assert.equal(hecho({ atributo: 'resistencia', valor: 'H-25', clase: CLASE_FUENTE.MEMORIA, textoLiteral: 'H-25' }), null, 'sin documento')
  assert.equal(hecho({ atributo: 'resistencia', valor: 'H-25', clase: CLASE_FUENTE.MEMORIA, documento: 'm.pdf' }), null, 'sin cita')
  assert.ok(hecho({ atributo: 'resistencia', valor: 'H-25', clase: CLASE_FUENTE.MEMORIA, documento: 'm.pdf', textoLiteral: 'H-25' }))
})

// ═══ 3 · UN CONFLICTO NO SE COLAPSA A UN VALOR ELEGIDO EN SILENCIO ═══════════════════════════════

test('I3 · el conflicto sale sin valor y con las dos evidencias, aun con el grafo cargado', () => {
  const rel = relacionar([{ name: 'A.pdf', path: 'obra/A.pdf' }, { name: 'B.pdf', path: 'obra/B.pdf' }], { carpetaObra: 'obra/' })
  const c = consolidar([
    hecho({ elemento: 'viga', atributo: 'alto', valor: 0.6, clase: CLASE_FUENTE.PLANO, documento: 'A.pdf', textoLiteral: '0.60' }),
    hecho({ elemento: 'viga', atributo: 'alto', valor: 0.7, clase: CLASE_FUENTE.PLANO, documento: 'B.pdf', textoLiteral: '0.70' }),
  ], { relaciones: rel })
  assert.equal(c.hechos[0].estado, ESTADO_HECHO.CONFLICTO)
  assert.equal(c.hechos[0].valor, null)
  assert.equal(c.conflictos[0].versiones.length, 2)
  assert.ok(c.conflictos[0].quienLoResuelve)
})

test('I3 · cuando la jerarquía SÍ decide, la versión perdedora igual sale con su documento y su cita', () => {
  const rel = relacionar([{ name: 'Planta.pdf', path: 'obra/Planta.pdf' }, { name: 'Memoria.pdf', path: 'obra/Memoria.pdf' }], { carpetaObra: 'obra/' })
  const c = consolidar([
    hecho({ elemento: 'viga', atributo: 'resistencia', valor: 'H-21', clase: CLASE_FUENTE.PLANO, documento: 'Planta.pdf', textoLiteral: 'H-21 s/plano' }),
    hecho({ elemento: 'viga', atributo: 'resistencia', valor: 'H-30', clase: CLASE_FUENTE.MEMORIA, documento: 'Memoria.pdf', textoLiteral: 'H-30 s/cálculo' }),
  ], { relaciones: rel })
  assert.equal(c.hechos[0].estado, ESTADO_HECHO.RESUELTO_POR_JERARQUIA)
  assert.notEqual(c.hechos[0].estado, ESTADO_HECHO.CONFIRMADO, 'nadie confirmó nada: una fuente desplazó a la otra')
  assert.equal(c.hechos[0].desplazadas[0].documento, 'Planta.pdf')
  assert.equal(c.hechos[0].desplazadas[0].textoLiteral, 'H-21 s/plano')
})

// ═══ 4 · UNA REVISIÓN VIEJA NO PISA A LA NUEVA ═══════════════════════════════════════════════════

test('I4 · el hecho de la revisión superada nunca queda como valor del proyecto', () => {
  const docs = [{ name: 'Cocheras Rev B.pdf', path: 'obra/Cocheras Rev B.pdf' }, { name: 'Cocheras Rev F.pdf', path: 'obra/Cocheras Rev F.pdf' }]
  const rel = relacionar(docs, { carpetaObra: 'obra/' })
  for (const orden of [[0, 1], [1, 0]]) {
    const hs = [
      hecho({ elemento: 'losa', atributo: 'espesor_m', valor: 0.1, clase: CLASE_FUENTE.PLANO, documento: 'Cocheras Rev B.pdf', textoLiteral: '0.10' }),
      hecho({ elemento: 'losa', atributo: 'espesor_m', valor: 0.18, clase: CLASE_FUENTE.PLANO, documento: 'Cocheras Rev F.pdf', textoLiteral: '0.18' }),
    ]
    const c = consolidar(orden.map((i) => hs[i]), { relaciones: rel })
    assert.equal(c.hechos[0].valor, 0.18)
    assert.equal(c.hechos[0].documento, 'Cocheras Rev F.pdf')
  }
})

test('I4 · la carpeta «ARCHIVOS VIEJOS» le gana a la revisión declarada: la movió una persona', () => {
  const rel = relacionar([
    { name: 'Plano Rev F.pdf', path: 'obra/ARCHIVOS VIEJOS/Plano Rev F.pdf' },
    { name: 'Plano Rev B.pdf', path: 'obra/Plano Rev B.pdf' },
  ], { carpetaObra: 'obra/' })
  assert.equal(rel.superado.get('Plano Rev F.pdf').vigente, 'Plano Rev B.pdf')
  assert.match(rel.superado.get('Plano Rev F.pdf').porQue, /ya no rige/)
})

// ═══ 5 · EL ESLABÓN FALTANTE ROMPE LA CADENA EN VEZ DE SALTARLA ══════════════════════════════════

const resultadoCon = (mapeo, computoItem) => ({
  termino: 'obra x',
  mapeo: { mapeos: [mapeo] },
  computo: { items: [computoItem] },
  composiciones: new Map([['t1', [{ costoUnitario: 1000 }]]]),
  procesos: { procesos: [] },
})

test('I5 · la cadena declara CADA eslabón faltante por nombre, no los omite', () => {
  const item = computarElemento(columna())
  const c = cadenaDe(resultadoCon({ elemento: 'C1', computo: item, estado: 'SIN_CANDIDATA' }, item), 'C1')
  assert.equal(c.completa, false)
  assert.deepEqual(c.faltantes, ['PROCESO', 'PARTIDA', 'RECURSO', 'PRECIO'])
  assert.equal(c.pasos.length, 9, 'los nueve eslabones salen siempre: el que falta sale marcado')
  assert.equal(c.pasos.find((p) => p.etapa === 'PARTIDA').fuente, 'SIN_CANDIDATA')
})

test('I5 · sin partida no nace la actividad de obra, y se dice por qué en vez de costear con 0', () => {
  const item = computarElemento(columna())
  const r = obraDesdeCotizacion(resultadoCon({ elemento: 'C1', computo: item, estado: 'SIN_CANDIDATA' }, item))
  assert.equal(r.actividades.length, 0)
  assert.equal(r.bloqueadas.length, 1)
  assert.match(r.bloqueadas[0].porQue, /no tiene partida asignada/)
})

test('I5 · sin cantidad tampoco nace, aunque la partida esté elegida', () => {
  const item = computarElemento(columna({ dimensiones: { ancho: null, alto: 0.5, largo: 3.5 } }))
  const mapeo = { elemento: 'C1', computo: item, estado: 'MAPEADA', tarea: { id: 't1', codigo: 'T1', nombre: 'Hormigón', unidad: 'm3' } }
  const r = obraDesdeCotizacion(resultadoCon(mapeo, item))
  assert.equal(r.actividades.length, 0)
  assert.match(r.bloqueadas[0].porQue, /no tiene cantidad computada/)
})

test('I5 · MUTACIÓN · con TODOS los eslabones, la cadena se completa y conserva origen citable', () => {
  const item = computarElemento(columna())
  const mapeo = { elemento: 'C1', computo: item, estado: 'MAPEADA', tarea: { id: 't1', codigo: 'T1', nombre: 'Hormigón', unidad: 'm3' }, porQue: 'coincide unidad' }
  const base = resultadoCon(mapeo, item)
  const r = obraDesdeCotizacion({ ...base, procesos: { procesos: [{ elemento: 'C1' }] } })
  assert.equal(r.actividades.length, 1)
  assert.equal(r.conservaOrigen, true)
  assert.equal(r.actividades[0].cantidad_plan, 4.2)
  assert.ok(r.actividades[0].origen.cadena.length >= 9, 'la genealogía legible sale entera')
  // Y ESTA MISMA ACTIVIDAD SIN EVIDENCIA NO CONSERVA ORIGEN: el control puede decir que no.
  const sinEv = computarElemento(columna({ evidencia: null }))
  const r2 = obraDesdeCotizacion(resultadoCon({ ...mapeo, computo: sinEv }, sinEv))
  assert.equal(r2.conservaOrigen, false)
  assert.equal(r2.sinOrigenCitable.length, 1)
})
