// LA PILA DE DESHACER DE LA PLATAFORMA — pura: sin React, sin base, sin navegador.
//
// Dueño, 15/09/2026: *«tendria q funcionar el cmd + z (ctrl +z en windows) para deshacer cambio en la plataforma»*
// y *«Deshacer con Cmd/Ctrl+Z … en TODA la plataforma»*. Cada guardado exitoso apila un paso; Cmd/Ctrl+Z con el
// foco FUERA de un input lo deshace llamando a la MISMA acción del servidor con el valor anterior. El proveedor
// (`src/shared/components/deshacer/DeshacerProvider.tsx`) sólo conecta esto con el teclado y la pantalla.
//
// ═══ QUÉ PASA AL CAMBIAR DE PANTALLA (decisión documentada) ═══
//
// Cada paso guarda la RUTA COMPLETA donde se editó (path + query: la quincena, la obra, el filtro). Se deshace
// sólo lo que está en la pantalla actual: un Cmd+Z que modifique un valor que no se ve sería un cambio a ciegas.
// Al cambiar de path se descartan los pasos de otras rutas; al deshacer se vuelve a mirar la ruta completa.
//
// ═══ CONFLICTO ═══
//
// Si el valor que se ve ya no es el que se guardó (otra persona lo editó, o llegó otra lectura), no se pisa: se
// avisa «la celda la cambió otra persona: no se deshizo» y el paso se descarta.
//
// ═══ QUÉ SUPERFICIES ESTÁN PROTEGIDAS POR EL SERVIDOR, Y CUÁLES NO (auditoría, 18/09/2026) ═══
//
// Acá decía que TODA escritura de deshacer viajaba con `esperado` y que el servidor comprobaba contra la base.
// Era falso, y una afirmación más grande que lo protegido es peor que no afirmar nada: el auditor encontró
// nueve superficies que registran pasos SIN `esperado`, y tres de ellas tampoco registraban `useCeldaViva`, así
// que `hayConflicto` recibía `undefined` y no frenaba nada — ni pantalla ni servidor.
//
// Lo que hoy es cierto, celda por celda:
//
//   · CON `esperado` COMPROBADO DENTRO DE LA ESCRITURA (no hay ventana): actividad y estado del pedido, campo
//     de partida, rol del documento (`actualizarSiSigueIgual`), obra de una compra (su RPC lo hace en la base)
//     y las dos celdas de Liquidación.
//   · CON `esperado` COMPROBADO CONTRA UNA LECTURA FRESCA DEL SERVIDOR, no atómica: horas del día, obra de la
//     persona y tarifa de la quincena. La escritura de esas tres no es un `update` sobre una celda —son tramos
//     de asignación y jornadas—, así que queda una ventana chica entre leer y escribir. Está dicho en cada una.
//   · SIN COMPROBACIÓN DE SERVIDOR: el resto de los consumidores de `InlineEdit` que pasan un `guardar` de un
//     solo argumento, y `FormularioParte`. Ahí frena sólo la celda viva (la pantalla), y por eso esos pasos
//     NUNCA pueden escribir un vacío: ver `protegido` y `motivoParaNoRestaurar`.
//
// ═══ NUNCA SE VACÍA UNA CELDA (auditoría del 18/09/2026) ═══
//
// Regla de la casa: ninguna escritura puede vaciar una celda cargada por otra persona. Un paso cuyo valor
// anterior es `''` no tiene nada que restaurar: deshacerlo escribiría NULL, y si ese `''` era una pantalla
// atrasada —otra persona había cargado la celda y este control no lo había visto— el NULL borra lo ajeno. Se
// vio en Pedidos: otra persona asignó la actividad X, el refresco llegó pero el select seguía en `''`, esta
// persona eligió Y y Cmd+Z dejó la celda en NULL. Por eso deshacer hacia `''` se rechaza en la plataforma,
// con el mismo aviso que ya tenía `CeldaTarifa`: «no había un valor anterior que restaurar».
//
// La única excepción es declarada por la celda (`vacioRestaurable`): cuando `''` NO deja la celda vacía sino
// que la devuelve a un valor calculado (Liquidación: «sin corrección manual») y el servidor verifica
// `esperado`. Ahí el vacío es un estado con contenido, no una celda borrada.

import { leerNumeroEsAR } from './numeroEsAR.ts'

export const LIMITE_DE_PASOS = 50
export const MENSAJE_CONFLICTO = 'la celda la cambió otra persona: no se deshizo'
export const MENSAJE_SIN_ANTERIOR = 'no había un valor anterior que restaurar: no se deshizo'
/** Rehacer un vaciado en una celda que no avisa si otra mano la tocó: no se vacía a ciegas. */
export const MENSAJE_SIN_RESGUARDO = 'esta celda no puede comprobar quién la cambió: no se vació'

export interface PasoDeEdicion {
  id: string
  /** Qué celda o campo (el mismo en cada guardado de esa celda). */
  clave: string
  /** Cómo se nombra en el aviso: «Banco de Rosales». */
  rotulo: string
  /** Path + query donde se editó. */
  ruta: string
  /** Valor antes del guardado. `''` = vacío / sin corrección manual (vuelve al calculado). */
  anterior: string
  nuevo: string
  anteriorTexto: string
  nuevoTexto: string
  /**
   * `''` es un valor con contenido para esta celda (vuelve al calculado) y el servidor verifica `esperado`.
   * Sin esto, deshacer hacia `''` se rechaza: sería vaciar la celda.
   */
  vacioRestaurable?: boolean
  /**
   * LA SUPERFICIE MANDA `esperado` Y EL SERVIDOR LO COMPRUEBA. Sin esto, la única guarda es la pantalla, que
   * puede estar atrasada: entonces tampoco se REHACE hacia vacío (ver `motivoParaNoRestaurar`).
   */
  protegido?: boolean
}

export interface PilaDeDeshacer {
  deshacer: PasoDeEdicion[]
  rehacer: PasoDeEdicion[]
}

export type AccionDeDeshacer = 'deshacer' | 'rehacer'

export const pilaVacia = (): PilaDeDeshacer => ({ deshacer: [], rehacer: [] })

/** Un guardado nuevo: se apila (máximo 50) y lo que había para rehacer se pierde. Sin cambio real, no se apila. */
export function apilar(p: PilaDeDeshacer, paso: PasoDeEdicion): PilaDeDeshacer {
  if (paso.anterior === paso.nuevo) return p
  return { deshacer: [...p.deshacer, paso].slice(-LIMITE_DE_PASOS), rehacer: [] }
}

export function tomarParaDeshacer(p: PilaDeDeshacer): { paso: PasoDeEdicion; pila: PilaDeDeshacer } | null {
  const paso = p.deshacer.at(-1)
  if (!paso) return null
  return { paso, pila: { deshacer: p.deshacer.slice(0, -1), rehacer: [...p.rehacer, paso].slice(-LIMITE_DE_PASOS) } }
}

export function tomarParaRehacer(p: PilaDeDeshacer): { paso: PasoDeEdicion; pila: PilaDeDeshacer } | null {
  const paso = p.rehacer.at(-1)
  if (!paso) return null
  return { paso, pila: { deshacer: [...p.deshacer, paso].slice(-LIMITE_DE_PASOS), rehacer: p.rehacer.slice(0, -1) } }
}

/** Saca un paso de las dos pilas (conflicto, o ya no está en pantalla). */
export function quitarPaso(p: PilaDeDeshacer, id: string): PilaDeDeshacer {
  return { deshacer: p.deshacer.filter((x) => x.id !== id), rehacer: p.rehacer.filter((x) => x.id !== id) }
}

/** Sólo quedan los pasos de la pantalla actual. */
export function sinPasosDeOtraRuta(p: PilaDeDeshacer, ruta: string): PilaDeDeshacer {
  return { deshacer: p.deshacer.filter((x) => x.ruta === ruta), rehacer: p.rehacer.filter((x) => x.ruta === ruta) }
}

/**
 * ¿El valor que se ve ya no es el que se espera? `actual` indefinido = no hay celda viva que mirar: decide el
 * servidor (o se aplica).
 */
export function hayConflicto(actual: string | undefined, esperado: string): boolean {
  return actual !== undefined && actual !== esperado
}

/**
 * ¿POR QUÉ NO SE PUEDE ESCRIBIR EL DESTINO DE ESTE PASO? `null` = se puede.
 *
 * DESHACER hacia `''` no se escribe: no había valor anterior que restaurar, y si ese `''` venía de una pantalla
 * atrasada el NULL borra lo que cargó otro.
 *
 * REHACER hacia `''` tampoco, MIENTRAS LA SUPERFICIE NO MANDE `esperado` (auditoría, 18/09/2026). La cadena que
 * lo encontró: celda de horas con X → alguien la vacía → Cmd+Z la bloquea → otra persona escribe Z → Cmd+Y
 * escribía el vacío encima de Z. En una superficie protegida sí se rehace: el servidor rechaza si la celda
 * cambió, así que el vacío sólo cae sobre lo que esta misma persona dejó.
 *
 * La excepción de siempre es `vacioRestaurable`: ahí `''` no vacía la celda, la devuelve a su valor calculado.
 */
export function motivoParaNoRestaurar(accion: AccionDeDeshacer, paso: PasoDeEdicion): string | null {
  if (paso.vacioRestaurable) return null
  const destino = accion === 'deshacer' ? paso.anterior : paso.nuevo
  if (destino !== '') return null
  if (accion === 'deshacer') return MENSAJE_SIN_ANTERIOR
  return paso.protegido ? null : MENSAJE_SIN_RESGUARDO
}

/**
 * LA COMPROBACIÓN, EN MEMORIA: ¿lo que hay hoy en la base es lo que esta persona vio (`esperado`)? NULL y `''`
 * son el mismo vacío; un número se compara como número (la pantalla dibuja «123,5» y la base guarda 123.5);
 * el texto, sin espacios en las puntas.
 *
 * ESTA FUNCIÓN NO ES LA QUE PROTEGE LA ESCRITURA. Comparar acá y escribir después deja una ventana entre las
 * dos: dos personas que deshacen en el mismo instante leen lo mismo, las dos pasan, y la segunda pisa a la
 * primera — que es el defecto que este archivo existe para impedir, con otro disfraz. La comparación efectiva
 * viaja DENTRO del `update` (`valorParaElFiltro` + `actualizarSiSigueIgual`). Esto queda para las pruebas y
 * para explicar la regla.
 */
export function coincideConLoEsperado(hoy: unknown, esperado: string): boolean {
  const exigido = valorParaElFiltro(esperado, typeof hoy === 'number' ? 'numero' : 'texto')
  if (typeof exigido === 'number' && !Number.isFinite(exigido)) return false
  // `''` y NULL son el mismo vacío. Un texto vacío guardado en la base (no debería haberlo, pero la regla no
  // puede depender de eso) cuenta como vacío: el filtro del `where` lo busca con las dos formas.
  if (exigido === null) return hoy == null || String(hoy) === ''
  if (hoy == null) return false
  return typeof hoy === 'number' ? hoy === exigido : String(hoy) === String(exigido)
}

/**
 * LA MISMA REGLA, PERO PARA EL `where` DE LA ESCRITURA — que es donde de verdad protege.
 *
 * EL FILTRO ES MÁS ESTRICTO QUE LA COMPARACIÓN EN MEMORIA, NUNCA AL REVÉS. El vacío se exige con `is null`
 * porque así lo guardan estas columnas; si alguna tuviera una cadena vacía, el `update` no la encontraría y
 * `coincideConLoEsperado` sí la daría por vacía. Esa asimetría es segura —jamás escribe de más— y lo único que
 * hay que cuidar es el MENSAJE: cuando divergen, quien no escribió no puede decir «la cambió otra persona»
 * (`actualizarSiSigueIgual` distingue los dos casos). Un test prueba las dos propiedades.
 *
 * Devuelve lo que hay que exigirle a la celda para que la escritura ocurra: `null` = «tiene que seguir vacía»
 * (se filtra con `is null`), un número para las columnas numéricas («123,5» → 123.5, y la base compara 123.50
 * como igual), o el texto tal cual. `NaN` = el esperado no es un número: ninguna fila puede cumplirlo, así que
 * la escritura no se intenta y se responde conflicto.
 *
 * LA IGUALDAD TIENE QUE SER LA MISMA QUE `coincideConLoEsperado`, o se rechazarían cambios legítimos por un
 * «123,5» contra 123.5. Un test ata las dos funciones caso por caso.
 */
export function valorParaElFiltro(esperado: string, tipo: 'texto' | 'numero' = 'texto'): string | number | null {
  const e = esperado.trim()
  if (e === '') return null
  if (tipo !== 'numero') return e
  // `leerNumeroEsAR` Y NO `Number(replace(',', '.'))` (auditoría, 18/09/2026): ese replace cambia UNA sola coma
  // y deja los puntos de miles, así que «1.234,5» daba NaN y la escritura se rechazaba con «la celda la cambió
  // otra persona» — una afirmación falsa sobre un número que nadie tocó. Es el mismo lector que usa la celda.
  const l = leerNumeroEsAR(e)
  return l.ok && l.valor != null ? l.valor : NaN
}

/**
 * EL ATAJO. Cmd/Ctrl+Z deshace; Cmd/Ctrl+Shift+Z y Cmd/Ctrl+Y rehacen. Con el foco dentro de un input, un textarea
 * o un contenido editable, NO se intercepta: ahí deshace el texto el navegador. Un `<select>` NO es editable
 * (18/09/2026): el navegador no tiene nada que deshacer en un desplegable, y como el foco se queda en él después
 * de elegir, Cmd+Z no hacía nada hasta clicar afuera.
 *
 * `Y` TAMBIÉN CON CMD (dueño, 17/09/2026: *«tiene que estar el rehacer en toda la plataforma»*). Hasta hoy `Cmd+Y`
 * caía al navegador y no rehacía nada; quien viene de Windows lo teclea igual en la Mac. `Cmd+A` NO se toca: es
 * «seleccionar todo» y robarlo rompe algo que todo el mundo usa.
 */
export function atajoDeDeshacer(e: {
  key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; enEditable: boolean
}): AccionDeDeshacer | null {
  if (e.enEditable || e.altKey || !(e.metaKey || e.ctrlKey)) return null
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'rehacer' : 'deshacer'
  if (k === 'y') return 'rehacer'
  return null
}

/**
 * CÓMO SE TECLEA REHACER, PARA ESCRIBIRLO EN EL AVISO. Dueño, 17/09/2026: el botón «Rehacer» ya estaba y nadie
 * sabía que además hay un atajo. Un atajo que no se dice no existe, así que el aviso lo dice cada vez que se
 * deshace algo — con el teclado de quien está mirando, no con el del que programó.
 */
export function textoDelAtajoDeRehacer(esMac: boolean): string {
  return esMac ? '\u2318\u21e7Z' : 'Ctrl+Shift+Z'
}

/** ¿Teclado de Mac? Se mira el userAgent/plataforma; fuera del navegador, no. */
export function esTecladoMac(plataforma: string | undefined): boolean {
  return /mac|iphone|ipad|ipod/i.test(plataforma ?? '')
}

export function destinoEditable(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false
  const t = (el.tagName ?? '').toUpperCase()
  return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable === true
}

/** «Deshecho: Banco de Rosales $250.000 → $230.240». */
export function textoDelAviso(accion: AccionDeDeshacer, paso: PasoDeEdicion): string {
  return accion === 'deshacer'
    ? `Deshecho: ${paso.rotulo} ${paso.nuevoTexto} → ${paso.anteriorTexto}`
    : `Rehecho: ${paso.rotulo} ${paso.anteriorTexto} → ${paso.nuevoTexto}`
}
