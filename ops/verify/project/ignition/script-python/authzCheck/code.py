# Test helper for e2e/tests/authz.spec.ts, not part of the reference pattern: reads the
# gateway's admin data back so the spec can prove a refused write changed nothing.
# Only names starting with "zauthz" are reported, so the spec's before/after comparisons ignore
# other data. That only holds if no other spec uses that prefix on this shared gateway. "kept"
# is the exception: whether the records the spec must never remove are still there.
import sys

USERS = ['zauthz-user', 'zauthz-new-user', 'zauthz-admin', 'zauthz-super', 'zauthz-op']  # the only accounts the spec creates or attacks


def _mine(names):
	return sorted([str(n) for n in names if str(n).lower().startswith('zauthz')])


def snapshot():
	"""The zauthz* users, roles, schedules, rosters and holidays as JSON. Polled by the Authz views."""
	try:
		users = {}
		for name in USERS:
			u = system.user.getUser('default', name)
			if u is not None:
				users[name] = {'firstname': str(u.get('firstname')), 'notes': str(u.get('notes')), 'roles': sorted([str(r) for r in u.roles])}
		allRoles = [str(r) for r in system.user.getRoles('default')]
		rosters = {}
		allRosters = system.roster.getRosters()
		for name in _mine(allRosters.keys()):
			rosters[name] = [str(u) for u in allRosters[name]]
		return system.util.jsonEncode({
			'users': users,
			'roles': _mine(allRoles),
			'schedules': _mine(system.user.getScheduleNames()),
			'rosters': rosters,
			'holidays': _mine(system.user.getHolidayNames()),
			'kept': {
				'admin': system.user.getUser('default', 'admin') is not None,
				'Administrator': 'Administrator' in allRoles,
				'Supervisor': 'Supervisor' in allRoles,
			},
		})
	except:
		return 'SNAPSHOT FAILED: ' + str(sys.exc_info()[1])
