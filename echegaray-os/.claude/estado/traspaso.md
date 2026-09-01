fecha: 2026-09-01 (mañana)

## ESTADO

main = producción: `1fe02fed`, empujado, desplegado en la VM (worktree
`~/echegaray-os/produccion/echegaray-os`, gateway reiniciado y activo) y en Vercel.
**El freno de Sheets SIGUE PUESTO** y `echegaray-flujo-caja.timer` sigue parado. Nadie los tocó.

## CERRADO ESTA SESIÓN

- **`/xsas` VIVO en https://app.ecsas.com.ar/xsas** — pantalla conversacional sobre el `/api/xsas`
  que ya existía. Smoke E2E contra producción con sesión real: 3/3 verde. Traza visible por
  respuesta (capacidad usada + Reasoner SÍ/NO + motivo). Peaje web medido: ~360–430 ms sobre el
  gateway. Sin solapa en la navegación (los tests fijan las 3 del dueño): se entra por URL.
- **El registro del gateway pasó de 15 fábricas/37 tools a 48 fábricas/125 tools** (70 alcanzables).
  Drive lectura, Gmail, Calendar, compras, certificaciones, jornales, P&L, cobranzas etc. eran
  tools escritas y probadas que XSAS no conocía. 0 fábricas fallan, 0 claves duplicadas.
- **55 tools de escritura quedan en `sinFirma`**: el registro NO las expone hasta que el dueño las
  firme en `TOOLS_AUTORIZADAS_A_ESCRIBIR` (lib/xsas-permisos.mjs). Lo encontró la suite completa
  (control «ninguna tool de escritura alcanzable sin autorizar») y se cerró filtrando, no editando.
- **`reasoner_required_reason`** en `orq.xsas_requests` (migración APLICADA, CHECK probado):
  conjunto cerrado; FALLBACK/DEFAULT/UNKNOWN → SIN_JUSTIFICAR. El gateway declara la razón en las
  2 escalaciones. Métrica: `node orquestador/scripts/xsas-claude-zero.mjs` (baseline 27–28/08:
  91,9% claude-zero, US$0,1004 total de 10 escalaciones).
- **Atajos nuevos**: «qué vence esta semana»→caja.vencido (antes escalaba a haiku), «quién nos
  debe»→os.cobranzas. «¿qué podés hacer?» se contesta del registro filtrado por permisos, 0 tokens.
- CLAUDE.md: política de bajo consumo (sección 0 + auditoría por evidencia).

## LÍMITES DECLARADOS DE /xsas (no inventar PASS)

1. **Archivos NO entran por /xsas.** El motor determinístico existe (`comunicacion/archivos/
   flujo.mjs`, 0 modelo) pero está cableado a Mattermost; `adjuntos` del contrato no lo consume
   nadie. Es EL siguiente paso del P0.
2. **Escrituras** (Drive/Sheet/mail): bloqueadas hasta la firma del dueño (`sinFirma`, 55 tools).
   `slides.crear` medido: 15/15 pedidos error `sin_permiso`.
3. **Composición multi-capability y continuidad** («conciliá y actualizá», «seguí con esto»): el
   gateway resuelve UNA capacidad por pedido; no hay orquestación de workflows ni estado de tarea.
4. **Cotización/motores de las 3 ramas XSAS** (`drive-capability`, `motor-planilla`,
   `C-documentos`): SIN mergear, corregidas, SIN re-auditar. Igual que antes.
5. Suite completa corrida UNA vez: 1 falla (el control de escrituras) → corregida → tests del área
   14/14; la re-corrida completa la canceló el dueño.

## DECISIONES DEL DUEÑO PENDIENTES (sin cambios)

lg85/86/87 en personas · freno de Sheets · firma TOOLS_AUTORIZADAS_A_ESCRIBIR (ahora con la cola
exacta en `sinFirma`) · migración orq.drive_audit · 4 precios del catálogo · firma de recibos ·
dónde va la solapa /xsas en la navegación.

## SIGUE ABIERTO DE ANTES

Suite tarda >4 min (anomalía, no investigada) · servicios systemd en failed (arca-sync,
avance-sync, balanz-browser, flujo-caja) · los ítems económicos del traspaso anterior.
