# Numerical Lab

By saeed shahyn · [GitHub profile](https://github.com/shahyn06) · [Open the lab](https://numerical-lab.sparsemyrrh.chatgpt.site/)

A public, buildless browser lab for Bisection, Fixed Point, Newton, Secant, Lagrange interpolation, Newton divided differences, and numerical differentiation by finite differences.

The Interpolation workspace accepts 2–12 distinct nodes, constructs the polynomial, evaluates a requested x, shows Lagrange basis contributions or a divided-difference table, visualizes the polynomial and individual basis functions, and exports a CSV notebook. A calculator-style equation builder supports every root-finding expression field, cursor-aware editing, selection wrapping, and a live MathML preview.

The Differentiation workspace approximates f′(a) with forward, backward, and central finite differences, or compares all three at once. It plots the curve with its secant and tangent lines, lets you drag the target point and shrink h with a slider, presets, or an animated "Decrease h" run, and checks every estimate against the exact derivative from automatic differentiation. An error-versus-h chart separates truncation error from floating-point round-off, a step-by-step Taylor derivation shows where the formulas — and the central denominator 2h — come from, and nine short lessons plus a generated practice quiz teach the method.

The interface supports Arabic and English, with an adjacent language switch, right-to-left Arabic layout, translated explanations and validation messages, and a saved language preference. Switching languages preserves current equations, selected steps, and numerical results. Mathematical notation and numeric tables keep their left-to-right order.

The interface supports light and dark themes, follows the device preference initially, and saves an explicit choice on the device. Drag the orange curve explorer to inspect function values, drag across the convergence chart to select iterations, or move the orange interpolation point to update the evaluation x and its notebook live. The points also support arrow keys, Shift for larger steps, and Home/End. Touch dragging uses SVG pointer capture; vertical scrolling over the chart background is preserved.

## Run and validate

Serve `docs/` with any static web server. No package installation or build is needed.

```sh
npm test
```

The numerical engine has no external dependencies, uses a restricted expression parser (no eval), and calculates first derivatives with automatic differentiation. Tests cover known roots, iteration formulas, bracket bounds, failure cases, function domains, expression precedence, Fixed Point conditions, and interval bounds against independent point evaluations.

## Numerical conventions

- Tolerance is absolute. Bisection stops on an evaluated zero or a bracket half-width at most tolerance.
- Newton and Secant require an evaluated zero or both a small step and small original residual.
- Fixed Point additionally checks the fixed-point defect. A small defect alone does not imply a root of the original equation.
- The sufficient Fixed Point conditions are checked with 128 subdivided interval enclosures. Bounds are conservative, with outward rounding for arithmetic. Transcendental library values and constants still use floating-point approximations; diagnostics are educational rather than a formal proof system.
- Calculations use IEEE 754 double precision. The UI discloses precision and stopping rules; CSV retains stored precision.
- Interpolation uses normalized-coordinate barycentric evaluation, checked against a Newton evaluation and the original nodes. Extrapolation, repeated nodes, nearly coincident nodes, high degree, and numerical cancellation are handled explicitly. Expanded coefficients are for display; unstable expansions use a scaled variable.
- Differentiation quotients are plain finite differences of parser evaluations; the exact comparison value comes from the same automatic differentiation as Newton. Central difference evaluates only a − h and a + h, never a. A point outside the real domain fails only the methods that need it, reported as an error rather than NaN or Infinity.
- Inputs and iteration results remain in browser memory. The application includes no external calculation API, database, analytics SDK, or third-party asset request.

## GitHub Pages

In repository Settings → Pages, choose **Deploy from a branch**, select `main`, choose `/docs`, and save. The static application needs no build or package installation. The `docs/.nojekyll` file disables Jekyll processing.

The source export excludes Site-specific hosting configuration, Git metadata, credentials, and local preview files.
