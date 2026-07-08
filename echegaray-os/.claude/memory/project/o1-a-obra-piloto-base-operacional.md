---
name: o1-a-obra-piloto-base-operacional
description: O1-A — selección de obra piloto y reconstrucción de la base operacional real (presupuesto, costos reales, HH, post-mortem) para San Francisco/IMOTOR. Pausado antes de O1-B (ciclo semanal) porque requiere una tabla nueva — pendiente de presentar diseño y aprobación.
metadata:
  type: project
---

Fecha: 2026-07-08. Ejecutado sobre [[arquitectura-fuentes-informacion]].

## Obra piloto: dos obras, un solo cliente, roles distintos

- **Galpones** (San Francisco/IMOTOR): obra **cerrada** (Fecha Fin Real 2026-07-03), con presupuesto, costos reales y HH reales completos en la fuente (`08_Control_Cliente SAN FRANCISC`, Ingresos y Egresos - P&L). Elegida para validar la **cadena retrospectiva completa** (presupuesto→costo real→HH real→desvío→margen→post-mortem) contra datos 100% reales.
- **Pisos** (mismo cliente, ya existía en Supabase desde PR0-B): obra recién iniciada, sin costos/HH reales todavía. Se le cargó presupuesto (monto y HH estimadas reales; costo directo **inferido** del markup objetivo 30%, no observado línea por línea). Queda como candidata natural para el ciclo semanal hacia adelante (O1-B), una vez se apruebe.

No se creó ninguna obra ni presupuesto sin evidencia real de respaldo.

## Cargado

- Obra `Galpones`: monto_contratado $204.361.103,70, fecha_inicio 2025-06-27, fecha_fin_objetivo 2026-01-30 (estimada original — se cumplió 5 meses tarde, dato real).
- `presupuestos` Galpones: monto $204.361.103,70, costo_directo $132.944.255,00, hh_estimada 14.441.
- `costos_reales` Galpones: 2 líneas agregadas (directos $162.140.329, indirectos $1.642.346,45) — sin desglose por proveedor/concepto disponible en la fuente, declarado como gap.
- `post_mortems` Galpones: `cerrado`, con causas_desvio/aprendizajes/acciones_recomendadas/cambios_sugeridos_cotizacion traducidos 1:1 desde el diagnóstico manual ya existente en Excel (no inventado).
- `presupuestos` Pisos: monto $47.590.271,50, hh_estimada 4.047, costo_directo **inferido** (documentado como tal).

## Validación real de las vistas existentes

`obra_resumen_economico` (PRP-005, construida sin haber visto datos reales todavía) reproduce **exactamente** el desvío que Jorge ya tenía calculado a mano: 23,20% de sobrecosto, margen_actualizado $40.578.428,25 — coincide al peso con el "Resultado Económico" del Excel. Primera prueba real de que el modelo del OS funciona antes de escalarlo.

## Gap real de esquema encontrado (no forzado)

`registros_hh.horas` es `numeric(6,2)` (tope ~9.999 hs) — diseñado a propósito para una carga **semanal**, no para un agregado de HH de toda una obra (17.206,62 hs de Galpones no entra ahí). Se decidió **no** forzar ese dato en `registros_hh` — quedó solo en el `resumen_snapshot` del post-mortem. Esto confirma que el grano semanal ya elegido para HH es el correcto; lo que falta es la captura hacia adelante (O1-B), no una corrección de esquema.

## Pausado antes de O1-B

El ciclo semanal (Lunes: plan; Viernes: avance real) requiere una entidad nueva (no existe ninguna tabla de "actividad semanal planificada" hoy) — es una modificación material del modelo de datos, así que se pausó para presentar el diseño antes de crearla, en vez de crearla en silencio. Ver conversación — el usuario redirigió la sesión hacia una auditoría de cobertura integral antes de continuar con esto.

## Grano operacional decidido (para cuando se retome O1-B)

**Actividad semanal en texto libre + personas asignadas + avance/tiempo** — no partida presupuestaria ni frente formal. Evidencia: el propio checklist manual de Galpones ya opera así ("MUROS INTERNOS - 4 DE 24M", 7 personas, 7 días), consistente con el diseño ya deliberado de `registros_hh` (texto libre, sin legajo/cuadrilla/tarea formal, PRP-008).

## HH real de Pisos cargada (OLA 0.2, Programa de Ejecución Continua, 2026-07-08)

Fuente: `JORNALES` (Sheet, hoja "Obreros 26"). Hallazgo clave: San Francisco/IMOTOR **no aparece con ese nombre** en JORNALES — el CLIENTE/OBRA ahí es literalmente **"JAVIER SANCHEZ"** (el contacto, no la razón social). Confirmado cruzando `obras.cliente_id` en Supabase antes de cargar nada — no se asumió por parecido de nombre.

Gap real de reconciliación encontrado (documentado, no resuelto): el Gantt real (`avance_obra.xlsx`) muestra avance físico semanal de Pisos con cuadrillas trabajando, pero JORNALES no siempre tiene el mismo conjunto de trabajadores registrados en las mismas fechas exactas bajo "JAVIER SANCHEZ" — 2 de 8 trabajadores (Bronia Rodrigo, Gonzalez Valentin) desaparecen de JORNALES a partir del 07-01 sin pasar a ninguna otra obra visible, y Navarro Matias se reasigna a "Bases de Tanque" (cliente Messinas) el mismo día. Quiroga Alexander pasa a licencia por enfermedad. Cargado como observado con huecos explícitos en `notas`, nunca inferido.

Cuidado de no confusión: existe una obra real distinta, no relacionada, llamada **"Cambio de Pisos - RRHH"** (cliente ARCOR, `fecha_inicio` también 2026-06-22) — coincidencia de nombre y fecha con nuestra obra piloto "Pisos", verificada como entidad separada antes de cargar cualquier dato.

19 filas insertadas en `registros_hh` (por trabajador, por semana): 412h semana 06-22 (completa, 8 trabajadores), 242h semana 06-29 (parcial, 4 de 8 continúan a julio), 27h semana 07-06 (parcial, semana en curso al 07-08). Total observado: **681h** sobre 4.047h estimadas del presupuesto (16,8% del total, no comparable todavía con el 58% de avance físico porque son bases distintas — total obra vs. 3 actividades cerradas).

Confirmado con esta carga: `ResumenProduccionEconomica.hhConsumidaObra` pasa de `sin_dato` a `observado` (681h) — pero `costoRealAcumulado`/`margenActualizado`/`desvioCosto` **no cambian**, porque HH y costo de mano de obra siguen deliberadamente separados (PRP-008) y no existe una conversión automática HH→costo. Backlog: si se quiere ver el impacto económico real de estas HH, hace falta cargar el costo de mano de obra correspondiente en `costos_reales` — no se inventó una tarifa para hacerlo automático.

También detectado (no accionado sin pedido explícito): el equipo de Pisos pasó de 8 trabajadores (semana 06-22) a 4 confirmados (semana 07-06) según JORNALES — podría ser reducción real de cuadrilla o simplemente datos de julio todavía no completos en la planilla. Queda como observación en el backlog autónomo, no como alerta generada automáticamente.
