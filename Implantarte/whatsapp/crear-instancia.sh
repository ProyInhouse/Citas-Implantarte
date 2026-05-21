#!/bin/bash
# Ejecutar después de que Evolution API esté corriendo
# Crea la instancia "implantarte" y configura el webhook hacia n8n

EVOLUTION_URL="http://localhost:8080"
API_KEY="implantarte2026secretkey"
INSTANCE_NAME="implantarte"
N8N_WEBHOOK="http://localhost:5678/webhook/implantarte-citas"

echo "Creando instancia $INSTANCE_NAME..."

curl -s -X POST "$EVOLUTION_URL/instance/create" \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceName\": \"$INSTANCE_NAME\",
    \"integration\": \"WHATSAPP-BAILEYS\",
    \"qrcode\": true,
    \"webhook\": {
      \"url\": \"$N8N_WEBHOOK\",
      \"byEvents\": false,
      \"base64\": false,
      \"headers\": {},
      \"events\": [
        \"MESSAGES_UPSERT\"
      ]
    }
  }" | python3 -m json.tool

echo ""
echo "Instancia creada. Ahora obtén el QR para escanear:"
echo "  GET $EVOLUTION_URL/instance/connect/$INSTANCE_NAME"
echo "  Header: apikey: $API_KEY"
