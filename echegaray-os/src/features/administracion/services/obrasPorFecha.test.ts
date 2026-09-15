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
import { admiteHorasEl, obrasElegiblesEl, type ObraConVentana } from './obrasPorFecha.ts'
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
  assert.equal(acciones.match(/admiteLaFecha: admiteHorasEl\(/g)?.length, 2, 'guardarJornada y corregirJornada')
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

test('la grilla y el editor pasan por la regla, no por una copia', () => {
  const grilla = fuente('../components/GrillaAsistenciaObra.tsx')
  assert.match(grilla, /accesoACelda\(/)
  assert.match(grilla, /obraDeLaCelda\(/)
  assert.match(fuente('../components/asistencia/EditorCeldaAsistencia.tsx'), /data-testid="editor-celda-obra"/)
})
