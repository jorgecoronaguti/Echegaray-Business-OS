// LOS CINCO ESTADOS DEL TRABAJO — fixtures con la forma EXACTA del contrato de
// `GET /api/presupuestos/cotizar/<id>` (ver `orquestador/lib/plano/pasos-vista.mjs`), no formas
// simplificadas: ENCOLADO sin pasos, LEYENDO con 3 de 7, LISTO con los 7, ERROR con lectura
// parcial, y un LISTO con `cascada: null` (el costo directo puede quedar en cero sin que exista
// venta calculable). El defecto que atrapan: que la pantalla —o su lógica— explote o mienta ante
// cualquiera de estos cinco, no sólo ante el caso feliz.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  certezaMonetaria, filtrarComputo, pieDePaso, progresoDeLectura, type TrabajoLectura,
} from './trabajoLectura.ts'

const pasoBase = (over: Partial<TrabajoLectura['pasos'][number]>): TrabajoLectura['pasos'][number] => ({
  id: 'p1', etiqueta: '1', titulo: 'Superficies', pregunta: '¿cuánto cubre?', estado: 'firme',
  resumen: '1.284 m² cubiertos', columnas: { a: 'LÁMINA', b: 'QUÉ ES', c: 'CANT.', d: 'DERIVA EN' },
  filas: [], evidencia: 'A-01', supuesto: null, faltan: [],
  deriva: { partidas: 2, importe: 24_000, sinCotizar: 0 },
  ...over,
})

test('ENCOLADO — sin pasos todavía, ningún cálculo revienta con listas vacías', () => {
  const t: TrabajoLectura = {
    id: 'j1', estado: 'ENCOLADO', etapa: null, pasos: [], certeza: null, computo: null,
    cascada: null, presupuesto_id: null, error: null,
  }
  assert.equal(progresoDeLectura(t.pasos.length).texto, 'paso 0 de 7')
  assert.deepEqual(certezaMonetaria(t.pasos, t.computo), { firme: null, disputa: null, sinCotizar: 0, pctFirme: 0, pctDisputa: 0 })
  assert.deepEqual(filtrarComputo(t.computo, null), [])
})

test('LEYENDO — 3 de 7 pasos publicados, uno de ellos "sin dato": el pie no inventa plata', () => {
  const t: TrabajoLectura = {
    id: 'j2', estado: 'LEYENDO', etapa: 'leyendo la lámina B-01',
    pasos: [
      pasoBase({}),
      pasoBase({ id: 'p2', etiqueta: '2', titulo: 'Bases', estado: 'sin dato', deriva: { partidas: 3, importe: null, sinCotizar: 3 } }),
      pasoBase({ id: 'p3', etiqueta: 'x', titulo: 'Excavaciones', estado: 'con supuesto', deriva: { partidas: 2, importe: 18_400, sinCotizar: 0 } }),
    ],
    certeza: { estado: 'sin dato', porEstado: { firme: 1, 'sin dato': 1, 'con supuesto': 1 }, firmes: 1, total: 3 },
    computo: null, cascada: null, presupuesto_id: null, error: null,
  }
  assert.equal(progresoDeLectura(t.pasos.length).texto, 'paso 3 de 7')
  assert.equal(pieDePaso(t.pasos[1]), '→ 3 partidas · sin importe')
  assert.equal(pieDePaso(t.pasos[0]), '→ 2 partidas · $0M')
})

test('LISTO — los 7 pasos, con un paso en conflicto que separa firme de disputa', () => {
  const pasos = Array.from({ length: 7 }, (_, i) => pasoBase({
    id: `p${i + 1}`, etiqueta: String(i + 1),
    estado: i === 3 ? 'conflicto' : 'firme',
  }))
  const computo: TrabajoLectura['computo'] = {
    grupos: [
      { pasoId: 'p1', rotulo: 'PASO 1', titulo: 'Superficies', subtotal: 24_000, items: [{ d: 'Limpieza', c: 1284, u: 'm²', p: 18.7, imp: 24_010.8 }] },
      { pasoId: 'p4', rotulo: 'PASO 4', titulo: 'Arriostramiento', subtotal: 468_000, items: [{ d: 'Hormigón', c: 9.6, u: 'm³', p: 48_750, imp: 468_000 }] },
    ],
  }
  const t: TrabajoLectura = {
    id: 'j3', estado: 'LISTO', etapa: null, pasos,
    certeza: { estado: 'conflicto', porEstado: { firme: 6, conflicto: 1 }, firmes: 6, total: 7 },
    computo,
    // Nombres reales de `cotizacion_cascada` — un fixture con nombres inventados nunca detecta
    // que la pantalla lee campos que el backend no manda (auditoría 03/09/2026).
    cascada: { costo_directo: 24_010.8, gastos_generales: 6_483, costo_industrial: 30_493.8, beneficio: 5_795, financiero: 1_845, venta_final: 38_897, coeficiente_sin_iva: 1.62 },
    presupuesto_id: 'pres-123', error: null,
  }
  const cm = certezaMonetaria(t.pasos, t.computo)
  assert.equal(cm.firme, 24_010.8)
  assert.equal(cm.disputa, 468_000)
  assert.equal(filtrarComputo(t.computo, 'p4').length, 1)
  assert.equal(filtrarComputo(t.computo, 'p4')[0].pasoId, 'p4')
  assert.equal(progresoDeLectura(t.pasos.length).completo, true)
})

test('ERROR — motivo en castellano, y lo ya leído sigue siendo consultable', () => {
  const t: TrabajoLectura = {
    id: 'j4', estado: 'ERROR', etapa: null,
    pasos: [pasoBase({})],
    certeza: { estado: 'firme', porEstado: { firme: 1 }, firmes: 1, total: 1 },
    computo: { grupos: [] }, cascada: null, presupuesto_id: null,
    error: 'no se pudo abrir el DWG: formato CAD no soportado por esta vía',
  }
  assert.match(t.error!, /no se pudo/)
  assert.equal(t.pasos.length, 1, 'lo leído antes del error no desaparece')
})

test('LISTO con cascada:null — costo directo sin firmeza todavía no calcula venta, y no se inventa', () => {
  const t: TrabajoLectura = {
    id: 'j5', estado: 'LISTO', etapa: null, pasos: [pasoBase({ estado: 'sin dato', deriva: { partidas: 1, importe: null, sinCotizar: 1 } })],
    certeza: { estado: 'sin dato', porEstado: { 'sin dato': 1 }, firmes: 0, total: 1 },
    computo: { grupos: [{ pasoId: 'p1', rotulo: 'PASO 1', titulo: 'Superficies', subtotal: null, items: [{ d: 'Sin cotizar', c: null, u: 'un', p: null, imp: null }] }] },
    cascada: null, presupuesto_id: 'pres-456', error: null,
  }
  assert.equal(t.cascada, null)
  const cm = certezaMonetaria(t.pasos, t.computo)
  assert.equal(cm.firme, null)
  assert.equal(cm.sinCotizar, 1)
})
