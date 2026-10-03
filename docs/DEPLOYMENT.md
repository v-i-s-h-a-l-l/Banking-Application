# Deployment Guide

## Local Development

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start all infrastructure + services
docker-compose up --build

# 3. Frontend (separate terminal)
cd apps/frontend
npm install
npm run dev
```

Services available at:
- Frontend: http://localhost:5173
- API Gateway: http://localhost:3000
- RabbitMQ UI: http://localhost:15672 (banking/banking_secret)

---

## Production: Fly.io

### Prerequisites
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh
fly auth login
```

### PostgreSQL
```bash
fly postgres create --name banking-postgres --region bom
fly postgres db create --app banking-postgres --name banking_platform
```

### RabbitMQ (via Docker on Fly.io)
```bash
fly apps create banking-rabbitmq
fly secrets set RABBITMQ_DEFAULT_USER=banking RABBITMQ_DEFAULT_PASS=<strong-password> --app banking-rabbitmq
```

### Deploy each service

```bash
# Auth Service
cd apps/auth-service
fly apps create banking-auth-service
fly secrets set DATABASE_URL="<postgres-url>" JWT_SECRET="<secret>" --app banking-auth-service
fly deploy --dockerfile ../../docker/Dockerfile.service --build-arg SERVICE=auth-service

# Account Service
cd apps/account-service
fly apps create banking-account-service
fly secrets set DATABASE_URL="<postgres-url>" JWT_SECRET="<secret>" INTERNAL_SERVICE_SECRET="<secret>" --app banking-account-service
fly deploy --dockerfile ../../docker/Dockerfile.service --build-arg SERVICE=account-service

# Transfer Service
cd apps/transfer-service
fly apps create banking-transfer-service
fly secrets set DATABASE_URL="<postgres-url>" JWT_SECRET="<secret>" ACCOUNT_SERVICE_URL="https://banking-account-service.fly.dev" RABBITMQ_URL="amqp://..." INTERNAL_SERVICE_SECRET="<secret>" --app banking-transfer-service
fly deploy --dockerfile ../../docker/Dockerfile.service --build-arg SERVICE=transfer-service

# API Gateway
cd apps/api-gateway
fly apps create banking-api-gateway
fly secrets set JWT_SECRET="<secret>" AUTH_SERVICE_URL="https://banking-auth-service.fly.dev" ACCOUNT_SERVICE_URL="https://banking-account-service.fly.dev" TRANSFER_SERVICE_URL="https://banking-transfer-service.fly.dev" --app banking-api-gateway
fly deploy --dockerfile ../../docker/Dockerfile.service --build-arg SERVICE=api-gateway
```

### Frontend (Vercel)
```bash
cd apps/frontend
npx vercel --prod
# Set environment: VITE_API_URL=https://banking-api-gateway.fly.dev
```

### Verify deployment
```bash
curl https://banking-api-gateway.fly.dev/health
curl https://banking-api-gateway.fly.dev/ready
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `RABBITMQ_URL` | RabbitMQ AMQP URL | Yes |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes |
| `INTERNAL_SERVICE_SECRET` | Internal service auth token | Yes |
| `CORS_ORIGIN` | Allowed CORS origin | Yes |
| `NODE_ENV` | `production` or `development` | Yes |
| `LOG_LEVEL` | `info`, `debug`, `error` | No |
| `FAIL_ACCOUNT_SERVICE` | Fault injection (dev only) | No |
| `FAIL_TRANSFER_SERVICE` | Fault injection (dev only) | No |
| `ARTIFICIAL_LATENCY_MS` | Add latency in ms (dev only) | No |

---

## Database Migrations

```bash
# Local
npm run db:migrate

# Production (run once after deploy)
fly ssh console --app banking-auth-service -C "npx prisma migrate deploy"
```

---

## Known Limitations

1. **Frontend UUID generation**: Uses custom implementation instead of crypto.randomUUID() for wider compatibility
2. **Internal service communication**: Services communicate over HTTP — in production, consider mTLS or service mesh
3. **RabbitMQ on Fly.io**: Requires persistent volume for message durability
4. **No dead-letter queue**: Messages that fail > MAX_ATTEMPTS are dropped — add DLQ for production
5. **OTP simulation**: OTP is not implemented — auth flow is password-only
6. **No email notifications**: Notification worker logs only — connect to SendGrid/SES for production
7. **Single PostgreSQL instance**: All schemas in one DB for simplicity — scale by separating per service
