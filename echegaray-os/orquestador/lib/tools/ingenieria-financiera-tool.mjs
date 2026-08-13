// Tool: INGENIERÍA FINANCIERA — expone el motor de tesorería (ingenieria-financiera.mjs) al chat,
// al Director IA, al scheduler y a la web. Es el contrato único: nadie recalcula, todos consumen.
// 0 razonamiento del modelo sobre los números — salen de fuentes únicas verificadas.
import {
  modeloLiquidez, recomendaciones, compararFinanciamiento, priorizarPagos, fmt,
} from '../ingenieria-financiera.mjs'
import { calendarioDiario } from '../calendario-financiero.mjs'
import { condicionesVigentes, paramsParaMotor, costoEfectivo, advertenciaDeComparabilidad } from '../condiciones-financieras.mjs'
import { planTesoreria } from '../plan-tesoreria.mjs'
import { estrategiaFinanciera } from '../estrategia-financiera.mjs'
import { sincronizarEjecucion } from '../plan-ejecucion.mjs'
import { planVigente } from '../plan-vigente.mjs'
import { coberturaDeFuentes, fuentesParaDecision } from '../fuentes-conocimiento-financiero.mjs'

function formatModelo(m, recs) {
  const L = []
  L.push(`💧 *Modelo de liquidez · ${m.fecha}*`)
  const d = m.disponible
  if (d.estado === 'ok') {
    L.push(`Caja hoy: ${fmt(d.caja_hoy)} · vencimientos 7 días: ${fmt(d.vencimientos_7dias)} · proyección 7 días: ${fmt(d.proyeccion_7dias)}`)
    L.push(`Por cobrar del mes: ${fmt(d.cobranzas_por_cobrar_mes)}${d.cobranzas_vencidas ? ` · vencidas: ${fmt(d.cobranzas_vencidas)}` : ''}`)
  } else L.push(`Caja: sin dato (${d.motivo})`)
  const o = m.comprometido
  if (o.estado === 'ok') L.push(`Obligaciones: ${fmt(o.saldo_total)}${o.vencido ? ` · vencido ${fmt(o.vencido)}` : ''} · próx. 30 días ${fmt(o.entra_30_dias)}`)
  const dl = m.lineas?.descubierto
  if (dl) L.push(`Descubierto: límite ${fmt(dl.limite)}${dl.disponible_aprox != null ? ` · disponible ~${fmt(dl.disponible_aprox)}` : ''} (${m.lineas.costo_marginal})`)
  if (m.colchon_total != null) L.push(`Colchón total (caja + línea − vencido): ${fmt(m.colchon_total)}`)
  if (recs?.length) {
    L.push('\n*Recomendaciones:*')
    for (const r of recs) L.push(`• [${r.prioridad}] ${r.titulo} — ${r.explicacion} (riesgo ${r.riesgo}). ${r.fundamentos}.`)
  }
  return L.join('\n')
}

const ICONO_ACCION = { cobrar: '↓', pagar: '↑', postergar: '⏸', financiar: '⊕', cancelar_financiacion: '⊖' }

/** Texto ejecutivo de un horizonte del plan: el resumen y la secuencia cronológica de acciones. */
function formatPlan(plan) {
  if (plan?.estado !== 'ok') return `📋 *Plan de tesorería* — sin dato: ${plan?.motivo || 'no se pudo armar'}`
  const L = []
  L.push(`📋 *Plan de tesorería · ${plan.fecha}*`)
  L.push(`Caja inicial ${fmt(plan.caja_inicial)} · piso de liquidez ${fmt(plan.liquidez_minima)} · línea ${fmt(plan.limite_linea)}`)
  const h = plan.horizontes?.dias_7
  if (h) {
    const r = h.resumen
    L.push(`\n*${h.titulo}* — saldo proyectado ${fmt(r.saldo_proyectado_final)} · costo financiero ${fmt(r.costo_financiero_total)}${r.excede_limite_linea ? ' · ⚠ EXCEDE la línea' : ''}`)
    for (const a of h.acciones.slice(0, 12)) {
      L.push(`${a.fecha} ${ICONO_ACCION[a.tipo] || '·'} ${a.descripcion} — ${a.motivo}${a.costo_financiero ? ` (cuesta ${fmt(a.costo_financiero)})` : ''}`)
    }
    if (h.acciones.length > 12) L.push(`… y ${h.acciones.length - 12} acciones más en los 7 días`)
  }
  if (plan.tasas_faltantes?.length) L.push(`\nFaltan tasas para comparar mejor: ${plan.tasas_faltantes.map((f) => f.producto).join(', ')}`)
  L.push('\n_Toda acción con efecto externo requiere tu aprobación (Nivel E). El plan prepara la decisión; no ejecuta pagos._')
  return L.join('\n')
}

export function ingenieriaFinancieraTools(google) {
  return {
    'finanzas.plan_tesoreria': {
      capability: 'os.read',
      schema: {
        name: 'plan_tesoreria',
        description:
          'MOTOR DE ESTRATEGIA DE TESORERÍA — dada la situación financiera actual, construye el mejor PLAN completo y ejecutable, no recomendaciones sueltas. Devuelve una secuencia CRONOLÓGICA de acciones (qué cobrar, qué pagar, qué postergar, qué negociar, con qué medio, qué línea usar, cuándo usarla y cuándo cancelarla) para cuatro horizontes: hoy, 7, 30 y 90 días. Cada acción trae motivo, impacto en pesos, costo financiero, efecto sobre la liquidez, riesgos y dependencias de las acciones anteriores. Respeta solo la liquidez mínima, el límite de la línea y los vencimientos; nunca ejecuta pagos (Nivel E, requiere aprobación humana). Orquesta el calendario, el modelo de liquidez, la priorización de pagos y el comparador de financiamiento ya existentes — 0 recálculo. Usalo cuando el dueño pida "armame un plan", "qué hago con la plata esta semana/mes", "cómo ordeno los pagos y cobros", "estrategia de tesorería", "cómo cubro el mes".',
        input_schema: {
          type: 'object',
          properties: {
            liquidezMinima: { type: 'number', description: 'piso de caja que el plan no perfora voluntariamente (default 0)' },
            tasaPrestamoTNA: { type: 'number', description: 'TNA de un préstamo puntual para comparar líneas (opcional; si no, sale de condiciones)' },
            tasaDescuentoChequeTNA: { type: 'number', description: 'TNA de descuento de cheque (opcional; si no, sale de condiciones)' },
          },
        },
      },
      async run(args) {
        try {
          const plan = await planTesoreria({ google }, args || {})
          return { ...plan, texto: formatPlan(plan) }
        } catch (e) { return { error: `no pude armar el plan de tesorería: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },

    'finanzas.estrategia_financiera': {
      capability: 'os.read',
      schema: {
        name: 'estrategia_financiera',
        description:
          'LA SALIDA ESTRATÉGICA del Financial Engineering — NO una lista de cobros y pagos, sino una ESTRATEGIA FINANCIERA COMPLETA de nivel CFO. Evalúa varias estrategias completas y elige una, y devuelve: objetivo estratégico, diagnóstico de liquidez, problema principal a resolver, estrategia recomendada, alternativas evaluadas, alternativa elegida y por qué, coordinaciones de ingresos/egresos, pagos a mover/dividir/postergar/priorizar, cobranzas a adelantar/gestionar, financiamiento a usar/evitar, costo financiero esperado, ahorro frente a la 2da mejor, impacto en caja a 7/30/90 días, impacto por obra/proveedor/cliente/banco/impuestos, riesgos, supuestos, datos faltantes, nivel de confianza y cambios respecto de la estrategia anterior. Optimiza SIMULTÁNEAMENTE liquidez, costo financiero, continuidad de obras, riesgo fiscal/bancario y relación con proveedores/clientes. No inventa tasas ni datos: si falta info crítica lo declara y degrada la confianza. El plan_tesoreria es la CONSECUENCIA operativa de la estrategia elegida, no la estrategia. Usalo cuando el dueño pida "qué estrategia financiera conviene", "cómo ordeno la tesorería estratégicamente", "qué problema financiero tengo y cómo lo resuelvo". 0 recálculo: ensambla plan_tesoreria + modelo_liquidez + calendario.',
        input_schema: {
          type: 'object',
          properties: {
            liquidezMinima: { type: 'number', description: 'piso de caja que la estrategia no perfora voluntariamente (default 0)' },
            tasaPrestamoTNA: { type: 'number', description: 'TNA de un préstamo puntual para comparar líneas (opcional; si no, sale de condiciones)' },
            tasaDescuentoChequeTNA: { type: 'number', description: 'TNA de descuento de cheque (opcional; si no, sale de condiciones)' },
          },
        },
      },
      async run(args) {
        try {
          return await estrategiaFinanciera({ google }, args || {})
        } catch (e) { return { error: `no pude armar la estrategia financiera: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },

    'finanzas.fuentes_conocimiento': {
      capability: 'os.read',
      schema: {
        name: 'fuentes_conocimiento',
        description:
          'EL UNIVERSO DE CONOCIMIENTO DEL FINANCIAL ENGINEERING — el catálogo de TODAS las fuentes del Business OS que pueden afectar una decisión financiera (caja, banco, obligaciones, descubierto, créditos, cheques, compras, ARCA, facturas, certificaciones, obras, cronogramas, contratos, documentación técnica), cada una con qué aporta y su naturaleza: VERDAD estructurada (Supabase/Sheets/banco/ARCA, se consume directo) o CONOCIMIENTO en Drive (se consulta con el conector cuando una decisión lo necesita — Drive NO es fuente de verdad). No trae datos ni duplica fuentes: son punteros a lo que ya existe. Usalo para asegurar que una decisión financiera consideró todo lo disponible, o pasá una decisión (pagar/cobrar/financiar/plan/liquidez) para ver qué fuentes mirar.',
        input_schema: {
          type: 'object',
          properties: {
            decision: { type: 'string', enum: ['liquidez', 'pagar', 'cobrar', 'financiar', 'plan'], description: 'qué fuentes considerar para esta decisión (opcional; si no, el catálogo completo con su cobertura)' },
          },
        },
      },
      async run(args) {
        try {
          if (args?.decision) return { decision: args.decision, fuentes: fuentesParaDecision(args.decision) }
          return coberturaDeFuentes()
        } catch (e) { return { error: String(e?.message ?? e).slice(0, 180) } }
      },
    },

    'finanzas.plan_vigente': {
      capability: 'os.read',
      schema: {
        name: 'plan_vigente',
        description:
          'EL PLAN DE TESORERÍA VIGENTE — muestra el plan optimizado que el Financial Engineering recalcula solo, con su ESTADO (pendiente_ejecucion / autorizado / ejecutado) y QUÉ CAMBIÓ respecto del plan anterior (acciones agregadas, eliminadas, reprogramadas). El recálculo es automático; la ejecución NO: un plan nuevo queda pendiente de autorización y no crea tareas hasta que alguien lo apruebe. Usalo para "mostrame el plan", "¿qué cambió en el plan?", "¿está aprobado el plan?". No recalcula: lee el snapshot que ya dejó el motor.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const v = await planVigente({})
          if (!v) return { estado: 'sin_plan', nota: 'todavía no hay un plan vigente calculado' }
          return { estado: v.estado, horizonte: v.horizonte, calculado_en: v.calculado_en,
            autorizado_por: v.autorizado_por, cambios: v.cambios, plan: v.plan }
        } catch (e) { return { error: String(e?.message ?? e).slice(0, 180) } }
      },
    },

    'finanzas.plan_ejecutar': {
      capability: 'tasks.write',
      schema: {
        name: 'plan_ejecutar',
        description:
          'FINANCIAL EXECUTION ORCHESTRATOR — convierte el Plan de Tesorería (finanzas.plan_tesoreria) en trabajo ejecutable para los especialistas del OS. NO vuelve a decidir ni recalcula: toma el plan y crea tareas coordinadas (Comercial IA cobra, Compras IA negocia, Administración IA prepara pagos, CFO IA usa/cancela líneas), respetando las dependencias del plan (una tarea no arranca hasta que su dependencia esté completada), las aprobaciones Nivel E (el paso con plata queda para aprobación humana, nunca se ejecuta solo), la idempotencia (correr dos veces no duplica) y la trazabilidad (cada tarea guarda el plan y la acción origen). REQUIERE AUTORIZACIÓN EXPLÍCITA: sin autorizadoPor no crea nada, sólo devuelve el plan como pendiente_ejecucion. La autoriza el dueño, el Director IA, el CFO IA o la interfaz. Usalo cuando el dueño pida "aprobá y convertí en trabajo", "poné el plan en marcha". Pasá dry:true para previsualizar.',
        input_schema: {
          type: 'object',
          properties: {
            autorizadoPor: { type: 'string', description: 'quién autoriza la ejecución: dueño / director / cfo / interfaz. SIN esto no se crea ninguna tarea.' },
            horizonte: { type: 'string', enum: ['hoy', 'dias_7', 'dias_30', 'dias_90'], description: 'qué ventana del plan ejecutar (default dias_7)' },
            liquidezMinima: { type: 'number', description: 'piso de caja que el plan no perfora (opcional)' },
            dry: { type: 'boolean', description: 'true = mostrar qué tareas crearía sin crearlas' },
          },
        },
      },
      async run(args) {
        try {
          const r = await sincronizarEjecucion({ google }, args || {})
          return r
        } catch (e) { return { error: `no pude orquestar la ejecución del plan: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },

    'finanzas.modelo_liquidez': {
      capability: 'os.read',
      schema: {
        name: 'modelo_liquidez',
        description:
          'MOTOR DE INGENIERÍA FINANCIERA — arma el modelo único de liquidez de la empresa (dinero disponible, comprometido, líneas de crédito, colchón total) y devuelve RECOMENDACIONES concretas de tesorería. Compone fuentes únicas ya verificadas (caja, obligaciones, descubierto), 0 recálculo. Usalo cuando el dueño pregunte "¿cómo está la liquidez?", "¿qué me conviene hacer con la plata?", "¿cómo optimizo la caja?", "panorama financiero", "¿estoy holgado o ajustado?". Devolvé el texto y ofrecé profundizar (priorizar pagos, comparar financiamiento).',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const m = await modeloLiquidez({ google })
          const recs = recomendaciones(m)
          return { modelo: m, recomendaciones: recs, texto: formatModelo(m, recs) }
        } catch (e) { return { error: `no pude armar el modelo de liquidez: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },

    'finanzas.calendario_diario': {
      capability: 'os.read',
      schema: {
        name: 'calendario_diario',
        description:
          'CALENDARIO FINANCIERO — arma el día a día de la tesorería para que una interfaz lo PINTE (no lo calcule). Por cada día: saldo inicial, ingresos, egresos, saldo final, desglose (obligaciones, impuestos, cargas sociales, cheques, cobranzas), descubierto utilizado, crédito disponible, nivel de riesgo, cantidad de recomendaciones, y el detalle de cada movimiento (proveedor/cliente/obra/medio/origen). El saldo arranca de la caja y arrastra día a día. 0 recálculo: consume caja, Cheques, Cobranzas y obligaciones. Devuelve además las recomendaciones globales del motor. Usalo para "calendario financiero", "qué pasa esta semana/mes", "cuándo me quedo corto de caja".',
        input_schema: {
          type: 'object',
          properties: {
            dias: { type: 'number', description: 'horizonte en días desde hoy (default 60)' },
          },
        },
      },
      async run(args) {
        try {
          const cal = await calendarioDiario({ google }, { dias: args?.dias })
          const modelo = await modeloLiquidez({ google })
          return { ...cal, recomendaciones: recomendaciones(modelo) }
        } catch (e) { return { error: `no pude armar el calendario financiero: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },

    'finanzas.comparar_financiamiento': {
      capability: 'os.read',
      schema: {
        name: 'comparar_financiamiento',
        description:
          'INGENIERÍA DE FINANCIAMIENTO — ante una necesidad de fondos, compara TODAS las alternativas (caja propia, descubierto, descuento de cheque, préstamo, esperar, pronto pago) y elige la más barata factible, con la justificación económica. Usalo cuando el dueño pregunte "¿me conviene el descubierto o esperar?", "¿descuento el cheque?", "¿pago ya para ganar el descuento?", "¿cómo financio este pago?". Las tasas y límites REALES se cargan solos desde la fuente única de condiciones financieras (descubierto Santander verificado, etc.); lo que todavía no tiene tasa cargada se informa en "faltan_datos" con de dónde sacarlo, nunca se inventa. Podés pasar una tasa por parámetro para pisar la cargada o probar un escenario.',
        input_schema: {
          type: 'object',
          properties: {
            monto: { type: 'number', description: 'necesidad de fondos en pesos' },
            dias: { type: 'number', description: 'por cuántos días se necesita el financiamiento' },
            cajaLibre: { type: 'number', description: 'caja propia disponible sin entrar al descubierto (opcional)' },
            limiteDescubiertoDisp: { type: 'number', description: 'margen del acuerdo sin usar (opcional)' },
            tasaDescuentoChequeTNA: { type: 'number', description: 'TNA de descuento de cheque, ej 0.60 (opcional)' },
            tasaPrestamoTNA: { type: 'number', description: 'TNA de un préstamo puntual (opcional)' },
            descuentoProntoPago: { type: 'number', description: 'fracción 0..1 que rebaja el proveedor por pagar ya (opcional)' },
            multaEspera: { type: 'number', description: 'costo cierto de esperar/mora (opcional)' },
          },
          required: ['monto', 'dias'],
        },
      },
      async run(args) {
        try {
          const a = args || {}
          // LA CAPA DE CONDICIONES ALIMENTA AL MOTOR (24/07). Se leen las condiciones vigentes de la
          // fuente única y se arman los parámetros de tasa/límite. Los args EXPLÍCITOS pisan lo
          // cargado (para probar un escenario o corregir): merge con args al final.
          let condiciones = []
          try { condiciones = await condicionesVigentes({}) } catch { condiciones = [] }
          const { params, faltan } = paramsParaMotor(condiciones)
          const merged = { ...params, ...a }
          const resultado = compararFinanciamiento(merged)
          // Desglose de CFT total efectivo por condición real, para la necesidad concreta (lo que el
          // motor puro no detalla). No reemplaza el ranking del motor: lo enriquece.
          const detalle = condiciones
            .filter((c) => ['descubierto', 'prestamo', 'descuento_cheque', 'tarjeta'].includes(c.tipo_financiacion))
            .map((c) => costoEfectivo(c, { monto: a.monto, dias: a.dias }))
          // EL PAYLOAD DECLARA SI LOS NÚMEROS SON COMPARABLES. Sin esto el modelo recibía costos de
          // distinta completitud en un mismo array y ordenaba por el más bajo, que es el peor documentado.
          return { ...resultado, condiciones: detalle, faltan_datos: faltan, comparabilidad: advertenciaDeComparabilidad(detalle) }
        } catch (e) { return { error: String(e?.message ?? e).slice(0, 180) } }
      },
    },

    'finanzas.condiciones_financieras': {
      capability: 'os.read',
      schema: {
        name: 'condiciones_financieras',
        description:
          'CONDICIONES DE FINANCIAMIENTO — muestra la fuente única de tasas, costos y límites vigentes (descubierto, préstamos, descuento de cheque, tarjeta, financiación de proveedores) con su fuente, vigencia y nivel de confianza, y qué condiciones existen pero todavía NO tienen tasa cargada (con de dónde sacarla). Usalo cuando el dueño pregunte "¿qué tasas tenemos?", "¿qué me falta para comparar?", "¿cuánto disponible me queda del acuerdo?".',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const conds = await condicionesVigentes({})
          const { faltan } = paramsParaMotor(conds)
          return {
            condiciones: conds.map((c) => ({
              entidad: c.entidad, producto: c.producto, tipo: c.tipo_financiacion, moneda: c.moneda,
              tna: c.tna, cft: c.cft, limite_disponible: c.limite_disponible, saldo_utilizado: c.saldo_utilizado,
              vigencia_hasta: c.vigencia_hasta, nivel_confianza: c.nivel_confianza, fuente: c.fuente, observaciones: c.observaciones,
            })),
            faltan_datos: faltan,
            nota: 'Toda condición tiene fuente y nivel de confianza. Las tasas en null NO están inventadas: falta conseguirlas (ver faltan_datos).',
          }
        } catch (e) { return { error: String(e?.message ?? e).slice(0, 180) } }
      },
    },

    'finanzas.priorizar_pagos': {
      capability: 'os.read',
      schema: {
        name: 'priorizar_pagos',
        description:
          'INGENIERÍA DE PAGOS — ordena una lista de pagos por prioridad real (vencimiento + costo de no pagar + criticidad del proveedor/obra + liquidez), NO sólo por fecha, y reparte la caja disponible: lo que no entra pasa a "esperar". Usalo cuando el dueño pregunte "¿qué pago primero?", "¿a quién le pago esta semana?", "¿qué puede esperar?". Cada pago vuelve con su decisión (pagar/parcial/esperar) y el motivo económico.',
        input_schema: {
          type: 'object',
          properties: {
            obligaciones: {
              type: 'array',
              description: 'lista de pagos a priorizar',
              items: {
                type: 'object',
                properties: {
                  proveedor: { type: 'string' },
                  monto: { type: 'number' },
                  dias_a_vencer: { type: 'number', description: 'negativo = vencido' },
                  criticidad: { type: 'string', enum: ['critico', 'obra', 'comercial', 'normal'] },
                  interesMoraDiario: { type: 'number', description: 'fracción diaria de mora (opcional)' },
                  descuentoProntoPago: { type: 'number', description: 'fracción de descuento por pronto pago (opcional)' },
                  obra: { type: 'string', description: 'obra a la que sirve el pago (opcional)' },
                },
                required: ['proveedor', 'monto'],
              },
            },
            cajaDisponible: { type: 'number', description: 'caja para repartir entre los pagos (opcional)' },
          },
          required: ['obligaciones'],
        },
      },
      async run(args) {
        try { return { pagos: priorizarPagos(args?.obligaciones || [], { cajaDisponible: args?.cajaDisponible }) } } catch (e) { return { error: String(e?.message ?? e).slice(0, 180) } }
      },
    },
  }
}
