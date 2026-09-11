// LAS CONSTANTES DE LA CARTERA DEL CRM — cortes de ancho y tonos.
//
// Hasta el 11/09/2026 acá vivían también `Cobrado` (la barra del cobro en BRUTO contra el contrato
// × 1,21), `ContratadoDeObra` y `OrdenesDelTrabajo`. Se fueron con la tabla de cinco columnas: la
// barra vive en `CeldasDeContrato.tsx` y mide NETO contra NETO, y dos definiciones del mismo avance
// en la misma carpeta es la trampa que ya se pagó (auditor, 11/09/2026).

/** El detalle contractual: materiales y mano de obra. `25v2:154`. */
export const SOLO_ANCHO = 'max-[1249px]:hidden'
/** Debajo de 768px quedan quién es y por cuánto: el avance se suelta. */
export const SOLO_TABLET = 'max-[767px]:hidden'
/** El tono de los divisores y la pista de las barras. */
export const TONO = { divisorObra: '#F3F2EE', pista: '#EDECE8', textoObra: '#3A3A38' } as const
