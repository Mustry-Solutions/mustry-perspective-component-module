import com.github.gradle.node.npm.task.NpmTask

plugins {
    java
    id("com.github.node-gradle.node") version "7.1.0"
}

// Where webpack writes the built bundle; this whole dir becomes module resources.
val projectOutput: Provider<Directory> = layout.buildDirectory.dir("generated-resources")

node {
    // A pinned Node is downloaded for the build, independent of any system Node.
    version.set("18.20.4")
    download.set(true)
    nodeProjectDir.set(file(project.projectDir))
}

// Run webpack via the package.json scripts. `npmInstall` is provided by the
// node plugin and installs dependencies from package.json/package-lock.json.
// Default is the production build (minified, no source maps) so every .modl is
// ship-quality; pass -PwebDev for the faster unminified build when debugging.
val webDev = project.hasProperty("webDev")
val webpack by tasks.registering(NpmTask::class) {
    group = "Ignition Module"
    description = "Builds the web (React/TypeScript) bundle with webpack (-PwebDev for a development build)."
    args.set(listOf("run", if (webDev) "build:dev" else "build"))
    dependsOn(tasks.named("npmInstall"))
    inputs.property("webDev", webDev)
    inputs.dir("typescript")
    inputs.files("package.json", "package-lock.json", "webpack.config.js", "tsconfig.json")
    outputs.dir(projectOutput)
}

// Run the TypeScript unit tests (Jest) via the package.json "test" script.
val jestTest by tasks.registering(NpmTask::class) {
    group = "verification"
    description = "Runs the web (React/TypeScript) unit tests with Jest."
    args.set(listOf("test"))
    dependsOn(tasks.named("npmInstall"))
    inputs.dir("typescript")
    inputs.files("package.json", "package-lock.json", "jest.config.js", "tsconfig.json", "tsconfig.test.json")
}

// Hook the JS tests into `gradlew check` (and therefore `build`).
tasks.named("check") {
    dependsOn(jestTest)
}

tasks.named("processResources") {
    dependsOn(webpack)
}

sourceSets {
    main {
        // Add webpack's output (build/generated-resources/mounted/*) as resources,
        // built by the webpack task.
        output.dir(projectOutput, "builtBy" to webpack)
    }
}
