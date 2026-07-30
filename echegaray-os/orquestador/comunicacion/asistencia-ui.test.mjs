import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fechaOperativaSanJuan, fechaAr, fechaDesdeTexto, parsearComando, nombreDia,
  renderObras, renderCuadrilla, renderPreview, renderExito, renderConflicto,
  renderFechaInexistente, renderSinPersonal, renderDenegado, renderAyuda, clasificar,
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
  assert.deepEqual(parsearComando('3 ausente'), { tipo: 'marcar', indice: 3, estado: 'ausente', normales: null, extras: null })
  assert.deepEqual(parsearComando('ausente 3'), { tipo: 'marcar', indice: 3, estado: 'ausente', normales: null, extras: null })
  assert.equal(parsearComando('7 falto').estado, 'ausente')
  assert.deepEqual(parsearComando('5 parcial 5,5'), { tipo: 'marcar', indice: 5, estado: 'parcial', normales: '5,5', extras: null })
  assert.equal(parsearComando('2 presente').estado, 'presente')
})

test('llegada tarde con las horas trabajadas', () => {
  assert.deepEqual(parsearComando('3 tarde 7'), { tipo: 'marcar', indice: 3, estado: 'tarde', normales: '7', extras: null })
  assert.equal(parsearComando('3 llego tarde 7').estado, 'tarde')
  const sin = parsearComando('3 tarde')
  assert.equal(sin.faltan_horas, true, 'sin horas no se inventa la jornada trabajada')
})

test('HORAS EXTRA: se separan antes de leer las horas normales', () => {
  assert.deepEqual(parsearComando('1 presente extra 2'),
    { tipo: 'marcar', indice: 1, estado: 'presente', normales: null, extras: '2' })
  assert.deepEqual(parsearComando('5 parcial 5,5 extra 2'),
    { tipo: 'marcar', indice: 5, estado: 'parcial', normales: '5,5', extras: '2' })
  assert.deepEqual(parsearComando('3 tarde 7 extra 1,5'),
    { tipo: 'marcar', indice: 3, estado: 'tarde', normales: '7', extras: '1,5' })
  assert.deepEqual(parsearComando('1 extra 2'),
    { tipo: 'marcar', indice: 1, extras: '2', solo_extras: true }, 'sólo cambia las extras')
  assert.equal(parsearComando('1 extras 2').extras, '2')
})

test('parcial sin horas se marca como incompleto, no se inventa un número', () => {
  const r = parsearComando('5 parcial')
  assert.equal(r.faltan_horas, true)
  assert.equal(r.normales, null)
})

test('confirmar distingue sobrescribir de reemplazar una fórmula, y `todo` es ambas', () => {
  assert.deepEqual(pickConf(parsearComando('confirmar')), { s: false, f: false })
  assert.deepEqual(pickConf(parsearComando('confirmar sobrescribir')), { s: true, f: false })
  assert.deepEqual(pickConf(parsearComando('confirmar formula')), { s: false, f: true })
  assert.deepEqual(pickConf(parsearComando('confirmá sobrescribir formula')), { s: true, f: true })
  assert.deepEqual(pickConf(parsearComando('confirmar todo')), { s: true, f: true })
})

const pickConf = (c) => ({ s: c.sobrescribir, f: c.reemplazar_formula })

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
      { nombre_original: 'Aguero Cristian', nombre_clave: 'A', actual: { escrita: false, carga: { forma: 'vacia' } } },
      { nombre_original: 'Reta Sebastian ', nombre_clave: 'B', actual: { escrita: true, carga: { forma: 'numero', normales: 9, extras: 0, total: 9 } } },
      { nombre_original: 'Tello Juan', nombre_clave: 'C', actual: { escrita: true, carga: { forma: 'suma', normales: 9, extras: 2, total: 11 } } },
    ],
    marcas: { A: { estado: 'ausente' }, C: { estado: 'presente', extras: 2 } },
  })
  assert.match(t, /1\. Aguero Cristian — ✕ ausente \(0\)/)
  assert.match(t, /2\. Reta Sebastian — · sin marcar\s+_\(cargado: 9 h\)_/)
  assert.match(t, /3\. Tello Juan — ✓ presente \(9 \+ 2 extra = 11 h\)\s+_\(cargado: 9 \+ 2 extra = 11 h\)_/)
})

test('la cuadrilla muestra tarde y parcial con sus horas', () => {
  const t = renderCuadrilla({
    fecha: '2026-07-30', diaSemana: 4, obra: obras[0], jornada: { horas: 9 },
    personal: [
      { nombre_original: 'A', nombre_clave: 'A', actual: { escrita: false } },
      { nombre_original: 'B', nombre_clave: 'B', actual: { escrita: false } },
    ],
    marcas: { A: { estado: 'tarde', normales: 7 }, B: { estado: 'parcial', normales: 5.5, extras: 1.5 } },
  })
  assert.match(t, /◔ tarde \(7 h\)/)
  assert.match(t, /◐ parcial \(5,5 \+ 1,5 extra = 7 h\)/)
})

const plan = {
  fecha: '2026-07-30', dia_semana: 4, pestana: 'Obreros 26', columna_letra: 'R',
  clave_obra: 'A|B', obra_etiqueta: 'JAVIER SANCHEZ · Revoque',
  resumen: {
    presentes: 8, ausentes: 1, tardes: 1, parciales: 1, celdas_nuevas: 9, celdas_modificadas: 1,
    sin_cambio: 0, bloqueadas: 1, reemplazan_formula: 1, a_escribir: 10, trabajadores: 11,
    horas_normales: 74, horas_extra: 6, horas_total: 80,
  },
  requiere_confirmacion_sobrescritura: true,
  requiere_confirmacion_formula: true,
  items: [
    { nombre_original: 'Reta Sebastian', celda_a1: "'Obreros 26'!R465", accion: 'modifica', valor_actual: '9', total_actual: 9, normales_nuevas: 0, extras_nuevas: 0, total_nuevo: 0 },
    { nombre_original: 'Aguero Cristian', accion: 'modifica', formula_actual: '=9-2,5+2', total_actual: 8.5, normales_nuevas: 9, extras_nuevas: 2, total_nuevo: 11, reemplaza_formula_no_interpretable: true },
    { nombre_original: 'Quiroga Sebastian', bloqueada: 'texto_no_numerico', valor_actual: 'NO TOCAR' },
  ],
}

test('el preview muestra el desglose normal/extra/total', () => {
  const t = renderPreview(plan)
  assert.match(t, /Horas normales: \*\*74\*\*/)
  assert.match(t, /Horas extra: \*\*6\*\*/)
  assert.match(t, /Total: \*\*80\*\*/)
  assert.match(t, /Tarde: \*\*1\*\*/)
})

test('el preview muestra existentes, cambios y bloqueadas, y pide las dos confirmaciones', () => {
  const t = renderPreview(plan)
  assert.match(t, /Presentes: \*\*8\*\*/)
  assert.match(t, /Celdas que se modifican: \*\*1\*\*/)
  assert.match(t, /YA tenían otro valor/)
  assert.match(t, /Reta Sebastian: 9 h → \*\*0 h\*\*/)
  assert.match(t, /no se puede separar en normal\/extra/)
  assert.match(t, /`=9-2,5\+2` \(= 8,5 h\) → \*\*9 \+ 2 extra = 11 h\*\*/)
  assert.match(t, /No se van a tocar/)
  assert.match(t, /confirmar sobrescribir formula/)
  assert.match(t, /confirmar todo/)
})

test('sin sobrescritura pendiente, el preview pide un confirmar simple', () => {
  const t = renderPreview({ ...plan, requiere_confirmacion_sobrescritura: false, requiere_confirmacion_formula: false, items: [] })
  assert.match(t, /Escribí `confirmar`/)
  assert.ok(!/sobrescribir/.test(t))
})

test('el éxito informa fecha, obra, conteos, celdas y quién lo registró', () => {
  const t = renderExito({ plan, resultado: { escritas: 10 }, actor: { plataforma_username: 'rodrigo' } })
  assert.match(t, /✅ \*\*Asistencia registrada\*\*/)
  assert.match(t, /Fecha: 30\/07\/2026/)
  assert.match(t, /Presentes: 8/)
  assert.match(t, /Horas normales: 74 · Horas extra: 6 · Total: 80/)
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

// ── RUTEO entre registrar y consultar ───────────────────────────────────────
// Las dos cosas empiezan con la misma palabra. Sin clasificador, `asistencia de hoy`
// arrancaba el formulario de carga en vez de responder quién trabajó.

/** Parser de consultas de juguete: reconoce lo que tenga un calificador. */
const parsearConsultaFake = (texto) => {
  const t = texto.toLowerCase()
  if (/^\s*@?\w*\s*asistencia\s*$/.test(t)) return null // `asistencia` sola es REGISTRO
  if (!/\b(asistencia|presentism|horas?\s+extra|trabaj)/.test(t)) return null
  if (/\b(hoy|ayer|quien|cuanto|cuánto|\d{1,2}\/\d{1,2}|messinas|aguero)/.test(t)) {
    return { tipo: /extra/.test(t) ? 'horas_extra' : 'asistencia' }
  }
  return null
}
const rutear = (texto) => clasificar(texto, { parsearConsulta: parsearConsultaFake, isoContexto: '2026-07-30' })

test('`asistencia` sola arranca el REGISTRO', () => {
  const r = rutear('@os asistencia')
  assert.equal(r.destino, 'registro')
  assert.equal(r.intencion.tipo, 'iniciar')
})

test('`asistencia de hoy` es una CONSULTA, no el formulario de carga', () => {
  assert.equal(rutear('@os asistencia de hoy').destino, 'consulta')
  assert.equal(rutear('asistencia del 29/07').destino, 'consulta')
  assert.equal(rutear('asistencia de Messinas').destino, 'consulta')
  assert.equal(rutear('quien trabajo hoy').destino, 'consulta')
  assert.equal(rutear('horas extra de hoy').destino, 'consulta')
})

test('un verbo explícito de carga MANDA sobre el parser de consultas', () => {
  for (const t of ['cargar asistencia del 29/07', 'registrar asistencia de hoy', 'corregí la asistencia del 29/07']) {
    const r = rutear(t)
    assert.equal(r.destino, 'registro', t)
  }
  assert.equal(rutear('cargar asistencia del 29/07').intencion.fecha, '2026-07-29')
})

test('los pasos del formulario siguen yendo al REGISTRO', () => {
  for (const t of ['obra 2', 'todos presentes', '3 ausente', '3 tarde 7', '1 extra 2', 'revisar', 'confirmar', 'cancelar']) {
    assert.equal(rutear(t).destino, 'registro', t)
  }
})

test('texto ajeno al skill no se rutea a ningún lado', () => {
  for (const t of ['hola', 'estado del sistema', 'cuánto pagamos la quincena']) {
    assert.equal(rutear(t).destino, null, t)
  }
})

test('sin parser de consultas inyectado, todo cae al registro (degradación honesta)', () => {
  const r = clasificar('asistencia de hoy', { isoContexto: '2026-07-30' })
  assert.equal(r.destino, 'registro')
})
