/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "America/New_York"} */
import { dstResolutionSuite } from './dstResolutionSuite';

dstResolutionSuite('America/New_York');
