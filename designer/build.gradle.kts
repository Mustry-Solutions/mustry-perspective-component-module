plugins {
    `java-library`
}

java {
    toolchain {
        languageVersion.set(org.gradle.jvm.toolchain.JavaLanguageVersion.of(rootProject.extra["java_version"] as Int))
    }
}

dependencies {
    compileOnly("com.inductiveautomation.ignitionsdk:designer-api:${rootProject.extra["sdk_version"]}")
    compileOnly("com.inductiveautomation.ignitionsdk:ignition-common:${rootProject.extra["sdk_version"]}")
    compileOnly("com.inductiveautomation.ignitionsdk:perspective-common:${rootProject.extra["sdk_version"]}")
    compileOnly("com.inductiveautomation.ignitionsdk:perspective-designer:${rootProject.extra["sdk_version"]}")
    compileOnly(project(":common"))
}
