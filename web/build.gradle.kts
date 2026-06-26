import com.github.gradle.node.npm.task.NpmTask

plugins {
    java
    id("com.github.node-gradle.node") version "3.5.1"
}

// Where webpack writes the built bundle; this whole dir becomes module resources.
val projectOutput: String by extra("$buildDir/generated-resources")

node {
    // A pinned Node is downloaded for the build, independent of any system Node.
    version.set("18.20.4")
    download.set(true)
    nodeProjectDir.set(file(project.projectDir))
}

// Run webpack via the package.json "build" script. `npmInstall` is provided by the
// node plugin and installs dependencies from package.json/package-lock.json.
val webpack by tasks.registering(NpmTask::class) {
    group = "Ignition Module"
    description = "Builds the web (React/TypeScript) bundle with webpack."
    args.set(listOf("run", "build"))
    dependsOn(tasks.named("npmInstall"))
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

// Ensure the gateway scope's resources include the freshly built bundle.
project(":gateway").tasks.named("processResources").configure {
    dependsOn(webpack)
}

sourceSets {
    main {
        // Add webpack's output (build/generated-resources/mounted/*) as resources,
        // built by the webpack task.
        output.dir(projectOutput, "builtBy" to webpack)
    }
}
