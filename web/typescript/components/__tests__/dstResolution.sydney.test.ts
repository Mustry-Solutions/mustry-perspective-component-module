/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "Australia/Sydney"} */
import { dstResolutionSuite } from './dstResolutionSuite';

dstResolutionSuite('Australia/Sydney');
