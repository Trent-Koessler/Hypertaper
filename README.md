# HyperTaper

HyperTaper is a pure client-side web application designed to assist clinicians in creating safe, structured, and visually clear deprescribing plans for medications. By allowing users to configure hyperbolic or fixed reduction strategies based on available pill denominations and split fractions, it automatically generates a precise daily schedule and graphical chart of the taper. Originally made for benzo weaning regimen calculations and based off of excel spreadsheet calcs that were converted to a Python program -- this website version is inspired by the The Maudsley Deprescribing Guidelines crew and their discussions of hyperbolic tapering.

**Live Application:** [https://trent-koessler.github.io/Hypertaper/](https://trent-koessler.github.io/Hypertaper/)

## Features
- **Precise Tapering Algorithms**: Supports both fixed-dose and hyperbolic (percentage-based) reductions.
- **Tablet Splitting Logic**: Automatically calculates fractional pill requirements based on available denominations and safe splitting practices.
- **Never Overshoots**: Each step uses the largest dose the available tablets can actually make *without exceeding* the taper target, and holds it until the target falls to the next achievable dose.
- **Honest Warnings**: Flags when the available strengths are too coarse for the requested reduction, or when the taper cannot reach the chosen stop dose.
- **Visual Schedules**: Generates an interactive chart and a comprehensive daily tablet visualization.
- **EMR Integration**: One-click copy of a fixed-width plain-text plan for pasting directly into clinical notes.
- **Secure & Private**: 100% client-side logic. No patient data is sent to external servers!!!

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
