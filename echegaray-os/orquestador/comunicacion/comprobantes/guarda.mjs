// LA PUERTA DE LA CARGA DE COMPROBANTES — dos cerrojos, no uno.
//
// Cargar un comprobante escribe en el Flujo de Fondos de la empresa: cambia el costo de una obra, la
// cuenta corriente de un proveedor y el IVA del período. Es efecto económico. Por eso hay dos
// cerrojos distintos y hay que pasar los dos:
//
//   1. CANAL. Sólo desde el canal oficial del área `compras`, y ese canal NO está escrito acá: sale
//      de `comunicacion.canales_area`, el mismo binding que usa el Director. Un id de Mattermost
//      hardcodeado sería configuración escondida en git que nadie puede cambiar sin desplegar.
//   2. PERMISO. Hace falta un grant activo en `comunicacion.permisos_skill` **o ser miembro del
//      canal oficial de compras**. **Siempre estricto**, sin importar `ORQ_ASISTENCIA_PERMISOS`:
//      la asistencia puede permitirse el modo abierto —el costo de que un jefe no pueda cargar es
//      mayor que el de que cargue quien no debía— pero acá el efecto es plata y la asimetría se da
//      vuelta. Que el modo abierto no llegue nunca hasta acá lo garantiza `permiso-de-canal.mjs`,
//      que no consulta `modoVigente()`.
//
// LA MEMBRESÍA COMO SEGUNDA VÍA es del 03/08 y es el pedido textual del dueño: «todos los q esten
// ese canal tienen q estar habilitados a cargar». SIGUEN SIENDO DOS PREGUNTAS —«¿desde dónde?» y
// «¿quién?»— y las dos se hacen: el canal desde el que llega el pedido se valida contra el binding
// (paso 1) y recién ese canal, ya confirmado como oficial, es contra el que se pregunta la
// membresía. Un canal que alguien se arme por su cuenta muere en el paso 1 y no habilita nada.
//
// FAIL-CLOSED SIN EXCEPCIONES. Si la base no responde, o si Mattermost no contesta si la persona
// está en el canal, se deniega. Un permiso que se afloja cuando se cae Postgres no es un permiso;
// y del otro lado hay una planilla con la plata de la empresa.

import { puedeOperar, MOTIVO as MOTIVO_PERMISO } from '../../lib/permiso-de-canal.mjs'
import { canalOficialDeArea, CANAL } from '../../lib/canal-de-area.mjs'

/** Área canónica dueña del gasto de compras (`public.area_canonica`). */
export const AREA_COMPRAS = 'compras'

/** El grant que hace falta. Se otorga con `scripts/asistencia-permiso.mjs --permiso …`. */
export const PERMISO_COMPROBANTES = 'compras.comprobantes.write'

export const RECHAZO = Object.freeze({
  CANAL: 'canal',
  PERMISO: 'permiso',
  SIN_IDENTIDAD: 'sin_identidad',
  SIN_ESQUEMA: 'sin_esquema',
})

export const DETALLE = Object.freeze({
  SIN_CANAL: 'sin_canal',
  CANAL_DIRECTO: 'canal_directo',
  CANAL_NO_ES_EL_OFICIAL: 'canal_no_es_el_oficial',
  BASE_INDISPONIBLE: 'base_indisponible',
  SIN_IDENTIDAD: 'sin_identidad',
  SIN_PERMISO: 'sin_permiso',
  PERMISO_NO_VERIFICABLE: 'permiso_no_verificable',
})

/** Castellano llano: qué pasó y qué hacer. Sin ids, sin nombres de tablas, sin jerga. */
export const TEXTO = Object.freeze({
  CANAL: 'Los comprobantes se cargan sólo desde el canal de comprobantes del equipo. Mandá la foto ahí y la registro. Si no ves ese canal en tu lista, pedí que te agreguen: con estar adentro ya podés cargar.',
  CANAL_NO_VERIFICABLE: 'No pude confirmar desde dónde estás escribiendo, así que no cargué nada. Probá de nuevo en un minuto.',
  SIN_IDENTIDAD: 'No pude reconocer quién manda el comprobante, y cada carga queda a nombre de alguien. Volvé a entrar a Mattermost y probá otra vez.',
  // No manda a pedir un permiso: la regla es que estar en el canal habilita, y a este texto sólo se
  // llega DESDE el canal oficial (el paso 1 ya corrió). Ver la nota equivalente en asistencia-guarda.
  SIN_PERMISO: 'No pude habilitarte la carga de comprobantes. La habilita estar en el canal de comprobantes del equipo: no hace falta que te den nada aparte. Si ya estás en ese canal y te sale esto, avisale a Dirección — es un problema del OS, no tuyo.',
  PERMISO_NO_VERIFICABLE: 'No pude confirmar si tenés habilitada la carga, así que no cargué nada. Probá de nuevo en un minuto.',
})

const txt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const niega = (motivo, detalle, texto) => ({ ok: false, motivo, detalle, texto })

/**
 * ¿Se puede cargar un comprobante acá y ahora?
 *
 * @param {object} o
 * @param {{query:Function}} o.port
 * @param {{plataforma_user_id?:string, channel_type?:string}} o.actor
 * @param {string} o.channelId
 * @param {string} [o.plataforma='mattermost']
 * @returns {Promise<{ok:true, canal:{id,nombre,area}}|{ok:false, motivo, detalle, texto}>}
 */
export async function puedeCargarComprobantes({ port, actor = {}, channelId, plataforma = 'mattermost', mattermost } = {}) {
  const canal = txt(channelId)
  if (!canal) return niega(RECHAZO.CANAL, DETALLE.SIN_CANAL, TEXTO.CANAL_NO_VERIFICABLE)

  // Un DM no es el canal oficial de nada, y se descarta sin gastar una consulta.
  const tipo = (txt(actor.channel_type) ?? txt(actor.channelType) ?? '').toUpperCase()
  if (tipo === 'D') return niega(RECHAZO.CANAL, DETALLE.CANAL_DIRECTO, TEXTO.CANAL)

  const oficial = await canalOficial(port, { channelId: canal, plataforma })
  if (!oficial.ok) return oficial

  const identidad = txt(actor.plataforma_user_id) ?? txt(actor.plataformaUserId) ?? txt(actor.user_id)
  if (!identidad) return niega(RECHAZO.SIN_IDENTIDAD, DETALLE.SIN_IDENTIDAD, TEXTO.SIN_IDENTIDAD)

  const permiso = await permisoEstricto(port, {
    plataforma, plataformaUserId: identidad, canalOficial: canal, mattermost,
  })
  if (!permiso.ok) return permiso

  return {
    ok: true, canal: { id: canal, nombre: oficial.nombre, area: AREA_COMPRAS },
    display: permiso.display ?? null, via: permiso.via ?? null,
  }
}

/**
 * ¿Este canal está atado al área `compras` y activo? Es DATO: se cambia sin desplegar.
 *
 * La consulta NO vive acá: vive en `lib/canal-de-area.mjs`, compartida con la guarda de asistencia
 * y con el prefiltro de ingesta. Había tres formas de contestar la misma pregunta y la tercera
 * —una lista de slugs en el entorno— no miraba el binding: un canal atado a `compras` habilitaba la
 * carga y sus fotos no llegaban a crear un evento. Esta función sólo traduce motivos a los suyos.
 */
async function canalOficial(port, { channelId, plataforma }) {
  const r = await canalOficialDeArea({ port, channelId, area: AREA_COMPRAS, plataforma })
  if (r.ok) return { ok: true, nombre: r.nombre }
  return r.motivo === CANAL.NO_VERIFICABLE
    ? niega(RECHAZO.CANAL, DETALLE.BASE_INDISPONIBLE, TEXTO.CANAL_NO_VERIFICABLE)
    : niega(RECHAZO.CANAL, DETALLE.CANAL_NO_ES_EL_OFICIAL, TEXTO.CANAL)
}

/**
 * Grant explícito O membresía del canal oficial, siempre estricto. La lógica no está acá: está en
 * `lib/permiso-de-canal.mjs`, compartida con la asistencia — el dueño pidió lo mismo para las dos
 * y dos copias de la misma regla se separan a la primera corrección.
 *
 * No consulta `modoVigente()` a propósito: el modo abierto es una decisión tomada para la
 * asistencia, y heredarla acá convertiría una decisión sobre horas trabajadas en una decisión sobre
 * la caja de la empresa sin que nadie la tomara. `puedeOperar` tampoco lo consulta.
 */
async function permisoEstricto(port, { plataforma, plataformaUserId, canalOficial, mattermost }) {
  const r = await puedeOperar({
    port, plataforma, plataformaUserId, permiso: PERMISO_COMPROBANTES, canalOficial, mattermost,
  })
  if (r.ok) return { ok: true, display: r.display ?? null, via: r.via }
  return r.motivo === MOTIVO_PERMISO.NO_VERIFICABLE
    ? niega(RECHAZO.PERMISO, DETALLE.PERMISO_NO_VERIFICABLE, TEXTO.PERMISO_NO_VERIFICABLE)
    : niega(RECHAZO.PERMISO, DETALLE.SIN_PERMISO, TEXTO.SIN_PERMISO)
}
