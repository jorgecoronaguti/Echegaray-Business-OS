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
  // Viaja en forma canónica: lo que importa es el número que lee `z.coerce.number()`, no los ceros de la derecha.
  assert.equal(Number(datos.get('cantidad')), 15.2)
  assert.equal(datos.get('avance_pct'), '12')
  // Y no toca el texto: una nota con comas es una nota, no un número.
  assert.equal(datos.get('comentario'), 'muro norte, 2ª hilada')
})

test('«1.500» EN EL PARTE ES MIL QUINIENTOS, NO 1,5 (auditoría, 18/09/2026)', () => {
  // Antes sólo se cambiaba la coma: «1.500» m² llegaba al servidor como 1,5 — mil veces menos de avance.
  const datos = new FormData()
  datos.set('cantidad', '1.500')
  datos.set('avance_pct', '12,5')
  conDecimalesEnPunto(datos, ['cantidad', 'avance_pct'])
  assert.equal(Number(datos.get('cantidad')), 1500, 'MUTACIÓN: volvió el replace de una sola coma')
  assert.equal(Number(datos.get('avance_pct')), 12.5)
  // Lo ilegible se deja tal cual: el esquema lo rechaza con su propio mensaje, no se inventa un número.
  const raro = new FormData()
  raro.set('cantidad', 'mucho')
  conDecimalesEnPunto(raro, ['cantidad'])
  assert.equal(raro.get('cantidad'), 'mucho')
})

test('el pendiente del desplegable no es negativo y sin objetivo dice «sin medición»', () => {
  const pasada = act({ metodo_avance: 'cantidad', unidad: 'm³', cantidad_objetivo: 1, cantidad_ejecutada: 3 })
  assert.equal(textoPendiente(pasada), '0,00 m³')
  assert.equal(textoPendiente(act({ metodo_avance: 'manual' })), 'sin medición')
  const normal = act({ metodo_avance: 'cantidad', unidad: 'm³', cantidad_objetivo: 1.08, cantidad_ejecutada: 0.43 })
  assert.equal(textoPendiente(normal), '0,65 m³')
})

// ═══ DISEÑO ERP OBRAS · 06 / M08 ═══
//
// EL CONTRATO CAMBIÓ POR DECISIÓN DEL DUEÑO (23/09/2026, «no quiero layout nuevo»): la 06 dibuja
// Actividad · Producción hoy · Acumulado · Comentario y «Quién vino» de sólo lectura. Se retiraron
// «% ítem», la ruta «Rubro › Épica», los activos y el destino de la novedad; el formulario manda
// `produccion_<id>` y `comentario_<id>`, no `hecho_`/`personas_`/`activos_`/`hh_`.
import {
  bajadaDePersona, bajadaDelDia, bajadaHecho, celdaAcumulado, celdaComentario, chipsDeGente, cifraHoras,
  esperadosDeAsignaciones, fechaCortaDia, fechaLarga, filaDeEjecucion, leerParteDiario, nombreCorto,
  renglonesDelParte, resumenGente, TEXTO_A_OJO, TEXTO_BLOQUEADA,
} from './parteDiario.ts'

test('el día se nombra como el diseño: «lunes 07/09/2026» y «Lun 21/09»', () => {
  assert.equal(fechaLarga('2026-09-07'), 'lunes 07/09/2026')
  assert.equal(fechaCortaDia('2026-09-21'), 'Lun 21/09')
  assert.equal(fechaLarga('2026-09-06'), 'domingo 06/09/2026')
})

test('un renglón por frente en curso: entra la en curso, la bloqueada y la empezada; no la pendiente ni el resumen', () => {
  const filas = renglonesDelParte([
    act({ id: 'a', orden: 3, estado_operativo: 'en_curso' }),
    act({ id: 'b', orden: 1, estado_operativo: 'bloqueada' }),
    act({ id: 'c', orden: 2, estado_operativo: 'pendiente', avance_pct: 40 }),
    act({ id: 'd', orden: 0, estado_operativo: 'pendiente', avance_pct: null }),
    act({ id: 'e', orden: 0, tipo: 'resumen', estado_operativo: 'en_curso' }),
    act({ id: 'f', orden: 0, archivada: true, estado_operativo: 'en_curso' }),
  ])
  assert.deepEqual(filas.map((f) => f.id), ['b', 'c', 'a'])
})

test('acumulado: «960 / 1.100» medido, «30% declarado» en aviso, y «sin registrar» sin dato', () => {
  assert.deepEqual(celdaAcumulado(act({ metodo_avance: 'cantidad', cantidad_ejecutada: 960, cantidad_objetivo: 1100 })),
    { texto: '960 / 1.100', tono: 'normal' })
  assert.deepEqual(celdaAcumulado(act({ metodo_avance: 'manual', avance_pct: 30 })), { texto: '30% declarado', tono: 'warn' })
  assert.deepEqual(celdaAcumulado(act({ metodo_avance: 'cantidad', cantidad_ejecutada: null })), { texto: 'sin registrar', tono: 'mudo' })
  assert.equal(bajadaHecho(act({ metodo_avance: 'cantidad', cantidad_ejecutada: 890, cantidad_objetivo: 1100, unidad: 'm³' })), '890 de 1.100 m³')
})

test('comentario (06): input «opcional» con lo guardado; la bloqueada y la que se mide a ojo llevan el texto fijo del diseño', () => {
  assert.deepEqual(celdaComentario(act({ metodo_avance: 'cantidad', cantidad_objetivo: 1100 }), 'faltó cemento'),
    { tipo: 'input', valor: 'faltó cemento' })
  assert.deepEqual(celdaComentario(act({ metodo_avance: 'cantidad', cantidad_objetivo: 1100 }), null), { tipo: 'input', valor: '' })
  assert.deepEqual(celdaComentario(act({ estado_operativo: 'bloqueada' }), 'Sin hormigón.'),
    { tipo: 'texto', texto: `Sin hormigón. ${TEXTO_BLOQUEADA}` })
  assert.deepEqual(celdaComentario(act({ impedimentos_abiertos: 1 }), null), { tipo: 'texto', texto: TEXTO_BLOQUEADA })
  assert.deepEqual(celdaComentario(act({ metodo_avance: 'manual', cantidad_objetivo: null }), null), { tipo: 'texto', texto: TEXTO_A_OJO })
  assert.equal(TEXTO_A_OJO, 'Se mide a ojo: no hay cantidad objetivo cargada.')
})

test('la bajada de la fecha grande (M08): «sin parte cargado» o cuántos frentes ya tienen parte', () => {
  assert.equal(bajadaDelDia(0), 'sin parte cargado')
  assert.equal(bajadaDelDia(1), '1 frente con parte')
  assert.equal(bajadaDelDia(3), '3 frentes con parte')
})

test('quién vino: horas, ausente y sin marcar, con el resumen del diseño y la bajada «Cuadrilla 1 · oficial»', () => {
  const chips = chipsDeGente(
    [
      { id: 'p1', nombre_completo: 'QUIROGA Rodolfo', cuadrilla: '1', categoria: 'oficial' },
      { id: 'p2', nombre_completo: 'RUIZ Carlos', cuadrilla: 'Cuadrilla Norte', categoria: 'medio_oficial' },
      { id: 'p3', nombre_completo: 'GÓMEZ Sara', cuadrilla: null, categoria: null },
    ],
    [
      { fecha: '2026-09-07', horas: 9, tipo_hora: 'normal', persona_id: 'p1' },
      { fecha: '2026-09-07', horas: 8, tipo_hora: 'ausencia', persona_id: 'p2' },
      { fecha: '2026-09-06', horas: 9, tipo_hora: 'normal', persona_id: 'p3' },
    ],
    '2026-09-07',
  )
  assert.deepEqual(chips.map((c) => [c.nombre, c.estado, c.horas, c.bajada]), [
    ['R. Quiroga', 'horas', 9, 'Cuadrilla 1 · oficial'],
    ['C. Ruiz', 'ausente', null, 'Cuadrilla Norte · medio oficial'],
    ['S. Gómez', 'sin_marcar', null, 'sin cuadrilla · sin categoría'],
  ])
  assert.equal(resumenGente(chips), '3 esperados · 2 marcados · 1 sin marcar')
  assert.equal(resumenGente(chips, false), '3 esperados · 2 marcados')
  assert.equal(nombreCorto('Ana'), 'Ana')
  assert.equal(bajadaDePersona('2', 'AYUDANTE'), 'Cuadrilla 2 · ayudante')
  assert.equal(cifraHoras(4.5), '4,5')
})

test('los esperados son el plantel asignado a la obra ese día: una persona una vez, sin las asignaciones vencidas', () => {
  const base = { persona_categoria: 'oficial', cuadrilla: null as string | null, desde: null as string | null, hasta: null as string | null }
  const esperados = esperadosDeAsignaciones([
    { ...base, persona_id: 'p1', persona_nombre: 'QUIROGA Rodolfo', cuadrilla: '1' },
    { ...base, persona_id: 'p1', persona_nombre: 'QUIROGA Rodolfo', cuadrilla: '2' },
    { ...base, persona_id: 'p2', persona_nombre: 'ACOSTA Luis', hasta: '2026-09-01' },
    { ...base, persona_id: 'p3', persona_nombre: 'VERA Ana', desde: '2026-09-10' },
    { ...base, persona_id: 'p4', persona_nombre: 'MOLINA Juan', desde: '2026-09-01', hasta: '2026-09-30' },
  ], '2026-09-07')
  assert.deepEqual(esperados.map((e) => [e.id, e.cuadrilla]), [['p4', null], ['p1', '1']])
})

test('el formulario del parte se lee renglón por renglón: producción y comentario; lo ilegible se dice y no se guarda', () => {
  const id = '11111111-1111-1111-1111-111111111111'
  const id2 = '22222222-2222-2222-2222-222222222222'
  const id3 = '33333333-3333-3333-3333-333333333333'
  const leido = leerParteDiario([
    [`produccion_${id}`, '1.500,5'], [`comentario_${id}`, '  faltó cemento '],
    [`produccion_${id2}`, 'abc'], [`comentario_${id2}`, 'x'],
    [`produccion_${id3}`, ''], [`comentario_${id3}`, 'sólo comentario, sin producción'],
    ['produccion_x', '3'], ['fecha', '2026-09-07'],
  ])
  assert.deepEqual(leido.renglones, [{ actividad_id: id, produccion: 1500.5, comentario: 'faltó cemento' }])
  assert.deepEqual(leido.ilegibles, [{ actividad_id: id2, texto: 'abc' }])
  assert.deepEqual(leerParteDiario([[`produccion_${id}`, '70'], [`comentario_${id}`, '   ']]).renglones,
    [{ actividad_id: id, produccion: 70, comentario: null }])
})

test('cantidad escribe cantidad y deja la fracción a la vista; manual escribe fracción declarada', () => {
  assert.deepEqual(filaDeEjecucion('cantidad', 70), { cantidad: 70, avance_pct: null, fraccion: null, declarada: false })
  assert.deepEqual(filaDeEjecucion('manual', 30), { cantidad: null, avance_pct: 30, fraccion: 0.3, declarada: true })
  assert.equal(filaDeEjecucion('manual', 140).fraccion, 1)
})
