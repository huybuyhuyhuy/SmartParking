# Smart Parking Architecture

## Services

- `api-gateway`: ingress, auth enforcement, route aggregation
- `auth-service`: JWT minting and RBAC authority claims
- `parking-service`: nearby search, lot catalog, EV/price filters
- `slot-service`: IoT slot ingestion, manual override, websocket fanout
- `analytics-service`: IOC KPIs and heatmap data API

## Event-Driven Flow

1. IoT devices send slot updates to `/api/v1/slots/events`.
2. `slot-service` publishes `slot-events` to Kafka.
3. `analytics-service` consumes events and updates aggregates.
4. `slot-service` emits websocket updates for live UIs.

## Performance (<200ms target)

- Redis cache for geospatial query response and lot occupancy read model.
- Elasticsearch geo index for nearby lookup at city scale.
- Gateway rate limiting and circuit breaking for overload protection.
- Stateless service pods with HPA for horizontal scaling.

## Fault Tolerance

- Kafka durable event log for replay and recovery.
- Multi-replica deployments with rolling updates.
- Read-through cache strategy with stale-safe fallbacks.
- Health checks and retry policy on service-to-service calls.
