// TESTS DEL VIGÍA. Herméticos: nada de red, nada de base, nada de Google.
//
// Lo que se prueba no es "la función corre": son los comportamientos que hacen que el vigía sea útil o
// inservible, y cada uno nació de un defecto real de otros vigilantes del OS:
//
//   · la PRIMERA corrida no grita   (si gritara 2.400 archivos, nadie lo volvería a mirar)
//   · la misma novedad NO se repite (la huella no lleva la fecha de detección — el defecto que hizo
//                                    ruido a la alerta de frescura antes del 23/07)
//   · el cruce NO re-litiga el histórico (178 PDF de 2023 sin correlato no son la novedad de hoy)
//   · lo que no se puede juzgar se DICE, no se declara faltante
//   · Nivel E: nada con efecto económico/fiscal/laboral sale como 'aplicable_solo'

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FUENTES, fuente, CUIT_PROPIO, numeroFiscal, cambiosEnCarpeta, sinCorrelatoFiscal,
  novedadesDrive, novedadesSheetVinculado, novedadesArca, novedadesCct, novedadesSilencio,
  novedadCiega, clasificar, huella, resumen, formatNovedades, avisoTexto, corteMaximo, dias,
  novedadesTimers, fechaDeSystemd, desdeCuando,
} from './vigia-fuentes.mjs'

// ═══ EL REGISTRO ═══

test('cada fuente vigilada declara QUÉ DECIDE en el Sheet — sin eso no debería vigilarse', () => {
  for (const f of FUENTES) {
    assert.ok(f.clave && f.tipo && f.nombre, `fuente incompleta: ${JSON.stringify(f)}`)
    assert.ok(f.que_decide && f.que_decide.length > 20, `${f.clave} no declara qué decide en el Sheet`)
    assert.ok(f.ruta_carga, `${f.clave} no declara a qué cargador enruta`)
    assert.ok(['aplicable_solo', 'requiere_dueno'].includes(f.nivel), `${f.clave} sin techo de autonomía`)
    assert.ok(Number.isFinite(f.cadencia_horas), `${f.clave} no declara cada cuánto debería moverse`)
  }
})

test('las claves de fuente son únicas y los cinco tipos están cubiertos', () => {
  const claves = FUENTES.map((f) => f.clave)
  assert.equal(new Set(claves).size, claves.length)
  const tipos = new Set(FUENTES.map((f) => f.tipo))
  for (const t of ['drive_carpeta', 'sheet_vinculado', 'arca', 'uocra_cct', 'banco']) {
    assert.ok(tipos.has(t), `falta un detector declarado para el tipo ${t}`)
  }
})

test('una clave inexistente falla claro en vez de devolver undefined', () => {
  assert.throws(() => fuente('no_existe'), /fuente vigilada inexistente/)
})

test('ningún prefijo de carpeta lleva un año: se fosilizaría el 1° de enero, en silencio', () => {
  for (const f of FUENTES.filter((x) => x.tipo === 'drive_carpeta')) {
    assert.ok(f.path_prefijo, `${f.clave} sin carpeta`)
    assert.doesNotMatch(f.path_prefijo, /\b20\d\d\b/,
      `${f.clave}: el prefijo "${f.path_prefijo}" tiene el año adentro — en enero vigilaría una carpeta muerta`)
  }
})

// ═══ LA HUELLA ═══

test('la huella es determinística y NO incluye el momento de detección', () => {
  const base = { fuente: 'facturas_emitidas', tipo: 'sin_correlato', id_hecho: 'fiscal:1-1-220' }
  assert.equal(huella(base), huella({ ...base, detectada_en: '2026-07-31T10:00:00Z' }))
  assert.notEqual(huella(base), huella({ ...base, id_hecho: 'fiscal:1-1-221' }))
})

test('una novedad sin identidad suficiente no se registra a medias: falla', () => {
  assert.throws(() => huella({ fuente: 'x', tipo: 'y' }), /sin identidad suficiente/)
})

// ═══ CLASIFICACIÓN / NIVEL E ═══

test('Nivel E: el techo de la fuente no se puede superar, y un silencio nunca se aplica solo', () => {
  const f = fuente('fondo_de_cese') // nivel requiere_dueno
  assert.equal(clasificar(f, { tipo: 'archivo_nuevo' }), 'requiere_dueno')
  const g = fuente('facturas_emitidas') // nivel aplicable_solo
  assert.equal(clasificar(g, { tipo: 'archivo_nuevo' }), 'aplicable_solo')
  assert.equal(clasificar(g, { tipo: 'archivo_nuevo', requiere_dueno: true }), 'requiere_dueno')
  assert.equal(clasificar(g, { tipo: 'silencio' }), 'requiere_dueno')
  assert.equal(clasificar(g, { tipo: 'ciega' }), 'ciega')
})

// ═══ DRIVE ═══

test('numeroFiscal lee la identidad fiscal del nombre del PDF, y devuelve null si no la tiene', () => {
  assert.deepEqual(numeroFiscal('30716304643_001_00001_00000220.pdf'),
    { cuit: '30716304643', tipo: 1, puntoVenta: 1, numero: 220 })
  assert.deepEqual(numeroFiscal('30716304643_201_00001_00000053.pdf'),
    { cuit: '30716304643', tipo: 201, puntoVenta: 1, numero: 53 })
  assert.equal(numeroFiscal('Remito Arcor firmado.pdf'), null)
  assert.equal(numeroFiscal(''), null)
  assert.equal(numeroFiscal(undefined), null)
})

const ARCHIVOS = [
  { drive_file_id: 'f1', name: '30716304643_001_00001_00000217.pdf', modified_time: '2026-07-16T12:33:38Z' },
  { drive_file_id: 'f2', name: '30716304643_001_00001_00000218.pdf', modified_time: '2026-07-20T13:01:29Z' },
  { drive_file_id: 'f3', name: '30716304643_001_00001_00000219.pdf', modified_time: '2026-07-29T19:54:27Z' },
  { drive_file_id: 'f4', name: '30716304643_001_00001_00000220.pdf', modified_time: '2026-07-30T18:23:02Z' },
]

test('PRIMERA corrida: declara la línea de base y NO grita ninguna novedad', () => {
  const r = cambiosEnCarpeta(ARCHIVOS, {})
  assert.equal(r.linea_base, true)
  assert.equal(r.nuevas.length, 0)
  assert.equal(r.senal.corte_modified_time, '2026-07-30T18:23:02.000Z')
  assert.equal(r.total, 4)
})

test('segunda corrida: sólo lo posterior al corte, y el corte avanza', () => {
  const r = cambiosEnCarpeta(ARCHIVOS, { corte_modified_time: '2026-07-20T13:01:29Z' })
  assert.equal(r.linea_base, false)
  assert.deepEqual(r.nuevas.map((a) => a.drive_file_id), ['f4', 'f3']) // más nuevo primero
  assert.equal(r.senal.corte_modified_time, '2026-07-30T18:23:02.000Z')
})

test('un archivo YA VISTO que cambia se reporta como modificado, no como nuevo', () => {
  const r = cambiosEnCarpeta(ARCHIVOS, {
    corte_modified_time: '2026-07-20T13:01:29Z',
    archivos_vistos_ids: ['f3'],
  })
  assert.deepEqual(r.nuevas.map((a) => a.drive_file_id), ['f4'])
  assert.deepEqual(r.modificadas.map((a) => a.drive_file_id), ['f3'])
})

test('sin fecha entendible, un archivo no se inventa como novedad', () => {
  const r = cambiosEnCarpeta([{ drive_file_id: 'x', name: 'a.pdf', modified_time: null }],
    { corte_modified_time: '2026-07-01T00:00:00Z' })
  assert.equal(r.nuevas.length, 0)
})

// ═══ EL CRUCE CONTRA EL ESPEJO ═══

const ESPEJO = [
  { tipo_comprobante: '1', punto_venta: '1', numero: '214' },
  { tipo_comprobante: '1', punto_venta: '1', numero: '215' },
  { tipo_comprobante: '1', punto_venta: '1', numero: '216' },
  { tipo_comprobante: '201', punto_venta: '1', numero: '53' },
]

test('el cruce señala SÓLO lo que está por encima del techo del espejo', () => {
  const conHueco = [
    { drive_file_id: 'v', name: '30716304643_001_00001_00000210.pdf', modified_time: '2026-03-30T00:00:00Z' },
    ...ARCHIVOS,
  ]
  const r = sinCorrelatoFiscal(conHueco, ESPEJO)
  assert.deepEqual(r.pendientes.map((p) => p.fiscal.numero), [217, 218, 219, 220])
  // El 210 está por debajo del techo (216): es un hueco histórico, se cuenta, no se grita.
  assert.equal(r.huecos_historicos, 1)
  assert.deepEqual(r.techos, { '1-1': 216, '201-1': 53 })
})

test('lo que ya está en el espejo no aparece', () => {
  const r = sinCorrelatoFiscal([
    { drive_file_id: 'a', name: '30716304643_001_00001_00000216.pdf', modified_time: '2026-07-13T00:00:00Z' },
  ], ESPEJO)
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.huecos_historicos, 0)
})

test('lo que NO se puede juzgar se dice con su motivo, no se declara faltante', () => {
  const r = sinCorrelatoFiscal([
    // otro CUIT: el libro E del espejo es de ECSAS
    { drive_file_id: 'o', name: '20355074170_011_00001_00000004.pdf', modified_time: '2023-02-25T00:00:00Z' },
    // serie que el espejo no cubre: no hay techo contra el que comparar
    { drive_file_id: 's', name: `${CUIT_PROPIO}_006_00002_00000001.pdf`, modified_time: '2026-07-01T00:00:00Z' },
    // sin patrón fiscal en el nombre
    { drive_file_id: 'r', name: 'Remito.pdf', modified_time: '2026-07-01T00:00:00Z' },
  ], ESPEJO)
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.sin_patron, 1)
  assert.equal(r.no_juzgables.length, 2)
  assert.ok(r.no_juzgables.some((x) => /20355074170/.test(x.motivo)))
  assert.ok(r.no_juzgables.some((x) => /no hay techo/.test(x.motivo)))
})

test('novedadesDrive: el comprobante pendiente sale con su fileId, su evidencia y su ruta de carga', () => {
  const f = fuente('facturas_emitidas')
  const ns = novedadesDrive(f, {
    archivos: ARCHIVOS,
    enEspejo: ESPEJO,
    senal: { corte_modified_time: '2026-07-20T13:01:29Z' },
  })
  const cruce = ns.filter((n) => n.tipo === 'sin_correlato')
  assert.equal(cruce.length, 4)
  assert.match(cruce[0].titulo, /0001-00000217/)
  assert.equal(cruce[0].evidencia.drive_file_id, 'f1')
  assert.equal(cruce[0].evidencia.techo_espejo, 216)
  assert.match(cruce[0].accion, /ARCA/)
  assert.equal(cruce[0].que_decide, f.que_decide)
  // y las novedades de entrada de archivo, aparte
  assert.equal(ns.filter((n) => n.tipo === 'archivo_nuevo').length, 2)
  assert.equal(ns.senal.corte_modified_time, '2026-07-30T18:23:02.000Z')
})

test('un archivo MODIFICADO después de haber sido cargado nunca se aplica solo', () => {
  const f = fuente('facturas_emitidas') // techo aplicable_solo
  const ns = novedadesDrive(f, {
    archivos: [{ drive_file_id: 'f3', name: 'x.pdf', modified_time: '2026-07-29T00:00:00Z' }],
    senal: { corte_modified_time: '2026-07-01T00:00:00Z', archivos_vistos_ids: ['f3'] },
  })
  const m = ns.find((n) => n.tipo === 'archivo_modificado')
  assert.equal(m.clasificacion, 'requiere_dueno')
})

// ═══ SHEETS VINCULADOS ═══

test('sheet vinculado: primera vez línea de base; después el modifiedTime es novedad', () => {
  const f = fuente('sheet_jornales')
  const base = novedadesSheetVinculado(f, { meta: { modifiedTime: '2026-07-25T10:00:00Z' }, senal: {} })
  assert.equal(base.linea_base, true)
  assert.equal(base.length, 0)

  const ns = novedadesSheetVinculado(f, {
    meta: { modifiedTime: '2026-07-31T09:00:00Z' },
    senal: { modified_time: '2026-07-25T10:00:00Z' },
  })
  assert.equal(ns.length, 1)
  assert.equal(ns[0].tipo, 'sheet_modificado')
  assert.equal(ns[0].evidencia.anterior, '2026-07-25T10:00:00Z')
})

test('si cambió el VALOR vigilado, esa es la novedad y el modifiedTime no se repite', () => {
  const f = fuente('sheet_jornales')
  const ns = novedadesSheetVinculado(f, {
    meta: { modifiedTime: '2026-07-31T09:00:00Z' },
    celdas: { 'RESUMEN!B4': '1500000' },
    senal: { modified_time: '2026-07-25T10:00:00Z', celdas: { 'RESUMEN!B4': '1230000' } },
  })
  assert.equal(ns.length, 1)
  assert.equal(ns[0].tipo, 'valor_cambiado')
  assert.equal(ns[0].evidencia.antes, '1230000')
  assert.equal(ns[0].evidencia.ahora, '1500000')
  // un valor que cambió en una fuente del Flujo es plata: no se aplica solo
  assert.equal(ns[0].clasificacion, 'requiere_dueno')
})

test('un modifiedTime que no avanzó no genera novedad', () => {
  const f = fuente('sheet_pyl')
  const ns = novedadesSheetVinculado(f, {
    meta: { modifiedTime: '2026-07-25T10:00:00Z' },
    senal: { modified_time: '2026-07-25T10:00:00Z' },
  })
  assert.equal(ns.length, 0)
})

// ═══ ARCA ═══

test('ARCA: el espejo atrasado respecto del período que ya debería estar es novedad, con su gracia', () => {
  const f = fuente('arca_ventas')
  const ns = novedadesArca(f, {
    periodoMaximo: '2026-05', comprobantes: 400,
    senal: { periodo_maximo: '2026-05' }, ahora: new Date('2026-07-31T12:00:00Z'),
  })
  const atr = ns.find((n) => n.evidencia.periodo_esperado)
  assert.ok(atr, 'debería detectar que falta junio')
  assert.equal(atr.evidencia.periodo_esperado, '2026-06')
  assert.match(atr.accion, /2026-05 → 2026-06/)
})

test('ARCA: con un mes de gracia, tener el mes anterior cargado NO es novedad', () => {
  const f = fuente('arca_ventas')
  const ns = novedadesArca(f, {
    periodoMaximo: '2026-06', senal: { periodo_maximo: '2026-06' }, ahora: new Date('2026-07-31T12:00:00Z'),
  })
  assert.equal(ns.length, 0)
})

test('ARCA: el espejo que AVANZA también es novedad — hay período nuevo para consumir', () => {
  const f = fuente('arca_compras')
  const ns = novedadesArca(f, {
    periodoMaximo: '2026-07', comprobantes: 443,
    senal: { periodo_maximo: '2026-06' }, ahora: new Date('2026-07-31T12:00:00Z'),
  })
  const av = ns.find((n) => n.id_hecho.startsWith('avance:'))
  assert.ok(av)
  assert.equal(av.evidencia.anterior, '2026-06')
  assert.equal(av.clasificacion, 'aplicable_solo')
})

test('ARCA vacío: la novedad es CIEGA, no un cero silencioso', () => {
  const ns = novedadesArca(fuente('arca_ventas'), { periodoMaximo: null })
  assert.equal(ns.length, 1)
  assert.equal(ns[0].clasificacion, 'ciega')
})

// ═══ UOCRA / CCT ═══

const ESCALA_JULIO = [
  { vigencia_desde: '2026-07-01', zona: 'A', categoria: 'Oficial Especializado', basico_hora: '6800' },
  { vigencia_desde: '2026-07-01', zona: 'A', categoria: 'Oficial', basico_hora: '5817' },
  { vigencia_desde: '2026-07-01', zona: 'A', categoria: 'Ayudante', basico_hora: '4948' },
]

test('CCT sin referencia externa: NO se inventa una comparación, se afirma el vencimiento', () => {
  const f = fuente('uocra_cct')
  const ns = novedadesCct(f, { guardada: ESCALA_JULIO, ahora: new Date('2026-07-31T12:00:00Z') })
  assert.equal(ns.length, 1)
  assert.equal(ns[0].clasificacion, 'requiere_dueno')
  assert.match(ns[0].titulo, /escalones mensuales/)
  assert.equal(ns[0].evidencia.referencia_oficial,
    'no disponible — el OS no tiene fuente automática de la escala publicada del CCT 76/75')
  assert.equal(ns[0].evidencia.dias_al_cambio, 1)
})

test('CCT: a mitad de mes, con la escala del mes cargada, no hay novedad', () => {
  const ns = novedadesCct(fuente('uocra_cct'), { guardada: ESCALA_JULIO, ahora: new Date('2026-07-10T12:00:00Z') })
  assert.equal(ns.length, 0)
})

test('CCT: la escala del mes pasado contra el mes en curso es una escala vencida', () => {
  const ns = novedadesCct(fuente('uocra_cct'), { guardada: ESCALA_JULIO, ahora: new Date('2026-08-10T12:00:00Z') })
  assert.equal(ns.length, 1)
  assert.match(ns[0].titulo, /escala vencida/)
})

test('CCT con referencia externa: compara valor por valor y muestra los dos números', () => {
  const ns = novedadesCct(fuente('uocra_cct'), {
    guardada: ESCALA_JULIO,
    referencia: { basicos: { 'Oficial Especializado': 7420, Oficial: 5817 }, fuente: 'acuerdo mayo 2026' },
    ahora: new Date('2026-07-31T12:00:00Z'),
  })
  assert.equal(ns.length, 1)
  assert.equal(ns[0].evidencia.categoria, 'Oficial Especializado')
  assert.equal(ns[0].evidencia.guardado, 6800)
  assert.equal(ns[0].evidencia.referencia, 7420)
  assert.equal(ns[0].evidencia.fuente_referencia, 'acuerdo mayo 2026')
})

test('CCT sin escala guardada: ciega, no un supuesto', () => {
  const ns = novedadesCct(fuente('uocra_cct'), { guardada: [] })
  assert.equal(ns[0].clasificacion, 'ciega')
})

// ═══ SILENCIO ═══

test('banco: cinco días sin extracto es silencio; dentro de la tolerancia no', () => {
  const f = fuente('banco') // dias_tolerados: 4
  const callado = novedadesSilencio(f, { ultimaFecha: '2026-07-25T00:00:00Z', filas: 206, ahora: new Date('2026-07-31T12:00:00Z') })
  assert.equal(callado.length, 1)
  assert.equal(callado[0].tipo, 'silencio')
  assert.equal(callado[0].evidencia.dias_de_atraso, 6)
  assert.equal(callado[0].clasificacion, 'requiere_dueno') // el extracto entra a mano

  const alDia = novedadesSilencio(f, { ultimaFecha: '2026-07-30T00:00:00Z', ahora: new Date('2026-07-31T12:00:00Z') })
  assert.equal(alDia.length, 0)
})

test('banco sin ningún dato: ciega', () => {
  const ns = novedadesSilencio(fuente('banco'), { ultimaFecha: null })
  assert.equal(ns[0].clasificacion, 'ciega')
})

// ═══ SALIDA ═══

test('una fuente que no se puede ver produce una novedad ciega con el motivo', () => {
  const n = novedadCiega(fuente('sheet_pyl'), 'falta la credencial del service account de Google')
  assert.equal(n.clasificacion, 'ciega')
  assert.match(n.titulo, /No puedo ver/)
  assert.match(n.evidencia.motivo, /credencial/)
})

test('el informe agrupa por clasificación, y muestra evidencia y acción de cada novedad', () => {
  const ns = [
    novedadCiega(fuente('sheet_pyl'), 'sin credencial'),
    ...novedadesSilencio(fuente('banco'), { ultimaFecha: '2026-07-20T00:00:00Z', ahora: new Date('2026-07-31T00:00:00Z') }),
  ]
  const txt = formatNovedades(ns, { ahora: new Date('2026-07-31T12:00:00Z') })
  assert.match(txt, /VIGÍA DE FUENTES — 2026-07-31 12:00/)
  assert.match(txt, /requiere al dueño/)
  assert.match(txt, /no puedo ver/)
  assert.match(txt, /decide:/)
  assert.match(txt, /acción:/)
  const r = resumen(ns)
  assert.equal(r.total, 2)
  assert.equal(r.ciega, 1)
  assert.equal(r.requiere_dueno, 1)
})

test('sin novedades, el informe lo dice explícitamente (no queda vacío)', () => {
  const txt = formatNovedades([], { ahora: new Date('2026-07-31T12:00:00Z') })
  assert.match(txt, /Sin novedades/)
  assert.equal(avisoTexto([]), null)
})

test('una ronda sin novedades igual muestra QUÉ se miró — si no, no se distingue de no haber corrido', () => {
  const txt = formatNovedades([], {
    ahora: new Date('2026-07-31T12:00:00Z'),
    contexto: ['· índice del data room: 2465 archivos, leído hace 3h.'],
  })
  assert.match(txt, /índice del data room/)
})

test('cada Sheet vinculado declara un drive_file_id con forma de id de Drive, y ninguno se repite', () => {
  const sheets = FUENTES.filter((f) => f.tipo === 'sheet_vinculado')
  assert.ok(sheets.length >= 3)
  const ids = sheets.map((f) => f.drive_file_id)
  for (const id of ids) assert.match(String(id), /^[A-Za-z0-9_-]{25,}$/)
  assert.equal(new Set(ids).size, ids.length, 'dos fuentes vigilando el mismo archivo')
})

test('el aviso es corto y prioriza lo que necesita al dueño', () => {
  const ns = novedadesSilencio(fuente('banco'), { ultimaFecha: '2026-07-20T00:00:00Z', ahora: new Date('2026-07-31T00:00:00Z') })
  const a = avisoTexto(ns, { ahora: new Date('2026-07-31T00:00:00Z') })
  assert.match(a, /Vigía de fuentes — 2026-07-31/)
  assert.ok(a.split('\n').length <= 4, 'un aviso largo no se lee')
})

// ═══ UTILIDADES ═══

test('corteMaximo ignora lo que no es fecha, y dias cuenta pisos', () => {
  assert.equal(corteMaximo(['2026-07-01T00:00:00Z', null, 'no es fecha', '2026-07-30T18:00:00Z']),
    '2026-07-30T18:00:00.000Z')
  assert.equal(corteMaximo([]), null)
  assert.equal(dias('2026-07-25T00:00:00Z', '2026-07-31T12:00:00Z'), 6)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS TIMERS: LA CAPACIDAD QUE SE MUERE SIN AVISAR (31/07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL CASO REAL. El dueño: "proveedores sigue sin ser una pestaña viva... la seccion 1 no se actualiza".
// Se rediseñó la pestaña entera. La causa era otra: `echegaray-proveedores.timer`, `enabled` y
// **detenido el 27/07 a las 16:48**. Refrescaba cada 2h y dejó de hacerlo, sin un solo aviso. Cuando se
// volvió a arrancar, la misma pestaña de siempre se refrescó sola y sin errores.
//
// Y había CINCO más iguales, incluido `echegaray-orq-health.timer`: el que avisaría estaba entre los
// muertos. Eso es lo que este detector cierra.
const F_TIMERS = fuente('timers_del_flujo')

test('un timer ENABLED pero INACTIVE es una capacidad muerta, y se reporta', () => {
  const ns = novedadesTimers(F_TIMERS, { timers: [
    { unidad: 'echegaray-proveedores.timer', enabled: true, active: false, proxima: null, ultima: 'Mon 2026-07-27 15:45:32' },
    { unidad: 'echegaray-vigia-fuentes.timer', enabled: true, active: true, proxima: 'Fri 2026-07-31 16:42:20', ultima: 'Fri 2026-07-31 12:42:20' },
  ] })
  assert.equal(ns.length, 1, 'sólo el muerto genera novedad; el vivo no ensucia')
  assert.match(ns[0].titulo, /echegaray-proveedores\.timer/)
  assert.match(ns[0].titulo, /DETENIDO/)
  assert.match(ns[0].titulo, /2026-07-27/, 'dice desde cuándo no corre: es el dato que faltaba')
  assert.equal(ns[0].tipo, 'capacidad_muerta')
  assert.equal(ns[0].evidencia.enabled, true)
  assert.equal(ns[0].evidencia.active, false)
  assert.equal(ns.senal.muertos, 1)
  assert.equal(ns.senal.vigilados, 2)
})

test('NO propone arrancarlo solo: varios están parados a propósito', () => {
  // La autonomía se congeló por decisión del dueño, y caja-sync está detenido porque su sync daba una
  // caja falsa (−$3,18M contra +$17,69M real). Un vigía que reactive timers solo puede volver a meter
  // datos malos en el archivo, así que sólo REPORTA.
  const ns = novedadesTimers(F_TIMERS, { timers: [{ unidad: 'echegaray-espejos.timer', enabled: true, active: false, ultima: null }] })
  assert.equal(ns[0].clasificacion, 'requiere_dueno', 'reactivar un timer es del dueño, nunca automático')
  assert.match(ns[0].accion, /A PROPÓSITO/)
  assert.match(ns[0].accion, /NO se arranca solo/)
})

test('ACTIVE sin próxima corrida también es no correr', () => {
  // Pasó al arrancar el timer de proveedores: quedó active y sin NEXT hasta que el service terminó.
  // Si eso persiste, la unidad está viva y no hace nada — el peor de los dos estados, porque parece bien.
  const ns = novedadesTimers(F_TIMERS, { timers: [{ unidad: 'echegaray-espejos.timer', enabled: true, active: true, proxima: null }] })
  assert.equal(ns.length, 1)
  assert.match(ns[0].titulo, /sin próxima corrida/)
  assert.equal(ns.senal.sin_agenda, 1)
})

test('la lista de unidades vigiladas es la que deja el Flujo desactualizado si se detiene', () => {
  // No se vigilan todas las del sistema: sólo aquellas cuyo silencio se VE en el archivo. Y el propio
  // vigía está en la lista, porque un vigía muerto no puede avisar de sí mismo.
  assert.ok(F_TIMERS.unidades.includes('echegaray-proveedores.timer'), 'el que falló tiene que estar')
  assert.ok(F_TIMERS.unidades.includes('echegaray-orq-health.timer'), 'el que avisaría y estaba muerto')
  assert.ok(F_TIMERS.unidades.includes('echegaray-vigia-fuentes.timer'), 'y este vigía')
  assert.equal(F_TIMERS.nivel, 'requiere_dueno')
  // Y los que están parados A PROPÓSITO quedan FUERA: reportarlos cada 4 horas sería ruido permanente,
  // y el ruido permanente es cómo una alerta deja de leerse. caja-sync (caja falsa) y los de autonomía
  // congelada no están en la lista.
  assert.ok(!F_TIMERS.unidades.includes('echegaray-caja-sync.timer'), 'caja-sync está detenido a propósito')
  assert.ok(!F_TIMERS.unidades.includes('echegaray-plan-ejecutar.timer'), 'la autonomía está congelada por decisión del dueño')
})

test('todo vivo → ninguna novedad (no genera ruido cada 4 horas)', () => {
  const ns = novedadesTimers(F_TIMERS, { timers: [
    { unidad: 'echegaray-proveedores.timer', enabled: true, active: true, proxima: 'Fri 2026-07-31 13:46:28' },
    { unidad: 'echegaray-compras-sync.timer', enabled: true, active: true, proxima: 'Fri 2026-07-31 13:18:51' },
  ] })
  assert.equal(ns.length, 0)
  assert.equal(ns.senal.muertos, 0)
})

test('la fecha de un sello de systemd se EXTRAE, no se corta', () => {
  // systemd escribe el día de la semana adelante. slice(0,10) devolvía "Mon 2026-0" justo en el aviso
  // que tiene que decir desde cuándo no corre — lo atrapó el test, no el archivo.
  assert.equal(fechaDeSystemd('Mon 2026-07-27 15:45:32 -03'), '2026-07-27')
  assert.equal(fechaDeSystemd('Fri 2026-07-31 13:46:28 -03'), '2026-07-31')
  assert.equal(fechaDeSystemd('-'), null)
  assert.equal(fechaDeSystemd(null), null)
})

test('el aviso dice DESDE CUÁNDO, con fecha o con el relativo de systemd', () => {
  // `list-timers` da la fecha absoluta o el relativo según cómo se lo invoque. La primera corrida real
  // del detector decía "no se actualiza desde no se sabe cuándo" mientras su propia evidencia decía
  // "3 days ago": el dato estaba y el aviso lo tiraba.
  assert.equal(desdeCuando('Mon 2026-07-27 15:45:32 -03'), 'el 2026-07-27')
  assert.equal(desdeCuando('3 days ago'), '3 days ago')
  assert.equal(desdeCuando('-'), 'no se sabe cuándo')
  assert.equal(desdeCuando(null), 'no se sabe cuándo')
})

test('el aviso del CCT SE APAGA cuando la escala del mes que viene ya está cargada', () => {
  // El 31/07, con agosto ya cargado, el vigía seguía diciendo "faltan 1 día para 2026-08 y la escala
  // más nueva es la de 2026-08". Un aviso que no se apaga cuando el problema se resolvió es un aviso
  // que se deja de leer.
  const F = fuente('uocra_cct')
  const AHORA = new Date(Date.UTC(2026, 6, 31))
  const conAgosto = novedadesCct(F, { guardada: [{ zona: 'A', vigencia_desde: '2026-08-01', categoria: 'Ayudante', basico_hora: 5399 }], ahora: AHORA })
  assert.equal(conAgosto.length, 0, 'con la escala del mes que viene cargada, no hay novedad')
  // Y sigue avisando si SÓLO está julio: ahí sí falta cargar.
  const soloJulio = novedadesCct(F, { guardada: [{ zona: 'A', vigencia_desde: '2026-07-01', categoria: 'Ayudante', basico_hora: 4948 }], ahora: AHORA })
  assert.equal(soloJulio.length, 1)
  assert.match(soloJulio[0].titulo, /faltan 1 día/)
  // Y una escala VENCIDA (anterior al mes en curso) avisa siempre, falten días o no.
  const vencida = novedadesCct(F, { guardada: [{ zona: 'A', vigencia_desde: '2026-05-01', categoria: 'Ayudante', basico_hora: 4452 }], ahora: new Date(Date.UTC(2026, 6, 10)) })
  assert.equal(vencida.length, 1)
  assert.match(vencida[0].titulo, /escala vencida/)
})
