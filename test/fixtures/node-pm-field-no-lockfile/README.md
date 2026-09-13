# Fixture: `node-pm-field-no-lockfile`

`packageManager: "pnpm@9.0.0"` and **no `pnpm-lock.yaml`**.

DR-005 resolves the package manager from the `packageManager` field before
it consults lockfiles, so this project detects as pnpm — and the generated
artifacts then assume a lockfile that is not there:

- the Dockerfile's `COPY package.json pnpm-lock.yaml ./` cannot resolve;
- `pnpm install --frozen-lockfile` fails by definition without a lockfile.

The tool used to present both as finished artifacts (adversarial review
GEN-04). This fixture pins the honest behaviour: detection records that no
lockfile was found, and the generators stop claiming a frozen install.

Deliberately has no lockfile of any kind — do not "fix" it by adding one.
