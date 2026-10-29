# Tag model and helpers behind the Screensaver demo and e2e pages. Called from
# the Overview view: setupTags() on startup (idempotent, collision policy "m"
# merges), the buttons for the rest.
#
#   [default]Screensaver/LineRate        units/min, drives the starfield speed
#   [default]Screensaver/Line1State      running | idle | warning | fault | off, colours pipe 1
#   [default]Screensaver/Alarms/<Prio>   Boolean; True raises an alarm of that priority
#
# The alarm buttons write after a delay so a test (or a person at a trade-fair
# stand) can let the page go idle first: clicking a button is input and resets
# the idle timer.

BASE = "[default]Screensaver"
PRIORITIES = ["Diagnostic", "Low", "Medium", "High", "Critical"]
LABELS = {
    "Diagnostic": "Historian buffer above 50 %",
    "Low": "Line 1 label printer ribbon low",
    "Medium": "Line 1 glue temperature drifting",
    "High": "Line 1 infeed jam",
    "Critical": "Boiler house pressure high",
}

log = system.util.getLogger("MustryScreensaver.verify")


def alarmTag(priority):
    return {
        "name": priority,
        "tagType": "AtomicTag",
        "valueSource": "memory",
        "dataType": "Boolean",
        "value": False,
        "alarms": [{
            "name": priority + " alarm",
            "mode": "Equality",
            "setpointA": 1,
            "priority": priority,
            "label": LABELS[priority],
            "displayPath": "Packaging hall/" + LABELS[priority],
        }],
    }


def setupTags():
    tags = [
        {"name": "LineRate", "tagType": "AtomicTag", "valueSource": "memory", "dataType": "Float8", "value": 42.0,
         "engUnit": "units/min"},
        {"name": "Line1State", "tagType": "AtomicTag", "valueSource": "memory", "dataType": "String", "value": "running"},
        {"name": "Alarms", "tagType": "Folder", "tags": [alarmTag(p) for p in PRIORITIES]},
    ]
    # "m" merges: an existing tag keeps its value, so a running demo is not reset.
    r = system.tag.configure("[default]", [{"name": "Screensaver", "tagType": "Folder", "tags": tags}], "m")
    bad = [str(x) for x in r if not x.isGood()]
    if bad:
        log.warn("Screensaver tag model: %s" % ",".join(bad))


def raiseLater(priority, delaySec):
    """Set the alarm tag of this priority after delaySec, from a gateway thread."""
    path = "%s/Alarms/%s" % (BASE, priority)

    def run():
        import time
        time.sleep(float(delaySec))
        system.tag.writeBlocking([path], [True])
        log.info("raised %s" % path)

    system.util.invokeAsynchronous(run)


def clearAll():
    system.tag.writeBlocking(["%s/Alarms/%s" % (BASE, p) for p in PRIORITIES], [False] * len(PRIORITIES))


def setRate(rate):
    system.tag.writeBlocking([BASE + "/LineRate"], [float(rate)])


def setState(state):
    system.tag.writeBlocking([BASE + "/Line1State"], [str(state)])
