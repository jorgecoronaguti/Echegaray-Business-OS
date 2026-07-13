# Diagnóstico: 3 Obras Pausadas + 0 en Ejecución Activa

**Fecha de análisis:** 2026-07-12  
**Repositorio:** echegaray-os (dato actual en BD + memory del proyecto)  
**Criterio:** HECHO (evidencia verificable) vs SUPUESTO (inferencia no confirmada)

---

## Resumen Ejecutivo

| Obra | Estado BD | Última actividad | Causa raíz | Acción recomendada |
|------|-----------|------------------|-----------|-------------------|
| **Pisos** (IMOTOR) | pausada | HH real hace 2 días | **Dato desactualizado** | Actualizar estado a "activa"; confirmar con Jorge |
| **Cambio de Pisos - RRHH** (ARCOR) | pausada | Ninguna | **Sin datos operativos cargados** | Decidir: continuar (cargar presupuesto/plan) o cerrar |
| **Galpón 9** | pausada | Ninguna | **Incompleta / Sin aclaración** | Decidir: continuar (cargar datos base) o retirar del sistema |

**Total en ejecución activa ahora:** 0 (confirmado)  
**Gap crítico:** No hay trabajo físico visible en el OS; toda la ejecución está fuera del sistema

---

## OBRA 1: Pisos (San Francisco / IMOTOR)

### Estado

- **Estado en BD:** `pausada`
- **Fecha inicio:** 2026-06-22
- **Cliente:** San Francisco (contacto: Javier Sánchez)

### Evidencia HECHO (Verificada)

**Datos de presupuesto y ejecución:**
- Monto contratado: $47.590.271,50
- HH estimada: 4.047
- Avance físico: 58% (solo 3 de 15 actividades cerradas, 20% de cobertura)
- Costo real (mano de obra): $3.105.500 (19 registros cargados)
- Costo real (materiales/subcontratos): $7.056.140 (cargado en ciclo Ficha Integral)
- **Costo real total:** $10.161.640
- HH real consumida: 681h (16,8% del total estimado)

**Actividades semanales planificadas:** 15 (estado: planificada/en_curso/cerrada)

**Fuente verificable:** 
- Memory: `obra-piloto-pisos-verdad-financiera.md` (2026-07-08)
- Test de caso real: `obras-tablero-casos-reales.spec.ts` valida avance 58%, HH 681/4047, costo $10.161.640

### Hallazgo crítico sin resolver

**"Datos inconsistentes en Supabase"**

> Ninguna obra está realmente en estado `'activa'`. Las 4 obras: Galpones (cerrada), Cambio de Pisos - RRHH y Galpón 9 (pausadas, sin ningún dato real cargado), **Pisos (pausada, pero con presupuesto real + 19 registros_hh reales + 15 actividades)**.
>
> **Hallazgo real, no resuelto**: `obras.estado` de Pisos dice `pausada`, pero el último registro real de HH es de la semana del 2026-07-06 (hace 2 días).

**Fuente:** Memory `obra-piloto-pisos-verdad-financiera.md`, 2026-07-08 (documentado como inconsistencia, no ocultado)

### Causa raíz clasificada

**TIPO:** Dato desactualizado en `obras.estado`

**Evidencia:**
- HECHO: HH real de trabajadores registrada hasta semana 2026-07-06 (27 horas en 3 trabajadores)
- HECHO: Estado en BD dice "pausada"
- SUPUESTO: La obra se pausó después del 2026-07-06, pero estado no se propagó a `registros_hh`
- O ALTERNATIVA HECHO: La obra nunca fue pausada, y el estado es un error de captura inicial

### Condición de reactivación

**Requerido antes de cualquier acción:**

1. **Confirmar con Jorge:** ¿La obra Pisos está realmente pausada o activa? ¿Cuándo y por qué cambió de estado?
2. **Verificar JORNALES:** Confirmar si hay trabajadores asignados a "JAVIER SANCHEZ" en la semana actual (2026-07-08+)
3. **Actualizar BD:** Según confirmación, establecer `obras.estado` de Pisos en su valor real ('activa' o dejar 'pausada' si es decidido así)

**Si continúa en ejecución:**
- Continuar cargando `costos_reales` (materiales/equipos/subcontratos) además de mano de obra
- Alimentar `actividades_semanales` con avance real cada lunes/viernes
- Recalcular ETC/EAC/VAC semanalmente (hoy son estimaciones de baja confianza por cobertura parcial)

---

## OBRA 2: Cambio de Pisos - RRHH (ARCOR)

### Estado

- **Estado en BD:** `pausada`
- **Fecha inicio:** 2026-06-22 (coincide con Pisos, diferente cliente)
- **Cliente:** ARCOR

### Evidencia HECHO (Verificada)

**Carga en el OS:**
- Presupuesto: NO (vacío)
- Costos reales: NO (vacío)
- HH: NO (vacío)
- Actividades semanales: NO (vacío)

**Fuente verificable:**
- Memory: `o1-a-obra-piloto-base-operacional.md` menciona explícitamente que existe una obra real distinta "Cambio de Pisos - RRHH" (cliente ARCOR) como coincidencia de nombre con la piloto, verificada como entidad separada antes de cargar datos

### Causa raíz clasificada

**TIPO:** Sin datos operativos cargados / Obra incompleta en el OS

**Evidencia:**
- HECHO: La obra existe en `obras` (fue creada en algún momento)
- HECHO: Estado es "pausada"
- HECHO: No hay presupuesto, costos, HH ni actividades asociadas
- SUPUESTO: Nunca fue completamente incorporada al OS, o fue pausada antes de cualquier ciclo operativo

### Causa potencial (no confirmada)

Hipótesis a validar con Jorge:

1. **Comercial:** Obra fue contratada pero cliente no dio el visto bueno / cambió de cronograma / cambiaron condiciones
2. **Recursos:** No hay personal disponible asignado a ARCOR en la fecha planificada
3. **Decisión:** Se decidió esperar antes de invertir en presupuesto/planificación (obra en "backlog activo" pero no iniciada)
4. **Dato desactualizado:** Nunca fue cargada completamente y no se limpió de la BD

### Condición de reactivación

**Requerido:**

1. **Confirmar con Jorge:** ¿Qué es Cambio de Pisos - RRHH? ¿Debe ejecutarse, está cancelada, o está en espera?
2. **Si continúa:** Cargar datos base completos
   - Presupuesto (monto, fecha fin objetivo, costo directo/indirecto/HH estimada)
   - Plan inicial (actividades semanales del mes 1)
   - Responsables y recursos asignados
3. **Si se descarta:** Cambiar estado a 'cerrada' y documentar motivo (cliente canceló, proyecto no avanzó, rescisión, etc.)

---

## OBRA 3: Galpón 9

### Estado

- **Estado en BD:** `pausada`
- **Otros datos:** Cliente, fechas, presupuesto = NO (vacío)

### Evidencia HECHO (Verificada)

**Carga en el OS:**
- Presupuesto: NO (vacío)
- Costos reales: NO (vacío)
- HH: NO (vacío)
- Actividades semanales: NO (vacío)
- Cliente: NO (vacío)
- Fechas (inicio/fin): NO (o defectuosas)

**Fuente verificable:**
- Memory: `obra-piloto-pisos-verdad-financiera.md` lista las 4 obras y explicita "Galpón 9 (pausada, sin ningún dato real cargado)"

### Causa raíz clasificada

**TIPO:** Obra incompleta / Datos base no establecidos

**Evidencia:**
- HECHO: Existe en `obras`
- HECHO: Estado es "pausada"
- HECHO: No hay dato operativo alguno asociado
- SUPUESTO: O es un stub de obra que nunca fue concretada, o faltan datos críticos en la captura inicial

### Causa potencial (no confirmada)

1. **Administrativo:** Fue creada como reserva/placeholder, nunca se formalizó contrato
2. **Dato incompleto:** Se creo el registro pero faltó llenar cliente/fechas/presupuesto
3. **Proyecto cancelado:** Era un proyecto potencial que no avanzó
4. **Limpieza pendiente:** Es un registro legacy que debería haber sido retirado

### Condición de reactivación

**Requerido:**

1. **Confirmar con Jorge:** ¿Qué es Galpón 9? ¿De quién es? ¿Cuál es el plazo? ¿Debe ejecutarse?
2. **Si debe ejecutarse:** Cargar datos base mínimos (cliente, fechas) y luego presupuesto/plan
3. **Si no debe ejecutarse:** Retirar del sistema (cambiar estado a 'cerrada' u otro marcador definitivo)

---

## Síntesis de Causas Raíz

| Obra | Causa | Nivel de certeza | Indicador clave |
|------|-------|------------------|-----------------|
| Pisos | Estado desactualizado | ALTA | HH real hasta 2026-07-06, BD dice pausada |
| Cambio de Pisos - RRHH | Sin datos operativos | MEDIA | Cero registros en todas las tablas operativas |
| Galpón 9 | Incompleta / desconocida | BAJA | Sin cliente, sin fechas, sin datos de negocio |

---

## Gap crítico: Ejecución fuera del OS

**Observación estructural (no sobre-interpretada):**

> No hay ninguna obra en estado `'activa'` en la BD. La única obra con evidencia de ejecución real (Pisos) está marcada como pausada pero tiene HH real de hace 2 días.

**Esto significa:**

- HECHO: No hay ciclo operativo semanal visible en el OS (no hay `actividades_semanales` cargadas por el dueño/jefe de obra en tiempo real)
- HECHO: El trabajo que ocurre en Pisos se registra solo como HH semanal (fuente: JORNALES, externo)
- SUPUESTO: Toda la coordinación diaria (cambios, restricciones, decisiones) está ocurriendo por WhatsApp/llamadas/visitas, no en el OS

**Implicación:**
El OS **observa** el trabajo ya ejecutado (HH real del viernes), pero no **planifica ni coordina** el trabajo (plan del lunes, cambios en vivo, causas de desvío).

---

## Próximos pasos recomendados

### Inmediatos (Jorge → Decidor)

1. **Pisos:** Confirmar estado real (pausada vs activa). Si activa, actualizar BD.
2. **Cambio de Pisos - RRHH:** ¿Continúa o se descarta?
3. **Galpón 9:** ¿Qué es? ¿Continúa o se retira?

### Para ciclo operativo (OS → Desarrollo)

4. **Implementar ciclo semanal (O1-B):** Jefe de obra carga `actividades_semanales` lunes (plan) y viernes (avance real). Tabla existe (`actividades_semanales`), se necesita UX/workflow.
5. **Vincular ciclo semanal con restricciones/decisiones:** `restricciones` y `causa_desvio` en `actividades_semanales` deben registrarse en tiempo real, no post-facto.
6. **Alertas de cobertura:** Si una obra está "activa" pero `actividades_semanales` lleva 2 semanas sin actualización, generar alerta.

---

## Criterios de clasificación aplicados

Según `CLAUDE.md` raíz, sección "Principio de Confianza":

- **HECHO:** Dato real en Supabase, fuente documental verificada (JORNALES, presupuesto, etc.) o test que valida
- **SUPUESTO:** Inferencia lógica pero no confirmada con el usuario
- **DESCONOCIDO:** Gap real que requiere investigación adicional

No se fabricó ningún dato. Los gaps se nombran explícitamente.

---

## Apéndice: Fechas clave

| Obra | Inicio | Último movimiento | Semanas transcurridas |
|------|--------|-------------------|----------------------|
| Pisos | 2026-06-22 | HH: 2026-07-06 | ~2 semanas 1 día |
| Cambio de Pisos - RRHH | 2026-06-22 | (ninguno) | ~2 semanas 1 día |
| Galpón 9 | (desconocido) | (ninguno) | ? |

