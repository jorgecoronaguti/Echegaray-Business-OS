set -a; source ~/.config/echegaray/orquestador.env; set +a
for i in 1 2 3; do
  curl -s -o /dev/stdout -w '\nHTTP=%{http_code} total=%{time_total}s connect=%{time_connect}s\n' -m 40 \
    -H "Authorization: Bearer $ORQ_HF_TOKEN" -H 'Content-Type: application/json' \
    https://router.huggingface.co/v1/embeddings \
    -d '{"model":"intfloat/multilingual-e5-small","input":["query: Factura de DUBOS por hierro del 8","query: Cheque emitido a Maldonado","query: Pago UOCRA septiembre"]}' | cut -c1-300
done
