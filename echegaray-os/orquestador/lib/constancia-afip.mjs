// LA CONSTANCIA DEL TRABAJADOR DE ARCA (Simplificación Registral), LEÍDA.
//
// ═══ QUÉ ES ESTE PAPEL ═══
//
// Es la prueba de que una persona está declarada como empleada: el alta temprana. Sale de ARCA con
// todas las personas en un solo PDF, DOS páginas por cada una —«Talón para el empleador (Original)»
// y «Talón para el empleado (Duplicado)»—, y las dos dicen exactamente lo mismo salvo el número de
// trámite, que aparece sólo en el duplicado.
//
// ═══ POR QUÉ EL PARSEO VIVE ACÁ Y NO EN EL SCRIPT ═══
//
// Porque lo único que puede salir caro es atribuir mal una página: subir el alta de una persona al
// legajo de otra es peor que no subirla. Eso se prueba con texto real y sin red. El script se ocupa
// de Drive y de la base; acá no hay una sola llamada a Google.
//
// ═══ LA IDENTIDAD ES EL CUIL ═══
//
// Nunca el nombre. En este plantel hay cuatro González, dos Quiroga y dos Emiliano; y `personas`
// guarda el CUIL de dos maneras distintas —«20509455474» y «20-38218815-3»— según quién lo cargó.
// Por eso todo se compara en dígitos.

/** El CUIL en once dígitos, venga con guiones, con puntos o pelado. `null` si no son once. */
export function cuilPlano(valor) {
  const d = String(valor ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

const CAMPO = (texto, etiqueta, hasta = '\\n') =>
  (new RegExp(`${etiqueta}\\s*:?\\s*(.+?)(?=${hasta})`, 'i').exec(texto)?.[1] ?? '').trim()

/**
 * UNA PÁGINA → LO QUE DECLARA, O `null`.
 *
 * Devuelve `null` cuando la página no es una constancia legible (sin capa de texto, o sin CUIL).
 * Nunca devuelve un registro a medias con el CUIL vacío: un registro sin identidad no se puede
 * colgar de nadie y dejarlo pasar es cómo termina en el legajo equivocado.
 */
export function constanciaDePagina(texto) {
  const t = String(texto ?? '')
  if (!/CONSTANCIA DEL TRABAJADOR/i.test(t)) return null
  const cuil = cuilPlano(/CUIL\s*:\s*([\d-]+)/i.exec(t)?.[1])
  if (!cuil) return null
  const nombre = CAMPO(t, 'Apellido y nombre')
  if (!nombre) return null
  return {
    cuil,
    nombre,
    // «Alta» o «Baja»: está solo en su renglón, debajo del título.
    tipo: /CONSTANCIA DEL TRABAJADOR\s*\n\s*(Alta|Baja)/i.exec(t)?.[1] ?? 'Alta',
    // La fecha viene pegada a «Fecha Cese:» en el mismo renglón — se corta en la primera palabra.
    fechaInicio: /Fecha Inicio\s*:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t)?.[1] ?? null,
    fechaCese: /Fecha Cese\s*:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t)?.[1] ?? null,
    categoria: (/Categoria\s*:\s*\d+\s*-\s*([A-ZÁÉÍÓÚÑ ]+?)(?=\s*(?:Puesto|\n))/i.exec(t)?.[1] ?? '').trim() || null,
    // La retribución pactada es POR HORA en este convenio («Mod. Liq.: 5 - HORA»).
    retribucion: importeArca(/Retrib\. pactada\s*:\s*\$?\s*([\d.,]+)/i.exec(t)?.[1]),
    porHora: /Mod\. Liq\.\s*:\s*5\s*-\s*HORA/i.test(t),
    cuitEmpleador: cuilPlano(/CUIT\s*:\s*([\d-]+)/i.exec(t)?.[1]),
    // El talón del empleado es el único que trae el número de trámite.
    //
    // El `\b` no es decorativo: «empleador» EMPIEZA con «empleado», así que sin él el talón del
    // empleador se lee como el del empleado y las dos páginas de una persona quedan iguales.
    talon: /Talón para el empleado\b/i.test(t) ? 'empleado' : 'empleador',
    tramite: /Número de registro de trámite\s*(\d+)/i.exec(t)?.[1] ?? null,
  }
}

/**
 * EL IMPORTE COMO LO ESCRIBE ARCA: `$759,00`, `$4056,00`, y también `$4.056,00`.
 *
 * El punto es separador de miles y la coma es el decimal. Leerlo con `Number()` a secas convierte
 * «4.056,00» en 4,056 — mil veces menos — y ese número después se compara contra el piso del
 * convenio para decidir un aumento.
 */
export function importeArca(crudo) {
  if (crudo == null) return null
  const n = Number(String(crudo).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * LAS PÁGINAS → UNA CONSTANCIA POR PERSONA, CON SUS PÁGINAS.
 *
 * Agrupa por CUIL, no por posición: si ARCA cambia el orden o mete una página suelta, el agrupado
 * sigue siendo correcto. Se conserva el índice de cada página para poder recortar el PDF después.
 *
 * Cuando las dos páginas de una persona no coinciden en fecha de inicio o categoría, se marca el
 * conflicto en vez de quedarse con la primera: dos talones del mismo trámite que dicen cosas
 * distintas es un papel que alguien tiene que mirar.
 */
export function agruparPorPersona(paginas = []) {
  const porCuil = new Map()
  const descartadas = []
  paginas.forEach((texto, i) => {
    const c = constanciaDePagina(texto)
    if (!c) { descartadas.push(i); return }
    const previo = porCuil.get(c.cuil)
    if (!previo) { porCuil.set(c.cuil, { ...c, paginas: [i], conflictos: [] }); return }
    previo.paginas.push(i)
    for (const campo of ['fechaInicio', 'categoria', 'retribucion', 'nombre']) {
      if (c[campo] != null && previo[campo] != null && c[campo] !== previo[campo]) {
        previo.conflictos.push(`${campo}: «${previo[campo]}» en una página y «${c[campo]}» en otra`)
      }
    }
    if (previo.tramite == null && c.tramite != null) previo.tramite = c.tramite
  })
  return { personas: [...porCuil.values()], descartadas }
}

/**
 * EL NOMBRE DEL ARCHIVO, SEGÚN LA CONVENCIÓN DE LA CARPETA.
 *
 * Los legajos ya escriben sus altas como «Alta - Quiroga S.pdf», «Alta - Aballay Diego.pdf»,
 * «ALTA - QUIROGA ALEXANDER.pdf». Se sigue esa forma con el nombre completo y en Título, que es la
 * variante más legible de las que ya conviven. Lo que NO se hace es dejar el nombre crudo de la
 * descarga («FWEB_1988796.pdf»): dentro de un legajo ese nombre no dice nada.
 */
export function nombreDeArchivo(nombreCompleto) {
  const titulo = String(nombreCompleto ?? '').trim().toLowerCase()
    .replace(/\b[a-záéíóúñ]/g, (c) => c.toUpperCase())
  return `Alta - ${titulo}.pdf`
}

/**
 * ¿ESTA CARPETA YA TIENE EL ALTA?
 *
 * Por el nombre del archivo, que es lo único que hay: el legajo escribe «ALTA.pdf», «alta.pdf»,
 * «Alta - Fulano.pdf» y también el nombre crudo de la descarga de ARCA («FWEB_1988796.pdf»).
 *
 * **«HM» NO es un alta**: es la libreta del IERIC (fondo de cese). Este repo ya se equivocó leyendo
 * el nombre de un archivo como si dijera qué contiene, y acá el costo del error es subir un
 * duplicado —barato— o dar por presente algo que no está —caro—. Por eso la lista de lo que cuenta
 * como alta es explícita y corta.
 */
export function yaTieneAlta(nombresEnCarpeta = []) {
  return nombresEnCarpeta.some((n) => /^\s*alta\b/i.test(String(n)) || /^FWEB_\d+\.pdf$/i.test(String(n).trim()))
}
