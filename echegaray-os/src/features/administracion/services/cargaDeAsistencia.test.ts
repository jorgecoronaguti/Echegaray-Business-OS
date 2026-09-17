import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casillaTrasToque, marcaDeLaCasilla } from './presenciaDelDia.ts'
import {
  entradaDeMover, envioDeHoras, hrefCorregirEnHoras, muestraTardanza, queSePuedeElDia,
  agruparPorObra, armarCargaDelDia, filtrarCarga, hrefCargaDeAsistencia, limiteDelJefe,
  MARCAR_JEFES_Y_MENSUALES, NOMBRE_SIN_OBRA, OBRA_SIN_OBRA, obraDelDiaDePersona, puedeCorregirElDia,
  puedeMoverDeObraEl, resumenDeCarga, seListaParaMarcar, tienePresentismo,
  type AsignacionDelDia, type HoraDelDiaConObra, type PersonaDeLaCarga, type PresenciaDelDiaConObra,
} from './cargaDeAsistencia.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//  1. Que alguien declarado en OTRA obra aparezca en su obra asignada: se lo marcaría de nuevo y el
//     upsert por (persona, fecha) pisaría la primera declaración.
//  2. Que las horas de la segunda obra del día queden fuera de la fila (decisión 4: 5 + 4).
//  3. Que el jefe de obra desaparezca de la lista (decisión 2) o tenga presentismo.
//  4. Que el jefe corrija más de 2 días hábiles atrás (decisión 5), o que el fin de semana cuente.
//  5. Que «Sin obra» se mezcle con una obra o no quede al final.

const FECHA = '2026-09-17' // jueves
const juan: PersonaDeLaCarga = { id: 'juan', nombre: 'Juan', categoria: 'oficial', esJefe: false }
const jefa: PersonaDeLaCarga = { id: 'ana', nombre: 'Ana', categoria: null, esJefe: true }
const asig = (persona_id: string, obra_id: string, desde: string | null = '2026-09-01', hasta: string | null = null): AsignacionDelDia =>
  ({ persona_id, obra_id, desde, hasta })
const hh = (persona_id: string, obra: string | null, horas: number, tipo_hora = 'normal'): HoraDelDiaConObra =>
  ({ persona_id, obra_canonica_id: obra, horas, tipo_hora })
const pres = (persona_id: string, obra: string | null, estado: PresenciaDelDiaConObra['estado'] = 'presente'): PresenciaDelDiaConObra =>
  ({ persona_id, obra_canonica_id: obra, estado, motivo: null })

test('la marca del día manda sobre la asignación: aparece donde lo declararon', () => {
  const r = obraDelDiaDePersona({ fecha: FECHA, presencia: pres('juan', 'sf'), horas: [], asignaciones: [asig('juan', 'quattro')] })
  assert.deepEqual(r, { obraId: 'sf', porque: 'marca' })
})

test('sin marca, las horas trabajadas mandan; una ausencia sin obra no es pista', () => {
  assert.deepEqual(
    obraDelDiaDePersona({ fecha: FECHA, presencia: null, horas: [hh('juan', null, 9, 'ausencia'), hh('juan', 'sf', 9)], asignaciones: [asig('juan', 'quattro')] }),
    { obraId: 'sf', porque: 'horas' },
  )
})

test('sin marca ni horas, la asignación vigente ese día; fuera del tramo es «Sin obra»', () => {
  assert.deepEqual(obraDelDiaDePersona({ fecha: FECHA, presencia: null, horas: [], asignaciones: [asig('juan', 'quattro')] }),
    { obraId: 'quattro', porque: 'asignacion' })
  assert.deepEqual(obraDelDiaDePersona({ fecha: FECHA, presencia: null, horas: [], asignaciones: [asig('juan', 'quattro', '2026-09-01', '2026-09-10')] }),
    { obraId: null, porque: 'sin-obra' })
})

test('dos obras el mismo día: la fila lleva las horas de su obra y las de la otra al lado', () => {
  const [f] = armarCargaDelDia({
    fecha: FECHA, personas: [juan], presencias: [pres('juan', 'quattro')],
    horas: [hh('juan', 'quattro', 5), hh('juan', 'sf', 4), hh('juan', null, 9, 'ausencia')], asignaciones: [],
  })
  assert.equal(f.obraId, 'quattro')
  assert.equal(f.horas, 5)
  assert.deepEqual(f.otrasObras, [{ obraId: 'sf', horas: 4 }], 'las 4 h de la segunda obra quedaron fuera de la fila')
})

test('sin horas cargadas la fila dice null, no cero', () => {
  const [f] = armarCargaDelDia({ fecha: FECHA, personas: [juan], presencias: [], horas: [], asignaciones: [asig('juan', 'q')] })
  assert.equal(f.horas, null)
  assert.deepEqual(f.casilla, { estado: null, motivo: null })
})

test('decisión 2: el jefe de obra SE LISTA para marcar, y sin presentismo', () => {
  assert.equal(MARCAR_JEFES_Y_MENSUALES, true)
  assert.equal(seListaParaMarcar(jefa), true)
  assert.equal(tienePresentismo(jefa), false)
  assert.equal(tienePresentismo(juan), true)
  const filas = armarCargaDelDia({ fecha: FECHA, personas: [juan, jefa], presencias: [], horas: [], asignaciones: [] })
  assert.deepEqual(filas.map((f) => f.persona.id), ['juan', 'ana'])
})

test('grupos por nombre de obra con «Sin obra» al final; el filtro separa sin obra de las obras', () => {
  const filas = armarCargaDelDia({
    fecha: FECHA, personas: [juan, jefa, { id: 'leo', nombre: 'Leo', categoria: 'ayudante', esJefe: false }],
    presencias: [], horas: [], asignaciones: [asig('juan', 'b'), asig('ana', 'a')],
  })
  const grupos = agruparPorObra(filas, { a: 'Zeta', b: 'Alfa' })
  assert.deepEqual(grupos.map((g) => g.nombre), ['Alfa', 'Zeta', NOMBRE_SIN_OBRA])
  assert.deepEqual(filtrarCarga(filas, { obra: OBRA_SIN_OBRA }).map((f) => f.persona.id), ['leo'])
  assert.deepEqual(filtrarCarga(filas, { obra: 'b' }).map((f) => f.persona.id), ['juan'])
  assert.deepEqual(filtrarCarga(filas, { q: 'AYUDÁNTE' }).map((f) => f.persona.id), ['leo'], 'la búsqueda no ignora acentos ni mayúsculas')
})

test('el resumen cuenta cada estado y la tardanza sólo sobre presentes', () => {
  assert.deepEqual(resumenDeCarga([
    { estado: 'presente', motivo: null, llego_tarde: true },
    { estado: 'presente', motivo: null },
    { estado: 'ausente', motivo: 'falta' },
    { estado: 'licencia', motivo: 'vacaciones' },
    { estado: null, motivo: null },
  ]), { presentes: 2, ausentes: 1, licencias: 1, sinMarcar: 1, conTardanza: 1 })
})

test('decisión 5: el jefe corrige hoy y 2 días hábiles atrás; el fin de semana no cuenta', () => {
  // Lunes 21/09: los dos hábiles anteriores son viernes 18 y jueves 17.
  assert.equal(limiteDelJefe('2026-09-21'), '2026-09-17')
  assert.equal(limiteDelJefe(FECHA), '2026-09-15')
  assert.deepEqual(puedeCorregirElDia({ rol: 'jefe_obra', fecha: '2026-09-17', hoy: '2026-09-21' }), { ok: true })
  assert.equal(puedeCorregirElDia({ rol: 'jefe_obra', fecha: '2026-09-16', hoy: '2026-09-21' }).ok, false)
  assert.equal(puedeCorregirElDia({ rol: 'administracion', fecha: '2026-08-01', hoy: '2026-09-21' }).ok, true)
  assert.equal(puedeCorregirElDia({ rol: 'direccion', fecha: '2026-08-01', hoy: '2026-09-21' }).ok, true)
  assert.equal(puedeCorregirElDia({ rol: 'campo', fecha: '2026-09-21', hoy: '2026-09-21' }).ok, false)
  assert.equal(puedeCorregirElDia({ rol: null, fecha: '2026-09-21', hoy: '2026-09-21' }).ok, false, 'sin rol no puede fallar abierto')
})

test('mover de obra: desde hoy en adelante sí, hacia atrás no (misma regla que la acción)', () => {
  assert.equal(puedeMoverDeObraEl(FECHA, FECHA), true)
  assert.equal(puedeMoverDeObraEl('2026-09-18', FECHA), true)
  assert.equal(puedeMoverDeObraEl('2026-09-16', FECHA), false)
})

test('el enlace no escribe el día de hoy y conserva la obra', () => {
  assert.equal(hrefCargaDeAsistencia({ dia: FECHA, hoy: FECHA }), '/administracion/personas/asistencia')
  assert.equal(hrefCargaDeAsistencia({ dia: '2026-09-16', obra: 'sf', hoy: FECHA }), '/administracion/personas/asistencia?dia=2026-09-16&obra=sf')
})

// ── C3 · TARDANZA (plata: una marca pierde el presentismo de la quincena) ──────────────────────────

test('la tardanza se ofrece sobre «sin marcar» y «Está», nunca sobre ausente/licencia ni a un mensual', () => {
  assert.equal(muestraTardanza(juan, null), true)
  assert.equal(muestraTardanza(juan, 'presente'), true)
  assert.equal(muestraTardanza(juan, 'ausente'), false)
  assert.equal(muestraTardanza(juan, 'licencia'), false)
  assert.equal(muestraTardanza(jefa, 'presente'), false, 'un mensual no tiene presentismo que perder')
})

test('tocar «Llegó tarde» sobre sin marcar escribe presente con la marca; volver a tocar la saca en false', () => {
  const tarde = casillaTrasToque({ estado: null, motivo: null }, { tipo: 'tardanza', marca: 'llego_tarde' })
  assert.deepEqual(marcaDeLaCasilla('juan', tarde), { persona_id: 'juan', estado: 'presente', motivo: null, llego_tarde: true, salio_antes: false })
  const sin = casillaTrasToque(tarde, { tipo: 'tardanza', marca: 'llego_tarde' })
  assert.deepEqual(marcaDeLaCasilla('juan', sin), { persona_id: 'juan', estado: 'presente', motivo: null, llego_tarde: false, salio_antes: false },
    'sacar la tardanza tiene que viajar como false: omitirla dejaría la marca vieja guardada')
})

// ── M1 / M3 · MOVER HOY Y PASE PROGRAMADO ─────────────────────────────────────────────────────────

test('mover hoy viaja SIN desde; un día futuro es un pase programado con desde; un día pasado no viaja', () => {
  assert.deepEqual(entradaDeMover({ personaId: 'juan', destino: 'sf', fecha: FECHA, hoy: FECHA }), { persona_id: 'juan', obra_id: 'sf' })
  assert.deepEqual(entradaDeMover({ personaId: 'juan', destino: 'sf', fecha: '2026-09-21', hoy: FECHA }), { persona_id: 'juan', obra_id: 'sf', desde: '2026-09-21' })
  assert.deepEqual(entradaDeMover({ personaId: 'juan', destino: '', fecha: FECHA, hoy: FECHA }), { persona_id: 'juan', obra_id: null }, '«Sin obra» es un destino válido')
  assert.equal(entradaDeMover({ personaId: 'juan', destino: 'sf', fecha: '2026-09-16', hoy: FECHA }), null)
})

// ── H1 / H6 · HORAS DE UNA CASILLA ────────────────────────────────────────────────────────────────

test('casilla de horas: igual no escribe, vacío sobre vacío no escribe, vacío sobre horas vacía, cero es error', () => {
  const base = { personaId: 'juan', obraId: 'q', fecha: FECHA }
  assert.deepEqual(envioDeHoras({ ...base, antes: 9, texto: '9' }), { tipo: 'nada' })
  assert.deepEqual(envioDeHoras({ ...base, antes: null, texto: ' ' }), { tipo: 'nada' })
  assert.deepEqual(envioDeHoras({ ...base, antes: 9, texto: '' }), { tipo: 'guardar', entrada: { obra_id: 'q', fecha: FECHA, vaciar: ['juan'] } })
  assert.deepEqual(envioDeHoras({ ...base, antes: 9, texto: '5,5' }),
    { tipo: 'guardar', entrada: { obra_id: 'q', fecha: FECHA, marcas: [{ persona_id: 'juan', estado: 'presente', horas: 5.5 }] } })
  assert.equal(envioDeHoras({ ...base, antes: null, texto: '0' }).tipo, 'error')
})

test('la corrección completa se abre en la quincena de ese día, buscando a la persona', () => {
  const href = hrefCorregirEnHoras(FECHA, 'Juan Pérez')
  const u = new URL(href, 'http://x')
  assert.equal(u.pathname, '/administracion/personas')
  assert.equal(u.searchParams.get('vista'), 'asistencia')
  assert.equal(u.searchParams.get('modo'), 'quincena')
  assert.equal(u.searchParams.get('quincena'), FECHA)
  assert.equal(u.searchParams.get('q'), 'Juan Pérez')
})

// ── Q1 · QUINCENA CERRADA ──────────────────────────────────────────────────────────────────────────

test('quincena cerrada: la presencia se sigue marcando, tardanza y horas no; sin permiso no se toca nada', () => {
  const cierre = 'La quincena 1–15/09 está cerrada.'
  assert.deepEqual(queSePuedeElDia({ permiso: { ok: true }, cierre }),
    { marcar: true, tardanza: false, horas: false, motivo: `${cierre} La presencia se sigue marcando; horas y tardanza no.` })
  assert.deepEqual(queSePuedeElDia({ permiso: { ok: true }, cierre: null }), { marcar: true, tardanza: true, horas: true, motivo: null })
  assert.equal(queSePuedeElDia({ permiso: { ok: false, porque: 'x' }, cierre: null }).marcar, false)
  assert.equal(queSePuedeElDia({ permiso: { ok: false, porque: 'x' }, cierre }).motivo, 'x', 'el permiso gana: sin él no hay nada que marcar')
})
