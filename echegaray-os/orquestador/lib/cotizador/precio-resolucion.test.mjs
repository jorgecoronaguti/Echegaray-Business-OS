// LOS INVARIANTES DEL PROGRAMA, CON SU TEST NEGATIVO.
//
// Cada uno de los cinco invariantes que el pedido declara innegociables tiene acá un test que
// PRUEBA QUE EL CONTROL PUEDE DECIR QUE NO. Un control que sólo sabe decir OK es una constante
// disfrazada de control, y este repo ya pagó ese error.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'
import { FUENTE } from '../plano/fuente.mjs'
import {
  ORIGEN, RESULTADO, FUENTE_DE_ORIGEN, ES_DEL_RECURSO, ORDEN_CASCADA,
  candidatoDePrecio, materialidadDe, evaluarCandidato, compararFuentes, resolverPrecio, necesitaHumano,
  issueDeResolucion,
  TRAMO_PARITARIA_HASTA,
} from './precio-resolucion.mjs'

const HOY = new Date('2026-08-30T00:00:00Z')
const HORMIGON = { codigo: 'H21', nombre: 'HORMIGON H21', tipo: 'material', familia: 'MATERIAL', unidad: 'm3' }
const CLAVO = { codigo: '4', nombre: 'CLAVO DE 2', tipo: 'material', familia: 'MATERIAL', unidad: 'kg' }

const cand = (o) => candidatoDePrecio({ recursoCodigo: 'H21', detalleFuente: 'test', ...o })

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 1 · SIN_PRECIO ≠ 0   ·   INVARIANTE 2 · NULL ≠ 0
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('SIN_PRECIO sale con valor null, NUNCA con cero', () => {
  const p = resolverPrecio({ recurso: HORMIGON, candidatos: [], hoy: HOY })
  assert.equal(p.resultado, RESULTADO.SIN_PRECIO)
  assert.equal(p.valor, null)
  assert.notEqual(p.valor, 0, 'un cero acá es el error que más plata mueve del programa')
  assert.equal(p.moneda, null)
  assert.equal(p.fuente, FUENTE.FALTA_DATO)
  assert.equal(p.estado, ESTADO.FALTA_DATO)
  assert.match(p.porQue, /se recorrió la cascada entera/)
})

test('NEGATIVO · un candidato de valor 0 NO entra al sistema: el constructor tira', () => {
  assert.throws(() => cand({ valor: 0, origen: ORIGEN.INTERNO, observadoEn: '2026-08-01' }), /no es un precio/)
  assert.throws(() => cand({ valor: null, origen: ORIGEN.INTERNO, observadoEn: '2026-08-01' }), /no es un precio/)
  assert.throws(() => cand({ valor: -5, origen: ORIGEN.INTERNO, observadoEn: '2026-08-01' }), /no es un precio/)
})

test('NEGATIVO · un candidato sin fecha o sin detalle de fuente NO entra', () => {
  assert.throws(() => cand({ valor: 100, origen: ORIGEN.INTERNO }), /sin fecha/)
  assert.throws(() => candidatoDePrecio({ recursoCodigo: 'H21', valor: 100, origen: ORIGEN.WEB, observadoEn: '2026-08-01' }), /sin detalle de fuente/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 3 · WEB ≠ EXPERIENCIA_ECSAS
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un precio de la WEB nunca se guarda como experiencia propia de ECSAS', () => {
  const web = cand({ valor: 100, origen: ORIGEN.WEB, observadoEn: '2026-08-29', detalleFuente: 'lista de precios de un corralón' })
  assert.equal(web.fuente, FUENTE.WEB)
  assert.notEqual(web.fuente, FUENTE.EXPERIENCIA_ECSAS)
  assert.equal(web.esHechoEcsas, false)
})

test('NEGATIVO · la fuente NO se puede pasar por afuera para ascender un precio de internet', () => {
  const web = candidatoDePrecio({
    recursoCodigo: 'H21', valor: 100, origen: ORIGEN.WEB, observadoEn: '2026-08-29',
    detalleFuente: 'x', fuente: FUENTE.EXPERIENCIA_ECSAS,   // el intento de ascenso
  })
  assert.equal(web.fuente, FUENTE.WEB, 'el parámetro `fuente` se ignora: la fuente la fija el origen')
  assert.equal(FUENTE_DE_ORIGEN.WEB, FUENTE.WEB)
  assert.notEqual(FUENTE_DE_ORIGEN.WEB, FUENTE.EXPERIENCIA_ECSAS)
})

test('una FACTURA PAGADA sí es experiencia de ECSAS — y es lo único que lo es', () => {
  const compra = cand({ valor: 100, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-29', detalleFuente: 'compra_sheet fila 55' })
  assert.equal(compra.fuente, FUENTE.EXPERIENCIA_ECSAS)
  assert.equal(compra.esHechoEcsas, true)
  assert.equal(cand({ valor: 1, origen: ORIGEN.COMPARABLE, observadoEn: '2026-08-29' }).esHechoEcsas, false)
  assert.equal(cand({ valor: 1, origen: ORIGEN.INTERNO, observadoEn: '2026-08-29' }).esHechoEcsas, false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 4 · UN PRECIO VENCIDO NO SE USA CALLADO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el único precio que hay está vencido ⇒ NECESITA_HUMANO, con el número a la vista', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [cand({ valor: 180_000, origen: ORIGEN.INTERNO, observadoEn: '2024-08-07', detalleFuente: 'Planilla para Cotizar (2).xlsm · Recursos!377' })],
  })
  assert.equal(p.resultado, RESULTADO.NECESITA_HUMANO)
  assert.equal(p.estado, ESTADO.HISTORICO)
  assert.equal(p.valor, 180_000, 'el número viejo se muestra: sirve de referencia aunque no cierre la oferta')
  assert.match(p.porQue, /NO se usa en silencio/)
  assert.equal(necesitaHumano(p), true)
  assert.equal(p.issue.type, TIPO_ISSUE.PRECIO_DESACTUALIZADO)
})

test('NEGATIVO · el mismo precio, fechado hoy, NO necesita a nadie', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [cand({ valor: 180_000, origen: ORIGEN.INTERNO, observadoEn: '2026-08-29', detalleFuente: 'x' })],
  })
  assert.equal(p.resultado, RESULTADO.VIGENTE)
  assert.equal(necesitaHumano(p), false)
  assert.equal(p.issue, null)
})

test('un precio fechado en el FUTURO no es fresco: es un dedazo', () => {
  const e = evaluarCandidato(cand({ valor: 100, origen: ORIGEN.INTERNO, observadoEn: '2027-01-01' }), { recurso: HORMIGON, hoy: HOY })
  assert.equal(e.vigente, false)
  assert.equal(e.estado, ESTADO.ERROR)
  const p = resolverPrecio({ recurso: HORMIGON, hoy: HOY, candidatos: [cand({ valor: 100, origen: ORIGEN.INTERNO, observadoEn: '2027-01-01' })] })
  assert.equal(p.resultado, RESULTADO.SIN_PRECIO)
  assert.equal(p.valor, null)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 5 · UN OUTLIER NO SE PROMEDIA CON LO BUENO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('dos fuentes que no coinciden NO producen su promedio', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 8_000_000, costoConocido: 100_000_000,
    candidatos: [
      cand({ valor: 180_000, origen: ORIGEN.INTERNO, observadoEn: '2024-01-01', detalleFuente: 'catálogo viejo' }),
      cand({ valor: 900_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-20', detalleFuente: 'compra_sheet fila 88' }),
    ],
  })
  assert.equal(p.valor, 900_000)
  assert.notEqual(p.valor, (180_000 + 900_000) / 2, 'promediar fabrica un precio que nadie observó')
  assert.ok([180_000, 900_000].includes(p.valor))
})

test('un salto material sobre un precio VIGENTE no se aplica solo: OUTLIER_PENDING', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 8_000_000, costoConocido: 100_000_000,
    candidatos: [
      // El interno es de anteayer: sigue vigente, así que SÍ es línea de base.
      cand({ valor: 180_000, origen: ORIGEN.INTERNO, observadoEn: '2026-08-28', detalleFuente: 'catálogo fresco' }),
      cand({ valor: 900_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-29', detalleFuente: 'compra_sheet fila 88' }),
    ],
  })
  assert.equal(p.valor, 180_000, 'la cascada se para en INTERNO vigente')
  assert.equal(p.resultado, RESULTADO.VIGENTE)

  // Ahora el mismo salto, pero sin interno vigente que gane la cascada: se compara y se frena.
  const q = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 8_000_000, costoConocido: 100_000_000,
    candidatos: [
      cand({ valor: 900_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-29', detalleFuente: 'compra_sheet fila 88' }),
    ],
  })
  assert.equal(q.resultado, RESULTADO.ACTUALIZADO, 'sin nada contra qué comparar, la factura gana sola')
  assert.equal(compararFuentes({
    elegido: { valor: 900_000, moneda: 'ARS', recursoCodigo: 'H21' },
    incumbente: { valor: 180_000, moneda: 'ARS', vigente: true, observadoEn: '2026-08-28' },
    recurso: HORMIGON, impacto: 8_000_000, costoConocido: 100_000_000,
  }).veredicto, 'RESOLVER')
})

test('un incumbente VENCIDO no es línea de base: ×5 contra un precio de 2022 es inflación, no anomalía', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 8_000_000, costoConocido: 100_000_000,
    candidatos: [
      cand({ valor: 180_000, origen: ORIGEN.INTERNO, observadoEn: '2022-05-10', detalleFuente: 'Planilla · Recursos!324' }),
      cand({ valor: 900_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-29', detalleFuente: 'compra_sheet fila 88' }),
    ],
  })
  // Medido: la primera corrida sobre el catálogo real mandó a humano 7 de los 8 recursos que la
  // cascada YA había resuelto con una factura pagada, por este motivo exacto.
  assert.equal(p.resultado, RESULTADO.ACTUALIZADO)
  assert.equal(p.valor, 900_000)
  assert.equal(p.issue, null)
  assert.match(p.provenance.cotejo.porQue, /la diferencia es tiempo, no anomalía/)
})

test('NEGATIVO · el mismo cotejo, con el incumbente VIGENTE, sí frena', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 8_000_000, costoConocido: 100_000_000,
    candidatos: [
      cand({ valor: 180_000, origen: ORIGEN.INTERNO, observadoEn: '2026-08-29', detalleFuente: 'catálogo de ayer' }),
      cand({ valor: 900_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-29', detalleFuente: 'compra_sheet fila 88' }),
    ],
  })
  // El interno vigente gana la cascada (paso 1) y no hay cotejo que hacer.
  assert.equal(p.resultado, RESULTADO.VIGENTE)
  assert.equal(p.valor, 180_000)
  assert.equal(p.provenance.descartados.length, 1)
  assert.equal(p.provenance.descartados[0].valor, 900_000, 'lo que no se eligió queda escrito, no desaparece')
})

test('NEGATIVO · el MISMO salto sobre un recurso que no mueve plata SÍ se aplica solo', () => {
  const p = resolverPrecio({
    recurso: CLAVO, hoy: HOY, impacto: 40_000, costoConocido: 180_000_000,
    candidatos: [
      cand({ recursoCodigo: '4', valor: 1_000, origen: ORIGEN.INTERNO, observadoEn: '2024-01-01', detalleFuente: 'catálogo viejo' }),
      cand({ recursoCodigo: '4', valor: 5_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-20', detalleFuente: 'compra_sheet fila 90' }),
    ],
  })
  assert.equal(p.resultado, RESULTADO.ACTUALIZADO)
  assert.equal(p.valor, 5_000)
  assert.equal(p.issue, null, 'un clavo no frena una oferta de $180 M')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CASCADA, LA MATERIALIDAD Y LA PROVENANCE
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('la cascada se para en el PRIMERO vigente y no degrada la procedencia', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [
      cand({ valor: 200_000, origen: ORIGEN.INTERNO, observadoEn: '2026-08-25', detalleFuente: 'catálogo' }),
      cand({ valor: 210_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-28', detalleFuente: 'factura' }),
      cand({ valor: 999_999, origen: ORIGEN.WEB, observadoEn: '2026-08-29', detalleFuente: 'una página' }),
    ],
  })
  assert.equal(p.resultado, RESULTADO.VIGENTE)
  assert.equal(p.valor, 200_000)
  assert.equal(p.provenance.resueltoEn, ORIGEN.INTERNO)
  assert.equal(p.provenance.recorrido.find((r) => r.paso === ORIGEN.WEB).estado, 'RESUELVE')
})

test('el catálogo vencido cae al escalón siguiente y el sistema resuelve SOLO', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 100_000, costoConocido: 100_000_000,
    candidatos: [
      cand({ valor: 200_000, origen: ORIGEN.INTERNO, observadoEn: '2022-05-10', detalleFuente: 'Planilla · Recursos!324' }),
      cand({ valor: 205_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-28', detalleFuente: 'compra_sheet fila 12' }),
    ],
  })
  assert.equal(p.resultado, RESULTADO.ACTUALIZADO, 'una factura pagada hace cuatro días no necesita que nadie la confirme')
  assert.equal(p.provenance.resueltoEn, ORIGEN.COMPRA_ECSAS)
  assert.equal(p.provenance.esHechoEcsas, true)
  assert.equal(p.issue, null)
  assert.equal(p.provenance.recorrido[0].estado, 'VENCIDO')
})

test('materialidadDe · no saber cuánto pesa NO es pesar cero', () => {
  assert.equal(materialidadDe({}).material, true)
  assert.equal(materialidadDe({}).fraccion, null)
  assert.equal(materialidadDe({ impacto: 1, costoConocido: 0 }).material, true)
  assert.equal(materialidadDe({ impacto: 8_000_000, costoConocido: 100_000_000 }).material, true)
  assert.equal(materialidadDe({ impacto: 40_000, costoConocido: 180_000_000 }).material, false)
})

test('la materialidad decide la SEVERIDAD, no el tipo de problema', () => {
  const solo = (recurso, impacto, costo) => resolverPrecio({ recurso, candidatos: [], impacto, costoConocido: costo, hoy: HOY })
  assert.equal(solo(HORMIGON, 8_000_000, 100_000_000).issue.severity, SEVERIDAD.BLOQUEANTE)
  assert.equal(solo(CLAVO, 40_000, 180_000_000).issue.severity, SEVERIDAD.MEDIA)
  assert.equal(solo(HORMIGON, 8_000_000, 100_000_000).issue.type, solo(CLAVO, 40_000, 180_000_000).issue.type)
})

test('todo precio resuelto lleva los ocho campos que el programa exige', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [cand({ valor: 200_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-25', detalleFuente: 'compra_sheet fila 7', evidencia: { tabla: 'public.compra_sheet', fila: 7 } })],
  })
  for (const campo of ['recurso', 'valor', 'moneda', 'fuente', 'fecha', 'vigencia', 'evidencia', 'provenance']) {
    assert.ok(p[campo] !== undefined && p[campo] !== null, `falta «${campo}»`)
  }
  // Sin materialidad conocida la tolerancia es el piso de ignorancia (5%) y el IPC real del INDEC
  // da ~2,63%/mes: 30 × 5% ÷ 2,63% = 57 días. Pero el IPC publicado llega a 2026-06 y hoy es el
  // 30/08: hay ~2 meses sin medir, así que la vigencia se recorta a 43. Que este número sea MENOR
  // que 57 es la prueba de que la guarda del índice atrasado está aplicada y no sólo declarada.
  assert.equal(p.vigencia.origenDeriva, 'IPC_INDEC_ATRASADO')
  assert.ok(p.vigencia.dias < 57, `sin el recorte por atraso daría 57; dio ${p.vigencia.dias}`)
  assert.equal(p.vigencia.dias, 43)
  assert.equal(p.vigencia.venceEl, '2026-10-07', 'la vigencia dice HASTA CUÁNDO, no sólo cuántos días')
  assert.equal(p.evidencia.fila, 7)
  assert.equal(p.provenance.decididoEn, '2026-08-30')
})

test('compararFuentes · dos monedas distintas no se comparan sin tipo de cambio', () => {
  const r = compararFuentes({
    elegido: { valor: 100, moneda: 'USD', recursoCodigo: 'H21' },
    incumbente: { valor: 180_000, moneda: 'ARS' },
    recurso: HORMIGON,
  })
  assert.equal(r.veredicto, 'RESOLVER')
  assert.match(r.porQue, /sin tipo de cambio declarado/)
})

test('un precio EN DÓLARES no se vence con el IPC en pesos — el VIBRO COMPACTADOR NIWA es real', () => {
  const equipo = { codigo: 'NIWA', nombre: 'VIBRO COMPACTADOR NIWA', tipo: 'equipo', familia: 'MAQUINA', unidad: 'dia' }
  const enUsd = resolverPrecio({
    recurso: equipo, hoy: HOY,
    candidatos: [candidatoDePrecio({ recursoCodigo: 'NIWA', valor: 120, moneda: 'USD', origen: ORIGEN.INTERNO, observadoEn: '2026-05-01', detalleFuente: 'Planilla · Recursos!366' })],
  })
  const enArs = resolverPrecio({
    recurso: equipo, hoy: HOY,
    candidatos: [candidatoDePrecio({ recursoCodigo: 'NIWA', valor: 120_000, moneda: 'ARS', origen: ORIGEN.INTERNO, observadoEn: '2026-05-01', detalleFuente: 'Planilla · Recursos!366' })],
  })
  assert.equal(enUsd.resultado, RESULTADO.VIGENTE)
  assert.equal(enArs.resultado, RESULTADO.NECESITA_HUMANO, 'el mismo precio en pesos sí venció')
  assert.equal(enUsd.vigencia.origenDeriva, 'MONEDA_EXTRANJERA_NO_MEDIDA', 'y sale ETIQUETADO como hueco, no como medición')
})

test('la MATERIALIDAD desbloquea: el TORNILLO deja de frenar la obra y el PANEL no', () => {
  const viejo = (recurso, codigo) => ({ recurso, candidatos: [candidatoDePrecio({ recursoCodigo: codigo, valor: 1000, origen: ORIGEN.INTERNO, observadoEn: '2025-09-30', detalleFuente: 'Planilla' })], hoy: HOY })
  const tornillo = resolverPrecio({ ...viejo({ codigo: 'T2', nombre: 'TORNILLO AUTOPERFORANTE 2"', tipo: 'material' }, 'T2'), impacto: 15_000, costoConocido: 79_500_000 })
  const panel = resolverPrecio({ ...viejo({ codigo: 'PCT', nombre: 'PANEL CHAPA TRAPE', tipo: 'material' }, 'PCT'), impacto: 12_000_000, costoConocido: 79_500_000 })
  assert.equal(tornillo.resultado, RESULTADO.VIGENTE, '334 días de un tornillo que mueve $15.000 sobre $79,5 M no vencen: su error no mueve el total')
  assert.equal(tornillo.issue, null)
  assert.equal(panel.resultado, RESULTADO.NECESITA_HUMANO)
  assert.equal(panel.issue.severity, SEVERIDAD.ALTA)
})

test('el recorrido completo sale SIEMPRE, incluso cuando no se resolvió nada', () => {
  const p = resolverPrecio({ recurso: HORMIGON, candidatos: [], hoy: HOY })
  assert.equal(p.provenance.recorrido.length, 4)
  assert.ok(p.provenance.recorrido.every((r) => r.estado === 'SIN_CANDIDATO' && r.porQue))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL TRAMO DE PARITARIA · LA FECHA QUE CADUCA
// ══════════════════════════════════════════════════════════════════════════════════════════════

const OFICIAL = { codigo: '1', nombre: 'OFICIAL', tipo: 'mano_obra', familia: 'MANO DE OBRA', unidad: 'hs' }
/** El básico de agosto: $6.348/h Zona A, el valor real de `ESCALA_VERIFICADA`. */
const basicoDeAgosto = () => candidatoDePrecio({
  recursoCodigo: '1', valor: 6_348, origen: ORIGEN.INTERNO, observadoEn: '2026-08-01',
  detalleFuente: 'UOCRA CCT 76/75 Zona A · escala 2026-08',
})

test('el básico de convenio se resuelve SOLO: el tramo firmado está cableado, no hay que pasarlo', () => {
  const p = resolverPrecio({ recurso: OFICIAL, candidatos: [basicoDeAgosto()], hoy: new Date('2026-08-30T00:00:00Z') })
  assert.equal(p.resultado, RESULTADO.VIGENTE, 'ya no sale TRAMO_PARITARIA_DESCONOCIDO')
  assert.equal(p.vigencia.origenDeriva, 'TRAMO_PARITARIA')
  assert.equal(p.vigencia.venceEl, TRAMO_PARITARIA_HASTA)
  assert.equal(p.issue, null)
})

test('EL 01/09/2026 el básico de agosto CADUCA y pide el tramo nuevo', () => {
  // La fecha fija es el punto: el 30/08 este mismo precio es correcto y el 01/09 no lo es. Lo que
  // cambió no es el mercado —no pasó nada con la inflación en 48 horas—: se terminó el acuerdo.
  const p = resolverPrecio({ recurso: OFICIAL, candidatos: [basicoDeAgosto()], hoy: new Date('2026-09-01T00:00:00Z') })
  assert.equal(p.resultado, RESULTADO.NECESITA_HUMANO)
  assert.equal(p.estado, ESTADO.HISTORICO)
  assert.equal(p.valor, 6_348, 'el número se muestra como referencia; lo que NO se hace es cerrarle una oferta encima')
  assert.match(p.porQue, /CADUCÓ el 2026-08-31/)
  assert.equal(necesitaHumano(p), true)
})

test('CADUCAR NO ES DEGRADARSE · a igual fecha, el material sigue vivo y el jornal no', () => {
  const hoy = new Date('2026-09-01T00:00:00Z')
  const jornal = resolverPrecio({ recurso: OFICIAL, candidatos: [basicoDeAgosto()], hoy })
  const material = resolverPrecio({
    recurso: HORMIGON, hoy, impacto: 0.001, costoConocido: 1,
    candidatos: [cand({ valor: 200_000, origen: ORIGEN.INTERNO, observadoEn: '2026-08-01', detalleFuente: 'catálogo' })],
  })
  assert.equal(jornal.resultado, RESULTADO.NECESITA_HUMANO, 'el jornal caducó por FECHA')
  assert.equal(material.resultado, RESULTADO.VIGENTE, 'el material de la misma fecha todavía no se degradó lo suficiente')
  assert.ok(jornal.vigencia.dias < material.vigencia.dias)
})

test('NEGATIVO · el 31/08, el último día del tramo, TODAVÍA vale', () => {
  const p = resolverPrecio({ recurso: OFICIAL, candidatos: [basicoDeAgosto()], hoy: new Date('2026-08-31T00:00:00Z') })
  assert.equal(p.resultado, RESULTADO.VIGENTE, 'el borde se incluye: el acuerdo rige HASTA el 31 inclusive')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ENTRE DOS VENCIDOS, LA PROCEDENCIA MANDA SOBRE LA FECHA
//
// Ninguno de estos candidatos cierra un presupuesto —todos salen NECESITA_HUMANO—, pero UNO es el
// que se le muestra a la persona que va a decidir, y va a decidir mirando ése. Ordenando sólo por
// fecha, un COMPARABLE de 2026 (que es el precio de OTRO recurso) desplazaba a la observación
// propia de 2017. Más reciente no es más cierto cuando cambia la procedencia.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const vencido = (origen, observadoEn, valor) => cand({ valor, origen, observadoEn, detalleFuente: `${origen} ${observadoEn}` })

test('un COMPARABLE más nuevo NO desplaza a la observación propia vencida', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [vencido(ORIGEN.INTERNO, '2017-06-07', 1000), vencido(ORIGEN.COMPARABLE, '2026-01-15', 9999)],
  })
  assert.equal(p.resultado, RESULTADO.NECESITA_HUMANO)
  assert.equal(p.provenance.resueltoEn, ORIGEN.INTERNO)
  assert.equal(p.valor, 1000)
  assert.notEqual(p.valor, 9999, 'un precio inferido de otro recurso no es mejor evidencia sobre éste')
})

test('un precio de la WEB más nuevo tampoco desplaza a una compra real vencida', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [vencido(ORIGEN.COMPRA_ECSAS, '2020-02-13', 500), vencido(ORIGEN.WEB, '2026-06-01', 7777)],
  })
  assert.equal(p.provenance.resueltoEn, ORIGEN.COMPRA_ECSAS)
  assert.equal(p.valor, 500)
})

test('el desplazado NO se esconde: queda entero en provenance.descartados', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [vencido(ORIGEN.INTERNO, '2017-06-07', 1000), vencido(ORIGEN.COMPARABLE, '2026-01-15', 9999)],
  })
  const d = p.provenance.descartados.find((x) => x.origen === ORIGEN.COMPARABLE)
  assert.ok(d, 'el comparable desplazado tiene que seguir visible')
  assert.equal(d.valor, 9999)
  assert.equal(d.observadoEn, '2026-01-15')
  assert.match(p.porQue, /inferencias más nuevas pero sobre otra cosa/)
})

test('A IGUAL procedencia SÍ decide la fecha: entre dos del propio recurso gana el más nuevo', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [vencido(ORIGEN.INTERNO, '2017-06-07', 1000), vencido(ORIGEN.COMPRA_ECSAS, '2022-05-14', 3000)],
  })
  assert.equal(p.provenance.resueltoEn, ORIGEN.COMPRA_ECSAS)
  assert.equal(p.valor, 3000)
})

test('entre dos inferencias también decide la fecha, y no se menciona ningún desplazado propio', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY,
    candidatos: [vencido(ORIGEN.WEB, '2024-03-03', 200), vencido(ORIGEN.COMPARABLE, '2025-10-01', 400)],
  })
  assert.equal(p.provenance.resueltoEn, ORIGEN.COMPARABLE)
  assert.equal(p.valor, 400)
})

test('la elección entre vencidos es determinística con los candidatos en cualquier orden (§39)', () => {
  const cs = [vencido(ORIGEN.COMPARABLE, '2026-01-15', 9999), vencido(ORIGEN.INTERNO, '2017-06-07', 1000), vencido(ORIGEN.WEB, '2026-07-01', 8888)]
  const a = resolverPrecio({ recurso: HORMIGON, candidatos: cs, hoy: HOY })
  const b = resolverPrecio({ recurso: HORMIGON, candidatos: [...cs].reverse(), hoy: HOY })
  assert.equal(a.provenance.resueltoEn, ORIGEN.INTERNO)
  assert.equal(a.valor, b.valor)
})

test('ES_DEL_RECURSO clasifica los cuatro orígenes y ninguno queda sin declarar', () => {
  assert.deepEqual(Object.keys(ES_DEL_RECURSO).sort(), [...ORDEN_CASCADA].sort())
  assert.equal(ES_DEL_RECURSO[ORIGEN.INTERNO], true)
  assert.equal(ES_DEL_RECURSO[ORIGEN.COMPRA_ECSAS], true)
  assert.equal(ES_DEL_RECURSO[ORIGEN.COMPARABLE], false)
  assert.equal(ES_DEL_RECURSO[ORIGEN.WEB], false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UN PRECIO DE INTERNET NO CIERRA UNA OFERTA SOLO (R1 de la auditoría adversarial)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Lo que midió el auditor: con el precio interno vencido, el resolvedor acepta el de la web —probado
// con uno ×10 sobre un recurso que mueve el 40 % del costo— y lo publicaba como ACTUALIZADO **sin
// ningún issue**. Que la web sea la única fuente disponible no la vuelve propia, y con 285 de 389
// precios vencidos la condición de disparo es el estado normal del catálogo, no un caso raro.

const VIEJO_INTERNO = { valor: 100000, origen: ORIGEN.INTERNO, observadoEn: '2024-06-01', detalleFuente: 'catálogo interno' }

test('un ACTUALIZADO desde la WEB emite PRECIO_DE_INTERNET y pide firma para congelar', () => {
  // MUTACIÓN CORRIDA: devolver `null` para todo ACTUALIZADO → este test en rojo.
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 0.4, costoConocido: 1,
    candidatos: [
      cand(VIEJO_INTERNO),
      cand({ valor: 1000000, origen: ORIGEN.WEB, observadoEn: '2026-08-29', detalleFuente: 'https://uncorralon.example/lista' }),
    ],
  })
  assert.equal(p.resultado, RESULTADO.ACTUALIZADO)
  assert.equal(p.provenance.resueltoEn, ORIGEN.WEB)
  const i = issueDeResolucion(p, materialidadDe({ impacto: 0.4, costoConocido: 1 }))
  assert.ok(i, 'un precio de internet entró al costo sin un solo issue')
  assert.equal(i.type, TIPO_ISSUE.PRECIO_DE_INTERNET)
  assert.equal(i.severity, SEVERIDAD.ALTA)
})

test('el mismo ACTUALIZADO desde una COMPRA PROPIA no pide nada', () => {
  // El control que prueba que el candado no bloquea de más: una factura pagada por ECSAS es
  // experiencia propia, y exigirle firma sería tratar lo propio como si viniera de afuera.
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 0.4, costoConocido: 1,
    candidatos: [
      cand(VIEJO_INTERNO),
      cand({ valor: 260000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-20', detalleFuente: 'factura A 0001-00012345' }),
    ],
  })
  assert.equal(p.resultado, RESULTADO.ACTUALIZADO)
  assert.equal(issueDeResolucion(p, materialidadDe({ impacto: 0.4, costoConocido: 1 })), null)
})

test('WEB ≠ EXPERIENCIA_ECSAS · un precio de internet nunca se guarda como fuente propia', () => {
  const p = resolverPrecio({
    recurso: HORMIGON, hoy: HOY, impacto: 0.4, costoConocido: 1,
    candidatos: [cand(VIEJO_INTERNO), cand({ valor: 1000000, origen: ORIGEN.WEB, observadoEn: '2026-08-29', detalleFuente: 'https://uncorralon.example/lista' })],
  })
  assert.notEqual(p.fuente, FUENTE.EXPERIENCIA_ECSAS)
})
