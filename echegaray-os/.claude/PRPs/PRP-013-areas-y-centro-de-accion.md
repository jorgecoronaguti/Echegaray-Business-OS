# PRP-013: Arquitectura Operativa por Áreas + Centro de Acción

> **Estado**: CERRADA (primera versión usable)
> **Fecha**: 2026-07-07
> **Proyecto**: Echegaray Business OS
> **Fase**: II — Arquitectura Operativa por Áreas + Centro de Acción (abre después de cerrar la Etapa 4 / capacidades del negocio en PRP-012)

---

## Objetivo

Evolucionar el OS de un conjunto de capacidades accesibles solo desde la ficha de Obra a un sistema operativo usable por áreas de gestión, con un Centro de Acción que cruza todas las alertas ya calculadas y les da seguimiento (estado, responsable, resolución) — sin duplicar ningún cálculo de negocio ya existente.

## Revisión previa (sin discovery general)

Se revisaron las 12 capacidades anteriores, en particular el Dashboard de Dirección (PRP-011, "cero SQL nuevo, reutilizar lo que cada capacidad ya calcula") y Post Mortem (PRP-012, patrón de snapshot congelado). No se consultó Drive ni se hizo discovery nuevo — este incremento es de arquitectura de navegación y trazabilidad de acciones, no de un proceso de negocio nuevo sin modelar.

## 1. Arquitectura por áreas

Seis áreas mínimas, cada una mapeada a capacidades y datos ya existentes — ninguna requirió una tabla o vista nueva:

| Área | Usuario principal | Decisiones que mejora | Capacidades que consume | Datos necesarios | Queda fuera por ahora |
|---|---|---|---|---|---|
| **Dirección** | Dueño | Dónde intervenir hoy en toda la empresa | Dashboard (PRP-011, todas las capacidades) | Todo lo agregado por el Dashboard | Roles/permisos diferenciados (no hay auth de roles todavía) |
| **Obras / Producción** | Jefe de obra / dueño | Estado de cada obra, márgenes, adicionales, actividad | Obras (PRP-002), Control Económico (PRP-005), Adicionales (PRP-006) | `/obras` + ficha de obra existente | Planificación semanal de tareas (Daily Meeting no migrado) |
| **Administración y Finanzas** | Administración | Qué pagar, qué cobrar, qué vence | Obligaciones (PRP-010), Ejecución Financiera (PRP-007), Caja (PRP-001) | Vistas cross-obra ya existentes | Conciliación automática con Cash Flow/Control de Gastos actuales |
| **Compras y Abastecimiento** | Comprador / jefe de obra | Qué comprar urgente, qué proveedor da problemas | Compras (PRP-009) | `getComprasTodasLasObras` (ya existía) | Módulo de cheques/echeqs como instrumento (no confirmado con datos reales) |
| **Personas y Productividad** | Dueño / administración | Dónde hay desvío de HH | HH y Productividad (PRP-008) | `getHHResumenTodasLasObras` (ya existía) | RRHH, liquidación de sueldos, asistencia (deliberadamente fuera desde PRP-008) |
| **Comercial / Presupuestación** | Dueño / quien cotiza | Qué aprender para la próxima cotización | Presupuestos (PRP-003), Post Mortem (PRP-012) | Presupuestos + `cambios_sugeridos_cotizacion` de post mortems cerrados | Sin alertas propias todavía — no existe una regla de negocio de cotización automatizada; es un área de consulta, no de intervención diaria, por ahora |

**Áreas futuras, solo documentadas (sin código, ninguna tabla, ningún menú)**: Seguridad/Higiene/ART, Calidad, Contratos y Documentación, Equipos/Vehículos/Herramientas, Subcontratistas, Fiscal/Contable. No se creó ningún ítem de navegación ni placeholder para ellas — un menú que lleva a una pantalla vacía sería exactamente el "menú vacío" que la regla de esta fase prohíbe. Quedan listas para activarse cuando exista un caso de uso real, siguiendo el mismo patrón (área → capacidades existentes → alertas → Centro de Acción).

## 2. Decisión de arquitectura del Centro de Acción

**Pregunta central**: ¿cómo dar seguimiento de estado/responsable/resolución a algo que no vive en ninguna tabla (las alertas se calculan en TypeScript puro, en vivo, en cada request)?

**Decisión: una tabla nueva y mínima, `acciones`**, justificada exactamente por la razón que pedía el brief — se necesita **estado, responsable y resolución persistentes**, algo que ningún cálculo derivado puede dar (una alerta recalculada no "recuerda" que ya se decidió posponerla).

Diseño:
- **`origen`**: `'manual'` (creada directamente por el usuario) o `'sistema'` (generada al convertir una alerta ya calculada).
- **`alerta_origen_id`**: el `id` estable que `AlertaDashboard` ya tenía desde el Dashboard (PRP-011, ej. `ob-vencida-<uuid>`) — se usa solo para trazabilidad y para evitar duplicados (índice único parcial). El CHECK `acciones_origen_sistema_check` obliga a que toda acción de origen `'sistema'` tenga este id.
- **Contenido copiado una única vez, no referencia viva**: al convertir una alerta en acción, se copian `titulo`/`causa`/`severidad`/`monto`/`fecha_limite`/`contraparte`/`obra_id` en el momento de la creación — mismo patrón que el snapshot congelado de Post Mortem (PRP-012). Es necesario: una acción "Resuelta" debe seguir siendo legible después de que la condición que la originó desaparezca (ej. la obligación ya se pagó y la alerta ya no aparece más en la lista viva). Esto **no es duplicar el cálculo de la alerta** — la lógica que decide si algo es una alerta y qué severidad tiene sigue viviendo exclusivamente en cada capacidad de origen; acá solo se persiste el texto ya calculado, una vez.
- **`estado`**: `pendiente` / `en_curso` / `resuelta` / `descartada`, con `CHECK acciones_resolucion_check` que exige `fecha_resolucion` cuando el estado es `resuelta` o `descartada` (mismo patrón de constraint condicional que Post Mortem).
- **`area`**: una de las 6 áreas — para acciones de sistema se deriva de la `categoria` de la alerta vía un mapeo puro (`AREA_POR_CATEGORIA`, en `features/areas/types`), no se pide al usuario.
- **`responsable`**, **`fecha_limite`**: texto libre / fecha, ambos opcionales — no existe todavía una tabla de usuarios/roles internos (ver PRP-001, feature `add-login` latente), así que forzar una FK a un usuario sería fabricar una entidad que no existe.

**Descartado explícitamente:**
- Guardar la alerta completa (incluyendo lógica de recálculo) en la tabla — la lógica de negocio sigue viviendo en cada capacidad; la tabla es puro seguimiento operativo.
- Una tabla de "alertas" separada de "acciones" — hubiera duplicado el `AlertaDashboard` ya calculado en TypeScript. El Centro de Acción muestra las alertas en vivo (reutilizando `construirAlertasDashboard`, cero cambios) y solo persiste la decisión de convertir una en acción.
- FK a un usuario/responsable real — no existe esa entidad todavía; `responsable` es texto libre, documentado como límite.
- Vista SQL para el Centro de Acción — no hace falta: `getAcciones` es una tabla simple sin agregación, y las alertas se siguen calculando 100% en TypeScript.

## 3. Modelo de datos

```sql
create table acciones (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('manual', 'sistema')),
  titulo text not null,
  causa text,
  area text not null check (area in (
    'direccion', 'obras_produccion', 'administracion_finanzas',
    'compras_abastecimiento', 'personas_productividad', 'comercial_presupuestacion'
  )),
  categoria_alerta text,
  alerta_origen_id text,
  severidad text check (severidad in ('critica', 'alta', 'media', 'informativa')),
  obra_id uuid references obras(id) on delete set null,
  contraparte text,
  monto numeric,
  fecha_limite date,
  responsable text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'resuelta', 'descartada')),
  resolucion_notas text,
  fecha_resolucion date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acciones_resolucion_check check (
    estado in ('pendiente', 'en_curso') or (estado in ('resuelta', 'descartada') and fecha_resolucion is not null)
  ),
  constraint acciones_origen_sistema_check check (
    origen = 'manual' or alerta_origen_id is not null
  )
);

create unique index acciones_alerta_origen_unique on acciones (alerta_origen_id) where alerta_origen_id is not null;
```

RLS/GRANT: mismo patrón `authenticated_full_access` que toda tabla anterior (documentado en `get_advisors` como el mismo WARN "policy always true" que ya tienen las otras 16 tablas del proyecto — no es un hallazgo nuevo).

---

## Validación contra Supabase real

- Migración `20260707131807_acciones_centro_de_accion.sql` aplicada vía MCP.
- Acción manual válida: aceptada.
- Acción `origen='sistema'` sin `alerta_origen_id`: rechazada por `acciones_origen_sistema_check`.
- Acción `origen='sistema'` con `alerta_origen_id` y área inválida: rechazada por el `CHECK` de `area` (confirma que no se puede usar el nombre de una categoría de alerta como si fuera un área).
- Acción `origen='sistema'` con área válida: aceptada.
- Segunda acción con el mismo `alerta_origen_id`: rechazada por el índice único (dedupe confirmado).
- `UPDATE estado='resuelta'` sin `fecha_resolucion`: rechazado por `acciones_resolucion_check`.
- Mismo update con `fecha_resolucion`: aceptado.
- RLS: `anon` bloqueado (`permission denied`), `authenticated` operando correctamente.
- `get_advisors(security)`: sin hallazgos nuevos más allá del patrón ya conocido y aceptado en todas las tablas del proyecto.
- Datos `SMOKE TEST%` eliminados después de verificar.
- `tsc` / `build` / `lint` / **30 tests de Playwright** en verde (24 preexistentes + 6 nuevos).

---

## Implementación

- `src/features/areas/types/index.ts` — `AreaOS`, `AREA_LABEL`, `AREA_RUTA`, `AREA_POR_CATEGORIA` (mapeo puro categoría de alerta → área responsable), `alertasPorArea()`.
- `src/features/acciones/` — types (`Accion`, schemas Zod, `accionDesdeAlerta()`), service (`getAcciones`, `accionesPorAlertaOrigen`, `insertAccionManual`, `insertAccionDesdeAlerta`, `cambiarEstadoAccion`), actions (3 server actions), componentes (`AccionForm`, `ConvertirEnAccionForm`, `CambiarEstadoAccionForm`, `AccionesList`).
- `SeccionAlertas`/`AlertaCard` (Dashboard, PRP-011) extendidos con un prop opcional `accionesPorAlertaId` — si una alerta ya fue convertida en acción, muestra su estado en vez del botón "Convertir en acción". Reutilizado tal cual en el Dashboard y en las 4 páginas de área nuevas — cero lógica de alertas duplicada.
- Páginas nuevas: `/acciones` (Centro de Acción, con filtro por área y por estado), `/administracion`, `/compras`, `/personas`, `/comercial` — todas siguen el mismo patrón: `getDashboardDatosFuente` + `construirAlertasDashboard` (sin cambios) filtrado por área, más una tabla cross-obra con datos ya expuestos por cada capacidad (`getComprasTodasLasObras`, `getHHResumenTodasLasObras`, `getEjecucionFinancieraTodasLasObras`, y dos servicios nuevos y mínimos: `getPresupuestosTodasLasObras` y `getPostMortemsTodasLasObras`, mismo patrón "TodasLasObras" ya usado en 5 capacidades anteriores).
- `(main)/layout.tsx` — navegación real por las 6 áreas + Centro de Acción (antes era un comentario vacío `{/* Nav, Sidebar, etc. */}`).
- `/obras` y `/dashboard` actualizados para mostrar sus alertas de área con el botón de conversión a acción ya wireado.

---

## Gotchas
- [ ] `responsable` es texto libre, no una FK a un usuario — no existe tabla de usuarios/roles internos todavía (ver `add-login`, latente desde PRP-001).
- [ ] La asignación área↔categoría de alerta es una simplificación deliberada de 1 a 1 — en la realidad una alerta puede interesarle a más de un área (ej. un adicional sin cotizar también le importa a Administración). Se asignó al área con responsabilidad operativa primaria. Documentado, no oculto.
- [ ] Comercial/Presupuestación no genera alertas propias todavía — es un área de consulta. Si en el futuro se define una regla de negocio de cotización (ej. "presupuesto sin aprobar hace más de N días"), esa lógica debe vivir en `features/presupuestos/types` como un `calcularAlertasPresupuesto`, siguiendo el mismo patrón que toda otra capacidad — nunca fabricarla directamente en el Dashboard.
- [ ] Sin JWT real, no se pudo probar Playwright el flujo completo de crear/convertir/resolver una acción end-to-end (mismo límite de entorno documentado desde PRP-001).
- [ ] Sin notificaciones reales ni automatizaciones — explícitamente fuera de alcance de esta fase.

## Anti-patrones
- NO crear una tabla de "alertas" — las alertas siguen siendo 100% derivadas en TypeScript.
- NO fabricar un menú o ítem de navegación para las áreas futuras (Seguridad, Calidad, Contratos, Equipos, Subcontratistas, Fiscal) sin capacidad real detrás.
- NO forzar una FK de responsable a una tabla de usuarios que no existe.
- NO construir un ERP decorativo: cada página de área muestra únicamente datos y alertas que ya existían en alguna capacidad.

---

*Fase II (Arquitectura Operativa por Áreas + Centro de Acción): primera versión usable, CERRADA y validada contra Supabase real.*
