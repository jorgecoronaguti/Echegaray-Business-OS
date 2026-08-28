// LA PRÁCTICA HISTÓRICA CON SU PROCEDENCIA ADELANTE — «así se venía cotizando», nunca «así se cotiza».
//
// ═══ POR QUÉ NO ALCANZABA `EXPERIENCIA_ECSAS` ═══
//
// Las 190 prácticas salían marcadas `EXPERIENCIA_ECSAS`, que en la biblioteca significa «lo medimos
// nosotros EJECUTANDO». Un coeficiente tipeado en una planilla de 2021 no se midió ejecutando: se
// tipeó. La distinción no es de vocabulario — decide si un número puede sostener una cotización
// cerrada. Un rendimiento medido en obra puede; una costumbre de planilla no.
//
// Por eso hay una procedencia propia, `PRACTICA_HISTORICA_ECSAS`, y cuatro ascensos prohibidos que
// la encierran: no puede volverse NORMA, ni BASE_MAESTRA, ni EXPERIENCIA_ECSAS, ni HECHO_PROYECTO.
//
// ═══ LOS OCHO CAMPOS ═══
//
// práctica · frecuencia · cantidad de cotizaciones · período · archivos de evidencia · clientes ·
// variabilidad · confianza descriptiva. La confianza es DESCRIPTIVA a propósito: dice cuán bien
// descripta está la costumbre, no cuán correcta es. Beneficio 17 %, imprevistos 5 % e IVA 21 %
// pueden estar perfectamente descriptos y ser igualmente discutibles.
//
// ═══ LA VARIABILIDAD ES PARTE DE LA PRÁCTICA, NO UN ANEXO ═══
//
// Un coeficiente que va de 0,006 a 0,04 entre cotizaciones no tiene media útil: publicar «0,023»
// sin la dispersión al lado convierte dos costumbres distintas en una tercera que nunca existió.
import { ESTADO, PROCEDENCIA, conocimiento } from './biblioteca.mjs'

/** Lo que se le agrega a TODA práctica para que nadie la lea como una regla. Vive acá y no en
 *  `practica-cotizacion.mjs` porque es la advertencia de la PROCEDENCIA, no del cálculo: cualquier
 *  cosa marcada `PRACTICA_HISTORICA_ECSAS` la lleva, salga de donde salga. */
export const ADVERTENCIA = 'práctica observada en cotizaciones internas de ECSAS: describe cómo se viene cotizando, NO que sea correcto'

/** La marca que lleva TODA práctica histórica. Está en el `area` y en la `condicion` para que
 *  aparezca en cualquier consulta a la biblioteca, no sólo en la que la busca. */
export const AREA = 'practica-historica-de-cotizacion'

/** Qué significa cada nivel de confianza acá. Es cuán bien DESCRIPTA está la costumbre. */
export const CONFIANZA_DESCRIPTIVA = Object.freeze({
  ALTA: 'la costumbre está bien descripta: muchos casos, varias obras y poca dispersión',
  MEDIA: 'la costumbre se reconoce pero varía entre cotizaciones',
  BAJA: 'hay pocos casos o mucha dispersión: describe un puñado de planillas, no una costumbre',
})

/** El cliente que nombra una obra de `obraDe`, que sale como «CLIENTE · CARPETA» o como «CLIENTE».
 *  Se parte por el separador que puso `obraDe`, no por una heurística sobre el texto. PURA. */
export const clienteDeLaObra = (obra) => String(obra ?? '').split('·')[0].trim() || null

/** El archivo que nombra una ubicación de evidencia («archivo · hoja X · celda»). PURA. */
export const archivoDeLaUbicacion = (u) => String(u ?? '').split('·')[0].trim() || null

const rango = (fechas) => {
  const d = fechas.filter(Boolean).map(String).sort()
  return d.length ? { desde: d[0].slice(0, 10), hasta: d[d.length - 1].slice(0, 10) } : null
}

/**
 * EL REGISTRO HISTÓRICO DE UNA PRÁCTICA. PURA.
 *
 * `practica` es lo que devuelve `practica-cotizacion.mjs`; `porCotizacion` es el índice
 * `id → { archivo, obra, modificado }` que arma `indiceDeCotizaciones()`. El período sale de la
 * fecha de modificación de los archivos: es la única fecha que Drive garantiza, y decir que sale de
 * ahí es más honesto que llamarla «fecha de la cotización».
 */
export function registroHistorico(practica, { porCotizacion = new Map(), totalCotizaciones = 0 } = {}) {
  const casos = practica.casos ?? []
  const fichas = casos.map((c) => porCotizacion.get(c.cotizacion) ?? null)
  const archivos = [...new Set(casos.map((c, i) => fichas[i]?.archivo ?? archivoDeLaUbicacion(c.ubicacion)).filter(Boolean))]
  const clientes = [...new Set(casos.map((c, i) => fichas[i]?.cliente ?? clienteDeLaObra(c.obra)).filter(Boolean))]
  const est = practica.estadistica ?? {}
  return {
    procedencia: PROCEDENCIA.PRACTICA_HISTORICA_ECSAS,
    clave: practica.clave,
    practica: practica.afirmacion,
    // La frecuencia es sobre el universo estudiado, no sobre los casos: «12 de 64» y «12 de 12»
    // son dos costumbres muy distintas y el numerador solo no las distingue.
    frecuencia: totalCotizaciones ? Math.round((casos.length / totalCotizaciones) * 1000) / 1000 : null,
    cantidadDeCotizaciones: casos.length,
    universoEstudiado: totalCotizaciones || null,
    periodo: rango(casos.map((c, i) => fichas[i]?.modificado ?? null)),
    archivosDeEvidencia: archivos,
    clientes,
    obras: practica.obras ?? [],
    variabilidad: {
      n: est.n ?? 0, media: est.media ?? null, min: est.min ?? null, max: est.max ?? null,
      desvio: est.desvio ?? null, dispersion: est.dispersion ?? null,
    },
    valor: est.n ? est.media : practica.valorTextual ?? null,
    unidad: practica.unidad ?? null,
    madurez: practica.madurez ?? null,
    confianzaDescriptiva: practica.confianza ?? 'BAJA',
    queSignifica: CONFIANZA_DESCRIPTIVA[practica.confianza] ?? CONFIANZA_DESCRIPTIVA.BAJA,
    noEsUnaNorma: ADVERTENCIA,
  }
}

/** Todos los registros de una tanda. PURA. */
export const registrosHistoricos = (practicas = [], opciones = {}) =>
  practicas.map((p) => registroHistorico(p, opciones))

/**
 * DE REGISTRO HISTÓRICO A CONOCIMIENTO DE BIBLIOTECA. PURA.
 *
 * Va a la MISMA biblioteca que todo lo demás: no hay una segunda base de prácticas. Lo que la
 * separa del resto es la procedencia y el `area`, que son consultables — no un archivo aparte.
 */
export function aConocimientoHistorico(registro, { fecha = null } = {}) {
  const p = registro
  return conocimiento({
    clave: p.clave,
    afirmacion: p.practica,
    procedencia: PROCEDENCIA.PRACTICA_HISTORICA_ECSAS,
    estado: ESTADO.CANDIDATO,
    valor: p.valor,
    unidad: p.unidad,
    condicion: p.noEsUnaNorma,
    confianza: p.confianzaDescriptiva,
    area: AREA,
    fecha,
    evidencia: {
      frecuencia: p.frecuencia,
      cotizaciones: p.cantidadDeCotizaciones,
      universo: p.universoEstudiado,
      periodo: p.periodo,
      archivos: p.archivosDeEvidencia.slice(0, 12),
      clientes: p.clientes,
      obras: p.obras,
      variabilidad: p.variabilidad,
      madurez: p.madurez,
    },
  })
}

/**
 * EL CASO JAVIER SANCHEZ · ENTREPISO, REGISTRADO COMO LO QUE ES.
 *
 * ═══ LO QUE SE MIDIÓ ═══
 *
 * Las dos partidas metálicas de esa cotización —ESCALERA METÁLICA y ENTREPISO— son las ÚNICAS con
 * un coeficiente de ajuste distinto de 1: ×1,5 y ×1,4. No hay una tercera partida ajustada, y no
 * hay ninguna metálica sin ajustar.
 *
 * ═══ LO QUE SE PUEDE DECIR ═══
 *
 * Que las partidas metálicas recibieron un ajuste adicional que ninguna otra recibió. Eso SUGIERE
 * que el análisis y la composición históricos de estructura metálica se sabían cortos y se los
 * tapó con un multiplicador.
 *
 * ═══ LO QUE NO SE PUEDE DECIR ═══
 *
 * Que 1,4 y 1,5 sean los coeficientes correctos. No hay nada que lo sostenga: no se midió la obra,
 * no hay composición, no hay HH reales. Aprender «estructura metálica × 1,45» sería convertir un
 * parche en un método, y multiplicar el error en todas las cotizaciones que vengan.
 *
 * ═══ QUÉ HAY QUE HACER CON ESTO ═══
 *
 * Contrastarlo contra las partidas metálicas nuevas (T1180–T1185) con mediciones reales,
 * composiciones, recursos, HH, materiales y procesos. El objetivo declarado es reemplazar el
 * multiplicador opaco por CÓMPUTO → COMPOSICIÓN → RECURSOS → HH → COSTO con genealogía verificable.
 */
export const INSUFICIENCIA_METALICA = Object.freeze({
  clave: 'cotizacion.insuficiencia.estructura_metalica',
  procedencia: PROCEDENCIA.INFERIDO,
  estado: ESTADO.CANDIDATO,
  cliente: 'JAVIER SANCHEZ',
  casos: Object.freeze([
    Object.freeze({
      obra: 'JAVIER SANCHEZ · Entrepiso',
      partidasAjustadas: Object.freeze([
        Object.freeze({ tarea: 'ESCALERA METÁLICA', coeficiente: 1.5 }),
        Object.freeze({ tarea: 'ENTREPISO', coeficiente: 1.4 }),
      ]),
      // ═══ ESTE CASO NO ESTÁ VERIFICADO CONTRA EL ARTEFACTO ═══
      // Los dos coeficientes los declaró el dueño. La cotización «JAVIER SANCHEZ · Entrepiso» NO
      // aparece en `hallazgos-cotizaciones.json`, así que no se pudo cruzar contra archivo, hoja ni
      // fila. Dejarlo sin esta marca sería presentar un dato de segunda mano como medición propia.
      verificadoEn: null,
      porQueNoSeVerifico: 'la cotización no está entre las 237 estudiadas del artefacto: no hay archivo, hoja ni fila que citar. El dato viene del dueño y se conserva como tal',
    }),
    Object.freeze({
      obra: 'JAVIER SANCHEZ · Instalacion Electrica',
      partidasAjustadas: Object.freeze([
        Object.freeze({ tarea: 'T1180 · PLATAFORMA DE TRABAJO - 8M', coeficiente: 4 }),
        Object.freeze({ tarea: 'T1095 · COTIZACION DE HORA - 1 OF/ 1 AY', coeficiente: 4 }),
      ]),
      // Éste SÍ está en el artefacto, con su archivo y sus filas, y pesa más que el otro: T1180 es
      // una de las partidas metálicas nuevas contra las que había que contrastar, y ya viene con un
      // multiplicador de 4 — fuera del rango en el que un número puede leerse como ajuste.
      verificadoEn: 'Cotizacion Interna - Instalacion Electrica.xlsm · hoja Presupuesto · filas 19 a 25',
      porQueNoSeVerifico: null,
    }),
  ]),
  interpretacionPermitida: 'hay evidencia de que partidas de estructura y equipamiento metálico recibieron ajustes adicionales que otras partidas no recibieron, lo que SUGIERE que el análisis y la composición históricos de esas partidas eran insuficientes',
  interpretacionProhibida: '«1,4, 1,5 o 4 son los coeficientes correctos para estructura metálica»: no hay medición, ni composición, ni HH reales que lo sostengan; aprenderlo convertiría un parche en método',
  aContrastarCon: Object.freeze([
    'las partidas metálicas nuevas T1180–T1185',
    'mediciones reales de obra',
    'composiciones de cada partida',
    'recursos asignados',
    'HH imputadas',
    'materiales consumidos',
    'procesos de ejecución',
  ]),
  objetivo: 'reemplazar el multiplicador opaco por CÓMPUTO → COMPOSICIÓN → RECURSOS → HH → COSTO con genealogía verificable',
})

/** Las partidas ajustadas de todos los casos, aplanadas. PURA. */
export const partidasDelCasoMetalico = () =>
  INSUFICIENCIA_METALICA.casos.flatMap((c) => c.partidasAjustadas.map((p) => ({ ...p, obra: c.obra, verificadoEn: c.verificadoEn })))

/** El caso metálico como conocimiento de biblioteca. Sale `INFERIDO` porque es una deducción sobre
 *  una evidencia, y `CANDIDATO` porque nadie la validó. PURA. */
export const aConocimientoInsuficienciaMetalica = ({ fecha = null } = {}) => conocimiento({
  clave: INSUFICIENCIA_METALICA.clave,
  afirmacion: `en ${INSUFICIENCIA_METALICA.casos.length} cotizaciones de «${INSUFICIENCIA_METALICA.cliente}» hay partidas metálicas con un coeficiente de ajuste distinto de 1 (${partidasDelCasoMetalico().map((p) => `${p.tarea} ×${p.coeficiente}`).join(', ')}): es evidencia de POSIBLE insuficiencia del análisis histórico de estructura metálica, no de que esos coeficientes sean correctos`,
  procedencia: PROCEDENCIA.INFERIDO,
  estado: ESTADO.CANDIDATO,
  valor: null,
  unidad: null,
  condicion: `${INSUFICIENCIA_METALICA.interpretacionProhibida}. A contrastar con: ${INSUFICIENCIA_METALICA.aContrastarCon.join(', ')}`,
  confianza: 'BAJA',
  area: AREA,
  fecha,
  evidencia: {
    textoLiteral: partidasDelCasoMetalico().map((p) => `${p.tarea} × ${p.coeficiente}`).join(' | '),
    ubicacion: INSUFICIENCIA_METALICA.casos.map((c) => c.verificadoEn ?? `${c.obra} · SIN VERIFICAR`).join(' || '),
    casos: INSUFICIENCIA_METALICA.casos,
    // Qué parte de esto se pudo cruzar contra el artefacto y qué parte no. Sin esta línea, el caso
    // no verificado se leería con el mismo peso que el que tiene archivo, hoja y fila.
    verificados: INSUFICIENCIA_METALICA.casos.filter((c) => c.verificadoEn).length,
    sinVerificar: INSUFICIENCIA_METALICA.casos.filter((c) => !c.verificadoEn).map((c) => ({ obra: c.obra, porQue: c.porQueNoSeVerifico })),
    interpretacionPermitida: INSUFICIENCIA_METALICA.interpretacionPermitida,
    interpretacionProhibida: INSUFICIENCIA_METALICA.interpretacionProhibida,
    objetivo: INSUFICIENCIA_METALICA.objetivo,
  },
})
