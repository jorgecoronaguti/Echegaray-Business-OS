import test from 'node:test'
import assert from 'node:assert/strict'
import type { ClientePanel } from '@/features/clientes/types'
import {
  armarCartera, certificacionDe, diaRelativo, hoyEnLaEmpresa,
  type FilaCertificado, type ObraDeCartera,
} from './homeCartera.ts'
import type { EconomiaDeCliente } from '@/features/clientes/services/economiaCliente'
import type { EconomiaDeObra } from '@/features/clientes/services/economiaObras'

// LA CARTERA DE LA ENTRADA. Lo que estas pruebas impiden: que un `null` se dibuje como cero, que
// una lectura fallida se dibuje como «no hay», y que la obra cuelgue del cliente equivocado.

const cliente = (p: Partial<ClientePanel> & { cliente_id: string }): ClientePanel => ({
  slug: p.cliente_id, nombre_comercial: 'Cliente', razon_social: null, cuit: '30-1-2',
  direccion: null, telefono: null, email: null, responsable_id: null, responsable_nombre: null,
  drive_carpeta_id: null, activo: true, notas: null, n_obras: 1, n_obras_activas: 1,
  restricciones_abiertas: 0, avance_sincronizado_en: null,
  n_contactos: 0, n_documentos: 0, ...p,
})

const obra = (p: Partial<ObraDeCartera> & { obra_id: string }): ObraDeCartera => ({
  nombre: p.obra_id, cliente_id: 'c1', avance_pct: 50, jefe_obra: 'S. Ledesma', ...p,
})

/** Lo que publica `obra_economia_cartera` para una obra. Es la ÚNICA fuente del precio por obra. */
const eco = (obraId: string, contratado: number | null, extra: Partial<EconomiaDeObra> = {}):
[string, EconomiaDeObra] => [obraId, {
  obra_canonica_id: obraId, contratado, costo_mo: null, costo_materiales: null, margen: null, ...extra,
}]

/** Una fila de `public.cliente_economia`, que es de donde salen los totales del cliente. */
const ecCliente = (p: Partial<EconomiaDeCliente> & { cliente_id: string }): EconomiaDeCliente => ({
  contratado: null, contratado_en_curso: null, n_obras_en_curso: 0, n_obras_cerradas: 0,
  n_obras_con_precio: 0, n_obras_sin_precio: 0, costo_real: null, facturado_90d: null,
  cobrado_90d: null, cobrado_total: null, cobrado_neto_total: null, saldo: null, vencido: null,
  por_vencer: null, pendiente_contractual: null, ...p,
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

test('`avance_pct` NULL NO es 0 %, y sin precio en OBRAS el contratado no es $ 0', () => {
  // Una obra sin avance sincronizado no avanzó cero por ciento: no se sabe. Y una obra sin contrato
  // cargado no se contrató en cero — eso ES trabajo pendiente y la fila tiene que decirlo.
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', cuit: '30-1-2', telefono: '2645551234' })],
    obras: [obra({ obra_id: 'o1', avance_pct: null, jefe_obra: null })],
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
    obras: [obra({ obra_id: 'o1' })],
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
    obras: [obra({ obra_id: 'o1' })],
    economia: new Map([eco('o1', 156_174_253)]),
    economiaCliente: new Map([['c1', ecCliente({ cliente_id: 'c1', contratado_en_curso: 156_174_253 })]]),
    contratos: new Set<string>(),
  })[0]
  assert.equal(conPlata.contratado, 156_174_253)
  assert.deepEqual(conPlata.chips.map((x) => x.clave), ['sin-contrato'])

  const sinPlata = armarCartera({
    ...base,
    obras: [obra({ obra_id: 'o1' })],
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

test('lo cobrado de la OBRA cuelga de su obra; lo del CLIENTE lo dice `cliente_economia`', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' }), obra({ obra_id: 'o2' })],
    cobrado: new Map([['o1', 500_000]]),
    certificados: [],
    economia: new Map([eco('o1', 1_000_000), eco('o2', 2_000_000)]),
    economiaCliente: new Map([['c1', ecCliente({
      cliente_id: 'c1', contratado: 4_000_000, contratado_en_curso: 3_000_000,
      cobrado_neto_total: 900_000, pendiente_contractual: 3_100_000,
    })]]),
  })
  assert.equal(c.enCurso[0].cobrado, 500_000)
  // LA OBRA SIN COBRANZA IMPUTADA NO COBRÓ CERO: no se sabe, y por eso es `null` y no 0. Hoy
  // Cobranzas anota el cobro contra el CLIENTE, así que casi todas las obras están en este caso.
  assert.equal(c.enCurso[1].cobrado, null)
  // EL COBRADO DEL CLIENTE NO ES LA SUMA DE SUS OBRAS (10/09/2026). Era $500.000 —lo único
  // imputado— cuando el cliente cobró $900.000: `cobranzas` ata el cobro al cliente, no a la obra,
  // así que sumar las filas de obra subregistra el cobro y no lo dice.
  assert.equal(c.cobrado, 900_000)
  // Y su denominador es el contratado de TODAS sus obras, no el de las que están en curso: los dos
  // números de la barra tienen que ser del mismo universo.
  assert.equal(c.contratadoTotal, 4_000_000)
  assert.equal(c.contratado, 3_000_000, 'la COLUMNA sigue siendo lo contratado en curso')
  assert.equal(c.pendienteContractual, 3_100_000)
})

test('sin `cliente_economia` legible, el cliente NO cae a sumar sus obras: dice «—»', () => {
  // ═══ EL DEFECTO QUE ESTE TEST IMPIDE (H1) ═══
  //
  // Cada vez que una cara no pudo leer la fuente canónica y «se arregló» sumando las filas que
  // tenía a mano, nació otra definición: así llegaron a ser cinco. Si la vista no se pudo leer, la
  // columna dice que no sabe. Las obras de abajo siguen mostrando SU precio, que es otra pregunta.
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' }), obra({ obra_id: 'o2' })],
    cobrado: new Map([['o1', 500_000]]),
    certificados: [],
    economia: new Map([eco('o1', 1_000_000), eco('o2', 2_000_000)]),
    economiaCliente: null,
  })
  assert.equal(c.contratado, null)
  assert.equal(c.contratadoTotal, null)
  assert.equal(c.cobrado, null)
  assert.equal(c.enCurso[0].contratado, 1_000_000, 'el precio POR OBRA sigue siendo el de OBRAS')
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

test('la economía de OBRAS manda por obra, y el total del cliente sale de la vista', () => {
  const clientes = [{ cliente_id: 'c1', slug: 'x', nombre_comercial: 'X', n_obras: 2, cuit: '1', telefono: '1' }] as never
  const obras = [
    { obra_id: 'o1', nombre: 'A', cliente_id: 'c1', avance_pct: null, jefe_obra: null },
    { obra_id: 'o2', nombre: 'B', cliente_id: 'c1', avance_pct: null, jefe_obra: null },
  ]
  const economia = new Map([eco('o1', 100, { costo_mo: 60, costo_materiales: 10, margen: 30 })])
  const [c] = armarCartera({
    clientes, obras, cobrado: new Map(), certificados: [], economia,
    economiaCliente: new Map([['c1', ecCliente({ cliente_id: 'c1', contratado_en_curso: 100, contratado: 100 })]]),
  })
  assert.equal(c.enCurso[0].contratado, 100)
  assert.equal(c.enCurso[0].margen, 30)
  assert.equal(c.enCurso[0].margenPct, 30)
  // SIN FILA EN `obra_economia_cartera` NO HAY RESPALDO (H1): `obra_panel.monto_contratado` —el
  // campo del formulario— era la segunda definición del precio y se retiró de la lectura entera.
  assert.equal(c.enCurso[1].contratado, null)
  assert.equal(c.enCurso[1].margen, null)
  // El total del cliente NO lo suma esta función: lo dice `cliente_economia`. Que acá haya dos
  // obras y sólo una con precio se sigue diciendo con `economiaParcial`.
  assert.equal(c.contratado, 100)
  assert.equal(c.costoMo, 60)
  assert.equal(c.margen, 30)
  assert.equal(c.economiaParcial, true)
})

// ═══ MESSINA, EL CASO QUE ORIGINÓ EL HITO (medido contra la base el 10/09/2026) ═══
//
// Cinco obras en curso con precio en OBRAS por $156.174.253,16 y cinco cerradas cuyo
// `obra_panel.monto_contratado` —el campo del formulario— suma $31.846.475,65. La lista mostraba lo
// primero, el panel lateral y el esquema de pago lo segundo, y la ficha una tercera suma.
//
// LOS $156.174.253,16 SON MEDIDOS. El total y el cobrado de abajo son valores de PRUEBA elegidos
// distintos entre sí a propósito: lo que este test fija es que la fila publica lo que dice la vista
// y no una suma propia, no cuánto vale hoy cada columna. (Contra la base de hoy `contratado` y
// `contratado_en_curso` dan lo mismo, porque las cinco obras cerradas de Messina no tienen fila en
// `obra_economia_sheet`: OBRAS no las publica. Clavar esa coincidencia haría un test que se rompe
// el día que alguien cierre una obra que sí tiene precio.)

const MESSINA_EN_CURSO: [string, number][] = [
  ['messina-adicional-tercer-muro', 10_000_000],
  ['messina-bsa', 14_120_243.4],
  ['messina-pisos-120-rampa', 9_463_141.93],
  ['messina-playon-azufre', 102_500_000],
  ['messina-playon-dilucion-acido', 20_090_867.83],
]

test('Messina: la fila del cliente publica lo que dice la vista, no la suma del formulario', () => {
  const enCurso = MESSINA_EN_CURSO.map(([id]) => obra({ obra_id: id, cliente_id: 'messina' }))
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'messina', n_obras: 10 })],
    obras: enCurso,
    cobrado: new Map(),
    certificados: [],
    economia: new Map(MESSINA_EN_CURSO.map(([id, monto]) => eco(id, monto))),
    economiaCliente: new Map([['messina', ecCliente({
      cliente_id: 'messina',
      contratado: 188_020_728.81,
      contratado_en_curso: 156_174_253.16,
      n_obras_en_curso: 5,
      n_obras_cerradas: 5,
      cobrado_neto_total: 90_579_117.31,
      pendiente_contractual: 97_441_611.5,
      // (los tres últimos son de prueba: ver el bloque de arriba)
    })]]),
  })
  assert.equal(Math.round(c.contratado ?? 0), 156_174_253)
  // $31.846.475 era lo que publicaba el panel lateral: la suma de las CINCO CERRADAS, las únicas
  // con el formulario cargado. Ninguna cara puede volver a decir eso.
  assert.notEqual(Math.round(c.contratado ?? 0), 31_846_476)
  assert.equal(Math.round(c.contratadoTotal ?? 0), 188_020_729)
  assert.equal(Math.round(c.cobrado ?? 0), 90_579_117)
  assert.equal(Math.round(c.pendienteContractual ?? 0), 97_441_612)
})
