// EL VOCABULARIO TIENE QUE PODER DECIR QUE NO.
//
// Un contrato de nombres no se prueba comprobando que los nombres existen —eso lo dice el import—.
// Se prueba comprobando que las funciones derivadas RECHAZAN lo que tienen que rechazar: que un
// ausente no se sume, que un status OK con bloqueantes no exista, que el jefe de obra no pueda
// consultar lo comercial. Cada test de acá tiene su mutación anotada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADO, AUSENCIAS, esAusencia, sumable, cierra, NO_CIERRAN,
  ETAPA, ORDEN_ETAPAS, STATUS, resultadoEtapa,
  TIPO_ISSUE, SEVERIDAD, issue, ordenarCola,
  PERMISO, ROL, PERMISOS_DE_ROL, veComercial, ACCION, autorizar, intencion,
  INVARIANTES, VERSION_CONTRATO,
} from './contrato.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ESTADOS
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('son ONCE estados y ni uno más — agregar uno sin decidirlo rompe el contrato de las 3 caras', () => {
  assert.equal(Object.keys(ESTADO).length, 11)
})

test('NULL ≠ 0 · ERROR ≠ 0 · UNKNOWN ≠ 0 — un ausente NO es sumable aunque traiga un número', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `sumable`, sacar `!esAusencia(estado)`.
  assert.equal(sumable({ valor: null, estado: ESTADO.CALCULADO }), false)
  assert.equal(sumable({ valor: 0, estado: ESTADO.FALTA_DATO }), false)
  assert.equal(sumable({ valor: 5_000_000, estado: ESTADO.ERROR }), false, 'un valor con estado ERROR no entra a ninguna suma por más que sea finito')
  assert.equal(sumable({ valor: 191.92, estado: ESTADO.AMBIGUO }), false)
  assert.equal(sumable({ valor: 191.92, estado: ESTADO.CONFLICTO }), false)
  // y el cero MEDIDO sí se suma: es un dato, no un hueco
  assert.equal(sumable({ valor: 0, estado: ESTADO.CALCULADO }), true)
})

test('SIN_PRECIO ≠ 0 — la suma de una partida sin precio NO da el resto: no da nada', () => {
  // Es el defecto medido en `cotizacion_cascada`: `coalesce(sum(subtotal),0)` ignora los NULL y el
  // presupuesto se publica completo. Acá el ausente envenena el total.
  const partidas = [
    { valor: 30_000_000, estado: ESTADO.CALCULADO },
    { valor: null, estado: ESTADO.FALTA_DATO },   // subcontrato sin cotizar
  ]
  const total = partidas.every(sumable) ? partidas.reduce((a, p) => a + p.valor, 0) : null
  assert.equal(total, null, 'con un componente ausente el total NO se afirma')
  assert.notEqual(total, 30_000_000, 'y sobre todo NO da la suma de los que sí tenían precio')
})

test('HISTORICO ≠ VALIDADO — lo histórico NO cierra un presupuesto', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar ESTADO.HISTORICO de NO_CIERRAN.
  assert.equal(cierra(ESTADO.HISTORICO), false)
  assert.equal(cierra(ESTADO.VALIDADO), true)
  assert.ok(NO_CIERRAN.includes(ESTADO.PROPUESTO), 'y una propuesta que nadie aceptó tampoco cierra')
})

test('esAusencia son exactamente cuatro, y NO_APLICA no es una de ellas', () => {
  assert.deepEqual([...AUSENCIAS].sort(), ['AMBIGUO', 'CONFLICTO', 'ERROR', 'FALTA_DATO'])
  assert.equal(esAusencia(ESTADO.NO_APLICA), false, 'NO_APLICA es una respuesta, no un hueco')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ETAPAS
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('las once etapas van en el orden del programa', () => {
  assert.equal(ORDEN_ETAPAS.length, 11)
  assert.equal(ORDEN_ETAPAS[0], ETAPA.INGEST)
  assert.equal(ORDEN_ETAPAS.at(-1), ETAPA.OUTPUT)
  assert.ok(ORDEN_ETAPAS.indexOf(ETAPA.COMPOSE) < ORDEN_ETAPAS.indexOf(ETAPA.COST), 'no se puede costear lo que todavía no se compuso')
})

test('una etapa devuelve las NUEVE llaves aunque estén vacías', () => {
  const r = resultadoEtapa({ etapa: ETAPA.TAKEOFF })
  for (const k of ['etapa', 'status', 'result', 'evidence', 'provenance', 'confidence', 'missing_data', 'conflicts', 'blocking_issues', 'next_actions']) {
    assert.ok(k in r, `falta ${k}: quien la consume tendría que adivinar si no encontró nada o no buscó`)
  }
})

test('una etapa con blocking_issues NO puede declararse OK', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `resultadoEtapa`, devolver `status` en vez de `real`.
  const r = resultadoEtapa({
    etapa: ETAPA.COST, status: STATUS.OK,
    blocking_issues: [issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, severity: SEVERIDAD.BLOQUEANTE, entity: 'INST-SANITARIA' })],
  })
  assert.equal(r.status, STATUS.BLOQUEADA)
})

test('el resultado de una etapa es INMUTABLE — un consumidor no puede reescribir la evidencia', () => {
  const r = resultadoEtapa({ etapa: ETAPA.MAP, evidence: [{ a: 1 }] })
  assert.throws(() => { r.status = STATUS.OK }, TypeError)
  assert.throws(() => { r.evidence.push({ b: 2 }) }, TypeError)
})

test('una etapa que no existe no se construye', () => {
  assert.throws(() => resultadoEtapa({ etapa: 'PRECIO' }), /etapa desconocida/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// COLA DE ATENCIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un issue sin entidad no se construye: no habría qué mirar', () => {
  assert.throws(() => issue({ type: TIPO_ISSUE.FALTA_DATO, entity: null }), /sin entidad/)
})

test('impact desconocido es null, NUNCA cero — y no se va al fondo de la cola', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `issue`, `impact: Number(impact ?? 0)`.
  const i = issue({ type: TIPO_ISSUE.FALTA_DATO, entity: 'PLATEA' })
  assert.equal(i.impact, null)
  const cola = ordenarCola([
    issue({ type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.ALTA, entity: 'sin-medir' }),
    issue({ type: TIPO_ISSUE.SIN_PRECIO, severity: SEVERIDAD.BAJA, entity: 'clavo', impact: 900 }),
    issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, severity: SEVERIDAD.BLOQUEANTE, entity: 'sanitaria', impact: 8_500_000 }),
  ])
  assert.equal(cola[0].entity, 'sanitaria', 'primero lo que bloquea')
  assert.equal(cola[1].entity, 'sin-medir', 'después lo alto, aunque no se sepa cuánto cuesta')
  assert.equal(cola[2].entity, 'clavo')
})

test('la cola se ordena IGUAL en dos corridas — el desempate es total', () => {
  const armar = () => [
    issue({ type: TIPO_ISSUE.SIN_PRECIO, severity: SEVERIDAD.ALTA, entity: 'b', impact: 100 }),
    issue({ type: TIPO_ISSUE.SIN_PRECIO, severity: SEVERIDAD.ALTA, entity: 'a', impact: 100 }),
    issue({ type: TIPO_ISSUE.AMBIGUO, severity: SEVERIDAD.ALTA, entity: 'c', impact: 100 }),
  ]
  const uno = ordenarCola(armar()).map((i) => i.entity)
  const dos = ordenarCola(armar().reverse()).map((i) => i.entity)
  assert.deepEqual(uno, dos)
  assert.deepEqual(uno, ['c', 'a', 'b'])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// RBAC — los adversariales del §40
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el jefe de obra NO puede tocar lo comercial', () => {
  const r = autorizar({ rol: ROL.JEFE_DE_OBRA, action: 'commercial_override' })
  assert.equal(r.ok, false)
  assert.equal(r.permisoFaltante, PERMISO.COMMERCIAL_WRITE)
})

test('el jefe de obra NO puede CONSULTAR lo comercial — una consulta también es un canal', () => {
  // MUTACIÓN QUE LO PONE ROJO: poner `permiso: PERMISO.READ` en `commercial_query`.
  // Es la trampa que este repo ya pagó al revés («no repetir la capability read que escribía»).
  assert.equal(ACCION.commercial_query.muta, false)
  assert.equal(autorizar({ rol: ROL.JEFE_DE_OBRA, action: 'commercial_query' }).ok, false)
  assert.equal(autorizar({ rol: ROL.LECTOR, action: 'commercial_query' }).ok, false)
  assert.equal(autorizar({ rol: ROL.DUENO, action: 'commercial_query' }).ok, true)
})

test('el motivo del rechazo NO nombra el valor que se quería escribir', () => {
  const r = autorizar({ rol: ROL.JEFE_DE_OBRA, action: 'commercial_override' })
  assert.doesNotMatch(r.motivo, /\d/, 'un mensaje de error es un canal de lectura: no puede filtrar cifras')
})

test('ni el dueño puede saltearse una acción que no existe', () => {
  assert.equal(autorizar({ rol: ROL.DUENO, action: 'borrar_todo' }).ok, false)
  assert.equal(autorizar({ rol: 'GERENTE_GENERAL', action: 'freeze' }).ok, false, 'un rol inventado no hereda nada')
})

test('SÓLO administración y el dueño congelan; SÓLO el dueño cambia la política GLOBAL', () => {
  assert.equal(autorizar({ rol: ROL.ADMINISTRACION, action: 'freeze' }).ok, true)
  assert.equal(autorizar({ rol: ROL.JEFE_DE_OBRA, action: 'freeze' }).ok, false)
  assert.equal(autorizar({ rol: ROL.ADMINISTRACION, action: 'set_global_policy' }).ok, false,
    'una conversación NO cambia la política global de la empresa (§17)')
  assert.equal(autorizar({ rol: ROL.DUENO, action: 'set_global_policy' }).ok, true)
})

test('veComercial se DERIVA de COMMERCIAL_WRITE y no de una lista suelta', () => {
  for (const rol of Object.keys(PERMISOS_DE_ROL)) {
    assert.equal(veComercial(rol), PERMISOS_DE_ROL[rol].includes(PERMISO.COMMERCIAL_WRITE), rol)
  }
  assert.equal(veComercial(ROL.JEFE_DE_OBRA), false)
})

test('el LECTOR no escribe NADA', () => {
  const mutantes = Object.entries(ACCION).filter(([, d]) => d.muta).map(([a]) => a)
  for (const a of mutantes) assert.equal(autorizar({ rol: ROL.LECTOR, action: a }).ok, false, a)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL ENCHUFE DEL LLM
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el modelo no puede proponer una acción fuera de la lista cerrada', () => {
  assert.throws(() => intencion({ action: 'DROP TABLE cotizaciones' }), /acción que no existe/)
  assert.throws(() => intencion({ action: 'set_precio_venta', value: 1 }), /acción que no existe/)
})

test('una intención NO es una mutación: no trae estado de negocio', () => {
  const i = intencion({ action: 'update_quantity', target: 'MAMPOSTERIA', value: 520, unit: 'm2', textoOriginal: 'la mamposteria son 520 m2' })
  assert.deepEqual(Object.keys(i).sort(), ['action', 'propuestaEn', 'target', 'textoOriginal', 'unit', 'value'])
  assert.throws(() => { i.value = 5200 }, TypeError, 'y es inmutable: nadie la reescribe camino a la validación')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTES
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('las TRECE invariantes del §42 están todas y cada una dice por qué', () => {
  assert.equal(INVARIANTES.length, 13)
  for (const inv of INVARIANTES) assert.ok(inv.porQue.length > 20, `${inv.id} sin motivo escrito`)
})

test('el contrato declara su versión', () => {
  assert.match(VERSION_CONTRATO, /^\d+\.\d+\.\d+$/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS COSTURAS DE LA 1.1.0
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('1.1.0 · la intención propaga los campos que la ACCIÓN declara', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `intencion`, volver al `return` sin `...sumar`.
  //
  // La 1.0.0 los descartaba, y con eso el canónico «la sanitaria la hace X por 8,5M» NO se podía
  // expresar con el constructor oficial: sin `supplier`, la validación lo trata como «sanitaria
  // 8,5M» y pregunta quién. El frente tuvo que escribir un constructor paralelo.
  const i = intencion({ action: 'set_subcontract', target: 'sanitaria', value: '8,5M', supplier: 'Gasparini', currency: 'ARS' })
  assert.equal(i.supplier, 'Gasparini')
  assert.equal(i.currency, 'ARS')
  const x = intencion({ action: 'exclude_scope', target: 'pintura', reason: 'el pliego la excluye' })
  assert.equal(x.reason, 'el pliego la excluye')
})

test('1.1.0 · un campo que la acción NO declara sigue sin entrar', () => {
  // El modelo no puede colar datos que ninguna validación mira.
  const i = intencion({ action: 'update_quantity', target: 'mamposteria', value: 520, unit: 'm2', supplier: 'colado', precio: 1 })
  assert.equal('supplier' in i, false, 'update_quantity no declara supplier')
  assert.equal('precio' in i, false)
  assert.deepEqual(Object.keys(i).sort(), ['action', 'propuestaEn', 'target', 'textoOriginal', 'unit', 'value'])
})

test('1.1.0 · la versión subió, y subió la minor: es aditivo', () => {
  assert.equal(VERSION_CONTRATO, '1.1.0')
})
