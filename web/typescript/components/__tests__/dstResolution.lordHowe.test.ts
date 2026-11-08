/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "Australia/Lord_Howe"} */
import { dstResolutionSuite } from './dstResolutionSuite';

dstResolutionSuite('Australia/Lord_Howe');
