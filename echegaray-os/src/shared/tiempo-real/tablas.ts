// LAS TABLAS QUE AVISAN CUANDO CAMBIAN — espejo de las migraciones marcadas (20260915T2100, 20260916T2010, 20260917T1400/T1410).
//
// Una pantalla declara de qué tablas depende (`<RefrescarEnVivo tablas={[...]} />`) y el tipo sólo
// acepta tablas de esta lista. Declarar una tabla sin trigger compilaría y la pantalla nunca se
// actualizaría: un «en vivo» que miente. `planDeRefresco.test.ts` compara esta lista con la de las migraciones.

export const TABLAS_CON_AVISO = [
  'analisis', 'analisis_linea', 'asistencia_dia', 'asistencia_marca',
  'certificado_cliente', 'certificados', 'cliente_acceso', 'cliente_actividad_portal',
  'cliente_contacto', 'cliente_documento', 'cliente_nota', 'clientes',
  // Sin `compra_sheet`, `cobranzas` ni `cobranza`: sus sincronizadores las reescriben enteras (ver la migración).
  'cobranza_cambio',
  'compra_adjunto', 'comprobante_entrada', 'comprobantes_arca',
  'convenio_escala', 'costo_hora_alicuota', 'cotizacion_partida', 'cotizaciones',
  'cuadrilla', 'cuadrilla_integrante', 'documentacion_legajo', 'documento_presentacion',
  'esquema_pago', 'ficha_cliente_cache', 'herramientas',
  // Impuestos: migración 20260916T2010 (el sincronizador hace upsert, no borra y reinserta).
  'impuesto_obligacion', 'impuesto_pago', 'impuesto_sincronizacion',
  'liquidacion_linea', 'liquidacion_quincena', 'liquidacion_reapertura',
  'movimientos_herramienta', 'obra_actividad', 'obra_actividad_nota', 'obra_actividad_paso',
  'obra_adjunto_cliente', 'obra_asignacion', 'obra_canonica', 'obra_dependencia', 'obra_documento',
  'obra_ejecucion', 'obra_ejecucion_equipo', 'obra_restriccion', 'pago_informado', 'pedidos_materiales',
  'persona_adelanto', 'persona_externa', 'persona_nota', 'persona_tarifa', 'persona_tarifa_correccion',
  'personas', 'proveedor_alias', 'proveedor_documento', 'proveedores', 'recurso', 'recurso_precio',
  // Notas «Qué hacer» y su cola: migraciones 20260917T1400 y T1410 (upsert por clave, no borrar y reinsertar).
  'proveedor_notas', 'proveedor_nota_cambio',
  'registro_hh_correccion', 'registros_hh', 'solicitud_correccion_asistencia', 'subcontrato',
  'subcontrato_alcance', 'subcontrato_aporte', 'subcontrato_documento', 'tarea_tipo', 'usuario_obra',
] as const

/**
 * LAS QUE AVISA SU SINCRONIZADOR, NO UN TRIGGER (17/09/2026).
 *
 * `compra_sheet` se borra y se reinserta entera en cada corrida: un trigger avisaría siempre. Avisa
 * `sync-compras.mjs`, comparando la tabla antes y después dentro de su transacción y mandando el mismo
 * `{tabla, op}` al mismo tópico sólo si algo cambió (`orquestador/lib/espejo-aviso.mjs`). La llave es el
 * script que manda el aviso: `planDeRefresco.test.ts` comprueba que lo haga, y que la tabla NO tenga
 * trigger — con los dos, avisaría en cada corrida.
 */
export const TABLAS_AVISADAS_POR_SINCRONIZADOR = {
  compra_sheet: 'orquestador/scripts/sync-compras.mjs',
} as const

export type TablaConAviso =
  | (typeof TABLAS_CON_AVISO)[number]
  | keyof typeof TABLAS_AVISADAS_POR_SINCRONIZADOR
