# Site Visit delete/photo/verified measurement repair — 2026-08-10

Physical Android recording `1000008931.mp4` is the acceptance evidence that triggered this repair.

Required phone behavior:

1. A walkthrough dimension already saved as `OPERATOR_VERIFIED` / `fieldVerified=true` must not appear again as NEXT MEASUREMENT or Measurements H38 still needs when the AI review repeats the same numeric dimension pair.
2. The walkthrough measurement candidate may remain visible as evidence, but must display as operator verified and must not say that remeasurement is required.
3. Every Site Visit picture row must expose Make Action Picture and Delete together.
4. Deleting a Site Visit must remove its attached private Site Visit evidence by Capture Session ID / Site Visit ID even when the phone's local attachment list is incomplete. Linked quote and customer records remain.
5. Offline Site Visit deletion keeps the existing tombstone/retry behavior and performs the server identity sweep when connectivity returns.

No automatic approval, sending, purchasing, payment, scheduling, or customer authorization is introduced. CameraX/native same-video audio behavior is unchanged. Physical Android remains final acceptance.