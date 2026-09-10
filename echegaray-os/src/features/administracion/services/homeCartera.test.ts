import test from 'node:test'
import assert from 'node:assert/strict'
import type { ClientePanel } from '@/features/clientes/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  armarCartera, atribuirAlaUnicaObra, certificacionDe, diaRelativo, getCobradoPorObra,
  hoyEnLaEmpresa, type FilaCertificado, type ObraDeCartera,
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

/** Ninguna cobranza imputada Y la base todavía no sabe repartir: el caso de hoy en producción. */
const SIN_COBRO = { por: new Map(), disponible: false }

const obra = (p: Partial<ObraDeCartera> & { obra_id: string }): ObraDeCartera => ({
  nombre: p.obra_id, cliente_id: 'c1', avance_pct: 50, jefe_obra: 'S. Ledesma', ...p,
})

/** Lo que publica `obra_economia_cartera` para una obra. Es la ÚNICA fuente del precio por obra. */
const eco = (obraId: string, contratado: number | null, extra: Partial<EconomiaDeObra> = {}):
[string, EconomiaDeObra] => [obraId, {
  obra_canonica_id: obraId, contratado, costo_mo: null, costo_materiales: null, margen: null,
  origen: contratado === null ? null : 'oc-pesos', ...extra,
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
    cobrado: SIN_COBRO, certificados: [],
  })
  assert.deepEqual(filas.map((c) => c.enCurso.map((o) => o.obra_id)), [['o1'], ['o2']])
})

test('una obra sin cliente no se cuelga de nadie ni se pierde de vista en otro lado', () => {
  const filas = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'huerfana', cliente_id: null })],
    cobrado: SIN_COBRO, certificados: [],
  })
  assert.deepEqual(filas[0].enCurso, [])
})

test('`avance_pct` NULL NO es 0 %, y sin precio en OBRAS el contratado no es $ 0', () => {
  // Una obra sin avance sincronizado no avanzó cero por ciento: no se sabe. Y una obra sin contrato
  // cargado no se contrató en cero — eso ES trabajo pendiente y la fila tiene que decirlo.
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', cuit: '30-1-2', telefono: '2645551234' })],
    obras: [obra({ obra_id: 'o1', avance_pct: null, jefe_obra: null })],
    cobrado: SIN_COBRO, certificados: [], contratos: new Set(['c1']),
  })
  assert.equal(c.enCurso[0].avance, null)
  assert.equal(c.enCurso[0].contratado, null)
  assert.equal(c.enCurso[0].jefe, null, 'un jefe en blanco no es un nombre')
})

test('«sin contrato» sale de los DOCUMENTOS y no del monto: son dos conceptos', () => {
  // El defecto del 09/09/2026: la misma fila decía «$156M contratado» y «sin contrato». El monto lo
  // publica OBRAS; el contrato es un papel en la ficha. Acá se prueban las cuatro combinaciones que
  // importan — con plata y sin papel, y sin plata y con papel.
  const completo = cliente({ cliente_id: 'c1', cuit: '30-1-2', telefono: '2645551234' })
  const base = { clientes: [completo], cobrado: SIN_COBRO, certificados: [] }
  const conPlata = armarCartera({
    ...base,
    obras: [obra({ obra_id: 'o1' })],
    economia: new Map([eco('o1', 156_174_253)]),
    economiaCliente: new Map([['c1', ecCliente({ cliente_id: 'c1', contratado_en_curso: 156_174_253 })]]),
    contratos: new Set<string>(),
  })[0]
  assert.equal(conPlata.contratado, 156_174_253)
  assert.equal(conPlata.tieneContrato, false, 'plata publicada no prueba que el papel esté archivado')

  const sinPlata = armarCartera({
    ...base,
    obras: [obra({ obra_id: 'o1' })],
    contratos: new Set(['c1']),
  })[0]
  assert.equal(sinPlata.contratado, null, 'sin precio en OBRAS: NUNCA cero')
  assert.equal(sinPlata.tieneContrato, true, 'tiene el contrato cargado')

  const sinLeer = armarCartera({ ...base, obras: [obra({ obra_id: 'o1' })], contratos: null })[0]
  assert.equal(sinLeer.tieneContrato, null, 'no se pudo mirar: no se acusa')
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
    cobrado: { por: new Map([['o1', { cobrado: 500_000, imputacion: 'oc' as const }]]), disponible: true },
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
    cobrado: { por: new Map([['o1', { cobrado: 500_000, imputacion: 'oc' as const }]]), disponible: true },
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
    clientes, obras, cobrado: SIN_COBRO, certificados: [], economia,
    economiaCliente: new Map([['c1', ecCliente({ cliente_id: 'c1', contratado_en_curso: 100, contratado: 100 })]]),
  })
  assert.equal(c.enCurso[0].contratado, 100)
  assert.equal(c.enCurso[0].costoMo, 60)
  assert.equal(c.enCurso[0].costoMateriales, 10)
  // SIN FILA EN `obra_economia_cartera` NO HAY RESPALDO (H1): `obra_panel.monto_contratado` —el
  // campo del formulario— era la segunda definición del precio y se retiró de la lectura entera.
  assert.equal(c.enCurso[1].contratado, null)
  assert.equal(c.enCurso[1].costoMo, null)
  // El total del cliente NO lo suma esta función: lo dice `cliente_economia`.
  assert.equal(c.contratado, 100)
  assert.equal(c.costoMo, 60)
})

// ═══ EL MARGEN SE FUE DE LA CARTERA (dueño, 10/09/2026 15:33) ═══
//
// «Quitá esa columna Margen, no es útil». Con la columna se fue el CÁLCULO: mientras
// `armarCartera` siguiera devolviendo `margen` y `margenPct`, la próxima pantalla que dibujara la
// fila los iba a encontrar servidos y la columna volvería sin que nadie la decida. La regla del
// margen —`margenDeLaFila`— sigue viva y con dueño: la ficha del cliente, que sí lo muestra por
// obra, la llama en vez de leer `e.margen` a mano como hacía hasta hoy.

test('la fila de la cartera ya no calcula ningún margen', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' })],
    cobrado: SIN_COBRO, certificados: [],
    economia: new Map([eco('o1', 100, { costo_mo: 60, costo_materiales: 10, margen: 30 })]),
  })
  assert.equal('margen' in c, false, 'la fila del cliente volvió a traer el margen servido')
  assert.equal('margenPct' in c, false)
  assert.equal('economiaParcial' in c, false)
  assert.equal('margen' in c.enCurso[0], false, 'la fila de la obra volvió a traer el margen servido')
  // Y lo que sí tiene que seguir trayendo, porque una compra es COSTO y lo ve todo rol interno.
  assert.equal(c.enCurso[0].costoMo, 60)
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
    cobrado: SIN_COBRO,
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

// ═══ EL COBRO DE LA OBRA SE LEE NETO, NO BRUTO ═══
//
// `obra_cobranza` publica los dos: `cobrado` es lo que entró al banco (con IVA) y `cobrado_neto` es
// sin IVA. Lo contratado de OBRAS es NETO, así que la barra sólo puede dividir por el segundo.
//
// EL DEFECTO QUE ATRAPA: la fila de Quattropani decía «100 % cobrado» —$102.606.669 sobre
// $95.270.932— y el 7,7 % de más era el IVA de las facturas, no un cobro por encima del contrato.
// Con el neto ($84.697.935) la misma fila dice 89 %. Si alguien vuelve a `cobrado`, este test da
// rojo con el número bruto en el mensaje.

/**
 * Un Supabase de mentira que devuelve las DOS columnas: la buena y la que ya engañó una vez.
 *
 * `columnasQueExisten` es lo que la BASE tiene hoy: pedir una que no está devuelve 42703, igual que
 * PostgREST. Es lo que hace probable el `select` tolerante de `imputacion` — con la migración sin
 * aplicar y con ella aplicada, sin tocar el código entre las dos corridas.
 */
function baseConLasDos(
  filas: Record<string, unknown>[], recordar: string[],
  columnasQueExisten = ['obra_id', 'cobrado', 'cobrado_neto'],
) {
  return {
    from: () => ({
      select: (columnas: string) => {
        recordar.push(columnas)
        const pedidas = columnas.split(',').map((c) => c.trim())
        const falta = pedidas.find((c) => !columnasQueExisten.includes(c))
        if (falta) {
          return Promise.resolve({ data: null, error: { code: '42703', message: `column ${falta} does not exist` } })
        }
        // Sólo devuelve lo que se pidió, igual que PostgREST: pedir `cobrado` no puede traer el neto.
        return Promise.resolve({
          data: filas.map((f) => Object.fromEntries(pedidas.map((c) => [c, f[c] ?? null]))),
          error: null,
        })
      },
    }),
  } as unknown as SupabaseClient
}

test('la barra de la obra divide el cobrado NETO, nunca el bruto con IVA', async () => {
  const pedidas: string[] = []
  const cobrado = await getCobradoPorObra(baseConLasDos(
    [{ obra_id: 'quattropani', cobrado: 102_606_668.76, cobrado_neto: 84_697_934.83 }],
    pedidas,
  ))
  assert.ok(pedidas[0].includes('cobrado_neto'), `pidió «${pedidas[0]}»: sin el neto no hay qué dividir`)
  assert.equal(
    cobrado?.por.get('quattropani')?.cobrado, 84_697_934.83,
    'el bruto ($102.606.669) sobre un contratado neto da «100 % cobrado» y el resto es IVA',
  )
})

// ═══ EL `select` TOLERANTE DE `imputacion` ═══
//
// La columna la agrega la migración que reparte el cobro por obra (la OC de la columna H de
// Cobranzas atada a `cliente_orden.obra_id`). El código la pide SIEMPRE: el día que la migración se
// aplique, la barra por obra enciende sola y sin tocar una línea. Mientras no exista, PostgREST
// devuelve 42703 y hay que volver a pedir sin ella — si no, la lectura falla entera y la columna
// Cobrado se apaga para todo el mundo.
//
// LOS DOS MUNDOS SE PRUEBAN CON EL MISMO CÓDIGO, que es lo único que prueba que la migración va a
// encender la barra sin una segunda entrega.

test('sin la columna `imputacion` la lectura NO se cae: se vuelve a pedir sin ella', async () => {
  const pedidas: string[] = []
  const cobrado = await getCobradoPorObra(baseConLasDos(
    [{ obra_id: 'quattropani', cobrado_neto: 84_697_934.83 }], pedidas,
  ))
  assert.ok(pedidas[0].includes('imputacion'), 'se pide primero CON la columna, para que encienda sola')
  assert.equal(pedidas.length, 2, 'y se reintenta una sola vez, sin ella')
  assert.equal(cobrado?.por.get('quattropani')?.cobrado, 84_697_934.83)
  assert.equal(cobrado?.por.get('quattropani')?.imputacion, null, 'la columna no existe: no se inventa')
})

test('con la columna aplicada, la imputación llega tal cual y sin segundo viaje', async () => {
  const pedidas: string[] = []
  const cobrado = await getCobradoPorObra(baseConLasDos(
    [
      { obra_id: 'messina-playon-azufre', cobrado_neto: 32_500_000, imputacion: 'oc' },
      { obra_id: 'messina', cobrado_neto: 2_330_000, imputacion: 'cliente' },
    ],
    pedidas,
    ['obra_id', 'cobrado', 'cobrado_neto', 'imputacion'],
  ))
  assert.equal(pedidas.length, 1, 'con la columna viva no hay reintento')
  assert.equal(cobrado?.por.get('messina-playon-azufre')?.imputacion, 'oc')
  assert.equal(cobrado?.por.get('messina')?.imputacion, 'cliente')
})

test('un valor de imputación que el OS no conoce se descarta, no se dibuja', async () => {
  // Si mañana la vista publica un cuarto valor, la fila NO puede dibujar una palabra que nadie
  // definió: se trata como «no se sabe» hasta que alguien la agregue acá a propósito.
  const cobrado = await getCobradoPorObra(baseConLasDos(
    [{ obra_id: 'o1', cobrado_neto: 1, imputacion: 'certificado' }], [],
    ['obra_id', 'cobrado', 'cobrado_neto', 'imputacion'],
  ))
  assert.equal(cobrado?.por.get('o1')?.imputacion, null)
})

test('sin cobranzas cobradas la obra NO entra al mapa: un hueco no es un cero', async () => {
  const cobrado = await getCobradoPorObra(baseConLasDos(
    [{ obra_id: 'messina-bsa', cobrado: null, cobrado_neto: null }], [],
  ))
  assert.equal(cobrado?.por.has('messina-bsa'), false, 'una barra en 0 % afirmaría que se midió')
})

// ═══ LOS CONTEOS QUE LA FILA ESCRIBE ═══

test('la fila trae el desglose en curso / cerradas, y no lo inventa cuando no lo leyó', () => {
  // Messina: «11 obras» con 5 filas colgando debajo fue lo que el dueño no pudo cuadrar.
  const [conVista] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', n_obras: 11 })],
    obras: [obra({ obra_id: 'o1' })],
    cobrado: SIN_COBRO, certificados: [],
    economiaCliente: new Map([['c1', ecCliente({
      cliente_id: 'c1', n_obras_en_curso: 5, n_obras_cerradas: 6, n_obras_sin_precio: 6,
    })]]),
  })
  assert.equal(conVista.obras, 11)
  assert.equal(conVista.nEnCurso, 5)
  assert.equal(conVista.nCerradas, 6)
  assert.equal(conVista.obrasSinPrecio, 6, 'el % de cobro no se puede publicar con 6 obras sin precio')

  const [sinVista] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1', n_obras: 11 })],
    obras: [obra({ obra_id: 'o1' })], cobrado: SIN_COBRO, certificados: [],
  })
  assert.equal(sinVista.nEnCurso, null, 'no se leyó la vista: no se escribe «0 en curso»')
  assert.equal(sinVista.nCerradas, null)
  assert.equal(sinVista.obrasSinPrecio, null)
})

test('la obra lleva de qué camino salió su contratado: «suma-viva» no es un precio', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'messina-bsa' })],
    cobrado: SIN_COBRO, certificados: [],
    economia: new Map([eco('messina-bsa', 14_120_243.4, { origen: 'suma-viva' })]),
  })
  assert.equal(c.enCurso[0].origenContratado, 'suma-viva')
})

// ═══ TODO O NADA EN LA COLUMNA COBRADO DE LAS FILAS DE OBRA ═══
//
// «Uno con barra de progreso y otros no» (dueño, 10/09/2026 16:25, sobre producción). La única fila
// de obra con barra era Quattropani — y no porque se supiera más de esa obra: su etiqueta en
// Cobranzas («Quattropani - Melisa García SAS») resuelve por `obra_alias` al id `quattropani`, que
// da la casualidad de ser también su ÚNICA obra. Messina y San Francisco no tienen esa suerte y
// quedaban en «—».
//
// Una sola barra en una columna vacía no se lee como «la base sólo sabe de ésta»: se lee como que
// las otras no cobraron. Publicar el único caso que la casualidad resuelve es peor que no publicar
// ninguno.
//
// SI SE REVIERTE, ESTE TEST SE PONE ROJO: la obra vuelve a traer su cobro con la columna ausente.

test('sin la columna `imputacion`, NINGUNA fila de obra publica cobro — ni la afortunada', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'quattropani' })],
    obras: [obra({ obra_id: 'quattropani', cliente_id: 'quattropani' })],
    // La base SÍ tiene el número —la etiqueta del cliente coincide con el id de la obra— pero
    // TODAVÍA no sabe repartir: `disponible: false`.
    cobrado: { por: new Map([['quattropani', { cobrado: 89_968_804.78, imputacion: null }]]), disponible: false },
    certificados: [],
    economia: new Map([eco('quattropani', 95_270_932.26)]),
  })
  assert.equal(c.enCurso[0].cobrado, null, 'la fila de la obra no puede publicar el cobro afortunado')
  assert.equal(c.enCurso[0].imputacion, null)
  assert.equal(c.enCurso[0].cobroDisponible, false, 'y la celda tiene que saber que no hay pregunta')
})

test('con la columna aplicada, TODAS las que tienen imputación publican', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'messina' })],
    obras: [
      obra({ obra_id: 'messina-playon-azufre', cliente_id: 'messina' }),
      obra({ obra_id: 'messina-bsa', cliente_id: 'messina' }),
    ],
    cobrado: {
      por: new Map([
        ['messina-playon-azufre', { cobrado: 32_500_000, imputacion: 'oc' as const }],
        ['messina-bsa', { cobrado: 4_073_021.7, imputacion: 'cliente' as const }],
      ]),
      disponible: true,
    },
    certificados: [],
    economia: new Map([eco('messina-playon-azufre', 102_500_000), eco('messina-bsa', 14_120_243.4)]),
  })
  assert.equal(c.enCurso[0].cobrado, 32_500_000)
  assert.equal(c.enCurso[0].imputacion, 'oc')
  assert.equal(c.enCurso[0].cobroDisponible, true)
  // La `cliente` trae su número pero la fila lo dice con palabras y no dibuja barra: eso lo decide
  // el componente, y lo prueba `canonico-tabla-clientes`.
  assert.equal(c.enCurso[1].imputacion, 'cliente')
})

test('si la lectura del cobro FALLÓ, tampoco se puede afirmar que la base sabe repartir', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'c1' })],
    obras: [obra({ obra_id: 'o1' })],
    cobrado: null,
    certificados: [],
    economia: new Map([eco('o1', 100)]),
  })
  assert.equal(c.enCurso[0].cobroDisponible, false, 'un control que no pudo mirar no habilita nada')
})

// ═══ UN CLIENTE CON UNA SOLA OBRA EN CURSO NO TIENE ENTRE QUÉ REPARTIR ═══
//
// Con la migración `20260910T2330` aplicada las barras por obra salieron —BSA 29 %, Pisos 120 75 %,
// Playón de Azufre 49 %, San Francisco 25/25/29 %— y quedó UNA fila diciendo «cobro sin obra
// asignada»: Quattropani - SALÓN COMERCIAL. Su etiqueta en Cobranzas resuelve por `obra_alias` al
// id `quattropani`, que es la obra bolsa y a la vez su ÚNICA obra en curso, así que la vista la
// marca `cliente`. No hay ambigüedad que resolver: dejar la fila muda es esconder un número que sí
// se sabe de quién es.

test('con UNA obra en curso, el cobro del cliente se le atribuye y la barra sale', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'quattropani', n_obras: 1 })],
    obras: [obra({ obra_id: 'quattropani', cliente_id: 'quattropani' })],
    cobrado: {
      por: new Map([['quattropani', { cobrado: 89_968_804.78, imputacion: 'cliente' as const }]]),
      disponible: true,
    },
    certificados: [],
    economia: new Map([eco('quattropani', 95_270_932.26)]),
  })
  assert.equal(c.enCurso[0].cobrado, 89_968_804.78)
  assert.equal(
    c.enCurso[0].imputacion, 'unica-obra',
    'NO se disfraza de `alias`: es una deducción y el `title` de la celda lo dice',
  )
})

test('con DOS o más obras en curso NO se reparte a ojo: la fila lo sigue diciendo', () => {
  const [c] = armarCartera({
    clientes: [cliente({ cliente_id: 'messina', n_obras: 2 })],
    obras: [
      obra({ obra_id: 'messina-bsa', cliente_id: 'messina' }),
      obra({ obra_id: 'messina-pisos-120-rampa', cliente_id: 'messina' }),
    ],
    cobrado: {
      por: new Map([['messina-bsa', { cobrado: 4_073_021.7, imputacion: 'cliente' as const }]]),
      disponible: true,
    },
    certificados: [],
    economia: new Map([eco('messina-bsa', 14_120_243.4), eco('messina-pisos-120-rampa', 9_463_141.93)]),
  })
  assert.equal(c.enCurso[0].imputacion, 'cliente', 'con dos candidatas, elegir una sería inventar')
})

test('la regla NO toca una imputación que la base sí pudo hacer', () => {
  // `oc` y `alias` las dice la vista con un papel o con una etiqueta: no se re-etiquetan nunca.
  for (const original of ['oc', 'alias'] as const) {
    const [c] = armarCartera({
      clientes: [cliente({ cliente_id: 'c1' })],
      obras: [obra({ obra_id: 'o1' })],
      cobrado: { por: new Map([['o1', { cobrado: 10, imputacion: original }]]), disponible: true },
      certificados: [],
      economia: new Map([eco('o1', 100)]),
    })
    assert.equal(c.enCurso[0].imputacion, original)
  }
})

test('sin cobro, la única obra no se inventa una atribución', () => {
  const sinNada = atribuirAlaUnicaObra([{
    obra_id: 'o1', nombre: 'O', avance: null, jefe: null, contratado: 100, origenContratado: 'oc-pesos',
    costoMo: null, costoMateriales: null, certificacion: { texto: 'sin certificar', reclama: false },
    cobrado: null, imputacion: 'cliente', cobroDisponible: true,
  }])
  assert.equal(sinNada[0].imputacion, 'cliente', 'sin número no hay nada que atribuir')
})
