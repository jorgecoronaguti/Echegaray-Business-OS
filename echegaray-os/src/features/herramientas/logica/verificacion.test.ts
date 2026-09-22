import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { armarParque } from './parque.ts'
import { historial } from './historial.ts'
import {
  ITEMS, chequearLectura, completo, enMal, esCritico, estadoVerificacion, leerNumero, seVerifica, sinVerificarHoy,
  textoLectura, textoVerificacion, ultimaLectura, verificacionDe,
} from './verificacion.ts'
import { activo } from './fixture.test-util.ts'
import type { LecturaUso } from '../types.ts'

// 22/09/2026 18:00 en San Juan (21:00 UTC).
const HOY = new Date('2026-09-22T18:00:00-03:00')

const lec = (p: Partial<LecturaUso> & Pick<LecturaUso, 'id' | 'activo_id' | 'fecha_hora'>): LecturaUso => ({
  unidad: 'km', lectura: null, checklist: {}, criticos_mal: [], observacion: null, operador_persona_id: null,
  usuario_id: 'u', incidencia_id: null, estado_resultante: 'operativo', ...p,
})

test('los ítems críticos son los del pedido: frenos/dirección y luces/alarma en rodado; guardas, corte y alarma en equipo', () => {
  assert.deepEqual(ITEMS.rodado.filter((i) => i.critico).map((i) => i.clave), ['frenos_direccion', 'luces_alarma'])
  assert.deepEqual(ITEMS.equipo.filter((i) => i.critico).map((i) => i.clave), ['guardas', 'corte_emergencia', 'alarma_retroceso'])
  assert.equal(esCritico('rodado', 'cubiertas_fluidos'), false)
  assert.equal(esCritico('rodado', 'matafuego_auxilio_botiquin'), false)
  assert.equal(esCritico('equipo', 'combustible_perdidas'), false)
  assert.equal(esCritico('rodado', 'guardas'), false, 'un ítem de equipo no es crítico en un rodado')
})

test('la lista de la pantalla es la misma que la de la base (bloque ITEMS-VERIFICACION de la migración)', () => {
  const ruta = fileURLToPath(new URL('../../../../supabase/migrations/20260922T1200_activo_verificacion_uso.sql', import.meta.url))
  const sql = readFileSync(ruta, 'utf8')
  const tramo = sql.split('-- ITEMS-VERIFICACION:inicio')[1]?.split('-- ITEMS-VERIFICACION:fin')[0]
  assert.ok(tramo, 'la migración tiene el bloque marcado')
  for (const clase of ['rodado', 'equipo'] as const) {
    const m = tramo.match(new RegExp(`when '${clase}' then '(\\[[\\s\\S]*?\\])'::jsonb`))
    assert.ok(m, `la migración define los ítems de ${clase}`)
    const base = JSON.parse(m[1]) as { clave: string; critico: boolean }[]
    assert.deepEqual(
      base.map((i) => [i.clave, i.critico]),
      ITEMS[clase].map((i) => [i.clave, i.critico]),
      `${clase}: mismas claves, mismo orden, mismos críticos`,
    )
  }
})

test('enMal separa lo que saca de servicio de lo que sólo reporta; completo exige las cuatro', () => {
  const r = { frenos_direccion: 'bien', luces_alarma: 'mal', cubiertas_fluidos: 'mal', matafuego_auxilio_botiquin: 'bien' } as const
  const m = enMal('rodado', r)
  assert.deepEqual(m.criticos.map((i) => i.clave), ['luces_alarma'])
  assert.deepEqual(m.otros.map((i) => i.clave), ['cubiertas_fluidos'])
  assert.equal(completo('rodado', r), true)
  assert.equal(completo('rodado', { ...r, matafuego_auxilio_botiquin: undefined }), false)
  assert.deepEqual(enMal('equipo', { guardas: 'bien', corte_emergencia: 'bien', alarma_retroceso: 'bien', combustible_perdidas: 'mal' }).criticos, [])
})

test('se verifican rodados y equipos vivos; ni herramientas ni bajas', () => {
  assert.equal(seVerifica({ clase: 'rodado', estado: 'operativo' }), true)
  assert.equal(seVerifica({ clase: 'equipo', estado: 'fuera_servicio' }), true)
  assert.equal(seVerifica({ clase: 'herramienta', estado: 'operativo' }), false)
  assert.equal(seVerifica({ clase: 'rodado', estado: 'baja' }), false)
})

test('estado de la verificación: hoy con hora de San Juan, ayer, hace n días, nunca, sin la migración', () => {
  assert.equal(textoVerificacion(estadoVerificacion('2026-09-22T10:40:00Z', HOY)), 'hoy 07:40')
  // 23:30 del 21 en San Juan es 02:30 UTC del 22: es AYER, no hoy.
  assert.equal(textoVerificacion(estadoVerificacion('2026-09-22T02:30:00Z', HOY)), 'ayer')
  assert.equal(textoVerificacion(estadoVerificacion('2026-09-19T12:00:00Z', HOY)), 'hace 3 d')
  assert.equal(textoVerificacion(estadoVerificacion(null, HOY)), 'nunca')
  assert.equal(textoVerificacion(estadoVerificacion(undefined, HOY)), 'sin la migración')
})

test('salto de km: el que baja es error; el que supera 1.200 km por día se avisa; menos de un día cuenta como uno', () => {
  const ant = { valor: 148_180, fecha: '2026-09-20T12:00:00Z' }
  assert.deepEqual(chequearLectura(148_100, ant, 'km', HOY), { tipo: 'baja', anterior: 148_180, fecha: ant.fecha })
  assert.equal(chequearLectura(148_220, ant, 'km', HOY).tipo, 'ok')
  assert.equal(chequearLectura(148_180, ant, 'km', HOY).tipo, 'ok', 'el mismo km no es error')
  // 2 días y 9 h → 3 días → tope 3.600 km.
  assert.equal(chequearLectura(148_180 + 3_600, ant, 'km', HOY).tipo, 'ok')
  const s = chequearLectura(148_180 + 3_601, ant, 'km', HOY)
  assert.equal(s.tipo, 'salto')
  assert.equal(s.tipo === 'salto' && s.tope, 3_600)
  // Un tipeo con un cero de más: 1.482.200.
  assert.equal(chequearLectura(1_482_200, ant, 'km', HOY).tipo, 'salto')
  // Horas: en 2 h desde la última no se pueden sumar 30 h de horómetro.
  const h = chequearLectura(442, { valor: 412, fecha: '2026-09-22T19:00:00Z' }, 'h', HOY)
  assert.equal(h.tipo, 'salto')
  assert.equal(chequearLectura(430, { valor: 412, fecha: '2026-09-22T19:00:00Z' }, 'h', HOY).tipo, 'ok')
  assert.equal(chequearLectura(null, ant, 'km', HOY).tipo, 'ok', 'sin lectura no hay salto')
  assert.equal(chequearLectura(10, null, 'km', HOY).tipo, 'ok', 'la primera lectura no tiene contra qué')
})

test('lo que se tipea: «148.220», «148220» y «412,5»; lo ilegible es null, no cero', () => {
  assert.equal(leerNumero('148.220'), 148_220)
  assert.equal(leerNumero('148220'), 148_220)
  assert.equal(leerNumero(' 148.220 km'), 148_220)
  assert.equal(leerNumero('412,5'), 412.5)
  assert.equal(leerNumero('412 h'), 412)
  assert.equal(leerNumero(''), null)
  assert.equal(leerNumero('148,22'), null, 'dos decimales no: el horómetro marca décimas')
  assert.equal(leerNumero('14.82.20'), null)
  assert.equal(leerNumero('-5'), null)
})

test('km actual = la última lectura CARGADA; sin la tabla, «sin verificar hoy» no es un número', () => {
  const r1 = activo({ id: 'r1', codigo: 'TOY-001', nombre: 'Hilux', clase: 'rodado' })
  const r2 = activo({ id: 'r2', codigo: 'FOR-001', nombre: 'F100', clase: 'rodado' })
  const e1 = activo({ id: 'e1', codigo: 'COM-001', nombre: 'Compactadora', clase: 'equipo' })
  const h1 = activo({ id: 'h1', codigo: 'AMO-001', nombre: 'Amoladora' })
  const b1 = activo({ id: 'b1', codigo: 'FIA-001', nombre: 'Fiorino', clase: 'rodado', estado: 'baja', baja_motivo: 'vendida', baja_en: '2026-09-01T00:00:00Z' })
  const base = { ubicaciones: [], obras: [], movimientos: [], incidencias: [], nombres: {}, activos: [r1, r2, e1, h1, b1] }

  const sinTabla = armarParque(base)
  assert.equal(sinVerificarHoy(sinTabla, HOY), null)
  assert.equal(verificacionDe(sinTabla, 'r1', HOY).tipo, 'sin_base')

  const p = armarParque({
    ...base,
    lecturas: [
      lec({ id: 'a', activo_id: 'r1', fecha_hora: '2026-09-20T12:00:00Z', lectura: 148_180 }),
      lec({ id: 'b', activo_id: 'r1', fecha_hora: '2026-09-22T10:40:00Z', lectura: null }),
      lec({ id: 'c', activo_id: 'e1', fecha_hora: '2026-09-21T12:00:00Z', unidad: 'h', lectura: 412 }),
    ],
  })
  assert.deepEqual(ultimaLectura(p, 'r1'), { valor: 148_180, fecha: '2026-09-20T12:00:00Z' }, 'una verificación sin km no borra el km')
  assert.equal(textoLectura(ultimaLectura(p, 'r1'), 'km'), '148.180 km')
  assert.equal(textoLectura(ultimaLectura(p, 'r2'), 'km'), 'sin cargar')
  assert.equal(textoVerificacion(verificacionDe(p, 'r1', HOY)), 'hoy 07:40')
  assert.equal(textoVerificacion(verificacionDe(p, 'r2', HOY)), 'nunca')
  // r1 verificado hoy; r2 nunca; e1 ayer. La herramienta y la baja no cuentan.
  assert.deepEqual(sinVerificarHoy(p, HOY), { sin: 2, de: 3 })
})

test('el historial de la ficha muestra la verificación con su km, lo que estuvo mal y quién operó', () => {
  const r1 = activo({ id: 'r1', codigo: 'TOY-001', nombre: 'Hilux', clase: 'rodado' })
  const p = armarParque({
    ubicaciones: [], obras: [], movimientos: [], incidencias: [], nombres: { u: 'R. Sosa' }, personas: { per: 'D. Luna' },
    activos: [r1],
    lecturas: [
      lec({ id: 'a', activo_id: 'r1', fecha_hora: '2026-09-22T10:40:00Z', lectura: 148_220 }),
      lec({ id: 'b', activo_id: 'r1', fecha_hora: '2026-08-26T10:00:00Z', lectura: 139_880, observacion: 'luz de tablero encendida',
        checklist: { frenos_direccion: 'bien', luces_alarma: 'bien', cubiertas_fluidos: 'mal', matafuego_auxilio_botiquin: 'bien' },
        operador_persona_id: 'per' }),
    ],
  })
  const v = historial(p, 'r1').filter((x) => x.tipo === 'verificacion').map((x) => x.texto)
  assert.deepEqual(v, [
    'Verificación de uso · sin observaciones · 148.220 km · R. Sosa',
    'Verificación de uso · mal en cubiertas y fluidos · «luz de tablero encendida» · 139.880 km · D. Luna',
  ])
})
