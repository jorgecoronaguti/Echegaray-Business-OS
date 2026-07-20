# Inteligencia Organizacional — Echegaray Business OS

Plataforma de conocimiento operativo para las **8 áreas oficiales** del OS.

No es una carpeta de PDFs ni un chatbot: convierte conocimiento en comportamiento operativo que el
OS ya usa al trabajar.

## Las 8 áreas

Las claves son las de `public.area_canonica` y son **las mismas** que usa `public.acciones.area`.
Están en español porque así existían antes de esta capa — no se creó una taxonomía nueva.

| orden | clave | nombre |
|---|---|---|
| 1 | `compras` | Compras |
| 2 | `administracion_finanzas` | Administración y Finanzas |
| 3 | `obras` | Obras |
| 4 | `personas` | Personas |
| 5 | `contabilidad_legales` | Contabilidad y Legales |
| 6 | `comercial` | Comercial / Cotización |
| 7 | `calidad` | Calidad |
| 8 | `gestion_general` | Gestión General |

> **Divergencia declarada con el pedido original:** el prompt proponía claves en inglés
> (`purchases`, `administration_finance`…). Se descartaron: `acciones.area` ya usaba las
> castellanas y duplicarlas habría creado la séptima taxonomía incompatible del sistema.

## Arquitectura

**Capa 1 — núcleo compartido.** Una sola infraestructura: `area_canonica` + `area_alias` +
`norm_area()`. Cualquier texto de área/dominio legacy se resuelve al leer; **ninguna tabla de
origen se reescribe**. Para clasificar un valor nuevo se agrega un alias, no una migración de datos.
Mismo patrón que `obra_canonica`/`obra_alias`.

**Capa 2 — bibliotecas por área.** No hay tablas por área: cada pieza lleva su columna `area` y se
consulta por la vista `public.biblioteca_completa`, que une todo sin copiar una sola fila.

**Capa 3 — sistemas transversales.** Revisiones operativas, reuniones, casos de decisión con
evidencia y resultado, objetivos y aprendizajes.

## Modelo de datos

| tabla | qué guarda |
|---|---|
| `area_canonica` / `area_alias` | las 8 áreas y el resolver de textos legacy |
| `conocimiento_por_area` (vista) | conocimiento, fuentes, preguntas, madurez, reportes, pendientes, acciones |
| `knowledge_frameworks` | el criterio profesional (apunta a `.claude/skills/<n>/SKILL.md`) |
| `knowledge_playbooks` | qué hacer cuando pasa X, con disparador y aprobación |
| `knowledge_checklists` | control repetitivo con evidencia requerida |
| `knowledge_kpis` | indicadores; **`base_contable` obligatoria** |
| `knowledge_decision_rules` | condición → recomendación |
| `operating_reviews` / `operating_review_puntos` | esperado → real → causa → decisión → responsable → fecha |
| `operating_meeting_templates` | la cadencia y qué se corre antes de cada reunión |
| `organizational_decision_cases` / `_evidence` / `_outcomes` | decidir y después medir si salió bien |
| `organizational_lessons` | aprendizajes con clase A–E |
| `objetivos` / `objetivo_resultados` | objetivo → resultado clave → KPI |
| `biblioteca_completa` (vista) | todo lo anterior, por área |

RLS habilitada en todas.

## Reglas que el código hace cumplir

1. **P&L = devengado, Cash Flow = percibido.** Todo KPI declara su `base_contable`. Sin declararla
   no se muestra junto a otros.
2. **Un punto de review no está resuelto sin decisión + responsable + fecha.** Detectar no es decidir.
3. **Lo no cuantificado no es cero.** El impacto suma sólo lo que tiene monto; el resto se declara
   aparte ("14 sin cuantificar — es plata sin medir").
4. **Hechos y supuestos van separados** (`hechos_json` / `supuestos_json`).
5. **Un aprendizaje capturado solo nunca supera clase B.** Pasar a D/E exige validación humana.
6. **Un área vacía se muestra en cero, no se oculta.** El hueco es la información más accionable.
7. **No se siembra contenido inventado.** Playbooks, reglas y objetivos nacen vacíos y se llenan con
   casos reales: un catálogo ficticio sería citado por el OS como criterio de la empresa.

## Cómo se usa

**Claude Code / terminal** (0 API):
```bash
node orquestador/os.mjs biblioteca_area                                  # panorama de las 8
node orquestador/os.mjs biblioteca_area '{"area":"finanzas"}'            # una área
node orquestador/os.mjs operating_review '{"area":"administracion_finanzas"}'
node orquestador/scripts/seed-inteligencia-organizacional.mjs            # recarga el catálogo
```

**Chat** — `biblioteca_area`, `operating_review`, `decidir_punto_review`, `leer_review`. Además, si
el pedido nombra un área, el contexto recibe automáticamente lo que el OS ya sabe de ella.

**Web** — `/inteligencia`.

## Estado real (2026-07-20)

Verificado, no estimado:

- 6 de 7 tablas de conocimiento resuelven al 100% a un área. `backlog_autonomo`: 11 de 46
  clasificadas por su `origen_tabla`; **35 quedan sin área** porque no tienen origen rastreable y
  adivinarla por el título sería inventar un responsable.
- **Calidad**: 2 piezas. **Contabilidad y Legales** y **Comercial**: 0 afirmaciones confirmadas.
- **Gestión General** concentra 50 de las 57 afirmaciones: es un cajón, no un área.
- `playbooks`, `decision_rules`, `objetivos`, `decision_cases` están **vacías a propósito**.

## Lo que NO está implementado

- **pgvector, chunks, embeddings, búsqueda híbrida.** La extensión no está instalada. Con 207
  piezas la búsqueda semántica resuelve un problema de escala que el sistema no tiene todavía.
- **Ingestión de PDF/DOCX/XLSX y fuentes externas.** La infraestructura de fuentes existe
  (`fuentes_datos`, `drive_index` con 1.998 documentos), el pipeline de extracción no.

Ninguna de las dos se declaró como hecha. Se construyen cuando haya un caso real que las necesite.
