# QUÉ DE HUGGING FACE POTENCIA CADA ÁREA DEL OS

_04/09/2026 · barrido del catálogo real, consultado con el token del dueño — no de memoria_

Cuenta `jorgecoronaguti`, plan **PRO**. La plataforma tiene 2M de modelos, 1,5M de datasets y
1,5M de apps. Esto es lo que sirve **acá**, área por área.

## Dos correcciones a lo que se había dicho antes

**1. SÍ hay visión sin GPU.** Se había cerrado el tema con «sin GPU no hay planos ni fotos». Es falso
para modelos CHICOS: un YOLOv5s pesa ~14 MB y corre en CPU. Lo que no entra en esta VM son los VLM
grandes (Qwen-VL, Florence-2). La detección de objetos en fotos de obra sí entra.

**2. Existe un modelo de pronóstico que no hay que entrenar.** `amazon/chronos-2` —25 millones de
descargas— pronostica series temporales *zero-shot*: se le dan los últimos meses y devuelve la
proyección con su intervalo. `chronos-bolt-small` corre en CPU. Cambia el techo de lo que el OS
puede proyectar solo.

---

## 1 · CAJA, BANCO, TESORERÍA

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| **Proyección de caja con intervalo de confianza** | `amazon/chronos-bolt-small` | VM (CPU) |
| Clasificar el concepto sucio del extracto («Iva 21% reg de transfisc ley27743») | `MoritzLaurer/mDeBERTa-v3-base-xnli` (zero-shot, multilingüe) | VM |
| Detectar movimientos anómalos y duplicados | estadística + embeddings | VM |
| Emparejar cobros partidos con su factura | embeddings + reglas | VM |

## 2 · COMPRAS, PROVEEDORES, CHEQUES

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| **Emparejar proveedor de un cheque con el de Compras** cuando el nombre no es idéntico | `multilingual-e5-small` + normalización | VM |
| Extraer datos de una factura escaneada | `impira/layoutlm-invoices` · `LaaP-ai/qwen-base-invoicev1.01-1.5B` | VM (lento) / GPU |
| Layout y tablas de un PDF | `docling-project/docling-layout-heron-onnx` | VM |
| Normalizar materiales («hierro del 8» = «Ø8» = «acero 8mm») | embeddings | VM |
| Precio de insumo fuera de rango | estadística sobre 946 filas de `compra_sheet` | VM |

## 3 · OBRAS, AVANCE, PRODUCTIVIDAD

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| **Pronóstico de costo final y duración de obra** | `chronos-2` | VM |
| Clasificar partes e impedimentos en texto libre | zero-shot `mDeBERTa-xnli` | VM |
| Aprender rendimientos reales → corregir la próxima cotización (Regla de oro 16) | regresión propia | VM |

## 4 · SEGURIDAD E HIGIENE — un área que el OS hoy no cubre

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| **Detectar casco y chaleco en una foto de obra** | `keremberke/yolov5s-construction-safety` · `killuminati1/construction-ppe-yolov8` | **VM (CPU)** |
| Detectar riesgos en obra | `yihong1120/Construction-Hazard-Detection` | VM |

Es la capacidad más barata de todo el listado y toca una obligación legal (ART, IERIC).

## 5 · COTIZACIÓN Y PLANOS

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| Segmentar un plano en muros y ambientes | `Patnev71/segformer-b0-finetuned-floorplan` (chico) | VM, calidad a probar |
| Plano → geometría 3D | `Yytsi/floorplan-to-3d-walls` | GPU |
| `interpretar-region` (gasto vivo #1: $17,69 / 169 llamadas) | **se queda en Claude** | — |
| Buscar el dato técnico faltante antes de ir a la web | embeddings sobre CIRCOT y cotizaciones viejas | VM |

## 6 · DOCUMENTOS, DATA ROOM, CONOCIMIENTO

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| Búsqueda por significado en 1.951 archivos | `multilingual-e5-small` + `pgvector` | VM |
| PDF → texto y tablas (contratos, pliegos, memorias) | Docling + TableFormer | VM |
| Preguntar sobre una tabla en lenguaje natural | `google/tapas-base-finetuned-wtq` | VM |
| Extraer CUIT, montos, nombres de un texto | `mrm8488/bert-spanish-cased-finetuned-ner` | VM |
| Afinar los resultados de una búsqueda | `BAAI/bge-reranker-base` | VM |

## 7 · PERSONAL, LEGAJOS, UOCRA

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| Leer libretas IERIC, constancias de ARCA, recibos | Docling + NER español | VM |
| Nombre dado vuelta, apellidos mal escritos | similitud de cadenas + embeddings | VM |
| HH anormales por persona o cuadrilla | estadística | VM |

## 8 · XSAS Y EL BOT

| Qué potencia | Modelo / capacidad | Corre en |
|---|---|---|
| **Ruteo por significado** (`flujo de fondos → iva_anual`) | embeddings sobre consultas etiquetadas | VM |
| **Elegir qué contexto se le manda a Claude** | embeddings + reranker | VM |
| Clasificar el pedido que llega al bot sin gastar una llamada | zero-shot | VM |
| **Voz → texto** para partes de obra dictados | `openai/whisper-large-v3-turbo` (chico: `whisper-base`) | VM, por cola |
| Razonar y redactar | **Claude, siempre** | — |

---

## LO QUE OFRECE LA PLATAFORMA (no son modelos)

| Capacidad | Para qué sirve acá | Costo |
|---|---|---|
| **Jobs** | correr un script propio en GPU, montando carpetas de la VM. Procesar los 1.951 documentos del data room con OCR | **CPU $0,01/h · T4 $0,40/h** |
| **Jobs programados** | cron en la nube, como los 14 timers | por segundo |
| **ZeroGPU** | 40 min/día de RTX Pro 6000 (48 GB) incluidos en PRO | incluido |
| **Storage Buckets** | almacenamiento tipo S3 con deduplicación | según plan |
| **Datasets privados** | versionar los datasets del CIRCOT, rendimientos, precios históricos | incluido (10× en PRO) |
| **Webhooks** | disparar un Job cuando cambia un repositorio | — |
| **MCP Server** | que XSAS y Claude Code usen HF como herramienta | — |
| **Spaces** | apps internas con GPU | hasta 10 en PRO |

**Todo lo de Jobs, ZeroGPU y Spaces corre en servidores de Hugging Face, no en la VM.** Usarlos
con documentos de la empresa los saca de la empresa. Es una decisión del dueño, y se puede acotar
por tipo de documento.

---

## LO QUE NO SE TOCA

- **Razonar y decidir**: Claude, siempre. Es la regla del dueño.
- **La lectura de comprobantes que impactan plata**: `claude-opus-5`, ya decidido.
- **La liquidación laboral, la DDJJ y el criterio fiscal**: determinístico + firma humana.
- **`lib/plano/seleccion.mjs`**: ya es puro, no se le mete un modelo.
