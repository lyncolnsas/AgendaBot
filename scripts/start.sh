#!/bin/bash
echo "Limpando sistema Docker no Raspberry..."
docker system prune -f
docker container prune -f

echo "Reiniciando AgendaBot em container..."
docker compose down
docker compose up -d --build

echo "Deploy finalizado. Verifique os logs com: docker logs -f agendabot-agendabot-1"
