import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acumuladoDeFrente, conDecimalesEnPunto, correr, enCurso, faltaParaRegistrar, frentesDelParte,
  nombreDeFrente, resumenDelParte, textoDeAvance, textoPendiente, tonoDeBarra,
} from './parteDiario.ts'
import type { Actividad, ParteEjecucion } from '../types/index.ts'

// LAS DECISIONES DEL PARTE DIARIO (canónico «05 · Registrar avance»).
//
// ═══ EL DEFECTO QUE ATRAPAN ═══
//
// Todas las celdas de esta pantalla tienen una versión «prolija» que miente: el frente que nunca
// reportó dibujado como «0,00 / 96,00 m²» y 0 %, el parte que sólo trajo horas dibujado como «+0»,
// y la primaria encendida sobre un formulario al que le falta la medición que el servidor exige.
// Cada test de acá fija el lado verdadero: lo que no se registró se escribe «sin registrar» y «—»,
// y lo que el servidor va a rebotar se dice ANTES, con la palabra de qué falta.

const act = (x: Partial<Actividad>): Actividad => ({
  id: x.id ?? 'a', obra_id: 'o', clave: 'k', seccion: null, codigo: null, codigo_padre: null,
  nombre: 'x', tipo: 'tarea', orden: 1, inicio_plan: null, fin_plan: null, dias_plan: null,
  inicio_real: null, fin_real: null, dias_real: null, inicio_base: null, fin_base: null,
  pct: null, estado: 'pendiente', cuadrilla: null, comentario: null, editado_a_mano: false,
  fuente_pestana: null, sellada_en: null, responsable_id: null, hh_plan: null, archivada: false,
  creada_en_web: true, rubro: null, unidad: null, cantidad_objetivo: null, metodo_avance: 'manual',
  cuadrilla_id: null, cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null,
  cantidad_ejecutada: null, n_partes: 0, ultimo_parte: null, hh_real: null, hh_extra: null,
  n_imputaciones: 0, impedimentos_abiertos: 0, avance_pct: null, origen_avance: null,
  estado_operativo: 'pendiente', productividad: null, consumo_hh_pct: null,
  inicio_real_declarado: null, fin_real_declarado: null, origen_inicio_real: null,
  origen_fin_real: null, forecast_fin: null, base_del_forecast: null, dias_restantes: null,
  tiene_fecha: false, tiene_fecha_plan: false, estado_fecha: 'sin_fecha',
  desvio_plan_dias: null, desvio_forecast_dias: null,
  actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0, n_pedidos: 0, ...x,
})

const parte = (x: Partial<ParteEjecucion>): ParteEjecucion => ({
  id: 'p', obra_id: 'o', actividad_id: 'a', fecha: '2026-08-24', cantidad: null,
  avance_pct: null, comentario: null, fuente: 'web', creado_en: '2026-08-24T10:00:00Z', ...x,
})

test('un frente medido en cantidad que no reportó nada dice «sin registrar», no «0,00 / 96,00»', () => {
  const a = act({ metodo_avance: 'cantidad', unidad: 'm²', cantidad_objetivo: 96, cantidad_ejecutada: null })
  const acum = acumuladoDeFrente(a)
  assert.equal(acum.texto, 'sin registrar')
  assert.equal(acum.registrado, false)
  // Y el porcentaje de esa fila es «—»: un 0 % afirma que se midió y dio cero.
  assert.equal(textoDeAvance(a, acum), '—')
  assert.equal(tonoDeBarra(a.avance_pct, acum.registrado), 'nulo')
})

test('el acumulado lleva los dos decimales del canónico en las dos puntas', () => {
  const a = act({ metodo_avance: 'cantidad', unidad: 'm²', cantidad_objetivo: 96, cantidad_ejecutada: 71.04 })
  // El defecto que atrapa: «71,04 / 96 m²» — dos escalas distintas en la misma celda.
  assert.equal(acumuladoDeFrente(a).texto, '71,04 / 96,00 m²')
})

test('sin cantidad objetivo se publica lo ejecutado solo: una fracción sin denominador es inventada', () => {
  const a = act({ metodo_avance: 'cantidad', unidad: 'm³', cantidad_objetivo: null, cantidad_ejecutada: 2.5 })
  assert.equal(acumuladoDeFrente(a).texto, '2,50 m³')
})

test('un frente que declara avance publica su porcentaje, y sin avance declarado «sin registrar»', () => {
  const conAvance = act({ metodo_avance: 'partes', avance_pct: 12 })
  assert.equal(acumuladoDeFrente(conAvance).texto, '12%')
  assert.equal(textoDeAvance(conAvance, acumuladoDeFrente(conAvance)), '12%')
  const sinAvance = act({ metodo_avance: 'manual', avance_pct: null })
  assert.equal(acumuladoDeFrente(sinAvance).texto, 'sin registrar')
})

test('la barra es verde al 100, azul en marcha y gris sin arrancar', () => {
  assert.equal(tonoDeBarra(100, true), 'completo')
  assert.equal(tonoDeBarra(40, true), 'curso')
  assert.equal(tonoDeBarra(0, true), 'nulo')
  assert.equal(tonoDeBarra(null, true), 'nulo')
})

test('un parte que sólo trajo horas y nota se resume «—», nunca «+0»', () => {
  // El defecto que atrapa: `+${p.cantidad ?? 0}`. Un «+0,00 m³» dice que se midió y no se produjo
  // nada; lo cierto es que ese frente no se mide por cantidad.
  assert.equal(resumenDelParte(parte({}), act({ unidad: 'm³' })), '—')
  assert.equal(resumenDelParte(parte({ cantidad: 15.2 }), act({ unidad: 'm²' })), '+15,20 m²')
  assert.equal(resumenDelParte(parte({ avance_pct: 12 }), act({})), '+12 %')
})

test('un parte de una actividad archivada no pierde su cantidad por no saber la unidad', () => {
  assert.equal(resumenDelParte(parte({ cantidad: 3 }), undefined), '+3,00')
})

test('«en curso» es un hecho: avance empezado y sin terminar cuenta aunque el rótulo diga pendiente', () => {
  assert.equal(enCurso(act({ estado_operativo: 'pendiente', avance_pct: 40 })), true)
  assert.equal(enCurso(act({ estado_operativo: 'en_curso', avance_pct: null })), true)
  assert.equal(enCurso(act({ estado_operativo: 'pendiente', avance_pct: 100 })), false)
  assert.equal(enCurso(act({ estado_operativo: 'pendiente', avance_pct: null })), false)
})

test('los frentes dejan afuera los rubros de resumen y las archivadas, y ponen primero lo que arrancó', () => {
  const lista = [
    act({ id: 'r', tipo: 'resumen', orden: 1, estado_operativo: 'en_curso' }),
    act({ id: 'vieja', orden: 2, archivada: true, estado_operativo: 'en_curso' }),
    act({ id: 'quieta', orden: 3 }),
    act({ id: 'viva', orden: 4, estado_operativo: 'en_curso' }),
  ]
  assert.deepEqual(frentesDelParte(lista, false).map((a) => a.id), ['viva', 'quieta'])
  // El defecto que atrapa: ofrecer un rubro de resumen en el desplegable del parte. No se ejecuta:
  // se completa solo con sus hijas, y la base rechaza la carga.
  assert.deepEqual(frentesDelParte(lista, true).map((a) => a.id), ['viva'])
})

test('falta la medición ANTES de mandarla: el servidor rebota el parte sin cantidad ni avance', () => {
  assert.equal(faltaParaRegistrar(null, false), 'Elegí la actividad')
  assert.equal(faltaParaRegistrar(act({ metodo_avance: 'cantidad' }), false), 'Cargá la cantidad')
  assert.equal(faltaParaRegistrar(act({ metodo_avance: 'manual' }), false), 'Cargá el avance del día')
  assert.equal(faltaParaRegistrar(act({ metodo_avance: 'partes' }), false), 'Cargá el avance del día')
  // Con medición se puede registrar SIN gente marcada: esas horas también entran por Personal, y
  // bloquear acá perdería la producción del día por un dato que llega por otra puerta.
  assert.equal(faltaParaRegistrar(act({ metodo_avance: 'cantidad' }), true), null)
})

test('el frente se nombra con su rubro: dos actividades pueden llamarse igual', () => {
  // El defecto que atrapa: listar sólo `nombre`. En un desplegable de una línea por frente,
  // «Columna de carga H17» de dos rubros distintos son dos renglones idénticos.
  assert.equal(nombreDeFrente({ rubro: 'Estructura', nombre: 'Columna H17' }), 'Estructura · Columna H17')
  assert.equal(nombreDeFrente({ rubro: null, nombre: 'Vallado de obra' }), 'Vallado de obra')
})

test('la flecha de día retrocede UN día, también cruzando el cambio de mes', () => {
  // El defecto que atrapa: construir el `Date` en hora local. En San Juan (UTC−3) la medianoche del
  // 1/9 serializa como 31/8, y «día anterior» saltea dos.
  assert.equal(correr('2026-09-01', -1), '2026-08-31')
  assert.equal(correr('2026-08-24', -1), '2026-08-23')
  assert.equal(correr('2026-08-31', 1), '2026-09-01')
  assert.equal(correr('2026-02-28', 1), '2026-03-01')
})

test('la cantidad tipeada con coma llega como número al servidor', () => {
  // El defecto que atrapa: el campo del canónico es `type="text"` y en un teclado en español sale
  // «15,20». Sin esto, `z.coerce.number()` da NaN y el parte de la jornada se pierde con un error
  // que no nombra el problema.
  const datos = new FormData()
  datos.set('cantidad', '15,20')
  datos.set('avance_pct', '12')
  datos.set('comentario', 'muro norte, 2ª hilada')
  conDecimalesEnPunto(datos, ['cantidad', 'avance_pct'])
  assert.equal(datos.get('cantidad'), '15.20')
  assert.equal(datos.get('avance_pct'), '12')
  // Y no toca el texto: una nota con comas es una nota, no un número.
  assert.equal(datos.get('comentario'), 'muro norte, 2ª hilada')
})

test('el pendiente del desplegable no es negativo y sin objetivo dice «sin medición»', () => {
  const pasada = act({ metodo_avance: 'cantidad', unidad: 'm³', cantidad_objetivo: 1, cantidad_ejecutada: 3 })
  assert.equal(textoPendiente(pasada), '0,00 m³')
  assert.equal(textoPendiente(act({ metodo_avance: 'manual' })), 'sin medición')
  const normal = act({ metodo_avance: 'cantidad', unidad: 'm³', cantidad_objetivo: 1.08, cantidad_ejecutada: 0.43 })
  assert.equal(textoPendiente(normal), '0,65 m³')
})
