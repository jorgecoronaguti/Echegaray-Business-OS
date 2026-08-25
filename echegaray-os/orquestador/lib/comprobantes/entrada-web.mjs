// QUÉ LE PASÓ AL COMPROBANTE QUE ALGUIEN SUBIÓ DESDE LA PANTALLA — la regla, sin base ni red.
//
// La pantalla 24 encola un archivo y el worker lo procesa con el MISMO circuito que el bot de
// Mattermost. Lo que el circuito devuelve es un mensaje de chat (`{estado, texto, parte}`) pensado
// para leerse en un hilo; lo que la pantalla necesita es un estado corto por archivo. Traducir uno
// en otro es una decisión de negocio y por eso vive acá, pura y con test:
//
//   · «cargado» sólo si SE ESCRIBIÓ una fila. El circuito devuelve `estado='cargado'` también
//     cuando no escribió nada porque el comprobante YA ESTABA en Compras (ver `escritura.mjs`,
//     rama `!entran.length`). Los dos son buenas noticias y son distintos: uno agregó plata al
//     libro y el otro confirmó que no hacía falta. Confundirlos haría que la pantalla dijera
//     «cargado» sobre una tanda que no movió un peso, que es la forma más cara de mentir en verde.
//   · «en_espera» NO es un error. El freno de mano de Sheets puesto, un proveedor fuera del
//     desplegable o un dato ilegible dejan al comprobante VIVO esperando una persona. Marcarlo
//     error invitaría a reintentarlo, y reintentar gasta visión para llegar al mismo lugar.
//   · «rechazado» es terminal. La puerta dijo que no o el papel no se lee: el mismo archivo va a
//     dar el mismo resultado. Reintentar es quemar tokens.
//   · «error» es lo único reintentable, y con tope. Una base caída, un timeout, la migración sin
//     aplicar: cosas que se arreglan solas o con una acción de Dirección.

import { ESTADO } from './fajo.mjs'

/** Los estados de una fila de `public.comprobante_entrada`. El CHECK de la tabla es esta lista. */
export const ENTRADA = Object.freeze({
  PENDIENTE: 'pendiente',
  PROCESANDO: 'procesando',
  CARGADO: 'cargado',
  YA_ESTABA: 'ya_estaba',
  EN_ESPERA: 'en_espera',
  RECHAZADO: 'rechazado',
  ERROR: 'error',
})

/** Cuántas veces se vuelve a intentar un archivo que falló por algo técnico. */
export const MAX_INTENTOS = 3

/** Estados en los que el archivo ya no espera nada del worker. */
const TERMINALES = new Set([ENTRADA.CARGADO, ENTRADA.YA_ESTABA, ENTRADA.RECHAZADO])

/**
 * ¿Este resultado se puede volver a intentar?
 *
 * Sólo `error`, y sólo mientras queden intentos. `en_espera` NO se reintenta: está esperando a una
 * persona, no a la red — un reintento le pasaría por encima y volvería a leer la misma foto.
 */
export function reintentable(estado, intentos = 0) {
  return estado === ENTRADA.ERROR && Number(intentos) < MAX_INTENTOS
}

/** ¿Terminó? Lo usa la pantalla para dejar de refrescar. */
export function terminal(estado) {
  return TERMINALES.has(estado)
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const recorte = (t, max = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null

/**
 * La primera línea útil del mensaje del bot, para mostrarla como motivo en la pantalla.
 *
 * El texto del circuito es markdown pensado para un hilo de chat: encabezados en negrita, renglones
 * de rendición, emojis. Se toma el primer renglón con contenido y se le sacan los asteriscos. No se
 * reescribe: lo que el OS le dice al dueño por chat y lo que le dice por pantalla tienen que ser la
 * misma frase, o son dos verdades del mismo hecho.
 */
export function motivoDelTexto(texto) {
  const linea = String(texto ?? '').split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  return recorte(linea?.replace(/\*\*/g, '').replace(/^[🧊✔⚠📊_]+\s*/u, ''))
}

/**
 * De la salida del circuito compartido al estado de la fila de la cola.
 *
 * @param {{estado?:string, texto?:string, fajoId?:string, parte?:object}} salida lo que devolvió
 *        `procesarComprobantes` (que es lo que devuelve `procesarPost`).
 * @returns {{estado:string, motivo:string|null, cargados:number, yaEstaban:number, suma:number}}
 */
export function estadoDeEntrada(salida = {}) {
  const parte = salida?.parte ?? {}
  const base = {
    cargados: n(parte.cargados),
    yaEstaban: n(parte.yaEstaban),
    suma: n(parte.suma),
    motivo: motivoDelTexto(salida?.texto),
  }
  const e = String(salida?.estado ?? '').trim()

  if (e === 'cargado') {
    if (base.cargados > 0) return { ...base, estado: ENTRADA.CARGADO }
    if (base.yaEstaban > 0) return { ...base, estado: ENTRADA.YA_ESTABA }
    // Cerró como «cargado» sin escribir ni reconocer nada previo. No se afirma que entró: se deja
    // esperando con lo que el circuito haya dicho. Un «cargado» sin fila es lo que costó el tique
    // de Combustibles Barcelo del 03/08.
    // El motivo del circuito se DESCARTA acá a propósito: dice «✔ Cargado.», que es justo lo que
    // no se pudo verificar. Repetirlo sería publicar la afirmación que este ramo existe para frenar.
    return { ...base, estado: ENTRADA.EN_ESPERA, motivo: 'no quedó constancia de en qué fila de Compras entró' }
  }
  if (e === 'encolado') {
    return { ...base, estado: ENTRADA.EN_ESPERA, motivo: base.motivo ?? 'la escritura de Sheets está congelada' }
  }
  if (e === 'confirmar') {
    // «Confirmar» con TODO ya cargado no es esperar a nadie: el circuito reconoció el duplicado y
    // de paso preguntó la obra (en el chat es un diálogo; en la web nadie contesta). Prueba real
    // 25/08: Barcelo 0113-00014607 quedó «Falta algo» con el fajo abierto cuando el propio texto
    // decía «No hay nada que cargar». Si no cargó ninguno y todos ya estaban, ya estaba.
    if (base.cargados === 0 && base.yaEstaban > 0) return { ...base, estado: ENTRADA.YA_ESTABA }
    return { ...base, estado: ENTRADA.EN_ESPERA, motivo: base.motivo ?? 'falta un dato para poder cargarlo' }
  }
  if (e === 'ilegible' || e === 'demasiados' || e.startsWith('rechazado_')) {
    return { ...base, estado: ENTRADA.RECHAZADO }
  }
  // `error`, `sin_esquema`, `sin_adjuntos` y cualquier estado que el circuito agregue mañana: se
  // trata como falla técnica reintentable. Un estado desconocido nunca se declara éxito.
  return { ...base, estado: ENTRADA.ERROR, motivo: base.motivo ?? `el circuito devolvió «${e || 'nada'}»` }
}

/** El veredicto de una fila que falló por una EXCEPCIÓN (no por el circuito): siempre técnico. */
export function estadoDeExcepcion(error) {
  return {
    estado: ENTRADA.ERROR,
    motivo: recorte(String(error?.message ?? error), 300) ?? 'falló sin decir por qué',
    cargados: 0, yaEstaban: 0, suma: 0,
  }
}

/**
 * El estado que se ESCRIBE en la fila, ya contando el intento que acaba de gastarse.
 *
 * Separado del veredicto a propósito: el veredicto dice QUÉ pasó (y eso no depende de cuántas veces
 * se intentó), y esto dice qué hacer con eso. Mezclarlos haría que el mismo hecho —«la base no
 * contestó»— se guardara como dos estados distintos según el contador, y el motivo dejaría de
 * poder compararse entre filas.
 *
 * @param {{estado:string, motivo:string|null}} veredicto
 * @param {number} intentos los intentos YA gastados, incluido éste.
 */
export function aplicarReintento(veredicto, intentos = 1) {
  if (!reintentable(veredicto?.estado, intentos)) return veredicto
  return { ...veredicto, estado: ENTRADA.PENDIENTE }
}

/**
 * EL VEREDICTO DEL LOTE, REPARTIDO ARCHIVO POR ARCHIVO.
 *
 * ═══ POR QUÉ NO ES UN `map` ═══
 *
 * El circuito trabaja por TANDA: cinco fotos subidas juntas son un fajo y devuelven un solo
 * resultado. Pero dentro de esa tanda un archivo puede haber salido ilegible y los otros cuatro
 * haber entrado perfecto. Pintar los cinco iguales sería mentir en las dos direcciones: cuatro
 * ✔ falsos, o cuatro ✖ falsos.
 *
 * Lo que el circuito informa por archivo (`parte.ilegibles`, `parte.trabados`) viene identificado
 * por NOMBRE, no por id — es el nombre que la persona ve en su teléfono. Cuando dos archivos del
 * mismo lote se llaman igual, el nombre deja de identificar y **no se adivina**: los dos se quedan
 * con el veredicto del lote y el motivo dice que no se puede afirmar cuál fue. Elegir uno sería
 * marcar como rechazado un comprobante que quizás entró.
 */
export function repartirVeredicto(filas = [], veredicto = {}, parte = {}) {
  const cuantas = new Map()
  for (const f of filas) cuantas.set(f.nombre_archivo, (cuantas.get(f.nombre_archivo) ?? 0) + 1)

  const porNombre = new Map()
  for (const t of parte?.trabados ?? []) porNombre.set(t?.nombre, { estado: ENTRADA.EN_ESPERA, motivo: recorte(t?.motivo) })
  // Lo ilegible pisa a lo trabado: un archivo que no se pudo mirar no está esperando a nadie.
  for (const i of parte?.ilegibles ?? []) porNombre.set(i?.nombre, { estado: ENTRADA.RECHAZADO, motivo: recorte(i?.motivo) })

  return filas.map((f) => {
    const propio = porNombre.get(f.nombre_archivo)
    if (!propio) return { id: f.id, ...veredicto }
    if (cuantas.get(f.nombre_archivo) === 1) {
      return { ...veredicto, ...propio, id: f.id, motivo: propio.motivo ?? veredicto.motivo }
    }
    const ambiguo = `hay ${cuantas.get(f.nombre_archivo)} archivos llamados «${f.nombre_archivo}» en esta carga: `
      + `${propio.estado === ENTRADA.RECHAZADO ? 'uno no se pudo leer' : 'uno quedó esperando'} y no puedo afirmar cuál`
    return { id: f.id, ...veredicto, motivo: [veredicto.motivo, ambiguo].filter(Boolean).join(' · ') }
  })
}

/**
 * QUÉ HACER CON EL FAJO CUANDO LA FILA WEB YA TIENE VEREDICTO.
 *
 * ═══ EL DEFECTO (prueba real 25/08) ═══
 *
 * El circuito es el mismo para las dos puertas, pero el que CIERRA el fajo no siempre es él: por
 * chat, un fajo que vuelve como `confirmar` queda ABIERTO a propósito, esperando que una persona
 * toque Confirmar / Corregir / Descartar en el hilo. En la web ese hilo no existe y nadie contesta
 * nunca. Resultado medido: la fila de `comprobante_entrada` cerraba en `ya_estaba` con su
 * `cerrado_at`, y el fajo quedaba `estado='abierto'`, `cerrado_at null`, `filas null` — un fajo vivo
 * con sus ítems YA cargados en Compras (fajos 6569dd6d… y 64d7e5da…). Además de la basura, un fajo
 * abierto es el que `entraEnElFajo` va a reusar: la carga siguiente de esa persona se agrega a algo
 * que ya se resolvió.
 *
 * Esta función es la traducción, y es pura para poder probarla sin base. No inventa estados: usa los
 * mismos que escribe el bot, con su significado.
 *
 *   · `cargado`   → ESTADO.CARGADO. Normalmente `escritura.mjs` ya lo cerró con sus `filas`; esto es
 *                   la red por si quedó abierto (por eso quien llama cierra sólo si sigue abierto:
 *                   pisar un fajo ya cerrado le borraría las filas escritas).
 *   · `ya_estaba` → ESTADO.CARGADO con `filas: []`. Es LITERALMENTE la convención del bot cuando no
 *                   entró ninguno porque todos ya estaban (`escritura.mjs`, rama `!entran.length`).
 *                   No es `descartado`: no se tiró nada, el gasto está en Compras.
 *   · `rechazado` → ESTADO.DESCARTADO, igual que el botón Descartar y que el fajo vencido.
 *   · `error`     → ESTADO.ERROR, y sólo cuando ya no quedan reintentos (`aplicarReintento` convierte
 *                   el error reintentable en `pendiente`, y de ahí sale `null`).
 *   · `en_espera` → `null`: NO se cierra. El comprobante está vivo esperando a una persona —el freno
 *                   de Sheets, un proveedor fuera del desplegable, una obra que falta— y cerrarle el
 *                   fajo sería tirar los ítems que esa persona todavía puede completar.
 *   · `pendiente`/`procesando` → `null`: el lote vuelve a la cola y el próximo intento reusa el
 *                   MISMO fajo abierto (mismo canal = mismo lote). Cerrarlo obligaría a releer todo.
 *
 * @param {string} estadoFila el estado que se va a ESCRIBIR en la fila (ya pasado por `aplicarReintento`).
 * @param {{motivo?:string|null}} [o]
 * @returns {{estado:string, filas:Array|null, error:string|null}|null} `null` = el fajo sigue abierto.
 */
export function cierreDelFajo(estadoFila, { motivo = null } = {}) {
  switch (estadoFila) {
    case ENTRADA.CARGADO:
      return { estado: ESTADO.CARGADO, filas: null, error: null }
    case ENTRADA.YA_ESTABA:
      return { estado: ESTADO.CARGADO, filas: [], error: recorte(motivo) ?? 'ya estaban cargados' }
    case ENTRADA.RECHAZADO:
      return { estado: ESTADO.DESCARTADO, filas: null, error: recorte(motivo) ?? 'no se pudo leer' }
    case ENTRADA.ERROR:
      return { estado: ESTADO.ERROR, filas: null, error: recorte(motivo) ?? 'falló sin decir por qué' }
    default:
      return null
  }
}
