// ADJUDICAR Y PREPARAR OBRA (§27, §28).
//
// ═══ ADJUDICAR NO DESTRUYE LA QUOTE ═══
//
// La cotización adjudicada sigue existiendo, congelada, con su huella. Es lo único contra lo que se
// puede comparar el real de la obra dentro de seis meses — y comparar presupuesto contra realidad
// es la regla 15 del OS. Un flujo que «convierte» la cotización en obra y la deja atrás borra
// exactamente el dato que hace posible aprender de la obra.
//
// ═══ LO QUE LA OBRA HEREDA, Y LO QUE NO ═══
//
// HEREDA: alcance, ítems, cantidades, composiciones, recursos, HH, equipos, subcontratos.
// NO HEREDA: el precio al cliente como si fuera costo. Ese es el error que convierte el margen en
// cero antes de empezar — la obra se controla contra su COSTO previsto, no contra lo que se vendió.
// El precio queda como META de ingreso, en otro campo y con otro nombre.
//
// ═══ Σ FRENTES = CANTIDAD HEREDADA, O BLOCK ═══
//
// Una partida de 520 m² de mampostería se reparte en frentes: 200 en planta baja, 200 en primer
// piso, 120 en fachada. Si la suma da 480, faltan 40 m² que alguien va a ejecutar y nadie va a
// controlar; si da 560, se está planificando trabajo que no se cotizó. Las dos direcciones son un
// desvío garantizado, así que ninguna pasa.
//
// Sin fecha de inicio: BLOCK. Una obra sin fecha no tiene cronograma, y sin cronograma el avance no
// se puede comparar contra nada.
//
// Sin HH: PERMITIDO, con HH = NULL. Hay tareas que se contratan por paquete y no tienen HH propias
// —una partida subcontratada tiene HH cero, que es un hecho— y otras cuya productividad todavía no
// se conoce. Poner cero en la segunda inventa una productividad infinita.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue } from './contrato.mjs'

const TOLERANCIA = 1e-6

/** Un número, o `null`. Nunca cero por accidente: `Number(null)` es 0 y `Number('')` también, y las
 *  dos formas ya convirtieron un hueco en un dato en este repo. */
export const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * ADJUDICAR. PURA. Devuelve la preparación de obra; no escribe nada y no toca la cotización.
 */
export function adjudicar({ congelada, oferta = null, adjudicadaEn = null, adjudicadaPor, obraId = null } = {}) {
  if (!congelada || congelada.esBorrador !== false) throw new Error('sólo se adjudica una versión congelada')
  if (!adjudicadaPor) throw new Error('adjudicar sin decir quién deja una obra sin responsable')
  return Object.freeze({
    // La quote NO se destruye: viaja entera adentro de la adjudicación.
    quoteVersion: congelada,
    ofertaEmitida: oferta,
    obraId,
    adjudicadaEn: adjudicadaEn ?? new Date().toISOString(),
    adjudicadaPor,
    genealogy: Object.freeze({
      desdeVersion: congelada.version,
      huellaDeLaCotizacion: congelada.huella?.sha256 ?? null,
      congeladaEn: congelada.congeladoEn,
      porQue: 'la obra puede contestar «¿contra qué se está comparando el real?» apuntando a esta huella',
    }),
    estado: ESTADO.CONFIRMADO,
  })
}

/**
 * PREPARAR OBRA. PURA. Devuelve `{tareas, bloqueos, issues, listo}`.
 *
 * `frentes` es opcional: una partida sin frentes declarados se prepara como una sola tarea con toda
 * su cantidad. Lo que NO pasa es que se reparta mal.
 */
export function prepararObra({ adjudicacion, partidas = [], frentes = {}, fechaInicio = null } = {}) {
  const bloqueos = []
  const issues = []

  if (!fechaInicio) {
    bloqueos.push({ tipo: 'SIN_FECHA_INICIO', entidad: 'obra', detalle: 'sin fecha de inicio no hay cronograma, y sin cronograma el avance no se compara contra nada' })
    issues.push(issue({ type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.BLOQUEANTE, entity: 'obra', detalle: 'falta la fecha de inicio' }))
  }

  const tareas = []
  for (const p of partidas) {
    const clave = p.codigo ?? p.id
    const misFrentes = frentes[clave] ?? null
    // `Number(null)` es 0 y `isFinite(0)` es true: sin la comparación explícita, una partida
    // adjudicada sin cantidad se preparaba como una tarea de obra de CERO m² —con su frente, su
    // genealogía y su costo previsto— en vez de bloquear. Es el mismo defecto que ya apareció en
    // `costo.mjs`, y lo encontró el test, no la revisión.
    const heredada = (p.cantidad === null || p.cantidad === undefined || p.cantidad === '') ? NaN : Number(p.cantidad)

    if (!Number.isFinite(heredada)) {
      bloqueos.push({ tipo: 'CANTIDAD_NO_HEREDABLE', entidad: clave, detalle: `«${clave}» llega sin cantidad: no se puede preparar una tarea de obra sobre un hueco` })
      issues.push(issue({ type: TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE, severity: SEVERIDAD.BLOQUEANTE, entity: String(clave), detalle: 'la partida adjudicada no tiene cantidad' }))
      continue
    }

    if (misFrentes?.length) {
      const suma = misFrentes.reduce((a, f) => a + (Number(f.cantidad) || 0), 0)
      if (Math.abs(suma - heredada) > TOLERANCIA) {
        const diferencia = suma - heredada
        bloqueos.push({
          tipo: 'FRENTES_NO_CIERRAN', entidad: clave,
          detalle: diferencia > 0
            ? `los frentes de «${clave}» suman ${suma} ${p.unidad ?? ''} y se cotizaron ${heredada}: se está planificando ${diferencia} de trabajo que nadie cotizó`
            : `los frentes de «${clave}» suman ${suma} ${p.unidad ?? ''} y se cotizaron ${heredada}: faltan ${Math.abs(diferencia)} que alguien va a ejecutar y nadie va a controlar`,
        })
        issues.push(issue({
          type: TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE, severity: SEVERIDAD.BLOQUEANTE, entity: String(clave),
          impact: p.costoUnitario ? Math.abs(diferencia) * Number(p.costoUnitario) : null,
          detalle: `Σ frentes (${suma}) ≠ cantidad heredada (${heredada})`,
          recommended_action: 'update_quantity',
        }))
        continue
      }
    }

    const reparto = misFrentes?.length ? misFrentes : [{ nombre: 'único', cantidad: heredada }]
    for (const f of reparto) {
      tareas.push(Object.freeze({
        partida: clave,
        frente: f.nombre ?? 'único',
        descripcion: p.descripcion ?? clave,
        cantidad: Number(f.cantidad),
        unidad: p.unidad ?? null,
        // ═══ HH NULL ES PERMITIDO. CERO SERÍA UNA PRODUCTIVIDAD INFINITA ═══
        // Un subcontrato tiene HH propias = 0 y eso es un hecho. Una partida cuya productividad no
        // se conoce tiene HH = null y eso es un hueco. Se distinguen por `subcontratada`.
        hh: p.subcontratada ? 0 : (Number.isFinite(Number(p.hh)) && p.hh !== null
          ? Number(p.hh) * (Number(f.cantidad) / heredada)
          : null),
        composicion: p.composicion ?? null,
        subcontratada: Boolean(p.subcontratada),
        subcontrato: p.subcontrato ?? null,
        // ═══ LO QUE NO SE HEREDA ═══
        // El precio al cliente NO entra como costo. Entra como META de ingreso, con otro nombre,
        // para que nadie controle la obra contra lo que se vendió.
        costoPrevisto: p.subtotal ?? null,
        metaDeIngreso: p.precioCliente ?? null,
        genealogy: Object.freeze({
          desdeVersion: adjudicacion?.quoteVersion?.version ?? null,
          huella: adjudicacion?.genealogy?.huellaDeLaCotizacion ?? null,
          cantidadCotizada: heredada,
        }),
      }))
    }
    if (!p.subcontratada && (p.hh === null || p.hh === undefined)) {
      issues.push(issue({ type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.BAJA, entity: String(clave), detalle: `«${clave}» se prepara sin HH previstas: permitido, pero su avance no se va a poder medir en productividad` }))
    }
  }

  return Object.freeze({
    tareas: Object.freeze(tareas),
    bloqueos: Object.freeze(bloqueos),
    issues: Object.freeze(issues),
    listo: bloqueos.length === 0,
    fechaInicio,
    /** El control que prueba que no se perdió ni se inventó cantidad en el reparto. */
    cuadra: partidas.every((p) => {
      const c = p.codigo ?? p.id
      const suyas = tareas.filter((t) => t.partida === c)
      if (!suyas.length) return true
      return Math.abs(suyas.reduce((a, t) => a + t.cantidad, 0) - Number(p.cantidad)) <= TOLERANCIA
    }),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §16 · PRESUPUESTO → OBRA, PERSISTIDO
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `adjudicar()` y `prepararObra()` producen la obra en memoria. Lo que sigue produce las DOS filas
// que la base necesita para que, seis meses después, «¿contra qué se compara el real?» tenga UNA
// respuesta: la genealogía (de qué versión) y el plan heredado (qué decía esa versión).
//
// ═══ LA VERSIÓN TIENE QUE ESTAR CONGELADA. NO ES UN FORMALISMO ═══
//
// En la base HOY hay dos versiones de COT-2026-001 en estado 'adjudicada': la v1 congelada y la v3
// sin congelar. Si la obra se colgara de la v3, cada edición del presupuesto movería el plan, y el
// desvío medido ayer dejaría de ser el desvío de hoy sin que nadie tocara la obra. Una comparación
// contra un blanco móvil no es una comparación.

/** El motor que produce las observaciones. Viaja en cada fila de la bitácora: dos corridas con
 *  versiones distintas pueden decir cosas distintas y eso tiene que ser legible sin adivinar. */
export const MOTOR_PLAN_REAL = 'plan-vs-real/1.0.0'

/**
 * GENEALOGÍA DE OBRA. PURA. Devuelve `{genealogia, bloqueos, issues, listo}`.
 *
 * `congelada` es la versión tal como sale de la base (`cotizaciones` + su huella). No se corrige
 * nada acá: si no está congelada, BLOCK; si no tiene huella, pasa con la huella en `null` y un
 * issue — `cotizacion_huella` tiene cero filas hoy y fabricar un sha256 sería peor que no tenerlo.
 */
export function genealogiaDeObra({
  obraId, congelada, adjudicadaEn = null, adjudicadaPor = null, alcance = 'ORIGINAL', nota = null,
} = {}) {
  const bloqueos = []
  const issues = []

  if (!obraId) bloqueos.push({ tipo: 'SIN_OBRA', entidad: 'obra', detalle: 'una genealogía sin obra no engancha con nada' })
  if (!congelada?.id) bloqueos.push({ tipo: 'SIN_COTIZACION', entidad: 'cotizacion', detalle: 'no se dijo de qué cotización nace la obra' })
  if (!['ORIGINAL', 'ADICIONAL'].includes(alcance)) {
    bloqueos.push({ tipo: 'ALCANCE_DESCONOCIDO', entidad: String(alcance), detalle: 'el alcance es ORIGINAL o ADICIONAL: no hay un tercer caso' })
  }

  const congeladaEn = congelada?.congeladaEn ?? congelada?.congelada_en ?? null
  if (!congeladaEn) {
    bloqueos.push({
      tipo: 'VERSION_NO_CONGELADA', entidad: String(congelada?.numero ?? congelada?.id ?? 'cotizacion'),
      detalle: 'la versión no está congelada: el plan se podría editar después y el desvío de ayer dejaría de ser el de hoy',
    })
    issues.push(issue({
      type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.BLOQUEANTE, entity: String(congelada?.id ?? 'cotizacion'),
      detalle: 'una obra no puede nacer de una versión editable', recommended_action: 'freeze',
    }))
  }

  const huella = congelada?.huella?.sha256 ?? congelada?.huella_sha256 ?? null
  if (!huella) {
    issues.push(issue({
      type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.MEDIA, entity: String(congelada?.id ?? 'cotizacion'),
      detalle: 'la versión congelada no tiene huella: la genealogía queda sin poder probar que las entradas no cambiaron',
    }))
  }

  return Object.freeze({
    genealogia: bloqueos.length ? null : Object.freeze({
      obraId,
      cotizacionId: congelada.id,
      numero: congelada.numero ?? null,
      version: Number(congelada.version),
      alcance,
      congeladaEn,
      huellaSha256: huella,
      adjudicadaEn: adjudicadaEn ?? new Date().toISOString(),
      adjudicadaPor,
      costoEstimado: num(congelada.costoEstimado ?? congelada.costo_estimado),
      // ═══ COSTO ≠ PRECIO ═══
      // El monto de venta viaja como META DE INGRESO, a nivel obra, y NO baja a ninguna partida.
      // El día que baje, alguien va a comparar el costo real de la mampostería contra su precio de
      // venta y va a ver un «ahorro» donde hay margen.
      metaIngreso: num(congelada.montoVenta ?? congelada.monto_venta),
      nota,
      // El estado del dato, no un adorno: la genealogía es una decisión humana registrada.
      estado: ESTADO.CONFIRMADO,
      confianza: huella ? 'con huella' : 'sin huella: la versión congelada no dejó sha256',
    }),
    bloqueos: Object.freeze(bloqueos),
    issues: Object.freeze(issues),
    listo: bloqueos.length === 0,
  })
}

/**
 * HEREDAR EL PLAN. PURA. Devuelve `{filas, issues, resumen}`.
 *
 * `partidas` son las de la versión congelada, ya valorizadas (`cotizacion_partida_valorizada`).
 * Cada fila que sale es el plan de COSTO de una partida, congelado, listo para `obra_partida_plan`.
 *
 * ═══ HH: NULL, CERO Y LA DIFERENCIA QUE CUESTA PLATA ═══
 *
 * Subcontratada → `hh_plan = 0`. Es un hecho: la partida no lleva HH propias.
 * Sin `hs_unitarias` → `hh_plan = null`. Es un hueco: la productividad no se conoce.
 * Escribir 0 en el segundo caso hace que el desvío de HH salga infinito y que la partida encabece
 * la lista de problemas de una obra que anda bien.
 *
 * ═══ DÍAS NO SALEN DE HH ═══
 *
 * `dias_plan` entra por `diasPorPartida` o queda en `null`. NO se deriva de las HH: 160 HH pueden
 * ser 4 personas × 5 días o 1 persona × 20 días, y el cronograma no lo decide esta función.
 */
export function heredarPlan({ genealogia, partidas = [], diasPorPartida = {} } = {}) {
  if (!genealogia) throw new Error('heredar un plan sin genealogía deja una obra que no sabe contra qué se compara')
  const filas = []
  const issues = []

  for (const p of partidas) {
    const clave = p.codigo ?? p.partida_id ?? p.id
    const cantidad = num(p.cantidad)
    const hsUnit = num(p.hs_unitarias ?? p.hsUnitarias)
    const subcontratada = Boolean(p.subcontratada)

    if (cantidad === null) {
      issues.push(issue({
        type: TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE, severity: SEVERIDAD.ALTA, entity: String(clave),
        detalle: 'la partida se hereda sin cantidad: su avance no se va a poder medir contra nada',
      }))
    }
    if (!subcontratada && hsUnit === null) {
      issues.push(issue({
        type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.BAJA, entity: String(clave),
        detalle: 'sin horas unitarias cotizadas: el rendimiento real no va a tener contra qué compararse',
      }))
    }

    filas.push(Object.freeze({
      obraId: genealogia.obraId,
      cotizacionPartidaId: p.partida_id ?? p.id ?? null,
      codigo: p.codigo ?? null,
      descripcion: p.descripcion ?? String(clave),
      unidad: p.unidad ?? null,
      cantidadPlan: cantidad,
      hsUnitariasPlan: hsUnit,
      hhPlan: subcontratada ? 0 : (hsUnit !== null && cantidad !== null ? hsUnit * cantidad : null),
      costoUnitarioPlan: num(p.costo_unitario ?? p.costoUnitario),
      costoPlan: num(p.subtotal ?? p.costo_total ?? p.costoTotal),
      diasPlan: num(diasPorPartida[clave]),
      subcontratada,
      precioSubcontratoPlan: num(p.precio_subcontrato ?? p.precioSubcontrato),
    }))
  }

  return Object.freeze({
    filas: Object.freeze(filas),
    issues: Object.freeze(issues),
    resumen: Object.freeze({
      partidas: filas.length,
      sinCantidad: filas.filter((f) => f.cantidadPlan === null).length,
      // `=== null` y no `!f.hhPlan`: una partida subcontratada tiene hhPlan 0, que es falsy y NO es
      // un hueco. La versión con `!` contaba los subcontratos como datos faltantes.
      sinHH: filas.filter((f) => f.hhPlan === null).length,
      sinCosto: filas.filter((f) => f.costoPlan === null).length,
      costoPlanTotal: filas.some((f) => f.costoPlan === null)
        ? null  // una suma con un hueco adentro no es un total: es un total mentiroso más chico
        : filas.reduce((a, f) => a + f.costoPlan, 0),
      hhPlanTotal: filas.some((f) => f.hhPlan === null) ? null : filas.reduce((a, f) => a + f.hhPlan, 0),
    }),
  })
}
