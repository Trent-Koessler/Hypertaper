# HyperTaper

HyperTaper is a pure client-side web application designed to assist clinicians in creating safe, structured, and visually clear deprescribing plans for medications. By allowing users to configure hyperbolic or fixed reduction strategies based on available pill denominations and split fractions, it automatically generates a precise daily schedule and graphical chart of the taper. Originally made for benzo weaning regimen calculations and based off of excel spreadsheet calcs that were converted to a Python program -- this website version is inspired by the The Maudsley Deprescribing Guidelines crew and their discussions of hyperbolic tapering.

**Live Application:** [https://trent-koessler.github.io/Hypertaper/](https://trent-koessler.github.io/Hypertaper/)

## Features
- **Precise Tapering Algorithms**: Supports both fixed-dose and hyperbolic (percentage-based) reductions.
- **Tablet Splitting Logic**: Automatically calculates fractional pill requirements based on available denominations and safe splitting practices.
- **Never Overshoots**: Each step uses the largest dose the available tablets can actually make *without exceeding* the taper target, and holds it until the target falls to the next achievable dose.
- **Honest Warnings**: Flags when the available strengths are too coarse for the requested reduction, when a step drops far more steeply than asked for, or when the taper cannot reach the chosen stop dose.
- **Show the Calculations**: Every plan can be expanded into an interval-by-interval derivation — the formula for each target, the pieces that make up each prescribed dose, the shortfall against the curve, and the realised reduction — so a clinician can check the arithmetic independently. Copyable as plain text.
- **Configurable Chart**: Restrict the plotted date range, switch the x-axis between days, taper weeks and months, plot dose or percentage of the starting dose, and switch to a logarithmic y-axis (on which a constant-percentage taper is a straight line, making any departure from the intended curve obvious).
- **EMR Integration**: One-click copy of a fixed-width plain-text plan for pasting directly into clinical notes.
- **Secure & Private**: 100% client-side logic. No patient data is sent to external servers!!!

## How the maths works

1. **Ideal curve.** Interval `n` falls on day `n × interval`, and asks for
   `target(n) = D₀ × (1 − r/100)ⁿ` for a percentage taper, or `D₀ − n × r` for a
   fixed one. Every target is computed in closed form from the *original* dose,
   not by chaining off the previously prescribed one, so tablet rounding at one
   step never compounds through the rest of the curve.
2. **Achievable dose.** For each target, an unbounded-knapsack search over the
   available whole/half/quarter pieces returns the largest total that does not
   exceed the target. It never rounds up, so no step can prescribe more than the
   curve asks for. Ties are broken towards the fewest pieces, then the fewest
   cuts.
3. **Holding.** Consecutive intervals that resolve to the same achievable dose
   are merged into one held step.
4. **Stopping.** Intervals are generated while `target(n)` is *at or above* the
   stop dose, so the stop dose itself is prescribed before cessation.

### Known limitations

- **Solid dose forms only.** Hyperbolic tapering to very low doses generally
  needs a liquid or compounded formulation; with tablets alone the tail of the
  curve is limited by the smallest piece available, and the app warns when this
  forces a step steeper than requested. Support for continuous formulations is
  the most significant outstanding feature.
- **Dose, not receptor occupancy.** The percentage mode reduces the *dose* by a
  fixed proportion. This is the practical approximation the Maudsley guidance
  works with; it is not the same as reducing receptor occupancy linearly, which
  would need drug-specific occupancy parameters.
- **Splitting is assumed exact.** Real halves and quarters vary by roughly
  10–20% of the intended piece, which matters most at the smallest doses.
- **Total daily dose only.** How the dose is divided across the day is a
  separate clinical decision and is not modelled.

## Development

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests for the tapering engine
npm run build   # typecheck + production build
```

The tapering engine lives in `services/weaningLogic.ts` and is covered by
`services/weaningLogic.test.ts`. It is the clinically load-bearing part of the
app — please add a test alongside any change to it.

> HyperTaper is a calculation aid, not medical advice. Every plan must be reviewed
> against the product's licensed strengths and the patient's clinical picture
> before prescribing.
