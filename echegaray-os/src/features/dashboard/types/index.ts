import type { Obra } from '@/features/obras/types'
import type { Proveedor } from '@/features/fundacion/types'
import type { ObraResumenEconomico } from '@/features/control-economico/types'
import { calcularEstadoEconomico } from '@/features/control-economico/types'
import type { Adicional } from '@/features/adicionales/types'
import { calcularAlertasAdicional, montoRelevanteParaMargen } from '@/features/adicionales/types'
import type { Certificado, ObraEjecucionFinanciera } from '@/features/ejecucion-financiera/types'
import {
  calcularAlertasCertificado,
  calcularAlertasObraEjecucionFinanciera,
} from '@/features/ejecucion-financiera/types'
import type { RegistroHH, ObraHHResumen } from '@/features/hh-productividad/types'
import { calcularAlertasObraHH } from '@/features/hh-productividad/types'
import type { Compra, CompraResumen } from '@/features/compras/types'
import { calcularAlertasCompra, calcularAlertasObraCompras } from '@/features/compras/types'
import type { Obligacion, ObligacionResumen } from '@/features/obligaciones/types'
import {
  calcularAlertasObligacion,
  calcularAlertasGeneralesObligaciones,
  calcularTensionLiquidez,
} from '@/features/obligaciones/types'

// Dashboard de Dirección (PRP-011): no fabrica alertas nuevas — cruza y normaliza las
// que cada capacidad ya calcula sobre sus propias vistas/datos (Control Económico,
// Adicionales, Ejecución Financiera, HH, Compras, Obligaciones). Cero tablas nuevas,
// cero vistas SQL nuevas: es 100% una capa de síntesis en TypeScript sobre lo que ya
// existe, reutilizando cada `calcularAlertasX` en vez de reimplementar la lógica.

export type SeveridadAlerta = 'critica' | 'alta' | 'media' | 'informativa'

export const ORDEN_SEVERIDAD: Record<SeveridadAlerta, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  informativa: 3,
}

export type CategoriaAlerta =
  | 'control_economico'
  | 'adicionales'
  | 'ejecucion_financiera'
  | 'hh'
  | 'compras'
  | 'obligaciones'
  | 'actividad_obra'

export interface AlertaDashboard {
  id: string
  titulo: string
  severidad: SeveridadAlerta
  categoria: CategoriaAlerta
  obraId: string | null
  obraNombre: string | null
  contraparte: string | null
  monto: number | null
  fechaCritica: string | null
  causa: string
  decisionSugerida: string
  link: string | null
}

export interface DashboardDatosFuente {
  obras: Obra[]
  proveedores: Proveedor[]
  resumenEconomico: ObraResumenEconomico[]
  adicionales: Adicional[]
  certificados: Certificado[]
  ejecucionFinanciera: ObraEjecucionFinanciera[]
  registrosHH: RegistroHH[]
  resumenHH: ObraHHResumen[]
  compras: Compra[]
  comprasResumen: CompraResumen[]
  obligaciones: Obligacion[]
  obligacionesResumen: ObligacionResumen[]
  cobrosProyectadosEnVentana: number
}

// Umbral propuesto, no validado con el usuario todavía — mismo criterio abierto que
// el resto de las capacidades. Reutiliza el mismo valor que HH (DIAS_SIN_REGISTRO_RECIENTE)
// por consistencia, ya que mide la misma noción de "silencio" en el sistema.
export const DIAS_OBRA_SIN_MOVIMIENTO = 14

function obraNombrePorId(obras: Obra[], obraId: string | null): string | null {
  if (!obraId) return null
  return obras.find((o) => o.id === obraId)?.nombre ?? null
}

function proveedorNombrePorId(proveedores: Proveedor[], proveedorId: string | null): string | null {
  if (!proveedorId) return null
  return proveedores.find((p) => p.id === proveedorId)?.nombre ?? null
}

function linkObra(obraId: string | null): string | null {
  return obraId ? `/obras/${obraId}` : null
}

function mapControlEconomico(resumenes: ObraResumenEconomico[]): AlertaDashboard[] {
  const alertas: AlertaDashboard[] = []
  for (const r of resumenes) {
    const estado = calcularEstadoEconomico(r)
    if (estado === 'sano') continue

    if (estado === 'sin_presupuesto_aprobado') {
      alertas.push({
        id: `ce-sin-presupuesto-${r.obra_id}`,
        titulo: `Sin presupuesto aprobado — ${r.obra_nombre}`,
        severidad: 'informativa',
        categoria: 'control_economico',
        obraId: r.obra_id,
        obraNombre: r.obra_nombre,
        contraparte: null,
        monto: null,
        fechaCritica: null,
        causa: 'No hay un presupuesto aprobado para comparar contra el costo real acumulado.',
        decisionSugerida: 'Cargar o aprobar un presupuesto para poder controlar el margen de esta obra.',
        link: linkObra(r.obra_id),
      })
      continue
    }

    alertas.push({
      id: `ce-${estado}-${r.obra_id}`,
      titulo: `Margen ${estado === 'critico' ? 'crítico' : 'en atención'} — ${r.obra_nombre}`,
      severidad: estado === 'critico' ? 'critica' : 'alta',
      categoria: 'control_economico',
      obraId: r.obra_id,
      obraNombre: r.obra_nombre,
      contraparte: null,
      monto: r.desvio_absoluto,
      fechaCritica: null,
      causa: `Costo real desvía ${r.desvio_porcentual}% del presupuesto aprobado (margen actualizado $${r.margen_actualizado}).`,
      decisionSugerida: 'Revisar el control económico de la obra y los costos que explican el desvío.',
      link: linkObra(r.obra_id),
    })
  }
  return alertas
}

const DECISION_ADICIONAL: Record<string, string> = {
  ejecutado_sin_cotizar: 'Cotizar y presentar el adicional al cliente antes de perder el respaldo.',
  riesgo_perdida_margen: 'Revisar por qué bajó el monto entre etapas y renegociar si corresponde.',
  frenado: 'Retomar el seguimiento del adicional con el motivo ya registrado.',
  cotizado_pendiente_aprobacion: 'Hacer seguimiento de la aprobación del cliente.',
  aprobado_pendiente_ejecucion: 'Planificar la ejecución del adicional ya aprobado.',
  ejecutado_pendiente_facturacion: 'Facturar el adicional ya ejecutado.',
  facturado_pendiente_cobranza: 'Gestionar el cobro del adicional ya facturado.',
}

const SEVERIDAD_ADICIONAL: Record<string, SeveridadAlerta> = {
  ejecutado_sin_cotizar: 'critica',
  riesgo_perdida_margen: 'critica',
  frenado: 'alta',
  facturado_pendiente_cobranza: 'alta',
  ejecutado_pendiente_facturacion: 'alta',
  cotizado_pendiente_aprobacion: 'media',
  aprobado_pendiente_ejecucion: 'media',
}

function mapAdicionales(adicionales: Adicional[], obras: Obra[]): AlertaDashboard[] {
  const alertas: AlertaDashboard[] = []
  for (const a of adicionales) {
    for (const alerta of calcularAlertasAdicional(a)) {
      alertas.push({
        id: `ad-${alerta.tipo}-${a.id}`,
        titulo: `Adicional: ${a.concepto}`,
        severidad: SEVERIDAD_ADICIONAL[alerta.tipo] ?? 'media',
        categoria: 'adicionales',
        obraId: a.obra_id,
        obraNombre: obraNombrePorId(obras, a.obra_id),
        contraparte: null,
        monto: montoRelevanteParaMargen(a),
        fechaCritica: null,
        causa: alerta.mensaje,
        decisionSugerida: DECISION_ADICIONAL[alerta.tipo] ?? 'Revisar el estado del adicional.',
        link: linkObra(a.obra_id),
      })
    }
  }
  return alertas
}

const DECISION_CERTIFICADO: Record<string, string> = {
  pendiente_facturacion: 'Emitir la factura correspondiente al certificado.',
  pendiente_cobranza: 'Gestionar el cobro de la factura ya emitida.',
  factura_vencida: 'Contactar al cliente — la factura está vencida y todavía no se cobró.',
}

const SEVERIDAD_CERTIFICADO: Record<string, SeveridadAlerta> = {
  pendiente_facturacion: 'media',
  pendiente_cobranza: 'alta',
  factura_vencida: 'critica',
}

const DECISION_OBRA_EJECUCION: Record<string, string> = {
  certificada_sin_ingreso_caja: 'Revisar por qué el avance certificado todavía no generó ingreso de caja.',
  baja_conversion_a_caja: 'Priorizar la cobranza de esta obra — poco del contrato se convirtió en caja.',
}

const SEVERIDAD_OBRA_EJECUCION: Record<string, SeveridadAlerta> = {
  certificada_sin_ingreso_caja: 'alta',
  baja_conversion_a_caja: 'media',
}

function mapEjecucionFinanciera(
  certificados: Certificado[],
  resumenes: ObraEjecucionFinanciera[],
  obras: Obra[]
): AlertaDashboard[] {
  const alertas: AlertaDashboard[] = []
  for (const c of certificados) {
    for (const alerta of calcularAlertasCertificado(c)) {
      alertas.push({
        id: `cert-${alerta.tipo}-${c.id}`,
        titulo: `Certificado ${c.numero} — ${obraNombrePorId(obras, c.obra_id) ?? 'Obra'}`,
        severidad: SEVERIDAD_CERTIFICADO[alerta.tipo] ?? 'media',
        categoria: 'ejecucion_financiera',
        obraId: c.obra_id,
        obraNombre: obraNombrePorId(obras, c.obra_id),
        contraparte: null,
        monto: c.monto_facturado ?? c.monto_certificado,
        fechaCritica: c.fecha_vencimiento,
        causa: alerta.mensaje,
        decisionSugerida: DECISION_CERTIFICADO[alerta.tipo] ?? 'Revisar el estado del certificado.',
        link: linkObra(c.obra_id),
      })
    }
  }
  for (const r of resumenes) {
    for (const alerta of calcularAlertasObraEjecucionFinanciera(r)) {
      alertas.push({
        id: `ef-${alerta.tipo}-${r.obra_id}`,
        titulo: `${r.obra_nombre} — ${alerta.tipo === 'certificada_sin_ingreso_caja' ? 'sin ingreso de caja' : 'baja conversión a caja'}`,
        severidad: SEVERIDAD_OBRA_EJECUCION[alerta.tipo] ?? 'media',
        categoria: 'ejecucion_financiera',
        obraId: r.obra_id,
        obraNombre: r.obra_nombre,
        contraparte: null,
        monto: r.pendiente_cobrar,
        fechaCritica: null,
        causa: alerta.mensaje,
        decisionSugerida: DECISION_OBRA_EJECUCION[alerta.tipo] ?? 'Revisar la ejecución financiera de la obra.',
        link: linkObra(r.obra_id),
      })
    }
  }
  return alertas
}

const DECISION_HH: Record<string, string> = {
  sin_estimacion: 'Cargar HH estimadas en el presupuesto aprobado para poder comparar.',
  desvio_significativo: 'Revisar la productividad de la obra — está consumiendo más HH de lo previsto.',
  concentracion_anormal: 'Revisar qué ocurrió en la semana con concentración anormal de HH.',
  obra_activa_sin_registro_reciente: 'Cargar el registro de HH pendiente o confirmar que la obra sigue activa.',
  informacion_insuficiente: 'Seguir registrando HH — todavía no hay semanas suficientes para una lectura confiable.',
}

const SEVERIDAD_HH: Record<string, SeveridadAlerta> = {
  sin_estimacion: 'informativa',
  desvio_significativo: 'alta',
  concentracion_anormal: 'media',
  obra_activa_sin_registro_reciente: 'media',
  informacion_insuficiente: 'informativa',
}

function mapHH(resumenes: ObraHHResumen[], registrosPorObra: Map<string, RegistroHH[]>): AlertaDashboard[] {
  const alertas: AlertaDashboard[] = []
  for (const r of resumenes) {
    const registros = registrosPorObra.get(r.obra_id) ?? []
    for (const alerta of calcularAlertasObraHH(r, registros)) {
      alertas.push({
        id: `hh-${alerta.tipo}-${r.obra_id}`,
        titulo: `HH: ${r.obra_nombre}`,
        severidad: SEVERIDAD_HH[alerta.tipo] ?? 'media',
        categoria: 'hh',
        obraId: r.obra_id,
        obraNombre: r.obra_nombre,
        contraparte: null,
        monto: null,
        fechaCritica: r.ultima_fecha_registro,
        causa: alerta.mensaje,
        decisionSugerida: DECISION_HH[alerta.tipo] ?? 'Revisar la productividad de la obra.',
        link: linkObra(r.obra_id),
      })
    }
  }
  return alertas
}

const DECISION_COMPRA: Record<string, string> = {
  sin_obra: 'Asociar la compra a la obra correspondiente.',
  sin_proveedor: 'Completar el proveedor de la compra.',
  pendiente_entrega: 'Hacer seguimiento de la entrega con el proveedor.',
  entrega_retrasada: 'Contactar al proveedor — la entrega está retrasada y puede frenar la obra.',
  recibida_sin_costo_real: 'Registrar el costo real correspondiente a la recepción.',
  costo_sin_pago_trazable: 'Registrar o vincular el pago que corresponde a este costo.',
  pagada_no_recibida: 'Verificar la recepción — hay pagos registrados sin recepción confirmada.',
}

const SEVERIDAD_COMPRA: Record<string, SeveridadAlerta> = {
  sin_obra: 'media',
  sin_proveedor: 'media',
  pendiente_entrega: 'media',
  entrega_retrasada: 'alta',
  recibida_sin_costo_real: 'media',
  costo_sin_pago_trazable: 'alta',
  pagada_no_recibida: 'critica',
}

const DECISION_OBRA_COMPRAS: Record<string, string> = {
  concentracion_urgentes: 'Revisar por qué se están generando compras urgentes — puede evitarse planificando antes.',
  proveedor_retrasos_recurrentes: 'Evaluar reemplazar o exigir plazos al proveedor con retrasos recurrentes.',
}

function mapCompras(
  compras: Compra[],
  resumenes: CompraResumen[],
  obras: Obra[],
  proveedores: Proveedor[]
): AlertaDashboard[] {
  const alertas: AlertaDashboard[] = []
  for (const c of compras) {
    const resumen = resumenes.find((r) => r.compra_id === c.id)
    if (!resumen) continue
    for (const alerta of calcularAlertasCompra(c, resumen)) {
      alertas.push({
        id: `co-${alerta.tipo}-${c.id}`,
        titulo: `Compra: ${c.concepto}`,
        severidad: SEVERIDAD_COMPRA[alerta.tipo] ?? 'media',
        categoria: 'compras',
        obraId: c.obra_id,
        obraNombre: obraNombrePorId(obras, c.obra_id),
        contraparte: proveedorNombrePorId(proveedores, c.proveedor_id),
        monto: c.monto_orden ?? c.monto_cotizado,
        fechaCritica: c.fecha_entrega_prevista,
        causa: alerta.mensaje,
        decisionSugerida: DECISION_COMPRA[alerta.tipo] ?? 'Revisar el estado de la compra.',
        link: linkObra(c.obra_id),
      })
    }
  }

  const porObra = new Map<string, Compra[]>()
  for (const c of compras) {
    if (!c.obra_id) continue
    const lista = porObra.get(c.obra_id) ?? []
    lista.push(c)
    porObra.set(c.obra_id, lista)
  }
  for (const [obraId, comprasDeLaObra] of porObra) {
    for (const alerta of calcularAlertasObraCompras(comprasDeLaObra)) {
      alertas.push({
        id: `co-obra-${alerta.tipo}-${obraId}-${alerta.proveedorId ?? ''}`,
        titulo: `Compras: ${obraNombrePorId(obras, obraId) ?? 'Obra'}`,
        severidad: alerta.tipo === 'concentracion_urgentes' ? 'alta' : 'media',
        categoria: 'compras',
        obraId,
        obraNombre: obraNombrePorId(obras, obraId),
        contraparte: alerta.proveedorId ? proveedorNombrePorId(proveedores, alerta.proveedorId) : null,
        monto: null,
        fechaCritica: null,
        causa: alerta.mensaje,
        decisionSugerida: DECISION_OBRA_COMPRAS[alerta.tipo] ?? 'Revisar las compras de la obra.',
        link: linkObra(obraId),
      })
    }
  }
  return alertas
}

const DECISION_OBLIGACION: Record<string, string> = {
  vencida: 'Pagar o renegociar — la obligación ya está vencida.',
  proxima_a_vencer: 'Planificar el pago antes del vencimiento.',
  parcialmente_pagada: 'Completar el saldo pendiente cuando corresponda.',
  sin_vencimiento: 'Confirmar la fecha de vencimiento real de esta obligación.',
  sin_trazabilidad: 'Vincular esta obligación a una Compra, Costo Real o Proveedor para poder auditarla.',
}

const SEVERIDAD_OBLIGACION: Record<string, SeveridadAlerta> = {
  vencida: 'critica',
  proxima_a_vencer: 'alta',
  parcialmente_pagada: 'media',
  sin_vencimiento: 'informativa',
  sin_trazabilidad: 'informativa',
}

function mapObligaciones(
  resumenes: ObligacionResumen[],
  obras: Obra[],
  proveedores: Proveedor[],
  cobrosProyectadosEnVentana: number
): AlertaDashboard[] {
  const alertas: AlertaDashboard[] = []
  for (const r of resumenes) {
    for (const alerta of calcularAlertasObligacion(r)) {
      alertas.push({
        id: `ob-${alerta.tipo}-${r.obligacion_id}`,
        titulo: `Obligación: ${r.concepto}`,
        severidad: SEVERIDAD_OBLIGACION[alerta.tipo] ?? 'media',
        categoria: 'obligaciones',
        obraId: r.obra_id,
        obraNombre: obraNombrePorId(obras, r.obra_id),
        contraparte: proveedorNombrePorId(proveedores, r.proveedor_id),
        monto: r.saldo_pendiente,
        fechaCritica: r.fecha_vencimiento,
        causa: alerta.mensaje,
        decisionSugerida: DECISION_OBLIGACION[alerta.tipo] ?? 'Revisar el estado de la obligación.',
        link: r.obra_id ? linkObra(r.obra_id) : '/obligaciones',
      })
    }
  }

  for (const alerta of calcularAlertasGeneralesObligaciones(resumenes)) {
    alertas.push({
      id: `ob-general-${alerta.tipo}`,
      titulo: 'Concentración de vencimientos',
      severidad: 'alta',
      categoria: 'obligaciones',
      obraId: null,
      obraNombre: null,
      contraparte: null,
      monto: null,
      fechaCritica: null,
      causa: alerta.mensaje,
      decisionSugerida: 'Planificar la caja de la semana para cubrir los vencimientos concentrados.',
      link: '/obligaciones',
    })
  }

  for (const alerta of calcularTensionLiquidez(resumenes, cobrosProyectadosEnVentana)) {
    alertas.push({
      id: `ob-tension-${alerta.tipo}`,
      titulo: 'Posible tensión de liquidez',
      severidad: 'critica',
      categoria: 'obligaciones',
      obraId: null,
      obraNombre: null,
      contraparte: null,
      monto: null,
      fechaCritica: null,
      causa: alerta.mensaje,
      decisionSugerida: 'Anticipar cobranzas o negociar plazos de pago antes de la ventana de tensión.',
      link: '/obligaciones',
    })
  }

  return alertas
}

// "Obra activa sin movimiento reciente relevante" — no es una vista ni tabla nueva:
// reutiliza los mismos arreglos ya cargados por las demás secciones para encontrar la
// fecha de actividad más reciente por obra, sin fabricar un dato que no exista.
function mapActividadObra(datos: DashboardDatosFuente): AlertaDashboard[] {
  const alertas: AlertaDashboard[] = []
  const hoy = new Date()

  for (const obra of datos.obras) {
    if (obra.estado !== 'activa') continue

    const fechas: string[] = []
    for (const a of datos.adicionales) if (a.obra_id === obra.id) fechas.push(a.fecha_deteccion)
    for (const c of datos.certificados) if (c.obra_id === obra.id) fechas.push(c.fecha_certificacion)
    for (const c of datos.compras) if (c.obra_id === obra.id) fechas.push(c.fecha_necesidad)
    for (const r of datos.registrosHH) if (r.obra_id === obra.id) fechas.push(r.fecha_inicio_semana)

    const ultimaFecha = fechas.sort().at(-1) ?? null
    const diasSinMovimiento = ultimaFecha
      ? (hoy.getTime() - new Date(ultimaFecha).getTime()) / (1000 * 60 * 60 * 24)
      : null

    if (diasSinMovimiento === null || diasSinMovimiento > DIAS_OBRA_SIN_MOVIMIENTO) {
      alertas.push({
        id: `act-${obra.id}`,
        titulo: `Obra activa sin movimiento reciente — ${obra.nombre}`,
        severidad: 'media',
        categoria: 'actividad_obra',
        obraId: obra.id,
        obraNombre: obra.nombre,
        contraparte: null,
        monto: null,
        fechaCritica: ultimaFecha,
        causa: ultimaFecha
          ? `Sin adicionales, certificados, compras ni HH registrados desde el ${ultimaFecha}.`
          : 'Sin ningún adicional, certificado, compra ni HH registrado todavía.',
        decisionSugerida: 'Confirmar si la obra sigue activa y actualizar el registro correspondiente en el OS.',
        link: linkObra(obra.id),
      })
    }
  }

  return alertas
}

export function construirAlertasDashboard(datos: DashboardDatosFuente): AlertaDashboard[] {
  const registrosPorObra = new Map<string, RegistroHH[]>()
  for (const r of datos.registrosHH) {
    const lista = registrosPorObra.get(r.obra_id) ?? []
    lista.push(r)
    registrosPorObra.set(r.obra_id, lista)
  }

  const alertas = [
    ...mapControlEconomico(datos.resumenEconomico),
    ...mapAdicionales(datos.adicionales, datos.obras),
    ...mapEjecucionFinanciera(datos.certificados, datos.ejecucionFinanciera, datos.obras),
    ...mapHH(datos.resumenHH, registrosPorObra),
    ...mapCompras(datos.compras, datos.comprasResumen, datos.obras, datos.proveedores),
    ...mapObligaciones(
      datos.obligacionesResumen,
      datos.obras,
      datos.proveedores,
      datos.cobrosProyectadosEnVentana
    ),
    ...mapActividadObra(datos),
  ]

  return alertas.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad])
}
