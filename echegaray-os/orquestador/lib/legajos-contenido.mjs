// QUÉ DICE EL PAPEL POR DENTRO. Núcleo PURO: recibe el texto de un PDF y devuelve qué documento es
// y de quién. Sin red, sin Drive, sin base.
//
// ═══ POR QUÉ HACE FALTA SI YA HAY UN CLASIFICADOR ═══
//
// `legajos-sincro.categoriaDeArchivo` deduce el tipo del NOMBRE del archivo, y el nombre miente. En
// este data room hay dos papeles llamados «HM - QUIROGA…» —así se llama acá el examen médico— que
// son, leídos adentro, la Libreta de Fondo de Cese del IERIC. Con el tipo equivocado, el legajo de
// alguien que trabaja hoy figuraba con apto médico y sin libreta: exactamente al revés.
//
// El nombre del archivo es una PISTA. El contenido es la EVIDENCIA. Cuando hay contenido, manda.
//
// ═══ EL LÍMITE, DECLARADO ═══
//
// Buena parte del data room son fotos y escaneos sin capa de texto: ahí no hay nada que leer y el
// nombre sigue siendo lo único que se sabe. Este módulo NUNCA adivina para esos: devuelve `null` y
// quien lo llama tiene que decir cuántos quedaron sin verificar. Un porcentaje de verificación que
// esconde lo no verificable no es una verificación.

/** Menos que esto es un escaneo con basura de OCR o los números de página: no hay texto que leer. */
export const MINIMO_TEXTO = 200

import { coincidencia, mismoToken, tokens } from './legajos-orden.mjs'

const PLANO = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// Cada marca es una frase impresa del formulario, no una palabra suelta: «MEDIC» aparece en la obra
// social de un alta y clasificaría media docena de altas como exámenes médicos.
const MARCAS = [
  [/LIBRETA DE FONDO DE CESE|FONDO DE CESE LABORAL/, 'libreta_fondo_cese'],
  [/ENTREGA DE ROPA DE TRABAJO|ELEMENTOS DE PROTECCION PERSONAL|RESOLUCION 299/, 'epp'],
  // OJO: la constancia de Simplificación Registral es EL MISMO formulario para el alta y para la
  // baja — dice cuál es en la palabra que sigue al título—. Tratarlas iguales convertía las 26 bajas
  // del data room en altas. Por eso el acto se lee aparte, en `actoDeLaConstancia`.
  [/SIMPLIFICACION REGISTRAL|CONSTANCIA DEL TRABAJADOR|ALTA TEMPRANA/, 'constancia'],
  [/COMUNICACION DE BAJA|BAJA DEL TRABAJADOR|TELEGRAMA|CARTA DOCUMENTO/, 'baja'],
  [/EXAMEN PREOCUPACIONAL|APTO MEDICO|EXAMEN PERIODICO|HISTORIA CLINICA/, 'examen_medico'],
  [/CONSTANCIA DE CUIL|CLAVE UNICA DE IDENTIFICACION LABORAL/, 'cuil'],
  [/CONTRATO DE TRABAJO/, 'contrato'],
  [/CONSTANCIA DE COBERTURA|ASEGURADORA DE RIESGOS DEL TRABAJO/, 'art'],
  [/RECIBO DE (HABERES|SUELDO)|LIQUIDACION FINAL/, 'recibo_sueldo'],
  [/CERTIFICADO DE CAPACITACION|CAPACITACION EN SEGURIDAD/, 'capacitacion'],
]

/** El tipo que el papel declara ser. `null` = el texto no alcanza para decirlo. */
export function tipoSegunContenido(texto) {
  const t = PLANO(texto).replace(/\s+/g, ' ')
  if (t.length < MINIMO_TEXTO) return null
  for (const [re, tipo] of MARCAS) {
    if (!re.test(t)) continue
    return tipo === 'constancia' ? (actoDeLaConstancia(texto) === 'baja' ? 'baja' : 'alta_temprana') : tipo
  }
  return null
}

/** «CONSTANCIA DEL TRABAJADOR Alta …» o «… Baja …». Es la única diferencia entre los dos, y decide
 *  si el papel es el alta temprana de alguien o su baja. */
export function actoDeLaConstancia(texto) {
  const m = PLANO(texto).replace(/\s+/g, ' ').match(/CONSTANCIA DEL TRABAJADOR\s+(ALTA|BAJA)/)
  return m ? m[1].toLowerCase() : null
}

/**
 * Las fechas que la constancia declara: inicio de la relación y cese.
 *
 * Son las fechas REALES —las que el fisco tiene registradas—, no una inferencia. Es de acá que sale
 * la fecha de egreso de quien se fue: hasta ahora 15 legajos no tenían ninguna y la única
 * alternativa era inventarla. `Fecha Cese:` viene vacío en un alta, y entonces devuelve null.
 */
export function fechasDeLaConstancia(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ')
  const leer = (rotulo) => {
    const m = t.match(new RegExp(rotulo + ':?\\s*(\\d{2})/(\\d{2})/(\\d{4})'))
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null
  }
  return { inicio: leer('Fecha Inicio'), cese: leer('Fecha Cese') }
}

/** La obra social y la ART que declara la constancia, sin el código de tabla que las precede. */
export function coberturaDeLaConstancia(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ')
  const os = t.match(/Obra Social:\s*\d+\s*-\s*([^:]{3,80}?)\s+Modalidad de contrato/)
  const art = t.match(/ART vigente:\s*\d+\s*-\s*([^:]{3,80}?)\s+Regimen/)
  const limpiar = (x) => (x ? x[1].replace(/\s+/g, ' ').trim() : null)
  return { obraSocial: limpiar(os), art: limpiar(art) }
}

/**
 * El CUIL del trabajador. SÓLO el que está ROTULADO «CUIL».
 *
 * ═══ EL ERROR QUE ESTA REGLA CORRIGE ═══
 *
 * La primera versión tomaba el primer número de once dígitos del texto, y en cinco legajos —Ahumada,
 * Ochoa, Petina, Quiroga Alexander, Zogbe— eso devolvió `30716304643`: el CUIT de ECHEGARAY
 * CONSTRUCCIONES S.A.S. Todos los formularios de alta y de baja empiezan por el EMPLEADOR, así que
 * el primer número nunca es el del trabajador. Cinco personas iban a quedar con el CUIT de la
 * empresa cargado como CUIL propio.
 *
 * Pedir el rótulo cuesta cobertura —un papel que no lo escriba no da CUIL— y esa es la elección
 * correcta: un CUIL en blanco es un dato que falta, uno equivocado es un dato falso.
 */
export function cuilDelTexto(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ')
  const m = t.match(/\bC\.?U\.?I\.?L\.?\b[^0-9]{0,40}?(\d{2})[ .-]?(\d{8})[ .-]?(\d)\b/i)
  return m ? m[1] + m[2] + m[3] : null
}

/**
 * El nombre del trabajador tal como lo escribe el formulario.
 *
 * Los dos formularios que traen texto lo rotulan distinto: el alta dice «Apellido y nombre: X» y la
 * libreta del IERIC lo dibuja con rayitas —«Apellido y nombre [ ] __ __ __ QUIROGA, SEBASTIAN A.»—.
 * Se corta en el rótulo siguiente, que en los dos casos es CUIL o DNI.
 */
export function nombreDelTexto(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ')
  const m = t.match(/Apellido y nombre[^A-Za-zÁÉÍÓÚÑ]{0,80}?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ,. ]{5,60}?)\s*(?:CUIL|C\.U\.I\.L|DNI|Doc)/i)
  if (m) return m[1].replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  const n = t.match(/Nombre y [Aa]pellido del [Tt]rabajador:?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ]{5,60}?)\s*(?:\(?8\)?)?\s*D\.?N\.?I/)
  return n ? n[1].replace(/\s+/g, ' ').trim() : null
}


/**
 * ¿El nombre impreso en el papel y el dueño de la carpeta son la misma persona?
 *
 * ═══ POR QUÉ NO ALCANZA `coincidencia` ═══
 *
 * Cinco legajos del data room se llaman con un apellido y nada más: BALMACEDA, ISAGUIRRE, NARBAEZ,
 * SAAVEDRA, SANCHEZ. `coincidencia` exige DOS tokens en común, así que contra «BALMACEDA GONZALEZ
 * MAXIMILIANO A» daba distinto — y el informe acusaba de estar en el legajo ajeno a cinco papeles
 * que estaban perfectamente en el suyo.
 *
 * Cuando el legajo tiene UN solo apellido, el apellido es todo lo que se sabe y es con lo único que
 * se puede comparar. Cuando tiene nombre y apellido, se exigen los dos: es justamente lo que deja
 * ver que «CONTRERAS LUCAS LEONEL» no es «CONTRERAS JAVIER».
 */
export function mismaPersona(nombreDelPapel, nombreDelLegajo) {
  const legajo = tokens(nombreDelLegajo)
  if (legajo.length === 1) {
    return tokens(nombreDelPapel).some((t) => mismoToken(t, legajo[0]))
  }
  return coincidencia(nombreDelPapel, nombreDelLegajo) !== null
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// LA LIBRETA DEL IERIC ES EL LEGAJO ENTERO EN UNA HOJA
// ═════════════════════════════════════════════════════════════════════════════════════════════════
//
// Sesenta de los papeles del data room son esta libreta, y trae —en texto, no en un escaneo— casi
// todo lo que la ficha tenía en «sin cargar»: documento, nacimiento, nacionalidad, domicilio
// completo, categoría de convenio, especialidad, ART y fecha de ingreso.
//
// ═══ LA TRAMPA: LA HOJA TIENE DOS DOMICILIOS ═══
//
// Después de «Datos del empleador» se repiten Domicilio, Localidad, Código Postal y Provincia — pero
// son los de ECHEGARAY CONSTRUCCIONES (AV. RIOJA (NORTE) 75). Leer el segundo le pone a los sesenta
// trabajadores el domicilio de la empresa como propio, y el teléfono que figura ahí también es el de
// la empresa: por eso el texto se corta antes y `telefono` NO sale de acá.

/** Los rótulos del bloque del trabajador, EN EL ORDEN EN QUE LA HOJA LOS IMPRIME: cada valor es lo
 *  que va entre un rótulo y el siguiente. */
const CAMPOS_LIBRETA = [
  ['nombre', 'Apellido y nombre'], ['cuil', 'CUIL'], ['calle', 'Domicilio'], ['nro', 'Nro'],
  ['piso', 'Piso'], ['depto', 'Depto'], ['localidad', 'Localidad'], ['cp', 'Código Postal'],
  ['provincia', 'Provincia'], ['documento', 'Doc. identidad'], ['art', 'A.R.T'],
  ['nacionalidad', 'Nacionalidad'], ['nacimiento', 'Fecha de nacimiento'], ['categoria', 'Categoría'],
  ['especialidad', 'Especialidad'], ['ingreso', 'Fecha de ingreso del trabajador'],
  ['egreso', 'Fecha de egreso del trabajador'],
]

const CATEGORIA_CONVENIO = {
  'OFICIAL ESPECIALIZADO': 'oficial_especializado',
  'MEDIO OFICIAL': 'medio_oficial',
  OFICIAL: 'oficial',
  AYUDANTE: 'ayudante',
}

/** La categoría del convenio, en el vocabulario del módulo. Lo que no es una de las cuatro devuelve
 *  `null`: «JEFE DE OBRA» es un puesto, no una categoría de la escala de UOCRA. */
export function categoriaDeConvenio(texto) {
  return CATEGORIA_CONVENIO[PLANO(texto).replace(/\s+/g, ' ').trim()] ?? null
}

/** El DNI que está adentro del CUIL: son sus ocho dígitos del medio. No es una inferencia — es cómo
 *  se construye el número— y por eso sirve de respaldo para quien no tiene libreta. */
export function dniDelCuil(cuil) {
  const d = String(cuil ?? '').replace(/\D/g, '')
  return d.length === 11 ? String(Number(d.slice(2, 10))) : null
}

const fechaISO = (v) => {
  const m = String(v ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Todo lo que la libreta declara del TRABAJADOR. `null` si el papel no es una libreta. */
export function libretaDelIeric(texto) {
  const entero = String(texto ?? '').replace(/\s+/g, ' ')
  if (!/Libreta de Fondo de Cese/i.test(entero)) return null
  // Cortar acá NO es una optimización: es lo único que impide leer el domicilio del empleador.
  const t = entero.split(/Datos del empleador/i)[0]

  // ═══ SE RECORREN LOS RÓTULOS EN SECUENCIA, NO CON UNA EXPRESIÓN POR CAMPO ═══
  //
  // El mismo formulario sale del PDF con los corchetes en dos órdenes distintos según cómo se generó
  // —«Domicilio [ ] __ __ QUIROZ» en unos y «Domicilio __ __] [ QUIROZ» en otros—, y una expresión
  // atada a una de las dos formas devolvía TODO vacío en la mitad de las libretas sin fallar: los
  // campos quedaban en null y parecía que el papel no los traía.
  //
  // Buscar cada rótulo a partir de donde terminó el anterior no depende de eso, y además impide que
  // «Nro» o «Localidad» —que aparecen dos veces en la hoja— se lean del bloque equivocado.
  const posiciones = []
  let desde = 0
  for (const [clave, rotulo] of CAMPOS_LIBRETA) {
    const i = t.indexOf(rotulo, desde)
    posiciones.push({ clave, rotulo, i })
    if (i !== -1) desde = i + rotulo.length
  }
  const crudo = {}
  for (let i = 0; i < posiciones.length; i++) {
    const p = posiciones[i]
    if (p.i === -1) { crudo[p.clave] = ''; continue }
    const proximo = posiciones.slice(i + 1).find((x) => x.i !== -1)
    const bruto = t.slice(p.i + p.rotulo.length, proximo ? proximo.i : t.length)
    // El `°` de «B° VALLE GRANDE» sale del PDF como carácter de reemplazo y llegaba así al
    // domicilio. Se restituye: la alternativa era publicar un domicilio con un rombo negro adentro.
    crudo[p.clave] = bruto
      .replace(/[_[\]]/g, ' ')
      .replace(/\uFFFD/g, '°')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const partes = [
    [crudo.calle, crudo.nro].filter(Boolean).join(' '),
    crudo.piso && `piso ${crudo.piso}`,
    crudo.depto && `depto ${crudo.depto}`,
    [crudo.localidad, crudo.cp && `(${crudo.cp})`].filter(Boolean).join(' '),
    crudo.provincia !== crudo.localidad ? crudo.provincia : '',
  ].filter(Boolean)

  return {
    nombre: crudo.nombre || null,
    cuil: cuilDelTexto(t),
    // «DNI 38218815»: el rótulo del tipo de documento viene pegado al número.
    documento: (crudo.documento.match(/\d[\d.]{5,}/) ?? [null])[0]?.replace(/\./g, '') ?? null,
    nacionalidad: crudo.nacionalidad || null,
    nacimiento: fechaISO(crudo.nacimiento),
    ingreso: fechaISO(crudo.ingreso),
    egreso: fechaISO(crudo.egreso),
    categoria: categoriaDeConvenio(crudo.categoria),
    especialidad: crudo.especialidad || null,
    art: crudo.art || null,
    domicilio: partes.length ? partes.join(', ') : null,
  }
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
