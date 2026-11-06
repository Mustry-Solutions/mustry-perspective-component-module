/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "Asia/Tokyo"} */
import { timezoneGapsSuite } from './timezoneGapsSuite';

timezoneGapsSuite('Asia/Tokyo');
