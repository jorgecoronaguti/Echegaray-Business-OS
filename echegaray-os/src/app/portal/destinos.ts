// LOS DESTINOS DEL PORTAL — cinco, y uno que todavía no.
//
// Vive en su propio archivo y no adentro del componente porque es la única definición de qué puede
// ver un cliente. Una pantalla que no está acá no existe para él, y eso se prueba (`destinos.test.ts`)
// en vez de confiarse: agregar un destino al portal es una decisión de producto, no un renglón de JSX.

export type Destino = {
  /** El segmento de la URL. `''` es la raíz del portal. */
  href: string
  rotulo: string
  /** El icono se resuelve en el componente: acá no hay JSX, para que esto sea probable con node --test. */
  icono: 'inicio' | 'pagos' | 'facturas' | 'documentos' | 'terminadas' | 'avance'
  /** Presente pero apagado. Se dibuja en gris y no navega. */
  masAdelante?: true
}

export const DESTINOS: readonly Destino[] = [
  { href: '/portal', rotulo: 'Inicio', icono: 'inicio' },
  { href: '/portal/pagos', rotulo: 'Pagos', icono: 'pagos' },
  { href: '/portal/facturas', rotulo: 'Facturas', icono: 'facturas' },
  { href: '/portal/documentos', rotulo: 'Documentos', icono: 'documentos' },
  // TERMINADAS QUEDA FRENADA (26/08/2026, decisión del dueño: «es confuso lo de terminadas,
  // bloquear esto por ahora»). Y es confuso por un motivo real, no de rótulo: una obra terminada se
  // decide por `obras.estado = 'cerrada'` en `public.obras`, mientras que el cronograma vive en
  // `obra_canonica` — dos registros de obra distintos y sin mapeo entre ellos. La pantalla mostraba
  // «0 obras» a clientes que sí tienen obras terminadas, o al revés.
  //
  // Se marca `masAdelante` en vez de borrarse: el rótulo sigue a la vista, en gris y sin enlace, para
  // que el cliente sepa que va a estar. Esconderlo lo convertiría en una sorpresa, y borrar la ruta
  // rompería los enlaces que ya se compartieron — sigue respondiendo si se la escribe.
  { href: '/portal/terminadas', rotulo: 'Terminadas', icono: 'terminadas', masAdelante: true },
  // Se enchufa cuando exista el módulo de Obras. Se dibuja igual: que el cliente vea que viene es
  // parte del acuerdo, esconderlo lo convertiría en una sorpresa.
  { href: '/portal/avance', rotulo: 'Avance', icono: 'avance', masAdelante: true },
]

/** Los cinco que navegan. El menú del teléfono es exactamente esto. */
export const NAVEGABLES = DESTINOS.filter((d) => !d.masAdelante)

/** La raíz del portal. Es el único destino que NO acepta subrutas. */
export const RAIZ = '/portal'

/**
 * Cuál de los destinos está activo para una ruta.
 *
 * `/portal` es prefijo de TODOS los demás. Con un `startsWith` pelado queda siempre encendido y el
 * menú marca dos; y en `/portal/avance` —que no es navegable— marcaría Inicio, que es peor: el
 * cliente ve resaltado un lugar donde no está. Entonces la raíz calza SÓLO exacta, y entre los demás
 * gana el más largo (`/portal/terminadas/<obra>` es Terminadas, no Inicio).
 */
export function destinoActivo(ruta: string): Destino | null {
  const limpia = ruta.replace(/\/+$/, '') || RAIZ
  let mejor: Destino | null = null
  for (const d of NAVEGABLES) {
    const calza = d.href === RAIZ ? limpia === RAIZ : limpia === d.href || limpia.startsWith(`${d.href}/`)
    if (calza && (!mejor || d.href.length > mejor.href.length)) mejor = d
  }
  return mejor
}
