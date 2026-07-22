import { ComponentMeta, ComponentRegistry } from '@inductiveautomation/perspective-client';
import { DateTimeRangePicker, DateTimeRangePickerMeta } from './components/picker/DateTimeRangePicker';
import { Calendar, CalendarMeta } from './components/calendar/Calendar';
import { ResourceTimeline, ResourceTimelineMeta } from './components/timeline/ResourceTimeline';
import { DataGrid, DataGridMeta } from './components/grid/DataGrid';
import { PanZoomView, PanZoomViewMeta } from './components/panzoom/PanZoomView';
import { RichTextEditor, RichTextEditorMeta } from './components/richtext/RichTextEditor';
import { CodeEditor, CodeEditorMeta } from './components/code/CodeEditor';
import { ColorPicker, ColorPickerMeta } from './components/color/ColorPicker';
import { OnScreenKeyboard, OnScreenKeyboardMeta } from './components/keyboard/OnScreenKeyboard';
import { ScheduleManager, ScheduleManagerMeta } from './components/schedule/ScheduleManager';
import { RosterManager, RosterManagerMeta } from './components/roster/RosterManager';
import { UserManager, UserManagerMeta } from './components/users/UserManager';

import './scss/picker.scss';
import './scss/calendar.scss';
import './scss/timeline.scss';
import './scss/grid.scss';
import './scss/panzoom.scss';
import './scss/richtext.scss';
import './scss/code.scss';
import './scss/color.scss';
import './scss/keyboard.scss';
import './scss/schedule.scss';
import './scss/roster.scss';
import './scss/users.scss';
import './scss/commit.scss';

export { DateTimeRangePicker, Calendar, ResourceTimeline, DataGrid, PanZoomView, RichTextEditor, CodeEditor, ColorPicker, OnScreenKeyboard, ScheduleManager, RosterManager, UserManager };

// Register every component this module provides with the Perspective client registry.
const components: Array<ComponentMeta> = [
    new DateTimeRangePickerMeta(),
    new CalendarMeta(),
    new ResourceTimelineMeta(),
    new DataGridMeta(),
    new PanZoomViewMeta(),
    new RichTextEditorMeta(),
    new CodeEditorMeta(),
    new ColorPickerMeta(),
    new OnScreenKeyboardMeta(),
    new ScheduleManagerMeta(),
    new RosterManagerMeta(),
    new UserManagerMeta()
];

components.forEach((c: ComponentMeta) => ComponentRegistry.register(c));
