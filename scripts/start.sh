#!/bin/bash
echo "Reiniciando AgendaBot em container no Raspberry..."
docker compose build --no-cache
docker compose down
docker compose up -d
echo "Deploy finalizado. Verifique os logs com: docker logs -f agendabot_pi"
