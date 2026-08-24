# H38 meeting evidence provenance

| Source type | Human label | Default verification |
| --- | --- | --- |
| `RECORDED_AUDIO` | Recorded transcript | Recorded, not independently verified |
| `RECORDED_VIDEO_AUDIO` | Recorded walkthrough audio | Recorded, not independently verified |
| `LIVE_TYPED_NOTE` | Live typed note | Source note unless explicitly field verified |
| `DICTATED_RECOLLECTION` | Dictated recollection | `RECALLED_NOT_VERIFIED` |
| `TYPED_RECOLLECTION` | Typed recollection | `RECALLED_NOT_VERIFIED` |
| `IMPORTED_NOTE` | Imported notes | Source note |
| `ATTACHMENT` | Attachment | Attachment evidence only |
| `MIXED` | Mixed sources | Field-level source required |

A recalled statement is never upgraded because AI found it plausible. A recorded statement is not automatically a verified measurement. `OPERATOR_VERIFIED` is allowed only when the underlying evidence explicitly says the operator measured/verified/confirmed the field dimension with a tape, laser, ARCore, or LiDAR source.

Quote Builder receives this provenance object as context. Canonical Quote Agent remains responsible for quote generation and may not silently convert recalled/unverified dimensions into verified field measurements.
