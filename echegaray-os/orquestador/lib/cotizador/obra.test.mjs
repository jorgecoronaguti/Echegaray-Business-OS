// §16 · PRESUPUESTO → OBRA. Los invariantes que hacen que la herencia sirva para aprender:
// FROZEN ≠ MUTABLE · COSTO ≠ PRECIO · NULL ≠ 0 · HH ≠ DURACIÓN.
//
// Cada test que puede decir «OK» tiene abajo la mutación que lo pone rojo, y esa mutación se corrió.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { genealogiaDeObra, heredarPlan, adjudicar, prepararObra } from './obra.mjs'
import { ESTADO, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'

const CONGELADA = {
  id: 'bde2c7b2-3fdb-414f-821e-9e20ba64d439', numero: 'COT-2026-001', version: 1,
  congeladaEn: '2026-08-18T12:00:00.000Z', huella: { sha256: 'abc123' },
  costo_estimado: 40_740_000, monto_venta: 68_900_000,
}
const PARTIDAS = [
  { partida_id: 'p1', codigo: 'T1018', descripcion: 'MAMPOSTERÍA LADRILLON e=0,20', unidad: 'm2', cantidad: 182, hs_unitarias: 2.4, costo_unitario: 39_331.5, subtotal: 7_158_333 },
  { partida_id: 'p2', codigo: 'T1059', descripcion: 'INSTALACIÓN SANITARIA', unidad: 'un', cantidad: 1, hs_unitarias: null, costo_unitario: 719_689.3, subtotal: 719_689.3, subcontratada: true, precio_subcontrato: 719_689.3 },
  { partida_id: 'p3', codigo: 'T1078', descripcion: 'LUZ DE EMERGENCIA', unidad: 'un', cantidad: 2, hs_unitarias: null, costo_unitario: 102_000, subtotal: 204_000 },
]

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FROZEN ≠ MUTABLE
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('FROZEN ≠ MUTABLE: una obra NO puede nacer de una versión sin congelar', () => {
  // El caso real: COT-2026-001 tiene v1 (congelada) y v3 (adjudicada, SIN congelar) en la base.
  // MUTACIÓN CORRIDA: en `genealogiaDeObra`, sacar el push de VERSION_NO_CONGELADA →
  // «AssertionError: la v3 sin congelar entró como genealogía» (listo pasó a true). Revertida.
  const sinCongelar = { ...CONGELADA, id: 'a6426117', version: 3, congeladaEn: null }
  const g = genealogiaDeObra({ obraId: 'quattropani', congelada: sinCongelar, adjudicadaPor: 'jorge' })
  assert.equal(g.listo, false, 'la v3 sin congelar entró como genealogía')
  assert.equal(g.genealogia, null)
  assert.ok(g.bloqueos.some((b) => b.tipo === 'VERSION_NO_CONGELADA'))
  assert.ok(g.issues.some((i) => i.type === TIPO_ISSUE.CONFLICTO && i.severity === SEVERIDAD.BLOQUEANTE))
})

test('el control de congelado PUEDE decir que sí: la v1 congelada pasa', () => {
  const g = genealogiaDeObra({ obraId: 'quattropani', congelada: CONGELADA, adjudicadaPor: 'jorge' })
  assert.equal(g.listo, true, 'si esto es false el control no puede decir que sí y siempre bloquea')
  assert.equal(g.genealogia.version, 1)
  assert.equal(g.genealogia.huellaSha256, 'abc123')
  assert.equal(g.genealogia.estado, ESTADO.CONFIRMADO)
})

test('sin huella pasa, pero declarado: no se fabrica un sha256', () => {
  // `cotizacion_huella` tiene CERO filas hoy. Inventar el hash haría que la genealogía dijera que
  // puede probar algo que no puede.
  const g = genealogiaDeObra({ obraId: 'quattropani', congelada: { ...CONGELADA, huella: null }, adjudicadaPor: 'jorge' })
  assert.equal(g.listo, true)
  assert.equal(g.genealogia.huellaSha256, null)
  assert.match(g.genealogia.confianza, /sin huella/)
  assert.ok(g.issues.some((i) => i.type === TIPO_ISSUE.FALTA_DATO))
})

test('una obra no puede tener DOS orígenes ORIGINAL — y ADICIONAL es otra cosa', () => {
  const a = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j', alcance: 'ADICIONAL' })
  assert.equal(a.genealogia.alcance, 'ADICIONAL')
  const mal = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j', alcance: 'AMPLIACION' })
  assert.equal(mal.listo, false, 'un alcance inventado entró')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// COSTO ≠ PRECIO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('COSTO ≠ PRECIO: el precio al cliente NO entra como costo, ni siquiera si la fila lo trae', () => {
  // El error de verdad no es que el total de venta baje a la partida: es que la fila de la
  // cotización trae el precio POR LÍNEA al lado del costo, y alguien lee el campo de al lado.
  // MUTACIÓN CORRIDA: `costoPlan: num(p.precio_cliente ?? p.subtotal ?? …)` →
  // «AssertionError: T1018 heredó 12000000 como costo, que es su PRECIO de venta». Revertida.
  const { genealogia } = genealogiaDeObra({ obraId: 'quattropani', congelada: CONGELADA, adjudicadaPor: 'jorge' })
  const conPrecio = PARTIDAS.map((p) => ({ ...p, precio_cliente: p.subtotal * 1.676, precioCliente: p.subtotal * 1.676 }))
  const { filas } = heredarPlan({ genealogia, partidas: conPrecio })

  assert.equal(genealogia.metaIngreso, 68_900_000, 'el precio tiene que existir: en la obra, no en la partida')
  assert.equal(genealogia.costoEstimado, 40_740_000)
  for (const [i, f] of filas.entries()) {
    assert.ok(!('metaIngreso' in f) && !('precioCliente' in f), `la partida ${f.codigo} trae precio de venta`)
    assert.notEqual(f.costoPlan, genealogia.metaIngreso, 'la meta de ingreso apareció como costo de una partida')
    assert.equal(f.costoPlan, PARTIDAS[i].subtotal, `${f.codigo} heredó ${f.costoPlan} como costo, que es su PRECIO de venta`)
  }
  assert.equal(filas[0].costoPlan, 7_158_333)
})

test('una partida sin subtotal hereda costo null, no el precio ni cero', () => {
  const { genealogia } = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j' })
  const { filas, resumen } = heredarPlan({ genealogia, partidas: [{ partida_id: 'z', codigo: 'Z', descripcion: 'sin valorizar', cantidad: 10, precio_cliente: 999_999 }] })
  assert.equal(filas[0].costoPlan, null, 'sin subtotal el costo tiene que quedar en null')
  assert.equal(resumen.costoPlanTotal, null, 'un total con un hueco adentro miente hacia abajo')
})

test('la suma de los costos del plan NO es la venta', () => {
  const { genealogia } = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j' })
  const { resumen } = heredarPlan({ genealogia, partidas: PARTIDAS })
  assert.equal(resumen.costoPlanTotal, 7_158_333 + 719_689.3 + 204_000)
  assert.ok(resumen.costoPlanTotal < genealogia.metaIngreso, 'el costo heredado no puede igualar la venta: ahí murió el margen')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NULL ≠ 0 (y el subcontrato, que sí es cero)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('NULL ≠ 0 en HH: subcontratada es 0 (hecho); sin horas unitarias es null (hueco)', () => {
  // MUTACIÓN CORRIDA: `hhPlan: subcontratada ? 0 : (hsUnit ?? 0) * (cantidad ?? 0)` →
  // «AssertionError: T1078 sin hs_unitarias heredó 0 HH: eso es productividad infinita»
  // (hhPlan pasó de null a 0 y sinHH bajó de 1 a 0). Revertida.
  const { genealogia } = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j' })
  const { filas, resumen, issues } = heredarPlan({ genealogia, partidas: PARTIDAS })
  const mamposteria = filas.find((f) => f.codigo === 'T1018')
  const sanitaria = filas.find((f) => f.codigo === 'T1059')
  const luz = filas.find((f) => f.codigo === 'T1078')

  assert.equal(mamposteria.hhPlan, 2.4 * 182)
  assert.equal(sanitaria.hhPlan, 0, 'una partida subcontratada NO lleva HH propias: 0 es el hecho')
  assert.equal(luz.hhPlan, null, 'T1078 sin hs_unitarias heredó 0 HH: eso es productividad infinita')
  assert.notEqual(luz.hhPlan, 0)

  assert.equal(resumen.sinHH, 1, 'el subcontrato (hhPlan 0, falsy) se contó como hueco')
  assert.equal(resumen.hhPlanTotal, null, 'una suma con un hueco adentro no es un total')
  assert.ok(issues.some((i) => i.entity === 'T1078' && i.type === TIPO_ISSUE.FALTA_DATO))
})

test('el contador de huecos PUEDE dar cero: un plan completo no reporta faltantes', () => {
  const { genealogia } = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j' })
  const completas = PARTIDAS.map((p) => ({ ...p, hs_unitarias: p.hs_unitarias ?? 1, subcontratada: false }))
  const { resumen } = heredarPlan({ genealogia, partidas: completas })
  assert.equal(resumen.sinHH, 0)
  assert.equal(resumen.sinCantidad, 0)
  assert.ok(resumen.hhPlanTotal > 0, 'con todas las HH cargadas el total tiene que salir')
})

test('cantidad ausente se hereda como null y con issue, no como 0', () => {
  const { genealogia } = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j' })
  const { filas, resumen, issues } = heredarPlan({ genealogia, partidas: [{ partida_id: 'x', codigo: 'X', descripcion: 'sin cómputo', cantidad: null, hs_unitarias: 3 }] })
  assert.equal(filas[0].cantidadPlan, null)
  assert.equal(filas[0].hhPlan, null, 'sin cantidad no hay HH: 3 hs/u × nada no es 0')
  assert.equal(resumen.sinCantidad, 1)
  assert.ok(issues.some((i) => i.type === TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE))
})

test('la cadena de vacíos de JavaScript no se cuela: "", undefined y NaN son null', () => {
  const { genealogia } = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j' })
  const { filas } = heredarPlan({ genealogia, partidas: [
    { partida_id: 'a', codigo: 'A', descripcion: 'a', cantidad: '', hs_unitarias: 1 },
    { partida_id: 'b', codigo: 'B', descripcion: 'b', cantidad: undefined, hs_unitarias: 1 },
    { partida_id: 'c', codigo: 'C', descripcion: 'c', cantidad: 'ocho', hs_unitarias: 1 },
  ] })
  for (const f of filas) assert.equal(f.cantidadPlan, null, `${f.codigo} convirtió un vacío en número`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// HH ≠ DURACIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('HH ≠ DURACIÓN: los días del plan no se derivan de las HH', () => {
  // MUTACIÓN CORRIDA: `diasPlan: num(diasPorPartida[clave]) ?? (hsUnit !== null && cantidad !== null
  // ? hsUnit * cantidad : null)` → «AssertionError: 436.8 HH se publicaron como 436.8 días». Revertida.
  const { genealogia } = genealogiaDeObra({ obraId: 'q', congelada: CONGELADA, adjudicadaPor: 'j' })
  const { filas } = heredarPlan({ genealogia, partidas: PARTIDAS })
  const m = filas.find((f) => f.codigo === 'T1018')
  assert.equal(m.hhPlan, 436.8)
  assert.equal(m.diasPlan, null, `${m.hhPlan} HH se publicaron como ${m.diasPlan} días`)

  // Con cronograma, los días entran por su propia puerta y NO coinciden con las HH.
  const conPlan = heredarPlan({ genealogia, partidas: PARTIDAS, diasPorPartida: { T1018: 12 } })
  const m2 = conPlan.filas.find((f) => f.codigo === 'T1018')
  assert.equal(m2.diasPlan, 12)
  assert.equal(m2.hhPlan, 436.8, '436,8 HH en 12 días son ~4,5 personas: las dos magnitudes conviven, no se sustituyen')
})

test('heredar sin genealogía no se permite: dejaría una obra sin saber contra qué se compara', () => {
  assert.throws(() => heredarPlan({ partidas: PARTIDAS }), /genealogía/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE YA ESTABA SIGUE ANDANDO (obra.mjs no tenía test propio hasta ahora)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('adjudicar exige versión congelada y responsable, y no destruye la quote', () => {
  assert.throws(() => adjudicar({ congelada: { esBorrador: true }, adjudicadaPor: 'j' }), /congelada/)
  assert.throws(() => adjudicar({ congelada: { esBorrador: false }, adjudicadaPor: null }), /quién/)
  const a = adjudicar({ congelada: { esBorrador: false, version: 1, congeladoEn: 'x', huella: { sha256: 'h' } }, adjudicadaPor: 'jorge' })
  assert.equal(a.quoteVersion.version, 1, 'la cotización adjudicada tiene que seguir entera adentro')
  assert.equal(a.genealogy.huellaDeLaCotizacion, 'h')
})

test('Σ frentes ≠ cantidad heredada bloquea en las dos direcciones', () => {
  const adj = adjudicar({ congelada: { esBorrador: false, version: 1 }, adjudicadaPor: 'j' })
  const partidas = [{ codigo: 'T1018', cantidad: 520, unidad: 'm2', hh: 1040 }]
  const falta = prepararObra({ adjudicacion: adj, partidas, fechaInicio: '2026-09-01', frentes: { T1018: [{ nombre: 'pb', cantidad: 480 }] } })
  assert.equal(falta.listo, false)
  assert.match(falta.bloqueos[0].detalle, /faltan 40/)
  const sobra = prepararObra({ adjudicacion: adj, partidas, fechaInicio: '2026-09-01', frentes: { T1018: [{ nombre: 'pb', cantidad: 560 }] } })
  assert.match(sobra.bloqueos[0].detalle, /nadie cotizó/)
  const ok = prepararObra({ adjudicacion: adj, partidas, fechaInicio: '2026-09-01', frentes: { T1018: [{ nombre: 'pb', cantidad: 200 }, { nombre: 'p1', cantidad: 320 }] } })
  assert.equal(ok.listo, true, 'el control tiene que poder decir que sí')
  assert.equal(ok.cuadra, true)
})
