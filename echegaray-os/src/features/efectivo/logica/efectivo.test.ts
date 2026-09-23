import test from 'node:test'
import assert from 'node:assert/strict'
import type { Comprobante, Entrega, Rendicion } from '../types.ts'
import {
  actividadDe, conteosDeCampanita, diasDeEntrega, diasEntre, entregasCsv, estadoDeEntrega, filasDeLaFicha, filtroDeLista, ordenarLista, pesos, quienTieneEfectivo, ROTULO_COMPROBANTE, queFalta, resumir,
  sinRendirDe, totalLeido,
} from './entregas.ts'
import {
  efectoDevolucion, faltaMigracion, frasesAlEntregar, mensajeDeError, validarDevolucion, validarEntrega, verboEntregar,
} from './formularios.ts'

// EFECTIVO A RENDIR — la lógica de presentación. Los casos salen del diseño (ER-0147 de Rubén Sosa,
// ER-0141 de Diego Funes) y de las decisiones del dueño del 22/09: sin plazo, sin tope, sin bloqueo.

const entrega = (x: Partial<Entrega> = {}): Entrega => ({
  id: 'e1', codigo: 'ER-0147', persona_id: 'p-sosa', persona: 'Rubén Sosa', obra_id: 'OB-8', obra: 'Galpón 8',
  estructura: false, fecha: '2026-09-16', entregado: 1_200_000, rendido: 840_300, filas_rendidas: 11, devuelto: 0,
  en_su_poder: 359_700, conformidad: true, estado: 'abierta', para_que: null, conformidad_en: '2026-09-16T12:12:00Z',
  cerrada_en: null, anulada_en: null, anulada_motivo: null, es_prueba: false, ...x,
})

const comp = (estado: Comprobante['estado'], x: Partial<Comprobante> = {}): Comprobante => ({
  id: `c-${Math.random()}`, entrega_id: 'e1', entrega: 'ER-0147', persona_id: 'p-sosa', canal: 'app',
  enviado_en: '2026-09-22T19:40:00Z', storage_path: 'u/rendicion/a.jpg', nombre_archivo: 'a.jpg', media_type: 'image/jpeg',
  estado_cola: 'cargado', motivo: null, resultado: null, compra_clave: null, monto_rendido: null, observacion: null,
  observado_en: null, respuesta: null, respondido_en: null, descartado_en: null, descartado_motivo: null, estado, ...x,
})

// ═══ ESTADOS DERIVADOS ═══

test('una entrega abierta con saldo y sin observados está «Rindiendo»', () => {
  assert.deepEqual(estadoDeEntrega(entrega(), [comp('en_compras')]), { texto: 'Rindiendo', tono: 'neutro' })
})

test('en su poder = 0 con todo en Compras es «Lista para cerrar»; con un ticket leyéndose, no', () => {
  const cero = entrega({ en_su_poder: 0, rendido: 1_200_000 })
  assert.equal(estadoDeEntrega(cero, [comp('en_compras')]).texto, 'Lista para cerrar')
  assert.equal(estadoDeEntrega(cero, [comp('leyendo')]).texto, 'Rindiendo')
})

test('los observados mandan sobre la cuenta, y se cuentan en singular y plural', () => {
  assert.deepEqual(estadoDeEntrega(entrega(), [comp('observado')]), { texto: '1 observado', tono: 'warn' })
  assert.equal(estadoDeEntrega(entrega(), [comp('observado'), comp('duplicado')]).texto, '2 observados')
})

test('«respondido» es pendiente pero ya no es observado: no se le vuelve a pedir el dato', () => {
  assert.equal(estadoDeEntrega(entrega(), [comp('respondido')]).texto, 'Rindiendo')
  assert.equal(estadoDeEntrega(entrega({ en_su_poder: 0 }), [comp('respondido')]).texto, 'Rindiendo', 'todavía espera la carga')
  assert.equal(resumir([entrega()], [comp('respondido')], [], '2026-09-22').porImputar, 1)
  assert.equal(ROTULO_COMPROBANTE.respondido.texto, 'Contestó · falta cargar')
})

test('NO existe «Vencida»: una entrega de 90 días sin rendir sigue «Rindiendo» (dueño, 22/09)', () => {
  const vieja = entrega({ fecha: '2026-06-01', rendido: 0, filas_rendidas: 0, en_su_poder: 1_200_000 })
  const e = estadoDeEntrega(vieja, [])
  assert.equal(e.texto, 'Rindiendo')
  assert.notEqual(e.tono, 'neg')
  assert.equal(diasDeEntrega(vieja, '2026-09-22'), 113)
})

test('cerrada y anulada ya no se mueven: dicen su fecha y van apagadas', () => {
  assert.deepEqual(estadoDeEntrega(entrega({ estado: 'cerrada', cerrada_en: '2026-09-12T15:00:00Z' }), [comp('observado')]),
    { texto: 'Cerrada 12/09', tono: 'apagado' })
  assert.equal(estadoDeEntrega(entrega({ estado: 'anulada', anulada_en: '2026-09-12T15:00:00Z' }), []).texto, 'Anulada')
})

test('si rindió más de lo entregado, se dice cuánto (la cuenta negativa no se esconde)', () => {
  assert.deepEqual(estadoDeEntrega(entrega({ en_su_poder: -12_500 }), []), { texto: 'Rindió $ 12.500 de más', tono: 'warn' })
})

test('los días cuentan hasta hoy si está abierta y hasta el cierre si se cerró', () => {
  assert.equal(diasDeEntrega(entrega(), '2026-09-22'), 6)
  assert.equal(diasDeEntrega(entrega({ fecha: '2026-08-12', estado: 'cerrada', cerrada_en: '2026-09-12T15:00:00Z' }), '2026-09-22'), 31)
  // Un instante de la noche del 22 en UTC ya es el 22 en San Juan, no el 23.
  assert.equal(diasEntre('2026-09-16', '2026-09-23T02:30:00Z'), 6)
})

test('las tarjetas: en manos de la gente suma sólo abiertas con saldo; rendido del mes por fecha de San Juan', () => {
  const entregas = [
    entrega(),
    entrega({ id: 'e2', codigo: 'ER-0141', persona: 'Diego Funes', fecha: '2026-08-30', en_su_poder: 540_000 }),
    entrega({ id: 'e3', codigo: 'ER-0146', en_su_poder: 0 }),
    entrega({ id: 'e4', codigo: 'ER-0138', estado: 'cerrada', en_su_poder: 0 }),
    entrega({ id: 'e5', codigo: 'ER-0139', estado: 'anulada', en_su_poder: 400_000 }),
  ]
  const rend: Rendicion[] = [
    { id: 'r1', entrega_id: 'e1', compra_clave: 'a', monto: 412_800, imputada_en: '2026-09-19T14:05:00Z', comprobante_id: null },
    // 31/08 21:30 en San Juan: es de AGOSTO aunque en UTC ya sea septiembre.
    { id: 'r2', entrega_id: 'e1', compra_clave: 'b', monto: 1_000, imputada_en: '2026-09-01T00:30:00Z', comprobante_id: null },
  ]
  const r = resumir(entregas, [comp('leyendo'), comp('observado'), comp('en_compras'), comp('descartado')], rend, '2026-09-22')
  assert.equal(r.enManos, 899_700)
  assert.equal(r.entregasConSaldo, 2)
  assert.equal(r.abiertas, 3)
  assert.equal(r.rendidoMes, 412_800)
  assert.equal(r.filasMes, 1)
  assert.equal(r.porImputar, 2)
  assert.deepEqual(r.masVieja, { dias: 23, codigo: 'ER-0141', persona: 'Diego Funes' })
})

test('sin entregas con saldo no hay «más vieja»: null, nunca 0 días', () => {
  assert.equal(resumir([entrega({ en_su_poder: 0 })], [], [], '2026-09-22').masVieja, null)
})

test('«Por obra» agrupa las abiertas y deja Estructura al final; «Todas» pone las abiertas primero', () => {
  const l = [
    entrega({ codigo: 'ER-0144', estructura: true, obra: null, obra_id: null }),
    entrega({ codigo: 'ER-0147' }),
    entrega({ codigo: 'ER-0141', obra: 'Salón comercial' }),
    entrega({ codigo: 'ER-0138', estado: 'cerrada' }),
  ]
  assert.deepEqual(ordenarLista(l, 'obra').map((g) => g.grupo), ['Galpón 8', 'Salón comercial', 'Estructura'])
  assert.deepEqual(ordenarLista(l, 'abiertas')[0].entregas.map((e) => e.codigo), ['ER-0147', 'ER-0144', 'ER-0141'])
  assert.deepEqual(ordenarLista(l, 'todas')[0].entregas.map((e) => e.codigo).at(-1), 'ER-0138')
})

test('lo que la persona ya tiene sin rendir se avisa al elegirla (sin bloquear nada)', () => {
  const l = [entrega(), entrega({ id: 'x', codigo: 'ER-0150', en_su_poder: 100_000 }), entrega({ id: 'y', persona_id: 'otro' })]
  assert.deepEqual(sinRendirDe('p-sosa', l), { total: 459_700, codigos: ['ER-0147', 'ER-0150'] })
  assert.deepEqual(sinRendirDe('nadie', l), { total: 0, codigos: [] })
})

test('qué falta en un ticket sin CUIT ni proveedor, con importe y fecha leídos (D05)', () => {
  const c = comp('observado', { resultado: { comprobantes: [{ total: '30000.00', fecha: '2026-09-21' }] } })
  assert.deepEqual(queFalta(c).map((x) => `${x.texto} · ${x.detalle}`), [
    'El papel no imprime CUIT · clave débil',
    'Sin nombre de proveedor legible · a completar',
    'Importe y fecha sí se leen · $ 30.000 · 21/09',
  ])
  assert.equal(totalLeido(comp('leyendo', { resultado: { comprobantes: [{ total: '96.400,50' }] } })), 96_400.5)
  assert.equal(totalLeido(comp('en_compras', { monto_rendido: 61_000 })), 61_000)
  assert.equal(totalLeido(comp('leyendo')), null)
})

test('la actividad va de lo más nuevo a lo más viejo y nombra a quien entregó', () => {
  const ev = actividadDe({
    entrega: entrega(), creadaEn: '2026-09-16T11:55:00Z', entregadaPor: 'J. Echegaray',
    comprobantes: [comp('observado', { observado_en: '2026-09-22T20:00:00Z', observacion: 'falta el CUIT' })],
    rendiciones: [], devoluciones: [],
  })
  assert.deepEqual(ev.map((e) => e.texto), [
    'Observado: falta el CUIT', 'Comprobante por la app', 'Conformidad firmada en el teléfono · Rubén Sosa',
    'Entrega creada · $ 1.200.000 · J. Echegaray',
  ])
})

test('el CSV usa ; y coma decimal, y escapa el texto libre', () => {
  const csv = entregasCsv([entrega({ para_que: 'Áridos; fletes', entregado: 1500.5 })], '2026-09-22')
  const [cab, fila] = csv.split('\n')
  assert.ok(cab.startsWith('Entrega;Fecha;A cargo de'))
  assert.ok(fila.includes(';1500,5;'))
  assert.ok(fila.endsWith('"Áridos; fletes"'))
})

test('la ficha: el ticket en Compras toma la fila de Compras; la rendición sin ticket aparece igual', () => {
  const compras = new Map([
    ['k1', { fila: 900, clave: 'k1', fecha: '2026-09-19', proveedor: 'Hormigonera del Oeste', concepto: 'Materiales', tipo: 'FC', comprobante: '1', total: 412_800, tipo_pago: 'A rendir' }],
    ['k2', { fila: 901, clave: 'k2', fecha: '2026-09-18', proveedor: 'Áridos San Juan', concepto: 'Materiales', tipo: 'FC', comprobante: '2', total: 238_500, tipo_pago: 'A rendir' }],
  ])
  const rend: Rendicion[] = [
    { id: 'r1', entrega_id: 'e1', compra_clave: 'k1', monto: 412_800, imputada_en: '2026-09-19T14:00:00Z', comprobante_id: 'c1' },
    { id: 'r2', entrega_id: 'e1', compra_clave: 'k2', monto: 238_500, imputada_en: '2026-09-18T14:00:00Z', comprobante_id: null },
  ]
  const filas = filasDeLaFicha([
    comp('en_compras', { id: 'c1', resultado: { comprobantes: [{ proveedor: 'HORMIGONERA OESTE', total: 1 }] } }),
    comp('observado', { id: 'c2', enviado_en: '2026-09-21T15:00:00Z', resultado: { comprobantes: [{ total: '30000' }] } }),
  ], rend, compras)
  assert.deepEqual(filas.map((f) => [f.proveedor, f.importe, f.estado, f.fila]), [
    [null, 30_000, 'observado', null],
    ['Hormigonera del Oeste', 412_800, 'en_compras', 900],
    ['Áridos San Juan', 238_500, 'en_compras', 901],
  ])
})

test('D09/D10 · quién tiene efectivo: la misma cuenta que «En manos de la gente», la más vieja arriba', () => {
  const l = [
    entrega(),
    entrega({ id: 'e2', codigo: 'ER-0141', persona: 'Diego Funes', obra_id: 'OB-9', obra: 'Salón comercial', fecha: '2026-08-30', en_su_poder: 540_000 }),
    entrega({ id: 'e3', codigo: 'ER-0144', estructura: true, obra_id: null, obra: null, en_su_poder: 465_500, fecha: '2026-09-08' }),
    entrega({ id: 'e4', codigo: 'ER-0146', en_su_poder: 0 }),
    entrega({ id: 'e5', codigo: 'ER-0139', estado: 'cerrada', en_su_poder: 10 }),
  ]
  const t = quienTieneEfectivo(l, '2026-09-22')
  assert.deepEqual(t.filas.map((f) => [f.codigo, f.destino, f.dias]), [['ER-0141', 'Salón comercial', 23], ['ER-0144', 'Estructura', 14], ['ER-0147', 'Galpón 8', 6]])
  assert.equal(t.total, resumir(l, [], [], '2026-09-22').enManos, 'dos pantallas, una definición')
  assert.deepEqual(quienTieneEfectivo(l, '2026-09-22', 'OB-8').filas.map((f) => f.codigo), ['ER-0147'])
  assert.equal(quienTieneEfectivo(l, '2026-09-22', 'OB-X').total, 0)
})

test('D14 · la campanita cuenta lo que espera y, de eso, lo leído sin CUIT', () => {
  const c = conteosDeCampanita([
    comp('leyendo', { resultado: { comprobantes: [{ cuit: '30-1' }] } }),
    comp('observado'),
    comp('respondido', { resultado: { comprobantes: [{ proveedor: 'X' }] } }),
    comp('en_compras'), comp('descartado'),
  ])
  assert.deepEqual(c, { porImputar: 3, sinCuit: 2 })
  assert.deepEqual(conteosDeCampanita([]), { porImputar: 0, sinCuit: 0 })
})

// ═══ LOS CUATRO DATOS DE D02 ═══

const borrador = { persona: 'p-sosa', destino: 'obra' as const, obra: 'OB-8', monto: '$ 800.000', paraQue: '  Áridos  ' }

test('entrega válida: el monto se lee en es-AR y el para qué se recorta', () => {
  assert.deepEqual(validarEntrega(borrador), {
    ok: true, dato: { persona: 'p-sosa', obra: 'OB-8', estructura: false, monto: 800_000, paraQue: 'Áridos', esPrueba: false },
  })
  const e = validarEntrega({ ...borrador, destino: 'estructura', obra: 'OB-8', paraQue: '' })
  assert.ok(e.ok)
  assert.equal(e.ok && e.dato.obra, null, 'con Estructura la obra NO viaja aunque haya quedado elegida')
  assert.equal(e.ok && e.dato.estructura, true)
  assert.equal(e.ok && e.dato.paraQue, null)
})

test('obra XOR estructura: sin destino, o «una obra» sin elegirla, no pasa', () => {
  assert.deepEqual(validarEntrega({ ...borrador, destino: null }), { ok: false, campo: 'destino', error: 'Elegí el destino: una obra o Estructura.' })
  const sinObra = validarEntrega({ ...borrador, obra: ' ' })
  assert.equal(!sinObra.ok && sinObra.campo, 'obra')
})

test('el monto tiene que ser mayor que cero y legible', () => {
  for (const m of ['0', '-5', '', 'ochocientos', '8,00,0']) {
    const v = validarEntrega({ ...borrador, monto: m })
    assert.equal(!v.ok && v.campo, 'monto', `«${m}» no puede pasar`)
  }
  const v = validarEntrega({ ...borrador, monto: '1.500,50' })
  assert.equal(v.ok && v.dato.monto, 1500.5)
  const sinPersona = validarEntrega({ ...borrador, persona: '' })
  assert.equal(!sinPersona.ok && sinPersona.campo, 'persona')
})

test('D02 dice lo que pasa antes de confirmar, sin prometer proyección ni plazo', () => {
  const f = frasesAlEntregar({ monto: 800_000, persona: 'Rubén Sosa', obra: 'Galpón 8', estructura: false })
  assert.equal(f[0], 'Salen $ 800.000 de Efectivo y quedan a nombre de Rubén Sosa.')
  assert.ok(f.every((x) => !/rinde antes|plazo|vence|canal/i.test(x)))
  assert.equal(verboEntregar(800_000), 'Entregar $ 800.000')
  assert.equal(verboEntregar(null), 'Entregar')
})

test('devolución: no más de lo que tiene; cierra sólo si queda en cero', () => {
  assert.equal(validarDevolucion('540.000', 540_000).ok, true)
  const mucho = validarDevolucion('600.000', 540_000)
  assert.equal(!mucho.ok && mucho.error, 'Tiene $ 540.000 en su poder: no puede devolver más.')
  assert.deepEqual(efectoDevolucion(540_000, 540_000), { cierra: true, resto: 0, frena: false })
  assert.deepEqual(efectoDevolucion(500_000, 540_000), { cierra: false, resto: 40_000, frena: false })
})

// ═══ EL AGUJERO DE ER-0005 (22/09/2026), MEDIDO EN LA BASE ═══
//
// Con un ticket todavía en camino, devolver el saldo entero NO cierra la entrega: si ese ticket se
// carga después a Compras, la entrega cerrada queda con «en su poder» negativo. La base lo frena
// (`20260922T3000`); esto prueba que la pantalla promete lo mismo y no un cierre que va a ser negado.
test('devolución: el saldo entero NO cierra si queda un ticket en camino', () => {
  assert.deepEqual(efectoDevolucion(120_000, 120_000, 1), { cierra: false, resto: 0, frena: true })
  // Devolver de menos con un ticket en camino no «frena» nada: no iba a cerrar de todos modos.
  assert.deepEqual(efectoDevolucion(100_000, 120_000, 1), { cierra: false, resto: 20_000, frena: false })
})

// ═══ LOS ERRORES DE LAS FUNCIONES DE LA BASE ═══

test('P0001: el motivo de la función, con mayúscula y los importes en pesos (el código ER queda)', () => {
  assert.equal(mensajeDeError({ code: 'P0001', message: 'ER-0141 tiene 540000.00 en su poder: no puede devolver 600000' }),
    'ER-0141 tiene $ 540.000 en su poder: no puede devolver $ 600.000.')
  assert.equal(mensajeDeError({ code: 'P0001', message: 'la entrega va a una obra o a «Estructura»: una de las dos' }),
    'La entrega va a una obra o a «Estructura»: una de las dos.')
  assert.equal(mensajeDeError({ code: 'P0001', message: 'ya está en Compras: se corrige la fila, no se descarta el ticket' }),
    'Ya está en Compras: se corrige la fila, no se descarta el ticket.')
})

test('42501: el motivo propio si lo trae; el de Postgres se reemplaza por quién puede', () => {
  assert.equal(mensajeDeError({ code: '42501', message: 'entregar y recibir efectivo es de Dirección, Administración o Jefe de obra' }),
    'Entregar y recibir efectivo es de Dirección, Administración o Jefe de obra.')
  assert.equal(mensajeDeError({ code: '42501', message: 'permission denied for function entregar_efectivo' }),
    'Esto es de Dirección, Administración o Jefe de obra.')
})

test('sin la migración, el error lo dice: no es «no hay entregas»', () => {
  for (const e of [{ code: 'PGRST202', message: 'Could not find the function public.entregar_efectivo' },
    { code: 'PGRST205', message: 'Could not find the table public.efectivo_entrega_saldo in the schema cache' },
    { code: '42P01', message: 'relation "public.efectivo_entrega" does not exist' }]) {
    assert.equal(faltaMigracion(e), true)
    assert.match(mensajeDeError(e), /todavía no está publicado.*20260922T1500/)
  }
  assert.equal(faltaMigracion({ code: 'P0001', message: 'la entrega no existe' }), false)
  assert.equal(faltaMigracion(null), false)
})

test('otros errores: check, clave foránea y lo desconocido', () => {
  assert.match(mensajeDeError({ code: '23514', message: 'violates check constraint' }), /obra o a Estructura/)
  assert.match(mensajeDeError({ code: '23503', message: 'fk' }), /ya no existe/)
  assert.equal(mensajeDeError({ code: 'XX', message: '' }), 'No se pudo registrar. Probá de nuevo.')
  assert.equal(pesos(-1500), '−$ 1.500')
})

// ═══ LO ANULADO NO SE MEZCLA CON LO QUE OCURRIÓ (dueño, 22/09/2026) ═══
//
// Las pruebas del módulo dejaron tres entregas anuladas que no había forma de sacar de la vista, y
// «Todas» las ponía al lado de las cerradas. Una anulada no es una entrega que terminó: es una que no
// existió. Si vuelve a colarse en «Todas», estos dos se ponen rojos.

test('«Todas» muestra lo que ocurrió; las anuladas tienen su propio cajón', () => {
  const lista = [
    entrega({ id: 'a1', codigo: 'ER-0201' }),
    entrega({ id: 'a2', codigo: 'ER-0202', estado: 'cerrada', en_su_poder: 0 }),
    entrega({ id: 'a3', codigo: 'ER-0203', estado: 'anulada', en_su_poder: 0 }),
  ]
  const todas = ordenarLista(lista, 'todas')[0].entregas.map((e) => e.codigo)
  assert.deepEqual(todas, ['ER-0201', 'ER-0202'])

  const anuladas = ordenarLista(lista, 'anuladas')[0].entregas.map((e) => e.codigo)
  assert.deepEqual(anuladas, ['ER-0203'])
})

test('«anuladas» es un filtro válido de la URL y «abiertas» sigue siendo el default', () => {
  assert.equal(filtroDeLista('anuladas'), 'anuladas')
  assert.equal(filtroDeLista('cualquiera'), 'abiertas')
  assert.equal(filtroDeLista(null), 'abiertas')
})

test('una entrega declarada prueba lo lleva escrito hasta la base', () => {
  // El dueño va a probar el módulo entero con gente y obras reales. Si la marca se pierde en el camino,
  // la prueba sale de la CAJA de verdad y después no hay puerta para sacarla.
  const v = validarEntrega({
    persona: 'p-sosa', destino: 'estructura', obra: '', monto: '1.000', paraQue: 'prueba', esPrueba: true,
  })
  assert.equal(v.ok, true)
  assert.equal(v.ok && v.dato.esPrueba, true)

  // Y sin el check, jamás: el default no puede ser «prueba» ni por omisión.
  const real = validarEntrega({ persona: 'p-sosa', destino: 'estructura', obra: '', monto: '1.000', paraQue: '' })
  assert.equal(real.ok && real.dato.esPrueba, false)
})
