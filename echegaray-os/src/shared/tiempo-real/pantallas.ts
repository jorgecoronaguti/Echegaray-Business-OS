// DE QUÉ TABLAS DEPENDE CADA PANTALLA — lo que cada `page.tsx` le pasa a `<RefrescarEnVivo>`.
//
// SE ARMÓ POR DOMINIO, NO CONSULTA POR CONSULTA: sale de las tablas y vistas que lee cada carpeta de
// `src/features/` (15/09/2026), llevadas a sus tablas base, que son las que tienen trigger. Una vista
// como `obra_panel` o `persona_plantel` no avisa; avisan las tablas que la alimentan.
//
// Declarar DE MÁS cuesta un refresco de más (acotado por `planDeRefresco`: uno cada 5 s como mucho).
// Declarar DE MENOS es una pantalla que dice «en vivo» y no se entera. Ante la duda, se declara.
//
// Una tabla que no está en `TABLAS_CON_AVISO` no compila.

import type { TablaConAviso } from './tablas'

type Lista = readonly TablaConAviso[]

const HH_Y_ASISTENCIA: Lista = [
  'registros_hh', 'registro_hh_correccion', 'asistencia_dia', 'asistencia_marca', 'solicitud_correccion_asistencia',
  'obra_asignacion',
]

const PERSONAS: Lista = [
  'personas', 'persona_tarifa', 'persona_tarifa_correccion', 'persona_adelanto', 'persona_nota', 'persona_externa',
  'documentacion_legajo', 'cuadrilla', 'cuadrilla_integrante', 'usuario_obra',
]

const LIQUIDACION: Lista = [
  'liquidacion_quincena', 'liquidacion_linea', 'liquidacion_reapertura', 'convenio_escala', 'costo_hora_alicuota',
]

const OBRA: Lista = [
  'obra_canonica', 'obra_actividad', 'obra_actividad_nota', 'obra_actividad_paso', 'obra_ejecucion',
  'obra_ejecucion_equipo', 'obra_restriccion', 'obra_dependencia', 'obra_documento', 'obra_adjunto_cliente',
  'obra_asignacion', 'registros_hh',
]

const CLIENTE: Lista = [
  'clientes', 'cliente_contacto', 'cliente_nota', 'cliente_documento', 'cliente_acceso', 'cliente_actividad_portal',
  'cobranza', 'cobranzas', 'cobranza_cambio', 'certificado_cliente', 'certificados', 'esquema_pago', 'pago_informado',
  'obra_canonica',
  // LA FICHA SE SIRVE DE ESTA CACHÉ (refresco por pg_cron cada minuto, lo vencido a los 5 min). Avisa
  // cuando el cron cambia el json o se invalida; un refresco que deja el mismo json no avisa.
  'ficha_cliente_cache',
]

const PROVEEDOR: Lista = ['proveedores', 'proveedor_documento', 'proveedor_alias', 'subcontrato', 'compra_sheet']

const COTIZACION: Lista = ['cotizaciones', 'cotizacion_partida', 'analisis', 'analisis_linea', 'recurso', 'recurso_precio']

const unir = (...listas: Lista[]): Lista => [...new Set(listas.flat())]

export const TABLAS_DE = {
  /** Personal: plantel, Horas, Liquidación (todas las solapas) y asistencia. */
  personal: unir(PERSONAS, HH_Y_ASISTENCIA, LIQUIDACION),
  /** Legajo de una persona. */
  legajo: unir(PERSONAS, HH_Y_ASISTENCIA, ['liquidacion_linea', 'liquidacion_quincena']),
  cuadrillas: unir(['cuadrilla', 'cuadrilla_integrante', 'personas'], HH_Y_ASISTENCIA),
  asistencia: unir(HH_Y_ASISTENCIA, ['personas']),
  compras: unir(['compra_sheet', 'compra_adjunto', 'comprobante_entrada', 'comprobantes_arca'], PROVEEDOR),
  proveedores: unir(PROVEEDOR, ['subcontrato_documento', 'comprobantes_arca']),
  obras: unir(OBRA, ['clientes', 'certificados', 'cobranza', 'cobranzas', 'subcontrato']),
  gantt: ['obra_canonica', 'obra_actividad', 'obra_ejecucion', 'obra_restriccion'],
  fichaObra: unir(OBRA, [
    'subcontrato', 'subcontrato_alcance', 'subcontrato_aporte', 'subcontrato_documento', 'pedidos_materiales',
    'herramientas', 'certificados', 'cobranza', 'cobranzas', 'cuadrilla', 'cuadrilla_integrante', 'personas',
    'cotizacion_partida',
  ]),
  clientes: CLIENTE,
  cotizaciones: unir(COTIZACION, ['obra_actividad', 'obra_canonica']),
  baseMaestra: unir(COTIZACION, ['tarea_tipo', 'convenio_escala']),
  pedidosMateriales: ['pedidos_materiales', 'obra_canonica'],
  herramientas: ['herramientas', 'movimientos_herramienta', 'obra_canonica'],
  /** Las pantallas del jefe de obra (`/obra/...`). */
  jefe: unir(OBRA, HH_Y_ASISTENCIA, ['personas', 'cuadrilla', 'cuadrilla_integrante']),
} as const satisfies Record<string, Lista>
