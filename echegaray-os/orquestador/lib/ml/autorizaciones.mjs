// QUÉ DOMINIOS AUTORIZÓ EL DUEÑO A SALIR HACIA HUGGING FACE. Una decisión suya, escrita donde él
// la escribe, y auditable.
//
// ═══ POR QUÉ NO ES UN BOOLEANO EN EL CÓDIGO ═══
//
// `puedeSalir(..., { permitidoExplicitamente })` ya existía y es correcto: la autorización es POR
// CASO y viaja en la llamada. Lo que faltaba era el lugar donde el dueño la declara UNA vez sin
// tocar código, y sin que eso se convierta en un interruptor global que abre todo.
//
// Un `ORQ_HF_TODO=1` sería exactamente el agujero: alguien lo prende para una prueba, se olvida, y
// seis meses después un legajo viaja porque una variable quedó encendida. Acá se declaran DOMINIOS,
// uno por uno, y lo que no está listado no sale.
//
// ═══ LO QUE NO SE PUEDE AUTORIZAR NI ASÍ ═══
//
// RESTRICTED no se abre por esta puerta. `banco`, `legajo`, `nomina`, `fiscal`, `credenciales` y el
// resto de la lista de `politica.mjs` quedan afuera aunque alguien los escriba en la variable: una
// decisión de esta magnitud no puede tomarse por tipeo en un archivo de entorno. Si algún día hace
// falta, se cambia la política a la vista, con su commit y su motivo.
//
// ═══ DÓNDE SE ESCRIBE ═══
//
//   ~/.config/echegaray/orquestador.env       (permisos 600, fuera del repositorio)
//   ORQ_HF_DOMINIOS_AUTORIZADOS=consultas,intenciones,partidas
//
// Vacío por defecto. Un OS que arranca sin autorizaciones es un OS que no filtró nada todavía.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SENSIBILIDAD, sensibilidadDe } from './politica.mjs'

/** Ningún dominio RESTRICTED se autoriza por variable de entorno. Es el techo del techo. */
export function autorizable(dominio) {
  return sensibilidadDe(dominio) !== SENSIBILIDAD.RESTRICTED
}

let _cache

/** Lo que dice la configuración, sin filtrar. Separado para poder probar el parseo solo. */
export function parsear(crudo) {
  return String(crudo ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * LOS DOMINIOS EFECTIVAMENTE AUTORIZADOS. Los RESTRICTED se descartan acá, con su motivo, para que
 * un intento de autorizarlos quede visible en vez de fallar en silencio en otro lado.
 *
 * @returns { autorizados: string[], rechazados: string[] }
 */
export function dominiosAutorizados({ crudo = null } = {}) {
  const texto = crudo ?? leerCrudo()
  const pedidos = parsear(texto)
  const autorizados = []
  const rechazados = []
  for (const d of pedidos) (autorizable(d) ? autorizados : rechazados).push(d)
  return { autorizados, rechazados }
}

function leerCrudo() {
  if (_cache !== undefined) return _cache
  _cache = process.env.ORQ_HF_DOMINIOS_AUTORIZADOS ?? null
  if (_cache == null) {
    try {
      const txt = readFileSync(join(homedir(), '.config/echegaray/orquestador.env'), 'utf8')
      _cache = txt.match(/^ORQ_HF_DOMINIOS_AUTORIZADOS=(.*)$/m)?.[1]?.trim() ?? ''
    } catch { _cache = '' }
  }
  return _cache
}

/** Sólo para pruebas: vuelve a leer la configuración. */
export function olvidar() { _cache = undefined }

/** ¿El dueño autorizó este dominio? Es la pregunta que hace el gateway antes de mandar nada. */
export function autorizado(dominio, opciones = {}) {
  const d = String(dominio ?? '').trim().toLowerCase()
  if (!d) return false
  return dominiosAutorizados(opciones).autorizados.includes(d)
}
