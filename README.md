# HyperTaper

HyperTaper is a pure client-side web application designed to assist clinicians in creating safe, structured, and visually clear deprescribing plans for medications. By allowing users to configure exponential (percentage), hyperbolic (occupancy) or fixed reduction strategies based on available pill denominations and split fractions, it automatically generates a precise daily schedule and graphical chart of the taper. Originally made for benzo weaning regimen calculations and based off of excel spreadsheet calcs that were converted to a Python program -- this website version is inspired by the The Maudsley Deprescribing Guidelines crew and their discussions of hyperbolic tapering.

**Live Application:** [https://trent-koessler.github.io/Hypertaper/](https://trent-koessler.github.io/Hypertaper/)

## Features
- **Precise Tapering Algorithms**: Supports three reduction methods: **Exponential (%)**, which
  cuts the same percentage of the current dose each interval (often called "hyperbolic" in the
  Maudsley guidelines, which it approximates); **Hyperbolic (Occupancy)**, which lowers
  estimated receptor occupancy by equal steps so the dose follows a true hyperbola; and
  **Fixed Amount**.
- **Receptor Occupancy (Michaelis–Menten)**: Enter the dose that gives half the maximum
  receptor occupancy (EC50) and, if a study measured one, the maximum occupancy (Emax, 100% if
  left blank). The chart and calculations then show each dose's estimated occupancy,
  `Emax × dose ÷ (dose + EC50)` (the Schedule tab and EMR text show it when "Show receptor
  occupancy" is ticked). The "Hyperbolic (Occupancy)" reduction method lowers occupancy by a
  fixed number of percentage points each interval, which is how the Maudsley tables are built.
- **Shared drug values**: Choosing a drug fills in its EC50 and Emax from
  `services/ed50-bank.json`, a copy of the master file in the
  [Psychopharmacology Visualiser](https://github.com/Trent-Koessler/Psychopharmacology_visualiser)
  repository. Every value names its source and says how it was obtained: reported in the source,
  back-calculated from published tables, fitted to published data, or derived (a rough estimate,
  such as other benzodiazepines scaled from diazepam by an equivalence table). Drugs with no
  usable human data are listed without a value. Choosing a drug changes nothing else you have
  entered; a "Use typical strengths" link fills the tablet list on request. Do not edit the copy:
  change the master and run `npm run sync-bank`.
- **Visualiser links**: Drugs the Visualiser includes have an "Open in the Visualiser" link, and
  the Visualiser's taper panel opens HyperTaper with the drug, dose, EC50 and Emax filled in
  (`?drugId=&dose=&unit=&ec50=&emax=&mode=occupancy`).
- **Start on the Clinic Date**: Choose whether the start date keeps the current dose for one
  interval (the default) or is the day the first reduction is taken, so the plan's dose changes
  line up with when the patient is seen without back-dating the start date. Tablets for the
  current dose already being taken are not counted.
- **Tablet Splitting Logic**: Automatically calculates fractional pill requirements based on available denominations and safe splitting practices.
- **Tracks the Curve**: Each step uses the dose the available tablets can actually make that is *nearest* to the taper target. A "When Tablets Can't Match" setting can instead *stay under* the target (never prescribe more than the curve asks for), or *hold* each dose until the curve reaches the next one down. In every mode the dose never steps up and never starts above the current dose.
- **Morning and Night Doses**: Divide each daily dose into the most even morning and night
  doses the tablet pieces (or liquid measures) allow, with any uneven part at night, as in the
  Maudsley tables. Each dose time lists its own tablets, and the plan warns when a dose cannot
  be shared evenly. The split never changes the daily total. An "Even doses" / "Fewest pieces"
  setting decides what happens when an even split would take extra, smaller pieces (for
  example, a 10mg tablet that cannot be cut).
- **Liquid Formulations**: Optionally give the whole taper, the doses below a chosen level, or
  everything after the first tablet step that would drop by more than a chosen tolerance
  (e.g. 15%), as an oral liquid. Liquid totals include the number of bottles to supply. Enter the concentration (e.g. 1mg/mL) and the smallest volume that
  can be measured (e.g. 0.1mL); each liquid dose is rounded *down* to whole measures. This keeps
  the low-dose tail gentle where quartered tablets would force a large final drop, and the
  plan never steps up when it switches from tablets to liquid.
- **Honest Warnings**: Flags when the available strengths are too coarse for the requested reduction, when a step drops far more steeply than asked for, or when the taper cannot reach the chosen stop dose.
- **Show the Calculations**: Every plan can be expanded into an interval-by-interval derivation — the formula for each target, the pieces that make up each prescribed dose, the shortfall against the curve, and the realised reduction — so a clinician can check the arithmetic independently. Copyable as plain text.
- **Configurable Chart**: Restrict the plotted date range, switch the x-axis between days, taper weeks and months, plot dose or percentage of the starting dose, and switch to a logarithmic y-axis (on which a constant-percentage taper is a straight line, making any departure from the intended curve obvious).
- **Maudsley Reference Tables**: The three example diazepam taper schedules published in
  *The Maudsley Deprescribing Guidelines* (2024) are included verbatim as a read-only
  reference — receptor occupancy, AM/PM split, total daily dose and dose form for every
  step. Any of them can seed the calculator's starting dose and tablet strengths, or be
  overlaid on the chart to compare a generated plan against the published guidance.
- **Supply Counts**: Tablet totals show both the exact amount taken (which can include cut
  pieces) and the whole tablets to supply, rounded up, for each step and for the whole plan.
- **Patient Handout**: A plain-language, printable copy of the plan with one row per step —
  dates, morning and night amounts (e.g. "1½ × 2mg tablets", "0.6mL of liquid"), the total
  each day and a tick box. Name and contact details are blank lines to fill in by hand, so no
  patient information is entered into the app. "Print handout" prints the handout alone.
- **EMR Integration**: One-click copy of the plan for pasting into clinical notes. Each step is a
  short block of lines (dates, daily dose, morning and night, step total) rather than a padded
  table, so it stays readable in any font. Rich-text notes receive the lines as soft line breaks
  within one paragraph per step; plain-text fields receive ordinary line breaks.
- **Secure & Private**: 100% client-side logic. No patient data is sent to external servers!!!

## How the maths works

1. **Ideal curve.** Interval `n` falls on day `n × interval`, and asks for
   `target(n) = D₀ × (1 − r/100)ⁿ` for a percentage taper, or `D₀ − n × r` for a
   fixed one. An occupancy taper aims for `occupancy(n) = RO₀ − n × r` percent,
   where `RO₀ = 100 × D₀ / (D₀ + EC50)`, and turns it back into a dose with
   `target(n) = EC50 × occupancy(n) / (100 − occupancy(n))`. Every target is computed in closed form from the *original* dose,
   not by chaining off the previously prescribed one, so tablet rounding at one
   step never compounds through the rest of the curve.
2. **Achievable dose.** For each target, an unbounded-knapsack search over the
   available whole/half/quarter pieces returns the achievable total nearest the
   target (the lower one on a tie), and the taper stops once zero is the nearest
   achievable dose. Optionally it takes the largest total that does not exceed
   the target ("stay under", so no step prescribes more than the curve asks
   for), or the smallest one at or above it ("hold longer"). Ties are broken
   towards the fewest pieces, then the fewest cuts.
3. **Holding.** Consecutive intervals that resolve to the same achievable dose
   are merged into one held step.
4. **Stopping.** Intervals are generated while `target(n)` is *at or above* the
   stop dose, so the stop dose itself is prescribed before cessation.

### Known limitations

- **Liquids are idealised.** A liquid dose is assumed to be measured exactly to
  the stated increment. The concentration of a compounded liquid should be
  confirmed with the dispensing pharmacy, and its shelf life may mean the total
  volume needs to be supplied in several batches.
- **Occupancy is a model.** The Exponential (%) mode reduces the *dose* by a fixed
  proportion. The Hyperbolic (Occupancy) mode reduces *estimated* receptor occupancy
  linearly, using a simple Michaelis–Menten curve and the EC50 and Emax entered. These come
  from small imaging studies of mostly healthy volunteers and vary between studies; an
  individual patient's occupancy can differ considerably (metabolism, interacting drugs,
  smoking, kidney and liver function).
- **Splitting is assumed exact.** Real halves and quarters vary by roughly
  10–20% of the intended piece, which matters most at the smallest doses.
- **At most twice daily.** Doses can be given once daily or morning and night;
  three or more doses a day are not modelled.

## Development

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests for the tapering engine
npm run build   # typecheck + production build
```

The Maudsley reference tables are transcribed data, not computed output. They live in
`services/maudsleyDiazepam.ts`, and `services/maudsleyDiazepam.test.ts` pins the
structural invariants of the source tables (step numbering, AM + PM equalling the printed
total, monotonic dose and occupancy, and each regimen honouring the occupancy step size it
advertises) so a transcription error cannot pass silently.

The tapering engine lives in `services/weaningLogic.ts` and is covered by
`services/weaningLogic.test.ts`. It is the clinically load-bearing part of the
app — please add a test alongside any change to it.

> HyperTaper is a calculation aid, not medical advice. Every plan must be reviewed
> against the product's licensed strengths and the patient's clinical picture
> before prescribing.
