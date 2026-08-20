# Representación visual de alta fidelidad

Cada archivo abre en el navegador y es la referencia visual FINAL de sus pantallas (1440 de ancho; los mockups mobile van al lado, a 390).

| Archivo | Contiene |
| --- | --- |
| `Planificacion-Gantt.dc.html` | Obra → Planificación → Gantt, con actividad seleccionada, split arrastrable y status bar. La pantalla de referencia del sistema visual. |
| `Obras.dc.html` | Cartera (1a) · Resumen (1b) · Ejecución + mobile (1c) · Planificación embebida (1d) · Personal (1e) · Operación (1f) · Documentos + `/campo` mobile (1g) · Gantt de cartera (1h) · Alta de obra (1i) |
| `Administracion.dc.html` | Entrada (2a) · Personas (2b) · Legajo (2c) · Proveedores (2d) · Pendientes (2e) · Usuarios (2f) · Clientes cartera (2g) · Record de cliente (2h) · Cuadrillas (2i) |
| `Accesos.dc.html` | Mi cuenta + mobile (3a) · Operación global (3b) · Herramientas (3c) · Chat interno (3d) · Mis horas / Mi legajo / Mis documentos + mobile (3e) |
| `DesignSystem.dc.html` | Especimen vivo: tokens, escala, navegación, acciones, foco, estados, tabla, disclosure, split, NULL, mobile |

## Cómo usarlos
- Abrir el archivo directamente (doble clic). Necesita `support.js`, `image-slot.js`, `isotipo.png` y `logo-echegaray.png` en la misma carpeta: ya están.
- Son medibles: inspector del navegador para leer tamaños, colores y espacios exactos. Es la ventaja sobre una captura.
- **Cómo están hechos NO es cómo implementarlos.** Son un formato de diseño (estilos en línea, un archivo por grupo de pantallas). La implementación va en Next.js + Tailwind reutilizando la arquitectura real del OS y las utilidades de `tailwind.config.ts`. Lo que se copia es el resultado: composición, dimensiones, jerarquía, densidad, estados y comportamiento.
- Los recuadros con id (`1a`, `2c`, `3e`…) son etiquetas del documento de diseño, no parte de la interfaz.
