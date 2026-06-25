import { ComponentMeta, ComponentRegistry } from '@inductiveautomation/perspective-client';
import { DateTimeRangePicker, DateTimeRangePickerMeta } from './components/DateTimeRangePicker';

import './scss/main.scss';

export { DateTimeRangePicker };

// Register every component this module provides with the Perspective client registry.
const components: Array<ComponentMeta> = [
    new DateTimeRangePickerMeta()
];

components.forEach((c: ComponentMeta) => ComponentRegistry.register(c));
