import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque, rotuloUbicacion, quienLaMovio, textoVisto, vistoEn, llegoEn, type DatosParque } from './parque.ts'
import { cifras, decisiones, dondeEstaElParque, nombresRepetidos } from './resumen.ts'
import { activo, inc, mov, ubicacion } from './fixture.test-util.ts'

const HOY = new Date('2026-09-21T15:00:00-03:00')

function datos(): DatosParque {
  return {
    ubicaciones: [
      ubicacion({ id: 'u-taller', tipo: 'taller', nombre: 'Taller' }),
      ubicacion({ id: 'u-arcor', tipo: 'obra', obra_id: 'ob-arcor' }),
      ubicacion({ id: 'u-macro', tipo: 'obra', obra_id: 'ob-macro' }),
      ubicacion({ id: 'u-hilux', tipo: 'rodado', activo_id: 'r1' }),
      ubicacion({ id: 'u-bosch', tipo: 'servicio_tecnico', nombre: 'Serv. Técnico Bosch' }),
    ],
    obras: [
      { id: 'ob-arcor', codigo: 'OB-0012', nombre: 'PISOS ARCOR', estado: 'activa', cliente: 'ARCOR' },
      { id: 'ob-macro', codigo: null, nombre: 'MACRO RAWSON', estado: 'activa', cliente: null },
    ],
    activos: [
      activo({ id: 'a1', codigo: 'HER-0001', nombre: 'Amoladora Bosch GWS 22', ubicacion_id: 'u-arcor', estado: 'requiere_mantenimiento', estado_desde: '2026-08-30T12:00:00Z' }),
      activo({ id: 'a2', codigo: 'HER-0002', nombre: 'amoladora  bosch GWS-22', ubicacion_id: 'u-taller', estado_asumido: true }),
      activo({ id: 'a3', codigo: 'HER-0003', nombre: 'Hormigonera 150 L', ubicacion_id: null, estado_asumido: true }),
      activo({ id: 'a4', codigo: 'HER-0004', nombre: 'Einhell TE-AG 125', ubicacion_id: 'u-bosch', estado: 'reparacion_externa', estado_desde: '2026-08-11T12:00:00Z' }),
      activo({ id: 'a5', codigo: 'HER-0005', nombre: 'Escalera', ubicacion_id: 'u-hilux', alta_desde_obra: true, creado_en: '2026-09-20T12:00:00Z' }),
      activo({ id: 'a6', codigo: 'HER-0006', nombre: 'Amoladora Bosch GWS 22', estado: 'baja', baja_motivo: 'robada', baja_en: '2026-07-03T12:00:00Z', ubicacion_id: 'u-macro' }),
      activo({ id: 'r1', codigo: 'ROD-0001', clase: 'rodado', nombre: 'Toyota Hilux', patente: 'NMN898', ubicacion_id: 'u-macro' }),
    ],
    movimientos: [
      mov({ id: 'm1', activo_id: 'a1', destino_id: 'u-taller', fecha_hora: '2026-06-14T12:00:00Z', usuario_texto: 'L. Páez' }),
      mov({ id: 'm2', activo_id: 'a1', origen_id: 'u-taller', destino_id: 'u-arcor', fecha_hora: '2026-08-11T12:00:00Z', usuario_id: 'usr-q' }),
      mov({ id: 'm3', activo_id: 'a2', destino_id: 'u-taller', fecha_hora: '2026-03-01T12:00:00Z', importado: true }),
    ],
    incidencias: [inc({ id: 'i1', activo_id: 'a1', creado_en: '2026-08-30T12:00:00Z' })],
    nombres: { 'usr-q': 'M. Quiroga' },
  }
}

test('cada lugar se nombra por su fuente: la obra por el índice, el rodado por su patente, el vacío como vacío', () => {
  const p = armarParque(datos())
  assert.equal(rotuloUbicacion(p, 'u-arcor'), 'OB-0012 · PISOS ARCOR')
  assert.equal(rotuloUbicacion(p, 'u-macro'), 'MACRO RAWSON', 'sin código: el nombre solo, nunca un código inventado')
  assert.equal(rotuloUbicacion(p, 'u-hilux'), 'Toyota Hilux NMN898')
  assert.equal(rotuloUbicacion(p, 'u-taller'), 'Taller')
  assert.equal(rotuloUbicacion(p, null), 'sin ubicación cargada')
})

test('quién la movió y cuándo se la vio salen del último registro, y «nunca» es nunca', () => {
  const p = armarParque(datos())
  assert.equal(quienLaMovio(p, 'a1'), 'M. Quiroga')
  assert.equal(quienLaMovio(p, 'a3'), null)
  assert.equal(vistoEn(p, 'a1'), '2026-08-30T12:00:00Z', 'el reporte es más nuevo que el movimiento')
  assert.equal(textoVisto(vistoEn(p, 'a3'), HOY), 'nunca')
  assert.equal(textoVisto('2026-09-21T10:00:00-03:00', HOY), 'hoy')
  assert.equal(textoVisto('2026-09-17T10:00:00-03:00', HOY), '4 d')
  assert.equal(llegoEn(p, p.activoPorId.get('a1')!), '2026-08-11T12:00:00Z')
})

test('dónde está el parque: por tipo, sin la baja, y lo sin ubicación aparte y al final', () => {
  const p = armarParque(datos())
  assert.deepEqual(dondeEstaElParque(p), [
    { tipo: 'taller', activos: 1, lugares: 1 },
    { tipo: 'obra', activos: 2, lugares: 2 },
    { tipo: 'rodado', activos: 1, lugares: 1 },
    { tipo: 'servicio_tecnico', activos: 1, lugares: 1 },
    { tipo: 'sin_ubicacion', activos: 1, lugares: 0 },
  ])
})

test('nombres repetidos: ignora mayúsculas, espacios y guiones; la baja no cuenta', () => {
  const g = nombresRepetidos(datos().activos)
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].activos.map((a) => a.codigo), ['HER-0001', 'HER-0002'])
})

test('necesita una decisión: lo que la base sabe, con su cuenta real', () => {
  const p = armarParque(datos())
  const d = decisiones(p, HOY)
  const por = Object.fromEntries(d.map((x) => [x.clave, x.cuenta]))
  assert.deepEqual(por, {
    problema_en_obra: 1, externa_sin_novedad: 1, alta_desde_obra: 1, sin_ubicacion: 1, estado_asumido: 2, repetidos: 1,
  })
})

test('sin nada que decidir, la lista queda vacía (la pantalla dice «Nada pendiente»)', () => {
  const base = datos()
  const p = armarParque({ ...base, activos: [base.activos[6]].map((a) => ({ ...a })) })
  assert.deepEqual(decisiones(p, HOY), [])
})

test('las cifras no confunden «nunca visto» con «visto hace mucho»', () => {
  const c = cifras(armarParque(datos()), HOY)
  assert.equal(c.herramientas, 5)
  assert.equal(c.rodados, 1)
  assert.equal(c.requierenMant, 1)
  assert.equal(c.requierenMantEnObra, 1)
  assert.equal(c.externaMas30, 1)
  assert.equal(c.sinVer90, 1, 'a2 se movió en marzo')
  assert.equal(c.nuncaVistos, 4)
})
