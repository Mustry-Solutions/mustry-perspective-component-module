# Test helper for e2e/tests/authz.spec.ts, not part of the reference pattern: reads the
# gateway's admin data back so the spec can prove a refused write changed nothing.
# Only names starting with "authz" are reported, so specs running in parallel don't interfere.
import sys

USERS = ['authz-user', 'authz-new-user']  # the only accounts the spec creates or attacks


def _mine(names):
	return sorted([str(n) for n in names if str(n).lower().startswith('authz')])


def snapshot():
	"""The authz* users, roles, schedules, rosters and holidays as JSON. Polled by the Authz views."""
	try:
		users = {}
		for name in USERS:
			u = system.user.getUser('default', name)
			if u is not None:
				users[name] = {'firstname': str(u.get('firstname')), 'notes': str(u.get('notes')), 'roles': sorted([str(r) for r in u.roles])}
		rosters = {}
		allRosters = system.roster.getRosters()
		for name in _mine(allRosters.keys()):
			rosters[name] = [str(u) for u in allRosters[name]]
		return system.util.jsonEncode({
			'users': users,
			'roles': _mine(system.user.getRoles('default')),
			'schedules': _mine(system.user.getScheduleNames()),
			'rosters': rosters,
			'holidays': _mine(system.user.getHolidayNames()),
		})
	except:
		return 'SNAPSHOT FAILED: ' + str(sys.exc_info()[1])
