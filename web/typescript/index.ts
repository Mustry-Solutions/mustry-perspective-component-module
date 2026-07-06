import { ComponentMeta, ComponentRegistry } from '@inductiveautomation/perspective-client';
import { DateTimeRangePicker, DateTimeRangePickerMeta } from './components/DateTimeRangePicker';
import { Calendar, CalendarMeta } from './components/Calendar';
import { ResourceTimeline, ResourceTimelineMeta } from './components/timeline/ResourceTimeline';
import { DataGrid, DataGridMeta } from './components/grid/DataGrid';

import './scss/main.scss';
import './scss/calendar.scss';
import './scss/timeline.scss';
import './scss/grid.scss';

export { DateTimeRangePicker, Calendar, ResourceTimeline, DataGrid };

// Register every component this module provides with the Perspective client registry.
const components: Array<ComponentMeta> = [
    new DateTimeRangePickerMeta(),
    new CalendarMeta(),
    new ResourceTimelineMeta(),
    new DataGridMeta()
];

components.forEach((c: ComponentMeta) => ComponentRegistry.register(c));
