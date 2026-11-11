# Enterprise Service Level Agreement (SLA)

## Uptime commitment
We guarantee a Monthly Uptime Percentage of at least 99.95% during any monthly billing cycle across our production infrastructure. Service availability is measured on an hourly basis via automated health probes stationed across multiple geographic zones.

## Incident response tiers
- Priority 1 (Critical Outage): Complete service unavailability affecting more than 20% of customer workloads. Response time: under 15 minutes. Updates provided every 30 minutes.
- Priority 2 (Major Degradation): Core feature failure or API rate limiting anomalies with available partial workarounds. Response time: under 1 hour.
- Priority 3 (Minor Defect): Non-blocking bugs or UI rendering discrepancies. Response time: under 8 business hours.

## Service credits
If availability drops below 99.95% during any calendar month, the customer is entitled to service credits calculated against the monthly recurring fee:
- 99.0% to 99.94%: 10% credit applied to subsequent invoice.
- 95.0% to 98.99%: 25% credit applied to subsequent invoice.
- Below 95.0%: 50% credit applied to subsequent invoice.
To request a service credit, customers must submit an incident ticket within 30 days of the incident occurrence.
