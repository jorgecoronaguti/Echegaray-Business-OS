import type { ResumenProduccionEconomica } from './produccionEconomica'
import type { Certificado } from '@/features/ejecucion-financiera/types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

// O1-D — Conexión operación -> finanzas. Regla explícita del usuario: "no convertir
// automáticamente una hipótesis productiva en movimiento financiero confirmado".
//
// Decisión de diseño (evita una modificación material del modelo de datos): en vez de
// agregar un estado 'en_riesgo' a movimientos_caja.estado (que hoy solo admite
// 'proyectado'/'real' y es una columna ya usada por F1/F2 en producción), estas
// advertencias se calculan como una capa de síntesis SEPARADA, en modo lectura, sobre
// certificados y movimientos_caja ya existentes -- nunca los modifica ni los reclasifica.
// F1/F2 siguen mostrando exactamente lo mismo que sin esta capa; esto es un aviso
// adicional, no una alteración del forecast.
//
// Si en el futuro se decide que 'en_riesgo' debe vivir en el propio movimiento_caja,
// eso es la modificación material que hay que presentar aparte (problema, alternativas,
// impacto de migración) -- no se hace acá.

export type ConfianzaImpacto = 'proyectado' | 'en_riesgo'

export interface AdvertenciaOperacionFinanciera {
  tipo: 'certificacion_en_riesgo' | 'cobranza_en_riesgo' | 'costo_pendiente_no_impactado'
  confianza: ConfianzaImpacto
  obraId: string
  monto: number | null
  mensaje: string
}

interface DatosImpactoFinanciero {
  obraId: string
  obraNombre: string
  resumenProduccion: ResumenProduccionEconomica
  certificadosObra: Certificado[]
  movimientosCajaObra: MovimientoCaja[]
  costoPendiente: number | null // obra_resumen_economico.costo_pendiente (ya observado)
}

export function calcularAdvertenciasOperacionFinanciera(datos: DatosImpactoFinanciero): AdvertenciaOperacionFinanciera[] {
  const advertencias: AdvertenciaOperacionFinanciera[] = []
  const atrasado = datos.resumenProduccion.tendencia.valor === 'atrasado'

  if (atrasado) {
    const certificadosSinFacturar = datos.certificadosObra.filter((c) => !c.fecha_facturacion)
    for (const c of certificadosSinFacturar) {
      advertencias.push({
        tipo: 'certificacion_en_riesgo',
        confianza: 'en_riesgo',
        obraId: datos.obraId,
        monto: c.monto_certificado,
        mensaje: `${datos.obraNombre}: atraso físico detectado -- el certificado "${c.numero}" (${c.monto_certificado.toLocaleString('es-AR')}) todavía no facturado podría demorarse.`,
      })
    }

    const cobrosProyectadosObra = datos.movimientosCajaObra.filter((m) => m.tipo === 'cobro' && m.estado === 'proyectado')
    for (const m of cobrosProyectadosObra) {
      advertencias.push({
        tipo: 'cobranza_en_riesgo',
        confianza: 'en_riesgo',
        obraId: datos.obraId,
        monto: m.monto,
        mensaje: `${datos.obraNombre}: atraso físico detectado -- la cobranza proyectada "${m.concepto}" ($${m.monto.toLocaleString('es-AR')}, ${m.fecha_esperada}) podría moverse de fecha. F1 sigue mostrando la fecha original -- esto es un aviso, no un cambio de forecast.`,
      })
    }
  }

  if (datos.costoPendiente != null && datos.costoPendiente > 0) {
    advertencias.push({
      tipo: 'costo_pendiente_no_impactado',
      confianza: 'proyectado',
      obraId: datos.obraId,
      monto: datos.costoPendiente,
      mensaje: `${datos.obraNombre}: $${datos.costoPendiente.toLocaleString('es-AR')} de costo comprometido/pendiente todavía no impactó como pago real en caja.`,
    })
  }

  return advertencias
}
