# demo-failing-tests

Intentional test failure for logs and pipeline stop behavior. No external dependencies; Node.js 20+ required.

```bash
npm ci
npm run lint
npm test
npm run build
npm start
```

`npm test` intentionally exits with code 1. Change `actualDiscount` to `20` in `test/main.test.js` to fix it.
