> [!WARNING]
> **Beta build, not for production.** This module is built against the Ignition
> `@SDK@` SDK and only targets Ignition 2027 beta gateways. Inductive Automation
> says not to upgrade production gateways to 2027 before its final release.

**Installing it.** Use this file only on an Ignition `@SDK@` gateway. Ignition
gates modules on the year version, so it refuses this build on 8.3, and 8.3 builds
of this module on 2027. For 8.3, use the [latest release](https://github.com/Mustry-Solutions/mustry-perspective-component-module/releases/latest).

**Later Ignition betas.** It may stop working on a later 2027 beta, since the
platform can still change. Each Ignition beta gets its own build here.

**What was tested.** The automated browser suite ran on this Ignition beta. The
touch checklists in `docs/*-manual-test.md` have not been run on real hardware.

Please report problems as a GitHub issue and name your Ignition version.
