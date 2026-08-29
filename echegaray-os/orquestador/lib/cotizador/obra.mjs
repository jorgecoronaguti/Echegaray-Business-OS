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
