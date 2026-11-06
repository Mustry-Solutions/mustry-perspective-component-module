/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "Europe/Brussels"} */
import { dstResolutionSuite } from './dstResolutionSuite';

dstResolutionSuite('Europe/Brussels');
