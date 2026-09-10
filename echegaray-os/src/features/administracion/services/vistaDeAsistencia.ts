// QUÉ VISTA DE ASISTENCIA SE DIBUJA: la carga del día (teléfono) o la grilla de quincena (escritorio).
//
// ═══ POR QUÉ SE DECIDE EN EL SERVIDOR Y NO CON `md:hidden` ═══
//
// La alternativa obvia era dibujar las dos y tapar una con CSS. Se descartó por lo que cuesta la
// que se tapa: `BloqueAsistenciaQuincena` lee la quincena entera —hasta 15 personas × 15 días— más
// las obras elegibles, y `BloqueAsistenciaDia` lee las obras con su gente asignada. Con CSS, cada
// vez que alguien abre esta pantalla en el teléfono el servidor paga las dos lecturas y manda el
// HTML de las dos por la red de la obra, para tirar la mitad. No es un ahorro cosmético: es la
// diferencia entre una consulta y seis.
//
// ═══ LA TRAMPA CLÁSICA DE MIRAR EL USER-AGENT, Y POR QUÉ ACÁ NO APLICA ═══
//
// Ramificar por User-Agent es peligroso cuando hay caché: el HTML de escritorio queda guardado y se
// le sirve a un teléfono. `/administracion/personas` es `force-dynamic` —se rearma en cada pedido y
// no hay caché compartida—, así que ese modo de fallar no existe en esta ruta. Si algún día deja de
// ser `force-dynamic`, esta función tiene que volver a discutirse.
//
// ═══ Y SI LA ADIVINANZA FALLA, HAY UNA PUERTA ═══
//
// `?modo=quincena` fuerza la grilla y `?modo=dia` fuerza la carga del día. La pantalla ofrece las
// dos como enlaces visibles, así que nadie queda encerrado en la vista equivocada por culpa de un
// navegador que no manda las pistas.

export type ModoAsistencia = 'dia' | 'quincena'

/** El `sec-ch-ua-mobile` de los navegadores basados en Chromium: `?1` teléfono, `?0` escritorio. */
const PISTA_CHROMIUM = '?1'

/** Lo que mandan los que NO tienen client hints: Safari de iPhone/iPad y Firefox de Android. */
const PISTA_UA = /Mobi|Android|iPhone|iPod|iPad/i

/**
 * ¿Esto es un teléfono?
 *
 * `sec-ch-ua-mobile` primero porque es la respuesta declarada por el navegador; el User-Agent es el
 * respaldo para los que no la mandan. Ante el silencio de las dos, ESCRITORIO: es lo que la
 * pantalla hacía hasta hoy, y equivocarse hacia lo conocido es más barato que equivocarse hacia lo
 * nuevo.
 */
export function pareceTelefono(
  chUaMobile: string | null | undefined, userAgent: string | null | undefined,
): boolean {
  const ch = (chUaMobile ?? '').trim()
  if (ch === PISTA_CHROMIUM) return true
  if (ch !== '') return false
  return PISTA_UA.test(userAgent ?? '')
}

/**
 * El modo final. Lo que pidió la URL le gana a la adivinanza SIEMPRE: quien escribió `?modo=` ya
 * dijo qué quiere ver, y una heurística que le discute a una decisión explícita es un error.
 */
export function modoDeAsistencia(
  modoPedido: string | null | undefined,
  chUaMobile: string | null | undefined,
  userAgent: string | null | undefined,
): ModoAsistencia {
  if (modoPedido === 'quincena' || modoPedido === 'dia') return modoPedido
  return pareceTelefono(chUaMobile, userAgent) ? 'dia' : 'quincena'
}

/** Lo que la solapa Asistencia lleva puesto y no puede perder al moverse dentro de sí misma. */
export interface EstadoAsistencia {
  quincena?: string
  q?: string
  modo?: string
  /** El recorte por obra: el RÓTULO del chip en la grilla, el id o el nombre en la carga del día. */
  obra?: string
}

/**
 * UN ENLACE DENTRO DE LA SOLAPA ASISTENCIA, CONSERVANDO LO QUE YA ESTABA PUESTO.
 *
 * Misma convención que `hrefSolapa` en Liquidación: un `undefined` en `cambios` BORRA ese
 * parámetro, y con eso se apaga un filtro con el mismo enlace que lo prendió.
 *
 * ═══ EL DEFECTO QUE ESTO EVITA ═══
 *
 * Los enlaces de esta solapa se armaban con `hrefAsistencia(quincena)`, que escribe la URL desde
 * cero. Con un filtro por obra puesto, tocar «‹ anterior» devolvía la empresa entera sin que nadie
 * lo pidiera —y lo mismo el buscador—: el recorte duraba hasta el primer clic. Cada parámetro que
 * se agregue a la vista tiene que entrar acá, o vuelve a caerse en el mismo lugar.
 */
export function hrefDeAsistencia(
  ruta: string,
  base: EstadoAsistencia,
  cambios: Record<string, string | undefined> = {},
): string {
  const actual: Record<string, string | undefined> = {
    quincena: base.quincena, q: base.q, modo: base.modo, obra: base.obra,
  }
  const params = new URLSearchParams({ vista: 'asistencia' })
  for (const [clave, valor] of Object.entries({ ...actual, ...cambios })) {
    // UN VALOR VACÍO NO ES UN PARÁMETRO. `?q=` en la URL no filtra nada y ensucia lo que se comparte.
    if (valor) params.set(clave, valor)
  }
  return `${ruta}?${params.toString()}`
}
