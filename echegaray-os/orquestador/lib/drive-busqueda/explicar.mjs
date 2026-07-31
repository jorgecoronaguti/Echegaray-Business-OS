// "¿POR QUÉ ESE?" — la respuesta, en castellano y con los números a la vista.
//
// El ranking ya guardaba el desglose de señales de cada candidato. Estaba ahí y no lo leía
// nadie: un objeto con claves como `fuente_operativa: 300` no le explica nada a una persona.
//
// Un buscador que elige por vos y no puede decir por qué te obliga a confiar o a no usarlo.
// Este archivo traduce el desglose a una frase que se entiende, y ordena las señales por lo
// que pesaron: lo primero que se lee es lo que de verdad decidió.
//
// No hay ningún criterio nuevo acá. Si esta explicación no coincide con el resultado, el que
// está mal es este archivo — el puntaje es el del ranking, sin recalcular nada.

/** Cómo se dice cada señal. Lo que no está acá se muestra con su nombre crudo: es preferible
 *  un nombre técnico visible a una señal que decide en silencio. */
const NOMBRES = {
  nombre_exacto: 'se llama exactamente así',
  nombre_prefijo: 'el nombre empieza con lo que pediste',
  nombre_contiene: 'el nombre contiene lo que pediste',
  tokens_nombre: 'palabras que están en el nombre',
  tokens_ruta: 'palabras que están en la carpeta',
  tokens_alias: 'palabras que están en cómo el OS describe esta fuente',
  todos_los_tokens: 'están todas las palabras que pediste',
  cobertura: 'proporción de lo que pediste que aparece',
  carpeta_exacta: 'la carpeta se llama como algo que pediste',
  tipo_pedido: 'es del tipo de archivo que pediste',
  es_carpeta: 'es una carpeta, no un archivo',
  profundidad: 'está enterrado en subcarpetas',
  frescura: 'se modificó hace poco',
  aprendizaje: 'lo que se eligió antes para esta misma búsqueda',
  alias_documento: 'la empresa le dice así a este documento',
  fuente_operativa: 'el OS lo tiene declarado como fuente de negocio, vigente y en uso',
  documento_vivo: 'es un Google Sheet/Doc vivo, no una copia subida',
  historico: 'está en una carpeta de archivo (año cerrado, "archivos viejos")',
  copia: 'es una copia',
  reemplazado: 'el registro dice que otra fuente lo reemplazó',
  antiguedad: 'hace mucho que nadie lo toca',
  estado_canonico: 'la empresa lo declaró documento canónico',
  estado_operativo: 'la empresa lo declaró documento operativo',
  estado_historico: 'la empresa lo declaró histórico',
  estado_archivado: 'la empresa lo declaró archivado',
  estado_reemplazado: 'la empresa lo declaró reemplazado',
  estado_duplicado: 'la empresa lo declaró duplicado',
  sucesor: 'es el documento que reemplazó a otro de esta misma búsqueda',
}

export const nombreDeSenal = (clave) => NOMBRES[clave] ?? clave

/** Las señales ordenadas por cuánto pesaron, sin importar el signo. Lo que más movió la aguja
 *  va primero, sea a favor o en contra. */
export function senalesOrdenadas(senales = {}) {
  return Object.entries(senales ?? {})
    .filter(([, v]) => Number(v) !== 0)
    .map(([clave, valor]) => ({ clave, valor: Number(valor), texto: nombreDeSenal(clave) }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
}

const signo = (n) => (n > 0 ? `+${n}` : String(n))

/** Una línea por señal: "+300  el OS lo tiene declarado…". */
function lineasDe(senales) {
  return senalesOrdenadas(senales).map((s) => `  ${signo(s.valor).padStart(6)}  ${s.texto}`)
}

/**
 * El desglose de UN candidato.
 * @param {{name?:string, id?:string, score?:number, senales?:object, rescatado?:boolean}} c
 */
export function explicarCandidato(c, { titulo = null } = {}) {
  const cabeza = `${titulo ?? c.name ?? c.id} — ${Math.round(c.score ?? 0)} puntos`
  const extra = c.rescatado ? ' (entró por el pase de rescate: es una fuente declarada del OS)' : ''
  return [`${cabeza}${extra}`, ...lineasDe(c.senales)].join('\n')
}

/**
 * Por qué ganó el primero contra el segundo. Es la pregunta que de verdad se hace la gente:
 * no "cuánto sacó", sino "por qué ÉSE y no el otro".
 */
export function explicarComparacion(ganador, segundo) {
  if (!segundo) return 'No hubo con quién compararlo: fue el único candidato.'
  const a = ganador.senales ?? {}
  const b = segundo.senales ?? {}
  const claves = new Set([...Object.keys(a), ...Object.keys(b)])
  const difs = Array.from(claves)
    .map((k) => ({ clave: k, suyo: Number(a[k]) || 0, delOtro: Number(b[k]) || 0 }))
    .map((d) => ({ ...d, dif: d.suyo - d.delOtro }))
    .filter((d) => d.dif !== 0)
    .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))
    .slice(0, 4)
  if (!difs.length) return 'Empataron en todas las señales; desempató la fecha de modificación.'
  // SE MUESTRAN LOS DOS VALORES, NO LA DIFERENCIA.
  //
  // Con la diferencia sola, la línea "+200 está en una carpeta de archivo" se lee como si el
  // GANADOR estuviera en una carpeta de archivo, cuando lo que pasó es que el otro sí lo está.
  // Una explicación que hay que interpretar al revés es peor que no dar explicación.
  return [
    `Le ganó a "${segundo.name ?? segundo.id}" por ${Math.round((ganador.score ?? 0) - (segundo.score ?? 0))} puntos:`,
    ...difs.map((d) => `  ${signo(d.suyo).padStart(6)} vs ${signo(d.delOtro).padEnd(6)} ${nombreDeSenal(d.clave)}`),
  ].join('\n')
}

/**
 * La explicación completa de una búsqueda guardada en `drive_busqueda_evento`.
 * Recibe la fila tal como salió de la base: no vuelve a buscar ni a puntuar nada.
 */
export function explicarEvento(evento) {
  if (!evento) return 'No encontré esa búsqueda en el registro.'
  const candidatos = Array.isArray(evento.candidatos) ? evento.candidatos : []
  if (!candidatos.length) return `"${evento.consulta}" no encontró ningún candidato.`
  const [primero, segundo] = candidatos
  const partes = [
    `Búsqueda: "${evento.consulta}"  ·  confianza ${evento.confianza}  ·  etapa ${evento.etapa ?? '—'}`,
    '',
    explicarCandidato(primero, { titulo: `Ganó: ${primero.name ?? primero.id}` }),
    '',
    explicarComparacion(primero, segundo),
  ]
  if (candidatos.length > 1) {
    partes.push('', 'Los demás candidatos:',
      ...candidatos.slice(1).map((c) => `  ${String(Math.round(c.score ?? 0)).padStart(6)}  ${c.name ?? c.id}`))
  }
  if (evento.confirmado) partes.push('', `La persona confirmó: ${evento.confirmado}`)
  else if (evento.rechazado_at) partes.push('', 'La persona dijo que no era ese.')
  return partes.join('\n')
}
