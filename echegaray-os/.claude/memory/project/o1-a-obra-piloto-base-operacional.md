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
