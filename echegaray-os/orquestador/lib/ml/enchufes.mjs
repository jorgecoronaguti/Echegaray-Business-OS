// ENCHUFA LOS SOLUCIONADORES QUE YA EXISTEN AL ROUTER. UN SOLO LUGAR QUE SABE QUÉ HAY VIVO.
//
// El router no conoce ningún modelo: conoce escalones. Este archivo es el único que sabe cuáles
// están implementados hoy, y se importa una vez al arrancar un proceso que use la capa ML.
//
// POR QUÉ NO SE ENCHUFA SOLO AL IMPORTAR EL ROUTER. Porque cargar el motor de embeddings cuesta
// 580 MB de RSS, y un script que sólo quiere `classify` con una regla no tiene por qué pagarlo. El
// enchufe es explícito y el modelo se carga perezoso incluso después de enchufado.

import { METODO } from './resultado.mjs'
import { registrarSolucionador } from './router.mjs'
import { embeber, coseno, disponible } from './embeddings.mjs'
import { confianzaConMargen } from './calibracion.mjs'
import { MODELO } from './embeddings.mjs'

let enchufado = false

export function enchufarTodo() {
  if (enchufado) return
  enchufado = true

  // ── embed: el vector de un texto ──
  registrarSolucionador('embed', METODO.ML_LOCAL, async (texto, { rol = 'documento' } = {}) => {
    const v = await embeber(texto, rol)
    if (!v) return null
    // Un embedding no es una inferencia con grado: o se calculó o no. La confianza es del que lo USA.
    return { valor: v, confianza: 1, modelo: MODELO, porQue: `vector de ${v.length} dimensiones` }
  }, { nombre: 'e5-small' })

  // ── semanticSearch: los candidatos más parecidos dentro de una lista dada ──
  // La búsqueda contra pgvector entra como escalón SQL cuando exista el indexador; esto resuelve el
  // caso en memoria, que es el que necesitan la resolución de identidad y el cruce de cheques.
  // ═══ SIMÉTRICO POR DEFECTO, Y ESO NO ES UN DETALLE (04/09/2026) ═══
  //
  // e5 embebe distinto una pregunta (`query:`) y un documento (`passage:`), y para buscar en un
  // corpus eso es lo correcto. Pero comparar «CORRALON PROGRESO» contra «Corralon Progreso S.R.L.»
  // NO es una pregunta contra un documento: son dos nombres de la misma clase. La primera prueba de
  // punta a punta salió con la asimetría puesta y el par idéntico cayó de 1,0000 a 0,9554 —de
  // APLICAR a SUGERIR—: el modelo estaba midiendo la diferencia entre los prefijos, no entre los
  // nombres. Y la calibración se midió con los dos lados simétricos, así que usarla con prefijos
  // distintos compara contra un piso que no es el suyo.
  //
  // `asimetrico: true` queda para cuando el corpus sean documentos de verdad.
  registrarSolucionador('semanticSearch', METODO.ML_LOCAL, async (consulta, { candidatos = [], top = 5, asimetrico = false } = {}) => {
    if (!candidatos.length) return null
    const vq = await embeber(consulta, asimetrico ? 'consulta' : 'documento')
    if (!vq) return null
    const puntuados = []
    for (const c of candidatos) {
      const texto = typeof c === 'string' ? c : c.texto
      const vc = await embeber(texto, 'documento')
      const s = coseno(vq, vc)
      if (s != null) puntuados.push({ ...(typeof c === 'string' ? { texto: c } : c), coseno: s })
    }
    if (!puntuados.length) return null
    puntuados.sort((a, b) => b.coseno - a.coseno)
    const mejores = puntuados.slice(0, top)
    // LA CONFIANZA SALE DEL MARGEN CONTRA EL SEGUNDO, no del coseno del primero: ver calibracion.mjs.
    const conf = confianzaConMargen(mejores[0].coseno, mejores[1]?.coseno ?? null)
    return {
      valor: mejores,
      confianza: conf,
      modelo: MODELO,
      porQue: mejores[1]
        ? `el mejor da ${mejores[0].coseno.toFixed(4)} y el segundo ${mejores[1].coseno.toFixed(4)}`
        : `unico candidato, coseno ${mejores[0].coseno.toFixed(4)}`,
      evidencia: { coseno: mejores[0].coseno, segundo: mejores[1]?.coseno ?? null },
    }
  }, { nombre: 'e5-small+coseno' })
}

/** Para el health check: qué está vivo de verdad, no qué está registrado. */
export async function salud() {
  return { embeddings: await disponible(), modelo: MODELO }
}
