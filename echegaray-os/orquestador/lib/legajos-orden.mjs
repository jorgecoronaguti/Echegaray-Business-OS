// CÓMO SE ORDENA EL DATA ROOM DE PERSONAL — la regla, separada de quien la ejecuta.
//
// Vive sola y sin una sola llamada a Google porque decidir DÓNDE VA CADA ARCHIVO es lo único que
// puede estar mal de forma cara: un archivo mal atribuido pone el examen médico de una persona en el
// legajo de otra, y eso en una inspección es peor que no tenerlo. Se prueba con nombres reales, sin
// red y sin tocar el Drive.

/** Sin tildes, sin puntuación, en mayúsculas: «Agüero» y «AGUERO» son la misma persona. */
export function plano(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[.,_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Las fechas pegadas al nombre de una carpeta —«AGUIRRE LEANDRO 7:2:26», «RIOS FERNANDO21:1:26»—
 *  no identifican a nadie: ensucian el nombre y rompen el orden alfabético. Se sacan del NOMBRE,
 *  nunca del archivo (ahí la fecha sí puede ser el dato). */
export function sinFechaPegada(nombre) {
  return String(nombre ?? '')
    .replace(/\s*\d{1,2}[:/-]\d{1,2}[:/-]\d{2,4}\s*$/, '')
    .replace(/(\D)\d{1,2}[:/-]\d{1,2}[:/-]\d{2,4}\s*$/, '$1')
    .trim()
}

const RUIDO = new Set(['DE', 'DEL', 'LA', 'LOS', 'Y'])

/** Los tokens que identifican a una persona. Se descartan los de una y dos letras («J.», «E»)
 *  porque una inicial no distingue a nadie: «Contreras J.» y «Contreras Javier» son la misma
 *  ambigüedad, y resolverla por la inicial es adivinar. */
export function tokens(nombre) {
  return plano(sinFechaPegada(nombre)).split(' ').filter((t) => t.length >= 3 && !RUIDO.has(t))
}

/**
 * ¿Estos dos nombres son la misma persona?
 *
 * DOS TOKENS EN COMÚN, NO UNO. Con uno solo, «GONZALEZ CARLOS» y «GONZALEZ JUAN» serían la misma
 * persona — y en este plantel hay CUATRO González. El apellido solo nunca alcanza acá.
 *
 * Devuelve `null` cuando no hay coincidencia, o el número de tokens compartidos: quien decide
 * después usa ese número para quedarse con la mejor y para detectar empates.
 */
export function coincidencia(a, b) {
  const ta = tokens(a)
  const tb = tokens(b)
  const comunes = tb.filter((t) => ta.some((u) => mismoToken(t, u)))
  return comunes.length >= 2 ? comunes.length : null
}

/**
 * DOS TOKENS SON EL MISMO APELLIDO AUNQUE ESTÉN ESCRITOS DISTINTO.
 *
 * El data room escribe «GONZALEZ» y «GONZALES», «ZOGBE» y «ZOGBER», «GONZALES TOBARES» y «GONZALEZ
 * TOBARES» — a veces en el mismo legajo. Exigir el token idéntico dejaba sin atribuir a media
 * docena de personas reales.
 *
 * Se acepta UNA letra de diferencia y sólo en tokens de cinco letras o más: en uno corto, una letra
 * es la diferencia entre dos nombres distintos («JUAN» y «JUANA», «LUIS» y «LUCA»).
 */
function mismoToken(a, b) {
  if (a === b) return true
  if (a.length < 5 || b.length < 5) return false
  // NOMBRE CORTADO EN LA PLANILLA. La nómina trae «RETA RAMON HECTOR SEBAST» —la celda quedó
  // truncada— y la carpeta dice «Reta Sebastian». Sin esto, una persona ACTIVA quedaba clasificada
  // como fuera de la nómina por un nombre cortado. Cinco letras de prefijo ya no son casualidad.
  if (a.startsWith(b) || b.startsWith(a)) return true
  if (Math.abs(a.length - b.length) > 1) return false
  return distancia(a, b) <= 1
}

/** Levenshtein, cortada en 2: no interesa cuánto difieren, sólo si difieren en más de una letra. */
function distancia(a, b) {
  let fila = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const previa = fila
    fila = [i]
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(
        previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    if (Math.min(...fila) > 1) return 2
  }
  return fila[b.length]
}

/** El tipo de documento, leído del nombre del archivo. El orden importa: «ALTA TEMPRANA» tiene que
 *  ganarle a «ALTA» y por eso las expresiones son específicas. */
const TIPOS = [
  [/^ALTA\b|ALTA TEMPRANA|F\.?885|FWEB/i, 'ALTA'],
  [/^BAJA\b|TELEGRAMA|RENUNCIA/i, 'BAJA'],
  [/^DNI\b|DOCUMENTO/i, 'DNI'],
  [/^HM\b|HM \d|MEDIC|PREOCUPACIONAL/i, 'EXAMEN MEDICO'],
  [/^EPP\b|PROTECCION/i, 'EPP'],
  [/CAPACITA/i, 'CAPACITACION'],
  [/LOTE|LIQUIDA|RECIBO|SUELDO/i, 'RECIBO'],
  [/FONDO DE CESE|CESE LABORAL/i, 'FONDO DE CESE'],
  [/TRANSFEREN|COMPROBANTE DE PAGO/i, 'TRANSFERENCIA'],
]

export function tipoDeDocumento(nombreArchivo) {
  for (const [re, tipo] of TIPOS) if (re.test(nombreArchivo)) return tipo
  return null
}

/**
 * El nombre de la PERSONA dentro del nombre de un archivo suelto.
 *
 * El patrón real del data room es `TIPO - Nombre.pdf`, con variantes sin guión («Alta Santander
 * Walter.pdf») y con fecha intercalada («HM 24:4- FERREYRA RODOLFO.pdf»). Se saca el tipo, la
 * extensión, la fecha y los sufijos de copia (`_1`), y lo que queda es el nombre.
 */
export function personaDeArchivo(nombreArchivo) {
  let s = String(nombreArchivo ?? '').replace(/\.[a-z0-9]{2,5}$/i, '')
  s = s.replace(/_\d+$/, '')                                   // «_1» de copia
  s = s.replace(/^\s*[A-Za-zÁÉÍÓÚÑ]+\s*\d{1,2}[:/-]\d{1,2}\s*-\s*/, '')  // «HM 24:4- »
  s = s.replace(/^\s*[A-Za-zÁÉÍÓÚÑ]{2,12}\s*-\s*/, '')          // «HM - », «Alta - »
  s = s.replace(/^\s*(ALTA|BAJA|DNI|HM|EPP)\s+/i, '')           // «Alta Santander Walter»
  s = s.replace(/\s*\d{1,2}[:/-]\d{1,2}([:/-]\d{2,4})?\s*$/, '') // fecha al final
  return s.trim()
}

/**
 * A qué carpeta va cada archivo suelto.
 *
 * `candidatos` = [{ id, nombre }] (las carpetas de persona que ya existen).
 * Devuelve `{ archivo, persona, tipo, destino, motivo }`. `destino` en `null` significa QUE NO SE
 * TOCA: ni se adivina ni se inventa una carpeta. Un archivo que no se puede atribuir con certeza se
 * queda donde está y se declara — moverlo "por las dudas" es peor que dejarlo suelto.
 */
export function ubicar(archivo, candidatos, universo = null) {
  const persona = personaDeArchivo(archivo.name)
  const tipo = tipoDeDocumento(archivo.name)
  if (!persona) return { archivo, persona: null, tipo, destino: null, motivo: 'el nombre no dice de quién es' }

  // ═══ UN SOLO APELLIDO ALCANZA SI ES ÚNICO EN TODO EL PLANTEL ═══
  //
  // «HM - POBLETE.pdf», «EPP - GALVAN.pdf», «HM - SANTANDER W.pdf»: un token no llega a los dos que
  // exige `coincidencia`, y sin esto quedaban sueltos para siempre. Pero si en las 45 carpetas hay
  // UNA sola que dice POBLETE, no hay nada que adivinar. Con dos —los cuatro González, los dos
  // Quiroga— vuelve a ser ambiguo y se deja quieto.
  //
  // «ÚNICO» SE MIDE CONTRA TODO EL UNIVERSO, NO SÓLO CONTRA LAS CARPETAS QUE YA EXISTEN. Hay UNA
  // carpeta «FERREYRA EZEQUIEL», así que contra las carpetas «FERREYRA» parecía único — y los
  // `EPP - FERREYRA A` y `EPP - FERREYRA R` se iban al legajo de Ezequiel. Entre los papeles
  // sueltos hay además un Ferreyra Alejandro y un Ferreyra Rodolfo: tres personas, no una.
  const sueltoTok = tokens(persona)
  if (sueltoTok.length === 1) {
    const nombres = universo ?? candidatos.map((c) => c.name)
    // CUENTA PERSONAS, NO CADENAS. «GALVAN GUADALUPE» y «Guadalupe Galván» son tres formas de
    // escribir a la misma, y contarlas como tres dejaba sin atribuir a media docena de personas.
    // La clave es el conjunto de tokens ORDENADO, así el orden invertido no inventa una persona.
    // Y las variantes de UN solo token («POBLETE», «CONTRERAS J.») no cuentan como persona propia:
    // son justamente las que se están tratando de ubicar.
    const distintas = new Set(
      nombres
        .filter((n) => tokens(n).length >= 2 && tokens(n).some((t) => mismoToken(t, sueltoTok[0])))
        .map((n) => tokens(n).slice().sort().join(' ')))
    const conEseApellido = candidatos.filter((c) => tokens(c.name).some((t) => mismoToken(t, sueltoTok[0])))
    if (distintas.size === 1 && conEseApellido.length === 1) {
      return { archivo, persona, tipo, destino: conEseApellido[0], motivo: null }
    }
    if (distintas.size > 1) {
      return { archivo, persona, tipo, destino: null, motivo: `«${sueltoTok[0]}» es de ${distintas.size} personas distintas` }
    }
  }

  const puntuados = candidatos
    .map((c) => ({ c, puntos: coincidencia(persona, c.name) }))
    .filter((x) => x.puntos !== null)
    .sort((a, b) => b.puntos - a.puntos)

  if (puntuados.length === 0) return { archivo, persona, tipo, destino: null, motivo: 'no tiene carpeta' }
  // EMPATE = NO SE TOCA. Dos carpetas con el mismo puntaje sobre el mismo nombre es exactamente el
  // caso «Peralta Alexander Ricardo» contra «Peralta Ricardo»: son dos personas distintas y elegir
  // una por orden alfabético metería el documento de una en el legajo de la otra.
  if (puntuados.length > 1 && puntuados[0].puntos === puntuados[1].puntos) {
    return { archivo, persona, tipo, destino: null, motivo: `ambiguo entre ${puntuados[0].c.name} y ${puntuados[1].c.name}` }
  }
  return { archivo, persona, tipo, destino: puntuados[0].c, motivo: null }
}

/** ACTIVO / INACTIVO / SIN NÓMINA, según la nómina real —no según si hay un papel de baja en la
 *  carpeta—. El Drive se atrasa: hay ocho carpetas sin baja cargada de gente que ya no está. */
export function estadoSegunNomina(nombreCarpeta, nomina) {
  const puntuados = nomina
    .map((p) => ({ p, puntos: coincidencia(nombreCarpeta, p.nombre) }))
    .filter((x) => x.puntos !== null)
    .sort((a, b) => b.puntos - a.puntos)
  if (puntuados.length === 0) return { estado: 'SIN NOMINA', persona: null }
  if (puntuados.length > 1 && puntuados[0].puntos === puntuados[1].puntos) {
    return { estado: 'A REVISAR', persona: null, motivo: `ambiguo entre ${puntuados[0].p.nombre} y ${puntuados[1].p.nombre}` }
  }
  return { estado: puntuados[0].p.activo ? 'ACTIVOS' : 'INACTIVOS', persona: puntuados[0].p }
}

/**
 * LA GENTE QUE TIENE PAPELES Y NO TIENE LEGAJO.
 *
 * Cincuenta y un archivos sueltos son de personas sin carpeta: Agüero, Maldonado, los dos Ferreyra,
 * Salinas, Contreras… Dejarlos sueltos «porque no hay dónde ponerlos» es exactamente el desorden
 * que hay que arreglar: la carpeta se crea, que es lo que un legajo necesita.
 *
 * Los archivos se agrupan por persona entre sí —«HM - FERREYRA RODOLFO» y «DNI - Ferreyra Rodolfo»
 * son la misma— y el nombre del legajo es la variante MÁS LARGA que aparezca, que es la que más
 * identifica. Un grupo de un solo token («SANCHEZ») igual se crea: es un apellido, y es lo único
 * que se sabe.
 */
/** Los tipos que hacen que un archivo sea el legajo DE ALGUIEN. Una capacitación sobre una obra
 *  («Capacitan - Cocheras») o una plantilla («CARATULAS EMPLEADOS») no son de una persona: crearles
 *  un legajo inventa un empleado que no existe. */
const DE_UNA_PERSONA = new Set(['ALTA', 'BAJA', 'DNI', 'EXAMEN MEDICO', 'EPP', 'RECIBO'])

export function esLegajoDeAlguien(archivos) {
  return archivos.some((f) => DE_UNA_PERSONA.has(tipoDeDocumento(f.name)))
}

export function gruposSinLegajo(sueltos) {
  const grupos = []
  for (const f of sueltos) {
    const persona = personaDeArchivo(f.name)
    if (!persona || tokens(persona).length === 0) continue
    const g = grupos.find((x) => coincidencia(x.nombre, persona)
      || (tokens(x.nombre).length === 1 && tokens(persona).some((t) => mismoToken(t, tokens(x.nombre)[0])))
      || (tokens(persona).length === 1 && tokens(x.nombre).some((t) => mismoToken(t, tokens(persona)[0]))))
    if (g) {
      g.archivos.push(f)
      // El nombre más largo gana: «FERREYRA» pierde contra «FERREYRA RODOLFO».
      if (tokens(persona).length > tokens(g.nombre).length) g.nombre = persona
    } else {
      grupos.push({ nombre: persona, archivos: [f] })
    }
  }
  return grupos.map((g) => ({ ...g, nombre: plano(g.nombre) }))
}
