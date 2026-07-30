// DOBLES PARA LOS TESTS DE ESTE MÓDULO. No se usa en producción.
//
// Regla de oro que hace falta acá: NUNCA se corre el pipeline real ni se toca la planilla
// productiva para validar. El cliente de Google es el fake del fixture estructural
// (`lib/jornales-fixture.mjs`), que reproduce las rarezas reales del archivo; los módulos
// de los otros dos frentes se doblan contra la interfaz congelada del contrato.

import { fakeGoogleJornales, FECHA_HOY } from '../jornales-fixture.mjs'
import { crearApi } from './api.mjs'

export { FECHA_HOY }
export const SECRETO = 'secreto-solo-para-tests'
export const BASE = '/asistencia'

/** Catálogo de motivos con la forma que declara el contrato del frente A. */
export const CATALOGO = Object.freeze([
  { clave: 'falta', etiqueta: 'Falta', requiere_aclaracion: false, implica_horas_cero: true, orden: 1 },
  { clave: 'enfermedad', etiqueta: 'Enfermedad', requiere_aclaracion: false, implica_horas_cero: true, orden: 2 },
  { clave: 'franco', etiqueta: 'Franco', requiere_aclaracion: false, implica_horas_cero: true, orden: 3 },
  { clave: 'llego_tarde', etiqueta: 'Llegó tarde', requiere_aclaracion: false, implica_horas_cero: false, orden: 4 },
  { clave: 'se_retiro_antes', etiqueta: 'Se retiró antes', requiere_aclaracion: false, implica_horas_cero: false, orden: 5 },
  { clave: 'otro', etiqueta: 'Otro', requiere_aclaracion: true, implica_horas_cero: false, orden: 9 },
])

/**
 * Doble de `lib/asistencia-motivos.mjs`, con sus reglas.
 *
 * EL CONTRATO ES EL DEL MÓDULO REAL, y esto no es una formalidad: este doble leía
 * `jornada.horas` (el objeto) mientras el catálogo real espera un NÚMERO. Como el llamador
 * le pasaba el objeto, el doble validaba bien y el real no validaba nada — la jornada
 * quedaba en null y NUNCA se exigía motivo en una jornada parcial. El test pasaba en verde
 * sobre un defecto vivo. Un doble que no respeta el contrato del original no prueba: tapa.
 */
export function motivosDoble() {
  return {
    CATALOGO,
    motivosPara: ({ presente }) => CATALOGO.filter((m) => (presente ? !m.implica_horas_cero : m.implica_horas_cero)),
    validarNovedad({ presente, horas, jornada, motivo, aclaracion, obra_realizada }) {
      const jn = Number.isFinite(Number(jornada)) ? Number(jornada) : null // NÚMERO, igual que el real
      const conocido = motivo == null || CATALOGO.some((m) => m.clave === motivo)
      if (!conocido) return { ok: false, error: 'ese motivo no existe.' }
      if (!presente && !motivo) return { ok: false, error: 'falta el motivo de la ausencia.' }
      if (presente && jn != null && horas < jn && !motivo) return { ok: false, error: 'falta el motivo por las horas de menos.' }
      if (presente && jn != null && horas > jn && motivo) return { ok: false, error: 'las horas extra no llevan motivo.' }
      const ficha = CATALOGO.find((m) => m.clave === motivo)
      if (ficha?.requiere_aclaracion && !String(aclaracion ?? '').trim()) {
        return { ok: false, error: 'con «Otro» hace falta una aclaración.' }
      }
      return { ok: true, novedad: { motivo: motivo ?? null, aclaracion: aclaracion ?? null, obra_realizada: obra_realizada ?? null } }
    },
  }
}

/** Doble de `lib/jornada-config.mjs` (frente A). Por defecto: sin configuración. */
export function jornadaConfigDoble(respuesta = { horas: null, origen: 'sin_config' }) {
  return async () => respuesta
}

/** Doble del verificador de enlaces (histórico: la UI web se retiró). */
export function enlaceDoble({ validos = ['token-bueno'] } = {}) {
  const usados = new Set()
  return {
    usados,
    verificarEnlace({ token, consumir }) {
      if (!validos.includes(token)) return { ok: false, motivo: 'invalido' }
      if (usados.has(token)) return { ok: false, motivo: 'usado' }
      if (consumir) usados.add(token)
      return { ok: true, userId: 'mm-user-1', username: 'jefe.obra' }
    },
  }
}

/** Auditor que no toca la base: guarda los eventos para poder afirmar sobre ellos. */
export function auditorDoble() {
  const eventos = []
  const crear = () => async (evento, datos) => { eventos.push({ evento, datos }); return { ok: true } }
  crear.eventos = eventos
  return crear
}

/** Cliente de Google sobre el fixture estructural. */
export const googleDoble = fakeGoogleJornales

/** Cliente de Google que revienta con un mensaje cargado de secretos y rutas. */
export function googleQueFalla() {
  const boom = () => { throw new Error('Bearer sk-ANTHROPIC-SECRETO-123 falló en /home/jorge/echegaray-os/app/orquestador/lib/google.mjs:42') }
  return { listTabs: boom, readSheetGrid: boom, batchUpdateValues: boom }
}

/**
 * Levanta el servidor real en un puerto efímero, con dobles en todas las fronteras.
 * Devuelve helpers para pedir, entrar con el enlace y cerrar.
 */
/**
 * Arnés EN PROCESO de la capa de servicio. Antes levantaba el servidor HTTP de la pantalla
 * web; esa pantalla se retiró (la carga ocurre dentro de Mattermost), pero los tests que
 * colgaban de ella cubren validaciones, motivos, horas, idempotencia, concurrencia y celdas
 * bloqueadas — o sea, el BACKEND. Se conserva la misma interfaz (`json`, `entrar`, `cerrar`)
 * para no reescribir una sola aserción: lo único que cambia es que ahora se llama a la API
 * directamente en vez de dar la vuelta por HTTP.
 */
export async function levantarServidor({ google = googleDoble(), motivos, jornadaConfig, api, idempotencia } = {}) {
  const auditor = auditorDoble()
  const usar = api ?? crearApi({
    google,
    motivos: motivos ?? motivosDoble(),
    jornadaConfig: jornadaConfig ?? jornadaConfigDoble(),
    crearAuditorFn: auditor,
    hoy: () => FECHA_HOY,
    ...(idempotencia ? { idempotencia } : {}),
  })
  const ACTOR = { userId: 'usr-jefe', username: 'jorge' }

  /** Traduce una ruta de la API vieja a la llamada correspondiente. */
  async function despachar(ruta, opciones = {}) {
    const u = new URL(ruta, 'http://asistencia.local')
    const camino = u.pathname.replace(BASE, '')
    if (camino === '/api/contexto') return usar.contexto({ actor: ACTOR, params: u.searchParams })
    if (camino === '/api/cuadrilla') return usar.cuadrilla({ actor: ACTOR, params: u.searchParams })
    if (camino === '/api/registrar') {
      const body = opciones.body ? JSON.parse(opciones.body) : {}
      return usar.registrar({ actor: ACTOR, body })
    }
    return { status: 404, body: { error: 'No existe esa dirección.' } }
  }

  return {
    google,
    eventos: auditor.eventos,
    async json(ruta, opciones) {
      const r = await despachar(ruta, opciones)
      return { status: r.status, cuerpo: r.body }
    },
    postear(cuerpo) {
      return this.json(`${BASE}/api/registrar`, { method: 'POST', body: JSON.stringify(cuerpo) })
    },
    async entrar() { return { status: 302 } },
    cerrar() {},
  }
}
