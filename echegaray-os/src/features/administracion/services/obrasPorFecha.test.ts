// HORAS DE UN DÍA ANTERIOR, EN LA OBRA DE ESE DÍA — dueño, 15/09/2026, cargando la quincena:
// «no existe la posibilidad de marcarle hs en una obra determinada de días anteriores a ninguna persona».
//
// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//  · la lista de obras de un día era la de HOY (sólo `activa`): una obra cerrada la semana pasada no se
//    podía elegir para el día en que estaba abierta, y hubo que reactivar «LE - OFICINA Y FÁBRICA DE
//    PALITOS» para cargar dos días;
//  · la acción rechazaba igual esa obra (`puertaDeObraNoActiva` sin la fecha);
//  · el editor de la celda imputaba siempre a la obra de hoy de la fila, y sin obra de hoy pedía
//    «elegí la obra» sin ofrecer ninguna.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MARGEN_DIAS, admiteHorasEl, esObraDePrueba, obrasElegiblesEl, ventanaDe, type ObraConVentana,
} from './obrasPorFecha.ts'
import { accesoACelda, obraDeLaCelda, planDeCelda, TRABAJO } from './edicionDeCelda.ts'
import { puertaDeObraNoActiva } from './planDeJornada.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const obra = (id: string, o: Partial<ObraConVentana>): ObraConVentana => ({
  id, nombre: id.toUpperCase(), estado: 'activa',
  fecha_inicio_real: null, fecha_inicio_plan: null, fecha_fin_real: null, ...o,
})

const ACTIVA = obra('activa', {})
const PALITOS = obra('palitos', { estado: 'cerrada', fecha_inicio_real: '2026-08-01', fecha_fin_real: '2026-09-10' })
const PAUSADA = obra('pausada', { estado: 'pausada', fecha_inicio_plan: '2026-09-01' })
const SIN_INICIO = obra('sin-inicio', { estado: 'cerrada', fecha_fin_real: '2026-09-30' })
const PRESUPUESTADA = obra('presupuestada', { estado: 'presupuestada', fecha_inicio_plan: '2026-01-01' })
const CATALOGO = [ACTIVA, PALITOS, PAUSADA, SIN_INICIO, PRESUPUESTADA]

test('LA OBRA CERRADA ADMITE HORAS DE LOS DÍAS DE SU VENTANA, y ni un día fuera', () => {
  assert.equal(admiteHorasEl(PALITOS, '2026-09-08'), true, 'estaba abierta el 08/09')
  assert.equal(admiteHorasEl(PALITOS, '2026-08-01'), true, 'el día de inicio entra')
  assert.equal(admiteHorasEl(PALITOS, '2026-09-10'), true, 'el día de fin entra')
  assert.equal(admiteHorasEl(PALITOS, '2026-09-11'), false, 'después del fin, no')
  assert.equal(admiteHorasEl(PALITOS, '2026-07-31'), false, 'antes del inicio, no')
})

test('sin fin es abierta; sin inicio NO: una cerrada sin fechas aceptaría cualquier día de la historia', () => {
  assert.equal(admiteHorasEl(PAUSADA, '2026-09-14'), true)
  assert.equal(admiteHorasEl(PAUSADA, '2026-08-31'), false, 'el inicio plan también acota')
  assert.equal(admiteHorasEl(SIN_INICIO, '2026-09-08'), false)
  assert.equal(admiteHorasEl(PRESUPUESTADA, '2026-09-08'), false, 'lo que nunca se ejecutó no tiene ventana')
  assert.equal(admiteHorasEl(ACTIVA, '2020-01-01'), true, 'la activa admite siempre, como antes')
})

test('el inicio real le gana al plan; la marca de hora del timestamp no corre el día', () => {
  const o = obra('x', { estado: 'cerrada', fecha_inicio_plan: '2026-01-01', fecha_inicio_real: '2026-09-05T00:00:00+00:00', fecha_fin_real: '2026-09-09T23:00:00+00:00' })
  assert.equal(admiteHorasEl(o, '2026-09-04'), false)
  assert.equal(admiteHorasEl(o, '2026-09-09'), true)
})

test('LA LISTA DEL DÍA: activas + cerradas en marcha, marcadas', () => {
  assert.deepEqual(obrasElegiblesEl(CATALOGO, '2026-09-08'), [
    { id: 'activa', nombre: 'ACTIVA', cerrada: false },
    { id: 'palitos', nombre: 'PALITOS', cerrada: true },
    { id: 'pausada', nombre: 'PAUSADA', cerrada: true },
  ])
  assert.deepEqual(obrasElegiblesEl(CATALOGO, '2026-09-14').map((o) => o.id), ['activa', 'pausada'])
})

test('LA ACCIÓN ACEPTA LA CERRADA QUE ADMITE LA FECHA, y sin fecha sigue diciendo que no', () => {
  assert.equal(puertaDeObraNoActiva({ nombre: 'PALITOS', estado: 'cerrada', crea: true, admiteLaFecha: true }), null)
  assert.match(puertaDeObraNoActiva({ nombre: 'PALITOS', estado: 'cerrada', crea: true, admiteLaFecha: false }) ?? '', /cerrada/)
  assert.match(puertaDeObraNoActiva({ nombre: 'PALITOS', estado: 'cerrada', crea: true }) ?? '', /cerrada/)
  // Las dos puertas de escritura mandan la fecha a la puerta. Sin esto la pantalla ofrece la obra y
  // la acción la rebota: la misma regla tiene que estar en los dos lados.
  const acciones = fuente('./jornadaPorObraActions.ts')
  assert.equal(acciones.match(/admiteHorasEl\(await conEvidenciaDeHoras\(supabase, /g)?.length, 2, 'guardarJornada y corregirJornada, con evidencia')
})

// MEDIDO EN LA BASE (15/09/2026, lectura READ ONLY): 10 de 20 obras cerradas sin fecha de inicio. Con la
// regla anterior, la-estrella (559 filas de horas del 05/01 al 10/09) o le-mamposteria (433, 02/03 al
// 30/06) no se podían elegir para ningún día: el mismo reclamo del dueño, en la mitad de la cartera.
const LE_MAMPOSTERIA = obra('le-mamposteria', { estado: 'cerrada', primera_hh: '2026-03-02', ultima_hh: '2026-06-30' })
const SF_MAMPOSTERIA = obra('sf-mamposteria', {
  estado: 'cerrada', fecha_inicio_plan: '2026-08-07', fecha_fin_real: '2026-09-02', primera_hh: '2026-08-17', ultima_hh: '2026-09-14',
})

test('SIN FECHAS DECLARADAS, LA VENTANA SALE DE LAS HORAS CARGADAS, con el margen declarado y ni un día más', () => {
  assert.equal(MARGEN_DIAS, 16, 'la quincena más larga: si cambia, que sea a propósito')
  assert.deepEqual(ventanaDe(LE_MAMPOSTERIA), { inicio: '2026-02-14', fin: '2026-07-16' })
  assert.equal(admiteHorasEl(LE_MAMPOSTERIA, '2026-02-14'), true)
  assert.equal(admiteHorasEl(LE_MAMPOSTERIA, '2026-02-13'), false)
  assert.equal(admiteHorasEl(LE_MAMPOSTERIA, '2026-07-16'), true)
  assert.equal(admiteHorasEl(LE_MAMPOSTERIA, '2026-07-17'), false)
  assert.equal(admiteHorasEl(LE_MAMPOSTERIA, '2025-01-01'), false, 'no cualquier día de la historia')
})

test('SIN FECHAS Y SIN UNA SOLA HORA NO HAY VENTANA: galpones o le-galpon-7 no se inventan un período', () => {
  assert.equal(ventanaDe(obra('galpones', { estado: 'cerrada' })), null)
  assert.equal(admiteHorasEl(obra('galpones', { estado: 'cerrada' }), '2026-09-08'), false)
})

test('LA EVIDENCIA MÁS TARDÍA GANA: fin declarado 02/09 con horas hasta el 14/09 cierra el 14/09', () => {
  assert.deepEqual(ventanaDe(SF_MAMPOSTERIA), { inicio: '2026-08-07', fin: '2026-09-14' })
  assert.equal(admiteHorasEl(SF_MAMPOSTERIA, '2026-09-14'), true)
  assert.equal(admiteHorasEl(SF_MAMPOSTERIA, '2026-09-15'), false, 'sin margen sobre una fecha declarada')
  // Y lo mismo al revés: horas antes del inicio declarado abren la ventana en la primera hora.
  const antes = obra('x', { estado: 'cerrada', fecha_inicio_real: '2026-05-01', fecha_fin_real: '2026-06-01', primera_hh: '2026-04-20' })
  assert.equal(ventanaDe(antes)?.inicio, '2026-04-20')
})

test('LAS OBRAS DE PRUEBA CERRADAS NUNCA SE OFRECEN; la activa es el fixture de una corrida y se respeta', () => {
  const zz = obra('zz-e2e-celda00-0000-4000-8000-000000', { estado: 'cerrada', primera_hh: '2026-09-01', ultima_hh: '2026-09-10' })
  const pruebaE2e = obra('prueba-e2e', { estado: 'cerrada', fecha_inicio_plan: '2026-08-11' })
  const porNombre = obra('otra', { nombre: '[PRUEBA E2E] obra', estado: 'cerrada', fecha_inicio_real: '2026-01-01' })
  const porCodigo = obra('otra2', { codigo: 'ZZ-0001', estado: 'cerrada', fecha_inicio_real: '2026-01-01' })
  for (const o of [zz, pruebaE2e, porNombre, porCodigo]) {
    assert.equal(esObraDePrueba(o), true, o.id)
    assert.equal(admiteHorasEl(o, '2026-09-08'), false, o.id)
  }
  assert.deepEqual(obrasElegiblesEl([zz, pruebaE2e, porNombre, porCodigo, LE_MAMPOSTERIA], '2026-06-01').map((o) => o.id), ['le-mamposteria'])
  assert.equal(admiteHorasEl({ ...zz, estado: 'activa' }, '2026-09-08'), true, 'fixture activo de la suite E2E')
  assert.equal(esObraDePrueba(LE_MAMPOSTERIA), false)
})

test('LA GRILLA LEE LA EVIDENCIA EN LA MISMA CONSULTA DEL CATÁLOGO, sin una lectura por obra', () => {
  const bloque = fuente('../components/BloqueAsistenciaQuincena.tsx')
  assert.match(bloque, /primera:registros_hh\(fecha\), ultima:registros_hh\(fecha\)/)
  assert.match(bloque, /limit\(1, \{ referencedTable: 'primera' \}\)/)
  assert.match(bloque, /limit\(1, \{ referencedTable: 'ultima' \}\)/)
  assert.match(bloque, /primera_hh: o\.primera\?\.\[0\]\?\.fecha/)
  assert.doesNotMatch(bloque, /for \(const [^)]*\)[^{]*\{[^}]*registros_hh/, 'nada de un bucle que lea horas por obra')
})

test('PERSONA SIN OBRA DE HOY, DÍA PASADO VACÍO: la celda abre el editor, que ofrece la obra de ese día', () => {
  assert.equal(accesoACelda({ estado: 'sin_marcar', tramos: 0, conObraPorDefecto: false, puedeCorregir: true }), 'editor')
  const o = obraDeLaCelda({ fecha: '2026-09-08', tramos: [], obraPorDefecto: null, catalogo: CATALOGO })
  assert.equal(o.inicial, null, 'no se adivina a qué obra va el costo')
  assert.deepEqual(o.opciones.map((x) => x.etiqueta), ['ACTIVA', 'PALITOS (cerrada)', 'PAUSADA (cerrada)'])
  // Y lo elegido en el selector es lo que viaja a la acción.
  const plan = planDeCelda({ estado: TRABAJO, horas: '9', fecha: '2026-09-08', hoy: '2026-09-15', obraOrigen: null, obraDestino: 'palitos' })
  assert.deepEqual(plan.ok && plan.correccion, {
    fecha: '2026-09-08', obra_origen: null, obra_destino: 'palitos', estado: 'presente', horas: 9, motivo: null,
  })
})

test('DÍA ANTERIOR EN OTRA OBRA QUE LA DE LA FILA: se tipea en la de la fila y el editor ofrece la otra', () => {
  assert.equal(accesoACelda({ estado: 'sin_marcar', tramos: 0, conObraPorDefecto: true, puedeCorregir: true }), 'tipear')
  const o = obraDeLaCelda({ fecha: '2026-09-08', tramos: [], obraPorDefecto: { id: 'activa' }, catalogo: CATALOGO })
  assert.equal(o.inicial, 'activa')
  assert.ok(o.opciones.some((x) => x.valor === 'palitos'), 'la cerrada en marcha ese día se puede elegir')
})

test('el día con horas viene elegido en SU obra, aunque su ventana ya no lo cubra', () => {
  const o = obraDeLaCelda({
    fecha: '2026-09-14', tramos: [{ obra_id: 'palitos', nombre: 'PALITOS' }], obraPorDefecto: { id: 'activa' }, catalogo: CATALOGO,
  })
  assert.equal(o.inicial, 'palitos')
  assert.equal(o.opciones[0].valor, 'palitos')
})

test('LO QUE NO CAMBIA: licencia, ausencia, futuro y no laborable no se tipean; el día repartido va al panel', () => {
  for (const estado of ['licencia', 'ausente', 'futuro', 'no_laborable']) {
    assert.equal(accesoACelda({ estado, tramos: 0, conObraPorDefecto: true, puedeCorregir: true }), 'editor', estado)
    assert.equal(accesoACelda({ estado, tramos: 0, conObraPorDefecto: true, puedeCorregir: false }), 'lectura', estado)
  }
  assert.equal(accesoACelda({ estado: 'horas', tramos: 2, conObraPorDefecto: true, puedeCorregir: true }), 'panel')
  assert.equal(accesoACelda({ estado: 'horas', tramos: 1, conObraPorDefecto: false, puedeCorregir: false }), 'tipear')
})

// «GANA LA WEB» (dueño, 14/09/2026): la corrección a mano de Administración le gana a JORNALES, la carga
// del jefe cede. El defecto: `corregirJornada` —el editor de la celda y el panel— ESTRENABA el día con
// la marca del jefe, así que el día pasado cargado a mano quedaba expuesto a que la planilla lo pise.
test('EL DÍA QUE ADMINISTRACIÓN ESTRENA DESDE LA CELDA NACE CON LA MARCA QUE GANA LA WEB', () => {
  const acciones = fuente('./jornadaPorObraActions.ts')
  const importador = fuente('../../../../orquestador/lib/jornales-a-registros-hh.mjs')
  const aMano = importador.match(/MARCAS_A_MANO = new Set\(\[([^\]]*)\]/)?.[1] ?? ''
  const ceden = importador.match(/MARCAS_QUE_CEDEN = new Set\(\[([^\]]*)\]/)?.[1] ?? ''
  assert.match(aMano, /'web:correccion-horas'/, 'la marca de corrección está protegida')
  assert.doesNotMatch(ceden, /'web:correccion-horas'/)
  assert.match(fuente('./presenciaDelDia.ts'), /FUENTE_CORRECCION_HORAS = 'web:correccion-horas'/)
  const corregir = acciones.slice(acciones.indexOf('export async function corregirJornada'))
  assert.match(corregir, /administraLicencias: true \}\), FUENTE_CORRECCION_HORAS\)/, 'corregirJornada estrena con la marca a mano')
  assert.match(acciones, /fuente_legacy: fuenteAlta,/, 'el alta usa la fuente que pide quien escribe')
})

test('la grilla y el editor pasan por la regla, no por una copia', () => {
  const grilla = fuente('../components/GrillaAsistenciaObra.tsx')
  assert.match(grilla, /accesoACelda\(/)
  assert.match(grilla, /obraDeLaCelda\(/)
  assert.match(fuente('../components/asistencia/EditorCeldaAsistencia.tsx'), /data-testid="editor-celda-obra"/)
})
