# Who may write through the Admin-family event scripts. Copy this file into your project.
#
# The capability flags on the Schedule, Roster, User and Holiday Managers (editable,
# allowCreate, allowDelete, allowPasswordChange, allowRoleManagement) only hide controls
# in the browser. They are NOT a security boundary: a client with a session on the page
# can send a component's events with any payload without touching the UI. So the event
# script has to decide, on the gateway, and that takes both of these:
#
#   1. Call refusal() before every write, as the reference event scripts do.
#   2. In the view, set the access of each manager's props.config to PROTECTED. Otherwise
#      a client can rewrite the very flag that refusal() re-reads.
#
# Treat everything in `event` as untrusted, including isNew: work out what a write really
# does from gateway state.
#
# This guards event scripts only. Flags and role checks don't protect reads: whatever a
# binding puts in a prop, such as the contact details and roles in data.users, goes to every
# session that can open the view. A write made outside an event script isn't guarded either,
# and that includes a binding transform. Page security levels limit who can open a page, but
# they don't replace this check, and the reference views don't use them. Use TLS as well.
#
# WRITE_ROLES can edit any user's profile, including an Administrator's contact details and
# schedule, which decide where and when alarm notifications reach that person. If that doesn't
# suit your project, tighten onUserSave.

# Change these to your project's roles.
WRITE_ROLES = ['Administrator', 'Supervisor']  # schedules, rosters, holidays, user profiles
SECURITY_ROLES = ['Administrator']  # creating or deleting users, passwords, role assignment, the role catalog

# DEMO ONLY: delete this and its use below in a real project. These sample projects don't
# ask anyone to log in, so an anonymous session can write from exactly these views, to keep
# their screens working out of the box. That is a full takeover of the gateway's user source:
# anyone who can reach such a view without logging in can set admin's password. Never expose
# these projects on a network you don't fully trust. The dev gateway's docker-compose.yml
# publishes its ports on all interfaces, not just localhost.
#
# A logged-in user never gets this exemption. Neither does any other view or project, so a copy
# in your project refuses anonymous writes even if you forget to delete it, UNLESS your names
# match: a project named "demo" with a view named "Admin" is on this list.
DEMO_ANONYMOUS_VIEWS = {
	'verify': ['UserDemo', 'ScheduleDemo', 'RosterDemo', 'HolidayDemo', 'AdminConsole', 'AuthzOpen', 'AuthzReadOnly', 'AuthzFlagsOff'],
	'demo': ['Admin'],
}


def refusal(component, flags, roles=WRITE_ROLES):
	"""Why this write must be refused, or None if it may go ahead.

	It may go ahead only if every named flag is on, read here on the gateway, and the
	session user holds one of roles. Anything unexpected refuses (fail closed).
	"""
	try:
		for flag in flags:
			if getattr(component.props.config, flag) != True:
				return _refuse('config.%s is off' % flag)
		auth = component.session.props.auth
		if auth.authenticated == True:
			if set([unicode(r) for r in auth.user.roles or []]) & set(roles):
				return None
		elif unicode(component.view.id).split('@')[0] in DEMO_ANONYMOUS_VIEWS.get(system.project.getProjectName(), []):
			return None
		return _refuse('requires one of the roles ' + ', '.join(roles))
	except:
		return _refuse('the authorization check failed')


# Characters that break a name across lines or hide in it: C0 and C1 controls, the line and
# paragraph separators, zero-width and bidi formatting marks, and the byte-order mark.
_INVISIBLE = set([unichr(c) for c in range(0, 32) + range(127, 160) + range(0x200b, 0x2010)
	+ range(0x202a, 0x202f) + range(0x2066, 0x206a) + [0x2028, 0x2029, 0xfeff]])


def nameProblem(name):
	"""Why name can't be the name of a new user, role, schedule, holiday or roster, or None.

	The managers check a name only in the browser, so a crafted event skips that. The gateway
	itself accepts an empty name, one with a line break, and '..'. A slash is allowed: names
	like "24/7" are real.
	"""
	name = unicode(name or '')
	if not name.strip():
		return 'the name is empty'
	if name != name.strip():
		return 'the name starts or ends with a space'
	if [c for c in name if c in _INVISIBLE]:
		return 'the name contains a line break or an invisible character'
	if not name.strip('.'):
		return 'the name is only dots'
	return None


def _refuse(reason):
	system.util.getLogger('adminAuth').warn('Refused an admin write: ' + reason)
	return reason
