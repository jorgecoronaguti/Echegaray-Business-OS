-- LOS PORTEROS RLS SE EVALÚAN POR CONSULTA, NO POR FILA (22/08/2026 · overhaul UX).
--
-- Medido contra la base real como rol authenticated: obra_actividad_forecast tardaba 63,9 s
-- (0,7 s como superusuario) porque cada fila de registros_hh llamaba es_administracion() —una
-- consulta a perfiles— dos veces. Con los porteros envueltos en (select ...) el planificador los
-- convierte en InitPlan: una evaluación por consulta. La semántica es IDÉNTICA: las funciones son
-- STABLE y no dependen de la fila. Para ve_obra(col) —que sí depende de la fila— se anteponen
-- como InitPlans sus dos primeras ramas (es_administracion, jefe_obra), que son exactamente las
-- de su cuerpo: mismo resultado, sin la llamada por fila para los roles que operan la web.
--
-- Generada mecánicamente desde pg_policies por scratchpad/ux/generar-migracion-porteros.mjs.
-- ALTER POLICY no cambia roles ni cmd: sólo USING / WITH CHECK.

alter policy "acciones_insert" on public.acciones
  with check ((select ve_economia()));

alter policy "actualizacion_acciones" on public.acciones
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "eliminacion_acciones" on public.acciones
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "actividades_semanales_select" on public.actividades_semanales
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_canonica_id)));

alter policy "actualizacion_operacion" on public.actividades_semanales
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "borrado_operacion" on public.actividades_semanales
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "escritura_operacion" on public.actividades_semanales
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "adicionales_delete" on public.adicionales
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "adicionales_insert" on public.adicionales
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "adicionales_select" on public.adicionales
  using ((select ve_economia()));

alter policy "adicionales_update" on public.adicionales
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "analisis_escribe" on public.analisis
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "analisis_cuadrilla_escribe" on public.analisis_cuadrilla
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "analisis_linea_escribe" on public.analisis_linea
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "actualizacion_finanzas" on public.aplicaciones_pago
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "borrado_finanzas" on public.aplicaciones_pago
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "escritura_finanzas" on public.aplicaciones_pago
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "asistencia_marca_insert" on public.asistencia_marca
  with check (((select es_administracion()) OR ((persona_id = (select mi_persona_id())) AND (persona_id IS NOT NULL))));

alter policy "asistencia_marca_select" on public.asistencia_marca
  using (((select es_administracion()) OR (persona_id = (select mi_persona_id()))));

alter policy "asistencia_marca_update" on public.asistencia_marca
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "backlog_autonomo_select" on public.backlog_autonomo
  using ((select es_administracion()));

alter policy "backlog_autonomo_write" on public.backlog_autonomo
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "calendario_escribe" on public.calendario_no_laborable
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "carga_social_economia" on public.carga_social
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "categoria_obra_escribe" on public.categoria_obra
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "causa_desvio_escribe" on public.causa_desvio
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "certificados_delete" on public.certificados
  using ((select ve_economia()));

alter policy "certificados_insert" on public.certificados
  with check ((select ve_economia()));

alter policy "certificados_select" on public.certificados
  using ((select ve_economia()));

alter policy "certificados_update" on public.certificados
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "clasificaciones_costo_obra_write" on public.clasificaciones_costo_obra
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "cliente_contacto_delete" on public.cliente_contacto
  using ((select es_administracion()));

alter policy "cliente_contacto_insert" on public.cliente_contacto
  with check ((select es_administracion()));

alter policy "cliente_contacto_update" on public.cliente_contacto
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "cliente_documento_delete" on public.cliente_documento
  using ((select es_administracion()));

alter policy "cliente_documento_insert" on public.cliente_documento
  with check ((select es_administracion()));

alter policy "cliente_documento_update" on public.cliente_documento
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "cliente_nota_delete" on public.cliente_nota
  using (((select es_administracion()) AND (autor_id = (select auth.uid()))));

alter policy "cliente_nota_insert" on public.cliente_nota
  with check (((select es_administracion()) AND (autor_id = (select auth.uid()))));

alter policy "cliente_nota_update" on public.cliente_nota
  using (((select es_administracion()) AND (autor_id = (select auth.uid()))))
  with check (((select es_administracion()) AND (autor_id = (select auth.uid()))));

alter policy "clientes_delete" on public.clientes
  using ((select es_administracion()));

alter policy "clientes_insert" on public.clientes
  with check ((select es_administracion()));

alter policy "clientes_update" on public.clientes
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "cobranzas_write" on public.cobranzas
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "compras_write" on public.compras
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "comprobantes_arca_update" on public.comprobantes_arca
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "computo_economia" on public.computo
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "costos_reales_write" on public.costos_reales
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "cotizacion_partida_economia" on public.cotizacion_partida
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "cotizacion_composicion_economia" on public.cotizacion_partida_composicion
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "cotizaciones_delete" on public.cotizaciones
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "cotizaciones_insert" on public.cotizaciones
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'comercial'::text])));

alter policy "cotizaciones_select" on public.cotizaciones
  using ((select ve_economia()));

alter policy "cotizaciones_update" on public.cotizaciones
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'comercial'::text])));

alter policy "cuadrilla_delete" on public.cuadrilla
  using ((select es_administracion()));

alter policy "cuadrilla_insert" on public.cuadrilla
  with check ((select es_administracion()));

alter policy "cuadrilla_update" on public.cuadrilla
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "cuadrilla_integrante_delete" on public.cuadrilla_integrante
  using ((select es_administracion()));

alter policy "cuadrilla_integrante_insert" on public.cuadrilla_integrante
  with check ((select es_administracion()));

alter policy "cuadrilla_integrante_update" on public.cuadrilla_integrante
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "actualizacion_finanzas" on public.cuentas_financieras
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "borrado_finanzas" on public.cuentas_financieras
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "escritura_finanzas" on public.cuentas_financieras
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "documentacion_legajo_delete" on public.documentacion_legajo
  using ((select es_administracion()));

alter policy "documentacion_legajo_insert" on public.documentacion_legajo
  with check ((select es_administracion()));

alter policy "documentacion_legajo_select" on public.documentacion_legajo
  using ((select es_administracion()));

alter policy "documentacion_legajo_update" on public.documentacion_legajo
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "documento_presentacion_insert" on public.documento_presentacion
  with check (((estado = 'en_revision'::text) AND ((select es_administracion()) OR ((persona_id = (select mi_persona_id())) AND (persona_id IS NOT NULL)))));

alter policy "documento_presentacion_select" on public.documento_presentacion
  using (((select es_administracion()) OR (persona_id = (select mi_persona_id()))));

alter policy "documento_presentacion_update" on public.documento_presentacion
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "drive_index_read" on public.drive_index
  using (((select ve_economia()) OR (drive_file_id IN ( SELECT drive_file_ids_vinculados() AS drive_file_ids_vinculados))));

alter policy "entidad_cambio_select" on public.entidad_cambio
  using ((select es_administracion()));

alter policy "equipos_write" on public.equipos
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "fuentes_datos_write" on public.fuentes_datos
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "herramientas_delete" on public.herramientas
  using ((select es_administracion()));

alter policy "herramientas_insert" on public.herramientas
  with check ((select es_administracion()));

alter policy "actualizacion_finanzas" on public.movimientos_caja
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "borrado_finanzas" on public.movimientos_caja
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "escritura_finanzas" on public.movimientos_caja
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "nc_delete" on public.no_conformidades
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "nc_insert" on public.no_conformidades
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "nc_update" on public.no_conformidades
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "actualizacion_finanzas" on public.obligaciones
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "borrado_finanzas" on public.obligaciones
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "escritura_finanzas" on public.obligaciones
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "obra_actividad_select" on public.obra_actividad
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)));

alter policy "obra_actividad_write" on public.obra_actividad
  using ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))))
  with check ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obra_actividad_nota_delete" on public.obra_actividad_nota
  using (((creado_por = (select auth.uid())) OR ((select current_rol()) = 'direccion'::text)));

alter policy "obra_actividad_nota_insert" on public.obra_actividad_nota
  with check ((((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) AND ((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)))));

alter policy "obra_actividad_nota_select" on public.obra_actividad_nota
  using (((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id))));

alter policy "obra_actividad_paso_select" on public.obra_actividad_paso
  using ((EXISTS ( SELECT 1
   FROM obra_actividad a
  WHERE ((a.id = obra_actividad_paso.actividad_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(a.obra_id))))));

alter policy "obra_actividad_paso_write" on public.obra_actividad_paso
  using ((EXISTS ( SELECT 1
   FROM obra_actividad a
  WHERE ((a.id = obra_actividad_paso.actividad_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(a.obra_id))))))
  with check ((EXISTS ( SELECT 1
   FROM obra_actividad a
  WHERE ((a.id = obra_actividad_paso.actividad_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(a.obra_id))))));

alter policy "obra_alias_delete" on public.obra_alias
  using ((select es_administracion()));

alter policy "obra_alias_insert" on public.obra_alias
  with check ((select es_administracion()));

alter policy "obra_alias_update" on public.obra_alias
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "obra_asignacion_select" on public.obra_asignacion
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)));

alter policy "obra_asignacion_write" on public.obra_asignacion
  using ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))))
  with check ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obra_canonica_delete" on public.obra_canonica
  using ((select es_administracion()));

alter policy "obra_canonica_insert" on public.obra_canonica
  with check ((select es_administracion()));

alter policy "obra_canonica_select" on public.obra_canonica
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(id)));

alter policy "obra_canonica_update" on public.obra_canonica
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "obra_dependencia_select" on public.obra_dependencia
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)));

alter policy "obra_dependencia_write" on public.obra_dependencia
  using ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))))
  with check ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obra_documento_delete" on public.obra_documento
  using ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obra_documento_insert" on public.obra_documento
  with check ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obra_documento_select" on public.obra_documento
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)));

alter policy "obra_documento_update" on public.obra_documento
  using ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))))
  with check ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obra_ejecucion_delete" on public.obra_ejecucion
  using (((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id))));

alter policy "obra_ejecucion_insert" on public.obra_ejecucion
  with check ((((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) AND ((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)))));

alter policy "obra_ejecucion_select" on public.obra_ejecucion
  using (((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id))));

alter policy "obra_ejecucion_update" on public.obra_ejecucion
  using (((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id))))
  with check (((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id))));

alter policy "obra_ejecucion_equipo_delete" on public.obra_ejecucion_equipo
  using (((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id))));

alter policy "obra_ejecucion_equipo_insert" on public.obra_ejecucion_equipo
  with check ((((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) AND ((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)))));

alter policy "obra_ejecucion_equipo_select" on public.obra_ejecucion_equipo
  using (((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id))));

alter policy "obra_restriccion_delete" on public.obra_restriccion
  using ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obra_restriccion_insert" on public.obra_restriccion
  with check ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) OR (((select current_rol()) = 'campo'::text) AND (COALESCE(estado, 'abierta'::text) = 'abierta'::text) AND (fecha_liberacion IS NULL) AND ((actividad_id IS NULL) OR (EXISTS ( SELECT 1
   FROM obra_actividad t
  WHERE ((t.id = obra_restriccion.actividad_id) AND (t.obra_id = obra_restriccion.obra_id)))))))));

alter policy "obra_restriccion_select" on public.obra_restriccion
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)));

alter policy "obra_restriccion_update" on public.obra_restriccion
  using ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))))
  with check ((((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)) AND ((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text]))));

alter policy "obras_delete" on public.obras
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "obras_insert" on public.obras
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "obras_update" on public.obras
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])));

alter policy "parametro_comercial_economia" on public.parametro_comercial
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "partidas_presupuesto_select" on public.partidas_presupuesto
  using ((select ve_economia()));

alter policy "partidas_presupuesto_write" on public.partidas_presupuesto
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "perfiles_update_propio" on public.perfiles
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

alter policy "periodo_hh_escribe" on public.periodo_hh
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "periodo_hh_lee" on public.periodo_hh
  using ((select es_administracion()));

alter policy "persona_externa_por_obra" on public.persona_externa
  using ((EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = persona_externa.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id))))))
  with check ((EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = persona_externa.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id))))));

alter policy "personas_delete" on public.personas
  using ((select es_administracion()));

alter policy "personas_insert" on public.personas
  with check ((select es_administracion()));

alter policy "personas_select" on public.personas
  using (((select es_administracion()) OR (EXISTS ( SELECT 1
   FROM obra_asignacion oa
  WHERE ((oa.persona_id = personas.id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(oa.obra_id))))) OR (EXISTS ( SELECT 1
   FROM registros_hh h
  WHERE ((h.persona_id = personas.id) AND (h.obra_canonica_id IS NOT NULL) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(h.obra_canonica_id)))))));

alter policy "personas_update" on public.personas
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "plantilla_paso_escribe" on public.plantilla_paso
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "plantilla_escribe" on public.plantilla_secuencia
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "post_mortems_write" on public.post_mortems
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "preguntas_negocio_write" on public.preguntas_negocio
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "presupuestos_select" on public.presupuestos
  using ((select es_administracion()));

alter policy "presupuestos_write" on public.presupuestos
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "proveedor_alias_delete" on public.proveedor_alias
  using ((select es_administracion()));

alter policy "proveedor_alias_insert" on public.proveedor_alias
  with check ((select es_administracion()));

alter policy "proveedor_alias_select" on public.proveedor_alias
  using ((select es_administracion()));

alter policy "proveedor_alias_update" on public.proveedor_alias
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "proveedores_delete" on public.proveedores
  using ((select es_administracion()));

alter policy "proveedores_insert" on public.proveedores
  with check ((select es_administracion()));

alter policy "proveedores_update" on public.proveedores
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "recibo_empleado_insert" on public.recibo_empleado
  with check ((select ve_economia()));

alter policy "recibo_empleado_select" on public.recibo_empleado
  using (((select ve_economia()) OR (persona_id = (select mi_persona_id()))));

alter policy "recibo_empleado_update" on public.recibo_empleado
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "recomendacion_decision_economia" on public.recomendacion_decision
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "recurso_escribe" on public.recurso
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "recurso_precio_escribe" on public.recurso_precio
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "recurso_precio_lee" on public.recurso_precio
  using ((select ve_economia()));

alter policy "hh_delete_por_obra" on public.registros_hh
  using ((((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) AND ((select es_administracion()) OR ((obra_canonica_id IS NOT NULL) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_canonica_id))))));

alter policy "hh_insert_por_obra" on public.registros_hh
  with check ((((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) AND (obra_canonica_id IS NOT NULL) AND ((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_canonica_id)))));

alter policy "hh_select_por_obra" on public.registros_hh
  using (((select es_administracion()) OR ((persona_id IS NOT NULL) AND (persona_id = (select mi_persona_id())))));

alter policy "hh_update_por_obra" on public.registros_hh
  using ((((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) AND (obra_canonica_id IS NOT NULL) AND ((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_canonica_id)))))
  with check ((((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'jefe_obra'::text])) AND (obra_canonica_id IS NOT NULL) AND ((select es_administracion()) OR ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_canonica_id)))));

alter policy "rendimiento_escribe" on public.rendimiento_historico
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "escritura_direccion" on public.reportes_definiciones
  using (((select current_rol()) = 'direccion'::text))
  with check (((select current_rol()) = 'direccion'::text));

alter policy "actualizacion_gestion" on public.reportes_generados
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "generacion_roles_gestion" on public.reportes_generados
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text, 'operaciones'::text])));

alter policy "scorecard_dominios_write" on public.scorecard_dominios
  using (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])))
  with check (((select current_rol()) = ANY (ARRAY['direccion'::text, 'administracion'::text])));

alter policy "solicitud_correccion_insert" on public.solicitud_correccion_asistencia
  with check (((estado = 'pendiente'::text) AND (resuelto_por IS NULL) AND (marca_id IS NULL) AND ((select es_administracion()) OR ((persona_id = (select mi_persona_id())) AND (persona_id IS NOT NULL)))));

alter policy "solicitud_correccion_select" on public.solicitud_correccion_asistencia
  using (((select es_administracion()) OR (persona_id = (select mi_persona_id()))));

alter policy "solicitud_correccion_update" on public.solicitud_correccion_asistencia
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "subcontrato_por_obra" on public.subcontrato
  using (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)))
  with check (((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(obra_id)));

alter policy "subcontrato_alcance_por_obra" on public.subcontrato_alcance
  using ((EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = subcontrato_alcance.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id))))))
  with check ((EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = subcontrato_alcance.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id))))));

alter policy "subcontrato_aporte_por_obra" on public.subcontrato_aporte
  using ((EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = subcontrato_aporte.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id))))))
  with check ((EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = subcontrato_aporte.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id))))));

alter policy "subcontrato_documento_escribe_admin" on public.subcontrato_documento
  using (((select es_administracion()) AND (EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = subcontrato_documento.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id)))))))
  with check (((select es_administracion()) AND (EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = subcontrato_documento.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id)))))));

alter policy "subcontrato_documento_lee_la_obra" on public.subcontrato_documento
  using ((EXISTS ( SELECT 1
   FROM subcontrato s
  WHERE ((s.id = subcontrato_documento.subcontrato_id) AND ((select es_administracion()) or (select current_rol()) = 'jefe_obra'::text or ve_obra(s.obra_id))))));

alter policy "tarea_tipo_escribe" on public.tarea_tipo
  using ((select es_administracion()))
  with check ((select es_administracion()));

alter policy "tipo_cambio_economia" on public.tipo_cambio
  using ((select ve_economia()))
  with check ((select ve_economia()));

alter policy "usuario_obra_delete" on public.usuario_obra
  using ((select ve_economia()));

alter policy "usuario_obra_insert" on public.usuario_obra
  with check ((select ve_economia()));

alter policy "usuario_obra_select" on public.usuario_obra
  using (((select ve_economia()) OR (usuario_id = (select auth.uid()))));

alter policy "usuario_obra_update" on public.usuario_obra
  using ((select ve_economia()))
  with check ((select ve_economia()));

