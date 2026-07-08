import type { AlertaDashboard, CategoriaAlerta } from '@/features/dashboard/types'
import type { DatoTrazado, NaturalezaDato } from '@/shared/types/datoTrazado'

// Motor de Decisiones v1 (Track B / B5, OLA 2). Construye la cadena
// HECHO -> CONTEXTO -> CAUSA -> IMPACTO(S) -> RIESGO -> ALTERNATIVAS -> RECOMENDACIÓN
// -> CONFIANZA -> ACCIÓN SUGERIDA a partir de una AlertaDashboard ya calculada --
// no es un motor de inferencia nuevo: reusa causa/decisionSugerida/confianza/
// skillsRelevantes que cada capacidad ya produce (ver dashboard/types). "La solución
// más simple que funcione", como pidió el usuario -- reglas + datos ya estructurados,
// no orquestación de LLM.
export interface AnalisisMultidisciplinario {
  hecho: string
  contexto: string
  causa: string
  impactoOperativo: DatoTrazado<string>
  impactoEconomico: DatoTrazado<string>
  impactoFinanciero: DatoTrazado<string>
  impactoContractual: DatoTrazado<string>
  riesgo: string
  alternativas: string[]
  recomendacion: string
  confianza: NaturalezaDato
  accionSugerida: string
  skillsActivadas: string[]
}

// Qué dimensiones de impacto tiene sentido evaluar según la categoría de la alerta --
// evita fabricar un "impacto contractual" para un déficit de caja, por ejemplo.
const DIMENSIONES_POR_CATEGORIA: Record<
  CategoriaAlerta,
  { operativo: boolean; economico: boolean; financiero: boolean; contractual: boolean }
> = {
  control_economico: { operativo: true, economico: true, financiero: false, contractual: false },
  adicionales: { operativo: true, economico: true, financiero: false, contractual: true },
  ejecucion_financiera: { operativo: false, economico: false, financiero: true, contractual: true },
  hh: { operativo: true, economico: true, financiero: false, contractual: false },
  compras: { operativo: true, economico: true, financiero: false, contractual: false },
  obligaciones: { operativo: false, economico: false, financiero: true, contractual: false },
  actividad_obra: { operativo: true, economico: false, financiero: false, contractual: false },
  posicion_caja: { operativo: false, economico: false, financiero: true, contractual: false },
  exposicion_financiera: { operativo: false, economico: false, financiero: true, contractual: false },
  riesgo_operacion_financiero: { operativo: true, economico: true, financiero: true, contractual: true },
}

const ALTERNATIVAS_POR_CATEGORIA: Record<CategoriaAlerta, string[]> = {
  control_economico: [
    'Revisar con el jefe de obra qué costos explican el desvío antes de decidir.',
    'Renegociar alcance o condiciones con el cliente si el desvío es estructural.',
    'Aceptar el desvío si es puntual y no compromete el margen mínimo aceptable.',
  ],
  adicionales: [
    'Cotizar y presentar el adicional formalmente antes de perder respaldo.',
    'Ejecutar solo si el cliente ya aprobó por escrito.',
    'Frenar la ejecución hasta resolver la aprobación.',
  ],
  ejecucion_financiera: [
    'Emitir la factura pendiente y priorizar la cobranza.',
    'Contactar al cliente si la factura ya está vencida.',
    'Revisar si el atraso de cobro justifica una acción comercial (recargo, garantía).',
  ],
  hh: [
    'Revisar productividad real de la cuadrilla contra lo estimado.',
    'Ajustar la planificación de la obra si el desvío es sostenido.',
    'Incorporar el desvío al aprendizaje para la próxima cotización.',
  ],
  compras: [
    'Contactar al proveedor para resolver el retraso.',
    'Evaluar un proveedor alternativo si el retraso es recurrente.',
    'Ajustar la planificación de obra al nuevo plazo de entrega.',
  ],
  obligaciones: [
    'Pagar o renegociar antes del vencimiento.',
    'Anticipar una cobranza para cubrir el pago.',
    'Priorizar esta obligación sobre otras de menor urgencia.',
  ],
  actividad_obra: [
    'Confirmar con el jefe de obra la causa real del atraso.',
    'Reasignar recursos a la actividad atrasada.',
    'Ajustar la fecha objetivo si la causa es una restricción externa real.',
  ],
  posicion_caja: [
    'Anticipar cobranzas proyectadas antes de la semana de déficit.',
    'Renegociar plazos de pago con proveedores/obligaciones de esa semana.',
    'Gestionar financiamiento de corto plazo si no alcanza con lo anterior.',
  ],
  exposicion_financiera: [
    'Priorizar la cobranza/pago de la contraparte concentrada.',
    'Evaluar diversificar cartera de clientes/proveedores hacia adelante.',
    'Aceptar el riesgo si es transitorio y ya está gestionado.',
  ],
  riesgo_operacion_financiero: [
    'Confirmar con el cliente si la certificación/cobranza se sostiene pese al atraso.',
    'Ajustar el forecast de F1 si el atraso se confirma real.',
    'Escalar a Dirección si compromete el margen o la caja proyectada.',
  ],
}

function construirContexto(alerta: AlertaDashboard): string {
  const partes: string[] = []
  if (alerta.obraNombre) partes.push(`Obra: ${alerta.obraNombre}`)
  if (alerta.contraparte) partes.push(`Contraparte: ${alerta.contraparte}`)
  if (alerta.fechaCritica) partes.push(`Fecha crítica: ${alerta.fechaCritica}`)
  return partes.length > 0 ? partes.join('. ') + '.' : 'Sin obra, contraparte ni fecha crítica asociada.'
}

function dimension(aplica: boolean, alerta: AlertaDashboard, etiqueta: string): DatoTrazado<string> {
  if (!aplica) {
    return { valor: null, naturaleza: 'sin_dato', explicacion: `${etiqueta} no aplica a esta categoría de alerta.` }
  }
  if (alerta.monto != null) {
    return {
      valor: `$${alerta.monto.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`,
      naturaleza: alerta.confianza,
      explicacion: `Monto ya calculado por ${alerta.fuente}.`,
    }
  }
  return {
    valor: alerta.causa,
    naturaleza: 'inferido',
    explicacion: `${etiqueta} inferido de la causa -- no hay un monto separado calculado para esta dimensión.`,
  }
}

export function construirAnalisisMultidisciplinario(alerta: AlertaDashboard): AnalisisMultidisciplinario {
  const dims = DIMENSIONES_POR_CATEGORIA[alerta.categoria]

  return {
    hecho: alerta.titulo,
    contexto: construirContexto(alerta),
    causa: alerta.causa,
    impactoOperativo: dimension(dims.operativo, alerta, 'Impacto operativo'),
    impactoEconomico: dimension(dims.economico, alerta, 'Impacto económico'),
    impactoFinanciero: dimension(dims.financiero, alerta, 'Impacto financiero'),
    impactoContractual: dims.contractual
      ? {
          valor: 'Puede tener relevancia contractual -- requiere revisión específica.',
          naturaleza: 'inferido',
          explicacion: 'Juicio, no un análisis de cláusulas real -- activar derecho-construccion-contratos antes de actuar.',
        }
      : { valor: null, naturaleza: 'sin_dato', explicacion: 'Impacto contractual no aplica a esta categoría de alerta.' },
    riesgo: `Severidad ${alerta.severidad} / materialidad ${alerta.materialidad} -- ${alerta.causa}`,
    alternativas: ALTERNATIVAS_POR_CATEGORIA[alerta.categoria],
    recomendacion: alerta.decisionSugerida,
    confianza: alerta.confianza,
    accionSugerida: alerta.decisionSugerida,
    skillsActivadas: alerta.skillsRelevantes,
  }
}
