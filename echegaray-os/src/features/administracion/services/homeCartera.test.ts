import test from 'node:test'
import assert from 'node:assert/strict'
import type { ClientePanel } from '@/features/clientes/types'
import {
  armarCartera, certificacionDe, diaRelativo, hoyEnLaEmpresa,
  type FilaCertificado, type ObraDeCartera,
} from './homeCartera.ts'

// LA CARTERA DE LA ENTRADA. Lo que estas pruebas impiden: que un `null` se dibuje como cero, que
// una lectura fallida se dibuje como «no hay», y que la obra cuelgue del cliente equivocado.

const cliente = (p: Partial<ClientePanel> & { cliente_id: string }): ClientePanel => ({
  slug: p.cliente_id, nombre_comercial: 'Cliente', razon_social: null, cuit: '30-1-2',
  direccion: null, telefono: null, email: null, responsable_id: null, responsable_nombre: null,
  drive_carpeta_id: null, activo: true, notas: null, n_obras: 1, n_obras_activas: 1,
  contratado: 1_000_000, costo_real: null, restricciones_abiertas: 0, avance_sincronizado_en: null,
  n_contactos: 0, n_documentos: 0, ...p,
})

const obra = (p: Partial<ObraDeCartera> & { obra_id: string }): ObraDeCartera => ({
  nombre: p.obra_id, cliente_id: 'c1', avance_pct: 50, jefe_obra: 'S. Ledesma',
  monto_contratado: 500_000, ...p,
})

test('la obra cuelga de SU cliente, y de ninguno más', () => {
  const filas = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' }), cliente({ cliente_id: 'c2' })],
    obras: [obra({ obra_id: 'o1', cliente_id: 'c1' }), obra({ obra_id: 'o2', cliente_id: 'c2' })],
    partes: new Map(), certificados: [],
  })
  assert.deepEqual(filas.map((c) => c.enCurso.map((o) => o.obra_id)), [['o1'], ['o2']])
})

test('una obra sin cliente no se cuelga de nadie ni se pierde de vista en otro lado', () => {
  const filas = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'huerfana', cliente_id: null })],
    partes: new Map(), certificados: [],
  })
  assert.deepEqual(filas[0].enCurso, [])
})

test('`avance_pct` NULL NO es 0 %, y `monto_contratado` NULL no es $ 0', () => {
  // Una obra sin avance sincronizado no avanzó cero por ciento: no se sabe. Y una obra sin contrato
  // cargado no se contrató en cero — eso ES trabajo pendiente y la fila tiene que decirlo.
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', cuit: '30-1-2' })],
    obras: [obra({ obra_id: 'o1', avance_pct: null, monto_contratado: null, jefe_obra: null })],
    partes: new Map(), certificados: [],
  })
  assert.equal(c.enCurso[0].avance, null)
  assert.equal(c.enCurso[0].contratado, null)
  assert.equal(c.enCurso[0].jefe, null, 'un jefe en blanco no es un nombre')
  assert.equal(c.avisoCorto, 'obra sin contrato')
})

test('el aviso del CUIT le gana al del contrato: sin CUIT no se factura', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', cuit: null })],
    obras: [obra({ obra_id: 'o1', monto_contratado: null })],
    partes: new Map(), certificados: [],
  })
  assert.equal(c.avisoCorto, 'sin CUIT')
  assert.match(c.aviso ?? '', /no se le puede facturar/)
})

// ═══ CERTIFICACIÓN ═══

const cert = (p: Partial<FilaCertificado>): FilaCertificado => ({
  obra_canonica_id: 'o1', numero: '2', fecha_certificacion: null, fecha_facturacion: null,
  fecha_cobranza: null, ...p,
})

test('sin certificados cargados dice «sin certificar»; sin LEERLOS dice otra cosa', () => {
  // Medido el 25/08: `certificados` está vacía. Con la tabla vacía, «sin certificar» es cierto. Si
  // la LECTURA falla, afirmar lo mismo sería un control que no pudo mirar diciendo «no está».
  assert.deepEqual(certificacionDe([], 'o1'), { texto: 'sin certificar', reclama: false })
  assert.deepEqual(certificacionDe(null, 'o1'), { texto: 'certificación sin leer', reclama: true })
})

test('el estado es la fecha MÁS AVANZADA que existe, y no se inventa un vencimiento', () => {
  assert.equal(certificacionDe([cert({ fecha_certificacion: '2026-08-01' })], 'o1').texto, 'cert. 2 certificado')
  assert.equal(
    certificacionDe([cert({ fecha_certificacion: '2026-08-01', fecha_facturacion: '2026-08-05' })], 'o1').texto,
    'cert. 2 facturado',
  )
  assert.equal(
    certificacionDe([cert({ fecha_certificacion: '2026-08-01', fecha_cobranza: '2026-08-20' })], 'o1').texto,
    'cert. 2 cobrado',
  )
  // El mockup escribe «cert. 2 vencido 12 d». NINGUNA tabla guarda el vencimiento de un certificado:
  // certificación, facturación y cobranza son hechos, no plazos. Un «vencido» calculado sobre un
  // hecho es un dato inventado, y por eso no existe ese texto.
  const todos = ['2026-08-01', null].map((f) => certificacionDe([cert({ fecha_certificacion: f })], 'o1').texto)
  for (const t of todos) assert.doesNotMatch(t, /vencid/i)
  // Una fila sin ninguna fecha existe y no se puede clasificar: eso se dice, no se adivina.
  assert.deepEqual(certificacionDe([cert({})], 'o1'), { texto: 'cert. 2 sin fechas', reclama: true })
})

// ═══ ÚLTIMO MOVIMIENTO ═══

test('«últ. mov.» es el hecho MÁS RECIENTE del cliente, parte o certificado', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' }), obra({ obra_id: 'o2' })],
    partes: new Map([['o1', '2026-08-15'], ['o2', '2026-08-18']]),
    certificados: [cert({ obra_canonica_id: 'o1', fecha_cobranza: '2026-08-22' })],
  })
  assert.equal(c.ultimoMovimiento, '2026-08-22')
  assert.equal(c.enCurso[0].ultimoParte, '2026-08-15')
})

test('sin ningún hecho registrado, «últ. mov.» es null y no una fecha inventada', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' })], partes: new Map(), certificados: [],
  })
  assert.equal(c.ultimoMovimiento, null)
  assert.equal(c.enCurso[0].ultimoParte, null)
})

test('`diaRelativo` escribe hoy, ayer y el día/mes con dos dígitos', () => {
  assert.equal(diaRelativo('2026-08-25', '2026-08-25'), 'hoy')
  assert.equal(diaRelativo('2026-08-24', '2026-08-25'), 'ayer')
  // El cruce de mes es donde una resta a mano se equivoca.
  assert.equal(diaRelativo('2026-07-31', '2026-08-01'), 'ayer')
  assert.equal(diaRelativo('2026-08-02', '2026-08-25'), '02/08')
  assert.equal(diaRelativo(null, '2026-08-25'), null)
})

test('«hoy» es el día de San Juan, no el del proceso', () => {
  // Vercel corre en UTC, tres horas adelante: un parte de las 21:30 de un martes cae el miércoles a
  // las 00:30 UTC y se anunciaría como de «hoy» a alguien que todavía está en martes.
  assert.equal(hoyEnLaEmpresa(new Date('2026-08-26T01:00:00Z')), '2026-08-25')
  assert.equal(hoyEnLaEmpresa(new Date('2026-08-25T12:00:00Z')), '2026-08-25')
})
