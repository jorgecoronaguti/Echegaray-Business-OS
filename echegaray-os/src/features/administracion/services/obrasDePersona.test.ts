import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  obrasTrabajadas, pareceSlug, rotuloDeObra, tramosProgramadosDe,
} from './obrasDePersona.ts'
import type { ImputacionHH } from '../types/index.ts'

const r = (p: Partial<ImputacionHH>): ImputacionHH => ({
  id: p.id ?? `${p.fecha}-${p.obra_canonica_id ?? 'x'}-${p.tipo_hora ?? 'normal'}`,
  fecha: '2026-09-07', fecha_inicio_semana: '2026-09-07',
  obra_canonica_id: 'estrella', obra_nombre: 'La Estrella Galpón 9',
  actividad_id: null, actividad_nombre: null,
  horas: 8, tipo_hora: 'normal', notas: null, fuente_legacy: 'sheet:jornales',
  creado_en: null, cargo: null, corregido_en: null, corrigio: null, ...p,
})

// Tres obras, dos cerradas: el caso del dueño. La Estrella Galpón 9 y SF Mampostería cerraron;
// PISOS INDUSTRIALES sigue activa y es la de la asignación vigente.
const TRES = [
  r({ fecha: '2026-06-10', obra_canonica_id: 'estrella', horas: 9 }),
  r({ fecha: '2026-06-11', obra_canonica_id: 'estrella', horas: 9 }),
  r({ fecha: '2026-07-20', obra_canonica_id: 'sf', obra_nombre: 'sf-mamposteria', horas: 8 }),
  r({ fecha: '2026-09-01', obra_canonica_id: 'pisos', obra_nombre: 'PISOS INDUSTRIALES', horas: 9 }),
  r({ fecha: '2026-09-02', obra_canonica_id: 'pisos', obra_nombre: 'PISOS INDUSTRIALES', horas: 9 }),
]
const CATALOGO = {
  estrella: { nombre: 'La Estrella Galpón 9', cliente: 'La Estrella', estado: 'cerrada' },
  sf: { nombre: 'sf-mamposteria', cliente: 'San Francisco', estado: 'finalizada' },
  pisos: { nombre: 'PISOS INDUSTRIALES', cliente: 'ARCOR', estado: 'activa' },
}

test('LAS OBRAS CERRADAS SE VEN — son la mitad del historial de una persona', () => {
  // El defecto que atrapa: filtrar por `estado = activa`, que es lo correcto donde se ELIGE una
  // obra y es exactamente lo que borraría el historial donde se LEE lo que pasó.
  const obras = obrasTrabajadas(TRES, { obras: CATALOGO, obraVigente: 'pisos' })
  assert.equal(obras.length, 3)
  assert.deepEqual(obras.map((o) => o.activa), [true, false, false])
})

test('LA VIGENTE VA PRIMERA Y EL RESTO POR ÚLTIMO DÍA, DE LA MÁS RECIENTE A LA MÁS VIEJA', () => {
  const obras = obrasTrabajadas(TRES, { obras: CATALOGO, obraVigente: 'pisos' })
  assert.deepEqual(obras.map((o) => o.id), ['pisos', 'sf', 'estrella'])
  // Sin asignación vigente manda el último día, y el orden no cambia acá porque «pisos» también es
  // la más reciente. Con una vigente vieja, sí cambia: se prueba abajo.
  assert.deepEqual(
    obrasTrabajadas(TRES, { obras: CATALOGO, obraVigente: 'estrella' }).map((o) => o.id),
    ['estrella', 'pisos', 'sf'],
  )
})

test('EL RÓTULO NUNCA ES UN SLUG: cae al CLIENTE', () => {
  // El defecto que atrapa: escribir `sf-mamposteria` en la ficha. El dueño: «jamás el slug».
  const obras = obrasTrabajadas(TRES, { obras: CATALOGO, obraVigente: 'pisos' })
  assert.equal(obras.find((o) => o.id === 'sf')?.nombre, 'San Francisco')
  assert.equal(obras.find((o) => o.id === 'estrella')?.nombre, 'La Estrella Galpón 9',
    'un nombre real NO se reemplaza por el cliente')
  assert.equal(pareceSlug('sf-mamposteria'), true)
  assert.equal(pareceSlug('la-estrella-galpon-9'), true)
  assert.equal(pareceSlug('La Estrella Galpón 9'), false)
  assert.equal(pareceSlug('MAMPOSTERÍA'), false)
  // Sin catálogo se usa el nombre que viene con las horas; sin cliente tampoco se inventa nada.
  assert.equal(rotuloDeObra('x', undefined, 'MAMPOSTERÍA'), 'MAMPOSTERÍA')
  assert.equal(rotuloDeObra('x', { nombre: 'sf-mamposteria', cliente: null, estado: null }, null),
    'sf-mamposteria', 'sin cliente se muestra lo que hay, nunca el id')
  assert.equal(rotuloDeObra('x', undefined, null), 'obra sin nombre cargado')
})

test('LAS CIFRAS DE CADA OBRA SON DÍAS DISTINTOS Y HORAS TRABAJADAS, no filas', () => {
  const obras = obrasTrabajadas([
    r({ fecha: '2026-06-10', obra_canonica_id: 'estrella', horas: 8 }),
    r({ fecha: '2026-06-10', obra_canonica_id: 'estrella', horas: 2, tipo_hora: 'extra_50' }),
    r({ fecha: '2026-06-11', obra_canonica_id: 'estrella', horas: 9 }),
    r({ fecha: '2026-06-12', obra_canonica_id: 'estrella', horas: 9, tipo_hora: 'ausencia' }),
  ], { obras: CATALOGO })
  assert.equal(obras[0].dias, 2, 'normal + extra el mismo día es UN día')
  assert.equal(obras[0].horas, 19, 'la ausencia no es trabajo')
  assert.equal(obras[0].primer, '2026-06-10')
  assert.equal(obras[0].ultimo, '2026-06-11', 'el último día TRABAJADO, no el de la ausencia')
})

test('UNA OBRA DONDE SÓLO HAY AUSENCIAS NO ES UNA OBRA DONDE TRABAJÓ', () => {
  // El defecto que atrapa: publicar «La Estrella · 0 HH», que afirma un trabajo que no ocurrió.
  const obras = obrasTrabajadas([
    r({ fecha: '2026-06-12', obra_canonica_id: 'estrella', horas: 9, tipo_hora: 'ausencia' }),
  ], { obras: CATALOGO })
  assert.equal(obras.length, 0)
})

test('UNA OBRA QUE NO SE PUDO LEER NO SE DECLARA CERRADA', () => {
  // El defecto que atrapa: `estado !== 'activa'` sobre un catálogo incompleto. Un control que no
  // pudo mirar no dice «no está»: `activa` queda en null y la pantalla no pinta el estado.
  const obras = obrasTrabajadas(TRES, { obras: { pisos: CATALOGO.pisos } })
  assert.equal(obras.find((o) => o.id === 'sf')?.activa, null)
  assert.equal(obras.find((o) => o.id === 'pisos')?.activa, true)
})

test('UNA PERSONA SIN REGISTROS NO TIENE OBRAS INVENTADAS', () => {
  assert.deepEqual(obrasTrabajadas([]), [])
  // Ni las filas sin obra ni las sin día entran: de una fila sin obra no se puede decir dónde
  // trabajó, y de una sin día no se puede decir cuándo.
  assert.deepEqual(obrasTrabajadas([r({ obra_canonica_id: null })]), [])
  assert.deepEqual(obrasTrabajadas([r({ fecha: null })]), [])
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LO PROGRAMADO SE SEPARA DE LO TRABAJADO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const HOY = '2026-09-11'

const a = (p: Partial<Parameters<typeof tramosProgramadosDe>[0][number]>) => ({
  id: p.id ?? 't1', obra_id: p.obra_id ?? 'pisos', obra_nombre: p.obra_nombre ?? null,
  desde: p.desde ?? null, hasta: p.hasta ?? null,
})

test('UN TRAMO PROGRAMADO NO ENTRA A «DÓNDE TRABAJÓ»: no tiene horas y no se le inventa un 0 HH', () => {
  // EL DEFECTO QUE ATRAPA: la lista de obras se arma desde `registros_hh`, así que un pase que
  // todavía no ocurrió no aparece en ningún lado de la ficha. La tentación es meterlo en esa misma
  // lista, y ahí habría que darle un número de horas que no existe. Son dos listas.
  const trabajadas = obrasTrabajadas(TRES, { obras: CATALOGO, obraVigente: 'pisos' })
  assert.deepEqual(trabajadas.map((o) => o.id), ['pisos', 'sf', 'estrella'])
  const programados = tramosProgramadosDe(
    [a({ id: 'futuro', obra_id: 'estrella', desde: '2026-10-01' })], HOY, CATALOGO,
  )
  assert.equal(programados.length, 1, 'el pase existe…')
  assert.equal(trabajadas.length, 3, '…y NO se coló en la lista de horas')
  assert.equal('horas' in programados[0], false, 'un tramo programado no publica horas')
})

test('SÓLO LO QUE EMPIEZA DESPUÉS DE HOY, y ordenado del más próximo al más lejano', () => {
  const t = tramosProgramadosDe([
    a({ id: 'viejo', obra_id: 'estrella', desde: '2026-06-01', hasta: '2026-06-30' }),
    a({ id: 'vigente', obra_id: 'pisos', desde: '2026-09-01' }),
    a({ id: 'hoy', obra_id: 'sf', desde: HOY }),
    a({ id: 'lejos', obra_id: 'estrella', desde: '2026-10-20' }),
    a({ id: 'cerca', obra_id: 'sf', desde: '2026-09-14', hasta: '2026-09-16' }),
  ], HOY, CATALOGO)
  // El que arranca HOY no es un plan: ya rige, y el bloque de arriba lo publica como su obra.
  assert.deepEqual(t.map((x) => x.id), ['cerca', 'lejos'])
  assert.deepEqual(t.map((x) => x.hasta), ['2026-09-16', null])
})

test('EL NOMBRE NUNCA ES UN SLUG — misma regla que la lista de obras trabajadas', () => {
  // `sf-mamposteria` es el `obra_canonica.nombre` real de la base. El dueño: «jamás el slug».
  const t = tramosProgramadosDe(
    [a({ id: 'x', obra_id: 'sf', obra_nombre: 'sf-mamposteria', desde: '2026-10-01' })],
    HOY, CATALOGO,
  )
  assert.equal(t[0].nombre, 'San Francisco')
})

test('sin tramos futuros la lista es vacía — y el bloque entonces no se dibuja', () => {
  assert.deepEqual(tramosProgramadosDe([a({ desde: '2026-09-01' })], HOY, CATALOGO), [])
})
