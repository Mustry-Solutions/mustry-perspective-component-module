import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';

// Must match DateTimeRangePicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.datetimerangepicker';

export interface DateTimeRangePickerProps {
    startDate: string;
    endDate: string;
}

/**
 * A minimal editable start/end date-time range picker built on native
 * <input type="datetime-local"> controls. Edits are written back to the
 * component's props so they're available to bindings/scripting.
 */
export class DateTimeRangePicker extends Component<ComponentProps<DateTimeRangePickerProps>, {}> {

    writeProp = (name: keyof DateTimeRangePickerProps, value: string): void => {
        this.props.store.props.write(name, value);
    };

    render() {
        const { props: { startDate, endDate }, emit } = this.props;

        return (
            <div {...emit({ classes: ['mustry-datetime-range-picker'] })}>
                <label className="dtrp-field">
                    <span className="dtrp-label">Start</span>
                    <input
                        type="datetime-local"
                        className="dtrp-input"
                        value={startDate || ''}
                        onChange={(e) => this.writeProp('startDate', e.target.value)}
                    />
                </label>
                <span className="dtrp-separator">to</span>
                <label className="dtrp-field">
                    <span className="dtrp-label">End</span>
                    <input
                        type="datetime-local"
                        className="dtrp-input"
                        value={endDate || ''}
                        onChange={(e) => this.writeProp('endDate', e.target.value)}
                    />
                </label>
            </div>
        );
    }
}

export class DateTimeRangePickerMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return DateTimeRangePicker;
    }

    getDefaultSize(): Size2d {
        return { width: 360, height: 80 };
    }

    getPropsReducer(tree: PropertyTree): DateTimeRangePickerProps {
        return {
            startDate: tree.readString('startDate', ''),
            endDate: tree.readString('endDate', '')
        };
    }
}
