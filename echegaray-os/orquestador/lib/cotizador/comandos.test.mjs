// LOS SIETE CASOS CANÓNICOS DEL §19, MÁS LOS CUATRO DEL OUTLIER (§20) Y EL UNDO (§21).
//
// Las frases se escriben como las escribe el dueño: sin acentos, con typos, con la unidad pegada.
// Un parser probado con español de manual acierta en el test y falla en la conversación.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ejecutar } from './comandos.mjs'
import { intencion, ROL, ESTADO } from './contrato.mjs'
import { evaluarCambio, dejaPasar, POSIBLE } from './outlier.mjs'
import { evento, registro, deshacer, historiaDe } from './eventos.mjs'
import { colaDeAtencion } from './atencion.mjs'
import { issue, TIPO_ISSUE } from './contrato.mjs'

const ESTADO_BASE = {
  costoConocido: 180_000_000,
  politica: { pctBeneficio: 0.22, pctGastosGenerales: 0.27 },
  partidas: [
    { codigo: 'T4010', descripcion: 'MAMPOSTERIA LADRILLON e=0,20', rubro: 'MAMPOSTERÍA', unidad: 'M2', cantidad: 480, costoUnitario: 62_000, subtotal: 29_760_000 },
    { codigo: 'T9000', descripcion: 'PINTURA LATEX INTERIOR', rubro: 'TERMINACIONES', unidad: 'M2', cantidad: 900, costoUnitario: 8_000, subtotal: 7_200_000 },
    { codigo: 'INST-SAN', descripcion: 'INSTALACION SANITARIA', rubro: 'INSTALACIONES', unidad: 'un', cantidad: 1, subtotal: null },
    { codigo: 'T1010', descripcion: 'COLUMNA DE CARGA H17', rubro: 'ESTRUCTURA', unidad: 'M3', cantidad: 47.2, costoUnitario: 400_000, subtotal: 18_880_000, evidencia: { archivo: 'Estructura.pdf', textoLiteral: 'C1 8u 0,40x0,20 H=3,50', valorDeclarado: 47.2 }, genealogia: ['plano → C1 → 0,40 × 0,20 × 3,50 × 8 = 2,24 m³'] },
  ],
}
const mutarNoOp = ({ estado }) => estado

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CASO 1 · «la mamposteria son 520 m2»
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('CASO 1 · «la mamposteria son 520 m2» actualiza la cantidad', () => {
  const r = ejecutar({
    intent: intencion({ action: 'update_quantity', target: 'mamposteria', value: '520 m2', textoOriginal: 'la mamposteria son 520 m2' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, true)
  assert.equal(r.eventos[0].campo, 'cantidad')
  assert.equal(r.eventos[0].antes, 480)
  assert.equal(r.eventos[0].despues, 520)
})

test('CASO 1b · 520 → 5200 NO se aplica solo: es 10× y mueve $292 M', () => {
  // El primero de los cuatro casos que el §20 pide probar.
  const r = ejecutar({
    intent: intencion({ action: 'update_quantity', target: 'mamposteria', value: '5200 m2' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, false)
  assert.equal(r.etapaQueParo, 'OUTLIER')
  assert.equal(r.veredicto, 'RESOLVER')
  assert.match(r.pregunta, /¿Lo aplico igual\?/)
})

test('CASO 1c · 480 → 525 se aplica sin molestar: es 1,09× y mueve $2,8 M', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `evaluarCambio`, `const material = true`.
  const r = ejecutar({
    intent: intencion({ action: 'update_quantity', target: 'mamposteria', value: '525 m2' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, true)
  assert.equal(r.veredicto, 'APLICAR')
})

test('CASO 1d · «520 m3» sobre una partida en m² se RECHAZA — no se pregunta, se corrige', () => {
  const r = ejecutar({
    intent: intencion({ action: 'update_quantity', target: 'mamposteria', value: 520, unit: 'm3' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, false)
  assert.equal(r.etapaQueParo, 'VALIDACION')
  assert.match(r.porQue, /sin significado/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CASO 2 · «saca pintura»
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('CASO 2 · «saca pintura» excluye del alcance y mueve $7,2 M, así que pregunta', () => {
  const r = ejecutar({
    intent: intencion({ action: 'exclude_scope', target: 'pintura', textoOriginal: 'saca pintura' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.veredicto, 'RESOLVER', '$7,2 M sobre $180 M es 4 %: material')
  const confirmado = ejecutar({
    intent: intencion({ action: 'exclude_scope', target: 'pintura' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp, confirmado: true,
  })
  assert.equal(confirmado.ok, true)
  assert.equal(confirmado.eventos[0].campo, 'alcance')
})

test('«saca el helipuerto» no toca ninguna partida y lo dice, en vez de fingir que hizo algo', () => {
  const r = ejecutar({
    intent: intencion({ action: 'exclude_scope', target: 'helipuerto' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, false)
  assert.match(r.porQue, /no toca ninguna partida/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CASOS 3 y 4 · «sanitaria 8,5M» vs «la sanitaria la hace X por 8,5M»
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('CASO 3 · «sanitaria 8,5M» NO se asume subcontrato: pregunta quién', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `validar`, sacar la guarda `if (!intent.supplier)`.
  //
  // Asumirlo subcontratado inventa una decisión comercial —a quién se le compra— que nadie tomó.
  const r = ejecutar({
    intent: intencion({ action: 'set_subcontract', target: 'sanitaria', value: '8,5M', textoOriginal: 'sanitaria 8,5M' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, false)
  assert.equal(r.etapaQueParo, 'VALIDACION')
  assert.match(r.porQue, /no dice QUIÉN lo hace/)
  assert.match(r.pregunta, /¿Quién\?/)
})

test('CASO 4 · «la sanitaria la hace Gasparini por 8,5M» sí es un subcontrato', () => {
  const r = ejecutar({
    intent: intencion({ action: 'set_subcontract', target: 'sanitaria', value: '8,5M', textoOriginal: 'la sanitaria la hace gasparini por 8,5M' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp, confirmado: true,
  })
  // El `supplier` lo pone el intérprete; acá se prueba que sin él no pasa y con él sí.
  assert.equal(r.ok, false)
  const conProveedor = ejecutar({
    intent: { ...intencion({ action: 'set_subcontract', target: 'sanitaria', value: '8,5M' }), supplier: 'Gasparini' },
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp, confirmado: true,
  })
  assert.equal(conProveedor.ok, true)
  assert.equal(conProveedor.eventos[0].despues, 8_500_000, '«8,5M» en contexto monetario son ocho millones y medio')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CASO 5 · «beneficio 19 %» — y el RBAC adversarial
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('CASO 5 · «beneficio 19» se lee como 0,19, no como 1.900 %', () => {
  const r = ejecutar({
    intent: intencion({ action: 'commercial_override', target: 'pctBeneficio', value: 19, textoOriginal: 'poneme beneficio 19' }),
    rol: ROL.DUENO, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp, confirmado: true,
  })
  assert.equal(r.ok, true)
  assert.equal(r.eventos[0].despues, 0.19)
  assert.equal(r.eventos[0].antes, 0.22)
})

test('el jefe de obra pidiendo «beneficio 19» para en AUTORIZACIÓN, no en validación', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ejecutar`, mover el bloque de autorización DESPUÉS del de
  // validación. El mensaje pasaría a decir que pctBeneficio existe y qué forma tiene.
  const r = ejecutar({
    intent: intencion({ action: 'commercial_override', target: 'pctBeneficio', value: 19 }),
    rol: ROL.JEFE_DE_OBRA, actor: 'pedro', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, false)
  assert.equal(r.etapaQueParo, 'AUTORIZACION')
  assert.doesNotMatch(r.porQue, /19|0,22|beneficio/i, 'el error no puede filtrar ni el valor ni el campo')
})

test('sin permiso, el error NO revela el vocabulario comercial aunque la intención sea inválida', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ejecutar`, mover el bloque de autorización DESPUÉS del de
  // validación.
  //
  // Con un target VÁLIDO las dos ordenaciones dan el mismo mensaje, así que ese caso no prueba
  // nada. Con un target INVÁLIDO se ven distinto: validar primero contesta «pctSuerte no es un
  // parámetro de la política comercial» —que le enseña al jefe de obra que existe una política
  // comercial, cómo se llaman sus campos y que el sistema los conoce— y autorizar primero contesta
  // que no tiene permiso. §40: no ve lo comercial NI POR UN ERROR.
  const r = ejecutar({
    intent: intencion({ action: 'commercial_override', target: 'pctSuerte', value: 19 }),
    rol: ROL.JEFE_DE_OBRA, actor: 'pedro', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.etapaQueParo, 'AUTORIZACION')
  assert.doesNotMatch(r.porQue, /política comercial|parámetro/i)

  // Y lo mismo por la vía del coeficiente: el rechazo del coeficiente ENUMERA los ocho parámetros.
  const coef = ejecutar({
    intent: intencion({ action: 'commercial_override', target: 'coeficiente', value: 2 }),
    rol: ROL.JEFE_DE_OBRA, actor: 'pedro', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(coef.etapaQueParo, 'AUTORIZACION')
  assert.equal(coef.pregunta, null, 'y no le ofrece la lista de qué sí puede mover')
})

test('nadie escribe el coeficiente, y el rechazo dice qué sí se puede mover', () => {
  const r = ejecutar({
    intent: intencion({ action: 'commercial_override', target: 'coeficiente', value: 2 }),
    rol: ROL.DUENO, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(r.ok, false)
  assert.match(r.porQue, /DERIVADO/)
  assert.match(r.pregunta, /pctBeneficio/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CASOS 6 y 7 · las consultas
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('CASO 6 · «¿de donde salen 47,2 m3?» devuelve la genealogía y NO muta', () => {
  const r = ejecutar({
    intent: intencion({ action: 'evidence_query', target: 'columna' }),
    rol: ROL.JEFE_DE_OBRA, actor: 'pedro', estado: ESTADO_BASE,
  })
  assert.equal(r.ok, true)
  assert.equal(r.eventos.length, 0, 'una consulta no genera evento porque no cambió nada')
  assert.match(r.resultado.genealogia[0], /0,40 × 0,20 × 3,50 × 8/)
})

test('CASO 7 · «¿que me falta para enviar?» devuelve los bloqueantes con su acción', () => {
  const cola = colaDeAtencion({
    costoConocido: 180_000_000,
    issues: [issue({ type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, entity: 'INST-SAN', impact: 8_500_000, recommended_action: 'set_subcontract', detalle: 'la sanitaria no cotizó' })],
  })
  const r = ejecutar({
    intent: intencion({ action: 'blockers_query' }),
    rol: ROL.JEFE_DE_OBRA, actor: 'pedro', estado: { ...ESTADO_BASE, cola },
  })
  assert.equal(r.ok, true)
  assert.equal(r.resultado.faltan[0].accion, 'set_subcontract')
})

test('el jefe de obra NO puede consultar lo comercial ni por la vía de la consulta', () => {
  const r = ejecutar({
    intent: intencion({ action: 'commercial_query', target: 'mamposteria' }),
    rol: ROL.JEFE_DE_OBRA, actor: 'pedro', estado: ESTADO_BASE,
  })
  assert.equal(r.ok, false)
  assert.equal(r.etapaQueParo, 'AUTORIZACION')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL OUTLIER, DIRECTO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el 10× no alcanza: un precio que sube 1,44× y mueve $64 M también se resuelve', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `evaluarCambio`, sacar la señal IMPACTO y decidir sólo por salto.
  const r = evaluarCambio({
    campo: 'precio', entidad: 'MAT-HORM', valorAnterior: 180_000, valorNuevo: 260_000,
    unidad: 'ARS', impacto: 64_000_000, costoConocido: 180_000_000,
  })
  assert.equal(r.veredicto, 'RESOLVER')
  assert.ok(r.senales.some((s) => s.senal === 'IMPACTO'))
  assert.equal(r.senales.some((s) => s.senal === 'RELATIVA'), false, 'y NO por el salto: 1,44× no llega a 3×')
})

test('un valor físicamente imposible se RECHAZA: no es raro, es un error', () => {
  const r = evaluarCambio({ campo: 'espesor', entidad: 'PLATEA', valorAnterior: 0.2, valorNuevo: 8_000, unidad: 'm' })
  assert.equal(r.veredicto, 'RECHAZAR')
  assert.equal(r.estado, ESTADO.ERROR)
  assert.match(r.porQue, /físicamente posible/)
  assert.ok(POSIBLE.LONGITUD.max < 8_000)
})

test('un valor que CONTRADICE el plano no se pregunta: se muestra la cita', () => {
  const r = evaluarCambio({
    campo: 'cantidad', entidad: 'T1010', valorAnterior: 47.2, valorNuevo: 60, unidad: 'm3',
    evidencia: { archivo: 'Estructura.pdf', textoLiteral: 'C1 8u 0,40x0,20 H=3,50', valorDeclarado: 47.2 },
  })
  assert.equal(r.veredicto, 'RESOLVER')
  assert.equal(r.estado, ESTADO.CONFLICTO)
  assert.match(r.porQue, /corresponde mostrarle la cita/)
})

test('un salto grande que mueve poca plata se aplica con aviso y se puede deshacer', () => {
  // 2 → 20 matafuegos es 10× y saltaría con la regla vieja. Mueve $720.000 sobre $180 M (0,4 %):
  // preguntar por esto entrena a la gente a apretar «sí» sin leer, que es peor que no preguntar.
  const r = evaluarCambio({ campo: 'cantidad', entidad: 'MATAFUEGO', valorAnterior: 2, valorNuevo: 20, unidad: 'un', impacto: 720_000, costoConocido: 180_000_000 })
  assert.equal(r.veredicto, 'APLICAR_CON_AVISO')
  assert.equal(dejaPasar(r.veredicto), true)
  assert.match(r.porQue, /pero mueve poca plata/)
  // El mismo cambio sobre una obra chica SÍ es material y se resuelve.
  const enObraChica = evaluarCambio({ campo: 'cantidad', entidad: 'MATAFUEGO', valorAnterior: 2, valorNuevo: 20, unidad: 'un', impacto: 720_000, costoConocido: 8_000_000 })
  assert.equal(enObraChica.veredicto, 'RESOLVER')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EVENTOS Y UNDO (§21)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('deshacer NO borra: agrega el evento inverso y lo referencia', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `deshacer`, devolver el registro filtrado en vez de los inversos.
  const e = evento({ accion: 'update_quantity', entidad: 'T4010', campo: 'cantidad', antes: 480, despues: 5200, actor: 'jorge' })
  let reg = registro([e])
  const u = deshacer(reg, e.correlationId, { actor: 'jorge', motivo: 'me equivoqué de cero' })
  reg = reg.agregar(u.eventos)
  assert.equal(reg.largo, 2, 'la historia crece: no se trunca')
  assert.equal(reg.ultimoDe('T4010', 'cantidad'), 480, 'y el estado se puede reconstruir desde la historia')
  assert.equal(u.eventos[0].revierteA, e.id)
})

test('deshacer dos veces el mismo pedido NO lo reaplica', () => {
  const e = evento({ accion: 'update_quantity', entidad: 'T4010', campo: 'cantidad', antes: 480, despues: 5200, actor: 'jorge' })
  let reg = registro([e])
  reg = reg.agregar(deshacer(reg, e.correlationId, { actor: 'jorge' }).eventos)
  const segundo = deshacer(reg, e.correlationId, { actor: 'jorge' })
  assert.equal(segundo.ok, false)
  assert.match(segundo.porQue, /ya se deshizo/)
  assert.equal(reg.ultimoDe('T4010', 'cantidad'), 480)
})

test('un pedido con VARIAS mutaciones se deshace entero, no medio', () => {
  const cid = 'pedido-saca-pintura'
  const reg = registro([
    evento({ accion: 'exclude_scope', entidad: 'T9000', campo: 'alcance', antes: 'INCLUIDO', despues: 'EXCLUIDO', actor: 'jorge', correlationId: cid }),
    evento({ accion: 'update_quantity', entidad: 'T9000', campo: 'cantidad', antes: 900, despues: 0, actor: 'jorge', correlationId: cid }),
  ])
  const u = deshacer(reg, cid, { actor: 'jorge' })
  assert.equal(u.revierte, 2)
  const final = reg.agregar(u.eventos)
  assert.equal(final.ultimoDe('T9000', 'alcance'), 'INCLUIDO')
  assert.equal(final.ultimoDe('T9000', 'cantidad'), 900)
})

test('un evento sin actor, sin entidad o con una acción inventada no se construye', () => {
  assert.throws(() => evento({ accion: 'update_quantity', entidad: 'X' }), /sin actor/)
  assert.throws(() => evento({ accion: 'update_quantity', actor: 'j' }), /sin entidad/)
  assert.throws(() => evento({ accion: 'borrar', entidad: 'X', actor: 'j' }), /lista cerrada/)
})

test('la historia se lee en castellano y en orden', () => {
  const cid = 'c1'
  const reg = registro([
    evento({ accion: 'update_quantity', entidad: 'T4010', campo: 'cantidad', antes: 480, despues: 520, actor: 'jorge', motivo: 'la mamposteria son 520 m2', correlationId: cid, cuando: '2026-08-29T10:00:00Z' }),
  ])
  const h = historiaDe(reg, 'T4010')
  assert.match(h[0], /jorge · update_quantity \(cantidad\): 480 → 520 — la mamposteria son 520 m2/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA ENTIDAD DEL EVENTO ES LA PARTIDA, NO EL TEXTO (costura del FRONT, contrato 1.1.0)
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('«la mamposteria» y «T4010» dejan LA MISMA entidad en el historial', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `ejecutar`, volver a `entidad: String(intent.target)`.
  //
  // Tres formas de nombrar la misma partida dejaban tres entidades distintas, y con eso
  // `historiaDe()` no puede reconstruir su estado y el undo del §21 no puede agrupar lo que fue un
  // solo pedido. El frente lo dejó anotado como límite del core con un test-candado en su rama.
  const porTexto = ejecutar({
    intent: intencion({ action: 'update_quantity', target: 'la mamposteria', value: '525 m2' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  const porCodigo = ejecutar({
    intent: intencion({ action: 'update_quantity', target: 'T4010', value: '525 m2' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp,
  })
  assert.equal(porTexto.ok, true)
  assert.equal(porTexto.eventos[0].entidad, 'T4010')
  assert.equal(porTexto.eventos[0].entidad, porCodigo.eventos[0].entidad)
})

test('una exclusión que toca VARIAS partidas deja una entidad estable', () => {
  const a = ejecutar({
    intent: intencion({ action: 'exclude_scope', target: 'pintura' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp, confirmado: true,
  })
  assert.equal(a.eventos[0].entidad, 'T9000')
  // Y con dos partidas alcanzadas, la clave se ordena: dos pedidos equivalentes dan la misma.
  const estado = { ...ESTADO_BASE, partidas: [...ESTADO_BASE.partidas, { codigo: 'T9001', descripcion: 'PINTURA EXTERIOR', unidad: 'M2', cantidad: 100, subtotal: 500_000 }] }
  const b = ejecutar({
    intent: intencion({ action: 'exclude_scope', target: 'pintura' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado, mutar: mutarNoOp, confirmado: true,
  })
  assert.equal(b.eventos[0].entidad, 'T9000+T9001')
  // Y con las partidas cargadas al revés da LA MISMA clave: si dependiera del orden del array, dos
  // pedidos idénticos sobre el mismo presupuesto dejarían dos entidades y el undo no los agruparía.
  const alReves = ejecutar({
    intent: intencion({ action: 'exclude_scope', target: 'pintura' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge',
    estado: { ...estado, partidas: [...estado.partidas].reverse() },
    mutar: mutarNoOp, confirmado: true,
  })
  assert.equal(alReves.eventos[0].entidad, b.eventos[0].entidad)
})

test('un override comercial identifica el PARÁMETRO, no cómo lo escribieron', () => {
  const r = ejecutar({
    intent: intencion({ action: 'commercial_override', target: 'pctBeneficio', value: 19 }),
    rol: ROL.DUENO, actor: 'jorge', estado: ESTADO_BASE, mutar: mutarNoOp, confirmado: true,
  })
  assert.equal(r.eventos[0].entidad, 'pctBeneficio')
})

test('COSTURA OFICIAL · ejecutar() es SÍNCRONA y no escribe: devuelve lo que `mutar` planificó', () => {
  // Es lo que mantiene la RLS honesta: el plan lo aplica el caller con SU credencial. Si el motor
  // escribiera, lo haría con la conexión del servidor —rol del pool, RLS no aplicada— y los seis
  // permisos volverían a vivir sólo en JavaScript.
  const plan = []
  const r = ejecutar({
    intent: intencion({ action: 'update_quantity', target: 'T4010', value: '525 m2' }),
    rol: ROL.ADMINISTRACION, actor: 'jorge', estado: ESTADO_BASE,
    mutar: ({ validado }) => { plan.push({ tabla: 'cotizacion_partida', id: validado.partida.codigo, cantidad: validado.valor }); return { plan } },
  })
  assert.equal(typeof r.then, 'undefined', 'no devuelve una promesa: es síncrona')
  assert.deepEqual(plan, [{ tabla: 'cotizacion_partida', id: 'T4010', cantidad: 525 }])
  assert.equal(r.resultado.plan, plan)
})
