// EL COSTO DIRECTO — determinístico, trazable, y que se NIEGA a afirmarse cuando le falta algo.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA ARREGLAR, MEDIDO EN LA BASE ═══
//
// `public.cotizacion_cascada` calcula el costo directo así:
//
//     coalesce(sum(v.subtotal), 0) as costo_directo
//
// y `sum()` de Postgres **ignora los NULL**. La vista `cotizacion_partida_valorizada` deja
// `subtotal = NULL` cuando una partida está declarada subcontratada y todavía no tiene precio —eso
// está BIEN y fue una corrección deliberada (migración 20260821T3100)—. Pero después la suma se
// come el NULL y el presupuesto publica `costo_directo`, `venta_final` y `coeficiente_sin_iva` como
// si estuviera completo. El contador `n_sin_precio_subcontrato` queda al lado, en otra columna, y
// nadie lo mira: la cifra grande no lo dice.
//
// O sea: la base ya sabe que falta un precio y IGUAL afirma el total. §15 dice lo contrario —
// «componente crítico en ERROR/FALTA_DATO ⇒ el total no se afirma»— y §14 dice que un subcontrato
// sin precio no es $0. Acá el total sale `null` con la lista de qué falta, y el que quiere ver una
// cifra parcial la pide explícitamente (`costoDeLoQueSePudo`), que es otra pregunta y se llama
// distinto.
//
// ═══ CADA SUBTOTAL ES TRAZABLE ═══
//
// LABOR / MATERIALS / EQUIPMENT / SUBCONTRACTS / OTHER, cada uno con las líneas que lo componen y
// su fórmula. Un costo directo que sale como un número solo no se puede auditar, y auditar es lo
// único que hace que un presupuesto se pueda defender.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue, sumable } from './contrato.mjs'
import { TIPO_RECURSO, precioVigente, issueDePrecio, aplicarFx } from './precios.mjs'
import { compatibleConPartida } from './unidades.mjs'

/** Los cinco cajones del §15. `carga_social` va con la mano de obra porque es mano de obra: son las
 *  cargas DE esa hora, y separarlas produce un «costo de mano de obra» que ningún jefe de obra
 *  reconoce como el costo de su gente. */
export const CAJON = Object.freeze({
  LABOR: 'LABOR', MATERIALS: 'MATERIALS', EQUIPMENT: 'EQUIPMENT', SUBCONTRACTS: 'SUBCONTRACTS', OTHER: 'OTHER',
})

const CAJON_DE_TIPO = Object.freeze({
  [TIPO_RECURSO.MANO_OBRA]: CAJON.LABOR,
  [TIPO_RECURSO.CARGA_SOCIAL]: CAJON.LABOR,
  [TIPO_RECURSO.MATERIAL]: CAJON.MATERIALS,
  [TIPO_RECURSO.EQUIPO]: CAJON.EQUIPMENT,
  [TIPO_RECURSO.SUBCONTRATO]: CAJON.SUBCONTRACTS,
  [TIPO_RECURSO.SERVICIO]: CAJON.OTHER,
  [TIPO_RECURSO.OTRO]: CAJON.OTHER,
})

const redondear = (n, d = 2) => (n === null || n === undefined ? null : Math.round(Number(n) * 10 ** d) / 10 ** d)

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL SUBCONTRATO (§14)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * UN SUBCONTRATO. Ocho datos cuando tiene precio, y CERO números cuando no lo tiene.
 *
 * Un subcontrato declarado sin precio es un hecho perfectamente legítimo —«la sanitaria la hace un
 * tercero, todavía no cotizó»— y hay que poder registrarlo. Lo que no se puede es que ese hecho
 * valga $0. Sale con `estado: FALTA_DATO` y con `costo: null`, y `sumable()` lo saca de todas las
 * sumas afirmadas del circuito.
 *
 * PURA, congelada.
 */
export function subcontrato({
  alcance, proveedor = null, cantidad = null, unidad = null,
  precio = null, moneda = 'ARS', cotizadoEn = null, validoHasta = null, fuente = null,
  tipo = null, documento = null, validezDias = null, incluye = [], excluye = [],
} = {}) {
  if (!alcance) throw new Error('un subcontrato sin alcance no se puede comparar contra nada: ¿qué incluye?')
  const tienePrecio = precio !== null && precio !== undefined && Number.isFinite(Number(precio))
  // ═══ LO QUE SE PRESERVA SIEMPRE, TENGA PRECIO O NO ═══
  // Alcance, proveedor, fecha, moneda, vigencia y documento sobreviven a la rama sin precio. La
  // versión anterior los tiraba: un subcontrato sin cotizar perdía la fecha en que se pidió y el
  // documento donde consta el pedido, que es justo lo que hace falta para reclamarlo.
  const constante = {
    alcance, proveedor, cantidad, unidad, moneda, tipo,
    cotizadoEn: cotizadoEn ? String(cotizadoEn).slice(0, 10) : null,
    validoHasta: validoHasta ? String(validoHasta).slice(0, 10) : null,
    validezDias: validezDias === null || validezDias === undefined || !Number.isFinite(Number(validezDias)) ? null : Number(validezDias),
    documento: documento ?? null,
    // Un sub «más barato» que excluye tres ítems no es más barato. Sin estas dos listas, comparar
    // dos cotizaciones de subcontratistas es comparar dos números que miden cosas distintas.
    incluye: Object.freeze([...incluye]), excluye: Object.freeze([...excluye]),
  }
  if (!tienePrecio) {
    return Object.freeze({
      ...constante,
      costo: null, fuente: fuente ? String(fuente) : null, estado: ESTADO.FALTA_DATO,
      // El texto importa: dice explícitamente que no es cero, porque el que lea esto en una pantalla
      // o en un export tiene que entenderlo sin conocer el modelo de datos.
      porQue: `«${alcance}» está declarado como subcontrato y todavía no tiene precio. NO vale $0: vale lo que va a costar, y falta preguntarlo`,
      faltan: ['precio', ...(proveedor ? [] : ['proveedor']), ...(cotizadoEn ? [] : ['fecha de la cotización'])],
    })
  }
  if (!fuente) throw new Error(`el subcontrato «${alcance}» trae precio y no trae fuente: un precio que no se puede volver a pedir no se puede defender`)
  if (!cotizadoEn) throw new Error(`el subcontrato «${alcance}» trae precio y no trae fecha: no se puede saber si sigue vigente`)
  return Object.freeze({
    ...constante,
    costo: Number(precio), fuente: String(fuente),
    estado: ESTADO.EXTRAIDO,
    porQue: null, faltan: [],
  })
}

/** ¿Este subcontrato ya venció? PURA. Vencido no es sin precio: el número existe y hay que
 *  reconfirmarlo, que es una acción distinta. */
/**
 * CUÁNTOS DÍAS VALE LA COTIZACIÓN DE UN SUBCONTRATISTA.
 *
 * ═══ POR QUÉ 180 PLANO ESTABA MAL ═══
 *
 * El 180 salió de `parametro_operativo.dias_precio_aceptable`, que es el corte de un PRECIO DE
 * RECURSO de la base maestra. Un subcontrato no es un precio de lista: es una OFERTA de un tercero,
 * y una oferta declara su propia validez. Cuando el documento la declara, manda el documento —
 * asumir 180 sobre una oferta que dice «válida 15 días» es cotizar con un precio que el
 * subcontratista ya no sostiene, y esa diferencia la paga la obra.
 *
 * ═══ POR QUÉ EL DEFAULT POR TIPO VIENE VACÍO ═══
 *
 * `GENERAL: 180` es el único corte con origen declarado en el OS. Los defaults por tipo de
 * subcontrato —sanitaria, eléctrica, movimiento de suelo, estructura metálica— **no están medidos**
 * y ponerlos acá sería inventarlos. La tabla se pasa por parámetro y la llena la base
 * (`subcontrato_vigencia_default`); mientras un tipo no tenga su fila, el resultado cae en GENERAL y
 * lo DECLARA en `origen`, para que se vea que ese vencimiento es un supuesto y no una regla.
 */
export const DIAS_VIGENCIA_SUBCONTRATO = 180
export const VIGENCIA_SUBCONTRATO = Object.freeze({ GENERAL: DIAS_VIGENCIA_SUBCONTRATO })

/**
 * DE DÓNDE SALE LA VIGENCIA DE ESTE SUBCONTRATO. PURA.
 *
 * Tres orígenes y se distinguen siempre: `DOCUMENTO` (la oferta lo dice), `TIPO` (la empresa tiene
 * un default declarado para esa clase de trabajo) y `GENERAL` (ninguno de los dos: es un supuesto).
 */
export function vigenciaDeSubcontrato(s, { tabla = VIGENCIA_SUBCONTRATO, diasPorDefecto = null } = {}) {
  // `Number(null)` es 0 y `Number.isFinite(0)` es `true`: preguntar sólo por `isFinite` convertía una
  // validez AUSENTE en una validez MEDIDA de cero días, y todo subcontrato sin `validezDias` salía
  // vencido el mismo día que se cotizó. Lo encontró el test «un SUBCONTRATO sin vencimiento NO es
  // vigente para siempre». Es el mismo `NULL ≠ 0` que este archivo ya cierra dos veces más abajo.
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  if (s?.validoHasta) return { origen: 'DOCUMENTO', dias: null, hasta: s.validoHasta, porQue: `la oferta declara vigencia hasta el ${s.validoHasta}` }
  const declarada = num(s?.validezDias)
  if (declarada !== null) {
    return { origen: 'DOCUMENTO', dias: declarada, hasta: null, porQue: `la oferta declara ${declarada} días de validez` }
  }
  const porTipo = s?.tipo ? num(tabla?.[s.tipo]) : null
  if (porTipo !== null) {
    return { origen: 'TIPO', dias: porTipo, hasta: null, porQue: `la oferta no declara validez; el default declarado para «${s.tipo}» es ${porTipo} días` }
  }
  const general = num(diasPorDefecto) ?? num(tabla?.GENERAL) ?? DIAS_VIGENCIA_SUBCONTRATO
  return {
    origen: 'GENERAL', dias: general, hasta: null,
    porQue: s?.tipo
      ? `no declara vencimiento y «${s.tipo}» no tiene default declarado: se SUPONE el corte general de ${general} días`
      : `no declara vencimiento ni tipo de subcontrato: se SUPONE el corte general de ${general} días`,
  }
}

/**
 * ¿ESTE SUBCONTRATO SIGUE EN PIE? PURA.
 *
 * Vencido NO es sin precio: el número existe y hay que reconfirmarlo, que es una acción distinta.
 * `decisionRequerida` sale en `true` cuando el precio existe y no se puede usar tal cual — es lo que
 * impide que un subcontrato vencido entre callado a un total.
 */
export function subcontratoVigente(s, { hoy = new Date(), diasPorDefecto = null, tabla = VIGENCIA_SUBCONTRATO, resolver = null } = {}) {
  if (s.estado !== ESTADO.EXTRAIDO) return { vigente: false, estado: s.estado, decisionRequerida: false }
  const hoyIso0 = (hoy instanceof Date ? hoy.toISOString() : String(hoy)).slice(0, 10)
  // ═══ EL DOCUMENTO LE GANA A CUALQUIER DERIVACIÓN ═══
  //
  // Un resolvedor que deriva la vigencia de la deriva de precios y la materialidad es mejor que un
  // 180 puesto a dedo — pero sólo cuando el proveedor NO dijo hasta cuándo sostiene su precio.
  // Cuando lo dijo, ese es un dato duro y ninguna estadística lo puede pisar: derivarle 90 días a
  // una oferta que dice «válida 15» es cotizar con un precio que el subcontratista ya no sostiene.
  // Por eso la precedencia vive acá y no en el resolvedor: quien inyecte no puede saltearla.
  const declarada = Boolean(s?.validoHasta) || Number.isFinite(Number(s?.validezDias)) && s?.validezDias !== null
  const v = (!declarada && typeof resolver === 'function')
    ? resolver(s, { tabla, diasPorDefecto, hoy })
    : vigenciaDeSubcontrato(s, { tabla, diasPorDefecto })
  // ═══ SIN VENCIMIENTO NO ES «VIGENTE PARA SIEMPRE» ═══
  //
  // La versión anterior devolvía `vigente: true` cuando el subcontrato no declaraba `validoHasta`, y
  // `pg.mjs` NUNCA lo fija: todo subcontrato leído de la base era eterno. Ahora la vigencia se DERIVA
  // de la fecha de cotización, y si tampoco la hay, no hay vigencia.
  const limite = v.hasta ?? (s.cotizadoEn
    ? new Date(Date.parse(`${s.cotizadoEn}T00:00:00Z`) + v.dias * 86_400_000).toISOString().slice(0, 10)
    : null)
  if (!limite) {
    return { vigente: false, estado: ESTADO.FALTA_DATO, origen: v.origen, decisionRequerida: true, porQue: `«${s.alcance}» no declara ni fecha de cotización ni vencimiento: no se puede saber si el precio sigue en pie` }
  }
  if (hoyIso0 > limite) {
    return {
      vigente: false, estado: ESTADO.HISTORICO, origen: v.origen, venceEl: limite, decisionRequerida: true,
      porQue: `la cotización de ${s.proveedor ?? 'el subcontratista'} venció el ${limite} — ${v.porQue}`,
    }
  }
  return { vigente: true, estado: ESTADO.EXTRAIDO, origen: v.origen, venceEl: limite, decisionRequerida: false, porQue: v.origen === 'DOCUMENTO' ? null : v.porQue }
}

/**
 * ¿ESTE SUBCONTRATO CUBRE LO QUE LA PARTIDA EXIGE? PURA.
 *
 * Comparar el precio de dos subcontratistas sin comparar su alcance es comparar dos números que
 * miden cosas distintas. Devuelve lo que el sub EXCLUYE de lo exigido: si la lista no está vacía, el
 * precio no es comparable y la diferencia la va a poner la obra.
 */
export function brechaDeAlcance({ subcontrato: s, exigido = [] } = {}) {
  const norm = (x) => String(x ?? '').toLowerCase().trim()
  const incluye = new Set((s?.incluye ?? []).map(norm))
  const excluye = new Set((s?.excluye ?? []).map(norm))
  const noCubre = exigido.filter((e) => excluye.has(norm(e)) || !incluye.has(norm(e)))
  return {
    comparable: noCubre.length === 0 && exigido.length > 0,
    noCubre: Object.freeze([...noCubre]),
    porQue: exigido.length === 0
      ? 'no se declaró qué exige la partida: el precio del subcontratista no se puede comparar contra nada'
      : (noCubre.length ? `el subcontratista NO cubre ${noCubre.join(', ')}: su precio no es comparable con uno que sí lo incluye` : null),
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA PARTIDA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * EL COSTO DE UNA PARTIDA por explosión de su composición. PURA.
 *
 * Entra: la partida (cantidad + unidad), su composición unitaria (líneas de recurso), las
 * observaciones de precio y el FX. Sale: los cinco cajones, sus líneas, el total, y —si falta algo—
 * el total en `null` con la lista de por qué.
 *
 * Tres razones por las que una partida NO tiene costo, y las tres se distinguen:
 *   · no tiene composición cargada        → no se sabe de qué está hecha
 *   · algún recurso no tiene precio       → se sabe de qué está hecha y no cuánto sale
 *   · la cantidad no está en la unidad de la partida → error de cómputo, no de precio
 */
export function costoDePartida({
  partida, composicion = [], observaciones = [], fx = null,
  monedaDestino = 'ARS', hoy = new Date(),
  tablaVigenciaSubcontrato = VIGENCIA_SUBCONTRATO,
  // ═══ EL PUNTO DE ENGANCHE DEL RESOLVEDOR DE PRECIOS ═══
  //
  // El default ES `precioVigente`, así que sin inyectar nada el comportamiento es exactamente el de
  // antes. Existe porque el corte de vigencia plano de 180 días no distingue un precio de $900 que
  // se movió 2 % de uno de $8 M que se movió 40 %, y quien sabe derivar eso es otro módulo. El
  // contrato del resolvedor son los NUEVE campos que este archivo lee (`valor`, `estado`, `moneda`,
  // `fuente`, `observadoEn`, `antiguedadDias`, `porQue` y los que consume `issueDePrecio`); lo que
  // agregue de más viaja sin que esta función lo mire.
  resolverPrecio = precioVigente,
  // Mismo mecanismo para la vigencia de un subcontrato — con UNA diferencia que no se negocia: si el
  // documento del proveedor declara su propia validez, MANDA EL DOCUMENTO. Una oferta con validez
  // declarada es un dato duro y ninguna derivación estadística la puede pisar; el resolvedor
  // inyectado sólo entra cuando el documento calla. La precedencia vive en `subcontratoVigente`.
  resolverVigenciaSubcontrato = null,
} = {}) {
  const base = {
    partida: partida?.codigo ?? partida?.id ?? '?',
    cantidad: partida?.cantidad ?? null,
    unidad: partida?.unidad ?? null,
    cajones: null, lineas: [], costoUnitario: null, subtotal: null, hh: null,
    estado: ESTADO.FALTA_DATO, faltan: [], issues: [],
  }

  if (partida?.subcontrato) {
    const s = partida.subcontrato
    if (s.estado !== ESTADO.EXTRAIDO) {
      return {
        ...base, estado: s.estado, faltan: [s.porQue],
        // Una partida subcontratada no consume horas propias, y CERO es el dato — no un hueco.
        // Es la misma distinción que ya hace `cotizacion_partida_valorizada`.
        hh: 0,
        issues: [issue({
          type: TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO, severity: SEVERIDAD.BLOQUEANTE,
          entity: base.partida, impact: null,
          detalle: s.porQue, recommended_action: 'set_subcontract',
        })],
      }
    }
    const conv = aplicarFx({ monto: s.costo, desde: s.moneda, hasta: monedaDestino, fx })
    if (conv.estado !== ESTADO.CALCULADO) {
      return { ...base, hh: 0, estado: ESTADO.FALTA_DATO, faltan: [conv.porQue], issues: [issue({ type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.BLOQUEANTE, entity: base.partida, detalle: conv.porQue })] }
    }
    const venc = subcontratoVigente(s, { hoy, tabla: tablaVigenciaSubcontrato, resolver: resolverVigenciaSubcontrato })
    return {
      ...base, hh: 0, estado: venc.vigente ? ESTADO.EXTRAIDO : ESTADO.HISTORICO,
      cajones: { LABOR: 0, MATERIALS: 0, EQUIPMENT: 0, SUBCONTRACTS: redondear(conv.valor), OTHER: 0 },
      lineas: [{ cajon: CAJON.SUBCONTRACTS, recurso: 'SUBCONTRATO', nombre: s.alcance, proveedor: s.proveedor, costo: redondear(conv.valor), estado: ESTADO.EXTRAIDO, fuente: s.fuente, formula: conv.formula ?? `precio contratado ${s.costo} ${s.moneda}` }],
      costoUnitario: partida.cantidad ? redondear(conv.valor / partida.cantidad, 6) : null,
      subtotal: redondear(conv.valor),
      issues: venc.vigente ? [] : [issue({ type: TIPO_ISSUE.PRECIO_DESACTUALIZADO, severity: SEVERIDAD.ALTA, entity: base.partida, impact: redondear(conv.valor), detalle: venc.porQue, recommended_action: 'set_subcontract' })],
    }
  }

  if (!composicion.length) {
    const porQue = `«${base.partida}» no tiene composición cargada: no se sabe de qué está hecha, así que no se puede saber cuánto sale`
    return { ...base, faltan: [porQue], issues: [issue({ type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.BLOQUEANTE, entity: base.partida, detalle: porQue })] }
  }

  // `Number(null)` es 0 y `Number.isFinite(0)` es `true`: preguntar sólo por `isFinite` convierte
  // una cantidad AUSENTE en una cantidad MEDIDA de cero, y la partida sale costando $0 con su
  // fórmula al lado. Es el mismo defecto que `plano/fuente.mjs` documenta en `tieneNumero`, y lo
  // encontró el test «sin cantidad computada la partida no cuesta cero».
  const cant = partida?.cantidad
  if (cant === null || cant === undefined || cant === '' || !Number.isFinite(Number(cant))) {
    const porQue = `«${base.partida}» no tiene cantidad computada`
    return { ...base, faltan: [porQue], issues: [issue({ type: TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE, severity: SEVERIDAD.BLOQUEANTE, entity: base.partida, detalle: porQue, recommended_action: 'update_quantity' })] }
  }

  const cajones = { LABOR: 0, MATERIALS: 0, EQUIPMENT: 0, SUBCONTRACTS: 0, OTHER: 0 }
  const lineas = []
  const faltan = []
  const issues = []
  let hhUnitarias = 0
  let hhIncompletas = false
  const vencidos = []

  for (const l of composicion) {
    const cajon = CAJON_DE_TIPO[l.tipo] ?? CAJON.OTHER
    const p = resolverPrecio(l.recursoCodigo ?? l.codigo, observaciones, { hoy })
    const conFactor = 1 + (Number(l.desperdicio) || 0)

    // ═══ LA CANTIDAD DE LA LÍNEA, CON LA MISMA GUARDA QUE LA DE LA PARTIDA ═══
    //
    // Medido por la auditoría adversarial: una línea de composición con `cantidad: null` pasaba por
    // `Number(null) * precio * cant` = **0** y la partida salía `completa: true`, sin un solo issue,
    // con la fórmula publicando «null hs/u». Sobre el presupuesto real eso borraba $2,4 M de mano
    // de obra. Es exactamente el defecto que este archivo ya cerraba una escala más arriba —para la
    // cantidad de la PARTIDA— y que no se había cerrado para la cantidad de la LÍNEA.
    const cl = l.cantidad
    if (cl === null || cl === undefined || cl === '' || !Number.isFinite(Number(cl))) {
      const porQue = `${l.recursoCodigo ?? l.codigo}: la composición no dice cuánto lleva por unidad. NO es cero: es un renglón sin medir`
      faltan.push(porQue)
      // Si la línea sin medir es de mano de obra, las HH de la partida dejan de ser afirmables:
      // publicar la suma de las otras sería un total de horas al que le falta un renglón.
      if (l.tipo === TIPO_RECURSO.MANO_OBRA) hhIncompletas = true
      issues.push(issue({
        type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.BLOQUEANTE,
        entity: `${l.recursoCodigo ?? l.codigo}${l.nombre ? ` (${l.nombre})` : ''}`,
        detalle: porQue, recommended_action: null,
      }))
      lineas.push({ cajon, recurso: l.recursoCodigo ?? l.codigo, nombre: l.nombre ?? null, cantidad: null, unidadRecurso: l.unidad ?? null, precioUnitario: null, costo: null, estado: ESTADO.FALTA_DATO, fuente: p.fuente, formula: null })
      continue
    }
    if (l.tipo === TIPO_RECURSO.MANO_OBRA) hhUnitarias += Number(cl)

    // ═══ HISTORICO ≠ VALIDADO (§42), Y ACÁ NO SE TRADUCE ═══
    //
    // La versión anterior hacía `p.estado === HISTORICO ? EXTRAIDO : p.estado` para decidir si el
    // precio era sumable. El número SÍ se puede sumar —existe— pero traducirlo borraba el estado
    // aguas abajo, y la partida terminaba sellándose VALIDADA con un precio de 14 meses. El precio
    // se usa y el estado se CONSERVA: quien decide qué hacer con él es el gate, no esta función.
    if (!sumable({ valor: p.valor, estado: p.estado === ESTADO.HISTORICO ? ESTADO.CALCULADO : p.estado })) {
      faltan.push(`${l.recursoCodigo ?? l.codigo}: ${p.porQue}`)
      issues.push(issueDePrecio(p, { impacto: null, critico: true, nombre: l.nombre ?? null }))
      lineas.push({ cajon, recurso: l.recursoCodigo ?? l.codigo, nombre: l.nombre ?? null, cantidad: Number(l.cantidad) * conFactor * Number(cant), unidadRecurso: l.unidad ?? null, precioUnitario: null, costo: null, estado: p.estado, fuente: p.fuente, formula: null })
      continue
    }
    const conv = aplicarFx({ monto: p.valor, desde: p.moneda ?? monedaDestino, hasta: monedaDestino, fx })
    if (conv.estado !== ESTADO.CALCULADO) {
      faltan.push(`${l.recursoCodigo ?? l.codigo}: ${conv.porQue}`)
      issues.push(issue({ type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.BLOQUEANTE, entity: String(l.recursoCodigo ?? l.codigo), detalle: conv.porQue }))
      lineas.push({ cajon, recurso: l.recursoCodigo ?? l.codigo, nombre: l.nombre ?? null, cantidad: Number(l.cantidad) * conFactor * Number(cant), unidadRecurso: l.unidad ?? null, precioUnitario: null, costo: null, estado: ESTADO.FALTA_DATO, fuente: p.fuente, formula: null })
      continue
    }
    // La CANTIDAD FÍSICA total que esta partida demanda de este recurso. No se redondea acá: la
    // explosión de recursos la suma entre partidas y redondear en cada una acumula el error justo
    // en el número que después se compra.
    const cantidadFisica = Number(l.cantidad) * conFactor * Number(cant)
    const costoLinea = cantidadFisica * conv.valor
    cajones[cajon] += costoLinea
    if (p.estado === ESTADO.HISTORICO) {
      vencidos.push({ recurso: l.recursoCodigo ?? l.codigo, nombre: l.nombre ?? null, impacto: redondear(costoLinea), observadoEn: p.observadoEn, antiguedadDias: p.antiguedadDias })
      issues.push(issueDePrecio(p, { impacto: redondear(costoLinea), critico: false, nombre: l.nombre ?? null }))
    }
    lineas.push({
      cajon, recurso: l.recursoCodigo ?? l.codigo, nombre: l.nombre ?? null,
      // Lo que hace posible la explosión de recursos (§13): cuánto se necesita y a qué precio.
      cantidad: cantidadFisica, unidadRecurso: l.unidad ?? null, precioUnitario: conv.valor,
      costo: redondear(costoLinea), estado: p.estado, fuente: p.fuente, observadoEn: p.observadoEn,
      formula: `${l.cantidad} ${l.unidad ?? ''}/u × ${conv.valor} × ${conFactor} desperdicio × ${cant} ${base.unidad ?? ''}`.replace(/\s+/g, ' '),
    })
  }

  // ═══ ACÁ ES DONDE EL TOTAL SE NIEGA ═══
  // Un solo recurso sin precio deja la partida sin subtotal. No es una elección conservadora: un
  // subtotal al que le falta un renglón engaña MÁS que un subtotal ausente, porque tiene cara de
  // completo y nadie vuelve a mirarlo.
  const completa = faltan.length === 0
  const total = completa ? Object.values(cajones).reduce((a, v) => a + v, 0) : null
  return {
    ...base,
    cajones: Object.fromEntries(Object.entries(cajones).map(([k, v]) => [k, completa ? redondear(v) : null])),
    lineas,
    costoUnitario: completa ? redondear(total / Number(cant), 6) : null,
    subtotal: redondear(total),
    // HH `null` cuando falta el renglón de alguna mano de obra: la suma de las otras es un total al
    // que le falta una parte, y eso engaña más que un total ausente.
    hh: hhIncompletas ? null : redondear(hhUnitarias * Number(cant), 4),
    // El estado de la partida NO puede ser CALCULADO si su costo se apoya en un precio vencido.
    // `HISTORICO` dice exactamente eso: el número existe y no cierra un presupuesto (§42).
    estado: completa ? (vencidos.length ? ESTADO.HISTORICO : ESTADO.CALCULADO) : ESTADO.FALTA_DATO,
    /** Los precios vencidos que sostienen este costo, con su plata. Los lee el gate. */
    vencidos: Object.freeze(vencidos),
    faltan,
    issues: issues.filter(Boolean),
  }
}

/**
 * EL COSTO DIRECTO DE LA COTIZACIÓN. PURA.
 *
 * Devuelve `{ total, cajones, partidas, estado, faltan, issues, parcial }`.
 *
 * `total` es `null` en cuanto UNA partida no cierra. `parcial` es la suma de las que sí — existe
 * porque la pregunta «¿cuánto llevo?» es legítima, y tiene otro nombre a propósito: quien lo lee
 * está pidiendo explícitamente una cifra incompleta y no puede confundirla con el costo directo.
 */
export function costoDirecto(costosDePartida = []) {
  const cajones = { LABOR: 0, MATERIALS: 0, EQUIPMENT: 0, SUBCONTRACTS: 0, OTHER: 0 }
  let parcial = 0
  const faltan = []
  const issues = []
  for (const c of costosDePartida) {
    issues.push(...(c.issues ?? []))
    if (c.subtotal === null) { faltan.push({ partida: c.partida, porQue: c.faltan }); continue }
    parcial += c.subtotal
    for (const [k, v] of Object.entries(c.cajones ?? {})) cajones[k] = (cajones[k] ?? 0) + (v ?? 0)
  }
  const completo = faltan.length === 0 && costosDePartida.length > 0
  const sinHh = costosDePartida.filter((c) => c.hh === null || c.hh === undefined)
  if (sinHh.length) {
    issues.push(issue({
      type: TIPO_ISSUE.FALTA_DATO, severity: SEVERIDAD.ALTA, entity: 'HH de la obra',
      detalle: `${sinHh.length} partida(s) no pueden afirmar sus HH (${sinHh.map((c) => c.partida).join(', ')}): el total de horas de la obra NO se publica`,
    }))
  }
  return {
    total: completo ? redondear(parcial) : null,
    cajones: completo ? Object.fromEntries(Object.entries(cajones).map(([k, v]) => [k, redondear(v)])) : null,
    // ═══ `(c.hh ?? 0)` SE TRAGABA EL NULL QUE EL FIX DE LA LÍNEA ACABABA DE CREAR ═══
    // Una partida rota (hh null) más una sana (200 h) publicaba 200 como total de la obra: un total
    // de horas al que le falta una partida entera. La misma regla que el costo: si un sumando no se
    // puede afirmar, el total tampoco.
    hh: costosDePartida.some((c) => c.hh === null || c.hh === undefined)
      ? null
      : redondear(costosDePartida.reduce((a, c) => a + c.hh, 0), 4),
    nSinHh: costosDePartida.filter((c) => c.hh === null || c.hh === undefined).length,
    nPartidas: costosDePartida.length,
    nSinCosto: faltan.length,
    estado: completo ? ESTADO.CALCULADO : ESTADO.FALTA_DATO,
    porQue: completo ? null : `${faltan.length} de ${costosDePartida.length} partidas no tienen costo: el costo directo NO se afirma`,
    faltan,
    issues,
    /** La suma de las partidas que SÍ cerraron. No es el costo directo y por eso no se llama así. */
    parcial: redondear(parcial),
  }
}

/**
 * ¿ESTA CANTIDAD SIRVE PARA ESTA PARTIDA? Puente a `unidades.mjs` para que el motor de costo no
 * tenga que importar dos módulos para preguntar lo mismo. PURA.
 */
export function validarCantidadDePartida({ cantidad, unidad, unidadPartida } = {}) {
  const c = compatibleConPartida({ unidad, unidadPartida })
  if (!c.ok) return { ok: false, estado: c.estado, porQue: c.porQue, cantidad: null }
  return { ok: true, estado: c.estado, cantidad: Number(cantidad) * c.factor, factor: c.factor, porQue: c.porQue ?? null }
}
