// EL SUBCONTRATO SIN PRECIO NO VALE CERO — el test obligatorio del §14/§18.
//
// Y el caso hermano, que es el que está VIVO en la base: `cotizacion_cascada` hace
// `coalesce(sum(subtotal), 0)`, `sum()` ignora los NULL, y el presupuesto publica un total completo
// con una partida sin precio adentro. Acá el total se niega.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subcontrato, subcontratoVigente, costoDePartida, costoDirecto, validarCantidadDePartida, CAJON } from './costo.mjs'
import { recurso, observacionDePrecio, precioVigente, tipoDeCambio, aplicarFx, TIPO_RECURSO, estadoDeObservacion } from './precios.mjs'
import { ESTADO, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'

const HOY = new Date('2026-08-29T12:00:00Z')

const PRECIOS = [
  observacionDePrecio({ recursoCodigo: 'MAT-CEM', precio: 18_000, fuente: 'Base Maestra · lista 08/2026', observadoEn: '2026-08-01' }),
  observacionDePrecio({ recursoCodigo: 'MO-OF', precio: 4_200, fuente: 'convenio UOCRA Zona A', observadoEn: '2026-08-01' }),
]

const COMPOSICION = [
  { recursoCodigo: 'MAT-CEM', nombre: 'Cemento portland', tipo: TIPO_RECURSO.MATERIAL, cantidad: 7, unidad: 'kg', desperdicio: 0.05 },
  { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs', desperdicio: 0 },
]

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL TEST OBLIGATORIO — SUBCONTRATO SIN PRECIO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un SUBCONTRATO SIN PRECIO no vale $0: vale null y lo dice', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `subcontrato`, devolver `costo: 0` en la rama sin precio.
  const s = subcontrato({ alcance: 'instalación sanitaria completa' })
  assert.equal(s.costo, null)
  assert.notEqual(s.costo, 0, 'un subcontrato sin cotizar no es gratis')
  assert.equal(s.estado, ESTADO.FALTA_DATO)
  assert.match(s.porQue, /NO vale \$0/)
  assert.ok(s.faltan.includes('precio'))
})

test('la partida subcontratada sin precio BLOQUEA y no aporta $0 al total', () => {
  const c = costoDePartida({
    partida: { codigo: 'INST-SAN', cantidad: 1, unidad: 'un', subcontrato: subcontrato({ alcance: 'sanitaria' }) },
  })
  assert.equal(c.subtotal, null)
  assert.equal(c.estado, ESTADO.FALTA_DATO)
  assert.equal(c.issues[0].type, TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO)
  assert.equal(c.issues[0].severity, SEVERIDAD.BLOQUEANTE)
  assert.equal(c.hh, 0, 'y sus HH propias son CERO, que es un hecho y no un hueco')
})

test('EL DEFECTO DE LA BASE: el total NO se afirma cuando una partida no tiene precio', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `costoDirecto`, `const completo = true`.
  //
  // Reproduce lo que hace hoy `cotizacion_cascada`: dos partidas, una de $30 M y otra
  // subcontratada sin cotizar. `coalesce(sum(subtotal),0)` publicaría $30 M como costo directo.
  const conPrecio = costoDePartida({ partida: { codigo: 'HORM', cantidad: 100, unidad: 'm3' }, composicion: COMPOSICION, observaciones: PRECIOS, hoy: HOY })
  const sinPrecio = costoDePartida({ partida: { codigo: 'INST-SAN', cantidad: 1, unidad: 'un', subcontrato: subcontrato({ alcance: 'sanitaria' }) } })

  const cd = costoDirecto([conPrecio, sinPrecio])
  assert.equal(cd.total, null, 'con una partida sin costo el total NO se afirma (§15)')
  assert.notEqual(cd.total, conPrecio.subtotal, 'y sobre todo NO da la suma de las que sí tenían precio')
  assert.equal(cd.nSinCosto, 1)
  assert.match(cd.porQue, /NO se afirma/)
  // La cifra parcial existe, y se llama distinto: quien la pide sabe que está incompleta.
  assert.equal(cd.parcial, conPrecio.subtotal)
})

test('UNA SOLA línea sin precio deja la partida entera sin subtotal', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `costoDePartida`,
  // `const total = Object.values(cajones).reduce((a, v) => a + v, 0)` (sin el `completa ?`).
  //
  // Es el mismo defecto de `sum()` una escala más abajo: si la partida suma los recursos que sí
  // tenían precio, sale un subtotal con cara de completo al que le falta un renglón — y a nivel
  // partida es PEOR, porque el costo unitario resultante se ve plausible y nadie lo vuelve a mirar.
  const c = costoDePartida({
    partida: { codigo: 'HORM', cantidad: 100, unidad: 'm3' },
    composicion: COMPOSICION,
    observaciones: [PRECIOS[0]],   // hay cemento, NO hay oficial
    hoy: HOY,
  })
  assert.equal(c.subtotal, null)
  assert.equal(c.costoUnitario, null)
  assert.notEqual(c.subtotal, 13_230_000, 'no puede dar el costo de los materiales solos')
  assert.equal(c.cajones.MATERIALS, null, 'ni siquiera el cajón que sí cerró publica su número: el desglose de un total que no existe no existe')
  assert.equal(c.faltan.length, 1)
  assert.match(c.faltan[0], /MO-OF/)
  // Y la línea sin precio SIGUE en el detalle, con su estado: desaparecer sería peor.
  assert.equal(c.lineas.length, 2)
  assert.equal(c.lineas.find((l) => l.recurso === 'MO-OF').costo, null)
})

test('con TODO el precio puesto, el total sí se afirma y cada cajón es trazable', () => {
  const conPrecio = costoDePartida({ partida: { codigo: 'HORM', cantidad: 100, unidad: 'm3' }, composicion: COMPOSICION, observaciones: PRECIOS, hoy: HOY })
  const sub = costoDePartida({
    partida: {
      codigo: 'INST-SAN', cantidad: 1, unidad: 'un',
      subcontrato: subcontrato({ alcance: 'sanitaria', proveedor: 'Gasparini', precio: 8_500_000, cotizadoEn: '2026-08-20', fuente: 'presupuesto por mail 20/08' }),
    },
  })
  const cd = costoDirecto([conPrecio, sub])
  assert.notEqual(cd.total, null)
  // 100 m3 × (7 kg × 18.000 × 1,05 + 2 hs × 4.200) = 100 × (132.300 + 8.400) = 14.070.000
  assert.equal(cd.cajones[CAJON.MATERIALS], 13_230_000)
  assert.equal(cd.cajones[CAJON.LABOR], 840_000)
  assert.equal(cd.cajones[CAJON.SUBCONTRACTS], 8_500_000)
  assert.equal(cd.total, 22_570_000)
  assert.equal(cd.hh, 200, '2 hs/m³ × 100 m³ — las HH del subcontrato son 0 y no se inventan')
})

test('un subcontrato CON precio exige fuente y fecha: sin ellas no se construye', () => {
  assert.throws(() => subcontrato({ alcance: 'sanitaria', precio: 8_500_000 }), /no trae fuente/)
  assert.throws(() => subcontrato({ alcance: 'sanitaria', precio: 8_500_000, fuente: 'mail' }), /no trae fecha/)
  assert.throws(() => subcontrato({ alcance: null, precio: 1 }), /sin alcance/)
})

test('un subcontrato VENCIDO no es un subcontrato sin precio: tiene número y hay que reconfirmarlo', () => {
  const s = subcontrato({ alcance: 'sanitaria', proveedor: 'Gasparini', precio: 8_500_000, cotizadoEn: '2026-01-10', validoHasta: '2026-02-10', fuente: 'mail' })
  const v = subcontratoVigente(s, { hoy: HOY })
  assert.equal(v.vigente, false)
  assert.equal(v.estado, ESTADO.HISTORICO)
  const c = costoDePartida({ partida: { codigo: 'INST-SAN', cantidad: 1, unidad: 'un', subcontrato: s } })
  assert.equal(c.subtotal, 8_500_000, 'el número existe')
  assert.equal(c.issues[0].type, TIPO_ISSUE.PRECIO_DESACTUALIZADO)
  assert.equal(c.issues[0].impact, 8_500_000, 'y el impacto se conoce, así que se escribe')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// RESOURCE ≠ PRICE OBSERVATION
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un recurso existe sin precio — y un precio sin fuente o sin fecha no se construye', () => {
  const r = recurso({ codigo: 'MAT-CEM', nombre: 'Cemento', tipo: TIPO_RECURSO.MATERIAL })
  assert.equal('precio' in r, false, 'el recurso es una cosa, no un precio')
  assert.throws(() => observacionDePrecio({ recursoCodigo: 'X', precio: 1, observadoEn: '2026-08-01' }), /sin fuente/)
  assert.throws(() => observacionDePrecio({ recursoCodigo: 'X', precio: 1, fuente: 'a' }), /sin fecha/)
})

test('«no está en catálogo», «nunca se cotizó» y «se cotizó hace 14 meses» son TRES cosas distintas', () => {
  const viejo = observacionDePrecio({ recursoCodigo: 'MAT-HIERRO', precio: 900, fuente: 'lista 2025', observadoEn: '2025-06-01' })
  assert.equal(precioVigente('MAT-QUE-NO-EXISTE', [], { hoy: HOY }).estado, ESTADO.FALTA_DATO)
  assert.equal(precioVigente('MAT-CEM', [], { hoy: HOY }).estado, ESTADO.FALTA_DATO)
  const p = precioVigente('MAT-HIERRO', [viejo], { hoy: HOY })
  assert.equal(p.estado, ESTADO.HISTORICO, 'un precio viejo NO es un precio faltante: tiene número')
  assert.equal(p.valor, 900)
  assert.ok(p.antiguedadDias > 400)
})

test('HISTORICO ≠ VALIDADO: un precio vencido NO cierra la partida, pero tampoco la vacía', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `estadoDeObservacion`, devolver EXTRAIDO cuando `dias > vigencia`.
  const viejo = observacionDePrecio({ recursoCodigo: 'MAT-CEM', precio: 9_000, fuente: 'lista 2025', observadoEn: '2025-01-01' })
  const c = costoDePartida({
    partida: { codigo: 'HORM', cantidad: 10, unidad: 'm3' },
    composicion: [COMPOSICION[0]], observaciones: [viejo], hoy: HOY,
  })
  assert.notEqual(c.subtotal, null, 'el número existe y se calcula')
  assert.equal(c.issues.some((i) => i.type === TIPO_ISSUE.PRECIO_DESACTUALIZADO), true)
  assert.equal(c.issues[0].impact, c.subtotal, 'el impacto es la plata que cuelga de ese precio viejo')
})

test('gana la observación MÁS RECIENTE y no se promedia: un promedio es un precio que nadie vio', () => {
  const a = observacionDePrecio({ recursoCodigo: 'MAT-CEM', precio: 10_000, fuente: 'proveedor A', observadoEn: '2026-08-01' })
  const b = observacionDePrecio({ recursoCodigo: 'MAT-CEM', precio: 20_000, fuente: 'proveedor B', observadoEn: '2026-08-20' })
  const p = precioVigente('MAT-CEM', [a, b], { hoy: HOY })
  assert.equal(p.valor, 20_000)
  assert.equal(p.fuente, 'proveedor B')
  assert.equal(p.descartadas, 1)
  assert.notEqual(p.valor, 15_000)
})

test('un precio fechado en el futuro es ERROR, no un precio fresquísimo', () => {
  const futuro = observacionDePrecio({ recursoCodigo: 'X', precio: 1, fuente: 'f', observadoEn: '2027-01-01' })
  assert.equal(estadoDeObservacion(futuro, { hoy: HOY }).estado, ESTADO.ERROR)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FX EXPLÍCITO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('sin tipo de cambio, un monto en USD NO se suma a pesos', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `aplicarFx`, devolver `{valor: Number(monto)}` cuando no hay fx.
  const r = aplicarFx({ monto: 1_000, desde: 'USD', hasta: 'ARS', fx: null })
  assert.equal(r.valor, null)
  assert.equal(r.estado, ESTADO.FALTA_DATO)
  assert.match(r.porQue, /USD\/ARS/)
})

test('el FX aplicado declara par, tasa, fuente, cuándo se observó y cuándo se aplicó', () => {
  const fx = tipoDeCambio({ par: 'USD/ARS', tasa: 1_450, fuente: 'BNA vendedor', observadoEn: '2026-08-28' })
  const r = aplicarFx({ monto: 1_000, desde: 'USD', hasta: 'ARS', fx, aplicadoEn: '2026-08-29' })
  assert.equal(r.valor, 1_450_000)
  assert.deepEqual(Object.keys(r.fx).sort(), ['aplicadoEn', 'fuente', 'observadoEn', 'par', 'tasa'])
  assert.match(r.formula, /BNA vendedor/)
})

test('un tipo de cambio sin par, sin fuente o sin fecha no se construye', () => {
  assert.throws(() => tipoDeCambio({ par: 'dolar', tasa: 1, fuente: 'a', observadoEn: 'b' }), /USD\/ARS/)
  assert.throws(() => tipoDeCambio({ par: 'USD/ARS', tasa: 1450, observadoEn: 'b' }), /sin fuente/)
  assert.throws(() => tipoDeCambio({ par: 'USD/ARS', tasa: 0, fuente: 'a', observadoEn: 'b' }), /no es un tipo de cambio/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS OTRAS DOS RAZONES POR LAS QUE UNA PARTIDA NO TIENE COSTO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('sin composición cargada, «no sé de qué está hecha» ≠ «no sé cuánto sale»', () => {
  const c = costoDePartida({ partida: { codigo: 'X', cantidad: 10, unidad: 'm3' }, composicion: [], observaciones: PRECIOS })
  assert.equal(c.subtotal, null)
  assert.match(c.faltan[0], /no tiene composición cargada/)
})

test('sin cantidad computada la partida no cuesta cero: BLOQUEA', () => {
  const c = costoDePartida({ partida: { codigo: 'X', cantidad: null, unidad: 'm3' }, composicion: COMPOSICION, observaciones: PRECIOS })
  assert.equal(c.subtotal, null)
  assert.equal(c.issues[0].type, TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE)
  assert.equal(c.issues[0].recommended_action, 'update_quantity')
})

test('una cantidad en la unidad equivocada NO entra a la partida', () => {
  const r = validarCantidadDePartida({ cantidad: 520, unidad: 'm3', unidadPartida: 'M2' })
  assert.equal(r.ok, false)
  assert.equal(r.estado, ESTADO.ERROR)
  assert.equal(r.cantidad, null)
})

test('una cotización sin ninguna partida NO tiene costo directo cero', () => {
  const cd = costoDirecto([])
  assert.equal(cd.total, null, 'cero partidas no es un presupuesto de $0: es un presupuesto vacío')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS TRES NULL→0 QUE ENCONTRÓ LA AUDITORÍA ADVERSARIAL
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('una LÍNEA de composición sin cantidad NO vale cero: borra $2,4 M de mano de obra', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `costoDePartida`, sacar la guarda de `l.cantidad`.
  //
  // El defecto medido: `Number(null) * precio * cant` = 0, la partida salía `completa: true`, sin
  // un solo issue, y la fórmula publicaba «null hs/u». Es el mismo defecto que este archivo ya
  // cerraba para la cantidad de la PARTIDA y no para la de la LÍNEA.
  const c = costoDePartida({
    partida: { codigo: 'HORM', cantidad: 100, unidad: 'm3' },
    composicion: [COMPOSICION[0], { ...COMPOSICION[1], cantidad: null }],
    observaciones: PRECIOS, hoy: HOY,
  })
  assert.equal(c.subtotal, null, 'con un renglón sin medir el subtotal NO se afirma')
  assert.notEqual(c.subtotal, 13_230_000, 'y sobre todo NO da el costo de los materiales solos')
  assert.equal(c.estado, ESTADO.FALTA_DATO)
  assert.equal(c.issues.length, 1)
  assert.equal(c.issues[0].severity, SEVERIDAD.BLOQUEANTE)
  assert.match(c.issues[0].detalle, /NO es cero: es un renglón sin medir/)
  // Y la línea sale con cantidad null, no con un número inventado.
  assert.equal(c.lineas.find((l) => l.recurso === 'MO-OF').cantidad, null)
})

test('si la línea sin medir es de MANO DE OBRA, las HH de la partida son NULL', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `costoDePartida`, `hh: redondear(hhUnitarias * Number(cant), 4)`.
  //
  // `hhUnitarias += Number(l.cantidad) || 0` sumaba cero y publicaba un total de horas al que le
  // faltaba un renglón — que engaña más que un total ausente.
  const c = costoDePartida({
    partida: { codigo: 'HORM', cantidad: 100, unidad: 'm3' },
    composicion: [COMPOSICION[0], { ...COMPOSICION[1], cantidad: null }],
    observaciones: PRECIOS, hoy: HOY,
  })
  assert.equal(c.hh, null)
  assert.notEqual(c.hh, 0)
  // Con la línea de MO medida, las HH vuelven.
  const ok = costoDePartida({ partida: { codigo: 'HORM', cantidad: 100, unidad: 'm3' }, composicion: COMPOSICION, observaciones: PRECIOS, hoy: HOY })
  assert.equal(ok.hh, 200)
})

test('HISTORICO ≠ VALIDADO: la partida con precio vencido NO sale CALCULADA', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `costoDePartida`, `estado: completa ? ESTADO.CALCULADO : …`.
  //
  // El motor traducía HISTORICO a EXTRAIDO para poder sumar el número, y con eso el estado se
  // perdía aguas abajo: la versión terminaba sellada VALIDADA con precios de catorce meses.
  const viejo = observacionDePrecio({ recursoCodigo: 'MAT-CEM', precio: 9_000, fuente: 'lista 2025', observadoEn: '2025-01-01' })
  const c = costoDePartida({
    partida: { codigo: 'HORM', cantidad: 10, unidad: 'm3' },
    composicion: [COMPOSICION[0]], observaciones: [viejo], hoy: HOY,
  })
  assert.notEqual(c.subtotal, null, 'el número existe: el precio viejo se puede sumar')
  assert.equal(c.estado, ESTADO.HISTORICO, 'pero el estado NO es CALCULADO')
  assert.equal(c.vencidos.length, 1)
  assert.equal(c.vencidos[0].recurso, 'MAT-CEM')
  assert.ok(c.vencidos[0].impacto > 0, 'y dice cuánta plata cuelga de ese precio')
})

test('el TOTAL de HH no se traga el null: una partida rota lo anula', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `costoDirecto`, `hh: redondear(reduce((a,c) => a + (c.hh ?? 0)))`.
  //
  // El fix de la línea sin cantidad creó `hh: null` por partida, y `costoDirecto` lo sumaba como
  // cero: una partida rota más una sana publicaba 200 h como total de la obra.
  const sana = costoDePartida({ partida: { codigo: 'A', cantidad: 100, unidad: 'm3' }, composicion: COMPOSICION, observaciones: PRECIOS, hoy: HOY })
  const rota = costoDePartida({ partida: { codigo: 'B', cantidad: 100, unidad: 'm3' }, composicion: [COMPOSICION[0], { ...COMPOSICION[1], cantidad: null }], observaciones: PRECIOS, hoy: HOY })
  assert.equal(sana.hh, 200)
  assert.equal(rota.hh, null)
  const cd = costoDirecto([sana, rota])
  assert.equal(cd.hh, null, 'el total de horas NO se afirma')
  assert.notEqual(cd.hh, 200)
  assert.equal(cd.nSinHh, 1)
  assert.ok(cd.issues.some((i) => i.entity === 'HH de la obra'))
  // Con las dos sanas, vuelve.
  assert.equal(costoDirecto([sana, sana]).hh, 400)
})

test('un SUBCONTRATO sin vencimiento NO es vigente para siempre', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `subcontratoVigente`, `if (!s.validoHasta) return {vigente:true}`.
  //
  // `pg.mjs` nunca fija `validoHasta`, así que TODO subcontrato leído de la base era eterno: un
  // precio de recurso vence a los 180 días y uno de subcontrato jamás. El mismo agujero de
  // HISTORICO por otra puerta.
  const viejo = subcontrato({ alcance: 'sanitaria', proveedor: 'X', precio: 8_500_000, cotizadoEn: '2025-06-01', fuente: 'mail' })
  const v = subcontratoVigente(viejo, { hoy: HOY })
  assert.equal(v.vigente, false)
  assert.equal(v.estado, ESTADO.HISTORICO)
  assert.match(v.porQue, /no declara vencimiento/)
  // Uno reciente sigue vigente.
  const nuevo = subcontrato({ alcance: 'sanitaria', proveedor: 'X', precio: 8_500_000, cotizadoEn: '2026-08-20', fuente: 'mail' })
  assert.equal(subcontratoVigente(nuevo, { hoy: HOY }).vigente, true)
})
