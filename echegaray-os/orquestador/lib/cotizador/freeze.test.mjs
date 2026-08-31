// EL GATE VA ANTES DE CONGELAR, Y LO QUE BLOQUEA ES UNA REGLA CON TEST.
//
// Hoy `congelar_presupuesto` informa los faltantes DESPUÉS de haber congelado, y congelar es
// irreversible por diseño: un presupuesto con tres paquetes sin precio queda congelado sin precio.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colaDeAtencion, bloquea, esMaterial, queMeFaltaParaEnviar, UMBRAL_MATERIALIDAD } from './atencion.mjs'
import { huellaDeEntradas, huellaDeResultado, diferenciaDeHuellas, gateDeCongelado, congelar, etapaFreeze } from './freeze.mjs'
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

test('un PRECIO VENCIDO bloquea aunque sea de $900 — HISTORICO ≠ VALIDADO (§42)', () => {
  // ═══ CAMBIO DE SEMÁNTICA, ORDENADO Y DELIBERADO ═══
  //
  // Este test afirmaba lo contrario: que un precio viejo de $900 era una advertencia por no ser
  // material. La auditoría adversarial mostró a dónde llevaba esa lectura — el motor traducía
  // HISTORICO a EXTRAIDO para poder sumarlo y la versión terminaba SELLADA como VALIDADA con
  // precios de catorce meses. Un precio vencido barato no vuelve válida una oferta: sólo la vuelve
  // barata de arreglar.
  const viejo = issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: 'MAT-CLAVO', impact: 900 })
  assert.equal(bloquea(viejo, { costoConocido: 180_000_000 }).bloquea, true)
  assert.match(bloquea(viejo, { costoConocido: 180_000_000 }).porQue, /HISTORICO ≠ VALIDADO/)
})

test('...y lo destraba un OVERRIDE COMERCIAL con quién lo autoriza, nunca un flag', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `overrideDe`, sacar la condición `o?.autorizadoPor`.
  const viejo = issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: 'MAT-CLAVO', impact: 900 })
  const sinQuien = bloquea(viejo, { costoConocido: 180_000_000, overrides: [{ entidad: 'MAT-CLAVO' }] })
  assert.equal(sinQuien.bloquea, true, 'un override sin quién lo autorizó no existe')
  const conQuien = bloquea(viejo, { costoConocido: 180_000_000, overrides: [{ entidad: 'MAT-CLAVO', autorizadoPor: 'jorge', motivo: 'el clavo no movió' }] })
  assert.equal(conQuien.bloquea, false)
  assert.match(conQuien.porQue, /asumido por jorge/)
  // Y el issue dice QUIÉN lo asumió: la advertencia no puede decir sólo «no bloquea».
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [viejo], overrides: [{ entidad: 'MAT-CLAVO', autorizadoPor: 'jorge' }] })
  assert.equal(cola.nBloqueantes, 0)
  assert.equal(cola.issues[0].asumidoPor, 'jorge')
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
  const cola = colaDeAtencion({
    costoConocido: 180_000_000,
    issues: [issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: 'MAT-CLAVO', impact: 900 })],
    overrides: [{ entidad: 'MAT-CLAVO', autorizadoPor: 'jorge', motivo: 'asumido' }],
  })
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

test('la huella se congela EN PROFUNDIDAD: partes.partidas no se puede reescribir', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `huellaDeEntradas`, volver a `Object.freeze({...})` superficial.
  //
  // `Object.freeze` es superficial: `huella.partes.partidas` quedaba MUTABLE y `pg.mjs` persiste
  // `partes` + `sha` sin re-verificar que uno corresponda al otro. Un consumidor podía reescribir
  // el detalle y guardar la huella vieja al lado.
  const h = huellaDeEntradas(ENTRADAS)
  assert.throws(() => { h.partes.partidas.push('inventada') }, TypeError)
  assert.throws(() => { h.partes.politica = 'otra' }, TypeError)
  assert.throws(() => { h.sha256 = 'a'.repeat(64) }, TypeError)
})

test('`hoy` ES una entrada: la misma cotización en 2027 NO tiene la misma huella', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `huellaDeEntradas`, sacar `hoy` de `partes`.
  const a = huellaDeEntradas({ ...ENTRADAS, hoy: new Date('2026-08-29') })
  const b = huellaDeEntradas({ ...ENTRADAS, hoy: new Date('2027-08-29') })
  assert.notEqual(a.sha256, b.sha256, 'la fecha decide qué precio venció: es un input')
  assert.deepEqual(diferenciaDeHuellas(a, b).cambiaron, ['hoy'])
})

test('la HUELLA DEL RESULTADO distingue lo que la de entrada no puede', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `huellaDeResultado`, dejar `partes = {}`.
  const base = { costoDirecto: { total: 100, parcial: 100, hh: 5 }, cascada: { ventaSinIva: 168, coeficienteSinIva: 1.68 }, gate: { blocking_issues: [] }, cola: { issues: [] }, explosion: { recursos: [] }, partidas: [], etapas: [] }
  const otro = { ...base, costoDirecto: { total: 200, parcial: 200, hh: 5 } }
  assert.notEqual(huellaDeResultado(base).sha256, huellaDeResultado(otro).sha256)
  assert.equal(huellaDeResultado(base).sha256, huellaDeResultado({ ...base }).sha256)
  assert.match(huellaDeResultado(base).resumen, /costo 100/)
})

test('CIERRA() decide el sello: lo congelado con datos HISTORICO queda CONFIRMADO, no VALIDADO', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `congelar`, `estado: ESTADO.VALIDADO` fijo.
  //
  // `contrato.NO_CIERRAN` declara que HISTORICO no cierra y su único consumidor era su propio test:
  // la versión se sellaba VALIDADA siempre.
  const g = gateDeCongelado({ cascada: CASCADA_OK, cola: colaDeAtencion({ issues: [] }) })
  const limpio = congelar({ cascada: CASCADA_OK, huella: huellaDeEntradas(ENTRADAS), gate: g, congeladoPor: 'jorge', estadoDeLoCongelado: ESTADO.CALCULADO })
  assert.equal(limpio.estado, ESTADO.VALIDADO)
  const conViejos = congelar({ cascada: CASCADA_OK, huella: huellaDeEntradas(ENTRADAS), gate: g, congeladoPor: 'jorge', estadoDeLoCongelado: ESTADO.HISTORICO })
  assert.equal(conViejos.estado, ESTADO.CONFIRMADO)
  assert.notEqual(conViejos.estado, ESTADO.VALIDADO, 'HISTORICO ≠ VALIDADO (§42)')
  assert.match(conViejos.porQue, /NO cierra por sí solo/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// VUELTA 5 — lo que la re-auditoría encontró vivo
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('EXCLUSION_CON_COMPUTO BLOQUEA — y se prueba POR LA COLA, no sobre el issue crudo', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar TIPO_ISSUE.EXCLUSION_CON_COMPUTO de BLOQUEAN_SALVO_OVERRIDE.
  //
  // El test anterior verificaba `severity` sobre el issue recién construido, SIN pasarlo por la
  // cola — y la cola lo degradaba a ALTA con `bloquea: false`. Un control validado contra su propia
  // salida, la tercera vez de esta familia. Ahora el issue viaja por la cola y por el gate.
  const i = issue({ type: TIPO_ISSUE.EXCLUSION_CON_COMPUTO, severity: SEVERIDAD.BLOQUEANTE, entity: 'alcance:pintura', impact: 650_000 })
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [i] })
  assert.equal(cola.nBloqueantes, 1, 'la COLA tiene que verlo, no sólo el constructor del issue')
  assert.equal(cola.issues[0].bloquea, true)
  const g = gateDeCongelado({ cascada: CASCADA_OK, cola })
  assert.equal(g.ready, false, 'y el GATE tiene que frenar el congelado')
  assert.ok(g.blocking_issues.some((b) => b.tipo === TIPO_ISSUE.EXCLUSION_CON_COMPUTO))
})

test('...y la CONFIRMACIÓN HUMANA es su override: con firma deja pasar', () => {
  const i = issue({ type: TIPO_ISSUE.EXCLUSION_CON_COMPUTO, severity: SEVERIDAD.BLOQUEANTE, entity: 'alcance:pintura', impact: 650_000 })
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [i], overrides: [{ entidad: 'alcance:pintura', autorizadoPor: 'jorge' }] })
  assert.equal(cola.nBloqueantes, 0)
  assert.equal(cola.issues[0].asumidoPor, 'jorge')
  assert.equal(gateDeCongelado({ cascada: CASCADA_OK, cola }).ready, true)
})

test('el override NO tiene comodín: una firma no destraba los 89', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `overrideDe`, agregar `|| o.entidad === '*'`.
  //
  // El `'*'` existía en memoria y `cotizacion_override_precio` no puede expresarlo —su unique es
  // (cotizacion_id, recurso_codigo)—: una capacidad sin contraparte en la base y sin test.
  const a = issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: '4 (CAL)', impact: 100 })
  const b = issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, entity: '88 (ADHESIVO)', impact: 100 })
  const cola = colaDeAtencion({ costoConocido: 1_000_000, issues: [a, b], overrides: [{ entidad: '*', autorizadoPor: 'jorge' }] })
  assert.equal(cola.nBloqueantes, 2, 'el comodín no destraba nada')
  const porRecurso = colaDeAtencion({ costoConocido: 1_000_000, issues: [a, b], overrides: [{ entidad: '4', autorizadoPor: 'jorge' }] })
  assert.equal(porRecurso.nBloqueantes, 1, 'y el override por recurso destraba UNO')
})

test('etapaFreeze pasa el estado por el CAMINO REAL: no sella VALIDADO sobre HISTORICO', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `etapaFreeze`, volver a `congelar({... })` sin `estadoDeLoCongelado`.
  //
  // `congelar()` aceptaba el estado desde la vuelta anterior y `etapaFreeze` —el camino de
  // producción— no se lo pasaba: con un override firmado la versión volvía a sellarse VALIDADA
  // sobre datos HISTORICO. Era `cierra()`-sin-consumidores mudado un nivel.
  const cola = colaDeAtencion({ issues: [] })
  const conVencidos = etapaFreeze({
    cascada: CASCADA_OK, cola, huella: huellaDeEntradas(ENTRADAS), congeladoPor: 'jorge',
    costos: [{ partida: 'T1', estado: ESTADO.HISTORICO, vencidos: [{ recurso: 'MAT-CEM' }] }],
  })
  assert.equal(conVencidos.result.estado, ESTADO.CONFIRMADO)
  assert.notEqual(conVencidos.result.estado, ESTADO.VALIDADO)
  assert.ok(conVencidos.provenance.some((p) => p.includes('sello: CONFIRMADO')))
  const limpio = etapaFreeze({ cascada: CASCADA_OK, cola, huella: huellaDeEntradas(ENTRADAS), congeladoPor: 'jorge', costos: [{ partida: 'T1', estado: ESTADO.CALCULADO, vencidos: [] }] })
  assert.equal(limpio.result.estado, ESTADO.VALIDADO)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UN PRECIO DE INTERNET BLOQUEA IGUAL QUE UNO VENCIDO (R1 de la auditoría adversarial)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Este test existe porque la mutación de sacar `PRECIO_DE_INTERNET` de `BLOQUEAN_SALVO_OVERRIDE`
// quedó VERDE: el issue se emitía y nadie probaba que además FRENARA algo. Un issue que no bloquea
// es una nota al pie — y la nota al pie no impide congelar una oferta sobre un precio que salió de
// una página. La misma forma que este repo ya pagó: un control que no puede decir que no.

test('un PRECIO_DE_INTERNET material bloquea el congelado', () => {
  // MUTACIÓN CORRIDA: sacar TIPO_ISSUE.PRECIO_DE_INTERNET de BLOQUEAN_SALVO_OVERRIDE → rojo.
  const deLaWeb = issue({ type: TIPO_ISSUE.PRECIO_DE_INTERNET, entity: 'MAT-PANEL', impact: 8_200_000 })
  const b = bloquea(deLaWeb, { costoConocido: 180_000_000 })
  assert.equal(b.bloquea, true, 'un precio de una página web congeló una oferta sin que nadie lo asumiera')
  const cola = colaDeAtencion({ costoConocido: 180_000_000, issues: [deLaWeb] })
  assert.equal(cola.nBloqueantes, 1)
})

test('...y lo destraba la misma firma que destraba un precio vencido, no un flag', () => {
  const deLaWeb = issue({ type: TIPO_ISSUE.PRECIO_DE_INTERNET, entity: 'MAT-PANEL', impact: 8_200_000 })
  const sinQuien = bloquea(deLaWeb, { costoConocido: 180_000_000, overrides: [{ entidad: 'MAT-PANEL' }] })
  assert.equal(sinQuien.bloquea, true, 'un override sin quién lo autorizó no existe')
  const conQuien = bloquea(deLaWeb, {
    costoConocido: 180_000_000,
    overrides: [{ entidad: 'MAT-PANEL', autorizadoPor: 'jorge', motivo: 'lo verifiqué con el proveedor por teléfono' }],
  })
  assert.equal(conQuien.bloquea, false)
})
