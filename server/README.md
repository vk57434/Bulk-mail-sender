# Bulk Mail Sender Backend

A production-minded Express + MongoDB + Redis + BullMQ backend for authorized bulk campaigns, suppression handling, queued email delivery, and campaign tracking.

## Features

- Admin authentication with JWT
- Campaign creation, update, stats, pause, resume, and cancel
- CSV recipient upload with validation, dedupe, suppression filtering, and size limits
- MongoDB-backed recipient tracking and suppression support
- Redis + BullMQ-based email dispatch queue
- Configurable ~10s rate-limited sending by worker
- SMTP verification and validation
- Structured logging without leaking secrets
- Graceful shutdown for the API server and worker

## Installation

```bash
npm install
```

## Start Redis locally

### Using Docker

```bash
docker run --name bulk-mail-redis -p 6379:6379 -d redis:7-alpine
```

### Using local Redis install

```bash
redis-server
```

## Start MongoDB locally

### Using Docker

```bash
docker run --name bulk-mail-mongo -p 27017:27017 -d mongo:7
```

## Environment configuration

Copy `.env.example` to `.env` and configure the values as needed.

```bash
cp .env.example .env
```

### Variables

- `NODE_ENV`: Runtime mode, usually `development` or `production`
- `PORT`: HTTP port for the API, default `5000`
- `MONGO_URI`: MongoDB connection string
- `REDIS_HOST`: Redis hostname or IP
- `REDIS_PORT`: Redis port, default `6379`
- `REDIS_PASSWORD`: Redis password if enabled
- `JWT_SECRET`: Secret used to sign JWT tokens
- `JWT_EXPIRES_IN`: JWT lifetime such as `7d`
- `ADMIN_EMAIL`: Default admin email used during bootstrapping
- `ADMIN_PASSWORD`: Default admin password used during bootstrapping
- `SMTP_HOST`: SMTP server hostname
- `SMTP_PORT`: SMTP port, usually `587`
- `SMTP_SECURE`: Whether to use TLS, set to `true` or `false`
- `SMTP_USER`: SMTP username
- `SMTP_PASS`: SMTP password
- `SMTP_FROM`: Sender email address used in outgoing mail
- `EMAIL_RATE_LIMIT_MS`: Delay between sent emails, default `10000` milliseconds
- `MAX_RECIPIENTS_PER_CAMPAIGN`: Maximum recipients per campaign
- `MAX_CSV_SIZE_MB`: Maximum CSV upload size in MB

Do not commit real passwords or production secrets to source control.

## Start API

```bash
npm run dev
```

Or production:

```bash
npm start
```

## Start worker

```bash
npm run worker
```

## API documentation

### Authentication

#### POST /api/auth/login

Request body:

```json
{
  "email": "admin@example.com",
  "password": "ChangeMe123!"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "token": "jwt-token",
    "user": {
      "id": "...",
      "email": "admin@example.com"
    }
  }
}
```

Headers:

```http
Authorization: Bearer <token>
```

### Campaign endpoints

#### POST /api/campaigns

Create a draft campaign.

Request body:

```json
{
  "name": "Spring Launch",
  "subject": "Welcome {{name}}",
  "html": "<h1>Hello {{name}}</h1><p>Welcome to our platform.</p>"
}
```

#### GET /api/campaigns

List campaigns.

#### GET /api/campaigns/:id

Fetch a campaign by ID.

#### PUT /api/campaigns/:id

Update a campaign while it is not actively sending.

#### DELETE /api/campaigns/:id

Delete a campaign.

#### POST /api/campaigns/:id/start

Starts the campaign and queues all pending recipients.

#### POST /api/campaigns/:id/pause

Pause an active campaign.

#### POST /api/campaigns/:id/resume

Resume a paused campaign.

#### POST /api/campaigns/:id/cancel

Cancel a campaign and mark pending/processing recipients as cancelled.

#### GET /api/campaigns/:id/stats

Returns campaign counts and timestamps.

Example response:

```json
{
  "success": true,
  "data": {
    "total": 1000,
    "pending": 500,
    "processing": 1,
    "sent": 480,
    "failed": 19,
    "cancelled": 0,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "startedAt": "2026-01-02T00:00:00.000Z",
    "completedAt": null
  }
}
```

### Recipient endpoints

#### POST /api/campaigns/:id/recipients/upload

Upload a CSV file with multipart form-data.

Form field name:

```text
file
```

Response example:

```json
{
  "success": true,
  "data": {
    "totalRows": 1000,
    "valid": 950,
    "duplicates": 20,
    "invalid": 10,
    "suppressed": 20,
    "campaignId": "...",
    "campaignStatus": "draft"
  }
}
```

#### GET /api/campaigns/:id/recipients

List recipients with pagination.

Query parameters:

- `page` (default `1`)
- `limit` (default `50`, max `100`)
- `status` (`pending`, `sent`, `failed`, etc.)

### Unsubscribe endpoint

#### GET /api/unsubscribe/:token

A tokenized unsubscribe endpoint that records the address in the suppression list and responds with an unsubscribe confirmation page.

## CSV format

```csv
name,email
Vivek,vivek@example.com
Rahul,rahul@example.com
Amit,amit@example.com
```

The service validates the row, normalizes emails to lowercase, filters duplicates, ignores malformed rows, and excludes suppressed addresses.

## Email template personalization

Example:

```html
<h1>Hello {{name}}</h1>
<p>Welcome to our platform.</p>
```

This is safe-rendered with escaped values and only supports the provided template variables.

## Responsible email sending

This system is designed for legitimate, consented email sending and includes the following technical safeguards:

- suppression list support
- unsubscribe support
- bounce handling architecture
- duplicate prevention
- delivery rate limiting
- provider-safe sending behaviors
- spam and anti-abuse avoidance guidance in the deployment documentation

This project does not provide functionality intended to evade provider limits, rotate sender identities, or bypass spam detection.

## SPF / DKIM / DMARC

For production, configure your sending provider for SPF, DKIM, and DMARC. Typical recommended setup:

- SPF: publish the correct SPF record for your sending domain
- DKIM: sign outgoing mail with a DKIM record
- DMARC: publish a DMARC policy and monitor reports

## Production deployment

Recommended deployment pattern:

- Node.js API: run the Express API on a managed host or container
- Redis: provision a managed Redis instance
- MongoDB: provision a managed MongoDB deployment
- Email provider: use a reputable SMTP relay or transactional email service
- Worker: run the BullMQ worker as a separate long-running process

Do not include real credentials or secrets in source control or deployment files.

## Local validation

A minimal smoke test can be run by:

1. starting Redis and MongoDB
2. copying `.env.example` to `.env`
3. running `npm install`
4. running `npm run dev`
5. running `npm run worker`
6. creating a campaign
7. uploading a CSV with at least three recipients
8. starting the campaign
9. verifying the worker sends and updates counts

## Example API test flow

### 1. Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}'
```

### 2. Create campaign

```bash
curl -X POST http://localhost:5000/api/campaigns \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Welcome Campaign","subject":"Hello {{name}}","html":"<h1>Hello {{name}}</h1><p>Welcome to the platform.</p>"}'
```

### 3. Upload CSV

```bash
curl -X POST http://localhost:5000/api/campaigns/<campaignId>/recipients/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@./test.csv"
```

### 4. Start campaign

```bash
curl -X POST http://localhost:5000/api/campaigns/<campaignId>/start \
  -H "Authorization: Bearer <token>"
```

### 5. Health check

```bash
curl http://localhost:5000/api/health
```

## Error handling

The API uses a centralized error middleware with a consistent structure:

```json
{
  "success": false,
  "message": "Human readable error",
  "code": "ERROR_CODE"
}
```

## License

ISC
