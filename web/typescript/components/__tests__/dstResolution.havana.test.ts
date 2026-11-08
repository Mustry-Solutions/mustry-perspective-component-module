/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "America/Havana"} */
import { dstResolutionSuite } from './dstResolutionSuite';

dstResolutionSuite('America/Havana');
