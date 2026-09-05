// HUGGING FACE JOBS: cómputo por lotes fuera de la VM. La puerta, y la regla que la gobierna.
//
// ═══ QUÉ DA, MEDIDO EL 05/09/2026 ═══
//
// Se lanzó un Job real (`cpu-basic`) y se comparó contra esta VM con el mismo cálculo:
//
//   VM        4 núcleos    0,18 s
//   Job      16 núcleos    0,18 s   ·  4,9 s de arranque de punta a punta
//
// Cuatro veces los núcleos por unos cinco segundos de arranque, y flavors hasta `a100x4` y
// ZeroGPU. Para un lote grande eso es real; para una operación suelta, el arranque se come todo.
//
// ═══ LA REGLA QUE DECIDE, Y POR QUÉ CASI NADA CALIFICA HOY ═══
//
// Un Job corre en infraestructura de Hugging Face, así que los datos VIAJAN. El trabajo que más
// ganaría —re-embeber los 10.876 fragmentos del corpus, quince minutos de VM— es justamente el que
// NO puede salir: esos fragmentos llevan nombres de empleados, CUIT e importes.
//
// Lo que sí califica es todo lo que no toca datos de la empresa: comparar modelos candidatos entre
// sí, medir latencia y memoria de un modelo que no entra en la VM, correr un benchmark público.
// Esa distinción no es una excusa — es la misma política que gobierna `hf-inferencia.mjs`, y acá
// se aplica antes de armar el pedido.

import { token } from './hf-inferencia.mjs'
import { puedeSalir } from './politica.mjs'

const BASE = 'https://huggingface.co/api/jobs'

/** Los tamaños que la cuenta acepta hoy. Se declaran para no descubrir un nombre inválido en
 *  producción; el precio lo publica HF y no se copia acá para no envejecer. */
export const FLAVORS = Object.freeze([
  'cpu-basic', 'cpu-upgrade', 'cpu-performance', 'cpu-xl',
  'zero-a10g', 't4-small', 't4-medium', 'l4x1', 'a10g-small', 'a100-large',
])

/**
 * Lanza un Job. La política se comprueba ANTES de armar el pedido: si estuviera después, el dato
 * ya viajó.
 *
 * @param {{comando:string[], imagen?:string, flavor?:string, dominio:string, timeout?:string,
 *          entorno?:object, permitidoExplicitamente?:boolean, usuario?:string}} p
 */
export async function lanzarJob({
  comando, imagen = 'python:3.12-slim', flavor = 'cpu-basic', dominio,
  timeout = '30m', entorno = {}, permitidoExplicitamente = false, usuario = 'jorgecoronaguti',
} = {}) {
  const permiso = puedeSalir(dominio, 'huggingface', { permitidoExplicitamente })
  if (!permiso.permitido) {
    throw new Error(`la política no deja mandar este trabajo a Hugging Face: ${permiso.porQue}`)
  }
  if (!FLAVORS.includes(flavor)) throw new Error(`flavor desconocido: «${flavor}»`)
  const tk = token()
  if (!tk) throw new Error('no hay token de Hugging Face configurado')

  const r = await fetch(`${BASE}/${usuario}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dockerImage: imagen, command: comando, flavor, timeout, environment: entorno }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`HF Jobs respondió ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
  return { id: j.id, estado: j.status?.stage ?? null, flavor, creado: j.createdAt, sensibilidad: permiso.sensibilidad }
}

export async function estadoJob(id, { usuario = 'jorgecoronaguti' } = {}) {
  const r = await fetch(`${BASE}/${usuario}/${id}`, { headers: { Authorization: `Bearer ${token()}` } })
  const j = await r.json()
  return { id, estado: j.status?.stage ?? null, fallos: j.status?.failureCount ?? 0, flavor: j.flavor, creado: j.createdAt }
}

/** Los logs vienen como SSE: una línea `data: {json}` por evento. */
export async function logsJob(id, { usuario = 'jorgecoronaguti' } = {}) {
  const r = await fetch(`${BASE}/${usuario}/${id}/logs`, { headers: { Authorization: `Bearer ${token()}` } })
  const txt = await r.text()
  return txt.split('\n').filter((l) => l.startsWith('data: '))
    .map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } })
    .filter(Boolean)
}

/**
 * ¿CONVIENE MANDARLO AFUERA? Función pura: la decisión, con su porqué.
 *
 * @param {{fragmentos:number, msPorUnidadVM:number, sensibilidad:string, nucleosVM?:number, nucleosJob?:number}} t
 */
export function convieneJob({ fragmentos, msPorUnidadVM, sensibilidad, nucleosVM = 4, nucleosJob = 16, arranqueMs = 5000 }) {
  const vmMs = fragmentos * msPorUnidadVM
  // El Job no es mágico: escala con los núcleos y paga el arranque una vez.
  const jobMs = arranqueMs + (vmMs * nucleosVM) / nucleosJob
  const ahorro = vmMs - jobMs
  if (sensibilidad !== 'publico' && sensibilidad !== 'interno') {
    return {
      conviene: false, vmMs, jobMs,
      porQue: `los datos son ${sensibilidad}: viajarían a infraestructura de Hugging Face, y eso necesita autorización explícita del dueño para este caso`,
    }
  }
  if (ahorro <= 0) {
    return { conviene: false, vmMs, jobMs, porQue: `el arranque (${arranqueMs} ms) se come la diferencia: la VM tarda ${Math.round(vmMs / 1000)} s y el Job ${Math.round(jobMs / 1000)} s` }
  }
  return {
    conviene: true, vmMs, jobMs, ahorroMs: ahorro,
    porQue: `${Math.round(vmMs / 1000)} s en la VM contra ${Math.round(jobMs / 1000)} s en el Job: ahorra ${Math.round(ahorro / 1000)} s`,
  }
}
