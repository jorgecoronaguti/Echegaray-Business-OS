// LO QUE XSAS APRENDIÓ DEL PAPER DE NAVAS, RIDL & TORÉS (2012) — no el PDF: lo que dice.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE ═══
//
// El paper estaba citado en `plano/cuadrilla.mjs` y nadie lo había leído: los valores estaban en
// comentarios y las fórmulas en código, pero no había forma de contestar «¿de dónde sale la jornada
// de 7,50 h?» sin abrir el código. Esto lo convierte en CONOCIMIENTO consultable: cada afirmación
// con su cita textual y su página, para que la respuesta salga de un `find` y no de una llamada.
//
// ═══ LA PROCEDENCIA ES `INVESTIGACION`, Y NO SE MUEVE ═══
//
// Un paper es un método publicado y verificable. NO es una norma —no lo dicta ningún organismo—, no
// es experiencia ECSAS —no lo medimos nosotros— y no es un hecho del proyecto. Que sus autores sean
// del CIRCOT-FI-UNSJ lo hace CERCANO a San Juan, no nuestro.
//
// ═══ LAS TRES INCONSISTENCIAS DE LA FUENTE ═══
//
// Están declaradas como conocimiento, no escondidas en un comentario: quien use el método tiene que
// poder enterarse de que la conclusión del paper no coincide con su propia Tabla 1.
import { PROCEDENCIA, conocimiento, documento, ETAPA } from './biblioteca.mjs'

export const FUENTE_ID = 'navas-2012-cuadrilla'
export const URL = 'https://www.revista.ingenieria.uady.mx/volumen16/mano.pdf'

/** El hash del PDF tal como se bajó el 28/08/2026 (sha256 del archivo entero, 6.214.040 bytes). Es
 *  lo que contesta «¿cambió la fuente?» sin volver a leerla, y lo que impide estudiar dos veces el
 *  mismo contenido. Lo calcula `conocimiento-sembrar.mjs --pdf`; acá queda el valor observado para
 *  poder comparar sin el archivo a mano. */
export const HASH_PDF = 'sha256:017a10cd6e4fd27203b0bb3b4ee17a847c741ece853a8d113d76619fc862e810'

export const CITA = 'Navas R. F., Ridl M. R., Torés L. (2012). «Mano de obra en la construcción: determinación de la cuadrilla óptima por medio de una herramienta de simulación». Ingeniería, Revista Académica de la FI-UADY, 16-2, pp 151-163, ISSN 1665-529-X.'

/** El documento estudiado. `ESTUDIADO` significa que salió conocimiento de él: los 12 de abajo. */
export const documentoDelPaper = (hash) => documento({
  fuenteId: FUENTE_ID, url: URL, titulo: CITA, hash, formato: 'pdf', paginas: 13,
  version: 'Ingeniería FI-UADY 16-2 (2012), pp 151-163', obtenidoEn: '2026-08-28',
  etapa: ETAPA.ESTUDIADO,
  porQue: 'se reconstruyeron las 10 filas de su Tabla 1 y la implementación las reproduce al decimal impreso',
})

const k = (o) => conocimiento({ ...o, procedencia: PROCEDENCIA.INVESTIGACION, jurisdiccion: 'provincial', area: 'mano_obra', fecha: '2026-08-28' })

/**
 * LAS AFIRMACIONES. Cada una con la frase que la dice y su página.
 *
 * ═══ DÓNDE LA CITA NO ES LITERAL, Y POR QUÉ ═══
 *
 * El PDF tiene las fórmulas COMO IMÁGENES: la capa de texto trae los símbolos sueltos y fuera de
 * orden. Donde eso pasa, la cita es una RECONSTRUCCIÓN legible de lo que la imagen muestra, y va
 * marcada con `reconstruida: true`. Las tres afectadas son las de desperdicio horario y la relación
 * ideal. Las demás son transcripción directa de la capa de texto.
 *
 * Decirlo importa: una cita que se presenta como literal y no lo es hace que quien la verifique
 * busque una frase que no va a encontrar y concluya que la fuente no dice eso.
 */
export const CONOCIMIENTOS = Object.freeze([
  k({
    clave: 'cuadrilla.jornada_efectiva_h', valor: 7.5, unidad: 'h/jornada', confianza: 'ALTA',
    afirmacion: 'la jornada de trabajo efectiva del método es de 7,50 h sobre 8,00 nominales',
    condicion: 'es el valor DEL PAPER, no el de ECSAS: la jornada de ECSAS sale del convenio UOCRA vigente',
    evidencia: { pagina: 157, textoLiteral: 'Se considera la jornada de trabajo equivale a 7,50 horas, siendo las 0,50 horas restantes para completar las 8,00 horas de trabajo completo el "desperdicio" estimado en tiempo de aprestamiento (entrada) y de despeje de la zona de trabajo (salida)' },
  }),
  k({
    clave: 'cuadrilla.relacion_salarial_ejemplo', valor: 1.18, unidad: 'jornales de ayudante por jornal de oficial', confianza: 'ALTA',
    afirmacion: 'en el ejemplo del paper una jornada de oficial equivale a 1,18 jornadas de ayudante',
    condicion: 'es una relación SALARIAL de 2012 y caduca: para ECSAS sale de jornal_oficial / jornal_ayudante de la paritaria UOCRA vigente',
    evidencia: { pagina: 158, textoLiteral: 'a valores de costo de salarios, una jornada o jornal de oficial equivale a 1,18 jornales de ayudante; por tanto, los desperdicios expresados en jornales de oficial se transformarán en jornales equivalentes multiplicándolos por 1,18' },
  }),
  k({
    clave: 'cuadrilla.contenido_total', afirmacion: 'el contenido total de trabajo es la suma del contenido de oficial y el de ayudante (Ctot = Cof + Cay)', confianza: 'ALTA',
    evidencia: { pagina: 152, textoLiteral: 'El contenido total del trabajo se obtiene como suma de un contenido de trabajo de oficial y un contenido de trabajo de ayudante resultando la Ecuación (1)' },
  }),
  k({
    clave: 'cuadrilla.relacion_ideal', afirmacion: 'la relación ideal i es Cof/Cay, y equivale a la relación entre cantidad de oficiales y ayudantes de la cuadrilla ideal', confianza: 'ALTA',
    evidencia: { pagina: 152, reconstruida: true, porQueReconstruida: 'en el PDF «γi» es una imagen y la capa de texto la deja como «i»', textoLiteral: 'la relación entre los contenidos de trabajo de oficial y ayudante, equivale a la relación entre la cantidad de oficiales y ayudantes integrantes de la cuadrilla ideal. A esta relación se la denomina i [γi]' },
  }),
  k({
    clave: 'cuadrilla.horas_necesarias', afirmacion: 'las horas necesarias son TN = P · C, y son independientes de la cuadrilla que se arme', confianza: 'ALTA',
    evidencia: { pagina: 155, textoLiteral: 'Tiempo total necesario de mano de obra: (TN) = P · Ctot = 345 m2 · 0,30 h/m2 = 103,5 h' },
  }),
  k({
    clave: 'cuadrilla.manda_el_que_tarda_mas', afirmacion: 'el tiempo de ejecución de la cuadrilla es el MAYOR de los dos tiempos, porque la cuadrilla es una unidad que entra y sale junta', confianza: 'ALTA',
    evidencia: { pagina: 157, textoLiteral: 'Dado que los 7 integrantes de la cuadrilla conforman una unidad, de los dos valores hallados se elige el mayor; por tanto, el tiempo total de ejecución es 2,02J' },
  }),
  k({
    clave: 'cuadrilla.desperdicio_horario_oficial', afirmacion: 'el desperdicio horario de oficial es dof = OF − i · AY, y un signo negativo significa que NO hay desperdicio de oficial', confianza: 'ALTA',
    evidencia: { pagina: 158, reconstruida: true, porQueReconstruida: 'la fórmula es una imagen; la frase del signo sí es literal, y en el PDF dice «dof (9)» con la referencia a la ecuación', textoLiteral: 'dof = 5 − 2,75 · 2 = −0,50 h … El signo negativo de dof (9) indica que no hay desperdicio de tiempo de oficial' },
  }),
  k({
    clave: 'cuadrilla.desperdicio_horario_ayudante', afirmacion: 'el desperdicio horario de ayudante es day = AY − OF / i', confianza: 'ALTA',
    evidencia: { pagina: 158, reconstruida: true, porQueReconstruida: 'la fórmula es una imagen: la capa de texto trae los símbolos sueltos y fuera de orden', textoLiteral: 'day = 2 − 5 / 2,75 = 0,18 h' },
  }),
  k({
    clave: 'cuadrilla.abaco', valor: 49, afirmacion: 'el ábaco tiene 49 conformaciones hasta 7×7, y las básicas son las que no son múltiplo entero de otra', confianza: 'ALTA',
    evidencia: { pagina: 152, textoLiteral: 'La Figura 1 muestra las 49 conformaciones posibles de cuadrilla, desde la mínima 1of × 1ay hasta la elegida como máxima 7of × 7ay … Los cruces no circulados indican conformaciones de cuadrillas múltiplos enteros de otras cuadrillas básicas' },
  }),
  k({
    clave: 'cuadrilla.multiplos_entran', afirmacion: 'los múltiplos enteros de una cuadrilla básica SÍ se consideran al seleccionar, aunque no estén dibujados', confianza: 'ALTA',
    condicion: 'es lo que hace que «2 cuadrillas [2*1] independientes» sea una respuesta válida y no otra cuadrilla',
    evidencia: { pagina: 161, textoLiteral: 'NOTA: En las cuadrillas a seleccionar, también deben tenerse en cuenta las que son múltiplos enteros de las cuadrillas básicas. Ejemplo: donde figure la cuadrilla básica (2 * 1), no aparecen las cuadrillas (4 * 2) y (6 * 3) ya que son múltiplos.' },
  }),
  k({
    clave: 'cuadrilla.el_numero_no_decide', afirmacion: 'el método ORIENTA la búsqueda de la cuadrilla óptima; la decisión final exige mirar los condicionantes de la obra', confianza: 'ALTA',
    evidencia: { pagina: 158, textoLiteral: 'La aplicación de la metodología expuesta, solamente brinda al profesional una orientación en la búsqueda de la cuadrilla óptima siendo necesario un posterior análisis de todos los condicionantes que se presentan en cada caso para adoptar la decisión final' },
  }),
  k({
    clave: 'cuadrilla.origen_de_los_estandares', afirmacion: 'los estándares de insumo de mano de obra del método salen de Vázquez Cabanillas & De La Torre (1983), Fascículo 5 CIRCOT — estándares zonales de San Juan', confianza: 'ALTA',
    condicion: 'son de 1983 y son ZONALES: cerca de nuestra obra, pero no medidos en nuestras obras',
    evidencia: { pagina: 152, textoLiteral: 'Del trabajo "Estándares de insumos de mano de obra" (Vázquez Cabanillas, C. E.; De La Torre, J. 1983) se obtuvieron por primera vez estándares zonales correspondientes a la provincia de San Juan, Argentina' },
  }),
])

/** LO QUE LA PROPIA FUENTE SE CONTRADICE. Se declara: la fuente dice lo que dice, y quien la use
 *  tiene que saber dónde no cierra. Ninguna de las tres se «corrigió» en el código. */
export const INCONSISTENCIAS = Object.freeze([
  k({
    clave: 'cuadrilla.fuente.inconsistencia.columna', confianza: 'ALTA',
    afirmacion: 'la conclusión cita «la columna 14» para hablar de costos, y los costos son la columna 16 (la 14 es el desperdicio de ayudante en jornadas)',
    evidencia: { pagina: 158, textoLiteral: 'En el ejemplo propuesto, el exclusivo análisis de los costos (columna 14) indica como óptima la cuadrilla 3 [5 * 2]' },
  }),
  k({
    clave: 'cuadrilla.fuente.inconsistencia.orden', confianza: 'ALTA',
    afirmacion: 'la conclusión dice que por costo siguen la 8 y la 9, pero por su propia Tabla 1 las terceras son la 2 [3*1] y la 10 [6*2] empatadas en $ 4.250,40; la 9 está quinta con $ 4.326,30',
    evidencia: { pagina: 158, textoLiteral: 'indica como óptima la cuadrilla 3 [5 * 2] seguida por la 8 [7 * 3] y la 9 [4 * 2]' },
  }),
  k({
    clave: 'cuadrilla.fuente.inconsistencia.relacion', confianza: 'ALTA',
    afirmacion: 'la columna 15 usa la relación salarial redondeada a 1,18 mientras la columna 16 usa los salarios exactos (40/34 = 1,17647): la fila 6 da 5,43 con una y 5,41 con la otra',
    evidencia: { pagina: 160, textoLiteral: 'Salarios Oficial 40 $/H Ayudante 34 $/H' },
  }),
])
