# NANI State & Evidence Engine

This branch turns NANI from a report generator into a persistent decision-state system.

## Flow

verified source -> evidence ledger -> latest facts -> previous/current delta -> decision state -> deduplicated alert -> Command Center

## New API

- `POST /api/evidence` stores a sourced fact. Discovery-only evidence is stored but cannot drive verified state.
- `POST /api/brain/evaluate` compares latest verified facts with the prior state and persists the new living state.
- `GET /api/brain` returns the latest state for every tracked subject.
- `GET /api/brain/:subject` returns state plus evidence/audit history.

## Safety

The engine does not place orders or purchases. Existing `LIVE_TRADING=false`, execution blocking, and defined-risk research constraints remain unchanged. A missing or weak source does not become a verified fact.

## Example shopping cycle

1. Store `AIDEN_SESAME.price`, `availability`, and `bundlePrice` with official/authorized URLs and timestamps.
2. Evaluate `AIDEN_SESAME`.
3. The engine compares with the previous verified state.
4. No material delta -> no new alert.
5. Material price/availability/decision delta -> one deduplicated alert.

## Example market cycle

Store provider-derived SPY/QQQ fields such as `price`, `regime`, `trigger`, `invalidation` as evidence, then evaluate. The state engine never treats discovery-only text as confirmation.

## Next provider work

Scheduled sensors should call the evidence endpoint instead of writing prose reports. Market sensors should use provider data; shopping sensors should use official brand/authorized-retailer pages. An LLM may explain a state after deterministic verification/delta calculation, but it is not the source of truth.
