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
    cobrado: new Map(), certificados: [],
  })
  assert.deepEqual(filas.map((c) => c.enCurso.map((o) => o.obra_id)), [['o1'], ['o2']])
})

test('una obra sin cliente no se cuelga de nadie ni se pierde de vista en otro lado', () => {
  const filas = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'huerfana', cliente_id: null })],
    cobrado: new Map(), certificados: [],
  })
  assert.deepEqual(filas[0].enCurso, [])
})

test('`avance_pct` NULL NO es 0 %, y `monto_contratado` NULL no es $ 0', () => {
  // Una obra sin avance sincronizado no avanzó cero por ciento: no se sabe. Y una obra sin contrato
  // cargado no se contrató en cero — eso ES trabajo pendiente y la fila tiene que decirlo.
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', cuit: '30-1-2', telefono: '2645551234' })],
    obras: [obra({ obra_id: 'o1', avance_pct: null, monto_contratado: null, jefe_obra: null })],
    cobrado: new Map(), certificados: [], contratos: new Set(['c1']),
  })
  assert.equal(c.enCurso[0].avance, null)
  assert.equal(c.enCurso[0].contratado, null)
  assert.equal(c.enCurso[0].jefe, null, 'un jefe en blanco no es un nombre')
  // EL HUECO DE PRECIO NO ES UN CHIP DEL CLIENTE (09/09/2026): lo dice la obra, en su fila.
  assert.deepEqual(c.chips.map((x) => x.clave), [], 'el cliente tiene CUIT, teléfono y contrato')
  assert.equal(c.faltaUnDato, false, 'un hueco de precio en OBRAS no es un dato faltante del cliente')
})

test('sin CUIT el cliente lo dice en su chip, y eso SÍ lo mete en «datos faltantes»', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', cuit: null })],
    obras: [obra({ obra_id: 'o1', monto_contratado: null })],
    cobrado: new Map(), certificados: [], contratos: new Set(['c1']),
  })
  assert.deepEqual(c.chips.map((x) => x.clave), ['sin-cuit', 'sin-telefono'])
  assert.equal(c.faltaUnDato, true)
  assert.match(c.aviso ?? '', /no se le puede facturar/)
})

test('«sin contrato» sale de los DOCUMENTOS y no del monto: son dos conceptos', () => {
  // El defecto del 09/09/2026: la misma fila decía «$156M contratado» y «sin contrato». El monto lo
  // publica OBRAS; el contrato es un papel en la ficha. Acá se prueban las cuatro combinaciones que
  // importan — con plata y sin papel, y sin plata y con papel.
  const completo = cliente({ cliente_id: 'c1', cuit: '30-1-2', telefono: '2645551234' })
  const base = { clientes: [completo], cobrado: new Map(), certificados: [] }
  const conPlata = armarCartera({
    ...base,
    obras: [obra({ obra_id: 'o1', monto_contratado: 156_174_253 })],
    contratos: new Set<string>(),
  })[0]
  assert.equal(conPlata.contratado, 156_174_253)
  assert.deepEqual(conPlata.chips.map((x) => x.clave), ['sin-contrato'])

  const sinPlata = armarCartera({
    ...base,
    obras: [obra({ obra_id: 'o1', monto_contratado: null })],
    contratos: new Set(['c1']),
  })[0]
  assert.equal(sinPlata.contratado, null, 'sin precio en OBRAS: NUNCA cero')
  assert.deepEqual(sinPlata.chips.map((x) => x.clave), [], 'tiene el contrato cargado')

  const sinLeer = armarCartera({ ...base, obras: [obra({ obra_id: 'o1' })], contratos: null })[0]
  assert.equal(sinLeer.tieneContrato, null)
  assert.deepEqual(sinLeer.chips.map((x) => x.clave), [], 'no se pudo mirar: no se acusa')
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

// ═══ LO COBRADO POR OBRA (10/09/2026) ═══
//
// La columna «Últ. mov.» se retiró de `/clientes` por pedido del dueño («esa columna sin
// movimientos quitarla») y en su lugar va la barra de lo cobrado. Con ella se fueron
// `ultimoMovimiento` y `ultimoParte` del modelo: nadie más los dibujaba, y un campo que ninguna
// pantalla muestra es una lectura que se paga sin que nadie la mire.

test('lo cobrado cuelga de SU obra, y el total del cliente suma las MISMAS obras que contratado', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' }), obra({ obra_id: 'o2' })],
    cobrado: new Map([['o1', 500_000]]),
    certificados: [],
    economia: new Map([
      ['o1', { obra_canonica_id: 'o1', obra_clave: 'o1', contratado: 1_000_000, costo_mo: null, costo_materiales: null, margen: null }],
      ['o2', { obra_canonica_id: 'o2', obra_clave: 'o2', contratado: 2_000_000, costo_mo: null, costo_materiales: null, margen: null }],
    ]),
  })
  assert.equal(c.enCurso[0].cobrado, 500_000)
  // LA OBRA SIN COBRANZA IMPUTADA NO COBRÓ CERO: no se sabe, y por eso es `null` y no 0. Hoy
  // Cobranzas anota el cobro contra el CLIENTE, así que casi todas las obras están en este caso.
  assert.equal(c.enCurso[1].cobrado, null)
  // El total del cliente suma lo que hay, y el denominador de la barra es el contratado de las
  // mismas obras en ejecución: dos universos distintos no hacen un porcentaje.
  assert.equal(c.cobrado, 500_000)
  assert.equal(c.contratado, 3_000_000)
})

test('sin ninguna cobranza imputada, el cobrado del cliente es null y no cero', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' })], cobrado: new Map(), certificados: [],
  })
  assert.equal(c.cobrado, null)
  assert.equal(c.enCurso[0].cobrado, null)
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

test('la economía de OBRAS manda: contratado, MO, materiales y margen por obra, y el cliente suma sus obras en curso', () => {
  const clientes = [{ cliente_id: 'c1', slug: 'x', nombre_comercial: 'X', n_obras: 2, contratado: 999_999_999, cuit: '1', telefono: '1' }] as never
  const obras = [
    { obra_id: 'o1', nombre: 'A', cliente_id: 'c1', avance_pct: null, jefe_obra: null, monto_contratado: null },
    { obra_id: 'o2', nombre: 'B', cliente_id: 'c1', avance_pct: null, jefe_obra: null, monto_contratado: 5 },
  ]
  const economia = new Map([
    ['o1', { obra_canonica_id: 'o1', contratado: 100, costo_mo: 60, costo_materiales: 10, margen: 30 }],
  ])
  const [c] = armarCartera({ clientes, obras, cobrado: new Map(), certificados: [], economia })
  assert.equal(c.enCurso[0].contratado, 100)
  assert.equal(c.enCurso[0].margen, 30)
  assert.equal(c.enCurso[0].margenPct, 30)
  // Sin fila en OBRAS cae al formulario, y sin costos no hay margen.
  assert.equal(c.enCurso[1].contratado, 5)
  assert.equal(c.enCurso[1].margen, null)
  // El total del cliente NO es `cliente_panel.contratado` (sumaba las cerradas): es la suma de sus obras en curso.
  assert.equal(c.contratado, 105)
  assert.equal(c.costoMo, 60)
  assert.equal(c.margen, 30)
  assert.equal(c.economiaParcial, true)
})
