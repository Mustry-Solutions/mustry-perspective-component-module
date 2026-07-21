pluginManagement {
    repositories {
        gradlePluginPortal()
        maven {
            url = uri("https://nexus.inductiveautomation.com/repository/public")
        }
    }
}

rootProject.name = "mustry-ingots"

dependencyResolutionManagement {
    repositories {
        // enable resolving dependencies from the inductive automation artifact repository
        maven {
            url = uri("https://nexus.inductiveautomation.com/repository/public")
        }
        mavenCentral()
    }
}

include(
    ":common",
    ":gateway",
    ":designer",
    ":web"
)
