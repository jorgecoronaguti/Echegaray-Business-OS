// SEMBRAR ALIASES DESDE UN IDENTIFICADOR FUERTE. NÚCLEO PURO.
//
// ═══ EL HALLAZGO QUE ESTE ARCHIVO CONVIERTE EN CAPACIDAD ═══
//
// «DUPEC» contra «DUBOS UGARTE PEDRO LUIS RAUL» da coseno 0,0000. No es que el modelo esté mal
// afinado: no hay NADA en el texto que los relacione, porque uno es un nombre de fantasía y el
// otro el titular que factura. Ningún embedding puede resolver eso, y pretender que sí es la forma
// más rápida de fabricar una fusión equivocada.
//
// Lo que SÍ los relaciona es el CUIT 20287737824, que las dos planillas ya traen escrito. El alias
// no se infiere: se DEDUCE de un identificador que las dos fuentes comparten. Una vez sembrado,
// «DUPEC» resuelve solo, al instante, sin modelo y para siempre.
//
// ═══ LA REGLA: NUNCA SEMBRAR POR PARECIDO ═══
//
// Esta función no mira similitud. Sólo produce un alias cuando el CUIT del texto identifica a UN
// único proveedor del padrón. Si el CUIT no está, o identifica a dos, no se siembra nada: eso es
// un duplicado del padrón y lo resuelve una persona.

import { cuitCanonico } from './entity-resolution.mjs'
import { normalizar } from './embeddings.mjs'

/**
 * Qué aliases corresponde sembrar a partir de observaciones (texto + CUIT) de las fuentes reales.
 *
 * @param {Array<{nombre:string, cuit:*, fuente?:string}>} observaciones lo que dicen las planillas
 * @param {Array<{id:*, nombre:string, cuit:*}>} padron los proveedores canónicos
 * @param {Map<string,*>} aliasesExistentes alias_norm → entidad_id, los que ya están
 * @returns {{sembrar:Array, yaEstaban:Array, conflictos:Array, sinPadron:Array}}
 */
export function aliasesASembrar(observaciones = [], padron = [], aliasesExistentes = new Map()) {
  const porCuit = new Map()
  for (const p of padron) {
    const c = cuitCanonico(p.cuit)
    if (!c) continue
    porCuit.set(c, [...(porCuit.get(c) ?? []), p])
  }

  const sembrar = new Map()   // alias_norm → propuesta, deduplicado dentro del lote
  const yaEstaban = [], conflictos = [], sinPadron = []

  for (const o of observaciones) {
    const cuit = cuitCanonico(o?.cuit)
    const norm = normalizar(o?.nombre)
    if (!cuit || !norm) continue

    const candidatos = porCuit.get(cuit) ?? []
    if (candidatos.length === 0) { sinPadron.push({ nombre: o.nombre, cuit, porQue: 'el CUIT no está en el padrón' }); continue }
    if (candidatos.length > 1) {
      conflictos.push({ nombre: o.nombre, cuit, porQue: `${candidatos.length} proveedores comparten el CUIT ${cuit}: el padrón está duplicado` })
      continue
    }
    const canonico = candidatos[0]

    // El nombre del propio proveedor no necesita alias: el match exacto ya lo resuelve.
    if (normalizar(canonico.nombre) === norm) continue

    const yaEs = aliasesExistentes.get(norm)
    if (yaEs != null) {
      if (String(yaEs) !== String(canonico.id)) {
        conflictos.push({ nombre: o.nombre, cuit, porQue: `«${norm}» ya es alias de otra entidad (${yaEs}); el CUIT dice ${canonico.id}` })
      } else {
        yaEstaban.push({ nombre: o.nombre, cuit, entidadId: String(canonico.id) })
      }
      continue
    }

    const previo = sembrar.get(norm)
    if (previo && String(previo.entidadId) !== String(canonico.id)) {
      // El mismo texto aparece con dos CUIT distintos en las fuentes: no es un alias, es un choque.
      conflictos.push({ nombre: o.nombre, cuit, porQue: `«${norm}» aparece con dos CUIT distintos (${previo.cuit} y ${cuit}): no se siembra` })
      sembrar.delete(norm)
      continue
    }
    if (previo) continue

    sembrar.set(norm, {
      alias: String(o.nombre).trim(), aliasNorm: norm, entidadId: String(canonico.id),
      nombreCanonico: canonico.nombre, cuit, fuente: o.fuente ?? null,
    })
  }

  return { sembrar: [...sembrar.values()], yaEstaban, conflictos, sinPadron }
}
