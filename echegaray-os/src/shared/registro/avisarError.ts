import { RUTA_REGISTRO_ERROR, pilaCorta } from './registroApp'

// El aviso del navegador a `/api/registro-error`. Una vez por error y pestaña: un Reintentar que vuelve
// a caer no multiplica filas. `keepalive`: si la persona se va de la pantalla, el aviso sale igual.
const avisados = new Set<string>()

export function avisarError(e: { ruta: string; consulta?: string; digest?: string | null; mensaje?: string | null; clave?: string; pila?: string | null; origen: string }) {
  if (typeof window === 'undefined') return
  const llave = `${e.ruta}|${e.digest ?? ''}|${e.mensaje ?? ''}`
  if (avisados.has(llave)) return
  avisados.add(llave)
  try {
    void fetch(RUTA_REGISTRO_ERROR, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...e, pila: pilaCorta(e.pila) }).slice(0, 7_900),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Avisar no puede romper la pantalla de error.
  }
}
