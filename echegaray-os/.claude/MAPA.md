# MAPA — dónde vive cada cosa

**No se carga solo: se consulta.** Existe para que una tarea empiece abriendo el archivo correcto en
vez de recorrer el repo. Si algo de acá quedó viejo, se corrige acá mismo — es más barato que volver
a descubrirlo.

Escala: `src/features/` 25 dominios · `orquestador/lib/` 400 módulos · `orquestador/scripts/` 200
scripts · 14 timers en producción.

---

## De la tarea al archivo

| Si el pedido dice… | Empezá por |
|---|---|
| una pantalla de Administración | `src/app/(main)/administracion/<x>/page.tsx` + `src/features/administracion/{components,services}` |
| Compras, comprobantes, la carga por chat | `orquestador/comunicacion/comprobantes/` (flujo·tanda·accion·aplicar) + `orquestador/lib/comprobantes/` |
| escribir en la pestaña Compras | `orquestador/lib/carga-comprobantes.mjs` + `lib/comprobantes/contrato-columnas.mjs` (**el contrato A→AN vive ahí, con test**) |
| CAJA, las tarjetas, la escalera | `orquestador/lib/caja-*.mjs` (43 módulos) · el generador es `scripts/caja-pestana.mjs` |
| el libro canónico de movimientos | `orquestador/lib/libro-*.mjs` · las sumas del Sheet, `lib/libro-sumas.mjs` (`terminoLibro`) |
| banco, extracto, conciliación | `orquestador/lib/banco-*.mjs` · la puerta es `scripts/importar-banco.mjs` |
| cobranzas, certificados, portal del cliente | `src/features/clientes/` + `src/app/(portal)/` · sync en `scripts/portal-esquema-sync.mjs` |
| el bot, el Director, los especialistas | `orquestador/comunicacion/` · el WS es `mattermost-ws-consumer.mjs` |
| jornales, quincenas, UOCRA | `orquestador/scripts/jornales-pestana.mjs` (2.835 líneas — **leé el tramo, no el archivo**) |
| obras, avance, partes | `src/features/obras/` + `src/features/control-obras/` · grilla en `lib/obras-grilla.mjs` |
| permisos, roles, quién ve qué | `src/features/auth/` · y **la verdad final es RLS en Postgres**, no el front |

## Fuentes de verdad — cuál manda

| Concepto | Fuente | Nunca |
|---|---|---|
| saldo bancario | `_BANCO_RAW` (réplica del extracto) | pegar un número a mano |
| lo que se debe / se cobra | el libro `_MOVIMIENTOS` | recalcular en cada vista |
| compras | pestaña `Compras` → espejo `public.compra_sheet` (timer 1 h) | escribir Postgres y esperar que suba |
| proveedores | `public.proveedores`, identidad por **CUIT** | crear por nombre parecido |
| efectivo | el arqueo sellado + movimientos posteriores | inferir del Sheet |
| diseño de pantallas | los `.dc.html` del zip vigente | `COMPONENTS.md`, que pierde |

## Comandos

```bash
npm run typecheck                 # ~2 s
npx eslint .                      # ~33 s · 44 warnings preexistentes en orquestador/*.mjs, 0 errores
npm run orq:test                  # suite completa, reporter dot · UNA corrida por VM
npm run orq:test:detalle          # sólo si hace falta ver test por test (caro)
node --test <archivo.test.mjs>    # lo que se corre mientras se itera
node scripts/higiene-worktrees.mjs [--ejecutar]
```

`npm test` **no existe**: devuelve éxito en 0,16 s sin correr nada.

## Producción

14 timers y 7 servicios, todos `systemctl --user` (no de sistema). Los que más se tocan:

| unidad | qué hace |
|---|---|
| `echegaray-comunicacion-ws` | el bot @os por WebSocket |
| `echegaray-comunicacion-worker` | cola de tareas + vigía de fajos mudos (5 min) |
| `echegaray-flujo-caja.timer` | regenera el Sheet |
| `echegaray-compras-sync.timer` | Compras → `compra_sheet` (1 h) |
| `echegaray-comprobantes-web.timer` | cola de comprobantes de la web (1 min) |

**Los tres servicios del bot NO corren desde el árbol principal**: su `WorkingDirectory` es
`.claude/worktrees/deploy-comunicacion/echegaray-os`, rama `deploy/comunicacion-protegido`.
Desplegar el bot es `git -C .claude/worktrees/deploy-comunicacion merge main` **y después**
reiniciar `comunicacion-worker`, `comunicacion-ws` y `asistencia-http`. Mergear a main y reiniciar
**no despliega nada** — el 25/08 esa rama estaba 312 commits atrás y el arreglo del bot nunca
llegó. La prueba de que el código nuevo está vivo es un dato del proceso (la línea de arranque del
worker enumera `fajos_mudos_ms`, que sólo existe en el código nuevo), no `is-active`.
`orq-worker` y `orq-interactive` sí corren del árbol principal: verificá `WorkingDirectory`.

## Trampas ya pagadas (no volver a descubrirlas)

- **El Sheet en es-AR**: una fórmula por API lleva `;`; un decimal con coma adentro de paréntesis se
  convierte en `;` y da `#ERROR!` — usar aritmética entera. El **formato** (`TEXT`, `numberFormat`) va
  en US.
- **Escribir en Google exige el OAuth del dueño** (`accessTokenFor('jorge@ecsas.com.ar')`); el cliente
  por `config` es sólo lectura y devuelve 403.
- **Nunca escribir en el Sheet desde un worktree** — ya borró una pestaña entera.
- **Nunca correr el pipeline "para probar"** — ya borró trabajo tres veces.
- **Un arrow o un `onClick` como prop en un Server Component** compila el typecheck y tumba la página
  en producción (React #419). Sólo `npm run build` lo atrapa.
- **`count: 'exact'` con RLS** recorre la tabla evaluando la policy fila por fila. Y una policy con
  `auth.uid()` suelto se evalúa por fila; envuelta en `(select auth.uid())` pasa a InitPlan.
- **La medición desde esta VM**: el resolver falla y suma hasta 1 s; para medir contra producción,
  `curl -4` o Chromium con `--host-resolver-rules`.

## Dónde queda el estado entre sesiones

- `.claude/estado/traspaso.md` — el traspaso, lo escribe `/traspaso` y lo lee el hook de arranque.
- `memoria automática` — lo aprendido de las correcciones del dueño; se carga sola.
- `docs/engineering/` — lecciones y DoD. **Son grandes** (hasta 14.600 tokens): leer la sección, no el
  archivo.
