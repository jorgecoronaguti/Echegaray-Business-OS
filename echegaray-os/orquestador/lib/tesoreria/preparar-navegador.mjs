// PREPARAR EL NAVEGADOR ANTES DE MIRAR EL MERCADO — y decir con precisión por qué no se pudo.
//
// ═══ LO QUE ESTE ARCHIVO EXISTE PARA EVITAR ═══
//
// Antes había un solo motivo posible: "no hay sesión". Ahora el navegador es de la casa, y las cosas
// que pueden fallar son varias y piden acciones DISTINTAS:
//
//   · el contenedor no está          → lo levanta el OS, sin molestar a nadie
//   · el contenedor está arrancando  → se espera, no se reinicia
//   · no quedó ninguna pestaña       → se recrea la pestaña informativa
//   · la sesión venció               → hace falta una persona, y sólo eso
//   · el navegador está roto         → hace falta mirar el servicio
//
// Mandar "necesita autenticación" cuando el navegador está caído hace que el dueño abra el enlace,
// vea una pantalla negra y no entienda nada. Y reiniciar el navegador cuando lo que venció es la
// sesión borra la pantalla de login que estaba por usar. Cada estado tiene su acción.
//
// ═══ LO QUE NUNCA HACE ═══
//
// No inicia sesión, no completa credenciales y no reintenta el login. Cuando hace falta una persona,
// lo dice y se detiene.

import {
  ESTADO, configRuntime, diagnosticar, arrancarNavegador, asegurarPestanaCanonica, reiniciarNavegador,
} from './navegador-runtime.mjs'

/** Cuánto se espera a que Chromium abra el puerto después de arrancar el contenedor. */
export const ESPERA_ARRANQUE_MS = Number(process.env.ORQ_BALANZ_ESPERA_ARRANQUE_MS || 45000)

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Deja el navegador en el mejor estado alcanzable SIN una persona, y devuelve qué se consiguió.
 *
 * @returns {Promise<{estado:string, listo:boolean, detalle:string, acciones:string[]}>}
 *   `listo` significa "se puede intentar relevar el mercado". No significa que la sesión sirva: eso
 *   lo dice el DOM, y lo verifica `verificarSesion` durante el relevamiento.
 */
export async function prepararNavegador(cfg = configRuntime(), deps = {}) {
  const { esperarMs = ESPERA_ARRANQUE_MS, dormirImpl = dormir } = deps
  const acciones = []

  let d = await diagnosticar(cfg, deps)

  // 1 · SIN NAVEGADOR: se levanta. Es la única recuperación automática que hace falta y no molesta a
  //     nadie: el contenedor es del OS.
  if (d.estado === ESTADO.BROWSER_ERROR) {
    acciones.push('se levantó el navegador')
    const r = await arrancarNavegador(cfg, deps).catch((e) => ({ arrancado: false, motivo: String(e?.message ?? e) }))
    if (r.arrancado === false && r.motivo && !/ya estaba/.test(r.motivo)) {
      return { estado: ESTADO.BROWSER_ERROR, listo: false, detalle: `no se pudo levantar el navegador: ${r.motivo}`, acciones }
    }
    d = await esperarArranque(cfg, deps, esperarMs, dormirImpl)
  }

  // 2 · ARRANCANDO: se espera. Reiniciarlo acá es el error clásico — el bucle de reinicios se ve
  //     idéntico a una caída y nunca termina de arrancar.
  if (d.estado === ESTADO.BROWSER_STARTING) {
    acciones.push('se esperó el arranque')
    d = await esperarArranque(cfg, deps, esperarMs, dormirImpl)
  }

  // 3 · SIN PESTAÑA: se recrea SÓLO la pestaña informativa. No recupera la sesión —`sessionStorage`
  //     murió con la pestaña— pero deja la pantalla de ingreso lista para que una persona la use.
  if (d.estado === ESTADO.BALANZ_TARGET_MISSING) {
    acciones.push('se recreó la pestaña de Balanz')
    await asegurarPestanaCanonica(cfg, deps)
    await dormirImpl(3000)
    d = await diagnosticar(cfg, deps)
  }

  if (d.estado === ESTADO.SESSION_ACTIVE) {
    return { estado: ESTADO.SESSION_ACTIVE, listo: true, detalle: d.detalle, acciones, target: d.target }
  }
  if (d.estado === ESTADO.SESSION_REQUIRED) {
    return { estado: ESTADO.SESSION_REQUIRED, listo: false, detalle: d.detalle, acciones, target: d.target }
  }
  return { estado: d.estado, listo: false, detalle: d.detalle ?? 'el navegador no quedó en un estado usable', acciones }
}

/** Espera a que el diagnóstico salga de "arrancando". No reinicia nada. */
async function esperarArranque(cfg, deps, esperarMs, dormirImpl) {
  const limite = Date.now() + esperarMs
  let d = await diagnosticar(cfg, deps)
  while (Date.now() < limite && (d.estado === ESTADO.BROWSER_STARTING || d.estado === ESTADO.BROWSER_ERROR)) {
    await dormirImpl(2000)
    d = await diagnosticar(cfg, deps)
  }
  return d
}

/**
 * RECUPERACIÓN de un navegador roto. Se llama desde el vigía, no desde el ciclo: durante una corrida
 * no se reinicia nada (ver el cerrojo en `navegador-runtime.mjs`).
 */
export async function recuperarNavegador(cfg = configRuntime(), deps = {}) {
  const d = await diagnosticar(cfg, deps)
  if (d.estado !== ESTADO.BROWSER_ERROR) {
    return { recuperado: false, estado: d.estado, motivo: 'el navegador no está roto: no se toca' }
  }
  const r = await reiniciarNavegador(cfg, { motivo: 'el vigía lo encontró caído', deps })
  return { recuperado: r.reiniciado, estado: d.estado, ...r }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// LOS MENSAJES — cada estado dice qué pasó, qué sigue funcionando y qué hacer
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * "NECESITA AUTENTICACIÓN". El mensaje más importante del agente: es el único que le pide algo a una
 * persona, y si no se entiende en diez segundos desde un celular, no sirve.
 *
 * Lleva el enlace, pero NUNCA el token suelto en el texto ni la clave del escritorio.
 */
export function mensajeNecesitaAutenticacion({ enlace = null, detalle = '', correlacion = null, ahora = new Date() } = {}) {
  return [
    '**BALANZ · NECESITA AUTENTICACIÓN**',
    '',
    // NO dice "venció": el perfil del navegador nace vacío, así que la PRIMERA vez —y después de
    // cualquier reinstalación— nunca hubo sesión que venciera. Afirmar que venció algo que no
    // existió es una falsedad chica que enseña a leer los avisos con desconfianza.
    `No hay sesión iniciada en Balanz${detalle ? ` (${detalle})` : ''}.`,
    '',
    '**El análisis de caja se hizo igual y está publicado.** Lo que falta son las alternativas de',
    'inversión: no se relevó ninguna oportunidad nueva, así que no hay recomendación de mercado.',
    '',
    enlace
      ? `👉 [Abrir el navegador de la VM](${enlace}) — entrá a Balanz a mano y cerrá la pestaña. El enlace vence en 20 minutos.`
      : '⚠️ No pude generar el enlace de la pantalla remota (falta `BALANZ_REMOTO_SECRETO`).',
    '',
    'El OS detecta la sesión solo y reintenta: no hace falta avisarle ni correr nada.',
    '',
    `_${ahora.toISOString()}${correlacion ? ` · ${correlacion}` : ''}_`,
  ].join('\n')
}

/** "CONECTADO". Se manda cuando la sesión vuelve, no todos los días: ver `esCambioMaterial`. */
export function mensajeSesionRestaurada({ proxima = null, ahora = new Date() } = {}) {
  return [
    '**BALANZ · SESIÓN RESTAURADA**',
    '',
    'Detecté la sesión y el relevamiento del mercado vuelve a estar disponible.',
    proxima ? `Próxima corrida: ${proxima}.` : 'Se releva en la próxima corrida.',
    '',
    `_${ahora.toISOString()}_`,
  ].join('\n')
}

/**
 * "EL NAVEGADOR NO ESTÁ". Es distinto de la sesión vencida y por eso tiene su propio mensaje: acá NO
 * hay nada que el dueño pueda hacer desde el celular, y mandarle un enlace sería mandarlo a mirar una
 * pantalla negra.
 */
export function mensajeNavegadorRoto({ detalle = '', acciones = [], ahora = new Date() } = {}) {
  return [
    '**BALANZ · EL NAVEGADOR NO RESPONDE**',
    '',
    `Qué pasó: ${detalle || 'el navegador de la VM no está disponible'}.`,
    acciones.length ? `Intenté: ${acciones.join(', ')}.` : 'No se pudo recuperar solo.',
    '',
    '**El análisis de caja se hizo igual.** No se relevó el mercado y no hay recomendación de inversión.',
    '',
    'Esto no se arregla iniciando sesión: es el servicio del navegador.',
    'Para mirarlo: `systemctl --user status echegaray-balanz-browser`.',
    '',
    `_${ahora.toISOString()}_`,
  ].join('\n')
}

/** El estado sano, para el healthcheck y para `/tesoreria estado`. */
export function mensajeConectado({ target = null, ultima = null, proxima = null, ahora = new Date() } = {}) {
  return [
    '**BALANZ · CONECTADO**',
    '',
    `Pantalla actual: ${target?.url ? `\`${target.url}\`` : 'sesión activa'}`,
    ultima ? `Última validación: ${ultima}` : null,
    proxima ? `Próxima corrida: ${proxima}` : null,
    '',
    `_${ahora.toISOString()}_`,
  ].filter((x) => x !== null).join('\n')
}

export const VERSION = '1.0.0'
