# EXTRAER EL TEXTO DE UN PDF. Se llama desde `buscar.mjs` y no hace nada más.
#
# Vive en su propio archivo, y no como un string adentro del .mjs, por una razón concreta: un guion
# embebido se pasa por `python3 -c` y ahí el escapado de comillas y barras se rompe callado —
# produce texto vacío en vez de un error. Un archivo se puede leer, versionar y probar.
import sys, json
try:
    import fitz  # PyMuPDF
except Exception as e:  # noqa: BLE001 — la ausencia de la dependencia es un DATO, no una excepción
    print(json.dumps({"error": "PyMuPDF no está disponible: %s" % e}))
    sys.exit(0)

try:
    doc = fitz.open(sys.argv[1])
except Exception as e:  # noqa: BLE001
    print(json.dumps({"error": "no se pudo abrir el PDF: %s" % e}))
    sys.exit(0)

tope = min(doc.page_count, int(sys.argv[2]))
partes = ["=== p.%d ===\n%s" % (i + 1, doc[i].get_text()) for i in range(tope)]
print(json.dumps({"paginas": doc.page_count, "leidas": tope, "texto": "\n".join(partes)}))
