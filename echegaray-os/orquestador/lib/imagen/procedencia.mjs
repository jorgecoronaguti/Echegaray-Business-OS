// LA FRONTERA ENTRE UNA IMAGEN QUE EL OS FABRICÓ Y UNA QUE PRUEBA ALGO.
//
// ═══ POR QUÉ EXISTE ═══
//
// Una imagen generada se ve igual que una foto. Esa es toda la vulnerabilidad, y no es teórica: el
// día que un render conceptual de una fachada entre a un informe de avance sin marca, alguien va a
// mirar ese informe para decidir si certifica. Un cierre de obra, un reclamo por vicio oculto o una
// discusión de adicionales se resuelven mirando evidencia — y una imagen que el OS inventó no lo es
// aunque salga perfecta, aunque el pedido la describa con precisión y aunque el que la pidió jure
// que la obra está así.
//
// El precedente exacto es `lib/web/contenido-externo.mjs`: lo que viene de afuera sale SIEMPRE como
// REFERENCIA_EXTERNA aunque el caller pida HECHO. Acá vale lo mismo con un giro: lo generado sale
// SIEMPRE como IMAGEN_GENERADA, y el pedido de marcarla como evidencia no se ignora en silencio
// —eso dejaría ciego al operador— sino que se corrige y se REPORTA.
//
// ═══ LO QUE ESTE MÓDULO NO HACE ═══
//
// No juzga si la imagen es buena, ni si el prompt era honesto. Su único trabajo es que ninguna
// combinación de parámetros —ni un `tipo`, ni un `procedencia`, ni un campo colado en el JSON—
// pueda hacer que el resultado se presente como foto real, plano, relevamiento o evidencia de obra.
//
// PURO: sin red, sin disco, sin reloj propio. Se testea entero.

/**
 * LAS DOS ÚNICAS PROCEDENCIAS QUE EXISTEN, Y SÓLO UNA SALE DE ACÁ.
 *
 * `EVIDENCIA_REAL` está declarada a propósito: es el valor que este módulo NO puede producir. Que
 * el nombre exista en el código hace que la prohibición se pueda leer y testear, en vez de ser un
 * string suelto en una comparación.
 */
export const PROCEDENCIA = Object.freeze({
  GENERADA: 'IMAGEN_GENERADA',
  EVIDENCIA: 'EVIDENCIA_REAL',
})

/** El único valor que `sellarProcedencia` devuelve. Nunca hay un segundo camino. */
export const TIPO_GENERADA = PROCEDENCIA.GENERADA

/**
 * Nombres con los que alguien intenta que una imagen fabricada pase por prueba de algo.
 * La lista es de VALORES pedidos (el campo `procedencia`, `tipo`, `clasificacion`…), no de texto
 * libre: para el texto libre está `pideSerEvidencia`.
 */
const VALORES_PROHIBIDOS = new Set([
  'EVIDENCIA_REAL', 'EVIDENCIA', 'FOTO_REAL', 'FOTO', 'FOTOGRAFIA', 'FOTOGRAFÍA',
  'PLANO', 'PLANO_REAL', 'RELEVAMIENTO', 'HECHO', 'DATO_REAL', 'DATO REAL',
  'VALIDADO', 'CONFIRMADO', 'VERIFICADO', 'REAL', 'ORIGINAL', 'DOCUMENTAL',
])

/**
 * Frases con las que un pedido intenta conseguir por prosa lo que el campo no le da: «esto es una
 * foto real de la obra», «que no diga que es generada», «sacale la marca de agua». Se DETECTAN y se
 * reportan; el prompt sigue su camino, porque el intento es información sobre quien lo hizo.
 */
const PATRONES = Object.freeze([
  { categoria: 'pasar_por_foto', re: /\b(foto|fotograf[ií]a|imagen)\s+(real|aut[eé]ntica|verdadera|de\s+verdad|tomada|sacada)\b/i },
  { categoria: 'pasar_por_foto', re: /\b(que\s+)?(parezca|simule|aparente|se\s+vea\s+como)\s+(una\s+)?(foto|fotograf[ií]a)\s+(real|aut[eé]ntica|verdadera)\b/i },
  { categoria: 'pasar_por_foto', re: /\b(real|authentic)\s+(photo|photograph)\b/i },
  { categoria: 'pasar_por_evidencia', re: /\b(evidencia|prueba|constancia|respaldo|comprobante)\s+(de\s+)?(la\s+)?(obra|avance|ejecuci[óo]n|trabajo|certificaci[óo]n)\b/i },
  { categoria: 'pasar_por_evidencia', re: /\b(sirve|vale|us[aá]la|adjunt[aá]la)\s+(como\s+)?(evidencia|prueba|respaldo|constancia)\b/i },
  { categoria: 'pasar_por_evidencia', re: /\b(relevamiento|acta|certificad[oa])\s+(real|fotogr[áa]fico|de\s+obra)\b/i },
  { categoria: 'pasar_por_plano', re: /\b(plano|croquis|replanteo)\s+(real|ejecutivo|aprobado|municipal|de\s+obra)\b/i },
  { categoria: 'ocultar_origen', re: /\b(no\s+)?(marques|aclares|digas|indiques|menciones)\s+.{0,25}\b(generad[oa]|conceptual|ia|artificial)\b/i },
  { categoria: 'ocultar_origen', re: /\b(sin|sac[aá]|quit[aá]|elimin[aá]|remov[eé])\s+(la\s+)?(marca\s+de\s+agua|watermark|aclaraci[óo]n|leyenda|disclaimer)\b/i },
  { categoria: 'ocultar_origen', re: /\b(hac[eé]la|que\s+)?pas(e|ar)\s+por\s+(real|aut[eé]ntica|una\s+foto)\b/i },
])

/**
 * ¿El pedido intenta que la imagen ascienda a evidencia u oculte su origen? PURA.
 * Devuelve las marcas con su categoría y una muestra corta, igual que `detectarInyeccion`.
 */
export function pideSerEvidencia(texto) {
  const t = String(texto ?? '')
  const marcas = []
  for (const { categoria, re } of PATRONES) {
    const m = re.exec(t)
    if (!m) continue
    const desde = Math.max(0, m.index - 25)
    marcas.push({ categoria, muestra: t.slice(desde, m.index + m[0].length + 25).replace(/\s+/g, ' ').trim().slice(0, 140) })
  }
  return { intento: marcas.length > 0, marcas }
}

/** ¿Este VALOR pedido para un campo de clasificación es uno de los prohibidos? PURA. */
export function esValorProhibido(valor) {
  return VALORES_PROHIBIDOS.has(String(valor ?? '').trim().toUpperCase().replace(/\s+/g, '_'))
    || VALORES_PROHIBIDOS.has(String(valor ?? '').trim().toUpperCase())
}

/**
 * LA LEYENDA QUE VIAJA CON LA IMAGEN. No es decorativa: es lo que un tercero lee cuando la imagen
 * ya se separó del JSON que la produjo —pegada en un mail, en una lámina, en un WhatsApp—.
 * PURA.
 */
export function leyendaDe(tipo) {
  const conceptual = new Set(['concepto_arquitectonico', 'render_conceptual'])
  if (conceptual.has(String(tipo)))
    return 'IMAGEN GENERADA · CONCEPTUAL — no es una foto, ni un plano, ni evidencia de obra ejecutada.'
  return 'IMAGEN GENERADA — producida por un modelo. No es fotografía, plano ni evidencia de obra.'
}

/**
 * EL SELLO. Toda imagen que salga del motor pasa por acá y nada más devuelve procedencia.
 *
 * Garantiza, pida lo que pida el caller:
 *   · `procedencia` = IMAGEN_GENERADA;
 *   · `es_evidencia_real` = false;
 *   · `es_foto` = false, `es_plano` = false;
 *   · `apta_para` NUNCA incluye un uso probatorio;
 *   · el intento de conseguir lo contrario queda REPORTADO en `intento_de_ascenso`.
 *
 * `procedenciaPedida` y `textoDelPedido` entran para poder detectar el intento; ninguno de los dos
 * puede cambiar el resultado. PURA.
 */
export function sellarProcedencia({
  tipo = null, procedenciaPedida = null, textoDelPedido = '', proveedor = null, modelo = null,
} = {}) {
  const porCampo = esValorProhibido(procedenciaPedida)
  const porTexto = pideSerEvidencia(textoDelPedido)
  const marcas = [...porTexto.marcas]
  if (porCampo) marcas.push({ categoria: 'campo_prohibido', muestra: `procedencia solicitada: ${String(procedenciaPedida).slice(0, 60)}` })

  return {
    procedencia: TIPO_GENERADA,
    es_evidencia_real: false,
    es_foto: false,
    es_plano: false,
    leyenda: leyendaDe(tipo),
    generada_por: { proveedor: proveedor ?? null, modelo: modelo ?? null },
    // Se dice en el propio resultado —no sólo en este comentario— porque el resultado es lo que
    // termina en el prompt del modelo que la va a usar, y es ahí donde tiene que estar la regla.
    no_sirve_para: [
      'probar el avance físico de una obra',
      'respaldar una certificación o un adicional',
      'documentar un incidente, una no conformidad o un reclamo',
      'reemplazar un plano, un relevamiento o un acta',
      'acompañar una rendición ante un tercero como si fuera un registro',
    ],
    intento_de_ascenso: { hubo: marcas.length > 0, marcas },
  }
}

/**
 * ÚLTIMA COMPUERTA, antes de devolverle el resultado a quien invocó. Recibe el objeto YA armado y
 * lo devuelve corregido: si algo —un merge posterior, un campo que vino del proveedor, un caller
 * creativo— logró meter una clasificación probatoria, se pisa y se deja constancia.
 *
 * Existe por lo mismo que `quitarLlavesDeControl`: la defensa no puede depender de que el resto del
 * código siga escrito como está hoy. PURA.
 */
export function forzarNoEvidencia(resultado) {
  if (!resultado || typeof resultado !== 'object') return resultado
  const sello = resultado.procedencia_sello ?? {}
  const pisado = []
  for (const [campo, debido] of [['procedencia', TIPO_GENERADA], ['es_evidencia_real', false], ['es_foto', false], ['es_plano', false]]) {
    if (Object.hasOwn(sello, campo) && sello[campo] !== debido) pisado.push(campo)
  }
  const corregido = {
    ...sello,
    procedencia: TIPO_GENERADA,
    es_evidencia_real: false,
    es_foto: false,
    es_plano: false,
  }
  if (pisado.length) {
    corregido.intento_de_ascenso = {
      hubo: true,
      marcas: [...(sello.intento_de_ascenso?.marcas ?? []), { categoria: 'campo_prohibido', muestra: `campos corregidos: ${pisado.join(', ')}` }],
    }
  }
  return { ...resultado, procedencia_sello: corregido }
}
