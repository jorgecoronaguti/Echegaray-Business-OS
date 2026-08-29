// EL GATE VA ANTES DE CONGELAR, Y LO QUE BLOQUEA ES UNA REGLA CON TEST.
//
// Hoy `congelar_presupuesto` informa los faltantes DESPUÉS de haber congelado, y congelar es
// irreversible por diseño: un presupuesto con tres paquetes sin precio queda congelado sin precio.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colaDeAtencion, bloquea, esMaterial, queMeFaltaParaEnviar, UMBRAL_MATERIALIDAD } from './atencion.mjs'
import { huellaDeEntradas, diferenciaDeHuellas, gateDeCongelado, congelar, etapaFreeze } from './freeze.mjs'
import { issue, TIPO_ISSUE, SEVERIDAD, STATUS, ETAPA, ESTADO } from './contrato.mjs'
import { politicaComercial, cascada } from './comercial.mjs'
import { observacionDePrecio } from './precios.mjs'

const POLITICA = politicaComercial({
  fuente: 'XLSM', pctGastosGenerales: 0.27, pctBeneficio: 0.22, pctFinanciero: 0.07,
  factorFinanciero: 0.5, pctIibb: 0.024, pctGanancias: 0.02, pctCheque: 0.012, pctIva: 0.21,
})
const CASCADA_OK = cascada({ costoDirecto: 180_000_000, politica: POLITICA })
const ENTRADAS = {
  documentos: [{ hash: 'aaa', nombre: 'plano.pdf' }, { hash: 'bbb', nombre: 'pliego.pdf' }],
  partidas: [{ codigo: 'T1010', cantidad: 100, unidad: 'm3', alcance: 'INCLUIDO' }],
  precios: [observacionDePrecio({ recursoCodigo: 'MAT-CEM', precio: 18_000, fuente: 'lista', observadoEn: '2026-08-01' })],
  politica: POLITICA, alcance: [], fx: null,
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// BLOQUEO POR MATERIALIDAD (§23)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un clavo sin precio NO frena una oferta de $180 M; la sanitaria sí', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `esMaterial`, `return true` siempre.
  const clavo = issue({ type: TIPO_ISSUE.SIN_PRECIO, entity: 'MAT-CLAVO', impact: 900 })
  const sanitaria = issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, entity: 'INST-SAN', impact: 8_500_000 })
  assert.equal(bloquea(clavo, { costoConocido: 180_000_000 }).bloquea, false)
  assert.equal(bloquea(sanitaria, { costoConocido: 180_000_000 }).bloquea, true)
  assert.match(bloquea(sanitaria, { costoConocido: 180_000_000 }).porQue, /8\.500\.000/)
})

test('un hueco SIN MEDIR bloquea: no saber cuánto pesa no lo vuelve chico', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `esMaterial`, `if (issue.impact === null) return false`.
  const sinMedir = issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, entity: 'INST-SAN' })
  assert.equal(sinMedir.impact, null)
  assert.equal(esMaterial(sinMedir, { costoConocido: 180_000_000 }), true)
  assert.match(bloquea(sinMedir, { costoConocido: 180_000_000 }).porQue, /no se puede declarar chico/)
})

test('un CONFLICTO bloquea aunque sea barato: no se resuelve con plata', () => {
  const c = issue({ type: TIPO_ISSUE.CONFLICTO, entity: 'T9000', impact: 1 })
  assert.equal(bloquea(c, { costoConocido: 180_000_000 }).bloquea, true)
  assert.match(bloquea(c, { costoConocido: 180_000_000 }).porQue, /se resuelve con una decisión/)
})

test('un dato menor NO bloquea: un precio viejo de $900 es una advertencia', () => {
  const viejo = issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: 'MAT-CLAVO', impact: 900 })
  assert.equal(bloquea(viejo, { costoConocido: 180_000_000 }).bloquea, false)
})

test('el umbral es 2 % y se puede mover, pero está declarado', () => {
  assert.equal(UMBRAL_MATERIALIDAD, 0.02)
  const justo = issue({ type: TIPO_ISSUE.SIN_PRECIO, entity: 'X', impact: 3_600_000 })
  assert.equal(esMaterial(justo, { costoConocido: 180_000_000 }), true, '2 % exacto es material')
  assert.equal(esMaterial(justo, { costoConocido: 180_000_000, umbral: 0.05 }), false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA COLA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('la cola recalcula la severidad con el costo a la vista, y ordena por bloqueo', () => {
  const cola = colaDeAtencion({
    costoConocido: 180_000_000,
    issues: [
      issue({ type: TIPO_ISSUE.SIN_PRECIO, severity: SEVERIDAD.BLOQUEANTE, entity: 'MAT-CLAVO', impact: 900 }),
      issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, severity: SEVERIDAD.ALTA, entity: 'INST-SAN', impact: 8_500_000 }),
    ],
  })
  assert.equal(cola.nBloqueantes, 1)
  assert.equal(cola.bloqueantes[0].entity, 'INST-SAN')
  assert.equal(cola.issues[1].severity, SEVERIDAD.ALTA, 'el clavo baja de BLOQUEANTE a ALTA: pesa 0,0005 %')
  assert.equal(cola.plataEnRiesgo, 8_500_000)
})

test('plataEnRiesgo es NULL cuando ningún bloqueante trae impacto — no cero', () => {
  // MUTACIÓN QUE LO PONE ROJO: `plataEnRiesgo: bloqueantes.reduce(...)` sin la guarda.
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [issue({ type: TIPO_ISSUE.CONFLICTO, entity: 'X' })] })
  assert.equal(cola.plataEnRiesgo, null, 'un cero acá se leería como «bloquea y no cuesta nada»')
  assert.equal(cola.bloqueantesSinMedir, 1)
})

test('«¿qué me falta para enviar?» devuelve la lista corta con la acción al lado (§19)', () => {
  const cola = colaDeAtencion({
    costoConocido: 180_000_000,
    issues: [issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, entity: 'INST-SAN', impact: 8_500_000, recommended_action: 'set_subcontract', detalle: 'la sanitaria no cotizó' })],
  })
  const r = queMeFaltaParaEnviar(cola)
  assert.equal(r.length, 1)
  assert.deepEqual(Object.keys(r[0]).sort(), ['accion', 'cuantoPesa', 'porQue', 'que', 'tipo'])
  assert.equal(r[0].accion, 'set_subcontract')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL GATE
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el GATE va ANTES y devuelve el detalle, no un booleano opaco', () => {
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, entity: 'INST-SAN', impact: 8_500_000, recommended_action: 'set_subcontract' })] })
  const g = gateDeCongelado({ cascada: CASCADA_OK, cola })
  assert.equal(g.ready, false)
  assert.equal(g.blocking_issues.length, 1)
  assert.equal(g.blocking_issues[0].accion, 'set_subcontract')
  assert.match(g.porQue, /NO se congela/)
})

test('sin precio calculable NO se congela aunque la cola esté vacía', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar el bloque `if (!cascada || cascada.ventaSinIva === null)`.
  // Una cotización con cero partidas tiene la cola vacía y no tiene número que fijar.
  const g = gateDeCongelado({ cascada: cascada({ costoDirecto: null, politica: POLITICA }), cola: colaDeAtencion({ issues: [] }) })
  assert.equal(g.ready, false)
  assert.equal(g.blocking_issues[0].tipo, 'SIN_PRECIO_CALCULABLE')
})

test('con la cola limpia el gate deja pasar, y las advertencias quedan REGISTRADAS', () => {
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: 'MAT-CLAVO', impact: 900 })] })
  const g = gateDeCongelado({ cascada: CASCADA_OK, cola })
  assert.equal(g.ready, true)
  assert.equal(g.warnings.length, 1)
  assert.match(g.porQue, /1 advertencia\(s\) que NO bloquean/)
})

test('congelar SIN gate listo TIRA — no devuelve un valor que alguien pueda ignorar', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `congelar`, cambiar el `throw` por `return null`.
  const cola = colaDeAtencion({ costoConocido: 1, issues: [issue({ type: TIPO_ISSUE.CONFLICTO, entity: 'X' })] })
  const g = gateDeCongelado({ cascada: CASCADA_OK, cola })
  assert.throws(() => congelar({ cascada: CASCADA_OK, huella: huellaDeEntradas(ENTRADAS), gate: g, congeladoPor: 'jorge' }), /no se puede congelar/)
})

test('congelar sin quién ni sin huella no se puede: la revisión no podría decir qué cambió', () => {
  const g = gateDeCongelado({ cascada: CASCADA_OK, cola: colaDeAtencion({ issues: [] }) })
  assert.throws(() => congelar({ cascada: CASCADA_OK, huella: huellaDeEntradas(ENTRADAS), gate: g }), /sin dueño/)
  assert.throws(() => congelar({ cascada: CASCADA_OK, huella: null, gate: g, congeladoPor: 'jorge' }), /sin huella/)
})

test('FROZEN ≠ DRAFT: lo congelado no se puede mutar desde el consumidor', () => {
  const g = gateDeCongelado({ cascada: CASCADA_OK, cola: colaDeAtencion({ issues: [] }) })
  const f = congelar({ cascada: CASCADA_OK, huella: huellaDeEntradas(ENTRADAS), gate: g, congeladoPor: 'jorge' })
  assert.equal(f.esBorrador, false)
  assert.equal(f.estado, ESTADO.VALIDADO)
  assert.throws(() => { f.cascada.ventaFinal = 1 }, TypeError)
  assert.throws(() => { f.congeladoPor = 'otro' }, TypeError)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA HUELLA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('REPRODUCIBILIDAD: los mismos inputs en distinto ORDEN dan la MISMA huella (§39)', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `huellaDeEntradas`, sacar los `.sort()`.
  const a = huellaDeEntradas(ENTRADAS)
  const b = huellaDeEntradas({ ...ENTRADAS, documentos: [...ENTRADAS.documentos].reverse() })
  assert.equal(a.sha256, b.sha256)
  assert.equal(diferenciaDeHuellas(a, b).iguales, true)
})

test('la huella es del INPUT: dice QUÉ cambió, no sólo que cambió', () => {
  const a = huellaDeEntradas(ENTRADAS)
  const b = huellaDeEntradas({ ...ENTRADAS, partidas: [{ codigo: 'T1010', cantidad: 120, unidad: 'm3', alcance: 'INCLUIDO' }] })
  const d = diferenciaDeHuellas(a, b)
  assert.equal(d.iguales, false)
  assert.deepEqual(d.cambiaron, ['partidas'], 'y no «precios» ni «política»: la diferencia se localiza')

  const c = huellaDeEntradas({ ...ENTRADAS, politica: { ...ENTRADAS.politica, pctBeneficio: 0.19 } })
  assert.deepEqual(diferenciaDeHuellas(a, c).cambiaron, ['politica'])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA ETAPA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('la etapa FREEZE bloqueada devuelve las acciones que la destraban', () => {
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, entity: 'INST-SAN', impact: 8_500_000, recommended_action: 'set_subcontract' })] })
  const e = etapaFreeze({ cascada: CASCADA_OK, cola, huella: huellaDeEntradas(ENTRADAS) })
  assert.equal(e.etapa, ETAPA.FREEZE)
  assert.equal(e.status, STATUS.BLOQUEADA)
  assert.deepEqual(e.next_actions, ['set_subcontract'])
  assert.equal(e.confidence, 0)
})

test('la etapa FREEZE con quién congela devuelve la versión inmutable y su huella', () => {
  const e = etapaFreeze({ cascada: CASCADA_OK, cola: colaDeAtencion({ issues: [] }), huella: huellaDeEntradas(ENTRADAS), congeladoPor: 'jorge' })
  assert.equal(e.status, STATUS.OK)
  assert.equal(e.result.esBorrador, false)
  assert.equal(e.evidence[0].huella.length, 64)
  assert.equal(e.confidence, 1)
})
