import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolver, areaDelCanal, renderCatalogo, VIA } from './director.mjs'
import { especialistas, especialistaDeArea, catalogo } from './registro-especialistas.mjs'

/** Puerto de base falso: devuelve el binding canal → área que se le pida. */
const puerto = (bindings = {}) => ({
  llamadas: [],
  async query(sql, params) {
    this.llamadas.push({ sql, params })
    const b = bindings[params?.[0]]
    return { rows: b ? [{ area_clave: b.area, canal_nombre: b.canal }] : [] }
  },
})

// ── EL REGISTRO ─────────────────────────────────────────────────────────────

test('los especialistas se descubren del directorio, sin lista escrita a mano', async () => {
  const todos = await especialistas({ recargar: true })
  assert.ok(todos.length >= 2, 'hay al menos personal y gestión general')
  for (const e of todos) {
    for (const k of ['slug', 'agentSlug', 'area', 'titulo', 'descripcion']) {
      assert.ok(e[k], `${e.archivo}: falta ${k}`)
    }
    assert.equal(typeof e.atender, 'function', `${e.archivo}: atender`)
    assert.equal(typeof e.reconoce, 'function', `${e.archivo}: reconoce`)
  }
})

test('cada especialista declara un ÁREA CANÓNICA del OS, no una taxonomía propia', async () => {
  // Las 8 áreas de public.area_canonica. Si un especialista inventa una, el binding de
  // canales (que tiene FK) lo rechazaría en producción.
  const AREAS = new Set(['compras', 'administracion_finanzas', 'obras', 'personas',
    'contabilidad_legales', 'comercial', 'calidad', 'gestion_general'])
  for (const e of await especialistas()) {
    assert.ok(AREAS.has(e.area), `${e.slug} declara un área desconocida: ${e.area}`)
  }
})

test('un área tiene a lo sumo UN especialista PREFERIDO (si no, el canal no podría decidir)', async () => {
  // La regla original era "un área, un especialista". Se aflojó exactamente lo necesario
  // cuando apareció el primer especialista TRANSVERSAL (el asistente: recordar, buscar un
  // archivo, agendar — pedidos que no son de ningún área). Obligarlo a ser dueño de un área
  // cualquiera para pasar esta prueba tenía una consecuencia silenciosa: se quedaba con
  // todos los mensajes no reclamados de ESE canal. Lo que el canal necesita no es que haya
  // un solo especialista por área, es que haya un solo DUEÑO.
  const dueños = new Map()
  for (const e of await especialistas()) {
    if (e.preferidoDeArea === false) continue
    assert.equal(dueños.has(e.area), false, `${e.area} tiene dos dueños: ${dueños.get(e.area)} y ${e.slug}`)
    dueños.set(e.area, e.slug)
  }
})

test('el asistente transversal no le roba el canal a nadie', async () => {
  const transversales = (await especialistas()).filter((e) => e.preferidoDeArea === false)
  for (const t of transversales) {
    const dueño = await especialistaDeArea(t.area)
    assert.ok(dueño, `${t.area} se quedó sin dueño`)
    assert.notEqual(dueño.slug, t.slug, `${t.slug} terminó siendo el dueño de ${t.area}`)
  }
})

test('asistencia es UN especialista más, no un caso privilegiado', async () => {
  const p = await especialistaDeArea('personas')
  assert.equal(p.slug, 'personal')
  assert.equal(p.agentSlug, 'rrhh', 'se apoya en el agente que ya existe en orq.agents')
  const cat = await catalogo()
  assert.equal(cat.filter((x) => x.slug === 'personal').length, 1)
  assert.ok(cat.length >= 2, 'el catálogo no es sólo asistencia')
})

// ── VÍA 1 · EL ESPECIALISTA RECLAMA (determinístico, 0 API) ─────────────────

test('el jefe escribe su comando y lo atiende su especialista, sin modelo', async () => {
  for (const t of ['asistencia', 'cargar asistencia', 'quién trabajó ayer', 'horas extra del 17/01']) {
    const r = await resolver({ texto: t, port: puerto() })
    assert.equal(r.especialista?.slug, 'personal', t)
    assert.equal(r.via, VIA.RECLAMO, `${t} no debe necesitar razonamiento`)
  }
  const s = await resolver({ texto: 'estado del sistema', port: puerto() })
  assert.equal(s.especialista?.slug, 'sistema')
  assert.equal(s.via, VIA.RECLAMO)
})

test('el reclamo NO consulta el modelo aunque esté disponible', async () => {
  let llamadas = 0
  const r = await resolver({ texto: 'asistencia', port: puerto(), razonar: async () => { llamadas++; return 'sistema' } })
  assert.equal(llamadas, 0, 'un comando reconocido no puede costar una llamada de API')
  assert.equal(r.especialista.slug, 'personal')
})

// ── VÍA 2 · EL CANAL ES EL CONTEXTO ─────────────────────────────────────────

test('el canal declara el área y el mensaje va a su especialista sin código nuevo', async () => {
  const port = puerto({ 'canal-personas': { area: 'personas', canal: 'Asistencia' } })
  const r = await resolver({ texto: 'necesito cargar lo de ayer', port, channelId: 'canal-personas' })
  assert.equal(r.especialista?.slug, 'personal')
  assert.equal(r.via, VIA.AREA_CANAL)
  assert.equal(r.area, 'personas')
})

test('un canal de un área SIN especialista todavía no inventa un destino', async () => {
  const port = puerto({ 'canal-compras': { area: 'compras', canal: 'Compras' } })
  const r = await resolver({ texto: 'generar orden de compra', port, channelId: 'canal-compras' })
  assert.equal(r.especialista, null)
  assert.equal(r.via, VIA.SIN_DESTINO)
  assert.equal(r.area, 'compras', 'pero el área SÍ se resolvió: el canal está bien atado')
})

test('areaDelCanal lee el binding de la base, no una constante', async () => {
  const port = puerto({ c1: { area: 'obras', canal: 'Obras' } })
  assert.deepEqual(await areaDelCanal(port, 'c1'), { area: 'obras', canal: 'Obras' })
  assert.equal(await areaDelCanal(port, 'no-existe'), null)
  assert.match(port.llamadas[0].sql, /canales_area/)
})

// ── VÍA 3 · RAZONAMIENTO, SÓLO CUANDO HACE FALTA ────────────────────────────

test('sin canal y sin reclamo, decide el modelo entre los REGISTRADOS', async () => {
  let candidatos = null
  const r = await resolver({
    texto: 'che, algo del personal', port: puerto(),
    razonar: async (_t, cands) => { candidatos = cands; return 'personal' },
  })
  assert.equal(r.especialista.slug, 'personal')
  assert.equal(r.via, VIA.RAZONAMIENTO)
  assert.ok(candidatos.length >= 2, 'se le ofrecen los especialistas del registro')
  assert.ok(candidatos.every((c) => c.slug && c.descripcion), 'con su descripción para decidir')
})

test('si el modelo elige algo que no existe, NO se inventa un destino', async () => {
  const r = await resolver({ texto: 'cualquier cosa', port: puerto(), razonar: async () => 'especialista-inventado' })
  assert.equal(r.especialista, null)
  assert.equal(r.via, VIA.SIN_DESTINO)
})

test('sin motor de razonamiento se degrada al catálogo, no a un destino adivinado', async () => {
  const r = await resolver({ texto: 'algo raro', port: puerto() })
  assert.equal(r.especialista, null)
  assert.equal(r.via, VIA.SIN_DESTINO)
  assert.ok(r.catalogo.length >= 2)
})

// ── SIN DESTINO: se dice qué SÍ se puede ────────────────────────────────────

test('el catálogo se arma del registro y nombra a los especialistas reales', async () => {
  const t = renderCatalogo(await catalogo(), { area: 'personas' })
  assert.match(t, /Personal IA/)
  assert.match(t, /Gestión General/)
  assert.match(t, /registrar asistencia/)
  assert.doesNotMatch(t, /no soportado/i, 'no se contesta con una negativa vacía')
})

// ── LA GARANTÍA ESTRUCTURAL ─────────────────────────────────────────────────

test('el Director NO nombra ningún dominio: agregar Compras no lo toca', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./director.mjs', import.meta.url), 'utf8')
  const cuerpo = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
  for (const palabra of ['asistencia', 'jornal', 'obrero', 'compra', 'proveedor', 'rrhh', 'personal']) {
    assert.doesNotMatch(cuerpo.toLowerCase(), new RegExp(`\\b${palabra}`), `el Director menciona "${palabra}"`)
  }
})

test('el handler de comunicación tampoco conoce dominios', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../handlers/comunicacion.mjs', import.meta.url), 'utf8')
  const cuerpo = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
  for (const palabra of ['asistencia', 'jornal', 'obrero', 'consultarAsistencia', 'manejarAsistencia', 'clasificar']) {
    assert.doesNotMatch(cuerpo, new RegExp(palabra, 'i'), `el handler menciona "${palabra}"`)
  }
  assert.doesNotMatch(cuerpo, /switch\s*\(/, 'no hay switch de ruteo')
})

// ── PRIVACIDAD POR CONTEXTO ─────────────────────────────────────────────────
// La conversación del canal tiene que quedarse en el canal: si la respuesta reservada
// se desviara a DM, el equipo vería la pregunta y no la respuesta.

test('un canal privado atado al área es destino válido para un dato reservado', async () => {
  const { comunicacionResponderHandler } = await import('../handlers/comunicacion.mjs')
  const publicado = []
  const port = puerto({ 'canal-asistencia': { area: 'personas', canal: 'Asistencia' } })
  await comunicacionResponderHandler(
    { id: 't1', inputs: { comando: 'asistencia de hoy', channel_id: 'canal-asistencia', root_post_id: 'post-1', actor: { id: 'u1', display: 'jorge' }, correlation_id: 'c1', comm_event_id: 'e1' } },
    {
      port,
      google: { async listTabs() { return [] }, async readSheetGrid() { return { filas: [] } } },
      responderComunicacion: async (r) => publicado.push(r),
      canalPrivadoPara: async () => 'canal-dm',
      logger: {},
    },
  )
  assert.equal(publicado.length, 1)
  assert.equal(publicado[0].channel_id, 'canal-asistencia', 'la respuesta NO se desvía a DM')
  assert.equal(publicado[0].root_post_id, 'post-1', 'se conserva el hilo')
  assert.equal(publicado[0].correlation_id, 'c1')
  assert.equal(publicado[0].causation_id, 'e1')
})

test('fuera de un canal atado, el dato reservado sí sale por DM', async () => {
  const { comunicacionResponderHandler } = await import('../handlers/comunicacion.mjs')
  const publicado = []
  await comunicacionResponderHandler(
    { id: 't2', inputs: { comando: 'asistencia de hoy', channel_id: 'canal-cualquiera', root_post_id: 'post-9', actor: { id: 'u1' }, correlation_id: 'c2', comm_event_id: 'e2' } },
    {
      port: puerto(),
      google: { async listTabs() { return [] }, async readSheetGrid() { return { filas: [] } } },
      responderComunicacion: async (r) => publicado.push(r),
      canalPrivadoPara: async () => 'canal-dm',
      logger: {},
    },
  )
  assert.equal(publicado[0].channel_id, 'canal-dm')
  assert.equal(publicado[0].root_post_id, null, 'hilo propio del DM')
})

test('el channel_id no está escrito en el código: sale del binding', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['./director.mjs', '../handlers/comunicacion.mjs', './especialistas/personal.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /\b[a-z0-9]{26}\b/, `${f} tiene algo con forma de id de Mattermost`)
  }
})

test('empate en un DM: gana el que declaró más confianza, sin consultar al modelo', async () => {
  // Caso REAL, con los especialistas de verdad: "recordame llamar al banco dentro de dos
  // horas" lo reclaman el asistente (intención concreta, confianza 1) y Personal IA (su
  // gramática ve "horas" y piensa en jornada). Sin canal que desempate, esto se iba al
  // modelo — y ya estaba resuelto.
  const razonar = async () => { throw new Error('no se consulta al modelo: el empate ya se resolvió') }
  const r = await resolver({ texto: 'recordame llamar al banco dentro de dos horas', port: puerto(), razonar })
  assert.equal(r.especialista?.slug ?? '(ninguno)', 'asistente')
  assert.equal(r.via, VIA.RECLAMO)
})

test('el desempate por confianza no le saca a Personal IA lo que es suyo', async () => {
  const razonar = async () => { throw new Error('no debería hacer falta') }
  for (const t of ['asistencia', '3 ausente', 'quién trabajó ayer', 'horas extra del 17/01']) {
    const r = await resolver({ texto: t, port: puerto(), razonar })
    assert.equal(r.especialista?.slug, 'personal', t)
  }
})
