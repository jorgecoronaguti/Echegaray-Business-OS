import { test } from 'node:test'
import assert from 'node:assert/strict'
import { manejarAsistencia } from './asistencia-flujo.mjs'
import { SesionesMemoria, ESTADO_SESION, TTL_MINUTOS } from './asistencia-sesion.mjs'
import { fakeGoogleJornales, idxCol, FECHA_HOY, FECHA_INEXISTENTE } from '../lib/jornales-fixture.mjs'
import { EVENTO } from '../lib/asistencia-auditoria.mjs'
import { DENEGADO } from '../lib/asistencia-permisos.mjs'

const JEFE = { plataforma_user_id: 'mm-jefe-1', plataforma_username: 'rodrigo' }
const OTRO = { plataforma_user_id: 'mm-peon-9', plataforma_username: 'ajeno' }

/** Banco de pruebas: google falso + sesiones en memoria + auditoría capturada. */
function banco({ permitir = true, google, ahora } = {}) {
  const eventos = []
  const g = google ?? fakeGoogleJornales()
  const sesiones = new SesionesMemoria(ahora ? { ahora } : {})
  const deps = {
    google: g,
    sesiones,
    permisos: async (u) => (permitir && u === JEFE.plataforma_user_id
      ? { ok: true, display: 'Jefe de obra' }
      : { ok: false, motivo: DENEGADO.SIN_PERMISO }),
    auditar: async (evento, datos) => { eventos.push({ evento, datos }); return { ok: true } },
  }
  const decir = (texto, actor = JEFE) => manejarAsistencia({ ...deps, actor, texto, ahora: ahora ? new Date(ahora()) : new Date('2026-07-30T14:00:00Z') })
  return { g, sesiones, eventos, decir, tipos: () => eventos.map((e) => e.evento) }
}

/** Conversación completa hasta el preview, sobre la obra 1 del bloque de hoy. */
async function hastaPreview(b) {
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  return b.decir('revisar')
}

test('el flujo arranca listando las obras del bloque de HOY con la jornada calibrada', async () => {
  const b = banco()
  const r = await b.decir('@os asistencia')
  assert.equal(r.estado, 'obras')
  assert.equal(r.privado, true)
  assert.match(r.texto, /30\/07\/2026/)
  assert.match(r.texto, /\*\*9 h\*\*/)
  assert.match(r.texto, /Obreros 26/)
  assert.deepEqual(b.tipos(), [EVENTO.STARTED, EVENTO.SHEET_READ])
})

test('un usuario SIN permiso no llega a leer nada y queda auditado', async () => {
  const b = banco()
  const r = await b.decir('@os asistencia', OTRO)
  assert.equal(r.estado, 'denegado')
  // El rechazo nombra la vía que habilita —estar en el canal— en vez de mandar a pedir un permiso.
  assert.match(r.texto, /canal de asistencia/i)
  assert.deepEqual(b.tipos(), [EVENTO.DENIED])
  assert.equal(b.eventos[0].datos.error_code, DENEGADO.SIN_PERMISO)
  assert.equal(b.g.lecturas, 0, 'ni siquiera leyó la planilla')
  assert.equal(b.sesiones.filas.length, 0, 'no abrió sesión')
})

test('TODA respuesta del skill es privada', async () => {
  const b = banco()
  for (const t of ['@os asistencia', 'obra 1', 'todos presentes', 'revisar', 'cancelar']) {
    const r = await b.decir(t)
    assert.equal(r.privado, true, t)
  }
})

test('una fecha que no existe en JORNALES corta el flujo sin abrir sesión', async () => {
  const b = banco()
  const r = await b.decir('asistencia 10/08')
  assert.equal(r.estado, 'fecha_inexistente')
  assert.match(r.texto, /No se creó ninguna columna/)
  assert.equal(b.sesiones.filas.length, 0)
  assert.equal(b.g.escrituras.length, 0)
})

test('elegir obra muestra la cuadrilla leída de JORNALES para esa obra y fecha', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  const r = await b.decir('obra 1')
  assert.equal(r.estado, 'cuadrilla')
  assert.match(r.texto, /1\. Aguero Cristian/)
  assert.match(r.texto, /3\. Emanuel Alaniz/)
  assert.ok(!/Pastran/.test(r.texto), 'no mezcla gente de otra obra')
})

test('un número de obra que no está en la lista se rechaza', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  const r = await b.decir('obra 99')
  assert.equal(r.estado, 'obra_invalida')
})

test('marcar exige haber elegido obra primero', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  const r = await b.decir('todos presentes')
  assert.equal(r.estado, 'falta_obra')
})

test('todos presentes + corregir sólo la excepción', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  const r = await b.decir('2 ausente')
  assert.equal(r.estado, 'cuadrilla')
  assert.match(r.texto, /1\. Aguero Cristian — ✓ presente \(9 h\)/)
  assert.match(r.texto, /2\. Quiroga Sebastian — ✕ ausente \(0\)/)
  assert.match(r.texto, /3\. Emanuel Alaniz — ✓ presente \(9 h\)/)
})

test('jornada parcial sin horas pide las horas y no marca nada', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  const r = await b.decir('2 parcial')
  assert.equal(r.estado, 'faltan_horas')
  const s = b.sesiones.filas.at(-1)
  assert.deepEqual(s.marcas.marcas, {})
})

test('jornada parcial con coma decimal queda en 5,5', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  const r = await b.decir('1 parcial 5,5')
  assert.match(r.texto, /1\. Aguero Cristian — ◐ parcial \(5,5 h\)/)
})

test('el preview muestra el resumen y no escribe nada', async () => {
  const b = banco()
  const r = await hastaPreview(b)
  assert.equal(r.estado, 'preview')
  assert.match(r.texto, /Presentes: \*\*3\*\*/)
  assert.match(r.texto, /Celdas nuevas: \*\*3\*\*/)
  assert.match(r.texto, /columna R/)
  assert.equal(b.g.escrituras.length, 0)
  assert.ok(b.tipos().includes(EVENTO.PREVIEWED))
})

test('revisar sin marcar a nadie no arma un plan vacío', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  const r = await b.decir('revisar')
  assert.equal(r.estado, 'sin_marcas')
})

test('CONFIRMAR escribe en batch, informa y audita written', async () => {
  const b = banco()
  await hastaPreview(b)
  const r = await b.decir('confirmar')
  assert.equal(r.estado, 'escrito')
  assert.match(r.texto, /✅ \*\*Asistencia registrada\*\*/)
  assert.match(r.texto, /Celdas actualizadas: 3/)
  assert.match(r.texto, /Registrado por: rodrigo/)
  assert.equal(b.g.escrituras.length, 1, 'una sola operación batch')
  assert.equal(b.g.escrituras[0].data.length, 3)
  assert.ok(b.tipos().includes(EVENTO.CONFIRMED))
  assert.ok(b.tipos().includes(EVENTO.WRITTEN))
  const w = b.eventos.find((e) => e.evento === EVENTO.WRITTEN).datos
  assert.equal(w.cantidad_presentes, 3)
  assert.equal(w.sheet_name, 'Obreros 26')
  assert.equal(w.celdas_modificadas.length, 3)
  assert.equal(w.celdas_modificadas[0].new_value, 9)
})

test('la escritura sólo toca la columna del día', async () => {
  const b = banco()
  await hastaPreview(b)
  await b.decir('confirmar')
  for (const d of b.g.escrituras[0].data) {
    assert.match(d.range, /^'Obreros 26'!R\d+$/)
    assert.equal(typeof d.values[0][0], 'number')
  }
})

test('REPLAY de confirmar: no vuelve a escribir', async () => {
  const b = banco()
  await hastaPreview(b)
  await b.decir('confirmar')
  const r = await b.decir('confirmar')
  // La sesión ya está cerrada: el skill pide arrancar de nuevo y NO muta.
  assert.ok(['duplicado', 'sesion_cerrada', 'sesion_no_existe'].includes(r.estado), r.estado)
  assert.equal(b.g.escrituras.length, 1, 'una sola mutación')
})

test('sobrescribir un valor existente exige confirmación explícita', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  // obra de Messinas: Reta ya tiene 9 cargado hoy
  const obras = b.sesiones.filas.at(-1).marcas.obras
  const iMessinas = obras.indexOf('MESSINAS|BASES DE TANQUE') + 1
  await b.decir(`obra ${iMessinas}`)
  await b.decir('todos presentes')
  await b.decir('1 ausente') // Reta es el único de esa cuadrilla, y hoy ya tiene 9
  const prev = await b.decir('confirmar')
  assert.equal(prev.estado, 'requiere_sobrescritura')
  assert.match(prev.texto, /YA tenían otro valor/)
  assert.equal(b.g.escrituras.length, 0, 'no escribió sin el sí explícito')

  const ok = await b.decir('confirmar sobrescribir')
  assert.equal(ok.estado, 'escrito')
  assert.equal(b.g.escrituras.length, 1)
})

test('CONFLICTO concurrente: no escribe nada, informa y cierra la sesión en conflicto', async () => {
  const b = banco()
  await hastaPreview(b)
  // Entre el preview y el confirmar, alguien carga la celda A MANO en la planilla.
  b.g.grid.filas[20][idxCol('R')] = { valor: '8', numero: 8, formula: null }
  const r = await b.decir('confirmar')
  assert.equal(r.estado, 'conflicto')
  assert.match(r.texto, /no fue guardada/)
  assert.equal(b.g.escrituras.length, 0)
  assert.ok(b.tipos().includes(EVENTO.CONFLICT))
  assert.equal(b.sesiones.filas.at(-1).estado, ESTADO_SESION.CONFLICTO)
})

test('pestaña protegida por el dueño: no se reporta éxito', async () => {
  const b = banco({ google: fakeGoogleJornales({ protegido: true }) })
  await hastaPreview(b)
  const r = await b.decir('confirmar')
  assert.equal(r.estado, 'protegida')
  assert.match(r.texto, /está tomada/)
  assert.ok(b.tipos().includes(EVENTO.FAILED))
})

test('cancelar cierra la sesión y no escribe', async () => {
  const b = banco()
  await hastaPreview(b)
  const r = await b.decir('cancelar')
  assert.equal(r.estado, 'cancelado')
  assert.match(r.texto, /No se escribió nada/)
  assert.equal(b.g.escrituras.length, 0)
  assert.equal(b.sesiones.filas.at(-1).estado, ESTADO_SESION.CANCELADA)
  assert.ok(b.tipos().includes(EVENTO.CANCELLED))
})

test('volver desde el preview vuelve a la cuadrilla conservando las marcas', async () => {
  const b = banco()
  await hastaPreview(b)
  const r = await b.decir('volver')
  assert.equal(r.estado, 'cuadrilla')
  assert.match(r.texto, /✓ presente/)
})

test('un formulario VENCIDO no se puede confirmar', async () => {
  let t = Date.parse('2026-07-30T14:00:00Z')
  const b = banco({ ahora: () => t })
  await hastaPreview(b)
  t += (TTL_MINUTOS + 1) * 60000
  const r = await b.decir('confirmar')
  assert.equal(r.estado, 'sesion_vencida')
  assert.match(r.texto, /venció/)
  assert.equal(b.g.escrituras.length, 0)
})

test('otro usuario no puede continuar ni confirmar el formulario ajeno', async () => {
  const b = banco()
  await hastaPreview(b)
  // el otro no tiene permiso: se corta antes incluso de mirar la sesión
  const r = await b.decir('confirmar', OTRO)
  assert.equal(r.estado, 'denegado')
  assert.equal(b.g.escrituras.length, 0)
  // y el jefe sigue con SU formulario intacto
  const suyo = await b.decir('confirmar')
  assert.equal(suyo.estado, 'escrito')
})

test('un jefe autorizado distinto tiene su propio formulario, no el del otro', async () => {
  const eventos = []
  const g = fakeGoogleJornales()
  const sesiones = new SesionesMemoria()
  const comun = {
    google: g, sesiones, auditar: async () => ({ ok: true }),
    permisos: async () => ({ ok: true }),
  }
  const di = (actor, texto) => manejarAsistencia({ ...comun, actor, texto, ahora: new Date('2026-07-30T14:00:00Z') })
  await di(JEFE, 'asistencia')
  await di(JEFE, 'obra 1')
  await di(OTRO, 'asistencia')
  const r = await di(OTRO, 'confirmar')
  assert.equal(r.estado, 'falta_obra', 'el segundo jefe no hereda la obra del primero')
  assert.equal(sesiones.filas.filter((f) => f.estado === 'abierta').length, 2)
  assert.equal(eventos.length, 0)
})

test('sin sesión abierta, un confirmar suelto no hace nada', async () => {
  const b = banco()
  const r = await b.decir('confirmar')
  assert.equal(r.estado, 'sesion_no_existe')
  assert.equal(b.g.escrituras.length, 0)
})

test('texto que no es del skill devuelve la ayuda, no un error', async () => {
  const b = banco()
  const r = await b.decir('hola')
  assert.equal(r.estado, 'ayuda')
  assert.match(r.texto, /Registrar asistencia/)
})

test('un fallo inesperado se audita y NO se reporta como éxito', async () => {
  const google = fakeGoogleJornales()
  google.readSheetGrid = async () => { throw new Error('google api 503: Bearer abc123 cayó') }
  const b = banco({ google })
  const r = await b.decir('asistencia')
  assert.equal(r.estado, 'error')
  assert.match(r.texto, /No se escribió nada en JORNALES/)
  const f = b.eventos.find((e) => e.evento === EVENTO.FAILED)
  assert.ok(f)
  assert.match(f.datos.error_message_sanitized, /Bearer \*\*\*/, 'el token no queda en el log')
})

test('la fecha operativa sale de San Juan: a las 01:30 UTC del 31 todavía es el 30', async () => {
  const b = banco({ ahora: () => Date.parse('2026-07-31T01:30:00Z') })
  const r = await b.decir('asistencia')
  assert.match(r.texto, /30\/07\/2026/)
  assert.equal(r.estado, 'obras')
})

test('FECHA_INEXISTENTE es el caso real de una quincena no preparada', async () => {
  const b = banco()
  const r = await b.decir(`asistencia ${FECHA_INEXISTENTE.slice(8)}/${FECHA_INEXISTENTE.slice(5, 7)}`)
  assert.equal(r.estado, 'fecha_inexistente')
})

test('el día que se escribe es el que se mostró (columna R = 30/07)', async () => {
  const b = banco()
  await hastaPreview(b)
  await b.decir('confirmar')
  const filas = b.g.escrituras[0].data.map((d) => Number(/R(\d+)/.exec(d.range)[1]))
  assert.deepEqual(filas.sort((a, c) => a - c), [21, 22, 23])
  assert.equal(FECHA_HOY, '2026-07-30')
})

// ── MVP: PERMISOS ABIERTOS ──────────────────────────────────────────────────

/** Banco con el verificador REAL de permisos (modo del entorno), sin base. */
function bancoPermisosReales({ ahora } = {}) {
  const eventos = []
  const g = fakeGoogleJornales()
  const sesiones = new SesionesMemoria()
  const decir = (texto, actor) => manejarAsistencia({
    google: g, sesiones, auditar: async (e, dd) => { eventos.push({ evento: e, datos: dd }); return { ok: true } },
    // sin `permisos` inyectado: usa tienePermiso() real. `port` no se toca para EL PERMISO
    // en modo abierto; la guarda de canal sí consultaría el binding, y acá se la dobla
    // porque estos casos son sobre permisos, no sobre desde dónde se escribe.
    guarda: async () => ({ ok: true }),
    port: { query: async () => { throw new Error('la base NO debe consultarse en modo abierto') } },
    actor, texto, ahora: ahora ?? new Date('2026-07-30T14:00:00Z'),
  })
  return { g, sesiones, eventos, decir }
}

test('MVP: cualquier usuario AUTENTICADO puede registrar, sin permisos cargados', async () => {
  const b = bancoPermisosReales()
  const r = await b.decir('asistencia', { plataforma_user_id: 'mm-cualquiera', plataforma_username: 'pepe' })
  assert.equal(r.estado, 'obras', 'la tabla de permisos vacía NO bloquea el skill')
  assert.equal(b.eventos[0].datos.modo_permisos, 'abierto')
})

test('MVP: sin identidad se rechaza — no por permisos, sino porque no hay a quién auditar', async () => {
  const b = bancoPermisosReales()
  const r = await b.decir('asistencia', { plataforma_username: 'anonimo' })
  assert.equal(r.estado, 'denegado')
  assert.match(r.texto, /No pude identificarte/)
  assert.equal(b.eventos[0].datos.error_code, 'sin_identidad')
  assert.equal(b.g.lecturas, 0)
})

test('la identidad real del usuario queda en la auditoría de la escritura', async () => {
  const b = bancoPermisosReales()
  const yo = { plataforma_user_id: 'mm-u7', plataforma_username: 'rodrigo' }
  await b.decir('asistencia', yo)
  await b.decir('obra 1', yo)
  await b.decir('todos presentes', yo)
  await b.decir('revisar', yo)
  const r = await b.decir('confirmar', yo)
  assert.equal(r.estado, 'escrito')
  const w = b.eventos.find((e) => e.evento === EVENTO.WRITTEN).datos
  assert.equal(w.mattermost_user_id, 'mm-u7')
  assert.equal(w.mattermost_username, 'rodrigo')
})

// ── HORAS EXTRA Y LLEGADA TARDE EN EL FLUJO ─────────────────────────────────

test('marcar horas extra sobre un presente y verlo en la cuadrilla', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  const r = await b.decir('1 extra 2')
  assert.match(r.texto, /1\. Aguero Cristian — ✓ presente \(9 \+ 2 extra = 11 h\)/)
  assert.match(r.texto, /2\. Quiroga Sebastian — ✓ presente \(9 h\)/)
})

test('`1 extra 2` sin haber marcado el estado antes pide marcarlo', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  const r = await b.decir('1 extra 2')
  assert.equal(r.estado, 'sin_estado_previo')
})

test('llegada tarde con horas, y sin horas se piden', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  const sin = await b.decir('2 tarde')
  assert.equal(sin.estado, 'faltan_horas')
  const con = await b.decir('2 tarde 7')
  assert.match(con.texto, /2\. Quiroga Sebastian — ◔ tarde \(7 h\)/)
})

test('el preview y el éxito informan normales, extra y total', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  await b.decir('1 extra 2')
  const prev = await b.decir('revisar')
  assert.match(prev.texto, /Horas normales: \*\*27\*\*/)
  assert.match(prev.texto, /Horas extra: \*\*2\*\*/)
  assert.match(prev.texto, /Total: \*\*29\*\*/)
  const ok = await b.decir('confirmar')
  assert.equal(ok.estado, 'escrito')
  assert.match(ok.texto, /Horas normales: 27 · Horas extra: 2 · Total: 29/)
  // la celda con extras se escribió como fórmula, preservando la separación
  const valores = b.g.escrituras[0].data.map((d) => d.values[0][0])
  assert.ok(valores.includes('=9+2'), JSON.stringify(valores))
  assert.equal(valores.filter((v) => v === 9).length, 2)
})

test('un ausente con horas extra queda bloqueado y se explica en el preview', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('1 ausente')
  await b.decir('1 extra 2')
  const r = await b.decir('revisar')
  assert.match(r.texto, /No se van a tocar/)
  assert.match(r.texto, /un ausente no puede tener horas extra/)
})

test('reemplazar una fórmula NO interpretable exige `confirmar formula`', async () => {
  const b = banco()
  // la celda de hoy de Aguero tiene una fórmula que no se puede descomponer
  b.g.grid.filas[20][idxCol('R')] = { valor: '8,5', numero: 8.5, formula: '=9-2,5+2', derivada: false }
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  // `todos presentes` YA NO la propone: esa celda está cargada, queda sin cambio. Sí
  // precarga a los otros dos, que tienen la celda vacía.
  const cuad = await b.decir('todos presentes')
  assert.match(cuad.texto, /sin cambio \(queda como está\)/)
  const sinTocar = await b.decir('revisar')
  assert.doesNotMatch(sinTocar.texto, /=9-2,5\+2/, 'la fórmula cargada no entra en el plan')
  assert.match(sinTocar.texto, /Celdas que se modifican: \*\*0\*\*/)
  assert.equal(b.g.escrituras.length, 0)
  // Hay que pedirlo explícitamente para que entre en juego.
  await b.decir('1 presente')
  const prev = await b.decir('revisar')
  assert.match(prev.texto, /no se puede separar en normal\/extra/)
  assert.match(prev.texto, /=9-2,5\+2/)

  const sin = await b.decir('confirmar sobrescribir')
  assert.equal(sin.estado, 'requiere_confirmacion_formula')
  assert.equal(b.g.escrituras.length, 0, 'no se pisa una fórmula desconocida con un solo sí')

  const ok = await b.decir('confirmar todo')
  assert.equal(ok.estado, 'escrito')
  const w = b.eventos.find((e) => e.evento === EVENTO.WRITTEN).datos
  const celda = w.celdas_modificadas.find((c) => /Aguero/.test(c.trabajador))
  assert.equal(celda.old_value, '8,5')
  assert.equal(celda.new_value, 9)
})

test('la auditoría de la escritura guarda el desglose viejo y nuevo', async () => {
  const b = banco()
  b.g.grid.filas[20][idxCol('R')] = { valor: '11', numero: 11, formula: '=9+2', derivada: false }
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('1 presente extra 3')
  await b.decir('revisar')
  const r = await b.decir('confirmar sobrescribir')
  assert.equal(r.estado, 'escrito')
  const c = b.eventos.find((e) => e.evento === EVENTO.WRITTEN).datos.celdas_modificadas[0]
  assert.equal(c.old_formula, '=9+2')
  assert.equal(c.old_normal_hours, 9)
  assert.equal(c.old_extra_hours, 2)
  assert.equal(c.new_normal_hours, 9)
  assert.equal(c.new_extra_hours, 3)
  assert.equal(c.new_total_hours, 12)
  assert.equal(c.new_formula, '=9+3')
})

test('una carga existente con extras se PRECARGA en la cuadrilla, no se reinicia', async () => {
  const b = banco()
  b.g.grid.filas[20][idxCol('R')] = { valor: '11', numero: 11, formula: '=9+2', derivada: false }
  await b.decir('@os asistencia')
  const r = await b.decir('obra 1')
  assert.match(r.texto, /1\. Aguero Cristian — · sin marcar\s+_\(cargado: 9 \+ 2 extra = 11 h\)_/)
})

// ── LA CARGA QUE NO ENTRÓ NO ESTÁ REGISTRADA ────────────────────────────────
// Dos defectos que encontró la auditoría, con el mismo origen: la sesión se cerraba como
// confirmada y la clave de idempotencia se quemaba ANTES de saber si la celda entró.

test('si la escritura falla, el reintento del jefe puede volver a cargar (la clave se libera)', async () => {
  let falla = true
  const g = fakeGoogleJornales({ alEscribir() { if (falla) throw new Error('503 backend error') } })
  const b = banco({ google: g })

  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  const r1 = await b.decir('confirmar')
  assert.equal(r1.estado, 'fallo', 'la falla se informa como falla')
  assert.ok(!/registrada/i.test(r1.texto), 'no puede decir que quedó registrada')
  assert.equal(b.sesiones.filas.at(-1).estado, ESTADO_SESION.FALLIDA)

  // Mismo jefe, misma obra, mismas marcas ⇒ MISMA clave de idempotencia.
  falla = false
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  const r2 = await b.decir('confirmar')
  assert.equal(r2.estado, 'escrito', `el reintento tiene que escribir, no dar duplicado (dio ${r2.estado})`)
  assert.ok(g.escrituras.length >= 2)
})

test('una carga que SÍ entró sigue siendo de un solo uso', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  assert.equal((await b.decir('confirmar')).estado, 'escrito')
  // Reintento exacto: ya está cargado, no se vuelve a escribir.
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  const r = await b.decir('confirmar')
  assert.ok(['duplicado', 'sin_cambios'].includes(r.estado), `no puede volver a escribir (dio ${r.estado})`)
})

test('sin nada para escribir no se declara un registro ni se quema la clave', async () => {
  const b = banco()
  await b.decir('@os asistencia')
  await b.decir('obra 1')
  await b.decir('todos presentes')
  await b.decir('confirmar')          // primera carga real
  const escritasAntes = b.g.escrituras.length

  await b.decir('@os asistencia')     // segunda vuelta: ya está todo cargado igual
  await b.decir('obra 1')
  await b.decir('todos presentes')
  const r = await b.decir('confirmar')
  assert.ok(!/✅|registrada/i.test(r.texto) || r.estado !== 'escrito',
    'no puede contestar "registrada" sin escribir una celda')
  if (r.estado === 'sin_cambios') {
    assert.match(r.texto, /No hay nada para escribir|sin cambio/i)
    assert.equal(b.g.escrituras.length, escritasAntes, 'no mandó una escritura vacía')
    assert.ok(!b.tipos().includes(EVENTO.WRITTEN) || b.eventos.filter((e) => e.evento === EVENTO.WRITTEN).length === 1,
      'no hay un segundo evento written por una carga que no ocurrió')
  }
})

// ── LA GUARDA DE CANAL, TAMBIÉN EN ESTA PUERTA ──────────────────────────────────
// Era la única de las tres vías a JORNALES que no la consultaba: se podía cargar la
// asistencia por mensaje privado al bot, justo lo que la guarda existe para impedir.

test('por privado NO se carga: la guarda de canal corre antes que el permiso', async () => {
  const eventos = []
  const g = fakeGoogleJornales()
  const r = await manejarAsistencia({
    google: g,
    sesiones: new SesionesMemoria(),
    auditar: async (e, dd) => { eventos.push({ evento: e, datos: dd }); return { ok: true } },
    guarda: async () => ({ ok: false, motivo: 'canal', detalle: 'canal_directo', texto: 'La asistencia se carga sólo en el canal de asistencia del equipo.' }),
    port: { query: async () => ({ rows: [] }) },
    actor: { plataforma_user_id: 'mm-cualquiera', plataforma_username: 'pepe', channel_id: 'un-dm', channel_type: 'D' },
    texto: 'asistencia',
    ahora: new Date('2026-07-30T14:00:00Z'),
  })
  assert.equal(r.estado, 'denegado')
  assert.match(r.texto, /canal de asistencia/)
  assert.equal(g.lecturas, 0, 'ni siquiera se leyó la planilla')
  assert.equal(eventos[0].datos.error_code, 'canal_directo', 'el rechazo queda auditado con su motivo')
})

test('sin `port` la guarda no corre: los tests inyectan sus propios dobles', async () => {
  // No es una excepción de seguridad: sin base tampoco hay binding que consultar, y el
  // resto de las defensas de este archivo se comportan igual.
  const r = await manejarAsistencia({
    google: fakeGoogleJornales(),
    sesiones: new SesionesMemoria(),
    auditar: async () => ({ ok: true }),
    permisos: async () => ({ ok: true, modo: 'abierto' }),
    actor: { plataforma_user_id: 'mm-1', plataforma_username: 'pepe' },
    texto: 'asistencia',
    ahora: new Date('2026-07-30T14:00:00Z'),
  })
  assert.notEqual(r.estado, 'denegado')
})
