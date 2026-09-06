// EL VOLANTE: LO QUE UNA PERSONA CORRIGIÓ SE GUARDA COMO EJEMPLO. Es lo único que no se fabrica.
//
// ═══ POR QUÉ ESTO NO EXISTÍA Y POR QUÉ IMPORTA ═══
//
// El OS mide todo lo que hacen sus modelos: `orq.chat_cost` guarda quién contestó, cuánto tardó y
// cuánto salió; `orq.ml_traza` guarda con qué método se resolvió. Ninguna de las dos guarda QUÉ se
// preguntó ni QUÉ se contestó, y está bien que no lo hagan: son tablas de costo, y un prompt
// adentro de una tabla de costo es una fuga con excusa contable.
//
// Pero entonces, cuando una persona corrige una salida del modelo, esa corrección se aplica y se
// pierde. Y sin pares (entrada → corrección) no hay dataset, y sin dataset no hay fine-tune: sólo
// queda cambiar de modelo y esperar. Entrenar sin corrección humana capturada sería fabricar el
// dataset, que es la Regla de Oro número uno al revés.
//
// ═══ LO QUE SE GUARDA CUANDO EL OS ACERTÓ, TAMBIÉN ═══
//
// La tentación es guardar sólo los errores: es donde está el aprendizaje. Es un error de método.
// Un conjunto compuesto sólo de fallos le enseña al modelo una distribución que no existe —en
// producción la mayoría de los casos salen bien— y lo empuja a desconfiar de sus aciertos. Se
// guarda la CONFIRMACIÓN igual que la corrección, con `acerto` diciendo cuál fue.
//
// ═══ EL EJEMPLO ES TAN SENSIBLE COMO EL DATO QUE LLEVA ═══
//
// Un ejemplo de resolución de proveedores lleva el nombre del proveedor: eso es CONFIDENTIAL. La
// tabla lo guarda —sin el dato no hay ejemplo— y lo MARCA, para que ningún exportador pueda
// llevárselo sin pasar por `esPublicable`. Guardar sin marcar sería crear un segundo lugar donde
// vive lo confidencial, con la excusa de aprender.

import { sensibilidadDe } from './politica.mjs'

/** Qué clase de decisión se estaba tomando. Es lo que después separa los conjuntos de entrenamiento. */
export const TAREA = Object.freeze({
  IDENTIDAD: 'resolver-identidad',
  ARGUMENTOS: 'completar-argumentos',
  RUTEO: 'rutear',
  HERRAMIENTA: 'elegir-herramienta',
})

/**
 * EL EJEMPLO QUE CORRESPONDE A UNA CORRECCIÓN. PURA: decide, no escribe.
 *
 * @returns {{ok:false, porQue:string}|{ok:true, ejemplo:object}}
 */
export function ejemploDe({
  tarea, dominio = null, entrada, contexto = null,
  propuestoPorElOs = null, corregidoA = null, por, metodo = null, modelo = null, confianza = null,
} = {}) {
  if (!tarea) return { ok: false, porQue: 'un ejemplo sin tarea no se puede agrupar ni entrenar' }
  // SIN AUTOR NO ES UNA CORRECCIÓN HUMANA. Un `por` vacío convertiría en ground truth cualquier
  // escritura automática, que es exactamente el dato que este volante NO puede aceptar: se estaría
  // entrenando el modelo con su propia salida.
  if (!por || !String(por).trim()) return { ok: false, porQue: 'una corrección sin autor no es evidencia: no se puede auditar' }
  const texto = String(entrada ?? '').trim()
  if (!texto) return { ok: false, porQue: 'sin la entrada original el par no sirve para entrenar nada' }

  // «Dejar sin resolver» es información para la cola de trabajo y NO es una etiqueta: nadie dijo
  // cuál era la respuesta correcta. Guardarlo como ejemplo enseñaría a abstenerse.
  if (corregidoA == null) return { ok: false, porQue: 'la persona no dijo cuál era la respuesta correcta: no hay etiqueta' }

  const esperado = String(corregidoA)
  const propuesto = propuestoPorElOs == null ? null : String(propuestoPorElOs)
  return {
    ok: true,
    ejemplo: {
      tarea,
      dominio,
      sensibilidad: sensibilidadDe(dominio),
      entrada: texto.slice(0, 4000),
      contexto: contexto ? JSON.stringify(contexto).slice(0, 4000) : null,
      propuesto,
      esperado,
      // El OS acertó cuando lo que propuso es lo que la persona confirmó. `null` propuesto es
      // «no propuso nada», que no es un acierto ni un error: es una abstención etiquetada.
      acerto: propuesto == null ? null : propuesto === esperado,
      metodo,
      modelo,
      confianza: confianza == null ? null : Number(confianza),
      por: String(por).trim(),
    },
  }
}

const SQL = `
  insert into orq.llm_ejemplo
    (tarea, dominio, sensibilidad, entrada, contexto, propuesto, esperado, acerto, metodo, modelo, confianza, corregido_por)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`

/**
 * GUARDAR EL EJEMPLO. No espera y no propaga: capturar aprendizaje nunca puede romper la corrección
 * que lo produjo. Si la tabla no existe todavía, se pierde el ejemplo y se avisa UNA vez — no se
 * llena el log con el mismo aviso cuarenta veces.
 */
let avisado = false
export async function guardar(datos, { ejecutar } = {}) {
  const r = ejemploDe(datos)
  if (!r.ok) return r
  const e = r.ejemplo
  const q = ejecutar ?? (await import('../db.mjs')).query
  try {
    await q(SQL, [e.tarea, e.dominio, e.sensibilidad, e.entrada, e.contexto, e.propuesto,
      e.esperado, e.acerto, e.metodo, e.modelo, e.confianza, e.por])
    return { ok: true, ejemplo: e }
  } catch (err) {
    if (!avisado) {
      avisado = true
      console.warn(`  ⚠ el ejemplo no se pudo guardar (la corrección sí se aplicó): ${String(err?.message ?? err).slice(0, 100)}`)
    }
    return { ok: false, porQue: 'no se pudo escribir', ejemplo: e }
  }
}

/** El ritmo del volante. Es la pregunta que hay que poder contestar: ¿cuántos por semana? */
export async function ritmo({ semanas = 8, ejecutar } = {}) {
  const q = ejecutar ?? (await import('../db.mjs')).query
  const r = await q(
    `select date_trunc('week', ts)::date semana, tarea, count(*)::int n,
            count(*) filter (where acerto is false)::int correcciones,
            count(*) filter (where acerto is true)::int confirmaciones
       from orq.llm_ejemplo where ts > now() - ($1 || ' weeks')::interval
      group by 1,2 order by 1 desc, n desc`, [String(semanas)])
  return r.rows ?? r
}
