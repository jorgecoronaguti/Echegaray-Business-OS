// ¿ESTO ES UN TELÉFONO? — la única definición, compartida por las caras que ramifican por dispositivo.
//
// Nació en `features/administracion/services/vistaDeAsistencia.ts` para elegir entre la carga del
// día y la grilla de quincena. El 23/09/2026 la necesitó también el inicio del jefe de obra
// (`destinoDeLaHome`: en el teléfono su inicio es `/obra/hoy`, en escritorio sigue en
// Administración), y una feature no importa de otra: lo compartido vive acá.
//
// ═══ LA TRAMPA DE MIRAR EL USER-AGENT ═══
//
// Ramificar por User-Agent es peligroso cuando hay caché: el HTML de escritorio queda guardado y se
// le sirve a un teléfono. Las rutas que usan esto son `force-dynamic` o redirects calculados por
// petición, sin caché compartida. Si alguna deja de serlo, esta función tiene que volver a discutirse.

/** El `sec-ch-ua-mobile` de los navegadores basados en Chromium: `?1` teléfono, `?0` escritorio. */
const PISTA_CHROMIUM = '?1'

/** Lo que mandan los que NO tienen client hints: Safari de iPhone/iPad y Firefox de Android. */
const PISTA_UA = /Mobi|Android|iPhone|iPod|iPad/i

/**
 * `sec-ch-ua-mobile` primero porque es la respuesta declarada por el navegador; el User-Agent es el
 * respaldo para los que no la mandan. Ante el silencio de las dos, ESCRITORIO: equivocarse hacia lo
 * conocido es más barato que equivocarse hacia lo nuevo.
 */
export function pareceTelefono(
  chUaMobile: string | null | undefined, userAgent: string | null | undefined,
): boolean {
  const ch = (chUaMobile ?? '').trim()
  if (ch === PISTA_CHROMIUM) return true
  if (ch !== '') return false
  return PISTA_UA.test(userAgent ?? '')
}

/** La misma pregunta, hecha a los encabezados de la petición (`headers()` de Next o un `Request`). */
export function pareceTelefonoSegun(cabeceras: { get(nombre: string): string | null } | null | undefined): boolean {
  return pareceTelefono(cabeceras?.get('sec-ch-ua-mobile'), cabeceras?.get('user-agent'))
}
