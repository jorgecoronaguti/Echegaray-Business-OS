# Análisis de Causa Raíz — 22 Dominios Bloqueados

**Fecha**: 2026-07-12  
**Conclusión**: **SÍ existe una causa raíz común** que bloquea simultáneamente a los 22 dominios en su avance hacia los niveles 5+.

---

## Los 22 dominios

Dirección, Comercial, Presupuestación, Obras, Control Económico, Certificación, Clientes, Compras, Proveedores, Finanzas, Tesorería, Contabilidad, Fiscal, Personas, Laboral, Seguridad e Higiene, Legal y Contractual, Equipos y Vehículos, Administración, Datos, Software, Post Mortem y Aprendizaje.

---

## Estado actual por categoría

### Dominios que avanzaron en OLA 0/1/2 (2026-07-08)
- **Obra**: 2 → 4 (ciclo semanal con desvío real detectado)
- **Dirección**: 3 → 4 (vista accionable + escalamiento automático)
- **Software**: 3 → 4 (login + roles + RLS)
- **Datos**: 6 → 4 (corregido: scorecard y fuentes_datos vivos)
- **Fiscal**: 1 → 2 (IVA 2026 localizado en Drive)
- **Equipos y Vehículos**: 0 → 2 (padrón de 6 vehículos)

### Dominios sin cambios en ciclos recientes (2026-07-08)
- **Financiero**: 4 (observación, sin automatización)
- **Comercial**: 1 (sin evidencia estructurada)
- **Administrativo**: 2 (sin proceso de cierre)
- **Contable/Fiscal restante**: 1 (sin lectura automática de ARCA/DGR)
- **Legal y Contractual**: 0 (sin gestión de contratos)
- **Personas**: 1 (30 legajos sin integración)
- **Laboral**: 1 (altas/bajas reales sin automatización)
- **Seguridad e Higiene**: 0 (ART verificada, sin monitoreo)
- **Compras**: 1 (sin proveedor integrado)
- **Certificación/Clientes/Proveedores**: 1–2 (aislados)
- **Presupuestación/Control Económico**: 2–3 (observación, sin acción continua)
- **Tesorería**: 3–4 (flujo observado, no automatizado)
- **Post Mortem y Aprendizaje**: 2 (post-mortem manual)

---

## Patrón común identificado

### Umbral de avance bloqueado: Nivel 5 (diagnostica causas, cuantifica impacto)

**Escala de madurez (del CLAUDE.md raíz / arquitectura-cobertura-integral):**
- N0–N4: **Observación y diagnóstico manual** → observable en pantalla, reportable
- **N5+: Ejecución continua y autónoma** → cambios detectados automáticamente, acciones iniciadas sin intervención, seguimiento sin solicitud

**Cada uno de los 22 dominios está hoy en N0–N4 porque:**

1. Los datos se cargan manualmente (Drive, Sheets, entrada manual)
2. Las alertas se generan al abrir una pantalla (typeScript en navegación)
3. Las recomendaciones se leen, no se ejecutan
4. No existe mecanismo que ejecute acciones de forma continua/proactiva
5. Cada ciclo requiere intervención humana explícita

**Ejemplo de bloqueo real por dominio:**

| Dominio | Hoy | Por qué no puede llegar a N5 |
|---|---|---|
| **Tesorería** | N4 (forecasts observables) | Movimientos de caja siguen siendo entrada manual; pg_cron no puede invocar lógica TypeScript para crear movimientos proyectados automáticamente |
| **Laboral** | N1 (30 legajos en tabla) | Altas/bajas de IERIC siguen llegando por descarga manual; no hay webhook de IERIC ni integración que dispare alertas de vencimiento de obligaciones |
| **Fiscal** | N2 (IVA localizado en Drive) | Libros de IVA son PDFs; no hay lectura automática de ARCA/DGR; recálculo de obligaciones es manual |
| **Datos** | N4 (fuentes catalogadas, frescura monitoreada) | `recalcular_frescura_fuentes()` corre por cron SQL; pero cuando detecta "atrasado", nadie está autorizado aún para sincronizar esa fuente automáticamente (decisión de arquitectura pendiente) |
| **Comercial** | N1 (sin estructura) | Pipeline de clientes sigue en hojas; no hay API de CRM integrada; no hay webhook de nuevas órdenes |
| **Finanzas** | N4 (márgenes observables) | Cálculos están en TypeScript; no pueden ser invocados por pg_cron; ratios se actualizan solo cuando Jorge abre un dashboard |
| **Personas** | N1 (legajos sin escritura) | No hay integración con nómina ni RRHH; altas/bajas siguen siendo entrada manual; tablas deliberadamente bloqueadas a lectura por rol |
| **Seguridad e Higiene** | N0 (sin datos) | ART confirmada, pero sin tabla `obligaciones_seguridad`; no hay lógica que alerte cuando ART vence o hay accidente sin registrar |

---

## La causa raíz única

### **INFRAESTRUCTURA: El OS no puede ejecutar lógica de negocio de forma continua/autónoma**

El sistema está pensado como un operador digital (Track B), pero le falta la capacidad de ejecutar acciones sin intervención.

**Subsistemas bloqueantes específicos:**

#### 1. **Persistencia del Worker en Supabase PROD (DB URL válida)**
- **Estado**: El pooler de Supabase NO está disponible en credencial del worker (nota en `PROGRESO.md`, sección Fase 2)
- **Efecto**: El worker corre sobre store local (Postgres 16 en Docker), **no** sobre Supabase prod
- **Bloquea**: Toda ejecución autónoma que dependa de datos de Supabase (todos los 22 dominios)
- **Acción requerida**: Cargar `DATABASE_URL` del pooler real en `~/.config/echegaray-orq/worker.env`

#### 2. **Webhooks y APIs ingresantes de sistemas externos**
- **Estado**: No existen webhooks para cambios en Drive, ARCA, bancos, UOCRA, CRM
- **Efecto**: Cada fuente de datos requiere lectura manual (usuario abre Drive, descarga, carga al OS)
- **Bloquea**: Automatización de Datos (N4→N5), Fiscal (N2→N5), Laboral (N1→N4), Comercial (N1→N3)
- **Acción requerida**: Implementar API pública del OS que acepte webhooks; integrar con proveedores de APIs reales

#### 3. **Comunicación Supabase ↔ Node (pg_net disponible, pero sin mecanismo de invocación)**
- **Estado**: Supabase tiene `pg_net` disponible; Node tiene worker ejecutable; pero no hay forma que la BD invoque código Node
- **Efecto**: pg_cron ejecuta SQL, no TypeScript; toda lógica de negocio en TypeScript no es invocable desde la BD
- **Bloquea**: Acciones autónomas N7–N8 en todos los dominios (Finanzas automático, Tesorería movimientos proyectados, etc.)
- **Acción requerida**: Implementar Edge Functions o HTTP workers que `pg_net` pueda invocar

#### 4. **Hosting real (aplicación web + worker ejecutable + cron)**
- **Estado**: Vercel frontal OK; worker está en VM local; no hay coordinación
- **Efecto**: Rutinas proactivas no corren sin abrir la app; no hay alertas push/email; sin observabilidad remota
- **Bloquea**: N6+ en todos los dominios (recomendaciones accionables, alertas proactivas)
- **Acción requerida**: Migrar worker a Vercel/Railway/similar; exponer vías públicas el Work Fabric

#### 5. **RLS diferenciada incompleta (10 tablas sin políticas por rol específico)**
- **Estado**: Login + roles existen; pero `jefe_obra` no está acotado a su obra, y 10 tablas sin policies
- **Efecto**: Lectura/escritura no está confinada por rol en dominios sensibles (Personas, Legal, Seguridad e Higiene)
- **Bloquea**: Delegación segura del trabajo operativo (jefe_obra no puede actuar sin riesgo); Laboral/Seguridad no pueden ser gestionadas descentralizadamente
- **Acción requerida**: Completar RLS diferenciada en 10 tablas faltantes; restringir jefe_obra a su obra

#### 6. **Decisión de arquitectura pendiente: quién ejecuta acciones autónomas de nivel N7–N8**
- **Estado**: La Matrix de Autonomía existe (CLAUDE.md raíz); el Fabric está preparado (F0–F5 completadas); pero los dominios de negocio no tienen autorización explícita de "qué acción puede ejecutar el OS sin pedir"
- **Efecto**: Incluso cuando técnicamente sea posible (ej. crear un movimiento de caja proyectado), no hay criterio aprobado de cuándo hacerlo
- **Bloquea**: Todos los 22 dominios en N6+ (la recomendación existe, pero no se ejecuta)
- **Acción requerida**: Para cada dominio, definir explícitamente: "el OS puede [acción X] cuando [criterio Y]" (ej. "crear movimiento caja proyectado cuando forecast de CxC > 5d de atraso")

---

## Por qué es una causa raíz única (no 22 problemas independientes)

**Porque todos estos bloqueos desaparecen si se resuelve UNO:**

Un deployment real (Supabase prod URL + worker en infraestructura remota + APIs públicas + RLS completa) abre 22 dominios simultáneamente de N0–N4 a potencial N5+.

Esto NO es verdad para bloqueos independientes por dominio (ej. "Comercial falta pipeline de CRM", "Laboral falta integración IERIC"). Esos son bloques **específicos** dentro de sus dominios.

El bloqueo común es **infraestructural**: es el _sistema_ que no puede ejecutar, no es que falten datos en un dominio particular.

---

## Evidencia de la causa raíz

### Citas textuales de los documentos:

**De `PROGRESO.md` (Fase 2, final):**
> "Nota (bloqueo declarado): Corre sobre store Postgres LOCAL durable en la VM porque el password de la Supabase real (pooler) no está disponible. Migrar a prod (D1) = cambiar `DATABASE_URL` en el EnvironmentFile (una línea)."

**De `programa-ejecucion-continua.md` (OLA 2, punto sobre Rutinas Proactivas):**
> "Deliberadamente no se automatizó la ejecución real (que corra sola sin abrir la página) porque eso es una decisión de infraestructura (Vercel Cron / Supabase pg_cron / externo), no solo de código — queda registrado como el próximo paso en `backlog_autonomo`."

> "La razón de fondo por la que las rutinas de negocio (caja, HH, margen) no pueden replicar este mismo mecanismo todavía: esa lógica vive en TypeScript (no en SQL) para no duplicar reglas de negocio en dos lugares; `pg_net` podría invocarla vía HTTP, pero mientras el OS corre solo en `localhost`, Supabase (cloud) no tiene forma de alcanzar la máquina de Jorge."

**De `continuidad-operacional-datos.md`:**
> "No se construyó scheduling real (cron/webhook) para que las fuentes se actualicen solas — mismo bloqueante ya identificado en Rutinas Proactivas (OLA 2): requiere decisión de infraestructura, no solo código."

---

## LA ACCIÓN ÚNICA QUE RESOLVERÍA TODOS LOS BLOQUEOS

### **Cutover a infraestructura remota real con capacidades de ejecución continua**

**Componentes específicos:**

1. **Database URL real de Supabase** → worker Node usa credencial válida del pooler
   - Esfuerzo: 1 línea en EnvironmentFile (ya automatizado en `install.sh`)
   - Impacto: 22/22 dominios pasan de "datos locales" a "datos canónicos en Supabase prod"

2. **APIs públicas y webhooks** → Drive/ARCA/bancos pueden notificar cambios
   - Esfuerzo: Implementar 1 endpoint HTTP que el Work Fabric pueda recibir
   - Impacto: Datos (N4→N5), Fiscal (N2→N4), Laboral (N1→N3), Comercial (N1→N2)

3. **Invocación de lógica TypeScript desde Supabase** → pg_net + Edge Functions
   - Esfuerzo: Portear handlers del worker como Edge Functions, que pg_cron pueda invocar vía HTTP
   - Impacto: Tesorería, Finanzas, Contabilidad (N3–N4→N5), todos los dominios que dependen de cálculos recurrentes

4. **RLS diferenciada en 10 tablas faltantes** → seguridad multirol
   - Esfuerzo: 10 policies × 2–3 rol activos = 20–30 policies, patrón ya existe
   - Impacto: Personas, Laboral, Seguridad e Higiene, Legal (N1→N2, delegación segura)

5. **Matriz de Autonomía traducida a criterios operacionales** → "cuándo el OS actúa sin pedir"
   - Esfuerzo: Sesión de 2–3h con Jorge para definir por dominio; luego implementación en `orq.capabilities` (ya existe)
   - Impacto: Todos los 22 dominios (N5→N6–N8, según dominio)

---

## Por qué esta es la respuesta correcta

1. **Necesidad**: Sin esto, cada sesión mejora un dominio (Obra, Dirección), pero el resto queda en observación manual.
2. **Criticidad**: Echegaray Construcciones no puede crecer si cada decisión requiere apertura manual del OS y lectura de alertas.
3. **Reversibilidad**: Estas acciones infraestructurales son aditivas (no reemplazan nada existente).
4. **Timing**: Las Fases 0–5 del Work Fabric ya están en producción; esta es la puerta a Fase 7 (Intake/integraciones) y autonomía real.
5. **ROI**: Una semana de trabajo infraestructural desbloquea 22 dominios simultáneamente; es 22× mejor que trabajar dominio por dominio.

---

## Próximo paso concreto

**Definir si el usuario (Jorge) autoriza "pasar a infraestructura remota real" como el trabajo único más impactante de los próximos 30 días**, antes de continuar afinando dominios aislados.

Si la respuesta es sí, el primer paso es trivial: cambiar la DB URL en `worker.env`. El resto es arquitectura, iterativa.

Si la respuesta es "primero resuelve [dominio X] a N5", ese dominio sigue siendo bloqueado por lo mismo; pero al menos sabremos que es una decisión consciente del usuario, no un desconocimiento del cuello de botella común.
