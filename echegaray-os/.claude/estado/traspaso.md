# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-15 ~11:00 (−03) · main = producción (253e7ce2)_

## 1. OBJETIVO GENERAL

Echegaray Business OS: app web (Next.js + Supabase), datos, motores determinísticos e IA para operar
Echegaray Construcciones. XSAS es la capa de inteligencia operativa. Claude Code sólo desarrolla.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado · Cash Flow percibido
- Evidencia antes que inferencia · FALTA_DATO / CONFLICTO explícitos · edición manual del dueño = verdad
- Nivel E = firma del dueño · nunca debilitar RLS · padrón: nunca alta/baja
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- Nadie cierra su propio trabajo (qa-visual / auditor) · responder al dueño por el bot (avisar-al-dueno.mjs)
- **Si un pedido grande se frena (agentes cortados), avisar al dueño en el momento** (15/09 preguntó 5 veces por la columna Obra)
- El dueño pidió «todo ahora, nada de esta noche»: DDL en horario sí, pero migración por migración y leyendo el efecto

## 3. ARQUITECTURA (lo que se usa seguido)

- Web: Vercel desde `main`. Backend: push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`.
- Probar como usuario: tx con `set local role authenticated` + `request.jwt.claims` (dueño 4677f284-d873-4531-9c8f-cc3dab56ffd0). **El ensayo como postgres NO ve errores de permisos** (así se cayó el CRM).
- Consultas: script en scratchpad que importa `orquestador/lib/db.mjs` (FK de líneas: `liquidacion_linea.liquidacion_id`).

## 4. CERRADO HOY (15/09) — EN PRODUCCIÓN, VERIFICADO EN LA BASE

Mañana: HH por obra (8f528000) · costo MO por obra (0800→0842, 0850, 0855) · quincenas históricas · celda vacía (186b3026) · jefes en todas las quincenas (f1051b3a) · Angel Fernandez subcontratista.

Tarde (main = 253e7ce2):
- **Tiempo real multiusuario** (4a7261d0 + 9d21e286): e2e 41/41 avisos; rol campo ya no reintenta cada 14 s (1 join rechazado, 0 reintentos en 60 s).
- **Plantel / cuadrilla / BAJA** (cbed5334; 0900, 0910 aplicadas): 10 personas del alta 01/09 → subcontrato «Gerson Castro – Messina» (id d51694a9, obra limpieza-de-escombros, confianza media vs messina-bsa); Q2-03 22 líneas $9.006.818, Aguirre $470.000; limpieza-de-escombros +1.266.227 (Q1-08) +1.266.555 (Q2-08), ES-ADM baja lo mismo.
- **Horas de un día anterior en la obra de ese día** (068dce4f): ventana de obra cerrada = fechas declaradas ∪ registros_hh ±16 días; e2e en producción sobre e2e0…0001 (fila leída con `web:correccion-horas`, borrada). 4 obras sin fechas ni horas no se ofrecen (galpones, le-galpon-7, le-cierre-perimetral, messina-bases-tanque-so2).
- **Quincena cerrada no se toca** (d981238f; **2130 aplicada**: trigger `registros_hh_periodo_cerrado` mira `liquidacion_quincena`; verificado como jefe: 17/08 rechazado, 08/09 pasa). Jefes mensuales («importe no cargado» sin pendiente); cuadro sin cabecera hereda; **finales no generan línea** (dueño: «no considerar»); 01–15/08 = 8.133.200 sellado.
- **Columna Obra** (44e1840d + c5ac81a0; **0700 aplicada**, 192 zz_avisar y ACL intactos, +1 policy de la cola): obra por fila en compra_sheet/cobranzas, `obra_celda_resolver` sólo rótulo exacto, app Compras con desplegable `OB-xxxx · nombre`, bot con la misma regla (worker reiniciado 10:47), lecturas del Sheet por encabezado. Auditor firmó el merge con límites; **la inserción real del Sheet NO está firmada** (ver §5).
- **Identificadores desde Supabase** (57704200): ficha cliente sin slug («Obra: OB-0008 · …»), Proveedores/Usuarios/alta/operación con código; QA visual OK en 6 pantallas.
- **Compras «Recién cargados» por fecha de carga** (253e7ce2): el reorden del 08/09 dejó 22 comprobantes del bot en filas 907–930 fuera del chip; ahora unión renglón ∪ 14 días por `compra_adjunto.subido_at`. Los 111 comprobantes del canal (30 días) están en Sheet, base y app.

## 4b. DECISIONES DEL DUEÑO 15/09

Jefes cobran por MES, no preguntar · liquidaciones finales «no considerar» · BAJA Q2-03 pagadas, Aguirre 470.000 · cuadrilla = subcontratista, costo a Messina, sin liq final · no parches manuales («hacé bien las cosas») · «todo ahora», DDL en horario migración por migración · identificador = código de obra de Supabase en todos lados (portal cliente nunca).

## 5. EN CURSO

- **Inserción de la columna Obra en el Sheet real** — agente en `fix/obra-desplegable-y-ensayo` (worktree obra-desplegable): (1) `_OBRAS_OS` + `setDataValidation` en Compras L4:L y Cobranzas H5:H (el script no creaba el desplegable); (2) modo `--copia <id>` y ensayo en una COPIA del archivo real («COPIA ENSAYO Obra 15-09 — borrar») comparando 22.861 fórmulas contra Google + validaciones/formato condicional/gráficos. Con 0 diferencias: merge → deploy → `scratchpad/ventana-insercion-obra.sh pausar|insertar_dry|insertar|pyl|reactivar` desde producción → aviso al dueño antes de insertar → propuesta de backfill (`obra-relleno-dry.mjs`) para OK del dueño → worker `compras-obra-cola` (systemd sin instalar).
- QA visual del chip «Recién cargados» en producción (253e7ce2).

## 6. RIESGOS / DEUDA DETECTADA

- Importadores sin sesión (`sheet:jornales`) siguen pudiendo reescribir quincenas cerradas (declarado en 2130): Aguero 105→107 h en 16–31/08 (+11.948 vs sello); el pie de una quincena cerrada recalcula en vez de mostrar el sello.
- Obras cerradas sin `fecha_fin_real` (la-estrella, arcor, le-galpon-8, le-mamposteria, messina) mantienen la ventana abierta hacia adelante; La Estrella se ofrece hoy. Cargarles fecha de fin.
- Filtro «Obra» de la lista de Compras usa texto del Sheet hasta el backfill; Usuarios a 390 px no muestra Alcance; tabla de compras del proveedor recortada a 390 px.
- Vigía de comprobantes: 114 rastros apuntan a otra fila desde el reorden del 08/09 (re-anclar por clave). Filas 918 (RSV) y 932 (Lliteras) sin papel ni fecha de carga.
- `obra_panel.monto_contratado` doble cuenta bsa-adicional (`CarteraObras.tsx:144`); Messina contratado 159,76 vs 185,63; Bases Tanque SO2 ¿corto 9,5 M?
- Rojos preexistentes en main: `CostoALaFecha.tsx:64` (ritmo-vertical), `canonico-definiciones` («cobrado»), `.pg.test.mjs` fuera de turno. 137 worktrees en `.claude/worktrees` → `node scripts/higiene-worktrees.mjs`.
- Stash ajeno en main (`stash@{0}` comprobantes/plausibilidad): NO popear; un `git stash pop` accidental hoy trajo conflictos (revertido con reset --hard).

## 7. PENDIENTES DEL DUEÑO

¿Cuadrilla Gerson Castro a limpieza-de-escombros o messina-bsa? · Bases Tanque SO2 contratado · fechas de fin de obras cerradas.

## 8. PRÓXIMO PASO

Cerrar la inserción del Sheet (§5) y el backfill con OK del dueño; después el filtro Obra de Compras por `obra_id`.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
