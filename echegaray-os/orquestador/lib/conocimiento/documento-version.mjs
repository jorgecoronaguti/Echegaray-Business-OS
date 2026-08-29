// DOS ARCHIVOS QUE SON EL MISMO DOCUMENTO — y qué hacer cuando NO dicen lo mismo.
//
// ═══ EL DEFECTO QUE ARREGLA ═══
//
// En la carpeta de QUATTROPANI el contrato está dos veces: un Google Doc nativo (que este circuito
// EXPORTA a .docx para leerlo) y un .docx subido a mano. Bytes distintos ⇒ hash distinto ⇒ la
// deduplicación por hash de contenido no dispara nunca, y las 46 frases del contrato entraron DOS
// VECES a la biblioteca. 45 de ellas son idénticas carácter por carácter.
//
// ═══ POR QUÉ NO ALCANZA EL HASH, Y POR QUÉ TAMPOCO ALCANZA EL NOMBRE ═══
//
// El hash es de los BYTES. Exportar un Doc a .docx produce otros bytes con el mismo texto: es ruido
// de formato, no una diferencia del contrato. Y el nombre tampoco sirve —los dos archivos se llaman
// distinto— y emparejar por nombre parecido es adivinar.
//
// Lo único que se puede medir es el TEXTO: qué frases dice cada uno. Dos archivos que comparten
// casi todas sus frases son el mismo documento en dos versiones.
//
// ═══ LA CLAVE DE UNA FRASE SIGUE EL CRITERIO DE `materiales-fusion.mjs` ═══
//
// Se normaliza lo que NO cambia el significado y nada más: mayúsculas, corridas de espacios
// (incluido el espacio duro que mete el copiar-pegar) y la composición Unicode. NO se sacan acentos
// ni signos ni números. «31500» y «3150» son frases distintas, y adivinar que son la misma es
// exactamente cómo se pierde una cláusula de plata. Sin match exacto normalizado ⇒ es otra frase.
//
// ═══ DEDUPLICAR NO ES ELEGIR UNA Y TIRAR LA OTRA ═══
//
// Medido sobre el contrato real: de 46 frases, 45 coinciden y UNA no.
//
//   .docx  «Saldo: será abonado mediante certificaciones quincenales de avance de obra…»
//   Doc    «Saldo: el monto restante es de (U$S 31500 + IVA), el mismo será abonado…»
//
// Una versión declara el saldo en dólares y la otra lo omite. Cuál gobierna NO lo decide este
// módulo: es una decisión del dueño con efecto contractual. Por eso las frases comunes entran UNA
// vez —eso es la deduplicación— y las que divergen salen declaradas como CONFLICTO, con las dos
// citas y los dos archivos. Callar la divergencia para que el conteo quede lindo sería peor que el
// duplicado que este módulo vino a arreglar.

/** El identificador estable de un documento dentro de una clave. Mismo criterio que el `slug` de
 *  `documento-proyecto.mjs`, repetido acá para no importar en círculo (ese archivo importa éste). */
export const slug = (s) => String(s ?? 'documento').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** La clave de una frase. PURA. Ver el criterio arriba: se normaliza el ruido, nunca el contenido. */
export const claveDeFrase = (t) => String(t ?? '')
  .normalize('NFC').replace(/[\s ]+/g, ' ').trim().toLocaleUpperCase('es-AR')

/** Las claves de las frases de una lectura de `leerDocumentoDeProyecto`. PURA. */
export const clavesDeLectura = (lectura) => (lectura?.hallazgos ?? [])
  .map((h) => claveDeFrase(h.textoLiteral)).filter(Boolean)

/**
 * Con menos frases que esto no se compara: dos documentos de tres frases que comparten las tres dan
 * 100 % de solape y no prueban nada — dos carátulas distintas se verían iguales.
 */
export const MINIMO_FRASES_PARA_COMPARAR = 8

/**
 * ═══ SE MIDE CONTENCIÓN, NO JACCARD ═══
 *
 * DATO REAL, corrido con estas funciones sobre las lecturas cacheadas del pipeline (47 documentos
 * distintos, 1.081 pares; el auditor contó 55 lecturas antes de unificar por documento, 1.485 pares
 * — misma conclusión):
 *
 *   el par real (las dos copias del contrato de Quattropani)  34 de 35 frases en común
 *      contención 0,971 · Jaccard 0,944 · proporción de tamaño 1,000
 *   el par siguiente (dos contratos que comparten el machote del estudio)
 *      contención 0,455 · Jaccard 0,125 · proporción 0,324
 *   pares en la zona [0,60 – 0,85):  NINGUNO
 *
 * ═══ SOBRE ESTE CORPUS LAS DOS MÉTRICAS DAN EL MISMO VEREDICTO ═══
 *
 * Y hay que decirlo así: con Jaccard 0,944 —por encima del corte— el resultado de hoy sería
 * idéntico. La versión anterior de este comentario decía «0,846 contra 0,917, con el corte en el
 * medio»; esos números no salían de ninguna medición y eran falsos. La elección se sostiene por
 * otra cosa, no por el par que ya tenemos.
 *
 * ═══ POR QUÉ IGUAL SE ELIGE CONTENCIÓN: CUÁNTO AGUANTA CADA UNA ═══
 *
 * CÁLCULO —no medición—: sobre un documento de 35 frases, con `k` cláusulas cambiadas de cada lado,
 * Jaccard = (35−k)/(35+k) y contención = (35−k)/35.
 *
 *   k = 1  Jaccard 0,944   contención 0,971
 *   k = 3  Jaccard 0,842 ← YA NO DETECTA   contención 0,914
 *   k = 5  Jaccard 0,750                   contención 0,857 ← el borde
 *
 * O sea: Jaccard deja de reconocer una revisión del MISMO contrato con tres cláusulas tocadas, y
 * contención aguanta cinco. La pregunta que interesa es «¿todo lo que dice uno lo dice también el
 * otro?», y Jaccard castiga la asimetría dos veces, en el numerador y en el denominador. Hoy la
 * diferencia no cambia nada; el día que llegue una revisión de verdad, sí.
 *
 * ═══ CUÁNTO VALE ESTA EVIDENCIA ═══
 *
 * LÍMITE: de los 47 documentos del corpus sólo 5 llegan a 8 frases, así que el umbral está
 * ejercitado por 10 pares comparables — uno verdadero y nueve negativos. No hay ningún par en la
 * zona gris, pero «no hay bomba en el borde» está dicho sobre 10 pares, no sobre mil.
 */
export const SOLAPE_MISMO_DOCUMENTO = 0.85

/**
 * Y ADEMÁS TIENEN QUE SER COMPARABLES EN TAMAÑO.
 *
 * La contención sola tiene un agujero: un anexo corto cuyas frases estén TODAS adentro del contrato
 * largo da 1,0 y no es otra versión del contrato — es un pedazo suyo. Tratarlo como versión
 * declararía las cláusulas restantes del contrato como «divergencias», que es ruido puro.
 * DATO REAL: con el par real la proporción es 34/34 = 1,000; un anexo de 8 frases contra 34 da 0,235.
 */
export const PROPORCION_MINIMA_DE_TAMANO = 0.6

/**
 * LA RELACIÓN ENTRE DOS DOCUMENTOS LEÍDOS. PURA.
 *
 * `solape` es la CONTENCIÓN sobre las claves de frase: qué proporción de las frases del documento
 * más corto dice también el otro. NO es Jaccard — este campo viaja a `documentos-word.json` y se
 * imprime como «% de frases en común», así que el nombre de la cuenta importa.
 *
 * Devuelve además si son versiones del mismo documento y las frases que dice uno y no el otro, que
 * son las que hay que declarar.
 */
export function relacionEntreDocumentos(a, b) {
  const sa = new Set(clavesDeLectura(a))
  const sb = new Set(clavesDeLectura(b))
  const comunes = [...sa].filter((k) => sb.has(k))
  const chico = Math.min(sa.size, sb.size)
  const grande = Math.max(sa.size, sb.size)
  const solape = chico ? comunes.length / chico : 0
  const proporcion = grande ? chico / grande : 0
  const pocas = chico < MINIMO_FRASES_PARA_COMPARAR
  const desparejos = proporcion < PROPORCION_MINIMA_DE_TAMANO
  return {
    solape: Math.round(solape * 1000) / 1000,
    proporcion: Math.round(proporcion * 1000) / 1000,
    comunes: comunes.length,
    // Se devuelven las FRASES, no las claves: la clave está en mayúsculas y no se puede citar.
    soloEnA: (a?.hallazgos ?? []).filter((h) => !sb.has(claveDeFrase(h.textoLiteral))),
    soloEnB: (b?.hallazgos ?? []).filter((h) => !sa.has(claveDeFrase(h.textoLiteral))),
    mismoDocumento: !pocas && !desparejos && solape >= SOLAPE_MISMO_DOCUMENTO,
    porQue: pocas
      ? `el más corto tiene ${chico} frase(s) y hacen falta ${MINIMO_FRASES_PARA_COMPARAR}: con tan pocas, el solape no significa nada y no se los compara`
      : desparejos
        ? `uno tiene ${chico} frase(s) y el otro ${grande} (proporción ${Math.round(proporcion * 100)} %, mínimo ${Math.round(PROPORCION_MINIMA_DE_TAMANO * 100)} %): el corto puede ser un pedazo del largo, no otra versión suya`
        : `el más corto tiene ${comunes.length} de sus ${chico} frase(s) también en el otro (${Math.round(solape * 100)} %), y el corte para llamarlos el mismo documento es ${Math.round(SOLAPE_MISMO_DOCUMENTO * 100)} %`,
  }
}

/**
 * ¿ESTA LECTURA ES OTRA VERSIÓN DE ALGO QUE YA ENTRÓ? PURA.
 *
 * `vistas` es la lista de lecturas que ya se procesaron en esta corrida. Devuelve la primera que sea
 * el mismo documento, con la relación, o `null`.
 */
/**
 * ═══ LÍMITE DECLARADO: ESTO DEDUPLICA UNA CORRIDA, NO EL ALMACÉN ═══
 *
 * Las frases entran a la biblioteca bajo una clave que empieza con el SLUG DEL NOMBRE del documento
 * (`documento-proyecto.{slug}.…`). Cuando dos archivos son la misma obra con nombres distintos, cuál
 * de los dos «gana» —y por lo tanto bajo qué slug quedan las 33 frases comunes— lo decide EL ORDEN
 * en que llegan, y ese orden lo fija `inventario-drive.mjs` con `order by path, name`.
 *
 * Es estable MIENTRAS NADIE MUEVA NI RENOMBRE EL ARCHIVO EN DRIVE. El día que alguien lo mueva de
 * carpeta, la corrida siguiente procesa el otro primero, las 33 frases entran bajo el OTRO slug,
 * ninguna clave choca con las que ya estaban —son claves distintas— y el duplicado vuelve en
 * silencio. Este módulo no puede arreglarlo: haría falta que la clave del conocimiento no dependa
 * del nombre, o un retiro explícito de las claves del slug anterior.
 *
 * Gana la primera: el orden lo fija quien llama, y elegir «la mejor» sería este módulo decidiendo
 * cuál contrato vale.
 */
export function versionPreviaDe(lectura, vistas = []) {
  for (const previa of vistas) {
    const r = relacionEntreDocumentos(previa, lectura)
    if (r.mismoDocumento) return { original: previa, relacion: r }
  }
  return null
}

/**
 * LAS DIVERGENCIAS ENTRE DOS VERSIONES, COMO HUECOS DE TIPO CONFLICTO. PURA salvo por el
 * constructor que valida.
 *
 * Cada frase que dice una versión y no la otra sale con las dos fuentes nombradas y con el dueño
 * como quien lo tiene: qué versión del contrato rige es una decisión contractual, no una lectura.
 */
export function conflictosDeVersion({ original, nueva, relacion, hueco }) {
  const salida = []
  const nombreA = original?.documento ?? 'documento A'
  const nombreB = nueva?.documento ?? 'documento B'
  // La clave lleva el DOCUMENTO adelante: sin él, dos obras con la misma cláusula divergente en sus
  // primeros 80 caracteres —«No se contempla revoques ni pintura…» es literal en dos contratos—
  // producen el mismo `id` y una tapa a la otra.
  const armar = (h, dice, calla) => hueco({
    clave: `documento-proyecto.version.${slug(dice)}.${claveDeFrase(h.textoLiteral).slice(0, 80)}`,
    tipo: 'CONFLICTO',
    porQue: `hay dos versiones del mismo documento (${Math.round(relacion.solape * 100)} % de frases en común) y sólo «${dice}» dice: «${String(h.textoLiteral).slice(0, 200)}». «${calla}» no lo dice. Cuál versión rige es una decisión del dueño, no una lectura.`,
    quienLoTiene: 'el dueño',
    fuentesEnConflicto: [dice, calla],
  })
  for (const h of relacion.soloEnA) salida.push(armar(h, nombreA, nombreB))
  for (const h of relacion.soloEnB) salida.push(armar(h, nombreB, nombreA))
  return salida
}

/**
 * LAS FRASES DE LA VERSIÓN NUEVA QUE TODAVÍA NO ENTRARON. PURA.
 *
 * Las comunes ya están en la biblioteca bajo el documento original: volver a grabarlas es el
 * duplicado. Las que sólo dice esta versión SÍ entran —son contenido real que la otra no tiene— y
 * además quedan declaradas como conflicto por `conflictosDeVersion`.
 */
export const soloLoNuevo = (lectura, relacion) => ({ ...lectura, hallazgos: relacion.soloEnB })
