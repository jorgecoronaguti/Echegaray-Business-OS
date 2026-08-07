// EL GUARDIÁN DE LA CUOTA DE AFIPSDK — preguntar antes de gastar.
//
// ═══ POR QUÉ EXISTE (07/08) ═══
//
// El comentario del `echegaray-arca-sync.timer` decía, desde el 31/07:
//
//   "no depende de que este comentario se respete: el script le pregunta a la API cuánto queda antes
//    de gastar, y se niega si no alcanza (ver orquestador/lib/afipsdk-presupuesto.mjs)"
//
// Ese archivo NO EXISTÍA. La única defensa real era la frecuencia del timer, o sea el comentario que
// decía no depender de sí mismo. Una promesa escrita al lado de la cosa que promete proteger es peor
// que no tener nada: el que lee la unidad se queda tranquilo.
//
// ═══ NO HAY ENDPOINT DE CUOTA. SE BUSCÓ (07/08) ═══
//
// Verificado contra la API y la documentación:
//   · docs.afipsdk.com (sitemap + llms.txt) y afipsdk.com/docs/automations/: NINGUNA página de uso,
//     cuota, consumo o cuenta. La documentación cubre web services y automatizaciones, nada más.
//   · Sonda READ-ONLY sobre app.afipsdk.com/api/v1/: de {automations, account, me, usage,
//     subscription, plan, quota, user} la ÚNICA ruta de API real es `automations`. Las otras siete
//     devuelven el HTML de la aplicación (200), que es la respuesta de "esa ruta no existe".
//
// Entonces el saldo NO se puede consultar. Lo que hay es un CONTADOR LOCAL, y se declara como lo que
// es: una APROXIMACIÓN. Cuenta lo que gastó ESTA máquina. Si alguien dispara una automatización desde
// la web de AfipSDK o desde otro equipo, el contador queda corto — por eso existe la RESERVA, que es
// margen para eso y para la corrida manual del dueño.
//
// ═══ LO QUE SÍ SE PUEDE PREGUNTAR: SI LA CREDENCIAL SIRVE ═══
//
// `GET /api/v1/automations` no crea nada, no consume cuota y contesta 401 con mensaje explícito
// cuando el token no vale. Eso convierte el modo de falla más caro —quemar la corrida semanal contra
// un token muerto— en una negativa barata y con nombre. Es exactamente lo que pasó el 03/08.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Dónde se lleva la cuenta. Fuera de git: es estado de la máquina, no del repositorio. */
export const ARCHIVO_USO = fileURLToPath(new URL('../../scripts/arca/estado/uso-afipsdk.json', import.meta.url))

/**
 * EL LÍMITE DEL PLAN NO ES UN HECHO VERIFICADO POR EL OS: es lo que el dueño declaró el 31/07 ("el
 * plan free da 10 automatizaciones por período"), escrito en el propio timer. Se deja parametrizable
 * por entorno para que cambiar de plan no requiera tocar código, y NO se afirma vigente en ningún
 * informe: si AfipSDK cambia el plan, esto queda viejo sin gritar.
 */
export const LIMITE_DECLARADO = Number(process.env.ORQ_AFIPSDK_LIMITE || 10)

/**
 * LO QUE NUNCA SE GASTA SOLO. Dos automatizaciones = una corrida manual completa (libro R + libro E).
 * Sin reserva, el agente puede dejar al dueño sin poder bajar sus propios comprobantes el día que los
 * necesita, y ese día no hay forma de conseguir más hasta que el período rote.
 */
export const RESERVA_MANUAL = Number(process.env.ORQ_AFIPSDK_RESERVA || 2)

/** La ventana de conteo: mes calendario. PURA. */
export const ventanaDe = (fechaISO) => String(fechaISO ?? '').slice(0, 7)

/**
 * NÚCLEO PURO: cuántas automatizaciones se gastaron en la ventana.
 * @param {{eventos?: Array<{fecha:string, cantidad:number}>}} registro
 */
export function contarEnVentana(registro, ventana) {
  return (registro?.eventos ?? [])
    .filter((e) => ventanaDe(e?.fecha) === ventana)
    .reduce((a, e) => a + (Number(e?.cantidad) || 0), 0)
}

/**
 * NÚCLEO PURO: ¿alcanza para lo que se va a pedir?
 *
 * FALLA CERRADO ante un límite que no se entiende. Un límite mal declarado (0, negativo, texto) no
 * puede interpretarse como "no hay tope": así se gasta un plan entero en una corrida.
 *
 * @returns {{ok:boolean, disponible:number, usadas:number, motivo:string}}
 */
export function decidir({ usadas = 0, pedido = 0, limite = LIMITE_DECLARADO, reserva = RESERVA_MANUAL } = {}) {
  const lim = Number(limite)
  const res = Math.max(0, Number(reserva) || 0)
  if (!Number.isFinite(lim) || lim <= 0) {
    return { ok: false, disponible: 0, usadas, motivo: `límite de automatizaciones no declarado o inválido (${limite}). No gasto cuota sin saber cuánta hay.` }
  }
  const disponible = lim - res - usadas
  if (pedido <= 0) return { ok: true, disponible, usadas, motivo: 'no se pidió ninguna automatización' }
  if (pedido > disponible) {
    return {
      ok: false,
      disponible,
      usadas,
      motivo: `necesito ${pedido} automatización(es) y quedan ${Math.max(0, disponible)} en la ventana `
        + `(límite ${lim}, ya gastadas ${usadas}, reservadas ${res} para una corrida manual del dueño). `
        + 'El contador es local: cuenta lo que gastó esta máquina, no lo que AfipSDK tenga registrado.',
    }
  }
  return {
    ok: true,
    disponible,
    usadas,
    motivo: `alcanza: ${pedido} pedida(s), ${disponible} disponible(s) (límite ${lim} − reserva ${res} − usadas ${usadas})`,
  }
}

/** El registro guardado, o uno vacío. Un archivo ilegible NO se toma como "cero gastadas". */
export async function leerUso(archivo = ARCHIVO_USO) {
  try {
    return JSON.parse(await readFile(archivo, 'utf8'))
  } catch (e) {
    // ENOENT es el caso legítimo de la primera corrida. Cualquier otra cosa (JSON roto, permisos) se
    // propaga: leerlo como registro vacío diría "no gastaste nada" justo cuando no se sabe.
    if (e?.code === 'ENOENT') return { eventos: [] }
    throw new Error(`no puedo leer el registro de uso de AfipSDK (${archivo}): ${e.message}. `
      + 'Sin poder contar lo gastado no autorizo gasto nuevo.')
  }
}

/**
 * Anota lo consumido. Se llama DESPUÉS de que la automatización se creó de verdad — una creación
 * rechazada (401/402) no gasta cuota, y contarla dejaría al OS sin corridas por un error ajeno.
 * Conserva sólo las últimas 400 anotaciones: es una bitácora de control, no un histórico.
 */
export async function registrarConsumo({ cantidad = 1, fecha, detalle = '', archivo = ARCHIVO_USO } = {}) {
  const registro = await leerUso(archivo)
  const eventos = [...(registro.eventos ?? []), { fecha: fecha ?? new Date().toISOString().slice(0, 10), cantidad, detalle }]
  const podado = { ...registro, eventos: eventos.slice(-400) }
  await mkdir(dirname(archivo), { recursive: true })
  await writeFile(archivo, `${JSON.stringify(podado, null, 1)}\n`, 'utf8')
  return podado
}

/**
 * ¿Alcanza la cuota para `pedido` automatizaciones hoy?
 * @returns {{ok:boolean, disponible:number, usadas:number, motivo:string, ventana:string}}
 */
export async function presupuesto({ pedido = 1, hoy, archivo = ARCHIVO_USO, limite, reserva } = {}) {
  const fecha = hoy ?? new Date().toISOString().slice(0, 10)
  const ventana = ventanaDe(fecha)
  const usadas = contarEnVentana(await leerUso(archivo), ventana)
  return { ...decidir({ usadas, pedido, limite, reserva }), ventana }
}

/** La ruta que sí es API. Un GET no crea nada y no consume cuota. */
export const URL_SONDA = 'https://app.afipsdk.com/api/v1/automations'

/**
 * ¿La credencial sigue sirviendo? Preflight READ-ONLY, sin gastar una automatización.
 *
 * FALLA ABIERTO SALVO EN EL 401. Un 500 de AfipSDK, un timeout o una ruta que cambie de contrato no
 * prueban que el token esté mal, y negarse por eso dejaría el sync muerto por una causa que no es.
 * El 401 sí es una respuesta del servidor sobre ESTE token: ahí se bloquea, con el mensaje que
 * mandó AfipSDK y sin exhibir el token.
 */
export async function credencialAceptada({ token, fetchImpl = fetch, url = URL_SONDA } = {}) {
  if (!token) return { ok: false, status: null, motivo: 'no hay ACCESS_TOKEN de AfipSDK para probar' }
  try {
    const res = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      const cuerpo = await res.text().catch(() => '')
      return {
        ok: false,
        status: 401,
        motivo: `AfipSDK rechaza la credencial: ${String(cuerpo).slice(0, 160)}. `
          + 'Hay que renovar el ACCESS_TOKEN en app.afipsdk.com (el archivo de credenciales tiene REFRESH_TOKEN). '
          + 'No disparo la descarga: sería quemar la corrida contra un token muerto.',
      }
    }
    return { ok: true, status: res.status, motivo: `la sonda respondió ${res.status}: no hay rechazo de credencial` }
  } catch (e) {
    return { ok: true, status: null, motivo: `no pude sondear la credencial (${e.message}); sigo, porque no poder preguntar no prueba que el token esté mal` }
  }
}
