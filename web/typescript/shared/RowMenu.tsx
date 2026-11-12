import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { ConfirmButton } from './ConfirmButton';

interface RowMenuProps {
    /** Accessible name of the ⋯ button ("More actions <item>"). */
    moreActionsLabel: string;
    duplicateLabel: string;
    deleteLabel: string;
    confirmDeleteLabel: string;
    showDuplicate: boolean;
    showDelete: boolean;
    onDuplicate: () => void;
    onDelete: () => void;
}

interface RowMenuState {
    open: boolean;
    top: number;
    left: number;
    confirming: boolean;
    /** The opening manager's theme, carried into the portal (see themeOf). */
    theme: React.CSSProperties;
}

/** How long the menu's delete stays in its confirm step before reverting. */
const CONFIRM_DELETE_MS = 4000;

/** The admin theme variables the popup's styles read. */
const THEME_VARS = ['--adm-accent-soft', '--adm-text', '--adm-border', '--adm-bg', '--adm-danger'];

/** The manager's resolved theme at `el`: the portalled popup sits outside the
 *  manager's root, so an author's per-component --adm-* override (or the font)
 *  would otherwise fall back to the defaults. */
function themeOf(el: HTMLElement): React.CSSProperties {
    const cs = window.getComputedStyle(el);
    const theme: { [k: string]: string } = { fontFamily: cs.fontFamily };
    THEME_VARS.forEach((v) => {
        const value = cs.getPropertyValue(v).trim();
        if (value) {
            theme[v] = value;
        }
    });
    return theme as React.CSSProperties;
}

/**
 * The rail rows' ⋯ menu (Duplicate / two-step Delete). The button is
 * CSS-revealed on row hover and on the SELECTED row (so touch users reach it
 * with one tap — hover-only affordances don't exist on touch). The popover is
 * position:fixed from the button's rect, portalled to document.body so neither
 * the rail's overflow can clip it nor a sibling component later in the view
 * paint over it and take its clicks (#254); any scroll/resize/outside-click/
 * Escape closes it. React events still bubble through the portal to the span,
 * which stops clicks and keys, so neither selects the row
 * underneath. Opened from the keyboard, focus moves into the popup and Escape
 * brings it back to the button.
 */
export class RowMenu extends React.Component<RowMenuProps, RowMenuState> {

    private btnEl: HTMLButtonElement | null = null;
    private popEl: HTMLDivElement | null = null;
    private confirmTimer: number | null = null;

    constructor(props: RowMenuProps) {
        super(props);
        this.state = { open: false, top: 0, left: 0, confirming: false, theme: {} };
    }

    componentWillUnmount(): void {
        this.close();
    }

    private setBtnEl = (el: HTMLButtonElement | null): void => { this.btnEl = el; };
    private setPopEl = (el: HTMLDivElement | null): void => { this.popEl = el; };

    private toggle = (e: React.MouseEvent): void => {
        e.stopPropagation(); // never select the row underneath
        if (this.state.open) {
            this.close();
            return;
        }
        const rect = this.btnEl!.getBoundingClientRect();
        const width = 150;
        // Opened from the keyboard (a click with no pointer): the popup sits at the end of
        // document.body, out of the Tab order, so focus moves into it.
        const fromKeyboard = e.detail === 0;
        this.setState({
            open: true, confirming: false, theme: themeOf(this.btnEl!),
            top: rect.bottom + 2,
            left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
        }, () => {
            const first = fromKeyboard && this.popEl ? this.popEl.querySelector('button') : null;
            if (first) {
                first.focus();
            }
        });
        window.addEventListener('mousedown', this.onOutside, true);
        window.addEventListener('keydown', this.onKeyDown, true);
        window.addEventListener('scroll', this.closeListener, true);
        window.addEventListener('resize', this.closeListener, true);
    };

    private close(): void {
        window.removeEventListener('mousedown', this.onOutside, true);
        window.removeEventListener('keydown', this.onKeyDown, true);
        window.removeEventListener('scroll', this.closeListener, true);
        window.removeEventListener('resize', this.closeListener, true);
        this.clearConfirmTimer();
        if (this.state.open) {
            this.setState({ open: false, confirming: false });
        }
    }

    private closeListener = (): void => this.close();

    private onOutside = (e: MouseEvent): void => {
        const t = e.target as Node;
        if ((this.popEl && this.popEl.contains(t)) || (this.btnEl && this.btnEl.contains(t))) {
            return;
        }
        this.close();
    };

    private onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            const hadFocus = !!this.popEl && this.popEl.contains(document.activeElement);
            this.close();
            if (hadFocus && this.btnEl) {
                this.btnEl.focus();
            }
        }
    };

    /** The row's Enter/Space handler selects it and cancels the press, which made the ⋯
     *  button and the items unusable from the keyboard: keep keys inside the menu. Popup
     *  keys reach this span too, since React bubbles through the portal. */
    private stopKeys = (e: React.KeyboardEvent): void => {
        e.stopPropagation();
    };

    private clearConfirmTimer(): void {
        if (this.confirmTimer !== null) {
            window.clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
    }

    private onDuplicate = (e: React.MouseEvent): void => {
        e.stopPropagation();
        this.close();
        this.props.onDuplicate();
    };

    private onDelete = (): void => {
        if (!this.state.confirming) {
            this.setState({ confirming: true });
            this.clearConfirmTimer();
            this.confirmTimer = window.setTimeout(() => this.setState({ confirming: false }), CONFIRM_DELETE_MS);
            return;
        }
        this.close();
        this.props.onDelete();
    };

    render(): React.ReactNode {
        if (!this.props.showDuplicate && !this.props.showDelete) {
            return null;
        }
        return (
            <span className={'mustry-row-menu' + (this.state.open ? ' mustry-row-menu--open' : '')} onClick={(e) => e.stopPropagation()} onKeyDown={this.stopKeys}>
                <button
                    type="button"
                    ref={this.setBtnEl}
                    className="mustry-row-menu-btn"
                    title={this.props.moreActionsLabel}
                    aria-label={this.props.moreActionsLabel}
                    aria-haspopup="menu"
                    aria-expanded={this.state.open}
                    onClick={this.toggle}
                >
                    ⋯
                </button>
                {this.state.open && ReactDOM.createPortal(
                    <div
                        ref={this.setPopEl}
                        className="mustry-row-menu-pop"
                        role="menu"
                        style={{ ...this.state.theme, position: 'fixed', top: this.state.top, left: this.state.left }}
                    >
                        {this.props.showDuplicate && (
                            <button type="button" role="menuitem" className="mustry-row-menu-item" onClick={this.onDuplicate}>
                                {this.props.duplicateLabel}
                            </button>
                        )}
                        {this.props.showDelete && (
                            <ConfirmButton
                                label={this.props.deleteLabel}
                                confirmLabel={this.props.confirmDeleteLabel}
                                confirming={this.state.confirming}
                                className="mustry-row-menu-item mustry-row-menu-item--danger"
                                confirmingClassName="mustry-row-menu-item--confirm"
                                onClick={this.onDelete}
                            />
                        )}
                    </div>,
                    document.body
                )}
            </span>
        );
    }
}
