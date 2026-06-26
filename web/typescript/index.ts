import { ComponentMeta, ComponentRegistry } from '@inductiveautomation/perspective-client';
import { DateTimeRangePicker, DateTimeRangePickerMeta } from './components/DateTimeRangePicker';
import { Calendar, CalendarMeta } from './components/Calendar';

import './scss/main.scss';
import './scss/calendar.scss';

export { DateTimeRangePicker, Calendar };

// Register every component this module provides with the Perspective client registry.
const components: Array<ComponentMeta> = [
    new DateTimeRangePickerMeta(),
    new CalendarMeta()
];

components.forEach((c: ComponentMeta) => ComponentRegistry.register(c));
