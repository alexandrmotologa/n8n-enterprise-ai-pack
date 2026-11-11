# API Rate Limits and Quota Management

## Standard API thresholds
The public REST API enforces token-bucket rate limiting based on your subscribed tier:
- Enterprise Tier: 1,000 requests per minute per organization token. Burst capacity up to 2,500 requests per minute for up to 60 consecutive seconds.
- Professional Tier: 300 requests per minute per organization token. Burst capacity up to 500 requests per minute.
- Developer Sandbox: 60 requests per minute.

## Header specifications
Every response includes standard rate limit headers:
- `X-RateLimit-Limit`: Maximum allowable requests per rolling window.
- `X-RateLimit-Remaining`: Remaining request allowance in current window.
- `X-RateLimit-Reset`: Unix epoch timestamp when quota resets.

## Handling HTTP 429
When requests exceed configured boundaries, the API returns HTTP 429 Too Many Requests with a `Retry-After` header. Automated clients should implement exponential backoff with full jitter to avoid stampede effects.
