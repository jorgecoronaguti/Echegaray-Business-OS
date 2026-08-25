// EL ESQUEMA DE PAGO DE UN CLIENTE — lectura de la pantalla 32.
//
// ═══ STUB HASTA QUE ATERRICE back-28-32 ═══
//
// Firma del CONTRATO-28-32. Devuelve `null` —no un esquema vacío con contrato en cero— porque «no
// sé cuál es el esquema» y «este cliente no tiene pagos pactados» son dos frases distintas, y la
// segunda haría que la pantalla afirme que falta asignar el contrato entero.
//
// La fuente cuando exista: `public.esquema_pago`, materializada desde `public.cobranza`; las
// ediciones del admin se ENCOLAN en `public.cobranza_cambio` y un worker en la VM las escribe con
// bisturí en la fila de Cobranzas. La app nunca escribe en Google desde Vercel.

import type { EsquemaCliente } from '../types/cobranzas'

export async function getEsquema(clienteId: string): Promise<EsquemaCliente | null> {
  if (!clienteId) return null
  return null
}
