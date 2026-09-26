# Medidor de fidelidad diseño → producción

Herramienta determinística (CERO llamadas a un LLM: ni Anthropic ni ningún otro). Compara, para cada
pantalla de `pantallas.json`, el marco del diseño (`docs/diseno/erp-obras/*.dc.html`) contra la ruta
real en producción, texto por texto, y calcula un puntaje 0–100 con la fórmula fija documentada en el
encabezado de `medir-fidelidad.mjs`.

## Comando

```
ecos browser -- env LD_LIBRARY_PATH=/home/jorge/.local/pw-libs/root/usr/lib/x86_64-linux-gnu \
  node scripts/fidelidad/medir-fidelidad.mjs --base https://app.ecsas.com.ar [--pantallas 05,M07]
```

- `--base` (obligatorio en la práctica): la URL de producción a medir.
- `--pantallas` (opcional): lista separada por comas de `code` de `pantallas.json` a medir; sin esto,
  mide todas.
- `--email` (opcional, default `jorge@ecsas.com.ar`): con qué cuenta se genera la sesión de prueba.

Corre siempre a través del portero de recursos (`ecos browser --`): abre un Chromium real.

## Salida

- `scripts/fidelidad/out/<code>.json`: el detalle de esa pantalla (iguales, diferencias de estilo con
  sus propiedades, textos del diseño ausentes en producción, textos sólo en producción, puntaje).
- `scripts/fidelidad/out/resumen.md`: tabla y hallazgos principales, máximo 40 líneas.
- Exit 1 si alguna pantalla medida quedó por debajo de su `umbral` en `pantallas.json` (gate de no
  regresión). Exit 0 si todas están en o sobre su umbral. Exit 2 si la corrida falló antes de medir.

## Config (`pantallas.json`)

Cada entrada: `code` (identificador propio), `disenoLabel` (el `data-screen-label` del `.dc.html`),
`ruta` (la URL relativa en producción), `ancho` (1440 escritorio o 390 teléfono), `rol` (documentación
de a qué nivel corresponde) y `umbral` (piso de puntaje; ver comentario `_doc` del archivo para el
criterio de cómo se fijó).

## Requisitos

- `SUPABASE_SERVICE_ROLE_KEY` (o `_SECRET_KEY`/`_SERVICE_KEY`) y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
  `.env.local` de `echegaray-os/` (o en el entorno): arma una sesión real con magic link para poder
  medir pantallas detrás de login, igual que la auditoría de fidelidad de la que sale esta
  herramienta.
- Playwright ya instalado en `node_modules` (se reutiliza el navegador del repo, no instala nada
  nuevo).
