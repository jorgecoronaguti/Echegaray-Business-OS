// EL QUOTE ORCHESTRATOR — once etapas, cada una con la forma del contrato (§1).
//
// ═══ QUÉ ORQUESTA Y QUÉ NO REESCRIBE ═══
//
// El tramo DOCUMENTOS → CÓMPUTO → PARTIDA ya existe y funciona: `orquestador/lib/plano/` clasifica
// documentos, interpreta láminas, computa elementos, cruza CAD y pliego, y —lo más importante—
// ELIGE LA PARTIDA con `seleccion.mjs`, que es puro y reproducible. Nada de eso se toca acá:
// `desdePipelineDePlano` lo ADAPTA a la forma del contrato y sigue.
//
// Lo que este módulo agrega es el tramo que no existía: alcance, precios como observaciones, costo
// que se niega a afirmarse, cascada comercial, cola de atención, gate de congelado y salida.
//
// ═══ POR QUÉ EL ORQUESTADOR NO LLAMA A NADIE ═══
//
// No abre Drive, no consulta Postgres, no llama a ningún modelo. Recibe una ENTRADA ya materializada
// y devuelve etapas. Eso es lo que hace posible el CLAUDE-ZERO del §34: la corrida determinística
// completa se prueba pasándole la misma entrada y sin proveedor, y tiene que dar el mismo resultado.
// Un orquestador que trae sus propios datos no se puede probar sin los datos.
//
// ═══ EL CORTE ═══
//
// Una etapa BLOQUEADA no detiene la corrida: las siguientes corren igual, en modo degradado, y
// devuelven lo que pueden. Detenerse en la primera dejaría al que arma el presupuesto sin saber
// cuánto más le falta — y el §22 pide una cola de atención, que es justamente la lista de TODO lo
// que hay que resolver, no del primero.

import { ETAPA, STATUS, ESTADO, resultadoEtapa, ORDEN_ETAPAS } from './contrato.mjs'
import { cruzarAlcance, paraCostear } from './alcance.mjs'
import { costoDePartida, costoDirecto, sinMedir } from './costo.mjs'
import { cascada } from './comercial.mjs'
import { colaDeAtencion, estadoDeCola } from './atencion.mjs'
import { huellaDeEntradas, huellaDeResultado, gateDeCongelado } from './freeze.mjs'
import { metricasDeCorrida } from './metricas.mjs'
import { explotarRecursos, reconciliar } from './explosion.mjs'
import { barridoDeFuga, gateDeFuga, exigeConfirmacion } from './seguridad.mjs'
// ═══ LOS DOS IMPORTS QUE FALTABAN, Y POR QUÉ NADIE LO NOTÓ ═══
//
// `indirectoCalculado`, `indirectoAplicado` y `proyectarACascada` se USAN abajo (etapa COMMERCIAL) y
// nunca se importaron. En ESM eso no es un error de parseo: es un `ReferenceError` en tiempo de
// ejecución, y sólo se alcanza cuando la corrida trae `estructuraIndirecta` o
// `politicaEfectivaDeLaCotizacion` — los dos con default `null`. Ninguna corrida se los pasaba, así
// que el camino nunca se evaluó y los tests seguían verdes.
//
// Es la prueba dura de por qué la DoD dejaba #11 y #12 en NO_VERIFICABLE: no es que los indirectos
// «entren por el porcentaje de la política» por decisión de diseño, es que la primera cotización que
// intentara usarlos se caía con `indirectoAplicado is not defined`. EXISTE_CÓDIGO ≠ CAPACIDAD.
import { indirectoCalculado, indirectoAplicado } from './indirectos.mjs'
import { proyectarACascada } from './politica-version.mjs'
import { evaluarComposicion, complementosDe } from '../base-maestra-completitud.mjs'
import { preguntaParaCerrar } from '../base-maestra-pregunta.mjs'

/**
 * ADAPTAR EL RESULTADO DEL PIPELINE DE PLANO a la entrada del orquestador. PURA.
 *
 * Es un traductor y nada más: no recalcula ni reinterpreta. Si mañana `plano/pipeline.mjs` cambia
 * de forma, se cambia esta función y no las once etapas — que es el motivo de que exista.
 */
export function desdePipelineDePlano(resultado = {}) {
  const porTarea = new Map()
  for (const m of resultado.mapeo?.mapeos ?? []) {
    if (m.estado !== 'MAPEADA' || !m.tarea) continue
    const k = m.tarea.id
    const p = porTarea.get(k) ?? { codigo: m.tarea.codigo, descripcion: m.tarea.nombre, unidad: m.tarea.unidad, tareaTipoId: k, rubro: null, cantidad: 0, evidencia: null, lineas: [] }
    p.cantidad += Number(m.computo?.cantidad?.valor ?? 0)
    p.evidencia = p.evidencia ?? m.computo?.evidencia ?? null
    p.lineas.push({ elemento: m.computo?.id, cantidad: m.computo?.cantidad?.valor ?? null })
    porTarea.set(k, p)
  }
  return {
    documentos: (resultado.documentos?.insumos ?? []).map((d) => ({ hash: d.drive_file_id ?? d.name, nombre: d.name, parseado: true })),
    elementos: resultado.computo?.items ?? [],
    partidas: [...porTarea.values()],
    composiciones: resultado.composiciones ?? new Map(),
    degradacion: resultado.degradacion ?? null,
    huellaDeSeleccion: resultado.huella ?? null,
  }
}

/**
 * CORRER LAS ONCE ETAPAS. PURA.
 *
 * Devuelve `{etapas, estado, cola, cascada, huella, gate, metricas}`. `etapas` es un array en el
 * ORDEN del contrato y con una entrada por etapa, siempre las once: una etapa que no corrió sale
 * `OMITIDA` y no desaparece. Que falte una entrada y que una etapa no haya encontrado nada se ven
 * iguales desde afuera, y ése es el defecto que el contrato ya evita en el resultado de etapa.
 */
export function correr({
  documentos = [], elementos = [], partidas = [], composiciones = new Map(),
  observaciones = [], alcance = [], politica = null, fx = null,
  degradacion = null, congeladoPor = null, hoy = new Date(),
  cliente = null, clientesConocidos = [],
  // Los huecos y conflictos que el proyecto YA traía del corpus documental. El motor los HEREDA:
  // §31 dice que un conflicto contractual se mantiene y sólo evidencia o autoridad lo cierra, así
  // que recalcularlos o bajarles la severidad sería resolverlos por la vía de mirar para otro lado.
  issuesHeredados = [],
  alcancePorDefecto = null,
  overridesDePrecio = [],
  relacionesExternas = [],
  exclusionesConfirmadas = [],
  // ── Lo que engancha el motor general (§5 a §8). Los cuatro tienen default inerte: sin ellos la
  //    corrida es exactamente la de antes, y por eso ninguno de los tests viejos se movió.
  //
  // `resolverPrecio` reemplaza la vigencia plana de 180 días por una derivada de materialidad y
  // deriva real. `mapeos` son las decisiones de `plano/seleccion.mjs`: sin ellas MAP no puede
  // ofrecer la pregunta que cierra un hueco, sólo contar partidas. `paresComplementarios` es lo que
  // impide cotizar la mitad de una tarea creyendo que es toda. `estadosDeComposicion` trae el
  // estado declarado en la Base Maestra (VALIDADO / HISTORICO / CANDIDATO / INCOMPLETO).
  resolverPrecio = null,
  mapeos = [],
  paresComplementarios = [],
  estadosDeComposicion = new Map(),
  costosDeCatalogo = {},
  estructuraIndirecta = null,
  intentoDeIndirecto = null,
  politicaEfectivaDeLaCotizacion = null,
  // Lo que la gobernanza activó, no lo que el circuito propuso: `Map<'rendimiento.<codigo>', hs/u>`.
  aprendizajesActivos = new Map(),
} = {}) {
  const etapas = []
  const anotar = (r) => { etapas.push(r); return r }
  // Una corrida SIN proveedor de razonamiento es DEGRADADA en todas sus etapas interpretativas, y
  // eso viaja en el status — no en una nota al pie que nadie lee.
  const st = (base) => (degradacion?.hubo && base === STATUS.OK ? STATUS.DEGRADADA : base)

  // ── 1 · INGEST
  anotar(resultadoEtapa({
    etapa: ETAPA.INGEST, status: documentos.length ? STATUS.OK : STATUS.BLOQUEADA,
    result: { total: documentos.length, parseados: documentos.filter((d) => d.parseado !== false).length },
    evidence: documentos.map((d) => ({ hash: d.hash, nombre: d.nombre })),
    blocking_issues: documentos.length ? [] : [{ tipo: 'SIN_DOCUMENTOS', entidad: 'proyecto', detalle: 'no hay ningún documento: no hay de dónde cotizar' }],
  }))

  // ── 2 · INTERPRET (ya la hizo el pipeline de plano; acá se declara su degradación)
  anotar(resultadoEtapa({
    etapa: ETAPA.INTERPRET, status: st(elementos.length ? STATUS.OK : STATUS.BLOQUEADA),
    result: { elementos: elementos.length },
    provenance: degradacion?.motivos?.map((m) => `${m.motivo} (${m.veces}×)`) ?? [],
    missing_data: (degradacion?.laminasNoLeidas ?? []).map((l) => `${l.archivo}: ${l.porQue}`),
    blocking_issues: elementos.length ? [] : [{ tipo: 'SIN_ELEMENTOS', entidad: 'proyecto', detalle: 'no se pudo leer ningún elemento de la documentación' }],
  }))

  // ── 3 · SCOPE
  //
  // ═══ EL CRUCE SE HACE DOS VECES, Y NO ES UN DESPERDICIO ═══
  //
  // La primera decide QUÉ entra. Pero las partidas todavía no tienen subtotal —costear viene
  // después— así que `excluidoEnPlata` daba **0** aunque hubiera $650.000 afuera, y el issue
  // `EXCLUSION_CON_COMPUTO` nunca disparaba en el circuito real: su condición es «hay cómputo
  // valorizado» y nunca lo había. El informe committeado llegó a decir «excluidas por contrato: 0»
  // mientras el cruce las estaba aplicando.
  //
  // Así que lo EXCLUIDO también se costea —aparte, sin entrar al total— y el cruce se rehace con
  // los subtotales puestos. «¿Cuánto vale lo que sacaste?» es la primera pregunta del cliente
  // cuando compara esta oferta con otra que sí lo incluía, y sin este segundo paso no se puede
  // contestar.
  const primerCruce = cruzarAlcance({ partidas, alcance, porDefecto: alcancePorDefecto })
  // ═══ LA REUTILIZACIÓN DEL APRENDIZAJE (§19 · §20) ═══
  //
  // Un rendimiento aprendido de obras terminadas reemplaza al del análisis, y para que el costo y
  // las HH no se desincronicen se ESCALAN las líneas de mano de obra por la razón entre los dos
  // rendimientos — no se pisa el `hh` por afuera. Pisar sólo las horas dejaría una partida que
  // declara 200 h y cobra por 260: dos números del mismo hecho diciendo cosas distintas.
  //
  // Sólo entra lo que la gobernanza ACTIVÓ. Un candidato no es una norma, y acá se ve: el mapa que
  // llega es `aprendizaje_activo`, nunca `aprendizaje_candidato`.
  const reutilizados = []
  const noReutilizados = []
  const conAprendizaje = (p, lineas) => {
    const clave = `rendimiento.${p.codigo ?? p.tareaTipoId}`
    const aprendido = aprendizajesActivos.get?.(clave)
    if (aprendido === undefined || aprendido === null || !(Number(aprendido) > 0)) return lineas
    const manoDeObra = lineas.filter((l) => l.tipo === 'mano_obra')

    // ═══ UN RENGLÓN SIN MEDIR NO SE ESCALA: SE DEJA COMO ESTÁ ═══
    //
    // Esto lo encontró la auditoría y era un agujero de plata. `Number(null ?? 0)` convertía en CERO
    // la cantidad DESCONOCIDA de un ayudante, y `costo.mjs` bloquea sobre `null` pero no sobre `0`
    // porque 0 es finito: el `FALTA_DATO` desaparecía, la partida quedaba completa y una cotización
    // que NO se podía afirmar pasaba a `gate.ready: true`, congelable y ofertable, con las horas del
    // ayudante en cero. Aplicar un aprendizaje llegaba a DESBLOQUEAR un presupuesto — lo contrario
    // de lo que un aprendizaje puede hacer. Es el mismo `?? 0` que `costo.mjs:317` documenta haber
    // cerrado («borraba $2,4 M de mano de obra»), reabierto un renglón más arriba.
    // Y la guarda NO puede escribirse `!Number.isFinite(Number(l.cantidad))`: **`Number(null)` es 0,
    // y 0 es finito**. La primera versión de este arreglo tenía adentro el mismo bug que venía a
    // cerrar, y lo destapó el test —no la lectura—. `null` y `undefined` se preguntan aparte.
    const sinMedirLineas = manoDeObra.filter((l) => sinMedir(l.cantidad))
    if (sinMedirLineas.length) {
      noReutilizados.push({ partida: p.codigo ?? p.id, clave, porQue: `${sinMedirLineas.length} renglón(es) de mano de obra sin cantidad: no se puede escalar lo que no se midió` })
      return lineas
    }

    const original = manoDeObra.reduce((a, l) => a + Number(l.cantidad), 0)
    // Sin rendimiento original no hay razón que calcular, y un cociente contra cero no es infinito:
    // es una cuenta que no se puede hacer. La partida sigue con su composición y se dice por qué.
    if (!(original > 0)) return lineas
    const razon = Number(aprendido) / original
    reutilizados.push({ partida: p.codigo ?? p.id, clave, deComposicion: original, aprendido: Number(aprendido), razon })
    return lineas.map((l) => (l.tipo === 'mano_obra' ? { ...l, cantidad: Number(l.cantidad) * razon } : l))
  }
  const costear = (p) => costoDePartida({
    partida: p, composicion: conAprendizaje(p, composiciones.get?.(p.tareaTipoId) ?? p.composicion ?? []),
    observaciones, fx, hoy,
    ...(resolverPrecio ? { resolverPrecio } : {}),
  })
  const costosExcluidos = primerCruce.partidas.filter((p) => p.alcance === 'EXCLUIDO').map(costear)
  const subtotalDe = new Map(costosExcluidos.map((c) => [c.partida, c.subtotal]))
  const conAlcance = cruzarAlcance({
    partidas: partidas.map((p) => (subtotalDe.has(p.codigo ?? p.id) ? { ...p, subtotal: subtotalDe.get(p.codigo ?? p.id) } : p)),
    alcance, porDefecto: alcancePorDefecto,
  })
  anotar(resultadoEtapa({
    etapa: ETAPA.SCOPE, status: STATUS.OK,
    result: {
      incluidas: conAlcance.incluidas, excluidas: conAlcance.excluidas, porDefinir: conAlcance.porDefinir,
      excluidoEnPlata: conAlcance.excluidoEnPlata,
      // Cuántas excluidas no se pudieron valorizar: sin esto, un `excluidoEnPlata` bajo se lee como
      // «se sacó poco» cuando puede ser «no se pudo medir cuánto se sacó».
      excluidasSinValorizar: costosExcluidos.filter((c) => c.subtotal === null).length,
    },
    conflicts: conAlcance.conflictos,
    missing_data: conAlcance.partidas.filter((p) => p.alcance === 'POR_DEFINIR').map((p) => p.codigo),
    next_actions: conAlcance.porDefinir ? ['include_scope', 'exclude_scope'] : [],
  }))

  // ── 4 · TAKEOFF
  const conCantidad = partidas.filter((p) => p.cantidad !== null && p.cantidad !== undefined)
  anotar(resultadoEtapa({
    etapa: ETAPA.TAKEOFF, status: st(STATUS.OK),
    result: { total: partidas.length, computadas: conCantidad.length },
    missing_data: partidas.filter((p) => p.cantidad === null || p.cantidad === undefined).map((p) => p.codigo),
    confidence: partidas.length ? conCantidad.length / partidas.length : null,
  }))

  // ── 5 · MAP (la decidió `seleccion.mjs`, que es puro: acá sólo se reporta y se ofrece la salida)
  //
  // Un mapeo que no cerró no es un renglón perdido: es una pregunta que alguien puede contestar. La
  // diferencia importa porque el motor mide su cobertura ACCIONABLE —lo mapeado más lo preguntable—
  // y no sólo lo mapeado: sobre un dictado telefónico de 8 partidas, mapear 2 y saber preguntar por
  // las 6 restantes es un resultado utilizable; mapear 2 y encogerse de hombros no lo es.
  const preguntasDeMapeo = mapeos
    .map((m) => preguntaParaCerrar(m, { costos: costosDeCatalogo, paresComplementarios }))
    .filter(Boolean)
  const mapeadas = mapeos.filter((m) => m.estado === 'MAPEADA').length
  anotar(resultadoEtapa({
    etapa: ETAPA.MAP, status: partidas.length ? STATUS.OK : STATUS.OMITIDA,
    result: {
      partidas: partidas.length,
      mapeos: mapeos.length,
      mapeadas,
      preguntables: preguntasDeMapeo.length,
      // Sin mapeos declarados esto es `null`, no 1: una cobertura que nadie midió no es cobertura
      // perfecta. Es la misma regla que gobierna las tasas en `metricas.mjs`.
      sinSalida: mapeos.length ? mapeos.length - mapeadas - preguntasDeMapeo.length : null,
    },
    evidence: preguntasDeMapeo.map((p) => ({ tipo: p.tipo, pregunta: p.pregunta, opciones: p.opciones?.length ?? 0 })),
    provenance: ['plano/seleccion.mjs — la partida la decide el código, no el modelo'],
  }))

  // ── 6 · COMPOSE
  const aCostear = paraCostear(conAlcance.partidas)
  const lineasDe = (p) => composiciones.get?.(p.tareaTipoId) ?? p.composicion ?? []
  const sinComposicion = aCostear.filter((p) => !lineasDe(p).length)

  // TENER COMPOSICIÓN NO ES TENERLA ENTERA. Una que trae los materiales y no la mano de obra suma
  // un subtotal perfectamente creíble al que le falta un cajón — y sobre 205 partidas vigentes hay
  // 44 así. El motor las evalúa una por una y las que están incompletas dejan de publicar costo:
  // publican `costoDeReferencia`, que es otra cosa y se lee como otra cosa.
  const evaluadas = aCostear.map((p) => {
    const codigo = p.tareaTipoId ?? p.codigo
    return {
      partida: p.codigo ?? p.id,
      ...evaluarComposicion(
        { codigo, nombre: p.nombre ?? p.descripcion ?? '', unidad: p.unidad ?? null, lineas: lineasDe(p) },
        { complementos: complementosDe(codigo, paresComplementarios), ...(estadosDeComposicion.get?.(codigo) ? { estadoDeclarado: estadosDeComposicion.get(codigo) } : {}) },
      ),
    }
  })
  const incompletas = evaluadas.filter((e) => (e.huecos ?? []).length)
  anotar(resultadoEtapa({
    etapa: ETAPA.COMPOSE, status: aCostear.length ? STATUS.OK : STATUS.OMITIDA,
    result: {
      conComposicion: aCostear.length - sinComposicion.length,
      sinComposicion: sinComposicion.length,
      incompletas: incompletas.length,
      huecos: incompletas.flatMap((e) => e.huecos.map((h) => h.tipo ?? h)),
    },
    missing_data: [
      ...sinComposicion.map((p) => p.codigo),
      ...incompletas.map((e) => `${e.partida}: ${(e.huecos ?? []).map((h) => h.tipo ?? h).join(' · ')}`),
    ],
    provenance: ['base-maestra-completitud.mjs — los cinco cajones de un APU, y cuál falta'],
  }))

  // ── 7 · COST
  const costos = aCostear.map(costear)
  const cd = costoDirecto(costos)
  anotar(resultadoEtapa({
    etapa: ETAPA.COST, status: cd.total === null ? STATUS.BLOQUEADA : STATUS.OK,
    // `hh` viaja como lo devuelve `costoDirecto`: `null` cuando alguna partida no puede afirmar las
    // suyas. Publicar la suma de las que sí es un total al que le falta una partida entera.
    result: {
      total: cd.total, parcial: cd.parcial, cajones: cd.cajones, hh: cd.hh, nSinHh: cd.nSinHh,
      // Cuántas partidas costearon con experiencia propia en vez del análisis del catálogo. Es la
      // métrica del §20: la obra terminada tiene que hacer que la próxima cotización sea mejor, y
      // sin este contador «aprender» no se distingue de «guardar».
      reutilizanAprendizaje: reutilizados.length,
      aprendizajesDisponibles: aprendizajesActivos.size ?? 0,
      // Un aprendizaje que estaba disponible y NO se aplicó tiene que decir por qué. Sin esto, el
      // par «disponibles 3 · reutilizan 0» se lee como que el motor los ignoró.
      aprendizajesNoAplicados: noReutilizados.length,
    },
    missing_data: cd.faltan.map((f) => `${f.partida}: ${(f.porQue ?? []).join(' · ')}`),
    blocking_issues: cd.total === null ? [{ tipo: 'COSTO_NO_AFIRMABLE', entidad: 'cotización', detalle: cd.porQue }] : [],
    confidence: cd.nPartidas ? (cd.nPartidas - cd.nSinCosto) / cd.nPartidas : null,
    provenance: [
      ...reutilizados.map((r) => `${r.partida}: rendimiento aprendido ${r.aprendido} en vez de ${r.deComposicion} del análisis (×${Math.round(r.razon * 1000) / 1000})`),
      ...noReutilizados.map((r) => `${r.partida}: NO se aplicó el aprendizaje — ${r.porQue}`),
    ],
  }))

  // ── 8 · COMMERCIAL
  //
  // El orden es costo directo → indirecto CALCULADO → indirecto APLICADO → política → cascada. Los
  // dos indirectos son campos distintos a propósito: lo que la estructura de la empresa dice que
  // cuesta sostener una obra, y lo que esta oferta efectivamente absorbe. Cuando difieren, la
  // diferencia tiene nombre —`brechaDeAbsorcion`— y es plata que alguien decidió no cobrar.
  //
  // Sin `estructuraIndirecta` la corrida es la de siempre: el pct sale de la política y nadie
  // pretende haberlo calculado.
  const ind = estructuraIndirecta
    ? indirectoAplicado({
        calculado: indirectoCalculado({ estructura: estructuraIndirecta, costoDirectoObra: cd.total }),
        intento: intentoDeIndirecto,
      })
    : null
  const proy = politicaEfectivaDeLaCotizacion
    ? proyectarACascada({ efectiva: politicaEfectivaDeLaCotizacion, pctGastosGenerales: ind?.aplicado ?? null })
    : null
  // `proy.politica === null` significa NO HAY PRECIO. Caer a `politica` acá convertiría un bloqueo
  // declarado en un precio publicado, que es exactamente lo que el §14 prohíbe.
  const politicaDeLaCascada = proy ? proy.politica : politica
  const casc = cascada({ costoDirecto: cd.total, politica: politicaDeLaCascada })
  anotar(resultadoEtapa({
    etapa: ETAPA.COMMERCIAL, status: casc.estado === ESTADO.CALCULADO ? STATUS.OK : STATUS.BLOQUEADA,
    result: {
      ...casc,
      ...(ind ? { indirectoCalculado: ind.calculado, indirectoAplicado: ind.aplicado, brechaDeAbsorcion: ind.brechaDeAbsorcion } : {}),
    },
    provenance: [
      ...(politicaEfectivaDeLaCotizacion?.versionReferenciada
        ? [`política versión ${politicaEfectivaDeLaCotizacion.versionReferenciada} — referenciada, no copiada`]
        : politicaDeLaCascada ? [`política v${politicaDeLaCascada.version} (${politicaDeLaCascada.origen}) — ${politicaDeLaCascada.fuente}`] : []),
      ...(ind ? [`indirecto ${ind.estado}: ${ind.porQue ?? ''}`] : []),
    ],
    // ═══ LOS OVERRIDES RECHAZADOS DE LA POLÍTICA TAMBIÉN VIAJAN ═══
    //
    // `politicaEfectiva()` produce `rechazados` e `issues` —un intento de bajar el beneficio al 15 %
    // sin firma, por ejemplo— y el orquestador no los leía: sólo miraba los del indirecto y los
    // `faltan` de la proyección. Un override rechazado desaparecía de la corrida entera, y «se
    // intentó y no se pudo» es exactamente lo que hay que ver cuando alguien pregunta cómo se armó
    // este precio. Se encontró al ejercitar #12 por primera vez.
    missing_data: [
      ...(ind?.issues ?? []).map((i) => i.detalle ?? i.tipo ?? String(i)),
      ...(politicaEfectivaDeLaCotizacion?.issues ?? []).map((i) => i.detalle ?? i.type ?? String(i)),
      ...(proy?.faltan ?? []),
    ],
    blocking_issues: casc.estado === ESTADO.CALCULADO ? [] : [{
      tipo: 'SIN_PRECIO_CALCULABLE', entidad: 'cotización',
      detalle: proy && !proy.politica ? (proy.porQue ?? 'la política efectiva no proyecta a la cascada') : casc.porQue,
    }],
  }))

  // ── 9 · VALIDATE
  // Una exclusión que saca partidas valorizadas del total exige confirmación humana: corroborar
  // entre documentos alcanza para proponerla, no para sacar plata.
  const porConfirmar = [...new Set(conAlcance.partidas.filter((p) => p.alcance === 'EXCLUIDO').flatMap((p) => (p.porAlcance ?? []).map((e) => e.patron)))]
    .map((patron) => exigeConfirmacion({
      patron,
      fuente: conAlcance.partidas.flatMap((p) => p.porAlcance ?? []).find((e) => e.patron === patron)?.fuente ?? '?',
      partidasExcluidas: conAlcance.partidas.filter((p) => p.alcance === 'EXCLUIDO' && (p.porAlcance ?? []).some((e) => e.patron === patron)),
      confirmadas: exclusionesConfirmadas,
    }))
    .filter(Boolean)

  // ═══ LA CONFIRMACIÓN HUMANA DE UNA EXCLUSIÓN ES SU OVERRIDE ═══
  //
  // Una entrada de alcance que trae `decididoPor` la cargó una persona: **eso ES la firma**. No se
  // le pide una segunda confirmación, y la decisión está argumentada: quien carga «pintura →
  // EXCLUIDO, fuente: pliego art. 4.2, decididoPor: jorge» ya decidió sacar eso del presupuesto.
  // Pedirle que además lo confirme es teatro de control: dos clics para el mismo acto, y el segundo
  // se aprieta sin leer. La confirmación separada (`exclusionesConfirmadas`) existe para el otro
  // caso, que es el peligroso: la exclusión que salió de leer dos documentos SIN que nadie la mire.
  //
  // ═══ Y LA FIRMA SE PROPAGA A LAS PARTIDAS QUE ESE PATRÓN BLOQUEÓ ═══
  //
  // `cruzarAlcance` emite un SEGUNDO `EXCLUSION_CON_COMPUTO` cuya entidad es el CÓDIGO DE LA
  // PARTIDA (`T2`), no el patrón. Los overrides sólo se emitían como `alcance:<patron>`, así que ese
  // segundo issue no se destrababa nunca: **ninguna cotización con una exclusión valorizada se podía
  // congelar jamás**, ni siquiera el caso canónico del §19 —«sacá pintura» cargada por el dueño y
  // además confirmada—. Es el espejo exacto del defecto que la vuelta 5 arregló: se cerró la
  // dirección peligrosa y se rompió la buena.
  //
  // La entrada que decidió cada exclusión ya viaja en `porAlcance`, así que la firma se propaga sin
  // inventar nada: si el patrón está firmado, las partidas que ese patrón sacó del total heredan
  // la misma firma.
  const firmaDelPatron = new Map([
    ...alcance.filter((e) => e.decididoPor).map((e) => [e.patron, { autorizadoPor: e.decididoPor, motivo: e.motivo ?? 'cargada a mano por quien decidió el alcance' }]),
    ...exclusionesConfirmadas.filter((c) => c?.autorizadoPor).map((c) => [c.patron, { autorizadoPor: c.autorizadoPor, motivo: c.motivo ?? 'confirmada' }]),
  ])
  const firmasDeAlcance = [
    ...[...firmaDelPatron.entries()].map(([patron, f]) => ({ entidad: `alcance:${patron}`, ...f })),
    ...conAlcance.partidas
      .filter((p) => p.alcance === 'EXCLUIDO')
      .flatMap((p) => (p.porAlcance ?? [])
        .filter((e) => firmaDelPatron.has(e.patron))
        .map((e) => ({
          entidad: String(p.codigo ?? p.id),
          ...firmaDelPatron.get(e.patron),
          motivo: `${firmaDelPatron.get(e.patron).motivo} · vía el patrón «${e.patron}»`,
        }))),
  ]

  const cola = colaDeAtencion({
    issues: [...issuesHeredados, ...porConfirmar, ...conAlcance.issues, ...costos.flatMap((c) => c.issues ?? []), ...cd.issues.filter((i) => i.entity === 'HH de la obra')],
    costoConocido: cd.parcial,
    // Los precios vencidos asumidos por alguien con permiso comercial y las exclusiones firmadas.
    // Sin `autorizadoPor` no cuentan: un override es una firma, no un flag.
    overrides: [...overridesDePrecio, ...firmasDeAlcance],
  })
  anotar(resultadoEtapa({
    etapa: ETAPA.VALIDATE, status: cola.nBloqueantes ? STATUS.BLOQUEADA : STATUS.OK,
    result: { total: cola.total, bloqueantes: cola.nBloqueantes, plataEnRiesgo: cola.plataEnRiesgo, sinMedir: cola.bloqueantesSinMedir },
    conflicts: cola.issues.filter((i) => i.type === 'CONFLICTO'),
    blocking_issues: cola.bloqueantes,
    next_actions: [...new Set(cola.bloqueantes.map((i) => i.recommended_action).filter(Boolean))],
  }))

  // ── 10 · FREEZE
  // ═══ EL BARRIDO DE FUGA VA ANTES DE CONGELAR, NO ANTES DE ENVIAR ═══
  // Congelar es el punto sin retorno: después la versión no muta y la oferta sale de ella. Un
  // nombre de otro cliente detectado recién al exportar el PDF ya está adentro de la versión que
  // se congeló, y sacarlo exige crear una versión nueva.
  const fuga = barridoDeFuga({
    clienteDeLaCotizacion: cliente, clientesConocidos,
    contenido: conAlcance.partidas.flatMap((p) => [
      { origen: `${p.codigo}.descripcion`, texto: p.descripcion ?? '' },
      ...(p.nota ? [{ origen: `${p.codigo}.nota`, texto: p.nota }] : []),
      // La CITA LITERAL de evidencia sale en la genealogía y en cualquier defensa de la oferta. Un
      // nombre de otro cliente adentro de un `textoLiteral` pasaba: era el límite 4 del DoD.
      ...(p.evidencia?.textoLiteral ? [{ origen: `${p.codigo}.evidencia`, texto: p.evidencia.textoLiteral }] : []),
      ...(p.evidencia?.archivo ? [{ origen: `${p.codigo}.evidencia.archivo`, texto: p.evidencia.archivo }] : []),
    ]),
    // ═══ LAS RELACIONES, QUE HASTA ACÁ NO SE LE PASABAN ═══
    // `barridoDeFuga` las declara como «la MÁS grave» —una relación a otra obra significa que el
    // presupuesto está CONSTRUIDO sobre datos ajenos— y el orquestador nunca se las pasaba: la rama
    // sólo era alcanzable desde su propio test. Salen del origen de cada composición heredada.
    relaciones: relacionesExternas,
    metadatos: [
      ...documentos.map((d) => ({ campo: `documento:${d.nombre}`, valor: d.nombre ?? '', sale: false })),
      // Las FUENTES DE PRECIO no salen al cliente —son traza interna— pero una que nombre a otro
      // cliente significa que este presupuesto se costeó con la lista de precios de otra obra, y
      // eso hay que verlo aunque no se filtre.
      ...[...new Set(observaciones.map((o) => o.fuente).filter(Boolean))].map((f) => ({ campo: `precio:${String(f).slice(0, 40)}`, valor: f, sale: false })),
    ],
  })
  // Sin cliente declarado el barrido no puede correr, y eso NO se disfraza de limpio.
  const gateFuga = cliente ? gateDeFuga(fuga) : { ready: false, blocking_issues: [{ tipo: 'FUGA_NO_VERIFICABLE', entidad: 'cotización', detalle: 'la cotización no declara cliente: el barrido de fuga no puede correr', impacto: null, accion: null }], warnings: [], porQue: 'sin cliente no hay contra qué comparar' }

  const huella = huellaDeEntradas({
    documentos, partidas: conAlcance.partidas, precios: observaciones, politica, alcance, fx, hoy,
    aprendizajes: aprendizajesActivos.size ? aprendizajesActivos : null,
    estructuraIndirecta, politicaEfectiva: politicaEfectivaDeLaCotizacion,
    estadosDeComposicion: estadosDeComposicion.size ? estadosDeComposicion : null,
  })
  const gateCongelado = gateDeCongelado({ cascada: casc, cola })
  const gate = Object.freeze({
    ready: gateCongelado.ready && gateFuga.ready,
    blocking_issues: Object.freeze([...gateCongelado.blocking_issues, ...gateFuga.blocking_issues]),
    warnings: Object.freeze([...gateCongelado.warnings, ...gateFuga.warnings]),
    porQue: [gateCongelado.porQue, gateFuga.ready ? null : gateFuga.porQue].filter(Boolean).join(' · '),
  })
  anotar(resultadoEtapa({
    etapa: ETAPA.FREEZE, status: gate.ready ? STATUS.OK : STATUS.BLOQUEADA,
    result: gate, evidence: [{ huella: huella.sha256, resumen: huella.resumen }, { fuga: fuga.clientesRevisados }],
    blocking_issues: gate.blocking_issues,
    next_actions: gate.ready ? ['freeze'] : [...new Set(gate.blocking_issues.map((b) => b.accion).filter(Boolean))],
  }))

  // ── 11 · OUTPUT
  // La explosión es DERIVADA: sale acá y no en una etapa propia porque no decide nada — es la
  // misma información de COST leída por recurso en vez de por partida. Y se RECONCILIA contra el
  // costo directo: si no cuadra, hay un recurso contado dos veces o uno perdido.
  const explosion = explotarRecursos(costos)
  const reconciliacion = reconciliar(explosion, cd)
  const metricas = metricasDeCorrida({
    documentos, elementos,
    // ═══ LA INCERTIDUMBRE SE MIDE ANTES DE ESTAMPAR EL MOTIVO ═══
    // Esta línea estampaba `porQue: 'sin cantidad computada'` a toda cantidad ausente, un renglón
    // antes de que `metricasDeCorrida` contara las que NO tienen motivo. Con eso
    // `incertidumbre_no_declarada` era estructuralmente CERO: el productor declaraba el hueco justo
    // para que el contador no lo viera. Ahora se pasa el `porQue` que la partida traía —o nada— y
    // el contador puede dar un número distinto de cero.
    cantidades: partidas.map((p) => ({
      valor: p.cantidad,
      estado: p.cantidad === null || p.cantidad === undefined ? ESTADO.FALTA_DATO : ESTADO.CALCULADO,
      porQue: p.porQue ?? null,
    })),
    // Una partida SIN tarea de la Base Maestra no está mapeada. Poner 'MAPEADA' fijo hacía que el
    // AUTONOMOUS RESOLUTION RATE diera 100 % siempre — un contador incapaz de decir que no, que es
    // el defecto que este repo ya midió una vez en el Claude Avoidance Rate.
    mapeos: partidas.map((p) => ({ estado: p.tareaTipoId ? 'MAPEADA' : 'SIN_PARTIDA' })),
    composiciones: aCostear.map((p) => composiciones.get?.(p.tareaTipoId) ?? p.composicion ?? []),
    costosDePartida: costos, cola,
    decisionesDeterministicas: partidas.length + costos.length,
    llamadasLLM: [],
  })
  anotar(resultadoEtapa({
    etapa: ETAPA.OUTPUT, status: gate.ready ? STATUS.OK : STATUS.BLOQUEADA,
    result: { listoParaOfertar: gate.ready, metricas, explosion, reconciliacion },
    provenance: [huella.resumen],
    // Una explosión que no reconcilia NO bloquea la oferta —el precio sale de COST, no de acá— pero
    // sí es una advertencia fuerte: significa que el desglose que va a leer Compras no coincide con
    // el que se cotizó.
    missing_data: reconciliacion.cuadra === false ? [reconciliacion.porQue] : [],
  }))

  return Object.freeze({
    etapas: Object.freeze(etapas),
    // El orden se verifica acá y no en un test: una etapa fuera de lugar es un bug de este archivo.
    ordenCorrecto: etapas.map((e) => e.etapa).join('|') === ORDEN_ETAPAS.join('|'),
    partidas: conAlcance.partidas,
    costos: Object.freeze(costos),
    costoDirecto: cd,
    cascada: casc,
    cola, huella, gate, metricas, explosion, reconciliacion, fuga,
    huellaResultado: huellaDeResultado({ costoDirecto: cd, cascada: casc, gate, cola, explosion, partidas: conAlcance.partidas, etapas }),
    costosExcluidos: Object.freeze(costosExcluidos),
    estado: estadoDeCola(cola),
    degradada: Boolean(degradacion?.hubo),
    congeladoPor,
  })
}

/** La etapa que se pide por nombre. PURA. Existe para que un consumidor no tenga que conocer el
 *  índice — y para que agregar una etapa no rompa a nadie. */
export const etapa = (corrida, nombre) => corrida.etapas.find((e) => e.etapa === nombre) ?? null
