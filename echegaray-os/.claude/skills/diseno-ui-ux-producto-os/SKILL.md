---
name: diseno-ui-ux-producto-os
description: "Contrato OBLIGATORIO de diseño de interfaz del Business OS de Echegaray: identidad de marca medida del logo real (grafito #30302F + amarillo #FDC900), las 25 reglas visuales estrictas del dueño, y el sistema de producto tomado de Asana (estructura), Figma (interacción), Autodesk Construction Cloud (la obra como workspace) y la lógica de software constructor. Activar SIEMPRE antes de crear o modificar cualquier pantalla, componente o token visual de app.ecsas.com.ar. No decide QUÉ dato mostrar —eso lo deciden las skills de dominio—: decide cómo se ve, cómo se usa, y verifica el resultado con un navegador real."
allowed-tools: Read, Bash, Edit, Write, Grep, Glob, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  area: "Producto y Diseño"
---

# Diseño de UI/UX del Business OS

## Propósito

Que **ninguna pantalla del OS se dé por terminada** hasta que respeta la identidad real de Echegaray
y las reglas visuales del dueño. Existe porque el estándar no puede depender de que alguien lo
recuerde pantalla por pantalla: el acento del OS fue durante meses un navy `#10233a` que el propio
código declaraba como *"identidad Echegaray"* sin que nadie hubiera abierto el logo.

No reemplaza a `web-ux-deploy-operacion-producto` (el cómo se construye y despliega la web) ni a las
skills de dominio (qué dato es correcto). Las orquesta y agrega lo que faltaba: la marca medida, las
reglas del dueño, y la disciplina de mirar el resultado.

## Cuándo se activa (siempre)

Antes de crear o tocar una pantalla, un componente compartido, un token de color, el header, una
tabla o un formulario de `app.ecsas.com.ar`. No hay "cambio chico de estilo" que la saltee.

---

## 1 · LA MARCA — MEDIDA, NO ELEGIDA

Los dos colores salen de **contar los píxeles del logo oficial** (Drive · carpeta "logo y colores de
la empresa" · `Logo sin fondo.png`, 578×432):

| color | hex | píxeles opacos | qué es en el logo |
|---|---|---|---|
| grafito | `#30302F` | **37,4%** | el logotipo y las barras oscuras |
| amarillo | `#FDC900` | **37,2%** | las barras del isotipo |

Son **dos y están al 50%**. No hay un tercero, y no se inventa uno.

### El amarillo NO es el color de acción — y es una decisión, no un gusto

`#FDC900` sobre blanco da **1,6:1**. El mínimo WCAG AA es 4,5:1 para texto y 3:1 para un control. Un
botón primario amarillo con texto encima es ilegible; con texto oscuro se convierte en un cartel de
advertencia y choca con `--os-warn`, que ya significa problema.

- **GRAFITO = acción y jerarquía.** `--os-accent`. Es el color del logotipo: la estructura.
- **AMARILLO = marca.** `--os-marca`. El isotipo, y una regla fina que dice "acá estás". Poco y en
  un solo lugar, igual que en el logo: una señal, no un fondo. **Nunca** como estado ni como fondo
  de un control con texto.

### El isotipo no se redibuja

Se usa el archivo del dueño (`public/marca/isotipo.png`, con transparencia real). Una marca
redibujada a ojo es una marca distinta.

### Los tokens viven UNA vez

`src/app/globals.css` (`:root`) → `tailwind.config.ts` → las clases (`bg-canvas`, `text-ink`,
`border-line`, `border-marca`, `shadow-card`). **Ningún hex suelto en un componente.** Si aparece un
color, salió de un token.

---

## 2 · LAS 25 REGLAS VISUALES ESTRICTAS (del dueño, verbatim)

Ancho útil consistente · grid de 8px · espaciado generoso pero no desperdiciado · **máximo 2 niveles
visuales de navegación simultáneos** · tipografía sobria · títulos claros · texto secundario
realmente secundario · bordes suaves · **casi ninguna sombra** · **un único color de énfasis
principal** · rojo/naranja **sólo** para problemas · verde **sólo** para estado positivo · tablas
compactas · números alineados · formatos monetarios consistentes · acciones primarias evidentes ·
acciones secundarias discretas · estados hover/focus claros · skeleton/loading limpio · empty states
cortos · **no párrafos explicativos permanentes** · **no tarjetas por cada dato** · no iconografía
decorativa · **no gradientes** · **no "dashboarditis"**.

> *"No imitar la UI de un banco. Quiero software operativo moderno, sobrio y extremadamente claro."*

Las cinco que más se violan en este repo, y cómo se miden:

1. **Grid de 8px** — toda altura, padding y gap es múltiplo de 4 (medio paso) u 8. El header mide
   `h-12` = 48px = 6 pasos. Un `py-[7px]` sólo se admite cuando compensa un borde de 1px.
2. **No párrafos explicativos permanentes** — la trazabilidad va bajo demanda, no clavada bajo cada
   número. `Sin presupuesto` es mejor que tres líneas diciendo técnicamente por qué.
3. **No tarjetas por cada dato** — una fila de KPIs no son seis cards con sombra: es una fila de
   valores con su rótulo chico arriba, separados por aire.
4. **Máximo 2 niveles de navegación** — área (global) + solapa de la entidad. Un tercer nivel
   simultáneo obliga a decodificar antes de leer.
5. **Un único énfasis** — el acento es el grafito. Nada más compite.

---

## 3 · EL SISTEMA DE PRODUCTO — CUATRO REFERENCIAS, NINGUNA COPIADA

> *"No copies branding ni estética literalmente."* Se toma la LÓGICA, no el aspecto.

### ASANA — estructura y navegación
Navegación simple · jerarquía clara · **el contenido es el protagonista** · acciones secundarias
discretas · **edición sin abandonar el contexto** · estados vacíos útiles · densidad suficiente para
trabajar. → En el OS: el header es andamiaje de 48px; la tabla es la pantalla. Una acción secundaria
es texto, no un botón.

### FIGMA — interacción
Controles contextuales · **acciones cerca del objeto** · **panel lateral para editar entidades
complejas** · no navegar a otra página para un cambio simple · feedback inmediato · **la interfaz no
se mueve mientras se trabaja**. → En el OS: click en una actividad del Gantt abre un panel lateral,
nunca un formulario gigante debajo que empuje el cuadro.

### AUTODESK CONSTRUCTION CLOUD — la obra
**La obra es un workspace** · planificación visual · Gantt profesional · la planificación y la
ejecución se ven relacionadas · tablas operativas densas · **navegación interna de la obra
persistente**. → En el OS: dentro de una obra no se vuelve al header global para moverse; el nombre
de la obra y su cliente quedan como contexto fijo.

### LÓGICA DE SOFTWARE CONSTRUCTOR
La **obra** es la unidad central y todo cuelga de ella por `obra_id`: proveedores, compras,
subcontratos, personal, certificación, documentación, costos. → En el OS: ninguna entidad nueva se
crea sin su relación a la obra.

---

## 4 · PROTOCOLO (no negociable)

**A. Entender** qué decisión soporta la pantalla y quién la usa. Una pantalla existe para que
alguien decida o cargue algo, no para mostrar.
**B. Reutilizar** antes que crear: `PageShell`, `Card`, `Badge`, `StatTile`, `FormAccion`,
`SegmentedControl`, `Callout` ya existen en `src/shared/components/ui/`.
**C. Implementar** con tokens, nunca con hex. Grid de 8. Densidad de tabla.
**D. MIRAR EL RESULTADO** con un navegador real, autenticado y por rol —el agente `qa-visual`— y en
390px. Un typecheck no ve un layout roto.
**E. Medir** lo que se puede medir: ancho de desplazamiento, alto del header, contraste.

### Lo que se mide solo

| Qué | Cómo |
|---|---|
| La página no se desplaza de costado en 390px | `document.documentElement.scrollWidth <= window.innerWidth`, en `tests/shell-dos-areas.spec.ts` |
| El header sigue siendo de una línea | alto real ≤ 56px, mismo archivo |
| No volvió una categoría interna a la navegación | lista negra de rótulos, mismo archivo |
| Contraste de un par de colores | calcularlo, no estimarlo: WCAG AA 4,5:1 texto / 3:1 control |

## Prohibido

Un hex suelto en un componente · el amarillo como fondo de un control con texto · un gradiente · una
sombra que no sea `shadow-card` · una card por dato · un párrafo explicativo permanente bajo un
número · un tercer nivel de navegación simultáneo · redibujar el logo · dar una pantalla por buena
sin haberla mirado en un navegador autenticado y en 390px.

## Límites de certeza

No puede afirmar que una pantalla cumple sin haberla visto renderizada por rol: el tipo no ve el
layout. No decide qué dato mostrar ni de dónde sale — eso es de las skills de dominio y de la fuente
única en Postgres. No puede juzgar la marca más allá de lo medido: los dos colores salen de contar
píxeles del logo; cualquier tercero sería invención.

## Aprendizaje continuo

- **2026-08-18** — Nace la skill. El dueño mandó la carpeta de marca y pidió *"un skill de diseñador
  de ui/ux gráfico en todo el os"*. Al medir el logo apareció que el acento del OS (`#10233a`, navy)
  no tenía nada que ver con la empresa y estaba declarado en el código como "identidad Echegaray":
  un placeholder que se volvió verdad por repetición. Aprendizaje: **la identidad se mide del
  archivo oficial, no se elige**; y un color de marca con 1,6:1 de contraste es identidad, nunca
  acción. Clasificación: **E. regla operativa aprobada** (pedido explícito del dueño).
