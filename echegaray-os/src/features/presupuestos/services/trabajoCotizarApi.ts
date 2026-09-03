// EL CLIENTE DE `/api/presupuestos/cotizar` — encola, nunca espera.
//
// El formulario viejo mandaba el PDF y esperaba la respuesta ENTERA en el mismo request: con un
// legajo grande eso es el timeout que el dueño reportó. Este cliente hace lo contrario — un POST
// que contesta en <3 s con un `id`, y el resto se pregunta con GET cada 1,5 s hasta LISTO o ERROR.
//
// `archivoValido` y `tamanoLegible` son PUROS (sólo miran nombre/tamaño) y tienen test. Lo que no
// se puede testear con `node --test` —`FileReader`, `fetch`— queda en funciones finas que no
// deciden nada, sólo mueven bytes.

import type { TrabajoLectura } from './trabajoLectura'

/** Lo que el cotizador de plano sabe leer hoy. Lo que no entra acá se rechaza CON MOTIVO visible
 *  — nunca se finge que se mandó. */
const EXTENSIONES = /\.(pdf|dwg|dxf|jpg|jpeg|png|xlsx|xls|docx|doc)$/i
const MAX_ARCHIVO = 25 * 1024 * 1024
const MAX_ARCHIVOS = 12

export const tamanoLegible = (n: number): string =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

/** `null` = el archivo pasa. Si no, el motivo en castellano para mostrar al lado del nombre. */
export function archivoValido(f: { name: string; size: number }, yaHay: number): string | null {
  if (yaHay >= MAX_ARCHIVOS) return `ya hay ${MAX_ARCHIVOS} archivos — sacá uno antes de sumar otro`
  if (!EXTENSIONES.test(f.name)) return 'formato no soportado (PDF · DWG · DXF · foto · Excel · Word)'
  if (f.size > MAX_ARCHIVO) return `pesa ${tamanoLegible(f.size)} y el tope es ${tamanoLegible(MAX_ARCHIVO)}`
  return null
}

export type AdjuntoLocal = { nombre: string; contenido_base64: string }

/** Lee un `File` del navegador a base64 puro (sin el prefijo `data:...;base64,`). */
export function base64DeArchivo(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error(`no se pudo leer ${f.name}`))
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.readAsDataURL(f)
  })
}

/** Encola la lectura. Contesta en <3 s con el `id` del trabajo — NUNCA espera el resultado. */
export async function iniciarLectura(payload: { mensaje?: string; adjuntos: AdjuntoLocal[] }): Promise<{ id: string }> {
  const res = await fetch('/api/presupuestos/cotizar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => null)
    const motivo = (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo) ? String((cuerpo as { error: unknown }).error) : null
    throw new Error(motivo ?? `el servidor contestó ${res.status}`)
  }
  const cuerpo = (await res.json()) as { id?: unknown }
  if (typeof cuerpo.id !== 'string' || !cuerpo.id.trim()) throw new Error('el servidor no devolvió un id de trabajo')
  return { id: cuerpo.id }
}

/** Una vuelta de sondeo. Devuelve el trabajo tal como lo manda el backend — sin inventar campos
 *  que no llegaron: lo que falta queda en su default más conservador (arrays vacíos, `null`). */
export async function consultarLectura(id: string): Promise<TrabajoLectura> {
  const res = await fetch(`/api/presupuestos/cotizar/${id}`)
  if (!res.ok) throw new Error(`no se pudo consultar el trabajo (${res.status})`)
  const j = (await res.json()) as Partial<TrabajoLectura>
  return {
    id: typeof j.id === 'string' ? j.id : id,
    estado: (j.estado as TrabajoLectura['estado']) ?? 'ENCOLADO',
    etapa: j.etapa ?? null,
    pasos: Array.isArray(j.pasos) ? j.pasos : [],
    certeza: j.certeza ?? null,
    computo: j.computo ?? null,
    cascada: j.cascada ?? null,
    presupuesto_id: j.presupuesto_id ?? null,
    error: j.error ?? null,
  }
}
