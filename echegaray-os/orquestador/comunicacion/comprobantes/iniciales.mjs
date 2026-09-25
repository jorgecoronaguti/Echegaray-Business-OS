// LAS INICIALES DE QUIEN PAGÓ — el ticket de efectivo a rendir que entra por #comprobantes-gastos.
//
// ═══ LA REGLA DEL DUEÑO (24/09/2026) ═══
//
// Cada persona que recibe efectivo escribe SUS INICIALES A MANO en cada ticket que paga con esa plata. El
// dueño sube las fotos a #comprobantes-gastos como hoy, SIN escribir nada. El bot lee las iniciales (la
// visión las devuelve con su confianza: `lectura.mjs · inicialesLeidas`) y lo imputa:
//
//   · iniciales de UNA persona, con entrega abierta y confianza alta → se carga como hoy pero «A rendir»
//     y pagado, atado a su entrega más vieja abierta: «Imputado a Emiliano Maldonado (EM) · ER-0020».
//   · confianza baja, o letras parecidas a las de alguien → NO se imputa solo: se carga como compra común
//     y se pregunta en el hilo «¿Es de Emiliano Maldonado?», con botones y también por texto.
//   · la persona no tiene entrega abierta → compra común, y se dice.
//   · SIN INICIALES → exactamente como antes: este módulo no toca nada.
//
// Lo que el papel dice de las iniciales es un DATO; a quién pertenecen lo decide `personas.iniciales_efectivo`
// (únicas, las carga Administración en la ficha). La base guarda cada decisión en `efectivo_iniciales` y la
// reconciliación (`vincular_rendiciones_pendientes`) ata lo cargado a la entrega.

import { ROLES_QUE_IMPUTAN_A_CUALQUIERA } from './imputacion-a-entrega.mjs'

/** Desde acá la lectura se toma como segura y se imputa sola. Por debajo, se pregunta. */
export const UMBRAL_CONFIANZA = 0.8

export const plano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Distancia de edición chica (Levenshtein): «EN» está a 1 de «EM». */
export function distancia(a = '', b = '') {
  const x = String(a); const y = String(b)
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)])
  for (let j = 1; j <= y.length; j++) d[0][j] = j
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
  }
  return d[x.length][y.length]
}

const candidato = (p) => ({ persona_id: p.persona_id, nombre: p.nombre, iniciales: p.iniciales, entrega_id: p.entregas[0]?.id ?? null, codigo: p.entregas[0]?.codigo ?? null })

/**
 * NÚCLEO PURO: a quién va este ticket según sus iniciales.
 *
 * @param {{letras:string, confianza:number|null}|null} iniciales lo que leyó la visión
 * @param {Array<{persona_id:string, iniciales:string, nombre:string, entregas:Array<{id:string, codigo:string}>}>} personas
 *   las que tienen iniciales cargadas; `entregas` = sus abiertas, la más vieja primero
 * @returns {null|{estado:'auto'|'pregunta'|'sin_entrega'|'sin_coincidencia', letras:string, confianza:number|null,
 *   persona?:object, candidatos:object[]}}  `null` = sin iniciales: nada cambia
 */
export function decidirPorIniciales(iniciales, personas = []) {
  if (!iniciales?.letras) return null
  const { letras } = iniciales
  const confianza = iniciales.confianza ?? null
  const base = { letras, confianza }
  const exactas = personas.filter((p) => p.iniciales === letras)
  if (exactas.length === 1) {
    const p = exactas[0]
    if (!p.entregas?.length) return { ...base, estado: 'sin_entrega', persona: candidato({ ...p, entregas: [] }), candidatos: [] }
    if ((confianza ?? 0) >= UMBRAL_CONFIANZA) return { ...base, estado: 'auto', persona: candidato(p), candidatos: [candidato(p)] }
    return { ...base, estado: 'pregunta', candidatos: [candidato(p)] }
  }
  // Ninguna exacta (o, por un dato roto, más de una): las parecidas CON entrega abierta se ofrecen.
  const cercanas = personas.filter((p) => p.entregas?.length && distancia(p.iniciales, letras) <= 1)
  if (cercanas.length) return { ...base, estado: 'pregunta', candidatos: cercanas.map(candidato) }
  return { ...base, estado: 'sin_coincidencia', candidatos: [] }
}

/**
 * Marca el ítem ANTES de cargarlo. Sólo `auto` cambia lo que se escribe: «A rendir» y pagado, como el canal
 * Efectivo (si dijera «Efectivo», CAJA restaría dos veces la plata que ya salió con la entrega). El resto
 * se carga como hoy y la decisión viaja en `item.efectivo` (queda guardada en el fajo).
 */
export function marcarItem(item, decision) {
  if (!decision || !item?.comprobante) return item
  item.efectivo = decision
  if (decision.estado === 'auto') {
    item.comprobante.formaPago = 'A rendir'
    item.comprobante.condicion = 'Contado'
  }
  return item
}

/** El `porIniciales` que recibe el circuito: con las personas ya leídas, es síncrono y no toca la base. */
export const crearPorIniciales = (personas) => (item) => marcarItem(item, decidirPorIniciales(item?.comprobante?.iniciales, personas))

const quien = (c) => `${c.nombre} (${c.iniciales})`

/** NÚCLEO PURO: el renglón del mensaje de la tanda para un ticket con iniciales. */
export function lineaDeIniciales({ decision, proveedor, vinculado = false, yaEstaba = false }) {
  const de = proveedor ? `${proveedor}: ` : ''
  const d = decision
  if (yaEstaba && (d.estado === 'auto' || d.estado === 'pregunta')) {
    return `${de}ya estaba en Compras y no lo imputé a nadie (leí «${d.letras}»). Si es a rendir, se imputa desde la ficha de la entrega.`
  }
  if (d.estado === 'auto') {
    const p = d.persona
    return vinculado
      ? `${de}Imputado a ${quien(p)} · ${p.codigo} · a rendir`
      : `${de}para ${quien(p)} · ${p.codigo} · a rendir — queda imputado en cuanto se termine de cargar`
  }
  if (d.estado === 'sin_entrega') return `${de}${d.letras} no tiene entrega abierta: cargado como compra común`
  if (d.estado === 'sin_coincidencia') return `${de}leí «${d.letras}» a mano y no son las iniciales de nadie: cargado como compra común`
  return `${de}leí «${d.letras}» a mano y no estoy seguro de quién es: cargado como compra común hasta que me contestes abajo`
}

/** La pregunta del hilo. Sin plata: el canal lo ve el grupo. */
export function textoPregunta({ decision, proveedor, fecha }) {
  const c = decision.candidatos
  const papel = [proveedor, fecha].filter(Boolean).join(' · ') || 'Este comprobante'
  const pregunta = c.length === 1 ? `¿Es de **${quien(c[0])}**?` : `¿De quién es? ${c.map((x) => `**${quien(x)}**`).join(' o ')}`
  return [`${papel}: leí «${decision.letras}» escrito a mano. ${pregunta}`,
    'Tocá un botón o contestá acá: «si», «no» (compra común) o las iniciales de quien lo pagó.'].join('\n')
}

/** Los botones: [Sí] [No] con un candidato; uno por persona y [Ninguno] con varios. `id` alfanumérico. */
export function botonesPregunta({ id, decision, url }) {
  const ctx = (persona) => ({ accion: 'iniciales', iniciales_id: id, persona })
  const c = decision.candidatos
  const acciones = c.length === 1
    ? [{ id: 'si', name: 'Sí', type: 'button', style: 'primary', integration: { url, context: ctx(c[0].persona_id) } },
      { id: 'no', name: 'No, compra común', type: 'button', integration: { url, context: ctx(null) } }]
    : [...c.map((x, i) => ({ id: `p${i}`, name: quien(x), type: 'button', integration: { url, context: ctx(x.persona_id) } })),
      { id: 'no', name: 'Ninguno, compra común', type: 'button', integration: { url, context: ctx(null) } }]
  return [{ fallback: '¿De quién es este comprobante?', color: '#b58900', actions: acciones }]
}

const COMUNES = new Set(['de', 'es', 'el', 'la', 'lo', 'no', 'si', 'ok', 'ya', 're', 'a', 'y', 'o', 'e'])

/**
 * NÚCLEO PURO: la respuesta ESCRITA, en el español real del dueño (sin tildes, abreviado).
 *   «si», «dale», «ok», «si es de emi» → la propuesta · «no», «compra comun», «no, caja chica» → común ·
 *   «jp», «es de JP», «de juan pablo», «emiliano» → esa persona, aunque se haya propuesto otra.
 * Lo que no se entiende es `ambigua`: se repregunta, nunca se imputa a ciegas.
 */
export function interpretarRespuesta(texto, { propuestos = [], personas = [] } = {}) {
  const t = plano(texto).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  // «no sé», «ni idea», «capaz»: duda, no un «no». Se repregunta.
  if (!t || /^(no se|nose|ni idea|capaz|puede ser|creo)\b/.test(t)) return { tipo: 'ambigua' }
  const tokens = t.split(' ')
  const nombradas = personas.filter((p) => {
    const ini = plano(p.iniciales)
    const palabras = plano(p.nombre).split(/\s+/).filter(Boolean)
    const pila = palabras[0] ?? ''
    if (t.includes(palabras.join(' '))) return true
    return tokens.some((k) => (k === ini && (!COMUNES.has(k) || t === k))
      || (k.length >= 3 && pila.startsWith(k))
      || (k.length >= 4 && palabras.slice(1).includes(k)))
  })
  const neg = /^(no|nop|nada|ninguno|ninguna)\b/.test(t) || /(compra comun|no es a rendir|caja chica|de nadie)/.test(t)
  const pos = /^(si+|sip|s|dale|ok|okey|oka|okis|correcto|exacto|confirmo|afirmativo|claro|eso|asi es)\b/.test(t)
  if (nombradas.length > 1) return { tipo: 'ambigua' }
  if (nombradas.length === 1) {
    const p = nombradas[0]
    const propuesta = propuestos.some((x) => x.persona_id === p.persona_id)
    if (neg && propuesta) return { tipo: 'no' }
    return { tipo: 'si', persona: p }
  }
  if (neg) return { tipo: 'no' }
  if (pos) return propuestos.length === 1 ? { tipo: 'si', persona: propuestos[0] } : { tipo: 'ambigua' }
  return { tipo: 'ambigua' }
}

export function textoRepregunta(personas = []) {
  const ini = personas.map((p) => p.iniciales).filter(Boolean).join(', ')
  return `No te entendí. Contestá «si», «no» (compra común) o las iniciales de quien lo pagó${ini ? ` (${ini})` : ''}. No imputé nada.`
}

// ═══════════════════════════════════════ LA BASE ═══════════════════════════════════════

/** Las personas con iniciales cargadas y sus entregas abiertas (la más vieja primero). Sin la columna, []. */
export async function leerPersonasConIniciales(port) {
  const r = await port.query(
    `select p.id as persona_id, p.iniciales_efectivo as iniciales, coalesce(p.nombre_para_mostrar, p.nombre_completo) as nombre,
            coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'codigo', e.codigo) order by e.fecha, e.numero)
                        from public.efectivo_entrega e
                       where e.persona_id = p.id and e.anulada_en is null and e.cerrada_en is null
                         and not coalesce(e.es_prueba, false)), '[]'::jsonb) as entregas
       from public.personas p
      where p.iniciales_efectivo is not null and not coalesce(p.es_prueba, false)`)
  return r?.rows ?? []
}

/**
 * DESPUÉS DE CARGAR: registra lo decidido para los tickets de ESTE post, vincula y arma los renglones y
 * las preguntas. Nunca lanza: si algo falla, se dice como aviso y la carga (que ya ocurrió) no se toca.
 */
export async function cerrarIniciales(port, { fajoId, post, channelId, rootPostId, enviadoPor, log }) {
  if (!fajoId) return { lineas: [], preguntas: [] }
  const f = await port.query('select items from comunicacion.comprobante_fajos where id = $1', [fajoId])
  const marcados = (f?.rows?.[0]?.items ?? []).filter((it) => it?.efectivo && (it.postId ?? null) === (post ?? null))
  if (!marcados.length) return { lineas: [], preguntas: [] }
  const filas = new Map()
  for (const it of marcados) {
    if (it.yaCargado || !it.clave) continue
    const d = it.efectivo
    const r = await port.query(
      `insert into public.efectivo_iniciales
         (clave, fajo_id, letras, confianza, estado, persona_id, entrega_id, candidatos, proveedor, mm_post_id, channel_id, root_post_id, enviado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
       on conflict (clave) do nothing returning id`,
      [it.clave, fajoId, d.letras, d.confianza, d.estado, d.persona?.persona_id ?? null,
        d.estado === 'auto' ? d.persona?.entrega_id ?? null : null, JSON.stringify(d.candidatos ?? []),
        it.comprobante?.proveedor ?? null, post, channelId ?? null, rootPostId ?? post, enviadoPor ?? null])
    if (r?.rows?.[0]?.id) filas.set(it.clave, r.rows[0].id)
  }
  try { await port.query('select public.vincular_rendiciones_pendientes()') } catch (e) {
    log?.warn?.('comprobantes: no pude vincular por iniciales ahora; lo hace la próxima vuelta', { error: String(e?.message ?? e) })
  }
  const claves = marcados.map((it) => it.clave).filter(Boolean)
  const v = claves.length
    ? await port.query('select compra_clave from public.efectivo_rendicion where compra_clave = any($1::text[])', [claves])
    : { rows: [] }
  const vinculadas = new Set((v?.rows ?? []).map((x) => x.compra_clave))
  const lineas = []
  const preguntas = []
  for (const it of marcados) {
    const decision = it.efectivo
    const proveedor = it.comprobante?.proveedor ?? null
    lineas.push(lineaDeIniciales({ decision, proveedor, vinculado: vinculadas.has(it.clave), yaEstaba: !!it.yaCargado }))
    const id = filas.get(it.clave)
    if (id && decision.estado === 'pregunta') preguntas.push({ id, decision, proveedor, fecha: it.comprobante?.fecha ?? null })
  }
  return { lineas, preguntas }
}

/** Publica cada pregunta como post propio en el hilo y guarda su id. Devuelve cuántas salieron. */
export async function publicarPreguntas({ port, mattermost, log }, preguntas, { channelId, rootPostId, url }) {
  let n = 0
  for (const p of preguntas) {
    try {
      const post = await mattermost.crearPost({
        channel_id: channelId, root_id: rootPostId ?? undefined, message: textoPregunta(p),
        props: { attachments: botonesPregunta({ id: p.id, decision: p.decision, url }) },
      })
      if (post?.id) {
        await port.query('update public.efectivo_iniciales set pregunta_post_id = $2 where id = $1', [p.id, post.id])
        n++
      }
    } catch (e) {
      log?.warn?.('comprobantes: no pude publicar la pregunta de iniciales', { detalle: String(e?.message ?? e).slice(0, 160) })
    }
  }
  return n
}

/** Las preguntas abiertas de un hilo. */
export async function preguntasAbiertas(port, rootPostId) {
  if (!rootPostId) return []
  const r = await port.query(
    `select id, letras, candidatos, proveedor, enviado_por, pregunta_post_id from public.efectivo_iniciales
      where estado = 'pregunta' and root_post_id = $1 order by creado_en`, [String(rootPostId)])
  return r?.rows ?? []
}

/**
 * APLICA UNA RESPUESTA (botón o texto) a una pregunta. Devuelve `{ok, texto}` para el hilo.
 * Contesta quien subió el comprobante, o Dirección/Administración.
 */
export async function aplicarRespuesta(port, { id, respuesta, remitente, personas }) {
  const r = await port.query('select * from public.efectivo_iniciales where id = $1', [id])
  const fila = r?.rows?.[0]
  if (!fila) return { ok: false, texto: 'Esa pregunta ya no existe.' }
  const puede = remitente?.perfilId && (remitente.perfilId === fila.enviado_por || ROLES_QUE_IMPUTAN_A_CUALQUIERA.includes(String(remitente.rol ?? '')))
  if (!puede) return { ok: false, texto: 'Esta pregunta la contesta quien subió el comprobante o Administración. No cambié nada.' }
  if (fila.estado !== 'pregunta') return { ok: false, texto: 'Esa pregunta ya estaba contestada.' }
  const de = fila.proveedor ? `${fila.proveedor}: ` : ''
  if (respuesta.tipo === 'no') {
    await port.query(`update public.efectivo_iniciales set estado = 'no', respondido_por = $2, respondido_en = now() where id = $1 and estado = 'pregunta'`, [id, remitente.perfilId])
    return { ok: true, texto: `${de}queda como compra común.` }
  }
  const p = personas.find((x) => x.persona_id === respuesta.persona?.persona_id)
  if (!p) return { ok: false, texto: 'No encuentro a esa persona entre las que tienen iniciales cargadas. No imputé nada.' }
  const entrega = p.entregas?.[0]
  if (!entrega) {
    await port.query(`update public.efectivo_iniciales set estado = 'sin_entrega', persona_id = $2, respondido_por = $3, respondido_en = now() where id = $1 and estado = 'pregunta'`, [id, p.persona_id, remitente.perfilId])
    return { ok: true, texto: `${de}${p.iniciales} no tiene entrega abierta: queda como compra común.` }
  }
  await port.query(
    `update public.efectivo_iniciales set estado = 'si', persona_id = $2, entrega_id = $3, respondido_por = $4, respondido_en = now()
      where id = $1 and estado = 'pregunta'`, [id, p.persona_id, entrega.id, remitente.perfilId])
  try { await port.query('select public.vincular_rendiciones_pendientes()') } catch { /* la próxima vuelta */ }
  const d = (await port.query('select estado, vinculado_en, motivo from public.efectivo_iniciales where id = $1', [id]))?.rows?.[0]
  const q = `${p.nombre} (${p.iniciales}) · ${entrega.codigo}`
  if (d?.estado === 'error') return { ok: false, texto: `${de}no pude imputarlo a ${q}: ${d.motivo}. Queda como compra común.` }
  if (d?.vinculado_en) return { ok: true, texto: `${de}Imputado a ${q} · a rendir` }
  return { ok: true, texto: `${de}anotado para ${q} · a rendir: se imputa en cuanto Compras tenga la fila (unos minutos).` }
}
