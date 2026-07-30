import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fechaOperativaSanJuan, fechaAr, fechaDesdeTexto, parsearComando, nombreDia,
  renderObras, renderCuadrilla, renderPreview, renderExito, renderConflicto,
  renderFechaInexistente, renderSinPersonal, renderDenegado, renderAyuda,
} from './asistencia-ui.mjs'

test('la fecha operativa es la de SAN JUAN, no UTC', () => {
  // 2026-07-31T01:30Z → en San Juan (UTC-3) todavía es el 30 de julio.
  assert.equal(fechaOperativaSanJuan(new Date('2026-07-31T01:30:00Z')), '2026-07-30')
  // 2026-07-30T03:30Z → en San Juan es medianoche y media del 30.
  assert.equal(fechaOperativaSanJuan(new Date('2026-07-30T03:30:00Z')), '2026-07-30')
  // 2026-07-30T02:30Z → en San Juan todavía es el 29.
  assert.equal(fechaOperativaSanJuan(new Date('2026-07-30T02:30:00Z')), '2026-07-29')
})

test('la fecha se muestra en DD/MM/YYYY', () => {
  assert.equal(fechaAr('2026-07-30'), '30/07/2026')
})

test('nombreDia usa el día calculado', () => {
  assert.equal(nombreDia(4), 'jueves')
  assert.equal(nombreDia(6), 'sábado')
})

test('fechaDesdeTexto toma el año de contexto', () => {
  assert.equal(fechaDesdeTexto('29/07', '2026-07-30'), '2026-07-29')
  assert.equal(fechaDesdeTexto('29/7/2025', '2026-07-30'), '2025-07-29')
  assert.equal(fechaDesdeTexto('nada', '2026-07-30'), null)
})

test('inicia con y sin fecha, y saca la mención al bot', () => {
  assert.deepEqual(parsearComando('@os asistencia'), { tipo: 'iniciar', fecha: null })
  assert.deepEqual(parsearComando('asistencia 29/07', { isoContexto: '2026-07-30' }), { tipo: 'iniciar', fecha: '2026-07-29' })
  assert.equal(parsearComando('@os presentismo').tipo, 'iniciar')
})

test('entiende el voseo y las variantes por RAÍZ, no por conjugación', () => {
  for (const t of ['confirmar', 'confirmá', 'confirmo', 'CONFIRMAR']) {
    assert.equal(parsearComando(t).tipo, 'confirmar', t)
  }
  for (const t of ['cancelar', 'cancelá', 'cancela']) {
    assert.equal(parsearComando(t).tipo, 'cancelar', t)
  }
  for (const t of ['revisar', 'revisá', 'resumen', 'ver']) {
    assert.equal(parsearComando(t).tipo, 'revisar', t)
  }
  assert.equal(parsearComando('volvé').tipo, 'volver')
})

test('confirmar sobrescribiendo es una intención distinta de confirmar', () => {
  assert.equal(parsearComando('confirmar').sobrescribir, false)
  assert.equal(parsearComando('confirmar sobrescribir').sobrescribir, true)
  assert.equal(parsearComando('confirmá sobreescribir').sobrescribir, true)
})

test('elige obra por número', () => {
  assert.deepEqual(parsearComando('obra 2'), { tipo: 'obra', indice: 2 })
  assert.deepEqual(parsearComando('obra: 10'), { tipo: 'obra', indice: 10 })
})

test('todos presentes en sus formas naturales', () => {
  for (const t of ['todos presentes', 'todos ok', 'todos vinieron', 'presente todos']) {
    assert.equal(parsearComando(t).tipo, 'todos_presentes', t)
  }
})

test('marca por número: ausente, presente y parcial con horas', () => {
  assert.deepEqual(parsearComando('3 ausente'), { tipo: 'marcar', indice: 3, estado: 'ausente', horas: null })
  assert.deepEqual(parsearComando('ausente 3'), { tipo: 'marcar', indice: 3, estado: 'ausente', horas: null })
  assert.deepEqual(parsearComando('7 falto'), { tipo: 'marcar', indice: 7, estado: 'ausente', horas: null })
  const p = parsearComando('5 parcial 5,5')
  assert.deepEqual(p, { tipo: 'marcar', indice: 5, estado: 'parcial', horas: '5,5' })
  assert.equal(parsearComando('2 presente').estado, 'presente')
})

test('parcial sin horas se marca como incompleto, no se inventa un número', () => {
  const r = parsearComando('5 parcial')
  assert.equal(r.faltan_horas, true)
  assert.equal(r.horas, undefined)
})

test('texto que no es del skill devuelve null (no secuestra la conversación)', () => {
  assert.equal(parsearComando('estado del sistema'), null)
  assert.equal(parsearComando('hola, cómo va'), null)
  assert.equal(parsearComando(''), null)
  assert.equal(parsearComando('cuánto pagamos la quincena'), null)
})

test('una fecha suelta cambia la fecha del formulario', () => {
  assert.deepEqual(parsearComando('29/07', { isoContexto: '2026-07-30' }), { tipo: 'fecha', fecha: '2026-07-29' })
})

// ── RENDER: lo que ve el jefe de obra ───────────────────────────────────────

const obras = [
  { clave: 'A|B', etiqueta: 'JAVIER SANCHEZ · Revoque', personas: 3 },
  { clave: 'C|D', etiqueta: 'LA ESTRELLA · Oficinas', personas: 1 },
]

test('el listado de obras muestra la jornada del día y de dónde sale', () => {
  const t = renderObras({
    fecha: '2026-07-30', diaSemana: 4, obras, pestana: 'Obreros 26',
    jornada: { horas: 9, origen: 'calibrado', muestras: 31, requiere_manual: false },
  })
  assert.match(t, /30\/07\/2026/)
  assert.match(t, /jueves/)
  assert.match(t, /\*\*9 h\*\*/)
  assert.match(t, /31 cargas/)
  assert.match(t, /1\. JAVIER SANCHEZ · Revoque — 3 personas/)
  assert.match(t, /2\. LA ESTRELLA · Oficinas — 1 persona$/m)
})

test('si el día no tiene jornada de referencia, el listado lo AVISA', () => {
  const t = renderObras({
    fecha: '2026-07-25', diaSemana: 6, obras, pestana: 'Obreros 26',
    jornada: { horas: null, requiere_manual: true },
  })
  assert.match(t, /no hay jornada completa de referencia/)
})

test('la cuadrilla muestra lo ya cargado y lo marcado', () => {
  const t = renderCuadrilla({
    fecha: '2026-07-30', diaSemana: 4, obra: obras[0], jornada: { horas: 9 },
    personal: [
      { nombre_original: 'Aguero Cristian', nombre_clave: 'A', actual: { escrita: false } },
      { nombre_original: 'Reta Sebastian ', nombre_clave: 'B', actual: { escrita: true, valor_crudo: '9' } },
    ],
    marcas: { A: { estado: 'ausente' } },
  })
  assert.match(t, /1\. Aguero Cristian — ✕ ausente \(0\)/)
  assert.match(t, /2\. Reta Sebastian — · sin marcar\s+_\(cargado: 9\)_/)
})

const plan = {
  fecha: '2026-07-30', dia_semana: 4, pestana: 'Obreros 26', columna_letra: 'R',
  clave_obra: 'A|B', obra_etiqueta: 'JAVIER SANCHEZ · Revoque',
  resumen: { presentes: 8, ausentes: 1, parciales: 1, celdas_nuevas: 9, celdas_modificadas: 1, sin_cambio: 0, bloqueadas: 1, a_escribir: 10, trabajadores: 11 },
  requiere_confirmacion_sobrescritura: true,
  items: [
    { nombre_original: 'Reta Sebastian', celda_a1: "'Obreros 26'!R465", accion: 'modifica', valor_actual: '9', horas_nuevas: 0 },
    { nombre_original: 'Quiroga Sebastian', bloqueada: 'celda_con_formula', formula_actual: '=8+6' },
  ],
}

test('el preview muestra existentes, cambios y bloqueadas, y pide sobrescribir', () => {
  const t = renderPreview(plan)
  assert.match(t, /Presentes: \*\*8\*\*/)
  assert.match(t, /Celdas que se modifican: \*\*1\*\*/)
  assert.match(t, /YA tenían otro valor/)
  assert.match(t, /R465: `9` → `0`/)
  assert.match(t, /No se van a tocar/)
  assert.match(t, /horas extra calculadas/)
  assert.match(t, /confirmar sobrescribir/)
})

test('sin sobrescritura pendiente, el preview pide un confirmar simple', () => {
  const t = renderPreview({ ...plan, requiere_confirmacion_sobrescritura: false, items: [] })
  assert.match(t, /Escribí `confirmar`/)
  assert.ok(!/sobrescribir/.test(t))
})

test('el éxito informa fecha, obra, conteos, celdas y quién lo registró', () => {
  const t = renderExito({ plan, resultado: { escritas: 10 }, actor: { plataforma_username: 'rodrigo' } })
  assert.match(t, /✅ \*\*Asistencia registrada\*\*/)
  assert.match(t, /Fecha: 30\/07\/2026/)
  assert.match(t, /Presentes: 8/)
  assert.match(t, /Celdas actualizadas: 10/)
  assert.match(t, /Registrado por: rodrigo/)
})

test('el conflicto dice que NO se guardó y muestra los valores', () => {
  const t = renderConflicto({
    conflictos: [{ nombre_original: 'Tello Juan', celda_a1: "'Obreros 26'!R470", valor_al_planificar: null, valor_ahora: '8' }],
  })
  assert.match(t, /no fue guardada/)
  assert.match(t, /cambiaron mientras completabas/)
  assert.match(t, /R470: al empezar `\(vacía\)`, ahora `8`/)
})

test('fecha inexistente aclara que no se creó ninguna columna', () => {
  const t = renderFechaInexistente({ fecha: '2026-08-10', pestana: 'Obreros 26' })
  assert.match(t, /todavía no existe en JORNALES/)
  assert.match(t, /No se creó ninguna columna ni se modificó la hoja/)
})

test('sin personal y sin permiso tienen mensajes propios', () => {
  assert.match(renderSinPersonal({ obra: obras[0], fecha: '2026-07-30' }), /No se encontró personal asignado/)
  assert.match(renderDenegado(), /No tenés permiso/)
  assert.match(renderAyuda(), /todos presentes/)
})
