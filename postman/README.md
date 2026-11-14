# Postman collection

Import `Pharmaceutical-Storage.postman_collection.json`. Set the collection variable `baseUrl` (Node-RED: `http://127.0.0.1:1880`). The collection deliberately submits a normal sample, an unsafe sample, acknowledges one of its active alerts, recovers conditions, sends an invalid payload, then exercises read and inspection APIs.

If `.env` contains `PHARMA_INGEST_TOKEN`, set collection variable `ingestToken` and enable the Authorization header on the four sensor-data requests. Other endpoints do not require this ingest-only token in local mode. For external deployments, secure all remote dashboard/API access at the reverse proxy.
