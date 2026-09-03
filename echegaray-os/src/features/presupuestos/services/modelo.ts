// ¿HAY MODELO DE LENGUAJE PARA ESTA PANTALLA? — se decide EN EL SERVIDOR, y una sola vez.
//
// ═══ POR QUÉ NO SE PREGUNTA CUANDO YA FALLÓ ═══
//
// La pantalla puede saber que el razonador no está ANTES de que alguien escriba una frase, y esa
// diferencia es todo el modo determinístico: con el aviso arriba, quien cotiza sabe que sólo van a
// andar las frases que la gramática entiende y usa las acciones de al lado. Sin el aviso, escribe
// una frase en castellano, no pasa nada, y concluye que Presupuestos está roto.
//
// ═══ EL FUSIBLE ES LA MISMA AUTORIDAD QUE CORTA LA LLAMADA ═══
//
// `iaBloqueada()` es lo que `pedirTextoONull` consulta antes de gastar. Preguntarle a otra cosa acá
// —una variable propia, un ping— produciría una pantalla que dice «hay modelo» y un motor que se
// niega a llamarlo: la clase de control que se valida contra información distinta de la que produce.
//
// La clave se mira ADEMÁS del fusible: el fusible dice si está permitido gastar, no si hay con qué.

import { iaBloqueada } from '../../../../orquestador/lib/ia/fusible.mjs'

const bloqueada = iaBloqueada as unknown as (env?: NodeJS.ProcessEnv) => string | null

/** El motivo por el que no hay modelo, o `null` si lo hay. Nunca lanza: es una lectura de entorno. */
export function motivoSinModelo(env: NodeJS.ProcessEnv = process.env): string | null {
  const corte = bloqueada(env)
  if (corte) return corte
  if (!env.ANTHROPIC_API_KEY && !env.ORQ_IA_ALT_API_KEY) return 'no hay clave de proveedor configurada'
  return null
}

/** Lo que la pantalla necesita: un booleano. El motivo queda para el log, no para el cotizador. */
export function hayModelo(env: NodeJS.ProcessEnv = process.env): boolean {
  return motivoSinModelo(env) === null
}
