import { ComponentMeta, ComponentRegistry } from '@inductiveautomation/perspective-client';
import { DateTimeRangePicker, DateTimeRangePickerMeta } from './components/picker/DateTimeRangePicker';
import { Calendar, CalendarMeta } from './components/calendar/Calendar';
import { ResourceTimeline, ResourceTimelineMeta } from './components/timeline/ResourceTimeline';
import { DataGrid, DataGridMeta } from './components/grid/DataGrid';
import { PanZoomView, PanZoomViewMeta } from './components/panzoom/PanZoomView';
import { RichTextEditor, RichTextEditorMeta } from './components/richtext/RichTextEditor';
import { CodeEditor, CodeEditorMeta } from './components/code/CodeEditor';
import { Dashboard, DashboardMeta } from './components/dashboard/Dashboard';

import './scss/picker.scss';
import './scss/calendar.scss';
import './scss/timeline.scss';
import './scss/grid.scss';
import './scss/panzoom.scss';
import './scss/richtext.scss';
import './scss/code.scss';
import './scss/dashboard.scss';
import './scss/commit.scss';

export { DateTimeRangePicker, Calendar, ResourceTimeline, DataGrid, PanZoomView, RichTextEditor, CodeEditor, Dashboard };

// Register every component this module provides with the Perspective client registry.
const components: Array<ComponentMeta> = [
    new DateTimeRangePickerMeta(),
    new CalendarMeta(),
    new ResourceTimelineMeta(),
    new DataGridMeta(),
    new PanZoomViewMeta(),
    new RichTextEditorMeta(),
    new CodeEditorMeta(),
    new DashboardMeta()
];

components.forEach((c: ComponentMeta) => ComponentRegistry.register(c));
