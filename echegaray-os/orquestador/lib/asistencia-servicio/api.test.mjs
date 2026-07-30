// Tests de las tres rutas de la API contra el servidor real, con dobles del núcleo y del
// cliente de Google. NUNCA se toca la planilla productiva: el fixture estructural
// reproduce la gramática real del archivo (bloques, fórmulas de horas extra, texto libre).

import test from 'node:test'
import assert from 'node:assert/strict'
import { BASE, FECHA_HOY, levantarServidor, jornadaConfigDoble, googleDoble } from './dobles-de-prueba.mjs'

/** Abre sesión y trae el contexto del día del fixture. */
async function abrir(opciones) {
  const s = await levantarServidor(opciones)
  await s.entrar()
  const ctx = await s.json(`${BASE}/api/contexto?fecha=${FECHA_HOY}`)
  return { s, ctx: ctx.cuerpo }
}

const obraDe = (ctx, texto) => ctx.obras.find((o) => o.nombre.toLowerCase().includes(texto)).clave

/** Convierte la cuadrilla en el cuerpo que arma la pantalla sin que nadie toque nada. */
function itemsPorDefecto(personal, cambios = {}) {
  return personal.map((p) => {
    if (p.bloqueado || p.sin_cambio) return { ref: p.ref, nombre: p.nombre, sin_cambio: true }
    return {
      ref: p.ref, nombre: p.nombre, presente: p.presente, horas: p.horas,
      motivo: p.motivo, aclaracion: null, obra_realizada: null,
      ...(cambios[p.nombre] ?? {}),
    }
  })
}

/* ── contexto ─────────────────────────────────────────────────────────────── */

test('el contexto trae fecha, jornada calibrada, obras y catálogo de motivos', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  assert.equal(ctx.fecha, FECHA_HOY)
  assert.equal(ctx.hoy, FECHA_HOY)
  // Jueves: la jornada la calibra la planilla, no una constante del código.
  assert.equal(ctx.jornada.horas, 9)
  assert.equal(ctx.jornada.origen, 'calibrado')
  assert.ok(ctx.obras.length >= 2, 'tiene que traer las obras del bloque')
  assert.ok(ctx.obras.every((o) => o.clave && o.nombre && typeof o.cantidad === 'number'))
  assert.ok(ctx.motivos.length > 0, 'los motivos salen de la API, no del navegador')
})

test('una fecha futura se rechaza en la API, no sólo en el date picker', async (t) => {
  const { s } = await abrir()
  t.after(s.cerrar)
  const r = await s.json(`${BASE}/api/contexto?fecha=2026-08-05`)
  assert.equal(r.status, 400)
  assert.match(r.cuerpo.error, /futura/i)
})

test('una fecha que la planilla todavía no tiene se explica, no se inventa', async (t) => {
  const { s } = await abrir()
  t.after(s.cerrar)
  const r = await s.json(`${BASE}/api/contexto?fecha=2026-07-05`)
  assert.equal(r.status, 409)
  assert.match(r.cuerpo.error, /JORNALES todavía no tiene la columna del 05\/07\/2026/)
})

test('un feriado configurado manda sobre la calibración de la planilla', async (t) => {
  const { s, ctx } = await abrir({
    jornadaConfig: jornadaConfigDoble({ horas: 0, origen: 'feriado', etiqueta: 'Feriado nacional' }),
  })
  t.after(s.cerrar)
  assert.deepEqual(
    { horas: ctx.jornada.horas, origen: ctx.jornada.origen, etiqueta: ctx.jornada.etiqueta, feriado: ctx.jornada.feriado },
    { horas: 0, origen: 'feriado', etiqueta: 'Feriado nacional', feriado: true },
  )
})

/* ── cuadrilla ────────────────────────────────────────────────────────────── */

test('la cuadrilla viene toda presente con las horas de la jornada', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const r = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  assert.equal(r.status, 200)
  assert.equal(r.cuerpo.personal.length, 3)
  for (const p of r.cuerpo.personal) {
    assert.equal(p.presente, true, p.nombre)
    assert.equal(p.horas, 9, p.nombre)
    assert.equal(p.motivo, null)
    assert.equal(p.sin_cambio, false)
  }
})

test('una celda ya cargada arranca en SIN CAMBIO y no se le inventa un motivo', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'tanque') // Reta Sebastián tiene el 30/07 ya cargado con 9
  const r = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const p = r.cuerpo.personal[0]
  assert.equal(p.ya_cargado, true)
  assert.equal(p.sin_cambio, true)
  assert.equal(p.carga_actual, '9 h')
  assert.equal(p.motivo, null)
})

test('en un feriado con 0 h nadie arranca presente: arrancan en franco', async (t) => {
  const { s, ctx } = await abrir({ jornadaConfig: jornadaConfigDoble({ horas: 0, origen: 'feriado' }) })
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const r = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  for (const p of r.cuerpo.personal) {
    assert.equal(p.presente, false, p.nombre)
    assert.equal(p.horas, 0)
    assert.equal(p.motivo, 'franco')
  }
})

test('una obra inexistente se contesta 404 y con la cuadrilla vacía', async (t) => {
  const { s } = await abrir()
  t.after(s.cerrar)
  const r = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=obra-que-no-existe`)
  assert.equal(r.status, 404)
  assert.match(r.cuerpo.error, /no figura en la planilla/)
  assert.deepEqual(r.cuerpo.personal, [])
})

test('sin obra elegida se pide elegirla, no se devuelve media pantalla', async (t) => {
  const { s } = await abrir()
  t.after(s.cerrar)
  const r = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}`)
  assert.equal(r.status, 400)
  assert.match(r.cuerpo.error, /Elegí una obra/)
})

/* ── registrar ────────────────────────────────────────────────────────────── */

test('el caso normal: se manda la cuadrilla tal cual viene y se escribe la jornada', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k1', items: itemsPorDefecto(cua.cuerpo.personal) })
  assert.equal(r.status, 200)
  assert.equal(r.cuerpo.ok, true)
  assert.equal(r.cuerpo.celdas.length, 3)
  assert.ok(r.cuerpo.celdas.every((c) => c.horas === 9 && c.extra === 0))
  assert.equal(r.cuerpo.resumen.presentes, 3)
  assert.equal(s.google.escrituras.length, 1, 'una sola escritura batch, todo o nada')
  assert.ok(s.eventos.some((e) => e.evento.endsWith('written')), 'quedó auditado')
})

test('horas por encima de la jornada son horas extra calculadas, no un campo', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const nombre = cua.cuerpo.personal[0].nombre
  const items = itemsPorDefecto(cua.cuerpo.personal, { [nombre]: { horas: 11 } })
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k2', items })
  assert.equal(r.status, 200)
  const con = r.cuerpo.celdas.find((c) => c.nombre === nombre)
  assert.deepEqual({ normales: con.normales, extra: con.extra, horas: con.horas }, { normales: 9, extra: 2, horas: 11 })
  assert.equal(r.cuerpo.resumen.horas_extra, 2)
})

test('el mismo envío dos veces no duplica la escritura', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const cuerpo = { fecha: FECHA_HOY, obra, idempotency_key: 'k-doble', items: itemsPorDefecto(cua.cuerpo.personal) }
  const primera = await s.postear(cuerpo)
  const segunda = await s.postear(cuerpo)
  assert.equal(primera.status, 200)
  assert.equal(segunda.status, 200)
  assert.equal(segunda.cuerpo.repetido, true)
  assert.deepEqual(segunda.cuerpo.celdas, primera.cuerpo.celdas)
  assert.equal(s.google.escrituras.length, 1, 'la segunda no volvió a escribir')
})

test('sin el registro en memoria, el núcleo igual impide la doble carga', async (t) => {
  // Simula el reinicio del proceso entre los dos envíos: el registro se pierde.
  const google = googleDoble()
  const uno = await abrir({ google })
  const obra = obraDe(uno.ctx, 'revoque')
  const cua = await uno.s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const cuerpo = { fecha: FECHA_HOY, obra, idempotency_key: 'k-reinicio', items: itemsPorDefecto(cua.cuerpo.personal) }
  await uno.s.postear(cuerpo)
  await uno.s.cerrar()

  const dos = await abrir({ google }) // proceso nuevo, misma planilla
  t.after(dos.s.cerrar)
  const r = await dos.s.postear(cuerpo)
  assert.equal(r.status, 200)
  assert.deepEqual(r.cuerpo.celdas, [])
  assert.match(r.cuerpo.nota, /ya decía lo mismo/)
  assert.equal(google.escrituras.length, 1)
})

test('un ausente sin motivo no se registra', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const nombre = cua.cuerpo.personal[0].nombre
  const items = itemsPorDefecto(cua.cuerpo.personal, { [nombre]: { presente: false, horas: 0, motivo: null } })
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k3', items })
  assert.equal(r.status, 400)
  assert.equal(r.cuerpo.error, `${nombre}: falta el motivo de la ausencia.`)
  assert.equal(s.google.escrituras.length, 0, 'no se escribió nada')
})

test('menos horas que la jornada sin motivo tampoco se registra', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const nombre = cua.cuerpo.personal[1].nombre
  const items = itemsPorDefecto(cua.cuerpo.personal, { [nombre]: { horas: 5, motivo: null } })
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k4', items })
  assert.equal(r.status, 400)
  assert.match(r.cuerpo.error, /falta el motivo por las horas de menos/)
})

test('«Otro» sin aclaración no se registra', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const nombre = cua.cuerpo.personal[0].nombre
  const items = itemsPorDefecto(cua.cuerpo.personal, { [nombre]: { horas: 6, motivo: 'otro', aclaracion: '   ' } })
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k5', items })
  assert.equal(r.status, 400)
  assert.match(r.cuerpo.error, /aclaración/)
})

test('horas fuera de rango se rechazan con el número, no con un código', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const nombre = cua.cuerpo.personal[0].nombre
  for (const [horas, patron] of [[30, /más de 24 horas/], [-2, /negativas/], ['ocho', /número/], [null, /faltan las horas/]]) {
    const items = itemsPorDefecto(cua.cuerpo.personal, { [nombre]: { horas } })
    const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: `k6-${horas}`, items })
    assert.equal(r.status, 400, String(horas))
    assert.match(r.cuerpo.error, patron, String(horas))
  }
  assert.equal(s.google.escrituras.length, 0)
})

test('pisar una carga anterior exige un sí explícito', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'tanque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const p = cua.cuerpo.personal[0]
  const items = [{ ref: p.ref, nombre: p.nombre, presente: true, horas: 4, motivo: 'se_retiro_antes' }]
  const sinConfirmar = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k7', items })
  assert.equal(sinConfirmar.status, 409)
  assert.equal(sinConfirmar.cuerpo.requiere_confirmacion, 'sobrescritura')
  assert.equal(s.google.escrituras.length, 0)

  const confirmado = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k7', items, confirmar_sobrescritura: true })
  assert.equal(confirmado.status, 200)
  assert.equal(confirmado.cuerpo.celdas[0].horas, 4)
})

test('el cuerpo sin personas o sin obra se rechaza antes de leer la planilla', async (t) => {
  const { s } = await abrir()
  t.after(s.cerrar)
  assert.match((await s.postear({ fecha: FECHA_HOY, obra: '', items: [] })).cuerpo.error, /Elegí una obra/)
  assert.match((await s.postear({ fecha: FECHA_HOY, obra: 'x', items: [] })).cuerpo.error, /ninguna persona/)
  assert.match((await s.postear({ fecha: '2026-08-30', obra: 'x', items: [{}] })).cuerpo.error, /futura/)
  assert.equal(s.google.escrituras.length, 0)
})

test('una persona repetida o sin identificar corta la carga', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const p = cua.cuerpo.personal[0]
  const dup = await s.postear({
    fecha: FECHA_HOY, obra, idempotency_key: 'k8',
    items: [{ ref: p.ref, presente: true, horas: 9 }, { ref: p.ref, presente: true, horas: 9 }],
  })
  assert.match(dup.cuerpo.error, /dos veces la misma persona/)
  const sinRef = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k9', items: [{ nombre: 'Fulano', presente: true, horas: 9 }] })
  assert.match(sinRef.cuerpo.error, /sin identificar/)
})

test('una obra realizada que no existe ese día se rechaza', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const nombre = cua.cuerpo.personal[0].nombre
  const items = itemsPorDefecto(cua.cuerpo.personal, { [nombre]: { obra_realizada: 'obra|inventada' } })
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k10', items })
  assert.equal(r.status, 400)
  assert.match(r.cuerpo.error, /no figura en la planilla/)
})

test('la obra realizada y la aclaración quedan en la auditoría (JORNALES no tiene esa columna)', async (t) => {
  const { s, ctx } = await abrir()
  t.after(s.cerrar)
  const obra = obraDe(ctx, 'revoque')
  const otra = obraDe(ctx, 'fabrica') || obraDe(ctx, 'tanque')
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  const nombre = cua.cuerpo.personal[0].nombre
  const items = itemsPorDefecto(cua.cuerpo.personal, { [nombre]: { obra_realizada: otra } })
  await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'k11', items })
  const escrito = s.eventos.find((e) => e.evento.endsWith('written'))
  const nov = escrito.datos.novedades.find((n) => n.nombre === nombre)
  assert.equal(nov.obra_realizada, otra)
  assert.equal(escrito.datos.origen, 'mattermost', 'la carga entra por Mattermost: la pantalla web se retiró')
})
