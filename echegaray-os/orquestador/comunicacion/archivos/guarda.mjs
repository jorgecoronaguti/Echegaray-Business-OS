// LA PUERTA DE LA IMPORTACIÓN BANCARIA — dos cerrojos, no uno. Y sólo para lo que escribe.
//
// ═══ LA DISTINCIÓN QUE ORDENA TODO ESTE ARCHIVO ═══
//
// LEER un archivo y DECIR qué dice no tiene efecto: no cambia un solo dato de la empresa. IMPORTAR
// movimientos bancarios cambia `banco_movimientos`, y detrás de esa tabla cuelgan por fórmula la
// disponibilidad de CAJA, el impuesto al cheque, los costos bancarios y el cruce de Cheques. Son dos
// cosas distintas y por eso tienen dos exigencias distintas:
//
//   · para leer y describir  → alcanza con IDENTIDAD real de plataforma (fail-closed: una lectura
//     anónima no se registra a nombre de nadie, y un registro sin nombre es un agujero);
//   · para importar          → canal oficial del área + permiso, siempre estricto.
//
// Exigir el canal oficial para leer habría sido peor que inútil: el dueño manda archivos por DM, y
// una capacidad que sólo funciona en un canal específico es una capacidad que no existe.
//
// ═══ Y POR QUÉ SE PREGUNTA ANTES DE MOSTRAR EL BOTÓN ═══
//
// La puerta se evalúa cuando se arma la previsualización, no cuando se aprieta. Un botón que existe
// para contestar "no podés" manda a diagnosticar el lado equivocado — es exactamente el defecto que
// este subsistema ya pagó con el secreto de los callbacks. Si la puerta no se pasa, se muestra lo
// leído y se dice por qué no hay botón.
//
// FAIL-CLOSED SIN EXCEPCIONES: si la base no responde, o si Mattermost no contesta si la persona está
// en el canal, se deniega.

import { puedeOperar, MOTIVO as MOTIVO_PERMISO } from '../../lib/permiso-de-canal.mjs'
import { canalOficialDeArea, CANAL } from '../../lib/canal-de-area.mjs'

/** Área canónica dueña de la tesorería (`public.area_canonica`). */
export const AREA_FINANZAS = 'administracion_finanzas'

/** El grant que hace falta. Se otorga con `scripts/asistencia-permiso.mjs --permiso …`. */
export const PERMISO_BANCO = 'finanzas.banco.import'

export const RECHAZO = Object.freeze({
  CANAL: 'canal',
  PERMISO: 'permiso',
  SIN_IDENTIDAD: 'sin_identidad',
})

export const TEXTO = Object.freeze({
  CANAL: 'Los movimientos del banco se cargan sólo desde el canal de Administración y Finanzas del equipo. Te muestro lo que leí, pero para escribirlo mandámelo ahí.',
  CANAL_NO_VERIFICABLE: 'No pude confirmar desde dónde estás escribiendo, así que no dejo cargar nada. Probá de nuevo en un minuto.',
  SIN_IDENTIDAD: 'No pude reconocer quién manda el archivo, y cada carga queda a nombre de alguien.',
  SIN_PERMISO: 'No estás habilitado para cargar movimientos del banco. La habilita estar en el canal de Administración y Finanzas.',
  PERMISO_NO_VERIFICABLE: 'No pude confirmar si tenés habilitada la carga, así que no cargué nada. Probá de nuevo en un minuto.',
})

const txt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const niega = (motivo, texto) => ({ ok: false, motivo, texto })

/** Identidad real de plataforma. Es lo mínimo para siquiera bajar y registrar un archivo. */
export function hayIdentidad(actor = {}) {
  return Boolean(txt(actor.plataforma_user_id) ?? txt(actor.plataformaUserId) ?? txt(actor.user_id))
}

/**
 * ¿Se puede IMPORTAR a la base desde acá y ahora?
 *
 * @returns {Promise<{ok:true, canal:{id,nombre}}|{ok:false, motivo:string, texto:string}>}
 */
export async function puedeImportarBanco({ port, actor = {}, channelId, plataforma = 'mattermost', mattermost } = {}) {
  const canal = txt(channelId)
  if (!canal) return niega(RECHAZO.CANAL, TEXTO.CANAL_NO_VERIFICABLE)

  // Un DM no es el canal oficial de nada, y se descarta sin gastar una consulta.
  const tipo = (txt(actor.channel_type) ?? txt(actor.channelType) ?? '').toUpperCase()
  if (tipo === 'D') return niega(RECHAZO.CANAL, TEXTO.CANAL)

  const oficial = await canalOficialDeArea({ port, channelId: canal, area: AREA_FINANZAS, plataforma })
  if (!oficial.ok) {
    return oficial.motivo === CANAL.NO_VERIFICABLE
      ? niega(RECHAZO.CANAL, TEXTO.CANAL_NO_VERIFICABLE)
      : niega(RECHAZO.CANAL, TEXTO.CANAL)
  }

  const identidad = txt(actor.plataforma_user_id) ?? txt(actor.plataformaUserId) ?? txt(actor.user_id)
  if (!identidad) return niega(RECHAZO.SIN_IDENTIDAD, TEXTO.SIN_IDENTIDAD)

  const r = await puedeOperar({
    port, plataforma, plataformaUserId: identidad, permiso: PERMISO_BANCO, canalOficial: canal, mattermost,
  })
  if (!r.ok) {
    return r.motivo === MOTIVO_PERMISO.NO_VERIFICABLE
      ? niega(RECHAZO.PERMISO, TEXTO.PERMISO_NO_VERIFICABLE)
      : niega(RECHAZO.PERMISO, TEXTO.SIN_PERMISO)
  }
  return { ok: true, canal: { id: canal, nombre: oficial.nombre } }
}
