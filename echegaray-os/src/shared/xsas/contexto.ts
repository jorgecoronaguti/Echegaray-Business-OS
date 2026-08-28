// QUÉ PARTE DEL CONTEXTO PUEDE PONER EL NAVEGADOR. Respuesta corta: nada que nombre una entidad.
//
// ═══ EL AGUJERO (27/08/2026, auditoría independiente) ═══
//
// El encabezado de `/api/xsas` dice que el nombre de la obra «sale de la base, nunca del navegador»,
// y era cierto para el camino verificado: si el cliente manda `entidad.obra_id`, el servidor lo lee
// con la sesión del usuario, o sea pasando por la RLS, y si la obra no es suya no viaja.
//
// El agujero estaba al lado. `contexto` es un objeto libre y NO pasa por ninguna verificación. Un
// cliente que simplemente NO manda `entidad.obra_id` y manda `contexto: {obra: "…"}` se saltea la
// RLS entera: del otro lado, `argumentosPara` usa `contexto` como PRIMERA fuente para llenar los
// argumentos de una tool. La auditoría lo probó contra la puerta viva y sacó el costo real de una
// obra con un rol que no debía verlo.
//
// Invertir el orden del spread —que fue el arreglo anterior— sólo tapa el caso en que las dos cosas
// vienen juntas. No tapa el caso en que la verificada no viene.
//
// ═══ LA REGLA ═══
//
// El contexto de ENTIDAD lo produce el servidor y sólo el servidor. Del navegador se acepta
// únicamente lo que describe la PANTALLA —dónde está parado el usuario— y que ninguna tool puede
// usar como argumento. Todo lo demás se descarta y se DICE que se descartó: un contexto ignorado en
// silencio produce una respuesta que parece de la obra y no lo es.
//
// La lista es corta a propósito. Crecerla es una decisión que queda en el diff, y cada clave nueva
// hay que mirarla contra los `input_schema` de las tools: si una tool puede recibir esa clave como
// argumento, no puede venir del navegador.

/** Lo único que el navegador puede aportar: dónde está parado, no sobre qué entidad. */
export const CLAVES_DE_PANTALLA = Object.freeze(['pantalla', 'ruta', 'seccion', 'vista'])

/**
 * Filtra el contexto que llegó del cliente. PURA.
 * @returns `{permitido, descartado}` — `descartado` son las claves que se tiraron, para declararlas.
 */
export function contextoDelCliente(bruto: unknown): { permitido: Record<string, string>; descartado: string[] } {
  const permitido: Record<string, string> = {}
  const descartado: string[] = []
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { permitido, descartado }
  for (const [clave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!CLAVES_DE_PANTALLA.includes(clave)) { descartado.push(clave); continue }
    // Sólo texto corto: un objeto anidado volvería a abrir la puerta que esto cierra.
    if (typeof valor !== 'string') { descartado.push(clave); continue }
    permitido[clave] = valor.slice(0, 120)
  }
  return { permitido, descartado }
}
