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

test('un área tiene a lo sumo UN especialista (si no, el canal no podría decidir)', async () => {
  const vistas = new Map()
  for (const e of await especialistas()) {
    assert.equal(vistas.has(e.area), false, `${e.area} tiene dos: ${vistas.get(e.area)} y ${e.slug}`)
    vistas.set(e.area, e.slug)
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
