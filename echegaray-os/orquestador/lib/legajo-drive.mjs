// QUÉ TIENE CADA LEGAJO EN EL DRIVE — y qué le falta.
//
// ═══ QUÉ MIRA Y QUÉ NO ═══
//
// Mira el NOMBRE de los archivos de la carpeta de cada persona, no su contenido. Es barato, es
// determinístico y alcanza para la pregunta que importa —«¿a quién le falta el alta, el DNI o la
// libreta?»—, pero tiene un límite que hay que decir en la pestaña y no esconder acá: un archivo
// llamado `alta.pdf` que adentro tiene otra cosa se cuenta como alta igual.
//
// «HM» NO ES UNA SIGLA DE HORAS: es la LIBRETA DEL IERIC. El repo ya se equivocó una vez leyendo ese
// nombre como otra cosa; por eso la columna se llama por lo que el papel ES, no por cómo se llama el
// archivo.
//
// ═══ EL EMPAREJAMIENTO, Y POR QUÉ NO ALCANZA UN TOKEN ═══
//
// La planilla escribe «Gonzalez Juan» y la carpeta se llama «GONZALES TOBARES JUAN GUILLERMO»;
// «Zogber Leonardo» contra «ZOGBE LEONARDO». Emparejar por UN token compartido da matches que se ven
// razonables y son falsos: probado el 27/08, «Castillo Carlos» caía en «GONZALEZ CARLOS SAMUEL» y
// «Gonzalez Juan» en «TELLO JUAN». Con dos tokens en común el emparejamiento es un hecho; con uno es
// un candidato, y un candidato se muestra como candidato — nunca se resuelve en silencio.
//
// PURO: recibe nombres ya leídos. Ni red, ni disco, ni base.

const SIN_ACENTOS = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Los tokens con los que se compara un nombre: letras, sin sufijos, sin palabras de una letra. PURA. */
export function tokensDe(nombre) {
  return SIN_ACENTOS(nombre).split(/[^a-zñ]+/).filter((t) => t.length > 1)
}

/**
 * A QUÉ CARPETA CORRESPONDE UNA PERSONA.
 *
 * Devuelve TODOS los que empatan en el puntaje máximo, no el primero: «Gonzalez Juan» comparte un
 * token con «GONZALES TOBARES JUAN GUILLERMO» y otro con «TELLO JUAN», y quedarse con el primero del
 * array convierte el orden alfabético en un criterio de identidad. Con dos empatados no hay
 * candidato: hay dos, y eso es lo que se muestra.
 *
 * @returns {{carpeta:string|null, tokens:number, seguro:boolean, candidatos:string[]}}
 */
export function carpetaDe(nombre, carpetas = []) {
  const t = new Set(tokensDe(nombre))
  let max = 0
  let mejores = []
  for (const c of carpetas) {
    const comunes = tokensDe(c).filter((x) => t.has(x)).length
    if (comunes > max) { max = comunes; mejores = [c] } else if (comunes === max && max > 0) mejores.push(c)
  }
  if (max >= 2 && mejores.length === 1) return { carpeta: mejores[0], tokens: max, seguro: true, candidatos: [] }
  return { carpeta: null, tokens: max, seguro: false, candidatos: mejores }
}

/** Los papeles que un legajo tiene que tener. El orden es el de la pestaña. */
export const PAPELES = Object.freeze([
  { clave: 'alta', rotulo: 'Alta', re: /\balta\b/i },
  { clave: 'libreta', rotulo: 'Libreta IERIC', re: /\bhm\b/i },
  { clave: 'dni', rotulo: 'DNI', re: /\bdni\b/i },
  { clave: 'epp', rotulo: 'EPP', re: /\bepp\b/i },
])

const ES_RECIBO = /^recibo/i
/** `Recibo 2026-08 Q2.pdf` → '2026-08 Q2'. PURA. */
export function periodoDeRecibo(nombre) {
  const m = /(\d{4})-(\d{2})(?:\s*(Q[12]))?/i.exec(String(nombre ?? ''))
  return m ? `${m[1]}-${m[2]}${m[3] ? ` ${m[3].toUpperCase()}` : ''}` : null
}

/**
 * QUÉ HAY EN UNA CARPETA. `archivos` son los nombres, nada más.
 * @returns {{alta:boolean, libreta:boolean, dni:boolean, epp:boolean, recibos:number, ultimoRecibo:string|null, falta:string[]}}
 */
export function papelesDe(archivos = []) {
  const nombres = (archivos ?? []).map((a) => String(a ?? ''))
  const out = { recibos: 0, ultimoRecibo: null, falta: [] }
  for (const p of PAPELES) out[p.clave] = nombres.some((n) => p.re.test(n))
  const periodos = nombres.filter((n) => ES_RECIBO.test(n)).map(periodoDeRecibo).filter(Boolean).sort()
  out.recibos = periodos.length
  out.ultimoRecibo = periodos.at(-1) ?? null
  out.falta = PAPELES.filter((p) => !out[p.clave]).map((p) => p.rotulo)
  return out
}
