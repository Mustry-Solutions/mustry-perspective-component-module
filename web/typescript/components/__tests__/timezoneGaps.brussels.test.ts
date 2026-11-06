/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "Europe/Brussels"} */
import { timezoneGapsSuite } from './timezoneGapsSuite';

timezoneGapsSuite('Europe/Brussels');
