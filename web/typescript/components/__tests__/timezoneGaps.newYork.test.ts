/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "America/New_York"} */
import { timezoneGapsSuite } from './timezoneGapsSuite';

timezoneGapsSuite('America/New_York');
