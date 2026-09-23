import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hhDelResumen, asignadosDelResumen,
  antesDeArchivar, frentesEnCurso, hhDeCierre, hhPorRubro, impedimentosQueFrenan, loQueFaltaCargar,
  margenDeCierre, personasHoy, plazoDeObra, plazoFinal, sinMetodoDeMedicion, ultimaActividad,
} from './resumenObra.ts'
import type { Actividad, ParteEjecucion, Restriccion } from '../types/index.ts'

const HOY = '2026-09-07'

const restriccion = (r: Partial<Restriccion>): Restriccion => ({
  id: 'r', obra_id: 'o', actividad_id: null, tipo: 'material', descripcion: 'Hormigón H-30 sin confirmar',
  responsable: 'R. Quiroga', fecha_necesidad: null, fecha_compromiso: null, fecha_liberacion: null,
  estado: 'abierta', ...r,
})

const actividad = (a: Partial<Actividad>): Actividad => ({
  id: 'a', obra_id: 'o', clave: 'a', seccion: null, codigo: null, codigo_padre: null, nombre: 'Relleno',
  tipo: 'tarea', orden: 1, inicio_plan: null, fin_plan: null, dias_plan: null, inicio_real: null,
  fin_real: null, dias_real: null, inicio_base: null, fin_base: null, pct: null, estado: null,
  cuadrilla: null, comentario: null, editado_a_mano: false, fuente_pestana: null, sellada_en: null,
  responsable_id: null, hh_plan: null, archivada: false, creada_en_web: true, rubro: 'Obra gruesa',
  unidad: 'm³', cantidad_objetivo: 1100, metodo_avance: 'cantidad', cuadrilla_id: null,
  cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null, cantidad_ejecutada: 890,
  n_partes: 3, ultimo_parte: null, hh_real: 312, hh_extra: null, n_imputaciones: 0,
  impedimentos_abiertos: 0, avance_pct: 81, origen_avance: 'cantidad', estado_operativo: 'en_curso',
  productividad: null, consumo_hh_pct: null, actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0,
  n_pedidos: 0, ...a,
} as Actividad)

test('lo que frena la obra: los vencidos primero, en rojo; los que comprometen, en ámbar', () => {
  const filas = impedimentosQueFrenan([
    restriccion({ id: 'b', tipo: 'ingenieria_cliente', fecha_compromiso: '2026-09-10', responsable: null }),
    restriccion({ id: 'a', fecha_compromiso: '2026-09-04' }),
    restriccion({ id: 'c', fecha_compromiso: null }),
    restriccion({ id: 'x', estado: 'liberada', fecha_compromiso: '2026-09-01' }),
  ], HOY)
  assert.deepEqual(filas.map((f) => f.id), ['a', 'b', 'c'])
  assert.equal(filas[0].tipo, 'Material')
  assert.deepEqual(filas[0].vencimiento, { texto: 'venció 04/09', tono: 'neg' })
  assert.equal(filas[0].borde, 'neg')
  assert.equal(filas[1].tipo, 'Ingeniería del cliente')
  assert.deepEqual(filas[1].vencimiento, { texto: 'compromete 10/09', tono: 'warn' })
  assert.equal(filas[1].responsable, null)
  assert.deepEqual(filas[2].vencimiento, { texto: 'sin fecha de compromiso', tono: 'faint' })
})

test('el plazo dice +N d en ámbar y de dónde salen las fechas; sin proyección lo dice', () => {
  const dh = { obra_id: 'o', dia_habil_actual: 96, dias_habiles_plan: 104 }
  const p = plazoDeObra({ forecast_fin: '2026-09-21', fecha_fin_plan: '2026-09-05' }, dh)
  assert.equal(p.valor, '+16 d')
  assert.equal(p.tono, 'warn')
  assert.equal(p.bajada, 'día hábil 96 de 104 · fin proyectado 21/09 · plan 05/09')
  const adelantada = plazoDeObra({ forecast_fin: '2026-09-01', fecha_fin_plan: '2026-09-05' }, dh)
  assert.equal(adelantada.valor, '−4 d')
  assert.equal(adelantada.tono, 'pos')
  const sinProy = plazoDeObra({ forecast_fin: null, fecha_fin_plan: '2026-09-05' }, null)
  assert.equal(sinProy.valor, null)
  assert.equal(sinProy.falta, 'sin proyección')
  assert.equal(sinProy.bajada, 'sin inicio real · plan 05/09')
  assert.equal(plazoDeObra({ forecast_fin: null, fecha_fin_plan: null }, null).falta, 'sin plan')
})

test('el plazo final de una obra terminada compara fin real contra plan', () => {
  const p = plazoFinal({ fecha_fin_real: '2026-09-14', fecha_fin_plan: '2026-09-05' })
  assert.deepEqual([p.valor, p.tono, p.bajada], ['+9 d', 'warn', 'terminó 14/09 · plan 05/09'])
  assert.equal(plazoFinal({ fecha_fin_real: null, fecha_fin_plan: '2026-09-05' }).falta, 'sin fin real')
})

test('personas hoy y HH de cierre nunca dibujan un cero por un dato que falta', () => {
  assert.deepEqual(personasHoy({ asignadas: 14, presentes: 12 }).valor, '12 de 14')
  assert.equal(personasHoy({ asignadas: 14, presentes: 12 }).bajada, '2 sin fichar')
  assert.equal(personasHoy(null).valor, null)
  assert.equal(personasHoy({ asignadas: 5, presentes: null }).falta, 'sin fichadas')
  const hh = hhDeCierre({ hh_real: 6734, hh_plan: 6420 })
  assert.equal(hh.valor, '6.734')
  assert.equal(hh.bajada, 'plan 6.420 · +4,9 %')
  assert.equal(hhDeCierre({ hh_real: null, hh_plan: 6420 }).falta, 'sin imputar')
})

test('los frentes en curso: en curso o bloqueadas, con la medición y la gente de hoy', () => {
  const filas = frentesEnCurso([
    actividad({ id: 'r', nombre: 'Relleno y compactación' }),
    actividad({ id: 'h', nombre: 'Hormigonado losa', metodo_avance: 'partes', avance_pct: 60, estado_operativo: 'bloqueada', hh_real: 96, cantidad_objetivo: null }),
    actividad({ id: 'l', nombre: 'Llaneado', metodo_avance: 'manual', avance_pct: 30, hh_real: null }),
    actividad({ id: 'p', nombre: 'Pendiente', avance_pct: 0, estado_operativo: 'pendiente', cantidad_ejecutada: 0 }),
    actividad({ id: 'hecha', avance_pct: 100, estado_operativo: 'hecha' }),
    actividad({ id: 'sub', actividad_padre_id: 'r' }),
    actividad({ id: 'res', tipo: 'resumen' }),
  ], { r: 4, l: 2 })
  assert.deepEqual(filas.map((f) => f.id), ['r', 'h', 'l'])
  assert.deepEqual(filas[0].avance, { pct: '81%', detalle: '890/1.100 m³', tono: 'ink' })
  assert.equal(filas[0].medicion.texto, 'Cantidad')
  assert.equal(filas[0].hhReal, '312')
  assert.equal(filas[0].gente, 4)
  assert.equal(filas[1].bloqueada, true)
  assert.equal(filas[1].avance.detalle, 'de 3 partes')
  assert.equal(filas[1].gente, null)
  assert.deepEqual(filas[2].medicion, { texto: 'Manual', tono: 'warn' })
  assert.equal(filas[2].avance.detalle, 'lo declaró una persona')
  assert.equal(filas[2].hhReal, null)
})

test('lo que falta cargar: cada renglón con su número y en ámbar sólo cuando hay algo que cargar', () => {
  const filas = loQueFaltaCargar({
    historiasSinCosto: 2, actividadesSinFecha: 7, sinMetodo: 0, dependencias: 4, actividades: 42, selladas: null,
  })
  assert.deepEqual(filas.map((f) => [f.rotulo, f.valor, f.tono]), [
    ['Historias sin costo de MO', '2 · no pesan', 'warn'],
    ['Actividades sin ninguna fecha', '7', 'warn'],
    ['Sin método de medición', '0', 'faint'],
    ['Dependencias cargadas', '4 de 42', 'faint'],
    ['Línea base', 'sin sellar · copia del plan', 'faint'],
  ])
  const sinAvance = loQueFaltaCargar({ historiasSinCosto: null, actividadesSinFecha: 0, sinMetodo: 1, dependencias: null, actividades: 3, selladas: 3 })
  assert.equal(sinAvance[0].rotulo, 'Actividades sin ninguna fecha')
  assert.equal(sinAvance.find((f) => f.clave === 'dependencias')!.valor, 'sin leer')
  assert.equal(sinAvance.find((f) => f.clave === 'linea-base')!.valor, '3 selladas')
  assert.equal(sinMetodoDeMedicion([
    actividad({ metodo_avance: null as unknown as 'manual' }), actividad({}), actividad({ tipo: 'resumen', metodo_avance: null as unknown as 'manual' }),
  ]), 1)
})

test('la última actividad: los tres partes más nuevos, con actividad y cantidad', () => {
  const parte = (p: Partial<ParteEjecucion>): ParteEjecucion => ({
    id: 'p', obra_id: 'o', actividad_id: 'r', fecha: '2026-09-07', cantidad: 180, avance_pct: null,
    comentario: null, fuente: 'web', creado_en: '2026-09-07T10:00:00Z', ...p,
  })
  const eventos = ultimaActividad([
    parte({ id: '1', fecha: '2026-09-05' }),
    parte({ id: '2', fecha: '2026-09-07', actividad_id: 'm', cantidad: 180 }),
    parte({ id: '3', fecha: '2026-09-04', cantidad: null, avance_pct: 30, actividad_id: 'zz' }),
    parte({ id: '4', fecha: '2026-09-01' }),
  ], new Map([['r', { nombre: 'Relleno', unidad: 'm³' }], ['m', { nombre: 'Armado de malla', unidad: 'm²' }]]))
  assert.deepEqual(eventos, [
    { fecha: '07/09', texto: 'Parte de Armado de malla — 180 m²' },
    { fecha: '05/09', texto: 'Parte de Relleno — 180 m³' },
    { fecha: '04/09', texto: 'Parte de actividad sin nombre — 30 %' },
  ])
})

test('Z01: las HH por rubro salen de obra_actividad_hh y el desvío sólo con las dos puntas', () => {
  const acts = [actividad({ id: 'a', rubro: 'Obra gruesa' }), actividad({ id: 'b', rubro: 'Obra gruesa' }), actividad({ id: 'c', rubro: 'Juntas' })]
  const hh = (actividad_id: string, hh_plan: number | null, hh_real: number | null) => ({
    actividad_id, obra_id: 'o', nombre: '', tipo: 'tarea', orden: 1, avance_pct: null, hh_plan, hh_real,
    hh_extra: null, n_imputaciones: 0, desvio_pct: null, consumo_plan_pct: null,
  })
  const filas = hhPorRubro(acts, [hh('a', 1000, 1064), hh('b', 900, 900), hh('c', null, 40)])
  assert.equal(filas.length, 2)
  assert.deepEqual(filas[0], { rubro: 'Obra gruesa', plan: 1900, real: 1964, desvioPct: (64 / 1900) * 100 })
  assert.deepEqual(filas[1], { rubro: 'Juntas', plan: null, real: 40, desvioPct: null })
})

test('Z01: el checklist no bloquea y cada paso dice qué falta y adónde ir', () => {
  const pasos = antesDeArchivar({
    obraId: 'o', impedimentosAbiertos: 1, ultimoParte: { fecha: '14/09', actividad: 'Llaneado', pct: 100 },
    certificado: 231000000, cobrado: 231000000, papelesSinClasificar: 7, subcontratos: { total: 2, cerrados: 2 },
  })
  assert.deepEqual(pasos.map((p) => [p.clave, p.ok]), [
    ['impedimentos', false], ['partes', true], ['certificados', true], ['papeles', false], ['subcontratos', true],
  ])
  assert.equal(pasos[0].accion?.href, '/obras/o?vista=operacion&sub=impedimentos')
  assert.equal(pasos[1].texto, 'último 14/09 · Llaneado 100 %')
  assert.equal(pasos[3].accion?.texto, 'Clasificar')
  const vacio = antesDeArchivar({ obraId: 'o', impedimentosAbiertos: 0, ultimoParte: null, certificado: null, cobrado: null, papelesSinClasificar: null, subcontratos: null })
  assert.equal(vacio.length, 3)
  assert.equal(vacio[2].texto, 'sin certificar')
})

test('Z01: el margen sin costo objetivo no es un número', () => {
  assert.deepEqual(margenDeCierre({ monto_contratado: 231, costo_presupuestado: null, costo_real: 181 }), { texto: 'sin base · costo objetivo sin cargar', tono: 'faint' })
  assert.equal(margenDeCierre({ monto_contratado: 200, costo_presupuestado: 150, costo_real: 180 }).texto, '10 % sobre contrato')
})

test('HH del Resumen: misma cuenta que Personal, sin ausencias, con la semana debajo', () => {
  const r = (fecha_inicio_semana: string, horas: number, tipo_hora = 'normal') => ({ persona_id: 'p', fecha_inicio_semana, horas, tipo_hora })
  const c = hhDelResumen([r('2026-09-21', 9), r('2026-09-21', 9), r('2026-09-14', 45), r('2026-09-14', 9, 'ausencia')], '2026-09-23')
  assert.equal(c.valor, '63')
  assert.equal(c.bajada, '18 esta semana')
  assert.equal(hhDelResumen([], '2026-09-23').falta, 'sin horas cargadas')
  assert.equal(hhDelResumen(null, '2026-09-23').falta, 'no se pudo leer')
  assert.equal(hhDelResumen([r('2026-09-14', 45)], '2026-09-23').bajada, 'sin horas esta semana')
})

test('Asignados del Resumen: sólo las vigentes; nadie asignado no es 0', () => {
  assert.equal(asignadosDelResumen([{ hasta: null }, { hasta: null }, { hasta: '2026-09-01' }]).valor, '2')
  assert.equal(asignadosDelResumen([{ hasta: '2026-09-01' }]).falta, 'nadie asignado')
  assert.equal(asignadosDelResumen(null).falta, 'no se pudo leer')
})
