fecha: 2026-08-03 (tarde)

## OBJETIVO

Cerrar los cinco frentes en vuelo y dejar el OS operable: el Tesorero que el dueño ya rechazó tres
veces, la carga de comprobantes por Mattermost, los generadores atrasados que bloquean reactivar el
pipeline, y los rótulos de frescura.

**El freno de Sheets sigue puesto** y se levanta SÓLO por comando (`ORQ_SHEETS_DESCONGELAR="motivo"`),
nunca borrando la marca. `pestana-candado.mjs desbloquear` está PROHIBIDO por regla permanente en
`.claude/settings.json`; para los auto-candados existe `scripts/destrabar-auto.mjs`, que aborta ante
un candado del dueño y re-sella la firma al soltar.

## HECHO Y VERIFICADO HOY

- **Banco: $2.448.225,80 recuperados.** Faltaban 42 movimientos del 16/06 ("Acreditación fondo
  desempleo 05/2026"). Se detectó por aritmética: el impuesto al cheque de ese día se cobró sobre una
  base que los incluía. 86 movimientos cargados, base de 239→325, hueco final $45.080 (anterior al
  28/05, sin extracto para cerrarlo).
- **Impuestos y Financieros**: sacado el plan previsional duplicado y corregida una sobredeclaración
  de **$8.578.426** — la fila "Deuda pendiente de los planes" era el total del año, no lo que falta.
- **Jornales**: filas 5-19 borradas, sueldos de Dirección $3M ×3 con inflación por mes DEVENGADO,
  UOCRA verificada, quincena en curso estimada Y real, y cabecera de "cuánto hay que pagar".
- **Cheque FÍSICO 223** marcado como debitado (canje interno del 20/07).
- **Defectos de núcleo, todos con test**: backoff de 429 que no cruzaba la ventana de cuota · el
  portón dejaba borrar filas pero no repararlas · `sellarFirma` NUNCA selló sobre pestañas con
  espacios en el nombre (de ahí 7 candados falsos) · TIR de 95.739.511.996% que mataba el análisis ·
  "no deber nada vencido" leído como "no pude mirar".
- **271 commits fuera de main**: rescatado el bloque de banco + 7 migraciones. Falta el resto.

## EN VUELO — cinco agentes

1. **Tesorero, tercera vuelta** (`a6b4b23295c605f3e`). El dueño rechazó el informe otra vez: no
   explica CÓMO llega al monto, y no contempla impuestos. Falta: derivación línea por línea con
   origen de cada término; impuesto al cheque 0,6% cada punta (1,2% del capital, se come media
   ganancia); IIBB e Ganancias; y persistir `tesoreria.recomendaciones`/`validaciones`, que están
   VACÍAS aunque el ciclo reporte propuestas.
2. **Visión del bot** (`a902c55b07fe2d829`). No lee la obra escrita a mano —que es donde está— y no
   detecta duplicados. ARCA (`public.comprobantes_arca`) resuelve las dos cosas.
3. **19 generadores atrasados** (`adb7b034f0f72db51`). Bloquea reactivar el pipeline.
4. **Las 5 de frescura** (`ac731b60d1406b397`), con OK explícito del dueño.

## DECISIONES DEL DUEÑO, VIGENTES

- "destraba y edita respetando lo mío siempre" → auto-candados sí, los suyos no. Compras queda
  candada: tiene una edición tipeada suya (`L758`).
- "todos los q estén en ese canal tienen q estar habilitados a cargar comprobantes".
- El saldo USD del Santander "sigue igual" — fecha actualizada al 03/08.
- Reactivar el pipeline: SÍ, pero DESPUÉS de poner los generadores al día. Correr
  `jornales-pestana.mjs` de main hoy le borra el bloque de Dirección.

## TRAMPAS NUEVAS, PAGADAS HOY

- **El bot corre desde el worktree `deploy-comunicacion`, no desde main.** Mergear a main no
  despliega nada. Costó media hora.
- **Mattermost manda el SLUG del canal, no el nombre visible**: "Comprobantes-gastos" viaja como
  `compras`.
- **`TEXT()` sobre un nombre de mes** ("Agosto") da error → `IFERROR` lo vuelve `""` → una escritura
  vacía la CONSERVA el cinturón anti-borrado, y la celda se queda con lo viejo.
- Una **celda combinada** no se puede pisar escribiéndole: `Jornales!C7` quedó con texto viejo por
  eso. Su número es correcto; la etiqueta miente.

## PRÓXIMO PASO

Cuando cierren los agentes: mergear a main, y **además al checkout `deploy-comunicacion`** para lo
que toque el bot, reiniciando `echegaray-comunicacion-ws` y `echegaray-comunicacion-worker`. Recién
con los generadores al día, reactivar el pipeline.
