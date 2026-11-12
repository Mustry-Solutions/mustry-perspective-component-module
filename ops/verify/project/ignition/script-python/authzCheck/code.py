# Test helper for e2e/tests/authz.spec.ts, not part of the reference pattern: reads the
# gateway's admin data back so the spec can prove a refused write changed nothing.
# Only names starting with "zauthz" are reported, so the spec's before/after comparisons ignore
# other data. That only holds if no other spec uses that prefix on this shared gateway. "kept"
# is the exception: whether the records the spec must never remove are still there.
import sys

USERS = ['zauthz-user', 'zauthz-new-user', 'zauthz-admin', 'zauthz-super', 'zauthz-op']  # the only accounts the spec creates or attacks


def _mine(names):
	return sorted([unicode(n) for n in names if unicode(n).lower().startswith('zauthz')])


def _odd(names):
	"""Names the spec's refused cases would create, which the zauthz prefix can't catch."""
	return sorted([unicode(n) for n in names if adminAuth.nameProblem(n)])


def snapshot():
	"""The zauthz* users, roles, schedules, rosters and holidays as JSON. Polled by the Authz views."""
	try:
		users = {}
		for name in USERS:
			u = system.user.getUser('default', name)
			if u is not None:
				users[name] = {'firstname': unicode(u.get('firstname')), 'notes': unicode(u.get('notes')), 'roles': sorted([unicode(r) for r in u.roles])}
		allRoles = [unicode(r) for r in system.user.getRoles('default')]
		rosters = {}
		allRosters = system.roster.getRosters()
		for name in _mine(allRosters.keys()):
			rosters[name] = [unicode(u) for u in allRosters[name]]
		return system.util.jsonEncode({
			'users': users,
			'roles': _mine(allRoles),
			'schedules': _mine(system.user.getScheduleNames()),
			'rosters': rosters,
			'holidays': _mine(system.user.getHolidayNames()),
			# Every badly named record, whatever its prefix: a refused-name test must leave this alone.
			'odd': _odd([u.get('username') for u in system.user.getUsers('default')] + list(allRoles)
				+ list(system.user.getScheduleNames()) + list(allRosters.keys()) + list(system.user.getHolidayNames())),
			'kept': {
				'admin': system.user.getUser('default', 'admin') is not None,
				'Administrator': 'Administrator' in allRoles,
				'Supervisor': 'Supervisor' in allRoles,
			},
		})
	except:
		return 'SNAPSHOT FAILED: ' + unicode(sys.exc_info()[1])
