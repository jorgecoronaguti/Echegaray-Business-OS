// QUÉ DOCUMENTO ES ÉSTE. REGLAS PRIMERO, MODELO DESPUÉS — Y EN ESTE CORPUS EL MODELO NO LLEGA NUNCA.
//
// ═══ POR QUÉ NO HAY UN CLASIFICADOR ENTRENADO ACÁ ═══
//
// Medido sobre el Drive real: los documentos que la empresa guarda son formularios. Un F.931 dice
// «F.931» y «Declaración Jurada»; un recibo de sueldo dice «RECIBO Nº» y «PERÍODO DE PAGO»; un libro
// de sueldos dice «Hojas móviles en reemplazo del libro especial Ley 20744». No hay ambigüedad que
// un modelo pueda resolver mejor que una regla — y una regla dice POR QUÉ decidió, que es lo que un
// clasificador de 300 MB no puede.
//
// El modelo queda para lo que las reglas no reconocen. Ahí sí aporta: propone el tipo más parecido
// entre los ya vistos. Pero nunca AUTO-clasifica: un documento mal tipado entra al índice bajo un
// rótulo falso y nadie lo vuelve a mirar.
//
// ═══ CADA REGLA LLEVA SU EVIDENCIA ═══
//
// No alcanza con devolver «recibo_sueldo». Hay que devolver QUÉ se leyó para decirlo, porque el día
// que clasifique mal, la única forma de arreglarlo es ver qué patrón se disparó.

/** Los tipos que el OS sabe reconocer hoy. Cada uno con las marcas que lo identifican en el TEXTO,
 *  no en el nombre del archivo — el nombre miente y ya costó una investigación entera. */
export const TIPOS = Object.freeze([
  { tipo: 'recibo_sueldo', sensibilidad: 'confidencial',
    marcas: [/RECIBO\s*N[º°]/i, /PER[ÍI]ODO\s+DE\s+PAGO/i, /REMUNERACI[ÓO]N\s+ASIGNADA/i],
    minimo: 2, porQue: 'recibo de haberes: trae número de recibo, período de pago y remuneración asignada' },

  // DOS FORMATOS, UN MISMO DOCUMENTO. El libro «en papel» declara su fundamento legal («Hojas
  // móviles en reemplazo del libro especial Ley 20744 art. 52»); el Libro de Sueldos Digital de
  // ARCA no dice nada de eso — arranca con una grilla: EMPRESA, PERIODO, NRO.LIQUIDACION, LEGAJO,
  // CUIL. Medido sobre el Drive real: los archivos `<CUIT>_<AAAAMM>_<NN>.pdf` son todos del segundo
  // formato y ninguno se reconocía. Buscar sólo la frase legal dejaba afuera el formato que la
  // empresa usa hoy.
  { tipo: 'libro_sueldos', sensibilidad: 'confidencial',
    marcas: [/Hojas\s+m[óo]viles\s+en\s+reemplazo\s+del\s+libro\s+especial/i, /Ley\s*20\.?744/i, /art\.?\s*52/i],
    minimo: 2, porQue: 'libro de sueldos del art. 52 de la LCT' },

  { tipo: 'libro_sueldos', sensibilidad: 'confidencial',
    requiere: /NRO\.?\s*LIQUIDACI[ÓO]N/i,
    marcas: [/NRO\.?\s*LIQUIDACI[ÓO]N/i, /DOMICILIO\s+FISCAL/i, /ACTIVIDAD\s+PPAL/i, /LEGAJO/i, /C\.?U\.?I\.?L\.?/i],
    minimo: 4, porQue: 'Libro de Sueldos Digital de ARCA: grilla por legajo con número de liquidación' },

  { tipo: 'f931', sensibilidad: 'confidencial',
    marcas: [/F\.?\s*931/i, /Declaraci[óo]n\s+Jurada/i, /Seguridad\s+Social|SUSS|Contribuciones/i],
    minimo: 2, porQue: 'declaración jurada de aportes y contribuciones (F.931)' },

  { tipo: 'vep', sensibilidad: 'confidencial',
    marcas: [/Volante\s+Electr[óo]nico\s+de\s+Pago|\bVEP\b/i, /N[úu]mero\s+de\s+VEP|Identificaci[óo]n\s+del\s+VEP/i],
    minimo: 1, porQue: 'volante electrónico de pago de ARCA' },

  // EL ACUSE GANA SOBRE LA DDJJ QUE ACUSA. Un acuse del F.931 dice «931» y dice «SUSS», así que
  // dispara las dos reglas — y no es un empate: es un documento MÁS ESPECÍFICO que contiene al
  // otro. El acuse prueba que se presentó; el F.931 es lo presentado. Confundirlos haría que el OS
  // crea que tiene la declaración cuando lo que tiene es el ticket.
  { tipo: 'acuse_arca', sensibilidad: 'confidencial',
    marcas: [/Presentaci[óo]n\s+de\s+DJ\s+por\s+Internet/i, /Acuse\s+de\s+[Rr]ecibo/i,
             /Nro\.?\s*(?:de\s*)?(?:Transacci[óo]n|verificador)|N[úu]mero\s+de\s+(?:formulario|transacci[óo]n)/i,
             /Fecha\s+de\s+Presentaci[óo]n/i],
    minimo: 2, masEspecificoQue: ['f931'],
    porQue: 'acuse de presentación de una DDJJ ante ARCA: prueba que se presentó, no es la declaración' },

  // «Detalle del instrumento de pago»: el comprobante de una transferencia o acreditación en
  // cuenta. Aparece en el Drive junto a las liquidaciones y hasta hoy no tenía nombre.
  { tipo: 'comprobante_pago', sensibilidad: 'confidencial',
    marcas: [/Detalle\s+del\s+instrumento\s+de\s+pago/i, /Beneficiario:/i,
             /N[úu]mero\s+de\s+instrumento|ID\s+Pago/i, /Forma\s+de\s+Pago:/i],
    minimo: 2, porQue: 'comprobante de un pago: beneficiario, instrumento e importe acreditado' },

  { tipo: 'factura', sensibilidad: 'confidencial',
    requiere: /FACTURA\b/i,
    marcas: [/FACTURA\b/i, /C[óo]d\.?\s*0?\d{2}\b|COD\.\s*\d{2}/i, /C\.?U\.?I\.?T\.?/i, /IVA\b/i,
             /Punto\s+de\s+Venta|Comp\.?\s*Nro/i, /CAE\b/i],
    minimo: 3, porQue: 'comprobante fiscal: trae tipo, punto de venta, CUIT e IVA' },

  // LA FRASE QUE LA DEFINE ES OBLIGATORIA, no una marca más que suma.
  //
  // Con `minimo: 1` esta regla se disparaba con sólo ver «CAE» — que trae CUALQUIER comprobante
  // fiscal. Medido el 04/09 sobre 120 documentos reales: clasificó como nota de crédito tres
  // boletas de multa del IERIC. Una nota de crédito RESTA; una factura SUMA. Etiquetar mal ahí no
  // es un error de catálogo, es un error de signo — el mismo que costó $41,9M cuando ARCA.
  { tipo: 'nota_credito', sensibilidad: 'confidencial',
    requiere: /NOTA\s+DE\s+CR[ÉE]DITO/i,
    marcas: [/NOTA\s+DE\s+CR[ÉE]DITO/i, /CAE\b/i], minimo: 1,
    porQue: 'nota de crédito: RESTA, y confundirla con una factura invierte el signo' },

  // La boleta de multa o de aporte del IERIC. Apareció en el corpus real y no tenía nombre: sin
  // esta regla, tres de ellas se colaban como notas de crédito.
  { tipo: 'boleta_ieric', sensibilidad: 'confidencial',
    requiere: /N[º°]?\s*IERIC|IERIC\b/i,
    marcas: [/IERIC\b/i, /N[úu]mero\s+de\s+Boleta|Clave\s+de\s+pago\s+electr[óo]nico/i,
             /FECHA\s+DE\s+VENCIMIENTO|TOTAL\s+A\s+PAGAR/i],
    minimo: 2, porQue: 'boleta del IERIC (aporte o multa): tiene número de boleta y vencimiento' },

  { tipo: 'certificado_obra', sensibilidad: 'interno',
    marcas: [/CERTIFICADO\s*N[º°]?\s*\d+/i, /avance|acumulado|obra/i, /certificaci[óo]n/i],
    minimo: 2, porQue: 'certificado de avance de obra' },

  { tipo: 'presupuesto', sensibilidad: 'interno',
    marcas: [/PRESUPUESTO\b/i, /validez|forma\s+de\s+pago|plazo\s+de\s+entrega/i],
    minimo: 2, porQue: 'presupuesto o cotización' },

  { tipo: 'contrato', sensibilidad: 'confidencial',
    marcas: [/entre\s+las\s+partes|CL[ÁA]USULA|las\s+partes\s+acuerdan/i, /objeto\s+del\s+contrato|contratante|contratista/i],
    minimo: 2, porQue: 'documento contractual' },

  { tipo: 'ieric', sensibilidad: 'confidencial',
    marcas: [/IERIC\b/i, /Registro\s+Nacional\s+de\s+la\s+Industria\s+de\s+la\s+Construcci[óo]n/i, /libreta/i],
    minimo: 1, porQue: 'documentación del registro de la construcción' },

  // LA PÓLIZA ES OBLIGATORIA, y «ART» a secas salió de la lista.
  //
  // Con `/ART\b/i` entre las marcas, esta regla clasificaba como seguro los CERTIFICADOS DE
  // CUMPLIMIENTO FISCAL de la DGR: dicen «ART.» por «artículo» y dicen «vigencia», y con dos marcas
  // ya alcanzaba. Un certificado fiscal no es una póliza, y confundirlos haría que el OS crea que
  // hay cobertura contratada donde sólo hay un trámite al día. «Riesgos del Trabajo» sí identifica
  // una ART de verdad; «ART» sola identifica cualquier texto legal en español.
  { tipo: 'seguro', sensibilidad: 'interno',
    requiere: /p[óo]liza|certificado\s+de\s+cobertura|Riesgos\s+del\s+Trabajo/i,
    marcas: [/p[óo]liza/i, /aseguradora|compa[ñn][íi]a\s+de\s+seguros|Riesgos\s+del\s+Trabajo/i, /vigencia|cobertura/i],
    minimo: 2, porQue: 'póliza o certificado de cobertura' },

  // El certificado de cumplimiento fiscal de la DGR: hasta hoy se colaba como una póliza.
  { tipo: 'certificado_fiscal', sensibilidad: 'confidencial',
    requiere: /cumplimiento\s+fiscal/i,
    marcas: [/cumplimiento\s+fiscal/i, /Direcci[óo]n\s+General\s+de\s+Rentas|DGR/i, /vigencia|v[áa]lido\s+hasta/i],
    minimo: 2, porQue: 'certificado de cumplimiento fiscal provincial: dice que los trámites están al día' },

  { tipo: 'plano', sensibilidad: 'interno',
    marcas: [/escala\s*1\s*[:/]\s*\d+/i, /plano|planta|corte|fachada|estructura/i],
    minimo: 2, porQue: 'plano o documentación gráfica' },

  { tipo: 'extracto_bancario', sensibilidad: 'credenciales',
    marcas: [/saldo\s+anterior|saldo\s+final/i, /movimientos|d[ée]bito.*cr[ée]dito/i, /cuenta\s+(?:corriente|n[º°])/i],
    minimo: 2, porQue: 'extracto de cuenta bancaria' },
])

/**
 * Clasifica por el TEXTO del documento.
 *
 * @param {string} texto
 * @returns {{tipo:string|null, confianza:number, metodo:string, porQue:string, evidencia:string[],
 *            candidatos:Array, sensibilidad:string}}
 */
export function clasificarPorTexto(texto) {
  const t = String(texto ?? '')
  if (!t.trim()) {
    return { tipo: null, confianza: 0, metodo: 'regla', porQue: 'el documento no tiene texto que leer',
             evidencia: [], candidatos: [], sensibilidad: 'confidencial' }
  }

  const puntuados = []
  for (const d of TIPOS) {
    // ── LA MARCA OBLIGATORIA, CUANDO EL TIPO DECLARA UNA ──
    // Hay tipos que se definen por UNA frase y no por un puñado de indicios: sin «NOTA DE CRÉDITO»
    // escrito, un documento no es una nota de crédito por más CAE, CUIT e IVA que tenga. Su
    // ausencia descalifica; no resta puntos, cierra la puerta.
    if (d.requiere && !d.requiere.test(t)) continue
    const aciertos = []
    for (const m of d.marcas) {
      const hit = t.match(m)
      if (hit) aciertos.push(String(hit[0]).slice(0, 40).replace(/\s+/g, ' ').trim())
    }
    if (aciertos.length >= d.minimo) {
      // La confianza es cuántas de SUS marcas aparecieron, no cuántas marcas tiene. Un tipo con dos
      // marcas que acierta las dos está tan seguro como uno con seis que acierta las seis.
      puntuados.push({ ...d, aciertos, confianza: aciertos.length / d.marcas.length })
    }
  }
  if (!puntuados.length) {
    return { tipo: null, confianza: 0, metodo: 'regla', porQue: 'ninguna regla reconoció este documento',
             evidencia: [], candidatos: [], sensibilidad: 'confidencial' }
  }

  puntuados.sort((a, b) => b.confianza - a.confianza || b.aciertos.length - a.aciertos.length)

  // ── LA ESPECIFICIDAD SE RESUELVE ANTES QUE EL EMPATE ──
  // Un tipo que declara ser más específico que otro lo saca de la lista cuando los dos dispararon.
  // No es un desempate por puntaje: es que uno CONTIENE al otro, y la respuesta correcta es el que
  // contiene. Sin esto, todo acuse de un F.931 quedaba sin clasificar por empatar consigo mismo.
  const tapados = new Set(puntuados.flatMap((p) => p.masEspecificoQue ?? []))
  const vivos = puntuados.filter((p) => !tapados.has(p.tipo))
  const [mejor, segundo] = vivos.length ? vivos : puntuados

  // DOS TIPOS IGUAL DE SEGUROS Y NINGUNO MÁS ESPECÍFICO NO SE DESEMPATAN A OJO. Una factura y una
  // nota de crédito comparten casi todo el texto y se diferencian en el signo: elegir la más
  // «probable» de las dos es cómo se fabrica un error de $41,9M — ya pasó en este repo con las
  // notas de crédito de ARCA.
  if (segundo && Math.abs(mejor.confianza - segundo.confianza) < 0.01) {
    return {
      tipo: null, confianza: mejor.confianza, metodo: 'regla',
      porQue: `«${mejor.tipo}» y «${segundo.tipo}» empatan: lo resuelve una persona`,
      evidencia: mejor.aciertos, candidatos: vivos.slice(0, 3).map((p) => ({ tipo: p.tipo, confianza: p.confianza })),
      // Ante la duda, la sensibilidad MÁS ALTA de las dos: equivocarse hacia el resguardo no cuesta nada.
      sensibilidad: masSensible(mejor.sensibilidad, segundo.sensibilidad),
    }
  }

  return {
    tipo: mejor.tipo, confianza: Number(mejor.confianza.toFixed(3)), metodo: 'regla',
    porQue: mejor.porQue, evidencia: mejor.aciertos,
    candidatos: vivos.slice(0, 3).map((p) => ({ tipo: p.tipo, confianza: Number(p.confianza.toFixed(3)) })),
    sensibilidad: mejor.sensibilidad,
  }
}

const ORDEN = ['publico', 'interno', 'confidencial', 'credenciales']
function masSensible(a, b) {
  return ORDEN.indexOf(a) >= ORDEN.indexOf(b) ? a : b
}

/** La sensibilidad de un tipo, para que la política de la capa ML sepa a dónde puede mandarlo. */
export function sensibilidadDe(tipo) {
  return TIPOS.find((t) => t.tipo === tipo)?.sensibilidad ?? 'confidencial'
}
