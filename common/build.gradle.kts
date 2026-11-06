plugins {
    `java-library`
}

java {
    toolchain {
        languageVersion.set(org.gradle.jvm.toolchain.JavaLanguageVersion.of(rootProject.extra["java_version"] as Int))
    }
}

dependencies {
    compileOnly("com.inductiveautomation.ignitionsdk:ignition-common:${rootProject.extra["sdk_version"]}")
    // Perspective component descriptor / BrowserResource APIs.
    compileOnly("com.inductiveautomation.ignitionsdk:perspective-common:${rootProject.extra["sdk_version"]}")
}
