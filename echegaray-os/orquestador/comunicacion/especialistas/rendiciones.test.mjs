// El canal de rendiciones (22/09/2026): a qué entrega va el ticket y quién puede rendir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirEntrega, textoAmbigua, especialista, TEXTO } from './rendiciones.mjs'

const A = { id: 'a', codigo: 'ER-0147', obra: 'Galpón 8', obra_codigo: 'OB-0020', estructura: false }
const B = { id: 'b', codigo: 'ER-0144', obra: null, estructura: true }
const C = { id: 'c', codigo: 'ER-0150', obra: 'Salón comercial', estructura: false }

test('una sola entrega abierta: va a ésa, diga lo que diga el texto', () => {
  assert.equal(elegirEntrega([A], 'cualquier cosa').entrega, A)
})

test('varias: decide el código o la obra; si el texto no decide, NO se adivina', () => {
  assert.equal(elegirEntrega([A, B, C], 'flete er-150').entrega, C)
  assert.equal(elegirEntrega([A, B, C], 'ER 0144').entrega, B)
  assert.equal(elegirEntrega([A, B, C], 'áridos para el galpon 8').entrega, A)
  assert.deepEqual(elegirEntrega([A, B, C], 'áridos'), { entrega: null, motivo: 'ambigua' })
  assert.deepEqual(elegirEntrega([], 'x'), { entrega: null, motivo: 'ninguna' })
})

test('la pregunta de cuál entrega no publica plata: el canal lo ve todo el grupo', () => {
  const t = textoAmbigua([A, B])
  assert.match(t, /ER-0147/)
  assert.match(t, /Estructura/)
  assert.doesNotMatch(t, /\$|\d{3}\.\d{3}/)
  assert.doesNotMatch(TEXTO.AYUDA, /\$\s?\d/)
})

test('sólo reclama en su área; con foto rinde, sin foto explica', async () => {
  assert.equal(await especialista.reconoce('hola', { area: 'compras', fileIds: ['x'] }), null)
  assert.equal((await especialista.reconoce('', { area: 'rendicion', fileIds: ['x'] })).destino, 'rendir')
  assert.equal((await especialista.reconoce('cómo rindo', { area: 'rendicion', fileIds: [] })).destino, 'ayuda')
})

function portFalso({ canal = true, persona = 'p1', abiertas = [A], esPrueba = false } = {}) {
  const q = []
  return {
    q,
    async query(sql, args) {
      q.push(sql)
      if (/comunicacion\.canales_area/.test(sql)) return { rows: canal ? [{ canal_nombre: 'Rendiciones' }] : [] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: persona ? [{ perfil_id: 'u1', persona_id: persona, es_prueba: esPrueba }] : [{ perfil_id: 'u1', persona_id: null }] }
      if (/from public\.efectivo_entrega e/.test(sql)) return { rows: abiertas }
      return { rows: [] }
    },
  }
}
const actor = { plataforma_user_id: 'mm1', channel_id: 'ch1', root_post_id: 'post1' }

test('las puertas fallan cerrado ANTES de bajar un archivo: canal ajeno, sin legajo, sin entrega', async () => {
  for (const [port, estado] of [
    [portFalso({ canal: false }), 'rechazado_canal'],
    [portFalso({ persona: null }), 'rechazado_sin_persona'],
    [portFalso({ abiertas: [] }), 'rechazado_sin_entrega'],
    [portFalso({ abiertas: [A, C] }), 'pregunta_entrega'],
  ]) {
    const r = await especialista.atender({ texto: '', port, actor, fileIds: ['f1'], postId: 'post1' })
    assert.equal(r.estado, estado)
    assert.ok(!port.q.some((s) => /insert into public\.efectivo_comprobante/.test(s)), `${estado}: no registró nada`)
  }
})

test('con las puertas pasadas: registra el ticket POR POST y le manda al circuito «A rendir», pagado y la obra', async () => {
  const port = portFalso({ abiertas: [A] })
  const llamadas = []
  const procesar = async (_d, m) => { llamadas.push(m); return { texto: 'ok', estado: 'cargado' } }
  // Dos tickets en el MISMO hilo: cada uno con su post, no el hilo (auditoría 22/09/2026).
  await especialista.atender({ texto: '', port, actor, fileIds: ['f1'], postId: 'postA', procesar })
  await especialista.atender({ texto: '', port, actor, fileIds: ['f2'], postId: 'postB', procesar })
  assert.deepEqual(llamadas[0].forzar, { formaPago: 'A rendir', pagado: true })
  assert.equal(llamadas[0].texto, 'OB-0020 Galpón 8')
  assert.deepEqual(llamadas.map((m) => m.postId), ['postA', 'postB'])
  assert.equal(port.q.filter((s) => /insert into public\.efectivo_comprobante/.test(s)).length, 2)
})

test('una persona de PRUEBA no carga nada en Compras (auditoría 22/09/2026)', async () => {
  // La caja ya excluye sus entregas (migración 1900), pero su ticket sí entraría a Compras y al libro.
  const port = portFalso({ esPrueba: true })
  let proceso = false
  const r = await especialista.atender({
    texto: '', port, actor, fileIds: ['f1'], postId: 'post1',
    procesar: async () => { proceso = true; return { texto: 'ok', estado: 'cargado' } },
  })
  assert.equal(proceso, false, 'no se llama al circuito de carga')
  assert.equal(r.estado, 'rechazado_persona_prueba')
  assert.ok(!port.q.some((x) => /insert into public\.efectivo_comprobante/.test(x)), 'no registra el ticket')
})

// ═══ EL CANAL ES COMPROBANTES-GASTOS (dueño, 22/09/2026) ═══

test('en Comprobantes-gastos NO se reclama nada: ese canal volvió a ser sólo gastos de compras', async () => {
  assert.equal(await especialista.reconoce('', { area: 'compras', fileIds: ['f1'] }), null)
  assert.equal((await especialista.reconoce('', { area: 'rendicion', fileIds: ['f1'] }))?.destino, 'rendir')
})

test('en el canal Efectivo la foto se carga como rendición', async () => {
  const port = portFalso()
  const llamadas = []
  const r = await especialista.atender({
    texto: '', port, actor, fileIds: ['f1'], postId: 'postA',
    intencion: { destino: 'rendir', confianza: 1 },
    procesar: async (_d, m) => { llamadas.push(m); return { texto: 'ok', estado: 'cargado' } },
  })
  assert.deepEqual(llamadas[0].forzar, { formaPago: 'A rendir', pagado: true })
  assert.match(r.texto, /ER-0147/)
})

test('la foto de un VALE no se carga como ticket: es plata saliendo, no un gasto', async () => {
  const port = portFalso()
  let cargo = false
  const r = await especialista.atender({
    texto: 'vale firmado', port, actor, fileIds: ['f1'], postId: 'p1',
    procesar: async () => { cargo = true; return { texto: 'ok', estado: 'cargado' } },
    vale: async () => ({ texto: 'Registrado: ER-0007', estado: 'entregada_con_vale', privado: false }),
  })
  assert.equal(cargo, false)
  assert.equal(r.estado, 'entregada_con_vale')
})
