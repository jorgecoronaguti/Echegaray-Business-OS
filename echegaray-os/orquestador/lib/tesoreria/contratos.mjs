// CONTRATOS DEL TESORERO INVERSOR IA — el vocabulario común de las diez skills.
//
// ═══ POR QUÉ UN ARCHIVO DE CONTRATOS Y NO TIPOS SUELTOS ═══
//
// Cada skill de este agente es una función pura que recibe la salida de la anterior. Si el shape se
// define en el archivo que lo produce, el consumidor termina adivinando: es exactamente lo que pasó
// con la tabla materializada del motor financiero (cambió el shape, la tabla quedó vieja, la UI tiró
// 500). Acá el shape se declara UNA vez y se valida en el borde con Zod.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE AGENTE ═══
//
// El `CLAUDE.md` raíz exige distinguir HECHO → DATO → CÁLCULO → INFERENCIA → ESTIMACIÓN → PROYECCIÓN.
// Acá eso no es una convención de redacción: es un campo obligatorio. Un número sin `evidencia` no
// entra al modelo. Un dato que falta se declara `sin_dato` con motivo — NUNCA se completa con un cero,
// porque un cero se lee como "no hay plata" y "no hay plata" es una decisión distinta a "no sé".

import { z } from 'zod'

/** Clasificación de evidencia. El orden es de mayor a menor confianza y se usa para degradar. */
export const EVIDENCIA = {
  HECHO: 'hecho', // verificado contra la realidad (ej. el cargo real del banco)
  DATO: 'dato', // leído de una fuente única del OS
  CALCULO: 'calculo', // aritmética determinística sobre datos
  INFERENCIA: 'inferencia', // deducido con evidencia suficiente
  ESTIMACION: 'estimacion', // supuesto declarado
  PROYECCION: 'proyeccion', // futuro modelado
  SIN_DATO: 'sin_dato', // no se sabe, y se dice
}

export const ORDEN_EVIDENCIA = [
  EVIDENCIA.HECHO, EVIDENCIA.DATO, EVIDENCIA.CALCULO,
  EVIDENCIA.INFERENCIA, EVIDENCIA.ESTIMACION, EVIDENCIA.PROYECCION, EVIDENCIA.SIN_DATO,
]

/**
 * La evidencia de un conjunto es la PEOR de sus partes, nunca la mejor. Un cálculo exacto sobre una
 * estimación sigue siendo una estimación: presentar el resultado como cálculo es fabricar precisión.
 */
export function evidenciaCombinada(...niveles) {
  const idx = niveles
    .filter(Boolean)
    .map((n) => ORDEN_EVIDENCIA.indexOf(n))
    .filter((i) => i >= 0)
  if (!idx.length) return EVIDENCIA.SIN_DATO
  return ORDEN_EVIDENCIA[Math.max(...idx)]
}

/** Confianza declarada. Se deriva de la evidencia y de la cobertura, no se elige a gusto. */
export const CONFIANZA = { ALTA: 'alta', MEDIA: 'media', BAJA: 'baja', NULA: 'nula' }

export const MONEDAS = ['ARS', 'USD']

/**
 * HORIZONTES DE TESORERÍA. No son "plazos lindos": cada uno corresponde a una decisión distinta sobre
 * el mismo peso. El bloque F existe porque "no invertible" es una respuesta correcta y frecuente, y
 * el G porque "no sé" nunca puede disfrazarse de F ni de A.
 */
export const BLOQUES = {
  A: { id: 'A', titulo: 'Liquidez inmediata (T+0)', desde: 0, hasta: 1 },
  B: { id: 'B', titulo: 'Excedente de 2 a 7 días', desde: 2, hasta: 7 },
  C: { id: 'C', titulo: 'Excedente de 8 a 30 días', desde: 8, hasta: 30 },
  D: { id: 'D', titulo: 'Excedente de 31 a 90 días', desde: 31, hasta: 90 },
  E: { id: 'E', titulo: 'Excedente de más de 90 días', desde: 91, hasta: 3650 },
  F: { id: 'F', titulo: 'No invertible', desde: null, hasta: null },
  G: { id: 'G', titulo: 'Información insuficiente', desde: null, hasta: null },
}

/** El bloque que corresponde a una ventana de N días libres. Nunca devuelve F ni G: eso lo decide la skill. */
export function bloquePorDias(dias) {
  const d = Number(dias)
  if (!Number.isFinite(d) || d < 0) return BLOQUES.G.id
  for (const b of [BLOQUES.A, BLOQUES.B, BLOQUES.C, BLOQUES.D, BLOQUES.E]) {
    if (d >= b.desde && d <= b.hasta) return b.id
  }
  return BLOQUES.E.id
}

// ════════════════════════════════════════════════════════════════════════════
// SKILL 1 — un movimiento del Flujo de Caja, normalizado
// ════════════════════════════════════════════════════════════════════════════

export const Movimiento = z.object({
  source_spreadsheet_id: z.string(),
  sheet_name: z.string().nullable(),
  source_range: z.string().nullable(),
  row_reference: z.string().nullable(),
  movement_id: z.string(),
  movement_type: z.string(), // cobranza | cheque | impuesto | cargas_sociales | obligacion | proveedor…
  direction: z.enum(['in', 'out']),
  due_date: z.string().nullable(), // ISO yyyy-mm-dd
  expected_date: z.string().nullable(),
  effective_date: z.string().nullable(),
  amount: z.number(),
  currency: z.enum(['ARS', 'USD']),
  status: z.enum(['pendiente', 'cobrado', 'pagado', 'vencido', 'desconocido']),
  confidence: z.enum(['alta', 'media', 'baja', 'nula']),
  counterparty: z.string().nullable(),
  category: z.string().nullable(),
  worksite: z.string().nullable(),
  payment_method: z.string().nullable(),
  committed: z.boolean(),
  source_formula: z.string().nullable(),
  observed_at: z.string(),
})

// ════════════════════════════════════════════════════════════════════════════
// SKILL 4 — una ventana de excedente invertible
// ════════════════════════════════════════════════════════════════════════════

export const Ventana = z.object({
  bloque: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
  titulo: z.string(),
  monto_maximo: z.number().nullable(),
  moneda: z.enum(['ARS', 'USD']),
  fecha_inicial: z.string().nullable(),
  fecha_limite: z.string().nullable(),
  dias_libres: z.number().nullable(),
  reserva_preservada: z.number().nullable(),
  obligaciones_cubiertas: z.array(z.string()).default([]),
  condiciones_invalidez: z.array(z.string()).default([]),
  evidencia: z.string(),
  confianza: z.enum(['alta', 'media', 'baja', 'nula']),
  motivo: z.string().nullable().default(null), // por qué F o G, cuando corresponde
})

// ════════════════════════════════════════════════════════════════════════════
// SKILL 5 — un instrumento financiero normalizado
// ════════════════════════════════════════════════════════════════════════════

/**
 * TIPOS DE TASA. Están enumerados porque el error clásico de tesorería no es equivocarse de número:
 * es comparar una TNA contra una TEA contra un rendimiento histórico mensual como si fueran lo mismo.
 * Toda tasa entra al modelo diciendo QUÉ es; si no lo dice, no entra.
 */
export const TIPO_TASA = {
  TNA: 'tna', TEA: 'tea', RENDIMIENTO_PERIODO: 'rendimiento_periodo',
  RENDIMIENTO_HISTORICO: 'rendimiento_historico', TIR: 'tir', VARIACION_PRECIO: 'variacion_precio',
}

export const NATURALEZA_TASA = { CONTRACTUAL: 'contractual', INDICATIVA: 'indicativa', HISTORICA: 'historica', ESTIMADA: 'estimada' }

export const Tasa = z.object({
  tipo: z.enum(Object.values(TIPO_TASA)),
  valor: z.number(), // fracción anual o del período según `tipo`
  base_dias: z.number().nullable(),
  periodo_dias: z.number().nullable(),
  moneda: z.enum(['ARS', 'USD']),
  naturaleza: z.enum(Object.values(NATURALEZA_TASA)),
  fuente: z.string(),
  observado_en: z.string(),
})

export const Instrumento = z.object({
  id: z.string(),
  nombre: z.string(),
  ticker: z.string().nullable(),
  categoria: z.string(),
  subcategoria: z.string().nullable(),
  emisor: z.string().nullable(),
  moneda: z.enum(['ARS', 'USD']),
  precio: z.number().nullable(),
  tasa: Tasa.nullable(),
  plazo_rescate_dias: z.number().nullable(), // T+0 → 0
  liquidacion_dias: z.number().nullable(),
  vencimiento: z.string().nullable(),
  duration: z.number().nullable(),
  riesgo_declarado: z.string().nullable(),
  costos: z.object({
    comision: z.number().nullable().default(null),
    honorarios: z.number().nullable().default(null),
    spread: z.number().nullable().default(null),
    salida_anticipada: z.number().nullable().default(null),
  }).default({}),
  url: z.string().nullable(),
  observado_en: z.string(),
  // CUÁNDO COTIZÓ EL MERCADO, distinto de cuándo lo miramos. Sin este campo, la frescura se medía
  // contra el reloj del propio proceso y daba 0,0 horas siempre. Null es "la pantalla no lo dijo" y
  // NO se lee como "recién ahora": ver `frescuraDeMercado`.
  cotizado_en: z.string().nullable().default(null),
  cotizado_precision: z.enum(['minuto', 'dia']).nullable().default(null),
  evidencia: z.string(),
  campos_faltantes: z.array(z.string()).default([]),
})

// ════════════════════════════════════════════════════════════════════════════
// SKILL 8 — la recomendación
// ════════════════════════════════════════════════════════════════════════════

export const ESTADO_RECOMENDACION = 'PROPUESTA — REQUIERE APROBACIÓN HUMANA'

export const Recomendacion = z.object({
  id: z.string(),
  bloque: z.enum(['A', 'B', 'C', 'D', 'E']),
  instrumento: z.string(),
  instrumento_id: z.string(),
  categoria: z.string(),
  monto_maximo: z.number(),
  moneda: z.enum(['ARS', 'USD']),
  horizonte_dias: z.number(),
  fecha_ingreso_sugerida: z.string(),
  fecha_limite_salida: z.string(),
  plazo_rescate_dias: z.number().nullable(),
  liquidacion_dias: z.number().nullable(),
  rendimiento_estimado_periodo: z.number().nullable(),

  // ═══ EL DESGLOSE FISCAL ES PARTE DEL CONTRATO, NO UN ADORNO ═══
  //
  // Un rendimiento sin impuestos es una estimación optimista: sacar la plata del banco y traerla de
  // vuelta paga 1,2% del capital (Ley 25.413, las dos puntas), y sobre 30 días eso se come más de la
  // mitad de la ganancia. Cuando esto vivía fuera del contrato, Zod lo borraba en silencio al validar
  // la propuesta y el mensaje publicaba el bruto con nombre de neto. Está acá para que no se pueda
  // perder: si el desglose no viaja, la revisión independiente rechaza la propuesta.
  rendimiento_bruto_periodo: z.number().nullable().default(null),
  rendimiento_antes_de_impuestos_periodo: z.number().nullable().default(null),
  impuestos: z.object({ estado: z.string() }).passthrough().nullable().default(null),
  impuestos_completos: z.boolean().default(false),

  rendimiento_neto_periodo: z.number().nullable(),
  ganancia_neta_estimada: z.number().nullable(),
  costo_oportunidad_evitado: z.number().nullable(),
  reserva_preservada: z.number().nullable(),
  obligaciones_cubiertas: z.array(z.string()).default([]),
  riesgos: z.array(z.string()).default([]),
  escenario_favorable: z.string().nullable(),
  escenario_adverso: z.string().nullable(),
  condiciones_invalidez: z.array(z.string()).default([]),
  datos_faltantes: z.array(z.string()).default([]),
  confianza: z.enum(['alta', 'media', 'baja', 'nula']),
  evidencia: z.string(),
  fuente_caja: z.string(),
  fuente_mercado: z.string(),
  vence_en: z.string(),
  estado: z.literal(ESTADO_RECOMENDACION),

  // ACCIONABILIDAD. Separada del `estado` a propósito: `estado` dice que requiere aprobación humana
  // (siempre); esto dice si el OS puede siquiera SUGERIR un monto. Sin políticas aprobadas el monto
  // es un techo técnico y la propuesta no es accionable — un número con nombre de accionable se usa
  // como accionable, por más notas al pie que lleve.
  accionable: z.boolean().default(false),
  estado_accionabilidad: z.enum(['ACCIONABLE', 'NO_ACCIONABLE']).default('NO_ACCIONABLE'),
  bloqueos_accionabilidad: z.array(z.string()).default([]),
  etiqueta_monto: z.enum(['excedente_aprobado', 'techo_tecnico_preliminar']).default('techo_tecnico_preliminar'),
  vara_periodo: z.number().nullable().default(null),
  modo_vara: z.string().nullable().default(null),
})

/** Valida en el borde y devuelve {ok, valor} o {ok:false, errores} — nunca tira dentro del ciclo. */
export function validarContra(esquema, valor) {
  const r = esquema.safeParse(valor)
  if (r.success) return { ok: true, valor: r.data }
  return { ok: false, errores: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
}

export const VERSION_CONTRATOS = '1.1.0'
