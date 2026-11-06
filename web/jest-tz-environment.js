// Runs a test file with the process in a chosen time zone, the way a browser in
// that zone would see `Date`:
//
//   /** @jest-environment ./jest-tz-environment.js
//    *  @jest-environment-options {"tz": "Europe/Brussels"} */
//
// TZ has to change here, outside the test sandbox: inside it `process.env` is a
// copy, so setting TZ from a test does nothing. Pinning the zone per file makes
// the cases run under every plain `jest` (npm test, Gradle, CI), not only under a
// script that remembers to set TZ. jest runs one file at a time per worker, so
// restoring TZ on teardown keeps it from reaching the next file.
const { TestEnvironment } = require('jest-environment-node');

class TimeZoneEnvironment extends TestEnvironment {
    constructor(config, context) {
        super(config, context);
        this.tz = config.projectConfig.testEnvironmentOptions.tz;
    }

    async setup() {
        await super.setup();
        this.previousTz = process.env.TZ;
        process.env.TZ = this.tz;
    }

    async teardown() {
        if (this.previousTz === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = this.previousTz;
        }
        await super.teardown();
    }
}

module.exports = TimeZoneEnvironment;
