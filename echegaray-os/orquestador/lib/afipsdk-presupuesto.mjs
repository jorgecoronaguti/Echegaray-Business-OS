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
// ═══ SÍ HAY ENDPOINT DE CUOTA, Y ESTÁ EN LA OTRA PUERTA (13/08) ═══
//
// El 07/08 se buscó y se concluyó que no existía. La búsqueda fue con la llave equivocada: se sondeó
// `app.afipsdk.com/api/v1/{account,me,usage,subscription,plan,quota,user}` con el ACCESS_TOKEN y todas
// devolvieron el HTML de la aplicación, que se leyó como "esa ruta no existe".
//
// La ruta del panel es otra —`/api/v1/projects`— y se autentica con el ACCOUNT_TOKEN, no con el
// ACCESS_TOKEN. Verificado el 13/08 contra la API real: `GET /api/v1/projects` con el ACCOUNT_TOKEN
// devuelve 200 con el proyecto, incluyendo `automation_limit` y `current_period_automation_usage`
// REALES del proveedor, y el período de facturación (que NO es el mes calendario: va del 10 de un mes
// al 10 del siguiente).
//
// Por eso el contador local pasa a ser lo que siempre debió ser: el PLAN B. Cuando el proveedor
// contesta, manda el proveedor. Cuando no, se usa el contador local y se DECLARA que es aproximado —
// cuenta lo que gastó esta máquina, en una ventana (mes calendario) que ni siquiera coincide con la
// del proveedor.
//
// ═══ LOS DOS TOKENS SON DE PUERTAS DISTINTAS ═══
//
//   ACCESS_TOKEN  → la API de automatizaciones: `POST /api/v1/automations` (lo que el sync usa).
//   ACCOUNT_TOKEN → la API del panel: `GET /api/v1/projects` (cuota, plan, estado de suscripción).
//
// Cruzarlos da 401 en las dos direcciones. Eso NO es un token vencido: es la llave equivocada.
//
// ═══ LA SONDA SE PRUEBA CON LA MISMA CERRADURA QUE SE VA A USAR (13/08) ═══
//
// Del 03/08 al 13/08 el sync no bajó un solo comprobante. El motivo NO fue un token vencido: la sonda
// era `GET /api/v1/automations` con el ACCESS_TOKEN, y ese verbo sobre ese endpoint devuelve 401
// SIEMPRE, con token sano o podrido. El sync leía ese 401 como "la credencial no sirve", abortaba, y
// el mensaje mandaba al dueño a renovar un token que estaba perfecto. Tres veces.
//
// Medido el 13/08 con las credenciales reales:
//   GET  /api/v1/automations  con ACCESS_TOKEN → 401 {"message":"El token proporcionado es invalido."}
//   POST /api/v1/automations  con ACCESS_TOKEN → 400 {"statusCode":400,"data_errors":{...}}
//   GET  /api/v1/projects     con ACCOUNT_TOKEN → 200 (el proyecto, con su cuota real)
//
// Un control no se valida contra información distinta de la que produce el efecto. La sonda ahora usa
// EL MISMO VERBO Y EL MISMO ENDPOINT que la descarga real —`POST /api/v1/automations`— con un cuerpo
// inválido a propósito. La lectura es:
//
//   401  → la credencial NO sirve (es el servidor hablando de ESTE token).
//   400  → la credencial SÍ sirve: la petición pasó autenticación y murió en validación de campos.
//   otra → NO SÉ. Que es distinto de "está mal", y no puede abortar como si lo fuera.
//
// POR QUÉ LA SONDA NO GASTA CUOTA: el cuerpo vacío no crea ninguna automatización — el servidor la
// rechaza antes, en la validación (`El campo Automatización es obligatorio`). Es el mismo criterio ya
// escrito en `arca-sync-resultado.mjs::consumioCuota`: una creación rechazada con 4xx no creó nada y
// por lo tanto no consumió nada. Confirmado además contra el propio proveedor: después de correr esta
// sonda, `current_period_automation_usage` no se movió.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Dónde se lleva la cuenta. Fuera de git: es estado de la máquina, no del repositorio. */
export const ARCHIVO_USO = fileURLToPath(new URL('../../scripts/arca/estado/uso-afipsdk.json', import.meta.url))

/** Dónde viven las credenciales de AfipSDK. Fuera de git. Sus valores NUNCA se imprimen. */
export const ARCHIVO_CREDENCIALES = fileURLToPath(new URL('../../scripts/arca/credentials/afipsdk-token.txt', import.meta.url))

/**
 * EL LÍMITE DE FALLBACK. Es lo que el dueño declaró el 31/07 ("el plan free da 10 automatizaciones
 * por período"), NO un hecho verificado por el OS. Sólo se usa cuando el proveedor no contesta: desde
 * el 13/08 el número real se le pregunta a AfipSDK (`cuotaDelProveedor`), y cuando se lo puede
 * preguntar, este valor no interviene.
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

// ── LAS CREDENCIALES ─────────────────────────────────────────────────────────────────────────────

/**
 * NÚCLEO PURO: parsea el archivo `CLAVE=valor` (con comentarios `#`) de credenciales.
 *
 * Devuelve las tres claves que el OS usa, cada una para SU puerta. Ninguna se imprime nunca: quien
 * consuma esto sólo puede pasarlas a un header.
 *
 * @returns {{accessToken:string|null, accountToken:string|null, projectId:string|null}}
 */
export function parsearCredenciales(texto) {
  const kv = {}
  for (const linea of String(texto ?? '').split('\n')) {
    if (/^\s*#/.test(linea) || !linea.includes('=')) continue
    const i = linea.indexOf('=')
    kv[linea.slice(0, i).trim()] = linea.slice(i + 1).trim()
  }
  return {
    accessToken: kv.ACCESS_TOKEN || null,   // → POST /api/v1/automations (la descarga)
    accountToken: kv.ACCOUNT_TOKEN || null, // → GET  /api/v1/projects    (la cuota real)
    projectId: kv.PROJECT_ID || null,
  }
}

/** Las credenciales del disco. Un archivo ausente o ilegible da las tres en null, no explota. */
export async function leerCredenciales(archivo = ARCHIVO_CREDENCIALES) {
  try {
    return parsearCredenciales(await readFile(archivo, 'utf8'))
  } catch {
    return { accessToken: null, accountToken: null, projectId: null }
  }
}

// ── LA CUOTA REAL, LA DEL PROVEEDOR ──────────────────────────────────────────────────────────────

/** La API del PANEL. Se autentica con el ACCOUNT_TOKEN, no con el ACCESS_TOKEN. */
export const URL_PROYECTOS = 'https://app.afipsdk.com/api/v1/projects'

/**
 * NÚCLEO PURO: saca el proyecto de la respuesta, tolerando la forma.
 *
 * El panel puede devolver un array, `{data:[…]}` o un objeto suelto: el contrato no está documentado
 * en ningún lado (docs.afipsdk.com no tiene una sola página del panel), así que se lee defensivo. Si
 * hay `projectId`, se busca ése; si no, el único; si hay varios y no se sabe cuál, NO se elige uno —
 * adivinar el proyecto es adivinar la cuota.
 */
export function proyectoDeRespuesta(json, { projectId } = {}) {
  const lista = Array.isArray(json) ? json
    : Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.projects) ? json.projects
        : json && typeof json === 'object' ? [json.data ?? json] : []
  const proyectos = lista.filter((p) => p && typeof p === 'object')
  if (!proyectos.length) return null
  if (projectId) return proyectos.find((p) => String(p.id ?? p.project_id ?? '') === String(projectId)) ?? null
  return proyectos.length === 1 ? proyectos[0] : null
}

/**
 * NÚCLEO PURO: límite y usadas del proyecto, sólo si vienen como números de verdad.
 *
 * Un campo ausente o no numérico NO se completa con un default: un límite inventado es exactamente el
 * problema que este cambio viene a sacar.
 */
export function cuotaDeProyecto(proyecto) {
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
  const limite = num(proyecto?.automation_limit)
  const usadas = num(proyecto?.current_period_automation_usage)
  if (limite === null || usadas === null) return null
  const desde = proyecto?.current_period_start ?? proyecto?.period_start ?? null
  const hasta = proyecto?.current_period_end ?? proyecto?.period_end ?? null
  return {
    limite,
    usadas,
    estado: proyecto?.subscription_status ?? null,
    ventana: desde && hasta ? `${String(desde).slice(0, 10)}→${String(hasta).slice(0, 10)}` : 'período del proveedor',
  }
}

/**
 * ¿Cuánta cuota queda SEGÚN AFIPSDK? La cifra real, no la estimada.
 *
 * FALLA HACIA EL CONTADOR LOCAL, nunca hacia "no hay tope": si el panel no contesta, quien llama se
 * entera por `ok:false` y usa el plan B declarándolo.
 *
 * @returns {{ok:boolean, limite:number|null, usadas:number|null, ventana:string|null, estado:string|null, motivo:string}}
 */
export async function cuotaDelProveedor({ accountToken, projectId, fetchImpl = fetch, url = URL_PROYECTOS } = {}) {
  const fallo = (motivo) => ({ ok: false, limite: null, usadas: null, ventana: null, estado: null, motivo })
  if (!accountToken) return fallo('no hay ACCOUNT_TOKEN: no puedo preguntarle la cuota al proveedor')
  let res
  try {
    res = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${accountToken}`, Accept: 'application/json' } })
  } catch (e) {
    return fallo(`no pude consultar la cuota del proveedor (${e.message})`)
  }
  if (res.status === 401) return fallo('el panel rechaza el ACCOUNT_TOKEN (401): esa credencial sí hay que renovarla en app.afipsdk.com')
  if (!(res.status >= 200 && res.status < 300)) return fallo(`el panel respondió ${res.status} y no puedo leer la cuota real`)
  let json
  try {
    json = await res.json()
  } catch (e) {
    return fallo(`el panel respondió ${res.status} pero el cuerpo no es JSON (${e.message})`)
  }
  const proyecto = proyectoDeRespuesta(json, { projectId })
  if (!proyecto) return fallo('el panel contestó pero no pude identificar el proyecto (¿varios proyectos y sin PROJECT_ID?)')
  const cuota = cuotaDeProyecto(proyecto)
  if (!cuota) return fallo('el panel contestó pero el proyecto no trae automation_limit / current_period_automation_usage')
  return { ok: true, ...cuota, motivo: `cuota REAL de AfipSDK: ${cuota.usadas} usadas de ${cuota.limite} en ${cuota.ventana}` }
}

/**
 * ¿Alcanza la cuota para `pedido` automatizaciones hoy?
 *
 * PRIMERO LE PREGUNTA AL PROVEEDOR. El contador local es el plan B y, cuando se usa, la respuesta lo
 * dice: es una APROXIMACIÓN de esta máquina, sobre el mes calendario, que ni siquiera coincide con el
 * período de facturación de AfipSDK.
 *
 * @returns {{ok:boolean, disponible:number, usadas:number, motivo:string, ventana:string, fuente:'proveedor'|'local'}}
 */
export async function presupuesto({
  pedido = 1, hoy, archivo = ARCHIVO_USO, limite, reserva, accountToken, projectId, fetchImpl, url,
} = {}) {
  const fecha = hoy ?? new Date().toISOString().slice(0, 10)
  const proveedor = accountToken
    ? await cuotaDelProveedor({ accountToken, projectId, ...(fetchImpl ? { fetchImpl } : {}), ...(url ? { url } : {}) })
    : { ok: false, motivo: 'no hay ACCOUNT_TOKEN: no le pregunté la cuota al proveedor' }

  if (proveedor.ok) {
    const d = decidir({ usadas: proveedor.usadas, pedido, limite: proveedor.limite, reserva })
    return {
      ...d,
      ventana: proveedor.ventana,
      fuente: 'proveedor',
      motivo: `${d.motivo} — ${proveedor.motivo}${proveedor.estado ? `, suscripción ${proveedor.estado}` : ''}`,
    }
  }

  const ventana = ventanaDe(fecha)
  const usadas = contarEnVentana(await leerUso(archivo), ventana)
  const d = decidir({ usadas, pedido, limite, reserva })
  return {
    ...d,
    ventana,
    fuente: 'local',
    motivo: `${d.motivo} — CONTADOR LOCAL APROXIMADO (${proveedor.motivo}): cuenta lo gastado por esta máquina `
      + 'sobre el mes calendario, que no es el período de facturación de AfipSDK.',
  }
}

// ── LA CREDENCIAL ────────────────────────────────────────────────────────────────────────────────

/** El endpoint que la descarga usa DE VERDAD. La sonda tiene que probarse contra éste, y por POST. */
export const URL_SONDA = 'https://app.afipsdk.com/api/v1/automations'

/** El cuerpo deliberadamente inválido. No nombra ninguna automatización: no puede crear nada. */
export const CUERPO_SONDA = {}

/**
 * NÚCLEO PURO: qué significa el status que devolvió la sonda.
 *
 * Tres respuestas, no dos. `verificada` dice si el servidor se pronunció sobre ESTE token; `ok` dice
 * si se puede seguir. Un "no sé" sigue (ok) pero no está verificado — y esa diferencia es la que hace
 * diez días de silencio cuando se la borra.
 *
 * @returns {{ok:boolean, verificada:boolean, motivo:string}}
 */
export function leerSonda({ status, cuerpo = '', url = URL_SONDA } = {}) {
  const eco = String(cuerpo ?? '').replace(/\s+/g, ' ').slice(0, 200)
  const donde = `POST ${url} con cuerpo vacío`
  if (status === 401) {
    return {
      ok: false,
      verificada: true,
      motivo: `${donde} → 401: AfipSDK rechaza el ACCESS_TOKEN. Respondió: ${eco}. `
        + 'Es la misma llamada que hace la descarga real, así que este 401 sí prueba que el token no sirve. '
        + 'Se renueva en app.afipsdk.com (Rotar access token del proyecto) y se guarda en ACCESS_TOKEN. '
        + 'No disparo la descarga: sería quemar la corrida contra un token muerto.',
    }
  }
  if (status === 400 || status === 422) {
    return {
      ok: true,
      verificada: true,
      motivo: `${donde} → ${status} de validación de campos: la petición PASÓ autenticación y murió en el `
        + `cuerpo, que es exactamente lo que se buscaba. El ACCESS_TOKEN sirve. Respondió: ${eco}`,
    }
  }
  if (status >= 200 && status < 300) {
    return {
      ok: true,
      verificada: true,
      motivo: `${donde} → ${status}. El token autentica, pero el contrato cambió: se esperaba un 400 de `
        + `validación y contestó ${status}. Revisar que la sonda siga sin crear nada. Respondió: ${eco}`,
    }
  }
  return {
    ok: true,
    verificada: false,
    motivo: `${donde} → ${status ?? 'sin respuesta'}: NO SÉ si la credencial sirve. Eso no es lo mismo que `
      + `"no sirve", así que no aborto por esto. Respondió: ${eco}`,
  }
}

/**
 * ¿La credencial sigue sirviendo? Preflight con LA MISMA CERRADURA QUE SE VA A USAR.
 *
 * `POST /api/v1/automations` con cuerpo vacío: el mismo verbo y el mismo endpoint que la descarga
 * real, que es la única forma de que este control mida el efecto que le importa. La versión anterior
 * sondeaba por GET —un verbo que ese endpoint contesta 401 siempre— y por eso declaró muerta una
 * credencial sana durante diez días.
 *
 * NO CONSUME CUOTA: sin `automation` en el cuerpo el servidor rechaza en validación y no crea nada
 * (mismo criterio que `arca-sync-resultado.mjs::consumioCuota` — una creación 4xx no gastó nada).
 *
 * FALLA ABIERTO SALVO EN EL 401. Un 500, un timeout o un contrato que cambie no prueban que el token
 * esté mal. El token nunca se imprime: sólo viaja en el header.
 */
export async function credencialAceptada({ token, fetchImpl = fetch, url = URL_SONDA } = {}) {
  if (!token) {
    return { ok: false, status: null, verificada: true, motivo: 'no hay ACCESS_TOKEN de AfipSDK para probar' }
  }
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(CUERPO_SONDA),
    })
    // El cuerpo es la EVIDENCIA de qué contestó el servidor, pero no poder leerlo no puede cambiar la
    // lectura del status: un 401 sigue siendo un 401 aunque el eco venga vacío.
    let cuerpo = ''
    try { cuerpo = await res.text() } catch { cuerpo = '(no pude leer el cuerpo de la respuesta)' }
    return { status: res.status, ...leerSonda({ status: res.status, cuerpo, url }) }
  } catch (e) {
    return {
      ok: true,
      status: null,
      verificada: false,
      motivo: `no pude sondear la credencial (${e.message}); sigo, porque no poder preguntar no prueba que el token esté mal`,
    }
  }
}
