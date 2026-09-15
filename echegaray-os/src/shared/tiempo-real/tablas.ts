// LAS TABLAS QUE AVISAN CUANDO CAMBIAN — espejo de la migración 20260915T2100.
//
// Una pantalla declara de qué tablas depende (`<RefrescarEnVivo tablas={[...]} />`) y el tipo sólo
// acepta tablas de esta lista. Declarar una tabla sin trigger compilaría y la pantalla nunca se
// actualizaría: un «en vivo» que miente. `tablas.test.ts` compara esta lista con la del SQL.

export const TABLAS_CON_AVISO = [
  'analisis', 'analisis_linea', 'asistencia_dia', 'asistencia_marca',
  'certificado_cliente', 'certificados', 'cliente_acceso', 'cliente_actividad_portal',
  'cliente_contacto', 'cliente_documento', 'cliente_nota', 'clientes',
  'cobranza', 'cobranza_cambio', 'cobranzas',
  'compra_adjunto', 'compra_sheet', 'comprobante_entrada', 'comprobantes_arca',
  'convenio_escala', 'costo_hora_alicuota', 'cotizacion_partida', 'cotizaciones',
  'cuadrilla', 'cuadrilla_integrante', 'documentacion_legajo', 'documento_presentacion',
  'esquema_pago', 'ficha_cliente_cache', 'herramientas', 'liquidacion_linea', 'liquidacion_quincena', 'liquidacion_reapertura',
  'movimientos_herramienta', 'obra_actividad', 'obra_actividad_nota', 'obra_actividad_paso',
  'obra_adjunto_cliente', 'obra_asignacion', 'obra_canonica', 'obra_dependencia', 'obra_documento',
  'obra_ejecucion', 'obra_ejecucion_equipo', 'obra_restriccion', 'pago_informado', 'pedidos_materiales',
  'persona_adelanto', 'persona_externa', 'persona_nota', 'persona_tarifa', 'persona_tarifa_correccion',
  'personas', 'proveedor_alias', 'proveedor_documento', 'proveedores', 'recurso', 'recurso_precio',
  'registro_hh_correccion', 'registros_hh', 'solicitud_correccion_asistencia', 'subcontrato',
  'subcontrato_alcance', 'subcontrato_aporte', 'subcontrato_documento', 'tarea_tipo', 'usuario_obra',
] as const

export type TablaConAviso = (typeof TABLAS_CON_AVISO)[number]
