// QUOTE ≠ OFFER · FROZEN ≠ DRAFT · REVISION ≠ MUTACIÓN — los tres del §42 que viven acá.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ofertaDesde, paraElCliente, fugaEnLaSalida, revisar } from './oferta.mjs'
import { adjudicar, prepararObra } from './obra.mjs'
import { congelar, gateDeCongelado, huellaDeEntradas } from './freeze.mjs'
import { politicaComercial, cascada } from './comercial.mjs'
import { colaDeAtencion } from './atencion.mjs'
import { ESTADO, TIPO_ISSUE } from './contrato.mjs'

const POLITICA = politicaComercial({
  fuente: 'XLSM', pctGastosGenerales: 0.27, pctBeneficio: 0.22, pctFinanciero: 0.07,
  factorFinanciero: 0.5, pctIibb: 0.024, pctGanancias: 0.02, pctCheque: 0.012, pctIva: 0.21,
})
const PARTIDAS = [
  { codigo: 'T4010', descripcion: 'MAMPOSTERIA LADRILLON e=0,20', rubro: 'MAMPOSTERÍA', unidad: 'M2', cantidad: 520, subtotal: 32_240_000, hh: 1_040, costoUnitario: 62_000 },
  { codigo: 'INST-SAN', descripcion: 'INSTALACION SANITARIA', rubro: 'INSTALACIONES', unidad: 'un', cantidad: 1, subtotal: 8_500_000, hh: 0, subcontratada: true },
]
const COSTO_DIRECTO = 40_740_000
const CASCADA = cascada({ costoDirecto: COSTO_DIRECTO, politica: POLITICA })
const HUELLA = huellaDeEntradas({ documentos: [{ hash: 'a' }], partidas: PARTIDAS, precios: [], politica: POLITICA })
const GATE = gateDeCongelado({ cascada: CASCADA, cola: colaDeAtencion({ issues: [] }) })
const CONGELADA = congelar({ cotizacionId: 'q1', cascada: CASCADA, huella: HUELLA, gate: GATE, congeladoPor: 'jorge', version: 1 })

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA OFERTA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('QUOTE ≠ OFFER: una oferta NO sale de un borrador', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ofertaDesde`, cambiar el `throw` por una advertencia.
  assert.throws(() => ofertaDesde({ congelada: { esBorrador: true, cascada: CASCADA }, partidas: PARTIDAS }), /versión CONGELADA/)
  assert.throws(() => ofertaDesde({ congelada: null, partidas: PARTIDAS }), /versión CONGELADA/)
})

test('la suma de las líneas da el total ofertado — no hay un segundo motor', () => {
  const o = ofertaDesde({ congelada: CONGELADA, partidas: PARTIDAS, cliente: 'Quattropani', numero: 'P-2026-041' })
  const suma = o.lineas.reduce((a, l) => a + l.precio, 0)
  assert.ok(Math.abs(suma - o.total) < 1, `las líneas suman ${suma} y el total dice ${o.total}`)
  assert.equal(o.total, CASCADA.ventaSinIva, 'el total es el de la versión congelada, no uno nuevo')
})

test('CERO LÍNEAS HUÉRFANAS: cada línea dice de qué partida congelada salió', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ofertaDesde`, sacar el chequeo de `huerfanas`.
  const o = ofertaDesde({ congelada: CONGELADA, partidas: PARTIDAS })
  for (const l of o.lineas) {
    assert.ok(l.genealogy.partida, 'línea sin partida de origen')
    assert.equal(l.genealogy.versionCongelada, 1)
    assert.equal(l.genealogy.huella, CONGELADA.huella.sha256)
  }
  assert.throws(() => ofertaDesde({ congelada: CONGELADA, partidas: [{ descripcion: 'algo suelto', subtotal: 1 }] }), /líneas huérfanas/)
})

test('la relación con el costo se CONSERVA aunque el cliente no la vea', () => {
  const o = ofertaDesde({ congelada: CONGELADA, partidas: PARTIDAS })
  assert.equal(o.lineas[0].genealogy.costoInterno, 32_240_000, 'ocultar no es borrar')
  assert.equal(o.lineas[0].genealogy.hhInternas, 1_040)
})

test('la salida al cliente NO filtra costo, HH, margen ni coeficiente', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `paraElCliente`, devolver `oferta.lineas` sin proyectar.
  const o = ofertaDesde({ congelada: CONGELADA, partidas: PARTIDAS })
  const c = paraElCliente(o)
  const fuga = fugaEnLaSalida(c)
  assert.equal(fuga.limpia, true, `filtró: ${fuga.filtrados.join(', ')}`)
  // y el control PUEDE dar rojo: sobre la oferta interna sí encuentra la genealogía
  assert.equal(fugaEnLaSalida(o).limpia, false, 'si el control no puede dar rojo, no es un control')
  assert.ok(fugaEnLaSalida(o).filtrados.includes('genealogy'))
})

test('el precio SÍ llega al cliente: ocultar el margen no es ocultar el precio', () => {
  const c = paraElCliente(ofertaDesde({ congelada: CONGELADA, partidas: PARTIDAS }))
  assert.ok(c.total > 0)
  assert.ok(c.lineas.every((l) => l.precio > 0))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA REVISIÓN (§26)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('REVISION ≠ MUTACIÓN: la versión ofertada sale igual a como entró', () => {
  const r = revisar({ congelada: CONGELADA, partidasNuevas: [], costoDirectoNuevo: 50_000_000, politicaHoy: POLITICA })
  assert.equal(r.ofertaAlterada, false)
  assert.equal(r.versionOfertada.cascada.ventaSinIva, CASCADA.ventaSinIva)
  assert.throws(() => { r.versionOfertada.cascada.ventaSinIva = 1 }, TypeError)
})

test('LAS DOS VISTAS NO SE MEZCLAN, y el puente dice cuánto es obra y cuánto es precio', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `revisar`, calcular la vistaA con `politicaHoy`.
  //
  // Llega documentación nueva: 80 m² más de mampostería. A los precios de la oferta cuestan
  // $4.960.000 de costo directo. Y además todo subió, así que el costo directo total de hoy es
  // $52 M en vez de los $45,7 M que darían las mismas cantidades a precios viejos.
  // La política de HOY es distinta de la de la oferta: la empresa bajó el beneficio a 19 %. Si las
  // dos fueran iguales, este test no podría detectar que la vista A se calculó con la equivocada.
  const POLITICA_HOY = politicaComercial({ ...POLITICA, version: 2, pctBeneficio: 0.19, fuente: 'política vigente hoy' })
  const r = revisar({
    congelada: CONGELADA,
    partidasNuevas: [{ codigo: 'T4010-B', descripcion: '80 m² más de mampostería', subtotalAPreciosDeLaOferta: 4_960_000 }],
    costoDirectoNuevo: 52_000_000,
    politicaHoy: POLITICA_HOY,
  })
  assert.equal(r.vistaA.base, 'precios y política de la oferta original')
  assert.equal(r.vistaB.base, 'precios y política de hoy')
  // Vista A: los $4,96 M de costo pasados por la cascada DE LA OFERTA (beneficio 22 %), no por la
  // de hoy. Cobrar el adicional a la política nueva sería renegociar el contrato sin avisar.
  assert.equal(r.vistaA.valor, cascada({ costoDirecto: 4_960_000, politica: POLITICA }).ventaSinIva)
  assert.notEqual(r.vistaA.valor, cascada({ costoDirecto: 4_960_000, politica: POLITICA_HOY }).ventaSinIva)
  assert.equal(r.vistaB.valor, cascada({ costoDirecto: 52_000_000, politica: POLITICA_HOY }).ventaSinIva)
  // El puente descompone la diferencia y NO la deja como un solo número.
  assert.ok(r.puente.diferenciaTotal > r.puente.porMasObra)
  assert.ok(r.puente.porVariacionDePrecios > 0)
  assert.equal(
    Math.round(r.puente.porMasObra + r.puente.porVariacionDePrecios),
    Math.round(r.puente.diferenciaTotal),
    'las dos partes tienen que sumar la diferencia entera o el puente miente',
  )
})

test('si una partida nueva no se puede valorizar a los precios de la oferta, la vista A NO da un número', () => {
  const r = revisar({
    congelada: CONGELADA,
    partidasNuevas: [{ codigo: 'X', subtotalAPreciosDeLaOferta: null }],
    costoDirectoNuevo: 52_000_000, politicaHoy: POLITICA,
  })
  assert.equal(r.vistaA.valor, null)
  assert.equal(r.vistaA.estado, ESTADO.FALTA_DATO)
  assert.equal(r.puente, null, 'y sin vista A no hay puente: un puente con medio dato es peor que ninguno')
})

test('una revisión se hace contra una versión congelada, no contra un borrador', () => {
  assert.throws(() => revisar({ congelada: { esBorrador: true } }), /versión congelada/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADJUDICACIÓN Y PREPARAR OBRA (§27, §28)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('adjudicar NO destruye la quote: viaja entera con su huella', () => {
  const a = adjudicar({ congelada: CONGELADA, adjudicadaPor: 'jorge', obraId: 'obra-9' })
  assert.equal(a.quoteVersion.huella.sha256, HUELLA.sha256)
  assert.equal(a.genealogy.huellaDeLaCotizacion, HUELLA.sha256)
  assert.equal(a.quoteVersion.cascada.ventaSinIva, CASCADA.ventaSinIva)
  assert.throws(() => adjudicar({ congelada: { esBorrador: true } }), /versión congelada/)
  assert.throws(() => adjudicar({ congelada: CONGELADA }), /sin decir quién/)
})

test('Σ FRENTES ≠ CANTIDAD HEREDADA ⇒ BLOCK, en las dos direcciones', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `prepararObra`, subir TOLERANCIA a 1000.
  const a = adjudicar({ congelada: CONGELADA, adjudicadaPor: 'jorge' })
  const falta = prepararObra({ adjudicacion: a, partidas: [PARTIDAS[0]], fechaInicio: '2026-09-01', frentes: { T4010: [{ nombre: 'PB', cantidad: 200 }, { nombre: 'P1', cantidad: 200 }, { nombre: 'fachada', cantidad: 80 }] } })
  assert.equal(falta.listo, false)
  assert.match(falta.bloqueos[0].detalle, /faltan 40 que alguien va a ejecutar y nadie va a controlar/)
  assert.equal(falta.issues[0].impact, 40 * 62_000, 'y el bloqueo dice cuánta plata es')

  const sobra = prepararObra({ adjudicacion: a, partidas: [PARTIDAS[0]], fechaInicio: '2026-09-01', frentes: { T4010: [{ nombre: 'PB', cantidad: 300 }, { nombre: 'P1', cantidad: 300 }] } })
  assert.equal(sobra.listo, false)
  assert.match(sobra.bloqueos[0].detalle, /planificando 80 de trabajo que nadie cotizó/)
})

test('con los frentes cuadrados la obra se prepara y las cantidades cierran', () => {
  const a = adjudicar({ congelada: CONGELADA, adjudicadaPor: 'jorge' })
  const p = prepararObra({
    adjudicacion: a, partidas: PARTIDAS, fechaInicio: '2026-09-01',
    frentes: { T4010: [{ nombre: 'PB', cantidad: 300 }, { nombre: 'P1', cantidad: 220 }] },
  })
  assert.equal(p.listo, true)
  assert.equal(p.cuadra, true)
  assert.equal(p.tareas.length, 3, '2 frentes de mampostería + 1 de sanitaria')
  assert.equal(p.tareas.filter((t) => t.partida === 'T4010').reduce((s, t) => s + t.cantidad, 0), 520)
  // Las HH se reparten proporcionalmente con la cantidad.
  assert.equal(p.tareas.find((t) => t.frente === 'PB').hh, 600)
})

test('SIN FECHA DE INICIO ⇒ BLOCK', () => {
  const a = adjudicar({ congelada: CONGELADA, adjudicadaPor: 'jorge' })
  const p = prepararObra({ adjudicacion: a, partidas: PARTIDAS })
  assert.equal(p.listo, false)
  assert.equal(p.bloqueos[0].tipo, 'SIN_FECHA_INICIO')
})

test('SIN HH se permite con NULL — y el subcontrato lleva CERO, que es otra cosa', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `prepararObra`, `hh: Number(p.hh) || 0`.
  const a = adjudicar({ congelada: CONGELADA, adjudicadaPor: 'jorge' })
  const p = prepararObra({
    adjudicacion: a, fechaInicio: '2026-09-01',
    partidas: [{ codigo: 'X', descripcion: 'tarea nueva sin rendimiento conocido', unidad: 'M2', cantidad: 100, hh: null }, PARTIDAS[1]],
  })
  assert.equal(p.listo, true)
  assert.equal(p.tareas.find((t) => t.partida === 'X').hh, null, 'poner cero acá inventa una productividad infinita')
  assert.equal(p.tareas.find((t) => t.partida === 'INST-SAN').hh, 0, 'un subcontrato NO consume horas propias: cero es el dato')
  assert.equal(p.issues.filter((i) => i.type === TIPO_ISSUE.FALTA_DATO).length, 1, 'y queda declarado que su avance no se va a medir en productividad')
})

test('NO se hereda el precio al cliente como costo', () => {
  const a = adjudicar({ congelada: CONGELADA, adjudicadaPor: 'jorge' })
  const p = prepararObra({ adjudicacion: a, partidas: [{ ...PARTIDAS[0], precioCliente: 54_200_000 }], fechaInicio: '2026-09-01' })
  const t = p.tareas[0]
  assert.equal(t.costoPrevisto, 32_240_000)
  assert.equal(t.metaDeIngreso, 54_200_000)
  assert.notEqual(t.costoPrevisto, t.metaDeIngreso, 'controlar la obra contra lo que se vendió pone el margen en cero antes de empezar')
})

test('una partida adjudicada SIN cantidad no se prepara: BLOCK', () => {
  const a = adjudicar({ congelada: CONGELADA, adjudicadaPor: 'jorge' })
  const p = prepararObra({ adjudicacion: a, partidas: [{ codigo: 'Y', cantidad: null, unidad: 'M2' }], fechaInicio: '2026-09-01' })
  assert.equal(p.listo, false)
  assert.equal(p.bloqueos[0].tipo, 'CANTIDAD_NO_HEREDABLE')
  assert.equal(p.tareas.length, 0)
})
