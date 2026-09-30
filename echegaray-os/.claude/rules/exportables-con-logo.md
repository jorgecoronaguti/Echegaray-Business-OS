---
paths:
  - "src/shared/exportar/**"
  - "src/**/services/*Pdf.ts"
  - "src/**/services/*Xlsx.ts"
  - "src/**/services/*Csv.ts"
  - "src/**/components/**/Hoja*.tsx"
  - "src/**/components/**/Vista*.tsx"
  - "src/**/components/**/*Imprimible*.tsx"
  - "src/**/route.ts"
---

# Todo exportable o imprimible lleva el logo de la empresa

Regla del dueño (30/09/2026). Vale para PDF, Excel y cualquier pantalla pensada para `window.print()`.

- **PDF con pdf-lib** → `dibujarLogoPdf(doc, page, x, yArriba, alto)` de `src/shared/exportar/logoPdf.ts`. El PNG va
  embebido una vez por documento.
- **Excel** → `xlsxConLogo(bytes, altoPx)` de `src/shared/exportar/xlsxConLogo.ts` sobre el libro de SheetJS
  (que no escribe imágenes); dejar 4 filas en blanco arriba.
- **Vista que se imprime** → `<LogoParaImprimir />` (sólo aparece en el papel) o, si la hoja ya tiene su
  cabecera de diseño, `<img src="/marca/logo.png">` en ella.
- Los bytes salen de `logoMarca.ts`, no de `public/`: en serverless los estáticos no viajan con la función. Si
  cambia la marca se reemplaza `public/marca/logo.png` y se regenera `logoMarca.ts` (un test compara los dos).
- **CSV y TXT no pueden llevar imagen**: quedan fuera de la regla y se dice en el PR, no se disimula.
- Un exportable nuevo sin logo es un defecto de entrega, igual que uno sin test.
