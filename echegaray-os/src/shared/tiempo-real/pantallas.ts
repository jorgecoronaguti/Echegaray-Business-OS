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
  'cobranza_cambio', 'certificado_cliente', 'certificados', 'esquema_pago', 'pago_informado',
  'obra_canonica',
  // LA FICHA SE SIRVE DE ESTA CACHÉ (refresco por pg_cron cada minuto, lo vencido a los 5 min). Avisa
  // cuando el cron cambia el json o se invalida; un refresco que deja el mismo json no avisa.
  'ficha_cliente_cache',
]

const PROVEEDOR: Lista = ['proveedores', 'proveedor_documento', 'proveedor_alias', 'subcontrato']

const COTIZACION: Lista = ['cotizaciones', 'cotizacion_partida', 'analisis', 'analisis_linea', 'recurso', 'recurso_precio']

const unir = (...listas: Lista[]): Lista => [...new Set(listas.flat())]

export const TABLAS_DE = {
  /** Personal: plantel, Horas, Liquidación (todas las solapas) y asistencia. */
  personal: unir(PERSONAS, HH_Y_ASISTENCIA, LIQUIDACION),
  /** Legajo de una persona. */
  legajo: unir(PERSONAS, HH_Y_ASISTENCIA, ['liquidacion_linea', 'liquidacion_quincena']),
  cuadrillas: unir(['cuadrilla', 'cuadrilla_integrante', 'personas'], HH_Y_ASISTENCIA),
  asistencia: unir(HH_Y_ASISTENCIA, ['personas']),
  // `compra_sheet` la avisa sync-compras sólo cuando el Sheet cambió de verdad (17/09/2026).
  compras: unir(['compra_sheet', 'compra_adjunto', 'comprobante_entrada', 'comprobantes_arca'], PROVEEDOR),
  /** Impuestos: lo que escribe el sincronizador (`impuestos-a-postgres.mjs`). */
  impuestos: unir(['impuesto_obligacion', 'impuesto_pago', 'impuesto_sincronizacion']),
  /** «A quién le debo» sale de `compra_sheet`: sin ella, un pago marcado en el Sheet no llegaba en vivo. */
  proveedores: unir(PROVEEDOR, [
    'subcontrato_documento', 'comprobantes_arca', 'compra_sheet', 'proveedor_notas', 'proveedor_nota_cambio',
    // La agenda de la ficha (20260921T1000).
    'proveedor_contacto',
  ]),
  obras: unir(OBRA, ['clientes', 'certificados', 'subcontrato']),
  gantt: ['obra_canonica', 'obra_actividad', 'obra_ejecucion', 'obra_restriccion'],
  fichaObra: unir(OBRA, [
    'subcontrato', 'subcontrato_alcance', 'subcontrato_aporte', 'subcontrato_documento', 'pedidos_materiales',
    'herramientas', 'certificados', 'cuadrilla', 'cuadrilla_integrante', 'personas',
    'cotizacion_partida',
  ]),
  clientes: CLIENTE,
  cotizaciones: unir(COTIZACION, ['obra_actividad', 'obra_canonica']),
  baseMaestra: unir(COTIZACION, ['tarea_tipo', 'convenio_escala']),
  pedidosMateriales: ['pedidos_materiales', 'obra_canonica'],
  /** Herramientas (20260921T2100): las tablas nuevas. `herramientas` y `movimientos_herramienta` son vistas
   *  desde esa migración y una vista no emite eventos. */
  herramientas: ['activo', 'activo_movimiento', 'activo_incidencia', 'activo_lectura_uso', 'ubicacion', 'obra_canonica'],
  /** Efectivo a rendir en el teléfono (`/mi-informacion/efectivo/...` y `/obra/efectivo`): la entrega, su
   *  conformidad, cada ticket y su vínculo con Compras, y la devolución. `comprobante_entrada` porque el
   *  estado «leyendo → en Compras» lo cambia el worker ahí antes de escribir el vínculo. */
  efectivoCampo: ['efectivo_entrega', 'efectivo_comprobante', 'efectivo_rendicion', 'efectivo_devolucion', 'comprobante_entrada'],
  /** Las pantallas del jefe de obra (`/obra/...`). */
  jefe: unir(OBRA, HH_Y_ASISTENCIA, ['personas', 'cuadrilla', 'cuadrilla_integrante']),
  // LAS QUE HABÍAN QUEDADO AFUERA (16/09/2026). Dueño: «lo que marco en el celular no se actualiza en la
  // computadora… tiene que ser de ida y vuelta, en tiempo real y multiusuario». `/campo` es justo la
  // carga desde el teléfono y no tenía ni el proveedor.
  /** `/campo`: asistencia, parte e impedimento desde el teléfono. */
  campo: unir(OBRA, HH_Y_ASISTENCIA, ['personas', 'cuadrilla', 'cuadrilla_integrante']),
  /** Pendientes de Administración: junta Personal, Compras, Obras y Clientes. */
  pendientes: unir(PERSONAS, HH_Y_ASISTENCIA, LIQUIDACION, OBRA, PROVEEDOR, CLIENTE,
    ['compra_adjunto', 'comprobante_entrada', 'comprobantes_arca', 'pedidos_materiales', 'herramientas']),
  usuarios: ['personas', 'usuario_obra', 'obra_canonica'],
  documentos: ['asistencia_dia', 'cliente_documento', 'documentacion_legajo', 'obra_documento'],
  integraciones: ['activo', 'activo_movimiento', 'pedidos_materiales', 'obra_actividad', 'obra_canonica'],
  /** Mi cuenta: mis horas, mi legajo, mis obras. */
  miCuenta: unir(PERSONAS, HH_Y_ASISTENCIA, OBRA, ['liquidacion_linea', 'liquidacion_quincena']),
  reportes: ['registros_hh'],
  /** Analíticas: obras y su contrato, horas, certificados y plantel. Compras y Cobranzas llegan por el
   *  timer del Sheet, que reescribe `obra_canonica` y la caché de la ficha: con eso alcanza para refrescar. */
  analiticas: ['obra_canonica', 'registros_hh', 'certificado_cliente', 'clientes', 'personas', 'ficha_cliente_cache'],
} as const satisfies Record<string, Lista>
