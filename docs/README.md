# DecisionEats documentation

**Company:** Application42  
**Product:** DecisionEats  
**Release:** Version 1.0 ships when ready; there is no fixed MVP date.

Read documents in this order:

| Order | Document | Purpose |
|---|---|---|
| 00 | [Product Direction](00_PRODUCT_DIRECTION.md) | Current product goals, journeys, scope, and release bar |
| 01 | [Technical Specification](01_TECHNICAL_SPEC.md) | Architecture, data boundaries, and decision engine |
| 02 | [Style Guide](02_STYLE_GUIDE.md) | Code and writing standards |
| 03 | [Collaboration Blueprint](03_COLLABORATION_BLUEPRINT.md) | Ownership, delivery, and review |
| 04 | [UI/UX Specification](04_UIUX_SPEC.md) | Decision trees, screens, visual direction, and accessibility |
| 06 | [API Keys and Environment](06_API_KEYS_AND_ENV.md) | Secret ownership and environment setup |
| 07 | [Web Release](07_WEB_LAUNCH.md) | Publishing and release verification |
| 09 | [Feedback Roadmap](09_FEEDBACK_ROADMAP.md) | September 23 comparison, non-overlapping work items, acceptance criteria and AI prompts |

Additional folders contain implementation plans, historical decisions, and
supporting research. When they conflict with Product Direction, Product
Direction wins.

## Current delivery status

The [October 12 feedback execution record](reports/2026-10-12-feedback-execution.md)
records local DE-03–DE-16 implementation, verification, and remaining release
gates. These changes are not deployed; nutrition tracking and billing remain
design/decision work.

The September 23 source audit uses local branch `feat/body-metric-recommendations`
at `84ce747`. See the [feedback roadmap](09_FEEDBACK_ROADMAP.md) for what exists,
what is partial and what is planned. This is not verification of the production
build, hosted configuration or cross-device behavior. Older PR #26/#27 and
September 10 catalog notes are historical snapshots, not current delivery status.
