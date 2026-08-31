// LO QUE DEJA UNA COTIZACIÓN COMPARADA — conocimiento con CONDICIÓN, no con nombre propio.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// «Quattropani → usar la partida X» no es un aprendizaje: es una respuesta memorizada que no sirve
// para el plano siguiente y que además es peligrosa, porque el próximo galpón no es éste. Un
// aprendizaje útil dice CUÁNDO se aplica: «si el elemento no declara espesor y la partida candidata
// lo declara en su nombre, no son la misma cosa». Esa frase sirve para cualquier obra y se puede
// contrastar.
//
// Por eso cada aprendizaje que sale de acá tiene `condicion` —la señal observable que lo dispara— y
// `porQue` —la evidencia medida que lo respalda—. Sin las dos no se emite.
//
// ═══ POR QUÉ NO HAY MEMORIA NUEVA ═══
//
// El aprendizaje va a `public.conocimiento_empresa`, que es donde ya vive todo lo que la empresa
// aprendió, con su `tipo` (HECHO · INFERENCIA · CANDIDATO · VALIDADO · DESCARTADO) y su `clave`
// única. La gobernanza tampoco se toca: `obra-plan-real.mjs` ya dice que un caso aislado entra como
// CANDIDATO y que hacen falta dos casos comparables de OBRAS DISTINTAS para VALIDADO. Una obra no
// valida nada, por más que la comparación contra su histórico haya salido bien.

import { estadoDelAprendizaje } from '../obra-plan-real.mjs'

/** Un aprendizaje candidato. `condicion` es lo que lo dispara; `nombresPropios` viaja aparte y sólo
 *  como evidencia — nunca dentro de la afirmación. */
export function aprendizaje({ clave, condicion, afirmacion, porQue, evidencia = {}, area = 'cotizacion' }) {
  return Object.freeze({ clave, condicion, afirmacion, porQue, evidencia, area, tipo: 'CANDIDATO' })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL EXPEDIENTE DE UN CANDIDATO — lo que hace falta para poder decirle que no
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ POR QUÉ UN APRENDIZAJE NO PUEDE SER UNA FRASE ═══
//
// Hoy hay 10 CANDIDATO en `conocimiento_empresa` y ninguno se puede evaluar: dicen qué se aprendió
// y no dicen sobre cuántos casos, de qué obras, en qué rango de fechas, ni cuánto se dispersan
// entre sí. Sin eso, quien tiene que aprobarlos no tiene con qué rechazar uno — y una gobernanza que
// no puede rechazar es un sello.
//
// El expediente trae las nueve cosas que permiten decir que no:
//
//   sampleCount · obras · contexto · unidades · distribucion · dispersion · evidencia ·
//   procedencia · rangoDeFechas
//
// ═══ LA DISPERSIÓN ES LA QUE MÁS DUELE ═══
//
// Dos mediciones que difieren un 40 % no se están confirmando: están diciendo que algo más cambió
// —la cuadrilla, el frente, el clima— y promediarlas fabrica un número que no describe a ninguna de
// las dos. Por eso la dispersión viaja SIEMPRE y el promedio nunca viaja solo.

const numero = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v))

/** Mín, mediana, máx y coeficiente de variación. `null` donde no se puede: con un solo caso no hay
 *  dispersión, y escribir 0 diría «todas las mediciones coinciden» sobre una sola medición. */
export function distribucionDe(valores = []) {
  const xs = valores.map(numero).filter((x) => x !== null).sort((a, b) => a - b)
  if (!xs.length) return Object.freeze({ n: 0, min: null, mediana: null, max: null, promedio: null, desvio: null, cv: null })
  const promedio = xs.reduce((a, b) => a + b, 0) / xs.length
  const mediana = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2
  const desvio = xs.length > 1
    ? Math.sqrt(xs.reduce((a, x) => a + (x - promedio) ** 2, 0) / (xs.length - 1))
    : null
  return Object.freeze({
    n: xs.length, min: xs[0], max: xs[xs.length - 1], mediana,
    promedio: Math.round(promedio * 10000) / 10000,
    desvio: desvio === null ? null : Math.round(desvio * 10000) / 10000,
    // Coeficiente de variación. Con promedio 0 NO es infinito ni cero: no hay proporción posible.
    cv: desvio === null || promedio === 0 ? null : Math.round((desvio / Math.abs(promedio)) * 1000) / 1000,
  })
}

/**
 * EL EXPEDIENTE DE UN CANDIDATO. PURA.
 *
 * `casos` son observaciones de rendimiento real, cada una con `{obraId, actividadId, tareaTipoId,
 * unidad, hsUnitarias, fecha, fuente}`. NADA se completa: un caso sin fecha deja el rango abierto y
 * lo declara, no se le pone la fecha de hoy.
 */
export function expedienteDe({ clave, condicion, afirmacion, area = 'cotizacion', casos = [] } = {}) {
  if (!clave) throw new Error('un aprendizaje sin clave no se puede volver a encontrar ni contrastar')
  const obras = [...new Set(casos.map((c) => c.obraId).filter(Boolean))]
  const unidades = [...new Set(casos.map((c) => c.unidad).filter(Boolean))]
  const fechas = casos.map((c) => c.fecha).filter(Boolean).map(String).sort()
  const sinFecha = casos.filter((c) => !c.fecha).length
  const procedencia = [...new Set(casos.map((c) => c.fuente ?? 'SIN_FUENTE_DECLARADA'))]

  return Object.freeze({
    clave, condicion, afirmacion, area, tipo: 'CANDIDATO',
    sampleCount: casos.length,
    obras: Object.freeze(obras),
    // Un aprendizaje que mezcla unidades no es un aprendizaje: es dos, superpuestos.
    unidades: Object.freeze(unidades),
    contexto: Object.freeze({
      tareaTipoId: [...new Set(casos.map((c) => c.tareaTipoId).filter(Boolean))],
      actividades: [...new Set(casos.map((c) => c.actividadId).filter(Boolean))].length,
    }),
    distribucion: distribucionDe(casos.map((c) => c.hsUnitarias)),
    dispersion: distribucionDe(casos.map((c) => c.hsUnitarias)).cv,
    rangoDeFechas: Object.freeze({
      desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null,
      // Un rango calculado sobre la mitad de los casos no es el rango. Se dice cuántos faltan.
      casosSinFecha: sinFecha,
    }),
    procedencia: Object.freeze(procedencia),
    evidencia: Object.freeze(casos.map((c) => Object.freeze({ ...c }))),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA PROMOCIÓN — y por qué este archivo NO decide qué se valida
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// La regla que eleva a VALIDADO vive en `obra-plan-real.mjs` y NO se reimplementa acá: dos casos
// comparables, consistentes dentro de la tolerancia y de OBRAS DISTINTAS. Si esa regla viviera en
// dos archivos, el OS tendría dos respuestas a «¿esto ya se puede usar para cotizar?», que es
// exactamente lo que la realidad única prohíbe.
//
// Lo único que este archivo agrega es un estado INTERMEDIO que hoy no existe y que hace falta para
// poder revisar la cola: `estadoDelAprendizaje` devuelve CANDIDATO tanto para «primer caso de la
// vida» como para «se midió en dos obras distintas y las dos se contradicen». Son cosas muy
// distintas —la segunda YA fue contrastada contra evidencia independiente y no sobrevivió— y
// mezcladas en un solo estado nadie las separa.
//
// ═══ ESTO NO AFLOJA NADA ═══
//
// CONTRASTADO es una partición del CANDIDATO que la gobernanza ya había decidido. Un VALIDADO pasa
// tal cual y NUNCA se produce acá.

export const ESTADO_APRENDIZAJE = Object.freeze({
  CANDIDATO: 'CANDIDATO',       // no se contrastó todavía, o sólo contra la misma obra
  CONTRASTADO: 'CONTRASTADO',   // se midió en otra obra y NO se confirmó: hay una pregunta abierta
  VALIDADO: 'VALIDADO',         // lo decide la gobernanza de obra-plan-real.mjs, nunca este archivo
})

/**
 * QUÉ ESTADO LE CORRESPONDE A UN CASO NUEVO. PURA.
 *
 * Delega en `estadoDelAprendizaje` y sólo refina su CANDIDATO. `previos` son los casos ya conocidos
 * de la misma tarea.
 */
export function promocionDe(nuevo, previos = []) {
  const g = estadoDelAprendizaje(nuevo, previos)
  if (g.estado === ESTADO_APRENDIZAJE.VALIDADO) return Object.freeze({ ...g, gobernanza: 'obra-plan-real.mjs' })

  const deOtraObra = previos.some((p) =>
    p?.obraId && nuevo?.obraId && p.obraId !== nuevo.obraId &&
    p.tareaTipoId && nuevo.tareaTipoId && p.tareaTipoId === nuevo.tareaTipoId && p.unidad === nuevo.unidad)
  if (deOtraObra) {
    return Object.freeze({
      ...g, estado: ESTADO_APRENDIZAJE.CONTRASTADO, gobernanza: 'obra-plan-real.mjs',
      porQue: `${g.porQue} — se contrastó contra otra obra y no se confirmó: la diferencia es la pregunta, no un promedio`,
    })
  }
  return Object.freeze({ ...g, gobernanza: 'obra-plan-real.mjs' })
}

/**
 * LA REGRESIÓN, ANTES DE ACTIVAR. PURA.
 *
 * ═══ UN APRENDIZAJE QUE EMPEORA LO CONOCIDO NO SE ACTIVA ═══
 *
 * Que un conocimiento nuevo esté bien medido no dice que sirva. La prueba es contra los casos que ya
 * se sabían: se predice cada uno con la referencia vieja y con la nueva, y se compara el error. Si
 * el error EMPEORA, no se promueve — por más casos que lo sostengan.
 *
 * `casosConocidos` son `{real, esperado}` medidos antes; `predecir(caso, valor)` devuelve la
 * predicción con un valor dado. Sin casos conocidos NO devuelve «pasa»: devuelve `SIN_REGRESION`,
 * porque no haber podido probar no es haber probado.
 */
export function regresionDe({ casosConocidos = [], valorViejo = null, valorNuevo = null, predecir } = {}) {
  if (!casosConocidos.length || valorNuevo === null || typeof predecir !== 'function') {
    return Object.freeze({ resultado: 'SIN_REGRESION', promueve: false, porQue: 'no hay casos conocidos contra los que probar: no haber podido probar no es haber probado' })
  }
  const err = (v) => casosConocidos.reduce((a, c) => {
    const p = numero(predecir(c, v))
    const r = numero(c.real)
    // Un caso sin real no aporta error. NO se cuenta como acierto.
    return p === null || r === null ? a : a + Math.abs(p - r)
  }, 0)
  const medibles = casosConocidos.filter((c) => numero(c.real) !== null && numero(predecir(c, valorNuevo)) !== null).length
  if (!medibles) {
    return Object.freeze({ resultado: 'SIN_REGRESION', promueve: false, porQue: 'ningún caso conocido trae su valor real: no hay error que comparar' })
  }
  const viejo = valorViejo === null ? null : err(valorViejo)
  const nuevo = err(valorNuevo)
  if (viejo === null) {
    return Object.freeze({ resultado: 'SIN_REFERENCIA', promueve: true, errorNuevo: nuevo, casos: medibles, porQue: 'no había referencia previa: el conocimiento nuevo no empeora nada porque no había nada' })
  }
  const mejora = nuevo <= viejo
  return Object.freeze({
    resultado: mejora ? 'MEJORA_O_IGUAL' : 'EMPEORA',
    promueve: mejora,
    errorViejo: Math.round(viejo * 10000) / 10000,
    errorNuevo: Math.round(nuevo * 10000) / 10000,
    casos: medibles,
    porQue: mejora
      ? `el error total sobre ${medibles} caso(s) conocidos no empeora (${nuevo.toFixed(4)} contra ${viejo.toFixed(4)})`
      : `el error total sobre ${medibles} caso(s) conocidos EMPEORA (${nuevo.toFixed(4)} contra ${viejo.toFixed(4)}): NO se promueve`,
  })
}

const money = (n) => `$ ${Math.round(Number(n ?? 0)).toLocaleString('es-AR')}`

/**
 * LOS APRENDIZAJES QUE SALEN DE UNA COMPARACIÓN. PURA.
 *
 * No emite uno por cada diferencia: eso sería copiar el diff a la base. Emite uno por cada PATRÓN
 * que la comparación demuestra, con la cantidad de casos que lo sostienen. Un patrón que aparece
 * una sola vez se emite igual —es un candidato— pero dice que apareció una sola vez.
 */
export function aprendizajesDe(comp, { proyecto = null, obra = null } = {}) {
  const out = []
  const d = comp?.diferencias ?? []

  // ── 1. EL ALCANCE NO ESTÁ EN EL PLANO ──
  const sobran = d.filter((x) => x.tipo === 'sobra_en_v0')
  if (sobran.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:alcance-no-esta-en-el-plano',
      condicion: 'se pide cotizar a partir de planos y el pedido no declara el alcance (mano de obra sola o con materiales, qué sectores entran, qué se excluye)',
      afirmacion: 'El alcance de una cotización NO se deduce de un plano. Un plano dibuja todo lo que se va a construir; una oferta cubre lo que se acordó cubrir. Sin alcance declarado, el cómputo de un plano es un TECHO —lo máximo que podría entrar— y no una oferta. Antes de cotizar hay que preguntar: ¿mano de obra sola o con materiales? ¿qué sectores quedan afuera?',
      porQue: `${sobran.length} partida(s) por ${money(sobran.reduce((a, x) => a + (x.v0?.subtotal ?? 0), 0))} que XSAS computó del plano y el histórico no cotizó`,
      evidencia: { proyecto, obra, partidas: sobran.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, subtotal: x.v0?.subtotal })) },
    }))
  }

  // ── 2. HAY PARTIDAS QUE NO SON ELEMENTOS DIBUJADOS ──
  const noVistas = d.filter((x) => x.tipo === 'falta_en_v0' && x.causa?.clave === 'interpretacion_del_plano')
  if (noVistas.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:tareas-de-proceso-no-se-dibujan',
      condicion: 'se computa una obra a partir de sus elementos dibujados',
      afirmacion: 'Un cómputo hecho SÓLO de elementos dibujados pierde sistemáticamente las tareas de proceso, que ningún plano dibuja porque no son objetos: replanteo, excavación, hormigón de limpieza, capa aisladora, compactación, retiro de escombros, limpieza final. No se leen del plano — se DERIVAN de otras partidas (el replanteo sale de la superficie cubierta, la excavación del volumen de bases y vigas de fundación, el hormigón de limpieza de la superficie de las bases). Mientras el motor no tenga esas derivaciones, un presupuesto salido de un plano está incompleto por diseño, no por error de lectura.',
      porQue: `${noVistas.length} partida(s) del histórico que XSAS no identificó como elemento en ninguna lámina: ${noVistas.map((x) => x.codigo).join(', ')}`,
      evidencia: { proyecto, obra, partidas: noVistas.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, subtotal: x.historico?.subtotal })) },
    }))
  }

  // ── 3. UNA PARTIDA QUE DECLARA UNA DIMENSIÓN NO ES UNA PARTIDA GENÉRICA ──
  const porDimension = d.filter((x) => x.tipo === 'sobra_en_v0' && /\b\d+\s?(cm|mm|m)\b|e\s?=\s?0?[.,]\d/i.test(String(x.descripcion ?? '')))
  if (porDimension.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:partida-con-dimension-en-el-nombre',
      condicion: 'el elemento leído del plano NO declara su espesor/sección y la partida candidata SÍ lo declara en su nombre (PLATEA 50CM, CONTRAPISO e=0,10 m, MURO e=0,20)',
      afirmacion: 'Cuando la partida lleva una dimensión en el nombre y el elemento del plano no la declara, NO son la misma cosa: la partida está afirmando un espesor que nadie leyó, y ese espesor es casi todo el costo. Corresponde PARTIDA_CANDIDATA y preguntar el espesor, no elegir la partida y arrastrar su dimensión.',
      porQue: `${porDimension.length} caso(s) medido(s), el mayor por ${money(Math.max(...porDimension.map((x) => x.v0?.subtotal ?? 0)))}`,
      evidencia: { proyecto, obra, partidas: porDimension.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, subtotal: x.v0?.subtotal })) },
    }))
  }

  // ── 4. LO QUE NO SE PUDO ABRIR ──
  const porDoc = d.filter((x) => x.causa?.clave === 'documentacion_faltante')
  if (porDoc.length) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:elemento-detectado-sin-medida',
      condicion: 'XSAS detecta un elemento en el plano, lo especifica bien, y no puede medirlo ni contarlo después de la segunda pasada',
      afirmacion: 'Un elemento detectado y no medido NO es un elemento que falta: es una pregunta concreta y corta para el proyectista o para el DWG. Vale más entregar esa lista —«¿cuántas correas C140 y de qué largo?»— que completar el número. La lista de huecos es un entregable de la cotización, no un residuo.',
      porQue: `${porDoc.length} partida(s) del histórico cuyo elemento XSAS sí vio pero no pudo medir`,
      evidencia: { proyecto, obra, partidas: porDoc.map((x) => ({ codigo: x.codigo, detalle: x.detalle })) },
    }))
  }

  // ── 5. EL DESVÍO TOTAL, COMO HECHO MEDIDO ──
  if (comp?.desvioTotalPct !== null && comp?.desvioTotalPct !== undefined) {
    out.push(aprendizaje({
      clave: 'plano-cotizacion:desvio-primera-cotizacion-automatica',
      condicion: 'se mide una cotización generada por XSAS desde planos contra la cotización que hizo una persona para la misma obra',
      afirmacion: `Una cotización generada sólo desde planos, sin alcance declarado y sin las tareas derivadas, quedó ${comp.desvioTotalPct > 0 ? 'por encima' : 'por debajo'} del histórico en ${Math.abs(comp.desvioTotalPct)} % del costo directo, con ${comp.partidasV0} partidas contra ${comp.partidasHistorico}. La cercanía del total NO significa que el cómputo esté bien: son omisiones y excesos que se compensan, y por partida las diferencias son mucho mayores que el total.`,
      porQue: `V0 ${money(comp.totalV0)} contra histórico ${money(comp.totalHistorico)} · ${comp.diferencias.length} diferencias clasificadas`,
      evidencia: { proyecto, obra, porCausa: comp.porCausa, coincidentes: comp.coincidentes },
    }))
  }
  return out
}

/**
 * LOS APRENDIZAJES QUE DEJA HABER ABIERTO LA DOCUMENTACIÓN. PURA.
 *
 * No salen de comparar contra un histórico —para eso está `aprendizajesDe`— sino de MEDIR la propia
 * corrida: cuántas vistas tenía la lámina, cuántos bloques tenía el CAD, cuánto subió lo detectado
 * al leer por vistas. Cada uno se emite SÓLO si la corrida lo demuestra, con el número medido
 * adentro del `porQue`, y ninguno menciona el proyecto en la afirmación: la condición es la señal
 * observable que lo dispara en cualquier obra.
 */
export function aprendizajesDeIngesta(r, { proyecto = null } = {}) {
  const out = []
  const seg = (r?.documental?.segmentaciones ?? []).flatMap((s) => s.laminas)
  const porTitulos = seg.filter((l) => l.metodo === 'TITULOS')
  if (porTitulos.length) {
    const regiones = porTitulos.reduce((a, l) => a + l.regiones.length, 0)
    out.push(aprendizaje({
      clave: 'xsas:lamina-cad-se-segmenta-por-titulos',
      area: 'computo',
      condicion: 'una lámina viene de un PDF exportado de CAD y hay que separar sus vistas',
      afirmacion: 'Una lámina exportada de CAD NO se puede partir en sus vistas por espacio en blanco: el marco, las líneas de cota y los llamados conectan todos los dibujos entre sí, y agrupar por cercanía devuelve una sola región que tapa la hoja entera. Se separa por los TÍTULOS que el propio proyectista escribió al pie de cada vista, que son los textos de mayor cuerpo de la lámina y llevan vocabulario de vista (planta, corte, detalle, estructura). El título sin el cuerpo de letra agarra cada «ver detalle» del dibujo; el cuerpo sin el título agarra el número de plano.',
      porQue: `${porTitulos.length} lámina(s) segmentadas por título dieron ${regiones} vistas; el mismo material agrupado por espacio en blanco daba 1 por lámina, con cualquier holgura`,
      evidencia: { proyecto, laminas: porTitulos.map((l) => ({ regiones: l.regiones.length, titulos: l.regiones.map((x) => x.titulo).slice(0, 12) })) },
    }))
  }
  if ((r?.porRegion ?? []).length && r?.computo?.detectados) {
    out.push(aprendizaje({
      clave: 'xsas:leer-por-vistas-revela-lo-que-la-lamina-entera-esconde',
      area: 'computo',
      condicion: 'se computa una obra mirando la lámina completa en vez de cada vista por separado',
      afirmacion: 'Mirar la lámina entera subestima el cómputo y no se nota: a la resolución en que entra una lámina A1, un símbolo de 8 mm ocupa cuatro píxeles y los elementos chicos directamente no se ven. Leer VISTA POR VISTA, recortada y ampliada, multiplica los elementos detectados. La cobertura RELATIVA puede bajar al hacerlo, y eso no es un retroceso: es que aparece lo que faltaba y antes no se contaba en el denominador.',
      porQue: `leer por vistas detectó ${r.computo.detectados} elementos en ${r.porRegion.length} vistas y computó ${r.computo.computados}`,
      evidencia: { proyecto, vistas: r.porRegion.length, detectados: r.computo.detectados, computados: r.computo.computados },
    }))
  }
  const cad = r?.medicionCad
  if (cad && cad.bloquesDisponibles !== undefined) {
    out.push(aprendizaje({
      clave: 'xsas:el-conteo-de-bloques-cad-sirve-si-la-estructura-usa-bloques',
      area: 'computo',
      condicion: 'el proyecto trae un DWG/DXF y hay elementos sin cantidad',
      afirmacion: 'Contar los INSERT de un bloque resuelve una cantidad de forma exacta y sin costo, pero SÓLO sirve si la pieza está dibujada como bloque. Hay proyectos donde la estructura se dibuja con líneas sueltas y los únicos bloques son los artefactos sanitarios y los símbolos de acotación: ahí el CAD aporta cotas y capas, no cantidades. Antes de esperar que el CAD resuelva el conteo hay que mirar QUÉ bloques tiene, y si son de mobiliario o de anotación, la cantidad sigue faltando.',
      porQue: `el CAD del proyecto tenía ${cad.bloquesDisponibles} bloque(s) con nombre propio y ${cad.cotas} cota(s) medidas; el conteo de bloques resolvió ${cad.resueltos.length} elemento(s)`,
      evidencia: { proyecto, bloques: cad.bloquesDisponibles, cotas: cad.cotas, resueltos: cad.resueltos.length },
    }))
  }
  if ((r?.proyecto?.conflictos ?? []).length) {
    out.push(aprendizaje({
      clave: 'xsas:cruzar-documentos-produce-conflictos-que-hay-que-declarar',
      area: 'computo',
      condicion: 'un proyecto trae más de un documento que habla de lo mismo (dos CAD, plano y memoria, pliego y planilla)',
      afirmacion: 'Cruzar la documentación de un proyecto SIEMPRE produce contradicciones, y son información: dos CAD del mismo edificio con conteos distintos del mismo bloque, o un pliego que asigna dos materiales al mismo rubro. Ninguna se resuelve eligiendo la fuente de más peso — el peso sirve para saber a quién preguntarle primero. Un conflicto sin resolver deja la cotización INCOMPLETA, porque el precio de esa partida no está determinado.',
      porQue: `${r.proyecto.conflictos.length} conflicto(s) entre documentos del mismo proyecto`,
      evidencia: { proyecto, conflictos: r.proyecto.conflictos.map((c) => ({ que: c.que, versiones: c.versiones?.map((v) => `${v.clase}:${v.valor}`) })).slice(0, 10) },
    }))
  }
  return out
}

/**
 * ESCRIBIRLOS. Siempre CANDIDATO: es la primera obra que atraviesa este circuito y la gobernanza
 * de `obra-plan-real.mjs` exige dos casos comparables de obras distintas para VALIDADO. Que la
 * comparación contra un histórico haya salido parecida no valida nada — el histórico es UN caso.
 */
export async function persistirAprendizajes({ query }, aprendizajes = [], { fuente = 'xsas:plano-cotizacion', proyecto = null } = {}) {
  const escritos = []
  for (const a of aprendizajes) {
    const nombreProyecto = String(proyecto ?? a.evidencia?.proyecto ?? 'sin-proyecto')
    // ═══ `veces_confirmado` CUENTA OBRAS, NO CORRIDAS ═══
    // Antes subía en cada `on conflict`, así que correr `--aprender` dos veces sobre el MISMO
    // proyecto hacía que el OS reportara la regla como confirmada dos veces. Eso contradice la
    // gobernanza que este archivo cita —hacen falta dos casos comparables de OBRAS DISTINTAS— y es
    // la forma más barata de fabricar confianza. Ahora el incremento pasa sólo si el proyecto no
    // estaba ya en la lista, y la lista queda guardada en la evidencia para poder auditarla.
    await query(
      `insert into public.conocimiento_empresa (area, afirmacion, clave, confianza, tipo, fuente, evidencia, veces_confirmado)
            values ($1, $2, $3, 'media', 'CANDIDATO', $4, $5::jsonb || jsonb_build_object('proyectos', jsonb_build_array($6::text)), 1)
       on conflict (clave) do update set
         afirmacion = excluded.afirmacion,
         evidencia = excluded.evidencia || jsonb_build_object(
           'proyectos',
           case when public.conocimiento_empresa.evidencia->'proyectos' @> to_jsonb($6::text)
                then public.conocimiento_empresa.evidencia->'proyectos'
                else coalesce(public.conocimiento_empresa.evidencia->'proyectos', '[]'::jsonb) || to_jsonb($6::text) end),
         veces_confirmado = case
           when public.conocimiento_empresa.evidencia->'proyectos' @> to_jsonb($6::text)
             then public.conocimiento_empresa.veces_confirmado
           else public.conocimiento_empresa.veces_confirmado + 1 end,
         updated_at = now(), vigente = true`,
      [a.area, a.afirmacion, a.clave, fuente, JSON.stringify({ condicion: a.condicion, porQue: a.porQue, ...a.evidencia }), nombreProyecto])
    escritos.push(a.clave)
  }
  return escritos
}
