import type { Obra } from './index'
import type { ObraResumenEconomico } from '@/features/control-economico/types'
import { calcularEstadoEconomico, ESTADO_ECONOMICO_LABEL, type EstadoEconomico } from '@/features/control-economico/types'
import type { ResumenProduccionEconomica } from '@/features/actividades-semanales/types/produccionEconomica'
import type { ActividadSemanal } from '@/features/actividades-semanales/types'
import type { ObraEjecucionFinanciera } from '@/features/ejecucion-financiera/types'
import type { ObraHHResumen, RegistroHH } from '@/features/hh-productividad/types'
import { agruparHHPorSemana } from '@/features/hh-productividad/types'
import type { CostoReal } from '@/features/costos-reales/types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'
import type { Adicional } from '@/features/adicionales/types'
import type { Accion } from '@/features/acciones/types'
import type { AlertaDashboard } from '@/features/dashboard/types'
import type { DatoTrazado } from '@/shared/types/datoTrazado'

// Ficha Integral de Obra (ciclo "centro de comando económico-productivo"). No
// recalcula nada que ya exista: compone en un solo objeto lo que ya calculan
// Control Económico, Producción Económica (ETC/EAC), Ejecución Financiera, HH y
// el Motor de Observación (AlertaDashboard, ya filtrado por esta obra). El único
// cálculo genuinamente nuevo acá es margenForecast (contratado - EAC) y el
// desglose de costo real por estado/concepto -- todo lo demás es síntesis.

export interface DatosFichaObra {
  obra: Obra
  clienteNombre: string
  resumenEconomico: ObraResumenEconomico | null
  resumenProduccion: ResumenProduccionEconomica
  ejecucionFinanciera: ObraEjecucionFinanciera | null
  resumenHH: ObraHHResumen | null
  registrosHH: RegistroHH[]
  costosReales: CostoReal[]
  movimientosObra: MovimientoCaja[]
  adicionalesObra: Adicional[]
  actividadesObra: ActividadSemanal[]
  accionesObra: Accion[]
  alertasObra: AlertaDashboard[]
}

export interface FichaObraResumen {
  estadoEconomico: EstadoEconomico
  estadoEconomicoLabel: string
  avance: DatoTrazado<number>
  tendencia: DatoTrazado<'adelantado' | 'en_linea' | 'atrasado'>
  margenEsperado: DatoTrazado<number>
  margenForecast: DatoTrazado<number>
  cajaGenerada: number
  cajaPendienteCobro: number
  principalRiesgo: AlertaDashboard | null
  proximaAccion: { titulo: string; origen: 'accion' | 'alerta' } | null
}

export interface FichaObraEconomia {
  contratado: number
  presupuestado: DatoTrazado<number>
  costoRealAcumulado: DatoTrazado<number>
  costoComprometido: number
  costoPagado: number
  etc: DatoTrazado<number>
  eac: DatoTrazado<number>
  margenEsperado: DatoTrazado<number>
  margenForecast: DatoTrazado<number>
}

export interface FichaObraCostos {
  porEstado: { comprometido: number; pendiente: number; pagado: number }
  porConcepto: { concepto: string; monto: number }[]
  pendienteClasificarNota: string | null
}

export interface FichaObraCertificacionCobranza {
  certificado: number
  facturado: number
  cobrado: number
  pendienteCertificar: number
  pendienteFacturar: number
  cobranzaProyectadaSinCertificar: DatoTrazado<number>
}

export interface FichaObraHH {
  estimada: number | null
  real: number
  desvioPorcentual: number | null
  semanas: { semana: string; horas: number }[]
}

export interface FichaObra {
  obra: Obra
  clienteNombre: string
  resumen: FichaObraResumen
  economia: FichaObraEconomia
  produccion: { avance: ResumenProduccionEconomica['avanceFisicoPromedio']; actividades: ActividadSemanal[] }
  hh: FichaObraHH
  certificacionCobranza: FichaObraCertificacionCobranza
  costos: FichaObraCostos
  adicionales: Adicional[]
  riesgosDecisiones: AlertaDashboard[]
  acciones: Accion[]
}

function principalAccion(acciones: Accion[]): Accion | null {
  const pendientes = acciones.filter((a) => a.estado === 'pendiente' || a.estado === 'en_curso')
  return (
    pendientes
      .slice()
      .sort((a, b) => (a.fecha_limite ?? '9999-99-99').localeCompare(b.fecha_limite ?? '9999-99-99'))[0] ?? null
  )
}

export function construirFichaObra(datos: DatosFichaObra): FichaObra {
  const {
    obra,
    clienteNombre,
    resumenEconomico,
    resumenProduccion,
    ejecucionFinanciera,
    resumenHH,
    registrosHH,
    costosReales,
    movimientosObra,
    adicionalesObra,
    actividadesObra,
    accionesObra,
    alertasObra,
  } = datos

  const estadoEconomico = resumenEconomico ? calcularEstadoEconomico(resumenEconomico) : 'sin_presupuesto_aprobado'

  const margenForecast: DatoTrazado<number> =
    resumenProduccion.eac.valor != null && resumenEconomico?.monto_contratado != null
      ? {
          valor: resumenEconomico.monto_contratado - resumenProduccion.eac.valor,
          naturaleza: 'inferido',
          explicacion: `Margen forecast = contratado ($${resumenEconomico.monto_contratado.toLocaleString('es-AR')}) - EAC. ${resumenProduccion.eac.explicacion}`,
        }
      : { valor: null, naturaleza: 'sin_dato', explicacion: 'No calculable sin EAC (ver Producción).' }

  const cajaGenerada = movimientosObra
    .filter((m) => m.tipo === 'cobro' && m.estado === 'real')
    .reduce((acc, m) => acc + m.monto, 0)
  const cajaPendienteCobro = movimientosObra
    .filter((m) => m.tipo === 'cobro' && m.estado === 'proyectado')
    .reduce((acc, m) => acc + m.monto, 0)

  const principalRiesgo = alertasObra[0] ?? null
  const accionPrioritaria = principalAccion(accionesObra)
  const proximaAccion = accionPrioritaria
    ? { titulo: accionPrioritaria.titulo, origen: 'accion' as const }
    : principalRiesgo
      ? { titulo: principalRiesgo.decisionSugerida, origen: 'alerta' as const }
      : null

  const resumen: FichaObraResumen = {
    estadoEconomico,
    estadoEconomicoLabel: ESTADO_ECONOMICO_LABEL[estadoEconomico],
    avance: resumenProduccion.avanceFisicoPromedio,
    tendencia: resumenProduccion.tendencia,
    margenEsperado: resumenProduccion.margenActualizado,
    margenForecast,
    cajaGenerada,
    cajaPendienteCobro,
    principalRiesgo,
    proximaAccion,
  }

  const economia: FichaObraEconomia = {
    contratado: resumenEconomico?.monto_contratado ?? obra.monto_contratado,
    presupuestado: resumenProduccion.costoPresupuestado,
    costoRealAcumulado: resumenProduccion.costoRealAcumulado,
    costoComprometido: resumenEconomico?.costo_comprometido ?? 0,
    costoPagado: resumenEconomico?.costo_pagado ?? 0,
    etc: resumenProduccion.etc,
    eac: resumenProduccion.eac,
    margenEsperado: resumenProduccion.margenActualizado,
    margenForecast,
  }

  const semanas = agruparHHPorSemana(registrosHH)
  const hh: FichaObraHH = {
    estimada: resumenHH?.hh_estimada ?? null,
    real: resumenHH?.hh_real_acumulada ?? 0,
    desvioPorcentual: resumenHH?.desvio_porcentual ?? null,
    semanas,
  }

  const totalPendienteEnCertificados = ejecucionFinanciera?.pendiente_cobrar ?? 0
  const cobranzaProyectadaSinCertificar: DatoTrazado<number> =
    cajaPendienteCobro > 0 && totalPendienteEnCertificados === 0
      ? {
          valor: cajaPendienteCobro,
          naturaleza: 'observado',
          explicacion:
            'Cobranza proyectada real (movimientos_caja, origen flujo_caja_sheet) sin certificado ni factura formal registrada todavía -- este cliente no factura por certificación progresiva evidenciada. No se fabrica un certificado para completar el esquema.',
        }
      : { valor: totalPendienteEnCertificados, naturaleza: 'observado', explicacion: 'obra_ejecucion_financiera.pendiente_cobrar (cadena certificado→facturado→cobrado).' }

  const certificacionCobranza: FichaObraCertificacionCobranza = {
    certificado: ejecucionFinanciera?.total_certificado ?? 0,
    facturado: ejecucionFinanciera?.total_facturado ?? 0,
    cobrado: ejecucionFinanciera?.total_cobrado ?? 0,
    pendienteCertificar: ejecucionFinanciera?.pendiente_certificar ?? economia.contratado,
    pendienteFacturar: ejecucionFinanciera?.pendiente_facturar ?? 0,
    cobranzaProyectadaSinCertificar,
  }

  const porEstado = { comprometido: 0, pendiente: 0, pagado: 0 }
  const porConceptoMap = new Map<string, number>()
  let tieneInferido = false
  for (const c of costosReales) {
    porEstado[c.estado] += c.monto
    porConceptoMap.set(c.concepto, (porConceptoMap.get(c.concepto) ?? 0) + c.monto)
    if (c.fuente_legacy === 'flujo_caja_sheet' && (c.notas ?? '').includes('inferid')) tieneInferido = true
  }
  const porConcepto = Array.from(porConceptoMap.entries())
    .map(([concepto, monto]) => ({ concepto, monto }))
    .sort((a, b) => b.monto - a.monto)

  const costos: FichaObraCostos = {
    porEstado,
    porConcepto,
    pendienteClasificarNota: tieneInferido
      ? 'Parte del costo real de materiales/subcontratos fue atribuido por ventana temporal y plausibilidad de concepto, no por tag de obra en la fuente (cliente compartido con otra obra). Ver Fuentes y Confianza.'
      : null,
  }

  return {
    obra,
    clienteNombre,
    resumen,
    economia,
    produccion: { avance: resumenProduccion.avanceFisicoPromedio, actividades: actividadesObra },
    hh,
    certificacionCobranza,
    costos,
    adicionales: adicionalesObra,
    riesgosDecisiones: alertasObra,
    acciones: accionesObra,
  }
}
