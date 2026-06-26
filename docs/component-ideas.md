# Component ideas / backlog

Candidate Perspective components to build next, ranked by **validated user demand**
(Inductive Automation forum + Ideas/Canny portal vote counts + third-party modules
filling the gap). Researched June 2026.

Framing: Perspective 8.3 is already fairly rich. **Already native — do NOT build:**
Map/GIS (Leaflet + Google), Signature Pad, PDF Viewer, File Upload, multiselect/
typeahead Dropdown, basic Date/Time pickers, Inline Frame, basic heatmap (XY Chart).

General approach for most of these: **wrap a battle-tested React library** as a
themed Perspective component. We already have the hard parts solved (webpack/React
build, CSS-variable theming, component events, pure-logic + Jest pattern, live
verification harness), so the work is mostly the prop schema + binding contract +
theming. Suggested libraries noted per item.

## High demand

| Component | What people want | Native today | Lib |
|---|---|---|---|
| **Calendar / Scheduler** | Month/week/day/agenda calendar with event create/drag/resize; shift & maintenance schedules. Ideas portal: **44 votes, "Planned"** (IA surveyed users in 2023). | None (Equipment Schedule is timeline/MES-only) | FullCalendar |
| **Editable data grid** | Excel-like: cell editing, validation, per-column edit permissions, write-back to DB, frozen columns, grouping. Largest raw thread volume. | Partial — Table edits but hits limits fast | AG-Grid (community) |
| **Rich text / WYSIWYG editor** | Edit *formatted* text for SOPs/notes/work orders. "Markdown styles but can't edit; text input can't style." Zero native coverage. | None (Markdown is display-only) | TipTap / Quill |
| **Touchscreen on-screen keyboard / numpad** | On-screen entry for Workstation HMIs; persistent 2019→2024 pain. | None native | (custom) |

## Medium demand

| Component | What people want | Native today | Lib |
|---|---|---|---|
| **Gantt / production timeline** | First-class interactive Gantt (draggable bars). Today people fake it with the XY chart. | Poor (XY-chart hack) | FullCalendar resource-timeline / DHTMLX |
| **Advanced charts** | Sankey, Waterfall, Pareto, funnel. Third parties (Nivo, ApexCharts modules) already fill this. | Heatmap yes; these no | ECharts |
| **Flow / node-graph editor** | React-Flow-style interactive node graphs / flow charts. Explicitly asked in 8.3 EA. | None (8.3 Drawing Editor is static SVG) | React Flow |
| **Fancy gauges / KPI widgets** | Circular/bar gauges, circular sliders. Commercially validated (multiple paid/Exchange modules). | Partial (basic gauges) | ECharts gauge |
| **Drag-and-drop layout** | Operator-configurable dashboards. A commercial third-party module exists. | Partial (Dashboard tile) | (custom) |

## Emerging / niche

| Component | What people want | Native today | Lib |
|---|---|---|---|
| **Code / JSON editor** | In-Perspective code/JSON editing for config-driven apps. | None | CodeMirror 6 / Monaco |
| **File upload with preview** | Preview/thumbnail the uploaded file (esp. images) after upload. | Partial (upload only) | (custom) |
| **Lazy/filterable tag tree** | Faster, filterable, lazy-loading tag browser. Native one is "barebones," slow on big sets. | Partial, criticized | (custom) |
| **Report viewer** | Port of Vision's interactive Report Viewer into Perspective. | Partial/awkward (PDF export only) | (heavy) |

## Sources
- Perspective Calendar idea (44 votes, Planned): https://inductiveautomation.canny.io/ignition-features-and-ideas/p/perspective-calendar
- Perspective Gantt idea: https://inductiveautomation.canny.io/ignition-features-and-ideas/p/perspective-gantt-chart
- Rich-text editor threads: https://forum.inductiveautomation.com/t/rich-text-editor-interface-in-perspective/60015 , https://forum.inductiveautomation.com/t/markdown-editor-with-text-input/103873
- Editable table feature request: https://forum.inductiveautomation.com/t/feature-14187-perspective-table-edit-enable-disable/25396
- On-screen keyboard threads: https://forum.inductiveautomation.com/t/feature-perspective-workstation-show-numeric-text-input-on-screen-keyboard-for-touchscreens/41741
- Sankey/calendar community module: https://forum.inductiveautomation.com/t/sankey-chart-and-github-calendar-for-perspective/81640
- ApexCharts module: https://github.com/Kyvis-Labs/ignition-apexcharts-module
- React Flow request: https://forum.inductiveautomation.com/t/react-flow-node-tool/106462

## Current pick

A focused build plan for the **Calendar / Scheduler** is in
[`calendar-component-plan.md`](calendar-component-plan.md).
