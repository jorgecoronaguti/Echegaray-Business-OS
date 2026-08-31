// LOS SUBCONTRATOS — sin precio no es $0, y la vigencia la manda el documento.
//
// Las mutaciones anotadas se corrieron de verdad. El mensaje que dice cada comentario es el que
// devolvió la corrida.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'
import {
  subcontrato, subcontratoVigente, vigenciaDeSubcontrato, brechaDeAlcance,
  costoDePartida, costoDirecto, VIGENCIA_SUBCONTRATO, DIAS_VIGENCIA_SUBCONTRATO,
} from './costo.mjs'
import { precioVigente, observacionDePrecio } from './precios.mjs'

const HOY = new Date('2026-08-30T12:00:00Z')

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SIN PRECIO NO ES CERO — y lo que se sabe no se pierde
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un subcontrato sin precio conserva todo lo que sí se sabe, y NO vale $0', () => {
  const s = subcontrato({
    alcance: 'Instalación sanitaria completa', proveedor: 'Sanitarios del Oeste SRL',
    tipo: 'SANITARIA', cantidad: 1, unidad: 'gl', moneda: 'ARS',
    cotizadoEn: '2026-08-01', documento: 'mail 01/08 · «pedido de cotización sanitaria»',
    incluye: ['materiales', 'mano de obra'], excluye: ['excavación de zanjas'],
  })
  assert.equal(s.costo, null, 'SIN_PRECIO ≠ 0: un subcontrato sin cotizar no es gratis')
  assert.equal(s.estado, ESTADO.FALTA_DATO)
  assert.match(s.porQue, /NO vale \$0/)
  // Lo que se preserva SIEMPRE: alcance, proveedor, fecha, moneda, vigencia y documento.
  assert.equal(s.proveedor, 'Sanitarios del Oeste SRL')
  assert.equal(s.cotizadoEn, '2026-08-01')
  assert.equal(s.moneda, 'ARS')
  assert.equal(s.tipo, 'SANITARIA')
  assert.equal(s.documento, 'mail 01/08 · «pedido de cotización sanitaria»')
  assert.deepEqual([...s.excluye], ['excavación de zanjas'])
  // MUTACIÓN CORRIDA: en la rama sin precio de `subcontrato()`, volver al objeto viejo
  //   `{ alcance, proveedor, cantidad, unidad, moneda, costo: null, ... }` sin `constante` → se
  //   pierden fecha, documento y alcance incluido/excluido.
  //   FALLA: «Expected values to be strictly equal: undefined !== '2026-08-01'».
})

test('una partida subcontratada sin precio deja el COSTO DIRECTO en null, no en la suma de las otras', () => {
  const sinPrecio = costoDePartida({
    partida: { codigo: 'SAN-01', cantidad: 1, unidad: 'gl', subcontrato: subcontrato({ alcance: 'Sanitaria', proveedor: 'X' }) },
    hoy: HOY,
  })
  assert.equal(sinPrecio.subtotal, null)
  assert.equal(sinPrecio.hh, 0, 'una partida subcontratada no consume horas propias: CERO es el dato')
  assert.equal(sinPrecio.issues[0].type, TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO)
  assert.equal(sinPrecio.issues[0].severity, SEVERIDAD.BLOQUEANTE)

  const conPrecio = costoDePartida({
    partida: {
      codigo: 'ELE-01', cantidad: 1, unidad: 'gl',
      subcontrato: subcontrato({ alcance: 'Eléctrica', proveedor: 'Y', precio: 8_500_000, cotizadoEn: '2026-08-20', fuente: 'presupuesto Y 20/08' }),
    },
    hoy: HOY,
  })
  assert.equal(conPrecio.subtotal, 8_500_000)

  const cd = costoDirecto([sinPrecio, conPrecio])
  assert.equal(cd.total, null, 'el total NO puede salir 8.500.000 ignorando la partida sin precio')
  assert.equal(cd.parcial, 8_500_000, 'la cifra parcial existe, se llama distinto y hay que pedirla')
  assert.equal(cd.nSinCosto, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA VIGENCIA — el documento manda; el default es un supuesto y lo dice
// ══════════════════════════════════════════════════════════════════════════════════════════════

const conPrecio = (extra) => subcontrato({
  alcance: 'Movimiento de suelo', proveedor: 'Excavaciones Cuyo', precio: 12_000_000,
  cotizadoEn: '2026-08-01', fuente: 'presupuesto 145/2026', ...extra,
})

test('cuando el documento declara su validez, MANDA el documento y no el corte de 180 días', () => {
  // La oferta dice «válida 15 días». A 29 días de cotizada está VENCIDA, aunque 180 diría que no.
  const s = conPrecio({ validezDias: 15, tipo: 'MOVIMIENTO_SUELO' })
  const v = vigenciaDeSubcontrato(s)
  assert.equal(v.origen, 'DOCUMENTO')
  assert.equal(v.dias, 15)
  const r = subcontratoVigente(s, { hoy: HOY })
  assert.equal(r.vigente, false)
  assert.equal(r.estado, ESTADO.HISTORICO)
  assert.equal(r.venceEl, '2026-08-16')
  assert.equal(r.decisionRequerida, true, 'vencido no se usa callado: pide reconfirmar')
  // Y con el 180 plano de antes ese mismo subcontrato estaba vigente: la diferencia es el defecto.
  assert.equal(subcontratoVigente(conPrecio({}), { hoy: HOY }).vigente, true)
  // MUTACIÓN CORRIDA: en `vigenciaDeSubcontrato`, mover la rama de `validezDias` DESPUÉS de la de
  //   tipo y general → el documento deja de mandar. FALLA: «true !== false» en r.vigente.
})

test('una fecha de vencimiento explícita gana sobre todo lo demás', () => {
  const s = conPrecio({ validoHasta: '2026-12-31', validezDias: 5, tipo: 'MOVIMIENTO_SUELO' })
  const r = subcontratoVigente(s, { hoy: HOY })
  assert.equal(r.vigente, true)
  assert.equal(r.origen, 'DOCUMENTO')
  assert.equal(r.venceEl, '2026-12-31')
})

test('sin validez en el documento manda el default POR TIPO, cuando la empresa lo declaró', () => {
  const tabla = { GENERAL: 180, MOVIMIENTO_SUELO: 20 }
  const s = conPrecio({ tipo: 'MOVIMIENTO_SUELO' })
  const v = vigenciaDeSubcontrato(s, { tabla })
  assert.equal(v.origen, 'TIPO')
  assert.equal(v.dias, 20)
  const r = subcontratoVigente(s, { hoy: HOY, tabla })
  assert.equal(r.vigente, false, 'cotizado el 01/08 con 20 días de validez: al 30/08 ya venció')
  assert.equal(r.venceEl, '2026-08-21')
  // MUTACIÓN CORRIDA: en `subcontratoVigente`, ignorar `tabla` y llamar
  //   `vigenciaDeSubcontrato(s, { diasPorDefecto })` → vuelve al corte general.
  //   FALLA: «cotizado el 01/08 con 20 días de validez: al 30/08 ya venció: true !== false».
})

test('sin default por tipo se cae al corte GENERAL y se DECLARA que es un supuesto', () => {
  const s = conPrecio({ tipo: 'ESTRUCTURA_METALICA' })
  const v = vigenciaDeSubcontrato(s, { tabla: { GENERAL: 180 } })
  assert.equal(v.origen, 'GENERAL')
  assert.equal(v.dias, 180)
  assert.match(v.porQue, /no tiene default declarado/)
  assert.match(v.porQue, /SUPONE/, 'quien lea esto tiene que saber que ese vencimiento no es una regla')
  // El único corte con origen declarado en el OS es el general.
  assert.deepEqual(VIGENCIA_SUBCONTRATO, { GENERAL: DIAS_VIGENCIA_SUBCONTRATO })
})

test('una validez AUSENTE no es una validez de cero días', () => {
  // `Number(null)` es 0 y `Number.isFinite(0)` es true: la primera versión de esto hacía vencer
  // todo subcontrato el mismo día que se cotizaba. Es el `NULL ≠ 0` de siempre, por otra puerta.
  const s = conPrecio({ validezDias: null, cotizadoEn: '2026-08-29' })
  const v = vigenciaDeSubcontrato(s)
  assert.equal(v.origen, 'GENERAL')
  assert.equal(v.dias, 180)
  assert.equal(subcontratoVigente(s, { hoy: HOY }).vigente, true)
  // MUTACIÓN CORRIDA: en `vigenciaDeSubcontrato`, volver a `Number.isFinite(Number(s?.validezDias))`
  //   sin la guarda de nulo. FALLA: «Expected values to be strictly equal: 'DOCUMENTO' !== 'GENERAL'».
})

test('sin fecha de cotización NI vencimiento no se puede saber nada: no es vigente', () => {
  const s = { ...conPrecio({}), cotizadoEn: null }
  const r = subcontratoVigente(s, { hoy: HOY })
  assert.equal(r.vigente, false)
  assert.equal(r.estado, ESTADO.FALTA_DATO)
  assert.equal(r.decisionRequerida, true)
})

test('un subcontrato VENCIDO no entra callado al costo: sale con su issue y su plata', () => {
  const p = costoDePartida({
    partida: {
      codigo: 'MS-01', cantidad: 1, unidad: 'gl',
      subcontrato: conPrecio({ tipo: 'MOVIMIENTO_SUELO' }),
    },
    hoy: HOY, tablaVigenciaSubcontrato: { GENERAL: 180, MOVIMIENTO_SUELO: 20 },
  })
  assert.equal(p.estado, ESTADO.HISTORICO, 'el número existe y NO cierra un presupuesto')
  assert.equal(p.subtotal, 12_000_000, 'vencido no es sin precio: el precio está y hay que reconfirmarlo')
  assert.equal(p.issues.length, 1)
  assert.equal(p.issues[0].type, TIPO_ISSUE.PRECIO_DESACTUALIZADO)
  assert.equal(p.issues[0].impact, 12_000_000)
  assert.equal(p.issues[0].recommended_action, 'set_subcontract')
  // Y con la tabla sin el default por tipo, el mismo subcontrato pasa: la diferencia es el dato.
  const vigente = costoDePartida({
    partida: { codigo: 'MS-01', cantidad: 1, unidad: 'gl', subcontrato: conPrecio({ tipo: 'MOVIMIENTO_SUELO' }) },
    hoy: HOY, tablaVigenciaSubcontrato: { GENERAL: 180 },
  })
  assert.equal(vigente.estado, ESTADO.EXTRAIDO)
  assert.equal(vigente.issues.length, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL ALCANCE — un sub más barato que excluye tres ítems no es más barato
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('dos precios de subcontratista no son comparables si no cubren lo mismo', () => {
  const exigido = ['materiales', 'mano de obra', 'andamios', 'retiro de escombros']
  const barato = conPrecio({ precio: 9_000_000, incluye: ['materiales', 'mano de obra'], excluye: ['andamios', 'retiro de escombros'] })
  const completo = conPrecio({ precio: 11_000_000, incluye: exigido })

  const b = brechaDeAlcance({ subcontrato: barato, exigido })
  assert.equal(b.comparable, false)
  assert.deepEqual([...b.noCubre], ['andamios', 'retiro de escombros'])
  assert.match(b.porQue, /no es comparable/)

  const c = brechaDeAlcance({ subcontrato: completo, exigido })
  assert.equal(c.comparable, true)
  assert.equal(c.noCubre.length, 0)
  assert.equal(c.porQue, null)
  // MUTACIÓN CORRIDA: en `brechaDeAlcance`, filtrar sólo por `excluye.has(...)` y no por lo que
  //   falta en `incluye` → un sub que simplemente no menciona los andamios pasa como comparable.
  //   Con este fixture sigue rojo porque `barato` los excluye explícitamente; el caso que la
  //   mutación destapa es el sub que CALLA, probado abajo.
})

test('el que CALLA tampoco cubre: no mencionarlo no lo incluye', () => {
  const exigido = ['materiales', 'mano de obra', 'andamios']
  const calla = conPrecio({ precio: 9_000_000, incluye: ['materiales', 'mano de obra'] })
  const b = brechaDeAlcance({ subcontrato: calla, exigido })
  assert.equal(b.comparable, false)
  assert.deepEqual([...b.noCubre], ['andamios'])
  // MUTACIÓN CORRIDA: en `brechaDeAlcance`, cambiar la condición a `excluye.has(norm(e))` a secas.
  //   FALLA: «Expected values to be strictly equal: true !== false».
})

test('sin alcance exigido declarado NO se puede afirmar que un precio es comparable', () => {
  const b = brechaDeAlcance({ subcontrato: conPrecio({ incluye: ['todo'] }), exigido: [] })
  assert.equal(b.comparable, false, 'comparable no puede salir true por no haber contra qué comparar')
  assert.match(b.porQue, /no se declaró qué exige la partida/)
})

test('un subcontrato con precio y sin fuente, o sin fecha, no se construye', () => {
  assert.throws(() => subcontrato({ alcance: 'x', precio: 100, cotizadoEn: '2026-08-01' }), /fuente/)
  assert.throws(() => subcontrato({ alcance: 'x', precio: 100, fuente: 'y' }), /fecha/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL PUNTO DE ENGANCHE DEL RESOLVEDOR — pedido por el frente de precios autónomos
// ══════════════════════════════════════════════════════════════════════════════════════════════

const PARTIDA = {
  codigo: 'MAM-01', cantidad: 100, unidad: 'M2',
  composicion: [
    { recursoCodigo: 'MAT-1', nombre: 'Ladrillón', tipo: 'material', unidad: 'un', cantidad: 45, desperdicio: 0.05 },
    { recursoCodigo: 'MO-1', nombre: 'Oficial', tipo: 'mano_obra', unidad: 'hs', cantidad: 2, desperdicio: 0 },
  ],
}
const OBS = [
  observacionDePrecio({ recursoCodigo: 'MAT-1', precio: 1200, fuente: 'lista 08/2026', observadoEn: '2026-08-20' }),
  observacionDePrecio({ recursoCodigo: 'MO-1', precio: 4200, fuente: 'convenio UOCRA', observadoEn: '2026-08-20' }),
]

test('el resolvedor de precios inyectable NO mueve nada cuando no se inyecta', () => {
  const conDefault = costoDePartida({ partida: PARTIDA, composicion: PARTIDA.composicion, observaciones: OBS, hoy: HOY })
  // El mismo cálculo pasando EXPLÍCITAMENTE el resolvedor por defecto tiene que dar lo mismo, campo
  // por campo: si el agregado moviera algo, este `deepEqual` lo muestra entero.
  const explicito = costoDePartida({ partida: PARTIDA, composicion: PARTIDA.composicion, observaciones: OBS, hoy: HOY, resolverPrecio: precioVigente })
  assert.deepEqual(explicito, conDefault)
  // Y el número es el de siempre: 100 × (45 × 1200 × 1,05 + 2 × 4200) = 100 × 65.100 = 6.510.000.
  assert.equal(conDefault.subtotal, 6_510_000)
  assert.equal(conDefault.estado, ESTADO.CALCULADO)
  assert.equal(conDefault.hh, 200)
})

test('un resolvedor que devuelve SIN_PRECIO deja la partida en desconocido, NUNCA en 0', () => {
  // Devuelve la forma de `precioVigente` con estado FALTA_DATO, que es lo que el resolvedor nuevo
  // produce cuando ninguna observación sirve.
  const sinPrecio = (codigo) => ({
    valor: null, estado: ESTADO.FALTA_DATO, moneda: null, fuente: null, observadoEn: null,
    antiguedadDias: null, recursoCodigo: codigo, vigenciaDias: null,
    porQue: `no hay observación de precio utilizable para ${codigo}`,
  })
  const r = costoDePartida({ partida: PARTIDA, composicion: PARTIDA.composicion, observaciones: OBS, hoy: HOY, resolverPrecio: sinPrecio })
  assert.equal(r.subtotal, null, 'SIN_PRECIO ≠ 0: la partida cuesta DESCONOCIDO, no cero')
  assert.equal(r.costoUnitario, null)
  assert.equal(r.estado, ESTADO.FALTA_DATO)
  assert.equal(r.cajones.MATERIALS, null, 'ni siquiera el cajón se afirma: le falta un renglón')
  assert.equal(r.faltan.length, 2)
  assert.ok(r.issues.every((i) => i.severity === SEVERIDAD.BLOQUEANTE))
  // Y el costo directo de la cotización tampoco se afirma.
  assert.equal(costoDirecto([r]).total, null)
  // MUTACIÓN CORRIDA: en `costoDePartida`, cambiar el `const total = completa ? … : null` por
  //   `const total = Object.values(cajones).reduce((a, v) => a + v, 0)` —o sea, sumar igual—.
  //   FALLA: «SIN_PRECIO ≠ 0: la partida cuesta DESCONOCIDO, no cero: 0 !== null».
})

test('una vigencia DERIVADA no puede pisar la que el documento declara', () => {
  // El resolvedor inyectado le daría 365 días a cualquier cosa. Con validez declarada NO se lo
  // consulta: una oferta que dice «válida 15 días» venció, por mejor que sea la derivación.
  const generoso = () => ({ origen: 'DERIVADO', dias: 365, hasta: null, porQue: 'derivado de la deriva de precios' })
  const declarado = conPrecio({ validezDias: 15, tipo: 'MOVIMIENTO_SUELO' })
  const r = subcontratoVigente(declarado, { hoy: HOY, resolver: generoso })
  assert.equal(r.origen, 'DOCUMENTO', 'el resolvedor no se consulta cuando el proveedor ya dijo hasta cuándo')
  assert.equal(r.vigente, false)
  // Y cuando el documento CALLA, el resolvedor sí manda.
  const callado = conPrecio({ tipo: 'MOVIMIENTO_SUELO' })
  const s = subcontratoVigente(callado, { hoy: HOY, resolver: generoso })
  assert.equal(s.origen, 'DERIVADO')
  assert.equal(s.vigente, true)
  // MUTACIÓN CORRIDA: en `subcontratoVigente`, quitar la guarda `!declarada` del ternario → el
  //   resolvedor pisa la validez declarada. FALLA: «el resolvedor no se consulta cuando el proveedor
  //   ya dijo hasta cuándo: 'DERIVADO' !== 'DOCUMENTO'».
})
