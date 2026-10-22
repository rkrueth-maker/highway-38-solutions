# Demo walkthrough videos — drop-in contract

The software page (`software.html`, section `#demo-videos`) has a wired video
slot for each trade plus a universal walkthrough slot in the live-demo section.
Each slot checks for its file at page load: **when the file exists, the video
player appears automatically — no code change or second ship is needed.**

Drop finished MP4s in this folder with exactly these names:

- `universal.mp4` — the full Office walkthrough (the universal example)
- `appliance.mp4`, `auto.mp4`, `bathroom.mp4`, `cleanup.mp4`, `deck.mp4`,
  `drainage.mp4`, `electrical.mp4`, `gutters.mp4`, `hvac.mp4`, `kitchen.mp4`,
  `landscape.mp4`, `mowing.mp4`, `plowing.mp4`, `plumbing.mp4`, `rental.mp4`

Until a file lands, its slot shows "Walkthrough video coming soon" and the
card still links to the one live demo (Clearwater, `?businessKey=demo`).
