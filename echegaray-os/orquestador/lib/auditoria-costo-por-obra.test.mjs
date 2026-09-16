// LAS REGLAS DE LA AUDITORÍA DE COSTO POR OBRA, SOBRE FIXTURES — sin base y sin red.
//
// Cada prueba de acá nombra un defecto que YA PASÓ en esta auditoría o en el pipeline que audita, y
// revertir el arreglo la pone roja. No hay pruebas de «devuelve un array».

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aLaFecha, dia, diferencia, duplicadosProbables, huellaDeObra, norm,
  esPlanDeCuotas, otraObraNombrada, parseObraCelda, resumen, totalesPorDestino,
} from './auditoria-costo-por-obra.mjs'
import {
  conciliacionSinObra, motivoDeExclusion, puenteDeObra, reglaMuerta,
  espejoDesfasado, rpcVsRecuento, subcontratoSinRespaldo,
} from './auditoria-costo-por-obra-hallazgos.mjs'
import { hhDeObraVsLasQueCuestan, nivelesDistintos } from './auditoria-costo-por-obra-mo.mjs'

const HOY = '2026-09-16'
const fila = (o) => ({ fila: 1, total: 0, estado: 'Pagado', anulada: false, obra_celda: 'OB-0005 · SF - X', obra_texto: 'San Francisco', asignada_obra: 'san-francisco', ...o })

test('dia() entiende el Date que devuelve pg, no sólo el texto ISO del Sheet', () => {
  // EL DEFECTO: `String(new Date(...)).slice(0,10)` da «Fri Mar 17», que comparado con «2026-09-16»
  // ordena por la «F» y da TODO por futuro. La primera corrida publicó cero materiales en 26 obras.
  assert.equal(dia(new Date('2026-03-17T03:00:00.000Z')), '2026-03-17')
  assert.equal(dia('2026-03-17'), '2026-03-17')
  assert.equal(dia(null), null)
  assert.equal(dia(''), null)
  assert.ok(dia(new Date('2026-03-17T03:00:00.000Z')) < HOY, 'marzo tiene que ser anterior a septiembre')
})

test('«Sin obra – CLIENTE» NO es una obra, y ES-ADM tampoco', () => {
  assert.equal(parseObraCelda('OB-0005 · SF - GALPONES').tipo, 'obra')
  assert.equal(parseObraCelda('OB-0005 · SF - GALPONES').codigo, 'OB-0005')
  assert.equal(parseObraCelda('Sin obra – LA ESTRELLA').tipo, 'sin_obra')
  assert.equal(parseObraCelda('Sin obra – LA ESTRELLA').codigo, null)
  assert.equal(parseObraCelda('ES-ADM · Estructura – Administración').tipo, 'estructura')
  assert.equal(parseObraCelda('').tipo, 'vacia')
  assert.equal(parseObraCelda(null).clave, '(vacía)')
})

test('la regla «a la fecha» del dueño: pagado entero, nota de crédito entera, por vencer sólo lo pagado', () => {
  assert.deepEqual(aLaFecha(fila({ total: 100, estado: 'Pagado' }), HOY), { a_la_fecha: 100, por_vencer: 0 })
  // Una devolución ya ocurrió: entra entera aunque la fila esté pendiente.
  assert.deepEqual(aLaFecha(fila({ total: -50, estado: 'Pendiente' }), HOY), { a_la_fecha: -50, por_vencer: 0 })
  // Vencida e impaga: es costo igual. Ésa es la mitad «vencido» de la regla.
  assert.deepEqual(aLaFecha(fila({ total: 100, estado: 'Pendiente', fecha_prevista: '2026-09-01' }), HOY),
    { a_la_fecha: 100, por_vencer: 0 })
  // Todavía no vence: sólo lo efectivamente pagado.
  assert.deepEqual(aLaFecha(fila({ total: 100, estado: 'Pendiente', fecha_prevista: '2026-10-01', monto_pagado: 30 }), HOY),
    { a_la_fecha: 30, por_vencer: 70 })
  // Un monto pagado mayor que el total no puede inventar costo.
  assert.deepEqual(aLaFecha(fila({ total: 100, estado: 'Pendiente', fecha_prevista: '2026-10-01', monto_pagado: 500 }), HOY),
    { a_la_fecha: 100, por_vencer: 0 })
})

test('totalesPorDestino parte materiales de subcontratos y deja afuera lo anulado', () => {
  const filas = [
    fila({ fila: 1, total: 1000 }),
    fila({ fila: 2, total: 500, es_subcontrato: true }),
    fila({ fila: 3, total: 999, anulada: true }),
    fila({ fila: 4, total: 777, estado: 'ELIMINADO' }),
    fila({ fila: 5, total: 200, estado: 'Pendiente', fecha_prevista: '2026-12-01' }),
  ]
  const t = totalesPorDestino(filas, { hoy: HOY }).get('OB-0005')
  assert.equal(t.materiales, 1000, 'la anulada y la ELIMINADO no suman, y lo por vencer tampoco')
  assert.equal(t.subcontratos, 500)
  assert.equal(t.materiales_por_vencer, 200)
  assert.equal(t.n_materiales, 2)
})

test('el texto de la fila que nombra otra obra — el caso «Galpón 5» del dueño', () => {
  const obras = [
    { codigo: 'OB-0005', nombre: 'SF - GALPONES, MAMPOSTERÍA Y CANCHA DE PÁDEL', huella: huellaDeObra('SF - GALPONES, MAMPOSTERÍA Y CANCHA DE PÁDEL') },
    { codigo: 'OB-0011', nombre: 'SF - PISOS INDUSTRIALES', huella: huellaDeObra('SF - PISOS INDUSTRIALES') },
  ]
  const m = otraObraNombrada(fila({ obra_celda: 'OB-0005 · SF - GALPONES', detalle_obra: 'Pisos Industriales', concepto: 'Galpon 5' }), obras)
  assert.equal(m?.obra.codigo, 'OB-0011')
  // Y NO dispara cuando el texto nombra su propia obra.
  assert.equal(otraObraNombrada(fila({ obra_celda: 'OB-0011 · SF - PISOS INDUSTRIALES', concepto: 'pisos industriales losa 3' }), obras), null)
})

test('una huella tiene que distinguir: «mampostería» sola aparece en cualquier concepto de albañilería', () => {
  assert.equal(huellaDeObra('LE - MAMPOSTERÍA'), null)
  assert.equal(huellaDeObra('LE - GALPÓN 7'), 'galpon 7')
  assert.equal(huellaDeObra('SF - PISOS INDUSTRIALES'), 'pisos industriales')
  assert.equal(norm('GALPÓN 5'), 'galpon 5')
})

test('el duplicado con el MISMO número de comprobante se marca distinto del que sólo coincide', () => {
  const d = duplicadosProbables([
    fila({ fila: 10, total: 1000, proveedor: 'X', fecha: '2026-01-01', comprobante: 'A-1' }),
    fila({ fila: 11, total: 1000, proveedor: 'X', fecha: '2026-01-01', comprobante: 'A-1' }),
    fila({ fila: 12, total: 500, proveedor: 'Y', fecha: '2026-01-01', comprobante: 'B-1' }),
    fila({ fila: 13, total: 500, proveedor: 'Y', fecha: '2026-01-01', comprobante: 'B-2' }),
  ])
  assert.equal(d.length, 2)
  assert.equal(d[0].mismo_comprobante, true)
  assert.equal(d[0].importe_en_riesgo, 1000, 'dos filas de 1000 ponen 1000 en riesgo, no 2000')
  assert.equal(d.find((x) => x.total === 500).mismo_comprobante, false)
})

test('seis cuotas semanales del mismo monto NO son un duplicado — la alarma falsa de $8,4 M', () => {
  // PEDRO TELLO: $6.450.400 en seis filas iguales, misma fecha de factura, pagos semanales y el
  // N° de comprobante VACÍO en las seis. «Vacío = vacío» las daba por el mismo comprobante.
  const cuotas = [0, 1, 2, 3, 4, 5].map((i) => fila({
    fila: 950 + i, total: 1075066.67, proveedor: 'PEDRO TELLO', fecha: '2026-09-11',
    comprobante: null, fecha_prevista: `2026-09-${18 + i}`,
  }))
  assert.equal(esPlanDeCuotas(cuotas), true)
  assert.deepEqual(duplicadosProbables(cuotas), [])
  // Dos filas iguales que vencen EL MISMO DÍA siguen siendo candidatas.
  const repetidas = cuotas.slice(0, 2).map((f) => ({ ...f, fecha_prevista: '2026-09-18' }))
  assert.equal(duplicadosProbables(repetidas).length, 1)
  assert.equal(duplicadosProbables(repetidas)[0].mismo_comprobante, false,
    'comprobante vacío en las dos no es «el mismo comprobante»')
})

test('la atribución del motivo: una regla declarada le gana a un defecto sobre la misma fila', () => {
  // Nómina con importe negativo: sale por área, no por «importe_no_positivo». Si el orden se
  // invierte, la auditoría reporta un defecto donde hay una regla de negocio.
  assert.equal(motivoDeExclusion(fila({ total: -100, area_calculada: 'personas' }), HOY), 'area_personas')
  assert.equal(motivoDeExclusion(fila({ total: -100 }), HOY), 'importe_no_positivo')
  assert.equal(motivoDeExclusion(fila({ total: 100, unidad_negocio: 'Estructura' }), HOY), 'unidad_estructura')
  assert.equal(motivoDeExclusion(fila({ total: 100, destino: 'estructura_taller' }), HOY), 'destino_estructura')
  assert.equal(motivoDeExclusion(fila({ total: 100 }), HOY), null)
})

test('en el cajón «Sin obra» la asignación es `via`, no `obra_id` — el falso positivo de $75 M', () => {
  const f = fila({ total: 100, obra_celda: 'Sin obra – LA ESTRELLA', asignada_obra: null, via: 'sin_obra' })
  assert.equal(motivoDeExclusion(f, HOY), 'sin_asignacion', 'leído como obra, la fila parece perdida')
  assert.equal(motivoDeExclusion(f, HOY, { sinObra: true }), null, 'leído como cajón, está asignada')
  const hall = conciliacionSinObra(
    [{ cliente_id: 'c1', cliente_canonico: 'LA ESTRELLA' }], [f],
    new Map([['c1', { materiales: 100, subcontratos: 0 }]]), HOY)
  assert.deepEqual(hall, [], 'el cajón cuadra y no puede haber hallazgo')
})

test('el puente cierra cuando todo está explicado y deja residuo cuando falta un camino', () => {
  const filas = [fila({ fila: 1, total: 1000 }), fila({ fila: 2, total: -100 }), fila({ fila: 3, total: 300, unidad_negocio: 'Estructura' })]
  const p = puenteDeObra(filas, 1000, HOY)
  assert.equal(p.entra, 1000)
  assert.equal(p.residuo, 0, 'la NC y la estructura explican toda la diferencia')
  assert.equal(p.motivos.find((m) => m.motivo === 'importe_no_positivo').importe, -100)
  // Si la app publicara otra cosa, el residuo lo dice y no se puede tapar.
  assert.equal(puenteDeObra(filas, 900, HOY).residuo, 100)
})

test('la regla muerta: el control tiene que poder decir que SÍ y que NO', () => {
  assert.deepEqual(reglaMuerta([{ destino: 'obra' }, { destino: 'estructura_admin' }]), [],
    'con el valor real presente, la cláusula filtra y no hay hallazgo')
  const rojo = reglaMuerta([{ destino: 'obra' }, { destino: 'estructura_admin' }], ['ES-ADM', 'ES-TAL'])
  assert.equal(rojo.length, 1, 'con los códigos viejos la cláusula no excluye nunca y eso es un hallazgo')
  assert.equal(rojo[0].tipo, 'regla_muerta')
})

test('la tolerancia es de $1 porque «Total» es una fórmula con cola binaria', () => {
  assert.equal(diferencia('materiales', 406911.29, 406911.29000000004), null)
  assert.equal(diferencia('materiales', 100, 102).dif, -2)
  const sheet = new Map([['OB-0005', { materiales: 1000.4, subcontratos: 0 }]])
  const espejo = new Map([['OB-0005', { materiales: 1000, subcontratos: 0 }]])
  assert.deepEqual(espejoDesfasado(sheet, espejo), [], '40 centavos no son un desvío')
  assert.equal(espejoDesfasado(new Map([['OB-0005', { materiales: 1100 }]]), espejo).length, 1)
})

test('rpcVsRecuento compara obra por obra y una obra sin datos no inventa un cero', () => {
  const obras = [{ id: 'a', codigo: 'OB-0001' }, { id: 'b', codigo: 'OB-0002' }]
  const rpc = new Map([['a', { materiales: 100, subcontratos: 50 }]])
  const rec = new Map([['a', { materiales: 100, subcontratos: 50 }]])
  assert.deepEqual(rpcVsRecuento(obras, rpc, rec), [], 'la obra b no tiene compras en ningún lado')
  assert.equal(rpcVsRecuento(obras, new Map([['a', { materiales: 100, subcontratos: 0 }]]), rec)[0].campo ?? 'subcontratos', 'subcontratos')
})

test('un subcontrato facturado íntegramente en otra obra es un hallazgo, uno cumplido no', () => {
  const ok = subcontratoSinRespaldo([{ obra_id: 'x', nombre: 'n', precio_contratado: 1000, facturado_en_la_obra: 900, facturado_total: 900 }])
  assert.deepEqual(ok, [])
  const mal = subcontratoSinRespaldo([{ obra_id: 'x', nombre: 'n', precio_contratado: 1000, facturado_en_la_obra: 0, facturado_total: 5000 }])
  assert.equal(mal[0].tipo, 'subcontrato_facturado_en_otra_obra')
  assert.equal(mal[0].importe, 5000)
  const excedido = subcontratoSinRespaldo([{ obra_id: 'x', nombre: 'n', precio_contratado: 1000, facturado_en_la_obra: 1500, facturado_total: 1500 }])
  assert.equal(excedido[0].importe, 500)
})

test('el resumen suma valor absoluto: una nota de crédito de −686.070 no compensa un defecto de +686.070', () => {
  const r = resumen([
    { tipo: 't', importe: -686070 }, { tipo: 't', importe: 686070 }, { tipo: 'u', importe: 0 },
  ])
  assert.equal(r[0].importe, 1372140)
  assert.equal(r[0].n, 2)
  assert.equal(r.find((x) => x.tipo === 'u').n, 1, 'un hallazgo sin importe se cuenta igual')
})

test('MO y MA en niveles distintos: la obra paraguas tiene horas y la sub-obra tiene materiales', () => {
  const obras = [{ id: 'paraguas', codigo: 'OB-0003' }, { id: 'sub', codigo: 'OB-0068' }, { id: 'sana', codigo: 'OB-0008' }]
  const app = new Map([
    ['paraguas', { materiales: 0, subcontratos: 0, mano_obra: 22963937 }],
    ['sub', { materiales: 18289159, subcontratos: 0, mano_obra: null }],
    ['sana', { materiales: 37188800, subcontratos: 2080000, mano_obra: 4415882 }],
  ])
  const mo = new Map([['paraguas', { horas: 3381.5 }], ['sana', { horas: 565 }]])
  const r = nivelesDistintos(obras, app, mo)
  assert.deepEqual(r.map((x) => [x.tipo, x.obra]), [['mo_sin_materiales', 'OB-0003'], ['materiales_sin_mo', 'OB-0068']])
  assert.ok(!r.some((x) => x.obra === 'OB-0008'), 'una obra con las dos mitades no es un hallazgo')
})

test('hh_de_obra recorta la ventana y costo_mo_quincena no — las horas que se pagan y no se muestran', () => {
  const obras = [{ id: 'sf', codigo: 'OB-0005' }, { id: 'qp', codigo: 'OB-0008' }]
  const hh = new Map([
    ['sf', { desde: '2026-01-05', hasta: '2026-08-15', periodos: [{ hh: 11721 }] }],
    ['qp', { desde: '2026-08-17', hasta: '2026-09-15', periodos: [{ hh: 228 }, { hh: 337 }] }],
  ])
  const porObra = [{ obra_id: 'sf', horas_que_cuentan: 12117 }, { obra_id: 'qp', horas_que_cuentan: 565 }]
  const r = hhDeObraVsLasQueCuestan(obras, hh, porObra)
  assert.equal(r.length, 1)
  assert.equal(r[0].obra, 'OB-0005')
  assert.match(r[0].detalle, /11721 h .* son 12117/)
})
