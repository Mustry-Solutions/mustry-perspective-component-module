/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "UTC"} */
import { dstResolutionSuite } from './dstResolutionSuite';

dstResolutionSuite('UTC');
