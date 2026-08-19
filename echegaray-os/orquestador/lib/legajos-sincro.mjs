// EL DATA ROOM DE PERSONAL → EL MÓDULO PERSONAL. Núcleo PURO: sin Drive, sin base, sin red.
//
// Recibe la foto de la carpeta ya ordenada (`1. ACTIVOS` / `2. INACTIVOS` / `3. A REVISAR` /
// `9. ADMINISTRACIÓN`) y las personas que ya existen en la base, y devuelve el PLAN: a quién hay que
// crear, qué carpeta le corresponde a quién, y qué papel es cada archivo. No escribe nada: eso lo
// hace `scripts/legajos-sincronizar.mjs`, que además puede correr en seco.
//
// ═══ TRES REGLAS QUE NO SE NEGOCIAN ═══
//
// 1. NO SE INVENTA UNA PERSONA. Sólo se crean legajos desde las carpetas del data room, nunca desde
//    un archivo suelto que no se pudo atribuir. `9. ADMINISTRACIÓN` no es de nadie y se ignora
//    entero: adentro hay cocheras, telegramas y el fondo de cese, no empleados.
// 2. NO SE INVENTA UNA FECHA. `fecha_documento` sale del NOMBRE del archivo cuando el nombre la
//    trae completa (día, mes y año). La fecha de subida a Drive NO es la fecha del papel: un alta de
//    2024 escaneada en 2026 diría 2026, y eso es un dato falso con apariencia de dato.
// 3. LO QUE ESCRIBIÓ UNA PERSONA NO SE PISA. El plan sólo propone completar lo que está vacío;
//    quién decide sobreescribir es el script, y por defecto no lo hace.

import { coincidencia, mismoToken, sinFechaPegada, tokens } from './legajos-orden.mjs'

export const BUCKET_ACTIVOS = '1. ACTIVOS'
export const BUCKET_INACTIVOS = '2. INACTIVOS (fuera de la nomina vigente)'
export const PREFIJO_REVISAR = '3.'
export const PREFIJO_ADMIN = '9.'

/** El vocabulario del legajo. Es el mismo CHECK que tiene la base y el mismo selector que ofrece la
 *  pantalla: si estas tres listas se separan, vincular un documento vuelve a fallar con 23514. */
export const CATEGORIAS = [
  'dni', 'cuil', 'alta_temprana', 'ieric', 'contrato', 'art', 'libreta_fondo_cese',
  'examen_medico', 'epp', 'capacitacion', 'recibo_sueldo', 'licencia_conducir', 'baja', 'otro',
]

/** Lo que un legajo de alguien que TRABAJA HOY tiene que tener. Es el criterio del dueño y el que
 *  mira IERIC: alta, identidad, apto médico y entrega de elementos de protección. Faltarle uno a un
 *  activo es exposición concreta, no un hueco administrativo. */
export const REQUERIDOS_ACTIVO = ['alta_temprana', 'dni', 'examen_medico', 'epp']

const PLANO = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// El orden importa: «Ramos Baja ARCA» es una baja aunque diga ARCA, y «Alta - Aballay» es un alta
// aunque el apellido tenga las mismas letras. Se compara con límite de palabra, nunca por substring.
const REGLAS = [
  [/\bBAJA\b|\bTELEGRAMA\b|\bRENUNCIA\b|\bDESPIDO\b|\bACUSE\b/, 'baja'],
  [/\bALTA\b|\bFWEB\b|\bF\.?885\b|\bIERIC\b/, 'alta_temprana'],
  [/\bDNI\b|\bDOCUMENTO\b|\bFRENTE\b|\bDORSO\b/, 'dni'],
  [/\bHM\b|\bMEDIC/, 'examen_medico'],
  [/\bEPP\b|PROTECCION/, 'epp'],
  [/CAPACITA/, 'capacitacion'],
  [/\bRECIBO\b|LIQUIDACION|\bSUELDO\b|\bLOTE\b/, 'recibo_sueldo'],
  [/FONDO DE CESE|\bAFON\b|\bFCL\b/, 'libreta_fondo_cese'],
  [/\bCUIL\b/, 'cuil'],
  [/\bART\b|ASEGURADORA/, 'art'],
  [/\bCONTRATO\b/, 'contrato'],
  [/LICENCIA|\bCARNET\b/, 'licencia_conducir'],
]

/**
 * Qué papel es este archivo.
 *
 * Nunca devuelve null: lo que no se reconoce es `'otro'`, y ES un documento del legajo igual. Una
 * boleta de multa y un «Nuevo doc 26-6-18.pdf» están en la carpeta de una persona por algo; dejarlos
 * afuera del módulo porque no encajan en una categoría los desaparece de la vista.
 */
export function categoriaDeArchivo(nombreArchivo) {
  const n = PLANO(nombreArchivo).replace(/[._-]/g, ' ')
  for (const [re, cat] of REGLAS) if (re.test(n)) return cat
  return 'otro'
}

/**
 * La fecha del documento, SÓLO si el nombre la trae entera.
 *
 * El data room escribe «BAJA - 30:6:25», «HM - IVAN ROSALES 9:6:25», «TELEGRAMA - RESP 04:5:26» y
 * también «HM 24:4- FERREYRA» (día y mes, sin año) y «Acuse_20260122161346». Con día y mes solos no
 * hay fecha: devolver una adivinando el año sería inventarla, y devuelve null.
 */
export function fechaDelArchivo(nombreArchivo) {
  // El guión bajo es carácter de palabra: sin sacarlo, `\b` no ve el corte en «Acuse_20260122».
  const n = String(nombreArchivo ?? '').replace(/_/g, ' ')
  const compacta = n.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})\d*/)
  if (compacta) return valida(+compacta[1], +compacta[2], +compacta[3])
  const suelta = n.match(/(?<!\d)(\d{1,2})[:/-](\d{1,2})[:/-](\d{2,4})(?!\d)/)
  if (!suelta) return null
  const anio = suelta[3].length === 2 ? 2000 + +suelta[3] : +suelta[3]
  return valida(anio, +suelta[2], +suelta[1])
}

function valida(a, m, d) {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const p = new Date(iso + 'T00:00:00Z')
  return Number.isNaN(p.getTime()) || p.toISOString().slice(0, 10) !== iso ? null : iso
}

/** El nombre con el que se crea el legajo: mayúsculas y sin la fecha pegada, PERO con sus acentos.
 *  «Guadalupe Galván» no se guarda «GALVAN»: el nombre de una persona no es un identificador. */
export function nombreCanonico(nombreCarpeta) {
  return sinFechaPegada(nombreCarpeta).toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * A qué persona de la base corresponde esta carpeta.
 *
 * `coincidencia` exige DOS tokens en común y ya resuelve las variantes de escritura del data room
 * (GONZALEZ/GONZALES, ZOGBE/ZOGBER). Lo que no resuelve son los empates, y acá hay muchos: la
 * carpeta «GONZALEZ TOBARES EMILIANO» comparte dos tokens con «GONZALEZ EMILIANO» y otros dos con
 * «GONZALEZ TOBARES JUAN GUILLERMO».
 *
 * El desempate es por PROPORCIÓN de nombre compartido, no por cantidad: contra «GONZALEZ EMILIANO»
 * comparte 2 de 3 tokens distintos, contra el otro 2 de 5. Si ni así se despega, la carpeta queda
 * SIN emparejar y se declara — atarla a la persona equivocada mete el legajo de uno en la ficha de
 * otro, que es el error caro de todo esto.
 */
export function personaDeCarpeta(nombreCarpeta, personas) {
  const tc = tokens(nombreCarpeta)

  // UN SOLO APELLIDO. «SANCHEZ», «NARBAEZ», «BALMACEDA», «SAAVEDRA» e «ISAGUIRRE» son carpetas de
  // una palabra: nunca llegan a los dos tokens que `coincidencia` exige, así que sin esto se
  // crearía un legajo nuevo al lado del que ya existe. Si en toda la base hay UNA persona con ese
  // apellido no hay nada que adivinar; con dos vuelve a ser ambiguo y se deja quieta.
  if (tc.length === 1) {
    const conEseApellido = personas.filter((p) => tokens(p.nombre_completo).some((t) => mismoToken(t, tc[0])))
    if (conEseApellido.length === 1) return { persona: conEseApellido[0], motivo: null }
    if (conEseApellido.length > 1) {
      return { persona: null, motivo: `ambigua entre ${conEseApellido.map((p) => p.nombre_completo).join(' y ')}` }
    }
    return { persona: null, motivo: 'no está en la base' }
  }

  const puntuadas = personas
    .map((p) => {
      const comunes = coincidencia(nombreCarpeta, p.nombre_completo)
      if (comunes === null) return null
      const union = new Set([...tc, ...tokens(p.nombre_completo)]).size
      return { persona: p, comunes, prop: union === 0 ? 0 : comunes / union }
    })
    .filter(Boolean)
    .sort((a, b) => b.comunes - a.comunes || b.prop - a.prop)
  if (puntuadas.length === 0) return { persona: null, motivo: 'no está en la base' }
  const [primera, segunda] = puntuadas
  if (segunda && segunda.comunes === primera.comunes && segunda.prop === primera.prop) {
    return { persona: null, motivo: `ambigua entre ${primera.persona.nombre_completo} y ${segunda.persona.nombre_completo}` }
  }
  return { persona: primera.persona, motivo: null }
}

/**
 * LA NÓMINA VIGENTE → EL MÓDULO. Puro.
 *
 * ═══ POR QUÉ LA NÓMINA MANDA Y NO EL DATA ROOM ═══
 *
 * La carpeta ordenada separa activos de inactivos, pero sólo conoce a quien tiene PAPELES. La nómina
 * conoce a quien COBRA, que es la pregunta. Los dos casos que lo prueban están hoy en la empresa:
 * ROSALES DIEGO JOSE trabaja y no tiene un solo documento en el data room —sin la nómina no existiría
 * en el módulo—, y QUIROGA SEBASTIAN ADOLFO trabaja pero su carpeta quedó en «3. A REVISAR» porque
 * hay dos Sebastián Quiroga: la persona es segura aunque la carpeta no lo sea.
 *
 * `nomina`: [{ nombre, legajo, cargo, activo }]. Se empareja primero por número de legajo —exacto, no
 * adivina— y sólo si no lo hay, por nombre.
 */
export function planDeNomina({ nomina, personas }) {
  const plan = { altas: [], cambios: [], ambiguas: [], fueraDeNomina: [] }
  const enNomina = new Set()

  for (const fila of nomina) {
    const porLegajo = fila.legajo ? personas.find((p) => p.legajo && p.legajo === fila.legajo) : null
    const { persona, motivo } = porLegajo ? { persona: porLegajo, motivo: null } : personaDeCarpeta(fila.nombre, personas)
    if (!persona) {
      if (motivo?.startsWith('ambigua')) plan.ambiguas.push({ nomina: fila.nombre, motivo })
      plan.altas.push({
        nombre: nombreCanonico(fila.nombre.replace(/,/g, ' ')),
        legajo: fila.legajo || null, puesto: fila.cargo || null, en_la_empresa: fila.activo,
      })
      continue
    }
    enNomina.add(persona.id)
    // SÓLO SE COMPLETA LO VACÍO. `puesto` puede haberlo corregido alguien en la ficha; el cargo de la
    // planilla no tiene por qué ganarle a una corrección hecha a mano.
    const cambio = { persona }
    if (fila.legajo && persona.legajo !== fila.legajo) cambio.legajo = fila.legajo
    if (fila.cargo && !persona.puesto) cambio.puesto = fila.cargo
    if (persona.en_la_empresa !== fila.activo) cambio.en_la_empresa = fila.activo
    if (Object.keys(cambio).length > 1) plan.cambios.push(cambio)
  }

  plan.fueraDeNomina = personas.filter((p) => !enNomina.has(p.id)).map((p) => p.id)
  return plan
}

/**
 * EL PLAN COMPLETO. Puro: entra la foto, sale qué habría que hacer.
 *
 * `carpetas`: [{ id, name, ruta }] las carpetas de persona. `archivos`: [{ id, name, ruta }] con
 * `ruta` = `bucket/carpeta`. `personas`: [{ id, nombre_completo, drive_folder_id, en_la_empresa }].
 */
export function planDeSincronizacion({ carpetas, archivos, personas }) {
  const dePersona = carpetas.filter((c) => !c.ruta.startsWith(PREFIJO_ADMIN))
  const plan = {
    altas: [], vinculos: [], egresos: [], reingresos: [],
    documentos: [], ambiguas: [], pendientes: [], sinCarpeta: [],
  }
  const usadas = new Set()

  for (const carpeta of dePersona) {
    // `3. A REVISAR` es la carpeta de las dudas: entra al módulo como legajo igual —la persona
    // existe— pero nunca se empareja a ciegas con una fila de la base.
    const enRevision = carpeta.ruta.startsWith(PREFIJO_REVISAR)
    const activa = carpeta.ruta === BUCKET_ACTIVOS
    const yaVinculada = personas.find((p) => p.drive_folder_id === carpeta.id)
    const { persona, motivo } = yaVinculada
      ? { persona: yaVinculada, motivo: null }
      : (enRevision ? { persona: null, motivo: 'está en 3. A REVISAR' } : personaDeCarpeta(carpeta.name, personas))

    if (!persona) {
      // UNA CARPETA EN «3. A REVISAR» NO SE CARGA. Está ahí porque su nombre da para dos personas
      // distintas de la nómina; crear un legajo con ese nombre inventa un empleado, y ponerlo en
      // cualquiera de los dos estados es adivinar si sigue trabajando. Se declara y lo mira alguien.
      if (enRevision) { plan.pendientes.push({ carpeta: carpeta.name, motivo }); continue }
      if (motivo?.startsWith('ambigua')) plan.ambiguas.push({ carpeta: carpeta.name, motivo })
      plan.altas.push({ carpeta, nombre: nombreCanonico(carpeta.name), en_la_empresa: activa, motivo })
    } else if (usadas.has(persona.id)) {
      // DOS CARPETAS PARA LA MISMA PERSONA. `drive_folder_id` es único, así que la segunda pisaría a
      // la primera y el legajo quedaría partido sin que nadie se entere. Se declara y no se toca.
      plan.ambiguas.push({ carpeta: carpeta.name, motivo: `${persona.nombre_completo} ya tiene otra carpeta vinculada` })
      continue
    } else {
      usadas.add(persona.id)
      if (persona.drive_folder_id !== carpeta.id) {
        plan.vinculos.push({ persona, carpeta, anterior: persona.drive_folder_id ?? null })
      }
      // El estado sale de la NÓMINA —que es lo que los dos primeros buckets ya materializan—, no de
      // si hay o no un papel de baja: hay ocho carpetas de gente que se fue sin baja cargada.
      // A QUIEN ESTÁ EN LA NÓMINA NO LO DA DE BAJA UNA CARPETA. La nómina ya dijo si cobra; el
      // bucket sólo decide el estado de los que no figuran en ella —los 43 que ya se fueron—.
      if (!enRevision && !persona.en_nomina && persona.en_la_empresa !== activa) {
        (activa ? plan.reingresos : plan.egresos).push({ persona, carpeta: carpeta.name })
      }
    }

    const clave = carpeta.ruta + '/' + carpeta.name
    for (const a of archivos.filter((f) => f.ruta === clave)) {
      plan.documentos.push({
        carpeta_id: carpeta.id,
        persona_id: persona?.id ?? null,
        drive_file_id: a.id,
        nombre: a.name,
        tipo_documento: categoriaDeArchivo(a.name),
        fecha_documento: fechaDelArchivo(a.name),
      })
    }
  }

  plan.sinCarpeta = personas.filter((p) => !usadas.has(p.id)).map((p) => ({ id: p.id, nombre: p.nombre_completo }))
  return plan
}

/** Qué le falta a un legajo para estar completo. Sólo tiene sentido para quien trabaja hoy: al que
 *  ya no está no se le puede pedir un apto médico. */
export function faltantes(categorias) {
  const tiene = new Set(categorias)
  return REQUERIDOS_ACTIVO.filter((r) => !tiene.has(r))
}
