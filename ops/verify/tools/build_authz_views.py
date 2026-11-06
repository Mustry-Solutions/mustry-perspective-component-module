#!/usr/bin/env python3
"""Generate the views e2e/tests/authz.spec.ts fires crafted events at.

Each view holds all four admin managers with the event scripts copied verbatim from
AdminConsole, so the spec tests the real reference scripts rather than a copy that can drift.
Run from the repo root after changing those scripts, and commit the output:

    python3 ops/verify/tools/build_authz_views.py

    AuthzOpen      all flags on, anonymous sessions exempted from the role check (the control)
    AuthzReadOnly  editable off, the rest on, anonymous sessions exempted
    AuthzFlagsOff  editable on, the rest off, anonymous sessions exempted
    AuthzNoRole    all flags on, NOT exempted: an anonymous session holds no role
"""
import json
import pathlib

VIEWS = pathlib.Path('ops/verify/project/com.inductiveautomation.perspective/views')
PREFIX = 'mustrysolutions.perspective.admin.'
OTHER_FLAGS = ['allowCreate', 'allowDelete']
USER_FLAGS = ['allowPasswordChange', 'allowRoleManagement']


def managers(node, found):
    """Every admin manager under node, in document order."""
    if isinstance(node, dict):
        if str(node.get('type', '')).startswith(PREFIX):
            found.append(node)
        for value in node.values():
            managers(value, found)
    elif isinstance(node, list):
        for value in node:
            managers(value, found)
    return found


def label(name, dom_id, prop_config):
    return {
        'type': 'ia.display.label',
        'meta': {'name': name, 'domId': dom_id},
        'position': {'basis': '60px', 'shrink': 0},
        'propConfig': prop_config,
    }


def build(name, editable, others, source):
    children = []
    for manager in source:
        flags = OTHER_FLAGS + (USER_FLAGS if manager['type'].endswith('usermanager') else [])
        children.append({
            'type': manager['type'],
            'meta': {'name': manager['meta']['name']},
            'position': {'basis': '120px', 'shrink': 0},
            'props': {'config': {'editable': editable, **{flag: others for flag in flags}}},
            'propConfig': {'props.config': {'access': 'PROTECTED'}},
            'events': manager['events'],
        })
    children.append(label('eventLabel', 'authz-event', {'props.text': {'binding': {
        'type': 'property', 'config': {'path': 'view.custom.lastEvent'}}}}))
    children.append(label('snapshot', 'authz-snapshot', {'props.text': {'binding': {
        'type': 'expr', 'config': {'expression': 'runScript("authzCheck.snapshot", 500)'}}}}))
    # Read-outs for the raw-frame tests. These bindings run on the gateway, so the text
    # shows what the gateway holds, whatever the client's own copy of the prop says.
    for label_name, dom_id, expression in [
        ('flagReadout', 'authz-gateway-flag', '{../usermgr.props.config.allowDelete}'),
        ('publicReadout', 'authz-gateway-public', '{../usermgr.props.state.selectedUser}'),
        ('sessionReadout', 'authz-gateway-session', '"auth=" + {session.props.auth.authenticated} + " theme=" + {session.props.theme} + " geo=" + {session.props.geolocation.enabled}'),
    ]:
        children.append(label(label_name, dom_id, {'props.text': {'binding': {
            'type': 'expr', 'config': {'expression': expression}}}}))
    view = {
        'custom': {'lastEvent': '', 'refreshTick': 0},
        'params': {},
        'props': {'defaultSize': {'width': 960, 'height': 800}},
        'root': {
            'type': 'ia.container.flex',
            'meta': {'name': 'root'},
            'props': {'direction': 'column'},
            'children': children,
        },
    }
    folder = VIEWS / name
    folder.mkdir(exist_ok=True)
    (folder / 'view.json').write_text(json.dumps(view, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    (folder / 'resource.json').write_text((VIEWS / 'AdminConsole' / 'resource.json').read_text(encoding='utf-8'), encoding='utf-8')


def main():
    source = managers(json.loads((VIEWS / 'AdminConsole' / 'view.json').read_text(encoding='utf-8')), [])
    assert len(source) == 4, 'expected the four admin managers in AdminConsole'
    build('AuthzOpen', True, True, source)
    build('AuthzReadOnly', False, True, source)
    build('AuthzFlagsOff', True, False, source)
    build('AuthzNoRole', True, True, source)


if __name__ == '__main__':
    main()
