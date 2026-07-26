// Tipos de la ESTRATEGIA FINANCIERA. Espejo del contrato que produce el motor
// (orquestador/lib/estrategia-financiera.mjs), materializado en public.finanzas_estrategia_vigente por
// sync-estrategia-financiera.mjs. La Web NO calcula nada financiero: sólo pinta este documento y hace
// de la ESTRATEGIA la protagonista del Calendario Financiero. Si un número está mal, se arregla en el
// motor, nunca acá.

export type Severidad = 'alta' | 'media' | 'baja'
export type NivelConfianza = 'alta' | 'media' | 'baja'

// Una acción concreta de la estrategia (coordinación, pago o cobranza). Su `fecha` es lo que la ancla
// a un día del calendario: cuando cae en el día seleccionado, es la manifestación de la estrategia HOY.
export interface AccionEstrategia {
  fecha: string | null
  descripcion: string
  motivo: string
  impacto_pesos: number | null
  costo_financiero: number | null
  medio: string | null
  linea: string | null
  nueva_fecha: string | null
  requiere_aprobacion: boolean
  estrategia: string | null
}

export interface HorizonteGobernante {
  clave: string
  titulo: string
  por_que: string
}

export interface DiagnosticoLiquidez {
  estado?: 'sin dato'
  caja_hoy?: number
  cobranzas_por_cobrar?: number
  cobranzas_vencidas?: number
  comprometido_total?: number
  comprometido_vencido?: number
  proximos_30_dias?: number
  linea_disponible?: number
  costo_marginal_dinero?: number
  colchon_total?: number | null
  lectura?: string
  nota?: string
}

export interface ProblemaPrincipal {
  titulo: string
  detalle: string
  severidad: Severidad
}

export interface EstrategiaRecomendada {
  clave: string
  objetivo: string
  razonamiento: string
  palancas: unknown
  beneficios: string[]
  riesgos: string[]
  impacto: unknown
  que_coordina: string
  que_optimiza: string
  estrategia_global: string
}

export interface AlternativaEvaluada {
  clave: string
  es_elegida: boolean
  objetivo: string
  razonamiento: string
  beneficios: string[]
  riesgos: string[]
  impacto: unknown
  por_que_descartada: string
}

export interface Eleccion {
  elegida: string
  por_que: string
  ahorro_vs_segunda: { monto: number | null; segunda?: string; nota: string }
}

export interface Coordinaciones {
  ingresos: AccionEstrategia[]
  egresos: AccionEstrategia[]
}

export interface Pagos {
  priorizar: AccionEstrategia[]
  dividir: AccionEstrategia[]
  postergar: AccionEstrategia[]
  mover: AccionEstrategia[]
}

export interface Cobranzas {
  gestionar: AccionEstrategia[]
  adelantar: AccionEstrategia[]
  nota_sensibilidad: string | null
}

export interface Financiamiento {
  usar: AccionEstrategia[]
  evitar: { descripcion: string; motivo: string }[]
}

export interface ImpactoHorizonte {
  estado?: 'sin dato'
  saldo_proyectado?: number | null
  costo_financiero?: number | null
  pico_linea?: number | null
}

export interface ImpactoCaja {
  dias_7: ImpactoHorizonte
  dias_30: ImpactoHorizonte
  dias_90: ImpactoHorizonte
}

export interface ImpactoDimension {
  nombre: string
  monto: number
}

export interface ImpactoPor {
  obra: ImpactoDimension[]
  proveedor: ImpactoDimension[]
  cliente: ImpactoDimension[]
  banco: ImpactoDimension[]
  impuestos: ImpactoDimension[]
}

export interface NivelConfianzaDoc {
  nivel: NivelConfianza
  base: string
  degradada_por: string[]
}

// El documento estratégico completo. `estado: 'sin dato'` es válido (el plan de tesorería no está
// disponible): la Web lo declara, nunca inventa una estrategia.
export interface EstrategiaFinanciera {
  fecha: string
  estado: 'ok' | 'sin dato'
  motivo?: string
  objetivo_estrategico: string
  horizonte_gobernante?: HorizonteGobernante
  diagnostico_liquidez?: DiagnosticoLiquidez
  problema_principal?: ProblemaPrincipal
  estrategia_recomendada?: EstrategiaRecomendada | null
  alternativas_evaluadas?: AlternativaEvaluada[]
  eleccion?: Eleccion
  coordinaciones?: Coordinaciones
  pagos?: Pagos
  cobranzas?: Cobranzas
  financiamiento?: Financiamiento
  costo_financiero_esperado?: number
  impacto_caja?: ImpactoCaja
  impacto_por?: ImpactoPor
  riesgos?: string[]
  supuestos?: string[]
  datos_faltantes?: string[]
  nivel_confianza?: NivelConfianzaDoc
  cambios_vs_anterior?: string
  fuentes?: string
}

// La fila de public.finanzas_estrategia_vigente.
export interface EstrategiaVigente {
  estrategia: EstrategiaFinanciera
  calculado_en: string
}
