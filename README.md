# Round Robin Lab — Advanced edition

Open `dist/index.html` in Safari/Chrome, or use the published Site. The downloadable ZIP places index.html at its root. No build dependencies are needed. A local file uses an in-page computation fallback; the hosted page computes in a worker to keep controls responsive.

## Demonstration

1. Load **Professor’s sample** and finish the run: the original sequence and averages are preserved.
2. Load **CPU + I/O demo**. This sets the quantum to 1s and the switch cost to 0.2s.
3. Select **Next event** to inspect a switch. The outgoing register bank is saved to its PCB; incoming PC, SP, R0, R1 and FLAGS animate into the CPU. Select any process to inspect its saved context.
4. Play and watch a process move to the I/O queue, then rejoin the ready queue. Use Present for a larger display.
5. Load **Large bursts · 1,000+**. Use 1,000× speed, jump to a time, or Finish. Zoom the timeline to inspect exact segments.
6. Change quantum and switch cost, rebuild, and discuss the responsiveness/overhead trade-off without changing the scheduling algorithm.
7. Run the built-in test suite. Export results for evidence in your report.

## Inputs

CSV header: `name,arrival,priority,memory,cpu,io`

Example:

```csv
name,arrival,priority,memory,cpu,io
A,0,3,64,5/4,3
B,0,3,128,2/2/2,5/5
C,1,3,256,12,
```

Time units are simulated seconds, with at most 3 decimal places. CPU and I/O bursts must be positive; arrivals and switch costs can be zero. I/O lists must have exactly one fewer entry than CPU lists. Priority and memory are metadata; they do not influence pure FIFO Round Robin or allocate actual memory. Blank I/O means a single CPU burst.

Export inputs produces CSV. Export results produces JSON with original configuration, final process metrics, exact timeline segments and an event log. Exported internal event/metric times use integer milliseconds, explicitly labeled in the JSON. The input configuration remains in seconds.

## Scheduling policy

At a boundary: admit arrivals in input order, complete I/O in process order, then handle burst completion or quantum expiry. A completed CPU burst blocks for I/O or terminates. An unfinished job is requeued only when another job is ready. At an empty ready queue, a running job continues with no self-switch.

The selected target is reserved before context-switch overhead starts. New arrivals during that overhead join the ready queue. A switch is counted when the CPU moves directly from one process to a different process, including completion/blocking followed immediately by dispatch. Initial dispatch, self-continuation and dispatch after an idle interval have zero modeled switch cost. I/O operations overlap independently; there is no shared I/O-device queue.

Ready waiting includes reserved dispatch overhead; it excludes CPU execution, pre-arrival time and I/O blocking. For each completed process:

`turnaround = CPU service + I/O time + ready/dispatch wait`

Utilization is useful CPU execution divided by elapsed simulated time. Throughput is completed processes per elapsed second. Workload classification compares declared CPU time to I/O time; it does not measure live operating-system utilization.

## Register model

Registers are illustrative, not native macOS registers. Each CPU second corresponds to 100 modeled instructions. PC starts at a process-specific base and advances 4 bytes per instruction. SP is a fixed process-specific stack base. R0 counts executed instructions; R1 adds a process-specific offset. FLAGS is Z when R0 is zero, NZ otherwise. Saved context is constant while ready/blocked and resumes from the same execution count. The live CPU panel advances while the PCB panel shows its last recorded scheduling-boundary context.

## Scale and architecture

The engine jumps between scheduling events, stores compact per-process histories and merges contiguous CPU segments. Idle periods and long uncontested runs jump directly to the next relevant event. Rendering is independent of logical time. The timeline displays exact segments in a selected time window; dense full-run views sample 200 intervals and are explicitly labeled as an aggregated overview.

Limits: 100 processes, 50 CPU bursts per process, 1,000,000 seconds per input value, and 200,000 scheduling events. Excessively small quanta with long competing workloads can exceed the event budget: increase quantum or reduce workload. These documented limits protect browser memory; this is not an unlimited or kernel-level scheduler. Animation may skip intermediate transitions during fast-forward; Next event inspects each event boundary.

## Tests

Run `node dist/tests.js`, or use the in-page Validation bench. The 21 checks include the professor's exact trace, waiting/response metrics, simultaneous arrivals, I/O completion/requeue ordering, burst completion at expiry, idle gaps, fractional switch costs, arrivals during overhead, register continuity, CSV round trip, invalid inputs, 100 simultaneous processes, large bursts and an uncontested million-second burst. Two checks include 100 randomized accounting workloads and 150 workloads compared against an independent one-second reference scheduler.

## Smooth playback

The playback clock and timeline cursor follow browser animation frames. Queue cards keep their identity between updates, and transfers animate on a separate overlay so the queue containers do not clip them or interrupt them when counters refresh. Register transfers remain visible across switch completion. Fast-forward skips individual flight effects above 10×; 0.5× slow motion is available for presenting. Playback pauses when the browser tab becomes hidden.
