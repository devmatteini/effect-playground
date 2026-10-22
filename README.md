# Effect playground

A collection of scripts to explore the Effect ecosystem

## Structure

pnpm workspace with two packages:

- `v3/`: Effect 3
- `v4/`: Effect 4

## Installation

Install Node.js 24+ and pnpm, then clone the repository and install dependencies:

```bash
git clone https://github.com/devmatteini/effect-playground
pnpm install
```

## Usage

```bash
pnpm -F v4 test
pnpm -F v4 typecheck
pnpm -F v4 lint
cd v4 && node src/<script>.ts
```

Same for `v3` (no `lint`).

Format all packages from root:

```bash
pnpm format
```
